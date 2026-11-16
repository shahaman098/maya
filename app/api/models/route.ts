import { activeWriter, resolveApiKey } from "@/lib/connections";
import { errorResponse, jsonOk, readJson } from "@/lib/http";
import { listModels } from "@/lib/llm";
import { modelsTestSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const target = new URL(request.url).searchParams.get("target") ?? "writer";
    const settings = getSettings();
    const connection =
      target === "baseline"
        ? settings.baseline
        : activeWriter(settings).connection;
    const models = await listModels(connection, 8000);
    return jsonOk({ models });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = modelsTestSchema.parse(await readJson(request));
    const apiKey = resolveApiKey(body.baseUrl, body.apiKey ?? "", "cloud");
    const models = await listModels(
      { baseUrl: body.baseUrl, apiKey },
      8000,
    );
    return jsonOk({ models });
  } catch (error) {
    return errorResponse(error);
  }
}
