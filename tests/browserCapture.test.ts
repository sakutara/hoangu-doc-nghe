import { describe, expect, it } from 'vitest';
import { importCaptureBundle, parseCaptureBundle, type CaptureBundle } from '../src/domains/crawler/browserCapture/CaptureBundleImporter';
import { cleanStoredBook } from '../src/domains/crawler/stripInjectedLinks';
import { extractChapterFromHtml } from '../src/domains/crawler/HtmlNovelExtractor';
import { testServices } from './helpers';

describe('CaptureBundleImporter', () => {
  const bundle = (over: Partial<CaptureBundle> = {}): CaptureBundle => ({
    format: 'hoangu-capture/1', bookTitle: '测试', sourceOrigin: 'http://s', bookKey: 'http://s/index.html', capturedAt: 'x',
    chapters: [{ url: 'http://s/1', title: '第1章', paragraphs: ['甲', '乙'] }, { url: 'http://s/2', title: '', paragraphs: ['丙'] }], ...over,
  });

  it('parse: lọc link hetushu.com chèn vào nội dung và tiêu đề', () => {
    const out = parseCaptureBundle(JSON.stringify({
      format: 'hoangu-capture/1', bookKey: 'k',
      chapters: [{
        url: 'u', title: '第1章 开始 https://www.hetushu.com/',
        blocks: [{ tag: 'p', text: '他走了https://www.hetushu.com/book/1/2.html过去' }, { tag: 'p', text: 'https://www.hetushu.com/' }, { tag: 'p', text: '访问 www.hetushu.com 继续' }, { tag: 'p', text: '正常' }],
      }],
    }));
    expect(out.chapters[0].title).toBe('第1章 开始');
    expect(out.chapters[0].paragraphs).toEqual(['他走了过去', '访问 继续', '正常']);
  });

  it('parse: từ chối dữ liệu sai, lọc đoạn/chương rỗng, giá trị mặc định', () => {
    expect(() => parseCaptureBundle('not json')).toThrow('JSON');
    expect(() => parseCaptureBundle('null')).toThrow('format');
    expect(() => parseCaptureBundle(JSON.stringify({ format: 'x' }))).toThrow('format');
    expect(() => parseCaptureBundle(JSON.stringify({ format: 'hoangu-capture/1' }))).toThrow('bookKey');
    expect(() => parseCaptureBundle(JSON.stringify({ format: 'hoangu-capture/1', bookKey: 'k' }))).toThrow('danh sách chương');
    expect(() => parseCaptureBundle(JSON.stringify({ format: 'hoangu-capture/1', bookKey: 'k', chapters: new Array(5001).fill(0) }))).toThrow('quá nhiều');
    expect(() => parseCaptureBundle(JSON.stringify({ format: 'hoangu-capture/1', bookKey: 'k', chapters: [{ url: 1 }] }))).toThrow('sai cấu trúc');
    expect(() => parseCaptureBundle(JSON.stringify({ format: 'hoangu-capture/1', bookKey: 'k', chapters: [null] }))).toThrow('sai cấu trúc');
    const ok = parseCaptureBundle(JSON.stringify({
      format: 'hoangu-capture/1', bookKey: 'k', bookTitle: '  ', nextUrl: 'n',
      chapters: [{ url: 'u1', paragraphs: ['a', '', '  ', 5] }, { url: 'u2', title: 'T', paragraphs: [''] }],
    }));
    expect(ok).toMatchObject({ bookTitle: 'Truyện', sourceOrigin: '', capturedAt: '', nextUrl: 'n' });
    expect(ok.chapters).toEqual([{ url: 'u1', title: '', paragraphs: ['a'] }]);
    expect(parseCaptureBundle(JSON.stringify({ format: 'hoangu-capture/1', bookKey: 'k', bookTitle: 'Tên', chapters: [] })).nextUrl).toBeUndefined();
  });

  it('cào: bỏ link hetushu khi trích chương; cleanStoredBook lọc lại chương đã lưu', async () => {
    const r = extractChapterFromHtml('<h1>第1章</h1><div id="content"><p>他走了https://www.hetushu.com/过去</p><p>www.hetushu.com</p><p>正常</p></div>', 'http://s/1.html');
    expect(r.paragraphs).toEqual(['他走了过去', '正常']);
    const s = testServices();
    await s.files.writeChapterFile('b1', { index: 1, title: '第1章 https://www.hetushu.com/', paragraphs: ['甲https://www.hetushu.com/乙', 'https://www.hetushu.com/', '丙'] });
    await s.files.writeChapterFile('b1', { index: 2, title: '第2章', paragraphs: ['干净'] });
    const book = { bookId: 'b1', chapters: [{ index: 1 }, { index: 2 }] } as never;
    expect(await cleanStoredBook(book, s.files)).toEqual({ changed: 1, removed: 1 });
    expect(await s.files.readChapterFile('b1', 1)).toEqual({ index: 1, title: '第1章', paragraphs: ['甲乙', '丙'] });
  });

  it('nhận blocks h/p: lưu tiêu đề phụ, đọc lại đúng thẻ; thẻ lạ → p', async () => {
    const parsed = parseCaptureBundle(JSON.stringify({
      format: 'hoangu-capture/1', bookKey: 'k',
      chapters: [{ url: 'u', title: 'T', blocks: [{ tag: 'h2', text: ' 小节 ' }, { tag: 'zz', text: '甲' }, { tag: 'p', text: ' ' }, null] }],
    }));
    expect(parsed.chapters[0]).toEqual({ url: 'u', title: 'T', paragraphs: ['小节', '甲'], blocks: [{ tag: 'h2', text: '小节' }, { tag: 'p', text: '甲' }] });
    const s = testServices();
    await importCaptureBundle(parsed, { meta: s.meta, files: s.files }, () => 'hb');
    expect(await s.files.readChapterFile('hb', 1)).toEqual({
      index: 1, title: 'T', paragraphs: ['小节', '甲'], blocks: [{ tag: 'h2', text: '小节' }, { tag: 'p', text: '甲' }],
    });
  });

  it('tạo truyện mới, rồi lượt sau nối tiếp và bỏ trùng', async () => {
    const s = testServices();
    const deps = { meta: s.meta, files: s.files };
    const r1 = await importCaptureBundle(bundle(), deps, () => 'bk1', ' Tên tôi ');
    expect(r1).toMatchObject({ created: true, added: 2 });
    expect(r1.book.title).toBe('Tên tôi');
    expect((await s.files.readChapterFile('bk1', 2))!.title).toBe('Chương 2');

    const r2 = await importCaptureBundle(bundle({
      chapters: [{ url: 'http://s/2', title: 'dup', paragraphs: ['x'] }, { url: 'http://s/3', title: '第3章', paragraphs: ['丁'] }],
    }), deps, () => 'bk2');
    expect(r2).toMatchObject({ created: false, added: 1 });
    expect(r2.book.bookId).toBe('bk1');
    expect(r2.book.chapterCount).toBe(3);
    expect((await s.files.readChapterFile('bk1', 3))!.paragraphs).toEqual(['丁']);
    expect(await s.library.getBook('bk2')).toBeUndefined();

    const r3 = await importCaptureBundle(bundle({ bookTitle: '' }), deps, () => 'bk3');
    expect(r3.added).toBe(0);
  });

  it('nối vào truyện đích có sẵn (chưa có URL chương) và bỏ trùng theo tiêu đề', async () => {
    const s = testServices();
    const deps = { meta: s.meta, files: s.files };
    await s.library.saveBook({ bookId: 'old', title: 'Cũ', language: 'zh', originType: 'web_crawl', chapterCount: 1, chapters: [{ index: 1, title: '第1章', fileName: 'chapter-0001.txt' }], lastReadChapterIndex: 1, createdAt: '' });
    await s.files.writeChapterFile('old', { index: 1, title: '第1章', paragraphs: ['甲'] });
    const r = await importCaptureBundle(bundle({
      chapters: [{ url: 'u1', title: '第1章', paragraphs: ['甲'] }, { url: 'u2', title: '第2章', paragraphs: ['乙'] }],
    }), deps, () => 'new', undefined, 'old');
    expect(r).toMatchObject({ created: false, added: 1 });
    expect(r.book).toMatchObject({ bookId: 'old', chapterCount: 2, sourceUrl: 'http://s/index.html' });
    await expect(importCaptureBundle(bundle(), deps, () => 'n', undefined, 'none')).rejects.toThrow('truyện đích');
  });

  it('tiêu đề mặc định lấy từ gói; truyện khác bookKey là truyện mới', async () => {
    const s = testServices();
    const deps = { meta: s.meta, files: s.files };
    const a = await importCaptureBundle(bundle(), deps, () => 'a');
    expect(a.book.title).toBe('测试');
    const b = await importCaptureBundle(bundle({ bookKey: 'http://s/other' }), deps, () => 'b');
    expect(b.created).toBe(true);
  });
});
