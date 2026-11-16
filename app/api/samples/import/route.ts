import {
  ApiError,
  errorResponse,
  jsonOk,
  readJson,
} from "@/lib/http";
import {
  cleanImportedTexts,
  parseWhatsAppExport,
  splitBulk,
} from "@/lib/importers";
import { createSamples } from "@/lib/samples";
import { sampleImportSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = sampleImportSchema.parse(await readJson(request));
    const settings = getSettings();

    let texts: string[] = [];
    if (body.texts && body.texts.length > 0) {
      texts = cleanImportedTexts(body.texts);
    } else if (body.raw) {
      if (body.mode === "whatsapp") {
        texts = parseWhatsAppExport(body.raw, body.name || settings.person.name);
      } else {
        texts = splitBulk(body.raw);
      }
    }

    if (texts.length === 0) {
      throw new ApiError(
        body.mode === "whatsapp"
          ? "No messages from that name were found in the export. Check the display name and try again."
          : "No usable samples were found. Each sample needs at least 12 characters.",
        400,
      );
    }

    const result = createSamples(
      texts.map((text) => ({
        text,
        genre: body.genre,
        audience: body.audience,
        language: body.language,
        source: body.source,
        consent: body.consent,
        redact: body.redact,
      })),
    );

    return jsonOk({
      imported: result.imported,
      duplicates: result.duplicates,
      redactions: result.redactions,
      sample: result.samples[0] ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
