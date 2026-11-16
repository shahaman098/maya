"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { HealthResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const FALLBACK: HealthResponse = {
  ok: false,
  version: "",
  samples: 0,
  profile: null,
  writer: {
    ok: false,
    mode: "local",
    label: "Local",
    model: "Model",
    models: [],
    error: "Maya's local API is not responding.",
  },
};

const HealthContext = createContext<{
  health: HealthResponse | null;
  loading: boolean;
  refresh: () => void;
}>({
  health: null,
  loading: true,
  refresh: () => undefined,
});

export function HealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!response.ok) throw new Error("Health check failed.");
        const data = (await response.json()) as HealthResponse;
        setHealth(data);
      } catch {
        setHealth((current) => current ?? FALLBACK);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return (
    <HealthContext.Provider value={{ health, loading, refresh }}>
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth() {
  return useContext(HealthContext);
}

export function ModelPill() {
  const { health, loading } = useHealth();
  const online = health?.writer.ok === true;
  const mode = health?.writer.mode === "api" ? "API" : "Local";
  const model = health?.writer.model || health?.writer.label || "Model";
  const label = health ? `${mode} · ${model}` : "Model";
  const error =
    health?.writer.error ??
    (loading ? "Checking the model connection." : "The model is offline.");

  return (
    <Link
      href="/settings"
      title={error}
      className="group inline-flex h-8 max-w-[210px] items-center gap-2 rounded-full border border-line bg-surface/80 px-2.5 text-[11px] text-muted transition hover:border-line-strong hover:bg-surface"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          online ? "bg-moss" : loading ? "bg-amber" : "bg-accent",
          !online && !loading && "dot-pulse",
        )}
      />
      <span className="truncate font-medium text-ink-soft">{label}</span>
      <span className="hidden shrink-0 text-faint sm:inline">
        {online ? "ready" : loading ? "checking" : "offline"}
      </span>
    </Link>
  );
}
