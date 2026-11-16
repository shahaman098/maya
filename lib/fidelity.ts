import { chat, type ModelConnection } from "@/lib/llm";
import { cleanModelOutput, truncate } from "@/lib/utils";

export interface FidelityReport {
  missing: string[];
  added: string[];
}

export function fidelityCost(report: FidelityReport | null): number {
  if (!report) return 0;
  return report.missing.length + report.added.length;
}

export function fidelityAcceptable(
  first: FidelityReport | null,
  candidate: FidelityReport | null,
): boolean {
  if (!first) {
    return (
      !candidate || (candidate.missing.length === 0 && candidate.added.length === 0)
    );
  }
  if (!candidate) return false;
  return fidelityCost(candidate) <= fidelityCost(first);
}

function parseReport(raw: string): FidelityReport | null {
  const cleaned = cleanModelOutput(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let data: unknown;
  try {
    data = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }

  if (!data || typeof data !== "object") return null;
  const record = data as { missing?: unknown; added?: unknown };

  const normalize = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(
            (item) =>
              item.length > 0 &&
              !/^(?:none|n\/a|nothing|no missing details|no added claims)$/i.test(
                item,
              ),
          )
          .map((item) => truncate(item, 160)),
      ),
    ].slice(0, 8);
  };

  return {
    missing: normalize(record.missing),
    added: normalize(record.added),
  };
}

export async function auditFidelity(input: {
  connection: ModelConnection;
  draft: string;
  output: string;
  signal?: AbortSignal;
}): Promise<FidelityReport | null> {
  if (input.draft.trim().length < 20 || input.output.trim().length < 20) {
    return null;
  }

  const system = `You are a strict fact auditor. Compare a draft with a rewrite of that draft.

List concrete details from the draft that are missing or changed in the rewrite, and claims in the rewrite that the draft does not support.

Rules:
- Treat new feelings, reactions, opinions, and invented events as "added" content.
- Ignore style, tone, brevity, reordering, and synonyms.
- A shorter sentence is fine if it keeps the same detail.
- Do not list the writer's name, greetings, or formatting.
- Do not invent a problem to seem thorough.
- If nothing is missing or added, return empty arrays.

Return only a JSON object in this exact shape:
{"missing":["short phrase from the draft"],"added":["short phrase from the rewrite"]}`;

  const user = `Draft:
<draft>
${truncate(input.draft, 8000)}
</draft>

Rewrite:
<rewrite>
${truncate(input.output, 8000)}
</rewrite>`;

  try {
    const result = await chat(
      input.connection,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        temperature: 0.1,
        maxTokens: 600,
        json: true,
        timeoutMs: 90_000,
        signal: input.signal,
      },
    );

    return parseReport(result.content);
  } catch {
    return null;
  }
}
