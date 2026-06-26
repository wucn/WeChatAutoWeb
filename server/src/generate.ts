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

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 16384,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      let detail = "";
      try {
        const d = (await resp.json()) as {
          error?: { message?: string };
          message?: string;
        };
        detail = d?.error?.message || d?.message || JSON.stringify(d);
      } catch {
        detail = await resp.text().catch(() => "");
      }
      return { ok: false, error: `AI 请求失败 [${resp.status}] ${detail || resp.statusText}` };
    }

    if (!silent) sse(res, "phase", { phase: "parse", label: "解析返回内容" });
    const data = (await resp.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = Array.isArray(data?.content)
      ? data.content.map((c) => c?.text || "").join("")
      : "";
    if (!text.trim()) {
      return { ok: false, error: "AI 返回为空" };
    }
    return {
      ok: true,
      text: text
        .trim()
        .replace(/^\s*```[a-zA-Z]*\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim(),
    };
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (controller.signal.aborted) {
      return {
        ok: false,
        error: controller.signal.reason === STOP_TOKEN ? "已停止" : `请求超时（${cfg.timeout || 120}s）`,
      };
    }
    const msg = (e as { message?: string }).message || String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
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

/** 微信文章 → output.html（基于已生成的 article.md） */
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
    // 一次性生成
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

  // 分段生成：逐段调用 AI 输出 HTML 片段，本地拼接
  const fragmentSystem = `${rules}

---

**本次任务**：把用户给出的 markdown 片段（一个章节）转成微信公众号文章的 HTML 片段。

**重要约束**：
1. **只输出 HTML 片段**，不要 \`<!DOCTYPE>\` / \`<html>\` / \`<head>\` / \`<body>\` / \`<div id="container">\` 骨架
2. **不要复制按钮、不要 \`<script>\`、不要 \`<style>\`**
3. 直接输出该章节对应的卡片 \`<div>\`（白底卡片：含 h2 标题标签 + 正文内容）
4. 严格按 skill 规则：原生 \`<table>\` 布局流程图、所有样式内联、颜色用 \`background-color\`、代码块每行一个 \`<div>\`、箭头用 Unicode
5. 卡片 div 模板：\`<div style="background-color:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:14px;">...</div>\`
6. 配色按章节顺序循环：紫(#7c3aed) → 粉(#ec4899) → 橙(#f97316) → 青(#22d3ee) → 绿(#10b981) → 蓝(#3b82f6)

只输出 HTML 片段本身，不要 markdown 代码围栏，不要任何解释。`;

  const total = sections.length;
  const { title, subtitle } = extractMainTitle(article);
  const fragments: string[] = [];
  const isGatewayError = (err: string) => /\[50[234]\]|Gateway Time-out|Bad Gateway/.test(err);
  for (let i = 0; i < total; i++) {
    const sec = sections[i];
    let r: AiResult = { ok: false, error: "" };
    for (let attempt = 1; attempt <= 3; attempt++) {
      sse(res, "phase", {
        phase: "ai_request",
        label: `生成第 ${i + 1}/${total} 段：${sec.title}${attempt > 1 ? `（重试 ${attempt}）` : ""}`,
      });
      r = await callAi({
        projectId,
        res,
        cfg,
        system: fragmentSystem,
        user: sec.content,
        aiLabel: `第 ${i + 1}/${total} 段（${cfg.model}）`,
        silent: true,
      });
      if (r.ok || !isGatewayError(r.error)) break;
      // 网关超时，等 5s 重试
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (!r.ok) return fail(res, `第 ${i + 1} 段生成失败：${r.error}`);
    fragments.push(r.text);
  }

  sse(res, "phase", { phase: "parse", label: `拼接 ${total} 段 HTML 片段` });
  const fullHtml = assembleHtml(fragments, title, subtitle);

  sse(res, "phase", { phase: "write_html", label: "写入 html 文件" });
  fs.writeFileSync(htmlPath(projectId), fullHtml, "utf-8");

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
