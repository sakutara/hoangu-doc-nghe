import json,re
from draft import *
c=json.load(open('cand.json'))
h=json.load(open('data/hsk.json'))
hk={}
hpy={}
for e in h:
    ls=[int(x[4:]) for x in e['level'] if x.startswith('new-')]
    if ls and (e['simplified'] not in hk or min(ls)<hk[e['simplified']]):
        hk[e['simplified']]=min(ls)
cw={r['w']:r for r in c}
pool=[];drop=[]
for r in c[:4500]:
    if r['pos'] in('nz','ns') and hk.get(r['w'],9)>4 and r['w'] not in('美国','中国','日本','英国','法国','德国','欧洲','非洲','英语','印度','俄罗斯','加拿大'):
        drop.append(r['w']);continue
    pool.append(r['w'])
S=set(pool)
extra=[w for w,l in hk.items() if l<=4 and w not in S and re.match(r'^[一-鿿]+$',w) and len(w)<=4 and w in CV]
pool+=sorted(extra,key=lambda w:(hk[w],-CN.get(w,0)))
print(len(pool),len(extra),'dropped',len(drop),drop[:60])
ents=[]
for i,w in enumerate(pool):
    sp=cw[w]['py'] if w in cw else None
    e=build(w,sp,cw[w]['eng'] if w in cw else None)
    if not e: print('nobuild',w);continue
    e['rank']=i+1;e['n']=CN.get(w,0);e['pos']=cw[w]['pos'] if w in cw else '';e['eng']=(cw[w]['eng'] if w in cw else '')[:60]
    ents.append(e)
json.dump(ents,open('pool.json','w'),ensure_ascii=False)
print(len(ents),cov([e['w'] for e in ents]))
print(sum('?' in e['hv'] for e in ents),'with missing HV')
