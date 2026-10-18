import { toDateStr } from '../tracker/DailyHabitTracker';

export type SrsGrade = 'again' | 'hard' | 'good' | 'easy';

export interface SrsCard {
  simplified: string;
  box: number;
  dueDate: string;
  reps: number;
  lapses: number;
  addedDate: string;
  lastReviewed?: string;
}

/** Khoảng cách ôn (ngày) theo hộp Leitner. */
export const BOX_INTERVALS = [0, 1, 3, 7, 14, 30, 60];
export const MAX_BOX = BOX_INTERVALS.length - 1;
export const MASTERED_BOX = 4;
export const SESSION_LIMIT = 20;

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + n));
}

export function newCard(simplified: string, today: string): SrsCard {
  return { simplified, box: 0, dueDate: today, reps: 0, lapses: 0, addedDate: today };
}

export function reviewCard(card: SrsCard, grade: SrsGrade, today: string): SrsCard {
  let box = card.box;
  let wait: number;
  let lapses = card.lapses;
  if (grade === 'again') {
    box = 0;
    wait = 0;
    lapses += 1;
  } else if (grade === 'hard') {
    wait = Math.max(1, Math.floor(BOX_INTERVALS[box] / 2));
  } else {
    box = Math.min(MAX_BOX, box + (grade === 'easy' ? 2 : 1));
    wait = BOX_INTERVALS[box];
  }
  return { ...card, box, lapses, reps: card.reps + 1, lastReviewed: today, dueDate: addDays(today, wait) };
}

/** Giữ thẻ khớp với sổ từ: thêm thẻ cho từ mới, bỏ thẻ của từ đã xóa. */
export function syncCards(cards: SrsCard[], words: string[], today: string): SrsCard[] {
  const have = new Map(cards.map((c) => [c.simplified, c]));
  return words.map((w) => have.get(w) ?? newCard(w, today));
}

export function dueCards(cards: SrsCard[], today: string, limit = SESSION_LIMIT): SrsCard[] {
  return cards
    .filter((c) => c.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.box - b.box)
    .slice(0, limit);
}

export interface SrsStats { total: number; due: number; mastered: number; nextDue?: string }

export function srsStats(cards: SrsCard[], today: string): SrsStats {
  const future = cards.filter((c) => c.dueDate > today).map((c) => c.dueDate).sort();
  return {
    total: cards.length,
    due: cards.filter((c) => c.dueDate <= today).length,
    mastered: cards.filter((c) => c.box >= MASTERED_BOX).length,
    nextDue: future[0],
  };
}
