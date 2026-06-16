/**
 * 可选 AI 模型清单（前后端共享）。
 * 来源：creads profile 列表，对应 litellm.spaccez.com 代理背后接入的各家模型。
 * 名称需与 litellm 代理配置一致（含 [1m] 后缀，表示百万 token 上下文）。
 */
export const MODELS: string[] = [
  // Claude
  "claude-haiku-4-5-20251001",
  "claude-opus-4-6-bedrock[1m]",
  "claude-opus-4-6-omnixai[1m]",
  "claude-opus-4-6[1m]",
  "claude-opus-4-7-bedrock[1m]",
  "claude-opus-4-7-omnixai[1m]",
  "claude-opus-4-7[1m]",
  "claude-opus-4-8[1m]",
  "claude-sonnet-4-6-bedrock[1m]",
  "claude-sonnet-4-6-omnixai[1m]",
  "claude-sonnet-4-6[1m]",
  // DeepSeek
  "deepseek-v3-2",
  "deepseek-v4-flash",
  "deepseek-v4-flash-a",
  "deepseek-v4-flash-bailian",
  "deepseek-v4-pro",
  "deepseek-v4-pro-bailian",
  // 豆包
  "doubao-seed-2-0-pro",
  // GLM（智谱）
  "glm-4-5-aiping",
  "glm-4-7-aiping",
  "glm-5",
  "glm-5-1",
  "glm-5-1-aiping",
  "glm-5-1-origin",
  "glm-5-2[1m]",
  "glm-5-aiping",
  // Kimi
  "kimi-k2-5",
  "kimi-k2-5-origin",
  "kimi-k2-6-origin",
  // MiniMax
  "minimax-m2",
  "minimax-m2-5",
  "minimax-m2-5-origin",
  "minimax-m2-7-highspeed-origin",
  "minimax-m2-7-origin",
  "minimax-m2.7",
  // 通义千问
  "qwen3-7-max[1m]",
  "qwen3-7-plus[1m]",
  "qwen3-max",
];

/** 默认模型 */
export const DEFAULT_MODEL = "glm-5-2[1m]";

/** litellm 代理默认地址 */
export const DEFAULT_BASE_URL = "https://litellm.spaccez.com";
