import { listEvalRuns } from "@/lib/eval";
import { errorResponse, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const caseId = new URL(request.url).searchParams.get("caseId") ?? undefined;
    return jsonOk({ runs: listEvalRuns(caseId) });
  } catch (error) {
    return errorResponse(error);
  }
}
