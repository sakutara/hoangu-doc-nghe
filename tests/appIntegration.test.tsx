import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { DailyStudyHeader } from '../src/components/DailyStudyHeader';
import { InteractiveChineseText } from '../src/components/InteractiveChineseText';
import { WordLookupPopover } from '../src/components/WordLookupPopover';
import { defaultSegmenter } from '../src/domains/dictionary';
import { ServicesProvider } from '../src/services/ServicesContext';
import { setServices } from '../src/services/appServices';
import { testServices } from './helpers';

const dispatchJob = vi.fn(async (_m: unknown) => {});
let progressCb: (d: unknown) => void = () => {};
vi.mock('../src/services/swBridge', () => ({
  dispatchJob: (m: unknown) => dispatchJob(m as never),
  onProgress: (cb: (d: unknown) => void) => { progressCb = cb; return () => {}; },
}));

let svc = testServices();
beforeEach(() => {
  svc = testServices();
  setServices(svc);
  dispatchJob.mockClear();
  window.location.hash = '#/analyzer';
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const wrap = (ui: React.ReactNode) => render(<ServicesProvider value={svc}>{ui}</ServicesProvider>);

describe('Tra từ chạm', () => {
  it('chạm chữ "册" hiện cả cụm 注册账号, thành phần, lưu từ và nghe', async () => {
    const speak = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public t: string) {} });
    Object.defineProperty(window, 'speechSynthesis', { value: { speak, cancel: vi.fn() }, configurable: true });
    wrap(<InteractiveChineseText text="请先注册账号" />);
    fireEvent.click(document.querySelector('[data-index="3"]')!);
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveTextContent('注册账号');
    expect(dlg).toHaveTextContent('Hán-Việt');
    expect(dlg).toHaveTextContent('Chữ thành phần');
    fireEvent.click(screen.getByText('Nghe phát âm'));
    expect(speak).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Lưu từ'));
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
    expect(svc.storage.getSavedWords()[0].simplified).toBe('注册账号');
    fireEvent.click(screen.getByLabelText('Đóng'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document.querySelector('[data-index="0"]')!, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document.querySelector('[data-index="0"]')!, { key: 'a' });
    delete (window as any).speechSynthesis;
  });

  it('popover: từ phồn thể, gốc Anh, từ ngoài từ điển', () => {
    const tok = defaultSegmenter.lookupAtPosition('粉丝', 0)!;
    const { unmount } = wrap(<WordLookupPopover token={tok} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Phồn thể: 粉絲');
    expect(screen.getByRole('dialog')).toHaveTextContent('Gốc Anh: fans');
    unmount();
    wrap(<WordLookupPopover token={defaultSegmenter.lookupAtPosition('龘', 0)!} onClose={() => {}} />);
    expect(screen.getByText(/Chưa có trong từ điển/)).toBeInTheDocument();
  });

  it('bỏ lưu từ đã lưu', () => {
    svc.storage.toggleSaveWord(defaultSegmenter.lookup('注册')!);
    wrap(<WordLookupPopover token={defaultSegmenter.lookupAtPosition('注册', 0)!} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Đã lưu'));
    expect(svc.storage.getSavedWords()).toEqual([]);
  });
});

describe('App shell', () => {
  it('điều hướng giữa các tab và hiển thị trạng thái mạng', () => {
    render(<App />);
    expect(screen.getByText(/Phân tích câu/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Giáo trình'));
    expect(screen.getByText(/Cấp 1 — Nền tảng/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sổ từ & 30p'));
    expect(screen.getByText(/Nhắc học hằng ngày/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tủ truyện'));
    expect(screen.getByText('Chưa có truyện nào.')).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByText(/Offline sẵn sàng/)).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(screen.getByText(/^Online/)).toBeInTheDocument();
    window.location.hash = '#/unknown';
    cleanup();
    render(<App />);
    expect(screen.getByText(/Phân tích câu/)).toBeInTheDocument();
  });

  it('câu mẫu & nhập câu', () => {
    render(<App />);
    fireEvent.click(screen.getByText('我是来打酱油的'));
    expect((screen.getByLabelText('Nhập câu tiếng Hoa') as HTMLTextAreaElement).value).toBe('我是来打酱油的');
    fireEvent.change(screen.getByLabelText('Nhập câu tiếng Hoa'), { target: { value: '你好' } });
    expect(screen.getByText('好')).toBeInTheDocument();
  });
});

describe('Bộ đếm 30 phút & nhắc học', () => {
  it('đếm giờ, tạm dừng, cộng phút, nhắc học + Notification', () => {
    vi.useFakeTimers();
    const fixed = new Date(2026, 9, 17, 20, 30, 0);
    const notif = vi.fn();
    vi.stubGlobal('Notification', Object.assign(notif, { permission: 'granted' }));
    wrap(<DailyStudyHeader now={() => fixed} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(notif).toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByTestId('timer')).toHaveTextContent('00:03');
    fireEvent.click(screen.getByLabelText('Tạm dừng'));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByTestId('timer')).toHaveTextContent('00:03');
    fireEvent.click(screen.getByLabelText('Tiếp tục'));
    for (let i = 0; i < 30; i++) fireEvent.click(screen.getByLabelText('Cộng 1 phút'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(svc.storage.getStudyRecords()[0].goalCompleted).toBe(true);
  });

  it('không có Notification API vẫn chạy; trước giờ nhắc không báo', () => {
    vi.useFakeTimers();
    wrap(<DailyStudyHeader now={() => new Date(2026, 9, 17, 8, 0, 0)} />);
    expect(screen.queryByRole('alert')).toBeNull();
    cleanup();
    wrap(<DailyStudyHeader now={() => new Date(2026, 9, 17, 21, 0, 0)} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    wrap(<DailyStudyHeader />);
  });
});

describe('Sổ từ & cài đặt nhắc học', () => {
  it('lưu cài đặt, xem/xóa/nghe từ', () => {
    const speak = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', class {});
    Object.defineProperty(window, 'speechSynthesis', { value: { speak, cancel: vi.fn() }, configurable: true });
    const req = vi.fn();
    vi.stubGlobal('Notification', Object.assign(function () {}, { requestPermission: req }));
    svc.storage.toggleSaveWord(defaultSegmenter.lookup('氪金')!);
    window.location.hash = '#/vocab';
    render(<App />);
    expect(screen.getByText('Sổ từ vựng (1)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Giờ nhắc'), { target: { value: '21:15' } });
    expect(svc.storage.getHabitSettings().reminderTime).toBe('21:15');
    fireEvent.click(screen.getByLabelText(/Bật nhắc học|Bật/, { selector: 'input' }) as HTMLElement);
    expect(svc.storage.getHabitSettings().reminderEnabled).toBe(false);
    fireEvent.click(screen.getByText('Cho phép thông báo hệ thống'));
    expect(req).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Nghe'));
    expect(speak).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Xóa'));
    expect(screen.getByText(/Chưa có từ nào/)).toBeInTheDocument();
    vi.unstubAllGlobals();
    fireEvent.click(screen.getByText('Cho phép thông báo hệ thống'));
    delete (window as any).speechSynthesis;
  });
});

async function epubFile() {
  const z = new JSZip();
  z.file('META-INF/container.xml', '<rootfile full-path="a.opf"/>');
  z.file('a.opf', '<package><metadata><dc:title>测试书</dc:title></metadata><manifest><item id="1" href="1.html" media-type="text/html"/><item id="2" href="2.html" media-type="text/html"/></manifest><spine><itemref idref="1"/><itemref idref="2"/></spine></package>');
  z.file('1.html', '<h1>第一章</h1><p>我看小说。</p>');
  z.file('2.html', '<h1>第二章</h1><p>修炼。</p>');
  return new File([await z.generateAsync({ type: 'arraybuffer' })], 'b.epub');
}

describe('Tủ truyện & Trình đọc', () => {
  it('upload → đọc lazy theo chương → dịch → xuất → xóa', async () => {
    window.location.hash = '#/library';
    render(<App />);
    fireEvent.change(screen.getByLabelText('Tải lên epub'), { target: { files: [await epubFile()] } });
    await screen.findByText(/Đã nhập “测试书”/);
    const li = await screen.findByTestId(/book-/);
    expect(li).toHaveTextContent('2 chương');

    // đọc
    fireEvent.click(screen.getByText('Đọc ngay'));
    await screen.findByText('第一章');
    fireEvent.click(document.querySelector('[data-index="1"]')!);
    expect(screen.getByRole('dialog')).toHaveTextContent('看');
    fireEvent.click(screen.getByText('Chương sau →'));
    await screen.findByText('第二章');
    expect(screen.queryByText('Chương sau →')).toBeNull();
    fireEvent.click(screen.getByText('← Chương trước'));
    await screen.findByText('第一章');
    fireEvent.click(screen.getByText('← Tủ truyện'));

    // dịch
    fireEvent.click(await screen.findByText('Dịch sang tiếng Việt'));
    await waitFor(() => expect(dispatchJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'START_TRANSLATION' })));
    const tj = (await svc.meta.list<any>('translation_jobs'))[0];
    await svc.meta.put('translation_jobs', tj.jobId, { ...tj, status: 'paused_at_deadpoint', deadPoint: { failedChapterIndex: 2, lastTranslatedChapterIndex: 1, errorReason: 'x', failedAt: '', retryCount: 1 } });
    act(() => progressCb({}));
    fireEvent.click(await screen.findByText('Dịch tiếp từ điểm chết'));
    await waitFor(() => expect(dispatchJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'RESUME_TRANSLATION' })));

    // xuất
    (URL as any).createObjectURL = () => 'blob:x';
    (URL as any).revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getAllByText('Xuất .epub')[0]);
    await waitFor(() => expect(click).toHaveBeenCalled());

    // xóa (huỷ confirm rồi đồng ý)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const before = (await svc.library.listAllBooks()).length;
    fireEvent.click(screen.getAllByText('Xóa truyện')[0]);
    expect((await svc.library.listAllBooks()).length).toBe(before);
    fireEvent.click(screen.getAllByText('Xóa truyện')[0]);
    await waitFor(async () => expect((await svc.library.listAllBooks()).length).toBeLessThan(before));
    expect(dispatchJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAUSE_JOB' }));
    confirm.mockRestore();
  });

  it('epub lỗi báo lỗi; không chọn file thì bỏ qua', async () => {
    window.location.hash = '#/library';
    render(<App />);
    fireEvent.change(screen.getByLabelText('Tải lên epub'), { target: { files: [] } });
    fireEvent.change(screen.getByLabelText('Tải lên epub'), { target: { files: [new File([await new JSZip().generateAsync({ type: 'arraybuffer' })], 'x.epub')] } });
    expect(await screen.findByRole('status')).toHaveTextContent('container');
  });

  it('cào truyện: tạo job, hiển thị điểm chết, cào tiếp, kiểm tra chương mới', async () => {
    window.location.hash = '#/library';
    render(<App />);
    fireEvent.click(screen.getByText('Bắt đầu cào')); // link rỗng: bỏ qua
    expect(dispatchJob).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Link truyện'), { target: { value: 'http://x.com/1' } });
    fireEvent.click(screen.getByText('Bắt đầu cào'));
    await waitFor(() => expect(dispatchJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'START_CRAWL' })));
    const job = (await svc.meta.list<any>('crawl_jobs'))[0];
    await svc.meta.put('crawl_jobs', job.jobId, { ...job, status: 'paused_at_deadpoint', deadPoint: { failedUrl: 'u', failedChapterIndex: 3, errorReason: 'HTTP 500', failedAt: '', retryCount: 1 } });
    act(() => progressCb({}));
    fireEvent.click(await screen.findByText('Cào tiếp từ điểm chết'));
    expect(dispatchJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'RESUME_FROM_DEADPOINT' }));
    await svc.meta.put('crawl_jobs', job.jobId, { ...job, status: 'completed' });
    act(() => progressCb({}));
    fireEvent.click(await screen.findByText('Kiểm tra chương mới'));
    expect(dispatchJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'CHECK_NEW_CHAPTERS' }));
  });

  it('tải qua trình duyệt: bookmarklet, nhập gói, nối tiếp, lỗi, và điểm chết do bot challenge', async () => {
    window.location.hash = '#/library';
    render(<App />);
    expect(screen.getByText(/HoaNgữ: tải truyện/).getAttribute('href')).toMatch(/^javascript:/);
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fireEvent.click(screen.getByText('sao chép mã'));
    await screen.findByText('Đã sao chép mã bookmarklet.');
    writeText.mockRejectedValueOnce(new Error('x'));
    fireEvent.click(screen.getByText('sao chép mã'));
    await screen.findByText(/Không sao chép được/);

    const bundle = (urls: string[]) => new File([JSON.stringify({
      format: 'hoangu-capture/1', bookTitle: '河图', sourceOrigin: 'http://h', bookKey: 'http://h/index.html',
      chapters: urls.map((u, i) => ({ url: u, title: `第${i}章`, paragraphs: ['正文'] })),
    })], 'a.hoangu.json');
    const input = screen.getByLabelText('Nhập gói tải');
    fireEvent.change(input, { target: { files: [] } });
    fireEvent.change(input, { target: { files: [bundle(['u1', 'u2'])] } });
    await screen.findByText(/Đã tạo “河图”: thêm 2 chương \(tổng 2\)/);
    fireEvent.change(input, { target: { files: [bundle(['u2', 'u3'])] } });
    await screen.findByText(/Đã nối tiếp “河图”: thêm 1 chương \(tổng 3\)/);
    fireEvent.change(input, { target: { files: [new File(['nope'], 'x.json')] } });
    await screen.findByText('File không phải JSON hợp lệ.');

    const book = (await svc.library.listAllBooks())[0];
    await svc.meta.put('crawl_jobs', 'crawl-x', { jobId: 'crawl-x', bookId: book.bookId, bookTitle: 'x', startUrl: 'u', status: 'paused_at_deadpoint', chaptersCrawled: 0, maxChaptersLimit: 0, updatedAt: '', deadPoint: { failedUrl: 'u', failedChapterIndex: 1, errorReason: 'CF', errorKind: 'bot_challenge', failedAt: '', retryCount: 1 } });
    act(() => progressCb({}));
    await screen.findByText(/Trang này chặn bot/);
    expect(screen.queryByText('Cào tiếp từ điểm chết')).toBeNull();
  });

  it('reader: chương không tồn tại', async () => {
    window.location.hash = '#/reader/none/1';
    render(<App />);
    expect(await screen.findByText(/Không tìm thấy chương/)).toBeInTheDocument();
  });

  it('reader: truyện tiếng Việt hiển thị văn bản thường', async () => {
    await svc.library.saveBook({ bookId: 'v', title: 'V', language: 'vi', originType: 'translated_vi', chapterCount: 1, chapters: [], lastReadChapterIndex: 1, createdAt: '' });
    await svc.files.writeChapterFile('v', { index: 1, title: 'C1', paragraphs: ['Xin chào'] });
    window.location.hash = '#/reader/v/abc';
    render(<App />);
    expect(await screen.findByText('Xin chào')).toBeInTheDocument();
  });
});
