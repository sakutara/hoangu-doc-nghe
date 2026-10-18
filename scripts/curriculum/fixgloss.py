import sys,glob,re,json
# usage: fixgloss.py "word=newgloss" ...   (keeps ;;py;;hv suffix of the existing line)
plan={p['key']:p for p in json.load(open('plan.json'))}
word2=dict()
for k,p in plan.items():
    for i,w in enumerate(p['words'],1): word2[w]=(k,i)
files=sorted(glob.glob('gl/[a-z][0-9][0-9][0-9].txt'))
def load():
    return {f:open(f,encoding='utf8').read() for f in files}
txt=load()
def blocks(s):
    parts=re.split(r'(?m)^(## [^\n]*\n)',s)
    # parts: [pre, header1, body1, header2, body2,...]
    return parts
def apply(word,new):
    global txt
    if word in word2:
        key,idx=word2[word]
        for f,s in txt.items():
            parts=blocks(s)
            for i in range(1,len(parts),2):
                if parts[i].startswith('## '+key+' |'):
                    body=parts[i+1]
                    lines=body.split('\n')
                    for j,l in enumerate(lines):
                        if l.startswith(f'{idx}='):
                            suf=''
                            m=re.match(r'^\d+=(.*?)(;;.*)?$',l)
                            suf=m.group(2) or ''
                            lines[j]=f'{idx}={new}{suf}'
                            break
                    else:
                        # insert before first '>' or at end of numeric lines
                        pos=0
                        for j,l in enumerate(lines):
                            if re.match(r'^\d+=',l): pos=j+1
                        lines.insert(pos,f'{idx}={new}')
                    parts[i+1]='\n'.join(lines)
                    txt[f]=''.join(parts)
                    return True
        return False
    # genre word
    for f,s in txt.items():
        lines=s.split('\n')
        for j,l in enumerate(lines):
            if l.startswith(word+'='):
                m=re.match(r'^[^=]+=(.*?)(;;.*)?$',l)
                suf=m.group(2) or ''
                lines[j]=f'{word}={new}{suf}'
                txt[f]='\n'.join(lines)
                return True
    return False
bad=[]
for a in sys.argv[1:]:
    w,n=a.split('=',1)
    if not apply(w,n): bad.append(w)
for f,s in txt.items(): open(f,'w',encoding='utf8').write(s)
print('not found:',bad)
