"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Copy,
  FlaskConical,
  RefreshCw,
  Search,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { ChecksPanel, scoreTone } from "@/components/checks-panel";
import { Diff } from "@/components/diff";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  useToast,
} from "@/components/ui";
import type { Rewrite } from "@/lib/types";
import {
  AUDIENCE_UI,
  GENRE_LABELS,
  formatDate,
  formatDateTime,
  truncate,
} from "@/lib/utils";

export function HistoryView({
  initialRewrites,
  initialTotal,
}: {
  initialRewrites: Rewrite[];
  initialTotal: number;
}) {
  const router = useRouter();
  const toast = useToast();

  const [rewrites, setRewrites] = useState(initialRewrites);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Rewrite | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailRating, setDetailRating] = useState<number | null>(null);

  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const response = await fetch(
            `/api/rewrites?q=${encodeURIComponent(query.trim())}&limit=40`,
            { signal: controller.signal, cache: "no-store" },
          );
          const data = (await response.json().catch(() => ({}))) as {
            rewrites?: Rewrite[];
            total?: number;
            error?: string;
          };
          if (!response.ok) throw new Error(data.error ?? "Search failed.");
          setRewrites(data.rewrites ?? []);
          setTotal(data.total ?? 0);
        } catch (error) {
          if (!controller.signal.aborted) {
            toast.push({
              title: "Could not search history",
              description:
                error instanceof Error ? error.message : "Try again.",
              tone: "error",
            });
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, toast]);

  async function clearSearch() {
    setQuery("");
    setLoading(true);
    try {
      const response = await fetch("/api/rewrites?limit=40", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        rewrites: Rewrite[];
        total: number;
      };
      setRewrites(data.rewrites);
      setTotal(data.total);
    } catch {
      toast.push({ title: "Could not reload history", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(id: string) {
    setSelectedId(id);
    setSelected(null);
    setDetailLoading(true);
    setDeleteConfirm(false);
    try {
      const response = await fetch(`/api/rewrites/${id}`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as {
        rewrite?: Rewrite;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not open it.");
      if (data.rewrite) {
        setSelected(data.rewrite);
        setDetailRating(data.rewrite.rating);
      }
    } catch (error) {
      toast.push({
        title: "Could not open the rewrite",
        description: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedId(null);
    setSelected(null);
    setDeleteConfirm(false);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.push({ title: "Copied", tone: "success" });
    } catch {
      toast.push({ title: "Could not copy", tone: "error" });
    }
  }

  async function rate(value: number) {
    if (!selected) return;
    const next = detailRating === value ? null : value;
    setDetailRating(next);
    try {
      const response = await fetch(`/api/rewrites/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: next }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        rewrite?: Rewrite;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Rating failed.");
      if (data.rewrite) {
        setSelected(data.rewrite);
        setRewrites((current) =>
          current.map((item) =>
            item.id === data.rewrite?.id ? data.rewrite : item,
          ),
        );
      }
    } catch {
      toast.push({ title: "Rating not saved", tone: "error" });
    }
  }

  async function remove() {
    if (!selected) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/rewrites/${selected.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("The rewrite was not deleted.");
      setRewrites((current) =>
        current.filter((item) => item.id !== selected.id),
      );
      setTotal((current) => Math.max(0, current - 1));
      closeDetail();
      toast.push({ title: "Rewrite deleted", tone: "success" });
    } catch (error) {
      toast.push({
        title: "Could not delete the rewrite",
        description: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    } finally {
      setDeleting(false);
    }
  }

  async function addToLab() {
    if (!selected) return;
    try {
      const response = await fetch("/api/eval/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: truncate(selected.draft, 54),
          draft: selected.draft,
          genre: selected.genre,
          audience: selected.audience,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not create it.");
      toast.push({
        title: "Test case created",
        description: "Open the Lab to compare variants on this draft.",
        tone: "success",
      });
      router.push("/lab");
    } catch (error) {
      toast.push({
        title: "Could not create the test case",
        description: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    }
  }

  const resultText = selected?.edited || selected?.output || "";

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Saved work</p>
          <h1 className="display mt-2 text-[38px] sm:text-[46px]">History</h1>
          <p className="lede mt-2 max-w-xl">
            Every rewrite, the checks that came with it, and the ones you
            corrected by hand.
          </p>
        </div>
        <Link
          href="/write"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-[13px] font-medium text-surface transition hover:bg-accent-hover"
        >
          New rewrite <ArrowUpRight className="h-4 w-4" />
        </Link>
      </header>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Archive</p>
            <h2 className="mt-1 font-serif text-[21px]">
              {total} {total === 1 ? "rewrite" : "rewrites"}
            </h2>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search drafts and rewrites"
              aria-label="Search history"
              className="pl-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => void clearSearch()}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-faint hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14">
            <RefreshCw className="h-4 w-4 animate-spin text-faint" />
          </div>
        ) : rewrites.length === 0 ? (
          <EmptyState
            className="mt-5 py-12"
            title={query ? "No matches" : "Nothing saved yet"}
            body={
              query
                ? "Try a different word, or clear the search."
                : "Your first rewrite will show up here with its pattern check and your feedback."
            }
            action={
              !query ? (
                <Link href="/write">
                  <Button size="sm">Start writing</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="mt-3 divide-y divide-line">
            {rewrites.map((rewrite) => (
              <button
                key={rewrite.id}
                type="button"
                onClick={() => void openDetail(rewrite.id)}
                className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-4 text-left transition hover:opacity-80"
              >
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[12.5px] leading-6 text-ink-soft">
                    {rewrite.edited || rewrite.output || rewrite.draft}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] uppercase tracking-[0.07em] text-faint">
                    <span>{GENRE_LABELS[rewrite.genre]}</span>
                    <span>·</span>
                    <span>{AUDIENCE_UI[rewrite.audience]}</span>
                    <span>·</span>
                    <span>{formatDate(rewrite.createdAt)}</span>
                    {rewrite.edited && (
                      <>
                        <span>·</span>
                        <Badge tone="moss">edited</Badge>
                      </>
                    )}
                    {rewrite.status === "error" && (
                      <Badge tone="accent">failed</Badge>
                    )}
                    {rewrite.status === "cancelled" && (
                      <Badge tone="amber">stopped</Badge>
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {rewrite.checks && (
                    <Badge tone={scoreTone(rewrite.checks.score)}>
                      {rewrite.checks.score}
                    </Badge>
                  )}
                  {rewrite.rating === 1 && (
                    <ThumbsUp className="h-3.5 w-3.5 text-moss" />
                  )}
                  {rewrite.rating === -1 && (
                    <ThumbsDown className="h-3.5 w-3.5 text-accent" />
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(selectedId)}
        onClose={closeDetail}
        title="Rewrite"
        description={
          selected
            ? `${GENRE_LABELS[selected.genre]} · ${AUDIENCE_UI[selected.audience]} · ${formatDateTime(selected.createdAt)}`
            : undefined
        }
        wide
        footer={
          selected ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant={deleteConfirm ? "danger" : "ghost"}
                  size="sm"
                  loading={deleting}
                  onClick={() => {
                    if (deleteConfirm) void remove();
                    else setDeleteConfirm(true);
                  }}
                >
                  {deleteConfirm ? "Delete permanently" : "Delete"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void addToLab()}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  Add to Lab
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void copyText(resultText)}
                  disabled={!resultText}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
                <Button variant="secondary" size="sm" onClick={closeDetail}>
                  Close
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {detailLoading && !selected ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-4 w-4 animate-spin text-faint" />
          </div>
        ) : selected ? (
          <div className="space-y-4">
            {selected.error && (
              <div className="rounded-xl border border-danger/20 bg-accent-soft/50 p-3 text-[11px] leading-5 text-danger">
                {selected.error}
              </div>
            )}

            <div>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-faint">
                Draft
              </p>
              <div className="mt-1.5 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-paper/35 p-3.5 text-[11.5px] leading-6 text-muted scroll-thin">
                {selected.draft}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-faint">
                  In your voice
                </p>
                <div className="flex items-center gap-1.5">
                  {selected.edited && <Badge tone="moss">edited</Badge>}
                  {selected.checks && (
                    <Badge tone={scoreTone(selected.checks.score)}>
                      {selected.checks.score}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="mt-1.5 max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-surface p-4 text-[12.5px] leading-6 text-ink-soft scroll-thin">
                {resultText || "No output was saved."}
              </div>
            </div>

            {selected.edited && selected.edited !== selected.output && (
              <details className="rounded-xl border border-line bg-paper/35 p-3.5">
                <summary className="cursor-pointer text-[10.5px] font-medium text-muted [&::-webkit-details-marker]:hidden">
                  Compare with the first output
                </summary>
                <div className="mt-3">
                  <Diff before={selected.output} after={selected.edited} />
                </div>
              </details>
            )}

            {selected.checks && <ChecksPanel checks={selected.checks} />}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper/35 px-3 py-2.5">
              <p className="text-[11px] text-muted">Does this sound like you?</p>
              <div className="flex items-center gap-1">
                <Button
                  variant={detailRating === 1 ? "soft" : "ghost"}
                  size="sm"
                  onClick={() => void rate(1)}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Yes
                </Button>
                <Button
                  variant={detailRating === -1 ? "soft" : "ghost"}
                  size="sm"
                  onClick={() => void rate(-1)}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Not quite
                </Button>
              </div>
            </div>

            {selected.feedback && (
              <p className="rounded-xl border border-line bg-paper/35 px-3.5 py-2.5 text-[11px] leading-5 text-muted">
                Your note: {selected.feedback}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-[10px] text-muted sm:grid-cols-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-faint">
                  Model
                </p>
                <p className="mt-0.5 truncate">{selected.model ?? "—"}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-faint">
                  Latency
                </p>
                <p className="mt-0.5">
                  {selected.latencyMs
                    ? `${(selected.latencyMs / 1000).toFixed(1)}s`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-faint">
                  Examples
                </p>
                <p className="mt-0.5">{selected.exampleIds.length}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-faint">
                  Tokens
                </p>
                <p className="mt-0.5">
                  {selected.tokensIn || selected.tokensOut
                    ? `${selected.tokensIn ?? 0} in · ${selected.tokensOut ?? 0} out`
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="py-10 text-center text-[12px] text-muted">
            This rewrite could not be opened.
          </p>
        )}
      </Modal>
    </div>
  );
}
