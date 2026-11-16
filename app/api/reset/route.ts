import { resetDatabase } from "@/lib/db";
import { errorResponse, jsonOk, readJson } from "@/lib/http";
import { resetSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    resetSchema.parse(await readJson(request));
    resetDatabase();
    return jsonOk({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
