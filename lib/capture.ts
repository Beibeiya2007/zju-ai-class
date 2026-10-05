export const RECORDING_LIMIT = 22_000_000;
export const RECORDING_SECONDS = 90 * 60;
export function recordingMime(supported: (type: string) => boolean): string {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(supported) || '';
}
export function recordingName(type: string, now = new Date()): string {
  return `课堂录音-${now.toISOString().replace(/[:.]/g, '-')}.${type.includes('mp4') ? 'm4a' : 'webm'}`;
}
// Timeslice blobs share a container header. Only concatenate them into one file;
// they are not independently decodable chunks for transcription.
export function capture(stream: MediaStream, Recorder: typeof MediaRecorder, callbacks: {
  onFinish: (file: File) => void; onError: (message: string) => void; onLimit: () => void;
}) {
  const mimeType = recordingMime(type => Recorder.isTypeSupported(type));
  if (!mimeType) throw new Error('此浏览器没有可用的录音格式，请使用新版 Chrome 或导入录音文件。');
  const recorder = new Recorder(new MediaStream(stream.getAudioTracks()), { mimeType, audioBitsPerSecond: 48_000 });
  const chunks: Blob[] = [];
  let size = 0;
  let finished = false;
  let disposed = false;
  const release = () => stream.getTracks().forEach(track => track.stop());
  const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); };
  recorder.ondataavailable = event => {
    if (event.data.size) { chunks.push(event.data); size += event.data.size; }
    if (size >= RECORDING_LIMIT && recorder.state !== 'inactive') { callbacks.onLimit(); stop(); }
  };
  recorder.onerror = () => { callbacks.onError('录音发生错误，已收到的音频会保留供试听和下载。'); stop(); };
  recorder.onstop = () => {
    if (finished) return;
    finished = true;
    release();
    if (disposed) return;
    const file = new File(chunks, recordingName(mimeType), { type: recorder.mimeType || mimeType });
    if (!file.size) callbacks.onError('没有录到音频，请检查共享声音或麦克风权限。');
    callbacks.onFinish(file);
  };
  for (const track of stream.getTracks()) track.addEventListener('ended', stop, { once: true });
  try { recorder.start(1000); } catch (error) { release(); throw error; }
  return { stop, dispose: () => { disposed = true; stop(); release(); } };
}
