import type { Lesson, ProgressMap } from './types';
import { PASS_PERCENT } from './QuizEngine';

export const sortLessons = (lessons: Lesson[]) =>
  [...lessons].sort((a, b) => a.level - b.level || a.order - b.order);

export function isLessonUnlocked(lessons: Lesson[], progress: ProgressMap, id: string): boolean {
  const sorted = sortLessons(lessons);
  const idx = sorted.findIndex((l) => l.id === id);
  if (idx < 0) return false;
  return idx === 0 || !!progress[sorted[idx - 1].id]?.completed;
}

export function recordAttempt(progress: ProgressMap, id: string, percent: number): ProgressMap {
  const prev = progress[id];
  return {
    ...progress,
    [id]: {
      bestScore: Math.max(prev?.bestScore ?? 0, percent),
      completed: (prev?.completed ?? false) || percent >= PASS_PERCENT,
      attempts: (prev?.attempts ?? 0) + 1,
    },
  };
}

export function completionPercent(lessons: Lesson[], progress: ProgressMap): number {
  if (lessons.length === 0) return 0;
  return Math.round((lessons.filter((l) => progress[l.id]?.completed).length / lessons.length) * 100);
}

export function nextLesson(lessons: Lesson[], id: string): Lesson | undefined {
  const sorted = sortLessons(lessons);
  return sorted[sorted.findIndex((l) => l.id === id) + 1];
}
