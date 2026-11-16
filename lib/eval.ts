import { activeWriter } from "@/lib/connections";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { executeRewrite, type RewriteVariant } from "@/lib/rewrite";
import { getSettings } from "@/lib/settings";
import type {
  Audience,
  Checks,
  EvalCase,
  EvalRun,
  EvalVariant,
  Genre,
  RewriteStatus,
} from "@/lib/types";
import { truncate } from "@/lib/utils";

interface EvalCaseRow {
  id: string;
  name: string;
  draft: string;
  genre: string;
  audience: string;
  notes: string | null;
  created_at: string;
}

interface EvalRunRow {
  id: string;
  batch_id: string;
  case_id: string;
  variant: string;
  model: string | null;
  output: string;
  checks: string | null;
  manual_rating: number | null;
  status: string;
  error: string | null;
  latency_ms: number | null;
  created_at: string;
}

function mapCase(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    name: row.name,
    draft: row.draft,
    genre: row.genre as Genre,
    audience: row.audience as Audience,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapRun(row: EvalRunRow): EvalRun {
  let checks: Checks | null = null;
  if (row.checks) {
    try {
      checks = JSON.parse(row.checks) as Checks;
    } catch {
      checks = null;
    }
  }

  return {
    id: row.id,
    batchId: row.batch_id,
    caseId: row.case_id,
    variant: row.variant as EvalVariant,
    model: row.model,
    output: row.output,
    checks,
    manualRating: row.manual_rating,
    status: row.status as RewriteStatus,
    error: row.error,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  };
}

export function createEvalCase(input: {
  name?: string;
  draft: string;
  genre: Genre;
  audience: Audience;
  notes?: string;
}): EvalCase {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const name = input.name?.trim() || truncate(input.draft, 54);

  getDb()
    .prepare(
      `INSERT INTO eval_cases (id, name, draft, genre, audience, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      name,
      input.draft,
      input.genre,
      input.audience,
      input.notes?.trim() || null,
      createdAt,
    );

  return getEvalCase(id)!;
}

export function getEvalCase(id: string): EvalCase | null {
  const row = getDb()
    .prepare("SELECT * FROM eval_cases WHERE id = ?")
    .get(id) as EvalCaseRow | undefined;
  return row ? mapCase(row) : null;
}

export function listEvalCases(): EvalCase[] {
  const rows = getDb()
    .prepare("SELECT * FROM eval_cases ORDER BY created_at DESC, id DESC")
    .all() as EvalCaseRow[];
  return rows.map(mapCase);
}

export function deleteEvalCase(id: string): boolean {
  return getDb().prepare("DELETE FROM eval_cases WHERE id = ?").run(id).changes > 0;
}

export function listEvalRuns(caseId?: string): EvalRun[] {
  const db = getDb();
  const rows = (
    caseId
      ? db
          .prepare(
            "SELECT * FROM eval_runs WHERE case_id = ? ORDER BY created_at DESC, id DESC",
          )
          .all(caseId)
      : db
          .prepare("SELECT * FROM eval_runs ORDER BY created_at DESC, id DESC")
          .all()
  ) as EvalRunRow[];
  return rows.map(mapRun);
}

export function getEvalRun(id: string): EvalRun | null {
  const row = getDb()
    .prepare("SELECT * FROM eval_runs WHERE id = ?")
    .get(id) as EvalRunRow | undefined;
  return row ? mapRun(row) : null;
}

export function updateEvalRunRating(
  id: string,
  manualRating: number | null,
): EvalRun | null {
  getDb()
    .prepare("UPDATE eval_runs SET manual_rating = ? WHERE id = ?")
    .run(manualRating, id);
  return getEvalRun(id);
}

function insertEvalRun(input: {
  batchId: string;
  caseId: string;
  variant: EvalVariant;
  model: string | null;
}): string {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO eval_runs
        (id, batch_id, case_id, variant, model, output, status, created_at)
       VALUES (?, ?, ?, ?, ?, '', 'running', ?)`,
    )
    .run(
      id,
      input.batchId,
      input.caseId,
      input.variant,
      input.model,
      new Date().toISOString(),
    );
  return id;
}

export async function runEvalVariant(input: {
  caseId: string;
  variant: EvalVariant;
  batchId?: string;
}): Promise<EvalRun> {
  const testCase = getEvalCase(input.caseId);
  if (!testCase) throw new ApiError("That test case no longer exists.", 404);

  const settings = getSettings();
  const initialModel =
    input.variant === "baseline"
      ? settings.baseline.model
      : activeWriter(settings).model;
  const batchId = input.batchId ?? crypto.randomUUID();
  const id = insertEvalRun({
    batchId,
    caseId: testCase.id,
    variant: input.variant,
    model: initialModel,
  });

  try {
    const result = await executeRewrite(
      {
        draft: testCase.draft,
        genre: testCase.genre,
        audience: testCase.audience,
        lengthMode: "same",
        intent: "preserve",
      },
      input.variant as RewriteVariant,
      { repair: input.variant === "voice" },
    );

    getDb()
      .prepare(
        `UPDATE eval_runs SET
          output = ?, checks = ?, model = ?, status = 'done', latency_ms = ?
         WHERE id = ?`,
      )
      .run(
        result.output,
        JSON.stringify(result.checks),
        result.prepared.model,
        result.latencyMs,
        id,
      );
  } catch (error) {
    getDb()
      .prepare(
        "UPDATE eval_runs SET status = 'error', error = ?, model = ? WHERE id = ?",
      )
      .run(
        error instanceof Error ? error.message : "The run failed.",
        initialModel,
        id,
      );
  }

  return getEvalRun(id)!;
}
