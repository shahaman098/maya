import { activeEmbedding, activeWriter } from "@/lib/connections";
import { auditFidelity, fidelityAcceptable } from "@/lib/fidelity";
import { repairTells } from "@/lib/tell-repair";
import { ApiError } from "@/lib/http";
import {
  chat,
  complete,
  LLMError,
  type ChatMessage,
  type ModelConnection,
  type TokenUsage,
} from "@/lib/llm";
import { ensureProfileForRewrite } from "@/lib/profile";
import {
  buildBaselineMessages,
  buildHumanizerPrompt,
  buildPolishMessages,
  buildRawMessages,
  buildRewriteMessages,
} from "@/lib/prompts";
import { retrieveExamples, type RetrievedExample } from "@/lib/retrieval";
import { getGenreCounts } from "@/lib/samples";
import { getSettings } from "@/lib/settings";
import type {
  Checks,
  Profile,
  RewriteRequest,
  Settings,
} from "@/lib/types";
import {
  clamp,
  cleanModelOutput,
  countWords,
  GENRE_LABELS,
  stripSafeTells,
} from "@/lib/utils";
import { runChecks } from "@/lib/checks";

export type RewriteVariant = "voice" | "generic" | "raw" | "baseline";

export interface PreparedRewrite {
  input: RewriteRequest;
  settings: Settings;
  variant: RewriteVariant;
  profile: Profile | null;
  examples: RetrievedExample[];
  messages: ChatMessage[];
  connection: ModelConnection;
  model: string;
  connectionLabel: string;
  temperature: number;
  warning?: string;
}

export interface GeneratedRewrite {
  output: string;
  checks: Checks;
  usage: TokenUsage;
  latencyMs: number;
  prepared: PreparedRewrite;
}

export function outputTokenBudget(draft: string): number {
  const words = countWords(draft);
  return clamp(Math.ceil(words * 1.8) + 240, 512, 8192);
}

function connectionFor(settings: Settings, variant: RewriteVariant): {
  connection: ModelConnection;
  model: string;
  label: string;
  temperature: number;
} {
  if (variant === "baseline") {
    if (!settings.baseline.enabled) {
      throw new ApiError(
        "No baseline model is enabled. Add one in Settings to compare against it.",
        400,
      );
    }
    return {
      connection: {
        baseUrl: settings.baseline.baseUrl,
        model: settings.baseline.model,
        apiKey: settings.baseline.apiKey,
        disableThinking: settings.baseline.disableThinking,
      },
      model: settings.baseline.model,
      label: "baseline",
      temperature: settings.baseline.temperature,
    };
  }

  const active = activeWriter(settings);
  return {
    connection: active.connection,
    model: active.model,
    label: active.mode,
    temperature: active.temperature,
  };
}

export async function prepareRewrite(
  input: RewriteRequest,
  variant: RewriteVariant,
): Promise<PreparedRewrite> {
  const settings = getSettings();
  if (
    settings.writer.mode === "api" &&
    !settings.writer.api.model.trim()
  ) {
    throw new ApiError(
      "Add a model for the Cloud API in Settings before rewriting.",
      400,
    );
  }
  const connectionInfo = connectionFor(settings, variant);
  const warnings: string[] = [];

  let profile: Profile | null = null;
  let examples: RetrievedExample[] = [];
  let messages: ChatMessage[];

  if (variant === "baseline") {
    messages = buildBaselineMessages(input.draft);
  } else if (variant === "raw") {
    messages = buildRawMessages(input.draft);
  } else if (variant === "generic") {
    messages = buildRewriteMessages({
      draft: input.draft,
      genre: input.genre,
      audience: input.audience,
      lengthMode: input.lengthMode,
      intent: input.intent,
      profile: null,
      examples: [],
      name: settings.person.name,
    });
  } else {
    const genreCounts = getGenreCounts();
    const sameGenre = genreCounts[input.genre] ?? 0;

    if (sameGenre < 2) {
      warnings.push(
        `Only ${sameGenre} ${GENRE_LABELS[input.genre].toLowerCase()} sample${sameGenre === 1 ? "" : "s"} in the library. Using a conservative generic edit until there are at least two.`,
      );
    } else {
      profile = await ensureProfileForRewrite();
      if (!profile) {
        warnings.push(
          "There is no voice profile yet, so this will be a generic edit. Add a few samples in Voice to match your writing.",
        );
      } else {
        const embedding = activeEmbedding(settings);
        const retrieval = await retrieveExamples({
          draft: input.draft,
          genre: input.genre,
          audience: input.audience,
          settings: settings.writer,
          connection: embedding.connection,
          embeddingModel: embedding.model,
        });
        examples = retrieval.examples;
        if (retrieval.warning) warnings.push(retrieval.warning);
      }
    }

    messages = buildRewriteMessages({
      draft: input.draft,
      genre: input.genre,
      audience: input.audience,
      lengthMode: input.lengthMode,
      intent: input.intent,
      profile,
      examples: examples.map((example) => example.sample),
      name: settings.person.name,
    });
  }

  return {
    input,
    settings,
    variant,
    profile,
    examples,
    messages,
    connection: connectionInfo.connection,
    model: connectionInfo.model,
    connectionLabel: connectionInfo.label,
    temperature: connectionInfo.temperature,
    warning: warnings.length > 0 ? warnings.join(" ") : undefined,
  };
}

export interface PolishIssues {
  missing: string[];
  added: string[];
  tells: string[];
}

export function polishIssues(checks: Checks): PolishIssues {
  return {
    missing: [
      ...checks.facts.missingNumbers,
      ...checks.facts.missingQuotes,
      ...checks.facts.missingLinks,
    ].slice(0, 12),
    added: [...checks.facts.addedNumbers].slice(0, 8),
    tells: checks.tells
      .filter((tell) => tell.severity !== "low")
      .map((tell) =>
        tell.examples[0]
          ? `${tell.label} ("${tell.examples[0]}")`
          : tell.label,
      )
      .slice(0, 8),
  };
}

export function needsPolish(checks: Checks): boolean {
  const issues = polishIssues(checks);
  return (
    issues.missing.length > 0 ||
    issues.added.length > 0 ||
    issues.tells.length > 0 ||
    checks.score < 85
  );
}

export function mergeIssues(base: PolishIssues, audit: {
  missing: string[];
  added: string[];
}): PolishIssues {
  return {
    missing: [...new Set([...base.missing, ...audit.missing])].slice(0, 12),
    added: [...new Set([...base.added, ...audit.added])].slice(0, 8),
    tells: base.tells,
  };
}

export function isBetterCandidate(candidate: Checks, current: Checks): boolean {
  return (
    candidate.score >= current.score &&
    countMissing(candidate) <= countMissing(current) &&
    candidate.tells.length <= current.tells.length
  );
}

function countMissing(checks: Checks): number {
  return (
    checks.facts.missingNumbers.length +
    checks.facts.missingQuotes.length +
    checks.facts.missingLinks.length
  );
}

export async function executeRewrite(
  input: RewriteRequest,
  variant: RewriteVariant,
  options: { repair?: boolean; signal?: AbortSignal } = {},
): Promise<GeneratedRewrite> {
  const started = Date.now();
  const prepared = await prepareRewrite(input, variant);
  const maxTokens = outputTokenBudget(input.draft);

  if (
    variant === "baseline" &&
    prepared.settings.baseline.promptFormat === "humanizer"
  ) {
    const result = await complete(
      prepared.connection,
      buildHumanizerPrompt(input.draft),
      {
        temperature: prepared.temperature,
        maxTokens,
        topK: 0,
        minP: 0,
        repeatPenalty: 1,
        timeoutMs: 300_000,
        signal: options.signal,
      },
    );
    const output = cleanModelOutput(result.content);
    if (!output.trim()) {
      throw new LLMError("The humaniser returned no usable text.", {
        code: "empty",
      });
    }
    const checks = runChecks({
      draft: input.draft,
      output,
      profile: prepared.profile,
    });
    return {
      output,
      checks,
      usage: result.usage,
      latencyMs: Date.now() - started,
      prepared,
    };
  }

  const first = await chat(prepared.connection, prepared.messages, {
    temperature: prepared.temperature,
    maxTokens,
    timeoutMs: 240_000,
    signal: options.signal,
    ...(variant === "baseline"
      ? { topK: 0, minP: 0, repeatPenalty: 1 }
      : {}),
  });

  let output = cleanModelOutput(first.content);
  if (!output.trim()) {
    throw new LLMError("The model returned no usable text.", {
      code: "empty",
      hint: "Try again, or choose a different model in Settings.",
    });
  }

  let checks = runChecks({
    draft: input.draft,
    output,
    profile: prepared.profile,
  });
  let usage = first.usage;

  if (
    options.repair !== false &&
    variant === "voice" &&
    prepared.settings.writer.repairPass
  ) {
    let issues = polishIssues(checks);
    const firstAudit = await auditFidelity({
      connection: prepared.connection,
      draft: input.draft,
      output,
      signal: options.signal,
    });
    if (firstAudit) {
      issues = mergeIssues(issues, firstAudit);
    }

    if (issues.missing.length > 0 || issues.added.length > 0) {
      try {
        const repaired = await chat(
          prepared.connection,
          buildPolishMessages(prepared.messages, output, issues),
          {
            temperature: 0.45,
            maxTokens,
            timeoutMs: 240_000,
            signal: options.signal,
          },
        );
        const candidate = cleanModelOutput(repaired.content);
        if (candidate.trim()) {
          const candidateChecks = runChecks({
            draft: input.draft,
            output: candidate,
            profile: prepared.profile,
          });
          const candidateAudit = await auditFidelity({
            connection: prepared.connection,
            draft: input.draft,
            output: candidate,
            signal: options.signal,
          });
          if (
            isBetterCandidate(candidateChecks, checks) &&
            fidelityAcceptable(firstAudit, candidateAudit)
          ) {
            output = candidate;
            checks = candidateChecks;
          }
          usage = {
            input: usage.input + repaired.usage.input,
            output: usage.output + repaired.usage.output,
          };
        }
      } catch {
        // A failed polish pass should not throw away a usable rewrite.
      }
    }

    const tellRepair = await repairTells({
      connection: prepared.connection,
      draft: input.draft,
      output,
      profile: prepared.profile,
      signal: options.signal,
    });
    if (tellRepair.changed) {
      output = tellRepair.output;
      checks = tellRepair.checks;
    }
    usage = {
      input: usage.input + tellRepair.usage.input,
      output: usage.output + tellRepair.usage.output,
    };

    const fillerFree = stripSafeTells(output);
    if (fillerFree && fillerFree !== output) {
      const fillerChecks = runChecks({
        draft: input.draft,
        output: fillerFree,
        profile: prepared.profile,
      });
      if (isBetterCandidate(fillerChecks, checks)) {
        output = fillerFree;
        checks = fillerChecks;
      }
    }
  }

  return {
    output,
    checks,
    usage,
    latencyMs: Date.now() - started,
    prepared,
  };
}
