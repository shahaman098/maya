import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui";
import type { BadgeTone } from "@/lib/ui";
import type { Checks } from "@/lib/types";
import { cn, pct } from "@/lib/utils";

export function scoreTone(score: number): BadgeTone {
  return score >= 85 ? "moss" : score >= 65 ? "amber" : "accent";
}

export function ScoreRing({
  score,
  size = 44,
}: {
  score: number;
  size?: number;
}) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color =
    score >= 85
      ? "text-moss"
      : score >= 65
        ? "text-amber"
        : "text-accent";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-line"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={color}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-ink">
        {score}
      </span>
    </div>
  );
}

export function ChecksPanel({ checks }: { checks: Checks }) {
  const tellCount = checks.tells.reduce((sum, tell) => sum + tell.count, 0);
  const factsLabel = checks.facts.critical
    ? "Facts need a look"
    : "Facts intact";
  const rhythmLabel =
    checks.rhythm.verdict === "flat"
      ? "Even rhythm"
      : checks.rhythm.verdict === "short"
        ? "Too short to judge"
        : checks.rhythm.verdict === "varied"
          ? "Varied rhythm"
          : "Steady rhythm";

  return (
    <div className="rounded-xl border border-line bg-paper/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ScoreRing score={checks.score} />
        <div className="min-w-[140px] flex-1">
          <p className="text-[12.5px] font-medium text-ink-soft">
            {checks.verdict}
          </p>
          <p className="mt-0.5 text-[10px] text-faint">
            Pattern score, not an AI detector
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={checks.facts.critical ? "accent" : "moss"}>
            {factsLabel}
          </Badge>
          <Badge tone={tellCount > 0 ? "amber" : "moss"}>
            {tellCount > 0 ? `${tellCount} tells` : "No tells"}
          </Badge>
        </div>
      </div>

      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[10.5px] font-medium text-muted transition hover:text-ink [&::-webkit-details-marker]:hidden">
          See the details
          <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
        </summary>

        <div className="mt-3 space-y-3 text-[11.5px] leading-5 text-muted">
          <p>{checks.notes.join(" ")}</p>

          {checks.facts.missingNumbers.length > 0 && (
            <p>
              <span className="font-medium text-ink-soft">Missing numbers:</span>{" "}
              {checks.facts.missingNumbers.slice(0, 8).join(", ")}
            </p>
          )}
          {checks.facts.missingQuotes.length > 0 && (
            <p>
              <span className="font-medium text-ink-soft">Changed quotes:</span>{" "}
              {checks.facts.missingQuotes
                .slice(0, 4)
                .map((quote) => `“${quote}”`)
                .join(", ")}
            </p>
          )}
          {checks.facts.missingLinks.length > 0 && (
            <p>
              <span className="font-medium text-ink-soft">Changed links:</span>{" "}
              {checks.facts.missingLinks.slice(0, 4).join(", ")}
            </p>
          )}
          {checks.facts.missingNames.length > 0 && (
            <p>
              <span className="font-medium text-ink-soft">Names to check:</span>{" "}
              {checks.facts.missingNames.slice(0, 6).join(", ")}
            </p>
          )}

          {checks.tells.length > 0 && (
            <div className="rounded-lg border border-line bg-surface/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
                Patterns found
              </p>
              <ul className="mt-2 space-y-1.5">
                {checks.tells.slice(0, 5).map((tell) => (
                  <li key={tell.id} className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        tell.severity === "high"
                          ? "bg-accent"
                          : tell.severity === "medium"
                            ? "bg-amber"
                            : "bg-line-strong",
                      )}
                    />
                    <span>
                      <span className="text-ink-soft">{tell.label}</span>
                      {tell.count > 1 ? ` ×${tell.count}` : ""}
                      {tell.examples[0] ? (
                        <span className="block text-[10.5px] text-faint">
                          {tell.examples[0]}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {checks.tells.length > 5 && (
                <p className="mt-2 text-[10px] text-faint">
                  Plus {checks.tells.length - 5} more pattern
                  {checks.tells.length - 5 === 1 ? "" : "s"}.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.1em] text-faint">
                Rhythm
              </p>
              <p className="mt-1">
                {rhythmLabel}. Median {checks.rhythm.median} words,{" "}
                {pct(checks.rhythm.shortShare)} short.
              </p>
            </div>
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.1em] text-faint">
                Length
              </p>
              <p className="mt-1">
                {Math.round(checks.lengthRatio * 100)}% of the draft.
              </p>
            </div>
          </div>

          {checks.pii.draft.length > 0 && (
            <p className="rounded-lg border border-amber/20 bg-amber-soft/60 px-3 py-2 text-[10.5px] text-amber">
              The draft contained personal details. They were sent to the
              configured model endpoint.
            </p>
          )}

          <p className="text-[10px] leading-5 text-faint">
            This is a rule-based readability check, not a detector. Read the
            result before you send it, especially names, numbers, and dates.
          </p>
        </div>
      </details>
    </div>
  );
}
