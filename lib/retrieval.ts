import { embed, type ModelConnection } from "@/lib/llm";
import {
  getSamplesMissingEmbedding,
  getSamplesWithEmbeddings,
  saveEmbedding,
} from "@/lib/samples";
import { contentTokens } from "@/lib/stylometry";
import type { Audience, Genre, Sample, WriterSettings } from "@/lib/types";
import { countWords, normalizeForHash } from "@/lib/utils";

export interface RetrievedExample {
  sample: Sample;
  score: number;
  reason: string;
}

export async function ensureEmbeddings(
  connection: ModelConnection,
  model: string,
  limit = 64,
): Promise<{ embedded: number; error?: string }> {
  const missing = getSamplesMissingEmbedding(limit);
  if (missing.length === 0) return { embedded: 0 };

  try {
    let embedded = 0;
    for (let index = 0; index < missing.length; index += 16) {
      const batch = missing.slice(index, index + 16);
      const vectors = await embed(
        connection,
        model,
        batch.map((sample) => sample.text.slice(0, 4000)),
        { timeoutMs: 60_000 },
      );
      batch.forEach((sample, batchIndex) => {
        const vector = vectors[batchIndex];
        if (vector && vector.length > 0) {
          saveEmbedding(sample.id, model, vector);
          embedded += 1;
        }
      });
    }
    return { embedded };
  } catch (error) {
    return {
      embedded: 0,
      error:
        error instanceof Error
          ? error.message
          : "The embedding model is unavailable.",
    };
  }
}

function cosine(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const value of a) {
    if (b.has(value)) shared += 1;
  }
  return shared / (a.size + b.size - shared);
}

export async function retrieveExamples(input: {
  draft: string;
  genre: Genre;
  audience: Audience;
  settings: WriterSettings;
  connection: ModelConnection;
  limit?: number;
}): Promise<{ examples: RetrievedExample[]; warning?: string }> {
  const limit = input.limit ?? input.settings.maxExamples ?? 5;
  if (limit <= 0) return { examples: [] };

  let warning: string | undefined;

  if (input.settings.semanticRetrieval) {
    const result = await ensureEmbeddings(
      input.connection,
      input.settings.embeddingModel,
    );
    if (result.error) {
      warning = `Semantic matching is unavailable (${result.error}). Using format and wording instead.`;
    }
  }

  const candidates = getSamplesWithEmbeddings().filter(
    (candidate) =>
      candidate.sample.consent &&
      normalizeForHash(candidate.sample.text) !== normalizeForHash(input.draft),
  );
  if (candidates.length === 0) return { examples: [], warning };

  const draftWords = Math.max(1, countWords(input.draft));
  const draftTokens = contentTokens(input.draft);
  const draftSet = new Set(draftTokens);

  const tokenSets = candidates.map(
    (candidate) => new Set(contentTokens(candidate.sample.text)),
  );
  const documentFrequency = new Map<string, number>();
  for (const set of tokenSets) {
    for (const token of set) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const idf = (token: string) =>
    Math.log(1 + candidates.length / (1 + (documentFrequency.get(token) ?? 0)));

  let queryEmbedding: number[] | null = null;
  if (
    input.settings.semanticRetrieval &&
    candidates.some(
      (candidate) =>
        candidate.embedding &&
        candidate.embeddingModel === input.settings.embeddingModel,
    )
  ) {
    try {
      const vectors = await embed(
        input.connection,
        input.settings.embeddingModel,
        [input.draft.slice(0, 4000)],
        { timeoutMs: 20_000 },
      );
      queryEmbedding = vectors[0] ?? null;
    } catch (error) {
      warning = `Semantic matching is unavailable (${error instanceof Error ? error.message : "embedding failed"}). Using format and wording instead.`;
    }
  }

  const queryWeight = Math.sqrt(
    [...draftSet].reduce((sum, token) => sum + idf(token) ** 2, 0),
  );

  const scored = candidates.map((candidate, index) => {
    const set = tokenSets[index];
    let dot = 0;
    for (const token of set) {
      if (draftSet.has(token)) dot += idf(token) ** 2;
    }
    const sampleWeight = Math.sqrt(
      [...set].reduce((sum, token) => sum + idf(token) ** 2, 0),
    );
    const lexical =
      queryWeight > 0 && sampleWeight > 0 ? dot / (queryWeight * sampleWeight) : 0;

    let semantic: number | null = null;
    if (
      queryEmbedding &&
      candidate.embedding &&
      candidate.embeddingModel === input.settings.embeddingModel
    ) {
      semantic = Math.max(0, cosine(queryEmbedding, candidate.embedding));
    }

    const sampleWords = Math.max(1, candidate.sample.wordCount);
    const lengthScore = Math.exp(
      -Math.abs(Math.log((sampleWords + 4) / (draftWords + 4))),
    );

    const genreExact = candidate.sample.genre === input.genre ? 1 : 0;
    const genreBucket =
      candidate.sample.genre === "message" && input.genre === "message"
        ? 1
        : candidate.sample.genre !== "message" && input.genre !== "message"
          ? 0.5
          : 0;
    const genreScore = Math.max(genreExact, genreBucket);
    const audienceScore = candidate.sample.audience === input.audience ? 1 : 0;

    const base = semantic === null
      ? lexical * 0.52 + genreScore * 0.24 + audienceScore * 0.14 + lengthScore * 0.1
      : lexical * 0.34 +
        semantic * 0.28 +
        genreScore * 0.16 +
        audienceScore * 0.1 +
        lengthScore * 0.12;

    let bonus = 0;
    if (draftWords < 80 && sampleWords < 160) bonus += 0.04;
    if (draftWords > 250 && sampleWords > 220) bonus += 0.04;

    return {
      candidate,
      index,
      semantic,
      lengthScore,
      set,
      score: base + bonus,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: typeof scored = [];
  const selectedWidgets: number[] = [];
  const remaining = [...scored];

  while (selected.length < limit && remaining.length > 0) {
    let bestIndex = 0;
    let bestAdjusted = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const item = remaining[index];
      let maxSimilarity = 0;
      for (const chosen of selected) {
        let similarity: number;
        if (
          item.candidate.embedding &&
          chosen.candidate.embedding &&
          item.candidate.embeddingModel === input.settings.embeddingModel &&
          chosen.candidate.embeddingModel === input.settings.embeddingModel
        ) {
          similarity = Math.max(
            0,
            cosine(item.candidate.embedding, chosen.candidate.embedding),
          );
        } else {
          similarity = jaccard(item.set, chosen.set);
        }
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }
      const adjusted = item.score - maxSimilarity * 0.18;
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIndex = index;
      }
    }

    selected.push(remaining[bestIndex]);
    selectedWidgets.push(bestAdjusted);
    remaining.splice(bestIndex, 1);
  }

  const examples = selected.map((item, index) => {
    const sample = item.candidate.sample;
    const reasons: string[] = [];
    if (sample.genre === input.genre) reasons.push("same format");
    else if (item.score > 0.45) reasons.push("similar format");
    if (sample.audience === input.audience) reasons.push("same reader");
    if (item.lengthScore > 0.7) reasons.push("similar length");

    const shared = [...item.set]
      .filter((token) => draftSet.has(token))
      .sort((a, b) => idf(b) - idf(a))
      .slice(0, 1);
    if (shared.length > 0) reasons.push(`shares "${shared[0]}"`);

    return {
      sample,
      score: Math.max(0, Math.min(1, selectedWidgets[index])),
      reason: reasons.length > 0 ? reasons.join(" · ") : "close in wording",
    };
  });

  return { examples, warning };
}
