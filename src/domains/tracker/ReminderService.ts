import { shouldTriggerDailyReminder, type DailyStudyRecord, type HabitSettings } from './DailyHabitTracker';

export interface ReminderState { date: string; snoozedUntil?: string; dismissed?: boolean }

export function isReminderVisible(
  record: DailyStudyRecord | undefined, settings: HabitSettings, hhmm: string,
  state: ReminderState | undefined, today: string,
): boolean {
  if (!shouldTriggerDailyReminder(record, settings, hhmm)) return false;
  if (state?.date !== today) return true;
  if (state.dismissed) return false;
  return !state.snoozedUntil || hhmm >= state.snoozedUntil;
}

export function snoozeUntil(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Adapter mỏng bọc Notification API; trả false nếu không có hoặc chưa được cấp quyền. */
export function showSystemNotification(studiedMinutes: number, goalMinutes: number): boolean {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  new Notification('Đến giờ học tiếng Hoa!', { body: `Hôm nay bạn mới học ${studiedMinutes}/${goalMinutes} phút.` });
  return true;
}
