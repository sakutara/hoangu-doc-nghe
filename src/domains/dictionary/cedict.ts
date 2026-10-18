import type { SmartSegmenter } from './SmartSegmenter';
import type { DictionaryEntry } from './types';

/** [giản thể, phồn thể ('' nếu giống), pinyin, nghĩa tiếng Việt] — public/cedict.json (nghĩa đã dịch thủ công; build-cedict.mjs sẽ ghi đè lại tiếng Anh) */
export type CedictRow = [string, string, string, string];

/** Hán-Việt ghép từ từng chữ đã biết; thiếu một chữ thì bỏ trống thay vì đoán sai. */
function hanVietOf(word: string, seg: SmartSegmenter): string {
  const parts: string[] = [];
  for (const ch of word) {
    const hv = seg.lookup(ch)?.hanViet;
    if (!hv) return '';
    parts.push(hv.split(' ')[0]);
  }
  return parts.join(' ');
}

export function cedictToEntries(rows: CedictRow[], seg: SmartSegmenter): DictionaryEntry[] {
  const merged = new Map<string, DictionaryEntry>();
  for (const [simplified, traditional, pinyin, meaning] of rows) {
    const prev = merged.get(simplified);
    if (prev) {
      if (prev.meanings.length < 4) prev.meanings.push(`${pinyin}: ${meaning}`);
      continue;
    }
    merged.set(simplified, {
      simplified, pinyin, hanViet: hanVietOf(simplified, seg), meanings: [meaning],
      category: [...simplified].length > 1 ? 'compound' : 'core',
      ...(traditional ? { traditional } : {}),
    });
  }
  return [...merged.values()];
}

let loading: Promise<number> | undefined;

/** Tải cedict.json (lười, chạy nền) và nạp vào segmenter; trả về số mục mới thêm. */
export function loadCedict(seg: SmartSegmenter, url: string, fetchFn: typeof fetch = fetch): Promise<number> {
  loading ??= fetchFn(url)
    .then((r) => { if (!r.ok) throw new Error(`cedict ${r.status}`); return r.json() as Promise<CedictRow[]>; })
    .then((rows) => seg.addEntries(cedictToEntries(rows, seg)))
    .catch(() => { loading = undefined; return 0; });
  return loading;
}
