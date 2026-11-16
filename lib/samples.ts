import { getDb } from "@/lib/db";
import { hashText } from "@/lib/hash";
import { redactPii } from "@/lib/pii";
import { getSettings } from "@/lib/settings";
import type { Audience, Genre, Modality, Sample } from "@/lib/types";
import { countWords, normalizeForHash } from "@/lib/utils";

interface SampleRow {
  id: string;
  text: string;
  genre: string;
  audience: string;
  language: string;
  source: string;
  is_authentic: number;
  consent: number;
  pii_redacted: number;
  hash: string;
  char_count: number;
  word_count: number;
  embedding: Buffer | null;
  embedding_model: string | null;
  created_at: string;
}

export interface NewSample {
  text: string;
  genre: Genre;
  audience: Audience;
  language: string;
  source: string;
  consent: boolean;
  redact: boolean;
}

export interface ImportResult {
  samples: Sample[];
  imported: number;
  duplicates: number;
  redactions: number;
}

export interface SampleCounts {
  all: number;
  message: number;
  longform: number;
}

function mapSample(row: SampleRow): Sample {
  return {
    id: row.id,
    text: row.text,
    genre: row.genre as Genre,
    audience: row.audience as Audience,
    language: row.language,
    source: row.source,
    isAuthentic: row.is_authentic === 1,
    consent: row.consent === 1,
    piiRedacted: row.pii_redacted === 1,
    charCount: row.char_count,
    wordCount: row.word_count,
    createdAt: row.created_at,
    hasEmbedding: row.embedding !== null,
  };
}

function prepare(input: NewSample): {
  text: string;
  hash: string;
  redactions: number;
} {
  const redaction = input.redact
    ? redactPii(input.text.trim())
    : { text: input.text.trim(), hits: [] };
  const text = redaction.text.trim();
  return {
    text,
    hash: hashText(normalizeForHash(text)),
    redactions: redaction.hits.length,
  };
}

export function createSamples(inputs: NewSample[]): ImportResult {
  const db = getDb();
  const select = db.prepare("SELECT 1 FROM samples WHERE hash = ?");
  const insert = db.prepare(
    `INSERT INTO samples
      (id, text, genre, audience, language, source, is_authentic, consent,
       pii_redacted, hash, char_count, word_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
  );

  const created: Sample[] = [];
  let duplicates = 0;
  let redactions = 0;
  const now = new Date().toISOString();

  const run = db.transaction((items: NewSample[]) => {
    for (const input of items) {
      if (!input.consent) continue;

      const prepared = prepare(input);
      if (select.get(prepared.hash)) {
        duplicates += 1;
        continue;
      }

      const id = crypto.randomUUID();
      const charCount = prepared.text.length;
      const wordCount = countWords(prepared.text);
      const piiRedacted = prepared.redactions > 0 ? 1 : 0;

      try {
        insert.run(
          id,
          prepared.text,
          input.genre,
          input.audience,
          input.language,
          input.source,
          input.consent ? 1 : 0,
          piiRedacted,
          prepared.hash,
          charCount,
          wordCount,
          now,
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
        ) {
          duplicates += 1;
          continue;
        }
        throw error;
      }

      redactions += prepared.redactions;
      created.push({
        id,
        text: prepared.text,
        genre: input.genre,
        audience: input.audience,
        language: input.language,
        source: input.source,
        isAuthentic: true,
        consent: true,
        piiRedacted: prepared.redactions > 0,
        charCount,
        wordCount,
        createdAt: now,
        hasEmbedding: false,
      });
    }
  });

  run(inputs);

  return {
    samples: created,
    imported: created.length,
    duplicates,
    redactions,
  };
}

export function getSample(id: string): Sample | null {
  const row = getDb()
    .prepare("SELECT * FROM samples WHERE id = ?")
    .get(id) as SampleRow | undefined;
  return row ? mapSample(row) : null;
}

export function listSamples(options: {
  q?: string;
  modality?: Modality;
  limit?: number;
  offset?: number;
}): { samples: Sample[]; total: number } {
  const db = getDb();
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (options.q?.trim()) {
    where.push("text LIKE ?");
    params.push(`%${options.q.trim()}%`);
  }
  if (options.modality === "message") {
    where.push("genre = 'message'");
  } else if (options.modality === "longform") {
    where.push("genre <> 'message'");
  }

  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM samples ${clause}`)
      .get(...params) as { n: number }
  ).n;

  const rows = db
    .prepare(
      `SELECT * FROM samples ${clause}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as SampleRow[];

  return { samples: rows.map(mapSample), total };
}

export function getSampleCounts(): SampleCounts {
  const db = getDb();
  const total = (
    db.prepare("SELECT COUNT(*) AS n FROM samples").get() as { n: number }
  ).n;
  const messages = (
    db
      .prepare("SELECT COUNT(*) AS n FROM samples WHERE genre = 'message'")
      .get() as { n: number }
  ).n;
  return { all: total, message: messages, longform: total - messages };
}

export function countSamples(): number {
  return getSampleCounts().all;
}

export function getGenreCounts(): Partial<Record<Genre, number>> {
  const rows = getDb()
    .prepare(
      "SELECT genre, COUNT(*) AS n FROM samples WHERE consent = 1 GROUP BY genre",
    )
    .all() as Array<{ genre: string; n: number }>;
  const counts: Partial<Record<Genre, number>> = {};
  for (const row of rows) {
    counts[row.genre as Genre] = row.n;
  }
  return counts;
}

export function getLibraryStats(): {
  samples: number;
  words: number;
  redacted: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS samples,
        COALESCE(SUM(word_count), 0) AS words,
        COALESCE(SUM(pii_redacted), 0) AS redacted
       FROM samples`,
    )
    .get() as { samples: number; words: number; redacted: number };
  return row;
}

export function getConsentedSamples(): Sample[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM samples WHERE consent = 1 ORDER BY created_at DESC, id DESC",
    )
    .all() as SampleRow[];
  return rows.map(mapSample);
}

export interface SampleWithEmbedding {
  sample: Sample;
  embedding: number[] | null;
  embeddingModel: string | null;
}

export function getSamplesWithEmbeddings(): SampleWithEmbedding[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM samples WHERE consent = 1 ORDER BY created_at DESC, id DESC",
    )
    .all() as SampleRow[];
  return rows.map((row) => ({
    sample: mapSample(row),
    embedding: decodeEmbedding(row.embedding),
    embeddingModel: row.embedding_model,
  }));
}

export function getSamplesMissingEmbedding(limit = 64): Sample[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM samples
       WHERE consent = 1 AND embedding IS NULL
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(limit) as SampleRow[];
  return rows.map(mapSample);
}

export function saveEmbedding(
  id: string,
  model: string,
  vector: number[],
): void {
  const buffer = Buffer.from(new Float32Array(vector).buffer);
  getDb()
    .prepare("UPDATE samples SET embedding = ?, embedding_model = ? WHERE id = ?")
    .run(buffer, model, id);
}

export function decodeEmbedding(value: Buffer | Uint8Array | null): number[] | null {
  if (!value || value.byteLength === 0 || value.byteLength % 4 !== 0) return null;
  try {
    const view = new Float32Array(
      value.buffer,
      value.byteOffset,
      value.byteLength / 4,
    );
    return Array.from(view);
  } catch {
    return null;
  }
}

export function updateSample(
  id: string,
  patch: { text?: string; genre?: Genre; audience?: Audience },
): Sample | null {
  const existing = getSample(id);
  if (!existing) return null;

  const textChanged = patch.text !== undefined;
  let text = patch.text?.trim() ?? existing.text;
  let piiRedacted = existing.piiRedacted;

  if (textChanged) {
    if (getSettings().privacy.redactPii) {
      const redaction = redactPii(text);
      text = redaction.text.trim();
      piiRedacted = redaction.hits.length > 0;
    } else {
      piiRedacted = false;
    }
  }

  const hash = hashText(normalizeForHash(text));
  const db = getDb();
  db.prepare(
    `UPDATE samples SET
      text = ?, genre = ?, audience = ?, hash = ?, char_count = ?,
      word_count = ?, pii_redacted = ?,
      embedding = CASE WHEN ? THEN NULL ELSE embedding END,
      embedding_model = CASE WHEN ? THEN NULL ELSE embedding_model END
     WHERE id = ?`,
  ).run(
    text,
    patch.genre ?? existing.genre,
    patch.audience ?? existing.audience,
    hash,
    text.length,
    countWords(text),
    piiRedacted ? 1 : 0,
    textChanged ? 1 : 0,
    textChanged ? 1 : 0,
    id,
  );

  return getSample(id);
}

export function deleteSample(id: string): boolean {
  const result = getDb().prepare("DELETE FROM samples WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getSampleById(id: string): Sample | null {
  return getSample(id);
}
