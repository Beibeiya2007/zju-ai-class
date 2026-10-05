import type { Segment } from "./types.ts";
export type TimedPart = {
  id: string;
  number: number;
  start: number;
  end: number;
  status: string;
  segments: Segment[];
};
export function offsetSegments(
  part: Pick<TimedPart, "id" | "start" | "end">,
  values: Segment[],
): Segment[] {
  if (
    !Number.isFinite(part.start) ||
    !Number.isFinite(part.end) ||
    part.start < 0 ||
    part.end <= part.start
  )
    throw new Error("录音分段的时间范围无效。");
  const duration = part.end - part.start;
  return values.map((s, i) => {
    if (
      !s.text?.trim() ||
      s.text.length > 8000 ||
      !Number.isFinite(s.start) ||
      !Number.isFinite(s.end) ||
      s.start < 0 ||
      s.end <= s.start ||
      s.start >= duration ||
      s.end > duration + 2
    )
      throw new Error("转录时间超出对应音频分段，请重试并核对音频。");
    return {
      id: `${part.id}-${i + 1}`,
      start: part.start + s.start,
      end: part.start + Math.min(s.end, duration),
      text: s.text.trim(),
    };
  });
}
export function combineTranscript(parts: TimedPart[]): Segment[] {
  if (!parts.length || parts.some((p) => p.status !== "done"))
    throw new Error("请先完成所有分段的转录，再应用到课堂。");
  const sorted = [...parts].sort((a, b) => a.number - b.number);
  for (let i = 0; i < sorted.length; i++) {
    if (
      sorted[i].number !== i + 1 ||
      (i && sorted[i].start < sorted[i - 1].end)
    )
      throw new Error("录音分段缺失或重叠，无法合并。");
  }
  const segments = sorted.flatMap((p) => p.segments);
  if (segments.length > 3000)
    throw new Error("转录超过每节课 3000 条的上限，请将课堂拆成多个课次。");
  if (new Set(segments.map((s) => s.id)).size !== segments.length)
    throw new Error("转录标识重复。");
  return segments;
}
export function partAt<T extends { start: number; end: number }>(
  parts: T[],
  time: number,
): T | undefined {
  return parts.find((p) => time >= p.start && time < p.end);
}
