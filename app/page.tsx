"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Network,
  Upload,
  Headphones,
  Sparkles,
  Settings2,
  FileText,
  ChevronRight,
  ChevronLeft,
  Download,
  Play,
  Languages,
  FolderOpen,
  Check,
  Pencil,
  LoaderCircle,
  Plus,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Toaster, toast } from "sonner";
import { PDFPage } from "@/components/pdf-page";
import { demoLesson } from "@/lib/demo";
import type { Lesson, KnowledgeNode, Segment } from "@/lib/types";
import {
  emphasisOf,
  formatTime,
  localOutline,
  parseSubtitles,
  toMarkdown,
} from "@/lib/learning";
import { parseDocument } from "@/lib/documents";
import { listLessons, saveLesson, type SavedLesson } from "@/lib/storage";

type Status = { configured: boolean; protected: boolean };
const emphasisLabel = {
  explicit: "老师强调",
  repeated: "重复讲解",
  suggested: "AI 建议关注",
  none: "课堂讲解",
};
function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Home() {
  const [record, setRecord] = useState<SavedLesson>({ lesson: demoLesson });
  const [library, setLibrary] = useState<SavedLesson[]>([]);
  const [selectedId, setSelectedId] = useState("n1");
  const [pageNumber, setPageNumber] = useState(1);
  const [dialog, setDialog] = useState<
    "import" | "settings" | "library" | "export" | "edit" | null
  >(null);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState<Status>({
    configured: false,
    protected: false,
  });
  const [statusError, setStatusError] = useState(false);
  const [token, setToken] = useState("");
  const [translation, setTranslation] = useState("");
  const [translationSource, setTranslationSource] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [subFile, setSubFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [importError, setImportError] = useState("");
  const [editPages, setEditPages] = useState("");
  const [editSegments, setEditSegments] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [playTime, setPlayTime] = useState(0);
  const player = useRef<HTMLAudioElement>(null);
  const clipEnd = useRef<number | null>(null);
  const lesson = record.lesson;
  const selected =
    lesson.nodes.find((n) => n.id === selectedId) || lesson.nodes[0];
  const page =
    lesson.pages.find((p) => p.number === pageNumber) || lesson.pages[0];
  const linked = selected
    ? lesson.segments.filter((s) => selected.segmentIds.includes(s.id))
    : [];
  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/status");
      if (!r.ok) throw new Error();
      setStatus(await r.json());
      setStatusError(false);
    } catch {
      setStatusError(true);
    }
  }, []);
  const activate = useCallback((next: SavedLesson) => {
    player.current?.pause();
    setRecord(next);
    setSelectedId(next.lesson.nodes[0]?.id || "");
    setPageNumber(next.lesson.pages[0]?.number || 1);
    setTranslation("");
    clipEnd.current = null;
    setPlayTime(0);
    try {
      localStorage.setItem("lecture-atlas-active", next.lesson.id);
    } catch {}
  }, []);
  useEffect(() => {
    void refreshStatus();
    void listLessons()
      .then((items) => {
        setLibrary(items);
        let id = "";
        try {
          id = localStorage.getItem("lecture-atlas-active") || "";
        } catch {}
        const last = items.find((x) => x.lesson.id === id);
        if (last) activate(last);
      })
      .catch((e) => toast.error(e.message));
  }, [activate, refreshStatus]);
  useEffect(() => {
    if (!record.audio) {
      setAudioUrl("");
      return;
    }
    const url = URL.createObjectURL(record.audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [record.audio]);
  useEffect(() => {
    setTranslation("");
  }, [lesson.id, pageNumber, selectedId]);
  const persist = async (next: SavedLesson) => {
    await saveLesson(next);
    setLibrary((items) => [
      next,
      ...items.filter((x) => x.lesson.id !== next.lesson.id),
    ]);
    setRecord(next);
  };
  function openImport() {
    setImportError("");
    setDocFile(null);
    setAudioFile(null);
    setSubFile(null);
    setTitle("");
    setCourse("");
    setDialog("import");
  }
  function chooseNode(n: KnowledgeNode) {
    player.current?.pause();
    clipEnd.current = null;
    setSelectedId(n.id);
    if (n.pageNumbers.length) setPageNumber(n.pageNumbers[0]);
    const first = lesson.segments.find((s) => s.id === n.segmentIds[0]);
    if (
      first &&
      player.current &&
      Number.isFinite(player.current.duration) &&
      first.start < player.current.duration
    ) {
      player.current.currentTime = first.start;
      setPlayTime(first.start);
    }
  }
  async function request<T>(
    path: string,
    body: BodyInit,
    json = false,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (json) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api/${path}`, {
      method: "POST",
      headers,
      body,
    });
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new Error("服务暂时不可用，请重试。");
    }
    if (!response.ok)
      throw new Error(
        (result as { error?: string }).error || "处理失败，请重试。",
      );
    return result as T;
  }
  async function importLesson() {
    if (!docFile) {
      setImportError("请先选择一份 PDF 或 PPTX 课件。");
      return;
    }
    setBusy("正在解析课件…");
    setImportError("");
    try {
      if (
        audioFile &&
        (!/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i.test(audioFile.name) ||
          audioFile.size > 24 * 1000 * 1000 ||
          !audioFile.size)
      )
        throw new Error(
          "请选择不超过 24 MB 的 MP3、M4A、WAV、WEBM、MP4 或 MPEG 录音。",
        );
      if (subFile && subFile.size > 2 * 1000 * 1000)
        throw new Error("字幕超过 2 MB，请按课次拆分。");
      const parsed = await parseDocument(docFile);
      const segments = subFile ? parseSubtitles(await subFile.text()) : [];
      const next: SavedLesson = {
        lesson: {
          id: crypto.randomUUID(),
          title: title.trim() || docFile.name.replace(/\.[^.]+$/, ""),
          course: course.trim() || "我的课程",
          pages: parsed.pages,
          segments,
          nodes: localOutline(parsed.pages, segments),
          mode: "local",
          documentName: docFile.name,
          documentType: parsed.type,
          audioName: audioFile?.name,
          updatedAt: new Date().toISOString(),
        },
        document: docFile,
        audio: audioFile || undefined,
      };
      await persist(next);
      activate(next);
      setDialog(null);
      toast.success("课件已导入并保存在当前设备。");
      for (const warning of parsed.warnings)
        toast.info(warning, { duration: 9000 });
    } catch (e) {
      setImportError(
        e instanceof Error ? e.message : "导入失败，请重新选择文件。",
      );
    } finally {
      setBusy("");
    }
  }
  async function addMaterial(file: File, kind: "audio" | "subtitle") {
    setBusy("正在保存资料…");
    try {
      if (kind === "audio") {
        if (
          file.size > 24 * 1000 * 1000 ||
          !file.size ||
          !/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i.test(file.name)
        )
          throw new Error("录音格式不支持或超过 24 MB。");
        await persist({
          ...record,
          audio: file,
          lesson: {
            ...lesson,
            audioName: file.name,
            updatedAt: new Date().toISOString(),
          },
        });
      } else {
        if (file.size > 2 * 1000 * 1000) throw new Error("字幕不能超过 2 MB。");
        const segments = parseSubtitles(await file.text());
        const updated = {
          ...lesson,
          segments,
          nodes: localOutline(lesson.pages, segments),
          mode: "local" as const,
          updatedAt: new Date().toISOString(),
        };
        await persist({ ...record, lesson: updated });
        setSelectedId(updated.nodes[0]?.id || "");
      }
      toast.success(
        kind === "audio" ? "录音已保存。" : "字幕已导入，并重新生成本地目录。",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败。");
    } finally {
      setBusy("");
    }
  }
  async function generate() {
    if (!status.configured) {
      setDialog("settings");
      return;
    }
    if (lesson.mode === "demo") {
      toast.info("请先导入自己的课件；示例课不调用 AI。");
      return;
    }
    setBusy("正在准备资料…");
    try {
      let current = record;
      if (!lesson.segments.length && record.audio) {
        setBusy("正在转录录音，较长的录音可能需要几分钟…");
        const form = new FormData();
        form.append("file", record.audio, lesson.audioName || "lecture.mp3");
        form.append(
          "prompt",
          lesson.pages
            .map((p) => p.title)
            .join("，")
            .slice(0, 800),
        );
        const data = await request<{ segments: Segment[] }>("transcribe", form);
        current = {
          ...record,
          lesson: {
            ...lesson,
            segments: data.segments,
            updatedAt: new Date().toISOString(),
          },
        };
        current.lesson.nodes = localOutline(lesson.pages, data.segments);
        current.lesson.mode = "local";
        await persist(current);
        setSelectedId(current.lesson.nodes[0]?.id || "");
      }
      setBusy("正在关联知识点、课件与讲解…");
      const result = await request<{ nodes: KnowledgeNode[] }>(
        "analyze",
        JSON.stringify({
          pages: current.lesson.pages,
          segments: current.lesson.segments,
        }),
        true,
      );
      const next = {
        ...current,
        lesson: {
          ...current.lesson,
          nodes: result.nodes,
          mode: "ai" as const,
          updatedAt: new Date().toISOString(),
        },
      };
      await persist(next);
      setSelectedId(next.lesson.nodes[0]?.id || "");
      toast.success("知识导图已生成，请结合原页和原话核对。");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "整理失败。", {
        duration: 10000,
      });
    } finally {
      setBusy("");
    }
  }
  async function translate(text: string, label: string, target: "zh" | "en") {
    if (!status.configured) {
      setDialog("settings");
      return;
    }
    if (!text.trim()) {
      toast.info("当前内容没有可翻译的文字。");
      return;
    }
    setBusy("正在翻译…");
    try {
      const r = await request<{ translation: string }>(
        "translate",
        JSON.stringify({ text, target }),
        true,
      );
      setTranslation(r.translation);
      setTranslationSource(label);
      toast.success("译文已生成，原文保留。");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "翻译失败。");
    } finally {
      setBusy("");
    }
  }
  async function playClip(s: Segment) {
    const audio = player.current;
    if (!audio) {
      toast.info(
        lesson.mode === "demo"
          ? "示例仅含课件与字幕，没有真实课堂录音。"
          : "请先添加与字幕对应的录音。",
      );
      return;
    }
    if (!Number.isFinite(audio.duration)) {
      toast.info("录音仍在加载，请稍后重试。");
      return;
    }
    if (s.start >= audio.duration) {
      toast.error("字幕时间超出录音长度，请确认它们来自同一节课、同一时间轴。");
      return;
    }
    audio.currentTime = s.start;
    clipEnd.current = Math.min(s.end, audio.duration);
    try {
      await audio.play();
    } catch {
      toast.error("无法播放录音，请检查音频格式。");
    }
  }
  function openEdit() {
    if (!selected) return;
    setEditPages(selected.pageNumbers.join(", "));
    setEditSegments([...selected.segmentIds]);
    setDialog("edit");
  }
  async function saveLinks() {
    if (!selected) return;
    const numbers = editPages
      .split(/[,，\s]+/)
      .filter(Boolean)
      .map(Number);
    if (
      numbers.some(
        (n) =>
          !Number.isInteger(n) || !lesson.pages.some((p) => p.number === n),
      )
    ) {
      toast.error("请输入课件中存在的页码，以逗号分隔。");
      return;
    }
    if (!numbers.length && !editSegments.length) {
      toast.error("请保留至少一个课件页或讲解片段作为来源。");
      return;
    }
    setBusy("正在保存对应关系…");
    try {
      await persist({
        ...record,
        lesson: {
          ...lesson,
          nodes: lesson.nodes.map((n) =>
            n.id === selected.id
              ? {
                  ...n,
                  pageNumbers: [...new Set(numbers)],
                  segmentIds: editSegments,
                  confidence: "high" as const,
                }
              : n,
          ),
          updatedAt: new Date().toISOString(),
        },
      });
      setDialog(null);
      toast.success("来源对应关系已更新。");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "read_lesson_outline",
            description:
              "读取当前课堂知识目录及其来源，不调用 AI，不修改资料。",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: () => ({
              title: lesson.title,
              mode: lesson.mode,
              nodes: lesson.nodes,
            }),
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [lesson]);
  const groups = [...new Set(lesson.nodes.map((n) => n.chapter))];
  return (
    <main className="workspace">
      <Toaster richColors position="top-center" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Network size={23} />
          </span>
          <strong>
            课间 <span>LECTURE ATLAS</span>
          </strong>
        </div>
        <span className="edition">学习工作台 · FIRST EDITION</span>
        <div className="header-actions">
          <Button
            variant="ghost"
            disabled={!!busy}
            onClick={() => setDialog("library")}
          >
            <FolderOpen />
            我的课堂
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void refreshStatus();
              setDialog("settings");
            }}
          >
            <Settings2 />
            AI 设置
          </Button>
        </div>
      </header>
      <div className="lesson-heading">
        <div>
          <p className="eyebrow">
            我的课堂 <ChevronRight size={14} />
            {lesson.course}
          </p>
          <h1>{lesson.title}</h1>
          <p className="muted">
            {lesson.pages.length} 页课件 · {lesson.nodes.length} 个知识点 ·{" "}
            {lesson.segments.length} 段讲解
          </p>
        </div>
        <div className="heading-actions">
          <Button
            variant="outline"
            onClick={() => setDialog("export")}
            disabled={!!busy}
          >
            <Download />
            导出笔记
          </Button>
          <Button onClick={openImport} disabled={!!busy}>
            <Plus />
            导入本节资料
          </Button>
        </div>
      </div>
      <div className="notice">
        <Info size={16} />
        <span>
          {lesson.mode === "demo"
            ? "你正在查看自制示例课。导入自己的课件和录音，开始整理课堂。"
            : lesson.mode === "local"
              ? "当前为本地摘录与词语匹配，尚未进行 AI 总结；讲解对应关系请核对。"
              : "AI 整理已完成。每个知识点保留原文出处，请结合课堂核对。"}
        </span>
        <span className="pill">
          {lesson.mode === "demo"
            ? "示例内容"
            : lesson.mode === "local"
              ? "本地整理"
              : "AI 整理"}
        </span>
      </div>
      {busy && (
        <div role="status" className="progress-banner">
          <LoaderCircle className="animate-spin" size={16} />
          {busy}
        </div>
      )}
      <div className="study-grid">
        <section className="map-panel panel">
          <div className="panel-title">
            <Network size={18} />
            <h2>知识导图</h2>
            <span>{String(lesson.nodes.length).padStart(2, "0")}</span>
          </div>
          <p className="helper">点击知识点，定位课件与讲解</p>
          <div className="tree-root">{lesson.title}</div>
          <div className="tree-scroll">
            {groups.map((group) => (
              <div key={group}>
                <div className="chapter-label">{group}</div>
                <div className="tree-branches">
                  {lesson.nodes
                    .filter((n) => n.chapter === group)
                    .map((n) => (
                      <button
                        key={n.id}
                        disabled={!!busy}
                        aria-pressed={selected?.id === n.id}
                        onClick={() => chooseNode(n)}
                        className={`tree-node ${selected?.id === n.id ? "selected" : ""}`}
                      >
                        <strong>
                          {n.title}
                          {n.emphasis === "explicit" && (
                            <span className="node-star">重点</span>
                          )}
                        </strong>
                        <span>
                          {n.pageNumbers.length
                            ? `第 ${n.pageNumbers.join("、")} 页`
                            : "课外补充"}
                          <ChevronRight size={14} />
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div className="generate-area">
            <Button
              className="w-full"
              disabled={!!busy || lesson.mode === "demo"}
              onClick={() => void generate()}
            >
              <Sparkles />
              {status.configured ? "AI 整理本节课" : "配置 AI 后生成总结"}
            </Button>
            <p>
              {lesson.mode === "demo"
                ? "示例仅用于体验，不会调用 AI"
                : "点击整理会将课件文字、字幕及待转录音频发送至 OpenAI。"}
            </p>
          </div>
        </section>
        <section className="document-panel panel">
          <div className="panel-title">
            <FileText size={18} />
            <h2>课堂课件</h2>
            <span>
              第 {page?.number || 0} / {lesson.pages.length} 页
            </span>
          </div>
          {record.document && lesson.documentType === "pdf" ? (
            <PDFPage file={record.document} page={pageNumber} />
          ) : (
            <div className="slide">
              <div className="slide-kicker">
                {lesson.mode === "demo"
                  ? "PROBABILITY & STATISTICS"
                  : "LECTURE NOTES · 文字摘录"}
              </div>
              <h2>{page?.title}</h2>
              <p>{page?.text || "本页未识别到文字。"}</p>
              {page?.formula && <div className="formula">{page.formula}</div>}
              <div className="slide-bottom">
                <span>{lesson.course}</span>
                <span>{String(pageNumber).padStart(2, "0")}</span>
              </div>
            </div>
          )}
          <div className="page-controls">
            <Button
              aria-label="上一页"
              variant="outline"
              size="icon"
              disabled={!!busy || pageNumber <= 1}
              onClick={() => setPageNumber((p) => p - 1)}
            >
              <ChevronLeft />
            </Button>
            <span>
              {pageNumber} / {lesson.pages.length}
            </span>
            <Button
              aria-label="下一页"
              variant="outline"
              size="icon"
              disabled={!!busy || pageNumber >= lesson.pages.length}
              onClick={() => setPageNumber((p) => p + 1)}
            >
              <ChevronRight />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={() =>
                void translate(page?.text || "", "当前课件页", "zh")
              }
            >
              <Languages />
              译成中文
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={() =>
                void translate(page?.text || "", "当前课件页", "en")
              }
            >
              英文
            </Button>
          </div>
          <div className="document-note">
            <BookOpen size={15} />
            <span>
              {lesson.documentName || "自制示例课件"}
              {lesson.documentType === "pptx" ? " · 文字视图" : ""}
            </span>
          </div>
          {translation && (
            <div className="translation">
              <div>
                <Languages size={16} />
                <strong>{translationSource} · 译文</strong>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTranslation("")}
                >
                  收起
                </Button>
              </div>
              <p>{translation}</p>
            </div>
          )}
          <div className="audio-area">
            <div className="audio-title">
              <Headphones size={20} />
              <strong>课堂回放</strong>
              <span>{audioUrl ? formatTime(playTime) : "未添加录音"}</span>
            </div>
            {audioUrl ? (
              <>
                <p className="audio-name">{lesson.audioName}</p>
                <audio
                  ref={player}
                  src={audioUrl}
                  controls
                  preload="metadata"
                  onError={() =>
                    toast.error("浏览器无法解码该音频，请转成 MP3 或 WAV。")
                  }
                  onTimeUpdate={() => {
                    const a = player.current;
                    if (!a) return;
                    setPlayTime(a.currentTime);
                    if (
                      clipEnd.current !== null &&
                      a.currentTime >= clipEnd.current
                    ) {
                      a.pause();
                      clipEnd.current = null;
                    }
                  }}
                />
              </>
            ) : (
              <p>选择知识点后，点击讲解片段即可回听。</p>
            )}
            {lesson.mode !== "demo" && (
              <div className="material-actions">
                <label className="file-button">
                  {record.audio ? "更换录音" : "添加录音"}
                  <input
                    type="file"
                    accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm"
                    disabled={!!busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void addMaterial(f, "audio");
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="file-button">
                  {lesson.segments.length
                    ? "替换字幕并重建目录"
                    : "导入 SRT / VTT"}
                  <input
                    type="file"
                    accept=".srt,.vtt"
                    disabled={!!busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void addMaterial(f, "subtitle");
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </section>
        <section className="insight-panel panel">
          <Tabs defaultValue="notes">
            <TabsList variant="line">
              <TabsTrigger value="notes">知识笔记</TabsTrigger>
              <TabsTrigger value="transcript">课堂原文</TabsTrigger>
            </TabsList>
            <TabsContent value="notes">
              <p className="eyebrow">
                当前知识点{" "}
                <span className="confidence">
                  {selected?.confidence === "low"
                    ? "对应待确认"
                    : selected?.confidence === "medium"
                      ? "候选对应"
                      : "已有来源"}
                </span>
              </p>
              <h2>{selected?.title || "等待导入"}</h2>
              <p className="summary">
                {selected?.summary || "导入资料后，在这里查看知识点笔记。"}
              </p>
              {linked.length > 0 ? (
                <>
                  <div
                    className={`emphasis ${selected.emphasis === "none" ? "neutral" : ""}`}
                  >
                    <span>
                      {emphasisLabel[selected.emphasis]}
                      {lesson.mode === "demo"
                        ? " · 示例"
                        : lesson.mode === "local"
                          ? " · 规则候选"
                          : ""}
                    </span>
                    <p>
                      “
                      {
                        (
                          linked.find(
                            (s) => emphasisOf(s.text) === "explicit",
                          ) || linked[0]
                        ).text
                      }
                      ”
                    </p>
                  </div>
                  <div className="clip-heading">
                    <h3>相关课堂切片</h3>
                    <span>{linked.length} 段</span>
                  </div>
                  {linked.map((s) => (
                    <button
                      className="clip"
                      key={s.id}
                      onClick={() => void playClip(s)}
                    >
                      <span className="clip-play">
                        <Play size={14} />
                      </span>
                      <span>
                        <strong>
                          {formatTime(s.start)} — {formatTime(s.end)}
                        </strong>
                        <small>{s.text}</small>
                      </span>
                    </button>
                  ))}
                </>
              ) : (
                <div className="empty-note">
                  <Headphones size={22} />
                  <p>
                    {lesson.segments.length
                      ? "没有找到可靠的讲解对应。可以手动选择来源。"
                      : "还没有课堂转录。导入字幕，或配置 AI 后转录录音。"}
                  </p>
                </div>
              )}
              <div className="source-label">
                来源：
                {selected?.pageNumbers.length
                  ? `课件第 ${selected.pageNumbers.join("、")} 页`
                  : "课堂补充"}
                {linked.length ? ` · ${linked.length} 段原话` : ""}
              </div>
              {lesson.mode !== "demo" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="edit-source"
                  disabled={!!busy}
                  onClick={openEdit}
                >
                  <Pencil />
                  校正对应关系
                </Button>
              )}
              <div className="notes-translation">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!busy || !linked.length}
                  onClick={() =>
                    void translate(
                      linked.map((s) => s.text).join("\n"),
                      "课堂原文",
                      "zh",
                    )
                  }
                >
                  <Languages />
                  翻译课堂原文
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="transcript">
              <div className="transcript-caption">
                带时间戳的课堂原文 · 点击回听
              </div>
              {lesson.segments.length ? (
                lesson.segments.map((s) => (
                  <button
                    className={`transcript-line ${playTime >= s.start && playTime < s.end && audioUrl ? "active" : ""}`}
                    key={s.id}
                    onClick={() => void playClip(s)}
                  >
                    <span>{formatTime(s.start)}</span>
                    <p>{s.text}</p>
                  </button>
                ))
              ) : (
                <div className="empty-note">
                  <p>
                    导入 SRT / VTT 字幕即可查看原文。自动语音转录需要配置 AI
                    服务。
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>
      <footer className="page-footer">
        <span>课间 · 把课堂连成知识</span>
        <span>资料仅保存在当前浏览器 · 建议定期导出备份</span>
      </footer>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent className="atlas-dialog" showCloseButton={!busy}>
          {dialog === "import" && (
            <>
              <DialogHeader>
                <DialogTitle>导入本节资料</DialogTitle>
                <DialogDescription>
                  每次导入创建一节新课。先在当前设备整理，点击 AI
                  整理时才发送资料。
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void importLesson();
                }}
                className="import-form"
              >
                <div className="form-row">
                  <label>
                    课程名称
                    <input
                      value={course}
                      onChange={(e) => setCourse(e.target.value)}
                      placeholder="例如：概率论与数理统计"
                      maxLength={100}
                      disabled={!!busy}
                    />
                  </label>
                  <label>
                    本节主题
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="默认使用课件文件名"
                      maxLength={180}
                      disabled={!!busy}
                    />
                  </label>
                </div>
                <label className="upload-box">
                  <Upload />
                  <strong>{docFile?.name || "选择 PPTX 或 PDF 课件"}</strong>
                  <span>必选 · 最大 30 MB / 160 页 · 旧 PPT 请先转换</span>
                  <input
                    aria-label="选择课件"
                    type="file"
                    accept=".pdf,.pptx,.ppt"
                    disabled={!!busy}
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                  />
                </label>
                <div className="form-row">
                  <label className="upload-small">
                    <Headphones />
                    <strong>{audioFile?.name || "添加课堂录音"}</strong>
                    <span>可选 · 最大 24 MB</span>
                    <input
                      aria-label="选择课堂录音"
                      type="file"
                      accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm"
                      disabled={!!busy}
                      onChange={(e) =>
                        setAudioFile(e.target.files?.[0] || null)
                      }
                    />
                  </label>
                  <label className="upload-small">
                    <FileText />
                    <strong>{subFile?.name || "已有课堂字幕"}</strong>
                    <span>可选 · SRT / VTT · 最大 2 MB</span>
                    <input
                      aria-label="选择课堂字幕"
                      type="file"
                      accept=".srt,.vtt"
                      disabled={!!busy}
                      onChange={(e) => setSubFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
                <p className="form-help">
                  PPTX 提取文字；PDF 支持原页预览。扫描件暂不支持
                  OCR。录音与字幕应来自同一时间轴。
                </p>
                {importError && (
                  <p className="form-error" role="alert">
                    {importError}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={!!busy || !docFile}
                  className="w-full"
                >
                  {busy ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      {busy}
                    </>
                  ) : (
                    <>
                      <Check />
                      导入并生成本地目录
                    </>
                  )}
                </Button>
              </form>
              <div className="sample-links">
                自制测试资料：
                <a href="/examples/probability.pdf" download>
                  PDF 课件
                </a>
                <a href="/examples/probability.pptx" download>
                  PPTX 课件
                </a>
                <a href="/examples/probability.srt" download>
                  字幕
                </a>
              </div>
            </>
          )}
          {dialog === "settings" && (
            <>
              <DialogHeader>
                <DialogTitle>AI 服务设置</DialogTitle>
                <DialogDescription>
                  课件阅读、字幕导入和录音播放无需密钥。自动转录、总结和翻译需要单独配置
                  API。
                </DialogDescription>
              </DialogHeader>
              <div
                className={`service-status ${status.configured ? "ready" : ""}`}
              >
                <Sparkles />
                {statusError
                  ? "暂时无法连接服务"
                  : status.configured
                    ? "OpenAI 服务已配置"
                    : "尚未配置 AI 服务"}
              </div>
              <ol className="setup-steps">
                <li>
                  在项目根目录将 <code>.env.example</code> 复制为{" "}
                  <code>.env</code>。
                </li>
                <li>
                  在 <code>OPENAI_API_KEY</code> 后填入自己的 API
                  密钥。仅保存在服务端，不上传 GitHub。
                </li>
                <li>重启网页服务，点击下方检查连接。</li>
              </ol>
              <p className="form-help">
                当前默认使用 OpenAI。API 费用由服务商收取。使用 AI
                时，所选课件文字、字幕及待转录录音会发送到该服务；密钥不会交给浏览器。
              </p>
              {status.protected && (
                <label className="token-field">
                  网页访问口令
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                    placeholder="由部署者设置，仅在当前页面内存中使用"
                  />
                </label>
              )}
              <Button variant="outline" onClick={() => void refreshStatus()}>
                检查服务配置
              </Button>
            </>
          )}
          {dialog === "library" && (
            <>
              <DialogHeader>
                <DialogTitle>我的课堂</DialogTitle>
                <DialogDescription>
                  仅当前设备可见。清除浏览器数据会移除资料，请定期导出笔记并保留原始文件。
                </DialogDescription>
              </DialogHeader>
              <div className="lesson-list">
                <button
                  onClick={() => {
                    activate({ lesson: demoLesson });
                    setDialog(null);
                  }}
                >
                  <BookOpen />
                  <span>
                    <strong>条件概率与贝叶斯公式</strong>
                    <small>自制示例 · 4 个知识点</small>
                  </span>
                  {lesson.id === "demo" && <Check />}
                </button>
                {library
                  .filter((x) => x.lesson.mode !== "demo")
                  .map((item) => (
                    <button
                      key={item.lesson.id}
                      onClick={() => {
                        activate(item);
                        setDialog(null);
                      }}
                    >
                      <FileText />
                      <span>
                        <strong>{item.lesson.title}</strong>
                        <small>
                          {item.lesson.course} · {item.lesson.pages.length} 页 ·{" "}
                          {item.lesson.nodes.length} 个知识点
                        </small>
                      </span>
                      {lesson.id === item.lesson.id && <Check />}
                    </button>
                  ))}
              </div>
              <Button onClick={openImport}>
                <Plus />
                导入新的一课
              </Button>
            </>
          )}
          {dialog === "export" && (
            <>
              <DialogHeader>
                <DialogTitle>导出学习笔记</DialogTitle>
                <DialogDescription>
                  包含知识点、课件页码、课堂原话和时间戳，不包含原始音频或课件文件。
                </DialogDescription>
              </DialogHeader>
              <Button
                onClick={() =>
                  download(
                    `${lesson.title}.md`,
                    toMarkdown(lesson),
                    "text/markdown;charset=utf-8",
                  )
                }
              >
                <Download />
                下载 Markdown 笔记
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  download(
                    `${lesson.title}.json`,
                    JSON.stringify(lesson, null, 2),
                    "application/json",
                  )
                }
              >
                <Download />
                下载结构化 JSON
              </Button>
              <p className="form-help">
                请同时保留原始课件和录音。JSON
                用于数据导出，当前版本不提供重新导入。
              </p>
            </>
          )}
          {dialog === "edit" && (
            <>
              <DialogHeader>
                <DialogTitle>校正对应关系</DialogTitle>
                <DialogDescription>
                  为「{selected?.title}」选择正确的课件页和讲解片段。
                </DialogDescription>
              </DialogHeader>
              <label className="token-field">
                课件页码
                <input
                  value={editPages}
                  onChange={(e) => setEditPages(e.target.value)}
                  placeholder="例如：1, 3"
                  disabled={!!busy}
                />
              </label>
              <div className="source-options">
                {lesson.segments.length ? (
                  lesson.segments.map((s) => (
                    <label key={s.id}>
                      <Checkbox
                        checked={editSegments.includes(s.id)}
                        disabled={!!busy}
                        onCheckedChange={(checked) =>
                          setEditSegments((ids) =>
                            checked
                              ? [...ids, s.id]
                              : ids.filter((id) => id !== s.id),
                          )
                        }
                      />
                      <span>
                        <strong>
                          {formatTime(s.start)} — {formatTime(s.end)}
                        </strong>
                        <p>{s.text}</p>
                      </span>
                    </label>
                  ))
                ) : (
                  <p>尚无字幕，暂时只能校正课件页。</p>
                )}
              </div>
              <Button disabled={!!busy} onClick={() => void saveLinks()}>
                保存对应关系
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
