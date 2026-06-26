export interface AiConfigPublic {
  baseUrl: string;
  model: string;
  timeout: number;
  hasKey: boolean;
  keyHint: string;
}

export interface TestResult {
  ok: boolean;
  latencyMs?: number;
  status?: number;
  error?: string;
  model?: string;
}

export interface SaveInput {
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeout: number;
}

export interface ModelInfo {
  name: string;
  inputCostPerToken: number;
  outputCostPerToken: number;
  tpm: number;
  rpm: number;
  maxTokens: number;
}

export interface DesignSummary {
  file: string;
  title: string;
  preview: string;
  updatedAt: number;
  selected: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  selectedDesign: string | null;
  hasHtml: boolean;
  hasSkill: boolean;
  designCount: number;
  designs: DesignSummary[];
}

export interface FileResult {
  content: string;
  exists: boolean;
}

export interface OkResult {
  ok: boolean;
  error?: string;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data?.error || data?.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  // settings
  getSettings: () => json<AiConfigPublic>("/api/settings"),
  saveSettings: (body: SaveInput) =>
    json<AiConfigPublic>("/api/settings", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  testSettings: (body: SaveInput) =>
    json<TestResult>("/api/settings/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getModels: () => json<{ models: ModelInfo[]; error?: string }>("/api/models"),

  // projects
  listProjects: () => json<Project[]>("/api/projects"),
  createProject: (name: string) =>
    json<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteProject: (id: string) =>
    json<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  getProject: (id: string) => json<Project>(`/api/projects/${id}`),
  renameProject: (id: string, name: string) =>
    json<Project>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  // 设计思路目录
  listDesigns: (id: string) => json<DesignSummary[]>(`/api/projects/${id}/designs`),
  createDesign: (id: string, name: string, content: string) =>
    json<{ ok: boolean; file: string }>(`/api/projects/${id}/designs`, {
      method: "POST",
      body: JSON.stringify({ name, content }),
    }),
  getDesign: (id: string, file: string) =>
    json<FileResult>(`/api/projects/${id}/designs/${encodeURIComponent(file)}`),
  saveDesign: (id: string, file: string, content: string) =>
    json<OkResult>(`/api/projects/${id}/designs/${encodeURIComponent(file)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  deleteDesign: (id: string, file: string) =>
    json<OkResult>(`/api/projects/${id}/designs/${encodeURIComponent(file)}`, {
      method: "DELETE",
    }),
  selectDesign: (id: string, file: string) =>
    json<OkResult>(`/api/projects/${id}/designs/select`, {
      method: "POST",
      body: JSON.stringify({ file }),
    }),

  // 输出
  getHtml: (id: string) => json<FileResult>(`/api/projects/${id}/html`),
  getArticle: (id: string) => json<FileResult>(`/api/projects/${id}/article`),
  getSkill: (id: string) => json<FileResult>(`/api/projects/${id}/skill`),

  // 强制停止当前 AI 任务
  stop: (id: string) =>
    json<{ ok: boolean }>(`/api/projects/${id}/stop`, { method: "POST" }),

  // 分段生成进度
  getProgress: (id: string) =>
    json<{ hasProgress: boolean; progress?: { total: number; completed: number[]; title: string } }>(`/api/projects/${id}/progress`),
  deleteFragments: (id: string) =>
    json<{ ok: boolean }>(`/api/projects/${id}/fragments`, { method: "DELETE" }),
  getFragment: (id: string, index: number) =>
    json<{ exists: boolean; content: string; index: number }>(`/api/projects/${id}/fragments/${index}`),
};
