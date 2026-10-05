import type { KnowledgeNode, Lesson, ReviewProgress } from './types.ts';
export type Rating = 'again' | 'hard' | 'known';
export function reviewSource(lesson: Lesson, node: KnowledgeNode): string {
  // Include evidence: regenerated nodes must not inherit stale mastery by ID alone.
  return JSON.stringify([node.title, node.summary, node.pageNumbers.map(n => lesson.pages.find(p => p.number === n)?.text), node.segmentIds.map(id => lesson.segments.find(s => s.id === id))]);
}
export function currentProgress(lesson: Lesson, node: KnowledgeNode): ReviewProgress | undefined {
  const progress = lesson.review?.[node.id];
  return progress?.source === reviewSource(lesson, node) ? progress : undefined;
}
export function scheduleReview(lesson: Lesson, node: KnowledgeNode, rating: Rating, now = Date.now()): ReviewProgress {
  const previous = currentProgress(lesson, node);
  const streak = rating === 'known' ? Math.min((previous?.streak || 0) + 1, 4) : 0;
  const delay = rating === 'again' ? 10 * 60_000 : rating === 'hard' ? 86_400_000 : [1, 3, 7, 14][streak - 1] * 86_400_000;
  return { source: reviewSource(lesson, node), rating, streak, reviewedAt: new Date(now).toISOString(), dueAt: new Date(now + delay).toISOString() };
}
export function reviewCards(lessons: Lesson[], options: { course: string; focus: string; query: string }, now = Date.now()) {
  return lessons.flatMap(lesson => lesson.nodes.map(node => ({ lesson, node, progress: currentProgress(lesson, node) })))
    .filter(({ lesson, node, progress }) => (!options.course || lesson.course === options.course)
      && (!options.query || `${lesson.title} ${node.title} ${node.summary}`.toLocaleLowerCase().includes(options.query.toLocaleLowerCase()))
      && (options.focus !== 'due' || !progress || Date.parse(progress.dueAt) <= now)
      && (options.focus !== 'important' || node.emphasis !== 'none')
      && (options.focus !== 'difficult' || progress?.rating === 'again' || progress?.rating === 'hard'))
    .sort((a, b) => (a.progress ? Date.parse(a.progress.dueAt) : 0) - (b.progress ? Date.parse(b.progress.dueAt) : 0));
}
