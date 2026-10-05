'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { currentProgress, reviewCards, scheduleReview, type Rating } from '@/lib/review';
import type { SavedLesson } from '@/lib/storage';
import type { KnowledgeNode } from '@/lib/types';
import { toast } from 'sonner';

export function ReviewPanel({ records, onSave, onSource }: { records: SavedLesson[]; onSave: (record: SavedLesson) => Promise<void>; onSource: (record: SavedLesson, node: KnowledgeNode) => void }) {
  const [course, setCourse] = useState('');
  const [focus, setFocus] = useState('due');
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const cards = reviewCards(records.map(r => r.lesson), { course, focus, query }, clock);
  const position = Math.min(index, Math.max(cards.length - 1, 0));
  const card = cards[position];
  const cardKey = card ? `${card.lesson.id}:${card.node.id}` : '';
  useEffect(() => { setRevealed(false); setAnswer(''); }, [cardKey]);
  const courses = [...new Set(records.map(r => r.lesson.course))];
  async function rate(rating: Rating) {
    if (!card || saving) return;
    setSaving(true);
    try {
      const record = records.find(r => r.lesson.id === card.lesson.id)!;
      const progress = scheduleReview(card.lesson, card.node, rating);
      await onSave({ ...record, lesson: { ...card.lesson, review: { ...card.lesson.review, [card.node.id]: progress } } });
      toast.success(`已记录，下次复习：${new Date(progress.dueAt).toLocaleString('zh-CN')}`);
      setRevealed(false); setAnswer(''); setClock(Date.now());
      // Due cards disappear after grading; in other filters advance cyclically.
      if (focus !== 'due') setIndex((position + 1) % Math.max(cards.length, 1));
    } catch (e) { toast.error(e instanceof Error ? e.message : '复习进度保存失败，请重试。'); }
    finally { setSaving(false); }
  }
  return <div className="review-panel">
    <p className="muted">先凭记忆回答，再对照笔记自评。参考答案来自现有笔记，不代表标准答案；无需 AI 密钥。</p>
    <div className="review-filters">
      <label>课程<select disabled={saving} value={course} onChange={e => { setCourse(e.target.value); setIndex(0); }}><option value="">全部课程</option>{courses.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>复习范围<select disabled={saving} value={focus} onChange={e => { setFocus(e.target.value); setIndex(0); }}><option value="due">待复习（含新知识点）</option><option value="important">重点候选</option><option value="difficult">还没掌握</option><option value="all">全部知识点</option></select></label>
      <label>查找知识点<input disabled={saving} value={query} onChange={e => { setQuery(e.target.value); setIndex(0); }} placeholder="输入关键词" /></label>
    </div>
    {!card ? <div className="review-empty"><h3>当前范围没有待复习的知识点</h3><p>可以切换到全部知识点，或导入其他课次。</p></div> : <article className="review-card">
      <p className="eyebrow">{card.lesson.course} · {card.lesson.title}{card.lesson.mode === 'demo' ? ' · 示例' : ''}</p>
      <span className="pill">{position + 1} / {cards.length}</span>
      <h3>你能解释「{card.node.title}」吗？</h3>
      <p className="muted">试着写出核心概念、使用条件，或举一个例子。</p>
      <textarea aria-label="我的回忆" placeholder="先写下你记得的内容（切换卡片后不保留）" value={answer} disabled={saving} onChange={e => setAnswer(e.target.value)} rows={4} />
      {!revealed ? <Button onClick={() => setRevealed(true)}>查看参考笔记</Button> : <div className="review-answer">
        <p>{card.node.summary}</p>
        <small>来源：课件 {card.node.pageNumbers.join('、') || '无'} 页 · {card.node.segmentIds.length} 段讲解{card.node.confidence === 'low' ? ' · 对应待确认' : ''}</small>
        <Button variant="link" disabled={saving} onClick={() => onSource(records.find(r => r.lesson.id === card.lesson.id)!, card.node)}>回到课件与课堂切片</Button>
        <div className="review-grades"><Button disabled={saving} variant="outline" onClick={() => void rate('again')}>没想起来 · 10 分钟</Button><Button disabled={saving} variant="outline" onClick={() => void rate('hard')}>还不熟 · 1 天</Button><Button disabled={saving} onClick={() => void rate('known')}>已掌握</Button></div>
        <small>已掌握按连续次数安排在 1 / 3 / 7 / 14 天后复习；这是自评记录。</small>
      </div>}
      {currentProgress(card.lesson, card.node) && <p className="muted">下次复习：{new Date(card.progress!.dueAt).toLocaleString('zh-CN')}</p>}
      <div className="review-navigation"><Button variant="ghost" disabled={saving || position === 0} onClick={() => setIndex(position - 1)}>上一题</Button><Button variant="ghost" disabled={saving || position >= cards.length - 1} onClick={() => setIndex(position + 1)}>下一题</Button></div>
    </article>}
  </div>;
}
