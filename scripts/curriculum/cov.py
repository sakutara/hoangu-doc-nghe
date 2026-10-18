import json,re
hz=re.compile(r'^[一-鿿]+$')
CN={}
for i,l in enumerate(open('data/sub/SUBTLEX_CH_131210_CE.utf8',encoding='utf-8-sig')):
    if i==0: continue
    p=l.rstrip('\r\n').split('\t')
    if hz.match(p[0]) and p[10]!='nr': CN[p[0]]=CN.get(p[0],0)+int(p[4])
D=sum(CN.values())
def cov(S): return round(sum(CN.get(w,0) for w in set(S))/D*100,2)
