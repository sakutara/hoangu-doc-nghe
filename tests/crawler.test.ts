import { describe, expect, it, vi } from 'vitest';
import { extractChapterFromHtml, extractTocLinksFromHtml } from '../src/domains/crawler/HtmlNovelExtractor';
import { NovelCrawlerRunner } from '../src/domains/crawler/NovelCrawlerRunner';
import { BotChallengeError, fetchHtml } from '../src/domains/crawler/CorsFetchPipeline';
import type { CrawlJob } from '../src/domains/crawler/types';
import { testServices } from './helpers';

const page = (n: number, next: string | null, body = `第${n}章的正文内容`) =>
  `<html><body><h1>第${n}章 标题</h1><script>x()</script><div id="content">${body}<br/>第二段${n}</div><div class="ads">广告广告</div>${next ? `<a href="${next}">下一章</a>` : '<a href="./">下一章</a>'}</body></html>`;

describe('HtmlNovelExtractor', () => {
  it('bóc tách tiêu đề, nội dung, link tiếp', () => {
    const r = extractChapterFromHtml(page(1, '/c2.html'), 'http://s.com/c1.html');
    expect(r.title).toBe('第1章 标题');
    expect(r.paragraphs).toEqual(['第1章的正文内容', '第二段1']);
    expect(r.nextChapterUrl).toBe('http://s.com/c2.html');
    expect(r.hasNextChapter).toBe(true);
  });
  it('phát hiện chương cuối (trỏ về mục lục / chính nó)', () => {
    expect(extractChapterFromHtml(page(9, null), 'http://s.com/c9.html').hasNextChapter).toBe(false);
    expect(extractChapterFromHtml(page(9, 'index.html'), 'http://s.com/c9.html').hasNextChapter).toBe(false);
    expect(extractChapterFromHtml(page(9, 'c9.html'), 'http://s.com/c9.html').hasNextChapter).toBe(false);
  });
  it('rel=next, link hỏng, không link, fallback mật độ chữ Hán, <title>', () => {
    expect(extractChapterFromHtml('<a rel="next" href="/n">›</a><div>短</div><div>很长的一段中文内容在这里</div>', 'http://s.com/a').nextChapterUrl).toBe('http://s.com/n');
    expect(extractChapterFromHtml('<a href="http://[bad">下章</a>', 'http://s.com/a').nextChapterUrl).toBeUndefined();
    expect(extractChapterFromHtml('<a>下一章</a><a href="/z">other</a>', 'http://s.com/a').hasNextChapter).toBe(false);
    expect(extractChapterFromHtml('<title>T</title><article>中文文章</article>', 'http://s.com/a').title).toBe('T');
    expect(extractChapterFromHtml('<p>x</p>', 'http://s.com/a').title).toBe('');
    expect(extractChapterFromHtml('<div id="content">english only</div><div>中文</div>', 'http://s.com/a').paragraphs).toEqual(['中文']);
    expect(extractChapterFromHtml('<div class="Readarea">文</div>', 'http://s.com/a').paragraphs).toEqual(['文']);
  });
  it('link a#next (chữ bất kỳ) và id=next hỏng', () => {
    const r = extractChapterFromHtml('<div id="content">中文正文</div><a id="next" href="c2.html">Next</a>', 'http://s.com/c1.html');
    expect(r.nextChapterUrl).toBe('http://s.com/c2.html');
    expect(extractChapterFromHtml('<div id="content">中文</div><a id="next" href="http://[bad">x</a>', 'http://s.com/c1.html').hasNextChapter).toBe(false);
  });
  it('mục lục', () => {
    const toc = extractTocLinksFromHtml('<a href="/1">第一章 a</a><a href="/1">第一章 a</a><a href="/2">第二章 b</a><a href="/x">首页</a><a href="http://[bad">第三章</a>', 'http://s.com/toc/');
    expect(toc.map((t) => t.url)).toEqual(['http://s.com/1', 'http://s.com/2']);
  });
});

function setup(pages: Record<string, string | Error>, opts: { limit?: number } = {}) {
  const s = testServices();
  const progress: CrawlJob[] = [];
  let stop = false;
  const runner = new NovelCrawlerRunner({
    meta: s.meta, files: s.files, onProgress: (j) => progress.push({ ...j }), shouldStop: () => stop,
    fetchHtml: async (u) => { const p = pages[u]; if (p instanceof Error) throw p; if (p === undefined) throw 'HTTP 404'; return p; },
  });
  return { s, runner, progress, setStop: (v: boolean) => { stop = v; }, opts };
}

describe('NovelCrawlerRunner', () => {
  const U = (n: number) => `http://s.com/c${n}.html`;

  it('cào liên tiếp qua 下一章 và hoàn tất', async () => {
    const { s, runner } = setup({ [U(1)]: page(1, U(2)), [U(2)]: page(2, U(3)), [U(3)]: page(3, null) });
    const job = await runner.createJob('b', 'Truyện', U(1));
    const done = await runner.startOrResume(job.jobId);
    expect(done.status).toBe('completed');
    expect(done.chaptersCrawled).toBe(3);
    expect(await s.files.listChapterFiles('b')).toHaveLength(3);
    expect((await s.library.getBook('b'))!.chapterCount).toBe(3);
  });

  it('lỗi ở chương 3 → điểm chết, rồi cào tiếp đúng từ chương 3', async () => {
    const pages: Record<string, string | Error> = { [U(1)]: page(1, U(2)), [U(2)]: page(2, U(3)), [U(3)]: new Error('HTTP 500') };
    const { s, runner } = setup(pages);
    const job = await runner.createJob('b', 'T', U(1));
    const r1 = await runner.startOrResume(job.jobId);
    expect(r1.status).toBe('paused_at_deadpoint');
    expect(r1.deadPoint).toMatchObject({ failedUrl: U(3), failedChapterIndex: 3, lastSuccessChapterUrl: U(2), errorReason: 'HTTP 500', retryCount: 1 });
    // thử lại vẫn lỗi → retryCount tăng, chương 1-2 không bị cào lại
    const r2 = await runner.startOrResume(job.jobId);
    expect(r2.deadPoint!.retryCount).toBe(2);
    expect(r2.chaptersCrawled).toBe(2);
    pages[U(3)] = page(3, null);
    const r3 = await runner.startOrResume(job.jobId);
    expect(r3.status).toBe('completed');
    expect(r3.deadPoint).toBeUndefined();
    expect((await s.library.getBook('b'))!.chapters.map((c) => c.index)).toEqual([1, 2, 3]);
  });

  it('nội dung rỗng và lỗi không phải Error cũng thành điểm chết', async () => {
    const a = setup({ [U(1)]: '<html></html>' });
    const ja = await a.runner.createJob('b', 'T', U(1));
    expect((await a.runner.startOrResume(ja.jobId)).deadPoint!.errorReason).toContain('rỗng');
    const b = setup({});
    const jb = await b.runner.createJob('b', 'T', U(1));
    expect((await b.runner.startOrResume(jb.jobId)).deadPoint!.errorReason).toBe('HTTP 404');
  });

  it('tiêu đề trống → "Chương N"; job không tồn tại', async () => {
    const { s, runner } = setup({ [U(1)]: '<div id="content">中文正文</div>' });
    const job = await runner.createJob('b', 'T', U(1));
    await runner.startOrResume(job.jobId);
    expect((await s.files.readChapterFile('b', 1))!.title).toBe('Chương 1');
    await expect(runner.startOrResume('nope')).rejects.toThrow();
  });

  it('giới hạn mỗi đợt & tạm dừng bởi người dùng', async () => {
    const { runner, setStop } = setup({ [U(1)]: page(1, U(2)), [U(2)]: page(2, U(3)), [U(3)]: page(3, null) });
    const job = await runner.createJob('b', 'T', U(1), 2);
    const r = await runner.startOrResume(job.jobId);
    expect(r.status).toBe('paused_by_user');
    expect(r.chaptersCrawled).toBe(2);
    setStop(true);
    expect((await runner.startOrResume(job.jobId)).status).toBe('paused_by_user');
  });

  it('dò chương mới', async () => {
    const pages: Record<string, string | Error> = { [U(1)]: page(1, null) };
    const { runner } = setup(pages);
    const job = await runner.createJob('b', 'T', U(1));
    await expect(runner.checkForNewChapters(job.jobId)).rejects.toThrow();
    await runner.startOrResume(job.jobId);
    expect((await runner.checkForNewChapters(job.jobId)).chaptersCrawled).toBe(1);
    pages[U(1)] = page(1, U(2));
    pages[U(2)] = page(2, null);
    const r = await runner.checkForNewChapters(job.jobId);
    expect(r.chaptersCrawled).toBe(2);
    expect(r.status).toBe('completed');
  });
});

describe('CorsFetchPipeline', () => {
  const res = (body: Uint8Array | string, init: { ok?: boolean; status?: number; ct?: string } = {}) =>
    ({ ok: init.ok ?? true, status: init.status ?? 200, headers: { get: () => init.ct ?? null },
       arrayBuffer: async () => (typeof body === 'string' ? new TextEncoder().encode(body) : body).buffer }) as unknown as Response;

  it('trực tiếp thành công', async () => {
    expect(await fetchHtml('http://a', async () => res('你好'))).toBe('你好');
  });
  it('rơi sang proxy khi lỗi/HTTP lỗi', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('cors')).mockResolvedValueOnce(res('', { ok: false, status: 403 })).mockResolvedValueOnce(res('ok'));
    expect(await fetchHtml('http://a', f)).toBe('ok');
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('mọi nguồn lỗi → ném', async () => {
    await expect(fetchHtml('http://a', async () => { throw 'x'; })).rejects.toThrow('Không tải được');
    await expect(fetchHtml('http://a', async () => res('', { ok: false, status: 500 }), [])).rejects.toThrow('HTTP 500');
  });
  it('giải mã GB18030 theo header hoặc meta', async () => {
    const gbk = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]); // 你好
    expect(await fetchHtml('http://a', async () => res(gbk, { ct: 'text/html; charset=gbk' }))).toBe('你好');
    const meta = new Uint8Array([...new TextEncoder().encode('<meta charset="gb2312">'), ...gbk]);
    expect(await fetchHtml('http://a', async () => res(meta))).toContain('你好');
  });
});

describe('Cloudflare bot challenge', () => {
  const cf = (status = 403, body = 'Just a moment...', header: string | null = 'challenge') =>
    ({ ok: false, status, headers: { get: (k: string) => (k === 'cf-mitigated' ? header : null) },
       text: async () => body, arrayBuffer: async () => new ArrayBuffer(0) }) as unknown as Response;

  it('403 + cf-mitigated → BotChallengeError', async () => {
    const err = await fetchHtml('http://a', async () => cf()).catch((e) => e);
    expect(err).toBeInstanceOf(BotChallengeError);
    expect(err.kind).toBe('bot_challenge');
    expect(err.message).toContain('Tải qua trình duyệt');
  });
  it('nhận diện qua nội dung khi không có header; 403 thường vẫn là lỗi cũ', async () => {
    await expect(fetchHtml('http://a', async () => cf(503, '<script src="https://challenges.cloudflare.com/x">', null), [])).rejects.toBeInstanceOf(BotChallengeError);
    await expect(fetchHtml('http://a', async () => cf(403, 'Forbidden', null), [])).rejects.toThrow('HTTP 403');
    await expect(fetchHtml('http://a', async () => cf(500, 'Just a moment', null), [])).rejects.toThrow('HTTP 500');
    const broken = { ...cf(403, '', null), text: async () => { throw new Error('x'); } } as unknown as Response;
    await expect(fetchHtml('http://a', async () => broken, [])).rejects.toThrow('HTTP 403');
  });
  it('runner ghi errorKind = bot_challenge vào điểm chết', async () => {
    const s = testServices();
    const runner = new NovelCrawlerRunner({ meta: s.meta, files: s.files, fetchHtml: (u) => fetchHtml(u, async () => cf(), []) });
    const job = await runner.createJob('b', 'T', 'http://s.com/index.html');
    const r = await runner.startOrResume(job.jobId);
    expect(r.deadPoint).toMatchObject({ errorKind: 'bot_challenge' });
    expect(r.deadPoint!.errorReason).toContain('Cloudflare');
  });
});
