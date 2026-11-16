import { createEvalCase, listEvalCases, listEvalRuns } from "@/lib/eval";
import { errorResponse, jsonOk, readJson } from "@/lib/http";
import { evalCaseSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return jsonOk({ cases: listEvalCases(), runs: listEvalRuns() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = evalCaseSchema.parse(await readJson(request));
    const testCase = createEvalCase({
      name: body.name,
      draft: body.draft,
      genre: body.genre,
      audience: body.audience,
      notes: body.notes,
    });
    return jsonOk({ case: testCase }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
