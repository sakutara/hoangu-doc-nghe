import type { Lesson } from '../domains/curriculum/types';
import { LEVEL_1 } from './lessons/level1';
import { LEVEL_2 } from './lessons/level2';
import { LEVEL_3 } from './lessons/level3';
import { LEVEL_4 } from './lessons/level4';
import { EXTRA_LINES } from './lessons/examples';
import { lines } from './lessons/helpers';

export const LEVEL_TITLES: Record<number, string> = {
  1: 'Cấp 1 — Nền tảng nhập môn & Hán-Việt cốt lõi',
  2: 'Cấp 2 — Giao tiếp phim ảnh & lướt web',
  3: 'Cấp 3 — Tiểu thuyết mạng & thế giới game',
  4: 'Cấp 4 — Thành ngữ, lóng hiện đại & đọc đoạn dài',
};

/** ~6.500 từ / 265 bài; thứ tự mở khóa theo (cấp, thứ tự). Dữ liệu sinh từ nguồn giáo trình, xem docs EPIC-02. */
export const LESSONS: Lesson[] = [...LEVEL_1, ...LEVEL_2, ...LEVEL_3, ...LEVEL_4].map((l) =>
  EXTRA_LINES[l.id] ? { ...l, lines: [...l.lines, ...lines(EXTRA_LINES[l.id])] } : l,
);
