import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InteractiveChineseText } from '../components/InteractiveChineseText';
import type { ChapterFileContent } from '../services/storage/BookFileSystemStore';
import type { BookMetadata } from '../services/storage/types';
import { useServices } from '../services/ServicesContext';

/** Lazy-load: mỗi lần chỉ đọc đúng 1 file chương vào RAM. */
export function ReaderPage() {
  const { bookId = '', chapter = '1' } = useParams();
  const index = Math.max(1, parseInt(chapter, 10) || 1);
  const { library, files } = useServices();
  const [book, setBook] = useState<BookMetadata | undefined>();
  const [content, setContent] = useState<ChapterFileContent | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const b = await library.getBook(bookId);
      const c = await files.readChapterFile(bookId, index);
      if (!alive) return;
      setBook(b);
      setContent(c);
      if (b && c) await library.saveBook({ ...b, lastReadChapterIndex: index });
    })();
    return () => { alive = false; };
  }, [bookId, index, library, files]);

  if (content === undefined) return <p>Đang tải…</p>;
  if (!book || !content) return <p>Không tìm thấy chương. <Link to="/library">Về tủ truyện</Link></p>;

  return (
    <article className="mx-auto w-full max-w-[min(100%,52rem)]">
      <Link to="/library" className="inline-flex min-h-10 items-center text-sm font-medium">← Tủ truyện</Link>
      <h2 className="page-title mt-2">{content.title}</h2>
      <div className="text-sm text-muted">{book.title} · {index}/{book.chapterCount}</div>
      <div className="card mt-4 space-y-4 md:p-8">
        {(content.blocks ?? content.paragraphs.map((text) => ({ tag: 'p' as const, text }))).map((b, i) => {
          if (b.tag === 'p') {
            return book.language === 'zh' ? <InteractiveChineseText key={i} text={b.text} /> : <p key={i} className="text-[length:clamp(1.0625rem,1rem+0.4vw,1.25rem)] leading-loose">{b.text}</p>;
          }
          const H = b.tag;
          return <H key={i} lang={book.language === 'zh' ? 'zh-CN' : undefined} className="mt-6 text-xl font-semibold">{b.text}</H>;
        })}
      </div>
      <nav className="mt-6 flex justify-between gap-3">
        {index > 1 ? <Link className="btn no-underline" to={`/reader/${bookId}/${index - 1}`}>← Chương trước</Link> : <span />}
        {index < book.chapterCount ? <Link className="btn btn-primary no-underline" to={`/reader/${bookId}/${index + 1}`}>Chương sau →</Link> : <span />}
      </nav>
    </article>
  );
}
