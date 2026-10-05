import { z } from "zod";
import { textAIConfig, transcriptionAIConfig } from "./ai-config";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function failure(error: unknown): Response {
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return Response.json(
      { error: "资料格式不正确或超出本节课的处理限制。" },
      { status: 400 },
    );
  if (error instanceof Error && /timeout|abort/i.test(error.name))
    return Response.json(
      { error: "AI 服务响应超时，请稍后重试。原始资料仍保留在当前设备。" },
      { status: 504 },
    );
  return Response.json(
    { error: "处理未完成，请检查资料后重试。" },
    { status: 500 },
  );
}
export function env(name: string): string {
  return process.env[name]?.trim() || "";
}
const recent = new Map<string, number[]>();
export function protect(request: Request): void {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin)
    throw new AppError("不允许跨站调用。", 403);
  const token = env("LECTURE_ACCESS_TOKEN");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (token && request.headers.get("authorization") !== `Bearer ${token}`)
    throw new AppError("请输入正确的访问口令。", 401);
  if (!local && !token)
    throw new AppError("远程使用前，请在服务端设置访问口令。", 503);
  const key = local
    ? "local"
    : request.headers.get("cf-connecting-ip") || "remote";
  const now = Date.now();
  const times = (recent.get(key) || []).filter((t) => now - t < 60000);
  if (times.length >= 12)
    throw new AppError("操作太频繁，请一分钟后重试。", 429);
  times.push(now);
  recent.set(key, times);
  if (recent.size > 1000)
    for (const [k, v] of recent)
      if (now - v[v.length - 1] > 60000) recent.delete(k);
}
export async function readJSON(
  request: Request,
  limit = 600000,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) throw new AppError("资料过长，请按课次拆分。", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("没有收到资料。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new AppError("资料过长，请按课次拆分。", 413);
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(joined));
  } catch {
    throw new AppError("资料不是有效 JSON。");
  }
}
async function providerRequest(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  const response = await fetch(`${baseUrl}/${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    const status = response.status;
    throw new AppError(
      status === 401
        ? "AI 密钥无效，请检查服务端配置。"
        : status === 429
          ? "AI 服务额度不足或请求过多，请检查账户后重试。"
          : `AI 服务暂时不可用（${status}），请稍后重试。`,
      status === 401 ? 503 : 502,
    );
  }
  return response.json();
}

export async function transcribeRequest(
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const config = transcriptionAIConfig(process.env);
  if (!config.apiKey)
    throw new AppError(
      "DeepSeek 用于总结和翻译；录音转写需单独配置支持 Whisper 兼容接口的语音服务，或导入 SRT/VTT 字幕。",
      503,
    );
  return providerRequest(config.baseUrl, config.apiKey, path, init);
}

export function aiStatus() {
  const text = textAIConfig(process.env);
  const transcription = transcriptionAIConfig(process.env);
  return {
    configured: !!text.apiKey,
    provider: text.provider,
    transcriptionConfigured: !!transcription.apiKey,
    transcriptionProvider: transcription.provider,
  };
}
export async function structured(
  instructions: string,
  input: unknown,
  name: string,
  schema: object,
): Promise<unknown> {
  const config = textAIConfig(process.env);
  if (!config.apiKey)
    throw new AppError(
      "尚未配置 DeepSeek API 密钥。请在网站服务端设置 DEEPSEEK_API_KEY。",
      503,
    );
  const data = (await providerRequest(
    config.baseUrl,
    config.apiKey,
    "responses",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        instructions,
        input: JSON.stringify(input),
        text: { format: { type: "json_schema", name, strict: true, schema } },
        max_output_tokens: 12000,
      }),
    },
  )) as {
    status?: string;
    output?: { content?: { type: string; text?: string }[] }[];
  };
  if (data.status && data.status !== "completed")
    throw new AppError("AI 输出未完成，请减少本次处理的资料后重试。", 502);
  const text = data.output
    ?.flatMap((x) => x.content || [])
    .filter((x) => x.type === "output_text")
    .map((x) => x.text || "")
    .join("");
  if (!text) throw new AppError("AI 没有返回可用结果，请重试。", 502);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("AI 结果格式错误，请重试。", 502);
  }
}
