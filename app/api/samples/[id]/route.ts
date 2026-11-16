import {
  errorResponse,
  jsonOk,
  notFound,
  readJson,
} from "@/lib/http";
import { deleteSample, getSample, updateSample } from "@/lib/samples";
import { sampleUpdateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const sample = getSample(id);
    if (!sample) throw notFound("That sample no longer exists.");
    return jsonOk({ sample });
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
    const body = sampleUpdateSchema.parse(await readJson(request));
    const sample = updateSample(id, body);
    if (!sample) throw notFound("That sample no longer exists.");
    return jsonOk({ sample });
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
    deleteSample(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
