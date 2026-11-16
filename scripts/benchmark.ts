import fs from "node:fs";
import path from "node:path";
import { runChecks } from "@/lib/checks";
import { closeDb } from "@/lib/db";
import {
  checkModel,
  complete,
  listModels,
} from "@/lib/llm";
import { getLatestProfile } from "@/lib/profile";
import { buildHumanizerPrompt } from "@/lib/prompts";
import { executeRewrite } from "@/lib/rewrite";
import { getSettings, saveSettings } from "@/lib/settings";
import { computeStats } from "@/lib/stylometry";
import type { Audience, Genre, Profile } from "@/lib/types";
import { cleanModelOutput } from "@/lib/utils";

type Variant =
  | "voice"
  | "generic"
  | "raw"
  | "baseline"
  | "voice+humanizer";

interface BenchCase {
  id: string;
  draft: string;
  genre: Genre;
  audience: Audience;
  expected: string[];
}

const CASES: BenchCase[] = [
  {
    id: "academic-results",
    genre: "essay",
    audience: "academic",
    expected: ["3", "2", "42", "96", "activation steering"],
    draft:
      "This study evaluates whether activation steering reduces factual sycophancy in open-weight language models. We test 3 steering strengths on 2 benchmark datasets and compare against prompt-based baselines. Hybrid steering reduces sycophantic agreement by 42% while preserving 96% of general capability. These results demonstrate a promising inference-time intervention.",
  },
  {
    id: "email-update",
    genre: "email",
    audience: "colleague",
    expected: ["Sam", "Friday"],
    draft:
      "Hi Sam, I wanted to follow up on the report. I have attached the latest version and would appreciate your feedback by Friday. Let me know if you have any questions.",
  },
  {
    id: "message-win",
    genre: "message",
    audience: "friend",
    expected: ["project", "files"],
    draft:
      "We are thrilled to announce that the project is officially complete! After months of work, the final files are uploaded and ready for review. It's not just a milestone; it's a new chapter. Let that sink in.",
  },
  {
    id: "post-launch",
    genre: "post",
    audience: "public",
    expected: ["onboarding", "two"],
    draft:
      "We're excited to share that our new onboarding flow is live! It cuts setup time in half and removes two unnecessary steps. This marks a pivotal moment for the product. We can't wait to hear what you think.",
  },
  {
    id: "essay-library",
    genre: "essay",
    audience: "academic",
    expected: ["catalogue", "card catalogue"],
    draft:
      "The history of the library is a history of cataloguing. Every attempt to classify knowledge reflects the assumptions of its time. The card catalogue promised universal access, but it also imposed a particular order. The digital catalogue inherits that tension, even as it claims to dissolve it.",
  },
];

const baselineConnection = {
  baseUrl: "http://127.0.0.1:11434/v1",
  apiKey: "",
  disableThinking: false,
};

function closeness(a: number, b: number): number {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.max(0, 1 - Math.abs(a - b) / scale);
}

function styleScore(output: string, profile: Profile, genre: Genre): number {
  const out = computeStats([{ text: output, genre }]);
  const target = profile.stats.all;
  return (
    (closeness(out.medianSentenceLength, target.medianSentenceLength) +
      closeness(out.contractionsPer100Words, target.contractionsPer100Words) +
      closeness(out.lowercaseStartShare * 10, target.lowercaseStartShare * 10) +
      closeness(out.shortSentenceShare * 10, target.shortSentenceShare * 10) +
      closeness(out.avgWordLength, target.avgWordLength)) /
    5
  );
}

const NUMBER_ALIASES: Record<string, string[]> = {
  "1": ["1", "one"],
  "2": ["2", "two"],
  "3": ["3", "three"],
  "4": ["4", "four"],
  "5": ["5", "five"],
  "6": ["6", "six"],
  "7": ["7", "seven"],
  "8": ["8", "eight"],
  "9": ["9", "nine"],
  "10": ["10", "ten"],
};

const SPELLING_ALIASES: Record<string, string[]> = {
  catalogue: ["catalogue", "catalog", "cataloging", "cataloguing"],
  catalog: ["catalog", "catalogue"],
  colour: ["colour", "color"],
  favourite: ["favourite", "favorite"],
  organise: ["organise", "organize"],
  realise: ["realise", "realize"],
  behaviour: ["behaviour", "behavior"],
  centre: ["centre", "center"],
  travelling: ["travelling", "traveling"],
};

function containsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function aliasesFor(item: string): string[] {
  const key = item.toLowerCase();
  return (
    NUMBER_ALIASES[key] ??
    Object.entries(NUMBER_ALIASES).find(([, words]) =>
      words.includes(key),
    )?.[1] ??
    SPELLING_ALIASES[key] ??
    [item]
  );
}

function missingExpected(output: string, expected: string[]): string[] {
  const lower = output.toLowerCase();
  return expected.filter((item) => {
    const words = item.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      return !words.every((word) =>
        aliasesFor(word).some((alias) => containsWord(lower, alias)),
      );
    }
    return !aliasesFor(item).some((alias) => containsWord(lower, alias));
  });
}

function formatTable(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const widths = headers.map((header) =>
    Math.max(
      header.length,
      ...rows.map((row) => String(row[header] ?? "").length),
    ),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index]))
      .join("  ");
  return [
    line(headers),
    line(widths.map((width) => "-".repeat(width))),
    ...rows.map((row) =>
      line(headers.map((header) => String(row[header] ?? ""))),
    ),
  ].join("\n");
}

async function main() {
  const dbPath = process.env.MAYA_DB_PATH?.trim() ?? "";
  if (!dbPath.includes("bench")) {
    throw new Error(
      "Refusing to benchmark against a non-benchmark database. Run with MAYA_DB_PATH=./data/bench.db.",
    );
  }

  const profile = getLatestProfile();
  if (!profile) {
    throw new Error("The benchmark database has no voice profile.");
  }

  const settings = getSettings();
  const models = await listModels(
    { baseUrl: baselineConnection.baseUrl, apiKey: "" },
    8000,
  );
  const humanizerModel =
    models.find((model) => /humanizer/i.test(model)) ?? "";
  const humanizerReady = humanizerModel
    ? (await checkModel({ ...baselineConnection, model: humanizerModel })).ok
    : false;

  if (humanizerReady) {
    saveSettings({
      ...settings,
      baseline: {
        ...settings.baseline,
        enabled: true,
        label: "HF Humanizer 12B",
        baseUrl: baselineConnection.baseUrl,
        model: humanizerModel,
        apiKey: "",
        temperature: 1,
        disableThinking: false,
        promptFormat: "humanizer",
      },
    });
  }

  const variants: Variant[] = [
    "voice",
    "generic",
    "raw",
    ...(humanizerReady ? (["baseline", "voice+humanizer"] as Variant[]) : []),
  ];

  const results: Array<{
    caseId: string;
    variant: Variant;
    output: string;
    score: number;
    tells: number;
    factCritical: boolean;
    expectedMissing: string[];
    factsOk: boolean;
    edited: boolean;
    style: number;
    lengthRatio: number;
    latencyMs: number;
    error?: string;
  }> = [];

  for (const testCase of CASES) {
    for (const variant of variants) {
      const started = Date.now();
      try {
        let output: string;
        let checks: ReturnType<typeof runChecks>;

        if (variant === "voice+humanizer") {
          const voice = await executeRewrite(
            {
              draft: testCase.draft,
              genre: testCase.genre,
              audience: testCase.audience,
              lengthMode: "same",
              intent: "preserve",
            },
            "voice",
            { repair: true },
          );
          const humanized = await complete(
            {
              baseUrl: baselineConnection.baseUrl,
              model: humanizerModel,
              apiKey: "",
              disableThinking: false,
            },
            buildHumanizerPrompt(voice.output),
            {
              temperature: 1,
              maxTokens: 2048,
              topK: 0,
              minP: 0,
              repeatPenalty: 1,
              timeoutMs: 300_000,
            },
          );
          output = cleanModelOutput(humanized.content);
          checks = runChecks({
            draft: testCase.draft,
            output,
            profile,
          });
        } else {
          const result = await executeRewrite(
            {
              draft: testCase.draft,
              genre: testCase.genre,
              audience: testCase.audience,
              lengthMode: "same",
              intent: "preserve",
            },
            variant,
            { repair: variant === "voice" },
          );
          output = result.output;
          checks = result.checks;
        }

        const expectedMissing = missingExpected(output, testCase.expected);
        const factsOk = !checks.facts.critical && expectedMissing.length === 0;
        const edited = !checks.tells.some(
          (tell) => tell.id === "unchanged" || tell.id === "repeated-draft",
        );
        const style = styleScore(output, profile, testCase.genre);

        results.push({
          caseId: testCase.id,
          variant,
          output,
          score: checks.score,
          tells: checks.tells.reduce((sum, tell) => sum + tell.count, 0),
          factCritical: checks.facts.critical,
          expectedMissing,
          factsOk,
          edited,
          style,
          lengthRatio: checks.lengthRatio,
          latencyMs: Date.now() - started,
        });
      } catch (error) {
        results.push({
          caseId: testCase.id,
          variant,
          output: "",
          score: 0,
          tells: 0,
          factCritical: true,
          expectedMissing: [],
          factsOk: false,
          edited: false,
          style: 0,
          lengthRatio: 0,
          latencyMs: Date.now() - started,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  const tableRows = results.map((result) => ({
    case: result.caseId,
    variant: result.variant,
    facts: result.factsOk ? "PASS" : "FAIL",
    pattern: result.score,
    tells: result.tells,
    edited: result.edited ? "yes" : "NO",
    style: result.style.toFixed(2),
    length: result.lengthRatio.toFixed(2),
    time: `${(result.latencyMs / 1000).toFixed(1)}s`,
    ...(result.error ? { error: result.error.slice(0, 50) } : {}),
  }));

  const summaryRows = variants.map((variant) => {
    const rows = results.filter((result) => result.variant === variant);
    const factPass = rows.filter((row) => row.factsOk).length;
    const patternPass = rows.filter((row) => row.score >= 85).length;
    const editedPass = rows.filter((row) => row.edited).length;
    const avgStyle =
      rows.reduce((sum, row) => sum + row.style, 0) / Math.max(1, rows.length);
    const avgTells =
      rows.reduce((sum, row) => sum + row.tells, 0) / Math.max(1, rows.length);
    const avgLatency =
      rows.reduce((sum, row) => sum + row.latencyMs, 0) / Math.max(1, rows.length);
    const composite =
      (0.4 * (factPass / rows.length) +
        0.2 * (editedPass / rows.length) +
        0.2 * (patternPass / rows.length) +
        0.2 * avgStyle) *
      10;
    return {
      variant,
      "fact pass": `${factPass}/${rows.length}`,
      "pattern>=85": `${patternPass}/${rows.length}`,
      "edited": `${editedPass}/${rows.length}`,
      "avg style": avgStyle.toFixed(2),
      "avg tells": avgTells.toFixed(1),
      "avg time": `${(avgLatency / 1000).toFixed(1)}s`,
      "proxy /10": composite.toFixed(1),
    };
  });

  const outputPath = path.join(process.cwd(), "data", "bench-results.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        profile: {
          id: profile.id,
          version: profile.version,
          samples: profile.sampleCount,
          headline: profile.card?.headline ?? null,
        },
        writer: {
          model: settings.writer.model,
          mode: settings.writer.mode,
          maxExamples: settings.writer.maxExamples,
        },
        humanizer: humanizerReady
          ? { model: humanizerModel, enabled: true }
          : { model: null, enabled: false },
        cases: CASES,
        summary: summaryRows,
        results,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Humaniser: ${humanizerReady ? humanizerModel : "not available; baseline variants skipped"}`);
  console.log("\nPER CASE\n" + formatTable(tableRows));
  console.log("\nSUMMARY\n" + formatTable(summaryRows));
  console.log(`\nWrote ${outputPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDb();
  });
