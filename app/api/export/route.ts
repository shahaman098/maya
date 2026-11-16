import { listEvalCases, listEvalRuns } from "@/lib/eval";
import { errorResponse } from "@/lib/http";
import { getLatestProfile } from "@/lib/profile";
import { listRewrites } from "@/lib/rewrites";
import { listSamples } from "@/lib/samples";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const settings = getSettings();
    const samples = listSamples({ limit: 100_000 }).samples;
    const rewrites = listRewrites({ limit: 100_000 }).rewrites;
    const profile = getLatestProfile();
    const cases = listEvalCases();
    const runs = listEvalRuns();

    const safeSettings = {
      ...settings,
      writer: {
        ...settings.writer,
        apiKey: "",
        api: { ...settings.writer.api, apiKey: "" },
      },
      baseline: { ...settings.baseline, apiKey: "" },
      embedding: { ...settings.embedding, apiKey: "" },
    };

    const payload = {
      product: "Maya",
      version: "0.1.0",
      exportedAt: new Date().toISOString(),
      note: "API keys are not included in this export.",
      settings: safeSettings,
      profile,
      samples,
      rewrites,
      evalCases: cases,
      evalRuns: runs,
    };

    const filename = `maya-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
