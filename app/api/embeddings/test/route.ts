import { resolveApiKey } from "@/lib/connections";
import { errorResponse, jsonOk, readJson } from "@/lib/http";
import { embed } from "@/lib/llm";
import { embeddingTestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = embeddingTestSchema.parse(await readJson(request));
    const apiKey = resolveApiKey(body.baseUrl, body.apiKey, "embedding");
    const vectors = await embed(
      {
        baseUrl: body.baseUrl,
        apiKey,
      },
      body.model,
      ["Maya voice check"],
      { timeoutMs: 30_000 },
    );

    return jsonOk({
      ok: true,
      model: body.model,
      dimensions: vectors[0]?.length ?? 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
