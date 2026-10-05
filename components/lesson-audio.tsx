"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { listParts } from "@/lib/audio-jobs";
import { partAt } from "@/lib/audio-timeline";
import { formatTime } from "@/lib/learning";
import type { Segment } from "@/lib/types";
import { toast } from "sonner";
type PlayPart = {
  id: string;
  start: number;
  end: number;
  audio: Blob;
  name: string;
};
export type LessonAudioHandle = {
  pause: () => void;
  seek: (segment: Segment, autoplay: boolean) => void;
};
export const LessonAudio = forwardRef<
  LessonAudioHandle,
  {
    audio?: Blob;
    sessionId?: string;
    name?: string;
    onTime: (time: number) => void;
  }
>(function LessonAudio({ audio, sessionId, name, onTime }, ref) {
  const [parts, setParts] = useState<PlayPart[]>([]);
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const element = useRef<HTMLAudioElement>(null);
  const pending = useRef<{ time: number; autoplay: boolean } | null>(null);
  const clipEnd = useRef<number | null>(null);
  const stoppedClip = useRef(false);
  const part = parts[index];
  useEffect(() => {
    let cancelled = false;
    element.current?.pause();
    setIndex(0);
    pending.current = null;
    clipEnd.current = null;
    setParts([]);
    if (sessionId) {
      setLoading(true);
      void listParts(sessionId)
        .then((values) => {
          if (!cancelled) setParts(values);
        })
        .catch((e) => toast.error(e.message))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      setLoading(false);
      if (audio)
        setParts([
          {
            id: "single",
            start: 0,
            end: Infinity,
            audio,
            name: name || "课堂录音",
          },
        ]);
    }
    return () => {
      cancelled = true;
    };
  }, [audio, sessionId, name]);
  useEffect(() => {
    if (!part) {
      setUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(part.audio);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [part]);
  function seekLoaded() {
    const a = element.current,
      requested = pending.current;
    if (!a || !part || !requested || a.readyState < 1) return;
    if (Number.isFinite(a.duration) && requested.time >= a.duration) {
      pending.current = null;
      clipEnd.current = null;
      toast.error("转录时间超出这段音频，请核对来源。");
      return;
    }
    a.currentTime = requested.time;
    onTime(part.start + requested.time);
    pending.current = null;
    if (requested.autoplay)
      void a.play().catch(() => toast.info("请点击播放器继续播放。"));
  }
  useImperativeHandle(ref, () => ({
    pause() {
      element.current?.pause();
      clipEnd.current = null;
      pending.current = null;
    },
    seek(segment, autoplay) {
      const target = partAt(parts, segment.start);
      if (!target) {
        toast.info(
          loading
            ? "分段音频正在加载，请稍后重试。"
            : "该时间没有对应录音；请确认音频与转录来自同一次课堂。",
        );
        return;
      }
      element.current?.pause();
      clipEnd.current = autoplay ? segment.end : null;
      pending.current = { time: segment.start - target.start, autoplay };
      const next = parts.indexOf(target);
      if (next === index) seekLoaded();
      else setIndex(next);
    },
  }));
  if (!part)
    return (
      <p>
        {loading ? "正在读取分段录音…" : "尚未添加录音，可导入文件或录制课堂。"}
      </p>
    );
  return (
    <div className="lesson-audio">
      <p className="audio-name">
        {name || part.name}
        {parts.length > 1 ? ` · 第 ${index + 1} / ${parts.length} 段` : ""}
      </p>
      {parts.length > 1 && (
        <label>
          选择录音分段
          <select
            aria-label="选择录音分段"
            value={index}
            onChange={(e) => {
              element.current?.pause();
              pending.current = null;
              clipEnd.current = null;
              const i = Number(e.target.value);
              setIndex(i);
              onTime(parts[i].start);
            }}
          >
            {parts.map((p, i) => (
              <option key={p.id} value={i}>
                第 {i + 1} 段 · {formatTime(p.start)}–{formatTime(p.end)}
              </option>
            ))}
          </select>
        </label>
      )}
      <audio
        key={url}
        ref={element}
        src={url}
        controls
        preload="metadata"
        onLoadedMetadata={seekLoaded}
        onError={() => toast.error("无法解码该音频，请下载原文件核对。")}
        onTimeUpdate={() => {
          const a = element.current;
          if (!a) return;
          const time = part.start + a.currentTime;
          onTime(time);
          if (clipEnd.current !== null && time >= clipEnd.current) {
            a.pause();
            clipEnd.current = null;
            stoppedClip.current = true;
          }
        }}
        onPlay={() => {
          stoppedClip.current = false;
        }}
        onEnded={() => {
          if (stoppedClip.current) {
            stoppedClip.current = false;
            return;
          }
          const next = parts[index + 1];
          if (
            next &&
            (clipEnd.current === null || next.start < clipEnd.current)
          ) {
            pending.current = { time: 0, autoplay: true };
            setIndex(index + 1);
          } else clipEnd.current = null;
        }}
      />
      {parts.length > 1 && (
        <small>
          播放器显示当前段时间；课堂原文使用整节课时间。播放完后接续下一段。
        </small>
      )}
    </div>
  );
});
