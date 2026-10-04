import type { KnowledgeNode, Lesson, Page, Segment } from "./types";

export function formatTime(seconds: number): string {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
}
function timestamp(value: string): number {
  const parts = value.replace(",", ".").split(":").map(Number);
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((n) => !Number.isFinite(n) || n < 0) ||
    parts.at(-1)! >= 60 ||
    (parts.length === 3 && parts[1] >= 60)
  )
    throw new Error("字幕时间格式不正确。");
  return parts.reduce((sum, n) => sum * 60 + n, 0);
}
export function parseSubtitles(raw: string): Segment[] {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n\s*\n/);
  const out: Segment[] = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) continue;
    const index = lines.findIndex((l) => l.includes("-->"));
    if (index < 0) continue;
    const match = lines[index].match(
      /^\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}[.,]\d{3})(?:\s.*)?$/,
    );
    if (!match)
      throw new Error("发现无法识别的字幕时间，请检查 SRT / VTT 文件。");
    const start = timestamp(match[1]);
    const end = timestamp(match[2]);
    const content = lines
      .slice(index + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (end <= start) throw new Error("字幕结束时间必须晚于开始时间。");
    if (content)
      out.push({ id: `s${out.length + 1}`, start, end, text: content });
  }
  if (!out.length)
    throw new Error("没有找到带时间戳的字幕，请导入 SRT 或 VTT 文件。");
  if (out.length > 3000)
    throw new Error("单节课最多支持 3000 条字幕，请按课次拆分。");
  return out.sort((a, b) => a.start - b.start);
}
export function emphasisOf(text: string): KnowledgeNode["emphasis"] {
  // Conservative sentence-level rules. A negation must not become an exam claim.
  const positive = text
    .split(/[。！？.!?\n]/)
    .some(
      (sentence) =>
        !/(不考|不会考|不是考点|不重要|无需掌握|去年|往年|not\s+(?:important|(?:be\s+)?on\s+the\s+(?:exam|test))|won.t\s+be\s+on)/i.test(
          sentence,
        ) &&
        /(很重要|重点是|考点是|考试会考|一定要掌握|再强调|必须记住|important|exam\s+point|on\s+the\s+exam)/i.test(
          sentence,
        ),
    );
  return positive ? "explicit" : "none";
}
function tokens(text: string): Set<string> {
  const normalized = text.toLowerCase();
  const words: string[] = normalized.match(/[a-z]{3,}/g) || [];
  const chunks = normalized.match(/[\u4e00-\u9fff]+/g) || [];
  for (const chunk of chunks)
    for (let i = 0; i < chunk.length - 1; i++)
      words.push(chunk.slice(i, i + 2));
  return new Set(
    words.filter(
      (w) =>
        ![
          "这个",
          "那个",
          "我们",
          "然后",
          "就是",
          "可以",
          "the",
          "and",
          "that",
          "this",
          "with",
          "from",
        ].includes(w),
    ),
  );
}
export function localOutline(
  pages: Page[],
  segments: Segment[],
): KnowledgeNode[] {
  return pages.map((page) => {
    const key = tokens(page.title + " " + page.text);
    const matched = segments
      .map((s) => {
        const set = tokens(s.text);
        const common = [...set].filter((w) => key.has(w)).length;
        return {
          s,
          score: common / Math.max(1, Math.min(key.size, set.size)),
          common,
        };
      })
      .filter((x) => x.common >= 3 && x.score >= 0.24)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.s);
    return {
      id: `p${page.number}`,
      title: page.title || `第 ${page.number} 页`,
      chapter: "课件目录",
      summary:
        page.text.slice(0, 650) ||
        "本页未提取到文字。请查看原页；扫描件需要先做 OCR。",
      pageNumbers: [page.number],
      segmentIds: matched.map((s) => s.id),
      emphasis: emphasisOf(matched.map((s) => s.text).join("。")),
      confidence: matched.length ? "medium" : "low",
    };
  });
}
export function toMarkdown(lesson: Lesson): string {
  const lines = [
    `# ${lesson.title}`,
    "",
    `课程：${lesson.course}`,
    `来源模式：${lesson.mode === "demo" ? "示例内容" : lesson.mode === "ai" ? "AI 整理（需核对原文）" : "本地摘录与词语匹配（非 AI 总结）"}`,
    "",
  ];
  for (const node of lesson.nodes) {
    lines.push(
      `## ${node.chapter} / ${node.title}`,
      "",
      node.summary,
      "",
      `课件页：${node.pageNumbers.join("、") || "无"}；匹配置信度：${node.confidence}`,
      "",
    );
    for (const id of node.segmentIds) {
      const s = lesson.segments.find((s) => s.id === id);
      if (s)
        lines.push(
          `> [${formatTime(s.start)}–${formatTime(s.end)}] ${s.text.replace(/\n/g, " ")}`,
          "",
        );
    }
  }
  return lines.join("\n");
}
