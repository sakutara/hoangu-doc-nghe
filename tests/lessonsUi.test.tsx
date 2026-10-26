import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { LESSONS } from '../src/data/curriculum';
import { setServices } from '../src/services/appServices';
import { testServices } from './helpers';


let svc = testServices();
beforeEach(() => {
  svc = testServices();
  setServices(svc);
  window.location.hash = '#/lessons';
  const speak = vi.fn();
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  Object.defineProperty(window, 'speechSynthesis', { value: { speak, cancel: vi.fn() }, configurable: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (window as any).speechSynthesis; });

/** Làm hết quiz. Câu nghe: bấm "Nghe" rồi lấy chữ vừa được phát từ mock TTS để biết đáp án. */
function answerAll(correct: boolean) {
  const lesson = LESSONS.find((l) => window.location.hash.endsWith(l.id))!;
  const total = Number(screen.getByText(/Câu \d+\/\d+/).textContent!.match(/\/(\d+)/)![1]);
  const speak = (window as any).speechSynthesis.speak as ReturnType<typeof vi.fn>;
  for (let i = 0; i < total; i++) {
    const box = screen.getByText(/Câu \d+\/\d+/).parentElement!;
    const head = box.querySelector('[lang="zh-CN"] span, [lang="vi"] span')?.textContent;
    const zh = head;
    let right: string;
    const vietPrompt = lesson.vocab.find((v) => v.meaning === head);
    if (vietPrompt) {
      right = vietPrompt.simplified;
    } else if (!zh) {
      fireEvent.click(screen.getByText('Nghe'));
      const spoken = speak.mock.calls.at(-1)![0].text;
      right = lesson.vocab.find((v) => v.simplified === spoken)!.meaning;
    } else {
      right = (lesson.vocab.find((v) => v.simplified === zh)?.meaning ?? lesson.lines.find((l) => l.zh === zh)!.vi);
    }
    const buttons = [...box.querySelectorAll('li button')];
    const rightIdx = buttons.findIndex((b) => b.textContent === right);
    fireEvent.click(buttons[correct ? rightIdx : (rightIdx + 1) % buttons.length]);
    fireEvent.click(screen.getByText(i === total - 1 ? 'Xem kết quả' : 'Câu tiếp'));
  }
}

describe('Giáo trình UI', () => {
  it('chỉ bài đầu mở; bài khóa không vào được qua URL', () => {
    render(<App />);
    expect(screen.getByText(/Cấp 4/)).toBeInTheDocument();
    expect(screen.getByText(LESSONS[0].title).closest('a')).not.toBeNull();
    expect(screen.getByText(LESSONS[1].title).closest('a')).toBeNull();
    expect(screen.getAllByLabelText('Đang khóa').length).toBe(LESSONS.length - 1);
    expect(screen.getByText('0% hoàn thành')).toBeInTheDocument();
    cleanup();
    window.location.hash = '#/lesson/l1-2';
    render(<App />);
    expect(screen.getByText(/Cấp 1 — Nền tảng/)).toBeInTheDocument();
    cleanup();
    window.location.hash = '#/lesson/nope';
    render(<App />);
    expect(screen.getByText(/Cấp 1 — Nền tảng/)).toBeInTheDocument();
  });

  it('xem từ vựng, đọc & nghe, chạm dịch, hiện bản dịch', () => {
    window.location.hash = '#/lesson/l1-1';
    render(<App />);
    expect(screen.getByText('知道')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Nghe 我'));
    expect((window as any).speechSynthesis.speak).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Đọc & Nghe'));
    const firstLine = LESSONS[0].lines[0];
    expect(screen.queryByText(firstLine.vi)).toBeNull();
    fireEvent.click(screen.getByLabelText('Hiện bản dịch tiếng Việt'));
    expect(screen.getByText(firstLine.vi)).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-index="0"]')!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Nghe câu')[0]);
  });

  it('nút Ẩn/Hiện pinyin ở phần từ vựng', () => {
    window.location.hash = '#/lesson/l1-1';
    render(<App />);
    const py = LESSONS[0].vocab[1].pinyin;
    expect(screen.getAllByText(py).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Ẩn pinyin'));
    expect(screen.queryByText(py)).toBeNull();
    fireEvent.click(screen.getByText('Hiện pinyin'));
    expect(screen.getAllByText(py).length).toBeGreaterThan(0);
  });

  it('trượt → làm lại; đạt → lưu tiến độ và mở khóa bài kế', () => {
    window.location.hash = '#/lesson/l1-1';
    render(<App />);
    fireEvent.click(screen.getByText('Kiểm tra'));
    answerAll(false);
    expect(screen.getByRole('status')).toHaveTextContent('Chưa đạt');
    expect(svc.storage.getLessonProgress()['l1-1'].completed).toBe(false);
    expect(screen.queryByText('Bài kế tiếp →')).toBeNull();

    fireEvent.click(screen.getByText('Làm lại'));
    answerAll(true);
    expect(screen.getByRole('status')).toHaveTextContent('Đạt!');
    expect(svc.storage.getLessonProgress()['l1-1']).toMatchObject({ completed: true, bestScore: 100, attempts: 2 });
    fireEvent.click(screen.getByText('Bài kế tiếp →'));
    expect(screen.getByText(LESSONS[1].title)).toBeInTheDocument();
    fireEvent.click(screen.getByText('← Giáo trình'));
    expect(screen.getByText('Điểm tốt nhất 100%')).toBeInTheDocument();
    expect(screen.getByLabelText('Đã hoàn thành')).toBeInTheDocument();
  });

  it('bài cuối đạt chuẩn không có nút bài kế tiếp', () => {
    const done = Object.fromEntries(LESSONS.slice(0, -1).map((l) => [l.id, { bestScore: 100, completed: true, attempts: 1 }]));
    svc.storage.saveLessonProgress(done);
    window.location.hash = `#/lesson/${LESSONS.at(-1)!.id}`;
    render(<App />);
    fireEvent.click(screen.getByText('Kiểm tra'));
    answerAll(true);
    expect(screen.getByRole('status')).toHaveTextContent('Đạt!');
    expect(screen.queryByText('Bài kế tiếp →')).toBeNull();
  });
});
