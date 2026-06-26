import express from "express";
import cors from "cors";
import {
  readConfig,
  writeConfig,
  toPublic,
  type AiConfig,
} from "./config.js";
import { testConnection } from "./ai.js";
import { projectsRouter } from "./projects.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = Number(process.env.PORT ?? 3456);

/** 从 litellm API 获取可用模型列表 */
async function fetchAvailableModels(baseUrl: string, apiKey: string): Promise<string[]> {
  try {
    const url = baseUrl.replace(/\/+$/, "") + "/v1/models";
    const resp = await fetch(url, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { data?: Array<{ id?: string }> };
    if (!Array.isArray(data?.data)) return [];
    return data.data.map((m) => m.id || "").filter(Boolean).sort();
  } catch {
    return [];
  }
}

app.get("/api/settings", (_req, res) => {
  res.json(toPublic(readConfig()));
});

app.get("/api/models", async (_req, res) => {
  const cfg = readConfig();
  if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
    return res.json({ models: [], error: "请先配置 API Key 和 Base URL" });
  }
  const models = await fetchAvailableModels(cfg.baseUrl, cfg.apiKey);
  res.json({ models });
});

app.post("/api/settings", (req, res) => {
  const { baseUrl, apiKey, model, timeout } = (req.body ?? {}) as {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    timeout?: number;
  };
  const existing = readConfig();
  // apiKey 为空/未传 → 保留旧值（前端只改了模型/地址时不清空密钥）
  const next: AiConfig = {
    baseUrl: typeof baseUrl === "string" ? baseUrl : existing?.baseUrl ?? "",
    apiKey: apiKey ? apiKey : existing?.apiKey ?? "",
    model: typeof model === "string" ? model : existing?.model ?? "",
    timeout: typeof timeout === "number" ? timeout : existing?.timeout ?? 120,
  };
  writeConfig(next);
  res.json(toPublic(next));
});

app.post("/api/settings/test", async (req, res) => {
  const { baseUrl, apiKey, model } = (req.body ?? {}) as {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  const existing = readConfig();
  const effectiveKey = apiKey ? apiKey : existing?.apiKey ?? "";
  if (!baseUrl || !effectiveKey || !model) {
    return res
      .status(400)
      .json({ ok: false, error: "缺少 baseUrl / apiKey / model" });
  }
  const result = await testConnection({
    baseUrl,
    apiKey: effectiveKey,
    model,
  });
  res.json(result);
});

app.use("/api/projects", projectsRouter);

app.listen(PORT, () => {
  console.log(`[server] API on http://localhost:${PORT}`);
});
