import json,glob,re
pool=json.load(open('pool.json'))
CH=25
excl=set()
for f in glob.glob('gl/[c-z][0-9][0-9][0-9].txt'):
    for l in open(f,encoding='utf8'):
        m=re.match(r'^([^\s=#>]+)=',l)
        if m and not m.group(1).isdigit(): excl.add(m.group(1))
bands=[(1,0,1500),(2,1500,3300),(3,3300,4600),(4,4600,len(pool))]
plan=[]
for lv,a,b in bands:
    seg=pool[a:b]
    if lv>=3: seg=[w for w in seg if w['w'] not in excl]
    for k,i in enumerate(range(0,len(seg),CH)):
        words=seg[i:i+CH]
        plan.append(dict(key=f'F{lv}-{k+1:02d}',level=lv,words=[w['w'] for w in words]))
json.dump(plan,open('plan.json','w'),ensure_ascii=False)
print(len(plan),[(lv,sum(1 for p in plan if p['level']==lv)) for lv in (1,2,3,4)], len(excl))
