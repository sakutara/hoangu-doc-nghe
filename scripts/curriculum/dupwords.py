from build import *
L=parse(); ls=assemble(L)
import collections
c=collections.Counter(v['w'] for l in ls for v in l['vocab'])
print([w for w,n in c.items() if n>1])
