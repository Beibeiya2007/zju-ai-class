export type Page = {
  number: number;
  title: string;
  text: string;
  formula?: string;
};
export type Segment = { id: string; start: number; end: number; text: string };
export type KnowledgeNode = {
  id: string;
  title: string;
  chapter: string;
  summary: string;
  pageNumbers: number[];
  segmentIds: string[];
  emphasis: "explicit" | "repeated" | "suggested" | "none";
  confidence: "high" | "medium" | "low";
};
export type Lesson = {
  id: string;
  title: string;
  course: string;
  pages: Page[];
  segments: Segment[];
  nodes: KnowledgeNode[];
  mode: "demo" | "local" | "ai";
  documentName?: string;
  documentType?: "pdf" | "pptx";
  audioName?: string;
  updatedAt: string;
  review?: Record<string, ReviewProgress>;
};

export type ReviewProgress = {
  source: string;
  rating: 'again' | 'hard' | 'known';
  streak: number;
  reviewedAt: string;
  dueAt: string;
};
