import type { Lesson, LessonLine, VocabItem } from '../../domains/curriculum/types';

/** [giản thể, pinyin, Hán-Việt, nghĩa Việt, phồn thể?] */
export type VocabRow = [string, string, string, string, string?];
/** [chữ Hán, pinyin, bản dịch Việt] */
export type LineRow = [string, string, string];

export const vocab = (rows: VocabRow[]): VocabItem[] =>
  rows.map(([simplified, pinyin, hanViet, meaning, traditional]) => ({
    simplified, pinyin, hanViet, meaning, ...(traditional ? { traditional } : {}),
  }));

export const lines = (rows: LineRow[]): LessonLine[] => rows.map(([zh, pinyin, vi]) => ({ zh, pinyin, vi }));

export function lesson(id: string, level: 1 | 2 | 3 | 4, order: number, title: string, v: VocabRow[], l: LineRow[]): Lesson {
  return { id, level, order, title, vocab: vocab(v), lines: lines(l) };
}
