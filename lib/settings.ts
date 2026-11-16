import { getDb } from "@/lib/db";
import { settingsSchema } from "@/lib/schemas";
import type { Settings } from "@/lib/types";

const env = process.env;

export const DEFAULT_SETTINGS: Settings = {
  person: {
    name: "Maya",
  },
  writer: {
    mode: "local",
    label: "Local model",
    baseUrl: env.MAYA_BASE_URL?.trim() || "http://127.0.0.1:11434/v1",
    model: env.MAYA_MODEL?.trim() || "qwen3.5:9b",
    apiKey: env.MAYA_API_KEY?.trim() || "",
    temperature: 0.65,
    maxExamples: 2,
    repairPass: true,
    semanticRetrieval: true,
    disableThinking: true,
    api: {
      label: "Cloud API",
      baseUrl:
        env.MAYA_CLOUD_BASE_URL?.trim() || "https://api.openai.com/v1",
      model: env.MAYA_CLOUD_MODEL?.trim() || "gpt-4.1",
      apiKey: env.MAYA_CLOUD_API_KEY?.trim() || "",
      disableThinking: false,
    },
  },
  baseline: {
    enabled: false,
    label: "Humanizer 12B",
    baseUrl: "http://127.0.0.1:8081/v1",
    model: "humanizer",
    apiKey: "",
    temperature: 1,
    disableThinking: false,
  },
  embedding: {
    baseUrl:
      env.MAYA_EMBED_BASE_URL?.trim() ||
      env.MAYA_BASE_URL?.trim() ||
      "http://127.0.0.1:11434/v1",
    model: env.MAYA_EMBED_MODEL?.trim() || "all-minilm",
    apiKey: env.MAYA_EMBED_API_KEY?.trim() || "",
  },
  privacy: {
    redactPii: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!isRecord(base) || !isRecord(patch)) return patch as T;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    merged[key] = key in merged ? deepMerge(merged[key], value) : value;
  }
  return merged as T;
}

export function getSettings(): Settings {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'app'")
    .get() as { value: string } | undefined;

  if (!row) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(row.value) as unknown;
    const merged = deepMerge(DEFAULT_SETTINGS, parsed);
    const result = settingsSchema.safeParse(merged);
    if (!result.success) {
      console.warn("Stored settings were invalid; using defaults.");
      return DEFAULT_SETTINGS;
    }
    return result.data;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): Settings {
  const validated = settingsSchema.parse(settings);
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('app', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(validated), now);
  return validated;
}

export function updateSettings(patch: unknown): Settings {
  const merged = deepMerge(getSettings(), patch);
  const validated = settingsSchema.parse(merged);
  return saveSettings(validated);
}
