import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Plug, Save } from "lucide-react";
import { toast } from "sonner";
import { api, type AiConfigPublic, type TestResult } from "@/lib/api";
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

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [keyHint, setKeyHint] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((cfg: AiConfigPublic) => {
        if (cfg.baseUrl) setBaseUrl(cfg.baseUrl);
        if (cfg.model) setModel(cfg.model);
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
            <Label>模型</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {MODELS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
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
