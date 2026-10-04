import type { Page } from "./types";
import { strFromU8, unzipSync } from "fflate";
export async function pdfEngine() {
  const pdf = await import("pdfjs-dist");
  pdf.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return pdf;
}
export const pdfOptions = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
  isEvalSupported: false,
};
export async function parseDocument(
  file: File,
): Promise<{ pages: Page[]; type: "pdf" | "pptx"; warnings: string[] }> {
  if (file.size > 30 * 1000 * 1000)
    throw new Error("课件超过 30 MB，请压缩或按课次拆分。");
  if (!file.size) throw new Error("课件为空，请重新选择。");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "ppt")
    throw new Error(
      "旧版 .ppt 暂不支持，请在 PowerPoint / WPS 中另存为 PPTX 或 PDF。",
    );
  if (ext !== "pdf" && ext !== "pptx")
    throw new Error("请选择 PDF 或 PPTX 课件。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const warnings: string[] = [];
  const pages: Page[] = [];
  if (ext === "pdf") {
    const pdf = await pdfEngine();
    const task = pdf.getDocument({ ...pdfOptions, data: bytes });
    try {
      const doc = await task.promise;
      if (doc.numPages > 160)
        throw new Error("本版每节课最多支持 160 页，请拆分后导入。");
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        let text = "";
        for (const item of content.items) {
          if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
        }
        text = text.trim();
        pages.push({
          number: n,
          title:
            text
              .split("\n")
              .find((x) => x.trim())
              ?.trim()
              .slice(0, 100) || `第 ${n} 页`,
          text,
        });
        page.cleanup();
      }
    } finally {
      await task.destroy();
    }
  } else {
    // Only inflate relevant XML, reject zip bombs before decompression.
    let inflated = 0;
    const files = unzipSync(bytes, {
      filter: (f) => {
        if (
          !/^ppt\/(slides\/slide\d+\.xml|presentation\.xml|_rels\/presentation\.xml\.rels)$/.test(
            f.name,
          )
        )
          return false;
        inflated += f.originalSize || 0;
        if (
          (f.originalSize || 0) > 8 * 1000 * 1000 ||
          inflated > 32 * 1000 * 1000
        )
          throw new Error("课件解压后过大，请导出为 PDF。");
        return true;
      },
    });
    const xml = (name: string) => {
      if (!files[name]) throw new Error("PPTX 文件结构不完整。");
      const doc = new DOMParser().parseFromString(
        strFromU8(files[name]),
        "application/xml",
      );
      if (doc.querySelector("parsererror"))
        throw new Error("PPTX 文件内容损坏。");
      return doc;
    };
    const pres = xml("ppt/presentation.xml");
    const rels = xml("ppt/_rels/presentation.xml.rels");
    const mapping = new Map(
      Array.from(rels.getElementsByTagNameNS("*", "Relationship")).map((r) => [
        r.getAttribute("Id"),
        r.getAttribute("Target"),
      ]),
    );
    const slides = Array.from(pres.getElementsByTagNameNS("*", "sldId"));
    if (slides.length > 160)
      throw new Error("本版每节课最多支持 160 页，请拆分后导入。");
    for (const [i, slide] of slides.entries()) {
      const rid = slide.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      );
      const target = mapping.get(rid);
      if (!target) throw new Error("PPTX 页面顺序无法读取，请导出为 PDF。");
      const path = target.startsWith("/")
        ? target.slice(1)
        : new URL(target, "https://local.invalid/ppt/").pathname.slice(1);
      const doc = xml(path);
      const lines = Array.from(doc.getElementsByTagNameNS("*", "p"))
        .map((p) =>
          Array.from(p.getElementsByTagNameNS("*", "t"))
            .map((t) => t.textContent || "")
            .join(""),
        )
        .filter(Boolean);
      pages.push({
        number: i + 1,
        title: lines[0]?.slice(0, 100) || `第 ${i + 1} 页`,
        text: lines.join("\n"),
      });
    }
    warnings.push(
      "PPTX 显示提取文字，暂不还原图片、图表和版式。需要原页预览时请导入 PDF。",
    );
  }
  if (!pages.length) throw new Error("课件没有可读取的页面。");
  const empty = pages.filter((p) => !p.text.trim()).length;
  if (empty)
    warnings.push(
      `${empty} 页未识别到文字，可能是扫描页。当前版本不做 OCR；你仍可查看 PDF 原页。`,
    );
  if (pages.some((p) => p.text.length > 25000))
    warnings.push("个别页文字较长，AI 整理前请将课件拆分。");
  return { pages, type: ext, warnings };
}
