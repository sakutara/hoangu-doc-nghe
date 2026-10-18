import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyStudyHeader } from '../src/components/DailyStudyHeader';
import { defaultSegmenter } from '../src/domains/dictionary';
import { ProgressPage } from '../src/pages/ProgressPage';
import { ReviewPage } from '../src/pages/ReviewPage';
import { VocabularyAndHabitPage } from '../src/pages/VocabularyAndHabitPage';
import { ServicesProvider } from '../src/services/ServicesContext';
import { testServices } from './helpers';

const NOW = () => new Date(2026, 9, 17, 20, 30, 0);
let svc = testServices();
const wrap = (ui: React.ReactElement) =>
  render(<ServicesProvider value={svc}><MemoryRouter>{ui}</MemoryRouter></ServicesProvider>);

beforeEach(() => {
  localStorage.setItem('studyBarOpen', '1');
  svc = testServices();
  const speak = vi.fn();
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  Object.defineProperty(window, 'speechSynthesis', { value: { speak, cancel: vi.fn() }, configurable: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); delete (window as any).speechSynthesis; });

const saveWords = (...ws: string[]) => ws.forEach((w) => svc.storage.toggleSaveWord(defaultSegmenter.lookup(w)!));

describe('ProgressPage', () => {
  it('hiển thị số liệu, biểu đồ 7/30 ngày, giáo trình và SRS', () => {
    svc.storage.saveStudyRecords([
      { date: '2026-10-16', secondsStudied: 1900, goalCompleted: true },
      { date: '2026-10-17', secondsStudied: 600, goalCompleted: false },
    ]);
    svc.storage.saveLessonProgress({ 'l1-1': { bestScore: 90, completed: true, attempts: 1 } });
    saveWords('氪金');
    wrap(<ProgressPage now={NOW} />);
    expect(screen.getByText('Chuỗi hiện tại (ngày)').previousSibling).toHaveTextContent('2');
    expect(screen.getByText('Tổng thời gian').previousSibling).toHaveTextContent('41 phút');
    expect(screen.getByText('Ngày đạt mục tiêu').previousSibling).toHaveTextContent('1');
    expect(screen.getAllByTestId('day-bar')).toHaveLength(7);
    expect(screen.getAllByTestId('day-bar').filter((b) => b.dataset.goal === 'true')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Khoảng thời gian'), { target: { value: '30' } });
    expect(screen.getAllByTestId('day-bar')).toHaveLength(30);
    expect(screen.getByText('90% ✔')).toBeInTheDocument();
    expect(screen.getByTestId('srs-summary')).toHaveTextContent('1 từ · 1 cần ôn hôm nay · 0 đã thuộc');
    expect(screen.getByText(/% hoàn thành/)).toBeInTheDocument();
  });
  it('lần đầu: không dữ liệu vẫn render', () => {
    wrap(<ProgressPage />);
    expect(screen.getByTestId('srs-summary')).toHaveTextContent('0 từ');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('ReviewPage', () => {
  it('sổ trống', () => {
    wrap(<ReviewPage now={NOW} />);
    expect(screen.getByText('Hôm nay không còn từ cần ôn.')).toBeInTheDocument();
    expect(screen.getByText(/Sổ từ đang trống/)).toBeInTheDocument();
  });

  it('chế độ Đọc: lật thẻ, chấm Quên đẩy về cuối, lưu lịch ôn', () => {
    saveWords('氪金', '破防');
    wrap(<ReviewPage now={NOW} />);
    expect(screen.getByText('Còn 2 thẻ')).toBeInTheDocument();
    const first = document.querySelector('[lang="zh-CN"]')!.textContent!;
    fireEvent.click(screen.getByText('Hiện đáp án'));
    expect(screen.getByRole('button', { name: 'Nghe' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Quên'));
    expect(screen.getByText('Còn 2 thẻ')).toBeInTheDocument();
    expect(document.querySelector('[lang="zh-CN"]')!.textContent).not.toBe(first);
    expect(svc.storage.getSrsCards().find((c) => c.simplified === first)).toMatchObject({ lapses: 1, reps: 1 });
    fireEvent.click(screen.getByText('Hiện đáp án'));
    fireEvent.click(screen.getByText('Tốt'));
    fireEvent.click(screen.getByText('Hiện đáp án'));
    fireEvent.click(screen.getByText('Dễ'));
    expect(screen.getByText(/Hoàn thành phiên ôn: 3/)).toBeInTheDocument();
    expect(screen.getByText(/Lần ôn gần nhất tiếp theo/)).toBeInTheDocument();
  });

  it('chế độ Nghe: tự phát âm, ẩn chữ tới khi lật; nút Nghe lại', () => {
    saveWords('氪金');
    const speak = (window as any).speechSynthesis.speak as ReturnType<typeof vi.fn>;
    wrap(<ReviewPage now={NOW} />);
    fireEvent.change(screen.getByLabelText('Chế độ ôn'), { target: { value: 'listen' } });
    expect(speak).toHaveBeenCalled();
    expect(document.querySelector('[lang="zh-CN"]')).toBeNull();
    fireEvent.click(screen.getByText('Nghe lại'));
    fireEvent.click(screen.getByText('Hiện đáp án'));
    expect(document.querySelector('[lang="zh-CN"]')).toHaveTextContent('氪金');
    fireEvent.click(screen.getByRole('button', { name: 'Nghe' }));
    fireEvent.click(screen.getByText('Khó'));
    expect(svc.storage.getSrsCards()[0].reps).toBe(1);
  });

  it('thẻ chưa có trong sổ từ (đã xóa) vẫn không làm vỡ giao diện', () => {
    saveWords('氪金');
    wrap(<ReviewPage now={NOW} />);
    svc.storage.toggleSaveWord(defaultSegmenter.lookup('氪金')!); // xóa khỏi sổ sau khi tạo hàng đợi
    fireEvent.click(screen.getByText('Hiện đáp án'));
    expect(document.querySelector('[lang="zh-CN"]')).toHaveTextContent('氪金');
  });
});

describe('Sổ từ: mục tiêu phút/ngày', () => {
  it('đổi mục tiêu, chặn 1–240, hiện hộp SRS và liên kết ôn', () => {
    saveWords('氪金');
    wrap(<VocabularyAndHabitPage />);
    const input = screen.getByLabelText('Mục tiêu phút mỗi ngày');
    fireEvent.change(input, { target: { value: '45' } });
    expect(svc.storage.getHabitSettings().dailyGoalMinutes).toBe(45);
    fireEvent.change(input, { target: { value: '999' } });
    expect(svc.storage.getHabitSettings().dailyGoalMinutes).toBe(240);
    fireEvent.change(input, { target: { value: '' } });
    expect(svc.storage.getHabitSettings().dailyGoalMinutes).toBe(1);
    expect(screen.getByText('hộp 0')).toBeInTheDocument();
    expect(screen.getByText('Ôn tập ngay')).toBeInTheDocument();
  });
});

describe('Banner nhắc học: nhắc lại / bỏ qua', () => {
  it('nhắc lại sau 10 phút rồi hiện lại; bỏ qua hôm nay thì ẩn; đổi mục tiêu có hiệu lực ngay', () => {
    vi.useFakeTimers();
    let now = new Date(2026, 9, 17, 20, 30, 0);
    const { rerender } = wrap(<DailyStudyHeader now={() => now} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Nhắc lại sau 10 phút'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(svc.storage.getReminderState()).toEqual({ date: '2026-10-17', snoozedUntil: '20:40' });
    now = new Date(2026, 9, 17, 20, 41, 0);
    rerender(<ServicesProvider value={svc}><MemoryRouter><DailyStudyHeader now={() => now} /></MemoryRouter></ServicesProvider>);
    fireEvent.click(screen.getByLabelText('Cộng 1 phút')); // buộc render lại
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bỏ qua hôm nay'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(svc.storage.getReminderState()).toEqual({ date: '2026-10-17', dismissed: true });
    svc.storage.saveHabitSettings({ ...svc.storage.getHabitSettings(), dailyGoalMinutes: 60 });
    fireEvent.click(screen.getByLabelText('Cộng 1 phút'));
    expect(screen.getByTestId('timer')).toHaveTextContent('/ 60:00');
  });
});

describe('Thanh thời gian ẩn/hiện', () => {
  it('mặc định thu gọn, bấm để mở và ẩn lại', () => {
    localStorage.removeItem('studyBarOpen');
    wrap(<DailyStudyHeader />);
    expect(screen.queryByLabelText('Cộng 1 phút')).toBeNull();
    fireEvent.click(screen.getByLabelText('Hiện thanh thời gian'));
    expect(screen.getByLabelText('Cộng 1 phút')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Ẩn thanh thời gian'));
    expect(screen.queryByLabelText('Cộng 1 phút')).toBeNull();
  });
});
