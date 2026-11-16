import { errorResponse, jsonOk } from "@/lib/http";
import { checkModel } from "@/lib/llm";
import { getLatestProfile } from "@/lib/profile";
import { countSamples } from "@/lib/samples";
import { getSettings } from "@/lib/settings";
import type { HealthResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ModelHealth {
  ok: boolean;
  model: string;
  models: string[];
  error?: string;
}

let cache: { key: string; at: number; value: ModelHealth } | null = null;

export async function GET(): Promise<Response> {
  try {
    const settings = getSettings();
    const samples = countSamples();
    const profile = getLatestProfile();
    const key = `${settings.writer.baseUrl}|${settings.writer.model}|${settings.writer.apiKey}`;
    const now = Date.now();

    let writer: ModelHealth;
    if (cache && cache.key === key && now - cache.at < 20_000) {
      writer = cache.value;
    } else {
      const check = await checkModel({
        baseUrl: settings.writer.baseUrl,
        model: settings.writer.model,
        apiKey: settings.writer.apiKey,
      });
      writer = {
        ok: check.ok,
        model: settings.writer.model,
        models: check.models,
        ...(check.error ? { error: check.error } : {}),
      };
      cache = { key, at: now, value: writer };
    }

    const response: HealthResponse = {
      ok: true,
      version: "0.1.0",
      samples,
      profile: profile
        ? {
            id: profile.id,
            version: profile.version,
            sampleCount: profile.sampleCount,
            status: profile.status,
            createdAt: profile.createdAt,
          }
        : null,
      writer,
    };

    return jsonOk(response);
  } catch (error) {
    return errorResponse(error);
  }
}
