import { describe, expect, it } from 'vitest';
import { defaultSegmenter } from '../src/domains/dictionary';
import {
  chineseNumberToInt, CustomFetcherTranslator, OfflineSmartTranslator, type ITranslationProvider,
} from '../src/domains/translator/ChineseToVietNovelTranslator';
import { NovelTranslationRunner } from '../src/domains/translator/NovelTranslationRunner';
import { handleJobMessage, resumeRunningJobs } from '../src/sw/jobHandlers';
import { testServices } from './helpers';

const tr = new OfflineSmartTranslator(defaultSegmenter);

describe('OfflineSmartTranslator', () => {
  it('số chương', () => {
    expect([chineseNumberToInt('12'), chineseNumberToInt('一'), chineseNumberToInt('十'), chineseNumberToInt('二十三'),
      chineseNumberToInt('一百零五'), chineseNumberToInt('一二'), chineseNumberToInt('九'), chineseNumberToInt('abc')])
      .toEqual([12, 1, 10, 23, 105, 12, 9, null]);
  });
  it('dịch tiêu đề truyện (Hán-Việt viết hoa)', async () => {
    expect(await tr.translateBookTitle('修炼 世界')).toBe('Tu Luyện Thế Giới');
  });
  it('dịch tiêu đề chương', async () => {
    expect(await tr.translateChapterTitle('第一章 破防了')).toBe('Chương 1: Vỡ trận cảm xúc rồi');
    expect(await tr.translateChapterTitle('第十二节')).toBe('Chương 12');
    expect(await tr.translateChapterTitle('序章')).toContain('序');
  });
  it('dịch đoạn văn, giữ dấu câu và chữ lạ', async () => {
    const [p] = await tr.translateParagraphs(['我是来打酱油的。龘！']);
    expect(p).toContain('. ');
    expect(p).toContain('龘');
    expect(p.startsWith('Tôi')).toBe(true);
    expect(await tr.translateParagraphs(['“好”（a）'])).toHaveLength(1);
  });
  it('CustomFetcherTranslator', async () => {
    const c = new CustomFetcherTranslator(async (t) => `[${t}]`, tr);
    expect(await c.translateBookTitle('a')).toBe('[a]');
    expect(await c.translateParagraphs(['x', 'y'])).toEqual(['[x]', '[y]']);
    expect(await c.translateChapterTitle('第一章 修炼')).toBe('Chương 1: Tu luyện');
  });
});

async function seed(chapters = 3) {
  const s = testServices();
  await s.library.saveBook({
    bookId: 'zh', title: '修炼', language: 'zh', originType: 'epub_upload', chapterCount: chapters,
    chapters: [], lastReadChapterIndex: 1, createdAt: 'x', author: 'A',
  });
  for (let i = 1; i <= chapters; i++) await s.files.writeChapterFile('zh', { index: i, title: `第${i}章 修炼`, paragraphs: ['我看小说。'] });
  return s;
}

describe('NovelTranslationRunner', () => {
  it('tạo bộ truyện VI và dịch từng file chương', async () => {
    const s = await seed();
    const prog: string[] = [];
    const r = new NovelTranslationRunner({ meta: s.meta, files: s.files, provider: tr, onProgress: (j) => prog.push(j.status) });
    const job = await r.createJob('zh');
    expect(job.translatedTitle).toBe('Tu Luyện');
    const done = await r.startOrResume(job.jobId);
    expect(done.status).toBe('completed');
    const vi = (await s.library.getBook('zh-vi'))!;
    expect(vi).toMatchObject({ language: 'vi', originType: 'translated_vi', sourceBookId: 'zh', chapterCount: 3 });
    expect((await s.files.readChapterFile('zh-vi', 2))!.title).toBe('Chương 2: Tu luyện');
    expect(prog).toContain('running');
  });

  it('lỗi ở chương 2 → điểm chết → dịch tiếp không dịch lại chương 1', async () => {
    const s = await seed();
    let fail = true;
    const calls: string[] = [];
    const provider: ITranslationProvider = {
      translateBookTitle: async (t) => t,
      translateChapterTitle: async (t) => { calls.push(t); if (fail && t.startsWith('第2')) throw new Error('rate limit'); return t; },
      translateParagraphs: async (p) => p,
    };
    const r = new NovelTranslationRunner({ meta: s.meta, files: s.files, provider });
    const job = await r.createJob('zh');
    const a = await r.startOrResume(job.jobId);
    expect(a.status).toBe('paused_at_deadpoint');
    expect(a.deadPoint).toMatchObject({ failedChapterIndex: 2, lastTranslatedChapterIndex: 1, errorReason: 'rate limit', retryCount: 1 });
    expect((await r.startOrResume(job.jobId)).deadPoint!.retryCount).toBe(2);
    fail = false;
    calls.length = 0;
    const b = await r.startOrResume(job.jobId);
    expect(b.status).toBe('completed');
    expect(calls.some((c) => c.startsWith('第1'))).toBe(false);
    expect((await s.library.getBook('zh-vi'))!.chapters.map((c) => c.index)).toEqual([1, 2, 3]);
  });

  it('thiếu file chương nguồn, lỗi không phải Error, dừng bởi người dùng, lỗi tạo job', async () => {
    const s = await seed(2);
    await s.library.saveBook({ ...(await s.library.getBook('zh'))!, chapterCount: 3 });
    const r = new NovelTranslationRunner({ meta: s.meta, files: s.files, provider: tr });
    const job = await r.createJob('zh');
    const a = await r.startOrResume(job.jobId);
    expect(a.deadPoint!.failedChapterIndex).toBe(3);
    expect(a.deadPoint!.errorReason).toContain('chapter-0003');

    const throwsStr: ITranslationProvider = { ...tr, translateBookTitle: async () => 't', translateChapterTitle: async () => { throw 'boom'; }, translateParagraphs: async () => [] };
    const s2 = await seed(1);
    const r2 = new NovelTranslationRunner({ meta: s2.meta, files: s2.files, provider: throwsStr });
    const j2 = await r2.createJob('zh');
    expect((await r2.startOrResume(j2.jobId)).deadPoint!.errorReason).toBe('boom');

    const s3 = await seed(2);
    const r3 = new NovelTranslationRunner({ meta: s3.meta, files: s3.files, provider: tr, shouldStop: () => true });
    const j3 = await r3.createJob('zh');
    expect((await r3.startOrResume(j3.jobId)).status).toBe('paused_by_user');

    await expect(r.createJob('nope')).rejects.toThrow('truyện gốc');
    await expect(r.startOrResume('nope')).rejects.toThrow();
    await s.library.saveBook({ ...(await s.library.getBook('zh'))!, bookId: 'v', language: 'vi' });
    await expect(r.createJob('v')).rejects.toThrow('tiếng Hoa');
  });
});

describe('jobHandlers (SW + fallback)', () => {
  it('chạy dịch, tạm dừng, resume job đang chạy, báo lỗi', async () => {
    const s = await seed(2);
    const events: any[] = [];
    const env = { meta: s.meta, backend: s.backend, broadcast: (d: unknown) => events.push(d),
    };
    const tj = await new NovelTranslationRunner({ meta: s.meta, files: s.files, provider: tr }).createJob('zh');
    await handleJobMessage({ type: 'START_TRANSLATION', jobId: tj.jobId }, env);
    expect(events.some((e) => e.kind === 'translation')).toBe(true);

    await handleJobMessage({ type: 'PAUSE_JOB', jobId: tj.jobId }, env);
    await handleJobMessage({ type: 'RESUME_TRANSLATION', jobId: tj.jobId }, env);
    expect((await s.meta.get<any>('translation_jobs', tj.jobId)).status).toBe('completed');

    await handleJobMessage({ type: 'START_TRANSLATION', jobId: 'nope' }, env);
    expect(events.filter((e) => e.kind === 'error')).toHaveLength(1);
    const bad = { ...env, broadcast: () => {} };
    await handleJobMessage({ type: 'START_TRANSLATION', jobId: 'x' }, bad);

    await s.meta.put('translation_jobs', tj.jobId, { ...(await s.meta.get<any>('translation_jobs', tj.jobId)), status: 'running', nextChapterIndex: 1 });
    await resumeRunningJobs(env);
    expect((await s.meta.get<any>('translation_jobs', tj.jobId)).status).toBe('completed');
  });
});
