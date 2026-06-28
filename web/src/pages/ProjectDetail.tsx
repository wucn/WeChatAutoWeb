import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  Code2,
  Download,
  Eye,
  FilePlus,
  FileText,
  Layers,
  Loader2,
  Pencil,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, type DesignSummary, type Project } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Tab = "designs" | "article" | "html" | "skill";
type RunKind = "optimize" | "article" | "html" | "skill";

interface Running {
  kind: RunKind;
  phaseKey: string;
  elapsed: number;
  error?: string; // 错误信息保留在状态栏
  // 分段进度（仅 html 时有）
  fragmentProgress?: {
    completed: number;
    total: number;
    title?: string;
  };
}

interface EditablePoint {
  id: string;
  title: string;
  type: string;
  anchor: string;
  content: string;
  included: boolean;
}

const PHASES: Record<RunKind, { key: string; label: string }[]> = {
  optimize: [
    { key: "check_design", label: "校验选中的设计思路" },
    { key: "ai_request", label: "调用 AI 分析优化点" },
    { key: "parse", label: "整理优化点清单" },
  ],
  article: [
    { key: "check_design", label: "校验选中的设计思路" },
    { key: "load_rules", label: "读取文章生成规则" },
    { key: "ai_request", label: "调用 AI 生成微信文章" },
    { key: "parse", label: "解析返回内容" },
    { key: "write_article", label: "写入 article.md 文件" },
  ],
  html: [
    { key: "check_article", label: "检查微信文章" },
    { key: "load_rules", label: "读取转换规则" },
    { key: "ai_request", label: "调用 AI 生成 HTML" },
    { key: "parse", label: "解析返回内容" },
    { key: "write_html", label: "写入 html 文件" },
  ],
  skill: [
    { key: "check_design", label: "校验选中的设计思路" },
    { key: "ai_request", label: "调用 AI 生成 skill" },
    { key: "parse", label: "解析返回内容" },
    { key: "write_skill", label: "写入 skill 文件" },
  ],
};

const TYPE_STYLE: Record<string, string> = {
  补充: "bg-emerald-100 text-emerald-700",
  修正: "bg-amber-100 text-amber-700",
  明确: "bg-blue-100 text-blue-700",
  结构化: "bg-purple-100 text-purple-700",
};

/** 把优化点合并进原文档：anchor 命中某 `## 标题` 时插入到该章节末尾，否则追加到文档末尾 */
function mergePoints(original: string, points: EditablePoint[]): string {
  const included = points.filter((p) => p.included && p.content.trim());
  if (included.length === 0) return original;

  const blockOf = (p: EditablePoint) => {
    const head = p.title.trim() ? `\n\n### ${p.title.trim()}\n` : "\n";
    return `${head}${p.content.trim()}\n`;
  };

  const byAnchor = new Map<string, EditablePoint[]>();
  const tail: EditablePoint[] = [];
  for (const p of included) {
    const a = p.anchor.trim();
    if (a) {
      if (!byAnchor.has(a)) byAnchor.set(a, []);
      byAnchor.get(a)!.push(p);
    } else {
      tail.push(p);
    }
  }

  const lines = original.split(/\r?\n/);
  const out: string[] = [];
  const used = new Set<string>();
  let currentHeading: string | null = null;
  const flush = (heading: string) => {
    const arr = byAnchor.get(heading);
    if (arr) {
      for (const p of arr) out.push(blockOf(p));
      used.add(heading);
    }
  };
  for (const line of lines) {
    const m = line.match(/^\s*(#{1,2})\s+(.+?)\s*$/);
    if (m) {
      // 进入新章节前，把上一章节命中的优化点冲到它末尾
      if (currentHeading) flush(currentHeading);
      currentHeading = m[2].trim();
    }
    out.push(line);
  }
  if (currentHeading) flush(currentHeading);

  // 未命中 anchor 的 + 空 anchor 的，统一追加到文档末尾
  const leftover: EditablePoint[] = [];
  for (const [key, arr] of byAnchor) {
    if (!used.has(key)) leftover.push(...arr);
  }
  for (const p of [...leftover, ...tail]) out.push(blockOf(p));

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export default function ProjectDetailPage() {
  const { id = "" } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("designs");

  // 设计思路
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);

  // 优化审阅
  const [review, setReview] = useState<{ points: EditablePoint[] } | null>(null);

  // 输出
  const [articleContent, setArticleContent] = useState("");
  const [articleExists, setArticleExists] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");
  const [htmlExists, setHtmlExists] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [skillContent, setSkillContent] = useState("");
  const [skillExists, setSkillExists] = useState(false);

  const [running, setRunning] = useState<Running | null>(null);

  async function refreshDesigns(p?: Project) {
    const proj = p ?? project;
    const list = await api.listDesigns(id);
    setDesigns(list);
    const sel =
      proj?.selectedDesign ?? list.find((d) => d.selected)?.file ?? null;
    if (sel) {
      try {
        const d = await api.getDesign(id, sel);
        setActiveFile(sel);
        setEditorContent(d.content);
      } catch {
        setActiveFile(null);
        setEditorContent("");
      }
    } else {
      setActiveFile(null);
      setEditorContent("");
    }
  }

  async function loadAll() {
    try {
      const [p, article, html, skill] = await Promise.all([
        api.getProject(id),
        api.getArticle(id),
        api.getHtml(id),
        api.getSkill(id),
      ]);
      setProject(p);
      setArticleContent(article.content);
      setArticleExists(article.exists);
      setHtmlContent(html.content);
      setHtmlExists(html.exists);
      setSkillContent(skill.content);
      setSkillExists(skill.exists);
      await refreshDesigns(p);
    } catch (e) {
      toast.error("加载失败", { description: (e as Error).message });
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ───── 编辑器操作 ─────

  async function handleSelectDesign(file: string) {
    setReview(null);
    try {
      await api.selectDesign(id, file);
      const d = await api.getDesign(id, file);
      setActiveFile(file);
      setEditorContent(d.content);
      setDesigns((list) => list.map((x) => ({ ...x, selected: x.file === file })));
    } catch (e) {
      toast.error("打开失败", { description: (e as Error).message });
    }
  }

  function handleNewDesign() {
    setReview(null);
    setActiveFile(null);
    setEditorContent("");
    setTab("designs");
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const content = String(reader.result || "");
      const name = f.name.replace(/\.(md|markdown|txt)$/i, "");
      try {
        const r = await api.createDesign(id, name, content);
        await refreshDesigns();
        // 选中刚导入的
        await handleSelectDesign(r.file);
        toast.success(`已导入 ${f.name}`);
      } catch (err) {
        toast.error("导入失败", { description: (err as Error).message });
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  }

  async function handleSaveDesign() {
    setReview(null);
    if (activeFile) {
      setSaving(true);
      try {
        await api.saveDesign(id, activeFile, editorContent);
        toast.success("已保存");
      } catch (e) {
        toast.error("保存失败", { description: (e as Error).message });
      } finally {
        setSaving(false);
      }
      return;
    }
    // untitled → save-as
    const name = window.prompt("保存为新的设计思路，请输入名称：", "设计思路");
    if (!name || !name.trim()) return;
    setSaving(true);
    try {
      const r = await api.createDesign(id, name.trim(), editorContent);
      await refreshDesigns();
      await handleSelectDesign(r.file);
      toast.success("已保存为新设计思路");
    } catch (e) {
      toast.error("保存失败", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDesign(file: string) {
    try {
      await api.deleteDesign(id, file);
      if (activeFile === file) {
        setActiveFile(null);
        setEditorContent("");
        setReview(null);
      }
      await refreshDesigns();
      toast.success("已删除");
    } catch (e) {
      toast.error("删除失败", { description: (e as Error).message });
    }
  }

  // ───── 优化审阅 ─────

  function updatePoint(pid: string, patch: Partial<EditablePoint>) {
    setReview((r) =>
      r
        ? { points: r.points.map((p) => (p.id === pid ? { ...p, ...patch } : p)) }
        : r
    );
  }
  function removePoint(pid: string) {
    setReview((r) => (r ? { points: r.points.filter((p) => p.id !== pid) } : r));
  }

  async function handleApplyReview() {
    if (!review) return;
    if (!activeFile) {
      toast.error("请先保存设计思路再应用");
      return;
    }
    const merged = mergePoints(editorContent, review.points);
    setSaving(true);
    try {
      await api.saveDesign(id, activeFile, merged);
      setEditorContent(merged);
      setReview(null);
      await refreshDesigns();
      toast.success("优化点已应用到设计思路");
    } catch (e) {
      toast.error("应用失败", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // ───── SSE 任务 ─────

  async function runSse(
    endpoint: string
  ): Promise<{ ok: boolean; error?: string; data?: unknown }> {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { accept: "text/event-stream" },
    });
    if (!resp.ok || !resp.body) {
      let msg = resp.statusText;
      try {
        const d = await resp.json();
        msg = d?.error || msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let lastError = "";
    let ok = false;
    let doneData: unknown = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const part of parts) {
        const lines = part.split("\n");
        let evt = "";
        let dat = "";
        for (const ln of lines) {
          if (ln.startsWith("event:")) evt = ln.slice(6).trim();
          else if (ln.startsWith("data:")) dat += ln.slice(5).trim();
        }
        if (!evt) continue;
        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(dat || "{}");
        } catch {
          /* ignore */
        }
        if (evt === "phase" && typeof payload.phase === "string") {
          setRunning((r) => {
            if (!r) return r;
            // 处理分段进度事件
            if (payload.phase === "fragment_progress" && payload.data) {
              const data = payload.data as { completed?: number; total?: number; title?: string };
              return {
                ...r,
                phaseKey: payload.phase as string,
                fragmentProgress: {
                  completed: data.completed ?? r.fragmentProgress?.completed ?? 0,
                  total: data.total ?? r.fragmentProgress?.total ?? 0,
                  title: data.title,
                },
              };
            }
            // 处理续传进度事件
            if (payload.phase === "resume_progress" && payload.data) {
              const data = payload.data as { completed?: number; total?: number; failed?: number };
              return {
                ...r,
                phaseKey: payload.phase as string,
                fragmentProgress: {
                  completed: data.completed ?? 0,
                  total: data.total ?? 0,
                  title: (data.failed ?? 0) > 0 ? `${data.failed ?? 0} 段失败待重试` : undefined,
                },
              };
            }
            // 处理片段跳过事件
            if (payload.phase === "fragment_skip" && payload.data) {
              const data = payload.data as { completed?: number; total?: number };
              return {
                ...r,
                phaseKey: payload.phase as string,
                fragmentProgress: {
                  completed: data.completed ?? r.fragmentProgress?.completed ?? 0,
                  total: data.total ?? r.fragmentProgress?.total ?? 0,
                  title: "跳过已完成",
                },
              };
            }
            // 处理段落拆分事件
            if (payload.phase === "fragment_split" && payload.data) {
              const data = payload.data as { index?: number; total?: number; chunks?: number };
              return {
                ...r,
                phaseKey: payload.phase as string,
                fragmentProgress: {
                  completed: data.index ?? r.fragmentProgress?.completed ?? 0,
                  total: data.total ?? r.fragmentProgress?.total ?? 0,
                  title: `拆成${data.chunks ?? 0}个子片段`,
                },
              };
            }
            return { ...r, phaseKey: payload.phase as string };
          });
        } else if (evt === "error") {
          lastError = (payload.error as string) || "失败";
        } else if (evt === "done") {
          ok = !!payload.ok;
          doneData = payload;
        }
      }
    }
    return { ok, error: lastError, data: doneData };
  }

  async function runTask(
    kind: RunKind,
    endpoint: string,
    onDone: (data: Record<string, unknown>) => Promise<void> | void
  ) {
    setRunning({ kind, phaseKey: PHASES[kind][0].key, elapsed: 0 });
    const startAt = Date.now();
    const timer = setInterval(() => {
      setRunning((r) =>
        r ? { ...r, elapsed: Math.floor((Date.now() - startAt) / 1000) } : r
      );
    }, 500);
    try {
      const result = await runSse(endpoint);
      if (result.error) {
        // 错误信息保留在状态栏，让用户手动关闭
        setRunning((r) => (r ? { ...r, error: result.error } : r));
        clearInterval(timer);
        const label = kind === "optimize" ? "优化" : kind === "article" ? "生成微信文章" : kind === "html" ? "生成 HTML" : "生成 skill";
        toast.error(label, { description: result.error });
      } else if (result.ok) {
        clearInterval(timer);
        setRunning(null);
        await onDone((result.data as Record<string, unknown>) || {});
      } else {
        // 异常结束也保留在状态栏
        setRunning((r) => (r ? { ...r, error: "异常结束" } : r));
        clearInterval(timer);
        toast.error("异常结束");
      }
    } catch (e) {
      // 网络错误等也保留在状态栏
      const msg = (e as Error).message;
      setRunning((r) => (r ? { ...r, error: msg } : r));
      clearInterval(timer);
      toast.error("出错", { description: msg });
    }
  }

  async function handleStop() {
    try {
      await api.stop(id);
    } catch {
      /* ignore */
    }
  }

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  async function handleRename() {
    if (!project) return;
    setRenameValue(project.name);
    setRenaming(true);
  }

  async function commitRename() {
    if (!project) { setRenaming(false); return; }
    const trimmed = renameValue.trim();
    setRenaming(false);
    if (!trimmed) {
      toast.error("名称不能为空");
      return;
    }
    if (trimmed === project.name) return;
    try {
      const updated = await api.renameProject(id, trimmed);
      setProject(updated);
      toast.success("已重命名");
    } catch (e) {
      toast.error("重命名失败", { description: (e as Error).message });
    }
  }

  function handleOptimize() {
    if (!activeFile) {
      toast.error("请先选择或新建一份设计思路");
      return;
    }
    // 先落盘，保证服务端读到最新内容
    const run = async () => {
      try {
        await api.saveDesign(id, activeFile!, editorContent);
      } catch {
        /* ignore，继续让服务端读已存内容 */
      }
      await runTask("optimize", `/api/projects/${id}/optimize`, async (data) => {
        const pts = Array.isArray(data.points) ? data.points : [];
        if (pts.length === 0) {
          toast.error("AI 未给出优化点");
          return;
        }
        setReview({
          points: pts.map((p, i) => ({
            id: `p${i}-${Math.random().toString(36).slice(2, 6)}`,
            title: String((p as Record<string, unknown>).title ?? ""),
            type: String((p as Record<string, unknown>).type ?? "补充"),
            anchor: String((p as Record<string, unknown>).anchor ?? ""),
            content: String((p as Record<string, unknown>).content ?? ""),
            included: true,
          })),
        });
        setTab("designs");
        toast.success(`识别到 ${pts.length} 个优化点，请审阅`);
      });
    };
    run();
  }

  function handleGenerateArticle() {
    if (!activeFile) {
      toast.error("请先选择一份设计思路");
      return;
    }
    runTask("article", `/api/projects/${id}/generate-article`, async () => {
      const article = await api.getArticle(id);
      setArticleContent(article.content);
      setArticleExists(article.exists);
      setTab("article");
      toast.success("已生成微信文章");
    });
  }

  function handleGenerateHtml() {
    runTask("html", `/api/projects/${id}/generate-html`, async () => {
      const html = await api.getHtml(id);
      setHtmlContent(html.content);
      setHtmlExists(html.exists);
      setTab("html");
      toast.success("已生成微信 html");
    });
  }

  function handleGenerateSkill() {
    if (!activeFile) {
      toast.error("请先选择一份设计思路");
      return;
    }
    runTask("skill", `/api/projects/${id}/generate-skill`, async () => {
      const skill = await api.getSkill(id);
      setSkillContent(skill.content);
      setSkillExists(skill.exists);
      setTab("skill");
      toast.success("已生成 skill 定义");
    });
  }

  function download(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedTitle =
    designs.find((d) => d.file === activeFile)?.title ||
    (activeFile ? activeFile : "未选择");

  function navItem(t: Tab, icon: React.ReactNode, label: string, badge?: string) {
    return (
      <button
        onClick={() => setTab(t)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
          tab === t
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
      >
        {icon}
        <span className="flex-1 text-left">{label}</span>
        {badge && (
          <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
            {badge}
          </span>
        )}
      </button>
    );
  }

  const phases = running ? PHASES[running.kind] : [];
  const currentIdx = running
    ? phases.findIndex((p) => p.key === running.phaseKey)
    : -1;

  return (
    <main className="container flex max-w-5xl gap-6 py-6">
      {/* 左侧 sidebar */}
      <aside className="flex w-60 shrink-0 flex-col gap-2">
        <div className="mb-2 px-3">
          <div className="flex items-center gap-1">
            {renaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitRename();
                  } else if (e.key === "Escape") {
                    setRenaming(false);
                  }
                }}
                className="min-w-0 flex-1 rounded border bg-background px-1.5 py-0.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
              />
            ) : (
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={project?.name}>
                {project?.name || "项目"}
              </h2>
            )}
            {project && !renaming && (
              <button
                onClick={handleRename}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="重命名项目"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {project?.designCount ? `${project.designCount} 份设计` : "无设计"}
          </p>
        </div>

        {navItem("designs", <Layers className="h-4 w-4" />, "1 · 设计思路",
          project?.designCount ? String(project.designCount) : undefined)}
        {navItem("article", <FileText className="h-4 w-4" />, "2 · 微信文章")}
        {navItem("html", <Code2 className="h-4 w-4" />, "3 · 微信 html")}
        {navItem("skill", <Wand2 className="h-4 w-4" />, "4 · skill 定义")}

        <div className="mt-3 rounded-md border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">当前选中设计思路</p>
          <p className="mt-0.5 truncate text-xs font-medium" title={selectedTitle}>
            {selectedTitle}
          </p>
        </div>

        <div className="mt-auto space-y-2 pt-4">
          <Button className="w-full" onClick={handleGenerateArticle} disabled={!!running}>
            {running?.kind === "article" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            生成微信文章
          </Button>
          <Button className="w-full" variant="secondary" onClick={handleGenerateHtml} disabled={!!running}>
            {running?.kind === "html" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Code2 className="h-4 w-4" />
            )}
            生成 HTML
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={handleGenerateSkill}
            disabled={!!running}
          >
            {running?.kind === "skill" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            生成 skill
          </Button>

          {running && (
            <div className="rounded-md border bg-card p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium">
                  {running.kind === "optimize"
                    ? "优化分析"
                    : running.kind === "article"
                    ? "生成微信文章"
                    : running.kind === "html"
                    ? "生成 HTML"
                    : "生成 skill"}
                </span>
                <span className="text-muted-foreground">已 {running.elapsed}s</span>
              </div>

              {running.error ? (
                // 错误状态：显示错误信息和关闭按钮
                <div className="space-y-2">
                  <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                    <div className="font-medium">错误</div>
                    <div className="mt-1">{running.error}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setRunning(null)}
                  >
                    <X className="h-3.5 w-3.5" /> 关闭
                  </Button>
                </div>
              ) : (
                // 正常状态：显示进度和停止按钮
                <>
                  {/* 分段进度条（仅 html 时显示） */}
                  {running.kind === "html" && running.fragmentProgress && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">
                          分段进度：{running.fragmentProgress.completed}/{running.fragmentProgress.total} 段
                        </span>
                        {running.fragmentProgress.title && (
                          <span className="text-primary truncate max-w-[120px]">
                            {running.fragmentProgress.title}
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{
                            width: `${(running.fragmentProgress.completed / running.fragmentProgress.total) * 100}%`
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <ul className="space-y-1.5">
                    {phases.map((ph, i) => {
                      const state =
                        i < currentIdx ? "done" : i === currentIdx ? "current" : "pending";
                      return (
                        <li key={ph.key} className="flex items-center gap-2 text-xs">
                          {state === "done" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : state === "current" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                          )}
                          <span className={cn(state === "pending" && "text-muted-foreground/60")}>
                            {ph.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {running.kind === "html" && running.fragmentProgress && running.fragmentProgress.completed > 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => {
                        const idx = running.fragmentProgress!.completed;
                        window.open(`/api/projects/${id}/fragments/${idx - 1}`, '_blank');
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" /> 预览已完成片段
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full text-destructive"
                    onClick={handleStop}
                  >
                    <Square className="h-3.5 w-3.5" /> 停止
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* 右侧内容 */}
      <section className="min-w-0 flex-1">
        {tab === "designs" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">设计思路</h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handleNewDesign} disabled={!!running}>
                  <FilePlus className="h-4 w-4" /> 新建
                </Button>
                <label>
                  <input
                    type="file"
                    accept=".md,.markdown,.txt"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                  <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent/50">
                    <Upload className="h-4 w-4" /> 导入 md
                  </span>
                </label>
                <Button
                  size="sm"
                  onClick={handleOptimize}
                  disabled={!!running || !activeFile}
                  title={!activeFile ? "请先选择或新建一份设计思路" : ""}
                >
                  {running?.kind === "optimize" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  识别优化补充
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-[200px_1fr] gap-3">
              {/* 设计列表 */}
              <ul className="max-h-[68vh] space-y-1.5 overflow-auto pr-1">
                {designs.length === 0 ? (
                  <li className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
                    还没有设计思路，点「新建」编辑或「导入 md」。
                  </li>
                ) : (
                  designs.map((d) => (
                    <li
                      key={d.file}
                      className={cn(
                        "group flex items-start gap-2 rounded-md border p-2 transition-colors",
                        d.file === activeFile ? "border-primary bg-accent/40" : "bg-card"
                      )}
                    >
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => handleSelectDesign(d.file)}
                      >
                        <p className="truncate text-xs font-medium" title={d.title}>
                          {d.title}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground" title={d.preview}>
                          {d.preview || "（空）"}
                        </p>
                      </button>
                      <button
                        onClick={() => handleDeleteDesign(d.file)}
                        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))
                )}
              </ul>

              {/* 编辑器 / 审阅 */}
              <div className="min-w-0 space-y-2">
                {review ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        优化审阅（共 {review.points.length} 条）— 编辑/取消勾选后「确定应用」
                      </span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setReview(null)}>
                          <X className="h-4 w-4" /> 取消
                        </Button>
                        <Button size="sm" onClick={handleApplyReview} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          确定应用
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-[68vh] space-y-2 overflow-auto pr-1">
                      {review.points.map((p) => (
                        <div key={p.id} className="rounded-md border bg-card p-2.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={p.included}
                              onChange={(e) => updatePoint(p.id, { included: e.target.checked })}
                              className="h-3.5 w-3.5"
                            />
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px]",
                                TYPE_STYLE[p.type] || "bg-muted text-muted-foreground"
                              )}
                            >
                              {p.type}
                            </span>
                            <input
                              value={p.title}
                              onChange={(e) => updatePoint(p.id, { title: e.target.value })}
                              className="min-w-0 flex-1 rounded border bg-transparent px-1.5 py-0.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <button
                              onClick={() => removePoint(p.id)}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <input
                            value={p.anchor}
                            onChange={(e) => updatePoint(p.id, { anchor: e.target.value })}
                            placeholder="并入到哪个 ## 标题之后（留空=末尾）"
                            className="mt-1.5 w-full rounded border bg-transparent px-1.5 py-0.5 text-[11px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <textarea
                            value={p.content}
                            onChange={(e) => updatePoint(p.id, { content: e.target.value })}
                            className="mt-1.5 h-24 w-full resize-none rounded border bg-background p-2 font-mono text-[11px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {activeFile ? (
                          <>
                            编辑中：<span className="font-mono">{activeFile}</span>
                          </>
                        ) : (
                          "新建设计思路（未保存）"
                        )}
                      </span>
                      <Button size="sm" variant="outline" onClick={handleSaveDesign} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {activeFile ? "保存" : "保存到…"}
                      </Button>
                    </div>
                    <textarea
                      value={editorContent}
                      onChange={(e) => setEditorContent(e.target.value)}
                      placeholder="在此编写设计思路，或点上方「导入 md」…"
                      className="h-[66vh] w-full resize-none rounded-md border bg-card p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "article" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">微信文章（结构化）</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSource((v) => !v)}
                  disabled={!articleExists}
                >
                  {showSource ? <Eye className="h-4 w-4" /> : <Code2 className="h-4 w-4" />}
                  {showSource ? "预览" : "源码"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    download(`${project?.name || "article"}.md`, articleContent, "text/markdown;charset=utf-8")
                  }
                  disabled={!articleExists}
                >
                  <Download className="h-4 w-4" /> 下载 .md
                </Button>
              </div>
            </div>
            {!articleExists ? (
              <div className="flex h-[60vh] items-center justify-center rounded-md border text-sm text-muted-foreground">
                还没有生成文章，选中设计思路后点左侧「生成微信文章」
              </div>
            ) : (
              <textarea
                value={articleContent}
                readOnly
                className="h-[60vh] w-full resize-none rounded-md border bg-card p-3 font-mono text-xs leading-relaxed"
              />
            )}
          </div>
        )}

        {tab === "html" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">微信公众号 html</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSource((v) => !v)}
                  disabled={!htmlExists}
                >
                  {showSource ? <Eye className="h-4 w-4" /> : <Code2 className="h-4 w-4" />}
                  {showSource ? "预览" : "源码"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => download(`${project?.name || "article"}.html`, htmlContent, "text/html;charset=utf-8")}
                  disabled={!htmlExists}
                >
                  <Download className="h-4 w-4" /> 下载
                </Button>
              </div>
            </div>
            {!htmlExists ? (
              <div className="flex h-[60vh] items-center justify-center rounded-md border text-sm text-muted-foreground">
                <div className="text-center">
                  <p>还没有生成 HTML</p>
                  <p className="mt-2 text-xs">请先生成「微信文章」，再生成 HTML</p>
                </div>
              </div>
            ) : showSource ? (
              <textarea
                value={htmlContent}
                readOnly
                className="h-[60vh] w-full resize-none rounded-md border bg-card p-3 font-mono text-xs leading-relaxed"
              />
            ) : (
              <iframe
                title="preview"
                srcDoc={htmlContent}
                className="h-[60vh] w-full rounded-md border bg-white"
              />
            )}
          </div>
        )}

        {tab === "skill" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">生成的 skill 定义</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => download(`${project?.name || "skill"}.md`, skillContent, "text/markdown;charset=utf-8")}
                disabled={!skillExists}
              >
                <Download className="h-4 w-4" /> 下载 .md
              </Button>
            </div>
            {!skillExists ? (
              <div className="flex h-[60vh] items-center justify-center rounded-md border text-sm text-muted-foreground">
                还没有生成 skill，选中设计思路后点左侧「生成 skill」
              </div>
            ) : (
              <textarea
                value={skillContent}
                readOnly
                className="h-[60vh] w-full resize-none rounded-md border bg-card p-3 font-mono text-xs leading-relaxed"
              />
            )}
          </div>
        )}
      </section>
    </main>
  );
}
