import json,re,csv,collections
from cov import CN,D,cov
TONES={'a':'āáǎàa','e':'ēéěèe','i':'īíǐìi','o':'ōóǒòo','u':'ūúǔùu','ü':'ǖǘǚǜü'}
def syl(s):
    m=re.match(r'^([a-zü:A-Z]+?)([1-5])$',s)
    if not m: return s.lower()
    b=m.group(1).lower().replace('u:','ü').replace('v','ü'); t=int(m.group(2))-1
    idx=-1
    for i,ch in enumerate(b):
        if ch in 'ae': idx=i;break
    if idx<0 and 'ou' in b: idx=b.index('o')
    if idx<0:
        for i in range(len(b)-1,-1,-1):
            if b[i] in 'aeiouü': idx=i;break
    if idx<0: return b
    return b[:idx]+TONES[b[idx]][t]+b[idx+1:]
def marked(numlist): return [syl(s) for s in numlist]
# CVDICT
CV=collections.defaultdict(list)
for l in open('data/CVDICT.u8',encoding='utf8'):
    if l.startswith('#') or not l.strip(): continue
    m=re.match(r'^(\S+) (\S+) \[([^\]]*)\] /(.*)/$',l.rstrip('\n'))
    if not m: continue
    trad,simp,py,defs=m.groups()
    CV[simp].append((trad,py.split(),[d for d in defs.split('/') if d]))
# HV
SPECIAL={'了':'liễu','的':'đích','得':'đắc','着':'trứ','么':'ma','吗':'ma','呢':'ni','吧':'ba','啊':'a'}
HV=collections.defaultdict(list)
for r in csv.DictReader(open('data/hanviet.csv',encoding='utf8')):
    try: v=eval(r['hanviet'])
    except Exception: v=[r['hanviet']]
    HV[(r['char'],r['pinyin'])]+=v
CHAR_FIX={'你':'nhĩ','喝':'hát','傻':'sỏa','笨':'bổn','爬':'ba','推':'thôi','摸':'mô','季':'quý','鬼':'quỷ','貴':'quý','櫃':'quỹ','沒':'một'}
def hv_char(tc,numsyl):
    if tc in CHAR_FIX: return CHAR_FIX[tc]
    if tc in SPECIAL: return SPECIAL[tc]
    for key in ((tc,numsyl.lower()),(tc,'*')):
        if key in HV and HV[key]: return HV[key][0]
    # same syllable different tone
    base=numsyl.lower()[:-1]
    for t in '12345':
        if (tc,base+t) in HV: return HV[(tc,base+t)][0]
    return None
BAD=re.compile(r'^(họ |biến thể|xem |viết tắt|cũ của|dạng cổ|dạng viết|cách viết|lượng từ cho|tên |\(họ)',re.I)
def vi_draft(senses):
    good=[s for s in senses if not BAD.match(s)] or senses[:1]
    def clean(s):
        s=re.sub(r'^\((thành ngữ|từ lóng|khẩu ngữ|văn ngôn|tiếng lóng|lóng|thân mật|cổ|địa phương|phương ngữ|chính thức|thông tục)[^)]*\)\s*','',s,flags=re.I)
        s=s.replace(' hoặc ',' / ')
        return s.strip()
    good=[clean(s) for s in good]
    parts=[p.strip() for p in good[0].split(';') if p.strip()]
    t='; '.join(parts[:2])
    if len(t)<8 and len(good)>1:
        t=t+', '+good[1].split(';')[0].strip()
    if len(t)>48:
        t=parts[0] if len(parts[0])<=48 else parts[0][:48].rsplit(' ',1)[0]
    return t
CED=collections.defaultdict(list)
for s_,t_,py_,m_ in json.load(open('../../public/cedict.json')): CED[s_].append((py_.replace(' ','').lower(),m_.lower()))
def choose_alt(w,subpy,eng):
    alts=[a for a in subpy.split('/')]
    if len(alts)==1: return alts[0]
    toks=set(re.findall(r'[a-z]{3,}',(eng or '').lower()))
    best=None;bs=-1
    for a in alts:
        mk=''.join(marked(a.split())).replace(' ','')
        sc=0
        for py_,m_ in CED.get(w,[]):
            if py_==mk:
                sc=max(sc,len(toks & set(re.findall(r'[a-z]{3,}',m_))))
        if sc>bs: bs=sc;best=a
    return best
def build(w,subpy=None,eng=None):
    if subpy and '/' in subpy: subpy=choose_alt(w,subpy,eng)
    c=CV.get(w)
    if not c: return None
    pick=None
    if subpy:
        key=subpy.split('/')[0].lower().replace(' ','')
        for e in c:
            if ''.join(e[1]).lower().replace('u:','ü')==key.replace('u:','ü') and not e[1][0][0].isupper(): pick=e;break
    if pick is None:
        for e in c:
            if not e[1][0][0].isupper(): pick=e;break
    if pick is None: pick=c[0]
    trad,py,senses=pick
    py=[s for s in py if s!='-']
    if len(trad)!=len(w): trad=w
    hv=[]
    for tc,s in zip(trad,py):
        h=hv_char(tc,s)
        hv.append(h or '?')
    n=len(py)
    pym=marked(py)
    pys=' '.join(pym) if n>=4 else ''.join(pym)
    # word tone sandhi markers not handled
    return dict(w=w,trad=trad if trad!=w else '',py=pys,pys=pym,hv=' '.join(hv),vi=vi_draft(senses),vis=senses[:4])
if __name__=='__main__':
    for w in ['我们','学生','修炼','莫名其妙','长','好看','打酱油']:
        print(build(w))
