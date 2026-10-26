import type { BookFileSystemStore } from '../../../services/storage/BookFileSystemStore';
import { chapterFileName } from '../../../services/storage/BookFileSystemStore';
import { stripInjectedLinks } from '../stripInjectedLinks';
import type { BookMetadata, IMetaStore } from '../../../services/storage/types';

/** Gói `hoangu-capture/1` do extension trình duyệt (thư mục `extension/`) xuất ra. */
export type CapturedTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p';
/** Khối nội dung giữ nguyên loại thẻ: tiêu đề (h1–h6) hoặc đoạn văn (p; mỗi div/dòng văn bản → một p). */
export interface CapturedBlock { tag: CapturedTag; text: string }
/** `paragraphs` = văn bản của mọi khối (tương thích gói cũ); `blocks` giữ thêm loại thẻ. */
export interface CapturedChapter { url: string; title: string; paragraphs: string[]; blocks?: CapturedBlock[] }

export interface CaptureBundle {
  format: 'hoangu-capture/1';
  bookTitle: string;
  sourceOrigin: string;
  bookKey: string;
  capturedAt: string;
  chapters: CapturedChapter[];
  nextUrl?: string;
}

const TAGS: readonly string[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'];

const MAX_CHAPTERS = 5000;
const MAX_PARAGRAPHS = 5000;

export function parseCaptureBundle(text: string): CaptureBundle {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('File không phải JSON hợp lệ.'); }
  const o = raw as Partial<CaptureBundle> | null;
  if (!o || typeof o !== 'object' || o.format !== 'hoangu-capture/1') throw new Error('Không phải gói tải của HoaNgữ (sai format).');
  if (typeof o.bookKey !== 'string' || !o.bookKey) throw new Error('Gói thiếu bookKey.');
  if (!Array.isArray(o.chapters)) throw new Error('Gói thiếu danh sách chương.');
  if (o.chapters.length > MAX_CHAPTERS) throw new Error(`Gói có quá nhiều chương (>${MAX_CHAPTERS}).`);
  const chapters: CapturedChapter[] = [];
  for (const c of o.chapters as Array<Partial<CapturedChapter>>) {
    if (!c || typeof c.url !== 'string' || (!Array.isArray(c.paragraphs) && !Array.isArray(c.blocks))) throw new Error('Chương trong gói sai cấu trúc.');
    const title = typeof c.title === 'string' ? stripInjectedLinks(c.title) : '';
    // Gói mới: `blocks` có thẻ h1–h6/p. Gói cũ: chỉ `paragraphs` → toàn bộ là p.
    const blocks: CapturedBlock[] = Array.isArray(c.blocks)
      ? (c.blocks as Array<Partial<CapturedBlock>>)
        .filter((b) => b && typeof b.text === 'string')
        .map((b) => ({ tag: (TAGS.includes(b.tag as string) ? b.tag : 'p') as CapturedTag, text: stripInjectedLinks(b.text as string) }))
        .filter((b) => b.text.length > 0)
        .slice(0, MAX_PARAGRAPHS)
      : (c.paragraphs ?? []).filter((p): p is string => typeof p === 'string').map(stripInjectedLinks).filter((p) => p.length > 0).slice(0, MAX_PARAGRAPHS)
        .map((text) => ({ tag: 'p' as CapturedTag, text }));
    if (blocks.length === 0) continue;
    const chapter: CapturedChapter = { url: c.url, title, paragraphs: blocks.map((b) => b.text) };
    if (blocks.some((b) => b.tag !== 'p')) chapter.blocks = blocks;
    chapters.push(chapter);
  }
  return {
    format: 'hoangu-capture/1',
    bookTitle: typeof o.bookTitle === 'string' && o.bookTitle.trim() ? o.bookTitle.trim() : 'Truyện',
    sourceOrigin: typeof o.sourceOrigin === 'string' ? o.sourceOrigin : '',
    bookKey: o.bookKey,
    capturedAt: typeof o.capturedAt === 'string' ? o.capturedAt : '',
    chapters,
    nextUrl: typeof o.nextUrl === 'string' ? o.nextUrl : undefined,
  };
}

export interface ImportResult { book: BookMetadata; added: number; created: boolean }

export async function importCaptureBundle(
  bundle: CaptureBundle,
  deps: { meta: IMetaStore; files: BookFileSystemStore },
  newBookId: () => string,
  titleOverride?: string,
  targetBookId?: string,
): Promise<ImportResult> {
  const all = await deps.meta.list<BookMetadata>('books_metadata');
  let book = targetBookId
    ? all.find((b) => b.bookId === targetBookId)
    : all.find((b) => b.originType === 'web_crawl' && b.sourceUrl === bundle.bookKey);
  if (targetBookId && !book) throw new Error('Không tìm thấy truyện đích để nối chương.');
  const created = !book;
  if (!book) {
    book = {
      bookId: newBookId(), title: titleOverride?.trim() || bundle.bookTitle, language: 'zh', originType: 'web_crawl',
      sourceUrl: bundle.bookKey, chapterCount: 0, chapters: [], chapterUrls: [], lastReadChapterIndex: 1,
      createdAt: new Date().toISOString(),
    };
  }
  const known = new Set(book.chapterUrls ?? []);
  book.chapterUrls = [...(book.chapterUrls ?? [])];
  // Truyện tạo trước đây (cào/epub) chưa lưu URL chương → bỏ trùng theo tiêu đề.
  const knownTitles = new Set(book.chapterUrls.length < book.chapters.length ? book.chapters.map((c) => c.title) : []);
  book.sourceUrl ??= bundle.bookKey;
  let added = 0;
  for (const ch of bundle.chapters) {
    if (known.has(ch.url) || (ch.title && knownTitles.has(ch.title))) continue;
    const index = book.chapterCount + 1;
    const title = ch.title || `Chương ${index}`;
    await deps.files.writeChapterFile(book.bookId, { index, title, paragraphs: ch.paragraphs, blocks: ch.blocks });
    book.chapters.push({ index, title, fileName: chapterFileName(index) });
    book.chapterUrls.push(ch.url);
    book.chapterCount = index;
    known.add(ch.url);
    added += 1;
  }
  await deps.meta.put('books_metadata', book.bookId, book);
  return { book, added, created };
}
