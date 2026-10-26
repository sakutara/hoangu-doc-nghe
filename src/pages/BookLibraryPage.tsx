import { useCallback, useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildEpubBlob, triggerEpubDownload } from '../domains/epub/EpubExporter';
import { importEpub } from '../domains/epub/EpubPlainImporter';
import type { TranslationJob } from '../domains/translator/types';
import type { BookMetadata } from '../services/storage/types';
import { useServices } from '../services/ServicesContext';
import { dispatchJob, onProgress } from '../services/swBridge';
import { NovelTranslationRunner } from '../domains/translator/NovelTranslationRunner';
import { createTranslationProvider, loadTranslationSettings, saveTranslationSettings } from '../domains/translator/createTranslationProvider';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS, GeminiNovelTranslator } from '../domains/translator/GeminiNovelTranslator';

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
  const { library, files, meta } = useServices();
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [trans, setTrans] = useState<Record<string, TranslationJob>>({});
  const [msg, setMsg] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string>(DEFAULT_GEMINI_MODEL);
  const [hasKey, setHasKey] = useState(false);
  const [aiMsg, setAiMsg] = useState('');

  const refresh = useCallback(async () => {
    setBooks(await library.listAllBooks());
    const t = await meta.list<TranslationJob>('translation_jobs');
    setTrans(Object.fromEntries(t.map((j) => [j.sourceBookId, j])));
  }, [library, meta]);

  useEffect(() => {
    void loadTranslationSettings(meta).then((s) => {
      setApiKey(s.geminiApiKey ?? ''); setModel(s.model); setHasKey(!!s.geminiApiKey);
    });
  }, [meta]);

  useEffect(() => {
    void refresh();
    return onProgress(() => void refresh());
  }, [refresh]);

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

  const startTranslate = async (b: BookMetadata) => {
    const existing = trans[b.bookId];
    if (existing) {
      await dispatchJob({ type: 'RESUME_TRANSLATION', jobId: existing.jobId });
    } else {
      const runner = new NovelTranslationRunner({ meta, files, provider: await createTranslationProvider(meta) });
      const job = await runner.createJob(b.bookId);
      await dispatchJob({ type: 'START_TRANSLATION', jobId: job.jobId });
    }
    await refresh();
  };

  const retranslate = async (b: BookMetadata) => {
    const tj = trans[b.bookId];
    if (!window.confirm(`Dịch lại “${b.title}” từ chương 1? Bản dịch cũ sẽ bị ghi đè.`)) return;
    try {
      const runner = new NovelTranslationRunner({ meta, files, provider: await createTranslationProvider(meta) });
      await runner.resetJob(tj.jobId);
      await dispatchJob({ type: 'START_TRANSLATION', jobId: tj.jobId });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi dịch lại');
    }
    await refresh();
  };

  const saveAi = async () => {
    await saveTranslationSettings(meta, { geminiApiKey: apiKey, model });
    setHasKey(!!apiKey.trim());
    setAiMsg(apiKey.trim() ? 'Đã lưu. Các chương dịch từ giờ sẽ dùng Gemini.' : 'Đã xóa key — quay về dịch offline.');
  };

  const testAi = async () => {
    if (!apiKey.trim()) { setAiMsg('Hãy nhập API key trước.'); return; }
    setAiMsg('Đang thử…');
    try {
      const [vi] = await new GeminiNovelTranslator({ apiKey: apiKey.trim(), model, rateLimitRetries: 0 })
        .translateParagraphs(['他微微一笑，转身消失在夜色之中。']);
      setAiMsg(`Key hoạt động. Ví dụ: “他微微一笑，转身消失在夜色之中。” → “${vi}”`);
    } catch (e) {
      setAiMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const exportEpub = async (b: BookMetadata) => {
    triggerEpubDownload(await buildEpubBlob(b, files), b.title);
  };

  const remove = async (b: BookMetadata) => {
    if (!window.confirm(`Xóa “${b.title}” và toàn bộ file chương?`)) return;
    const related = [...Object.values(trans).filter((t) => t.sourceBookId === b.bookId || t.targetBookId === b.bookId)];
    for (const j of related) if (j) await dispatchJob({ type: 'PAUSE_JOB', jobId: j.jobId });
    await library.deleteBookCompletely(b.bookId);
    await refresh();
  };

  return (
    <section className="space-y-[var(--gap)]">
      <h2 className="page-title">Tủ truyện</h2>
      {msg && <p role="status" className="rounded-xl bg-info-soft px-4 py-3 text-sm text-info-ink">{msg}</p>}
      <div className="fluid-grid items-start">
        <div className="card space-y-2">
          <div className="font-medium">Tải lên file .epub</div>
          <p className="text-sm text-muted">Chọn file .epub từ máy — app tự nhập ngay sau khi chọn (không cần bấm thêm), chỉ giữ văn bản thuần, mỗi chương một file.</p>
          <UploadButton primary label="Chọn file .epub" accept=".epub,application/epub+zip,application/octet-stream" ariaLabel="Tải lên epub" onFile={upload} />
        </div>
      </div>
      <div className="card min-w-0 space-y-2 text-sm">
        <div className="font-semibold">Dịch bằng AI (Gemini)</div>
        <p className="text-muted">
          Dịch cả câu theo ngữ cảnh, văn phong truyện, giữ tên riêng nhất quán. Lấy key miễn phí tại{' '}
          <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.
          Key chỉ lưu trên máy này.
        </p>
        <div className="flex flex-wrap gap-2">
          <input type="password" aria-label="Gemini API key" placeholder="Gemini API key" autoComplete="off" className="input min-w-0 flex-1" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <select aria-label="Model Gemini" className="input min-w-0" value={model} onChange={(e) => setModel(e.target.value)}>
            {GEMINI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => void saveAi()}>Lưu</button>
          <button className="btn" onClick={() => void testAi()}>Thử dịch</button>
        </div>
        {aiMsg && <p role="status" aria-label="Trạng thái Gemini" className="break-words">{aiMsg}</p>}
      </div>
      {books.length === 0 && <p className="card text-center text-muted">Chưa có truyện nào.</p>}
      <ul className="fluid-grid items-start">
        {books.map((b) => {
          const tj = trans[b.bookId];
          return (
            <li key={b.bookId} className="card flex flex-col" data-testid={`book-${b.bookId}`}>
              <div className="font-semibold">{b.title} <span className="chip bg-surface-2 uppercase text-muted">{b.language} · {b.originType}</span></div>
              <div className="text-sm text-muted">{b.chapterCount} chương</div>
              {tj && <div className="text-sm">Dịch: {tj.status} ({tj.translatedChaptersCount}/{tj.totalChapters}){tj.deadPoint && ` — điểm chết chương ${tj.deadPoint.failedChapterIndex}: ${tj.deadPoint.errorReason}`}</div>}
              <div className="mt-auto flex flex-wrap gap-2 pt-3 text-sm">
                {b.chapterCount > 0 && <Link className="btn" to={`/reader/${b.bookId}/${b.lastReadChapterIndex}`}>Đọc ngay</Link>}
                {b.language === 'zh' && !tj && b.chapterCount > 0 && <button className="btn" onClick={() => void startTranslate(b)}>Dịch sang tiếng Việt</button>}
                {tj && tj.status !== 'completed' && tj.status !== 'running' && <button className="btn" onClick={() => void startTranslate(b)}>{tj.deadPoint ? 'Dịch tiếp từ điểm chết' : 'Dịch tiếp'}</button>}
                {tj && tj.status !== 'running' && <button className="btn" onClick={() => void retranslate(b)}>Dịch lại từ đầu</button>}
                {b.language === 'zh' && b.chapterCount > 0 && !hasKey && (!tj || tj.status !== 'completed') && <span className="text-muted">Đang dùng dịch offline từng từ — thêm Gemini key ở trên để dịch mượt.</span>}
                {b.chapterCount > 0 && <button className="btn" onClick={() => void exportEpub(b)}>Xuất .epub</button>}
                <button className="btn btn-danger" onClick={() => void remove(b)}>Xóa truyện</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
