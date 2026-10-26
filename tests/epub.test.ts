import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { sanitizeHtmlToPlainText } from '../src/domains/epub/PlainTextSanitizer';
import { importEpub } from '../src/domains/epub/EpubPlainImporter';
import { testServices } from './helpers';

async function makeEpub(extra = true) {
  const z = new JSZip();
  z.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
  z.file('OEBPS/content.opf', `<package><metadata><dc:title>凡人修仙传</dc:title><dc:creator>忘语</dc:creator></metadata>
    <manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/../ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="img" href="cover.jpg" media-type="image/jpeg"/><item id="css" href="s.css" media-type="text/css"/><item id="c3" href="missing.xhtml" media-type="application/xhtml+xml"/><item id="c4" href="empty.xhtml" media-type="application/xhtml+xml"/><item bad="x"/></manifest>
    <spine><itemref idref="c1"/><itemref idref="img"/><itemref idref="css"/><itemref idref="c2"/><itemref idref="c3"/><itemref idref="c4"/><itemref idref="nope"/></spine></package>`);
  z.file('OEBPS/ch1.xhtml', '<html><head><style>p{}</style></head><body><h1>第一章 开始</h1><p>他说&nbsp;你好&amp;再见</p><img src="a.png"/><svg><text>x</text></svg><p>&#20320;&#x597d;</p></body></html>');
  z.file('OEBPS/ch2.xhtml', '<html><body><p>第二段<br/>换行</p></body></html>');
  z.file('OEBPS/empty.xhtml', '<html><body><img src="x"/></body></html>');
  if (extra) { z.file('OEBPS/cover.jpg', 'BINARY'); z.file('OEBPS/s.css', 'p{}'); }
  return z.generateAsync({ type: 'uint8array' });
}

describe('PlainTextSanitizer', () => {
  it('bỏ ảnh/css/thẻ, giải mã entity', () => {
    const r = sanitizeHtmlToPlainText('<title>T</title><style>a</style><h2>Tiêu <b>đề</b></h2><p>A&nbsp;&lt;b&gt;&quot;</p><img src=x><p> </p><p>&unknown;</p>');
    expect(r.title).toBe('Tiêu đề');
    expect(r.paragraphs).toEqual(['Tiêu đề', 'A <b>"', '&unknown;']);
    expect(sanitizeHtmlToPlainText('<title>Only</title><p>x</p>').title).toBe('Only');
    expect(sanitizeHtmlToPlainText('<p>x</p>').title).toBeUndefined();
    expect(sanitizeHtmlToPlainText('<h1> </h1><p>x</p>').title).toBeUndefined();
  });
});

describe('EPUB import / library / export', () => {
  it('nhập epub: bỏ ảnh/css, mỗi chương 1 file', async () => {
    const s = testServices();
    const book = await importEpub(await makeEpub(), 'b1', s.files);
    expect(book.title).toBe('凡人修仙传');
    expect(book.author).toBe('忘语');
    expect(book.chapterCount).toBe(2);
    expect(await s.files.listChapterFiles('b1')).toEqual(['chapter-0001.txt', 'chapter-0002.txt']);
    const c1 = await s.files.readChapterFile('b1', 1);
    expect(c1!.title).toBe('第一章 开始');
    expect(c1!.paragraphs.join('')).toContain('他说 你好&再见');
    expect(c1!.paragraphs).not.toContain('第一章 开始');
    expect(c1!.paragraphs.join('')).not.toContain('<');
    expect((await s.files.readChapterFile('b1', 2))!.title).toBe('Chương 2');
  });

  it('epub hỏng báo lỗi', async () => {
    const s = testServices();
    const z1 = new JSZip();
    await expect(importEpub(await z1.generateAsync({ type: 'uint8array' }), 'x', s.files)).rejects.toThrow('container');
    z1.file('META-INF/container.xml', '<rootfile full-path="a.opf"/>');
    await expect(importEpub(await z1.generateAsync({ type: 'uint8array' }), 'x', s.files)).rejects.toThrow('OPF');
    z1.file('a.opf', '<package><manifest></manifest><spine></spine></package>');
    await expect(importEpub(await z1.generateAsync({ type: 'uint8array' }), 'x', s.files)).rejects.toThrow('chương');
  });

  it('opf không có title → "Không tên"; xóa truyện sạch cả DB lẫn file', async () => {
    const s = testServices();
    const z = new JSZip();
    z.file('META-INF/container.xml', '<rootfile full-path="a.opf"/>');
    z.file('a.opf', '<package><manifest><item id="c" href="c.html" media-type="text/html"/></manifest><spine><itemref idref="c"/></spine></package>');
    z.file('c.html', '<p>内容</p>');
    const book = await importEpub(await z.generateAsync({ type: 'uint8array' }), 'b2', s.files);
    expect(book.title).toBe('Không tên');
    await s.library.saveBook(book);
    await s.meta.put('crawl_jobs', 'j1', { jobId: 'j1', bookId: 'b2' });
    await s.meta.put('crawl_jobs', 'j2', { jobId: 'j2', bookId: 'other' });
    await s.meta.put('translation_jobs', 't1', { jobId: 't1', sourceBookId: 'b2', targetBookId: 'b2-vi' });
    await s.meta.put('translation_jobs', 't2', { jobId: 't2', sourceBookId: 'o', targetBookId: 'o-vi' });
    expect(await s.library.listAllBooks()).toHaveLength(1);
    await s.library.deleteBookCompletely('b2');
    expect(await s.library.listAllBooks()).toEqual([]);
    expect(await s.files.listChapterFiles('b2')).toEqual([]);
    expect((await s.meta.list('crawl_jobs')).length).toBe(1);
    expect((await s.meta.list('translation_jobs')).length).toBe(1);
  });
});
