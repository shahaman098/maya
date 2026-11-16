export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ModelConnection {
  baseUrl: string;
  model: string;
  apiKey?: string;
  disableThinking?: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  json?: boolean;
  onUsage?: (usage: TokenUsage) => void;
}

export interface ChatResult {
  content: string;
  usage: TokenUsage;
  model: string;
}

export type LLMErrorCode =
  | "cancelled"
  | "timeout"
  | "network"
  | "http"
  | "empty";

export class LLMError extends Error {
  status?: number;
  hint?: string;
  code?: LLMErrorCode;

  constructor(
    message: string,
    options: { status?: number; hint?: string; code?: LLMErrorCode } = {},
  ) {
    super(message);
    this.name = "LLMError";
    this.status = options.status;
    this.hint = options.hint;
    this.code = options.code;
  }
}

export function apiRoot(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) throw new LLMError("No model endpoint is configured.");
  if (/\/v\d+$/.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

function headersFor(
  connection: ModelConnection,
  accept?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (connection.apiKey?.trim()) {
    headers.Authorization = `Bearer ${connection.apiKey.trim()}`;
  }
  if (accept) headers.Accept = accept;
  return headers;
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function fetchFailure(
  error: unknown,
  connection: ModelConnection,
  signal?: AbortSignal,
): LLMError {
  if (signal?.aborted) {
    return new LLMError("The rewrite was stopped.", { code: "cancelled" });
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return new LLMError("The model took too long to respond.", {
      code: "timeout",
      hint: "Try a smaller model or a shorter draft. Local models can take a while on the first run.",
    });
  }
  if (isAbort(error)) {
    return new LLMError("The model request was cancelled.", {
      code: "cancelled",
    });
  }
  return new LLMError(
    `Could not reach the model at ${apiRoot(connection.baseUrl)}.`,
    {
      code: "network",
      hint: "If you use Ollama, run `ollama serve` and check the base URL in Settings.",
    },
  );
}

function httpFailure(
  status: number,
  rawBody: string,
  connection: ModelConnection,
): LLMError {
  let message = rawBody.trim().slice(0, 400);
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") message = parsed.error;
    else if (parsed.error?.message) message = parsed.error.message;
    else if (parsed.message) message = parsed.message;
  } catch {
    // Keep the raw body.
  }

  if (status === 401 || status === 403) {
    return new LLMError("The model endpoint rejected the API key.", {
      status,
      code: "http",
      hint: "Check the API key in Settings.",
    });
  }
  if (status === 404) {
    return new LLMError(`Model "${connection.model}" was not found at this endpoint.`, {
      status,
      code: "http",
      hint: `Try \`ollama pull ${connection.model}\`, or choose another model in Settings.`,
    });
  }
  if (status === 429) {
    return new LLMError("The model endpoint is rate-limiting requests.", {
      status,
      code: "http",
      hint: "Wait a moment, or use a local model.",
    });
  }
  if (status >= 500) {
    return new LLMError(`The model endpoint returned a server error (${status}).`, {
      status,
      code: "http",
      hint: message || "Check that the model is still running.",
    });
  }
  return new LLMError(
    message || `The model endpoint rejected the request (${status}).`,
    {
      status,
      code: "http",
      hint: "Check the base URL, model name, and connection settings.",
    },
  );
}

async function post(
  connection: ModelConnection,
  path: string,
  body: Record<string, unknown>,
  options: ChatOptions,
): Promise<Response> {
  const url = `${apiRoot(connection.baseUrl)}${path}`;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 180_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: headersFor(
        connection,
        path.includes("chat") ? "text/event-stream, application/json" : undefined,
      ),
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw fetchFailure(error, connection, options.signal);
  }

  if (!response.ok) {
    const raw = await response.text();
    throw httpFailure(response.status, raw, connection);
  }

  return response;
}

async function postChat(
  connection: ModelConnection,
  body: Record<string, unknown>,
  options: ChatOptions,
): Promise<Response> {
  let attempts = 0;

  while (attempts < 7) {
    try {
      return await post(connection, "/chat/completions", body, options);
    } catch (error) {
      attempts += 1;
      if (!(error instanceof LLMError) || error.status !== 400) throw error;

      const message = error.message.toLowerCase();
      if (/invalid model|model.*(?:not|does not exist)/i.test(message)) {
        throw error;
      }

      if (/max_tokens|max_completion_tokens/.test(message) && "max_tokens" in body) {
        body.max_completion_tokens = body.max_tokens;
        delete body.max_tokens;
        continue;
      }
      if (/temperature/.test(message) && "temperature" in body) {
        delete body.temperature;
        continue;
      }
      if (/top_p/.test(message) && "top_p" in body) {
        delete body.top_p;
        continue;
      }
      if (/reasoning_effort/.test(message) && "reasoning_effort" in body) {
        delete body.reasoning_effort;
        continue;
      }
      if (/response_format/.test(message) && "response_format" in body) {
        delete body.response_format;
        continue;
      }

      // Some gateways return a generic invalid-request body. Try the
      // common compatibility removals once each before giving up.
      if ("reasoning_effort" in body) {
        delete body.reasoning_effort;
        continue;
      }
      if ("response_format" in body) {
        delete body.response_format;
        continue;
      }
      if ("temperature" in body) {
        delete body.temperature;
        continue;
      }
      if ("top_p" in body) {
        delete body.top_p;
        continue;
      }
      if ("max_tokens" in body) {
        body.max_completion_tokens = body.max_tokens;
        delete body.max_tokens;
        continue;
      }

      throw error;
    }
  }

  throw new LLMError("The model endpoint rejected the request.", {
    code: "http",
  });
}

function readUsage(payload: Record<string, unknown>): TokenUsage {
  const usage =
    payload.usage && typeof payload.usage === "object"
      ? (payload.usage as Record<string, unknown>)
      : {};
  const input = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const output = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  return {
    input: Number.isFinite(input) ? input : 0,
    output: Number.isFinite(output) ? output : 0,
  };
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const value = (part as { text?: unknown }).text;
        if (typeof value === "string") return value;
      }
      return "";
    })
    .join("");
}

function extractContent(
  payload: Record<string, unknown>,
  connection: ModelConnection,
): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const choice = choices[0] as
    | {
        message?: {
          content?: unknown;
          reasoning?: unknown;
          reasoning_content?: unknown;
        };
        text?: unknown;
        finish_reason?: unknown;
      }
    | undefined;

  const content =
    textFromContent(choice?.message?.content) ||
    (typeof choice?.text === "string" ? choice.text : "");

  if (content.trim()) return content;

  const reasoning = choice?.message?.reasoning ?? choice?.message?.reasoning_content;
  if (typeof reasoning === "string" && reasoning.trim()) {
    throw new LLMError("The model produced reasoning but no answer.", {
      code: "empty",
      hint: "Turn on 'Skip model reasoning' in Settings, or raise the output limit.",
    });
  }

  if (choice?.finish_reason === "length") {
    throw new LLMError("The model ran out of room before writing an answer.", {
      code: "empty",
      hint: "Raise the output limit or shorten the draft.",
    });
  }

  throw new LLMError(`The model at ${connection.model} returned no text.`, {
    code: "empty",
    hint: "Check that the model is a chat/instruction model.",
  });
}

export async function chat(
  connection: ModelConnection,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: connection.model,
    messages,
    stream: false,
    temperature: options.temperature ?? 0.8,
    top_p: 0.95,
    max_tokens: options.maxTokens ?? 1200,
  };
  if (connection.disableThinking) body.reasoning_effort = "none";
  if (options.json) body.response_format = { type: "json_object" };

  const response = await postChat(connection, body, options);
  const payload = (await response.json()) as Record<string, unknown>;
  const content = extractContent(payload, connection);
  const usage = readUsage(payload);
  options.onUsage?.(usage);

  return {
    content,
    usage,
    model:
      typeof payload.model === "string" ? payload.model : connection.model,
  };
}

function deltaText(delta: unknown): string {
  if (!delta || typeof delta !== "object") return "";
  const record = delta as { content?: unknown };
  return textFromContent(record.content);
}

export async function* streamChat(
  connection: ModelConnection,
  messages: ChatMessage[],
  options: ChatOptions = {},
): AsyncGenerator<string, void, void> {
  const body: Record<string, unknown> = {
    model: connection.model,
    messages,
    stream: true,
    temperature: options.temperature ?? 0.8,
    top_p: 0.95,
    max_tokens: options.maxTokens ?? 1200,
  };
  if (connection.disableThinking) body.reasoning_effort = "none";

  const response = await postChat(connection, body, {
    ...options,
    timeoutMs: options.timeoutMs ?? 300_000,
  });

  if (!response.body) {
    throw new LLMError("The model returned an empty stream.", {
      code: "empty",
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let emitted = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");

        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") return;

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }

        const choices = Array.isArray(payload.choices) ? payload.choices : [];
        const choice = choices[0] as
          | { delta?: unknown; finish_reason?: unknown }
          | undefined;
        const text = deltaText(choice?.delta);
        if (text) {
          emitted = true;
          yield text;
        }

        if (payload.usage) {
          options.onUsage?.(readUsage(payload));
        }
      }
    }

    if (!emitted) {
      throw new LLMError("The model finished without writing anything.", {
        code: "empty",
        hint: "Try again, or turn on 'Skip model reasoning' in Settings.",
      });
    }
  } catch (error) {
    if (error instanceof LLMError) throw error;
    if (isAbort(error)) {
      throw new LLMError("The rewrite was stopped.", { code: "cancelled" });
    }
    throw new LLMError("The model connection dropped mid-reply.", {
      code: "network",
      hint: "Check that the local model is still running.",
    });
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Already closed.
    }
    reader.releaseLock();
  }
}

export async function listModels(
  connection: Pick<ModelConnection, "baseUrl" | "apiKey">,
  timeoutMs = 8000,
): Promise<string[]> {
  const root = apiRoot(connection.baseUrl);
  const headers: Record<string, string> = {};
  if (connection.apiKey?.trim()) {
    headers.Authorization = `Bearer ${connection.apiKey.trim()}`;
  }

  let response: Response;
  try {
    response = await fetch(`${root}/models`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new LLMError("The model endpoint did not answer in time.", {
        code: "timeout",
      });
    }
    throw new LLMError(`Could not reach the model at ${root}.`, {
      code: "network",
      hint: "If you use Ollama, run `ollama serve`.",
    });
  }

  if (!response.ok) {
    const raw = await response.text();
    throw httpFailure(response.status, raw, {
      baseUrl: connection.baseUrl,
      model: "unknown",
    });
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const data = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : [];

  return data
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      for (const key of ["id", "name", "model"]) {
        if (typeof record[key] === "string") return record[key] as string;
      }
      return "";
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export async function checkModel(connection: ModelConnection): Promise<{
  ok: boolean;
  models: string[];
  error?: string;
}> {
  if (!connection.model.trim()) {
    return {
      ok: false,
      models: [],
      error: "No model is configured for this connection.",
    };
  }

  try {
    const models = await listModels(connection, 5000);
    const found = models.some(
      (model) =>
        model === connection.model ||
        model.startsWith(`${connection.model}:`) ||
        connection.model.startsWith(`${model}:`),
    );
    if (models.length > 0 && !found) {
      return {
        ok: false,
        models,
        error: `Model "${connection.model}" is not installed at this endpoint.`,
      };
    }
    return { ok: true, models };
  } catch (error) {
    return {
      ok: false,
      models: [],
      error:
        error instanceof Error ? error.message : "The endpoint is unreachable.",
    };
  }
}

export async function embed(
  connection: Pick<ModelConnection, "baseUrl" | "apiKey">,
  model: string,
  inputs: string[],
  options: ChatOptions = {},
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const response = await post(
    { baseUrl: connection.baseUrl, model, apiKey: connection.apiKey },
    "/embeddings",
    { model, input: inputs },
    { ...options, timeoutMs: options.timeoutMs ?? 60_000 },
  );

  const payload = (await response.json()) as Record<string, unknown>;
  const data = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.embeddings)
      ? payload.embeddings
      : [];

  const vectors = data
    .map((item) => {
      if (Array.isArray(item)) {
        return item.filter((value): value is number => typeof value === "number");
      }
      if (item && typeof item === "object") {
        const embedding = (item as { embedding?: unknown }).embedding;
        if (Array.isArray(embedding)) {
          return embedding.filter(
            (value): value is number => typeof value === "number",
          );
        }
      }
      return [];
    })
    .filter((vector) => vector.length > 0);

  if (vectors.length !== inputs.length) {
    throw new LLMError(
      `The embedding model "${model}" returned ${vectors.length} vectors for ${inputs.length} inputs.`,
      { code: "http", hint: "Check that the endpoint supports /v1/embeddings." },
    );
  }

  return vectors;
}
