import JSZip from 'jszip';
import type { BookFileSystemStore } from '../../services/storage/BookFileSystemStore';
import type { BookMetadata } from '../../services/storage/types';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
/** Dọn ký tự thừa: ký tự điều khiển/zero-width, khoảng trắng lặp. */
const tidyText = (s: string) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b-\u200d\u2060\ufeff]/g, '').replace(/[ \t\u00a0\u3000]+/g, ' ').trim();
const ALLOWED_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const fname = (i: number) => `chapter-${String(i).padStart(4, '0')}.xhtml`;

/** XHTML tối giản: chỉ p/h1–h6, không thuộc tính, bỏ khối rỗng và tiêu đề lặp. */
export function chapterXhtml(title: string, blocks: Array<{ tag: string; text: string }>): string {
  const t = tidyText(title);
  const body = blocks
    .map((b) => ({ tag: ALLOWED_TAGS.has(b.tag) ? b.tag : 'p', text: tidyText(b.text) }))
    .filter((b, i) => b.text && !(i === 0 && b.text === t))
    .map((b) => `<${b.tag}>${esc(b.text)}</${b.tag}>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(t)}</title><link rel="stylesheet" href="styles.css"/></head><body><h2>${esc(t)}</h2>${body}</body></html>`;
}

/** Đọc lần lượt từng file chương rồi đóng gói EPUB văn bản thuần. */
export async function buildEpubBlob(book: BookMetadata, files: BookFileSystemStore): Promise<Blob> {
  const lang = book.language === 'vi' ? 'vi' : 'zh-CN';
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/styles.css', 'body{line-height:1.8;font-family:serif}p{text-indent:2em;margin:.4em 0}');

  const written: Array<{ index: number; title: string }> = [];
  for (const ch of book.chapters) {
    const c = await files.readChapterFile(book.bookId, ch.index);
    if (!c) continue;
    zip.file(`OEBPS/${fname(c.index)}`,
      chapterXhtml(c.title, c.blocks ?? c.paragraphs.map((text) => ({ tag: 'p' as const, text }))));
    written.push({ index: c.index, title: c.title });
  }
  // Spine rỗng làm Calibre báo "Spineless"; thà báo lỗi rõ ràng còn hơn xuất file hỏng.
  if (written.length === 0) throw new Error('Không có chương nào đọc được để xuất EPUB.');
  const id = `urn:hoangu:${book.bookId}`;
  zip.file('OEBPS/content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(book.title)}</dc:title>${book.author ? `<dc:creator>${esc(book.author)}</dc:creator>` : ''}<dc:language>${lang}</dc:language><dc:identifier id="id">${esc(id)}</dc:identifier></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="styles.css" media-type="text/css"/>${written.map((w) => `<item id="c${w.index}" href="${fname(w.index)}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine toc="ncx">${written.map((w) => `<itemref idref="c${w.index}"/>`).join('')}</spine></package>`);
  zip.file('OEBPS/toc.ncx',
    `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${esc(id)}"/></head><docTitle><text>${esc(book.title)}</text></docTitle><navMap>${written.map((w, i) => `<navPoint id="n${w.index}" playOrder="${i + 1}"><navLabel><text>${esc(w.title)}</text></navLabel><content src="${fname(w.index)}"/></navPoint>`).join('')}</navMap></ncx>`);
  // JSZip mặc định không nén (STORE) — nén DEFLATE; riêng mimetype giữ STORE theo chuẩn EPUB.
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

export function triggerEpubDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.epub') ? filename : `${filename}.epub`;
  a.click();
  URL.revokeObjectURL(url);
}
