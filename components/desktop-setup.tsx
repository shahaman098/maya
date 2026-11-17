"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  Cpu,
  Download,
  ExternalLink,
  HardDrive,
  KeyRound,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { API_PRESETS, type ApiPreset } from "@/lib/providers";
import { buttonStyles } from "@/lib/ui";
import { cn } from "@/lib/utils";

interface HardwareInfo {
  totalMemGB: number;
  cpu: string;
  gpu: string;
  platform: string;
  isWindows: boolean;
}

interface OllamaStatus {
  installed: boolean;
  running: boolean;
  canInstall?: boolean;
  models: string[];
  error?: string;
}

interface ActionResult {
  ok: boolean;
  message: string;
}

interface PullProgress {
  model: string;
  line: string;
  status?: string;
  percent?: number | null;
}

interface InstallProgress {
  stage: "download" | "verify" | "install";
  percent: number | null;
  receivedMB?: number;
  totalMB?: number | null;
}

type SetupMode = "local" | "api" | "skipped";

interface MayaDesktopAPI {
  isDesktop: true;
  hardware: () => Promise<HardwareInfo>;
  checkOllama: () => Promise<OllamaStatus>;
  installOllama?: () => Promise<ActionResult>;
  startOllama?: () => Promise<ActionResult>;
  pullModel: (model: string) => Promise<ActionResult>;
  onOllamaProgress: (callback: (event: PullProgress) => void) => () => void;
  onInstallProgress?: (
    callback: (event: InstallProgress) => void,
  ) => () => void;
  setupState?: () => Promise<{ completed: boolean; mode: SetupMode | null }>;
  completeSetup?: (mode: SetupMode) => Promise<boolean>;
  resetSetup?: () => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  dataPath: () => Promise<string>;
}

declare global {
  interface Window {
    mayaDesktop?: MayaDesktopAPI;
  }
}

const LOCAL_MODEL = "qwen3.5:9b";
const EMBEDDING_MODEL = "all-minilm";
const HUMANIZER_MODEL = "hf.co/npario/humanizer:Q4_K_M";
const OLLAMA_V1 = "http://127.0.0.1:11434/v1";

type Step = "welcome" | "local" | "key" | "done";
type Route = "local" | "api";
type TaskId = "install" | "start" | "writer" | "embed" | "humanizer";
type TaskState = "pending" | "running" | "done" | "skipped" | "error";

const TASKS: { id: TaskId; label: string; size: string }[] = [
  { id: "install", label: "Install Ollama, the local model runner", size: "~1 GB" },
  { id: "start", label: "Start Ollama in the background", size: "" },
  { id: "writer", label: `Download the writer model (${LOCAL_MODEL})`, size: "6.6 GB" },
  { id: "embed", label: `Download the matching model (${EMBEDDING_MODEL})`, size: "45 MB" },
  { id: "humanizer", label: "Download the humaniser (npario/humanizer 12B)", size: "7.6 GB" },
];

const MODEL_TASKS: { id: TaskId; model: string }[] = [
  { id: "writer", model: LOCAL_MODEL },
  { id: "embed", model: EMBEDDING_MODEL },
  { id: "humanizer", model: HUMANIZER_MODEL },
];

const INITIAL_TASKS: Record<TaskId, TaskState> = {
  install: "pending",
  start: "pending",
  writer: "pending",
  embed: "pending",
  humanizer: "pending",
};

function hasModel(models: string[], model: string): boolean {
  return models.some(
    (candidate) => candidate === model || candidate.startsWith(`${model}:`),
  );
}

async function patchSettings(patch: unknown): Promise<void> {
  const response = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(data.error ?? "Settings were not saved.");
  }
}

function StepDots({ step, route }: { step: Step; route: Route | null }) {
  const steps: { id: Step; label: string }[] =
    route === "api"
      ? [
          { id: "welcome", label: "Choose" },
          { id: "key", label: "API key" },
          { id: "local", label: "Downloads" },
          { id: "done", label: "Start" },
        ]
      : [
          { id: "welcome", label: "Choose" },
          { id: "local", label: "Install" },
          { id: "key", label: "API key" },
          { id: "done", label: "Start" },
        ];
  const current = steps.findIndex((entry) => entry.id === step);
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
      {steps.map((entry, index) => (
        <li key={entry.id} className="flex items-center gap-1.5">
          <span
            className={cn(
              "grid h-5 w-5 place-items-center rounded-full border text-[10px] font-semibold",
              index < current && "border-moss bg-moss text-white",
              index === current && "border-accent bg-accent text-white",
              index > current && "border-line-strong text-faint",
            )}
          >
            {index < current ? <Check className="h-3 w-3" /> : index + 1}
          </span>
          <span
            className={cn(
              index === current ? "font-medium text-ink" : "text-faint",
            )}
          >
            {entry.label}
          </span>
          {index < steps.length - 1 && (
            <span className="mx-1 h-px w-4 bg-line-strong" />
          )}
        </li>
      ))}
    </ol>
  );
}

function ProgressBar({ percent }: { percent: number | null }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
      <div
        className={cn(
          "h-full rounded-full bg-accent transition-all",
          percent === null && "w-1/3 animate-pulse",
        )}
        style={
          percent === null
            ? undefined
            : { width: `${Math.max(2, Math.min(100, percent))}%` }
        }
      />
    </div>
  );
}

function TaskRow({
  label,
  size,
  state,
  detail,
  percent,
}: {
  label: string;
  size: string;
  state: TaskState;
  detail?: string;
  percent?: number | null;
}) {
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
            state === "done" || state === "skipped"
              ? "border-moss bg-moss text-white"
              : state === "error"
                ? "border-danger text-danger"
                : state === "running"
                  ? "border-accent text-accent"
                  : "border-line-strong",
          )}
        >
          {state === "done" || state === "skipped" ? (
            <Check className="h-3 w-3" />
          ) : state === "running" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : state === "error" ? (
            <X className="h-3 w-3" />
          ) : null}
        </span>
        <span
          className={cn(
            "text-[12px]",
            state === "pending" ? "text-muted" : "text-ink-soft",
          )}
        >
          {label}
        </span>
        <span className="ml-auto text-[10.5px] text-faint">
          {state === "skipped" ? "already done" : detail || size}
        </span>
      </div>
      {state === "running" && percent !== undefined && (
        <div className="pl-7">
          <ProgressBar percent={percent} />
        </div>
      )}
    </li>
  );
}

export function DesktopSetup({ samples }: { samples: number }) {
  const router = useRouter();
  const [api, setApi] = useState<MayaDesktopAPI | null>(null);
  const [visible, setVisible] = useState(false);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [step, setStep] = useState<Step>("welcome");
  const [route, setRoute] = useState<Route | null>(null);

  // Local install
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [taskDetail, setTaskDetail] = useState<{
    id: TaskId;
    text: string;
    percent: number | null;
  } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState("");
  const [manualOllama, setManualOllama] = useState(false);
  const [includeHumanizer, setIncludeHumanizer] = useState(true);

  // API key
  const [preset, setPreset] = useState<ApiPreset["value"]>("openai");
  const [baseUrl, setBaseUrl] = useState(API_PRESETS[0].baseUrl);
  const [model, setModel] = useState(API_PRESETS[0].model);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    const desktop = window.mayaDesktop;
    if (!desktop) return;
    let alive = true;
    const forced = new URLSearchParams(window.location.search).has("setup");

    void (async () => {
      const state = desktop.setupState
        ? await desktop.setupState().catch(() => ({ completed: false }))
        : { completed: samples > 0 };
      const show = forced || (!state.completed && samples === 0);
      if (!alive || !show) return;
      const info = await desktop.hardware().catch(() => null);
      if (!alive) return;
      setApi(desktop);
      setHardware(info);
      setVisible(true);
    })();

    return () => {
      alive = false;
    };
  }, [samples]);

  const hasDedicatedGpu = useMemo(
    () =>
      /nvidia|geforce|rtx|gtx|radeon|rx |arc a|apple m/i.test(
        hardware?.gpu ?? "",
      ),
    [hardware],
  );
  const recommendLocal = Boolean(
    hardware &&
      (hardware.totalMemGB >= 23.5 ||
        (hardware.totalMemGB >= 15.5 && hasDedicatedGpu)),
  );

  if (!visible || !api) return null;
  const desktop = api;

  // The API route still installs Ollama for the matching model and the
  // humaniser; only the local writer model is left out.
  const plannedTasks = TASKS.filter(
    (task) =>
      !(route === "api" && task.id === "writer") &&
      !(task.id === "humanizer" && !includeHumanizer),
  );
  const plannedIds = new Set(plannedTasks.map((task) => task.id));

  const activePreset =
    API_PRESETS.find((entry) => entry.value === preset) ?? API_PRESETS[0];

  function choosePreset(value: string) {
    const next = API_PRESETS.find((entry) => entry.value === value);
    if (!next) return;
    setPreset(next.value);
    if (next.value !== "custom") {
      setBaseUrl(next.baseUrl);
      setModel(next.model);
    }
    setKeyError("");
  }

  async function finish(mode: SetupMode, href?: string) {
    await desktop.completeSetup?.(mode).catch(() => undefined);
    setVisible(false);
    if (href) router.push(href);
    else router.refresh();
  }

  function setTask(id: TaskId, state: TaskState) {
    setTasks((current) => ({ ...current, [id]: state }));
  }

  async function installEverything() {
    setInstalling(true);
    setInstallError("");
    setManualOllama(false);
    setTaskDetail(null);

    const stopPull = desktop.onOllamaProgress((event) => {
      const id: TaskId =
        MODEL_TASKS.find((task) => task.model === event.model)?.id ?? "writer";
      setTaskDetail({
        id,
        text:
          event.percent != null ? `${event.percent}%` : event.status || event.line,
        percent: event.percent ?? null,
      });
    });
    const stopInstall = desktop.onInstallProgress?.((event) => {
      setTaskDetail({
        id: "install",
        text:
          event.stage === "download"
            ? event.totalMB
              ? `${event.receivedMB ?? 0} / ${event.totalMB} MB`
              : "downloading…"
            : event.stage === "verify"
              ? "checking signature…"
              : "installing…",
        percent: event.stage === "download" ? event.percent : null,
      });
    });

    let current: TaskId = "install";
    const fail = (message: string) => {
      setTask(current, "error");
      setInstallError(message);
    };

    try {
      let status = await desktop.checkOllama();

      // 1. Ollama itself
      current = "install";
      if (status.installed) {
        setTask("install", "skipped");
      } else if (!status.canInstall || !desktop.installOllama) {
        setManualOllama(true);
        fail("Install Ollama from ollama.com, then press Retry.");
        return;
      } else {
        setTask("install", "running");
        const result = await desktop.installOllama();
        if (!result.ok) {
          setManualOllama(true);
          fail(result.message);
          return;
        }
        setTask("install", "done");
      }

      // 2. Its background server
      current = "start";
      if (status.running) {
        setTask("start", "skipped");
      } else {
        setTask("start", "running");
        const result = desktop.startOllama
          ? await desktop.startOllama()
          : { ok: false, message: "Open Ollama from the Start menu, then press Retry." };
        if (!result.ok) {
          fail(result.message);
          return;
        }
        setTask("start", "done");
      }
      status = await desktop.checkOllama();

      // 3+. The models this route needs
      for (const { id, model: name } of MODEL_TASKS) {
        if (!plannedIds.has(id)) continue;
        current = id;
        if (hasModel(status.models, name)) {
          setTask(id, "skipped");
          continue;
        }
        setTask(id, "running");
        setTaskDetail({ id, text: "starting…", percent: null });
        const result = await desktop.pullModel(name);
        if (!result.ok) {
          fail(result.message);
          return;
        }
        setTask(id, "done");
      }

      await patchSettings({
        ...(route === "api"
          ? {}
          : { writer: { mode: "local", baseUrl: OLLAMA_V1, model: LOCAL_MODEL } }),
        embedding: { baseUrl: OLLAMA_V1, model: EMBEDDING_MODEL },
        ...(plannedIds.has("humanizer")
          ? {
              baseline: {
                enabled: true,
                label: "HF Humaniser 12B",
                baseUrl: OLLAMA_V1,
                model: HUMANIZER_MODEL,
                apiKey: "",
                temperature: 1,
                disableThinking: false,
                promptFormat: "humanizer",
              },
            }
          : {}),
      });
      setStep(route === "api" ? "done" : "key");
    } catch (error) {
      fail(error instanceof Error ? error.message : "Setup stopped.");
    } finally {
      stopPull();
      stopInstall?.();
      setTaskDetail(null);
      setInstalling(false);
    }
  }

  async function saveKey() {
    setKeyError("");
    if (!apiKey.trim()) {
      setKeyError("Paste your API key first.");
      return;
    }
    if (!baseUrl.trim() || !model.trim()) {
      setKeyError("Add the endpoint URL and model name.");
      return;
    }
    setSavingKey(true);
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        details?: { hint?: string };
      };
      if (!response.ok) {
        throw new Error(
          `${data.error ?? "The provider did not accept that key."}${data.details?.hint ? ` ${data.details.hint}` : ""}`,
        );
      }
      await patchSettings({
        writer: {
          ...(route === "api" ? { mode: "api" } : {}),
          api: {
            label: preset === "custom" ? "Cloud API" : activePreset.label,
            baseUrl: baseUrl.trim(),
            model: model.trim(),
            apiKey: apiKey.trim(),
          },
        },
      });
      setKeySaved(true);
      setApiKey("");
      setStep(route === "api" ? "local" : "done");
    } catch (error) {
      setKeyError(
        error instanceof Error ? error.message : "Could not check the key.",
      );
    } finally {
      setSavingKey(false);
    }
  }

  const anyTaskStarted = plannedTasks.some((task) => tasks[task.id] !== "pending");

  return (
    <Card className="card-shadow overflow-hidden border-accent/20 p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Welcome to Maya</p>
          <h2 className="mt-1 font-serif text-[25px] leading-tight">
            {step === "welcome" && "Let's get you set up."}
            {step === "local" &&
              (route === "api"
                ? "Download the local helpers."
                : "Install everything in one click.")}
            {step === "key" &&
              (route === "api" ? "Add your API key." : "Add an API key too?")}
            {step === "done" && "You're ready."}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Skip setup"
          title="Skip setup (you can run it again from Settings)"
          disabled={installing}
          onClick={() => void finish("skipped")}
          className="grid h-8 w-8 place-items-center rounded-full text-faint transition hover:bg-paper hover:text-ink disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <StepDots step={step} route={route} />
      </div>

      {step === "welcome" && (
        <>
          <p className="mt-4 max-w-2xl text-[12px] leading-5 text-muted">
            Maya needs an AI model to rewrite your drafts. Pick where it runs.
            Your writing samples and history always stay on this computer.
          </p>

          {hardware && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper/40 px-3.5 py-2.5">
              <HardDrive className="h-3.5 w-3.5 text-faint" />
              <span className="text-[11.5px] font-medium text-ink-soft">
                {hardware.totalMemGB} GB RAM
              </span>
              <span className="text-faint">·</span>
              <span className="text-[11.5px] text-muted">
                {hardware.gpu || "graphics not detected"}
              </span>
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(
              [
                {
                  id: "local",
                  icon: Cpu,
                  title: "Run on this computer",
                  body: "Free and fully private. One click installs Ollama, the writer, the matching model and the humaniser (about 15 GB). Best with 16 GB+ RAM and a graphics card.",
                  recommended: recommendLocal,
                },
                {
                  id: "api",
                  icon: Cloud,
                  title: "Use a cloud API key",
                  body: "Fast on any computer. Paste a key from OpenAI, OpenRouter, DeepSeek or Groq; drafts are sent to that provider. Maya then installs the small local helpers and the humaniser.",
                  recommended: !recommendLocal,
                },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setRoute(option.id);
                  setStep(option.id === "local" ? "local" : "key");
                }}
                className={cn(
                  "group rounded-2xl border bg-surface p-4 text-left transition hover:border-accent/60 hover:shadow-sm",
                  option.recommended ? "border-accent/40" : "border-line",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-accent">
                    <option.icon className="h-4 w-4" />
                  </span>
                  <span className="text-[13.5px] font-medium text-ink">
                    {option.title}
                  </span>
                  {option.recommended && (
                    <Badge tone="moss" className="ml-auto">
                      Recommended
                    </Badge>
                  )}
                </div>
                <p className="mt-2.5 text-[11.5px] leading-5 text-muted">
                  {option.body}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent">
                  Choose <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "local" && (
        <div className="mt-4">
          <p className="max-w-2xl text-[12px] leading-5 text-muted">
            {route === "api"
              ? "Your key is saved. Rewrites use the cloud, but Maya still uses Ollama on this computer for the matching model (it finds which of your samples fit a draft) and for the humaniser you can compare against in Lab."
              : "Maya will install and download everything below."}{" "}
            Keep the app open and stay connected; on a typical connection
            this takes {includeHumanizer ? "20–45" : "10–30"} minutes. Steps
            that are already done are skipped.
          </p>
          <label
            className={cn(
              "mt-3 flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[11.5px] leading-5",
              anyTaskStarted && "opacity-60",
            )}
          >
            <input
              type="checkbox"
              className="mt-1 accent-[var(--color-accent)]"
              checked={includeHumanizer}
              disabled={installing || anyTaskStarted}
              onChange={(event) => setIncludeHumanizer(event.target.checked)}
            />
            <span className="text-muted">
              <span className="font-medium text-ink-soft">
                Include the humaniser (7.6 GB)
              </span>{" "}
              — a 12B model you can compare against in Lab.
              {hardware && hardware.totalMemGB < 15.5
                ? ` It needs about 10 GB of free memory; this PC has ${hardware.totalMemGB} GB, so it may be slow.`
                : " It needs about 10 GB of free memory to run."}
            </span>
          </label>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-paper/35 px-4">
            {plannedTasks.map((task) => (
              <TaskRow
                key={task.id}
                label={task.label}
                size={task.size}
                state={tasks[task.id]}
                detail={taskDetail?.id === task.id ? taskDetail.text : undefined}
                percent={
                  taskDetail?.id === task.id ? taskDetail.percent : undefined
                }
              />
            ))}
          </ul>

          {installError && (
            <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-[11.5px] leading-5 text-danger">
              {installError}
              {manualOllama && (
                <a
                  href="https://ollama.com/download"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1.5 inline-flex items-center gap-1 font-medium underline"
                >
                  Get Ollama <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void installEverything()} loading={installing}>
              {installError ? (
                <>
                  <RotateCcw className="h-3.5 w-3.5" /> Retry
                </>
              ) : anyTaskStarted ? (
                "Installing…"
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" /> Install everything
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              disabled={installing}
              onClick={() => {
                setStep(route === "api" ? "key" : "welcome");
                setInstallError("");
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            {route === "api" && (
              <Button
                variant="ghost"
                disabled={installing}
                onClick={() => setStep("done")}
              >
                Skip for now
              </Button>
            )}
            {installError && route === "local" && (
              <Button
                variant="secondary"
                disabled={installing}
                onClick={() => {
                  setRoute("api");
                  setStep("key");
                }}
              >
                Use an API key instead
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "key" && (
        <div className="mt-4">
          <p className="max-w-2xl text-[12px] leading-5 text-muted">
            {route === "api"
              ? "Maya will send drafts to this provider for rewriting. Your samples and history stay on this computer."
              : "Local models are ready. Optionally add a cloud key as a faster backup — Maya keeps using the local model until you switch in Settings → Writer."}
          </p>

          <ol className="mt-3 space-y-1 text-[11.5px] leading-5 text-muted">
            <li>
              <span className="font-medium text-ink-soft">1.</span> Pick a
              provider below.
            </li>
            <li>
              <span className="font-medium text-ink-soft">2.</span>{" "}
              {activePreset.keyUrl ? (
                <a
                  href={activePreset.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-accent underline"
                >
                  Get your {activePreset.label} key
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                "Get a key from your provider"
              )}{" "}
              (sign in, add billing if asked, then copy the key).
            </li>
            <li>
              <span className="font-medium text-ink-soft">3.</span> Paste it
              here and press <strong>Test and save</strong>.
            </li>
          </ol>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Provider" htmlFor="setup-provider">
              <Select
                id="setup-provider"
                value={preset}
                onChange={(event) => choosePreset(event.target.value)}
              >
                {API_PRESETS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Model"
              htmlFor="setup-model"
              hint="The default works; change it only if you know you want another."
            >
              <Input
                id="setup-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </Field>
            {preset === "custom" && (
              <Field
                label="Endpoint URL"
                htmlFor="setup-base"
                hint="Any OpenAI-compatible /v1 endpoint."
                className="sm:col-span-2"
              >
                <Input
                  id="setup-base"
                  value={baseUrl}
                  placeholder="https://example.com/v1"
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </Field>
            )}
            <Field
              label="API key"
              htmlFor="setup-key"
              hint="Stored only in Maya's database on this computer."
              error={keyError || undefined}
              className="sm:col-span-2"
            >
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                <Input
                  id="setup-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-…"
                  value={apiKey}
                  className="pl-8"
                  onChange={(event) => setApiKey(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveKey();
                  }}
                />
              </div>
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void saveKey()} loading={savingKey}>
              Test and save
            </Button>
            {route === "api" ? (
              <Button
                variant="ghost"
                disabled={savingKey}
                onClick={() => setStep("welcome")}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
            ) : (
              <Button
                variant="ghost"
                disabled={savingKey}
                onClick={() => setStep("done")}
              >
                Skip for now
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-moss">
            <Check className="h-3.5 w-3.5" />
            {route === "api"
              ? `Connected to ${activePreset.label}.`
              : keySaved
                ? "Local models are ready, and your API key is saved as a backup."
                : "Local models are ready."}
          </p>
          {tasks.humanizer === "done" || tasks.humanizer === "skipped" ? (
            <p className="mt-1 text-[11.5px] leading-5 text-muted">
              The humaniser is installed and switched on as the comparison in
              Lab.
            </p>
          ) : route === "api" && tasks.embed === "pending" ? (
            <p className="mt-1 text-[11.5px] leading-5 text-muted">
              Local helpers were skipped. Run setup again from Settings to
              install them later.
            </p>
          ) : null}
          <p className="mt-3 text-[12px] font-medium text-ink-soft">
            Three steps to your first rewrite:
          </p>
          <ol className="mt-2 grid gap-2 sm:grid-cols-3">
            {[
              {
                title: "Add your writing",
                body: "Paste or import 10–20 things you wrote: messages, emails, a paragraph from an essay.",
              },
              {
                title: "Build your voice",
                body: "On the Voice page, press Refresh profile. Maya measures your rhythm and habits.",
              },
              {
                title: "Rewrite a draft",
                body: "Open Write, paste a draft, and press Rewrite in my voice.",
              },
            ].map((item, index) => (
              <li
                key={item.title}
                className="rounded-xl border border-line bg-paper/35 p-3"
              >
                <p className="text-[11px] font-semibold text-accent">
                  Step {index + 1}
                </p>
                <p className="mt-0.5 text-[12.5px] font-medium text-ink">
                  {item.title}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => void finish(route ?? "skipped", "/voice?import=1")}
            >
              Add your writing <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="secondary" onClick={() => void finish(route ?? "skipped")}>
              Finish
            </Button>
          </div>
        </div>
      )}

      <p className="mt-4 text-[10.5px] text-faint">
        You can change any of this later in Settings → Writer.
      </p>
    </Card>
  );
}

/** Settings shortcut that reopens the first-run wizard in the desktop app. */
export function RerunSetupButton() {
  const router = useRouter();
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    setDesktop(Boolean(window.mayaDesktop?.resetSetup));
  }, []);
  if (!desktop) return null;
  return (
    <Link
      href="/?setup=1"
      onClick={(event) => {
        event.preventDefault();
        void window.mayaDesktop
          ?.resetSetup?.()
          .finally(() => router.push("/?setup=1"));
      }}
      className={buttonStyles({ variant: "secondary", size: "sm" })}
    >
      <RotateCcw className="h-3.5 w-3.5" /> Run setup again
    </Link>
  );
}
