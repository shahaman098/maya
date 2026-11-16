import { deleteEvalCase } from "@/lib/eval";
import { errorResponse, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    deleteEvalCase(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
