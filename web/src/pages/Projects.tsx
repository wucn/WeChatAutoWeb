import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Project } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setProjects(await api.listProjects());
    } catch (e) {
      toast.error("加载项目失败", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const p = await api.createProject(name || "未命名项目");
      toast.success("已新建项目");
      navigate(`/projects/${p.id}`);
    } catch (e) {
      toast.error("新建失败", { description: (e as Error).message });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("删除该项目？")) return;
    try {
      await api.deleteProject(id);
      setProjects((list) => list.filter((p) => p.id !== id));
      toast.success("已删除");
    } catch (e) {
      toast.error("删除失败", { description: (e as Error).message });
    }
  }

  return (
    <main className="container max-w-3xl py-8">
      <h1 className="mb-4 text-lg font-semibold">项目</h1>

      <div className="mb-6 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新项目名称"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          新建
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">还没有项目，新建一个开始吧。</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-accent/40"
            >
              <button
                className="flex flex-1 items-center gap-3 text-left"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{p.name}</span>
                <span className="flex gap-1.5 text-xs">
                  {p.designCount > 0 ? (
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700">
                      {p.designCount} 设计
                    </span>
                  ) : null}
                  {p.hasSkill ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                      skill
                    </span>
                  ) : null}
                  {p.hasHtml ? (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                      html
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(p.updatedAt).toLocaleString()}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(p.id)}
                aria-label="删除"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
