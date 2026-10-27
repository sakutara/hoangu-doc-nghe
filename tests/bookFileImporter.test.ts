import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { importBookFile, decodeText, splitIntoChapters, toParagraphs } from '../src/domains/import/BookFileImporter';
import { importEpub } from '../src/domains/epub/EpubPlainImporter';
import { testServices } from './helpers';

const fakeFile = (name: string, bytes: Uint8Array) =>
  ({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }) as unknown as File;

describe('splitIntoChapters', () => {
  it('nhận tiêu đề 第X章 / Chương N, phần trước chương đầu là “Mở đầu”', () => {
    const r = splitIntoChapters(['lời tựa', '第一章 开始', 'a', 'b', 'Chương 2', 'c', '第二回 续', '第三回 空'], 'x');
    expect(r.map((c) => c.title)).toEqual(['Mở đầu', '第一章 开始', 'Chương 2']);
    expect(r[1].paragraphs).toEqual(['a', 'b']);
  });

  it('không có tiêu đề: một chương theo tên file, quá dài thì chia phần', () => {
    expect(splitIntoChapters(['x', 'y'], 'Sách')).toEqual([{ title: 'Sách', paragraphs: ['x', 'y'] }]);
    const long = Array.from({ length: 401 }, (_, i) => `đoạn ${i}`);
    const parts = splitIntoChapters(long, 'Sách');
    expect(parts.map((p) => p.title)).toEqual(['Phần 1', 'Phần 2', 'Phần 3']);
    expect(parts[2].paragraphs).toHaveLength(1);
  });

  it('dòng dài không phải tiêu đề không bị coi là chương', () => {
    const body = '第一章 ' + 'x'.repeat(50);
    expect(splitIntoChapters([body, 'y'], 'S')).toEqual([{ title: 'S', paragraphs: [body, 'y'] }]);
  });
});

describe('decodeText / toParagraphs', () => {
  it('giải mã UTF-8, lùi về GB18030 khi không hợp lệ', () => {
    expect(decodeText(new TextEncoder().encode('你好').buffer)).toBe('你好');
    const gbk = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]); // 你好 trong GBK
    expect(decodeText(gbk.buffer)).toBe('你好');
  });

  it('bỏ dòng trống, chuẩn hoá khoảng trắng', () => {
    expect(toParagraphs('  a \r\n\n\t b　c \n')).toEqual(['a', 'b c']);
  });
});

describe('importBookFile', () => {
  it('txt: nhận tiêu đề chương, lưu mỗi chương một file', async () => {
    const s = testServices();
    const text = '序\n第一章 起\n他来了\n第二章 承\n她走了\n';
    const book = await importBookFile(fakeFile('Truyện.txt', new TextEncoder().encode(text)), 't1', s.files);
    expect(book.title).toBe('Truyện');
    expect(book.originType).toBe('file_upload');
    expect(book.chapters.map((c) => c.title)).toEqual(['Mở đầu', '第一章 起', '第二章 承']);
    expect(book.chapterCount).toBe(3);
    expect((await s.files.readChapterFile('t1', 2))!.paragraphs).toEqual(['他来了']);
    await s.library.saveBook(book);
    expect(await s.library.listAllBooks()).toHaveLength(1);
  });

  it('md và html đều được chuyển thành văn bản thuần', async () => {
    const s = testServices();
    const md = await importBookFile(fakeFile('a.md', new TextEncoder().encode('# 标题\n正文')), 'm1', s.files);
    expect(md.chapterCount).toBe(1);
    const html = await importBookFile(fakeFile('b.html', new TextEncoder().encode('<title>Tên</title><p>x &amp; y</p>')), 'h1', s.files);
    expect(html.title).toBe('Tên');
    expect((await s.files.readChapterFile('h1', 1))!.paragraphs).toEqual(['x & y']);
  });

  it('báo lỗi cho định dạng chưa hỗ trợ (.doc) và file trống', async () => {
    const s = testServices();
    await expect(importBookFile(fakeFile('cu.doc', new Uint8Array([1])), 'd', s.files)).rejects.toThrow('.doc');
    await expect(importBookFile(fakeFile('trong.txt', new TextEncoder().encode('  \n ')), 'e', s.files)).rejects.toThrow('trống');
  });
});

describe('mục lục EPUB', () => {
  it('lấy tên chương từ nav EPUB3 và NCX khi có', async () => {
    const z = new JSZip();
    z.file('META-INF/container.xml', '<rootfile full-path="OEBPS/content.opf"/>');
    z.file('OEBPS/content.opf', `<package><metadata><dc:title>T</dc:title></metadata>
      <manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>
      <item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/>
      <item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`);
    z.file('OEBPS/nav.xhtml', '<html><body><nav epub:type="toc"><ol><li><a href="text/c1.xhtml#s1">第一卷 &amp; 起</a></li><li><a href="text/c2.xhtml">第二卷</a></li></ol></nav></body></html>');
    z.file('OEBPS/text/c1.xhtml', '<html><body><p>一</p></body></html>');
    z.file('OEBPS/text/c2.xhtml', '<html><body><h1>旧标题</h1><p>二</p></body></html>');
    const s = testServices();
    const book = await importEpub(await z.generateAsync({ type: 'uint8array' }), 'n1', s.files);
    expect(book.chapters.map((c) => c.title)).toEqual(['第一卷 & 起', '第二卷']);
  });

  it('lấy tên chương từ NCX (EPUB2)', async () => {
    const z = new JSZip();
    z.file('META-INF/container.xml', '<rootfile full-path="a.opf"/>');
    z.file('a.opf', `<package><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      <item id="c" href="c.html" media-type="text/html"/></manifest><spine toc="ncx"><itemref idref="c"/></spine></package>`);
    z.file('toc.ncx', '<ncx><navMap><navPoint id="p1"><navLabel><text>Mục lục NCX</text></navLabel><content src="c.html"/></navPoint></navMap></ncx>');
    z.file('c.html', '<p>内容</p>');
    const s = testServices();
    const book = await importEpub(await z.generateAsync({ type: 'uint8array' }), 'n2', s.files);
    expect(book.chapters[0].title).toBe('Mục lục NCX');
  });
});
