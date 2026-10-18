import json,os,re
from build import *
L=parse(); ls=assemble(L); prime(ls)
GROUP_ORDER={3:['G','F'],4:['C','S','F','X'],1:['F'],2:['F']}
def lv_of(key):
    return int(key[1])
by={1:[],2:[],3:[],4:[]}
for l in ls: by[lv_of(l['key'])].append(l)
out='../../src/data/lessons'
os.makedirs(out,exist_ok=True)
stats={}
def q(s): return json.dumps(s,ensure_ascii=False)
for lv in (1,2,3,4):
    items=sorted(by[lv],key=lambda l:(GROUP_ORDER[lv].index(l['key'][0]),int(l['key'].split('-')[1])))
    lines=["// Tệp sinh tự động từ nguồn giáo trình (xem docs/epics/epic-2-curriculum-and-quizzes). Chỉnh sửa nội dung bằng cách sửa nguồn rồi sinh lại.",
           "import type { Lesson } from '../../domains/curriculum/types';","import { lesson } from './helpers';","",f"export const LEVEL_{lv}: Lesson[] = ["]
    for i,l in enumerate(items,1):
        lid=f'l{lv}-{i}'
        v=[]
        for w in l['vocab']:
            row=[w['w'],w['py'],w['hv'],w['vi']]
            if w.get('trad'): row.append(w['trad'])
            v.append('['+','.join(q(x) for x in row)+']')
        ln=[ '['+','.join(q(x) for x in (zh,sent_pinyin(zh),vi))+']' for zh,vi in l['lines']]
        lines.append(f"  lesson({q(lid)}, {lv}, {i}, {q(l['title'])},")
        lines.append("    ["+",\n     ".join(v)+"],")
        lines.append("    ["+",\n     ".join(ln)+"]),")
        l['id']=lid
    lines.append("];")
    open(f'{out}/level{lv}.ts','w',encoding='utf8').write('\n'.join(lines)+'\n')
    stats[lv]=(len(items),sum(len(l['vocab']) for l in items))
open(f'{out}/helpers.ts','w',encoding='utf8').write('''import type { Lesson, LessonLine, VocabItem } from '../../domains/curriculum/types';

/** [giản thể, pinyin, Hán-Việt, nghĩa Việt, phồn thể?] */
export type VocabRow = [string, string, string, string, string?];
/** [chữ Hán, pinyin, bản dịch Việt] */
export type LineRow = [string, string, string];

export const vocab = (rows: VocabRow[]): VocabItem[] =>
  rows.map(([simplified, pinyin, hanViet, meaning, traditional]) => ({
    simplified, pinyin, hanViet, meaning, ...(traditional ? { traditional } : {}),
  }));

export const lines = (rows: LineRow[]): LessonLine[] => rows.map(([zh, pinyin, vi]) => ({ zh, pinyin, vi }));

export function lesson(id: string, level: 1 | 2 | 3 | 4, order: number, title: string, v: VocabRow[], l: LineRow[]): Lesson {
  return { id, level, order, title, vocab: vocab(v), lines: lines(l) };
}
''')
print(stats, sum(s[0] for s in stats.values()), sum(s[1] for s in stats.values()))
json.dump({l['id']:l['key'] for l in ls},open('idmap.json','w'))
