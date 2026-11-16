import { errorResponse, jsonOk } from "@/lib/http";
import { listRewrites } from "@/lib/rewrites";
import { rewriteQuerySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const query = rewriteQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const { rewrites, total } = listRewrites(query);
    return jsonOk({ rewrites, total });
  } catch (error) {
    return errorResponse(error);
  }
}
