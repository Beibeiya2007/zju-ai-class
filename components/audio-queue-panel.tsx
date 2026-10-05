"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { segmentedCapture, type CapturedPart } from "@/lib/segmented-capture";
import {
  listParts,
  listSessions,
  savePart,
  saveSession,
  type AudioPart,
  type RecordingSession,
} from "@/lib/audio-jobs";
import { combineTranscript, offsetSegments } from "@/lib/audio-timeline";
import { formatTime } from "@/lib/learning";
import type { Segment } from "@/lib/types";

function PartAudio({ file, name }: { file: Blob; name: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <>
      <audio src={url} controls preload="none" />
      <a href={url} download={name}>
        下载音频
      </a>
    </>
  );
}
export function AudioQueuePanel({
  lessonId,
  configured,
  token,
  onLock,
  onApply,
}: {
  lessonId: string;
  configured: boolean;
  token: string;
  onLock: (locked: boolean) => void;
  onApply: (
    sessionId: string,
    segments: Segment[],
    count: number,
  ) => Promise<void>;
}) {
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [parts, setParts] = useState<AudioPart[]>([]);
  const [source, setSource] = useState("tab");
  const [active, setActive] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [unsaved, setUnsaved] = useState<AudioPart | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const capture = useRef<ReturnType<typeof segmentedCapture> | null>(null);
  const pause = useRef(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const unsavedRef = useRef<AudioPart | null>(null);
  const busy = active || working;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pause.current = true;
      capture.current?.stop();
    };
  }, []);
  useEffect(() => {
    void listSessions(lessonId)
      .then((items) => {
        if (mounted.current) {
          setSessions(items);
          setSessionId(items[0]?.id || "");
        }
      })
      .catch((e) => setError(e.message));
  }, [lessonId]);
  useEffect(() => {
    let cancelled = false;
    setConfirmApply(false);
    setParts([]);
    if (sessionId)
      void listParts(sessionId)
        .then((items) => {
          if (!cancelled) setParts(items);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);
  useEffect(() => {
    if (!busy && !unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, unsaved]);
  async function refresh(id: string) {
    const values = await listParts(id);
    if (mounted.current) setParts(values);
  }
  async function record() {
    if (inFlight.current) return;
    capture.current = null;
    inFlight.current = true;
    setActive(true);
    onLock(true);
    setError("");
    setMessage("等待浏览器共享权限…");
    let stream: MediaStream | undefined;
    let session: RecordingSession | undefined;
    let releaseLease: (() => void) | undefined;
    try {
      if (
        !window.isSecureContext ||
        !navigator.mediaDevices ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error("请使用 HTTPS 或本机地址，以及支持录音的浏览器。");
      if (!navigator.locks)
        throw new Error(
          "此浏览器缺少任务互斥支持，请用新版 Chrome 或 Edge 进行长课录音。",
        );
      stream =
        source === "mic"
          ? await navigator.mediaDevices.getUserMedia({ audio: true })
          : await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true,
            });
      if (!mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!stream.getAudioTracks().length)
        throw new Error(
          "未收到声音，请选择课程标签页并勾选共享音频，或改用麦克风。",
        );
      session = {
        id: crypto.randomUUID(),
        lessonId,
        createdAt: new Date().toISOString(),
      };
      await saveSession(session);
      releaseLease = await new Promise<() => void>((resolve, reject) => {
        void navigator.locks
          .request(
            `lecture-atlas-recording-${session!.id}`,
            () => new Promise<void>((release) => resolve(release)),
          )
          .catch(reject);
      });
      if (!mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        releaseLease();
        inFlight.current = false;
        return;
      }
      setSessions((items) => [session!, ...items]);
      setSessionId(session.id);
      setParts([]);
      const current = session;
      const asJob = (part: CapturedPart): AudioPart => ({
        id: `${current.id}-${part.number}`,
        sessionId: current.id,
        number: part.number,
        start: part.start,
        end: part.end,
        name: part.file.name,
        audio: part.file,
        status: "pending",
        segments: [],
      });
      capture.current = segmentedCapture(stream, MediaRecorder, {
        save: async (part) => {
          await savePart(asJob(part));
          if (mounted.current) {
            await refresh(current.id);
            setMessage(`录音中 · 已保存 ${part.number} 段，继续采集下一段…`);
          }
        },
        failed: (part, e) => {
          if (mounted.current) {
            setError(e.message);
            if (part?.file.size) {
              unsavedRef.current = asJob(part);
              setUnsaved(unsavedRef.current);
            }
          }
        },
        finished: () => {
          releaseLease?.();
          const ended = { ...current, endedAt: new Date().toISOString() };
          void saveSession(ended)
            .then(() => {
              if (mounted.current)
                setSessions((items) =>
                  items.map((s) => (s.id === current.id ? ended : s)),
                );
            })
            .catch((e) => {
              if (mounted.current) setError(e.message);
            });
          if (mounted.current) {
            setActive(false);
            setMessage("录音已停止，已保存片段可试听或转录。");
            onLock(!!unsavedRef.current);
          }
          inFlight.current = false;
        },
      });
      setMessage("正在录音 · 约每分钟自动保存一段。");
    } catch (e) {
      releaseLease?.();
      stream?.getTracks().forEach((t) => t.stop());
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "无法开始录音。");
        setActive(false);
        onLock(false);
      }
      inFlight.current = false;
    }
  }
  async function transcribe() {
    if (inFlight.current || !sessionId) return;
    if (!configured) {
      setError("请先在 AI 设置中配置服务；录音仍可保存和下载。");
      return;
    }
    if (!navigator.locks) {
      setError("此浏览器缺少任务互斥支持，请使用新版 Chrome 或 Edge 转录。");
      return;
    }
    inFlight.current = true;
    setWorking(true);
    onLock(true);
    pause.current = false;
    setError("");
    try {
      await navigator.locks.request(
        "lecture-atlas-transcription",
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw new Error("另一个课间标签页正在转录，请先暂停它再重试。");
          const held = (await navigator.locks.query()).held || [];
          if (
            held.some(
              (item) => item.name === `lecture-atlas-recording-${sessionId}`,
            )
          )
            throw new Error(
              "这次录音还在另一个标签页采集中，请先停止录音再转录。",
            );
          // A running record from a closed tab is retried only after acquiring the lock.
          const jobs = await listParts(sessionId);
          for (const original of jobs) {
            if (pause.current) break;
            if (original.status === "done") continue;
            let job: AudioPart = {
              ...original,
              status: "running",
              error: undefined,
            };
            await savePart(job);
            await refresh(sessionId);
            setMessage(`正在转录第 ${job.number} / ${jobs.length} 段…`);
            try {
              const body = new FormData();
              body.append("file", job.audio, job.name);
              const response = await fetch("/api/transcribe", {
                method: "POST",
                body,
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                signal: AbortSignal.timeout(190_000),
              });
              const result = (await response.json()) as {
                segments?: Segment[];
                error?: string;
              };
              if (!response.ok)
                throw new Error(
                  result.error || `转录失败（${response.status}）。`,
                );
              if (!Array.isArray(result.segments))
                throw new Error("转录服务返回了无效资料。");
              job = {
                ...job,
                status: "done",
                segments: offsetSegments(job, result.segments),
                error: undefined,
              };
              await savePart(job);
            } catch (e) {
              const message = e instanceof Error ? e.message : "转录失败。";
              await savePart({ ...original, status: "failed", error: message });
              throw new Error(
                `第 ${job.number} 段未完成：${message} 已完成分段保留，可稍后重试。`,
              );
            } finally {
              await refresh(sessionId);
            }
            // Stay below the server's shared per-minute request limit.
            if (
              !pause.current &&
              jobs.some((p) => p.number > job.number && p.status !== "done")
            )
              await new Promise((resolve) => setTimeout(resolve, 5500));
          }
          setMessage(
            pause.current
              ? "已暂停；下次从未完成的片段继续。"
              : "转录已完成，可以应用到课堂。",
          );
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "转录未完成。");
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setWorking(false);
        onLock(false);
      }
    }
  }
  async function apply() {
    setWorking(true);
    onLock(true);
    setError("");
    try {
      const current = await listParts(sessionId);
      await onApply(sessionId, combineTranscript(current), current.length);
      toast.success("分段录音和转录已应用到本节课。");
      setConfirmApply(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法应用。");
    } finally {
      setWorking(false);
      onLock(false);
    }
  }
  const allDone = parts.length > 0 && parts.every((p) => p.status === "done");
  return (
    <div className="audio-queue-panel">
      <p className="muted">
        音频约每分钟保存到本机；停止后可逐段转录。关闭页面会停止采集与任务，重新打开可继续处理已保存的片段。
      </p>
      <label>
        录音来源
        <select
          disabled={busy || !!unsaved}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="tab">课程回放标签页声音</option>
          <option value="mic">麦克风</option>
        </select>
      </label>
      <div className="queue-actions">
        <Button disabled={busy || !!unsaved} onClick={() => void record()}>
          开始新录音（自动分段）
        </Button>
        {active && (
          <Button
            disabled={!capture.current}
            variant="destructive"
            onClick={() => {
              setMessage("正在结束并保存最后一段…");
              capture.current?.stop();
            }}
          >
            停止录音
          </Button>
        )}
      </div>
      <label>
        本节录音记录
        <select
          disabled={busy || !!unsaved}
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        >
          <option value="">暂无录音</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {new Date(s.createdAt).toLocaleString("zh-CN")} ·{" "}
              {s.endedAt ? "已结束" : "未正常结束 / 录制中"}
            </option>
          ))}
        </select>
      </label>
      {message && (
        <p role="status" className="queue-status">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {unsaved && (
        <div className="unsaved-part">
          <strong>有一段音频尚未保存，请先下载或重试保存。</strong>
          <PartAudio file={unsaved.audio} name={unsaved.name} />
          <Button
            disabled={busy}
            onClick={async () => {
              setWorking(true);
              onLock(true);
              try {
                if (unsaved.audio.size > 24_000_000)
                  throw new Error("此段超过 24 MB，请下载后分开处理。");
                await savePart(unsaved);
                await refresh(unsaved.sessionId);
                unsavedRef.current = null;
                setUnsaved(null);
                setError("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "仍无法保存。");
              } finally {
                setWorking(false);
                onLock(!!unsavedRef.current);
              }
            }}
          >
            重试保存这段音频
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => {
              unsavedRef.current = null;
              setUnsaved(null);
              onLock(false);
            }}
          >
            确认放弃未保存片段
          </Button>
        </div>
      )}
      <div className="queue-actions">
        <Button
          disabled={busy || !parts.length || allDone || !!unsaved}
          onClick={() => void transcribe()}
        >
          开始 / 继续转录{configured ? "" : "（需配置 AI）"}
        </Button>
        {working && inFlight.current && (
          <Button
            variant="outline"
            onClick={() => {
              pause.current = true;
              setMessage("将在当前分段保存后暂停…");
            }}
          >
            完成当前段后暂停
          </Button>
        )}
      </div>
      <p className="helper">
        {parts.filter((p) => p.status === "done").length} / {parts.length}{" "}
        段转录完成。点击转录才上传音频到 AI
        服务；重试未收到结果的请求可能再次计费。
      </p>
      <div className="audio-part-list">
        {parts.map((part) => (
          <details key={part.id}>
            <summary>
              第 {part.number} 段 · {formatTime(part.start)}–
              {formatTime(part.end)} ·{" "}
              {
                {
                  pending: "待转录",
                  running: working ? "转录中" : "上次中断，可继续",
                  done: "已完成",
                  failed: "失败，可重试",
                }[part.status]
              }
            </summary>
            <PartAudio file={part.audio} name={part.name} />
            {part.error && <p className="form-error">{part.error}</p>}
            {part.status === "done" && (
              <p>
                {part.segments.map((s) => s.text).join("\n") ||
                  "未识别到语音。"}
              </p>
            )}
          </details>
        ))}
      </div>
      {allDone && (
        <>
          <label className="replace-confirm">
            <input
              type="checkbox"
              checked={confirmApply}
              disabled={busy}
              onChange={(e) => setConfirmApply(e.target.checked)}
            />
            将这次录音和转录应用到本节课，替换已有音频、字幕并重建目录。
          </label>
          <Button
            disabled={busy || !confirmApply || !!unsaved}
            onClick={() => void apply()}
          >
            应用到课堂与知识点
          </Button>
        </>
      )}
      <p className="helper">
        最长 4 小时 / 500
        MB。不要休眠或关闭页面；未完成的当前段可能丢失。分段交界可能有短暂间隙，时间以实际采集位置为准。本版不提供服务器后台录制、实时字幕或已有大文件自动切分。
      </p>
    </div>
  );
}
