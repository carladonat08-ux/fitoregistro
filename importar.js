"use strict";
// =====================================================================================
// FitoLupa · Revisar cuaderno
// Lee un cuaderno de tratamientos (Excel tipo Atalaya o PDF «Resumen recetas foliares»)
// y revisa cada aplicación contra el Registro del MAPA y, si se pide, contra la tabla del
// Proyecto Zitrus EDEKA-WWF. Todo se procesa en el navegador: el archivo no se envía a
// ningún sitio y se descarta al cerrar o vaciar la revisión.
// Usa funciones y datos del script principal (P, byId, USOS, IDX, WWF, norm, regKey…).
// =====================================================================================

const REV = { file: null, mode: "generica", recs: [], res: [], counts: [], filter: "todo", parcela: "", q: "" };

// ------------------------------------------------------------------ utilidades
const isoFromDMY = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ""); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null; };
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
const numEs = v => { if (v == null || v === "") return null; if (typeof v === "number") return v; const m = String(v).replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(",", ".")) : null; };
const maxApl = txt => { if (!txt) return null; const n = (String(txt).match(/\d+/g) || []).map(Number); return n.length ? Math.max(...n) : null; };

// ------------------------------------------------------------------ PDF «Resumen recetas foliares»
let PDFJS_PROMISE = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (PDFJS_PROMISE) return PDFJS_PROMISE;
  const add = src => new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  const local = "vendor/pdf.min.js", cdn = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  PDFJS_PROMISE = add(local).catch(() => add(cdn)).then(() => {
    const lib = window.pdfjsLib;
    try { lib.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.js", location.href).href; } catch {}
    return lib;
  });
  return PDFJS_PROMISE;
}
async function pdfPages(buf) {
  const lib = await loadPdfJs();
  let doc;
  try { doc = await lib.getDocument({ data: buf.slice(0) }).promise; }
  catch { doc = await lib.getDocument({ data: buf.slice(0), disableWorker: true }).promise; }
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i), tc = await pg.getTextContent();
    pages.push(tc.items.filter(it => it.str && it.str.trim()).map(it => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() })));
  }
  return pages;
}
// Convierte las líneas de texto (con su posición) en aplicaciones. Probado con el formato
// «RESUMEN RECETAS FOLIARES» (sector · receta · productos, dosis por 1.000 L de caldo).
function parseRecetas(pages) {
  const recs = []; let sec = {}, rec = null, base = null, last = null, mode = null;
  pages.forEach((items, pi) => {
    const lines = [];
    for (const it of items.slice().sort((a, b) => b.y - a.y || a.x - b.x)) {
      const l = lines.find(l => Math.abs(l.y - it.y) <= 2.2);
      if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    lines.sort((a, b) => b.y - a.y).forEach(l => l.items.sort((a, b) => a.x - b.x));
    for (const l of lines) {
      const txt = l.items.map(i => i.s).join(" ");
      if (l.y >= 770 || l.y < 60 || /^RESUMEN RECETAS/i.test(txt) || /P[áa]gina \d+ de \d+/.test(txt)) continue;
      if (/\bSECTOR\b/.test(txt) && /VARIEDAD/.test(txt)) { mode = "sector"; continue; }
      if (/Num receta/.test(txt)) { mode = "receta"; continue; }
      if (/Num_Reg/.test(txt) && /Nom_Comercial/.test(txt)) {
        const b = l.items.find(i => i.x > 460 && i.x < 505 && /^[\d.]+$/.test(i.s));
        base = b ? Number(b.s.replace(/\./g, "")) : null; mode = "rows"; last = null; continue;
      }
      const at = (a, b) => l.items.filter(i => i.x >= a && i.x < b).map(i => i.s).join(" ").trim();
      if (mode === "sector") {
        sec = { sector: at(0, 150), variedad: at(150, 380), superficie: numEs(at(380, 470)), paraje: at(470, 700) };
        mode = null; continue;
      }
      if (mode === "receta") {
        const left = at(0, 410), m = /^([A-Z]{1,3}\d{3,7})\b\s*(.*)$/.exec(left);
        rec = { receta: m ? m[1] : at(0, 150), motivo: m ? m[2] : at(150, 410), fecha: isoFromDMY(at(410, 500)), cumpl: isoFromDMY(at(500, 700)) };
        mode = null; continue;
      }
      if (mode === "rows" && rec) {
        const reg = at(0, 170), nombre = at(170, 285), ma = at(285, 445), dosis = at(445, 510), uni = at(510, 545), ps = at(545, 700);
        if (!reg && !dosis && !uni && !ps && last) {           // nombre o materia activa en dos líneas
          if (nombre) last.nombre += " " + nombre;
          if (ma) last.ma += " " + ma;
          continue;
        }
        if (!nombre && !ma) continue;
        last = { src: "pdf", pagina: pi + 1, parcela: sec.sector || "", variedad: sec.variedad || "", superficie: sec.superficie, paraje: sec.paraje || "",
          receta: rec.receta, objeto: rec.motivo, fecha: rec.fecha, cumpl: rec.cumpl, base, reg, nombre, ma,
          dosis: numEs(dosis), uni: uni.replace(/\.$/, ""), ps: ps };
        recs.push(last);
      }
    }
  });
  return recs;
}

// ------------------------------------------------------------------ Excel (cuaderno tipo Atalaya y similares)
const XCOLS = {
  finca: ["finca", "explotacion"], anio: ["ano", "campana"], ntrat: ["n trat", "no trat", "n° trat", "num trat", "tratamiento"],
  parcela: ["parcela", "sector", "variedad"], tipo: ["tipo"], sup: ["sup", "superficie"], objeto: ["objeto", "plaga", "motivo", "problema"],
  fecha: ["fecha inicio", "fecha"], fechafin: ["fecha fin", "fecha final"], ma: ["materia activa", "sustancia"], nombre: ["nombre comercial", "producto"],
  reg: ["registro", "n registro", "nº registro"], dosis_cc: ["dosis cc", "cc/l"], dosis_g: ["dosis g", "g/l"], caldo: ["caldo"], plazo: ["plazo", "ps"]
};
function parseExcel(buf) {
  const wb = XLSX.read(buf, { type: "array" });
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const hi = rows.slice(0, 25).findIndex(r => r && r.some(c => /nombre comercial/i.test(String(c || ""))) && r.some(c => /registro/i.test(String(c || ""))));
    if (hi < 0) continue;
    const head = rows[hi].map(c => norm(String(c || "")).replace(/[º°]/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim());
    const col = {};
    for (const [k, alias] of Object.entries(XCOLS)) {
      let idx = -1;
      for (const a of alias) { idx = head.findIndex((h, i) => h && h.includes(norm(a).replace(/[º°]/g, "").replace(/\./g, "")) && !Object.values(col).includes(i)); if (idx >= 0) break; }
      if (idx >= 0) col[k] = idx;
    }
    if (col.fecha === col.fechafin) delete col.fechafin;
    const recs = [];
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const g = k => col[k] == null ? null : row[col[k]];
      if (row.some(c => typeof c === "string" && /^\|.*\|$/.test(c))) continue;           // fila de códigos de campo
      if (!g("nombre") && !g("reg") && !g("ma")) continue;
      const d = v => Object.prototype.toString.call(v) === "[object Date]" ? v.toISOString().slice(0, 10) : typeof v === "number" ? (() => { const p = XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}` : null; })() : isoFromDMY(String(v || ""));
      recs.push({ src: "xlsx", hoja: name, fila: r + 1, finca: g("finca") || "", ntrat: g("ntrat"), parcela: String(g("parcela") || ""), tipo: g("tipo") || "", superficie: numEs(g("sup")),
        objeto: String(g("objeto") || ""), fecha: d(g("fecha")), fechafin: d(g("fechafin")), ma: String(g("ma") || ""), nombre: String(g("nombre") || ""), reg: String(g("reg") || ""),
        dosis_cc: g("dosis_cc"), dosis_g: g("dosis_g"), caldo: g("caldo"), ps: g("plazo") == null ? "" : String(g("plazo")) });
    }
    if (recs.length) return { hoja: name, recs };
  }
  throw new Error("No encuentro una hoja con las columnas «Nombre comercial» y «Nº Registro».");
}

// ------------------------------------------------------------------ objeto / motivo → códigos de plaga del registro
// [expresión, códigos, grupo]: dentro de un mismo grupo solo cuenta la primera coincidencia (la más concreta)
const OBJ_MAP = [
  [/pulg|afid|aphis|toxoptera/, ["6.2.2.3.3"]], [/minador|phyllocnistis/, ["6.2.4.9.2"]], [/scirto|trips/, ["6.2.3"]],
  [/piojo rojo|aonidiella|escudos? (de )?piojo rojo/, ["6.2.2.3.7.1"], "piojo"], [/piojo blanco|aspidiotus/, ["6.2.2.3.7.2"], "piojo"], [/piojo gris|parlatoria/, ["6.2.2.3.7.8"], "piojo"],
  [/serpeta|lepidosaphes/, ["6.2.2.3.7"], "piojo"], [/piojo|diaspid/, ["6.2.2.3.7"], "piojo"],
  [/sudafrica|cotonet africano|delottococcus/, ["6.2.2.3.6.1"], "cotonet"], [/cotonet|planococcus/, ["6.2.2.3.6.5", "6.2.2.3.6.1"], "cotonet"], [/harinosa|pseudococ/, ["6.2.2.3.6"], "cotonet"],
  [/caparreta|saissetia/, ["6.2.2.3.4"], "cochinilla"], [/acanalada|icerya/, ["6.2.2.3.11"], "cochinilla"], [/cochinilla/, ["6.2.2.3"], "cochinilla"],
  [/mosca blanca|moscas blancas|aleyro|aleurothrixus|dialeurodes|parabemisia|paraleyrodes/, ["6.2.2.3.1"]],
  [/ceratitis|mosca de la fruta|mosca mediterr/, ["6.2.8.11.3"]], [/mosquito verde|empoasca|asymmetrasca|jacobiasca/, ["6.2.2.2.3"]],
  [/arana|acaro|panonychus|tetranychus|eutetranychus/, ["6.1"]], [/caracol/, ["7.2", "7.1"]], [/babosa|limaco/, ["7.1"]],
  [/hierba|herbicid|grama|coniza|canota|gramine/, ["1"]], [/aguado|ph?ytoph?th?ora|fitoft|gomosis/, ["8.48.4"]], [/alternaria/, ["8.59.1"]],
  [/cuaj/, ["12.7"]], [/caida/, ["12.8"]], [/engorde|aumento (de )?fruto|auemento fruto|calibre|tamano|peso del fruto/, ["12.19", "12.3"]], [/piel|corteza/, ["12.27"]],
  [/penicil|podredumbre/, ["8.4"]], [/hormig/, ["__hormigas"]]
];
function objetoCodes(txt) {
  const t = norm(txt || ""); const out = [], groups = new Set();
  for (const [re, codes, grp] of OBJ_MAP) {
    if (grp && groups.has(grp)) continue;
    if (re.test(t)) { out.push(...codes); if (grp) groups.add(grp); }
  }
  return [...new Set(out)];
}
const BIO_RE = /cryptolaemus|anagyrus|aphytis|phytoseiulus|neoseiulus|amblyseius|swirskii|chrysoperla|orius|rodolia|fauna auxiliar|enemigo natural/;
const NO_FITO_HINT = /corrector|carenc|estimul|abono|nutri|bioestim|fertiliz/;

// ------------------------------------------------------------------ identificar el producto
function resolveProduct(reg, nombre) {
  const nk = x => norm(x).replace(/[^a-z0-9%]+/g, " ").trim();
  const k = regKey(reg), d = regDigits(reg), nn = norm(String(nombre || "").replace(/\(.*?\)/g, " ")).replace(/\s+/g, " ").trim();
  const paren = (String(nombre || "").match(/\(([^)]+)\)/) || [])[1];
  let p = null, how = "";
  if (k) { p = P.find(x => x.rk === k) || (/^\d+$/.test(k) ? P.find(x => /^\d+$/.test(x.reg) && x.rd === d) : null); how = p ? "reg" : ""; }
  const byName = n => { if (!n) return null; const q = nk(n); const ex = P.filter(x => nk(x.n) === q || x.an.some(a => nk(a) === q)); return ex.find(x => x.estado === "Vigente") || ex[0] || null; };
  if (!p) { p = byName(nn) || byName(paren && norm(paren)); how = p ? "nombre" : ""; }
  const notes = [];
  if (p && how === "reg" && nn) {
    const known = q => q && (nk(p.n) === nk(q) || p.an.some(a => nk(a) === nk(q)) || nk(p.n).includes(nk(q)) || nk(q).includes(nk(p.n)));
    if (!known(nn) && !(paren && known(norm(paren)))) notes.push(["warn", `El nº ${p.reg} corresponde a «${p.nombre}» en el registro, no a «${nombre}».`]);
    else if (p.an.some(a => nk(a) === nk(nn))) notes.push(["info", `«${nombre}» es otra denominación comercial de ${p.nombre}.`]);
  }
  if (p && how === "nombre" && k) notes.push(["warn", `El nº anotado (${reg}) no coincide: «${p.nombre}» tiene el nº ${p.reg}.`]);
  return { p, how, notes, regNoExiste: !!(k && !p) };
}

// ------------------------------------------------------------------ revisar una aplicación
function campoUses(p) { return ((USOS && USOS.u[p.id]) || []).filter(u => isCampo(cropCode(u))); }
function usesForCodes(uses, codes) {
  return uses.filter(u => { const a = IDX.a[u[1]][0]; return codes.some(c => a === c || a.startsWith(c + ".") || (c.startsWith(a + ".") && a.includes("."))); });
}
function declaredConc(r, p) {
  // Concentración anotada en el cuaderno, en cc/L (líquidos) o g/L (sólidos)
  if (r.src === "xlsx") {
    const cc = numEs(r.dosis_cc), g = numEs(r.dosis_g);
    const raw = String(r.dosis_cc || r.dosis_g || "");
    if (/ha/i.test(raw)) return { perHa: numEs(raw), unit: /kg/i.test(raw) ? "kg/ha" : /l/i.test(raw) ? "l/ha" : raw.replace(/[\d.,\s]/g, "") };
    if (cc != null) return { v: cc, u: "cc/L" };
    if (g != null) return { v: g, u: "g/L" };
    return null;
  }
  if (r.base === 1000 && r.dosis != null) {
    const u = norm(r.uni);
    if (u.startsWith("l")) return { v: r.dosis, u: "cc/L" };
    if (u.startsWith("gr") || u === "g") return { v: r.dosis / 1000, u: "g/L" };
    if (u.startsWith("kg")) return { v: r.dosis, u: "g/L" };
    if (u.startsWith("cc") || u.startsWith("ml")) return { v: r.dosis / 1000, u: "cc/L" };
  }
  return null;
}
function revisar(r) {
  const out = { r, sev: "ok", notes: [], p: null, kind: "fito", uses: [], dosisAut: "", plazoReg: "", wwf: null };
  const add = (sev, msg) => out.notes.push([sev, msg]);
  const nameNorm = norm(r.nombre + " " + r.ma);
  if (BIO_RE.test(nameNorm) || BIO_RE.test(norm(r.objeto))) { out.kind = "bio"; out.sev = "bio"; add("ok", "Control biológico (suelta de fauna auxiliar): no necesita registro fitosanitario."); return out; }
  const id = resolveProduct(r.reg, r.nombre);
  out.p = id.p; id.notes.forEach(n => add(...n));
  if (!id.p) {
    if (id.regNoExiste) { add("bad", `El nº de registro ${r.reg} no figura en el Registro de Productos Fitosanitarios.`); }
    else {
      out.kind = "nofito"; add("info", "Sin nº de registro y no figura como fitosanitario: abono, corrector, bioestimulante u otro producto.");
      if (REV.mode === "wwf" && objetoCodes(r.objeto).length && !NO_FITO_HINT.test(norm(r.objeto)))
        add("warn", "WWF: no se pueden emplear fertilizantes o fitofortificantes para el control de plagas sin autorización del proyecto.");
    }
    out.sev = id.regNoExiste ? "bad" : (worst(out.notes) === "warn" ? "warn" : "nr"); return out;
  }
  const p = id.p;
  // Materia activa anotada frente a la del registro
  if (r.ma) {
    const decl = norm(r.ma);
    const firstWords = p.sus.map(s => norm(s[0]).split(/[\s(,]/)[0]).filter(w => w.length > 3);
    if (firstWords.length && !firstWords.some(w => decl.includes(w.slice(0, 6))) && !/fosfato ferrico|trifosfato/.test(decl + firstWords.join(" ")))
      add("warn", `Materia activa anotada «${r.ma}»; en el registro: ${susTxt(p)}.`);
    else {
      const dc = numEs(r.ma), rc = p.sus.length === 1 && (!p.sus[0][2] || /%/.test(p.sus[0][2])) ? concNum(p.sus[0]) : null;
      if (dc != null && rc != null && Math.abs(dc - rc) > Math.max(0.5, rc * 0.08)) add("warn", `Concentración anotada ${fmtNum(dc)}%; en el registro: ${susTxt(p)}.`);
    }
  }
  // Situación del producto en la fecha de aplicación
  const f = r.fecha;
  if (!f) add("warn", "Sin fecha de aplicación: no se puede comprobar la vigencia.");
  else {
    if (p.canc && p.canc <= f) add("bad", `Producto cancelado el ${fmtDate(p.canc)}, antes de la aplicación.`);
    else if (p.estado !== "Vigente") add("warn", `Producto cancelado${p.canc ? " el " + fmtDate(p.canc) : ""} (después de la aplicación).`);
    if (p.cad && p.cad < f) add("bad", `Autorización caducada el ${fmtDate(p.cad)}, antes de la aplicación.`);
    if (p.limV && p.limV < f) add("warn", `La fecha límite de venta (${fmtDate(p.limV)}) es anterior a la aplicación: comprueba el plazo de uso de existencias.`);
  }
  // Uso autorizado en cítricos para el objeto anotado
  const cu = campoUses(p);
  const codes = objetoCodes(r.objeto).filter(c => !c.startsWith("__"));
  if (!cu.length) { add("bad", p.post ? "Solo tiene usos autorizados en postcosecha, no en cítricos en campo." : "No tiene ningún uso autorizado en cítricos."); out.sev = worst(out.notes); return finishWwf(out, codes); }
  let uses = cu;
  if (codes.length) {
    const m = usesForCodes(cu, codes);
    if (m.length) uses = m;
    else add("bad", `No está autorizado en cítricos contra «${r.objeto}». Autorizado para: ${listShort([...new Set(cu.map(u => IDX.a[u[1]][1]))], 4)}.`);
    if (m.length && m.every(u => { const a = IDX.a[u[1]][0]; return !codes.some(c => a === c || a.startsWith(c + ".")); }))
      add("info", `Autorizado por un uso genérico del grupo (${[...new Set(m.map(u => IDX.a[u[1]][1]))].join(", ")}).`);
  } else if (r.objeto && !NO_FITO_HINT.test(norm(r.objeto))) add("info", `No reconozco la plaga en «${r.objeto}»: revisa que el uso esté autorizado.`);
  out.uses = uses;
  // Dosis
  const dc = declaredConc(r, p);
  const convs = uses.map(u => ({ c: convPair(p, u), u })).filter(x => x.c);
  out.dosisAut = [...new Set(uses.map(u => { const c = convText(p, u); return doseText(u) + (c ? " (" + c.slice(2) + ")" : ""); }))].slice(0, 3).join(" · ");
  if (dc && convs.length) {
    const perL = convs.filter(x => x.c.per === "L"), perHa = convs.filter(x => x.c.per === "ha");
    if (dc.v != null && perL.length) {
      const mn = Math.min(...perL.map(x => x.c.min)), mx = Math.max(...perL.map(x => x.c.max));
      if (dc.v > mx * 1.02) add("bad", `Dosis ${fmtNum(dc.v)} ${dc.u} superior a la máxima autorizada (${fmtNum(mx)} ${perL[0].c.u}).`);
      else if (dc.v < mn * 0.98) add("info", `Dosis ${fmtNum(dc.v)} ${dc.u} inferior a la mínima autorizada (${fmtNum(mn)} ${perL[0].c.u}).`);
    } else if (perHa.length) {
      const mn = Math.min(...perHa.map(x => x.c.min)) / 1000, mx = Math.max(...perHa.map(x => x.c.max)) / 1000;   // l/ha o kg/ha
      const unitHa = p.liquid ? "l/ha" : "kg/ha";
      let ha = dc.perHa != null ? dc.perHa : null, how = "anotada";
      if (ha == null && dc.v != null) {
        if (dc.v >= mn * 0.98 && dc.v <= mx * 1.02) { ha = dc.v; how = "anotada (parece expresada por hectárea)"; }
        else { const cal = numEs(r.caldo); if (cal) { ha = dc.v * cal / 1000; how = `calculada con ${fmtNum(cal)} l/ha de caldo`; } }
      }
      if (ha != null) {
        if (ha > mx * 1.02) add("bad", `Dosis ${how}: ${fmtNum(+ha.toFixed(3))} ${unitHa}, superior a la máxima autorizada (${fmtNum(mx)} ${unitHa}).`);
        else if (ha < mn * 0.98) add("info", `Dosis ${how}: ${fmtNum(+ha.toFixed(3))} ${unitHa}, inferior a la mínima autorizada (${fmtNum(mn)} ${unitHa}).`);
      }
    }
  }
  // Caldo
  const cal = numEs(r.caldo);
  if (cal && r.src === "xlsx" && !/ha/i.test(String(r.caldo).replace(/l\/ha/i, "")) ) {
    const rng = uses.map(u => parseCaldo(S(u[9]))).filter(Boolean);
    if (rng.length) { const mn = Math.min(...rng.map(x => x.min)), mx = Math.max(...rng.map(x => x.max)); if (cal < mn * 0.9 || cal > mx * 1.1) add("warn", `Caldo ${fmtNum(cal)} l/ha fuera del rango del registro (${fmtNum(mn)}–${fmtNum(mx)} l/ha).`); }
  }
  // Plazo de seguridad (si el registro lo da en texto, se busca la cláusula de la plaga: «30 DÍAS PARA TRIPS…»)
  const pls = uses.map(u => S(u[5])).filter(Boolean);
  const days = pls.filter(x => /^\d+$/.test(x)).map(Number);
  const txts = [...new Set(pls.filter(x => !/^\d+$/.test(x) && x !== "NO PROCEDE"))];
  const objN = norm(r.objeto);
  const clauseDays = [];
  for (const t of txts) for (const m of norm(t).matchAll(/(\d+)\s*dias?\s*(?:para|en)?\s*([^\d]*)/g)) {
    const words = m[2].split(/[,\s]+/).filter(w => w.length > 3).map(w => w.replace(/s$/, "").slice(0, 6));
    if (words.some(w => objN.includes(w)) || objetoCodes(m[2]).some(c => codes.includes(c))) clauseDays.push(Number(m[1]));
  }
  const regMax = clauseDays.length ? Math.max(...clauseDays) : days.length ? Math.max(...days) : null;
  out.plazoReg = [days.length ? (Math.min(...days) === Math.max(...days) ? days[0] + " días" : `${Math.min(...days)}–${Math.max(...days)} días`) : "", ...txts].filter(Boolean).join(" · ") || (pls.includes("NO PROCEDE") ? "NP" : "—");
  const declPs = String(r.ps ?? "").trim();
  const dps = /^np$|no procede/i.test(declPs) ? 0 : numEs(declPs);
  if (regMax != null && dps != null) {
    if (dps < regMax) add("bad", `Plazo de seguridad anotado: ${/^\d/.test(declPs) ? declPs + " días" : declPs}; el registro fija ${regMax} días para este uso.`);
  } else if (txts.length && dps != null && !clauseDays.length) add("warn", `El registro indica para el plazo: «${txts.join(" · ")}». Anotado: ${declPs || "—"}.`);
  if (r.cumpl && r.fecha && regMax != null) {
    const need = addDays(r.fecha, regMax);
    if (r.cumpl < need) add("bad", `El cumplimiento del plazo anotado (${fmtDate(r.cumpl)}) es anterior a la fecha + plazo del registro (${fmtDate(need)}).`);
  }
  return finishWwf(out, codes);
}
function finishWwf(out, codes) {
  const p = out.p;
  if (REV.mode === "wwf" && WWF && p) {
    const pls = codes.length ? WWF.plagas.filter(pl => pl.codigos.some(c => codes.some(k => c === k || c.startsWith(k + ".") || k.startsWith(c + ".")))) : [];
    let ev = pls.length ? pls.map(pl => wwfEval(p, pl.id)[0]).filter(Boolean) : wwfEval(p);
    const trampa = /\[RB\]/.test(p.form) && p.funs.has("Insecticida") || /trap|tramp/i.test(p.nombre);
    if (!ev.length && trampa) {
      out.notes.push(["warn", `WWF: ${p.nombre} es un dispositivo de atracción y muerte (trampa con insecticida). La tabla lo recoge como medio biotecnológico en la ficha de Ceratitis, pero su materia activa (${susTxt(p)}) no figura como alternativa química: confírmalo con el consultor.`]);
    } else if (!ev.length) {
      const any = wwfEval(p);
      out.notes.push(["bad", pls.length && any.length ? `WWF: no permitido contra ${pls.map(x => x.nombre).join(", ")}. En la tabla figura para: ${any.map(e => e.pl.nombre).join(", ")}.` : `WWF: su materia activa (${susTxt(p)}) no está en la tabla del proyecto.`]);
    } else {
      const best = ev.reduce((a, e) => (!a || WRANK[e.alt.cat] < WRANK[a.alt.cat] ? e : a), null);
      out.wwf = best;
      if (best.alt.cat === "excepcional") out.notes.push(["warn", `WWF: tratamiento excepcional (${best.pl.nombre}). Necesita la evaluación del consultor en BPA; documéntalo.`]);
      else if (best.alt.cat === "muy_excepcional") out.notes.push(["warn", `WWF: tratamiento muy excepcional (${best.pl.nombre}). ${best.alt.notas || ""}`]);
      else out.notes.push(["ok", `WWF: permitido (${best.pl.nombre}${best.alt.max ? " · máx. " + best.alt.max : ""}).`]);
      if (best.pl.id === "minador") out.notes.push(["warn", "WWF: el minador solo se controla en plantonadas e injertos, salvo consulta previa."]);
      if (best.pl.id === "hierbas") out.notes.push(["info", "WWF: herbicidas solo en la línea de plantación; prohibido en lindes, riberas, taludes y caminos."]);
      if (best.pl.id === "alternaria") out.notes.push(["info", "WWF: alternaria solo en Clemenvilla o Nova; en otras variedades, consulta previa."]);
    }
  }
  if (out.sev !== "bio") out.sev = worst(out.notes);
  return out;
}
function worst(notes, base = "ok") {
  const rank = { ok: 0, nr: 1, info: 2, warn: 3, bad: 4 };
  return notes.reduce((w, [s]) => (rank[s] > rank[w] ? s : w), base);
}

// ------------------------------------------------------------------ nº de aplicaciones
// Registro: el nº máximo de aplicaciones es de cada producto (y uso). WWF: el límite es de la materia activa, sea cual sea la marca.
function contarAplicaciones(res) {
  const groups = new Map();
  const add = (tipo, key, base, x) => {
    if (!groups.has(key)) groups.set(key, { tipo, ...base, apps: new Map(), max: null, maxTxt: "" });
    const g = groups.get(key), app = (x.r.receta || x.r.ntrat || x.r.fila) + "¦" + (x.r.fecha || "");
    g.apps.set(app, (g.apps.get(app) || []).concat(x));
    return g;
  };
  for (const x of res) {
    if (!x.p) continue;
    const parcela = x.r.parcela || "—", anyo = (x.r.fecha || "").slice(0, 4) || "—";
    const g = add("registro", ["R", parcela, anyo, x.p.id].join("¦"), { parcela, anyo, nombre: `${x.p.nombre} (${x.p.reg})` }, x);
    const rm = x.uses.map(u => maxApl(S(u[7]))).filter(v => v != null);
    if (rm.length) { const v = Math.max(...rm); if (g.max == null || v < g.max) { g.max = v; g.maxTxt = [...new Set(x.uses.map(u => S(u[7])).filter(Boolean))].join(" · "); } }
    if (REV.mode === "wwf" && x.wwf) {
      for (const s of x.p.sus) {
        const ma = s[0].toUpperCase().replace(/\s*\(.*?\)\s*/g, " ").trim();
        const w = add("wwf", ["W", parcela, anyo, ma].join("¦"), { parcela, anyo, nombre: ma }, x);
        const v = maxApl(x.wwf.alt.max);
        if (v != null && (w.max == null || v < w.max)) { w.max = v; w.maxTxt = x.wwf.alt.max; }
      }
    }
  }
  const rows = [...groups.values()].map(g => {
    const n = g.apps.size, over = g.max != null && n > g.max;
    if (over) [...g.apps.entries()].sort((a, b) => a[0].split("¦")[1].localeCompare(b[0].split("¦")[1])).slice(g.max).forEach(([, xs]) => xs.forEach(x => {
      x.notes.push(["bad", g.tipo === "wwf" ? `WWF: ${n} aplicaciones de ${g.nombre} en «${g.parcela}» en ${g.anyo}; el proyecto permite ${g.maxTxt} (cuenta la materia activa, sea cual sea la marca).`
        : `${n} aplicaciones de ${g.nombre} en «${g.parcela}» en ${g.anyo}; el registro permite ${g.maxTxt}. Si es el mismo tratamiento repartido en varios días, no es una incidencia.`]);
      x.sev = "bad";
    }));
    return { ...g, n, sev: over ? "bad" : g.max != null && n === g.max ? "lim" : "ok" };
  });
  return rows.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.parcela.localeCompare(b.parcela, "es", { numeric: true }) || a.nombre.localeCompare(b.nombre));
}

// ------------------------------------------------------------------ interfaz
const SEV = { ok: ["Correcto", "ok"], bio: ["Control biológico", "ok"], nr: ["Sin registro fitosanitario", "mute"], info: ["Correcto con observaciones", "ok"], warn: ["Revisar", "warn"], bad: ["Incidencia", "bad"] };
async function revisarArchivo(file) {
  REV.file = file;
  const box = $("#rvOut");
  box.innerHTML = `<div class="loading" style="padding:20px"><span class="spin"></span>Leyendo ${esc(file.name)}…</div>`;
  if (!USOS) { box.innerHTML = `<p class="empty">Los datos del registro aún se están cargando. Espera unos segundos y vuelve a intentarlo.</p>`; return; }
  if (REV.mode === "wwf" && !WWF) { box.innerHTML = `<p class="empty">Los datos del proyecto WWF no están disponibles en esta versión.</p>`; return; }
  try {
    const buf = await file.arrayBuffer();
    let recs, fmt;
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      const pages = await pdfPages(buf); recs = parseRecetas(pages); fmt = `PDF de recetas · ${pages.length} páginas`;
      if (!recs.length) throw new Error("No he reconocido recetas en el PDF. Este lector está preparado para el formato «Resumen recetas foliares».");
    } else {
      if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel. Revisa la conexión y recarga la página.");
      const x = parseExcel(buf); recs = x.recs; fmt = `Excel · hoja «${x.hoja}»`;
    }
    REV.recs = recs; REV.fmt = fmt;
    REV.res = recs.map(revisar);
    REV.counts = contarAplicaciones(REV.res);
    REV.filter = "todo"; REV.parcela = ""; REV.q = "";
    renderRevision();
  } catch (e) {
    box.innerHTML = `<div class="alert bad">No se pudo revisar el archivo: ${esc(e.message || String(e))}</div>`;
  }
}
function renderRevision() {
  const box = $("#rvOut"), res = REV.res;
  if (!res.length) { box.innerHTML = ""; return; }
  const c = k => res.filter(x => x.sev === k).length;
  const parcelas = [...new Set(res.map(x => x.r.parcela).filter(Boolean))];
  const fechas = res.map(x => x.r.fecha).filter(Boolean).sort();
  const vis = res.filter(x => (REV.filter === "todo" || (REV.filter === "inc" ? ["bad", "warn"].includes(x.sev) : x.sev === "bad")) && (!REV.parcela || x.r.parcela === REV.parcela)
    && (!REV.q || norm([x.r.nombre, x.r.ma, x.r.objeto, x.r.receta, x.p ? x.p.nombre : ""].join(" ")).includes(norm(REV.q))));
  const rowHtml = x => {
    const r = x.r, s = SEV[x.sev];
    const decl = r.src === "pdf" ? (r.dosis != null ? `${fmtNum(r.dosis)} ${esc(r.uni)}${r.base === 1000 ? " / 1.000 L" : r.base ? " / " + r.base : ""}` : esc(r.uni || "—"))
      : [r.dosis_cc != null && r.dosis_cc !== "" ? `${esc(r.dosis_cc)} cc/l` : "", r.dosis_g != null && r.dosis_g !== "" ? `${esc(r.dosis_g)} g/l` : "", r.caldo ? `caldo ${esc(r.caldo)}` : ""].filter(Boolean).join(" · ") || "—";
    return `<tr class="${x.sev === "nr" || x.sev === "bio" ? "nr" : ""}">
      <td class="mono" data-l="Fecha">${fmtDate(r.fecha)}</td>
      <td data-l="Parcela"><b>${esc(r.parcela || "—")}</b>${r.variedad ? `<div class="note">${esc(r.variedad)}</div>` : ""}</td>
      <td data-l="Receta · objeto">${r.receta ? `<span class="mono">${esc(r.receta)}</span> · ` : r.ntrat ? `Trat. ${esc(r.ntrat)} · ` : ""}${esc(r.objeto || "—")}</td>
      <td data-l="Producto anotado"><b>${esc(r.nombre || "—")}</b>${r.reg ? ` <span class="mono" style="font-size:12px">${esc(r.reg)}</span>` : ""}<div class="note">${esc(r.ma)}</div>
        ${x.p ? `<button class="linkbtn" style="font-size:12px" data-open="${x.p.id}">${esc(x.p.nombre)} · ${esc(x.p.reg)}</button>` : ""}</td>
      <td class="mono" style="font-size:12px" data-l="Dosis">${decl}${x.dosisAut ? `<div class="note" style="font-family:var(--f-body)">Registro: ${esc(x.dosisAut)}</div>` : ""}</td>
      <td class="mono" style="font-size:12px" data-l="Plazo seg.">${esc(r.ps || "—")}${x.plazoReg ? `<div class="note" style="font-family:var(--f-body)">Registro: ${esc(x.plazoReg)}</div>` : ""}</td>
      <td data-l="Resultado"><span class="pill ${s[1]}">${s[0]}</span>${x.wwf ? `<div style="margin-top:4px">${wwfPill(x.wwf.alt.cat)}</div>` : ""}</td>
      <td style="font-size:12.5px;min-width:240px" data-l="Observaciones">${x.notes.filter(n => n[0] !== "ok" || x.notes.length === 1 || /^WWF/.test(n[1])).map(([sv, m]) => `<div class="rvn ${sv}">${esc(m)}</div>`).join("") || '<span class="note">Sin observaciones.</span>'}</td></tr>`;
  };
  box.innerHTML = `
    <div class="rvsum">
      <div><b>${esc(REV.file.name)}</b> · ${esc(REV.fmt)} · ${res.length} productos aplicados en ${parcelas.length} parcela${parcelas.length === 1 ? "" : "s"}${fechas.length ? ` · del ${fmtDate(fechas[0])} al ${fmtDate(fechas.at(-1))}` : ""} · revisión ${REV.mode === "wwf" ? "<b>WWF</b> (registro + Proyecto Zitrus)" : "<b>genérica</b> (registro MAPA)"}</div>
      <div class="vsum"><span class="pill bad">${c("bad")} incidencias</span><span class="pill warn">${c("warn")} a revisar</span><span class="pill ok">${c("ok") + c("info")} correctos</span><span class="pill ok">${c("bio")} control biológico</span><span class="pill mute">${c("nr")} sin registro fitosanitario</span></div>
    </div>
    <div class="formrow" style="margin:12px 0">
      <div class="chips" role="group" aria-label="Mostrar">
        <button class="chip" data-rf="todo" aria-pressed="${REV.filter === "todo"}">Todo</button>
        <button class="chip" data-rf="inc" aria-pressed="${REV.filter === "inc"}">Incidencias y avisos</button>
        <button class="chip" data-rf="bad" aria-pressed="${REV.filter === "bad"}">Solo incidencias</button>
      </div>
      <label class="field">Parcela / sector<select id="rvParc"><option value="">Todas</option>${parcelas.map(p => `<option ${p === REV.parcela ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></label>
      <label class="field">Buscar<input type="search" id="rvQ" value="${esc(REV.q)}" placeholder="producto, plaga, receta…"></label>
      <button class="btn" id="rvXlsx">Descargar informe Excel</button>
    </div>
    <p class="note">Incidencia: incumple el registro o el proyecto · Revisar: necesita comprobación o documentación · Correcto con observaciones: cumple, con alguna nota informativa.</p>
    <div class="tblwrap"><table class="v rv" style="min-width:1180px"><thead><tr><th>Fecha</th><th>Parcela</th><th>Receta · objeto</th><th>Producto anotado</th><th>Dosis</th><th>Plazo seg.</th><th>Resultado</th><th>Observaciones</th></tr></thead>
      <tbody>${vis.map(rowHtml).join("") || `<tr><td colspan="8" class="empty">Nada que mostrar con estos filtros.</td></tr>`}</tbody></table></div>
    ${countTable("registro", "Aplicaciones por producto y parcela (límite del registro)", "El registro fija el nº máximo de aplicaciones de cada producto en cada uso. Se cuenta cada receta o tratamiento distinto en el año.")}
    ${REV.mode === "wwf" ? countTable("wwf", "Aplicaciones por materia activa y parcela (límite WWF)", "En el proyecto, el límite es de la materia activa, sea cual sea la marca comercial.") : ""}
    </section>`;
}
function countTable(tipo, title, note) {
  const cnt = REV.counts.filter(g => g.tipo === tipo && (!REV.parcela || g.parcela === REV.parcela));
  const lab = g => g.sev === "bad" ? '<span class="pill bad">Supera el máximo</span>' : g.sev === "lim" ? '<span class="pill mute">Al límite</span>' : g.max == null ? '<span class="pill mute">Sin límite indicado</span>' : '<span class="pill ok">Correcto</span>';
  const onlyIssues = REV.filter !== "todo";
  const rows = cnt.filter(g => !onlyIssues || g.sev === "bad");
  return `<section class="sec" style="margin-top:22px"><h3>${title}</h3><p class="note" style="margin:0 0 8px">${note}</p>
    <div class="tblwrap"><table class="v" style="min-width:720px"><thead><tr><th>Parcela</th><th>Año</th><th>${tipo === "wwf" ? "Materia activa" : "Producto"}</th><th>Aplicaciones</th><th>Máximo</th><th>Estado</th></tr></thead>
    <tbody>${rows.map(g => `<tr><td>${esc(g.parcela)}</td><td class="mono">${esc(g.anyo)}</td><td>${esc(g.nombre)}</td><td class="mono"><b>${g.n}</b></td><td>${esc(g.maxTxt || "—")}</td><td>${lab(g)}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">${onlyIssues ? "Ninguna supera el máximo." : "No hay fitosanitarios con registro."}</td></tr>`}</tbody></table></div></section>`;
}
function exportRevision() {
  const res = REV.res; if (!res.length) return;
  const rows = res.map(x => { const r = x.r; return [fmtDate(r.fecha), r.parcela, r.variedad || "", r.receta || r.ntrat || "", r.objeto, r.nombre, r.reg, r.ma,
    r.src === "pdf" ? (r.dosis != null ? `${r.dosis} ${r.uni}${r.base === 1000 ? " / 1.000 L" : ""}` : r.uni) : [r.dosis_cc != null ? r.dosis_cc + " cc/l" : "", r.dosis_g != null ? r.dosis_g + " g/l" : ""].filter(Boolean).join(" "),
    r.src === "xlsx" ? (r.caldo ?? "") : "", r.ps, x.p ? x.p.nombre : "", x.p ? x.p.reg : "", x.p ? susTxt(x.p) : "", x.dosisAut, x.plazoReg,
    SEV[x.sev][0], x.wwf ? WCAT[x.wwf.alt.cat][0] : "", x.notes.map(n => n[1]).join(" | ")]; });
  const cnt = REV.counts.map(g => [g.tipo === "wwf" ? "WWF (materia activa)" : "Registro (producto)", g.parcela, g.anyo, g.nombre, g.n, g.maxTxt || "", g.sev === "bad" ? "Supera el máximo" : g.sev === "lim" ? "Al límite" : "Correcto"]);
  const title = `Revisión ${REV.mode === "wwf" ? "WWF (registro + Proyecto Zitrus)" : "genérica (registro MAPA)"} de «${REV.file.name}» · ${stamp()}`;
  xlsx(`revision_${REV.mode}_${safeName(REV.file.name.replace(/\.[^.]+$/, ""))}.xlsx`, [
    ["Revisión", title, ["Fecha", "Parcela/sector", "Variedad", "Receta/trat.", "Objeto", "Producto anotado", "Nº reg. anotado", "Materia activa anotada", "Dosis anotada", "Caldo", "Plazo anotado", "Producto en registro", "Nº registro", "Materia activa registro", "Dosis registro", "Plazo registro", "Resultado", "WWF", "Observaciones"], rows,
      [11, 12, 14, 10, 28, 24, 11, 26, 16, 10, 10, 22, 11, 26, 30, 16, 18, 16, 90]],
    ["Nº de aplicaciones", title, ["Límite", "Parcela/sector", "Año", "Producto / materia activa", "Aplicaciones", "Máximo", "Estado"], cnt, [20, 14, 8, 34, 12, 30, 16]]
  ]);
}
function limpiarRevision() { REV.file = null; REV.recs = []; REV.res = []; REV.counts = []; $("#rvOut").innerHTML = ""; const f = $("#rvFile"); if (f) f.value = ""; toast("Revisión borrada de la pantalla"); }

// eventos
(function initRevision() {
  const drop = $("#rvDrop"), inp = $("#rvFile");
  if (!drop) return;
  inp.addEventListener("change", () => { if (inp.files[0]) revisarArchivo(inp.files[0]); });
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) revisarArchivo(f); });
  document.querySelectorAll("[data-rmode]").forEach(b => b.addEventListener("click", () => {
    REV.mode = b.dataset.rmode; document.querySelectorAll("[data-rmode]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    if (REV.file) revisarArchivo(REV.file);
  }));
  $("#rvOut").addEventListener("click", e => {
    const f = e.target.closest("[data-rf]"); if (f) { REV.filter = f.dataset.rf; renderRevision(); return; }
    const o = e.target.closest("[data-open]"); if (o) { openFromAnywhere(Number(o.dataset.open)); return; }
    if (e.target.id === "rvXlsx") exportRevision();
  });
  $("#rvOut").addEventListener("change", e => { if (e.target.id === "rvParc") { REV.parcela = e.target.value; renderRevision(); } });
  $("#rvOut").addEventListener("input", e => { if (e.target.id === "rvQ") { clearTimeout(REV.t); REV.t = setTimeout(() => { REV.q = e.target.value; renderRevision(); const q = $("#rvQ"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); } });
  $("#rvClear").addEventListener("click", limpiarRevision);
})();
