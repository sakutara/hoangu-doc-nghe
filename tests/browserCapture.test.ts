import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildBookmarkletHref, buildBookmarkletSource, captureMain,
  type CaptureBundle, type CapturedPage,
} from '../src/domains/crawler/browserCapture/captureBookmarklet';
import { importCaptureBundle, parseCaptureBundle } from '../src/domains/crawler/browserCapture/CaptureBundleImporter';
import { testServices } from './helpers';

const BASE = `${window.location.origin}/book/1`;
const HAN = '这是一段足够长的中文正文内容用来通过检测';

function mount(opts: { next?: string; toc?: boolean; body?: string; title?: string } = {}) {
  document.title = opts.title ?? '测试小说 - 第1章 开始 - 站点';
  window.history.pushState({}, '', `${BASE}/c1.html`);
  document.body.innerHTML = `
    ${opts.toc === false ? '' : '<a href="/book/1/index.html">目录</a>'}
    <h1>第1章 开始</h1>
    ${opts.body ?? `<div id="content"><p>${HAN}一</p><p>${HAN}二<br/>${HAN}三</p><div class="ads">广告</div></div>`}
    ${opts.next === undefined ? '<a href="/book/1/c2.html">下一章</a>' : opts.next}`;
}

const page = (n: number, next?: string): CapturedPage => ({ title: `第${n}章`, paragraphs: [`${HAN}${n}`], next });
const waitDone = async () => { await vi.waitFor(() => expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toMatch(/Tải file/)); };
const frameDoc = (f: HTMLIFrameElement, body: string) => {
  const d = document.implementation.createHTMLDocument('f');
  d.body.innerHTML = body;
  Object.defineProperty(f, 'contentDocument', { get: () => d, configurable: true });
};
const click = (label: string) => [...document.querySelectorAll('#hoangu-capture button')].find((b) => b.textContent === label)!.dispatchEvent(new MouseEvent('click'));

describe('captureMain (bookmarklet)', () => {
  let saved: Array<{ name: string; json: string }>;
  const save = (name: string, json: string) => { saved.push({ name, json }); };
  const sleep = async () => {};
  beforeEach(() => { saved = []; document.body.innerHTML = ''; });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('lấy chương hiện tại rồi lần theo 下一章 đến hết truyện', async () => {
    mount();
    const loadPage = vi.fn(async (u: string) => (u.endsWith('c2.html') ? page(2, `${BASE}/c3.html`) : page(3)));
    captureMain({ sleep, loadPage, save });
    await waitDone();
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Hết truyện');
    click('Tải file');
    const b = JSON.parse(saved[0].json) as CaptureBundle;
    expect(saved[0].name).toBe('测试小说.hoangu.json');
    expect(b).toMatchObject({ format: 'hoangu-capture/1', bookTitle: '测试小说', bookKey: `${BASE}/index.html`, sourceOrigin: window.location.origin });
    expect(b.chapters.map((c) => c.url)).toEqual([`${BASE}/c1.html`, `${BASE}/c2.html`, `${BASE}/c3.html`]);
    expect(b.chapters[0].title).toBe('第1章 开始');
    expect(b.chapters[0].paragraphs).toEqual([`${HAN}一`, `${HAN}二`, `${HAN}三`]);
    expect(b.nextUrl).toBeUndefined();
  });

  it('bấm lần hai khi panel đã có thì không chạy lại', async () => {
    mount();
    captureMain({ sleep, loadPage: async () => null, save });
    captureMain({ sleep, loadPage: async () => null, save });
    expect(document.querySelectorAll('#hoangu-capture')).toHaveLength(1);
    await waitDone();
  });

  it('gặp trang challenge → dừng, không cố vượt, giữ nextUrl', async () => {
    mount();
    captureMain({ sleep, loadPage: async () => ({ title: '', paragraphs: [], challenge: true }), save });
    await waitDone();
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('kiểm tra bot');
    click('Tải file');
    expect(JSON.parse(saved[0].json).nextUrl).toBe(`${BASE}/c2.html`);
  });

  it('chương kế rỗng / null / ném lỗi → dừng', async () => {
    for (const loadPage of [async () => ({ title: '', paragraphs: [] }), async () => null, async () => { throw new Error('x'); }]) {
      document.body.innerHTML = '';
      mount();
      captureMain({ sleep, loadPage, save });
      await waitDone();
      expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Không đọc được');
    }
  });

  it('trang không có nội dung → báo và không lấy gì; Tải file khi rỗng', async () => {
    mount({ body: '<div>english</div>', next: '' });
    captureMain({ sleep, save });
    await vi.waitFor(() => expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Không thấy nội dung'));
    click('Tải file');
    expect(saved).toHaveLength(0);
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Chưa có chương');
  });

  it('nút Dừng, giới hạn chương và phát hiện vòng lặp', async () => {
    mount();
    let n = 1;
    const loadPage = async () => { n += 1; return page(n, `${BASE}/c${n + 1}.html`); };
    captureMain({ sleep, loadPage, save, maxChapters: 2 });
    await waitDone();
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Đủ 2 chương');

    document.body.innerHTML = '';
    mount();
    captureMain({ sleep, loadPage: async () => page(2, `${BASE}/c1.html`), save });
    await waitDone();
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('vòng lặp');

    document.body.innerHTML = '';
    mount();
    let release!: () => void;
    captureMain({ sleep: () => new Promise<void>((r) => { release = r; }), loadPage, save });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    click('Dừng');
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Đang dừng');
    release();
    await waitDone();
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Đã dừng');

    // dừng trước khi sleep đầu tiên kết thúc: đặt cờ ngay trong sleep
    document.body.innerHTML = '';
    mount();
    captureMain({ sleep: async () => { click('Dừng'); }, loadPage, save });
    await waitDone();
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Đã dừng');
  });

  it('không link tiếp, link ngoài origin, link về mục lục, link hỏng, rel=next', async () => {
    const cases: Array<[string, boolean]> = [
      ['', false],
      ['<a href="http://other.test/c2.html">下一章</a>', false],
      ['<a href="index.html">下一章</a>', false],
      ['<a href="http://[bad">下一章</a>', false],
      ['<a rel="next" href="/book/1/c2.html">›</a>', true],
    ];
    for (const [next, hasNext] of cases) {
      document.body.innerHTML = '';
      mount({ next });
      const loadPage = vi.fn(async () => page(2));
      captureMain({ sleep, loadPage, save });
      await waitDone();
      expect(loadPage.mock.calls.length > 0).toBe(hasNext);
    }
  });

  it('chọn khối nội dung theo mật độ chữ Hán (lồng nhau), tên truyện/khoá dự phòng', async () => {
    const wrapper = `<div class="wrap"><div class="side">${HAN}</div><div class="main"><div class="inner">${HAN}${HAN}<br/>${HAN}</div></div></div>`;
    mount({ body: wrapper, toc: false, next: '', title: '第1章 开始' });
    captureMain({ sleep, save });
    await waitDone();
    click('Tải file');
    const b = JSON.parse(saved[0].json) as CaptureBundle;
    expect(b.chapters[0].paragraphs.length).toBeGreaterThan(0);
    expect(b.bookKey).toBe(`${BASE}/c1.html`);
    expect(b.bookTitle).toBe('第1章 开始');

    document.body.innerHTML = '';
    saved = [];
    mount({ body: '<article>文章内容</article>'.repeat(1), next: '', title: '', toc: false });
    document.body.insertAdjacentHTML('afterbegin', '<h2>标题二</h2><h1></h1>');
    document.querySelector('h1')!.remove();
    captureMain({ sleep, save });
    await waitDone();
    click('Tải file');
    expect(JSON.parse(saved[0].json).chapters[0].title).toBe('第1章 开始');
  });

  it('tải file mặc định bằng Blob; chặn thì rơi sang clipboard', async () => {
    mount({ next: '' });
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    captureMain({ sleep });
    await vi.advanceTimersByTimeAsync(0);
    click('Tải file');
    expect(clickSpy).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10000);
    expect(revoke).toHaveBeenCalled();

    create.mockImplementation(() => { throw new Error('blocked'); });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    click('Tải file');
    expect(writeText).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('clipboard');
    writeText.mockRejectedValueOnce(new Error('no'));
    click('Tải file');
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Không tải/sao chép');
  });

  it('bộ nạp mặc định bằng fetch + DOMParser (và nhận diện challenge)', async () => {
    mount();
    const html = (n: number) => `<h1>第${n}章</h1><div id="content">${HAN}${n}</div>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 200, text: async () => html(2) })
      .mockResolvedValueOnce({ status: 403, text: async () => '<title>Just a moment...</title>' });
    vi.stubGlobal('fetch', fetchMock);
    const ifr = vi.spyOn(document, 'createElement');
    ifr.mockImplementation(((tag: string) => {
      const el = Document.prototype.createElement.call(document, tag);
      if (tag === 'iframe') Object.defineProperty(el, 'contentDocument', { get: () => null });
      return el;
    }) as typeof document.createElement);
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    captureMain({ sleep });
    // iframe: kích hoạt onload để rơi vào nhánh contentDocument = null → fetch
    const fire = async () => {
      await vi.advanceTimersByTimeAsync(0);
      const f = document.querySelector('iframe');
      if (f) (f as HTMLIFrameElement).onload!(new Event('load'));
      await vi.advanceTimersByTimeAsync(0);
    };
    await fire();
    // chương 2 có link tiếp? html(2) không có → hết truyện
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toMatch(/Hết truyện|Đã lấy/);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/c2.html`, { credentials: 'include' });
  });

  it('bộ nạp iframe: lấy nội dung sau khi trang tự sắp xếp, hoặc báo challenge', async () => {
    mount();
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    captureMain({ sleep });
    await vi.advanceTimersByTimeAsync(0);
    const f = document.querySelector('iframe') as HTMLIFrameElement;
    expect(f.src).toBe(`${BASE}/c2.html`);
    frameDoc(f, `<h1>第2章</h1><div id="content">${HAN}二</div>`);
    f.onload!(new Event('load'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Hết truyện');
    expect(document.querySelector('iframe')).toBeNull();

    document.body.innerHTML = '';
    mount();
    captureMain({ sleep });
    await vi.advanceTimersByTimeAsync(0);
    const g = document.querySelector('iframe') as HTMLIFrameElement;
    frameDoc(g, '<div id="challenge-form">Just a moment</div>');
    g.onload!(new Event('load'));
    await vi.advanceTimersByTimeAsync(10);
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('kiểm tra bot');

    // trang chậm: chưa có nội dung → hết 15s thì bỏ cuộc; và timeout 45s khi không load
    document.body.innerHTML = '';
    mount();
    captureMain({ sleep });
    await vi.advanceTimersByTimeAsync(0);
    const h = document.querySelector('iframe') as HTMLIFrameElement;
    frameDoc(h, '<p>loading</p>');
    h.onload!(new Event('load'));
    await vi.advanceTimersByTimeAsync(16000);
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Không đọc được');

    document.body.innerHTML = '';
    mount();
    captureMain({ sleep });
    await vi.advanceTimersByTimeAsync(46000);
    expect(document.getElementById('hoangu-capture')!.firstChild!.textContent).toContain('Không đọc được');
  });

  it('nghỉ ngẫu nhiên 2–4 giây giữa các chương khi dùng sleep mặc định', async () => {
    mount();
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const loadPage = vi.fn(async () => page(2));
    captureMain({ loadPage });
    await vi.advanceTimersByTimeAsync(1500);
    expect(loadPage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2600);
    expect(loadPage).toHaveBeenCalled();
  });

  it('ưu tiên link a#next dù chữ không phải 下一章', async () => {
    mount({ next: '<a id="next" href="/book/1/c2.html">Next &gt;</a>' });
    const loadPage = vi.fn(async () => page(2));
    captureMain({ sleep, loadPage, save });
    await waitDone();
    expect(loadPage).toHaveBeenCalledWith(`${BASE}/c2.html`);
    document.body.innerHTML = '';
    mount({ next: '<div id="next"><a href="/book/1/c2.html">›</a></div>' });
    const lp2 = vi.fn(async () => page(2));
    captureMain({ sleep, loadPage: lp2, save });
    await waitDone();
    expect(lp2).toHaveBeenCalled();
  });

  it('giữ thẻ tiêu đề (h2 kiểu hetushu) và đổi div văn bản thành khối p', async () => {
    mount({ body: `<div id="content"><h2>第1章 开始</h2><div>${HAN}甲</div><h3>小节</h3><div>${HAN}乙<br/>${HAN}丙</div></div>`, next: '' });
    captureMain({ sleep, save });
    await waitDone();
    click('Tải file');
    const b = JSON.parse(saved[0].json) as CaptureBundle;
    expect(b.chapters[0].title).toBe('第1章 开始');
    expect(b.chapters[0].blocks).toEqual([
      { tag: 'p', text: `${HAN}甲` }, { tag: 'h3', text: '小节' }, { tag: 'p', text: `${HAN}乙` }, { tag: 'p', text: `${HAN}丙` },
    ]);
  });

  it('bookmarklet href hợp lệ và tự chứa', () => {
    const href = buildBookmarkletHref();
    expect(href.startsWith('javascript:')).toBe(true);
    const src = decodeURIComponent(href.slice('javascript:'.length));
    expect(src).toBe(buildBookmarkletSource());
    expect(() => new Function(src)).not.toThrow();
  });
});

describe('CaptureBundleImporter', () => {
  const bundle = (over: Partial<CaptureBundle> = {}): CaptureBundle => ({
    format: 'hoangu-capture/1', bookTitle: '测试', sourceOrigin: 'http://s', bookKey: 'http://s/index.html', capturedAt: 'x',
    chapters: [{ url: 'http://s/1', title: '第1章', paragraphs: ['甲', '乙'] }, { url: 'http://s/2', title: '', paragraphs: ['丙'] }], ...over,
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
