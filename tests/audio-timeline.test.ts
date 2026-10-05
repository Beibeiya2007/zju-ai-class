import test from "node:test";
import assert from "node:assert/strict";
import {
  combineTranscript,
  offsetSegments,
  partAt,
} from "../lib/audio-timeline.ts";
const segment = { id: "s1", start: 1, end: 4, text: "这是考点" };
test("relative transcription becomes lesson time with unique IDs", () => {
  const a = offsetSegments({ id: "part-a", start: 60.2, end: 120.2 }, [
    segment,
  ]);
  const b = offsetSegments({ id: "part-b", start: 121, end: 181 }, [segment]);
  assert.equal(a[0].start, 61.2);
  assert.equal(b[0].start, 122);
  assert.notEqual(a[0].id, b[0].id);
});
test("out of range or invalid model times are rejected, small end drift clamped", () => {
  const part = { id: "p", start: 20, end: 30 };
  assert.throws(() =>
    offsetSegments(part, [{ ...segment, start: 11, end: 12 }]),
  );
  assert.throws(() => offsetSegments(part, [{ ...segment, end: 15 }]));
  assert.throws(() => offsetSegments(part, [{ ...segment, start: NaN }]));
  assert.equal(offsetSegments(part, [{ ...segment, end: 10.2 }])[0].end, 30);
});
test("recording gaps are never assigned to an unrelated audio part", () => {
  const parts = [
    { start: 0, end: 60 },
    { start: 60.3, end: 120 },
  ];
  assert.equal(partAt(parts, 60.2), undefined);
  assert.equal(partAt(parts, 60.3), parts[1]);
  assert.equal(partAt(parts, 120), undefined);
});
test("incomplete or missing segments cannot be applied to lesson", () => {
  const part = {
    id: "a",
    number: 1,
    start: 0,
    end: 10,
    status: "done",
    segments: [segment],
  };
  assert.throws(() => combineTranscript([{ ...part, status: "failed" }]));
  assert.throws(() => combineTranscript([{ ...part, number: 2 }]));
  assert.throws(() =>
    combineTranscript([
      part,
      { ...part, id: "b", number: 2, start: 11, end: 20 },
    ]),
  );
  assert.deepEqual(combineTranscript([{ ...part, segments: [] }]), []);
});
