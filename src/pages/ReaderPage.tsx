import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Library, Minus, Plus } from 'lucide-react';
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
  const [scale, setScale] = useState(() => {
    try { return Number(localStorage.getItem('readerScale')) || 1; } catch { return 1; }
  });
  const zoom = (d: number) => setScale((s) => {
    const n = Math.min(1.8, Math.max(0.8, Math.round((s + d) * 10) / 10));
    try { localStorage.setItem('readerScale', String(n)); } catch { /* bỏ qua */ }
    return n;
  });

  useEffect(() => { window.scrollTo({ top: 0 }); }, [bookId, index]);

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

  const prev = index > 1 ? `/reader/${bookId}/${index - 1}` : null;
  const next = index < book.chapterCount ? `/reader/${bookId}/${index + 1}` : null;

  return (
    <article className="w-full" style={{ '--reader-scale': scale } as React.CSSProperties}>
      <div className="sticky top-0 z-10 -mx-[clamp(0.75rem,2.5vw,3rem)] mb-4 flex items-center gap-2 border-b border-line bg-bg/85 px-[clamp(0.75rem,2.5vw,3rem)] py-2 backdrop-blur-md">
        <Link to="/library" aria-label="Tủ truyện" className="btn-icon shrink-0" title="Tủ truyện"><Library size={20} /></Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold sm:text-base">{content.title}</h2>
          <div className="truncate text-xs text-muted">{book.title} · {index}/{book.chapterCount}</div>
        </div>
        <button className="btn-icon" aria-label="Giảm cỡ chữ" onClick={() => zoom(-0.1)}><Minus size={18} /></button>
        <button className="btn-icon" aria-label="Tăng cỡ chữ" onClick={() => zoom(0.1)}><Plus size={18} /></button>
        {prev ? <Link className="btn-icon" aria-label="Chương trước" to={prev}><ChevronLeft size={22} /></Link> : <span className="size-11" />}
        {next ? <Link className="btn-icon" aria-label="Chương sau" to={next}><ChevronRight size={22} /></Link> : <span className="size-11" />}
      </div>
      <details className="card mb-4 text-sm">
        <summary className="cursor-pointer font-medium">Mục lục · {book.chapterCount} chương</summary>
        <ol className="mt-3 max-h-[60vh] list-none space-y-1 overflow-y-auto p-0">
          {book.chapters.map((c) => (
            <li key={c.index}>
              <Link
                to={`/reader/${bookId}/${c.index}`}
                aria-current={c.index === index ? 'page' : undefined}
                className={`block rounded-lg px-2 py-1.5 no-underline hover:bg-line/40 ${c.index === index ? 'font-semibold text-brand' : ''}`}
              >
                <span className="tabular-nums text-muted">{c.index}.</span> {c.title}
              </Link>
            </li>
          ))}
        </ol>
      </details>
      <div className="w-full space-y-4 pb-4">
        {(content.blocks ?? content.paragraphs.map((text) => ({ tag: 'p' as const, text }))).map((b, i) => {
          if (b.tag === 'p') {
            return book.language === 'zh' ? <InteractiveChineseText key={i} text={b.text} sheet /> : <p key={i} className="text-[length:calc(clamp(1.0625rem,1rem+0.5vw,1.5rem)*var(--reader-scale))] leading-loose">{b.text}</p>;
          }
          const H = b.tag;
          return <H key={i} lang={book.language === 'zh' ? 'zh-CN' : undefined} className="mt-6 text-xl font-semibold">{b.text}</H>;
        })}
      </div>
      <nav className="mt-6 flex justify-between gap-3">
        {prev ? <Link className="btn no-underline" to={prev}>← Chương trước</Link> : <span />}
        {next ? <Link className="btn btn-primary no-underline" to={next}>Chương sau →</Link> : <span />}
      </nav>
    </article>
  );
}
