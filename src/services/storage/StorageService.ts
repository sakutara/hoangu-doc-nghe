import type { DictionaryEntry } from '../../domains/dictionary/types';
import {
  DEFAULT_HABIT_SETTINGS, type DailyStudyRecord, type HabitSettings,
} from '../../domains/tracker/DailyHabitTracker';
import { syncCards, type SrsCard } from '../../domains/srs/SrsScheduler';
import type { ReminderState } from '../../domains/tracker/ReminderService';
import type { ProgressMap } from '../../domains/curriculum/types';
import type { IMetaStore } from './types';

interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

function readJson<T>(kv: KV, key: string, fallback: T): T {
  try {
    const raw = kv.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Cài đặt + sổ từ + lịch sử học: localStorage (đồng bộ, đủ nhẹ). Truyện/job: IMetaStore. */
export class StorageService {
  constructor(private readonly kv: KV, readonly meta: IMetaStore) {}

  getSavedWords(): DictionaryEntry[] { return readJson(this.kv, 'saved_words', []); }
  toggleSaveWord(entry: DictionaryEntry): boolean {
    const words = this.getSavedWords();
    const exists = words.some((w) => w.simplified === entry.simplified);
    const next = exists ? words.filter((w) => w.simplified !== entry.simplified) : [...words, entry];
    this.kv.setItem('saved_words', JSON.stringify(next));
    return !exists;
  }

  getStudyRecords(): DailyStudyRecord[] { return readJson(this.kv, 'study_records', []); }
  saveStudyRecords(r: DailyStudyRecord[]) { this.kv.setItem('study_records', JSON.stringify(r)); }

  getLessonProgress(): ProgressMap { return readJson(this.kv, 'lesson_progress', {}); }
  saveLessonProgress(p: ProgressMap) { this.kv.setItem('lesson_progress', JSON.stringify(p)); }

  /** Các mục (id câu) đã ra ở các lần kiểm tra trước, theo bài — để lần sau ưu tiên mục mới. */
  getQuizSeen(lessonId: string): string[] { return readJson<Record<string, string[]>>(this.kv, 'quiz_seen', {})[lessonId] ?? []; }
  saveQuizSeen(lessonId: string, ids: string[]) {
    this.kv.setItem('quiz_seen', JSON.stringify({ ...readJson<Record<string, string[]>>(this.kv, 'quiz_seen', {}), [lessonId]: ids }));
  }

  getHabitSettings(): HabitSettings {
    return { ...DEFAULT_HABIT_SETTINGS, ...readJson<Partial<HabitSettings>>(this.kv, 'habit_settings', {}) };
  }
  saveHabitSettings(s: HabitSettings) { this.kv.setItem('habit_settings', JSON.stringify(s)); }

  getSrsCards(): SrsCard[] { return readJson(this.kv, 'srs_cards', []); }
  saveSrsCards(c: SrsCard[]) { this.kv.setItem('srs_cards', JSON.stringify(c)); }
  /** Đồng bộ thẻ SRS với sổ từ vựng rồi trả về danh sách thẻ. */
  syncSrs(today: string): SrsCard[] {
    const cards = this.getSrsCards();
    const next = syncCards(cards, this.getSavedWords().map((w) => w.simplified), today);
    if (JSON.stringify(next) !== JSON.stringify(cards)) this.saveSrsCards(next);
    return next;
  }

  getReminderState(): ReminderState | undefined { return readJson<ReminderState | undefined>(this.kv, 'reminder_state', undefined); }
  saveReminderState(s: ReminderState) { this.kv.setItem('reminder_state', JSON.stringify(s)); }
}
