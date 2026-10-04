import type { Lesson } from "./types";
export type SavedLesson = { lesson: Lesson; document?: Blob; audio?: Blob };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("lecture-atlas", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("lessons", { keyPath: "lesson.id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(
        new Error("无法打开本地资料库。请允许浏览器存储，或导出当前笔记。"),
      );
  });
}
export async function saveLesson(value: SavedLesson): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("lessons", "readwrite");
    tx.objectStore("lessons").put(value);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error("当前设备保存失败，可能空间不足。请先导出笔记。"));
    };
    tx.onabort = tx.onerror;
  });
}
export async function listLessons(): Promise<SavedLesson[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("lessons", "readonly");
    const r = tx.objectStore("lessons").getAll();
    r.onsuccess = () =>
      resolve(
        (r.result as SavedLesson[]).sort((a, b) =>
          b.lesson.updatedAt.localeCompare(a.lesson.updatedAt),
        ),
      );
    r.onerror = () => reject(new Error("读取本地资料失败。"));
    tx.oncomplete = () => db.close();
  });
}
