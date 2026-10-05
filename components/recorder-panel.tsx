'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { capture, RECORDING_SECONDS } from '@/lib/capture';
import { formatTime } from '@/lib/learning';

type Phase = 'idle' | 'permission' | 'recording' | 'finishing' | 'ready' | 'saving';
export function RecorderPanel({ hasMaterial, onLock, onAttach }: { hasMaterial: boolean; onLock: (locked: boolean) => void; onAttach: (file: File) => Promise<void> }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [source, setSource] = useState('tab');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [replace, setReplace] = useState(false);
  const [discard, setDiscard] = useState(false);
  const session = useRef<ReturnType<typeof capture> | null>(null);
  const live = useRef(true);
  const startedAt = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; session.current?.dispose(); }; }, []);
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const objectUrl = URL.createObjectURL(file); setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= RECORDING_SECONDS) { setError('已达到 90 分钟上限，录音已停止。请保存后开始下一段。'); setPhase('finishing'); session.current?.stop(); }
    }, 500);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase === 'idle') return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase]);
  async function start() {
    if (phase !== 'idle') return;
    setError(''); setSeconds(0); setPhase('permission'); onLock(true);
    let stream: MediaStream | undefined;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices || typeof MediaRecorder === 'undefined') throw new Error('录音需要 HTTPS 或本机地址，以及支持录音的浏览器。请用新版 Chrome，或直接导入音频。');
      stream = source === 'mic'
        ? await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (!live.current) { stream.getTracks().forEach(t => t.stop()); return; }
      if (!stream.getAudioTracks().length) throw new Error('没有收到共享音频。请选择正在播放课程的浏览器标签页，并勾选“共享标签页音频”；也可改用麦克风。');
      session.current = capture(stream, MediaRecorder, {
        onFinish: result => { if (!live.current) return; setFile(result.size ? result : null); setPhase(result.size ? 'ready' : 'idle'); onLock(!!result.size); },
        onError: message => { if (live.current) setError(message); },
        onLimit: () => { if (live.current) { setError('录音已接近文件大小上限，已自动停止。'); setPhase('finishing'); } },
      });
      startedAt.current = Date.now(); setPhase('recording');
    } catch (e) {
      stream?.getTracks().forEach(t => t.stop());
      if (!live.current) return;
      const denied = e instanceof DOMException && e.name === 'NotAllowedError';
      setError(denied ? '你取消了共享或未授予录音权限。可以重新开始，现有课堂资料未改变。' : e instanceof Error ? e.message : '无法开始录音，请检查浏览器权限。');
      setPhase('idle'); onLock(false);
    }
  }
  async function attach() {
    if (!file || phase !== 'ready') return;
    setPhase('saving'); setError('');
    try { await onAttach(file); setFile(null); setPhase('idle'); onLock(false); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，录音仍可试听和下载，请重试。'); setPhase('ready'); }
  }
  return <div className="recorder-panel">
    <p className="muted">录制你有权使用的课堂内容。音频先保留在浏览器内，停止后保存到本节课，再按需点击 AI 整理转录。</p>
    {phase === 'idle' && <>
      <label>录音来源<select value={source} onChange={e => setSource(e.target.value)}><option value="tab">课程回放标签页的声音</option><option value="mic">麦克风（现场课堂）</option></select></label>
      <p className="helper">标签页录音请使用支持音频共享的浏览器，并在系统选择框中勾选共享声音。只保存音频，不保存画面。</p>
      <Button onClick={() => void start()}>开始录音</Button>
    </>}
    {(phase === 'permission' || phase === 'recording' || phase === 'finishing') && <div className="recording-status" role="status"><strong>{phase === 'permission' ? '等待浏览器授权…' : phase === 'finishing' ? '正在完成录音…' : `● 正在录音 ${formatTime(seconds)}`}</strong>{phase === 'recording' && <Button variant="destructive" onClick={() => { setPhase('finishing'); session.current?.stop(); }}>停止并试听</Button>}</div>}
    {file && <div className="recording-result"><p>{file.name} · {(file.size / 1_000_000).toFixed(2)} MB</p><audio src={url} controls preload="metadata" />
      <a href={url} download={file.name}>下载原始录音</a>
      {hasMaterial && <label className="replace-confirm"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} disabled={phase === 'saving'} />保存时替换本节录音、清空旧字幕并重建本地目录（避免时间轴错配）。</label>}
      <Button disabled={phase === 'saving' || (hasMaterial && !replace) || file.size > 24_000_000} onClick={() => void attach()}>{phase === 'saving' ? '正在保存…' : '保存到本节课'}</Button>
      {file.size > 24_000_000 && <p role="alert">最终文件超过 24 MB，请先下载并压缩，再导入。</p>}
      {!discard ? <Button variant="ghost" disabled={phase === 'saving'} onClick={() => setDiscard(true)}>放弃这次录音</Button> : <div className="discard-confirm"><p>尚未保存的录音将被丢弃，建议先下载。</p><Button variant="destructive" disabled={phase === 'saving'} onClick={() => { setFile(null); setPhase('idle'); setDiscard(false); setReplace(false); onLock(false); }}>确认丢弃</Button><Button variant="ghost" onClick={() => setDiscard(false)}>保留录音</Button></div>}
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="helper">单次最长 90 分钟，约 22 MB 时自动停止。停止前请勿关闭、刷新或休眠；异常退出可能丢失未保存录音。本版不提供边录边转文字。</p>
  </div>;
}
