import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/data/curriculum';
import { CORE_LEXICON } from '../src/data/coreLexicon';
import freq from './fixtures/subtlex-top12000.json';

/**
 * Độ phủ giáo trình trên kho tần suất phụ đề phim (SUBTLEX-CH, đã loại tên riêng và ký hiệu).
 * `total` là tổng số lượt từ Hán; chỉ tính 12.000 từ phổ biến nhất ở tử số nên con số là cận dưới.
 */
const words = freq.words as Array<[string, number]>;
const total = freq.total as number;
const known = new Set([...LESSONS.flatMap((l) => l.vocab.map((v) => v.simplified)), ...CORE_LEXICON.map((e) => e.simplified)]);
const knownChars = new Set([...known].flatMap((w) => [...w]));
const sum = (pred: (w: string) => boolean) => words.reduce((n, [w, c]) => n + (pred(w) ? c : 0), 0) / total;

describe('độ phủ từ vựng của giáo trình (mục tiêu ≥ 90% từ gặp khi đọc/xem)', () => {
  it('phủ ≥ 90% lượt từ (so khớp nguyên từ)', () => {
    expect(sum((w) => known.has(w))).toBeGreaterThanOrEqual(0.9);
  });
  it('phủ ≥ 97% lượt từ khi tính cả từ ghép mà mọi chữ cấu thành đã học', () => {
    expect(sum((w) => known.has(w) || [...w].every((c) => knownChars.has(c)))).toBeGreaterThanOrEqual(0.97);
  });
  it('3.000 từ phổ biến nhất đều có trong giáo trình, trừ tên riêng/tục/từ rất hiếm (≥ 97%)', () => {
    const top = words.slice(0, 3000);
    const hit = top.filter(([w]) => known.has(w)).length / top.length;
    expect(hit).toBeGreaterThanOrEqual(0.97);
  });
});

describe('câu ví dụ trong Đọc & Nghe', () => {
  it('mọi từ vựng của bài đều xuất hiện trong ít nhất một câu của bài đó', () => {
    const missing = LESSONS.flatMap((l) => l.vocab.filter((v) => !l.lines.some((x) => x.zh.includes(v.simplified))).map((v) => `${l.id}:${v.simplified}`));
    expect(missing).toEqual([]);
  });
});
