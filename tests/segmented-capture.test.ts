import test from "node:test";
import assert from "node:assert/strict";
import { segmentedCapture } from "../lib/segmented-capture.ts";
class Track extends EventTarget {
  readyState = "live";
  stop() {
    this.readyState = "ended";
  }
}
class Stream {
  tracks: Track[];
  constructor(tracks: Track[]) {
    this.tracks = tracks;
  }
  getAudioTracks() {
    return this.tracks.slice(0, 1);
  }
  getTracks() {
    return this.tracks;
  }
}
class Recorder {
  static list: Recorder[] = [];
  static isTypeSupported(type: string) {
    return type === "audio/webm";
  }
  state = "inactive";
  mimeType = "audio/webm";
  onstop?: () => void;
  ondataavailable?: (e: { data: Blob }) => void;
  constructor() {
    Recorder.list.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    if (this.state === "inactive") throw new Error("double stop");
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["independent-container"]) });
      this.onstop?.();
    });
  }
}
function setup() {
  Object.defineProperty(globalThis, "MediaStream", {
    configurable: true,
    value: Stream,
  });
  Recorder.list = [];
  return new Stream([new Track(), new Track()]);
}
test("repeated stop waits for final chunk to be saved before releasing tracks", async () => {
  const stream = setup();
  let finish = 0;
  let saveEntered!: () => void;
  let releaseSave!: () => void;
  let finished!: () => void;
  const entered = new Promise<void>((r) => (saveEntered = r)),
    gate = new Promise<void>((r) => (releaseSave = r)),
    done = new Promise<void>((r) => (finished = r));
  const capture = segmentedCapture(
    stream as unknown as MediaStream,
    Recorder as unknown as typeof MediaRecorder,
    {
      save: async (part) => {
        assert.equal(await part.file.text(), "independent-container");
        saveEntered();
        await gate;
      },
      failed: () => assert.fail("save should succeed"),
      finished: () => {
        finish++;
        finished();
      },
    },
  );
  capture.stop();
  capture.stop();
  await entered;
  assert.equal(finish, 0);
  assert.equal(stream.tracks[0].readyState, "live");
  releaseSave();
  await done;
  assert.equal(finish, 1);
  assert.equal(stream.tracks[0].readyState, "ended");
});
test("each interval is independently recorded and times include storage gaps", async () => {
  const stream = setup();
  const parts: { start: number; end: number; file: File }[] = [];
  let finished!: () => void;
  const done = new Promise<void>((r) => (finished = r));
  const capture = segmentedCapture(
    stream as unknown as MediaStream,
    Recorder as unknown as typeof MediaRecorder,
    {
      intervalMs: 10,
      save: async (p) => {
        parts.push(p);
        await new Promise((r) => setTimeout(r, 5));
        if (parts.length === 2) capture.stop();
      },
      failed: () => assert.fail("recording failed"),
      finished,
    },
  );
  await done;
  assert.equal(parts.length, 2);
  assert.equal(Recorder.list.length, 2);
  assert.ok(parts[1].start >= parts[0].end);
  assert.equal(await parts[1].file.text(), "independent-container");
});
test("storage failure returns the unsaved file and stops further recording", async () => {
  const stream = setup();
  let failedFile: File | undefined;
  let finished!: () => void;
  const done = new Promise<void>((r) => (finished = r));
  const capture = segmentedCapture(
    stream as unknown as MediaStream,
    Recorder as unknown as typeof MediaRecorder,
    {
      save: async () => {
        throw new Error("quota exceeded");
      },
      failed: (p, e) => {
        failedFile = p?.file;
        assert.equal(e.message, "quota exceeded");
      },
      finished,
    },
  );
  capture.stop();
  await done;
  assert.equal(await failedFile!.text(), "independent-container");
  assert.equal(Recorder.list.length, 1);
  assert.equal(stream.tracks[1].readyState, "ended");
});
