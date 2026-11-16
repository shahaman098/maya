import { getDb } from "@/lib/db";
import type {
  Audience,
  Checks,
  Genre,
  Intent,
  LengthMode,
  Rewrite,
  RewriteStatus,
} from "@/lib/types";

interface RewriteRow {
  id: string;
  draft: string;
  output: string;
  edited: string | null;
  genre: string;
  audience: string;
  tone: string | null;
  length_mode: string;
  intent: string;
  status: string;
  model: string | null;
  connection: string | null;
  profile_id: string | null;
  example_ids: string;
  checks: string | null;
  rating: number | null;
  feedback: string | null;
  approved: number;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapRewrite(row: RewriteRow): Rewrite {
  return {
    id: row.id,
    draft: row.draft,
    output: row.output,
    edited: row.edited,
    genre: row.genre as Genre,
    audience: row.audience as Audience,
    tone: row.tone,
    lengthMode: row.length_mode as LengthMode,
    intent: row.intent as Intent,
    status: row.status as RewriteStatus,
    model: row.model,
    connection: row.connection,
    profileId: row.profile_id,
    exampleIds: parseJson<string[]>(row.example_ids) ?? [],
    checks: parseJson<Checks>(row.checks),
    rating: row.rating,
    feedback: row.feedback,
    approved: row.approved === 1,
    latencyMs: row.latency_ms,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NewRewrite {
  draft: string;
  genre: Genre;
  audience: Audience;
  lengthMode: LengthMode;
  intent: Intent;
  model: string | null;
  connection: string | null;
  profileId: string | null;
  exampleIds: string[];
}

export function createRewrite(input: NewRewrite): Rewrite {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO rewrites
        (id, draft, output, genre, audience, length_mode, intent, status,
         model, connection, profile_id, example_ids, created_at, updated_at)
       VALUES (?, ?, '', ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.draft,
      input.genre,
      input.audience,
      input.lengthMode,
      input.intent,
      input.model,
      input.connection,
      input.profileId,
      JSON.stringify(input.exampleIds),
      now,
      now,
    );

  return getRewrite(id)!;
}

export interface RewritePatch {
  output?: string;
  edited?: string | null;
  checks?: Checks | null;
  status?: RewriteStatus;
  error?: string | null;
  latencyMs?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  rating?: number | null;
  feedback?: string | null;
  approved?: boolean;
}

export function updateRewrite(id: string, patch: RewritePatch): Rewrite | null {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  const add = (column: string, value: string | number | null) => {
    fields.push(`${column} = ?`);
    values.push(value);
  };

  if (patch.output !== undefined) add("output", patch.output);
  if (patch.edited !== undefined) add("edited", patch.edited);
  if (patch.checks !== undefined) {
    add("checks", patch.checks === null ? null : JSON.stringify(patch.checks));
  }
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.error !== undefined) add("error", patch.error);
  if (patch.latencyMs !== undefined) add("latency_ms", patch.latencyMs);
  if (patch.tokensIn !== undefined) add("tokens_in", patch.tokensIn);
  if (patch.tokensOut !== undefined) add("tokens_out", patch.tokensOut);
  if (patch.rating !== undefined) add("rating", patch.rating);
  if (patch.feedback !== undefined) add("feedback", patch.feedback);
  if (patch.approved !== undefined) add("approved", patch.approved ? 1 : 0);

  if (fields.length === 0) return getRewrite(id);

  values.push(new Date().toISOString(), id);
  getDb()
    .prepare(`UPDATE rewrites SET ${fields.join(", ")}, updated_at = ? WHERE id = ?`)
    .run(...values);

  return getRewrite(id);
}

export function getRewrite(id: string): Rewrite | null {
  const row = getDb()
    .prepare("SELECT * FROM rewrites WHERE id = ?")
    .get(id) as RewriteRow | undefined;
  return row ? mapRewrite(row) : null;
}

export function listRewrites(options: {
  q?: string;
  limit?: number;
  offset?: number;
}): { rewrites: Rewrite[]; total: number } {
  const db = getDb();
  const params: Array<string | number> = [];
  let where = "";

  if (options.q?.trim()) {
    where = "WHERE draft LIKE ? OR output LIKE ? OR edited LIKE ?";
    const query = `%${options.q.trim()}%`;
    params.push(query, query, query);
  }

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM rewrites ${where}`)
      .get(...params) as { n: number }
  ).n;

  const rows = db
    .prepare(
      `SELECT * FROM rewrites ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, options.limit ?? 30, options.offset ?? 0) as RewriteRow[];

  return { rewrites: rows.map(mapRewrite), total };
}

export function countRewrites(): number {
  return (
    getDb().prepare("SELECT COUNT(*) AS n FROM rewrites").get() as { n: number }
  ).n;
}

export function deleteRewrite(id: string): boolean {
  return getDb().prepare("DELETE FROM rewrites WHERE id = ?").run(id).changes > 0;
}
