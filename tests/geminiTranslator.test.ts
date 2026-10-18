import { describe, expect, it } from 'vitest';
import { OfflineSmartTranslator } from '../src/domains/translator/ChineseToVietNovelTranslator';
import { chunkParagraphs, GeminiNovelTranslator } from '../src/domains/translator/GeminiNovelTranslator';
import {
  createTranslationProvider, loadTranslationSettings, saveTranslationSettings,
} from '../src/domains/translator/createTranslationProvider';
import { NovelTranslationRunner } from '../src/domains/translator/NovelTranslationRunner';
import { handleJobMessage } from '../src/sw/jobHandlers';
import { testServices } from './helpers';

type Reply = { status?: number; body: unknown } | Error;
const ok = (obj: unknown): Reply => ({ body: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] } });

/** fetch giả: trả lần lượt các reply, hoặc gọi hàm sinh reply từ prompt. */
function fakeFetch(replies: Reply[] | ((prompt: string) => Reply)) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: any; prompt: string }> = [];
  const impl = async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const prompt: string = body.contents[0].parts[0].text;
    calls.push({ url, headers: init.headers as Record<string, string>, body, prompt });
    const r = typeof replies === 'function' ? replies(prompt) : replies.shift()!;
    if (r instanceof Error) throw r;
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status ?? 200 });
  };
  return { impl, calls };
}

const make = (replies: Parameters<typeof fakeFetch>[0], extra = {}) => {
  const f = fakeFetch(replies);
  const sleeps: number[] = [];
  const t = new GeminiNovelTranslator({ apiKey: 'k', fetchImpl: f.impl, sleep: async (ms) => void sleeps.push(ms), ...extra });
  return { t, calls: f.calls, sleeps };
};

describe('chunkParagraphs', () => {
  it('gom đoạn theo giới hạn ký tự, đoạn quá dài đứng riêng', () => {
    expect(chunkParagraphs(['aa', 'bb', 'cccccc', 'd'], 4)).toEqual([['aa', 'bb'], ['cccccc'], ['d']]);
    expect(chunkParagraphs([], 4)).toEqual([]);
  });
});

describe('GeminiNovelTranslator', () => {
  it('dịch cả chương theo khối: tiêu đề, ngữ cảnh khối trước, glossary', async () => {
    const { t, calls } = make([
      ok({ title: 'thiếu niên bị phế', paragraphs: [' Lâm Động thở dài. ', 'Hắn quay người.'], glossary: [{ zh: '林动', vi: 'Lâm Động' }, { zh: '', vi: 'x' }] }),
      ok({ title: '', paragraphs: ['Lâm Động bước ra khỏi Thanh Dương trấn.'], glossary: [{ zh: '青阳镇', vi: 'Thanh Dương trấn' }, { zh: '林动', vi: 'Lâm Đông' }] }),
    ], { chunkChars: 12 });
    const r = await t.translateChapter(
      { title: '第十二章 废物少年', paragraphs: ['林动叹了口气。', '他转身。', '林动走出青阳镇。'] },
      { 武祖: 'Võ Tổ' },
    );
    expect(r.title).toBe('Chương 12: Thiếu niên bị phế');
    expect(r.paragraphs).toEqual(['Lâm Động thở dài.', 'Hắn quay người.', 'Lâm Động bước ra khỏi Thanh Dương trấn.']);
    // tên đã có giữ nguyên, không bị bản sau ghi đè
    expect(r.glossary).toEqual({ 武祖: 'Võ Tổ', 林动: 'Lâm Động', 青阳镇: 'Thanh Dương trấn' });

    expect(calls[0].url).toContain('/models/gemini-2.5-flash:generateContent');
    expect(calls[0].headers['x-goog-api-key']).toBe('k');
    expect(calls[0].body.systemInstruction.parts[0].text).toContain('TUYỆT ĐỐI không dịch word-by-word');
    expect(calls[0].body.generationConfig.responseMimeType).toBe('application/json');
    expect(calls[0].prompt).toContain('废物少年');
    expect(calls[0].prompt).not.toContain('第十二章');
    expect(calls[0].prompt).not.toContain('Võ Tổ'); // thuật ngữ không xuất hiện trong khối thì không gửi
    expect(calls[1].prompt).toContain('林动 → Lâm Động');
    expect(calls[1].prompt).toContain('Hắn quay người.'); // ngữ cảnh khối trước
    expect(calls[1].prompt).toContain('chuỗi rỗng');
  });

  it('tiêu đề không theo mẫu 第N章, tiêu đề rỗng, chương không có đoạn', async () => {
    const { t } = make([
      ok({ title: 'lời mở đầu', paragraphs: [], glossary: [] }),
      ok({ title: '', paragraphs: [], glossary: [] }),
    ]);
    expect(await t.translateChapterTitle('序章')).toBe('Lời mở đầu');
    expect((await t.translateChapter({ title: '第3章', paragraphs: [] }, {})).title).toBe('Chương 3');
  });

  it('translateParagraphs, translateBookTitle, model tùy chọn', async () => {
    const { t, calls } = make([
      ok({ title: '', paragraphs: ['Hắn khẽ mỉm cười.'], glossary: [] }),
      ok({ title: ' Phàm Nhân Tu Tiên Truyện ' }),
      ok({ title: '' }),
    ], { model: 'gemini-2.5-pro' });
    expect(await t.translateParagraphs(['他微微一笑。'])).toEqual(['Hắn khẽ mỉm cười.']);
    expect(await t.translateBookTitle('凡人修仙传')).toBe('Phàm Nhân Tu Tiên Truyện');
    expect(await t.translateBookTitle('无名')).toBe('无名');
    expect(calls[0].url).toContain('gemini-2.5-pro');
  });

  it('sai số đoạn → hỏi lại kèm lưu ý; sai lần nữa → lỗi', async () => {
    const { t, calls } = make([
      ok({ title: '', paragraphs: ['gộp'], glossary: [] }),
      ok({ title: '', paragraphs: ['a', 'b'], glossary: [] }),
    ]);
    expect(await t.translateParagraphs(['一', '二'])).toEqual(['a', 'b']);
    expect(calls[1].prompt).toContain('trả về 1 đoạn');
    const bad = make([ok({ title: '' }), ok({ title: '', paragraphs: ['x'], glossary: [] })]);
    await expect(bad.t.translateParagraphs(['一', '二'])).rejects.toThrow('sai số đoạn');
  });

  it('429 theo phút: chờ retryDelay rồi gọi lại; hết lượt thử → lỗi hạn mức', async () => {
    const rl = { status: 429, body: { error: { details: [{ retryDelay: '7.2s' }] } } };
    const { t, sleeps } = make([rl, { status: 429, body: 'x' }, ok({ title: '', paragraphs: ['ok'], glossary: [] })]);
    expect(await t.translateParagraphs(['好'])).toEqual(['ok']);
    expect(sleeps).toEqual([7200, 15000]);
    const no = make([rl], { rateLimitRetries: 0 });
    await expect(no.t.translateParagraphs(['好'])).rejects.toThrow('hết hạn mức (429)');
  });

  it('thông báo lỗi HTTP, mạng, phản hồi rỗng/hỏng', async () => {
    const cases: Array<[Reply, string]> = [
      [{ status: 400, body: { error: { message: 'API key not valid' } } }, 'từ chối API key (400)'],
      [{ status: 403, body: {} }, 'từ chối API key (403)'],
      [{ status: 404, body: {} }, 'model Gemini (404)'],
      [{ status: 503, body: 'down' }, 'đang lỗi (503)'],
      [{ status: 400, body: { error: { message: 'bad thing' } } }, 'Gemini lỗi 400: bad thing'],
      [{ status: 418, body: '' }, 'Gemini lỗi 418'],
      [new TypeError('Failed to fetch'), 'mất mạng'],
      [{ body: { promptFeedback: { blockReason: 'SAFETY' } } }, 'không trả về bản dịch (SAFETY)'],
      [{ body: {} }, 'không trả về bản dịch.'],
      [{ body: { candidates: [{ content: { parts: [{ text: '{"title":' }] }, finishReason: 'MAX_TOKENS' }] } }, 'dữ liệu hỏng (MAX_TOKENS)'],
      [{ body: { candidates: [{ content: { parts: [{ text: 'oops' }, {}] }, finishReason: 'STOP' }] } }, 'dữ liệu hỏng.'],
    ];
    for (const [reply, msg] of cases) {
      await expect(make([reply], { rateLimitRetries: 0 }).t.translateBookTitle('书')).rejects.toThrow(msg);
    }
  });

  it('mặc định dùng fetch & setTimeout toàn cục', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"title":"A"}' }] } }] }))) as typeof fetch;
    try {
      expect(await new GeminiNovelTranslator({ apiKey: 'k', model: '' }).translateBookTitle('甲')).toBe('A');
      let n = 0;
      globalThis.fetch = (async () => (n++ ? new Response('{"candidates":[{"content":{"parts":[{"text":"{\\"title\\":\\"B\\"}"}]}}]}') : new Response('{"retryDelay": "0.001s"}', { status: 429 }))) as typeof fetch;
      expect(await new GeminiNovelTranslator({ apiKey: 'k' }).translateBookTitle('乙')).toBe('B');
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('cài đặt & chọn provider', () => {
  it('lưu/đọc key, có key → Gemini, không → offline', async () => {
    const s = testServices();
    expect(await loadTranslationSettings(s.meta)).toEqual({ model: 'gemini-2.5-flash', geminiApiKey: undefined });
    expect(await createTranslationProvider(s.meta)).toBeInstanceOf(OfflineSmartTranslator);
    await saveTranslationSettings(s.meta, { geminiApiKey: '  abc ', model: 'gemini-2.5-pro' });
    expect(await loadTranslationSettings(s.meta)).toEqual({ model: 'gemini-2.5-pro', geminiApiKey: 'abc' });
    expect(await createTranslationProvider(s.meta)).toBeInstanceOf(GeminiNovelTranslator);
    await saveTranslationSettings(s.meta, { geminiApiKey: ' ', model: '' });
    expect(await loadTranslationSettings(s.meta)).toEqual({ model: 'gemini-2.5-flash', geminiApiKey: undefined });
  });
});

async function seed(chapters: number) {
  const s = testServices();
  await s.library.saveBook({
    bookId: 'zh', title: '武动', language: 'zh', originType: 'epub_upload', chapterCount: chapters,
    chapters: [], lastReadChapterIndex: 1, createdAt: 'x',
  });
  for (let i = 1; i <= chapters; i++) await s.files.writeChapterFile('zh', { index: i, title: `第${i}章`, paragraphs: [`林动${i}。`] });
  return s;
}

describe('Runner + Gemini', () => {
  it('lưu glossary qua các chương, điểm chết khi 429, dịch tiếp vẫn dùng glossary, dịch lại từ đầu', async () => {
    const s = await seed(3);
    let failCh3 = true;
    const f = fakeFetch((prompt) => {
      if (prompt.includes('Dịch tên truyện')) return ok({ title: 'Vũ Động' });
      if (prompt.includes('林动3') && failCh3) return { status: 429, body: {} };
      const n = /林动(\d)/.exec(prompt)![1];
      return ok({ title: '', paragraphs: [`Lâm Động ${n}.`], glossary: [{ zh: '林动', vi: 'Lâm Động' }] });
    });
    const provider = new GeminiNovelTranslator({ apiKey: 'k', fetchImpl: f.impl, rateLimitRetries: 0 });
    const r = new NovelTranslationRunner({ meta: s.meta, files: s.files, provider });
    const job = await r.createJob('zh');
    expect(job.translatedTitle).toBe('Vũ Động');
    const a = await r.startOrResume(job.jobId);
    expect(a.status).toBe('paused_at_deadpoint');
    expect(a.deadPoint!.errorReason).toContain('429');
    expect(a.glossary).toEqual({ 林动: 'Lâm Động' });
    failCh3 = false;
    f.calls.length = 0;
    expect((await r.startOrResume(job.jobId)).status).toBe('completed');
    expect(f.calls[0].prompt).toContain('林动 → Lâm Động');
    expect(await s.files.readChapterFile('zh-vi', 3)).toMatchObject({ title: 'Chương 3', paragraphs: ['Lâm Động 3.'] });

    const reset = await r.resetJob(job.jobId);
    expect(reset).toMatchObject({ status: 'idle', nextChapterIndex: 1, translatedChaptersCount: 0 });
    expect(reset.glossary).toBeUndefined();
    expect(reset.deadPoint).toBeUndefined();
    expect((await r.startOrResume(job.jobId)).status).toBe('completed');
    expect((await s.library.getBook('zh-vi'))!.chapters).toHaveLength(3);

    await expect(r.resetJob('nope')).rejects.toThrow();
    await s.meta.delete('books_metadata', 'zh-vi');
    expect((await r.resetJob(job.jobId)).nextChapterIndex).toBe(1);
  });

  it('Service Worker dùng Gemini khi đã lưu key', async () => {
    const s = await seed(1);
    await saveTranslationSettings(s.meta, { geminiApiKey: 'k', model: 'gemini-2.5-flash' });
    const job = await new NovelTranslationRunner({ meta: s.meta, files: s.files, provider: new OfflineSmartTranslator((await import('../src/domains/dictionary')).defaultSegmenter) }).createJob('zh');
    const orig = globalThis.fetch;
    const reply = ok({ title: '', paragraphs: ['Lâm Động bước tới.'], glossary: [] }) as { body: unknown };
    globalThis.fetch = (async () => new Response(JSON.stringify(reply.body))) as typeof fetch;
    try {
      await handleJobMessage({ type: 'START_TRANSLATION', jobId: job.jobId }, { meta: s.meta, backend: s.backend, broadcast: () => {} });
    } finally {
      globalThis.fetch = orig;
    }
    expect((await s.files.readChapterFile('zh-vi', 1))!.paragraphs).toEqual(['Lâm Động bước tới.']);
  });
});
