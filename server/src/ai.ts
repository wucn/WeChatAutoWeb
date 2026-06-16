export interface TestInput {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface TestResult {
  ok: boolean;
  latencyMs?: number;
  status?: number;
  error?: string;
  model?: string;
}

/**
 * 向 litellm 代理（Anthropic 兼容）发一个最小 /v1/messages 请求，
 * 验证 baseUrl + apiKey + model 三者组合可用。
 */
export async function testConnection(input: TestInput): Promise<TestResult> {
  const url = input.baseUrl.replace(/\/+$/, "") + "/v1/messages";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { ok: true, latencyMs, model: input.model };
    }

    // 非 2xx：尽量提取可读错误信息
    let detail = "";
    try {
      const data = await res.json();
      detail =
        (data?.error?.message as string) ||
        (data?.message as string) ||
        JSON.stringify(data);
    } catch {
      try {
        detail = await res.text();
      } catch {
        detail = "";
      }
    }
    return {
      ok: false,
      status: res.status,
      latencyMs,
      error: detail || res.statusText,
    };
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    if (err?.name === "AbortError") {
      return { ok: false, error: "请求超时（15s）" };
    }
    return { ok: false, error: err?.message || String(e) };
  } finally {
    clearTimeout(timeout);
  }
}
