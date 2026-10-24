import re
CAS=re.compile(r'^\d{2,7}[-\s]\d{2}[-\s]?\d?$|^\d{2,7}-$|^\d{2,7}-\d{1,2}-?$')
HEADWORDS=re.compile(r'Name of|CAS|Type of|status|Toxicity|toxicity|rating|Protocol|carcinogenic|inhaled|Substitution|LIST:|Version|Controlled|confidential|P a g e|Click to return|of pesticide|ingredient|pesticide$|^No\.|Hazard|hazards|effects|Chronic|Acute|Environment|Montreal|PIC|POP|WHO|EPA|IARC|Candidate|health|Latest',re.I)
def parse_numbered(lines, numre=r'(\d{1,3}|SP\d)', name_max_col=48, maxn=999):
    """Filas numeradas «N  Nombre  CAS …»; une fragmentos del nombre partidos en varias líneas."""
    rows=[]; frags=[]  # frags: (idx, text) en la columna del nombre de líneas sin número
    for i,l in enumerate(lines):
        m=re.match(r'^\s{0,8}'+numre+r'\s{1,}(.*)$',l)
        if m and (not m.group(1).isdigit() or int(m.group(1))<=maxn):
            rest=m.group(2); start=m.start(2)
            cells=[c for c in re.split(r'\s{2,}',rest.strip())]
            name=cells[0] if cells and not CAS.match(cells[0]) and start<name_max_col else ''
            rows.append({'n':m.group(1),'i':i,'name':name.strip(),'line':l})
            continue
        seg=l[:name_max_col]
        s=seg.strip()
        if not s or HEADWORDS.search(l) : continue
        first=re.split(r'\s{2,}',s)[0]
        if CAS.match(first) or re.fullmatch(r'[\d\-, ]+',first) or first in ('X','●','x'): continue
        lead=len(seg)-len(seg.lstrip())
        if lead>name_max_col-6: continue
        frags.append((i,first))
    # asignar fragmentos a la fila numerada más cercana (misma tabla, distancia ≤2 líneas)
    for i,f in frags:
        best=None
        for r in rows:
            d=r['i']-i
            if abs(d)<=2 and (best is None or abs(d)<abs(best[1]) or (abs(d)==abs(best[1]) and d>0)): best=(r,d)
        if best: best[0].setdefault('fr',[]).append((best[1],f))
    for r in rows:
        parts=[(0,r['name'])]+[(-d,f) for d,f in r.get('fr',[])]
        parts=[p for p in sorted(parts,key=lambda x:x[0]) if p[1]]
        txt=''
        for _,p in parts:
            txt = txt+p if txt.endswith('-') or txt.endswith('(') else (txt+' '+p if txt else p)
        r['name']=re.sub(r'\s+',' ',txt).strip()
    return rows
