import re,json,sys
import os; S=os.environ.get('FITOLUPA_FUENTES','fuentes_protocolos')
t=open(S+'/src/fairtrade_hml.txt').read().split('\n')
sec=None; out={'red':[],'orange':[],'yellow':[]}
CAS=r'(\d{2,7}[-\s]\d{2}[-\s]\d)'
pending=[]  # name fragment lines before a numbered row
last=None
for i,l in enumerate(t):
    if 'Part 1: Fairtrade International Red List' in l: sec='red'; continue
    if 'Part 2: Fairtrade International Orange List' in l: sec='orange'; continue
    if re.search(r'Part 3: .*Yellow List',l): sec='yellow'; continue
    if re.search(r'Part 4|Annex|Change history|Changes to the',l) and sec=='yellow' and 'Yellow' not in l: sec=None
    if not sec: continue
    m=re.match(r'^\s{0,6}(\d{1,3})\s{2,}(\S.*?)(?:\s{2,}|$)',l)
    if m and int(m.group(1))<=230:
        name=m.group(2).strip()
        if re.match(CAS+'$',name): name=''
        rec={'n':int(m.group(1)),'name':name,'cas':(re.search(CAS,l[m.end(1):]) or [None])[0] if re.search(CAS,l[m.end(1):]) else None,'line':i,'raw':l.strip()}
        if pending and (not name or name[0].islower() or True):
            # fragment printed above the number (wrapped cell, vertically centred)
            if not name: rec['name']=' '.join(pending)
            elif pending and (pending[-1].endswith('-') or pending[-1].endswith(',')): rec['name']=pending[-1]+name if pending[-1].endswith('-') else pending[-1]+' '+name
        pending=[]
        # specific conditions column for orange
        if sec=='orange':
            tail=l.strip().split()
            rec['cond']=tail[-1] if re.fullmatch(r'[a-d]|\w?\d{4}',tail[-1] or '') else ''
        out[sec].append(rec); last=rec; continue
    # continuation / fragment lines in the name column (between col 6 and 45)
    seg=l[:60].strip()
    if seg and not re.search(r'List|Name of|No\.|CAS|toxicity|exposure|chronic|tions|concern|services|Hazard|Fairtrade|Environ|Long|term|High|of the material|Obsolet|ingredient|Specific|Phase|^\d+$|^x',seg) and re.match(r'^\s{4,}\S',l):
        frag=re.split(r'\s{2,}',seg)[0]
        if re.match(CAS,frag): continue
        if last and last['line']==i-1 and (last['name'].endswith('-') or frag[0].islower() or frag.startswith('(') or len(frag)<15) and len(frag)<40:
            last['name']=(last['name']+frag) if last['name'].endswith('-') else last['name']+' '+frag
        else: pending.append(frag)
for k,v in out.items():
    ns=[r['n'] for r in v]; print(k,len(v),'max',max(ns),'missing',sorted(set(range(1,max(ns)+1))-set(ns))[:20])
json.dump(out,open(S+'/prot/fairtrade.json','w'),ensure_ascii=False,indent=0)
