"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Wand2,
  X,
} from "lucide-react";
import { ChecksPanel, scoreTone } from "@/components/checks-panel";
import { Diff } from "@/components/diff";
import {
  Badge,
  Button,
  Card,
  Field,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import type {
  Audience,
  Checks,
  ExamplePreview,
  Genre,
  Intent,
  LengthMode,
  Profile,
  Rewrite,
} from "@/lib/types";
import {
  AUDIENCES,
  GENRES,
  INTENTS,
  LENGTH_MODES,
} from "@/lib/types";
import {
  AUDIENCE_UI,
  GENRE_LABELS,
  INTENT_LABELS,
  LENGTH_LABELS,
  cn,
  countWords,
} from "@/lib/utils";

type StreamEvent =
  | { type: "stage"; stage: string }
  | { type: "warning"; message: string }
  | { type: "examples"; examples: ExamplePreview[] }
  | { type: "start"; id: string }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; rewrite: Rewrite }
  | { type: "error"; message: string; hint?: string };

const STAGE_LABELS: Record<string, string> = {
  retrieving: "Reading your voice",
  writing: "Finding the words",
  checking: "Checking the facts",
  auditing: "Auditing the details",
  polishing: "Tightening the voice",
  tightening: "Tightening the last lines",
  repairing: "Keeping the details",
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? "Getting ready";
}

export function WriteWorkspace({
  initialProfile,
  sampleCount,
  personName,
}: {
  initialProfile: Profile | null;
  sampleCount: number;
  personName: string;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [genre, setGenre] = useState<Genre>("message");
  const [audience, setAudience] = useState<Audience>("friend");
  const [lengthMode, setLengthMode] = useState<LengthMode>("same");
  const [intent, setIntent] = useState<Intent>("preserve");

  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [stage, setStage] = useState("");
  const [output, setOutput] = useState("");
  const [checks, setChecks] = useState<Checks | null>(null);
  const [examples, setExamples] = useState<ExamplePreview[]>([]);
  const [rewriteId, setRewriteId] = useState<string | null>(null);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  const [showDiff, setShowDiff] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const hasVoice = sampleCount > 0;
  const words = countWords(draft);
  const displayText = edited || output;

  useEffect(() => {
    const saved = window.localStorage.getItem("maya:draft");
    if (saved) setDraft(saved);
  }, []);

  useEffect(() => {
    if (draft) window.localStorage.setItem("maya:draft", draft);
    else window.localStorage.removeItem("maya:draft");
  }, [draft]);

  async function run() {
    const text = draft.trim();
    if (text.length < 10) {
      toast.push({
        title: "Add a draft first",
        description: "Paste at least a sentence.",
        tone: "error",
      });
      return;
    }
    if (status === "running") return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("running");
    setStage("retrieving");
    setOutput("");
    setChecks(null);
    setExamples([]);
    setRewriteId(null);
    setError("");
    setWarning("");
    setEdited("");
    setEditing(false);
    setRating(null);
    setFeedbackOpen(false);
    setFeedback("");
    setSavedFeedback(false);
    setShowDiff(false);
    setCopied(false);

    let completed = false;

    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: text,
          genre,
          audience,
          lengthMode,
          intent,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "The rewrite failed.");
      }
      if (!response.body) {
        throw new Error("The browser could not read the response stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");

          const line = chunk
            .split("\n")
            .find((candidate) => candidate.startsWith("data: "));
          if (!line) continue;

          const event = JSON.parse(line.slice(6)) as StreamEvent;
          if (event.type === "stage") {
            setStage(event.stage);
          } else if (event.type === "warning") {
            setWarning(event.message);
          } else if (event.type === "examples") {
            setExamples(event.examples);
          } else if (event.type === "start") {
            setRewriteId(event.id);
          } else if (event.type === "delta") {
            setOutput((current) => current + event.text);
          } else if (event.type === "replace") {
            setOutput(event.text);
          } else if (event.type === "done") {
            completed = true;
            setRewriteId(event.rewrite.id);
            setOutput(event.rewrite.output);
            setEdited(event.rewrite.edited ?? "");
            setChecks(event.rewrite.checks);
            setRating(event.rewrite.rating);
            setStatus("done");
            setStage("");
          } else if (event.type === "error") {
            throw new Error(
              `${event.message}${event.hint ? ` ${event.hint}` : ""}`,
            );
          }
        }
      }

      if (!completed && !controller.signal.aborted) {
        throw new Error("The stream ended before the rewrite finished.");
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        setStatus("idle");
        setStage("");
        return;
      }
      setError(
        caught instanceof Error ? caught.message : "The rewrite failed.",
      );
      setStatus("error");
      setStage("");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStatus("idle");
    setStage("");
    setWarning("Stopped early. The partial text is still here.");
  }

  function clear() {
    abortRef.current?.abort();
    setDraft("");
    setOutput("");
    setChecks(null);
    setExamples([]);
    setRewriteId(null);
    setWarning("");
    setError("");
    setStatus("idle");
    setStage("");
    setEditing(false);
    setEdited("");
    setRating(null);
    setFeedbackOpen(false);
    setSavedFeedback(false);
    setShowDiff(false);
    window.localStorage.removeItem("maya:draft");
  }

  async function copy() {
    if (!displayText) return;
    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.push({
        title: "Could not copy",
        description: "Your browser blocked clipboard access.",
        tone: "error",
      });
    }
  }

  function download() {
    if (!displayText) return;
    const blob = new Blob([displayText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `maya-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveEdit() {
    if (!rewriteId) {
      setEditing(false);
      return;
    }
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/rewrites/${rewriteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited: edited.trim() || null }),
      });
      if (!response.ok) throw new Error("The edit was not saved.");
      setEditing(false);
      toast.push({ title: "Edit saved", tone: "success" });
    } catch (caught) {
      toast.push({
        title: "Could not save the edit",
        description:
          caught instanceof Error ? caught.message : "Try again in a moment.",
        tone: "error",
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function rate(value: number) {
    setRating(value);
    if (value === -1) setFeedbackOpen(true);
    if (value === 1) {
      setFeedbackOpen(false);
      toast.push({
        title: "Noted",
        description: "This helps tune future rewrites.",
        tone: "success",
      });
    }
    if (!rewriteId) return;
    try {
      await fetch(`/api/rewrites/${rewriteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: value }),
      });
    } catch {
      toast.push({
        title: "Rating not saved",
        description: "The rewrite is safe; only the rating failed.",
        tone: "error",
      });
    }
  }

  async function submitFeedback() {
    if (!rewriteId) return;
    try {
      const response = await fetch(`/api/rewrites/${rewriteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() || null }),
      });
      if (!response.ok) throw new Error("The note was not saved.");
      setSavedFeedback(true);
      setFeedbackOpen(false);
      toast.push({ title: "Note saved", tone: "success" });
    } catch (caught) {
      toast.push({
        title: "Could not save the note",
        description:
          caught instanceof Error ? caught.message : "Try again in a moment.",
        tone: "error",
      });
    }
  }

  const profileNote =
    sampleCount === 0 ? (
      <>
        No samples yet. This will be a generic edit.{" "}
        <Link
          href="/voice?import=1"
          className="underline decoration-line-strong underline-offset-2 transition hover:text-ink"
        >
          Add writing
        </Link>
        .
      </>
    ) : initialProfile ? (
      <>
        {initialProfile.sampleCount} samples · profile v{initialProfile.version}
        {initialProfile.status === "stats_only" ? " · measured only" : ""}
      </>
    ) : (
      <>{sampleCount} samples ready · the measured profile is built on first run</>
    );

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Writing room</p>
          <h1 className="display mt-2 text-[38px] sm:text-[46px]">Rewrite</h1>
          <p className="lede mt-2 max-w-2xl text-pretty">
            Paste a draft. {personName} matches your rhythm, keeps your facts,
            and shows what it changed.
          </p>
        </div>
        <div className="hidden items-center gap-2 pb-1 text-[10.5px] text-faint md:flex">
          <span className="kbd">⌘</span>
          <span className="kbd">↵</span>
          <span>to rewrite</span>
        </div>
      </header>

      <Card className="card-shadow overflow-hidden">
        <div className="grid lg:grid-cols-2">
          <div className="border-b border-line lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="eyebrow">Your draft</span>
                {hasVoice ? (
                  <Badge tone="moss">voice on</Badge>
                ) : (
                  <Badge tone="amber">no voice yet</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-[10.5px] text-faint">
                <span>{words} words</span>
                {draft && (
                  <button
                    type="button"
                    onClick={clear}
                    className="transition hover:text-ink"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void run();
                }
              }}
              placeholder="Paste the draft you want to sound like you. An email, a caption, a paragraph that came out flat…"
              aria-label="Your draft"
              className="scroll-thin min-h-[330px] w-full resize-y bg-transparent px-5 py-5 text-[15px] leading-7 text-ink outline-none placeholder:text-faint/80 sm:min-h-[420px] sm:px-6"
            />

            <div className="border-t border-line px-5 py-4 sm:px-6">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Format">
                  <Select
                    aria-label="Format"
                    value={genre}
                    onChange={(event) =>
                      setGenre(event.target.value as Genre)
                    }
                  >
                    {GENRES.map((value) => (
                      <option key={value} value={value}>
                        {GENRE_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="To">
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
                <Field label="Length">
                  <Select
                    aria-label="Length"
                    value={lengthMode}
                    onChange={(event) =>
                      setLengthMode(event.target.value as LengthMode)
                    }
                  >
                    {LENGTH_MODES.map((value) => (
                      <option key={value} value={value}>
                        {LENGTH_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Edit">
                  <Select
                    aria-label="Editing level"
                    value={intent}
                    onChange={(event) =>
                      setIntent(event.target.value as Intent)
                    }
                  >
                    {INTENTS.map((value) => (
                      <option key={value} value={value}>
                        {INTENT_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-[300px] text-[10.5px] leading-5 text-faint">
                  {profileNote}
                </p>
                {status === "running" ? (
                  <Button variant="secondary" onClick={stop}>
                    <Square className="h-3 w-3 fill-current" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    onClick={() => void run()}
                    disabled={draft.trim().length < 10}
                  >
                    {hasVoice ? (
                      <Wand2 className="h-4 w-4" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {hasVoice ? "Rewrite in my voice" : "Clean up draft"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex min-h-[520px] flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <div className="flex shrink-0 items-center gap-2">
                <span className="eyebrow whitespace-nowrap">In your voice</span>
                {checks && (
                  <Badge tone={scoreTone(checks.score)}>{checks.score}</Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {displayText && (
                  <Button variant="ghost" size="sm" onClick={() => void copy()}>
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
                {rewriteId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEvidenceOpen((current) => !current)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">What I used</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-1 flex-col px-5 py-5 sm:px-6">
              {warning && (
                <div className="mb-4 rounded-xl border border-amber/20 bg-amber-soft/60 px-3.5 py-2.5 text-[11px] leading-5 text-amber">
                  {warning}
                </div>
              )}

              {status === "error" && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-danger/20 bg-accent-soft/50 p-3.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-danger">
                      The rewrite stopped
                    </p>
                    <p className="mt-0.5 text-[11px] leading-5 text-muted">
                      {error}
                    </p>
                    <Link
                      href="/settings"
                      className="mt-1.5 inline-flex text-[10.5px] font-medium text-ink-soft underline decoration-line-strong underline-offset-2"
                    >
                      Open settings
                    </Link>
                  </div>
                </div>
              )}

              {!displayText && status !== "running" && status !== "error" && (
                <div className="flex flex-1 flex-col items-center justify-center px-3 py-12 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 font-serif text-[23px]">
                    {hasVoice ? "Your voice is loaded." : "A cleaner draft, without the fuss."}
                  </h2>
                  <p className="mt-2 max-w-xs text-[12px] leading-6 text-muted">
                    {hasVoice
                      ? `Matching against ${sampleCount} samples. Paste a draft and press rewrite.`
                      : "Add a few samples in Voice to match your rhythm. For now, this will be a careful generic edit."}
                  </p>
                  {initialProfile?.card?.headline && (
                    <p className="mt-4 line-clamp-2 rounded-full border border-line bg-paper/60 px-3.5 py-1.5 text-[10.5px] text-muted">
                      “{initialProfile.card.headline}”
                    </p>
                  )}
                </div>
              )}

              {!displayText && status === "running" && (
                <div className="flex flex-1 flex-col items-center justify-center px-3 py-12 text-center">
                  <div className="relative grid h-12 w-12 place-items-center">
                    <span className="absolute inset-0 rounded-full border border-accent/20" />
                    <span className="dot-pulse h-2 w-2 rounded-full bg-accent" />
                  </div>
                  <p className="mt-4 font-serif text-[19px]">
                    {stageLabel(stage)}
                  </p>
                  <p className="mt-1.5 text-[10.5px] text-faint">
                    Local models can take a moment on the first run.
                  </p>
                </div>
              )}

              {displayText && (
                <div className="flex flex-col">
                  {editing ? (
                    <>
                      <textarea
                        value={edited}
                        onChange={(event) => setEdited(event.target.value)}
                        aria-label="Edit the rewrite"
                        className="scroll-thin min-h-[300px] w-full flex-1 resize-y rounded-xl border border-line bg-paper/30 p-4 text-[15px] leading-7 outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10"
                      />
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEdited("");
                            setEditing(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          loading={savingEdit}
                          onClick={() => void saveEdit()}
                        >
                          Save edit
                        </Button>
                      </div>
                    </>
                  ) : showDiff ? (
                    <Diff before={draft} after={displayText} />
                  ) : (
                    <div className="prose-output flex-1">
                      {displayText}
                      {status === "running" && <span className="caret" />}
                    </div>
                  )}

                  {status === "running" && (
                    <p className="mt-4 flex items-center gap-2 text-[10.5px] text-faint">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {stageLabel(stage)}
                    </p>
                  )}
                </div>
              )}

              {checks && status !== "running" && (
                <div className="mt-5">
                  <ChecksPanel checks={checks} />
                </div>
              )}
            </div>

            {displayText && status !== "running" && (
              <div className="border-t border-line p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(false);
                        setShowDiff((current) => !current);
                      }}
                    >
                      {showDiff ? "Show text" : "Show changes"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEdited(displayText);
                        setEditing(true);
                        setShowDiff(false);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={download}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void run()}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Again
                    </Button>
                  </div>
                  <span className="text-[9.5px] uppercase tracking-[0.08em] text-faint">
                    {checks ? "Rule check, not a detector" : "Partial result"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                  <p className="text-[11px] text-muted">
                    Does this sound like {personName}?
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant={rating === 1 ? "soft" : "ghost"}
                      size="sm"
                      onClick={() => void rate(1)}
                      disabled={!rewriteId}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      Yes
                    </Button>
                    <Button
                      variant={rating === -1 ? "soft" : "ghost"}
                      size="sm"
                      onClick={() => void rate(-1)}
                      disabled={!rewriteId}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      Not quite
                    </Button>
                  </div>
                </div>

                {feedbackOpen && (
                  <div className="mt-3 rounded-xl border border-line bg-paper/40 p-3">
                    <Textarea
                      rows={3}
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      placeholder="What felt off? Too formal, wrong rhythm, a phrase you'd never use…"
                    />
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" onClick={() => void submitFeedback()}>
                        Save note
                      </Button>
                    </div>
                  </div>
                )}

                {savedFeedback && (
                  <p className="mt-2 text-[10.5px] text-moss">
                    Note saved. This pair will help future tuning.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {evidenceOpen && (
        <Card className="animate-rise p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Behind the rewrite</p>
              <h2 className="mt-1 font-serif text-[21px]">What I used</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEvidenceOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {examples.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {examples.map((example) => (
                <div
                  key={example.id}
                  className="rounded-xl border border-line bg-paper/40 p-3.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{GENRE_LABELS[example.genre]}</Badge>
                    <span className="text-[10px] text-faint">{example.reason}</span>
                  </div>
                  <p className="mt-2 line-clamp-4 text-[11.5px] leading-5 text-ink-soft">
                    {example.text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-line-strong/70 bg-paper/30 p-4 text-[11.5px] leading-5 text-muted">
              No reference samples were retrieved. The rewrite relied on the
              measured profile alone.
            </p>
          )}

          {initialProfile?.brief && (
            <div className="mt-4 rounded-xl border border-line bg-paper/40 p-4">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-faint">
                Measured habits
              </p>
              <p className="mt-2 text-[11.5px] leading-5 text-muted">
                {initialProfile.brief}
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
