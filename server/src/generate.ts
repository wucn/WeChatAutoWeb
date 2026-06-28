import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import { readConfig } from "./config.js";
import {
  designPath,
  htmlPath,
  skillPath,
  existsFile,
  readMeta,
  fragmentsDir,
  fragmentPath,
  progressPath,
  readProgress,
  writeProgress,
  cleanupFragments,
  type FragmentProgress,
} from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_RULES_PATH = path.resolve(__dirname, "../skills/md转微信文章-skill.md");
const ARTICLE_RULES_PATH = path.resolve(__dirname, "../skills/微信文章生成-skill.md");

export interface StreamResult {
  ok: boolean;
}

/** 优化点结构 */
export interface OptimizePoint {
  title: string;
  type: string;
  anchor: string;
  content: string;
}

/** 写一条 SSE 事件 */
function sse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function startSse(res: Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

function fail(res: Response, error: string): StreamResult {
  sse(res, "error", { error });
  res.end();
  return { ok: false };
}

function ensureConfig() {
  const cfg = readConfig();
  if (!cfg || !cfg.apiKey || !cfg.baseUrl || !cfg.model) return null;
  return cfg;
}

// ───────────── 强制停止 ─────────────

const STOP_TOKEN = "user-stop";
/** 每个项目当前在跑的 AI 请求 controller（同一项目同时只有一个任务） */
const activeControllers = new Map<string, AbortController>();

/** 中止指定项目的在途 AI 请求 */
export function abortActive(projectId: string): boolean {
  const c = activeControllers.get(projectId);
  if (c) {
    c.abort(STOP_TOKEN);
    return true;
  }
  return false;
}

type AiResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * 共享 AI 调用：发 ai_request / parse 阶段事件，fetch，解析，去代码围栏。
 * 注册 controller 到 activeControllers 以支持「停止」。
 * 在 AI 调用期间发送 SSE 心跳事件，保持连接活跃（防止 nginx gateway timeout）。
 */
async function callAi(opts: {
  projectId: string;
  res: Response;
  cfg: NonNullable<ReturnType<typeof ensureConfig>>;
  system: string;
  user: string;
  aiLabel: string;
  /** 不发 ai_request / parse phase 事件（分段生成时由外层控制进度） */
  silent?: boolean;
}): Promise<AiResult> {
  const { projectId, res, cfg, system, user, aiLabel, silent } = opts;
  if (!silent) sse(res, "phase", { phase: "ai_request", label: aiLabel });

  const url = cfg.baseUrl.replace(/\/+$/, "") + "/v1/messages";
  const controller = new AbortController();
  activeControllers.set(projectId, controller);
  const timeoutMs = (cfg.timeout || 120) * 1000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // SSE 心跳：每 30 秒发送一次，防止 nginx gateway timeout（约 180s）
  const heartbeatInterval = setInterval(() => {
    sse(res, "heartbeat", { time: Date.now() });
  }, 30000);

  try {
    // 使用流式响应避免 nginx gateway timeout
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        // 请求流式响应
        "accept": "application/vnd.anthropic.v1+stream",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 16384,
        system,
        messages: [{ role: "user", content: user }],
        stream: true,  // 启用流式响应
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      let detail = "";
      let rawBody = "";
      try {
        rawBody = await resp.text();
        const d = JSON.parse(rawBody) as {
          error?: { message?: string; type?: string; };
          message?: string;
        };
        detail = d?.error?.message || d?.message || rawBody;
        // 完整报错：包含状态码 + 错误类型 + 消息 + 原始响应
        const errorType = d?.error?.type || "unknown";
        return { ok: false, error: `AI 请求失败 [${resp.status}] ${errorType}: ${detail}\n原始响应: ${rawBody.substring(0, 500)}` };
      } catch {
        // JSON 解析失败，直接返回原始文本
        return { ok: false, error: `AI 请求失败 [${resp.status}] ${resp.statusText}\n原始响应: ${rawBody.substring(0, 500)}` };
      }
    }

    // 处理流式响应：逐块读取 SSE 事件
    if (!resp.body) {
      return { ok: false, error: "AI 返回无响应体" };
    }

    if (!silent) sse(res, "phase", { phase: "parse", label: "解析返回内容" });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let messageStarted = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // 保留最后一个不完整的行

        for (const line of lines) {
          if (!line.trim() || line.startsWith(":")) continue; // 忽略空行和注释

          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr) as {
                type?: string;
                delta?: { type?: string; text?: string };
                message?: { content?: Array<{ type?: string; text?: string }> };
              };

              // 处理不同类型的 SSE 事件
              if (event.type === "message_start") {
                messageStarted = true;
              } else if (event.type === "content_block_delta" && event.delta?.text) {
                // 收集文本内容
                fullText += event.delta.text;
              } else if (event.type === "message_delta") {
                // message_delta 可能包含最终内容
              } else if (event.type === "message_stop") {
                // 消息完成
              }
            } catch {
              // JSON 解析失败，跳过
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!fullText.trim()) {
      return { ok: false, error: "AI 返回为空" };
    }
    return {
      ok: true,
      text: fullText
        .trim()
        .replace(/^\s*```[a-zA-Z]*\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim(),
    };
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string; stack?: string };
    if (controller.signal.aborted) {
      return {
        ok: false,
        error: controller.signal.reason === STOP_TOKEN ? "已停止" : `请求超时（${cfg.timeout || 120}s）`,
      };
    }
    // 完整报错：名称 + 消息 + 堆栈（截取前 3 行）
    const msg = err.message || String(e);
    const stackLines = err.stack ? err.stack.split('\n').slice(0, 3).join('\n') : '';
    return { ok: false, error: `${err.name || 'Error'}: ${msg}\n${stackLines}` };
  } finally {
    clearTimeout(timeout);
    clearInterval(heartbeatInterval);
    activeControllers.delete(projectId);
  }
}

// ───────────── HTML 分段生成工具 ─────────────

/** 按 ## 切分 article 为多段；## 之前的前置内容忽略 */
function splitByH2(article: string): { title: string; content: string }[] {
  const lines = article.split("\n");
  const sections: { title: string; content: string }[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current) sections.push({ title: line.replace(/^##\s+/, ""), content: current.join("\n") });
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) sections.push({ title: current[0].replace(/^##\s+/, ""), content: current.join("\n") });
  return sections;
}

/** 从 article.md 提取主标题：第一行 # 标题，或第一段 ## 标题 */
function extractMainTitle(article: string, fallback = "微信文章"): { title: string; subtitle: string } {
  const lines = article.split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*#\s+(.+?)\s*$/);
    if (m) return { title: m[1], subtitle: "" };
  }
  // 没有 # 标题，用第一个 ## 标题
  for (const line of lines) {
    const m = line.match(/^\s*##\s+(.+?)\s*$/);
    if (m) return { title: m[1].replace(/^[一二三四五六七八九十]+、\s*/, ""), subtitle: "" };
  }
  return { title: fallback, subtitle: "" };
}

/** 拼接完整 HTML 骨架（套 md转微信 skill 模板） */
function assembleHtml(fragments: string[], title: string, subtitle: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,"PingFang SC",sans-serif; background-color:#f6f7f9; padding:28px 12px; color:#1f2937; line-height:1.5; }
  .copy-btn { margin-top:14px; padding:8px 22px; background-color:#1f2937; color:#fff; border:none; border-radius:6px; font-size:14px; cursor:pointer; font-family:inherit; }
  .copy-btn:hover { background-color:#7c3aed; }
  .copy-btn.done { background-color:#059669; }
</style>
</head>
<body>
<div id="container" style="max-width:620px; margin:0 auto;">

  <div style="text-align:center; margin-bottom:22px; padding-bottom:16px; border-bottom:3px solid #7c3aed;">
    <h1 style="font-size:21px; color:#1f2937; margin:0;">${title}</h1>${subtitle ? `\n    <p style="margin-top:8px; color:#6b7280; font-size:13px;">${subtitle}</p>` : ""}
    <div><button class="copy-btn" id="copyBtn" onclick="copyForWechat()">📋 复制为微信格式</button></div>
  </div>

  ${fragments.join("\n\n")}

</div>

<script>
  function copyForWechat() {
    const btn = document.getElementById('copyBtn');
    const source = document.getElementById('container');
    const clone = source.cloneNode(true);
    clone.querySelectorAll('.copy-btn').forEach(b => { const p = b.parentElement; if (p) p.remove(); });
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:620px;background-color:#fff;';
    wrap.appendChild(clone);
    document.body.appendChild(wrap);
    const range = document.createRange();
    range.selectNodeContents(clone);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      document.execCommand('copy');
      btn.textContent = '✓ 已复制，去公众号 Ctrl+V';
      btn.classList.add('done');
      setTimeout(() => { btn.textContent = '📋 复制为微信格式'; btn.classList.remove('done'); }, 3000);
    } catch (e) { btn.textContent = '复制失败，请手动选中'; }
    sel.removeAllRanges();
    document.body.removeChild(wrap);
  }
</script>
</body>
</html>`;
}

/** 从 AI 文本里提取优化点 JSON */
function extractPoints(text: string): OptimizePoint[] {
  let s = text.trim();
  // 取第一个 { 到最后一个 } 之间的内容，容忍前后多余文字
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    throw new Error("优化点 JSON 解析失败");
  }
  const arr = (parsed as { points?: unknown })?.points;
  if (!Array.isArray(arr)) throw new Error("AI 未返回优化点列表");
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      title: String(x.title ?? "优化点").trim(),
      type: String(x.type ?? "补充").trim(),
      anchor: String(x.anchor ?? "").trim(),
      content: String(x.content ?? "").trim(),
    }))
    .filter((p) => p.content.length > 0);
}

// ───────────────────────── prompts ─────────────────────────

const OPTIMIZE_POINTS_SYSTEM = `你是资深技术架构师。读取用户给出的「设计思路文档」，识别其中可以优化、补充、修正或进一步明确的点，输出一份**结构化的优化点清单**，供用户逐条审阅、编辑后再合并进原文档。

只输出一个 JSON 对象，不要任何解释、不要 markdown 代码围栏，格式严格如下：
{
  "points": [
    {
      "title": "这条优化是什么（简短，如：补充错误处理方案）",
      "type": "补充 | 修正 | 明确 | 结构化",
      "anchor": "要并入文档里哪个 ## 标题之后（必须照抄文档里真实存在的标题原文；无处可放则填空字符串表示追加到末尾）",
      "content": "实际要并入的 markdown 内容，写得完整可直接粘贴"
    }
  ]
}

要求：
- points 通常 3~8 条，聚焦真正能提升文档的点，不要凑数。
- content 必须是可直接并入文档的成段 markdown（可含列表/小标题/代码），不要写「建议你…」这类对话语。
- anchor 优先选文档里已存在的 ## 标题；若该点是对整体结构的补充，anchor 留空。`;

const SKILL_SYSTEM = `你是 Claude Code skill 设计专家。把用户给出的「设计思路」转化成一个可复用的 Claude skill 定义文件。

输出要求：
1. 以 YAML frontmatter 开头，用 \`\`\`--- 包裹，包含 name（英文 kebab-case）与 description（中文一句话说明该 skill 能力）两个字段；
2. frontmatter 之后是该 skill 的正文，写清：用途、规则、组件/接口约定、执行流程、注意事项；
3. 正文用 markdown，规则用表格或列表呈现，必要时给最小示例；
4. 只输出 skill 文档本身，不要代码围栏包裹整篇，不要多余解释。`;

// ───────────────────────── 三路生成 ─────────────────────────

/** 读取当前选中的设计思路内容，不存在则 fail */
function readSelectedDesign(projectId: string, res: Response): string | null {
  const meta = readMeta(projectId);
  const sel = meta?.selectedDesign;
  if (!sel || !existsFile(designPath(projectId, sel))) {
    fail(res, "请先在「设计思路」选择或新建一份设计思路");
    return null;
  }
  return fs.readFileSync(designPath(projectId, sel), "utf-8");
}

/** 识别优化补充：读取选中设计 → 输出结构化优化点清单（前端审阅后再应用） */
export async function streamOptimize(
  projectId: string,
  res: Response
): Promise<StreamResult> {
  startSse(res);

  sse(res, "phase", { phase: "check_design", label: "校验选中的设计思路" });
  const design = readSelectedDesign(projectId, res);
  if (design === null) return { ok: false };

  const cfg = ensureConfig();
  if (!cfg) return fail(res, "请先在「AI 设置」配置 API Key / 模型 / 地址");

  const r = await callAi({
    projectId,
    res,
    cfg,
    system: OPTIMIZE_POINTS_SYSTEM,
    user: design,
    aiLabel: `调用 AI 分析优化点（${cfg.model}）`,
  });
  if (!r.ok) return fail(res, r.error);

  let points: OptimizePoint[];
  try {
    points = extractPoints(r.text);
  } catch (e: unknown) {
    return fail(res, (e as Error).message || "优化点解析失败");
  }
  if (points.length === 0) return fail(res, "AI 未给出可用的优化点");

  sse(res, "done", { ok: true, points });
  res.end();
  return { ok: true };
}

/** 微信文章 → output.html（基于已生成的 article.md），支持断点续传 */
export async function streamGenerateHtml(
  projectId: string,
  res: Response
): Promise<StreamResult> {
  startSse(res);

  // 检查 article.md 是否存在
  sse(res, "phase", { phase: "check_article", label: "检查微信文章" });
  const articlePath = path.join(path.dirname(htmlPath(projectId)), "article.md");
  if (!fs.existsSync(articlePath)) {
    return fail(res, "请先生成「微信文章」，再生成 HTML");
  }
  const article = fs.readFileSync(articlePath, "utf-8");
  if (!article.trim()) {
    return fail(res, "微信文章内容为空，请重新生成");
  }

  const cfg = ensureConfig();
  if (!cfg) return fail(res, "请先在「AI 设置」配置 API Key / 模型 / 地址");

  sse(res, "phase", { phase: "load_rules", label: "读取转换规则" });
  const rules = fs.existsSync(SKILL_RULES_PATH)
    ? fs.readFileSync(SKILL_RULES_PATH, "utf-8")
    : "";
  const system = rules
    ? `${rules}\n\n---\n严格按上述规则，把用户给出的 markdown 文章转成微信公众号文章的完整 HTML 文档。只输出 HTML 本身，不要任何解释，不要 markdown 代码围栏。`
    : "把 markdown 文章转成微信公众号文章完整 HTML，只输出 HTML 本身。";

  // 按 ## 切分章节，判断是否走分段生成
  const sections = splitByH2(article);
  const SECTION_THRESHOLD = 3;       // 段数阈值：> 3 段走分段
  const CHAR_THRESHOLD = 12000;      // 字符阈值：> 12k 走分段
  const shouldSplit = sections.length > SECTION_THRESHOLD || article.length > CHAR_THRESHOLD;

  if (!shouldSplit) {
    // 一次性生成（不需要续传）
    const r = await callAi({
      projectId,
      res,
      cfg,
      system,
      user: article,
      aiLabel: `调用 AI 生成 HTML（${cfg.model}）`,
    });
    if (!r.ok) return fail(res, r.error);

    sse(res, "phase", { phase: "write_html", label: "写入 html 文件" });
    fs.writeFileSync(htmlPath(projectId), r.text, "utf-8");
    sse(res, "done", { ok: true });
    res.end();
    return { ok: true };
  }

  // 分段生成：逐段调用 AI 输出 HTML 片段，支持断点续传
  const fragmentSystem = `${rules}

---

**本次任务**：把用户给出的 markdown 片段（一个章节）转成微信公众号文章的 HTML 片段。

**重要约束**：
1. **只输出 HTML 片段**，不要 \`<!DOCTYPE>\` / \`<html>\` / \`<head>\` / \`<body>\` / \`<div id="container">\` 骨架
2. **不要复制按钮、不要 \`<script>\`、不要 \`<style>\`**
3. 直接输出该章节对应的卡片 \`<div>\`（白底卡片：含 h2 标题标签 + 正文内容）
4. 严格按 skill 规则：原生 \`<table>\` 布局流程图、所有样式内联、颜色用 \`background-color\`、代码块每行一个 \`<tr>\`、箭头用 Unicode
5. 卡片 div 模板：\`<div style="background-color:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:14px;">...</div>\`
6. 配色按章节顺序循环：紫(#7c3aed) → 粉(#ec4899) → 橙(#f97316) → 青(#22d3ee) → 绿(#10b981) → 蓝(#3b82f6)

只输出 HTML 片段本身，不要 markdown 代码围栏，不要任何解释。`;

  const total = sections.length;
  const { title, subtitle } = extractMainTitle(article);

  // 检查续传进度
  const existingProgress = readProgress(projectId);

  if (existingProgress && existingProgress.completed.length > 0 && existingProgress.completed.length < total) {
    // 有未完成的进度，继续生成
    const completedCount = existingProgress.completed.length;
    const failedCount = existingProgress.failed.length;
    sse(res, "phase", {
      phase: "resume_progress",
      label: `发现未完成进度，已完成 ${completedCount}/${total} 段${failedCount > 0 ? `，${failedCount} 段失败待重试` : ""}，继续生成`,
      data: { completed: completedCount, total, failed: failedCount }
    });
  } else {
    // 清理旧进度，重新开始
    cleanupFragments(projectId);
    fs.mkdirSync(fragmentsDir(projectId), { recursive: true });
    writeProgress(projectId, { total, title, subtitle, completed: [], failed: [], pending: Array.from({ length: total }, (_, i) => i) });
  }

  const isGatewayError = (err: string) => /\[50[234]\]|Gateway Time-out|Bad Gateway/.test(err);

  // 收集需要生成的片段索引：优先处理失败的，然后是 pending
  const progress = readProgress(projectId);
  const toGenerate: number[] = [];
  if (progress) {
    // 先处理失败的需要重试的片段
    for (const idx of progress.failed) {
      if (!existsFile(fragmentPath(projectId, idx))) {
        toGenerate.push(idx);
      }
    }
    // 然后处理 pending 中未完成的片段
    for (const idx of progress.pending) {
      if (!existsFile(fragmentPath(projectId, idx)) && !toGenerate.includes(idx)) {
        toGenerate.push(idx);
      }
    }
  }
  toGenerate.sort((a, b) => a - b);

  // 逐段生成
  const MAX_CHUNK_LEN = 2000; // 单次 AI 调用最大字符数（避免超时）

  for (const i of toGenerate) {
    const sec = sections[i];
    const fragFile = fragmentPath(projectId, i);

    // 检查是否已有片段文件（续传时跳过）
    if (existsFile(fragFile)) {
      sse(res, "phase", {
        phase: "fragment_skip",
        label: `跳过第 ${i + 1}/${total} 段（已完成）：${sec.title}`,
        data: { index: i, total, completed: i + 1 }
      });
      continue;
    }

    // 检查是否需要拆分长段落
    const chunks: string[] = [];
    if (sec.content.length > MAX_CHUNK_LEN) {
      // 按 ### 或空行拆分
      const subSections = sec.content.split(/\n###\s+|\n\n\n+/);
      let currentChunk = "";
      for (const sub of subSections) {
        if ((currentChunk + sub).length > MAX_CHUNK_LEN && currentChunk) {
          chunks.push(currentChunk);
          currentChunk = sub;
        } else {
          currentChunk += (currentChunk ? "\n\n" : "") + sub;
        }
      }
      if (currentChunk) chunks.push(currentChunk);
      sse(res, "phase", {
        phase: "fragment_split",
        label: `第 ${i + 1}/${total} 段过长(${sec.content.length}字符)，拆成${chunks.length}个子片段`,
        data: { index: i, total, chunks: chunks.length }
      });
    } else {
      chunks.push(sec.content);
    }

    // 逐个子片段生成
    const subResults: string[] = [];
    let allOk = true;

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      sse(res, "phase", {
        phase: "fragment_progress",
        label: `生成第 ${i + 1}/${total} 段${chunks.length > 1 ? `子片段${ci + 1}/${chunks.length}` : ""}：${sec.title}`,
        data: { index: i, total, completed: i, title: sec.title, subIndex: ci, subTotal: chunks.length }
      });

      let r: AiResult = { ok: false, error: "" };
      for (let attempt = 1; attempt <= 5; attempt++) {
        r = await callAi({
          projectId,
          res,
          cfg,
          system: fragmentSystem,
          user: chunk,
          aiLabel: `第 ${i + 1}/${total} 段${chunks.length > 1 ? `子${ci + 1}` : ""}（${cfg.model}）`,
          silent: true,
        });
        if (r.ok || !isGatewayError(r.error)) break;
        // 网关超时，等 10s 重试
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }

      if (!r.ok) {
        allOk = false;
        const progress = readProgress(projectId);
        if (progress) {
          if (!progress.failed.includes(i)) {
            progress.failed.push(i);
          }
          progress.pending = progress.pending.filter(p => p !== i);
          writeProgress(projectId, progress);
        }
        return fail(res, `第 ${i + 1} 段${chunks.length > 1 ? `子片段${ci + 1}` : ""}生成失败：${r.error}\n已完成 ${progress?.completed.length || 0}/${total} 段，可重新点击续传`);
      }

      subResults.push(r.text);
    }

    // 拼接子片段结果，写入完整片段文件
    const fullFragment = subResults.join("\n\n");
    fs.writeFileSync(fragFile, fullFragment, "utf-8");

    // 更新进度
    const progress = readProgress(projectId);
    if (progress) {
      progress.completed.push(i);
      progress.pending = progress.pending.filter(p => p !== i);
      progress.failed = progress.failed.filter(f => f !== i);
      writeProgress(projectId, progress);
    }
  }

  // 拼接所有片段
  sse(res, "phase", { phase: "assemble", label: `拼接 ${total} 段 HTML 片段` });
  const fragments: string[] = [];
  for (let i = 0; i < total; i++) {
    const fragFile = fragmentPath(projectId, i);
    if (existsFile(fragFile)) {
      fragments.push(fs.readFileSync(fragFile, "utf-8"));
    }
  }
  const fullHtml = assembleHtml(fragments, title, subtitle);

  sse(res, "phase", { phase: "write_html", label: "写入 html 文件" });
  fs.writeFileSync(htmlPath(projectId), fullHtml, "utf-8");

  // 清理临时文件
  cleanupFragments(projectId);

  sse(res, "done", { ok: true });
  res.end();
  return { ok: true };
}

/** 选中设计 → skill.md（Claude skill 定义） */
export async function streamGenerateSkill(
  projectId: string,
  res: Response
): Promise<StreamResult> {
  startSse(res);

  sse(res, "phase", { phase: "check_design", label: "校验选中的设计思路" });
  const design = readSelectedDesign(projectId, res);
  if (design === null) return { ok: false };

  const cfg = ensureConfig();
  if (!cfg) return fail(res, "请先在「AI 设置」配置 API Key / 模型 / 地址");

  const r = await callAi({
    projectId,
    res,
    cfg,
    system: SKILL_SYSTEM,
    user: design,
    aiLabel: `调用 AI 生成 skill（${cfg.model}）`,
  });
  if (!r.ok) return fail(res, r.error);

  sse(res, "phase", { phase: "write_skill", label: "写入 skill 文件" });
  fs.writeFileSync(skillPath(projectId), r.text, "utf-8");

  sse(res, "done", { ok: true });
  res.end();
  return { ok: true };
}

/** 选中设计 → article.md（结构化微信文章：概览→分析→总结） */
export async function streamGenerateArticle(
  projectId: string,
  res: Response
): Promise<StreamResult> {
  startSse(res);

  sse(res, "phase", { phase: "check_design", label: "校验选中的设计思路" });
  const design = readSelectedDesign(projectId, res);
  if (design === null) return { ok: false };

  const cfg = ensureConfig();
  if (!cfg) return fail(res, "请先在「AI 设置」配置 API Key / 模型 / 地址");

  sse(res, "phase", { phase: "load_rules", label: "读取文章生成规则" });
  const rules = fs.existsSync(ARTICLE_RULES_PATH)
    ? fs.readFileSync(ARTICLE_RULES_PATH, "utf-8")
    : "";
  const system = rules
    ? `${rules}\n\n---\n严格按上述规则，把用户给出的设计思路转化成结构清晰的微信公众号文章。只输出文章内容本身，不要任何解释，不要 markdown 代码围栏包裹整篇。`
    : "把设计思路转化成结构清晰的微信公众号文章，按「概览→详细分析→总结探讨」三段式组织。";

  const r = await callAi({
    projectId,
    res,
    cfg,
    system,
    user: design,
    aiLabel: `调用 AI 生成微信文章（${cfg.model}）`,
  });
  if (!r.ok) return fail(res, r.error);

  sse(res, "phase", { phase: "write_article", label: "写入 article.md 文件" });
  const articlePath = path.join(path.dirname(htmlPath(projectId)), "article.md");
  fs.writeFileSync(articlePath, r.text, "utf-8");

  sse(res, "done", { ok: true });
  res.end();
  return { ok: true };
}
