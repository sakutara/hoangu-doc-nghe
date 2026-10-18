import type { DictionaryEntry, SegmentedToken } from './types';

const MAX_WORD_LEN = 8;
const CJK_OR_ALNUM = /[㐀-鿿0-9A-Za-z]/;

const CATEGORY_WEIGHT: Record<DictionaryEntry['category'], number> = {
  idiom: 5, slang: 5, gaming: 4, loanword: 4, compound: 3, core: 1,
};

export class SmartSegmenter {
  private readonly index = new Map<string, DictionaryEntry>();

  constructor(lexicon: DictionaryEntry[]) {
    for (const entry of lexicon) {
      const prev = this.index.get(entry.simplified);
      if (!prev || this.score(entry) > this.score(prev)) this.index.set(entry.simplified, entry);
    }
  }

  private score(e: DictionaryEntry): number {
    return CATEGORY_WEIGHT[e.category] * 10 + (e.priority ?? 0);
  }

  /** Bổ sung từ điển ngoài (CC-CEDICT): chỉ thêm mục chưa có, mục biên soạn tay luôn thắng. */
  addEntries(entries: Iterable<DictionaryEntry>): number {
    let added = 0;
    for (const e of entries) {
      if (this.index.has(e.simplified)) continue;
      this.index.set(e.simplified, e);
      added++;
    }
    return added;
  }

  lookup(word: string): DictionaryEntry | undefined {
    return this.index.get(word);
  }

  private constituentsOf(word: string): DictionaryEntry[] {
    if (word.length < 2) return [];
    const parts: DictionaryEntry[] = [];
    for (const ch of word) {
      const e = this.index.get(ch);
      if (e) parts.push(e);
    }
    return parts;
  }

  /** Tách toàn câu bằng longest-prefix-match (tối đa 8 ký tự). */
  segmentSentence(sentence: string): SegmentedToken[] {
    const tokens: SegmentedToken[] = [];
    let i = 0;
    while (i < sentence.length) {
      const ch = sentence[i];
      if (!CJK_OR_ALNUM.test(ch)) {
        tokens.push({ text: ch, startIndex: i, endIndex: i + 1, isChineseOrAlnum: false, constituents: [] });
        i += 1;
        continue;
      }
      let matched = false;
      for (let len = Math.min(MAX_WORD_LEN, sentence.length - i); len >= 1; len--) {
        const text = sentence.slice(i, i + len);
        const entry = this.index.get(text);
        if (entry) {
          tokens.push({
            text, startIndex: i, endIndex: i + len, isChineseOrAlnum: true, entry,
            constituents: this.constituentsOf(text),
          });
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) {
        tokens.push({ text: ch, startIndex: i, endIndex: i + 1, isChineseOrAlnum: true, constituents: [] });
        i += 1;
      }
    }
    return tokens;
  }

  /**
   * Tra từ tại vị trí chạm: ưu tiên token của phép tách câu chứa charIndex;
   * nếu token đó chỉ là chữ lẻ chưa có nghĩa thì thử cụm dài nhất chứa charIndex (kể cả chồng ranh giới).
   */
  lookupAtPosition(sentence: string, charIndex: number): SegmentedToken | null {
    if (charIndex < 0 || charIndex >= sentence.length) return null;
    if (!CJK_OR_ALNUM.test(sentence[charIndex])) return null;
    const seg = this.segmentSentence(sentence).find((t) => charIndex >= t.startIndex && charIndex < t.endIndex);
    if (seg?.entry) return seg;
    for (let len = MAX_WORD_LEN; len >= 1; len--) {
      const lo = Math.max(0, charIndex - len + 1);
      const hi = Math.min(charIndex, sentence.length - len);
      for (let start = lo; start <= hi; start++) {
        const text = sentence.slice(start, start + len);
        const entry = this.index.get(text);
        if (entry) {
          return {
            text, startIndex: start, endIndex: start + len, isChineseOrAlnum: true, entry,
            constituents: this.constituentsOf(text),
          };
        }
      }
    }
    return {
      text: sentence[charIndex], startIndex: charIndex, endIndex: charIndex + 1,
      isChineseOrAlnum: true, constituents: [],
    };
  }
}
