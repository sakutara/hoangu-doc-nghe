import type { SmartSegmenter } from '../dictionary/SmartSegmenter';

export type Glossary = Record<string, string>;

export interface ChapterText {
  title: string;
  paragraphs: string[];
}

export interface ITranslationProvider {
  translateBookTitle(zh: string): Promise<string>;
  translateChapterTitle(zh: string): Promise<string>;
  translateParagraphs(zh: string[]): Promise<string[]>;
  /** Dịch cả chương một lượt (tiêu đề + đoạn văn) theo ngữ cảnh, kèm bảng thuật ngữ cập nhật. */
  translateChapter?(ch: ChapterText, glossary: Glossary): Promise<ChapterText & { glossary: Glossary }>;
}

const NUM: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const PUNCT: Record<string, string> = {
  '，': ', ', '。': '. ', '！': '! ', '？': '? ', '：': ': ', '；': '; ', '、': ', ',
  '“': '"', '”': '"', '‘': "'", '’': "'", '（': ' (', '）': ') ', '《': '"', '》': '"', '…': '... ',
};

export function chineseNumberToInt(s: string): number | null {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (![...s].every((c) => c in NUM || '十百千'.includes(c))) return null;
  if (!/[十百千]/.test(s)) return parseInt([...s].map((c) => NUM[c]).join(''), 10);
  let total = 0, cur = 0;
  for (const ch of s) {
    if (ch in NUM) cur = NUM[ch];
    else {
      total += (cur || 1) * (ch === '十' ? 10 : ch === '百' ? 100 : 1000);
      cur = 0;
    }
  }
  return total + cur;
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Dịch offline: tách từ bằng SmartSegmenter, ưu tiên nghĩa Việt; từ lạ → Hán-Việt từng chữ. */
export class OfflineSmartTranslator implements ITranslationProvider {
  constructor(private seg: SmartSegmenter) {}

  private renderText(zh: string, preferHanViet: boolean): string {
    const out: string[] = [];
    for (const t of this.seg.segmentSentence(zh)) {
      if (!t.isChineseOrAlnum) { out.push(PUNCT[t.text] ?? t.text); continue; }
      if (!t.entry) { out.push(t.text + ' '); continue; }
      const useHv = preferHanViet && t.entry.category !== 'slang';
      const raw = useHv ? t.entry.hanViet : t.entry.meanings[0];
      out.push((preferHanViet ? raw : raw.split(/[,;(]/)[0].trim()) + ' ');
    }
    return out.join('').replace(/\s+([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim();
  }

  async translateBookTitle(zh: string) {
    return zh.split(/\s+/).map((p) => this.renderText(p, true).split(' ').map(cap).join(' ')).join(' ');
  }

  async translateChapterTitle(zh: string) {
    const m = /^第\s*([零一二两三四五六七八九十百千\d]+)\s*[章节節回]\s*(.*)$/.exec(zh);
    if (!m) return this.renderText(zh, false);
    const n = chineseNumberToInt(m[1]);
    const rest = m[2] ? cap(this.renderText(m[2], false)) : '';
    return `Chương ${n!}${rest ? `: ${rest}` : ''}`;
  }

  async translateParagraphs(zh: string[]) {
    return zh.map((p) => cap(this.renderText(p, false)));
  }
}

/** Provider online tùy chọn: gọi API dịch tự cấu hình, rơi về offline nếu thiếu. */
export class CustomFetcherTranslator implements ITranslationProvider {
  constructor(
    private fetcher: (text: string) => Promise<string>,
    private fallback: ITranslationProvider,
  ) {}
  translateBookTitle(zh: string) { return this.fetcher(zh); }
  translateChapterTitle(zh: string) { return this.fallback.translateChapterTitle(zh); }
  async translateParagraphs(zh: string[]) {
    const out: string[] = [];
    for (const p of zh) out.push(await this.fetcher(p));
    return out;
  }
}
