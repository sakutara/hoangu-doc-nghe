export interface DailyStudyRecord {
  date: string;
  secondsStudied: number;
  goalCompleted: boolean;
}

export interface HabitSettings {
  dailyGoalMinutes: number;
  reminderEnabled: boolean;
  reminderTime: string;
  scriptMode: 'simplified' | 'traditional';
}

export const DEFAULT_HABIT_SETTINGS: HabitSettings = {
  dailyGoalMinutes: 30,
  reminderEnabled: true,
  reminderTime: '20:00',
  scriptMode: 'simplified',
};

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function recordStudySeconds(
  records: DailyStudyRecord[], dateStr: string, addedSeconds: number, goalMinutes: number,
): DailyStudyRecord[] {
  const existing = records.find((r) => r.date === dateStr);
  const seconds = (existing?.secondsStudied ?? 0) + addedSeconds;
  const updated: DailyStudyRecord = { date: dateStr, secondsStudied: seconds, goalCompleted: seconds >= goalMinutes * 60 };
  return existing ? records.map((r) => (r.date === dateStr ? updated : r)) : [...records, updated];
}

function prevDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d - 1));
}

/** Chuỗi ngày liên tiếp có học (>0 giây). Hôm nay chưa học vẫn không làm đứt chuỗi của hôm qua. */
export function calculateStreak(records: DailyStudyRecord[], todayDateStr: string): number {
  const studied = new Set(records.filter((r) => r.secondsStudied > 0).map((r) => r.date));
  let cursor = studied.has(todayDateStr) ? todayDateStr : prevDay(todayDateStr);
  let streak = 0;
  while (studied.has(cursor)) {
    streak += 1;
    cursor = prevDay(cursor);
  }
  return streak;
}

export function shouldTriggerDailyReminder(
  recordToday: DailyStudyRecord | undefined, settings: HabitSettings, currentTimeHHMM: string,
): boolean {
  if (!settings.reminderEnabled) return false;
  if (currentTimeHHMM < settings.reminderTime) return false;
  return (recordToday?.secondsStudied ?? 0) < settings.dailyGoalMinutes * 60;
}
