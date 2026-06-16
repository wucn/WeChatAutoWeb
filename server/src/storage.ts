import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECTS_DIR = path.resolve(__dirname, "../data/projects");

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** designs/ 下当前选中的文件名；null 表示未选 */
  selectedDesign: string | null;
}

export interface DesignSummary {
  file: string;
  title: string;
  preview: string;
  updatedAt: number;
  selected: boolean;
}

export function projectDir(id: string) {
  return path.join(PROJECTS_DIR, id);
}
export function metaPath(id: string) {
  return path.join(projectDir(id), "meta.json");
}
export function materialPath(id: string) {
  return path.join(projectDir(id), "material.md");
}
export function designsDir(id: string) {
  return path.join(projectDir(id), "designs");
}
export function designPath(id: string, file: string) {
  return path.join(designsDir(id), file);
}
export function htmlPath(id: string) {
  return path.join(projectDir(id), "output.html");
}
export function skillPath(id: string) {
  return path.join(projectDir(id), "skill.md");
}
/** 旧版输入素材路径（迁移用） */
function legacyMaterialPath(id: string) {
  return path.join(projectDir(id), "skill.md");
}

export function existsFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function readMeta(id: string): ProjectMeta | null {
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath(id), "utf-8"));
    return {
      id,
      name: raw?.name ?? "未命名项目",
      createdAt: raw?.createdAt ?? Date.now(),
      updatedAt: raw?.updatedAt ?? Date.now(),
      selectedDesign: raw?.selectedDesign ?? null,
    };
  } catch {
    return null;
  }
}

export function writeMeta(id: string, meta: ProjectMeta) {
  fs.mkdirSync(projectDir(id), { recursive: true });
  meta.updatedAt = Date.now();
  fs.writeFileSync(metaPath(id), JSON.stringify(meta, null, 2), "utf-8");
}

/** 从 markdown 内容里提取标题与预览 */
function summarize(content: string): { title: string; preview: string } {
  const lines = content.split(/\r?\n/);
  let title = "";
  for (const ln of lines) {
    const m = ln.match(/^\s*#\s+(.+?)\s*$/);
    if (m) {
      title = m[1];
      break;
    }
  }
  if (!title) {
    const first = lines.find((l) => l.trim().length > 0);
    title = (first || "未命名设计思路").trim().slice(0, 40);
  }
  const plain = content
    .replace(/^---[\s\S]*?---/, "")
    .replace(/[#>*`_~\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const preview = plain.slice(0, 80) + (plain.length > 80 ? "…" : "");
  return { title, preview };
}

export function listDesigns(id: string, selected?: string | null): DesignSummary[] {
  const dir = designsDir(id);
  if (!fs.existsSync(dir)) return [];
  const sel = selected ?? null;
  const items = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const full = path.join(dir, file);
      let content = "";
      try {
        content = fs.readFileSync(full, "utf-8");
      } catch {
        /* ignore */
      }
      const { title, preview } = summarize(content);
      let updatedAt = Date.now();
      try {
        updatedAt = fs.statSync(full).mtimeMs;
      } catch {
        /* ignore */
      }
      return { file, title, preview, updatedAt, selected: file === sel };
    });
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return items;
}

export function withFlags(id: string, meta: ProjectMeta) {
  const designs = listDesigns(id, meta.selectedDesign);
  return {
    ...meta,
    hasHtml: existsFile(htmlPath(id)),
    hasSkill: existsFile(skillPath(id)),
    designCount: designs.length,
    selectedDesign: meta.selectedDesign,
    designs,
  };
}

/** 把任意名字清洗成合法的 designs/ 文件名（不含路径分隔符），并去重 */
export function uniqueDesignFile(id: string, rawName: string): string {
  let base = (rawName || "设计思路")
    .trim()
    .replace(/\.(md|markdown)$/i, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 40);
  if (!base) base = "设计思路";
  let file = `${base}.md`;
  let n = 2;
  while (existsFile(designPath(id, file))) {
    file = `${base}-${n}.md`;
    n++;
  }
  return file;
}

/** 早期迁移种下的「原始素材」静态快照文件名：`<13位时间戳>-原始素材.md` */
const SEED_RE = /^\d{13}-原始素材\.md$/;

/**
 * 清理早期迁移种下的「原始素材」静态快照种子。
 * designs/ 现在是唯一的内容存放处；早期版本曾把素材复制成静态种子，会造成内容不同步，统一清掉。
 */
function cleanupSeedDesigns(id: string, meta: ProjectMeta): boolean {
  const dir = designsDir(id);
  if (!fs.existsSync(dir)) return false;
  let changed = false;
  for (const f of fs.readdirSync(dir)) {
    if (SEED_RE.test(f)) {
      fs.rmSync(path.join(dir, f), { force: true });
      if (meta.selectedDesign === f) meta.selectedDesign = null;
      changed = true;
    }
  }
  return changed;
}

/**
 * 懒迁移：把任何遗留的输入素材（旧版 skill.md、上一版的 material.md）转成 designs/ 内的设计文档并选中。
 * 访问项目时跑一次；designs/ 已有内容则只清理遗留文件，不重复导入。
 */
export function migrateLegacy(id: string): ProjectMeta | null {
  fs.mkdirSync(designsDir(id), { recursive: true });
  let meta = readMeta(id);
  if (!meta) return null;

  const legacySources = [legacyMaterialPath(id), materialPath(id)]; // skill.md, material.md

  // designs 为空时，把第一份遗留素材导入为初始设计文档
  if (listDesigns(id).length === 0) {
    for (const src of legacySources) {
      if (existsFile(src)) {
        const content = fs.readFileSync(src, "utf-8");
        const file = `${Date.now()}-设计思路.md`;
        fs.writeFileSync(designPath(id, file), content, "utf-8");
        if (!meta.selectedDesign) meta.selectedDesign = file;
        writeMeta(id, meta);
        break;
      }
    }
  }

  // 清掉遗留输入素材文件（material 概念已移除）
  for (const src of legacySources) {
    if (existsFile(src)) fs.rmSync(src, { force: true });
  }
  // 清掉早期迁移的「原始素材」静态种子
  if (cleanupSeedDesigns(id, meta)) writeMeta(id, meta);

  return readMeta(id);
}
