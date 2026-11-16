import { errorResponse, jsonOk, readJson } from "@/lib/http";
import {
  createSamples,
  getSampleCounts,
  listSamples,
} from "@/lib/samples";
import { sampleCreateSchema, sampleQuerySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const query = sampleQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const { samples, total } = listSamples(query);
    return jsonOk({ samples, total, counts: getSampleCounts() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = sampleCreateSchema.parse(await readJson(request));
    const result = createSamples([
      {
        text: body.text,
        genre: body.genre,
        audience: body.audience,
        language: body.language,
        source: body.source,
        consent: body.consent,
        redact: body.redact,
      },
    ]);

    if (result.samples.length === 0) {
      return jsonOk(
        { error: "That sample is already in the library.", duplicate: true },
        409,
      );
    }

    return jsonOk(
      {
        sample: result.samples[0],
        redactions: result.redactions,
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
