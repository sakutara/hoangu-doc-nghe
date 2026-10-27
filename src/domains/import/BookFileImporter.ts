import { chapterFileName, type BookFileSystemStore } from '../../services/storage/BookFileSystemStore';
import type { BookMetadata } from '../../services/storage/types';
import { importEpub } from '../epub/EpubPlainImporter';
import { sanitizeHtmlToPlainText } from '../epub/PlainTextSanitizer';

/** Số đoạn tối đa cho một “phần” khi file không có tiêu đề chương — giữ RAM khi đọc lazy. */
const PART_SIZE = 200;

/** Tiêu đề chương nhận dạng được: 第X章/节/回…, Chapter N, Chương N (dòng ngắn). */
const CHAPTER_HEADING = /^(第[\d零〇一二三四五六七八九十百千万两]+[章节回卷部集篇]|chapter\s+\d+|chương\s+\d+)/i;

export interface PlainChapter { title: string; paragraphs: string[] }

const SUPPORTED = ['epub', 'pdf', 'docx', 'txt', 'md', 'html', 'htm'];

function extensionOf(name: string): string {
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
}

/** UTF-8 trước; nếu không hợp lệ thì thử GB18030 (truyện tiếng Hoa hay lưu theo GBK). */
export function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030').decode(bytes);
  }
}

/** Tách dòng văn bản thành các đoạn, bỏ dòng trống. */
export function toParagraphs(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.replace(/[ \t　]+/g, ' ').trim()).filter((l) => l.length > 0);
}

/**
 * Chia đoạn thành chương: theo dòng tiêu đề nhận dạng được; không có thì chia từng phần `PART_SIZE` đoạn.
 * Đoạn đứng trước chương đầu tiên thành chương “Mở đầu”.
 */
export function splitIntoChapters(paragraphs: string[], fallbackTitle: string): PlainChapter[] {
  const starts = paragraphs.flatMap((p, i) => (p.length <= 40 && CHAPTER_HEADING.test(p) ? [i] : []));
  if (starts.length === 0) {
    if (paragraphs.length <= PART_SIZE) return [{ title: fallbackTitle, paragraphs }];
    const parts: PlainChapter[] = [];
    for (let i = 0; i < paragraphs.length; i += PART_SIZE) {
      parts.push({ title: `Phần ${parts.length + 1}`, paragraphs: paragraphs.slice(i, i + PART_SIZE) });
    }
    return parts;
  }
  const chapters: PlainChapter[] = [];
  if (starts[0] > 0) chapters.push({ title: 'Mở đầu', paragraphs: paragraphs.slice(0, starts[0]) });
  starts.forEach((s, k) => {
    const end = starts[k + 1] ?? paragraphs.length;
    // Dòng tiêu đề là chương đầu tiên luôn giữ lại làm tên; các đoạn sau là nội dung.
    chapters.push({ title: paragraphs[s], paragraphs: paragraphs.slice(s + 1, end) });
  });
  return chapters.filter((c) => c.paragraphs.length > 0);
}

/** Đọc text layer của PDF (file scan không có chữ sẽ báo lỗi). Tải pdf.js khi cần để không nặng bundle. */
export async function extractPdfLines(bytes: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  const lines: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let line = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) { lines.push(line); line = ''; }
      }
      if (line) lines.push(line);
    }
  } finally {
    await task.destroy();
  }
  return lines.map((l) => l.trim()).filter((l) => l.length > 0);
}

/** Lấy văn bản thuần từ .docx (mammoth). */
async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ arrayBuffer: bytes });
  return value;
}

/** Ghi các chương ra file và trả về metadata sách (dùng chung cho mọi định dạng không phải epub). */
async function writeBook(
  bookId: string, title: string, chapters: PlainChapter[], files: BookFileSystemStore,
): Promise<BookMetadata> {
  const saved: BookMetadata['chapters'] = [];
  for (const [i, ch] of chapters.entries()) {
    const index = i + 1;
    await files.writeChapterFile(bookId, { index, title: ch.title, paragraphs: ch.paragraphs });
    saved.push({ index, title: ch.title, fileName: chapterFileName(index) });
  }
  return {
    bookId,
    title,
    language: 'zh',
    originType: 'file_upload',
    chapterCount: saved.length,
    chapters: saved,
    lastReadChapterIndex: 1,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Nhập một file sách bất kỳ được hỗ trợ thành truyện trong tủ.
 * Định dạng: .epub, .pdf (có text layer), .docx, .txt/.md, .html/.htm. File .doc (Word cũ) không chuyển được trên trình duyệt.
 */
export async function importBookFile(file: File, bookId: string, files: BookFileSystemStore): Promise<BookMetadata> {
  const ext = extensionOf(file.name);
  if (!SUPPORTED.includes(ext)) {
    throw new Error(`Chưa hỗ trợ “.${ext || '?'}”. Hãy dùng: ${SUPPORTED.map((e) => `.${e}`).join(', ')}`);
  }
  const bytes = await file.arrayBuffer();
  const base = file.name.slice(0, file.name.length - ext.length - 1) || 'Không tên';

  if (ext === 'epub') return importEpub(bytes, bookId, files);

  let chapters: PlainChapter[];
  let title = base;
  if (ext === 'pdf') {
    const lines = await extractPdfLines(bytes);
    if (lines.length === 0) throw new Error('PDF không có lớp chữ (có thể là bản scan ảnh), không chuyển được thành văn bản');
    chapters = splitIntoChapters(lines, base);
  } else if (ext === 'docx') {
    const paragraphs = toParagraphs(await extractDocxText(bytes));
    if (paragraphs.length === 0) throw new Error('File .docx không có nội dung chữ');
    chapters = splitIntoChapters(paragraphs, base);
  } else if (ext === 'html' || ext === 'htm') {
    const parsed = sanitizeHtmlToPlainText(decodeText(bytes));
    title = parsed.title ?? base;
    if (parsed.paragraphs.length === 0) throw new Error('File HTML không có nội dung chữ');
    chapters = splitIntoChapters(parsed.paragraphs, title);
  } else {
    const paragraphs = toParagraphs(decodeText(bytes));
    if (paragraphs.length === 0) throw new Error('File văn bản trống');
    chapters = splitIntoChapters(paragraphs, base);
  }
  return writeBook(bookId, title, chapters, files);
}
