export type WordCategory = 'core' | 'compound' | 'idiom' | 'slang' | 'gaming' | 'loanword';

export interface DictionaryEntry {
  simplified: string;
  traditional?: string;
  pinyin: string;
  hanViet: string;
  meanings: string[];
  category: WordCategory;
  englishOrigin?: string;
  example?: { zh: string; pinyin: string; vi: string };
  priority?: number;
}

export interface SegmentedToken {
  text: string;
  startIndex: number;
  endIndex: number;
  isChineseOrAlnum: boolean;
  entry?: DictionaryEntry;
  constituents: DictionaryEntry[];
}
