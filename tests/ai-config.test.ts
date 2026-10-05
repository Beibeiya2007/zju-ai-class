import assert from "node:assert/strict";
import test from "node:test";
import { textAIConfig, transcriptionAIConfig } from "../lib/ai-config.ts";

test("DeepSeek is the default text provider with its documented base URL and model", () => {
  assert.deepEqual(textAIConfig({ DEEPSEEK_API_KEY: "secret" }), {
    apiKey: "secret",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    provider: "DeepSeek",
  });
});

test("DeepSeek can use a custom compatible gateway and model", () => {
  assert.deepEqual(
    textAIConfig({
      DEEPSEEK_API_KEY: "secret",
      DEEPSEEK_BASE_URL: "https://gateway.example/v1/",
      DEEPSEEK_TEXT_MODEL: "deepseek-v4-pro",
    }),
    {
      apiKey: "secret",
      baseUrl: "https://gateway.example/v1",
      model: "deepseek-v4-pro",
      provider: "DeepSeek",
    },
  );
});

test("existing OpenAI text and transcription settings remain supported", () => {
  assert.equal(
    textAIConfig({ OPENAI_API_KEY: "openai-key" }).baseUrl,
    "https://api.openai.com/v1",
  );
  assert.deepEqual(transcriptionAIConfig({ OPENAI_API_KEY: "openai-key" }), {
    apiKey: "openai-key",
    baseUrl: "https://api.openai.com/v1",
    model: "whisper-1",
    provider: "语音转写服务",
  });
});

test("transcription can be configured independently from DeepSeek text", () => {
  assert.deepEqual(
    transcriptionAIConfig({
      TRANSCRIPTION_API_KEY: "asr-key",
      TRANSCRIPTION_API_BASE_URL: "https://asr.example/v1/",
      TRANSCRIPTION_MODEL: "whisper-compatible-model",
      TRANSCRIPTION_PROVIDER: "ASR 服务",
    }),
    {
      apiKey: "asr-key",
      baseUrl: "https://asr.example/v1",
      model: "whisper-compatible-model",
      provider: "ASR 服务",
    },
  );
});
