import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { importEpub } from '../src/domains/epub/EpubPlainImporter';
import { buildEpubBlob, chapterXhtml, triggerEpubDownload } from '../src/domains/epub/EpubExporter';
import { importBookFile } from '../src/domains/import/BookFileImporter';
import { expectValidEpub } from './epubValidate';
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


describe('EPUB export', () => {
  it('round trip: nhập → xuất → nhập lại', async () => {
    const s = testServices();
    const book = await importEpub(await makeEpub(), 'b3', s.files);
    const blob = await buildEpubBlob({ ...book, chapters: [...book.chapters, { index: 99, title: 'x', fileName: 'x' }] }, s.files);
    expect(blob.type).toBe('application/epub+zip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/toc.ncx', 'OEBPS/chapter-0001.xhtml']));
    // Namespace OPF đúng là 2007; 2005 làm Calibre báo "Book is empty, no content in spine".
    expect(await zip.file('OEBPS/content.opf')!.async('string')).toContain('<package xmlns="http://www.idpf.org/2007/opf"');
    await expectValidEpub(blob);
    const again = await importEpub(await blob.arrayBuffer(), 'b4', s.files);
    expect(again.chapterCount).toBe(2);
    expect((await s.files.readChapterFile('b4', 1))!.title).toBe('第一章 开始');
    const vi = await buildEpubBlob({ ...book, language: 'vi' }, s.files);
    expect(await (await JSZip.loadAsync(await vi.arrayBuffer())).file('OEBPS/content.opf')!.async('string')).toContain('<dc:language>vi');
  });

  it('chapterXhtml: dọn thẻ/ký tự thừa, bỏ khối rỗng và tiêu đề lặp', () => {
    const x = chapterXhtml(' 第一章 ', [
      { tag: 'h2', text: '第一章' }, { tag: 'p', text: '  你\u200b好   世界\ufeff ' }, { tag: 'p', text: ' \u200b ' }, { tag: 'div', text: '甲' },
    ]);
    expect(x).toContain('<body><h2>第一章</h2><p>你好 世界</p><p>甲</p></body>');
    expect(x.match(/第一章/g)).toHaveLength(2);
  });

  it('upload .txt rồi xuất epub: spine có đủ chương (Calibre không báo Spineless)', async () => {
    const s = testServices();
    const bytes = new TextEncoder().encode('序\n第一章 起\n他来了\n第二章 承\n她走了\n');
    const file = { name: 'Truyện.txt', arrayBuffer: async () => bytes.buffer } as unknown as File;
    const book = await importBookFile(file, 'u1', s.files);
    const zip = await expectValidEpub(await buildEpubBlob(book, s.files));
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf.match(/<itemref /g)).toHaveLength(book.chapterCount);
  });

  it('không đọc được chương nào → báo lỗi thay vì xuất EPUB spine rỗng', async () => {
    const s = testServices();
    const book = await importEpub(await makeEpub(), 'b6', s.files);
    await expect(buildEpubBlob({ ...book, chapters: [{ index: 99, title: 'x', fileName: 'x' }] }, s.files)).rejects.toThrow('Không có chương nào');
    await expect(buildEpubBlob({ ...book, chapters: [] }, s.files)).rejects.toThrow('Không có chương nào');
  });

  it('upload epub cũ mang namespace OPF 2005 (lỗi Calibre) rồi xuất lại → hợp lệ', async () => {
    const z = new JSZip();
    z.file('mimetype', 'application/epub+zip');
    z.file('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    z.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2005/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">x</dc:identifier><dc:title>Vớt thi nhân</dc:title><dc:creator>Thuần Khiết</dc:creator></metadata><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>');
    z.file('OEBPS/ch1.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chương 1</h1><p>Lũ ranh con kia.</p></body></html>');
    const s = testServices();
    const book = await importBookFile({ name: 'cu.epub', arrayBuffer: async () => await z.generateAsync({ type: 'arraybuffer' }) } as unknown as File, 'old1', s.files);
    expect(book.chapterCount).toBe(1);
    expect(book.title).toBe('Vớt thi nhân');
    const zip = await expectValidEpub(await buildEpubBlob(book, s.files));
    expect(await zip.file('OEBPS/content.opf')!.async('string')).not.toContain('idpf.org/2005/opf');
  });

  it('xuất epub nén DEFLATE, mimetype giữ STORE, không có creator rỗng', async () => {
    const s = testServices();
    const book = await importEpub(await makeEpub(), 'b5', s.files);
    const blob = await buildEpubBlob({ ...book, author: undefined }, s.files);
    const raw = new Uint8Array(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(raw);
    expect(await zip.file('OEBPS/content.opf')!.async('string')).not.toContain('<dc:creator>');
    expect((zip.file('mimetype') as any)._data.compression.magic).toBe('\x00\x00');
    expect((zip.file('OEBPS/toc.ncx') as any)._data.compression.magic).toBe('\x08\x00');
  });

  it('triggerEpubDownload', () => {
    const click = vi_click();
    (URL as any).createObjectURL = () => 'blob:x';
    (URL as any).revokeObjectURL = () => {};
    triggerEpubDownload(new Blob(['x']), 'a');
    triggerEpubDownload(new Blob(['x']), 'b.epub');
    expect(click.names).toEqual(['a.epub', 'b.epub']);
    click.restore();
  });
});

function vi_click() {
  const names: string[] = [];
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { names.push(this.download); };
  return { names, restore: () => { HTMLAnchorElement.prototype.click = orig; } };
}
