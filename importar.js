"use strict";
// =====================================================================================
// FitoLupa · Revisar
// Lee una lista pegada o un cuaderno de tratamientos en cualquier formato (Excel, CSV, PDF,
// Word, foto o escaneo) y revisa cada aplicación contra el Registro del MAPA y, si se pide, contra la tabla del
// Proyecto Zitrus EDEKA-WWF. Todo se procesa en el navegador: el archivo no se envía a
// ningún sitio y se descarta al cerrar o vaciar la revisión.
// Usa funciones y datos del script principal (P, byId, USOS, IDX, WWF, norm, regKey…).
// =====================================================================================

const REV = { file: null, text: "", base: store.get("fr_rv_base", "mapa"), prots: new Set(store.get("fr_rv_prots", [])), scope: "campo", recs: [], res: [], counts: [], filter: "todo", parcela: "", q: "" };

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
    pages.push(tc.items.filter(it => it.str && it.str.trim()).map(it => ({ x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || 8, s: it.str.trim() })));
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

// ------------------------------------------------------------------ lector universal
// Cualquier entrada (texto pegado, Excel/CSV/ODS, PDF con texto o escaneado, Word, foto) se
// convierte en filas de celdas y de ahí en aplicaciones. Si hay una fila de cabecera
// («Producto», «Nº registro», «Dosis», «Fecha»…) se usan sus columnas; si no, se buscan en
// cada línea los productos del registro, el nº ES-…, la fecha, la dosis y el plazo.
const nkey = x => " " + norm(String(x || "")).replace(/[^a-z0-9%]+/g, " ").trim() + " ";
const HEAD = [   // orden importante: lo más concreto primero
  ["dosis_cc", ["dosis cc", "cc/l", "cc l", "ml/l"]], ["dosis_g", ["dosis g", "g/l", "gr/l"]],
  ["fechafin", ["fecha fin", "fecha final"]], ["cumpl", ["cumplimiento", "fin plazo", "fecha cumpl"]],
  ["reg", ["n registro", "no registro", "num registro", "nro registro", "registro", "num reg", "n reg", "nreg", "num_reg"]],
  ["nombre", ["nombre comercial", "nom comercial", "nom_comercial", "producto comercial", "nombre del producto", "producto", "marca", "fitosanitario", "formulado", "nombre"]],
  ["ma", ["materia activa", "sustancia activa", "principio activo", "composicion", "m a", "s a", "materia"]],
  ["fecha", ["fecha aplicacion", "fecha tratamiento", "fecha inicio", "fecha", "dia"]],
  ["variedad", ["variedad", "cultivar"]], ["finca", ["finca", "explotacion"]],
  ["parcela", ["parcela", "sector", "recinto", "cuartel", "bancal", "lote", "campo"]],
  ["cultivo", ["cultivo", "especie"]],
  ["objeto", ["plaga", "objeto", "motivo", "problema", "enfermedad", "justificacion", "adversidad", "agente", "finalidad"]],
  ["caldo", ["caldo", "volumen", "mojado"]], ["ps", ["plazo seguridad", "plazo", "p s", "ps", "dias ps"]],
  ["uni", ["unidad", "unidades", "unid", "uni", "ud", "uds"]], ["dosis", ["dosis", "cantidad", "concentracion"]],
  ["receta", ["receta", "orden", "n receta"]], ["ntrat", ["n trat", "no trat", "num trat", "tratamiento"]],
  ["sup", ["superficie", "sup", "has"]], ["tipo", ["tipo"]]
];
function headerMap(row) {
  const cells = row.map(c => typeof c === "string" ? nkey(c.replace(/[º°ª]/g, "")).trim() : "");
  if (cells.filter(Boolean).length < 2 || cells.some(c => c.length > 45)) return null;
  const col = {};
  for (const [k, al] of HEAD) {
    let idx = -1;
    for (const a of al) {
      const ak = nkey(a).trim();
      idx = cells.findIndex((h, i) => h && (h === ak || (" " + h + " ").includes(" " + ak + " ")) && !Object.values(col).includes(i));
      if (idx >= 0) break;
    }
    if (idx >= 0) col[k] = idx;
  }
  // Dosis expresada por 1.000 L o por hl, indicado en la cabecera
  const raw = row.map(c => String(c || "")).join(" ");
  if (/(^|\s)1\.?000(\s|$)|1\.?000\s*l\b|por\s*1\.?000/i.test(raw)) col.base = 1000; else if (/\bhl\b|100\s*l\b/i.test(raw)) col.base = 100;
  // «Dosis | 1.000L/Kg»: el valor va en la columna siguiente a «Dosis»
  if (col.dosis != null && cells[col.dosis + 1] && /\d|\bkg\b|\bl\b|\bhl\b/.test(cells[col.dosis + 1]) && !Object.values(col).includes(col.dosis + 1)) col.dosis2 = col.dosis + 1;
  // «Parcela (o variedad)»: la misma columna sirve para las dos cosas
  if (col.variedad != null && col.parcela == null && /parcela|sector/.test(cells[col.variedad])) col.parcela = col.variedad;
  const n = Object.keys(col).filter(k => k !== "base" && k !== "dosis2").length;
  return n >= 2 && (col.nombre != null || col.reg != null || col.ma != null) ? col : null;
}
// Fecha de una celda o de un texto (dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd o número de serie de Excel)
function anyDate(v) {
  if (v == null || v === "") return null;
  if (Object.prototype.toString.call(v) === "[object Date]") return isNaN(v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") { if (v > 20000 && v < 80000 && window.XLSX) { const p = XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}` : null; } return null; }
  const s = String(v);
  let m = /\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\b/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}
// Dosis escrita de cualquier forma → concentración en cc/L o g/L, o cantidad por hectárea
const DOSE_RE = /(\d+(?:[.,]\d+)?)\s*(cc|ml|cm3|l|lt|litros?|g|gr|grs|gramos?|kg|kilos?)\s*(?:\/|por|x)\s*(hl|ha|l|lt|litro|100\s*l|1\.?000\s*l|hect[aá]rea)\b|(\d+(?:[.,]\d+)?)\s*(%|‰)/i;
function parseDoseTxt(s, p) {
  const m = DOSE_RE.exec(String(s || "")); if (!m) return null;
  if (m[5]) { const v = parseFloat(m[4].replace(",", ".")); const f = m[5] === "%" ? 10 : 1; return { v: v * f, u: p && p.liquid === false ? "g/L" : "cc/L" }; }
  const v = parseFloat(m[1].replace(",", ".")), un = norm(m[2]), per = norm(m[3]).replace(/\s|\./g, "");
  const liquid = /^(cc|ml|cm3|l|lt|litro)/.test(un), big = /^(l|lt|litro|kg|kilo)/.test(un);
  const qty = big ? v * 1000 : v;                       // cc o g
  if (per === "ha" || per.startsWith("hect")) return { perHa: big ? v : v / 1000, unit: liquid ? "l/ha" : "kg/ha" };
  const per_l = per === "hl" || per === "100l" ? 100 : per === "1000l" ? 1000 : 1;
  return { v: qty / per_l, u: liquid ? "cc/L" : "g/L" };
}
let NAME_IDX = null;
function nameIndex() {
  if (NAME_IDX) return NAME_IDX;
  const m = new Map();
  for (const p of P) for (const n of [p.nombre, ...(p.alias || [])]) {
    const k = nkey(n), t = k.trim();
    if (t.length < 4 || (t.length < 6 && !/\d|\s/.test(t) && COMMON.has(t))) continue;
    const prev = m.get(k); if (!prev || (prev.estado !== "Vigente" && p.estado === "Vigente")) m.set(k, p);
  }
  NAME_IDX = [...m.entries()].sort((a, b) => b[0].length - a[0].length);
  return NAME_IDX;
}
// Palabras corrientes que también son nombres de producto: no se buscan sueltas en texto libre
const COMMON = new Set(["agua", "azufre", "cobre", "aceite", "jabon", "zinc", "hierro", "total", "plus", "extra", "super", "forte", "dosis", "campo", "verde", "parcela", "sector", "fecha", "plaga", "ninguna", "ninguno"]);
function findProducts(txt) {
  const k = nkey(txt), hits = [];
  if (k.trim().length < 3) return hits;
  for (const [n, p] of nameIndex()) {
    let i = k.indexOf(n);
    while (i >= 0) {
      const a = i, b = i + n.length;
      if (!hits.some(h => a < h.b && b > h.a)) { hits.push({ a, b, p, n: n.trim() }); break; }
      i = k.indexOf(n, i + 1);
    }
  }
  return hits.sort((x, y) => x.a - y.a);
}
const REG_RE = /\bES[\s\-]?0*\d{3,6}\b/gi;
// Nombre mal escrito («tepeki», o un error del reconocimiento de imagen): el más parecido, si no hay duda
function fuzzyHit(txt) {
  const toks = nkey(txt).trim().split(" ").filter(t => t.length >= 3 && !/^\d+$/.test(t));
  let best = null, second = 9;
  for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= toks.length; i++) {
    const q = toks.slice(i, i + n).join(" "); if (q.length < 4) continue;
    for (const [k, p] of nameIndex()) {
      const nm = k.trim(); if (nm[0] !== q[0] || Math.abs(nm.length - q.length) > 2) continue;
      const d = lev(q, nm), lim = q.length > 6 ? 2 : 1;
      if (d > lim) continue;
      if (!best || d < best.d) { if (best && best.p !== p) second = best.d; best = { p, d, q }; } else if (best.p !== p) second = Math.min(second, d);
    }
  }
  return best && second > best.d ? { p: best.p, fuzzy: true, q: best.q } : null;
}
// Nombre del producto en una línea sin producto reconocido: lo que hay antes de dosis, plaga, caldo o plazo
const cleanName = s => s.replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b|\b20\d\d-\d\d-\d\d\b/g, " ").replace(REG_RE, " ")
  .split(new RegExp(DOSE_RE.source + "|\\b(contra|para|por|caldo|plazo|p\\.?s\\.?)\\b|[(;]", "i"))[0].replace(/^[\s\-–:;,.]+|[\s\-–:;,.]+$/g, "").replace(/\s+/g, " ").slice(0, 60);
function freeRecs(txt, ctx, base, isList, fuzzy) {
  const s = String(txt || "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  // «Parcela: 12», «Variedad Navelina», «Fecha: 03/07/2026»: datos que valen para las líneas siguientes
  const kv = /^(finca|parcela|sector|variedad|cultivo|fecha(?: de aplicaci[oó]n)?|plaga|motivo|objeto|receta)\s*[:\-–]\s*(.+)$/i.exec(s);
  if (kv && !findProducts(kv[2]).length && !REG_RE.test(kv[2])) {
    REG_RE.lastIndex = 0;
    const key = norm(kv[1]).split(" ")[0], v = kv[2].trim();
    if (key === "fecha") ctx.fecha = anyDate(v) || ctx.fecha;
    else if (key === "plaga" || key === "motivo" || key === "objeto") ctx.objeto = v;
    else if (key === "parcela" || key === "sector" || key === "finca") { ctx[key === "sector" ? "parcela" : key] = v; ctx.variedad = ""; ctx.objeto = ""; }
    else ctx[key] = v;
    return [];
  }
  REG_RE.lastIndex = 0;
  const hits = findProducts(s), regs = s.match(REG_RE) || [];
  const bare = isList && !hits.length && !regs.length ? (s.match(/^\s*(\d{4,6})\b/) || [])[1] : null;
  const mk = (seg, extra) => {
    // Lo que queda de la línea sin producto, fecha, dosis, plazo, caldo ni nº: la plaga o el motivo
    let rest = seg.replace(REG_RE, " ").replace(DOSE_RE, " ").replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b|\b20\d\d-\d\d-\d\d\b/g, " ")
      .replace(/\b(?:p\.?\s?s\.?|plazo(?: de seguridad)?)\s*[:=]?\s*(\d{1,3}|np)\b(\s*d[ií]as?)?/gi, " ").replace(/caldo\s*[:=]?\s*\d[\d.,]*\s*(l\/ha|l)?/gi, " ").replace(/\b\d{1,3}\s*d[ií]as?\b/gi, " ");
    if (extra.nombre) rest = rest.replace(new RegExp(extra.nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
    rest = rest.replace(/^[\s\-–:;,.()]+|[\s\-–:;,.()]+$/g, "").replace(/^(contra|para|por)\s+/i, "").replace(/\s+/g, " ").trim();
    const lineObj = objetoCodes(rest).length || (rest.length > 3 && /[a-z]{4,}/i.test(rest) && rest.length < 60) ? rest : "";
    const d = anyDate(seg);
    const ps = (seg.match(/\b(?:p\.?\s?s\.?|plazo(?: de seguridad)?)\s*[:=]?\s*(\d{1,3}|np|n\.?p\.?)\b/i) || seg.match(/\b(\d{1,3})\s*d[ií]as?\b/i) || [])[1];
    const cal = (seg.match(/caldo\s*[:=]?\s*(\d[\d.,]*)/i) || seg.match(/(\d[\d.,]*)\s*l(?:itros)?\s*(?:de\s*)?caldo/i) || [])[1];
    const dm = DOSE_RE.exec(seg);
    return Object.assign({ src: "gen", ...base, raw: s, parcela: ctx.parcela || "", variedad: ctx.variedad || "", finca: ctx.finca || "", receta: ctx.receta || "",
      fecha: d || ctx.fecha || null, objeto: lineObj || ctx.objeto || "", ps: ps ? String(ps) : "", caldo: cal ? numEs(cal) : null, dosisTxt: dm ? dm[0] : "", nombre: "", reg: "", ma: "" }, extra);
  };
  if (hits.length) {
    return hits.map((h, i) => {
      const seg = s.length && hits.length > 1 ? nkeySlice(s, h, hits[i + 1]) : s;
      let r = (seg.match(REG_RE) || (hits.length === 1 ? regs : []))[0] || "";
      if (!r && hits.length === 1) {      // «24635 BRAI»: nº sin «ES»
        const nums = s.replace(DOSE_RE, " ").replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g, " ").replace(new RegExp(h.n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ").match(/(?:^|\s)(\d{4,6})(?=\s|$)/g);
        if (nums && nums.length === 1 && !/caldo|plazo|ps\b|d[ií]as|\bl\b|litros/i.test(s.slice(Math.max(0, s.indexOf(nums[0].trim()) - 8), s.indexOf(nums[0].trim()) + 12))) r = nums[0].trim();
      }
      return mk(seg, { nombre: origName(s, h) || h.p.nombre, reg: r, pHint: h.p });
    });
  }
  if (regs.length) return regs.map(r => mk(s, { reg: r, nombre: cleanName(s) }));
  if (bare) return [mk(s, { reg: bare, nombre: s.replace(bare, "").trim() })];
  if (isList) {
    const m = typeof matchLine === "function" ? matchLine(s) : null;
    const fz = !(m && m.p) ? fuzzyHit(s) : null;
    return [mk(s, { nombre: cleanName(s) || s.slice(0, 60), pHint: m && m.p ? m.p : fz ? fz.p : null })];
  }
  if (fuzzy && DOSE_RE.test(s)) { const fz = fuzzyHit(s); if (fz) return [mk(s, { nombre: cleanName(s), pHint: fz.p })]; }
  // En un archivo, una línea con dosis pero sin producto del registro: abono, corrector…
  if (DOSE_RE.test(s) && /[a-z]{4,}/i.test(s) && s.length < 160) return [mk(s, { nombre: cleanName(s), noFound: true })];
  return [];
}
// Nombre partido o pegado («CARNA DINE», «Decistrap»): se compara sin espacios
function compactHit(txt) {
  const c = nkey(txt).replace(/ /g, "");
  if (c.length < 5) return null;
  for (const [n, p] of nameIndex()) if (n.replace(/ /g, "") === c) return { p, n: n.trim(), compact: true };
  return null;
}
// Trozo del texto original que corresponde a cada producto encontrado (para dosis y nº por producto)
function nkeySlice(s, h, next) {
  const idx = (re) => { const m = new RegExp(re.split(" ").map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^a-z0-9%]+"), "i").exec(norm(s)); return m ? m.index : -1; };
  const a = idx(h.n), b = next ? idx(next.n) : -1;
  return a < 0 ? s : s.slice(a, b > a ? b : undefined);
}
function origName(s, h) {
  const m = new RegExp(h.n.split(" ").map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^a-z0-9%]+"), "i").exec(norm(s));
  return m ? s.substr(m.index, m[0].length) : "";
}
// Filas → aplicaciones
function rowsToRecs(rows, opts = {}) {
  const recs = [], ctx = {};
  let col = null, afterHead = false;
  rows.forEach((row, ri) => {
    if (!row || !row.some(c => c != null && String(c).trim() !== "")) return;
    const cells = row.map(c => c == null ? "" : c);
    const hm = headerMap(cells.map(c => typeof c === "string" ? c : ""));
    if (hm) { col = hm; afterHead = true; return; }
    if (afterHead && col) { afterHead = false; if (!cells.some(c => /\d/.test(String(c))) && !findProducts(cells.join(" ")).length) return; }   // cabecera partida en dos líneas
    if (cells.filter(c => String(c).trim()).length === 1 && /^\s*(finca|parcela|sector|variedad|cultivo|fecha|plaga|motivo|objeto|receta)\s*[:\-–]/i.test(String(cells.find(c => String(c).trim())))) { freeRecs(String(cells.find(c => String(c).trim())), ctx, {}, false); return; }
    const base = { fila: ri + 1, hoja: opts.hoja || "", pagina: opts.pagina ? opts.pagina(ri) : undefined, ocr: !!opts.fuzzy };
    const txt = cells.map(c => Object.prototype.toString.call(c) === "[object Date]" ? fmtDate(anyDate(c)) : String(c)).join(" ").replace(/\s+/g, " ").trim();
    if (col) {
      const g = k => col[k] == null ? null : cells[col[k]];
      const gs = k => { const v = g(k); return v == null ? "" : String(v).trim(); };
      const regC = gs("reg").replace(/\s+/g, ""), regOk = /^(ES-?)?\d{3,6}$/i.test(regC);
      if (gs("nombre") || regOk || gs("ma")) {
        if (/^\|.*\|$/.test(gs("nombre")) || /^\|.*\|$/.test(gs("reg"))) return;     // fila de códigos de campo
        if (gs("parcela")) ctx.parcela = gs("parcela"); if (gs("variedad")) ctx.variedad = gs("variedad");
        const nombre = gs("nombre"), hit = nombre ? findProducts(nombre)[0] || compactHit(nombre) : null;
        let dose = [gs("dosis") || (col.dosis2 != null ? gs("dosis2") : ""), gs("uni").replace(/\.$/, "")].filter(Boolean).join(" ");
        if (dose && col.base && !DOSE_RE.test(dose) && /[a-z]/i.test(dose)) dose += ` / ${col.base === 1000 ? "1000" : "100"} l`;
        recs.push({ src: "gen", ...base, raw: txt, finca: gs("finca"), parcela: gs("parcela") || ctx.parcela || "", variedad: gs("variedad") || ctx.variedad || "", cultivo: gs("cultivo"),
          ntrat: g("ntrat"), receta: gs("receta") || ctx.receta || "", tipo: gs("tipo"), superficie: numEs(g("sup")), objeto: gs("objeto") || ctx.objeto || "",
          fecha: anyDate(g("fecha")) || anyDate(gs("fecha").replace(/\s+/g, "")) || ctx.fecha || null, fechafin: anyDate(g("fechafin")), cumpl: anyDate(g("cumpl")),
          nombre, reg: regOk ? regC : "", ma: gs("ma"), dosis_cc: g("dosis_cc"), dosis_g: g("dosis_g"), dosisTxt: dose,
          caldo: g("caldo"), ps: gs("ps"), pHint: hit && (hit.compact || hit.n === nkey(nombre.replace(/\(.*?\)/g, " ")).trim()) ? hit.p : null });
        return;
      }
    }
    recs.push(...freeRecs(txt, ctx, base, opts.isList, opts.fuzzy));
  });
  return recs;
}
// Texto pegado o archivo de texto: una línea por fila; columnas por tabulador, «;», «|» o 2+ espacios
const textRows = t => String(t || "").replace(/\r/g, "").split("\n").map(l => l.split(/\t|\s*;\s*|\s*\|\s*|\s{2,}/).map(x => x.trim()));
// PDF con texto: líneas por posición vertical y celdas por huecos horizontales. Si aparece una fila
// de cabecera, cada texto se asigna a su columna por la posición y las celdas partidas en varias
// líneas (texto que no cabe en la columna) se vuelven a unir en una sola fila.
const CTX_KEYS = ["parcela", "variedad", "fecha", "objeto", "receta", "finca", "cultivo", "sup", "cumpl", "ntrat"];
function ctxHeader(strs) {        // cabecera de datos generales (sector, variedad, receta, motivo, fecha…), sin columna de producto
  const cells = strs.map(c => nkey(c.replace(/[º°ª]/g, "")).trim());
  if (cells.filter(Boolean).length < 2 || cells.some(c => c.length > 40)) return null;
  const col = {};
  for (const [k, al] of HEAD) {
    if (!CTX_KEYS.includes(k)) continue;
    const i = cells.findIndex((h, i) => h && al.some(a => { const ak = nkey(a).trim(); return h === ak || (" " + h + " ").includes(" " + ak + " "); }) && !Object.values(col).includes(i));
    if (i >= 0) col[k] = i;
  }
  return Object.keys(col).length >= 2 && cells.filter(Boolean).length - Object.keys(col).length <= 2 ? col : null;
}
function pdfRows(pages) {
  const rows = [], pageOf = [];
  let colsX = null, cur = null, curPage = 0, prevY = null, ctxCols = null;
  const flush = () => { if (cur) { rows.push(cur.map(c => c.trim())); pageOf.push(curPage); cur = null; } };
  const join = (a, b) => !a ? b : /[a-záéíóúñ]{5,}$/i.test(a) && /^[a-záéíóúñ]/.test(b) && !/\s(de|del|la|el|y|en|con|para)$/i.test(a) ? a + b : a + " " + b;
  const nearest = (xs, x) => { let k = 0; for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[k] - x)) k = i; return k; };
  const LABEL = { parcela: "Parcela", variedad: "Variedad", fecha: "Fecha", objeto: "Motivo", receta: "Receta", finca: "Finca", cultivo: "Cultivo" };
  pages.forEach((items, pi) => {
    const lines = [];
    for (const it of items.slice().sort((a, b) => b.y - a.y || a.x - b.x)) {
      const l = lines.find(l => Math.abs(l.y - it.y) <= 2.5);
      if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    prevY = null;
    lines.sort((a, b) => b.y - a.y).forEach(l => {
      l.items.sort((a, b) => a.x - b.x);
      const h = Math.max(...l.items.map(i => i.h || 8));
      const cells = []; let prevEnd = null;
      for (const it of l.items) {
        const w = it.w || it.s.length * 4.5;
        if (prevEnd != null && it.x - prevEnd < 6 && cells.length) { const c = cells[cells.length - 1]; c.s += (it.x - prevEnd > 1.2 ? " " : "") + it.s; }
        else cells.push({ x: it.x, s: it.s });
        prevEnd = it.x + w;
      }
      const strs = cells.map(c => c.s);
      const gap = prevY == null ? 0 : prevY - l.y; prevY = l.y;
      if (headerMap(strs)) { flush(); colsX = cells.map(c => c.x); ctxCols = null; rows.push(strs); pageOf.push(pi + 1); return; }
      const ch = ctxHeader(strs);
      if (ch) { flush(); colsX = null; ctxCols = { col: ch, xs: cells.map(c => c.x) }; return; }
      if (ctxCols) {          // la línea de valores de una cabecera general → «Variedad: TANGO»…
        const vals = ctxCols.xs.map(() => "");
        for (const c of cells) { const k = nearest(ctxCols.xs, c.x); vals[k] = (vals[k] + " " + c.s).trim(); }
        for (const k of ["finca", "parcela", "variedad", "cultivo", "receta", "objeto", "fecha"]) { const i = ctxCols.col[k]; if (i != null && vals[i]) { rows.push([`${LABEL[k]}: ${vals[i]}`]); pageOf.push(pi + 1); } }
        ctxCols = null; return;
      }
      if (!colsX) { flush(); rows.push(strs); pageOf.push(pi + 1); return; }
      const row = colsX.map(() => "");
      for (const c of cells) { const k = nearest(colsX, c.x); row[k] = join(row[k], c.s); }
      // ¿Fila nueva o continuación de una celda que no cabía en su columna?
      const txt = strs.join(" "), filled = row.filter(Boolean).length;
      const full = anyDate(txt) || /\bES[\s\-]?\d{4,6}\b/i.test(txt);
      const curFilled = cur ? cur.filter(Boolean).length : 0;
      const partial = cur && cur.some(c => /\d{1,2}\/\d{1,2}\/\d{0,3}$|\bES-?\d{0,4}$|[-\/]$/i.test(c));
      const short = strs.every(x => x.length <= 10) && filled < curFilled;
      const starts = full || gap > h * 1.9 || !(partial || short);
      if (!cur || starts) { flush(); cur = row; curPage = pi + 1; }
      else cur = cur.map((v, i) => join(v, row[i]));
    });
    flush(); colsX = null;
  });
  flush();
  return { rows, pageOf };
}
// ZIP mínimo (Word .docx y OpenDocument .odt) sin librerías externas
async function unzip(buf) {
  const dv = new DataView(buf); let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("El archivo no es un documento válido.");
  const n = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
    files[new TextDecoder().decode(new Uint8Array(buf, off + 46, nlen))] = { method, csize, lho };
    off += 46 + nlen + elen + clen;
  }
  return async name => {
    const f = files[name]; if (!f) return null;
    const nl = dv.getUint16(f.lho + 26, true), el = dv.getUint16(f.lho + 28, true);
    const data = new Uint8Array(buf, f.lho + 30 + nl + el, f.csize);
    if (f.method === 0) return new TextDecoder().decode(data);
    const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
    return new TextDecoder().decode(out);
  };
}
async function docRows(buf, kind) {
  const read = await unzip(buf);
  const xml = await read(kind === "odt" ? "content.xml" : "word/document.xml");
  if (!xml) throw new Error("No encuentro el texto del documento.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const P_ = kind === "odt" ? ["p", "h"] : ["p"], TBL = kind === "odt" ? "table" : "tbl", TR = kind === "odt" ? "table-row" : "tr", TC = kind === "odt" ? "table-cell" : "tc";
  const text = el => {
    if (kind === "odt") return el.textContent;
    let s = ""; const walk = n => { for (const c of n.childNodes) { if (c.nodeType !== 1) continue; if (c.localName === "t") s += c.textContent; else if (c.localName === "tab") s += "\t"; else if (c.localName === "br") s += " "; else walk(c); } }; walk(el); return s;
  };
  const rows = [];
  const visit = node => {
    for (const c of node.childNodes) {
      if (c.nodeType !== 1) continue;
      if (c.localName === TBL) { for (const tr of [...c.getElementsByTagName("*")].filter(e => e.localName === TR)) rows.push([...tr.childNodes].filter(e => e.nodeType === 1 && e.localName === TC).map(tc => [...tc.getElementsByTagName("*")].filter(e => P_.includes(e.localName)).map(text).join(" ").trim())); }
      else if (P_.includes(c.localName)) { const t = text(c); if (t.trim()) rows.push(t.split(/\t|\s{2,}/).map(x => x.trim())); }
      else visit(c);
    }
  };
  visit(doc.documentElement);
  return rows;
}
// Word antiguo (.doc): se rescata el texto legible
function legacyDocRows(buf) {
  const u16 = new TextDecoder("utf-16le").decode(buf), l1 = new TextDecoder("windows-1252").decode(buf);
  const pick = t => (t.match(/[\x20-\x7EÀ-ÿ¡-¿\t\r\n]{4,}/g) || []).join("\n");
  const a = pick(u16), b = pick(l1), t = a.length > b.length * 0.6 ? a : b;
  return textRows(t.replace(/\r/g, "\n"));
}
// Reconocimiento de texto (fotos y PDF escaneados): Tesseract en el propio navegador, se carga solo si hace falta
let OCR_PROMISE = null;
function loadOcr() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (OCR_PROMISE) return OCR_PROMISE;
  OCR_PROMISE = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; s.onload = () => ok(window.Tesseract); s.onerror = () => { OCR_PROMISE = null; ko(new Error("No se pudo cargar el lector de imágenes (hace falta conexión la primera vez).")); }; document.head.appendChild(s); });
  return OCR_PROMISE;
}
async function ocrImages(images, progress) {
  const T = await loadOcr();
  const worker = await T.createWorker("spa");
  const rows = [], pageOf = [];
  try {
    for (let i = 0; i < images.length; i++) {
      progress && progress(`Leyendo el texto de la imagen${images.length > 1 ? ` ${i + 1} de ${images.length}` : ""}…`);
      const { data } = await worker.recognize(images[i]);
      for (const l of String(data.text || "").split("\n")) if (l.trim()) { rows.push(ocrFix(l).split(/\t|\s{2,}|\s\|\s/).map(x => x.trim())); pageOf.push(i + 1); }
    }
  } finally { await worker.terminate(); }
  return { rows, pageOf };
}
// Confusiones típicas del reconocimiento de texto: «l» leída como «1» o «|» en las unidades
const ocrFix = l => l
  .replace(/\b(cc|ml|g|gr|grs|kg|l)\s*\/\s*[1|I](?![\d.,])/gi, "$1/l")
  .replace(/(\d[\d.,]*)\s*[1|I]\s*\/\s*(ha|hl)\b/gi, "$1 l/$2")
  .replace(/\/\s*(1\.?000|100)\s*[1|I](?![\d.,])/g, "/$1 l")
  .replace(/\bE[S5][\s\-]?([0-9OoIl]{4,6})\b/g, (m, d) => "ES-" + d.replace(/[Oo]/g, "0").replace(/[Il]/g, "1"));
async function pdfToImages(buf) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: buf.slice(0) }).promise, out = [];
  for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
    const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 2.2 });
    const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    out.push(c);
  }
  return out;
}
// Punto de entrada: archivo → { recs, fmt }
async function leerArchivo(file, progress) {
  const buf = await file.arrayBuffer(), name = file.name || "", ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || "";
  const head = new Uint8Array(buf.slice(0, 8)), sig = [...head.slice(0, 4)].map(b => b.toString(16).padStart(2, "0")).join("");
  const isPdf = ext === "pdf" || sig === "25504446";
  const isZip = sig === "504b0304";
  const isImg = /^(png|jpe?g|webp|bmp|gif|tiff?|heic)$/.test(ext) || /^image\//.test(file.type || "");
  if (isPdf) {
    const pages = await pdfPages(buf);
    const chars = pages.reduce((a, p) => a + p.reduce((b, i) => b + i.s.length, 0), 0);
    if (chars > 40) {
      const especial = parseRecetas(pages);
      if (especial.length) return { recs: especial, fmt: `PDF de recetas · ${pages.length} página${pages.length === 1 ? "" : "s"}` };
      const { rows, pageOf } = pdfRows(pages);
      return { recs: rowsToRecs(rows, { pagina: i => pageOf[i] }), fmt: `PDF · ${pages.length} página${pages.length === 1 ? "" : "s"}` };
    }
    progress && progress("El PDF es una imagen escaneada: preparando la lectura del texto…");
    const imgs = await pdfToImages(buf);
    const { rows, pageOf } = await ocrImages(imgs, progress);
    return { recs: rowsToRecs(rows, { pagina: i => pageOf[i], fuzzy: true }), fmt: `PDF escaneado · ${imgs.length} página${imgs.length === 1 ? "" : "s"} · texto reconocido automáticamente`, ocr: true };
  }
  if (isImg) {
    const { rows } = await ocrImages([file], progress);
    return { recs: rowsToRecs(rows, { fuzzy: true }), fmt: "Imagen · texto reconocido automáticamente", ocr: true };
  }
  if (ext === "docx" || ext === "odt" || (isZip && /word|opendocument\.text/.test(file.type || ""))) {
    const rows = await docRows(buf, ext === "odt" ? "odt" : "docx");
    return { recs: rowsToRecs(rows), fmt: ext === "odt" ? "Documento OpenDocument" : "Documento Word" };
  }
  if (ext === "doc") return { recs: rowsToRecs(legacyDocRows(buf)), fmt: "Documento Word antiguo (.doc)" };
  const decode = b => { try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return new TextDecoder("windows-1252").decode(b); } };
  if (/^(txt|text|md)$/.test(ext) || (/^text\/plain/.test(file.type || "") && !/^(csv|tsv)$/.test(ext))) {
    return { recs: rowsToRecs(textRows(decode(buf)), { isList: true }), fmt: "Texto" };
  }
  if (/^(csv|tsv)$/.test(ext) || /^text\/(csv|tab)/.test(file.type || "")) {
    if (!window.XLSX) throw new Error("No se pudo cargar el lector de hojas de cálculo. Revisa la conexión y recarga la página.");
    const wb = XLSX.read(decode(buf), { type: "string", raw: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    return { recs: rowsToRecs(rows), fmt: "CSV" };
  }
  // Hojas de cálculo (xlsx, xls, xlsm, ods, csv, html…): primero el formato conocido tipo Atalaya, luego el lector general
  if (!window.XLSX) throw new Error("No se pudo cargar el lector de hojas de cálculo. Revisa la conexión y recarga la página.");
  try { const x = parseExcel(buf); return { recs: x.recs, fmt: `Hoja de cálculo · «${x.hoja}»` }; } catch {}
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  let best = { recs: [], hoja: "" };
  for (const h of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[h], { header: 1, raw: true, defval: null });
    const recs = rowsToRecs(rows, { hoja: h });
    if (recs.filter(r => r.pHint || r.reg).length > best.recs.filter(r => r.pHint || r.reg).length) best = { recs, hoja: h };
  }
  return { recs: best.recs, fmt: `Hoja de cálculo · «${best.hoja || wb.SheetNames[0]}»` };
}
function leerTexto(t) { return { recs: rowsToRecs(textRows(t), { isList: true }), fmt: "Lista pegada" }; }

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
// Ámbito de la revisión: campo, postcosecha o ambos
const scopeTest = () => REV.scope === "post" ? isPost : REV.scope === "ambos" ? (c => isCampo(c) || isPost(c)) : isCampo;
const scopeName = () => REV.scope === "post" ? `postcosecha de ${SP.lower}` : REV.scope === "ambos" ? `${SP.lower} (campo o postcosecha)` : SP.lower + (SP.post ? " en campo" : "");
function campoUses(p) { const t = scopeTest(); return ((USOS && USOS.u[p.id]) || []).filter(u => t(cropCode(u))); }
function usesForCodes(uses, codes) {
  return uses.filter(u => { const a = IDX.a[u[1]][0]; return codes.some(c => a === c || a.startsWith(c + ".") || (c.startsWith(a + ".") && a.includes("."))); });
}
function declaredConc(r, p) {
  // Concentración anotada en el cuaderno, en cc/L (líquidos) o g/L (sólidos)
  if (r.dosis_cc != null && r.dosis_cc !== "" || r.dosis_g != null && r.dosis_g !== "" || r.src === "xlsx") {
    const cc = numEs(r.dosis_cc), g = numEs(r.dosis_g);
    const raw = String(r.dosis_cc || r.dosis_g || "");
    if (/ha/i.test(raw)) return { perHa: numEs(raw), unit: /kg/i.test(raw) ? "kg/ha" : /l/i.test(raw) ? "l/ha" : raw.replace(/[\d.,\s]/g, "") };
    if (cc != null) return { v: cc, u: "cc/L" };
    if (g != null) return { v: g, u: "g/L" };
    return null;
  }
  if (r.dosisTxt) {
    const d = parseDoseTxt(r.dosisTxt, p);
    if (d) return d.perHa != null ? { perHa: d.perHa, unit: d.unit } : { v: d.v, u: d.u };
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
// ------------------------------------------------------------------ variedad → especie de cítricos
// Se lee de la columna variedad (PDF) o parcela/sector (Excel). clem: true = clementina, false = otra mandarina.
const VARIEDADES = [
  [/\bclemenvilla\b|\bnova\b|satsuma|okitsu|owari|clausellina|iwasaki|hashimoto|ortanique|nadorcott|afourer|\btango\b|fortune|ellendale|\bkara\b|murcott|\borri\b|leanri|moncada|\bsafor\b|\bgarbi\b|primosole|gold ?nugget|tang ?gold|kinnow|setubalense/, "mandarino", false],
  [/clemen|\bnules\b|oronules|marisol|oroval|hernandina|\besbal\b|arrufatina|\bfina\b|orogrande|loretina|\bbeatriz\b|tomatera|\bmioro\b/, "mandarino", true],
  [/mandarin/, "mandarino", null],
  [/navel|washington|lane ?late|newhall|salustiana|valencia ?late|barberina|powell|chislett|fukumoto|cara ?cara|sanguin|tarocco|doble fina|midknight|delta seedless|\brohde\b|ricalate|\bberna\b|naranj/, "naranjo", null],
  [/\bverna\b|eureka|lisbon|\bfino\b|\bmesero\b|primofiori|limon/, "limonero", null],
  [/star ruby|rio red|\bmarsh\b|pomel|toronj/, "pomelo", null],
  [/\blimas?\b|tahiti/, "lima", null]
];
function varGroup(txt) {
  const n = norm(txt);
  if (!n) return null;
  for (const [re, sub, clem] of VARIEDADES) if (re.test(n)) return { sub, clem, label: String(txt).trim() };
  return null;
}
const SUB_TXT = { naranjo: "naranjo", mandarino: "mandarino", limonero: "limonero", pomelo: "pomelo", lima: "lima" };
function scopeCheck(u, vg) {
  const s = condScope(u);
  if (!s.allowed) return { ok: true, s };
  if (!s.allowed.has(vg.sub)) {
    const why = s.sub && s.sub !== vg.sub ? `el uso está registrado solo para ${SUB_TXT[s.sub]}` : s.except && s.except.has(vg.sub) ? `el condicionamiento lo excluye («${s.marks[0]}»)` : `el condicionamiento lo limita a ${[...s.allowed].join(", ")}`;
    return { ok: false, s, why };
  }
  if (s.clem && vg.clem === false) return { ok: false, s, why: "el uso es exclusivo de clementino" };
  return { ok: true, s, warn: s.clem && vg.clem == null };
}

function revisar(r) {
  const out = { r, sev: "ok", notes: [], p: null, kind: "fito", uses: [], dosisAut: "", plazoReg: "", wwf: null };
  const add = (sev, msg) => out.notes.push([sev, msg]);
  const nameNorm = norm(r.nombre + " " + r.ma);
  if (BIO_RE.test(nameNorm) || BIO_RE.test(norm(r.objeto))) { out.kind = "bio"; out.sev = "bio"; add("ok", "Control biológico (suelta de fauna auxiliar): no necesita registro fitosanitario."); return out; }
  const id = r.noFound ? { p: null, notes: [], regNoExiste: false } : resolveProduct(r.reg, r.nombre);
  if (!id.p && r.pHint) { id.p = r.pHint; if (norm(r.nombre) && norm(r.nombre) !== norm(r.pHint.nombre) && !r.pHint.an.includes(norm(r.nombre))) id.notes.push(["info", `«${r.nombre}» se ha identificado como ${r.pHint.nombre} (${r.pHint.reg}): compruébalo.`]); }
  out.p = id.p; id.notes.forEach(n => add(...n));
  if (!id.p) {
    if (id.regNoExiste && r.ocr) { add("warn", `El nº ${r.reg} no figura en el registro: puede ser un error al leer la imagen. Compruébalo en el original.`); id.regNoExiste = false; }
    else if (id.regNoExiste) { add("bad", `El nº de registro ${r.reg} no figura en el Registro de Productos Fitosanitarios.`); }
    else {
      out.kind = "nofito";
      if (r.src === "gen" && !NO_FITO_HINT.test(norm(r.raw || r.nombre))) add("info", `No encuentro «${(r.nombre || r.raw || "").slice(0, 60)}» entre los productos autorizados. Si es un abono, corrector o bioestimulante, no necesita registro; si es un fitosanitario, revisa el nombre o el nº (puede estar cancelado).`);
      else add("info", "Sin nº de registro y no figura como fitosanitario: abono, corrector, bioestimulante u otro producto.");
      if (wwfOn() && objetoCodes(r.objeto).length && !NO_FITO_HINT.test(norm(r.objeto)))
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
  const f = r.fecha || new Date().toISOString().slice(0, 10);
  out.hoy = !r.fecha;
  if (out.hoy) {
    const dd = daysTo(p.cad);
    if (p.estado !== "Vigente") add("bad", `Producto cancelado${p.canc ? " el " + fmtDate(p.canc) : ""}: hoy no se puede utilizar${p.limV ? " (límite de venta " + fmtDate(p.limV) + ")" : ""}.`);
    else if (dd != null && dd < 0) add("bad", `Autorización caducada el ${fmtDate(p.cad)}.`);
    else if (p.limV) add("warn", `Fecha límite de venta ${fmtDate(p.limV)}: comprueba el plazo de uso de existencias.`);
    else if (dd != null && dd < CAD_AVISO) add("warn", `La autorización caduca el ${fmtDate(p.cad)} (en ${dd} día${dd === 1 ? "" : "s"}).`);
  } else {
    if (p.canc && p.canc <= f) add("bad", `Producto cancelado el ${fmtDate(p.canc)}, antes de la aplicación.`);
    else if (p.estado !== "Vigente") add("warn", `Producto cancelado${p.canc ? " el " + fmtDate(p.canc) : ""} (después de la aplicación).`);
    if (p.cad && p.cad < f) add("bad", `Autorización caducada el ${fmtDate(p.cad)}, antes de la aplicación.`);
    if (p.limV && p.limV < f) add("warn", `La fecha límite de venta (${fmtDate(p.limV)}) es anterior a la aplicación: comprueba el plazo de uso de existencias.`);
  }
  // Uso autorizado en la especie seleccionada para el objeto anotado
  const cu = campoUses(p);
  const codes = objetoCodes(r.objeto).filter(c => !c.startsWith("__"));
  if (!cu.length) { add("bad", p.post && REV.scope === "campo" ? `Solo tiene usos autorizados en postcosecha, no en ${SP.lower} en campo.` : `No tiene ningún uso autorizado en ${scopeName()}.`); out.sev = worst(out.notes); return finishWwf(out, codes); }
  let uses = cu;
  if (codes.length) {
    const m = usesForCodes(cu, codes);
    if (m.length) uses = m;
    else add("bad", `No está autorizado en ${scopeName()} contra «${r.objeto}». Autorizado para: ${listShort([...new Set(cu.map(u => IDX.a[u[1]][1]))], 4)}.`);
    if (m.length && m.every(u => { const a = IDX.a[u[1]][0]; return !codes.some(c => a === c || a.startsWith(c + ".")); }))
      add("info", `Autorizado por un uso genérico del grupo (${[...new Set(m.map(u => IDX.a[u[1]][1]))].join(", ")}).`);
  } else if (r.objeto && !NO_FITO_HINT.test(norm(r.objeto))) add("info", `No reconozco la plaga en «${r.objeto}»: revisa que el uso esté autorizado.`);
  // Especie y variedad (cítricos): el condicionamiento puede excluir la especie o limitarse a clementinas
  if (SP.field.startsWith("01010201")) {
    const spSub = citSubOf(SP.code);
    const vg = varGroup(r.variedad || r.parcela || "") || (spSub ? { sub: spSub, clem: null, label: SP.name } : null);
    const chk = uses.map(u => ({ u, ...(vg ? scopeCheck(u, vg) : { ok: true, s: condScope(u) }) }));
    if (vg) {
      const good = chk.filter(x => x.ok);
      const vtxt = `${vg.label} es ${vg.sub === "mandarino" && vg.clem === false ? "mandarino (no clementina)" : SUB_TXT[vg.sub]}`;
      const whys = [...new Set(chk.map(x => x.why))].join("; ");
      // Fitorreguladores: puede quedar un uso general («Reguladores de crecimiento») sin esa limitación
      const gen = !good.length ? cu.filter(u => !uses.includes(u) && /reguladores de crecimiento/i.test(IDX.a[u[1]][1]) && scopeCheck(u, vg).ok) : [];
      if (!good.length && gen.length) { add("warn", `${vtxt}: el uso específico contra «${r.objeto}» no lo cubre (${whys}), pero el producto tiene un uso general «Reguladores de crecimiento» en ${[...new Set(gen.map(u => IDX.c[u[0]][1]))].join(", ")}. Confirma con la etiqueta o el técnico que ampara este tratamiento.`); uses = gen; }
      else if (!good.length) add("bad", `${vtxt} y ningún uso autorizado contra esta plaga lo cubre (${whys}).`);
      else {
        if (good.length < chk.length) uses = good.map(x => x.u);
        if (good.every(x => x.warn)) add("warn", `El uso es exclusivo de clementino: comprueba que «${vg.label}» es clementina.`);
      }
    } else {
      const tg = [...new Set(chk.flatMap(x => x.s.tags.filter(t => t !== "Variedad")))];
      if (tg.length && chk.every(x => x.s.tags.some(t => t !== "Variedad"))) add("info", `El uso tiene limitación de especie (${tg.join(", ")}) y no reconozco la variedad${r.variedad || r.parcela ? ` «${r.variedad || r.parcela}»` : ""}: compruébalo.`);
    }
    const vs = [...new Set(chk.filter(x => !vg || x.ok).flatMap(x => x.s.vars))];
    if (vs.length) add("info", `El condicionamiento menciona variedades: «${vs[0]}»${vs.length > 1 ? ` (y ${vs.length - 1} más)` : ""}. Comprueba que aplica a ${vg ? "«" + vg.label + "»" : "la variedad tratada"}.`);
  } else {
    const vs = [...new Set(uses.flatMap(u => condScope(u).vars))];
    if (vs.length) add("info", `El condicionamiento menciona variedades: «${vs[0]}»${vs.length > 1 ? ` (y ${vs.length - 1} más)` : ""}. Comprueba que aplica a la variedad tratada.`);
  }
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
  if (cal && r.src !== "pdf" && !/ha/i.test(String(r.caldo).replace(/l\/ha/i, "")) ) {
    const rng = uses.map(u => parseCaldo(S(u[9]))).filter(Boolean);
    if (rng.length) { const mn = Math.min(...rng.map(x => x.min)), mx = Math.max(...rng.map(x => x.max)); if (cal < mn * 0.9 || cal > mx * 1.1) add("warn", `Caldo ${fmtNum(cal)} l/ha fuera del rango del registro (${fmtNum(mn)}–${fmtNum(mx)} l/ha).`); }
  }
  // Plazo de seguridad (si el registro lo da en texto, se busca la cláusula de la plaga: «30 DÍAS PARA TRIPS…»)
  const pls = uses.map(u => S(u[5])).filter(Boolean);
  // «85 (AUMENTAR TAMAÑO DE FRUTO)»: el número inicial también es un plazo en días
  const days = pls.map(x => (x.match(/^(\d+)(?:\s*d[ií]as?)?(?:\s*\(|$)/) || [])[1]).filter(Boolean).map(Number);
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
const wwfOn = () => REV.base === "prot" && REV.prots.has("wwf") && !!(SP && SP.wwf);
const REV_PROTS = ["wwf", "leaf", "tesco", "ms", "aldi", "fairtrade", "ra", "pan", "eco", "ue"];
const protName = id => id === "wwf" ? "WWF" : PROT && PROT.protocolos[id] ? PROT.protocolos[id].nombre.replace(/:.*$/, "").replace(/ \(.*\)$/, "") : id;
const activeProts = () => REV.base !== "prot" ? [] : REV_PROTS.filter(id => REV.prots.has(id) && (id !== "wwf" || wwfOn()) && (id === "wwf" || (PROT && PROT.protocolos[id])));
// Protocolos elegidos (salvo WWF, que tiene su propia evaluación por plaga): categoría más estricta de las materias activas
function protNotes(out) {
  const p = out.p, r = out.r;
  for (const id of activeProts()) {
    if (id === "wwf") continue;
    if (id === "leaf") { if (!String(r.objeto || "").trim()) out.notes.push(["warn", "LEAF: el tratamiento no indica el motivo o la justificación (punto 3.4)."]); continue; }
    if (!p) continue;
    const st = protStatus(p, id); if (!st) continue;
    const subs = st.subs.map(x => x.toLowerCase()).join(", "), cond = [...new Set(st.cond)].join(" ");
    let sev = st.sev === "ok" ? null : st.sev;
    if (id === "ue" && st.cat === "no_aprobada") sev = "warn";
    if (id === "ue" && st.cat !== "no_aprobada" && st.cat !== "cfs") sev = null;
    if (!sev) continue;
    out.notes.push([sev, `${protName(id)}: ${st.label.toLowerCase()} (${subs}). ${st.desc}${cond ? " " + cond : ""}`]);
  }
}
function finishWwf(out, codes) {
  const p = out.p;
  if (wwfOn() && WWF && p) {
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
  protNotes(out);
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
    if (!x.p || !x.r.fecha) continue;
    const parcela = x.r.parcela || "—", anyo = (x.r.fecha || "").slice(0, 4) || "—";
    const g = add("registro", ["R", parcela, anyo, x.p.id].join("¦"), { parcela, anyo, nombre: `${x.p.nombre} (${x.p.reg})` }, x);
    const rm = x.uses.map(u => maxApl(S(u[7]))).filter(v => v != null);
    if (rm.length) { const v = Math.max(...rm); if (g.max == null || v < g.max) { g.max = v; g.maxTxt = [...new Set(x.uses.map(u => S(u[7])).filter(Boolean))].join(" · "); } }
    if (wwfOn() && x.wwf) {
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
  REV.file = file; REV.text = "";
  const box = $("#rvOut");
  const prog = msg => box.innerHTML = `<div class="loading" style="padding:20px"><span class="spin"></span>${esc(msg)}</div>`;
  prog(`Leyendo ${file.name}…`);
  if (!ready(box)) return;
  try {
    const { recs, fmt, ocr } = await leerArchivo(file, prog);
    REV.ocr = !!ocr;
    if (!recs.length) throw new Error("No he encontrado productos fitosanitarios en el archivo. Si es una foto, prueba con más luz y el papel recto; si es otro formato, pega el texto en el cuadro de la izquierda.");
    finRevision(recs, fmt);
  } catch (e) {
    box.innerHTML = `<div class="alert bad">No se pudo revisar el archivo: ${esc(e.message || String(e))}</div>`;
  }
}
function revisarTexto() {
  const t = $("#rvText").value;
  const box = $("#rvOut");
  if (!t.trim()) { box.innerHTML = `<p class="empty">Pega una lista de productos o el texto del cuaderno.</p>`; return; }
  if (!ready(box)) return;
  REV.file = null; REV.text = t; REV.ocr = false;
  const { recs, fmt } = leerTexto(t);
  finRevision(recs, fmt);
}
function ready(box) {
  if (!USOS) { box.innerHTML = `<p class="empty">Los datos del registro aún se están cargando. Espera unos segundos y vuelve a intentarlo.</p>`; return false; }
  if (wwfOn() && !WWF) { box.innerHTML = `<p class="empty">Los datos del proyecto WWF no están disponibles en esta versión.</p>`; return false; }
  return true;
}
function finRevision(recs, fmt) {
  REV.recs = recs; REV.fmt = fmt;
  REV.res = recs.map(revisar);
  REV.counts = contarAplicaciones(REV.res);
  REV.filter = "todo"; REV.parcela = ""; REV.q = "";
  renderRevision();
}
function rerunRevision() { if (REV.file) revisarArchivo(REV.file); else if (REV.text) revisarTexto(); }
const srcName = () => REV.file ? REV.file.name : "Lista pegada";
const declTxt = r => r.src === "pdf" ? (r.dosis != null ? `${fmtNum(r.dosis)} ${r.uni}${r.base === 1000 ? " / 1.000 L" : r.base ? " / " + r.base : ""}` : (r.uni || ""))
  : [r.dosis_cc != null && r.dosis_cc !== "" ? `${r.dosis_cc} cc/l` : "", r.dosis_g != null && r.dosis_g !== "" ? `${r.dosis_g} g/l` : "", r.dosisTxt || "", r.caldo ? `caldo ${r.caldo}` : ""].filter(Boolean).join(" · ");
function renderRevision() {
  const box = $("#rvOut"), res = REV.res;
  if (!res.length) { box.innerHTML = ""; return; }
  const c = k => res.filter(x => x.sev === k).length;
  const parcelas = [...new Set(res.map(x => x.r.parcela).filter(Boolean))];
  const fechas = res.map(x => x.r.fecha).filter(Boolean).sort();
  const vis = res.filter(x => (REV.filter === "todo" || (REV.filter === "inc" ? ["bad", "warn"].includes(x.sev) : x.sev === "bad")) && (!REV.parcela || x.r.parcela === REV.parcela)
    && (!REV.q || norm([x.r.nombre, x.r.ma, x.r.objeto, x.r.receta, x.p ? x.p.nombre : ""].join(" ")).includes(norm(REV.q))));
  const hasF = res.some(x => x.r.fecha), hasP = res.some(x => x.r.parcela || x.r.variedad), hasO = res.some(x => x.r.objeto || x.r.receta || x.r.ntrat);
  const rowHtml = x => {
    const r = x.r, s = SEV[x.sev];
    const decl = esc(declTxt(r)) || "—";
    return `<tr class="${x.sev === "nr" || x.sev === "bio" ? "nr" : ""}">
      ${hasF ? `<td class="mono" data-l="Fecha">${r.fecha ? fmtDate(r.fecha) : '<span class="note">—</span>'}</td>` : ""}
      ${hasP ? `<td data-l="Parcela"><b>${esc(r.parcela || "—")}</b>${r.variedad && r.variedad !== r.parcela ? `<div class="note">${esc(r.variedad)}</div>` : ""}</td>` : ""}
      ${hasO ? `<td data-l="Receta · objeto">${r.receta ? `<span class="mono">${esc(r.receta)}</span> · ` : r.ntrat ? `Trat. ${esc(r.ntrat)} · ` : ""}${esc(r.objeto || "—")}</td>` : ""}
      <td data-l="Producto anotado"><b>${esc(r.nombre || r.reg || "—")}</b>${r.src === "gen" && r.raw && norm(r.raw) !== norm(r.nombre) && norm(r.raw) !== norm(r.reg) && norm(r.raw) !== norm(r.nombre + " " + r.reg) ? `<div class="note" title="Texto leído">«${esc(r.raw.length > 90 ? r.raw.slice(0, 90) + "…" : r.raw)}»</div>` : ""}${r.reg ? ` <span class="mono" style="font-size:12px">${esc(r.reg)}</span>` : ""}<div class="note">${esc(r.ma)}</div>
        ${x.p ? `<button class="linkbtn" style="font-size:12px" data-open="${x.p.id}">${esc(x.p.nombre)} · ${esc(x.p.reg)}</button>` : ""}</td>
      <td class="mono" style="font-size:12px" data-l="Dosis">${decl}${x.dosisAut ? `<div class="note" style="font-family:var(--f-body)">Registro: ${esc(x.dosisAut)}</div>` : ""}</td>
      <td class="mono" style="font-size:12px" data-l="Plazo seg.">${esc(r.ps || "—")}${x.plazoReg ? `<div class="note" style="font-family:var(--f-body)">Registro: ${esc(x.plazoReg)}</div>` : ""}</td>
      <td data-l="Resultado"><span class="pill ${s[1]}">${s[0]}</span>${(t => t.length ? `<div class="vtags" style="margin-top:4px">${t.map(x => `<span class="pill vtag">⚠ ${esc(x)}</span>`).join("")}</div>` : "")([...new Set(x.uses.flatMap(u => condScope(u).tags))])}${x.wwf ? `<div style="margin-top:4px">${wwfPill(x.wwf.alt.cat)}</div>` : ""}</td>
      <td style="font-size:12.5px;min-width:240px" data-l="Observaciones">${x.notes.filter(n => n[0] !== "ok" || x.notes.length === 1 || /^WWF/.test(n[1])).map(([sv, m]) => `<div class="rvn ${sv}">${esc(m)}</div>`).join("") || '<span class="note">Sin observaciones.</span>'}</td></tr>`;
  };
  box.innerHTML = `
    <div class="rvsum">
      <div><b>${esc(srcName())}</b>${REV.file ? ` · ${esc(REV.fmt)}` : ""} · ${res.length} producto${res.length === 1 ? "" : "s"}${parcelas.length ? ` en ${parcelas.length} parcela${parcelas.length === 1 ? "" : "s"}` : ""}${fechas.length ? ` · del ${fmtDate(fechas[0])} al ${fmtDate(fechas.at(-1))}` : ""} · ${esc(scopeName())} · revisión: <b>registro MAPA</b>${activeProts().map(id => " + <b>" + esc(protName(id)) + "</b>").join("")}</div>
      <div class="vsum"><span class="pill bad">${c("bad")} incidencias</span><span class="pill warn">${c("warn")} a revisar</span><span class="pill ok">${c("ok") + c("info")} correctos</span><span class="pill ok">${c("bio")} control biológico</span><span class="pill mute">${c("nr")} sin registro fitosanitario</span></div>
    </div>
    <div class="formrow" style="margin:12px 0">
      <div class="chips" role="group" aria-label="Mostrar">
        <button class="chip" data-rf="todo" aria-pressed="${REV.filter === "todo"}">Todo</button>
        <button class="chip" data-rf="inc" aria-pressed="${REV.filter === "inc"}">Incidencias y avisos</button>
        <button class="chip" data-rf="bad" aria-pressed="${REV.filter === "bad"}">Solo incidencias</button>
      </div>
      ${parcelas.length > 1 ? `<label class="field">Parcela / sector<select id="rvParc"><option value="">Todas</option>${parcelas.map(p => `<option ${p === REV.parcela ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></label>` : ""}
      <label class="field">Buscar<input type="search" id="rvQ" value="${esc(REV.q)}" placeholder="producto, plaga, receta…"></label>
      <button class="btn" id="rvXlsx">Descargar informe Excel</button>
    </div>
    ${res.some(x => x.hoy && x.p) ? `<p class="note" style="margin:0 0 6px">${res.filter(x => x.hoy && x.p).length === res.filter(x => x.p).length ? "Sin fechas de aplicación" : "Algunas líneas no tienen fecha"}: la vigencia se comprueba a día de hoy y no se cuentan aplicaciones.</p>` : ""}
    ${REV.ocr ? `<div class="alert warn" style="margin:0 0 8px">El texto se ha reconocido de una imagen: revisa que los nombres y las dosis se hayan leído bien.</div>` : ""}
    <p class="note">Incidencia: incumple el registro o el proyecto · Revisar: necesita comprobación o documentación · Correcto con observaciones: cumple, con alguna nota informativa.</p>
    <div class="tblwrap"><table class="v rv" style="min-width:${hasF && hasP ? 1180 : 900}px"><thead><tr>${hasF ? "<th>Fecha</th>" : ""}${hasP ? "<th>Parcela</th>" : ""}${hasO ? "<th>Receta · objeto</th>" : ""}<th>Producto anotado</th><th>Dosis</th><th>Plazo seg.</th><th>Resultado</th><th>Observaciones</th></tr></thead>
      <tbody>${vis.map(rowHtml).join("") || `<tr><td colspan="${5 + hasF + hasP + hasO}" class="empty">Nada que mostrar con estos filtros.</td></tr>`}</tbody></table></div>
    ${hasF ? countTable("registro", "Aplicaciones por producto y parcela (límite del registro)", "El registro fija el nº máximo de aplicaciones de cada producto en cada uso. Se cuenta cada receta o tratamiento distinto en el año.") : ""}
    ${wwfOn() && hasF ? countTable("wwf", "Aplicaciones por materia activa y parcela (límite WWF)", "En el proyecto, el límite es de la materia activa, sea cual sea la marca comercial.") : ""}
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
    declTxt(r), r.src !== "pdf" ? (r.caldo ?? "") : "", r.ps, x.p ? x.p.nombre : "", x.p ? x.p.reg : "", x.p ? susTxt(x.p) : "", x.dosisAut, x.plazoReg,
    SEV[x.sev][0], x.wwf ? WCAT[x.wwf.alt.cat][0] : "", x.notes.map(n => n[1]).join(" | ")]; });
  const cnt = REV.counts.map(g => [g.tipo === "wwf" ? "WWF (materia activa)" : "Registro (producto)", g.parcela, g.anyo, g.nombre, g.n, g.maxTxt || "", g.sev === "bad" ? "Supera el máximo" : g.sev === "lim" ? "Al límite" : "Correcto"]);
  const title = `Revisión (registro MAPA${activeProts().map(id => " + " + protName(id)).join("")}) de «${srcName()}» · ${scopeName()} · ${stamp()}`;
  xlsx(`revision_${safeName(srcName().replace(/\.[^.]+$/, ""))}.xlsx`, [
    ["Revisión", title, ["Fecha", "Parcela/sector", "Variedad", "Receta/trat.", "Objeto", "Producto anotado", "Nº reg. anotado", "Materia activa anotada", "Dosis anotada", "Caldo", "Plazo anotado", "Producto en registro", "Nº registro", "Materia activa registro", "Dosis registro", "Plazo registro", "Resultado", "WWF", "Observaciones"], rows,
      [11, 12, 14, 10, 28, 24, 11, 26, 16, 10, 10, 22, 11, 26, 30, 16, 18, 16, 90]],
    ["Nº de aplicaciones", title, ["Límite", "Parcela/sector", "Año", "Producto / materia activa", "Aplicaciones", "Máximo", "Estado"], cnt, [20, 14, 8, 34, 12, 30, 16]]
  ]);
}
const PROT_TIPO = { wwf: "solo cítricos", leaf: "certificación", tesco: "cliente", ms: "cliente", aldi: "cliente", fairtrade: "certificación", ra: "certificación", pan: "lista de referencia", eco: "normativa", ue: "normativa" };
function renderRvProts() {
  const box = $("#rvProts"); if (!box) return;
  document.querySelectorAll("[data-rbase]").forEach(b => { const on = b.dataset.rbase === REV.base; b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-checked", String(on)); });
  $("#rvProtField").hidden = REV.base !== "prot";
  const ids = REV_PROTS.filter(id => id === "wwf" ? (SP && SP.wwf && WWF) : PROT && PROT.protocolos[id]);
  ids.sort((a, b) => protName(a).localeCompare(protName(b), "es"));
  box.innerHTML = ids.map(id => `<li><label><input type="checkbox" data-rp="${id}" ${REV.prots.has(id) ? "checked" : ""}><span>${esc(protName(id))}</span><small>${esc(PROT_TIPO[id] || "")}</small></label></li>`).join("") || `<li class="note" style="padding:10px">Cargando protocolos…</li>`;
  const sel = activeProts();
  $("#rvProtBtn span").textContent = sel.length ? sel.map(protName).join(", ") : "Elige protocolos…";
}
function limpiarRevision() { REV.file = null; REV.text = ""; REV.recs = []; REV.res = []; REV.counts = []; $("#rvOut").innerHTML = ""; const f = $("#rvFile"); if (f) f.value = ""; toast("Revisión borrada de la pantalla"); }

// eventos
(function initRevision() {
  const drop = $("#rvDrop"), inp = $("#rvFile");
  if (!drop) return;
  inp.addEventListener("change", () => { if (inp.files[0]) revisarArchivo(inp.files[0]); });
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) revisarArchivo(f); });
  document.querySelectorAll("[data-rbase]").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    REV.base = b.dataset.rbase; store.set("fr_rv_base", REV.base); renderRvProts(); rerunRevision();
    if (REV.base === "prot" && !activeProts().length) { $("#rvProtPop").hidden = false; $("#rvProtBtn").setAttribute("aria-expanded", "true"); }
  }));
  $("#rvProtBtn").addEventListener("click", e => { e.stopPropagation(); const pop = $("#rvProtPop"); pop.hidden = !pop.hidden; $("#rvProtBtn").setAttribute("aria-expanded", String(!pop.hidden)); });
  $("#rvProtPop").addEventListener("click", e => e.stopPropagation());
  $("#rvProtBox")._close = () => { $("#rvProtPop").hidden = true; $("#rvProtBtn").setAttribute("aria-expanded", "false"); };
  $("#rvProts").addEventListener("change", e => {
    const id = e.target.dataset.rp; if (!id) return;
    if (e.target.checked) REV.prots.add(id); else REV.prots.delete(id);
    store.set("fr_rv_prots", [...REV.prots]); renderRvProts(); rerunRevision();
  });
  renderRvProts();
  $("#rvScope").addEventListener("change", e => { REV.scope = e.target.value; rerunRevision(); });
  $("#rvRun").addEventListener("click", revisarTexto);
  $("#rvText").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) revisarTexto(); });
  $("#rvText").value = "";
  document.addEventListener("paste", e => {      // pegar una imagen (captura) directamente
    if ($("#view-revisar").hidden) return;
    const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); revisarArchivo(new File([f], "captura.png", { type: f.type })); }
  });
  $("#rvOut").addEventListener("click", e => {
    const f = e.target.closest("[data-rf]"); if (f) { REV.filter = f.dataset.rf; renderRevision(); return; }
    const o = e.target.closest("[data-open]"); if (o) { openFromAnywhere(Number(o.dataset.open)); return; }
    if (e.target.id === "rvXlsx") exportRevision();
  });
  $("#rvOut").addEventListener("change", e => { if (e.target.id === "rvParc") { REV.parcela = e.target.value; renderRevision(); } });
  $("#rvOut").addEventListener("input", e => { if (e.target.id === "rvQ") { clearTimeout(REV.t); REV.t = setTimeout(() => { REV.q = e.target.value; renderRevision(); const q = $("#rvQ"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); } });
  $("#rvClear").addEventListener("click", limpiarRevision);
})();
