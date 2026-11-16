"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FlaskConical,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { scoreTone } from "@/components/checks-panel";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import type {
  Audience,
  EvalCase,
  EvalRun,
  EvalVariant,
  Genre,
} from "@/lib/types";
import { AUDIENCES, EVAL_VARIANTS, GENRES } from "@/lib/types";
import {
  AUDIENCE_UI,
  GENRE_LABELS,
  VARIANT_LABELS,
  cn,
  formatDate,
  truncate,
} from "@/lib/utils";

function makeBatchId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `batch-${Date.now()}`;
}

function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-0.5" aria-label="Manual rating">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          aria-label={`${rating} out of 5`}
          aria-pressed={(value ?? 0) >= rating}
          onClick={() => onChange(value === rating ? null : rating)}
          className="p-0.5 text-line-strong transition hover:text-amber"
        >
          <Star
            className={cn(
              "h-3 w-3",
              (value ?? 0) >= rating && "fill-current text-amber",
            )}
          />
        </button>
      ))}
    </div>
  );
}

function RunCard({
  variant,
  run,
  onRate,
}: {
  variant: EvalVariant;
  run?: EvalRun;
  onRate: (run: EvalRun, value: number | null) => void;
}) {
  if (!run) {
    return (
      <div className="flex min-h-[150px] flex-col rounded-xl border border-dashed border-line-strong/70 bg-paper/25 p-3.5">
        <Badge tone="outline">{VARIANT_LABELS[variant]}</Badge>
        <p className="mt-3 text-[10.5px] text-faint">Not run yet.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[150px] flex-col rounded-xl border border-line bg-paper/25 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="neutral">{VARIANT_LABELS[variant]}</Badge>
        {run.checks && (
          <Badge tone={scoreTone(run.checks.score)}>{run.checks.score}</Badge>
        )}
      </div>

      {run.status === "error" ? (
        <p className="mt-3 text-[10.5px] leading-5 text-danger">
          {run.error ?? "The run failed."}
        </p>
      ) : (
        <div className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface/80 p-2.5 text-[11px] leading-5 text-ink-soft scroll-thin">
          {run.output}
        </div>
      )}

      {run.checks?.notes[0] && (
        <p className="mt-2 line-clamp-2 text-[9.5px] leading-4 text-faint">
          {run.checks.notes[0]}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span
          className="max-w-[110px] truncate text-[9px] uppercase tracking-[0.06em] text-faint"
          title={run.model ?? undefined}
        >
          {run.model ?? "—"}
        </span>
        <StarRating
          value={run.manualRating}
          onChange={(value) => onRate(run, value)}
        />
      </div>
    </div>
  );
}

export function LabView({
  initialCases,
  initialRuns,
  baselineEnabled,
  writerModel,
}: {
  initialCases: EvalCase[];
  initialRuns: EvalRun[];
  baselineEnabled: boolean;
  writerModel: string;
}) {
  const toast = useToast();
  const [cases, setCases] = useState(initialCases);
  const [runs, setRuns] = useState(initialRuns);
  const [createOpen, setCreateOpen] = useState(false);
  const [running, setRunning] = useState<Record<string, string | null>>({});
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [genre, setGenre] = useState<Genre>("message");
  const [audience, setAudience] = useState<Audience>("friend");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  const variants = useMemo<EvalVariant[]>(
    () =>
      baselineEnabled
        ? [...EVAL_VARIANTS]
        : EVAL_VARIANTS.filter((variant) => variant !== "baseline"),
    [baselineEnabled],
  );

  const latestByCase = useMemo(() => {
    const map = new Map<string, Map<EvalVariant, EvalRun>>();
    const sorted = [...runs].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    for (const run of sorted) {
      let caseMap = map.get(run.caseId);
      if (!caseMap) {
        caseMap = new Map();
        map.set(run.caseId, caseMap);
      }
      if (!caseMap.has(run.variant)) caseMap.set(run.variant, run);
    }
    return map;
  }, [runs]);

  function openCreate() {
    setName("");
    setDraft("");
    setGenre("message");
    setAudience("friend");
    setNotes("");
    setFormError("");
    setCreateOpen(true);
  }

  async function createCase() {
    if (draft.trim().length < 10) {
      setFormError("Paste a draft of at least 10 characters.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch("/api/eval/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          draft: draft.trim(),
          genre,
          audience,
          notes: notes.trim() || undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        case?: EvalCase;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "The test case was not created.");
      }
      if (data.case) setCases((current) => [data.case as EvalCase, ...current]);
      setCreateOpen(false);
      toast.push({ title: "Test case created", tone: "success" });
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "The case was not created.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function runRequest(
    caseId: string,
    variant: EvalVariant,
    batchId: string,
  ): Promise<EvalRun> {
    const response = await fetch("/api/eval/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId, variant, batchId }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      run?: EvalRun;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? "The run failed.");
    }
    if (!data.run) throw new Error("The run returned no result.");
    setRuns((current) => [data.run as EvalRun, ...current]);
    return data.run;
  }

  async function runOne(caseId: string, variant: EvalVariant) {
    if (running[caseId]) return;
    setRunning((current) => ({
      ...current,
      [caseId]: `Running ${VARIANT_LABELS[variant]}`,
    }));
    try {
      await runRequest(caseId, variant, makeBatchId());
    } catch (error) {
      toast.push({
        title: "The run stopped",
        description: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    } finally {
      setRunning((current) => ({ ...current, [caseId]: null }));
    }
  }

  async function runAll(caseId: string) {
    if (running[caseId]) return;
    const batchId = makeBatchId();

    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index];
      setRunning((current) => ({
        ...current,
        [caseId]: `${index + 1} of ${variants.length} · ${VARIANT_LABELS[variant]}`,
      }));
      try {
        await runRequest(caseId, variant, batchId);
      } catch (error) {
        toast.push({
          title: `${VARIANT_LABELS[variant]} stopped`,
          description: error instanceof Error ? error.message : "Try again.",
          tone: "error",
        });
      }
    }

    setRunning((current) => ({ ...current, [caseId]: null }));
  }

  async function removeCase(id: string) {
    if (deleteArmed !== id) {
      setDeleteArmed(id);
      return;
    }

    try {
      const response = await fetch(`/api/eval/cases/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("The test case was not deleted.");
      setCases((current) => current.filter((item) => item.id !== id));
      setRuns((current) => current.filter((run) => run.caseId !== id));
      setDeleteArmed(null);
      toast.push({ title: "Test case deleted", tone: "success" });
    } catch (error) {
      toast.push({
        title: "Could not delete the case",
        description: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    }
  }

  async function rateRun(run: EvalRun, value: number | null) {
    setRuns((current) =>
      current.map((item) =>
        item.id === run.id ? { ...item, manualRating: value } : item,
      ),
    );
    try {
      const response = await fetch(`/api/eval/runs/${run.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualRating: value }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        run?: EvalRun;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Rating failed.");
      if (data.run) {
        setRuns((current) =>
          current.map((item) =>
            item.id === data.run?.id ? (data.run as EvalRun) : item,
          ),
        );
      }
    } catch {
      setRuns((current) =>
        current.map((item) =>
          item.id === run.id
            ? { ...item, manualRating: run.manualRating }
            : item,
        ),
      );
      toast.push({ title: "Rating not saved", tone: "error" });
    }
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Evaluation</p>
          <h1 className="display mt-2 text-[38px] sm:text-[46px]">Lab</h1>
          <p className="lede mt-2 max-w-2xl text-pretty">
            Run the same draft through different pipelines. Read the outputs.
            Rate them yourself.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New test case
        </Button>
      </header>

      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <FlaskConical className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-serif text-[21px]">A fair comparison</h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-5 text-muted">
              The score is a rule-based pattern check. It is useful for catching
              dropped facts and AI habits, but the one-to-five rating is the
              signal that matters.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "Voice-matched",
              "Your profile, retrieved samples, and the polish pass.",
            ],
            ["Generic edit", "The same model with anti-slop rules, no samples."],
            ["Model alone", "A plain rewrite instruction, no scaffolding."],
            [
              "Baseline",
              baselineEnabled
                ? "Your optional second model, configured in Settings."
                : "Add a baseline model in Settings to unlock this.",
            ],
          ].map(([title, body]) => (
            <div
              key={title}
              className="rounded-xl border border-line bg-paper/30 p-3"
            >
              <p className="text-[10.5px] font-medium text-ink-soft">{title}</p>
              <p className="mt-1 text-[10px] leading-5 text-muted">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[9.5px] text-faint">
          Writer: {writerModel}
          {baselineEnabled ? "" : " · Baseline disabled"}
        </p>
      </Card>

      {cases.length === 0 ? (
        <EmptyState
          title="No test cases yet"
          body="Create a case with a draft and context, then compare the voice-matched rewrite against a generic edit and the raw model."
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                New test case
              </Button>
              <Link
                href="/history"
                className="text-[11px] text-muted underline decoration-line-strong underline-offset-2 hover:text-ink"
              >
                Or add one from history
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {cases.map((testCase) => {
            const caseRuns = latestByCase.get(testCase.id);
            const runningLabel = running[testCase.id];
            const isRunning = Boolean(runningLabel);

            return (
              <Card key={testCase.id} className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-serif text-[21px]">{testCase.name}</h2>
                      <Badge tone="neutral">
                        {GENRE_LABELS[testCase.genre]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[9.5px] uppercase tracking-[0.07em] text-faint">
                      {AUDIENCE_UI[testCase.audience]} ·{" "}
                      {formatDate(testCase.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => void runAll(testCase.id)}
                      loading={isRunning}
                      disabled={isRunning}
                    >
                      {!isRunning && <FlaskConical className="h-3.5 w-3.5" />}
                      Run all
                    </Button>
                    <Button
                      variant={deleteArmed === testCase.id ? "danger" : "ghost"}
                      size="sm"
                      onClick={() => void removeCase(testCase.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deleteArmed === testCase.id ? "Sure?" : ""}
                    </Button>
                  </div>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-[10.5px] font-medium text-muted [&::-webkit-details-marker]:hidden">
                    Read the draft
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-xl border border-line bg-paper/35 p-3.5 text-[11px] leading-5 text-muted">
                    {testCase.draft}
                  </p>
                </details>

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {variants.map((variant) => {
                    const disabled =
                      isRunning ||
                      (variant === "baseline" && !baselineEnabled);
                    return (
                      <Button
                        key={variant}
                        variant="secondary"
                        size="sm"
                        disabled={disabled}
                        title={
                          variant === "baseline" && !baselineEnabled
                            ? "Enable a baseline model in Settings."
                            : undefined
                        }
                        onClick={() => void runOne(testCase.id, variant)}
                      >
                        {VARIANT_LABELS[variant]}
                      </Button>
                    );
                  })}
                  {runningLabel && (
                    <span className="ml-1 flex items-center gap-1.5 text-[10px] text-accent">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      {runningLabel}
                    </span>
                  )}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {variants.map((variant) => (
                    <RunCard
                      key={variant}
                      variant={variant}
                      run={caseRuns?.get(variant)}
                      onRate={(run, value) => void rateRun(run, value)}
                    />
                  ))}
                </div>

                {testCase.notes && (
                  <p className="mt-3 border-t border-line pt-3 text-[10.5px] leading-5 text-faint">
                    Note: {truncate(testCase.notes, 240)}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New test case"
        description="A draft with enough context to judge whether the rewrite sounds right."
        wide
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" loading={saving} onClick={() => void createCase()}>
              Create case
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Name" hint="Optional. A short label for this test.">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. The launch note"
            />
          </Field>

          <Field label="Draft">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={7}
              placeholder="Paste the draft here…"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Format">
              <Select
                aria-label="Format"
                value={genre}
                onChange={(event) => setGenre(event.target.value as Genre)}
              >
                {GENRES.map((value) => (
                  <option key={value} value={value}>
                    {GENRE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Written to">
              <Select
                aria-label="Audience"
                value={audience}
                onChange={(event) =>
                  setAudience(event.target.value as Audience)
                }
              >
                {AUDIENCES.map((value) => (
                  <option key={value} value={value}>
                    {AUDIENCE_UI[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Notes" hint="What are you testing for?">
            <Input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional"
            />
          </Field>

          {formError && (
            <p className="rounded-lg bg-accent-soft/50 px-3 py-2 text-[11px] text-danger">
              {formError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
