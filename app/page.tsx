import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Fingerprint,
  PenLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SetupChecklist } from "@/components/dashboard-checklist";
import { Badge, Card } from "@/components/ui";
import { getLatestProfile } from "@/lib/profile";
import { countRewrites, listRewrites } from "@/lib/rewrites";
import { getLibraryStats } from "@/lib/samples";
import { getSettings } from "@/lib/settings";
import { buttonStyles } from "@/lib/ui";
import type { BadgeTone } from "@/lib/ui";
import type { Profile } from "@/lib/types";
import {
  GENRE_LABELS,
  formatDate,
  formatNumber,
  pct,
  truncate,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

function scoreTone(score: number): BadgeTone {
  return score >= 85 ? "moss" : score >= 65 ? "amber" : "accent";
}

function VoiceSnapshot({
  profile,
}: {
  profile: Profile | null;
}) {
  const stats = profile?.stats.all;

  return (
    <div className="card-shadow relative overflow-hidden rounded-[24px] border border-ink/90 bg-ink p-6 text-paper">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl"
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-paper/45">
            Voice profile
          </span>
          <span className="rounded-full border border-paper/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-paper/55">
            {profile ? `v${profile.version}` : "not built"}
          </span>
        </div>

        {profile?.card ? (
          <>
            <p className="mt-5 font-serif text-[25px] leading-[1.18] tracking-[-0.02em] text-paper">
              “{profile.card.headline}”
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-paper/10 pt-4">
              <div>
                <p className="font-serif text-[22px]">
                  {stats?.medianSentenceLength ?? "—"}
                </p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-paper/40">
                  median words
                </p>
              </div>
              <div>
                <p className="font-serif text-[22px]">
                  {stats ? pct(stats.shortSentenceShare) : "—"}
                </p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-paper/40">
                  short sentences
                </p>
              </div>
              <div>
                <p className="font-serif text-[22px]">{profile.sampleCount}</p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-paper/40">
                  samples
                </p>
              </div>
            </div>
            <Link
              href="/voice"
              className="mt-5 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#e6a28b] transition hover:text-[#f2bba8]"
            >
              Read your voice <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        ) : profile ? (
          <>
            <p className="mt-5 font-serif text-[23px] leading-tight">
              The measurements are in. The written read is not.
            </p>
            <p className="mt-2 text-[11.5px] leading-6 text-paper/55">
              Connect a model and refresh the profile to get the full
              description of your rhythm and habits.
            </p>
            <Link
              href="/voice"
              className="mt-5 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#e6a28b] transition hover:text-[#f2bba8]"
            >
              Open your voice <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        ) : (
          <>
            <p className="mt-5 font-serif text-[23px] leading-tight">
              Your profile starts with a few things you&apos;ve already written.
            </p>
            <p className="mt-2 text-[11.5px] leading-6 text-paper/55">
              Messages, emails, an old essay. The mix is the point.
            </p>
            <Link
              href="/voice?import=1"
              className="mt-5 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#e6a28b] transition hover:text-[#f2bba8]"
            >
              Add writing <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const settings = getSettings();
  const library = getLibraryStats();
  const profile = getLatestProfile();
  const rewriteCount = countRewrites();
  const recent = listRewrites({ limit: 5 }).rewrites;
  const hasWriting = library.samples > 0;

  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="space-y-7">
      <section className="grid gap-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)] lg:items-end">
        <div className="animate-rise">
          <p className="eyebrow">{date}</p>
          <h1 className="display mt-3 max-w-[680px] text-[43px] sm:text-[58px]">
            {hasWriting ? (
              <>
                Your voice,{" "}
                <span className="italic text-accent">ready.</span>
              </>
            ) : (
              <>
                Let&apos;s learn how <span className="italic">you</span> write.
              </>
            )}
          </h1>
          <p className="lede mt-4 max-w-xl text-pretty">
            {hasWriting
              ? `A quiet room for drafts that need to sound like ${settings.person.name}. Match your rhythm, keep every fact, and see exactly which samples were used.`
              : "Start with ten things you've written: messages, emails, a paragraph from an old essay. Maya learns the rhythm from your own words, not a generic idea of a person."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {hasWriting ? (
              <Link href="/write" className={buttonStyles({ size: "lg" })}>
                Start a rewrite <ArrowUpRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                href="/voice?import=1"
                className={buttonStyles({ size: "lg" })}
              >
                Add your writing <ArrowUpRight className="h-4 w-4" />
              </Link>
            )}
            <Link
              href="/voice"
              className={buttonStyles({ variant: "secondary", size: "lg" })}
            >
              <Fingerprint className="h-4 w-4" />
              See your voice
            </Link>
          </div>
        </div>

        <div className="animate-rise [animation-delay:80ms]">
          <VoiceSnapshot profile={profile} />
        </div>
      </section>

      <SetupChecklist
        samples={library.samples}
        hasProfile={Boolean(profile)}
        rewrites={rewriteCount}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="eyebrow">Library</p>
          <p className="mt-3 font-serif text-[30px] leading-none">
            {formatNumber(library.samples)}
          </p>
          <p className="mt-2 text-[11.5px] text-muted">
            {formatNumber(library.words)} words
            {library.redacted > 0
              ? ` · ${library.redacted} with redactions`
              : ""}
          </p>
        </Card>
        <Card className="p-5">
          <p className="eyebrow">Rewrites</p>
          <p className="mt-3 font-serif text-[30px] leading-none">
            {formatNumber(rewriteCount)}
          </p>
          <p className="mt-2 text-[11.5px] text-muted">
            {recent[0]
              ? `Last saved ${formatDate(recent[0].createdAt)}`
              : "Nothing saved yet"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="eyebrow">Privacy</p>
          <p className="mt-3 flex items-center gap-2 font-serif text-[22px] leading-none">
            <ShieldCheck className="h-4 w-4 text-moss" />
            Local-first
          </p>
          <p className="mt-2 text-[11.5px] text-muted">
            {settings.privacy.redactPii
              ? "Personal details are redacted on import."
              : "PII redaction is off."}
          </p>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.18fr_.82fr]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Recent</p>
              <h2 className="mt-1 font-serif text-[21px]">Rewrites</h2>
            </div>
            <Link
              href="/history"
              className="text-[11.5px] font-medium text-muted transition hover:text-ink"
            >
              All history
            </Link>
          </div>

          {recent.length > 0 ? (
            <div className="mt-3 divide-y divide-line">
              {recent.map((rewrite) => (
                <Link
                  key={rewrite.id}
                  href="/history"
                  className="flex items-start gap-3 py-3.5 transition hover:opacity-80"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/55" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-[12.5px] font-medium text-ink-soft">
                      {truncate(rewrite.draft.replace(/\s+/g, " "), 110)}
                    </span>
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.08em] text-faint">
                      {GENRE_LABELS[rewrite.genre]} ·{" "}
                      {formatDate(rewrite.createdAt)}
                    </span>
                  </span>
                  {rewrite.checks && (
                    <Badge tone={scoreTone(rewrite.checks.score)}>
                      {rewrite.checks.score}
                    </Badge>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-dashed border-line-strong/70 bg-paper/40 p-4">
              <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
              <p className="text-[12px] leading-5 text-muted">
                Nothing here yet. Your first rewrite will show up in this list.
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <p className="eyebrow">The method</p>
          </div>
          <ol className="mt-4 space-y-4">
            {[
              [
                "01",
                "Keep the bones",
                "Every number, name, date, and quotation is checked after the rewrite.",
              ],
              [
                "02",
                "Find the rhythm",
                "Sentence length, contractions, punctuation, and favourite phrases come from your samples.",
              ],
              [
                "03",
                "Show the work",
                "You see which samples were retrieved and what the pattern check found.",
              ],
            ].map(([number, title, body]) => (
              <li key={number} className="flex gap-3">
                <span className="font-serif text-[12px] italic text-accent">
                  {number}
                </span>
                <span>
                  <span className="block text-[12.5px] font-medium text-ink-soft">
                    {title}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-5 text-muted">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-5 border-t border-line pt-3 text-[10.5px] leading-5 text-faint">
            Maya is an editor, not an AI detector. Detector results are
            unreliable and not a measure of good writing.
          </p>
        </Card>
      </section>
    </div>
  );
}
