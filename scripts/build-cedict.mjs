// Chuyển CC-CEDICT (cedict_ts.u8) thành data/cedict.en.json (bản tiếng Anh gốc, không phục vụ).
// Dùng: node scripts/build-cedict.mjs <đường-dẫn/cedict_ts.u8>
// Mỗi dòng: [giản thể, phồn thể ('' nếu giống), pinyin có dấu, nghĩa (nối bằng " / ")]
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) throw new Error('Thiếu đường dẫn cedict_ts.u8');

const TONES = { a: 'āáǎàa', e: 'ēéěèe', i: 'īíǐìi', o: 'ōóǒòo', u: 'ūúǔùu', ü: 'ǖǘǚǜü' };
function syllable(s) {
  const m = /^([a-züÜA-Z:]+)([1-5])$/.exec(s);
  if (!m) return s;
  let base = m[1].replace(/u:|U:/g, 'ü').replace(/v/g, 'ü');
  const tone = Number(m[2]) - 1;
  const lower = base.toLowerCase();
  let idx = lower.search(/[aeo]/);
  if (lower.includes('ou')) idx = lower.indexOf('o');
  if (idx < 0) idx = Math.max(lower.lastIndexOf('i'), lower.lastIndexOf('u'), lower.lastIndexOf('ü'));
  if (idx < 0) return base;
  const ch = lower[idx];
  const mark = TONES[ch][tone];
  const out = base[idx] === base[idx].toUpperCase() && base[idx] !== lower[idx] ? mark.toUpperCase() : mark;
  return base.slice(0, idx) + out + base.slice(idx + 1);
}
const pinyin = (p) => p.split(' ').map(syllable).join(' ');

const rows = [];
for (const line of readFileSync(src, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const m = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/$/.exec(line.trimEnd());
  if (!m) continue;
  const [, trad, simp, py, defs] = m;
  const meanings = defs.split('/').filter((d) => d && !/^(CL:|old variant of|variant of|erhua variant of|see |abbr\. for)/.test(d)).slice(0, 4);
  if (!meanings.length) continue;
  rows.push([simp, trad === simp ? '' : trad, pinyin(py), meanings.join(' / ')]);
}
// Ghi bản tiếng Anh vào data/ (không phục vụ). Bản app dùng là public/cedict.json (tiếng Việt, đã dịch).
writeFileSync(new URL('../data/cedict.en.json', import.meta.url), JSON.stringify(rows));
console.log(`${rows.length} mục`);
