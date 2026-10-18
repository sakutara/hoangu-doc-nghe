"""Gộp câu ví dụ bổ sung (examples/out/*.txt: `id | 中文 | Việt`) thành src/data/lessons/examples.ts, pinyin sinh tự động."""
import glob, json, re, collections, unicodedata
import jieba
from pypinyin import pinyin, Style

HZ = re.compile(r'[一-鿿]')
PUNCT = {'。': '.', '？': '?', '！': '!', '，': ',', '、': ',', '；': ';', '：': ':', '“': '"', '”': '"', '（': '(', '）': ')'}

def _tone(s):
    for c, n in (('\u0304', 1), ('\u0301', 2), ('\u030c', 3), ('\u0300', 4)):
        if c in unicodedata.normalize('NFD', s): return n
    return 5

def sent_pinyin(zh):
    words = list(jieba.cut(zh))
    flat = []
    for w in words:
        if HZ.search(w): flat += [s[0] for s in pinyin(w, style=Style.TONE, neutral_tone_with_five=False)]
    chars = [c for w in words if HZ.search(w) for c in w]
    for i, (c, s) in enumerate(zip(chars, flat)):
        nxt = _tone(flat[i + 1]) if i + 1 < len(flat) else 0
        if c == '不' and nxt == 4: flat[i] = 'bú'
        elif c == '一' and nxt:
            flat[i] = 'yí' if nxt == 4 else 'yì'
    out, k, first = [], 0, True
    for w in words:
        if HZ.search(w):
            t = ''.join(flat[k:k + len(w)]); k += len(w)
            if first: t = t[0].upper() + t[1:]; first = False
            out.append(' ' + t)
        else:
            out.append(''.join(PUNCT.get(c, c) for c in w))
    return ''.join(out).strip().replace(' ,', ',').replace(' .', '.').replace(' ?', '?').replace(' !', '!')

rows = collections.OrderedDict()
seen = set()
for f in sorted(glob.glob('examples/out/*.txt')):
    for ln in open(f, encoding='utf-8'):
        ln = ln.strip()
        if not ln: continue
        p = [x.strip() for x in ln.split('|')]
        if len(p) != 3 or (p[0], p[1]) in seen: continue
        seen.add((p[0], p[1]))
        rows.setdefault(p[0], []).append([p[1], sent_pinyin(p[1]), p[2]])

body = ',\n'.join(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in rows.items())
open('../../src/data/lessons/examples.ts', 'w', encoding='utf-8').write(
    "// Tệp sinh tự động bởi scripts/curriculum/examples.py từ examples/out/*.txt — câu ví dụ bổ sung cho từ vựng của từng bài.\n"
    "import type { LineRow } from './helpers';\n\n"
    f"export const EXTRA_LINES: Record<string, LineRow[]> = {{\n{body},\n}};\n")
print(sum(len(v) for v in rows.values()), 'câu,', len(rows), 'bài')
