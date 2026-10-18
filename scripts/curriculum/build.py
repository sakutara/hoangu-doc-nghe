import json,re,glob,sys,collections
import jieba
from pypinyin import lazy_pinyin, Style
from draft import build as dbuild, CED, hv_char, marked, CV
from cov import CN, D, cov
pool={e['w']:e for e in json.load(open('pool.json'))}
plan={p['key']:p for p in json.load(open('plan.json'))}
HZ=re.compile(r'[一-鿿]')
# trad per char
TRAD={}
for s_,t_,py_,m_ in json.load(open('../../public/cedict.json')):
    if len(s_)==1 and t_ and s_ not in TRAD: TRAD[s_]=t_
def fallback(w):
    syl=lazy_pinyin(w,style=Style.TONE3,neutral_tone_with_five=True)
    mk=marked(syl)
    py=' '.join(mk) if len(w)>=4 else ''.join(mk)
    trad=''.join(TRAD.get(c,c) for c in w)
    hv=[]
    for tc,sc,s in zip(trad,w,syl):
        hv.append(hv_char(sc,s) if sc in ('了','的','得','着','么','吗','呢','吧','啊') else (hv_char(tc,s) or hv_char(sc,s) or '?'))
    return dict(w=w,trad=trad if trad!=w else '',py=py,pys=mk,hv=' '.join(hv),vi='')
def entry_for(w):
    if w in pool: return dict(pool[w])
    e=dbuild(w)
    if e and e['vi']: return e
    return fallback(w)
def _tone(s):
    import unicodedata
    for c in unicodedata.normalize('NFD',s):
        if c=='\u0304': return 1
        if c=='\u0301': return 2
        if c=='\u030c': return 3
        if c=='\u0300': return 4
    return 5
def _plain(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD',s) if not unicodedata.combining(c))
def fix_sy(zh,sy):
    """Sửa các điểm pypinyin hay sai (địa/đắc/trường...) và áp dụng biến điệu 一/不 nhất quán."""
    n=len(zh)
    for m in re.finditer(r'(?<=[轻偷烈情同缓默狠静悄渐慢快])地',zh): sy[m.start()]='de'
    for m in re.finditer('得',zh):
        i=m.start(); prev=zh[i-1] if i>0 else ''; nxt=zh[i+1] if i+1<n else ''
        if nxt in '到意知出分' or prev in '获取赢难不' or (nxt=='了' and zh[i+2:i+3] in ('奖','病','分','冠')): sy[i]='dé'
        elif i in sy and sy[i]=='dé': sy[i]='de'
    for m in re.finditer('一场',zh): sy[m.start()]='yì'; sy[m.start()+1]='chǎng'
    for m in re.finditer(r'(?<=[很太真最不更多好])长(?!大)',zh): sy[m.start()]='cháng'
    for m in re.finditer(r'弹(?=[吉钢琴])',zh): sy[m.start()]='tán'
    for m in re.finditer('少侠',zh): sy[m.start()]='shào'
    for m in re.finditer('穿着',zh): sy[m.start()+1]='zhe'
    for m in re.finditer('重生文',zh): sy[m.start()]='chóng'
    for m in re.finditer('考中',zh):
        if zh[m.end():m.end()+1]=='了': sy[m.start()+1]='zhòng'
    for i,ch in enumerate(zh):
        if ch=='个': sy[i]='ge'
    # biến điệu 一 / 不
    for i,ch in enumerate(zh):
        if ch not in '一不': continue
        prev=zh[i-1] if i>0 else ''
        nxt=zh[i+1] if i+1<n else ''
        if ch=='一':
            if (not HZ.match(nxt or 'x')) or (prev and prev in '第统唯万之初周期零二三四五六七八九十') or nxt in '月号':
                sy[i]='yī'; continue
            t=_tone(sy.get(i+1,''))
            sy[i]='yí' if t in (4,5) else 'yì'
        else:
            if _plain(sy.get(i,''))!='bu' or sy.get(i)=='bu' or not HZ.match(nxt or 'x'): continue
            sy[i]='bú' if _tone(sy.get(i+1,''))==4 else 'bù'
    return sy
def segment(zh):
    """Cắt từ giống app: khớp dài nhất theo từ vựng giáo trình; chữ chưa khớp tách từng chữ."""
    toks=[];i=0;n=len(zh)
    while i<n:
        if not HZ.match(zh[i]):
            j=i+1
            while j<n and not HZ.match(zh[j]) and zh[j] not in '，。！？、；：“”（）… ': j+=1
            toks.append((zh[i:j],i,j)); i=j; continue
        hit=1
        for L_ in range(min(8,n-i),1,-1):
            if zh[i:i+L_] in VOCAB and all(HZ.match(c) for c in zh[i:i+L_]): hit=L_;break
        toks.append((zh[i:i+hit],i,i+hit)); i+=hit
    return toks
def sent_pinyin(zh):
    """Pinyin theo ngữ cảnh cả cụm (pypinyin) rồi gom theo từ (jieba) để cách chữ."""
    sy={}
    for m in re.finditer(r'[\u4e00-\u9fff]+',zh):
        for k,s in enumerate(lazy_pinyin(m.group(0),style=Style.TONE,neutral_tone_with_five=False)):
            sy[m.start()+k]=s
    fix_sy(zh,sy)
    out=[]
    for tok,st,en in segment(zh):
        if HZ.search(tok): out.append(''.join(sy.get(i,zh[i]) for i in range(st,en)))
        else: out.append(tok)
    txt=' '.join(out)
    txt=re.sub(r'\s+([，。！？、；：”）…,.!?;:])',r'\1',txt)
    txt=re.sub(r'([“（(])\s+',r'\1',txt)
    for a_,b_ in (('，',','),('。','.'),('！','!'),('？','?'),('；',';'),('：',':'),('、',','),('（','('),('）',')')): txt=txt.replace(a_,b_)
    txt=re.sub(r'(“)\s+',r'\1',txt); txt=re.sub(r'\s+(”)',r'\1',txt)
    txt=re.sub(r'([.?!])\s+([a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ])',lambda m:m.group(1)+' '+m.group(2).upper(),txt)
    txt=txt.strip()
    return txt[:1].upper()+txt[1:]
import os,unicodedata
NORM=[('oà','òa'),('oá','óa'),('oả','ỏa'),('oã','õa'),('oạ','ọa'),('oè','òe'),('oé','óe'),('oẻ','ỏe'),('oẽ','õe'),('oẹ','ọe'),
      ('uỳ','ùy'),('uý','úy'),('uỷ','ủy'),('uỹ','ũy'),('uỵ','ụy')]
QFIX={'qú':'qu','qù':'qu'}
def normhv(s):
    out=[]
    for syl in s.split(' '):
        syl=unicodedata.normalize('NFC',syl)
        m=re.match('^q([\u00fa\u00f9\u1ee7\u0169\u1ee5])y$',syl)
        if m: syl={'\u00fa':'qu\u00fd','\u00f9':'qu\u1ef3','\u1ee7':'qu\u1ef7','\u0169':'qu\u1ef9','\u1ee5':'qu\u1ef5'}[m.group(1)]
        for a_,b_ in NORM:
            if syl.endswith(a_):
                if a_.startswith('u') and syl.startswith('qu') and len(syl)==len(a_)+1: break
                syl=syl[:-len(a_)]+b_;break
        out.append(syl)
    return ' '.join(out)
def hvfix():
    d={}
    p='gl/hvfix.txt'
    if os.path.exists(p):
        for l in open(p,encoding='utf8'):
            l=l.strip()
            if l and not l.startswith('//'):
                k,v=l.split('=',1); d[k.strip()]=v.strip()
    return d
VOCAB=set()
def prime(ls):
    VOCAB.clear()
    VOCAB.update(v['w'] for l in ls for v in l['vocab'])
    from pypinyin import load_phrases_dict
    phrases={}
    for l in ls:
        for v in l['vocab']:
            w=v['w']
            if len(w)>=2: jieba.add_word(w,1000000)
            pys=v.get('pys')
            if len(w)>=2 and pys and len(pys)==len(w): phrases[w]=[[s] for s in pys]
    load_phrases_dict(phrases)
def parse():
    L={}
    for f in sorted(glob.glob('gl/[a-z][0-9][0-9][0-9].txt')):
        cur=None
        for ln,l in enumerate(open(f,encoding='utf8'),1):
            l=l.rstrip('\n')
            if not l.strip() or l.startswith('//'): continue
            if l.startswith('## '):
                key,title=[x.strip() for x in l[3:].split('|',1)]
                cur=dict(key=key,title=title,over={},words=[],lines=[],src=f'{f}:{ln}')
                L[key]=cur; continue
            if l.startswith('> '):
                zh,vi=[x.strip() for x in l[2:].split('|',1)]
                cur['lines'].append((zh,vi)); continue
            k,v=l.split('=',1)
            parts=[p.strip() for p in v.split(';;')]
            if k.strip().isdigit(): cur['over'][int(k)]=parts
            else: cur['words'].append((k.strip(),parts))
    return L
def assemble(L):
    lessons=[];problems=[]
    for key,l in L.items():
        lv=int(key[1])
        words=[]
        if key in plan:
            for j,w in enumerate(plan[key]['words'],1):
                e=dict(entry_for(w))
                if j in l['over']:
                    p=l['over'][j]
                    if p[0]=='-': continue
                    e['vi']=p[0]
                    if len(p)>1 and p[1]: e['py']=p[1]; e['pys']=None
                    if len(p)>2 and p[2]: e['hv']=p[2]
                    if len(p)>3 and p[3]: e['trad']=p[3]
                words.append(e)
        for w,p in l['words']:
            e=dict(entry_for(w)); e['vi']=p[0] or e['vi']
            if len(p)>1 and p[1]: e['py']=p[1]; e['pys']=None
            if len(p)>2 and p[2]: e['hv']=p[2]
            if len(p)>3 and p[3]: e['trad']=p[3]
            words.append(e)
        fx=hvfix()
        for e in words:
            if e['w'] in fx: e['hv']=fx[e['w']]
            e['hv']=normhv(e['hv'])
        lessons.append(dict(key=key,level=lv,title=l['title'],vocab=words,lines=l['lines'],src=l['src']))
    return lessons
if __name__=='__main__':
    L=parse(); ls=assemble(L)
    print(len(ls),'lessons',sum(len(x['vocab']) for x in ls),'words')
