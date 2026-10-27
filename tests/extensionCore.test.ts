import { describe, expect, it } from 'vitest';
import coreSource from '../extension/core.js?raw';
import JSZip from 'jszip';

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

  it('tên sách / tên file', () => {
    expect(C.guessBookTitle('书名 - 第1章 开始 - 站点', '第1章 开始')).toBe('书名');
    expect(C.safeName('a/b:c')).toBe('a_b_c');
  });

  it('dọn nội dung: bỏ mọi khoảng trắng (trừ sau dấu ;) rồi mới dọn link / hetushu / .com', () => {
    expect(C.squeezeSpaces('他 走 了　过 去\n了')).toBe('他走了过去了');
    expect(C.squeezeSpaces('甲； 乙;  丙 丁')).toBe('甲； 乙; 丙丁');
    expect(C.squeezeSpaces('他说。 然后， 走 了. 好, 的\n行')).toBe('他说。 然后， 走了. 好, 的行');
    expect(C.cleanText('访问 www.hetushu.com 继续')).toBe('访问继续');
    expect(C.cleanText(`${HAN} https://www.hetushu.com/book/1.html 后`)).toBe(`${HAN}后`);
    expect(C.cleanText('h e t u s h u 书 x . c o m')).toBe('书x');
    expect(C.cleanText('访问 hetushu.com 。 继续')).toBe('访问。 继续');
    expect(C.cleanText('甲； hetushu乙')).toBe('甲； 乙');
    expect(C.cleanText('HeTuShu.COM')).toBe('');
  });

  it('watermark: dạng full-width / dấu • / https lẫn chữ, tên site chữ Hán, dòng đầu trang', () => {
    expect(C.cleanText('前文ｍ•ｈｅtｕshu.cｏm.cｏm后文')).toBe('前文后文');
    expect(C.cleanText('前文ｈｔtps://ｍ•ｈｅｔｕshｕ.ｃｏm.ｃｏｍ后文')).toBe('前文后文');
    expect(C.cleanText('前文m.ｈｅｔｕshｕ.cｏｍ•cｏm后文')).toBe('前文后文');
    expect(C.cleanText('老老和图书实实')).toBe('老老实实');
    expect(C.cleanText('他去了和图书馆')).toBe('他去了和图书馆');
    expect(C.cleanText('某某书名免费在线阅读 · 1/2451')).toBe('');
    expect(C.cleanText('这一句话里正常提到免费在线阅读的人')).toBe('这一句话里正常提到免费在线阅读的人');
  });

  it('bỏ đoạn lặp dài trong cùng chương, giữ đoạn ngắn lặp', () => {
    const a = `${HAN}甲`;
    const out = C.dedupeBlocks([{ tag: 'p', text: a }, { tag: 'p', text: '……' }, { tag: 'p', text: a }, { tag: 'p', text: '……' }, { tag: 'h2', text: a }]);
    expect(out.map((b: { text: string }) => b.text)).toEqual([a, '……', '……', a]);
  });

  it('trích chương áp dụng quy trình dọn; bỏ đoạn chỉ chứa link', () => {
    const d = doc(`<h1>第1章 开始</h1><div id="content"><p>${HAN} 一 https://www.hetushu.com/</p><p>https://www.hetushu.com/</p><p>www. hetushu .com</p></div>`);
    const p = C.extractPage(d, 'http://s/1.html');
    expect(p.paragraphs).toEqual([`${HAN}一`]);
  });

  it('EPUB: xuất (có bìa, URL gốc) → nhập lại đúng thứ tự, tiêu đề, khối, bìa', async () => {
    const cover = { mime: 'image/png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) };
    const bytes = C.buildEpub({
      title: '书 & <名>', bookKey: 'https://x.test/b/', cover,
      chapters: [
        { url: 'https://x.test/b/1.html', title: '第1章 开始', blocks: [{ tag: 'h2', text: '小节' }, { tag: 'p', text: HAN }] },
        { url: 'https://x.test/b/2.html', title: '第2章', paragraphs: [`${HAN}二`, '二 hetushu.com 三'] },
      ],
    });
    const back = await C.parseEpub(bytes);
    expect(back.title).toBe('书 & <名>');
    expect(back.cover.mime).toBe('image/png');
    expect([...back.cover.data]).toEqual([...cover.data]);
    expect(back.chapters.map((c: { url: string; title: string }) => [c.url, c.title])).toEqual([['https://x.test/b/1.html', '第1章 开始'], ['https://x.test/b/2.html', '第2章']]);
    expect(back.chapters[0].blocks).toEqual([{ tag: 'h2', text: '小节' }, { tag: 'p', text: HAN }]);
    expect(back.chapters[1].paragraphs).toEqual([`${HAN}二`, '二三']);
  });

  it('EPUB: đọc file nén deflate từ trình tạo khác, không có URL gốc, bỏ qua nav', async () => {
    const z = new JSZip();
    z.file('mimetype', 'application/epub+zip');
    z.file('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    z.file('OPS/book.opf', '<package xmlns="http://www.idpf.org/2005/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>外书</dc:title></metadata><manifest><item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="a" href="t/a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="n"/><itemref idref="a"/></spine></package>');
    z.file('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><ol><li>x</li></ol></nav></body></html>');
    z.file('OPS/t/a.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>T</title></head><body><h2>第一章</h2><p>${HAN} 甲</p><p>乙<br/>丙</p></body></html>`);
    const bytes = new Uint8Array(await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
    const back = await C.parseEpub(bytes);
    expect(back.title).toBe('外书');
    expect(back.cover).toBeNull();
    expect(back.chapters).toHaveLength(1);
    expect(back.chapters[0]).toMatchObject({ url: '', title: '第一章', paragraphs: [`${HAN}甲`, '乙', '丙'] });
    await expect(C.parseEpub(new Uint8Array([1, 2, 3]))).rejects.toThrow('ZIP');
  });

  it('EPUB xuất ra mở được bằng trình đọc ZIP chuẩn (mimetype đứng đầu)', async () => {
    const bytes = C.buildEpub({ title: 'T', chapters: [{ url: 'u', title: 'C', paragraphs: ['x'] }] });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip');
    expect(await zip.file('OEBPS/ch0001.xhtml')!.async('string')).toContain('data-hn-url="u"');
  });
});
