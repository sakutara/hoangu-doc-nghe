import { describe, expect, it } from 'vitest';
import {
  calculateStreak, DEFAULT_HABIT_SETTINGS as S, recordStudySeconds, shouldTriggerDailyReminder, toDateStr,
} from '../src/domains/tracker/DailyHabitTracker';

describe('DailyHabitTracker', () => {
  it('cộng dồn và đạt mục tiêu 30p', () => {
    let r = recordStudySeconds([], '2026-10-17', 1000, 30);
    expect(r[0].goalCompleted).toBe(false);
    r = recordStudySeconds(r, '2026-10-17', 800, 30);
    expect(r[0]).toEqual({ date: '2026-10-17', secondsStudied: 1800, goalCompleted: true });
    r = recordStudySeconds(r, '2026-10-18', 5, 30);
    expect(r).toHaveLength(2);
  });
  it('streak', () => {
    const rec = (date: string) => ({ date, secondsStudied: 10, goalCompleted: false });
    expect(calculateStreak([rec('2026-10-15'), rec('2026-10-16'), rec('2026-10-17')], '2026-10-17')).toBe(3);
    expect(calculateStreak([rec('2026-10-15'), rec('2026-10-16')], '2026-10-17')).toBe(2);
    expect(calculateStreak([rec('2026-10-10')], '2026-10-17')).toBe(0);
    expect(calculateStreak([{ date: '2026-10-17', secondsStudied: 0, goalCompleted: false }], '2026-10-17')).toBe(0);
  });
  it('nhắc học', () => {
    const rec = (s: number) => ({ date: 'd', secondsStudied: s, goalCompleted: s >= 1800 });
    expect(shouldTriggerDailyReminder(rec(0), S, '19:59')).toBe(false);
    expect(shouldTriggerDailyReminder(rec(0), S, '20:00')).toBe(true);
    expect(shouldTriggerDailyReminder(undefined, S, '21:00')).toBe(true);
    expect(shouldTriggerDailyReminder(rec(1800), S, '21:00')).toBe(false);
    expect(shouldTriggerDailyReminder(rec(0), { ...S, reminderEnabled: false }, '21:00')).toBe(false);
  });
  it('toDateStr', () => expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05'));
});
