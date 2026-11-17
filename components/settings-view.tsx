"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  Lock,
  RefreshCw,
  Server,
  Trash2,
  Wifi,
} from "lucide-react";
import { useHealth } from "@/components/health";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Toggle,
  useToast,
} from "@/components/ui";
import { RerunSetupButton } from "@/components/desktop-setup";
import { API_PRESETS, presetForBaseUrl } from "@/lib/providers";
import type { Settings } from "@/lib/types";
import { formatNumber, isLocalEndpoint } from "@/lib/utils";

interface TestResult {
  target: "writer" | "baseline" | "embedding";
  ok: boolean;
  message: string;
  models: string[];
  dimensions?: number;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper/35 p-3">
      <p className="text-[9px] uppercase tracking-[0.1em] text-faint">{label}</p>
      <p className="mt-1 font-serif text-[20px] leading-none">{value}</p>
    </div>
  );
}

function CodeLine({ command }: { command: string }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-paper/35 px-2.5 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-soft">
        {command}
      </code>
      <button
        type="button"
        aria-label={`Copy ${command}`}
        onClick={() => {
          void navigator.clipboard
            .writeText(command)
            .then(() => toast.push({ title: "Copied", tone: "success" }))
            .catch(() =>
              toast.push({ title: "Could not copy", tone: "error" }),
            );
        }}
        className="text-faint transition hover:text-ink"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

export function SettingsView({
  initialSettings,
  counts,
  database,
}: {
  initialSettings: Settings;
  counts: { samples: number; words: number; redacted: number; rewrites: number };
  database: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { refresh: refreshHealth } = useHealth();

  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [saved, setSaved] = useState<Settings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<
    "writer" | "baseline" | "embedding" | null
  >(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const activeWriterConfig =
    settings.writer.mode === "api" ? settings.writer.api : settings.writer;
  const cloudWriter = !isLocalEndpoint(activeWriterConfig.baseUrl);
  const cloudBaseline = !isLocalEndpoint(settings.baseline.baseUrl);
  const cloudEmbedding = !isLocalEndpoint(settings.embedding.baseUrl);

  function updateWriter(patch: Partial<Settings["writer"]>) {
    setSettings((current) => ({
      ...current,
      writer: { ...current.writer, ...patch },
    }));
  }

  function updateApi(patch: Partial<Settings["writer"]["api"]>) {
    setSettings((current) => ({
      ...current,
      writer: {
        ...current.writer,
        api: { ...current.writer.api, ...patch },
      },
    }));
  }

  function updateEmbedding(patch: Partial<Settings["embedding"]>) {
    setSettings((current) => ({
      ...current,
      embedding: { ...current.embedding, ...patch },
    }));
  }

  function updateBaseline(patch: Partial<Settings["baseline"]>) {
    setSettings((current) => ({
      ...current,
      baseline: { ...current.baseline, ...patch },
    }));
  }

  function applyPreset(value: string) {
    if (value === "custom") {
      updateApi({ label: "Cloud API" });
      return;
    }
    const preset = API_PRESETS.find((entry) => entry.value === value);
    if (!preset) return;
    updateApi({
      label: preset.label,
      baseUrl: preset.baseUrl,
      model: preset.model,
    });
  }

  function setActiveWriterModel(model: string) {
    if (settings.writer.mode === "api") updateApi({ model });
    else updateWriter({ model });
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = (await response.json().catch(() => ({}))) as {
        settings?: Settings;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Settings were not saved.");
      }
      if (data.settings) {
        setSettings(data.settings);
        setSaved(data.settings);
      }
      toast.push({ title: "Settings saved", tone: "success" });
      router.refresh();
      refreshHealth();
    } catch (error) {
      toast.push({
        title: "Could not save settings",
        description: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function test(target: "writer" | "baseline" | "embedding") {
    const connection =
      target === "writer"
        ? activeWriterConfig
        : target === "baseline"
          ? settings.baseline
          : settings.embedding;
    setTesting(target);
    setTestResult(null);
    try {
      if (target === "embedding") {
        const response = await fetch("/api/embeddings/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl: connection.baseUrl,
            apiKey: connection.apiKey,
            model: connection.model,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          dimensions?: number;
          error?: string;
          details?: { hint?: string };
        };
        if (!response.ok) {
          throw new Error(
            `${data.error ?? "The embedding endpoint did not answer."}${data.details?.hint ? ` ${data.details.hint}` : ""}`,
          );
        }
        setTestResult({
          target,
          ok: true,
          message: `Connected · ${data.dimensions ?? 0}-dimensional vectors`,
          models: [],
          dimensions: data.dimensions,
        });
        return;
      }

      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: connection.baseUrl,
          apiKey: connection.apiKey,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        models?: string[];
        error?: string;
        details?: { hint?: string };
      };
      if (!response.ok) {
        throw new Error(
          `${data.error ?? "The endpoint did not answer."}${data.details?.hint ? ` ${data.details.hint}` : ""}`,
        );
      }
      const models = data.models ?? [];
      setTestResult({
        target,
        ok: true,
        message: `Connected · ${models.length} model${models.length === 1 ? "" : "s"} available`,
        models,
      });
    } catch (error) {
      setTestResult({
        target,
        ok: false,
        message: error instanceof Error ? error.message : "Could not connect.",
        models: [],
      });
    } finally {
      setTesting(null);
    }
  }

  async function resetEverything() {
    setDeleting(true);
    try {
      const response = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!response.ok) throw new Error("The reset failed.");
      window.location.href = "/";
    } catch (error) {
      toast.push({
        title: "Could not delete the data",
        description: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
      setDeleting(false);
    }
  }

  const writerResult = testResult?.target === "writer" ? testResult : null;
  const baselineResult =
    testResult?.target === "baseline" ? testResult : null;
  const embeddingResult =
    testResult?.target === "embedding" ? testResult : null;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 className="display mt-2 text-[38px] sm:text-[46px]">Settings</h1>
          <p className="lede mt-2 max-w-2xl">
            Models, privacy, and the local data file. Everything here stays on
            this machine unless you choose a hosted endpoint.
          </p>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <RerunSetupButton />
          {dirty && (
            <span className="text-[10.5px] font-medium text-amber">
              Unsaved changes
            </span>
          )}
          <Button onClick={() => void save()} loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </header>

      {cloudWriter && (
        <div className="flex items-start gap-3 rounded-xl border border-amber/25 bg-amber-soft/70 px-4 py-3">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          <p className="text-[11.5px] leading-5 text-amber">
            Your writer endpoint is not on this machine. Drafts, samples, and
            reference writing will be sent to{" "}
            <span className="font-medium">{activeWriterConfig.baseUrl}</span>.
          </p>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Model</p>
                <h2 className="mt-1 font-serif text-[22px]">Writer</h2>
                <p className="mt-1 text-[11.5px] leading-5 text-muted">
                  Run a local model or a hosted OpenAI-compatible API. Both
                  configurations are saved, so you can switch without losing
                  either.
                </p>
              </div>
              <Badge tone={cloudWriter ? "amber" : "moss"}>
                {settings.writer.mode === "api" ? "Cloud API" : "Local"}
              </Badge>
            </div>

            <Segmented
              value={settings.writer.mode}
              onChange={(mode) => updateWriter({ mode })}
              className="mt-4"
              options={[
                { value: "local", label: "Local model" },
                { value: "api", label: "Cloud API" },
              ]}
            />

            {settings.writer.mode === "api" ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Provider preset">
                    <Select
                      value={presetForBaseUrl(settings.writer.api.baseUrl)}
                      onChange={(event) => applyPreset(event.target.value)}
                    >
                      {API_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Label">
                    <Input
                      value={settings.writer.api.label}
                      onChange={(event) =>
                        updateApi({ label: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="Base URL"
                    className="sm:col-span-2"
                    hint="Maya adds /v1 if it is missing."
                  >
                    <Input
                      value={settings.writer.api.baseUrl}
                      onChange={(event) =>
                        updateApi({ baseUrl: event.target.value })
                      }
                      placeholder="https://api.openai.com/v1"
                    />
                  </Field>
                  <Field
                    label="Model"
                    hint="Test the connection, then choose from the returned models."
                  >
                    <Input
                      value={settings.writer.api.model}
                      onChange={(event) =>
                        updateApi({ model: event.target.value })
                      }
                      placeholder="gpt-4.1"
                      list="writer-models"
                    />
                    <datalist id="writer-models">
                      {(writerResult?.models ?? []).map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  </Field>
                  <Field
                    label="API key"
                    hint="Leave blank to use OPENAI_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, or GROQ_API_KEY from .env.local."
                  >
                    <div className="relative">
                      <Input
                        type={showKey ? "text" : "password"}
                        value={settings.writer.api.apiKey}
                        onChange={(event) =>
                          updateApi({ apiKey: event.target.value })
                        }
                        placeholder="Stored locally"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((current) => !current)}
                        aria-label={showKey ? "Hide API key" : "Show API key"}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
                      >
                        {showKey ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </Field>
                </div>

                <Toggle
                  checked={settings.writer.api.disableThinking}
                  onChange={(next) => updateApi({ disableThinking: next })}
                  label="Skip model reasoning"
                  hint="Set this for reasoning-style API models when the provider accepts reasoning_effort: none."
                />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Label">
                    <Input
                      value={settings.writer.label}
                      onChange={(event) =>
                        updateWriter({ label: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="Base URL"
                    hint="Maya adds /v1 if it is missing."
                  >
                    <Input
                      value={settings.writer.baseUrl}
                      onChange={(event) =>
                        updateWriter({ baseUrl: event.target.value })
                      }
                      placeholder="http://127.0.0.1:11434/v1"
                    />
                  </Field>
                  <Field label="Model">
                    <Input
                      value={settings.writer.model}
                      onChange={(event) =>
                        updateWriter({ model: event.target.value })
                      }
                      placeholder="qwen3.5:9b"
                      list="writer-models"
                    />
                    <datalist id="writer-models">
                      {(writerResult?.models ?? []).map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="API key" hint="Leave blank for local models.">
                    <div className="relative">
                      <Input
                        type={showKey ? "text" : "password"}
                        value={settings.writer.apiKey}
                        onChange={(event) =>
                          updateWriter({ apiKey: event.target.value })
                        }
                        placeholder="Optional"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((current) => !current)}
                        aria-label={showKey ? "Hide API key" : "Show API key"}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
                      >
                        {showKey ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </Field>
                </div>

                <Toggle
                  checked={settings.writer.disableThinking}
                  onChange={(next) => updateWriter({ disableThinking: next })}
                  label="Skip model reasoning"
                  hint="Recommended for Qwen3.5. Sends reasoning_effort: none so the model writes instead of thinking."
                />
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label="Examples per rewrite"
                hint="0 disables retrieval and relies on the profile alone. Two is a safe default."
              >
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={settings.writer.maxExamples}
                  onChange={(event) =>
                    updateWriter({ maxExamples: Number(event.target.value) })
                  }
                />
              </Field>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="writer-temperature"
                    className="text-[12px] font-medium text-ink-soft"
                  >
                    Temperature
                  </label>
                  <span className="text-[11px] tabular-nums text-muted">
                    {settings.writer.temperature.toFixed(2)}
                  </span>
                </div>
                <input
                  id="writer-temperature"
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={settings.writer.temperature}
                  onChange={(event) =>
                    updateWriter({ temperature: Number(event.target.value) })
                  }
                  className="mt-3 h-1 w-full accent-[#b0472b]"
                />
                <p className="mt-1 text-[10.5px] text-faint">
                  Higher values vary the wording more. 0.65 is a good starting
                  point.
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <Toggle
                checked={settings.writer.repairPass}
                onChange={(next) => updateWriter({ repairPass: next })}
                label="Polish the first pass"
                hint="Run a short fidelity audit, then one targeted second pass if details went missing or AI tells remain."
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void test("writer")}
                loading={testing === "writer"}
              >
                <Wifi className="h-3.5 w-3.5" />
                Test active connection
              </Button>
              {writerResult && (
                <p
                  className={
                    writerResult.ok
                      ? "flex items-center gap-1.5 text-[10.5px] text-moss"
                      : "flex items-center gap-1.5 text-[10.5px] text-danger"
                  }
                >
                  {writerResult.ok ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  {writerResult.message}
                </p>
              )}
            </div>
            {writerResult?.models && writerResult.models.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {writerResult.models.slice(0, 14).map((model) => (
                  <button
                    key={model}
                    type="button"
                    onClick={() => setActiveWriterModel(model)}
                    className="rounded-full border border-line bg-paper/50 px-2.5 py-1 text-[10px] text-muted transition hover:border-accent/30 hover:text-ink"
                  >
                    {model}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Retrieval</p>
                <h2 className="mt-1 font-serif text-[22px]">Embeddings</h2>
                <p className="mt-1 text-[11.5px] leading-5 text-muted">
                  Used for semantic example matching. This can stay on your
                  machine even when the writer is a cloud API.
                </p>
              </div>
              <Badge tone={cloudEmbedding ? "amber" : "moss"}>
                {cloudEmbedding ? "Remote" : "Local"}
              </Badge>
            </div>

            {cloudEmbedding && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber/20 bg-amber-soft/60 px-3 py-2 text-[10.5px] leading-5 text-amber">
                <Globe className="mt-0.5 h-3 w-3 shrink-0" />
                Sample text will be sent to {settings.embedding.baseUrl} for
                embedding.
              </div>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="Base URL"
                className="sm:col-span-2"
                hint="The embeddings endpoint. Ollama serves all-minilm at the usual /v1 URL."
              >
                <Input
                  value={settings.embedding.baseUrl}
                  onChange={(event) =>
                    updateEmbedding({ baseUrl: event.target.value })
                  }
                  placeholder="http://127.0.0.1:11434/v1"
                />
              </Field>
              <Field
                label="Model"
                hint="all-minilm is 384-dimensional. Changing it clears stored vectors."
              >
                <Input
                  value={settings.embedding.model}
                  onChange={(event) =>
                    updateEmbedding({ model: event.target.value })
                  }
                  placeholder="all-minilm"
                />
              </Field>
              <Field
                label="API key"
                hint="Leave blank unless the embeddings endpoint needs a key."
              >
                <Input
                  type="password"
                  value={settings.embedding.apiKey}
                  onChange={(event) =>
                    updateEmbedding({ apiKey: event.target.value })
                  }
                  placeholder="Optional"
                />
              </Field>
            </div>

            <div className="mt-4">
              <Toggle
                checked={settings.writer.semanticRetrieval}
                onChange={(next) => updateWriter({ semanticRetrieval: next })}
                label="Semantic example matching"
                hint="Use embeddings alongside format, audience, length, and wording. Turn off to use lexical matching only."
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void test("embedding")}
                loading={testing === "embedding"}
              >
                <Wifi className="h-3.5 w-3.5" />
                Test embeddings
              </Button>
              {embeddingResult && (
                <p
                  className={
                    embeddingResult.ok
                      ? "flex items-center gap-1.5 text-[10.5px] text-moss"
                      : "flex items-center gap-1.5 text-[10.5px] text-danger"
                  }
                >
                  {embeddingResult.ok ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  {embeddingResult.message}
                </p>
              )}
            </div>

            <p className="mt-3 text-[10px] leading-5 text-faint">
              Changing the embedding endpoint or model clears the stored
              vectors. They rebuild on the next rewrite.
            </p>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Model</p>
                <h2 className="mt-1 font-serif text-[22px]">Baseline</h2>
                <p className="mt-1 text-[11.5px] leading-5 text-muted">
                  An optional second model for the Lab comparison. It never
                  writes your normal rewrites.
                </p>
              </div>
              <Badge tone={settings.baseline.enabled ? "moss" : "neutral"}>
                {settings.baseline.enabled ? "Enabled" : "Off"}
              </Badge>
            </div>

            <div className="mt-4">
              <Toggle
                checked={settings.baseline.enabled}
                onChange={(next) => updateBaseline({ enabled: next })}
                label="Enable baseline comparison"
                hint="Adds a fourth variant to the Lab. Useful for benchmarking a dedicated humaniser."
              />
            </div>

            {settings.baseline.enabled && (
              <>
                {cloudBaseline && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber/20 bg-amber-soft/60 px-3 py-2 text-[10.5px] leading-5 text-amber">
                    <Globe className="mt-0.5 h-3 w-3 shrink-0" />
                    This baseline is remote. Lab drafts will be sent to it.
                  </div>
                )}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Label">
                    <Input
                      value={settings.baseline.label}
                      onChange={(event) =>
                        updateBaseline({ label: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Base URL">
                    <Input
                      value={settings.baseline.baseUrl}
                      onChange={(event) =>
                        updateBaseline({ baseUrl: event.target.value })
                      }
                      placeholder="http://127.0.0.1:8081/v1"
                    />
                  </Field>
                  <Field label="Model">
                    <Input
                      value={settings.baseline.model}
                      onChange={(event) =>
                        updateBaseline({ model: event.target.value })
                      }
                      placeholder="humanizer"
                      list="baseline-models"
                    />
                    <datalist id="baseline-models">
                      {(baselineResult?.models ?? []).map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="API key">
                    <Input
                      type="password"
                      value={settings.baseline.apiKey}
                      onChange={(event) =>
                        updateBaseline({ apiKey: event.target.value })
                      }
                      placeholder="Optional"
                    />
                  </Field>
                  <Field
                    label="Prompt format"
                    hint="Use Humaniser completion for npario/humanizer. Use Chat for ordinary chat models."
                  >
                    <Select
                      value={settings.baseline.promptFormat}
                      onChange={(event) =>
                        updateBaseline({
                          promptFormat: event.target.value as
                            | "chat"
                            | "humanizer",
                        })
                      }
                    >
                      <option value="chat">Chat messages</option>
                      <option value="humanizer">
                        Humaniser completion prompt
                      </option>
                    </Select>
                  </Field>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="baseline-temperature"
                      className="text-[12px] font-medium text-ink-soft"
                    >
                      Temperature
                    </label>
                    <span className="text-[11px] tabular-nums text-muted">
                      {settings.baseline.temperature.toFixed(2)}
                    </span>
                  </div>
                  <input
                    id="baseline-temperature"
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={settings.baseline.temperature}
                    onChange={(event) =>
                      updateBaseline({
                        temperature: Number(event.target.value),
                      })
                    }
                    className="mt-2 h-1 w-full accent-[#b0472b]"
                  />
                </div>
                <div className="mt-4">
                  <Toggle
                    checked={settings.baseline.disableThinking}
                    onChange={(next) =>
                      updateBaseline({ disableThinking: next })
                    }
                    label="Skip model reasoning"
                    hint="Set this if the baseline is a thinking model."
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void test("baseline")}
                    loading={testing === "baseline"}
                  >
                    <Wifi className="h-3.5 w-3.5" />
                    Test connection
                  </Button>
                  {baselineResult && (
                    <p
                      className={
                        baselineResult.ok
                          ? "flex items-center gap-1.5 text-[10.5px] text-moss"
                          : "flex items-center gap-1.5 text-[10.5px] text-danger"
                      }
                    >
                      {baselineResult.ok ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      )}
                      {baselineResult.message}
                    </p>
                  )}
                </div>
                {baselineResult?.models && baselineResult.models.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {baselineResult.models.slice(0, 12).map((model) => (
                      <button
                        key={model}
                        type="button"
                        onClick={() => updateBaseline({ model })}
                        className="rounded-full border border-line bg-paper/50 px-2.5 py-1 text-[10px] text-muted transition hover:border-accent/30 hover:text-ink"
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <p className="eyebrow">Identity</p>
            <h2 className="mt-1 font-serif text-[22px]">Your name</h2>
            <div className="mt-4 max-w-sm">
              <Field
                label="Display name"
                hint="Used in the interface and in the voice prompt."
              >
                <Input
                  value={settings.person.name}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      person: { ...current.person, name: event.target.value },
                    }))
                  }
                />
              </Field>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-moss-soft text-moss">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <p className="eyebrow">Privacy</p>
                <h2 className="mt-1 font-serif text-[22px]">Your data</h2>
              </div>
            </div>

            <div className="mt-4">
              <Toggle
                checked={settings.privacy.redactPii}
                onChange={(next) =>
                  setSettings((current) => ({
                    ...current,
                    privacy: { ...current.privacy, redactPii: next },
                  }))
                }
                label="Redact personal details on import"
                hint="Emails, phone numbers, card numbers, IDs, IBANs, and handles become placeholders."
              />
            </div>

            <div className="mt-4 rounded-xl border border-line bg-paper/35 p-3.5">
              <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">
                <Database className="h-3 w-3" />
                Local database
              </p>
              <p
                className="mt-1.5 truncate font-mono text-[10px] text-muted"
                title={database}
              >
                {database}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="/api/export"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[12px] font-medium text-ink transition hover:bg-surface-2"
              >
                <Download className="h-3.5 w-3.5" />
                Export everything
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeleteText("");
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete all data
              </Button>
            </div>

            <p className="mt-3 text-[10px] leading-5 text-faint">
              The export includes samples, rewrites, profiles, and evaluation
              results. API keys are left out.
            </p>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <p className="eyebrow">At a glance</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Samples" value={formatNumber(counts.samples)} />
              <Stat label="Words" value={formatNumber(counts.words)} />
              <Stat label="Redacted" value={formatNumber(counts.redacted)} />
              <Stat label="Rewrites" value={formatNumber(counts.rewrites)} />
            </div>
            <div className="mt-3 rounded-xl border border-line bg-paper/35 p-3">
              <p className="text-[9px] uppercase tracking-[0.1em] text-faint">
                Active writer
              </p>
              <p className="mt-1 text-[11.5px] font-medium text-ink-soft">
                {settings.writer.mode === "api" ? "Cloud API" : "Local"} ·{" "}
                {activeWriterConfig.model || "No model"}
              </p>
              <p className="mt-0.5 text-[9.5px] text-faint">
                Embeddings: {settings.embedding.model} ·{" "}
                {cloudEmbedding ? "remote" : "local"}
              </p>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[10px] text-faint">
              <HardDrive className="h-3 w-3" />
              SQLite · single-user · no telemetry
            </p>
          </Card>

          <Card className="p-5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-moss">
              <Server className="h-3.5 w-3.5" />
              Local setup
            </p>
            <div className="mt-3 space-y-2">
              <CodeLine command="ollama serve" />
              <CodeLine command="ollama pull qwen3.5:9b" />
              <CodeLine command="ollama pull all-minilm" />
            </div>
            <p className="mt-3 text-[10px] leading-5 text-faint">
              A 9B model at Q4 needs roughly 7 GB of free memory. A 12B model at
              Q8 is closer to 14 GB. The first run is slower while the model
              loads.
            </p>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">About</p>
            <p className="mt-2 text-[11px] leading-5 text-muted">
              Maya is a local-first voice studio: measured style, retrieved
              samples, a rewrite, and a rule-based check. It is not an AI
              detector and does not promise to beat one.
            </p>
            <div className="mt-3 space-y-1.5 text-[10px] leading-5 text-faint">
              <a
                href="https://github.com/blader/humanizer"
                target="_blank"
                rel="noreferrer"
                className="block underline decoration-line-strong underline-offset-2 hover:text-ink"
              >
                Pattern taxonomy: blader/humanizer (MIT)
              </a>
              <a
                href="https://huggingface.co/npario/humanizer"
                target="_blank"
                rel="noreferrer"
                className="block underline decoration-line-strong underline-offset-2 hover:text-ink"
              >
                Baseline: npario/humanizer (Apache 2.0)
              </a>
              <a
                href="https://huggingface.co/Qwen/Qwen3.5-9B"
                target="_blank"
                rel="noreferrer"
                className="block underline decoration-line-strong underline-offset-2 hover:text-ink"
              >
                Writer: Qwen3.5-9B (Apache 2.0)
              </a>
              <a
                href="https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2"
                target="_blank"
                rel="noreferrer"
                className="block underline decoration-line-strong underline-offset-2 hover:text-ink"
              >
                Embeddings: all-MiniLM-L6-v2 (Apache 2.0)
              </a>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[9.5px] text-faint">
              <Lock className="h-2.5 w-2.5" />
              Maya 0.1 · local by default
            </p>
          </Card>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete everything?"
        description="This removes your samples, profiles, rewrites, and Lab runs from the local database. It cannot be undone."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={deleteText !== "DELETE"}
              loading={deleting}
              onClick={() => void resetEverything()}
            >
              Delete all data
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-accent-soft/40 p-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-[11px] leading-5 text-muted">
              Export first if you want a copy. This wipes the database and
              returns Maya to a blank workspace.
            </p>
          </div>
          <Field label="Type DELETE to confirm">
            <Input
              value={deleteText}
              onChange={(event) => setDeleteText(event.target.value)}
              placeholder="DELETE"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
