"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Circle } from "lucide-react";
import { useHealth } from "@/components/health";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export function SetupChecklist({
  samples,
  hasProfile,
  rewrites,
}: {
  samples: number;
  hasProfile: boolean;
  rewrites: number;
}) {
  const { health } = useHealth();

  const steps = [
    {
      done: samples >= 5,
      title: "Add a few samples",
      detail:
        samples === 0
          ? "Ten messages and a couple of longer pieces is a good start."
          : `${samples} saved; five is the minimum.`,
      href: "/voice?import=1",
    },
    {
      done: hasProfile,
      title: "Build your voice profile",
      detail: hasProfile
        ? "Your measured profile is ready."
        : "Turn the samples into a readable style profile.",
      href: "/voice",
    },
    {
      done: health?.writer.ok === true,
      title: "Connect a model",
      detail:
        health?.writer.ok === true
          ? `${health.writer.mode === "api" ? "API" : "Local"} · ${health.writer.model || health.writer.label}`
          : health
            ? "Add a local or cloud OpenAI-compatible endpoint."
            : "Checking the connection…",
      href: "/settings",
    },
    {
      done: rewrites > 0,
      title: "Run your first rewrite",
      detail:
        rewrites > 0
          ? `${rewrites} ${rewrites === 1 ? "rewrite" : "rewrites"} saved.`
          : "Paste a draft and put your voice on it.",
      href: "/write",
    },
  ];

  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Get set up</p>
          <h2 className="mt-1 font-serif text-[21px]">Four small steps</h2>
        </div>
        <span className="text-[11px] font-medium text-muted">
          {done} of {steps.length}
        </span>
      </div>

      <div className="mt-4 h-1 overflow-hidden rounded-full bg-paper">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${(done / steps.length) * 100}%` }}
        />
      </div>

      <div className="mt-4 grid gap-1 sm:grid-cols-2">
        {steps.map((step) => (
          <Link
            key={step.title}
            href={step.href}
            className={cn(
              "group flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-paper/70",
              step.done && "opacity-65",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                step.done
                  ? "border-moss/20 bg-moss-soft text-moss"
                  : "border-line-strong text-faint",
              )}
            >
              {step.done ? (
                <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
              ) : (
                <Circle className="h-2 w-2" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-[12.5px] font-medium",
                  step.done ? "text-muted line-through" : "text-ink-soft",
                )}
              >
                {step.title}
              </span>
              <span className="mt-0.5 block text-[11px] leading-5 text-faint">
                {step.detail}
              </span>
            </span>
            {!step.done && (
              <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition group-hover:opacity-100" />
            )}
          </Link>
        ))}
      </div>
    </Card>
  );
}
