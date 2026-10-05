import { recordingMime, recordingName } from "./capture.ts";
export type CapturedPart = {
  number: number;
  start: number;
  end: number;
  file: File;
};
// Each interval is a complete MediaRecorder session, not a byte slice of WebM.
export function segmentedCapture(
  stream: MediaStream,
  Recorder: typeof MediaRecorder,
  options: {
    save: (part: CapturedPart) => Promise<void>;
    failed: (part: CapturedPart | undefined, error: Error) => void;
    finished: () => void;
    intervalMs?: number;
  },
) {
  const type = recordingMime((t) => Recorder.isTypeSupported(t));
  if (!type) throw new Error("浏览器不支持可用的录音格式。");
  const origin = performance.now();
  let recording: MediaRecorder | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopping = false,
    finalised = false,
    inPart = false,
    number = 0,
    totalSize = 0;
  const finish = () => {
    if (finalised) return;
    finalised = true;
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    options.finished();
  };
  const stop = () => {
    stopping = true;
    clearTimeout(timer);
    if (recording?.state === "recording") recording.stop();
    else if (!inPart) finish();
  };
  function begin() {
    if (stopping) {
      finish();
      return;
    }
    const recorder = new Recorder(new MediaStream(stream.getAudioTracks()), {
      mimeType: type,
      audioBitsPerSecond: 48_000,
    });
    recording = recorder;
    inPart = true;
    const chunks: Blob[] = [];
    let size = 0;
    const start = (performance.now() - origin) / 1000;
    const partNumber = ++number;
    recorder.ondataavailable = (e) => {
      if (e.data.size) {
        chunks.push(e.data);
        size += e.data.size;
      }
      if (size >= 20_000_000 && recorder.state === "recording") recorder.stop();
    };
    recorder.onerror = () => {
      options.failed(
        undefined,
        new Error("采集发生错误，录音将停止；已完成的分段保留。"),
      );
      stop();
    };
    recorder.onstop = async () => {
      clearTimeout(timer);

      const part: CapturedPart = {
        number: partNumber,
        start,
        end: (performance.now() - origin) / 1000,
        file: new File(chunks, recordingName(recorder.mimeType || type), {
          type: recorder.mimeType || type,
        }),
      };
      try {
        if (!part.file.size) throw new Error("没有录到音频，请检查音频来源。");
        if (part.file.size > 24_000_000)
          throw new Error("当前片段超出 24 MB，请下载后压缩。");
        await options.save(part);
        totalSize += part.file.size;
      } catch (e) {
        stopping = true;
        options.failed(part, e instanceof Error ? e : new Error("保存失败。"));
      }
      inPart = false;
      if (
        totalSize >= 500_000_000 ||
        performance.now() - origin >= 4 * 60 * 60_000
      ) {
        stopping = true;
        options.failed(
          undefined,
          new Error("已达到 4 小时或 500 MB 上限，录音已停止。"),
        );
      }
      if (
        stopping ||
        !stream.getAudioTracks().some((t) => t.readyState === "live")
      )
        finish();
      else {
        try {
          begin();
        } catch (e) {
          options.failed(
            undefined,
            e instanceof Error ? e : new Error("无法继续录音。"),
          );
          finish();
        }
      }
    };
    recorder.start(1000);
    timer = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, options.intervalMs || 60_000);
  }
  stream
    .getTracks()
    .forEach((t) => t.addEventListener("ended", stop, { once: true }));
  try {
    begin();
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  return { stop };
}
