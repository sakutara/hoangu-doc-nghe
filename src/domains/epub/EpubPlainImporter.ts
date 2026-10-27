import JSZip from 'jszip';
import type { BookFileSystemStore } from '../../services/storage/BookFileSystemStore';
import { chapterFileName } from '../../services/storage/BookFileSystemStore';
import type { BookMetadata } from '../../services/storage/types';
import { sanitizeHtmlToPlainText } from './PlainTextSanitizer';

const tag = (xml: string, name: string) =>
  new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml)?.[1].trim();

function resolvePath(base: string, href: string): string {
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const parts = (dir + decodeURIComponent(href.split('#')[0])).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

type ManifestItem = { href: string; type: string; props: string };

/** Đọc mục lục (EPUB3 nav hoặc EPUB2 NCX) → tên chương theo đường dẫn file. File đầu tiên trong mục lục thắng. */
async function readToc(zip: JSZip, opfPath: string, manifest: Map<string, ManifestItem>): Promise<Map<string, string>> {
  const toc = new Map<string, string>();
  const add = (base: string, href: string, label: string) => {
    const path = resolvePath(base, href);
    const title = sanitizeHtmlToPlainText(`<p>${label}</p>`).paragraphs[0];
    if (path && title && !toc.has(path)) toc.set(path, title);
  };
  const items = [...manifest.values()];
  const nav = items.find((i) => /\bnav\b/.test(i.props));
  const ncx = items.find((i) => i.type === 'application/x-dtbncx+xml');
  if (nav) {
    const navPath = resolvePath(opfPath, nav.href);
    const doc = await zip.file(navPath)?.async('string');
    const body = doc && (/<nav\b[^>]*toc[^>]*>([\s\S]*?)<\/nav>/i.exec(doc)?.[1] ?? doc);
    for (const a of body?.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi) ?? []) add(navPath, a[1], a[2]);
  } else if (ncx) {
    const ncxPath = resolvePath(opfPath, ncx.href);
    const doc = await zip.file(ncxPath)?.async('string');
    for (const p of doc?.matchAll(/<navPoint\b[^>]*>\s*<navLabel>\s*<text>([\s\S]*?)<\/text>\s*<\/navLabel>\s*<content\b[^>]*src="([^"]+)"/gi) ?? []) {
      add(ncxPath, p[2], p[1]);
    }
  }
  return toc;
}

export async function importEpub(
  buffer: ArrayBuffer | Uint8Array, bookId: string, files: BookFileSystemStore,
): Promise<BookMetadata> {
  const zip = await JSZip.loadAsync(buffer);
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = container && /full-path="([^"]+)"/.exec(container)?.[1];
  if (!opfPath) throw new Error('EPUB không hợp lệ: thiếu container.xml/OPF');
  const opf = await zip.file(opfPath)?.async('string');
  if (!opf) throw new Error('EPUB không hợp lệ: không đọc được OPF');

  const manifest = new Map<string, ManifestItem>();
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = /\bid="([^"]+)"/.exec(m[0])?.[1];
    const href = /\bhref="([^"]+)"/.exec(m[0])?.[1];
    const type = /media-type="([^"]+)"/.exec(m[0])?.[1] ?? '';
    const props = /properties="([^"]+)"/.exec(m[0])?.[1] ?? '';
    if (id && href) manifest.set(id, { href, type, props });
  }
  const toc = await readToc(zip, opfPath, manifest);

  const chapters: BookMetadata['chapters'] = [];
  let index = 0;
  for (const ref of opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/gi)) {
    const item = manifest.get(ref[1]);
    if (!item || !/xhtml|html/.test(item.type)) continue; // bỏ ảnh/css/font
    const path = resolvePath(opfPath, item.href);
    const html = await zip.file(path)?.async('string');
    if (!html) continue;
    const { title, paragraphs } = sanitizeHtmlToPlainText(html);
    if (title && paragraphs[0] === title) paragraphs.shift(); // tiêu đề đã nằm ở dòng đầu file
    if (paragraphs.length === 0) continue;
    index += 1;
    // Ưu tiên tên trong mục lục của EPUB, rồi tới thẻ tiêu đề trong file.
    const chTitle = toc.get(path) ?? title ?? `Chương ${index}`;
    await files.writeChapterFile(bookId, { index, title: chTitle, paragraphs });
    chapters.push({ index, title: chTitle, fileName: chapterFileName(index) });
  }
  if (index === 0) throw new Error('EPUB không có chương văn bản nào');

  return {
    bookId,
    title: tag(opf, 'dc:title') ?? 'Không tên',
    author: tag(opf, 'dc:creator'),
    language: 'zh',
    originType: 'epub_upload',
    chapterCount: index,
    chapters,
    lastReadChapterIndex: 1,
    createdAt: new Date().toISOString(),
  };
}
