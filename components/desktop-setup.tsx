"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  HardDrive,
  Monitor,
  RefreshCw,
  X,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { buttonStyles } from "@/lib/ui";

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
  models: string[];
  error?: string;
}

interface PullResult {
  ok: boolean;
  message: string;
}

interface MayaDesktopAPI {
  isDesktop: true;
  hardware: () => Promise<HardwareInfo>;
  checkOllama: () => Promise<OllamaStatus>;
  pullModel: (model: string) => Promise<PullResult>;
  onOllamaProgress: (
    callback: (event: { model: string; line: string }) => void,
  ) => () => void;
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

function hasModel(status: OllamaStatus, model: string): boolean {
  return status.models.some(
    (candidate) => candidate === model || candidate.startsWith(`${model}:`),
  );
}

function parseProgress(line: string): string {
  const clean = line
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\r/g, "")
    .trim();
  const matches = [...clean.matchAll(/(\d{1,3})%/g)];
  const last = matches.at(-1);
  return last ? `${last[1]}%` : clean.slice(-120);
}

export function DesktopSetup({ samples }: { samples: number }) {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [phase, setPhase] = useState<"choose" | "local" | "ready" | "api">(
    "choose",
  );
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (samples > 0 || !window.mayaDesktop) return;
    let alive = true;
    window.mayaDesktop
      .hardware()
      .then((info) => {
        if (alive) setHardware(info);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [samples]);

  const hasDedicatedGpu = useMemo(() => {
    if (!hardware) return false;
    return /nvidia|geforce|rtx|gtx|radeon|rx |arc a|apple m/i.test(
      hardware.gpu,
    );
  }, [hardware]);

  const recommendLocal = Boolean(
    hardware &&
      (hardware.totalMemGB >= 23.5 ||
        (hardware.totalMemGB >= 15.5 && hasDedicatedGpu)),
  );

  if (samples > 0 || !hardware || hidden) return null;

  const bothModels = status
    ? hasModel(status, LOCAL_MODEL) && hasModel(status, EMBEDDING_MODEL)
    : false;
  const percent = progress.match(/(\d{1,3})%/) ? parseInt(progress, 10) : null;

  async function checkLocal() {
    if (!window.mayaDesktop) return;
    setPhase("local");
    setBusy(true);
    setMessage("");
    try {
      const next = await window.mayaDesktop.checkOllama();
      setStatus(next);
      if (hasModel(next, LOCAL_MODEL) && hasModel(next, EMBEDDING_MODEL)) {
        setPhase("ready");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not check Ollama.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadLocal() {
    if (!window.mayaDesktop) return;
    setBusy(true);
    setMessage("");
    setProgress("");
    const unsubscribe = window.mayaDesktop.onOllamaProgress(({ line }) => {
      setProgress(parseProgress(line));
    });

    try {
      const first = await window.mayaDesktop.pullModel(LOCAL_MODEL);
      if (!first.ok) {
        setMessage(first.message);
        return;
      }
      const second = await window.mayaDesktop.pullModel(EMBEDDING_MODEL);
      if (!second.ok) {
        setMessage(second.message);
        return;
      }
      const next = await window.mayaDesktop.checkOllama();
      setStatus(next);
      if (hasModel(next, LOCAL_MODEL) && hasModel(next, EMBEDDING_MODEL)) {
        setPhase("ready");
        setMessage("Local models are ready.");
      } else {
        setMessage(
          "The download finished, but Ollama has not listed the models yet. Check again in a moment.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The download failed.",
      );
    } finally {
      unsubscribe();
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <Card className="card-shadow overflow-hidden border-accent/20 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <Monitor className="h-4 w-4" />
          </div>
          <div>
            <p className="eyebrow">Desktop setup</p>
            <h2 className="mt-1 font-serif text-[23px]">
              Let&apos;s choose the right engine.
            </h2>
            <p className="mt-1 max-w-xl text-[11.5px] leading-5 text-muted">
              Maya can run on this machine or use a cloud API. Your writing
              stays local either way; only the model endpoint changes.
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss setup"
          onClick={() => setHidden(true)}
          className="grid h-8 w-8 place-items-center rounded-full text-faint transition hover:bg-paper hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper/40 px-3.5 py-2.5">
        <HardDrive className="h-3.5 w-3.5 text-faint" />
        <span className="text-[11.5px] font-medium text-ink-soft">
          {hardware.totalMemGB} GB RAM
        </span>
        <span className="text-faint">·</span>
        <span className="text-[11.5px] text-muted">
          {hardware.gpu || "graphics not detected"}
        </span>
        <Badge
          tone={recommendLocal ? "moss" : "amber"}
          className="ml-auto"
        >
          {recommendLocal ? "Local recommended" : "API recommended"}
        </Badge>
      </div>

      <p className="mt-3 text-[11.5px] leading-5 text-muted">
        {recommendLocal
          ? `This machine can run ${LOCAL_MODEL} locally (about 6.6 GB) plus ${EMBEDDING_MODEL} for retrieval.`
          : "This machine has limited memory or integrated graphics. A cloud API will be faster; the small local embeddings model can still stay here."}
      </p>

      {phase === "choose" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void checkLocal()}>
            {recommendLocal ? "Set up local models" : "Try local anyway"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="secondary" onClick={() => setPhase("api")}>
            {recommendLocal ? "Use an API instead" : "Open API setup"}
          </Button>
        </div>
      )}

      {(phase === "local" || phase === "ready") && (
        <div className="mt-4 rounded-xl border border-line bg-paper/35 p-4">
          {busy && !status ? (
            <p className="flex items-center gap-2 text-[11.5px] text-muted">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Checking Ollama…
            </p>
          ) : status && !status.installed ? (
            <div>
              <p className="text-[11.5px] leading-5 text-muted">
                Ollama is not installed. Install it once, then come back here.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="https://ollama.com/download"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[12px] font-medium text-ink transition hover:bg-surface-2"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Ollama
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void checkLocal()}
                >
                  Check again
                </Button>
              </div>
            </div>
          ) : status && !status.running ? (
            <div>
              <p className="text-[11.5px] leading-5 text-muted">
                Ollama is installed, but its local server is not running. Open
                Ollama from the Start menu, then check again.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => void checkLocal()}
              >
                Check again
              </Button>
            </div>
          ) : status && !bothModels ? (
            <div>
              <p className="text-[11.5px] leading-5 text-muted">
                Ollama is running. Download the two local models now:
                {" "}
                <span className="text-ink-soft">
                  {LOCAL_MODEL} + {EMBEDDING_MODEL}
                </span>
                . About 6.7 GB total.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void downloadLocal()}
                  loading={busy}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download models
                </Button>
                {progress && (
                  <span className="text-[10.5px] text-faint">{progress}</span>
                )}
              </div>
              {percent !== null && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-paper">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                  />
                </div>
              )}
            </div>
          ) : bothModels ? (
            <div>
              <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-moss">
                <Check className="h-3.5 w-3.5" />
                Local models are ready.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/voice?import=1"
                  className={buttonStyles({ size: "sm" })}
                >
                  Add your writing
                </Link>
                <Link
                  href="/write"
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Open Write
                </Link>
              </div>
            </div>
          ) : null}

          {message && (
            <p className="mt-2 text-[10.5px] leading-5 text-muted">{message}</p>
          )}
        </div>
      )}

      {phase === "api" && (
        <div className="mt-4 rounded-xl border border-line bg-paper/35 p-4">
          <p className="text-[11.5px] leading-5 text-muted">
            Open Settings, choose <strong>Cloud API</strong>, pick a provider
            preset, add the key, and test the connection. Keep embeddings on the
            local Ollama model if you have it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/settings?writer=api"
              className={buttonStyles({ size: "sm" })}
            >
              Open API settings
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPhase("choose")}
            >
              Back
            </Button>
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] text-faint">
        You can change this later in Settings. The local model is optional; the
        app still works with a cloud API.
      </p>
    </Card>
  );
}
