"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Check,
  ChevronRight,
  Fingerprint,
  Mail,
  MessageSquare,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { useHealth } from "@/components/health";
import { SampleImport } from "@/components/sample-import";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Segmented,
  useToast,
} from "@/components/ui";
import type {
  Modality,
  Profile,
  Sample,
  StyleStats,
  VoiceCard,
} from "@/lib/types";
import {
  AUDIENCE_UI,
  GENRE_LABELS,
  MODALITY_LABELS,
  cn,
  formatDate,
  formatNumber,
  pct,
} from "@/lib/utils";

type Counts = { all: number; message: number; longform: number };

function SampleGlyph({ genre }: { genre: string }) {
  const Icon =
    genre === "message" ? MessageSquare : genre === "email" ? Mail : BookOpen;
  return (
    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-paper text-faint">
      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="text-[11.5px] font-medium text-ink-soft">{value}</span>
    </div>
  );
}

function ReadCard({
  profile,
  modelOnline,
  refreshing,
  onRefresh,
}: {
  profile: Profile;
  modelOnline: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const card = profile.card;
  const sections: [string, string][] = card
    ? [
        ["Rhythm", card.rhythm],
        ["Diction", card.diction],
        ["Structure", card.structure],
        ["Punctuation", card.punctuation],
        ["Warmth", card.humour],
      ]
    : [];

  return (
    <Card className="p-5 sm:p-6 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">The read</p>
          <h2 className="mt-1 font-serif text-[22px]">How you write</h2>
        </div>
        <Badge tone={card ? "moss" : "amber"}>
          {card ? "Full read" : "Measured only"}
        </Badge>
      </div>

      {card ? (
        <>
          <p className="mt-5 max-w-3xl font-serif text-[27px] leading-[1.2] tracking-[-0.02em] text-balance">
            “{card.headline}”
          </p>
          <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {sections.map(([label, body]) => (
              <div key={label}>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">
                  {label}
                </p>
                <p className="mt-1.5 text-[12px] leading-6 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="mt-4 max-w-2xl font-serif text-[24px] leading-tight">
            The numbers are in. The written read is waiting for a model.
          </p>
          <p className="mt-2 max-w-2xl text-[12px] leading-6 text-muted">
            Maya can already match your measured habits. A model adds the
            qualitative read: how your sentences move, the words you reach for,
            and the quirks worth keeping.
          </p>
          <div className="mt-4 rounded-xl border border-line bg-paper/40 p-4">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-faint">
              Measured read
            </p>
            <p className="mt-2 text-[11.5px] leading-5 text-muted">
              {profile.brief}
            </p>
          </div>
          <div className="mt-4">
            {modelOnline ? (
              <Button size="sm" onClick={onRefresh} loading={refreshing}>
                <Sparkles className="h-3.5 w-3.5" />
                Generate the written read
              </Button>
            ) : (
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accent"
              >
                Connect a model in Settings
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </>
      )}

      <p className="mt-5 text-[10px] text-faint">
        Profile v{profile.version} · {profile.sampleCount} samples
        {profile.model ? ` · ${profile.model}` : ""}
      </p>
    </Card>
  );
}

function FingerprintCard({
  stats,
  tab,
}: {
  stats: StyleStats | null;
  tab: Modality;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Fingerprint</p>
          <h2 className="mt-1 font-serif text-[21px]">The numbers</h2>
        </div>
        <Badge tone="neutral">{MODALITY_LABELS[tab]}</Badge>
      </div>

      {!stats || stats.sampleCount === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line-strong/70 bg-paper/30 p-4 text-[11.5px] leading-5 text-muted">
          Not enough {tab === "message" ? "messages" : "long-form writing"} yet.
          Add a few more samples in this format.
        </p>
      ) : (
        <>
          <div className="mt-5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">
              Sentence length
            </p>
            <div className="mt-2 flex h-[82px] items-end gap-1.5">
              {stats.sentenceHistogram.map((bucket) => (
                <div
                  key={bucket.label}
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
                  title={`${pct(bucket.share)} of sentences`}
                >
                  <div
                    className="w-full rounded-t-[4px] bg-accent/25 transition group-hover:bg-accent/45"
                    style={{ height: `${Math.max(3, bucket.share * 64)}px` }}
                  />
                  <span className="text-[8px] text-faint">{bucket.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <StatRow
              label="Median sentence"
              value={`${stats.medianSentenceLength} words`}
            />
            <StatRow
              label="Contractions"
              value={`${stats.contractionsPer100Words} / 100 words`}
            />
            <StatRow
              label="Lowercase starts"
              value={pct(stats.lowercaseStartShare)}
            />
            <StatRow
              label="Em dashes"
              value={`${stats.punctuationPer1000Chars.emDashes} / 1k chars`}
            />
            <StatRow
              label="Emoji"
              value={`${stats.emojiPer100Words} / 100 words`}
            />
            <StatRow
              label="Questions"
              value={pct(stats.questionsShare)}
            />
          </div>
        </>
      )}
    </Card>
  );
}

function PhrasesCard({ stats }: { stats: StyleStats | null }) {
  return (
    <Card className="p-5 sm:p-6">
      <p className="eyebrow">Phrases</p>
      <h2 className="mt-1 font-serif text-[21px]">Words you reach for</h2>

      {stats && stats.favouritePhrases.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {stats.favouritePhrases.slice(0, 9).map((item) => (
            <span
              key={item.phrase}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper/60 px-2.5 py-1 text-[10.5px] text-ink-soft"
            >
              {item.phrase}
              <span className="text-[9px] text-faint">{item.count}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-[11.5px] leading-5 text-muted">
          Not enough repetition to pick out phrases yet.
        </p>
      )}

      {stats && stats.openings.length > 0 && (
        <div className="mt-5 border-t border-line pt-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">
            Openings
          </p>
          <p className="mt-1.5 text-[11.5px] text-muted">
            {stats.openings
              .slice(0, 3)
              .map((item) => `“${item.phrase}”`)
              .join(" · ")}
          </p>
        </div>
      )}

      {stats && stats.signoffs.length > 0 && (
        <div className="mt-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">
            Sign-offs
          </p>
          <p className="mt-1.5 text-[11.5px] text-muted">
            {stats.signoffs.slice(0, 3).join(" · ")}
          </p>
        </div>
      )}
    </Card>
  );
}

function KeepAvoidCard({ card }: { card: VoiceCard }) {
  return (
    <Card className="p-5 sm:p-6 lg:col-span-2">
      <p className="eyebrow">Calibration</p>
      <h2 className="mt-1 font-serif text-[21px]">Keep this. Never this.</h2>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-moss">
            <Check className="h-3 w-3" /> Preserve
          </p>
          <ul className="mt-2 space-y-2">
            {card.quirks.map((quirk) => (
              <li
                key={quirk}
                className="flex items-start gap-2 text-[11.5px] leading-5 text-muted"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-moss" />
                {quirk}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-accent">
            <Minus className="h-3 w-3" /> Avoid
          </p>
          <ul className="mt-2 space-y-2">
            {card.avoid.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-[11.5px] leading-5 text-muted"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/60" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function VoiceView({
  initialProfile,
  initialSamples,
  initialTotal,
  initialCounts,
  personName,
  autoImport,
}: {
  initialProfile: Profile | null;
  initialSamples: Sample[];
  initialTotal: number;
  initialCounts: Counts;
  personName: string;
  autoImport: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { health } = useHealth();

  const [profile, setProfile] = useState(initialProfile);
  const [tab, setTab] = useState<Modality>("all");
  const [samples, setSamples] = useState(initialSamples);
  const [total, setTotal] = useState(initialTotal);
  const [counts, setCounts] = useState(initialCounts);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(autoImport);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Sample | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const didMount = useRef(false);

  async function fetchSamples(
    offset: number,
    append: boolean,
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams({
      modality: tab,
      limit: "30",
      offset: String(offset),
    });
    if (query.trim()) params.set("q", query.trim());

    const response = await fetch(`/api/samples?${params.toString()}`, {
      cache: "no-store",
      signal,
    });
    const data = (await response.json().catch(() => ({}))) as {
      samples?: Sample[];
      total?: number;
      counts?: Counts;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? "Could not load your samples.");
    }
    setSamples((current) =>
      append ? [...current, ...(data.samples ?? [])] : (data.samples ?? []),
    );
    setTotal(data.total ?? 0);
    if (data.counts) setCounts(data.counts);
  }

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    const controller = new AbortController();
    const delay = query.trim() ? 250 : 0;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetchSamples(0, false, controller.signal)
        .catch((error) => {
          if (!controller.signal.aborted) {
            toast.push({
              title: "Could not load samples",
              description:
                error instanceof Error ? error.message : "Try again.",
              tone: "error",
            });
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, delay);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // The function reads tab/query from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      await fetchSamples(samples.length, true);
    } catch (error) {
      toast.push({
        title: "Could not load more",
        description: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    } finally {
      setLoadingMore(false);
    }
  }

  async function refreshProfile() {
    if (counts.all === 0) return;
    setRefreshing(true);
    try {
      const response = await fetch("/api/profile/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useModel: true }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        profile?: Profile;
        warning?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "The profile was not updated.");
      }
      if (data.profile) setProfile(data.profile);
      toast.push(
        data.warning
          ? {
              title: "Profile updated, with a note",
              description: data.warning,
            }
          : {
              title: "Voice profile updated",
              description: "The written read is ready.",
              tone: "success",
            },
      );
      router.refresh();
    } catch (error) {
      toast.push({
        title: "Could not refresh the profile",
        description: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function refreshLibrary() {
    router.refresh();
    const alreadyAll = tab === "all" && query.trim() === "";
    setQuery("");
    if (tab !== "all") setTab("all");
    if (alreadyAll) {
      void fetchSamples(0, false).catch(() => undefined);
    }
  }

  function closeImport() {
    setImportOpen(false);
    setAddOpen(false);
    if (autoImport) router.replace("/voice");
  }

  async function deleteSelected() {
    if (!selected) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/samples/${selected.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("The sample was not deleted.");

      const bucket: "message" | "longform" =
        selected.genre === "message" ? "message" : "longform";
      setSamples((current) =>
        current.filter((sample) => sample.id !== selected.id),
      );
      setTotal((current) => Math.max(0, current - 1));
      setCounts((current) => ({
        ...current,
        all: Math.max(0, current.all - 1),
        [bucket]: Math.max(0, current[bucket] - 1),
      }));
      setSelected(null);
      setDeleteConfirm(false);
      toast.push({ title: "Sample deleted", tone: "success" });
      router.refresh();
    } catch (error) {
      toast.push({
        title: "Could not delete the sample",
        description: error instanceof Error ? error.message : "Try again.",
        tone: "error",
      });
    } finally {
      setDeleting(false);
    }
  }

  const stats =
    tab === "message"
      ? profile?.stats.message
      : tab === "longform"
        ? profile?.stats.longform
        : profile?.stats.all;

  const stale = profile ? profile.sampleCount !== counts.all : false;
  const modelOnline = health?.writer.ok === true;

  const tabOptions: { value: Modality; label: string }[] = [
    { value: "all", label: `All ${counts.all}` },
    { value: "message", label: `Messages ${counts.message}` },
    { value: "longform", label: `Long-form ${counts.longform}` },
  ];

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Voice profile</p>
          <h1 className="display mt-2 text-[38px] sm:text-[46px]">
            {personName}&apos;s voice
          </h1>
          <p className="lede mt-2 max-w-2xl text-pretty">
            {profile
              ? `Measured from ${counts.all} samples. Built ${formatDate(profile.createdAt)}.`
              : `${counts.all} samples ready to become a profile. The mix of messages and longer writing is the point.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-0.5">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Button variant="secondary" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add one
          </Button>
          <Button
            onClick={() => void refreshProfile()}
            loading={refreshing}
            disabled={counts.all === 0}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh profile
          </Button>
        </div>
      </header>

      {counts.all === 0 ? (
        <>
          <Card className="p-8 sm:p-12">
            <div className="mx-auto max-w-xl text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent">
                <Fingerprint className="h-6 w-6" strokeWidth={1.6} />
              </div>
              <h2 className="mt-5 font-serif text-[30px] leading-tight">
                Your voice starts with your own words.
              </h2>
              <p className="mt-2 text-[12.5px] leading-6 text-muted">
                Ten messages and a couple of longer pieces is enough to hear the
                shape of it. Import a chat export, or paste a few things you
                have already written.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4" />
                  Import a chat
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add one sample
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                MessageSquare,
                "Start with messages",
                "The way you text is often the closest to your actual voice.",
              ],
              [
                BookOpen,
                "Add longer pieces",
                "Emails and essays show how you build an argument and land a point.",
              ],
              [
                ShieldCheck,
                "Keep it private",
                "Samples stay in a local file. Personal details are redacted on import.",
              ],
            ].map(([Icon, title, body]) => {
              const Component = Icon as typeof MessageSquare;
              return (
                <Card key={title as string} className="p-4">
                  <Component className="h-4 w-4 text-accent" />
                  <p className="mt-2 text-[12px] font-medium text-ink-soft">
                    {title as string}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-muted">
                    {body as string}
                  </p>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {stale && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber/20 bg-amber-soft/60 px-4 py-3">
              <p className="text-[11.5px] leading-5 text-amber">
                {Math.abs(counts.all - (profile?.sampleCount ?? 0))} sample
                {Math.abs(counts.all - (profile?.sampleCount ?? 0)) === 1
                  ? ""
                  : "s"}{" "}
                added since this profile was built. Refresh to include them.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void refreshProfile()}
                loading={refreshing}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          )}

          {profile ? (
            <section className="grid gap-4 lg:grid-cols-2">
              <ReadCard
                profile={profile}
                modelOnline={modelOnline}
                refreshing={refreshing}
                onRefresh={() => void refreshProfile()}
              />
              <FingerprintCard stats={stats ?? null} tab={tab} />
              <PhrasesCard stats={stats ?? null} />
              {profile.card && <KeepAvoidCard card={profile.card} />}
            </section>
          ) : (
            <Card className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
              <div>
                <p className="eyebrow">Next step</p>
                <h2 className="mt-1 font-serif text-[22px]">
                  Turn {counts.all} samples into a profile.
                </h2>
                <p className="mt-1 max-w-xl text-[11.5px] leading-5 text-muted">
                  This computes the measured profile immediately. With a model
                  connected, it also writes the qualitative read.
                </p>
              </div>
              <Button onClick={() => void refreshProfile()} loading={refreshing}>
                <Sparkles className="h-3.5 w-3.5" />
                Build profile
              </Button>
            </Card>
          )}
        </>
      )}

      {counts.all > 0 && (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Library</p>
              <h2 className="mt-1 font-serif text-[22px]">Your samples</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add one
              </Button>
              <Button size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-3.5 w-3.5" />
                Import
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your writing"
                className="pl-9"
                aria-label="Search samples"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-faint hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>
            <Segmented value={tab} onChange={setTab} options={tabOptions} />
          </div>

          {loading && samples.length === 0 ? (
            <div className="mt-6 flex items-center justify-center py-10">
              <RefreshCw className="h-4 w-4 animate-spin text-faint" />
            </div>
          ) : samples.length === 0 ? (
            <EmptyState
              className="mt-4 py-10"
              title="Nothing matches"
              body="Try a different search, or switch back to All writing."
            />
          ) : (
            <div className="mt-2 divide-y divide-line">
              {samples.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => {
                    setSelected(sample);
                    setDeleteConfirm(false);
                  }}
                  className="group flex w-full items-start gap-3 py-3.5 text-left transition hover:opacity-80"
                >
                  <SampleGlyph genre={sample.genre} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[12.5px] leading-6 text-ink-soft">
                      {sample.text}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] uppercase tracking-[0.07em] text-faint">
                      <span>{GENRE_LABELS[sample.genre]}</span>
                      <span>·</span>
                      <span>{AUDIENCE_UI[sample.audience]}</span>
                      <span>·</span>
                      <span>{sample.wordCount} words</span>
                      <span>·</span>
                      <span>{formatDate(sample.createdAt)}</span>
                      {sample.piiRedacted && (
                        <Badge tone="amber" className="ml-1">
                          redacted
                        </Badge>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-[10px] text-faint">
              {samples.length} of {total}
              {total > 30 ? " · showing 30 at a time" : ""}
            </p>
            {samples.length < total && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadMore()}
                loading={loadingMore}
              >
                Load more
              </Button>
            )}
          </div>
        </Card>
      )}

      <SampleImport
        open={importOpen || addOpen}
        mode={addOpen ? "add" : "import"}
        personName={personName}
        onClose={closeImport}
        onImported={refreshLibrary}
      />

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setDeleteConfirm(false);
        }}
        title={selected ? `${GENRE_LABELS[selected.genre]} sample` : "Sample"}
        description={
          selected ? `Written to ${AUDIENCE_UI[selected.audience]}` : undefined
        }
        wide
        footer={
          selected ? (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant={deleteConfirm ? "danger" : "ghost"}
                size="sm"
                loading={deleting}
                onClick={() => {
                  if (deleteConfirm) void deleteSelected();
                  else setDeleteConfirm(true);
                }}
              >
                {deleteConfirm ? "Delete permanently" : "Delete"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelected(null);
                  setDeleteConfirm(false);
                }}
              >
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-paper/40 p-4 text-[12px] leading-6 text-ink-soft scroll-thin">
              {selected.text}
            </div>
            <div className="grid grid-cols-2 gap-3 text-[10.5px] text-muted sm:grid-cols-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-faint">
                  Words
                </p>
                <p className="mt-0.5">{formatNumber(selected.wordCount)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-faint">
                  Characters
                </p>
                <p className="mt-0.5">{formatNumber(selected.charCount)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-faint">
                  Language
                </p>
                <p className="mt-0.5">{selected.language}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-faint">
                  Added
                </p>
                <p className="mt-0.5">{formatDate(selected.createdAt)}</p>
              </div>
            </div>
            {selected.piiRedacted && (
              <p className="rounded-lg border border-amber/20 bg-amber-soft/60 px-3 py-2 text-[10.5px] leading-5 text-amber">
                Personal details in this sample were replaced when it was
                imported.
              </p>
            )}
            <p className="text-[10px] leading-5 text-faint">
              This sample is part of the voice profile and can be retrieved as
              an example for rewrites.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
