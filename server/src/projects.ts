import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import {
  projectDir,
  designsDir,
  designPath,
  htmlPath,
  skillPath,
  existsFile,
  readMeta,
  writeMeta,
  listDesigns,
  withFlags,
  migrateLegacy,
  uniqueDesignFile,
  cleanupFragments,
  readProgress,
  PROJECTS_DIR,
  type ProjectMeta,
} from "./storage.js";
import {
  streamOptimize,
  streamGenerateHtml,
  streamGenerateSkill,
  streamGenerateArticle,
  abortActive,
} from "./generate.js";

export const projectsRouter = Router();

/** 校验文件名，防路径穿越 */
function safeName(name: string): string | null {
  const n = (name || "").trim();
  if (!n || n.includes("/") || n.includes("\\") || n.includes("..") || !n.endsWith(".md")) {
    return null;
  }
  return n;
}

// 列表
projectsRouter.get("/", (_req, res) => {
  if (!fs.existsSync(PROJECTS_DIR)) return res.json([]);
  const ids = fs
    .readdirSync(PROJECTS_DIR)
    .filter((d) => {
      const p = path.join(PROJECTS_DIR, d);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "meta.json"));
    });
  const list = ids
    .map((id) => {
      migrateLegacy(id);
      const meta = readMeta(id);
      return meta ? withFlags(id, meta) : null;
    })
    .filter((m) => m !== null);
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  res.json(list);
});

// 新建
projectsRouter.post("/", (req, res) => {
  const name = (req.body?.name || "").toString().trim() || "未命名项目";
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const meta: ProjectMeta = {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    selectedDesign: null,
  };
  writeMeta(id, meta);
  fs.mkdirSync(designsDir(id), { recursive: true });
  res.json(withFlags(id, meta));
});

// 详情
projectsRouter.get("/:id", (req, res) => {
  migrateLegacy(req.params.id);
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  res.json(withFlags(req.params.id, meta));
});

// 重命名
projectsRouter.patch("/:id", (req, res) => {
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const name = (req.body?.name || "").toString().trim();
  if (!name) return res.status(400).json({ error: "名称不能为空" });
  meta.name = name;
  writeMeta(req.params.id, meta);
  res.json(withFlags(req.params.id, meta));
});

// 删除
projectsRouter.delete("/:id", (req, res) => {
  const dir = projectDir(req.params.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

// 设计思路目录 - 列表
projectsRouter.get("/:id/designs", (req, res) => {
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  res.json(listDesigns(req.params.id, meta.selectedDesign));
});

// 设计思路 - 新建 / 另存为（导入或新建未保存时调用）
projectsRouter.post("/:id/designs", (req, res) => {
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const name = (req.body?.name || "").toString().trim() || "设计思路";
  const content = (req.body?.content ?? "").toString();
  const file = uniqueDesignFile(req.params.id, name);
  fs.writeFileSync(designPath(req.params.id, file), content, "utf-8");
  meta.selectedDesign = file;
  writeMeta(req.params.id, meta);
  res.json({ ok: true, file });
});

// 设计思路 - 读单份
projectsRouter.get("/:id/designs/:file", (req, res) => {
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const file = safeName(req.params.file);
  if (!file) return res.status(400).json({ error: "非法文件名" });
  const p = designPath(req.params.id, file);
  if (!existsFile(p)) return res.json({ content: "", exists: false });
  res.json({ content: fs.readFileSync(p, "utf-8"), exists: true });
});

// 设计思路 - 编辑保存
projectsRouter.put("/:id/designs/:file", (req, res) => {
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const file = safeName(req.params.file);
  if (!file) return res.status(400).json({ error: "非法文件名" });
  const content = (req.body?.content ?? "").toString();
  fs.writeFileSync(designPath(req.params.id, file), content, "utf-8");
  writeMeta(req.params.id, meta);
  res.json({ ok: true });
});

// 设计思路 - 删除
projectsRouter.delete("/:id/designs/:file", (req, res) => {
  let meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const file = safeName(req.params.file);
  if (!file) return res.status(400).json({ error: "非法文件名" });
  const p = designPath(req.params.id, file);
  if (existsFile(p)) fs.rmSync(p, { force: true });
  if (meta.selectedDesign === file) {
    meta.selectedDesign = null;
    writeMeta(req.params.id, meta);
  }
  res.json({ ok: true });
});

// 设计思路 - 选中
projectsRouter.post("/:id/designs/select", (req, res) => {
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const file = safeName((req.body?.file ?? "").toString());
  if (!file || !existsFile(designPath(req.params.id, file))) {
    return res.status(400).json({ error: "设计思路不存在" });
  }
  meta.selectedDesign = file;
  writeMeta(req.params.id, meta);
  res.json({ ok: true });
});

// 读生成的 skill 输出
projectsRouter.get("/:id/skill", (req, res) => {
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const p = skillPath(req.params.id);
  if (!existsFile(p)) return res.json({ content: "", exists: false });
  res.json({ content: fs.readFileSync(p, "utf-8"), exists: true });
});

// 读 html 输出
projectsRouter.get("/:id/html", (req, res) => {
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const p = htmlPath(req.params.id);
  if (!existsFile(p)) return res.json({ content: "", exists: false });
  res.json({ content: fs.readFileSync(p, "utf-8"), exists: true });
});

// 读 article.md 输出
projectsRouter.get("/:id/article", (req, res) => {
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const p = path.join(path.dirname(htmlPath(req.params.id)), "article.md");
  if (!existsFile(p)) return res.json({ content: "", exists: false });
  res.json({ content: fs.readFileSync(p, "utf-8"), exists: true });
});

// 识别优化补充（SSE）：返回结构化优化点列表，前端审阅后再应用
projectsRouter.post("/:id/optimize", async (req, res) => {
  migrateLegacy(req.params.id);
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  await streamOptimize(req.params.id, res);
});

// 生成 HTML（SSE，基于选中设计）
projectsRouter.post("/:id/generate-html", async (req, res) => {
  migrateLegacy(req.params.id);
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const result = await streamGenerateHtml(req.params.id, res);
  if (result.ok) writeMeta(req.params.id, meta);
});

// 生成 skill（SSE，基于选中设计）
projectsRouter.post("/:id/generate-skill", async (req, res) => {
  migrateLegacy(req.params.id);
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const result = await streamGenerateSkill(req.params.id, res);
  if (result.ok) writeMeta(req.params.id, meta);
});

// 生成微信文章（SSE，基于选中设计）
projectsRouter.post("/:id/generate-article", async (req, res) => {
  migrateLegacy(req.params.id);
  const meta = readMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "项目不存在" });
  const result = await streamGenerateArticle(req.params.id, res);
  if (result.ok) writeMeta(req.params.id, meta);
});

// 强制停止当前正在运行的 AI 任务
projectsRouter.post("/:id/stop", (req, res) => {
  abortActive(req.params.id);
  res.json({ ok: true });
});

/** 检查分段生成进度 */
projectsRouter.get("/:id/progress", (req, res) => {
  const progress = readProgress(req.params.id);
  if (!progress) {
    return res.json({ hasProgress: false });
  }
  res.json({ hasProgress: true, progress });
});

/** 清理分段临时文件（重新生成时调用） */
projectsRouter.delete("/:id/fragments", (req, res) => {
  cleanupFragments(req.params.id);
  res.json({ ok: true });
});
