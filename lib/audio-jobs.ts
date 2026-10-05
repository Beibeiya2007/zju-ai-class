import { database } from "./storage";
import type { Segment } from "./types";
export type RecordingSession = {
  id: string;
  lessonId: string;
  createdAt: string;
  endedAt?: string;
};
export type AudioPart = {
  id: string;
  sessionId: string;
  number: number;
  start: number;
  end: number;
  audio: Blob;
  name: string;
  status: "pending" | "running" | "done" | "failed";
  segments: Segment[];
  error?: string;
};
async function put(
  store: string,
  value: RecordingSession | AudioPart,
): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        new Error("本地保存失败，可能空间不足。请下载未保存的音频后重试。"),
      );
    };
  });
}
export const saveSession = (session: RecordingSession) =>
  put("recording-sessions", session);
export const savePart = (part: AudioPart) => put("audio-parts", part);
export async function listSessions(
  lessonId: string,
): Promise<RecordingSession[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("recording-sessions", "readonly");
    const request = tx.objectStore("recording-sessions").getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as RecordingSession[])
          .filter((s) => s.lessonId === lessonId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    request.onerror = () => reject(new Error("读取录音记录失败。"));
    tx.oncomplete = tx.onabort = () => db.close();
  });
}
export async function listParts(sessionId: string): Promise<AudioPart[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("audio-parts", "readonly");
    const request = tx
      .objectStore("audio-parts")
      .index("sessionId")
      .getAll(sessionId);
    request.onsuccess = () =>
      resolve(
        (request.result as AudioPart[]).sort((a, b) => a.number - b.number),
      );
    request.onerror = () => reject(new Error("读取录音分段失败。"));
    tx.oncomplete = tx.onabort = () => db.close();
  });
}
