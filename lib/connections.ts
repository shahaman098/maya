import type { ModelConnection } from "@/lib/llm";
import type {
  EmbeddingSettings,
  Settings,
  WriterMode,
} from "@/lib/types";
import { isLocalEndpoint } from "@/lib/utils";

export interface ActiveWriter {
  mode: WriterMode;
  label: string;
  model: string;
  temperature: number;
  connection: ModelConnection;
}

export interface ActiveEmbedding {
  model: string;
  connection: ModelConnection;
}

export function providerKeyEnv(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host.includes("openai.com")) return "OPENAI_API_KEY";
    if (host.includes("openrouter.ai")) return "OPENROUTER_API_KEY";
    if (host.includes("deepseek")) return "DEEPSEEK_API_KEY";
    if (host.includes("groq.com")) return "GROQ_API_KEY";
  } catch {
    // Invalid URLs are handled by the settings schema.
  }
  return "MAYA_CLOUD_API_KEY";
}

export function resolveApiKey(
  baseUrl: string,
  explicit: string | undefined,
  kind: "cloud" | "embedding" = "cloud",
): string {
  if (explicit?.trim()) return explicit.trim();
  if (isLocalEndpoint(baseUrl)) return "";

  if (kind === "embedding" && process.env.MAYA_EMBED_API_KEY?.trim()) {
    return process.env.MAYA_EMBED_API_KEY.trim();
  }

  const envName = providerKeyEnv(baseUrl);
  return process.env[envName]?.trim() || "";
}

export function activeWriter(settings: Settings): ActiveWriter {
  if (settings.writer.mode === "api") {
    const api = settings.writer.api;
    return {
      mode: "api",
      label: api.label,
      model: api.model,
      temperature: settings.writer.temperature,
      connection: {
        baseUrl: api.baseUrl,
        model: api.model,
        apiKey: resolveApiKey(api.baseUrl, api.apiKey, "cloud"),
        disableThinking: api.disableThinking,
      },
    };
  }

  return {
    mode: "local",
    label: settings.writer.label,
    model: settings.writer.model,
    temperature: settings.writer.temperature,
    connection: {
      baseUrl: settings.writer.baseUrl,
      model: settings.writer.model,
      apiKey: settings.writer.apiKey,
      disableThinking: settings.writer.disableThinking,
    },
  };
}

export function activeEmbedding(settings: Settings): ActiveEmbedding {
  const embedding: EmbeddingSettings = settings.embedding;
  return {
    model: embedding.model,
    connection: {
      baseUrl: embedding.baseUrl,
      model: embedding.model,
      apiKey: resolveApiKey(embedding.baseUrl, embedding.apiKey, "embedding"),
      disableThinking: false,
    },
  };
}
