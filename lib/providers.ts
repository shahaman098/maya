export interface ApiPreset {
  value: "openai" | "openrouter" | "deepseek" | "groq" | "custom";
  label: string;
  baseUrl: string;
  model: string;
  /** Where a person creates a key for this provider. */
  keyUrl: string;
}

export const API_PRESETS: readonly ApiPreset[] = [
  {
    value: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1",
    keyUrl: "https://openrouter.ai/keys",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    value: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
  },
  { value: "custom", label: "Custom", baseUrl: "", model: "", keyUrl: "" },
];

export function presetForBaseUrl(baseUrl: string): ApiPreset["value"] {
  return (
    API_PRESETS.find(
      (preset) => preset.value !== "custom" && preset.baseUrl === baseUrl,
    )?.value ?? "custom"
  );
}
