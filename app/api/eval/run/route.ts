import { runEvalVariant } from "@/lib/eval";
import { ApiError, errorResponse, jsonOk, readJson } from "@/lib/http";
import { evalRunSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = evalRunSchema.parse(await readJson(request));
    if (body.variant === "baseline" && !getSettings().baseline.enabled) {
      throw new ApiError(
        "Add and enable a baseline model in Settings before running that comparison.",
        400,
      );
    }

    const run = await runEvalVariant({
      caseId: body.caseId,
      variant: body.variant,
      batchId: body.batchId,
    });
    return jsonOk({ run });
  } catch (error) {
    return errorResponse(error);
  }
}
