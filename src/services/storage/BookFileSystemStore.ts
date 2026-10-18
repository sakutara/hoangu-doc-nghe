import type { IFileBackend } from './types';

export type BlockTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p';

/** Khối nội dung có thẻ: tiêu đề (h1–h6) hoặc đoạn văn (p). */
export interface ChapterBlock { tag: BlockTag; text: string }

export interface ChapterFileContent {
  index: number;
  title: string;
  /** Văn bản của mọi khối (kể cả tiêu đề phụ), theo thứ tự. */
  paragraphs: string[];
  /** Chỉ có khi chương chứa tiêu đề phụ; ghi/đọc song song với `paragraphs`. */
  blocks?: ChapterBlock[];
}

const HEADING_LINE = /^(#{1,6}) (.+)$/;

export const chapterFileName = (index: number) => `chapter-${String(index).padStart(4, '0')}.txt`;

export class BookFileSystemStore {
  constructor(private readonly backend: IFileBackend) {}

  async writeChapterFile(bookId: string, chapter: ChapterFileContent): Promise<string> {
    const name = chapterFileName(chapter.index);
    // Tiêu đề phụ lưu dạng dòng `## …` (số # = cấp h); đoạn văn là dòng thường.
    const lines = chapter.blocks
      ? chapter.blocks.map((b) => (b.tag === 'p' ? b.text : `${'#'.repeat(Number(b.tag[1]))} ${b.text}`))
      : chapter.paragraphs;
    await this.backend.write(bookId, name, `# ${chapter.title}\n${lines.join('\n')}`);
    return `/books/${bookId}/${name}`;
  }

  async readChapterFile(bookId: string, chapterIndex: number): Promise<ChapterFileContent | null> {
    const raw = await this.backend.read(bookId, chapterFileName(chapterIndex));
    if (raw === null) return null;
    const [first, ...rest] = raw.split('\n');
    const blocks: ChapterBlock[] = rest.filter((l) => l.length > 0).map((l) => {
      const m = HEADING_LINE.exec(l);
      return m ? { tag: `h${m[1].length}` as BlockTag, text: m[2] } : { tag: 'p', text: l };
    });
    const content: ChapterFileContent = {
      index: chapterIndex,
      title: first.replace(/^#\s*/, ''),
      paragraphs: blocks.map((b) => b.text),
    };
    if (blocks.some((b) => b.tag !== 'p')) content.blocks = blocks;
    return content;
  }

  listChapterFiles(bookId: string): Promise<string[]> {
    return this.backend.list(bookId);
  }

  deleteBookDirectory(bookId: string): Promise<boolean> {
    return this.backend.removeDir(bookId);
  }
}
