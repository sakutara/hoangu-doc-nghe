import { useCallback, useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { importEpub } from '../domains/epub/EpubPlainImporter';
import type { BookMetadata } from '../services/storage/types';
import { useServices } from '../services/ServicesContext';

/** Nút chọn file: input thật được ẩn (vẫn truy cập được bằng bàn phím), hiện nút bấm rõ ràng. */
function UploadButton({ label, accept, ariaLabel, onFile, primary }: {
  label: string; accept: string; ariaLabel: string; onFile: (f: File | undefined) => void | Promise<void>; primary?: boolean;
}) {
  return (
    <label className={`btn has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${primary ? 'btn-primary' : ''}`}>
      <Upload size={16} aria-hidden="true" /> {label}
      <input type="file" accept={accept} aria-label={ariaLabel} className="sr-only" onChange={(e) => {
        // Giữ input đến khi đọc xong: trên điện thoại, xoá giá trị sớm có thể làm File không đọc được.
        const input = e.target;
        void Promise.resolve(onFile(input.files?.[0])).finally(() => { input.value = ''; });
      }} />
    </label>
  );
}

const newId = () => `book-${Date.now().toString(36)}`;

export function BookLibraryPage() {
  const { library, files } = useServices();
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => { setBooks(await library.listAllBooks()); }, [library]);

  useEffect(() => { void refresh(); }, [refresh]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setMsg(`Đang nhập “${file.name}”…`);
    try {
      const book = await importEpub(await file.arrayBuffer(), newId(), files);
      await library.saveBook(book);
      setMsg(`Đã nhập “${book.title}” (${book.chapterCount} chương, chỉ văn bản thuần).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi nhập EPUB');
    }
    await refresh();
  };

  const remove = async (b: BookMetadata) => {
    if (!window.confirm(`Xóa “${b.title}” và toàn bộ file chương?`)) return;
    await library.deleteBookCompletely(b.bookId);
    await refresh();
  };

  return (
    <section className="space-y-[var(--gap)]">
      <h2 className="page-title">Tủ truyện</h2>
      {msg && <p role="status" className="rounded-xl bg-info-soft px-4 py-3 text-sm text-info-ink">{msg}</p>}
      <div className="card space-y-2">
        <div className="font-medium">Tải lên file .epub</div>
        <p className="text-sm text-muted">Chọn file .epub từ máy — app tự nhập ngay sau khi chọn (không cần bấm thêm), chỉ giữ văn bản thuần, mỗi chương một file.</p>
        <UploadButton primary label="Chọn file .epub" accept=".epub,application/epub+zip,application/octet-stream" ariaLabel="Tải lên epub" onFile={upload} />
      </div>
      {books.length === 0 && <p className="card text-center text-muted">Chưa có truyện nào.</p>}
      <ul className="fluid-grid items-start">
        {books.map((b) => (
          <li key={b.bookId} className="card flex flex-col" data-testid={`book-${b.bookId}`}>
            <div className="font-semibold">{b.title}</div>
            <div className="text-sm text-muted">{b.chapterCount} chương</div>
            <div className="mt-auto flex flex-wrap gap-2 pt-3 text-sm">
              {b.chapterCount > 0 && <Link className="btn" to={`/reader/${b.bookId}/${b.lastReadChapterIndex}`}>Đọc ngay</Link>}
              <button className="btn btn-danger" onClick={() => void remove(b)}>Xóa truyện</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
