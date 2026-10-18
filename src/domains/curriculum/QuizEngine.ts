import type { Lesson, QuizQuestion } from './types';

export const PASS_PERCENT = 80;
const OPTIONS = 4;

export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Đáp án sai ưu tiên lấy từ chính bài (`near`), thiếu thì bổ sung từ bài khác cùng cấp (`far`); loại trùng. */
function buildOptions(answer: string, near: string[], far: string[], rng: () => number) {
  const pick = (pool: string[]) => shuffle([...new Set(pool)].filter((p) => p !== answer), rng);
  const nearPick = pick(near).slice(0, OPTIONS - 1);
  const farPick = pick(far).filter((p) => !nearPick.includes(p)).slice(0, OPTIONS - 1 - nearPick.length);
  const options = shuffle([answer, ...nearPick, ...farPick], rng);
  return { options, answerIndex: options.indexOf(answer) };
}

/** Mỗi lần kiểm tra lấy ngẫu nhiên tối đa ngần này câu từ kiến thức của bài (từ vựng + câu đọc). */
export const QUIZ_SIZE = 12;
const LINES_PER_QUIZ = 2;

/**
 * Chọn ngẫu nhiên các mục (từ/câu) để kiểm tra, ưu tiên mục CHƯA từng ra ở các lần trước (`seen` = id câu đã ra).
 * Khi số mục chưa ra không đủ thì lấy hết chúng rồi bổ sung ngẫu nhiên từ mục đã ra (vòng mới).
 */
function sample<T extends { id: string }>(items: T[], count: number, seen: ReadonlySet<string>, rng: () => number): T[] {
  const fresh = shuffle(items.filter((x) => !seen.has(x.id)), rng);
  if (fresh.length >= count) return fresh.slice(0, count);
  return [...fresh, ...shuffle(items.filter((x) => seen.has(x.id)), rng).slice(0, count - fresh.length)];
}

/**
 * Chỉ kiểm tra chữ Hán ↔ nghĩa Việt (không pinyin, không Hán-Việt). Mỗi lần: lấy ngẫu nhiên QUIZ_SIZE mục của bài
 * (tối đa 2 câu đọc, còn lại là từ vựng), dạng câu hỏi của từ cũng ngẫu nhiên, và tránh các mục đã ra ở lần trước.
 */
export function generateQuiz(
  lesson: Lesson, allLessons: Lesson[] = [lesson], rng: () => number = Math.random, seen: Iterable<string> = [],
): QuizQuestion[] {
  const seenSet = new Set(seen);
  const others = allLessons.filter((l) => l !== lesson && l.level === lesson.level);
  const farVocab = others.flatMap((l) => l.vocab);
  const farMeanings = farVocab.map((x) => x.meaning);
  const farHanzi = farVocab.map((x) => x.simplified);
  const nearMeanings = lesson.vocab.map((x) => x.meaning);
  const nearHanzi = lesson.vocab.map((x) => x.simplified);
  const nearLines = lesson.lines.map((x) => x.vi);
  const farLineVi = others.flatMap((l) => l.lines).map((x) => x.vi);

  const vocabItems = lesson.vocab.map((v, i) => ({ id: `${lesson.id}-v${i}`, v }));
  const lineItems = lesson.lines.map((l, i) => ({ id: `${lesson.id}-l${i}`, l }));
  const nLines = Math.min(LINES_PER_QUIZ, lineItems.length, Math.max(0, QUIZ_SIZE - 1));
  const lines = sample(lineItems, nLines, seenSet, rng);
  const vocab = sample(vocabItems, Math.min(vocabItems.length, QUIZ_SIZE - lines.length), seenSet, rng);

  const kinds = ['listen_meaning', 'hanzi_to_viet', 'viet_to_hanzi'] as const;
  const qs: QuizQuestion[] = vocab.map(({ id, v }) => {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    if (kind === 'listen_meaning') return { id, kind, prompt: 'Nghe và chọn nghĩa đúng', audioText: v.simplified, ...buildOptions(v.meaning, nearMeanings, farMeanings, rng) };
    if (kind === 'hanzi_to_viet') return { id, kind, prompt: v.simplified, ...buildOptions(v.meaning, nearMeanings, farMeanings, rng) };
    return { id, kind, prompt: v.meaning, ...buildOptions(v.simplified, nearHanzi, farHanzi, rng) };
  });
  for (const { id, l } of lines) {
    qs.push({ id, kind: 'read_translation', prompt: l.zh, ...buildOptions(l.vi, nearLines, farLineVi, rng) });
  }
  return shuffle(qs, rng);
}

/** Ghi nhận các câu vừa ra; khi đã ra hết mọi mục của bài thì bắt đầu vòng mới (chỉ giữ các câu của lần này). */
export function updateSeen(lesson: Lesson, seen: Iterable<string>, questions: QuizQuestion[]): string[] {
  const all = new Set([...seen, ...questions.map((q) => q.id)]);
  return all.size >= lesson.vocab.length + lesson.lines.length ? questions.map((q) => q.id) : [...all];
}

export function scoreQuiz(questions: QuizQuestion[], answers: Array<number | undefined>) {
  const correct = questions.filter((q, i) => answers[i] === q.answerIndex).length;
  const total = questions.length;
  const percent = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { correct, total, percent, passed: percent >= PASS_PERCENT };
}
