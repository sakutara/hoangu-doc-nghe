import { describe, expect, it } from 'vitest';
import { LESSONS, LEVEL_TITLES } from '../src/data/curriculum';
import {
  completionPercent, isLessonUnlocked, nextLesson, recordAttempt, sortLessons,
} from '../src/domains/curriculum/CurriculumProgress';
import { generateQuiz, PASS_PERCENT, QUIZ_SIZE, scoreQuiz, shuffle, updateSeen } from '../src/domains/curriculum/QuizEngine';
import { StorageService } from '../src/services/storage/StorageService';
import { InMemoryMetaStore } from '../src/services/storage/MemoryBackends';
import { memStorage } from './helpers';

function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

describe('dữ liệu giáo trình', () => {
  it('4 cấp, mỗi bài đủ từ & câu, id duy nhất', () => {
    expect(new Set(LESSONS.map((l) => l.level))).toEqual(new Set([1, 2, 3, 4]));
    expect(Object.keys(LEVEL_TITLES)).toHaveLength(4);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const l of LESSONS) {
      expect(l.vocab.length, l.id).toBeGreaterThanOrEqual(6);
      expect(l.lines.length, l.id).toBeGreaterThanOrEqual(3);
      for (const v of l.vocab) expect(v.pinyin && v.hanViet && v.meaning, `${l.id} ${v.simplified}`).toBeTruthy();
      for (const ln of l.lines) expect(ln.zh && ln.pinyin && ln.vi, `${l.id} ${ln.zh}`).toBeTruthy();
    }
  });

  it('quy mô đủ đọc truyện: ≥ 250 bài, ≥ 6.000 từ, mỗi cấp ≥ 50 bài; thứ tự id liền mạch theo cấp', () => {
    const words = LESSONS.flatMap((l) => l.vocab);
    expect(LESSONS.length).toBeGreaterThanOrEqual(250);
    expect(words.length).toBeGreaterThanOrEqual(6000);
    for (const lv of [1, 2, 3, 4]) {
      const ls = LESSONS.filter((l) => l.level === lv);
      expect(ls.length).toBeGreaterThanOrEqual(50);
      ls.forEach((l, i) => { expect(l.order).toBe(i + 1); expect(l.id).toBe(`l${lv}-${i + 1}`); });
    }
  });

  it('mỗi từ chỉ xuất hiện một lần; nghĩa Việt duy nhất để câu "Việt → Hán" không có hai đáp án đúng', () => {
    const words = LESSONS.flatMap((l) => l.vocab);
    const dupWords = words.map((v) => v.simplified).filter((w, i, a) => a.indexOf(w) !== i);
    expect(dupWords).toEqual([]);
    const count = new Map<string, string[]>();
    for (const v of words) count.set(v.meaning, [...(count.get(v.meaning) ?? []), v.simplified]);
    const dupMeanings = [...count.entries()].filter(([, ws]) => ws.length > 1);
    expect(dupMeanings).toEqual([]);
  });

  it('Hán-Việt đầy đủ (không còn "?") và chỉ gồm chữ cái tiếng Việt', () => {
    for (const l of LESSONS) for (const v of l.vocab) {
      expect(v.hanViet, `${l.id} ${v.simplified}`).not.toContain('?');
      expect(v.hanViet, `${l.id} ${v.simplified}`).toMatch(/^[\p{L} ]+$/u);
    }
  });

});

describe('QuizEngine', () => {
  it('shuffle giữ phần tử, không đổi mảng gốc', () => {
    const a = [1, 2, 3, 4, 5];
    const r = shuffle(a, seeded());
    expect([...r].sort()).toEqual(a);
    expect(a).toEqual([1, 2, 3, 4, 5]);
    expect(shuffle([1, 2, 3]).length).toBe(3);
  });

  it('mỗi câu 4 đáp án duy nhất, answerIndex đúng, chỉ chữ Hán/nghĩa Việt', () => {
    for (const lesson of LESSONS) {
      const qs = generateQuiz(lesson, LESSONS, seeded(7));
      expect(qs).toHaveLength(Math.min(QUIZ_SIZE, lesson.vocab.length + lesson.lines.length));
      expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
      expect(qs.filter((q) => q.kind === 'read_translation').length).toBeLessThanOrEqual(2);
      for (const q of qs) {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.answerIndex).toBeGreaterThanOrEqual(0);
      }
      const hv = new Set(lesson.vocab.flatMap((v) => [v.hanViet, v.pinyin]).filter((x) => !lesson.vocab.some((v) => v.meaning === x)));
      for (const q of qs) for (const t of [q.prompt, ...q.options]) expect(hv.has(t)).toBe(false);
    }
  });

  it('đáp án đúng khớp với mục được hỏi ở cả 4 dạng; dạng câu hỏi ngẫu nhiên', () => {
    const lesson = LESSONS[0];
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      for (const q of generateQuiz(lesson, LESSONS, seeded(seed))) {
        kinds.add(q.kind);
        const ans = q.options[q.answerIndex];
        const i = Number(q.id.split('-').at(-1)!.slice(1));
        if (q.kind === 'read_translation') expect(ans).toBe(lesson.lines[i].vi);
        else if (q.kind === 'viet_to_hanzi') { expect(ans).toBe(lesson.vocab[i].simplified); expect(q.prompt).toBe(lesson.vocab[i].meaning); }
        else { expect(ans).toBe(lesson.vocab[i].meaning); expect(q.audioText ?? q.prompt).toBe(lesson.vocab[i].simplified); }
      }
    }
    expect(kinds).toEqual(new Set(['listen_meaning', 'hanzi_to_viet', 'viet_to_hanzi', 'read_translation']));
  });

  it('mỗi lần lấy bộ câu khác nhau, không lặp mục cũ cho tới khi đã ra hết, rồi vòng mới', () => {
    const lesson = LESSONS[0];
    let seen: string[] = [];
    const rng = seeded(3);
    const covered = new Set<string>();
    for (let round = 0; round < 3; round++) {
      const qs = generateQuiz(lesson, LESSONS, rng, seen);
      const ids = qs.map((q) => q.id);
      const coveredV = [...covered].filter((c) => c.includes('-v')).length;
      const idsV = ids.filter((c) => c.includes('-v')).length;
      const coveredL = covered.size - coveredV;
      const idsL = ids.length - idsV;
      for (const id of ids) {
        const fits = id.includes('-v') ? coveredV + idsV <= lesson.vocab.length : coveredL + idsL <= lesson.lines.length;
        if (fits) expect(covered.has(id), `lặp ${id}`).toBe(false);
      }
      ids.forEach((id) => covered.add(id));
      seen = updateSeen(lesson, seen, qs);
    }
    expect(covered.size).toBeGreaterThan(QUIZ_SIZE); // có mục mới ở các lần sau
    // ngẫu nhiên thật: hai bộ độc lập khác nhau
    const x = generateQuiz(lesson, LESSONS, seeded(11)).map((q) => q.id).join();
    const y = generateQuiz(lesson, LESSONS, seeded(12)).map((q) => q.id).join();
    expect(x).not.toBe(y);
    // đã ra hết mọi mục → vòng mới chỉ giữ câu của lần này
    const all = [...lesson.vocab.map((_, i) => `${lesson.id}-v${i}`), ...lesson.lines.map((_, i) => `${lesson.id}-l${i}`)];
    const qs = generateQuiz(lesson, LESSONS, seeded(5), all);
    expect(qs).toHaveLength(QUIZ_SIZE);
    expect(updateSeen(lesson, all, qs).sort()).toEqual(qs.map((q) => q.id).sort());
    expect(updateSeen(lesson, [], qs)).toHaveLength(QUIZ_SIZE);
  });

  it('thiếu distractor thì chỉ có ít đáp án hơn, không lỗi; mặc định chỉ dùng chính bài', () => {
    const qs = generateQuiz(LESSONS[0]);
    expect(qs.length).toBeGreaterThan(0);
    expect(generateQuiz({ ...LESSONS[0], vocab: [LESSONS[0].vocab[0]], lines: [] }, [LESSONS[0]])[0].options).toHaveLength(4);
    expect(generateQuiz({ ...LESSONS[0], vocab: [LESSONS[0].vocab[0]], lines: [] })[0].options).toHaveLength(1);
  });

  it('StorageService lưu mục đã ra theo từng bài', () => {
    const st = new StorageService(memStorage(), new InMemoryMetaStore());
    expect(st.getQuizSeen('l1-1')).toEqual([]);
    st.saveQuizSeen('l1-1', ['a']); st.saveQuizSeen('l1-2', ['b']);
    expect(st.getQuizSeen('l1-1')).toEqual(['a']);
    expect(st.getQuizSeen('l1-2')).toEqual(['b']);
  });

  it('chấm điểm và ngưỡng 80%', () => {
    const qs = generateQuiz(LESSONS[0], LESSONS, seeded());
    const all = qs.map((q) => q.answerIndex);
    expect(scoreQuiz(qs, all)).toMatchObject({ percent: 100, passed: true });
    const bad = Math.ceil(qs.length * 0.25); // sai 25% → 75% < 80%
    const wrong = all.map((a, i) => (i < bad ? (a + 1) % 4 : a));
    expect(scoreQuiz(qs, wrong).passed).toBe(false);
    expect(scoreQuiz(qs, []).percent).toBe(0);
    expect(scoreQuiz([], []).percent).toBe(0);
    expect(PASS_PERCENT).toBe(80);
    const five = qs.slice(0, 5);
    expect(scoreQuiz(five, five.map((q, i) => (i === 0 ? (q.answerIndex + 1) % 4 : q.answerIndex))).passed).toBe(true); // 80%
  });
});

describe('CurriculumProgress', () => {
  it('mở khóa tuần tự theo (level, order)', () => {
    const shuffled = [...LESSONS].reverse();
    expect(sortLessons(shuffled)[0].id).toBe('l1-1');
    expect(isLessonUnlocked(LESSONS, {}, 'l1-1')).toBe(true);
    expect(isLessonUnlocked(LESSONS, {}, 'l1-2')).toBe(false);
    expect(isLessonUnlocked(LESSONS, {}, 'nope')).toBe(false);
    const p = recordAttempt({}, 'l1-1', 90);
    expect(isLessonUnlocked(LESSONS, p, 'l1-2')).toBe(true);
    expect(isLessonUnlocked(LESSONS, p, 'l2-1')).toBe(false);
    // qua cấp: bài cuối cấp 1 đạt chuẩn thì bài đầu cấp 2 mở
    const lastL1 = LESSONS.filter((l) => l.level === 1).at(-1)!;
    expect(isLessonUnlocked(LESSONS, recordAttempt({}, lastL1.id, 100), 'l2-1')).toBe(true);
  });
  it('recordAttempt giữ điểm cao nhất và trạng thái đã đạt', () => {
    let p = recordAttempt({}, 'a', 50);
    expect(p.a).toEqual({ bestScore: 50, completed: false, attempts: 1 });
    p = recordAttempt(p, 'a', 85);
    p = recordAttempt(p, 'a', 40);
    expect(p.a).toEqual({ bestScore: 85, completed: true, attempts: 3 });
  });
  it('completionPercent, nextLesson', () => {
    expect(completionPercent([], {})).toBe(0);
    expect(completionPercent(LESSONS, {})).toBe(0);
    expect(completionPercent(LESSONS.slice(0, 2), { 'l1-1': { bestScore: 100, completed: true, attempts: 1 } })).toBe(50);
    expect(nextLesson(LESSONS, 'l1-1')!.id).toBe('l1-2');
    expect(nextLesson(LESSONS, LESSONS.at(-1)!.id)).toBeUndefined();
  });
  it('lưu tiến độ', () => {
    const s = new StorageService(memStorage(), new InMemoryMetaStore());
    expect(s.getLessonProgress()).toEqual({});
    s.saveLessonProgress({ x: { bestScore: 1, completed: false, attempts: 1 } });
    expect(s.getLessonProgress().x.bestScore).toBe(1);
  });
});
