import sys,collections,re
from build import *
L=parse(); ls=assemble(L); prime(ls)
known=set(); gl=collections.defaultdict(list); core=set()
for f in ('coreLexicon.ts','extraLexicon.ts'):
    for m in re.finditer(r"\['([^']+)', '",open('../../src/data/'+f,encoding='utf8').read()): core.add(m.group(1))
issues=0
allw={v['w'] for l in ls for v in l['vocab']}
verbose='-q' not in sys.argv
FROM=next((a[7:] for a in sys.argv if a.startswith('--from=')),'')
for l in ls:
    if len(l['lines'])<3: print('FEWLINES',l['key']); issues+=1
    for v in l['vocab']:
        gl[v['vi']].append(v['w'])
        if '?' in v['hv']: print('HV?',l['key'],v['w'],v['hv']); issues+=1
        if not v['vi']: print('NOGLOSS',l['key'],v['w']); issues+=1
        known.add(v['w'])
    for zh,vi in l['lines']:
        i=0;unk=[];later=[]
        while i<len(zh):
            if not HZ.match(zh[i]): i+=1;continue
            for n in range(min(6,len(zh)-i),0,-1):
                if zh[i:i+n] in known: i+=n;break
            else:
                for n in range(min(6,len(zh)-i),0,-1):
                    if zh[i:i+n] in allw: later.append(zh[i:i+n]); i+=n;break
                else: unk.append(zh[i]);i+=1
        if (unk or later) and verbose and l['key']>=FROM: print(f"  {l['key']} {zh}  unknown={''.join(unk)} later={later}")
        if unk or later: issues+=0
for g,ws in gl.items():
    if len(ws)>1: print('DUPGLOSS',g,ws)
print('issues',issues, 'words',len(known))
