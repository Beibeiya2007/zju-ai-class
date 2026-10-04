import { z } from "zod";
import type { Page, Segment } from "./types";
export const pageSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().max(500),
  text: z.string().max(25000),
});
export const segmentSchema = z
  .object({
    id: z.string().min(1).max(80),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
    text: z.string().min(1).max(8000),
  })
  .refine((s) => s.end > s.start);
export const sourceSchema = z
  .object({
    pages: z.array(pageSchema).min(1).max(160),
    segments: z.array(segmentSchema).max(3000),
  })
  .superRefine((s, c) => {
    if (
      new Set(s.pages.map((p) => p.number)).size !== s.pages.length ||
      new Set(s.segments.map((p) => p.id)).size !== s.segments.length
    )
      c.addIssue({ code: "custom", message: "来源标识重复" });
  });
export const nodeSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  chapter: z.string().min(1).max(100),
  summary: z.string().min(1).max(5000),
  pageNumbers: z.array(z.number().int().positive()).max(160),
  segmentIds: z.array(z.string()).max(100),
  emphasis: z.enum(["explicit", "repeated", "suggested", "none"]),
  confidence: z.enum(["high", "medium", "low"]),
});
export function validateNodes(
  value: unknown,
  pages: Page[],
  segments: Segment[],
) {
  const result = z
    .object({ nodes: z.array(nodeSchema).min(1).max(100) })
    .parse(value);
  const p = new Set(pages.map((x) => x.number));
  const s = new Set(segments.map((x) => x.id));
  if (new Set(result.nodes.map((n) => n.id)).size !== result.nodes.length)
    throw new Error("Duplicate node IDs");
  for (const n of result.nodes) {
    if (!n.pageNumbers.length && !n.segmentIds.length)
      throw new Error("Missing sources");
    if (
      n.pageNumbers.some((x) => !p.has(x)) ||
      n.segmentIds.some((x) => !s.has(x))
    )
      throw new Error("Unknown source");
    if (n.emphasis === "explicit" && !n.segmentIds.length)
      n.emphasis = "suggested";
    if (n.emphasis === "repeated" && n.segmentIds.length < 2)
      n.emphasis = "suggested";
  }
  return result.nodes;
}
export const outlineJSONSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          chapter: { type: "string" },
          summary: { type: "string" },
          pageNumbers: { type: "array", items: { type: "integer" } },
          segmentIds: { type: "array", items: { type: "string" } },
          emphasis: {
            type: "string",
            enum: ["explicit", "repeated", "suggested", "none"],
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: [
          "id",
          "title",
          "chapter",
          "summary",
          "pageNumbers",
          "segmentIds",
          "emphasis",
          "confidence",
        ],
      },
    },
  },
  required: ["nodes"],
};
