import test from "node:test";
import assert from "node:assert/strict";
import {
  emphasisOf,
  formatTime,
  localOutline,
  parseSubtitles,
  toMarkdown,
} from "../lib/learning.ts";
import { validateNodes } from "../lib/validation.ts";
import { demoLesson } from "../lib/demo.ts";

test("SRT preserves timestamps and multiline original text", () => {
  const s = parseSubtitles(
    "1\r\n00:01:02,500 --> 00:01:07,100\r\n条件概率\r\n很重要。\r\n",
  );
  assert.deepEqual(s, [
    { id: "s1", start: 62.5, end: 67.1, text: "条件概率\n很重要。" },
  ]);
});
test("VTT supports short timestamps and cue settings", () => {
  const s = parseSubtitles(
    "WEBVTT\n\ncue-1\n01:02.500 --> 01:07.100 align:start\n<b>Bayes</b> theorem",
  );
  assert.equal(s[0].start, 62.5);
  assert.equal(s[0].text, "Bayes theorem");
});
test("VTT NOTE blocks never become lecture text", () => {
  const s = parseSubtitles(
    "WEBVTT\n\nNOTE\n00:00.000 --> 00:01.000\nnot a cue\n\n00:02.000 --> 00:03.000\nreal cue",
  );
  assert.equal(s.length, 1);
  assert.equal(s[0].text, "real cue");
});
test("malformed and reversed timestamps fail explicitly", () => {
  assert.throws(() => parseSubtitles("普通文本"));
  assert.throws(() => parseSubtitles("1\n00:00:10,000 --> 00:00:05,000\n内容"));
  assert.throws(() => parseSubtitles("00:99:10,000 --> 00:99:15,000\n内容"));
});
test("negative and historical exam statements do not become emphasis", () => {
  for (const t of [
    "这个不重要",
    "这里不考",
    "这个不是考点",
    "去年考过的这个很重要",
    "This is not important.",
    "This will not be on the exam.",
  ])
    assert.equal(emphasisOf(t), "none", t);
  assert.equal(emphasisOf("这个很重要，考点是条件概率。"), "explicit");
});
test("unrelated subtitles never produce fabricated links", () => {
  const nodes = localOutline(
    [{ number: 1, title: "贝叶斯公式", text: "条件概率与后验概率" }],
    [{ id: "s1", start: 0, end: 5, text: "今天下午操场集合参加运动会" }],
  );
  assert.deepEqual(nodes[0].segmentIds, []);
  assert.equal(nodes[0].confidence, "low");
});
test("source validation rejects hallucinated pages and segments", () => {
  const node = demoLesson.nodes[0];
  assert.throws(() =>
    validateNodes(
      { nodes: [{ ...node, pageNumbers: [999] }] },
      demoLesson.pages,
      demoLesson.segments,
    ),
  );
  assert.throws(() =>
    validateNodes(
      { nodes: [{ ...node, segmentIds: ["fake"] }] },
      demoLesson.pages,
      demoLesson.segments,
    ),
  );
  assert.throws(() =>
    validateNodes(
      { nodes: [node, node] },
      demoLesson.pages,
      demoLesson.segments,
    ),
  );
});
test("source validation rejects source-free nodes", () =>
  assert.throws(() =>
    validateNodes(
      { nodes: [{ ...demoLesson.nodes[0], pageNumbers: [], segmentIds: [] }] },
      demoLesson.pages,
      demoLesson.segments,
    ),
  ));
test("repeated claims need multiple evidence segments", () => {
  const nodes = validateNodes(
    { nodes: [{ ...demoLesson.nodes[0], emphasis: "repeated" }] },
    demoLesson.pages,
    demoLesson.segments,
  );
  assert.equal(nodes[0].emphasis, "suggested");
});
test("export includes provenance and no binary files", () => {
  const md = toMarkdown(demoLesson);
  assert.match(md, /示例内容/);
  assert.match(md, /00:12–00:29/);
  assert.match(md, /分母/);
  assert.equal(formatTime(3605), "60:05");
});
