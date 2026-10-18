import { describe, expect, it, vi } from 'vitest';
import { defaultSegmenter } from '../src/domains/dictionary';
import { StorageService } from '../src/services/storage/StorageService';
import { InMemoryMetaStore, InMemoryFileBackend } from '../src/services/storage/MemoryBackends';
import { BookFileSystemStore } from '../src/services/storage/BookFileSystemStore';
import { speakChinese } from '../src/services/SpeechService';
import { memStorage } from './helpers';

describe('StorageService', () => {
  it('sổ từ, cài đặt, lịch sử', () => {
    const kv = memStorage();
    const s = new StorageService(kv, new InMemoryMetaStore());
    const e = defaultSegmenter.lookup('注册')!;
    expect(s.toggleSaveWord(e)).toBe(true);
    expect(s.getSavedWords()).toHaveLength(1);
    expect(s.toggleSaveWord(e)).toBe(false);
    expect(s.getHabitSettings().dailyGoalMinutes).toBe(30);
    s.saveHabitSettings({ ...s.getHabitSettings(), reminderTime: '21:00' });
    expect(s.getHabitSettings().reminderTime).toBe('21:00');
    s.saveStudyRecords([{ date: 'd', secondsStudied: 1, goalCompleted: false }]);
    expect(s.getStudyRecords()).toHaveLength(1);
    kv.setItem('saved_words', '{bad json');
    expect(s.getSavedWords()).toEqual([]);
  });
  it('meta store CRUD', async () => {
    const m = new InMemoryMetaStore();
    await m.put('crawl_jobs', 'a', { x: 1 });
    expect(await m.get('crawl_jobs', 'a')).toEqual({ x: 1 });
    expect(await m.list('crawl_jobs')).toHaveLength(1);
    await m.delete('crawl_jobs', 'a');
    expect(await m.get('crawl_jobs', 'a')).toBeUndefined();
  });
});

describe('BookFileSystemStore', () => {
  it('ghi/đọc/liệt kê/xóa thư mục', async () => {
    const fs = new BookFileSystemStore(new InMemoryFileBackend());
    expect(await fs.writeChapterFile('b', { index: 1, title: 'T', paragraphs: ['a', 'b'] })).toBe('/books/b/chapter-0001.txt');
    await fs.writeChapterFile('b', { index: 2, title: 'T2', paragraphs: ['c'] });
    expect(await fs.readChapterFile('b', 1)).toEqual({ index: 1, title: 'T', paragraphs: ['a', 'b'] });
    expect(await fs.readChapterFile('b', 9)).toBeNull();
    expect(await fs.listChapterFiles('b')).toEqual(['chapter-0001.txt', 'chapter-0002.txt']);
    expect(await fs.deleteBookDirectory('b')).toBe(true);
    expect(await fs.listChapterFiles('b')).toEqual([]);
    expect(await fs.readChapterFile('b', 1)).toBeNull();
  });
});

describe('SpeechService', () => {
  it('phát âm khi có TTS, false khi không', () => {
    expect(speakChinese('你')).toBe(false);
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    Object.defineProperty(window, 'speechSynthesis', { value: { speak, cancel: vi.fn() }, configurable: true });
    expect(speakChinese('你')).toBe(true);
    expect(speak).toHaveBeenCalled();
    vi.unstubAllGlobals();
    delete (window as any).speechSynthesis;
  });
});
