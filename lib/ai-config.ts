export type RuntimeEnv = Record<string, string | undefined>;

function value(env: RuntimeEnv, name: string): string {
  return env[name]?.trim() || "";
}

export function textAIConfig(env: RuntimeEnv) {
  const deepseekKey = value(env, "DEEPSEEK_API_KEY");
  const openaiKey = value(env, "OPENAI_API_KEY");
  const provider = deepseekKey ? "DeepSeek" : openaiKey ? "OpenAI" : "DeepSeek";
  const apiKey = deepseekKey || openaiKey;
  const baseUrl =
    value(env, "DEEPSEEK_BASE_URL") ||
    (provider === "DeepSeek"
      ? "https://api.deepseek.com"
      : "https://api.openai.com/v1");
  const model =
    value(env, "DEEPSEEK_TEXT_MODEL") ||
    (provider === "DeepSeek"
      ? "deepseek-flash"
      : value(env, "OPENAI_TEXT_MODEL") || "gpt-4o-mini");
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, ""), model, provider };
}

export function transcriptionAIConfig(env: RuntimeEnv) {
  const apiKey =
    value(env, "TRANSCRIPTION_API_KEY") || value(env, "OPENAI_API_KEY");
  const baseUrl =
    value(env, "TRANSCRIPTION_API_BASE_URL") || "https://api.openai.com/v1";
  const model = value(env, "TRANSCRIPTION_MODEL") || "whisper-1";
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    provider: apiKey
      ? value(env, "TRANSCRIPTION_PROVIDER") || "语音转写服务"
      : "未配置",
  };
}
