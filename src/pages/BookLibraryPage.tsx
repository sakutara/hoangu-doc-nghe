import { useCallback, useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildEpubBlob, triggerEpubDownload } from '../domains/epub/EpubExporter';
import { importEpub } from '../domains/epub/EpubPlainImporter';
import type { CrawlJob } from '../domains/crawler/types';
import type { TranslationJob } from '../domains/translator/types';
import type { BookMetadata } from '../services/storage/types';
import { useServices } from '../services/ServicesContext';
import { dispatchJob, onProgress } from '../services/swBridge';
import { NovelCrawlerRunner } from '../domains/crawler/NovelCrawlerRunner';
import { NovelTranslationRunner } from '../domains/translator/NovelTranslationRunner';
import { createTranslationProvider, loadTranslationSettings, saveTranslationSettings } from '../domains/translator/createTranslationProvider';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS, GeminiNovelTranslator } from '../domains/translator/GeminiNovelTranslator';
import { importCaptureBundle, parseCaptureBundle } from '../domains/crawler/browserCapture/CaptureBundleImporter';

/** Nút chọn file: input thật được ẩn (vẫn truy cập được bằng bàn phím), hiện nút bấm rõ ràng. */
function UploadButton({ label, accept, ariaLabel, onFile, primary }: {
  label: string; accept: string; ariaLabel: string; onFile: (f: File | undefined) => void; primary?: boolean;
}) {
  return (
    <label className={`btn has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${primary ? 'btn-primary' : ''}`}>
      <Upload size={16} aria-hidden="true" /> {label}
      <input type="file" accept={accept} aria-label={ariaLabel} className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

const newId = () => `book-${Date.now().toString(36)}`;

export function BookLibraryPage() {
  const { library, files, meta } = useServices();
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [crawl, setCrawl] = useState<Record<string, CrawlJob>>({});
  const [trans, setTrans] = useState<Record<string, TranslationJob>>({});
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [target, setTarget] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string>(DEFAULT_GEMINI_MODEL);
  const [hasKey, setHasKey] = useState(false);
  const [aiMsg, setAiMsg] = useState('');

  const refresh = useCallback(async () => {
    setBooks(await library.listAllBooks());
    const c = await meta.list<CrawlJob>('crawl_jobs');
    const t = await meta.list<TranslationJob>('translation_jobs');
    setCrawl(Object.fromEntries(c.map((j) => [j.bookId, j])));
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

  const importCapture = async (file: File | undefined) => {
    if (!file) return;
    setMsg(`Đang nhập “${file.name}”…`);
    try {
      const bundle = parseCaptureBundle(await file.text());
      const r = await importCaptureBundle(bundle, { meta, files }, newId, undefined, target || undefined);
      setMsg(`${r.created ? 'Đã tạo' : 'Đã nối tiếp'} “${r.book.title}”: thêm ${r.added} chương (tổng ${r.book.chapterCount}).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi nhập gói tải');
    }
    await refresh();
  };

  const startCrawl = async () => {
    if (!url.trim()) return;
    const runner = new NovelCrawlerRunner({ meta, files, fetchHtml: async () => '' });
    const job = await runner.createJob(newId(), title.trim() || url.trim(), url.trim());
    setUrl(''); setTitle('');
    await dispatchJob({ type: 'START_CRAWL', jobId: job.jobId });
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
    const related = [crawl[b.bookId], ...Object.values(trans).filter((t) => t.sourceBookId === b.bookId || t.targetBookId === b.bookId)];
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
          <UploadButton primary label="Chọn file .epub" accept=".epub" ariaLabel="Tải lên epub" onFile={(f) => void upload(f)} />
        </div>
        <div className="card space-y-2">
          <div className="font-medium">Cào truyện từ link (mục lục hoặc chương)</div>
          <input aria-label="Link truyện" placeholder="https://..." className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input aria-label="Tên truyện" placeholder="Tên truyện" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn btn-primary" onClick={() => void startCrawl()}>Bắt đầu cào</button>
        </div>
      </div>
      <div className="card min-w-0 space-y-2 text-sm">
        <div className="font-semibold">Nhập truyện từ extension HoaNgữ</div>
        <p className="text-muted">Dùng extension trong thư mục <code>extension/</code> để tải truyện (kể cả trang chặn bot), rồi chọn file <code>.hoangu.json</code> tại đây — app tự nhập ngay sau khi chọn.</p>
        <label className="block">Nối vào:{' '}
          <select className="input mt-1 min-w-0" aria-label="Truyện đích" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Tự nhận theo nguồn / tạo truyện mới</option>
            {books.filter((b) => b.language === 'zh').map((b) => <option key={b.bookId} value={b.bookId}>{b.title}</option>)}
          </select>
        </label>
        <div><UploadButton label="Chọn file .hoangu.json" accept=".json,application/json" ariaLabel="Nhập gói tải" onFile={(f) => void importCapture(f)} /></div>
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
          const cj = crawl[b.bookId];
          const tj = trans[b.bookId];
          return (
            <li key={b.bookId} className="card flex flex-col" data-testid={`book-${b.bookId}`}>
              <div className="font-semibold">{b.title} <span className="chip bg-surface-2 uppercase text-muted">{b.language} · {b.originType}</span></div>
              <div className="text-sm text-muted">{b.chapterCount} chương</div>
              {cj && <div className="text-sm">Cào: {cj.status}{cj.deadPoint && ` — điểm chết chương ${cj.deadPoint.failedChapterIndex}: ${cj.deadPoint.errorReason}`}</div>}
              {tj && <div className="text-sm">Dịch: {tj.status} ({tj.translatedChaptersCount}/{tj.totalChapters}){tj.deadPoint && ` — điểm chết chương ${tj.deadPoint.failedChapterIndex}: ${tj.deadPoint.errorReason}`}</div>}
              <div className="mt-auto flex flex-wrap gap-2 pt-3 text-sm">
                {b.chapterCount > 0 && <Link className="btn" to={`/reader/${b.bookId}/${b.lastReadChapterIndex}`}>Đọc ngay</Link>}
                {b.language === 'zh' && !tj && b.chapterCount > 0 && <button className="btn" onClick={() => void startTranslate(b)}>Dịch sang tiếng Việt</button>}
                {tj && tj.status !== 'completed' && tj.status !== 'running' && <button className="btn" onClick={() => void startTranslate(b)}>{tj.deadPoint ? 'Dịch tiếp từ điểm chết' : 'Dịch tiếp'}</button>}
                {tj && tj.status !== 'running' && <button className="btn" onClick={() => void retranslate(b)}>Dịch lại từ đầu</button>}
                {b.language === 'zh' && b.chapterCount > 0 && !hasKey && (!tj || tj.status !== 'completed') && <span className="text-muted">Đang dùng dịch offline từng từ — thêm Gemini key ở trên để dịch mượt.</span>}
                {cj && cj.deadPoint?.errorKind === 'bot_challenge' && <span className="text-gold-ink">Trang này chặn bot — dùng extension HoaNgữ để tải.</span>}
                {cj && cj.status === 'paused_at_deadpoint' && cj.deadPoint?.errorKind !== 'bot_challenge' && <button className="btn" onClick={() => void dispatchJob({ type: 'RESUME_FROM_DEADPOINT', jobId: cj.jobId })}>Cào tiếp từ điểm chết</button>}
                {cj && cj.status === 'completed' && <button className="btn" onClick={() => void dispatchJob({ type: 'CHECK_NEW_CHAPTERS', jobId: cj.jobId })}>Kiểm tra chương mới</button>}
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
