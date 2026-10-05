import test from 'node:test';
import assert from 'node:assert/strict';
import { demoLesson } from '../lib/demo.ts';
import { currentProgress, reviewCards, scheduleReview } from '../lib/review.ts';
const now = Date.parse('2026-10-05T00:00:00Z');
const node = demoLesson.nodes[0];
test('review intervals and forgetting reset the successful streak', () => {
  let lesson = structuredClone(demoLesson);
  for (const days of [1, 3, 7, 14, 14]) {
    const progress = scheduleReview(lesson, node, 'known', now);
    assert.equal(Date.parse(progress.dueAt) - now, days * 86_400_000);
    lesson.review = { [node.id]: progress };
  }
  const again = scheduleReview(lesson, node, 'again', now);
  assert.equal(again.streak, 0);
  assert.equal(Date.parse(again.dueAt) - now, 600_000);
  assert.equal(Date.parse(scheduleReview(lesson, node, 'hard', now).dueAt) - now, 86_400_000);
});
test('same node IDs in different lessons do not share mastery', () => {
  const first = { ...demoLesson, review: { [node.id]: scheduleReview(demoLesson, node, 'known', now) } };
  const second = { ...demoLesson, id: 'another-lesson', review: undefined };
  const cards = reviewCards([first, second], { course: '', focus: 'due', query: '' }, now);
  assert.equal(cards.some(c => c.lesson.id === first.id && c.node.id === node.id), false);
  assert.equal(cards.some(c => c.lesson.id === second.id && c.node.id === node.id), true);
});
test('changes to summary or source evidence invalidate old mastery', () => {
  const lesson = structuredClone(demoLesson);
  lesson.review = { [node.id]: scheduleReview(lesson, node, 'known', now) };
  assert.ok(currentProgress(lesson, node));
  assert.equal(currentProgress(lesson, { ...node, summary: 'new explanation' }), undefined);
  lesson.pages.find(p => p.number === node.pageNumbers[0])!.text += ' corrected source';
  assert.equal(currentProgress(lesson, node), undefined);
});
test('due boundary, course, search, and difficult filters', () => {
  const lesson = { ...demoLesson, nodes: [node], review: { [node.id]: scheduleReview(demoLesson, node, 'hard', now) } };
  const options = { course: lesson.course, focus: 'due', query: node.title };
  assert.equal(reviewCards([lesson], options, now).length, 0);
  assert.equal(reviewCards([lesson], options, now + 86_400_000).length, 1);
  assert.equal(reviewCards([lesson], { ...options, course: 'missing' }, now + 86_400_000).length, 0);
  assert.equal(reviewCards([lesson], { ...options, focus: 'difficult' }, now).length, 1);
});
