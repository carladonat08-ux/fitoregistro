import json,re,unicodedata,difflib
import os; S=os.environ.get('FITOLUPA_FUENTES','fuentes_protocolos')
es=json.load(open(S+'/sus_es.json'))
eu=json.load(open(S+'/src/ue_sustancias.json'))
def n(s): return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFD',s.lower()).encode('ascii','ignore').decode()).strip()
EU={}
for e in eu:
    EU.setdefault(n(e['substance_name']),e)
names=list(EU)
RULES=[(r'\bacido (\w+)ico\b',r'\1ic acid'),(r'ph',r'f'),(r'clor',r'chlor'),(r'cicl',r'cycl'),(r'ciclo',r'cyclo'),(r'tio',r'thio'),(r'\bfos',r'phos'),(r'fos\b',r'phos'),(r'fos(?=[a-z])',r'phos'),
       (r'metil',r'methyl'),(r'etil',r'ethyl'),(r'propil',r'propyl'),(r'butil',r'butyl'),(r'fenil',r'phenyl'),(r'metr',r'methr'),(r'piri',r'pyri'),(r'pira',r'pyra'),(r'piro',r'pyro'),
       (r'cia',r'cya'),(r'ciha',r'cyha'),(r'cip',r'cyp'),(r'ciflu',r'cyflu'),(r'cimox',r'cymox'),(r'cipro',r'cypro'),(r'zin\b',r'zine'),(r'ina\b',r'in'),(r'ona\b',r'one'),(r'ida\b',r'ide'),(r'ato\b',r'ate'),(r'ilo\b',r'yl'),(r'il\b',r'yl'),
       (r'eno\b',r'ene'),(r'ano\b',r'ane'),(r'uro\b',r'ide'),(r'olo\b',r'ole'),(r'oxi',r'oxy'),(r'hidro',r'hydro'),(r'\bhidroxido de cobre\b',r'copper hydroxide'),(r'sulfato',r'sulfate'),(r'qu',r'k')]
def cands(s):
    x=n(re.sub(r'\(.*?\)','',s)); out={x}
    y=x
    for a,b in RULES: y=re.sub(a,b,y)
    out.add(y)
    return out
res=[]
for s in es:
    best=(0,None)
    for c in cands(s):
        if c in EU: best=(1.0,c); break
        m=difflib.get_close_matches(c,names,n=1,cutoff=0.75)
        if m:
            r=difflib.SequenceMatcher(None,c,m[0]).ratio()
            if r>best[0]: best=(r,m[0])
    res.append((s,best[1],round(best[0],2),EU[best[1]]['cas_number'] if best[1] else None))
json.dump(res,open(S+'/prot/map_auto.json','w'),ensure_ascii=False,indent=0)
for r in res: print(f"{r[2]:.2f} | {r[0]} -> {r[1]} | {r[3]}")
