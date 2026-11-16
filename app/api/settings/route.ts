import { getDb, getDbPath } from "@/lib/db";
import { errorResponse, jsonOk, readJson } from "@/lib/http";
import { settingsPatchSchema } from "@/lib/schemas";
import { getSettings, updateSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return jsonOk({ settings: getSettings(), database: getDbPath() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const body = settingsPatchSchema.parse(await readJson(request));
    const previous = getSettings();
    const next = updateSettings(body);

    if (
      previous.writer.baseUrl !== next.writer.baseUrl ||
      previous.writer.embeddingModel !== next.writer.embeddingModel
    ) {
      getDb()
        .prepare(
          "UPDATE samples SET embedding = NULL, embedding_model = NULL",
        )
        .run();
    }

    return jsonOk({ settings: next });
  } catch (error) {
    return errorResponse(error);
  }
}
