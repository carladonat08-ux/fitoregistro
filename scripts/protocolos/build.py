import json,re,unicodedata,html,sys,collections
import os; S=os.environ.get('FITOLUPA_FUENTES','fuentes_protocolos')
ES_EN=json.load(open(S+'/prot/es_en.json'))
def n(s):
    s=unicodedata.normalize('NFD',str(s).lower()).encode('ascii','ignore').decode()
    s=s.replace('sulphur','sulfur').replace('sulphate','sulfate').replace('aluminium','aluminum').replace('&',' and ')
    s=re.sub(r'\*+','',s); s=re.sub(r'\(.*?\)','',s)
    s=re.sub(r'\b(and its salts( and esters)?|and its compounds|and compounds|its salts and esters|\(all forms\)|all forms)\b','',s)
    return re.sub(r'[^a-z0-9]+',' ',s).strip()
# sinónimos: nombre EN del registro -> variantes que pueden aparecer en las listas
SYN={'2,4-d':['2 4 d'],'2 4 d':['2 4 d'],'paraffin oil':['paraffin oil','paraffin oils','mineral oils','paraffin oils mineral oils'],
 'copper hydroxide':['copper ii hydroxide','copper hydroxide'],'bordeaux mixture':['copper sulfate','bordeaux mixture'],'tribasic copper sulphate':['copper sulfate','tribasic copper sulfate'],
 'copper oxychloride':['copper oxychloride'],'cuprous oxide':['copper i oxide','cuprous oxide','copper oxide'],'glyphosate':['glyphosate'],'fosetyl':['fosetyl','fosetyl aluminum','fosetyl al'],
 'imazalil':['imazalil','imazalil enilconazole','enilconazole','imazalil sulfate'],'formetanate':['formetanate','formetanate hydrochloride'],'emamectin':['emamectin','emamectin benzoate'],
 'pyrethrins':['pyrethrins','pyrethrum','pyrethrum extract','pyrethrum extract pyrethrins','pyrethrins pyrethrum extract'],'dimethenamid p':['dimethenamid p','dimethenamid'],
 'chlormequat':['chlormequat','chlormequat chloride'],'mepiquat':['mepiquat','mepiquat chloride'],'lambda cyhalothrin':['lambda cyhalothrin'],'tau fluvalinate':['tau fluvalinate'],
 'chlorotoluron':['chlorotoluron','chlortoluron'],'flumioxazin':['flumioxazin','flumioxazine'],'sulphur':['sulfur'],'fluazifop-p':['fluazifop p','fluazifop p butyl','fluazifop butyl'],
 'cyhalofop butyl':['cyhalofop butyl'],'metam-sodium':['metam sodium'],'metam-potassium':['metam potassium'],'aluminium phosphide':['aluminum phosphide'],'magnesium phosphide':['magnesium phosphide'],
 'zinc phosphide':['zinc phosphide','zinc phosphoside'],'tri allate':['tri allate','triallate'],'acetamiprid':['acetamiprid','acetamaprid'],'clethodim':['clethodim'],
 'potassium phosphonates':['potassium phosphonates','potassium phosphite'],'1 methylcyclopropene':['1 methylcyclopropene'],'kieselgur':['kieselgur','diatomaceous earth'],
 'pirimiphos-methyl':['pirimiphos methyl'],'tolclofos-methyl':['tolclofos methyl'],'metsulfuron methyl':['metsulfuron methyl'],'quizalofop-p-tefuryl':['quizalofop p tefuryl'],
 'kresoxim methyl':['kresoxim methyl'],'pyraflufen ethyl':['pyraflufen ethyl'],'carfentrazone ethyl':['carfentrazone ethyl'],'fenoxaprop p ethyl':['fenoxaprop p ethyl','fenoxaprop p'],
 'dichlorprop p':['dichlorprop p','dichlorprop'],'mecoprop p':['mecoprop p','mecoprop','mecoprop mcpp'],'benalaxyl m':['benalaxyl m','benalaxyl'],'metalaxyl m':['metalaxyl m'],
}
def variants(en):
    out=[]
    for x in [en]+SYN.get(en,[]):
        k=n(x)
        if k not in out: out.append(k)
    return out
EN_ES=collections.defaultdict(list)
for es,en in ES_EN.items():
    if en: EN_ES[en].append(es)
FLUAZ='La lista nombra fluazifop-butil; el registro español tiene fluazifop-P-butil (su isómero activo).'
def match_entries(entries):
    """entries: [(name, cat, extra)] → {ES: (cat, extra, matched_name)} con igualdad tras normalizar (cada sinónimo separado por ';')."""
    idx={}
    for name,cat,extra in entries:
        for part in re.split(r';|\s/\s',name):
            k=n(part)
            if k and k not in idx: idx[k]=(cat,extra,name.strip())
    res={}
    for en,ess in EN_ES.items():
        for v in variants(en):
            if v in idx:
                for es in ess: res[es]=(idx[v][0], (idx[v][1] or '') + (' '+FLUAZ if en=='fluazifop-p' and 'p' not in n(idx[v][2]).split() else '') or None, idx[v][2])
                break
    return res
P={}; SUS=collections.defaultdict(dict); COND={}
def add(pid,meta,res):
    P[pid]=meta; cnt=collections.Counter()
    for es,(cat,extra,mname) in res.items():
        SUS[es][pid]=cat; cnt[cat]+=1
        if extra: COND[pid+'|'+es]=extra
    meta['n_registro']=dict(cnt)
# ---------------- Tesco
T=open(S+'/src/tesco.txt').read().strip().split('\n'); ents=[]
CATT={'Banned':'prohibida','Phase Out':'eliminar','Highly Restricted':'muy_restringida','Restricted':'restringida','Monitored':'vigilada'}
for l in T:
    c,names=l.split(':',1)
    for x in names.split(';'): ents.append((x.strip(),CATT[c.strip()],None))
add('tesco',{'nombre':'Tesco','tipo':'Cliente (Reino Unido)','fuente':'https://www.tescoplc.com/media/759510/tesco-highly-hazardous-pesticide-list.pdf','version':'Lista de plaguicidas altamente peligrosos (consultada en octubre de 2026)',
 'resumen':'Lista de materias activas para todo su producto fresco: prohibidas, a eliminar en 3-10 años, muy restringidas, restringidas (uso muy limitado y justificado) y vigiladas.',
 'cats':{'prohibida':['Prohibida','bad','No se puede usar en producto para Tesco.'],'eliminar':['A eliminar','warn','Se debe dejar de usar en los próximos años; hay que justificar su uso.'],
  'muy_restringida':['Muy restringida','warn','Uso excepcional y justificado.'],'restringida':['Restringida','warn','Uso muy limitado, con justificación y control del riesgo.'],'vigilada':['Vigilada','info','Se puede usar; Tesco sigue su uso.']}},match_entries(ents))
# ---------------- M&S (búsqueda en las secciones del anexo 1)
L=open(S+'/src/ms_2023.txt').read().split('\n')
def sec(a,b):
    s=next(i for i,l in enumerate(L) if a in l and i>800); e=next(i for i,l in enumerate(L) if b in l and i>s); return '\n'.join(L[s:e])
secs={'prohibida':sec('M&S PROHIBITED LIST','M&S RESTRICTED LIST'),'restringida':sec('M&S RESTRICTED LIST','MONITORED LIST (7'),
      'atencion':'\n'.join(l for l in sec('MONITORED LIST (7','Horizon scanning').split('\n') if re.match(r'^\s*SP\d',l)),
      'vigilada':'\n'.join(l for l in sec('MONITORED LIST (7','Horizon scanning').split('\n') if not re.match(r'^\s*SP\d',l))}
fixes={'Imidicloprid':'Imidacloprid','Clothiandin':'Clothianidin','Chorthalonil':'Chlorothalonil','Acetamaprid':'Acetamiprid','Dichchlorprop':'Dichlorprop','2-4-D':'2,4-D'}
res={}
def cellre(v):  # el nombre ocupa la celda entera: después vienen 2+ espacios, CAS o fin de línea
    words=v.split(' ')
    return re.compile(r'(?im)(?:^|\s{2,}|^\s*(?:\d{1,3}|SP\d)\s+|;\s*)\*?'+r'[\s\-,()]*'.join(re.escape(w) for w in words)+r'\)?(?:\s*\([^)\n]*\))?(?:\s*;[^\n]*?)?(?=\s{2,}|\s*$|\s+\d{2,7}-)')
for cat in ['vigilada','atencion','restringida','prohibida']:   # el último gana: lo más estricto
    t=secs[cat]
    for a,b in fixes.items(): t=t.replace(a,b)
    t=unicodedata.normalize('NFD',t).encode('ascii','ignore').decode().replace('sulphur','sulfur').replace('sulphate','sulfate')
    for en,ess in EN_ES.items():
        for v in variants(en):
            if cellre(v).search(t):
                note='M&S pide elegir aceites con CAS 97862-82-3, 64742-46-7 o 72623-86-0 (aprobados en la UE); otros, solo por excepción.' if 'paraffin' in en else None
                for es in ess: res[es]=('vigilada_atencion' if cat=='atencion' else cat,note,v)
                break
add('ms',{'nombre':'Marks & Spencer','tipo':'Cliente (Reino Unido)','fuente':'https://corporate.marksandspencer.com/sites/marksandspencer/files/Sustainability/Animal%20welfare%20reporting/Pesticides%20Policy%20July%2023V2.pdf','version':'Pesticides Policy, versión 2, julio de 2023',
 'resumen':'Política de plaguicidas para fruta, hortaliza y flor: prohibidas, restringidas (con consentimiento previo por escrito) y vigiladas (actuar si un residuo supera el 50 % del LMR). Prioriza fruta sin residuos.',
 'cats':{'prohibida':['Prohibida','bad','No se puede usar.'],'restringida':['Restringida','warn','Necesita consentimiento previo por escrito de M&S (solicitud de concesión con evaluación de riesgos).'],
  'vigilada_atencion':['Vigilada (atención especial)','warn','Requisitos adicionales de uso; candidata a pasar a restringida.'],'vigilada':['Vigilada','info','Se puede usar; acción si el residuo supera el 50 % del LMR.']}},res)
# ---------------- Fairtrade
F=json.load(open(S+'/prot/fairtrade.json')); ents=[]
FIX={1:'2,3,4,5-Bistetrahydro-2-furaldehyde',56:'Chlorpyrifos; Chlorpyrifos-methyl',100:'Fenpropathrin',132:'Mercury compounds',153:'Paraquat',163:'PMDS',164:'Polybrominated biphenyls (PBB)',165:'Polychlorinated biphenyls (PCB)',166:'Polychlorinated terphenyls (PCT)'}
CONDF={'a':'Solo para apicultura.','b':'No en material vegetal joven; al aire libre, no en cultivos de floración melífera desde un mes antes de la floración y durante ella (p. ej. frutales).','c':'Solo personal formado en almacén, con EPI y equipo hermético.'}
for r in F['red']: ents.append((FIX.get(r['n'],r['name']),'roja',None))
for r in F['orange']:
    nm={10:'Chlorantraniliprole',11:'Cypermethrin; alpha-cypermethrin; beta-cypermethrin'}.get(r['n'],r['name'])
    ents.append((nm,'naranja','Condiciones de la lista naranja (manejo integrado, rotación y plan de reducción). '+(CONDF.get(r.get('cond') or '','')) ))
for r in F['yellow']: ents.append((r['name'],'amarilla',None))
add('fairtrade',{'nombre':'Fairtrade','tipo':'Certificación','fuente':'https://fairtrade.net/content/dam/fairtrade/fairtrade-international/hazardous-materials-list/Hazardous_Materials_List_EN.pdf','version':'Hazardous Materials List, versión 1.6 (junio de 2026)',
 'resumen':'Lista roja (prohibidas), naranja (restringidas: solo con manejo integrado, rotación y plan de reducción) y amarilla (peligrosas, se recomienda abandonarlas).',
 'cats':{'roja':['Lista roja','bad','Prohibida en producto Fairtrade.'],'naranja':['Lista naranja','warn','Restringida: manejo integrado, rotación, plan de reducción y condiciones específicas.'],'amarilla':['Lista amarilla','info','Peligrosa: usar con mucha precaución; se recomienda abandonarla.']}},match_entries(ents))
# ---------------- Rainforest Alliance
t=open(S+'/src/ra_v14.txt').read()
def ra_section(head,stop):
    a=t.index(head); b=t.index(stop,a+10) if stop else len(t)
    return re.findall(r'\n(\d{1,3})\.\n \| ([^\n|]+)\n \| ([^\n|]*)',t[a:b])
pro=ra_section('PROHIBITED PESTICIDES Active ingredient','Obsolete Pesticides linked to')
obs=ra_section('OBSOLETE PESTICIDES(active ingredient)','Risk Mitigation Pesticides\n')
rm=ra_section('RISK MITIGATION PESTICIDES\n','Risk mitigation measures for use of Risk')
print('RA',len(pro),len(obs),len(rm), file=sys.stderr)
ents=[(x[1],'prohibida',None) for x in pro]+[(x[1],'obsoleta',None) for x in obs]+[(x[1],'mitigacion',None) for x in rm]
# sales/ésteres: «Glyphosate isopropylamine», «2,4-D, 2-ethylhexyl ester» → materia activa base
ents+= [(re.split(r',| isopropylamine| trimesium| potassium| sodium| ammonium| dimethylamine| salt| ester',x[1])[0],'mitigacion',None) for x in rm]
ents+= [(re.split(r',| salt| ester',x[1])[0],'prohibida',None) for x in pro]
add('ra',{'nombre':'Rainforest Alliance','tipo':'Certificación','fuente':'https://knowledge.rainforest-alliance.org/docs/farming-annex-v14','version':'Farming Annex (anexo de agricultura), versión vigente consultada en octubre de 2026',
 'resumen':'Plaguicidas prohibidos, obsoletos y de mitigación de riesgos (solo con manejo integrado y medidas de protección para personas, agua, fauna y polinizadores). Hay excepciones por cultivo y país.',
 'cats':{'prohibida':['Prohibida','bad','No se puede usar (salvo excepción concedida para cultivo y país).'],'obsoleta':['Obsoleta','bad','Prohibida.'],'mitigacion':['Mitigación de riesgos','warn','Solo dentro de manejo integrado y con medidas de mitigación (EPI, zonas de protección, polinizadores, vecinos).']}},match_entries(ents))
# ---------------- PAN HHP 2024
pan=re.findall(r'^\s*(\d{1,3})\s+([\d\-]+|\S+)\s{2,}(\S.*?)(?:\s{2,}|$)',open(S+'/src/pan_hhp_2024.txt').read(),re.M)
pan=[p for p in pan if int(p[0])<=360 and re.match(r'\d+-\d+-\d|see|group|-',p[1],re.I)]
grp=['glyphosate','paraffin oil']
ents=[(p[2],'hhp',None) for p in pan]+[(g,'hhp','Solo aceites con más de un 3 % de extracto en DMSO; los aceites de parafina agrícolas refinados normalmente no lo superan.' if 'paraffin' in g else None) for g in grp]
print('PAN',len(pan),file=sys.stderr)
add('pan',{'nombre':'PAN: plaguicidas altamente peligrosos','tipo':'Lista de referencia','fuente':'https://www.pan-uk.org/site/wp-content/uploads/PAN_HHP_List_2024.pdf','version':'PAN International HHP List, diciembre de 2024',
 'resumen':'Plaguicidas altamente peligrosos según toxicidad aguda, efectos a largo plazo, impacto ambiental, abejas y convenios internacionales. Es la base de muchas políticas de clientes (M&S, Fairtrade…).',
 'cats':{'hhp':['Altamente peligroso','info','Figura en la lista de plaguicidas altamente peligrosos de PAN.']}},match_entries(ents))
# ---------------- ALDI SÜD
ents=[(x,'prohibida',None) for x in ['thiamethoxam','chlorpyrifos','clothianidin','cypermethrin','deltamethrin','fipronil','imidacloprid','sulfoxaflor']]
add('aldi',{'nombre':'ALDI SÜD','tipo':'Cliente (Alemania)','fuente':'https://newfoodmagazine.com/?p=22237','version':'Exclusión de 8 materias activas tóxicas para abejas (desde 2016). ALDI no publica el resto de sus especificaciones.',
 'resumen':'Desde 2016 excluye 8 materias activas tóxicas para las abejas en la fruta y hortaliza que vende. El resto de requisitos (residuos, nº de materias activas) se comunica a los proveedores.',
 'cats':{'prohibida':['Excluida','bad','ALDI SÜD no la admite en fruta y hortaliza.']}},match_entries(ents))
# ---------------- UE
EU=json.load(open(S+'/src/ue_sustancias.json')); EUi={}
for e in EU:
    k=n(e['substance_name'])
    if k not in EUi or ((EUi[k].get('substance_status') or '')!='Approved' and e.get('substance_status')=='Approved'): EUi[k]=e
res={}
for en,ess in EN_ES.items():
    e=next((EUi[v] for v in variants(en) if v in EUi),None)
    if not e: continue
    cat=None
    if (e.get('candidate_for_substitution') or '').lower().startswith('y'): cat='cfs'
    elif (e.get('low_risk_active_substance') or '').lower().startswith('y'): cat='bajo_riesgo'
    elif (e.get('basic_substance') or '').lower().startswith('y'): cat='basica'
    if (e.get('substance_status') or '').lower().startswith('not approved'): cat='no_aprobada'
    if cat:
        for es in ess: res[es]=(cat,e.get('expiry_date'),e['substance_name'])
add('ue',{'nombre':'Unión Europea','tipo':'Normativa','fuente':'https://food.ec.europa.eu/plants/pesticides/eu-pesticides-database_en','version':'EU Pesticides Database (se actualiza con los datos)',
 'resumen':'Situación de cada materia activa en la UE: candidata a sustitución (conviene buscar alternativas y suele ser motivo de mejora en auditorías), de bajo riesgo o básica.',
 'cats':{'cfs':['Candidata a sustitución','info','Materia activa que la UE considera prioritaria sustituir por alternativas.'],'bajo_riesgo':['Bajo riesgo','ok','Sustancia activa de bajo riesgo.'],'basica':['Sustancia básica','ok','Sustancia básica.'],'no_aprobada':['No aprobada en la UE','bad','La materia activa no está aprobada en la UE.']}},res)
json.dump({'P':P,'SUS':SUS,'COND':COND},open(S+'/prot/build_out.json','w'),ensure_ascii=False,indent=1)
for k,v in P.items(): print(k,v['n_registro'])
# ---------------- Ecológico (Reglamento de Ejecución UE 2021/1165, anexo I, con modificaciones hasta 2025/973)
BIOM=re.compile(r'cepa|strain|bacillus|trichoderma|virus|beauver|beauvaria|metarhiz|isaria|paecilo|pseudomonas|pythium|saccharo|candida|aureobas|coniothyr|gliocl|ampelom|akanthom|purpureo',re.I)
FERO=re.compile(r'acetat|-ol\b|enal\b|dien|trien|dodecen|tetradecen|hexadecen|rescalure|Mezcla de \(E\)',re.I)
COBRE='Máximo 28 kg de cobre por hectárea en 7 años.'
ECO={'COS-OGA':None,'CEREVISANE':None,'FOSFATO FERRICO':None,'LAMINARIN':'Kelp de acuicultura ecológica o recolección sostenible.','ABE IT 56':'No procedente de OMG.','Pirofosfato férrico':None,
 'Extracto acuoso de semillas germinadas de Lupinus albus dulce':None,'senecioato de lavandulilo':None,'Hidrogenocarbonato de potasio':None,'Repelente  de  orgien  animal  o vegetal/grasa de ovino':'Como repelente por el olor.',
 'SPINOSAD':None,'Dioxido de carbono':None,'ETILENO':'Solo plátano y patata; en cítricos, solo dentro de una estrategia contra la mosca de la fruta.',
 'SALES DE POTASIO DE ÁCIDOS GRASOS INSATURADOS C7-C18 & C18':'Todos los usos salvo herbicida.','SALES POTASICAS DE ACIDOS GRASOS VEGETALES':'Todos los usos salvo herbicida.','ÁCIDOS GRASOS C7-C18 Y SALES POTÁSICAS INSATURADAS C18':'Todos los usos salvo herbicida.',
 'Extracto de ajo':None,'Proteinas hidrolizadas':'Salvo gelatina.','CAOLIN':None,'TIERRA DE DIATOMEAS':None,'Azadiractin':'Extraída de semillas de neem.',
 'ACEITE DE CLAVO':'Salvo herbicida.','ACEITE DE COLZA':'Salvo herbicida.','Aceites vegetales/aceite de colza':'Salvo herbicida.','ACEITE DE CANOLA (CAS 120962-03-0)':'Salvo herbicida.','ACEITE DE MENTA':'Salvo herbicida.','ACEITE DE NARANJA':'Salvo herbicida.',
 'EXTRACTO DEL ARBOL DE TÉ (Melaleuca alternifolia)':'Salvo herbicida.','Piretrinas':'Extraídas de plantas.','AZUFRE':None,'POLISULFURO DE CALCIO':None,'MALTODEXTRINA':None,'EUGENOL':None,'GERANIOL':None,'TIMOL':None,
 'ACEITE DE PARAFINA (CAS 8042-47-5)':None,'ACEITE DE PARAFINA (CAS 97862-82-3)':None,'ACEITE DE PARAFINA (CAS: 64742-46-7)':None,'Aceite de parafina':None,
 'HIDROXIDO CUPRICO':COBRE,'OXICLORURO DE COBRE':COBRE,'OXIDO CUPROSO':COBRE,'Óxido de Cobre (I)':COBRE,'CALDO BORDELÉS':COBRE,'SULFATO TRIBASICO DE COBRE':COBRE,'SULFATO CUPROCALCICO':COBRE,
 'DELTAMETRIN':'Solo en trampas con atrayentes contra Bactrocera oleae, Ceratitis capitata y Rhagoletis completa.','LAMBDA CIHALOTRIN':'Solo en trampas con atrayentes contra Bactrocera oleae y Ceratitis capitata.',
 'LECITINA DE SOJA':'Sustancia básica.'}
res={}
for es in ES_EN:
    if es in ECO: res[es]=('condicionada' if ECO[es] else 'permitida',ECO[es],es)
    elif BIOM.search(es): res[es]=('permitida','Microorganismo: no procedente de OMG.',es)
    elif re.search(r'alcohol graso|alquil|isodecil|latex|metil oleato|^ceras$|ésteres metílicos',es,re.I): res[es]=('condicionada','Coadyuvante: se permite si está autorizado como tal.',es)
    elif FERO.search(es) and not ES_EN.get(es): res[es]=('condicionada','Feromonas: solo en trampas y dispersores, sin contacto con el cultivo.',es)
    else: res[es]=('no','',es)
add('eco',{'nombre':'Agricultura ecológica','tipo':'Normativa','fuente':'https://eur-lex.europa.eu/eli/reg_impl/2021/1165/oj','version':'Reglamento de Ejecución (UE) 2021/1165, anexo I (modificado por 2023/121, 2023/2229 y 2025/973)',
 'resumen':'Materias activas que pueden usarse en producción ecológica: sustancias básicas y de bajo riesgo, microorganismos, feromonas en trampas y una lista cerrada de otras (cobre, azufre, aceites, spinosad, piretrinas…), con sus condiciones.',
 'cats':{'permitida':['Permitida','ok','Se puede usar en ecológico (producto autorizado y según su etiqueta).'],'condicionada':['Permitida con condiciones','info','Se puede usar en ecológico con las condiciones indicadas.'],'no':['No permitida','bad','No se puede usar en producción ecológica.']}},res)
# ---------------- Protocolos sin lista de materias activas (solo requisitos)
P['leaf']={'nombre':'LEAF Marque','tipo':'Certificación','fuente':'https://leaf.eco/leafmarque/standard','version':'LEAF Marque Standard (puntos 3.2 a 3.20, protección de cultivos)','sin_lista':True,
 'resumen':'No tiene lista de materias activas. Exige manejo integrado: justificar cada tratamiento (3.4), decidir cuándo tratar con un sistema (3.3), tener en cuenta el impacto ambiental (3.5), respetar los plazos de seguridad (3.8), registrar las aplicaciones (3.11), recomendación de persona cualificada (3.13), usar solo productos autorizados (3.18) a la dosis y el momento adecuados (3.19).','cats':{}}
P['globalgap']={'nombre':'GLOBALG.A.P. IFA','tipo':'Certificación','fuente':'https://www.globalgap.org/','version':'IFA v6','sin_lista':True,
 'resumen':'No tiene lista propia de materias activas. Exige usar productos registrados en el país para el cultivo, seguir la etiqueta, respetar los plazos de seguridad y el LMR del país de destino, justificar y registrar cada tratamiento y no usar sustancias de los convenios de Estocolmo, Rotterdam y Montreal.','cats':{}}
P['lidl']={'nombre':'Lidl','tipo':'Cliente (Alemania)','fuente':'https://corporate.lidl.lu/content/download/18409/fileupload/19_INTERN_CSR_PoPa_Papers_Inkoopbeleid_DE.pdf','version':'Especificación de residuos para fruta y hortaliza fresca','sin_lista':True,
 'resumen':'No publica lista de materias activas. Fija límites de residuo: cada materia activa como máximo 1/3 del LMR, suma de residuos como máximo el 80 % de los LMR, como máximo 5 materias activas detectadas y como máximo el 100 % de la dosis aguda de referencia (ARfD).','cats':{}}
P['wwf']={'nombre':'EDEKA-WWF (Proyecto Zitrus)','tipo':'Cliente · solo cítricos','fuente':'','version':'Tablas del proyecto 2025-2026','sin_lista':False,'wwf':True,
 'resumen':'Tabla por plaga para cítricos de España: alternativas permitidas, excepcionales y muy excepcionales, máximos de aplicaciones por materia activa, control biológico y medidas culturales.','cats':{}}
ORDER=['wwf','leaf','globalgap','tesco','ms','lidl','aldi','fairtrade','ra','pan','eco','ue']
out={'fecha':__import__('datetime').date.today().isoformat(),'orden':ORDER,'protocolos':{k:P[k] for k in ORDER},'sus':SUS,'cond':COND}
json.dump(out,open('data/protocolos.json','w'),ensure_ascii=False,separators=(',',':'))
json.dump(ES_EN,open('data/sustancias_en.json','w'),ensure_ascii=False,indent=1)
print('eco',P['eco']['n_registro'])
