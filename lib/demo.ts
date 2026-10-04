import type { Lesson } from "./types";
export const demoLesson: Lesson = {
  id: "demo",
  title: "条件概率与贝叶斯公式",
  course: "概率论与数理统计",
  mode: "demo",
  updatedAt: "2026-10-04",
  pages: [
    {
      number: 1,
      title: "条件概率",
      text: "已知事件 B 发生时，事件 A 发生的概率。\n条件改变了样本空间：从 Ω 缩小到 B。\n前提：P(B) > 0。",
      formula: "P(A | B) = P(A ∩ B) / P(B)",
    },
    {
      number: 2,
      title: "乘法公式",
      text: "联合概率可以分解为条件概率与边缘概率的乘积。\n先判断已知条件，再选择计算方向。",
      formula: "P(A ∩ B) = P(B) · P(A | B)",
    },
    {
      number: 3,
      title: "全概率公式",
      text: "将样本空间划分为互不相交且覆盖全部情况的事件。\n分别计算各条路径，再将结果相加。",
      formula: "P(A) = Σ P(Bᵢ) · P(A | Bᵢ)",
    },
    {
      number: 4,
      title: "贝叶斯公式",
      text: "从观察到的结果，反推不同原因的可能性。\n先验概率结合证据，得到后验概率。\n注意：P(A | B) 与 P(B | A) 通常不同。",
      formula: "P(Bᵢ | A) = P(Bᵢ) P(A | Bᵢ) / P(A)",
    },
  ],
  segments: [
    {
      id: "s1",
      start: 12,
      end: 29,
      text: "这个很重要，条件概率的分母是条件事件的概率。一定要先看清楚已经发生的是什么。",
    },
    {
      id: "s2",
      start: 30,
      end: 48,
      text: "把条件概率的定义变形，就得到了乘法公式。联合概率可以按两种不同顺序计算。",
    },
    {
      id: "s3",
      start: 49,
      end: 68,
      text: "全概率公式的关键是划分。这里再强调一次，各个事件必须互不相交，而且覆盖整个样本空间。",
    },
    {
      id: "s4",
      start: 69,
      end: 91,
      text: "考点是区分先验与后验。贝叶斯公式用观察到的证据更新概率，不要把两个方向的条件概率混淆。",
    },
  ],
  nodes: [
    {
      id: "n1",
      title: "条件概率",
      chapter: "基础概念",
      summary:
        "把“已知 B 发生”作为新的观察范围，再计算 A 在这个范围内所占的比例。分母必须是 P(B)，且 P(B) > 0。",
      pageNumbers: [1],
      segmentIds: ["s1"],
      emphasis: "explicit",
      confidence: "high",
    },
    {
      id: "n2",
      title: "乘法公式",
      chapter: "计算方法",
      summary:
        "将两个事件同时发生的概率，拆成一个事件发生的概率与另一个事件的条件概率之积。",
      pageNumbers: [2],
      segmentIds: ["s2"],
      emphasis: "none",
      confidence: "high",
    },
    {
      id: "n3",
      title: "全概率公式",
      chapter: "计算方法",
      summary:
        "当一个结果可能由多个不同原因产生时，沿各条路径计算概率，再相加。前提是原因构成完备事件组。",
      pageNumbers: [3],
      segmentIds: ["s3"],
      emphasis: "explicit",
      confidence: "high",
    },
    {
      id: "n4",
      title: "贝叶斯公式",
      chapter: "推断与应用",
      summary:
        "结合先验概率和新证据计算后验概率。先算各条路径的联合概率，再除以观察结果的总概率。",
      pageNumbers: [4],
      segmentIds: ["s4"],
      emphasis: "explicit",
      confidence: "high",
    },
  ],
};
