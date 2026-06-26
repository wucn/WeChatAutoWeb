import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Plug, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { api, type AiConfigPublic, type TestResult, type ModelInfo } from "@/lib/api";
import { DEFAULT_BASE_URL, DEFAULT_MODEL, MODELS } from "@shared/models";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// 格式化费用：$/token -> $/M tokens
function formatCost(costPerToken: number): string {
  if (!costPerToken) return "-";
  const perMillion = costPerToken * 1_000_000;
  return `$${perMillion.toFixed(2)}/M`;
}

// 格式化数字：带千分位
function formatNum(n: number): string {
  if (!n) return "-";
  return n.toLocaleString();
}

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [timeout, setTimeout] = useState(120);
  const [keyHint, setKeyHint] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((cfg: AiConfigPublic) => {
        if (cfg.baseUrl) setBaseUrl(cfg.baseUrl);
        if (cfg.model) setModel(cfg.model);
        if (cfg.timeout) setTimeout(cfg.timeout);
        setKeyHint(cfg.keyHint || "");
        setHasKey(cfg.hasKey);
      })
      .catch(() => {
        // 后端未就绪时静默，保留默认值
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const cfg = await api.saveSettings({
        baseUrl,
        apiKey: apiKey || undefined,
        model,
        timeout,
      });
      setKeyHint(cfg.keyHint || "");
      setHasKey(cfg.hasKey);
      setApiKey("");
      toast.success("配置已保存");
    } catch (e) {
      toast.error("保存失败", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const r: TestResult = await api.testSettings({
        baseUrl,
        apiKey: apiKey || undefined,
        model,
        timeout,
      });
      if (r.ok) {
        toast.success(`连通成功 · ${r.latencyMs}ms`, {
          description: `模型 ${r.model}`,
        });
      } else {
        const prefix = r.status ? `[${r.status}] ` : "";
        toast.error("连通失败", {
          description: prefix + (r.error || "未知错误"),
        });
      }
    } catch (e) {
      toast.error("请求出错", { description: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function handleRefreshModels() {
    setRefreshing(true);
    try {
      const result = await api.getModels();
      if (result.error) {
        toast.error("获取模型列表失败", { description: result.error });
      } else if (result.models.length === 0) {
        toast.warning("未获取到模型", { description: "请检查 API Key 和 Base URL 是否正确" });
      } else {
        setAvailableModels(result.models);
        toast.success(`已获取 ${result.models.length} 个模型及费用信息`);
      }
    } catch (e) {
      toast.error("请求出错", { description: (e as Error).message });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="container max-w-2xl py-10">
      <Card>
        <CardHeader>
          <CardTitle>AI 设置</CardTitle>
          <CardDescription>
            配置 litellm 代理地址、API Key 与模型。信息仅保存在本地
            （server/config/ai.json），不会上传。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL（Anthropic 兼容端点）</Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={DEFAULT_BASE_URL}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  hasKey ? `已配置 ${keyHint}（留空则保留）` : "sk-..."
                }
                className="pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showKey ? "隐藏" : "显示"}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">模型</Label>
            <div className="flex gap-2">
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="选择或输入模型" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectGroup>
                    {(availableModels.length > 0 ? availableModels : MODELS.map(m => ({ name: m } as ModelInfo))).map((m) => (
                      <SelectItem key={m.name} value={m.name}>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{m.name}</span>
                          {m.inputCostPerToken && (
                            <span className="text-xs text-muted-foreground">
                              输入 {formatCost(m.inputCostPerToken)} · 输出 {formatCost(m.outputCostPerToken)}
                              {m.maxTokens && ` · max ${formatNum(m.maxTokens)}`}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefreshModels}
                disabled={refreshing}
                title="从 API 获取可用模型及费用信息"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              点击刷新按钮获取模型列表及费用信息（输入/输出单价、max_tokens）
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeout">请求超时（秒）</Label>
            <Input
              id="timeout"
              type="number"
              min={30}
              max={600}
              value={timeout}
              onChange={(e) => setTimeout(Number(e.target.value) || 120)}
              placeholder="120"
            />
            <p className="text-xs text-muted-foreground">
              AI 请求的最大等待时间，默认 120 秒，范围 30-600 秒
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving || testing}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存配置
            </Button>
            <Button
              variant="secondary"
              onClick={handleTest}
              disabled={saving || testing}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              测试连通
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
