import { describe, expect, it } from 'vitest';
import coreSource from '../extension/core.js?raw';
import { parseCaptureBundle } from '../src/domains/crawler/browserCapture/CaptureBundleImporter';

// core.js là classic script của Chrome extension → nạp bằng eval để gắn globalThis.HNCore.
// eslint-disable-next-line no-new-func
new Function(coreSource)();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C = (globalThis as any).HNCore;

const HAN = '这是一段足够长的中文正文内容用来通过检测';
const doc = (html: string, title = '测试小说 - 第1章 开始 - 站点') => {
  const d = document.implementation.createHTMLDocument(title);
  d.body.innerHTML = html;
  return d;
};

describe('extension core', () => {
  it('trích chương: tiêu đề, đoạn, link 下一章 và link mục lục', () => {
    const d = doc(`<a href="/b/index.html">目录</a><h1>第1章 开始</h1><div id="content"><p>${HAN}一</p><p>${HAN}二<br/>${HAN}三</p><div class="ads">广告</div></div><a href="/b/2.html">下一章</a>`);
    const p = C.extractPage(d, 'https://x.test/b/1.html');
    expect(p.title).toBe('第1章 开始');
    expect(p.paragraphs).toHaveLength(3);
    expect(p.next).toBe('https://x.test/b/2.html');
    expect(C.findTocUrl(d, 'https://x.test/b/1.html')).toBe('https://x.test/b/index.html');
  });

  it('bỏ link 下一章 trỏ về mục lục / khác origin', () => {
    const toc = C.extractPage(doc(`<div id="content"><p>${HAN}</p></div><a href="/b/">下一章</a>`), 'https://x.test/b/9.html');
    expect(toc.next).toBeUndefined();
    const ext = C.extractPage(doc(`<div id="content"><p>${HAN}</p></div><a href="https://evil.test/2.html">下一章</a>`), 'https://x.test/b/9.html');
    expect(ext.next).toBeUndefined();
  });

  it('nhận diện trang challenge', () => {
    const p = C.extractPage(doc('<title>Just a moment...</title><form id="challenge-form"></form>', 'Just a moment...'), 'https://x.test/b/2.html');
    expect(p.challenge).toBe(true);
    expect(C.isChallengeHtml('<div class="cf-chl-x">')).toBe(true);
  });

  it('parseToc: theo mẫu 第N章, bỏ trùng; dự phòng theo nhóm link', () => {
    const items = Array.from({ length: 4 }, (_, i) => `<li><a href="/b/${i + 1}.html#x">第${i + 1}章 t</a></li>`).join('');
    const d = doc(`<a href="/">首页</a><ul>${items}<li><a href="/b/1.html">第1章 t</a></li></ul>`);
    const toc = C.parseToc(d, 'https://x.test/b/index.html');
    expect(toc.map((c: { url: string }) => c.url)).toEqual([1, 2, 3, 4].map((n) => `https://x.test/b/${n}.html`));
    const plain = Array.from({ length: 6 }, (_, i) => `<dd><a href="/b/p${i}.html">序章${i}</a></dd>`).join('');
    expect(C.parseToc(doc(`<a href="/">首页</a><dl>${plain}</dl>`), 'https://x.test/b/index.html')).toHaveLength(6);
    expect(C.parseToc(doc('<a href="/a">x</a>'), 'https://x.test/b/index.html')).toHaveLength(0);
  });

  it('trang mục lục “小说目录” có nhiều chữ Hán vẫn được nhận là mục lục', () => {
    const items = Array.from({ length: 12 }, (_, i) => `<dd><a href="/b/${i + 1}.html">第${i + 1}章 ${HAN}</a></dd>`).join('');
    const toc = doc(`<h2>小说目录</h2><a href="/b/">小说目录</a><div id="list"><dl>${items}</dl></div>`);
    expect(C.looksLikeToc(toc, 'https://x.test/b/index.html')).toBe(true);
    const chap = doc(`<a href="/b/index.html">小说目录</a><div id="content"><p>${HAN}${HAN}${HAN}${HAN}${HAN}${HAN}</p></div><a href="/b/2.html">下一章</a>`);
    expect(C.looksLikeToc(chap, 'https://x.test/b/1.html')).toBe(false);
    expect(C.findTocUrl(chap, 'https://x.test/b/1.html')).toBe('https://x.test/b/index.html');
  });

  it('makeBundle tương thích CaptureBundleImporter', () => {
    const bundle = C.makeBundle(
      { title: '书', origin: 'https://x.test', bookKey: 'https://x.test/b/index.html' },
      [{ url: 'https://x.test/b/1.html', title: '第1章', paragraphs: [HAN], blocks: [{ tag: 'p', text: HAN }] }],
    );
    const parsed = parseCaptureBundle(JSON.stringify(bundle));
    expect(parsed.chapters).toHaveLength(1);
    expect(C.guessBookTitle('书名 - 第1章 开始 - 站点', '第1章 开始')).toBe('书名');
    expect(C.safeName('a/b:c')).toBe('a_b_c');
  });
});
