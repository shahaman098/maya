import { updateEvalRunRating } from "@/lib/eval";
import {
  errorResponse,
  jsonOk,
  notFound,
  readJson,
} from "@/lib/http";
import { evalRatingSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const body = evalRatingSchema.parse(await readJson(request));
    const run = updateEvalRunRating(id, body.manualRating);
    if (!run) throw notFound("That evaluation run no longer exists.");
    return jsonOk({ run });
  } catch (error) {
    return errorResponse(error);
  }
}
