import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, "../config/ai.json");

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeout: number; // AI 请求超时时间（秒），默认 120
}

/** 对外（前端）展示的脱敏配置 */
export interface AiConfigPublic {
  baseUrl: string;
  model: string;
  timeout: number;
  hasKey: boolean;
  keyHint: string;
}

export function readConfig(): AiConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AiConfig>;
    return {
      baseUrl: parsed.baseUrl ?? "",
      apiKey: parsed.apiKey ?? "",
      model: parsed.model ?? "",
      timeout: parsed.timeout ?? 120,
    };
  } catch {
    return null;
  }
}

export function writeConfig(cfg: AiConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}

/** 仅保留末 4 位，其余用圆点遮蔽 */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return "••••••••" + key.slice(-4);
}

export function toPublic(cfg: AiConfig | null): AiConfigPublic {
  if (!cfg) return { baseUrl: "", model: "", timeout: 120, hasKey: false, keyHint: "" };
  return {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    timeout: cfg.timeout,
    hasKey: !!cfg.apiKey,
    keyHint: maskKey(cfg.apiKey),
  };
}
