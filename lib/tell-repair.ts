import { runChecks } from "@/lib/checks";
import {
  chat,
  LLMError,
  type ModelConnection,
  type TokenUsage,
} from "@/lib/llm";
import { buildTellRepairMessages } from "@/lib/prompts";
import { splitSentences } from "@/lib/stylometry";
import type { Checks, Profile, TellReport } from "@/lib/types";
import { cleanModelOutput } from "@/lib/utils";

export interface TellRepairResult {
  output: string;
  checks: Checks;
  changed: boolean;
  usage: TokenUsage;
}

function issueCount(checks: Checks): number {
  return (
    checks.facts.missingNumbers.length +
    checks.facts.missingQuotes.length +
    checks.facts.missingLinks.length +
    checks.facts.addedNumbers.length
  );
}

function acceptable(candidate: Checks, current: Checks): boolean {
  return (
    candidate.score >= current.score &&
    issueCount(candidate) <= issueCount(current) &&
    candidate.tells.length <= current.tells.length
  );
}

function findTargets(
  output: string,
  tells: TellReport[],
): Map<string, TellReport[]> {
  const targets = new Map<string, TellReport[]>();
  const sentences = splitSentences(output).filter(
    (sentence) => sentence.length >= 4 && sentence.length <= 600,
  );
  const relevant = tells.filter(
    (tell) => tell.severity === "high" || tell.severity === "medium",
  );

  for (const tell of relevant) {
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const hit = tell.examples.some(
        (example) =>
          example.length >= 3 && lower.includes(example.toLowerCase()),
      );
      if (!hit) continue;
      const current = targets.get(sentence) ?? [];
      if (!current.some((entry) => entry.id === tell.id)) current.push(tell);
      targets.set(sentence, current);
    }
  }

  return targets;
}

export async function repairTells(input: {
  connection: ModelConnection;
  draft: string;
  output: string;
  profile: Profile | null;
  signal?: AbortSignal;
}): Promise<TellRepairResult> {
  const currentChecks = runChecks({
    draft: input.draft,
    output: input.output,
    profile: input.profile,
  });
  const targets = findTargets(input.output, currentChecks.tells);

  if (targets.size === 0) {
    return {
      output: input.output,
      checks: currentChecks,
      changed: false,
      usage: { input: 0, output: 0 },
    };
  }

  let next = input.output;
  let usage: TokenUsage = { input: 0, output: 0 };
  let changed = false;

  for (const [sentence, tells] of [...targets.entries()].slice(0, 3)) {
    try {
      const result = await chat(
        input.connection,
        buildTellRepairMessages({
          sentence,
          tells,
          output: next,
          draft: input.draft,
        }),
        {
          temperature: 0.3,
          maxTokens: 320,
          timeoutMs: 60_000,
          signal: input.signal,
        },
      );

      let replacement = cleanModelOutput(result.content).trim();
      replacement = replacement.replace(/^["“']|["”']$/g, "").trim();

      if (/^delete[.!]?$/i.test(replacement) || /^remove[.!]?$/i.test(replacement)) {
        replacement = "";
      }
      if (replacement.includes("\n")) {
        replacement = replacement.split("\n")[0]?.trim() ?? "";
      }
      if (replacement.length > 500) continue;
      if (
        replacement &&
        tells.some((tell) =>
          tell.examples.some((example) =>
            replacement.toLowerCase().includes(example.toLowerCase()),
          ),
        )
      ) {
        continue;
      }
      if (replacement && splitSentences(replacement).length > 2) continue;

      const updated = next.replace(sentence, replacement);
      if (updated === next) continue;
      next = updated;
      changed = true;
      usage = {
        input: usage.input + result.usage.input,
        output: usage.output + result.usage.output,
      };
    } catch (error) {
      if (error instanceof LLMError && error.code === "cancelled") throw error;
      // Skip this sentence and keep the original.
    }
  }

  if (!changed) {
    return {
      output: input.output,
      checks: currentChecks,
      changed: false,
      usage,
    };
  }

  next = next
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const candidateChecks = runChecks({
    draft: input.draft,
    output: next,
    profile: input.profile,
  });

  if (!acceptable(candidateChecks, currentChecks)) {
    return {
      output: input.output,
      checks: currentChecks,
      changed: false,
      usage,
    };
  }

  return {
    output: next,
    checks: candidateChecks,
    changed: true,
    usage,
  };
}
