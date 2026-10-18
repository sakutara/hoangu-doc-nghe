import { toDateStr, type DailyStudyRecord } from './DailyHabitTracker';

export interface DayStat { date: string; seconds: number; goalCompleted: boolean }

export function lastNDays(records: DailyStudyRecord[], today: string, n: number, goalMinutes: number): DayStat[] {
  const [y, m, d] = today.split('-').map(Number);
  const bySec = new Map(records.map((r) => [r.date, r.secondsStudied]));
  const out: DayStat[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = toDateStr(new Date(y, m - 1, d - i));
    const seconds = bySec.get(date) ?? 0;
    out.push({ date, seconds, goalCompleted: seconds >= goalMinutes * 60 });
  }
  return out;
}

export function longestStreak(records: DailyStudyRecord[]): number {
  const days = [...new Set(records.filter((r) => r.secondsStudied > 0).map((r) => r.date))].sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const day of days) {
    const [y, m, d] = day.split('-').map(Number);
    const expected = prev ? toDateStr(new Date(y, m - 1, d - 1)) : '';
    run = prev && prev === expected ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

export interface StudySummary { totalSeconds: number; activeDays: number; goalDays: number; longestStreak: number }

export function summarizeStudy(records: DailyStudyRecord[], goalMinutes: number): StudySummary {
  return {
    totalSeconds: records.reduce((s, r) => s + r.secondsStudied, 0),
    activeDays: records.filter((r) => r.secondsStudied > 0).length,
    goalDays: records.filter((r) => r.secondsStudied >= goalMinutes * 60).length,
    longestStreak: longestStreak(records),
  };
}
