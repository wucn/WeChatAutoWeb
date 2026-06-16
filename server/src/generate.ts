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
}): Promise<AiResult> {
  const { projectId, res, cfg, system, user, aiLabel } = opts;
  sse(res, "phase", { phase: "ai_request", label: aiLabel });

  const url = cfg.baseUrl.replace(/\/+$/, "") + "/v1/messages";
  const controller = new AbortController();
  activeControllers.set(projectId, controller);
  const timeout = setTimeout(() => controller.abort(), 120000);

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
        max_tokens: 8192,
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

    sse(res, "phase", { phase: "parse", label: "解析返回内容" });
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
        error: controller.signal.reason === STOP_TOKEN ? "已停止" : "请求超时（120s）",
      };
    }
    const msg = (e as { message?: string }).message || String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
    activeControllers.delete(projectId);
  }
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

/** 选中设计 → output.html */
export async function streamGenerateHtml(
  projectId: string,
  res: Response
): Promise<StreamResult> {
  startSse(res);

  sse(res, "phase", { phase: "check_design", label: "校验选中的设计思路" });
  const design = readSelectedDesign(projectId, res);
  if (design === null) return { ok: false };

  const cfg = ensureConfig();
  if (!cfg) return fail(res, "请先在「AI 设置」配置 API Key / 模型 / 地址");

  sse(res, "phase", { phase: "load_rules", label: "读取转换规则" });
  const rules = fs.existsSync(SKILL_RULES_PATH)
    ? fs.readFileSync(SKILL_RULES_PATH, "utf-8")
    : "";
  const system = rules
    ? `${rules}\n\n---\n严格按上述规则，把用户给出的 markdown 设计思路转成微信公众号文章的完整 HTML 文档。只输出 HTML 本身，不要任何解释，不要 markdown 代码围栏。`
    : "把 markdown 转成微信公众号文章完整 HTML，只输出 HTML 本身。";

  const r = await callAi({
    projectId,
    res,
    cfg,
    system,
    user: design,
    aiLabel: `调用 AI 生成 HTML（${cfg.model}）`,
  });
  if (!r.ok) return fail(res, r.error);

  sse(res, "phase", { phase: "write_html", label: "写入 html 文件" });
  fs.writeFileSync(htmlPath(projectId), r.text, "utf-8");

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
