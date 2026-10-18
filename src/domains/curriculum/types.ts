export interface VocabItem {
  simplified: string;
  traditional?: string;
  pinyin: string;
  hanViet: string;
  meaning: string;
}
export interface LessonLine { zh: string; pinyin: string; vi: string }
export interface Lesson {
  id: string;
  level: 1 | 2 | 3 | 4;
  order: number;
  title: string;
  vocab: VocabItem[];
  lines: LessonLine[];
}
export type QuizKind = 'listen_meaning' | 'hanzi_to_viet' | 'viet_to_hanzi' | 'read_translation';
export interface QuizQuestion {
  id: string;
  kind: QuizKind;
  prompt: string;
  audioText?: string;
  options: string[];
  answerIndex: number;
}
export interface LessonProgress { bestScore: number; completed: boolean; attempts: number }
export type ProgressMap = Record<string, LessonProgress>;
