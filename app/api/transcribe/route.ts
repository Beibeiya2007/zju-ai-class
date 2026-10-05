import { AppError, failure, protect, transcribeRequest } from "@/lib/ai-server";
import { segmentSchema } from "@/lib/validation";
import { z } from "zod";
const MAX = 24 * 1000 * 1000;
export async function POST(request: Request) {
  try {
    protect(request);
    if (Number(request.headers.get("content-length") || 0) > MAX + 100000)
      throw new AppError("录音超过 24 MB，请先压缩为 MP3 或分成多节课。", 413);
    // Read the multipart body through a bounded stream before materializing FormData.
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("没有收到录音。");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX + 100000) {
        await reader.cancel();
        throw new AppError("录音超过 24 MB。", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, off);
      off += chunk.length;
    }
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX)
      throw new AppError("请选择不超过 24 MB 的有效音频文件。");
    if (!/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i.test(file.name))
      throw new AppError("支持 MP3、MP4、M4A、WAV、WEBM、MPEG 音频。");
    const outgoing = new FormData();
    outgoing.append("file", file);
    const model = process.env.TRANSCRIPTION_MODEL?.trim() || "whisper-1";
    outgoing.append("model", model);
    outgoing.append("response_format", "verbose_json");
    outgoing.append("timestamp_granularities[]", "segment");
    const prompt = String(form.get("prompt") || "").slice(0, 800);
    if (prompt) outgoing.append("prompt", prompt);
    const result = (await transcribeRequest("audio/transcriptions", {
      method: "POST",
      body: outgoing,
    })) as { segments?: { start: number; end: number; text: string }[] };
    const segments = z
      .array(segmentSchema)
      .max(3000)
      .parse(
        result.segments
          ?.filter((s) => s.text?.trim() && s.end > s.start)
          .map((s, i) => ({
            id: `s${i + 1}`,
            start: s.start,
            end: s.end,
            text: s.text.trim(),
          })),
      );
    return Response.json({ segments });
  } catch (e) {
    return failure(e);
  }
}
