import type { BookFileSystemStore, ChapterFileContent } from '../../services/storage/BookFileSystemStore';
import type { BookMetadata } from '../../services/storage/types';

const URL_CHARS = "A-Za-z0-9\\-._~:/?#@!$&'*+,;=%\\[\\]()";
/** Link bị trang nguồn chèn vào nội dung (vd. https://www.hetushu.com/) và tên miền hetushu.com trần. Chỉ ăn ký tự ASCII của URL nên không nuốt chữ Hán liền sau. */
const INJECTED_LINK_RE = new RegExp(`(?:https?://[${URL_CHARS}]+|(?:www\\.)?hetushu\\.com(?:/[${URL_CHARS}]*)?)`, 'gi');

/** Bỏ link chèn vào văn bản; trả chuỗi rỗng nếu chỉ còn khoảng trắng. */
export function stripInjectedLinks(text: string): string {
  const clean = text.replace(INJECTED_LINK_RE, '');
  return (clean === text ? text : clean.replace(/[ \t\u3000]{2,}/g, ' ')).trim();
}


export interface CleanResult { changed: number; removed: number }

/** Lọc lại mọi chương đã lưu của một truyện: ghi lại chương có link bị chèn, bỏ đoạn chỉ chứa link. */
export async function cleanStoredBook(book: BookMetadata, files: BookFileSystemStore): Promise<CleanResult> {
  let changed = 0;
  let removed = 0;
  for (const ch of book.chapters) {
    const c = await files.readChapterFile(book.bookId, ch.index);
    if (!c) continue;
    const blocks = (c.blocks ?? c.paragraphs.map((text) => ({ tag: 'p' as const, text })))
      .map((b) => ({ tag: b.tag, text: stripInjectedLinks(b.text) }));
    const kept = blocks.filter((b) => b.text.length > 0);
    const title = stripInjectedLinks(c.title) || c.title;
    if (title === c.title && kept.length === c.paragraphs.length && kept.every((b, i) => b.text === c.paragraphs[i])) continue;
    removed += c.paragraphs.length - kept.length;
    const out: ChapterFileContent = { index: c.index, title, paragraphs: kept.map((b) => b.text) };
    if (kept.some((b) => b.tag !== 'p')) out.blocks = kept;
    await files.writeChapterFile(book.bookId, out);
    changed += 1;
  }
  return { changed, removed };
}
