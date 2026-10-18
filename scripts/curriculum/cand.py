import json,re,collections
rows=[]
for i,l in enumerate(open('data/sub/SUBTLEX_CH_131210_CE.utf8',encoding='utf-8-sig')):
    if i==0: continue
    p=l.rstrip('\r\n').split('\t')
    rows.append(dict(w=p[0],n=int(p[4]),pos=p[10],eng=p[14].strip('"'),py=p[2]))
rows.sort(key=lambda r:-r['n'])
tot=sum(r['n'] for r in rows)
hz=re.compile(r'^[一-鿿]+$')
ced=json.load(open('../../public/cedict.json'))
cd=collections.defaultdict(list)
for s,t,py,m in ced: cd[s].append((py,m,t))
out=[];skipped=collections.Counter()
for r in rows:
    w=r['w']
    if not hz.match(w): skipped['nonhan']+=1;continue
    if r['pos'] in('nr',): skipped['nr']+=1;continue
    if len(w)>4: skipped['long']+=1;continue
    if w not in cd: skipped['nocedict']+=1;continue
    out.append(r)
print(len(out),skipped)
cum=0
for i,r in enumerate(out):
    cum+=r['n']; r['rank']=i+1
    r['cum']=cum/tot
for k in (1500,3000,4500,6000,7000,8000): print(k,round(out[k-1]['cum']*100,2))
json.dump(out,open('cand.json','w'),ensure_ascii=False)
