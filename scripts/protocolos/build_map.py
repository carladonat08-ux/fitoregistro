import json,re,sys
sys.path.insert(0,__import__('os').path.dirname(__file__))
from overrides import O
import os; S=os.environ.get('FITOLUPA_FUENTES','fuentes_protocolos')
auto=json.load(open(S+'/prot/map_auto.json'))
BIO=re.compile(r'cepa|strain|bacillus|trichoderma|virus|beauver|beauvaria|metarhiz|isaria|paecilo|pseudomonas|pythium|saccharo|candida|aureobas|coniothyr|gliocl|ampelom|akanthom|purpureo|granulovirus|acetat|-ol\b|-OL\b|enal\b|ENAL\b|dien|trien|DIEN|TRIEN|dodecen|tetradecen|hexadecen',re.I)
out={}; review=[]
for es,en,r,cas in auto:
    if es in O: out[es]=O[es]; continue
    if BIO.search(es): out[es]=None; continue
    if r>=0.85: out[es]=en; review.append((r,es,en)) if r<1 else None
    else: out[es]=None; review.append((r,es,'— SIN EQUIVALENTE —'))
json.dump(out,open(S+'/prot/es_en.json','w'),ensure_ascii=False,indent=1)
for x in sorted(review): print(x)
print(sum(1 for v in out.values() if v),'con equivalente de',len(out))
