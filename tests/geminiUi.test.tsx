import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { setServices } from '../src/services/appServices';
import { loadTranslationSettings } from '../src/domains/translator/createTranslationProvider';
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
  window.location.hash = '#/library';
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const geminiReply = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }));

describe('Dịch bằng AI (Gemini) ở Tủ truyện', () => {
  it('lưu/xóa key, thử dịch thành công và lỗi', async () => {
    render(<App />);
    const status = () => screen.getByLabelText('Trạng thái Gemini');
    fireEvent.click(await screen.findByText('Thử dịch'));
    expect(status()).toHaveTextContent('nhập API key');

    fireEvent.change(screen.getByLabelText('Gemini API key'), { target: { value: 'my-key' } });
    fireEvent.change(screen.getByLabelText('Model Gemini'), { target: { value: 'gemini-2.5-pro' } });
    fireEvent.click(screen.getByText('Lưu'));
    await waitFor(() => expect(status()).toHaveTextContent('Đã lưu'));
    expect(await loadTranslationSettings(svc.meta)).toEqual({ geminiApiKey: 'my-key', model: 'gemini-2.5-pro' });

    vi.stubGlobal('fetch', vi.fn(async () => geminiReply({ title: '', paragraphs: ['Hắn khẽ mỉm cười.'], glossary: [] })));
    fireEvent.click(screen.getByText('Thử dịch'));
    await waitFor(() => expect(status()).toHaveTextContent('Key hoạt động'));
    expect(status()).toHaveTextContent('Hắn khẽ mỉm cười.');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    fireEvent.click(screen.getByText('Thử dịch'));
    await waitFor(() => expect(status()).toHaveTextContent('từ chối API key'));

    vi.stubGlobal('fetch', vi.fn(async () => { throw 'weird'; }));
    fireEvent.click(screen.getByText('Thử dịch'));
    await waitFor(() => expect(status()).toHaveTextContent('mất mạng'));

    fireEvent.change(screen.getByLabelText('Gemini API key'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Lưu'));
    await waitFor(() => expect(status()).toHaveTextContent('quay về dịch offline'));
  });

  it('nhắc thêm key, dịch lại từ đầu (xác nhận/hủy/lỗi)', async () => {
    await svc.library.saveBook({ bookId: 'zh', title: '武动', language: 'zh', originType: 'epub_upload', chapterCount: 1, chapters: [], lastReadChapterIndex: 1, createdAt: '' });
    await svc.files.writeChapterFile('zh', { index: 1, title: '第1章', paragraphs: ['林动。'] });
    render(<App />);
    const li = await screen.findByTestId('book-zh');
    expect(li).toHaveTextContent('thêm Gemini key');

    fireEvent.click(screen.getByText('Dịch sang tiếng Việt'));
    await waitFor(() => expect(dispatchJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'START_TRANSLATION' })));
    const tj = (await svc.meta.list<any>('translation_jobs'))[0];
    await svc.meta.put('translation_jobs', tj.jobId, { ...tj, status: 'completed', nextChapterIndex: 2, translatedChaptersCount: 1, glossary: { 林动: 'Lâm Động' } });
    act(() => progressCb({}));
    const again = await screen.findByText('Dịch lại từ đầu');

    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    dispatchJob.mockClear();
    fireEvent.click(again);
    expect(dispatchJob).not.toHaveBeenCalled();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(again);
    await waitFor(() => expect(dispatchJob).toHaveBeenCalledWith({ type: 'START_TRANSLATION', jobId: tj.jobId }));
    const reset = await svc.meta.get<any>('translation_jobs', tj.jobId);
    expect(reset).toMatchObject({ status: 'idle', nextChapterIndex: 1 });
    expect(reset.glossary).toBeUndefined();

    dispatchJob.mockRejectedValueOnce(new Error('SW lỗi'));
    fireEvent.click(await screen.findByText('Dịch lại từ đầu'));
    await screen.findByText('SW lỗi');
    dispatchJob.mockRejectedValueOnce('x');
    fireEvent.click(await screen.findByText('Dịch lại từ đầu'));
    await screen.findByText('Lỗi dịch lại');
  });
});
