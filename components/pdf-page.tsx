"use client";
import { useEffect, useRef, useState } from "react";
import { pdfEngine, pdfOptions } from "@/lib/documents";
export function PDFPage({ file, page }: { file: Blob; page: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let stopped = false;
    let destroy: (() => Promise<void>) | undefined;
    let cancel: (() => void) | undefined;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const pdf = await pdfEngine();
        if (stopped) return;
        const task = pdf.getDocument({
          ...pdfOptions,
          data: new Uint8Array(await file.arrayBuffer()),
        });
        destroy = () => task.destroy();
        const doc = await task.promise;
        if (stopped) return;
        const p = await doc.getPage(page);
        if (stopped || !canvas.current) return;
        const viewport = p.getViewport({ scale: 1.5 });
        const c = canvas.current;
        c.width = viewport.width;
        c.height = viewport.height;
        const context = c.getContext("2d");
        if (!context) throw new Error("无法显示页面");
        const render = p.render({
          canvas: c,
          canvasContext: context,
          viewport,
        });
        cancel = () => render.cancel();
        await render.promise;
        if (!stopped) setLoading(false);
      } catch {
        if (!stopped) {
          setError("本页无法预览，请查看文字摘录，或将文件重新导出为 PDF。");
          setLoading(false);
        }
      }
    })();
    return () => {
      stopped = true;
      cancel?.();
      void destroy?.();
    };
  }, [file, page]);
  return (
    <div className="pdf-preview">
      {loading && <p role="status">正在加载原页…</p>}
      {error && <p role="alert">{error}</p>}
      <canvas
        ref={canvas}
        aria-label={`课件第 ${page} 页`}
        style={{ display: error ? "none" : "block" }}
      />
    </div>
  );
}
