import { describe, expect, it, vi } from 'vitest';
import {
  addDays, dueCards, newCard, reviewCard, srsStats, syncCards, MAX_BOX,
} from '../src/domains/srs/SrsScheduler';
import { lastNDays, longestStreak, summarizeStudy } from '../src/domains/tracker/ProgressAnalytics';
import { DEFAULT_HABIT_SETTINGS as S } from '../src/domains/tracker/DailyHabitTracker';
import { isReminderVisible, showSystemNotification, snoozeUntil } from '../src/domains/tracker/ReminderService';

const T = '2026-10-17';
const rec = (date: string, secondsStudied: number) => ({ date, secondsStudied, goalCompleted: secondsStudied >= 1800 });

describe('SrsScheduler', () => {
  it('addDays qua ranh giới tháng', () => expect(addDays('2026-10-31', 1)).toBe('2026-11-01'));

  it('chấm good/easy/hard/again', () => {
    const c0 = newCard('我', T);
    expect(c0).toMatchObject({ box: 0, dueDate: T, reps: 0 });
    const good = reviewCard(c0, 'good', T);
    expect(good).toMatchObject({ box: 1, dueDate: '2026-10-18', reps: 1, lastReviewed: T });
    const easy = reviewCard(good, 'easy', T);
    expect(easy).toMatchObject({ box: 3, dueDate: '2026-10-24' });
    const hard = reviewCard(easy, 'hard', T);
    expect(hard).toMatchObject({ box: 3, dueDate: '2026-10-20' });
    expect(reviewCard(c0, 'hard', T).dueDate).toBe('2026-10-18'); // tối thiểu 1 ngày
    const again = reviewCard(easy, 'again', T);
    expect(again).toMatchObject({ box: 0, lapses: 1, dueDate: T });
    let c = c0;
    for (let i = 0; i < 10; i++) c = reviewCard(c, 'easy', T);
    expect(c.box).toBe(MAX_BOX);
  });

  it('syncCards thêm/bỏ thẻ, giữ thẻ cũ', () => {
    const old = reviewCard(newCard('我', T), 'good', T);
    const next = syncCards([old, newCard('旧', T)], ['我', '新'], T);
    expect(next.map((c) => c.simplified)).toEqual(['我', '新']);
    expect(next[0]).toBe(old);
  });

  it('dueCards sắp xếp & giới hạn; srsStats', () => {
    const a = { ...newCard('a', T), dueDate: '2026-10-15', box: 2 };
    const b = { ...newCard('b', T), dueDate: '2026-10-15', box: 1 };
    const c = { ...newCard('c', T), dueDate: '2026-10-20', box: 4 };
    const d = { ...newCard('d', T), dueDate: '2026-10-19', box: 5 };
    expect(dueCards([a, b, c, d], T).map((x) => x.simplified)).toEqual(['b', 'a']);
    expect(dueCards([a, b], T, 1)).toHaveLength(1);
    expect(srsStats([a, b, c, d], T)).toEqual({ total: 4, due: 2, mastered: 2, nextDue: '2026-10-19' });
    expect(srsStats([], T).nextDue).toBeUndefined();
  });
});

describe('ProgressAnalytics', () => {
  it('lastNDays điền ngày thiếu và đánh dấu đạt mục tiêu', () => {
    const days = lastNDays([rec('2026-10-17', 1800), rec('2026-10-15', 60)], T, 3, 30);
    expect(days).toEqual([
      { date: '2026-10-15', seconds: 60, goalCompleted: false },
      { date: '2026-10-16', seconds: 0, goalCompleted: false },
      { date: '2026-10-17', seconds: 1800, goalCompleted: true },
    ]);
  });
  it('longestStreak', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak([rec('2026-10-01', 5), rec('2026-10-02', 5), rec('2026-10-03', 5), rec('2026-10-09', 5), rec('2026-10-10', 5), rec('2026-10-11', 0)])).toBe(3);
  });
  it('summarizeStudy', () => {
    expect(summarizeStudy([rec('2026-10-16', 1800), rec('2026-10-17', 600), rec('2026-10-18', 0)], 30))
      .toEqual({ totalSeconds: 2400, activeDays: 2, goalDays: 1, longestStreak: 2 });
  });
});

describe('ReminderService', () => {
  it('snooze/dismiss theo ngày', () => {
    const r = rec(T, 0);
    expect(isReminderVisible(r, S, '20:30', undefined, T)).toBe(true);
    expect(isReminderVisible(r, S, '19:00', undefined, T)).toBe(false);
    expect(isReminderVisible(r, S, '20:30', { date: T, snoozedUntil: '20:40' }, T)).toBe(false);
    expect(isReminderVisible(r, S, '20:40', { date: T, snoozedUntil: '20:40' }, T)).toBe(true);
    expect(isReminderVisible(r, S, '20:30', { date: T, dismissed: true }, T)).toBe(false);
    expect(isReminderVisible(r, S, '20:30', { date: T }, T)).toBe(true);
    expect(isReminderVisible(r, S, '20:30', { date: '2026-10-16', dismissed: true }, T)).toBe(true);
  });
  it('snoozeUntil', () => {
    expect(snoozeUntil('20:55', 10)).toBe('21:05');
    expect(snoozeUntil('23:55', 10)).toBe('23:59');
  });
  it('showSystemNotification theo quyền', () => {
    expect(showSystemNotification(1, 30)).toBe(false);
    const n = vi.fn();
    vi.stubGlobal('Notification', Object.assign(n, { permission: 'denied' }));
    expect(showSystemNotification(1, 30)).toBe(false);
    vi.stubGlobal('Notification', Object.assign(n, { permission: 'granted' }));
    expect(showSystemNotification(1, 30)).toBe(true);
    expect(n).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
