import {
  errorResponse,
  jsonOk,
  notFound,
  readJson,
} from "@/lib/http";
import {
  deleteRewrite,
  getRewrite,
  updateRewrite,
  type RewritePatch,
} from "@/lib/rewrites";
import { feedbackSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const rewrite = getRewrite(id);
    if (!rewrite) throw notFound("That rewrite no longer exists.");
    return jsonOk({ rewrite });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const body = feedbackSchema.parse(await readJson(request));
    const patch: RewritePatch = {};

    if (body.edited !== undefined) {
      patch.edited = body.edited?.trim() ? body.edited : null;
    }
    if (body.rating !== undefined) patch.rating = body.rating;
    if (body.feedback !== undefined) {
      patch.feedback = body.feedback?.trim() ? body.feedback : null;
    }
    if (body.approved !== undefined) patch.approved = body.approved;

    const rewrite = updateRewrite(id, patch);
    if (!rewrite) throw notFound("That rewrite no longer exists.");
    return jsonOk({ rewrite });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    deleteRewrite(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
