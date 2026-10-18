import { CORE_LEXICON } from '../../data/coreLexicon';
import { LESSONS } from '../../data/curriculum';
import { SmartSegmenter } from './SmartSegmenter';
import type { DictionaryEntry } from './types';

/** Từ vựng trong giáo trình luôn tra được: mục nào chưa có trong từ điển lõi sẽ được thêm từ bài học. */
function lessonEntries(known: Set<string>): DictionaryEntry[] {
  const out: DictionaryEntry[] = [];
  for (const lesson of LESSONS) {
    for (const v of lesson.vocab) {
      if (known.has(v.simplified)) continue;
      known.add(v.simplified);
      out.push({
        simplified: v.simplified, pinyin: v.pinyin, hanViet: v.hanViet, meanings: [v.meaning],
        category: [...v.simplified].length >= 4 ? 'idiom' : 'compound',
        ...(v.traditional ? { traditional: v.traditional } : {}),
      });
    }
  }
  return out;
}

export const defaultSegmenter = new SmartSegmenter([
  ...CORE_LEXICON,
  ...lessonEntries(new Set(CORE_LEXICON.map((e) => e.simplified))),
]);
export { SmartSegmenter };
export * from './types';
