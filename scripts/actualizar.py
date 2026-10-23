"""Actualiza los datos del Buscador Fitosanitario Cítricos desde el Registro de Productos Fitosanitarios del MAPA.

Fuente principal: exportación oficial «Productos autorizados (JSON)» de regfiweb (MAPA).
Respaldo: copia SQLite publicada en github.com/005Jan/sulfata-datos, por si la web del MAPA no responde.

Genera data/indice.json, data/usos.json y data/version.json. Si la fecha de los datos no cambia,
no escribe nada (salvo con --forzar). Solo usa la librería estándar de Python.

Uso:  python3 scripts/actualizar.py [--forzar] [--solo-respaldo]
"""
import gzip
import json
import os
import re
import sqlite3
import sys
import tempfile
import unicodedata
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, "data")
URL_MAPA = "https://servicio.mapa.gob.es/regfiweb/Exportaciones/ExportJsonProductosAutorizados"
URL_RESPALDO = "https://github.com/005Jan/sulfata-datos/releases/latest/download/sulfata.db.gz"
CITRICOS = "01010201"  # código de cultivo: Cítricos y sus especies
MIN_PRODUCTOS, MIN_USOS = 1500, 50000
UA = {"User-Agent": "BuscadorFitosanitarioCitricos/1.0 (actualizacion semanal; datos publicos MAPA)"}


# ---------------------------------------------------------------- utilidades
def limpio(v):
    if v is None:
        return None
    t = str(v).replace("\r\n", "\n").replace("\r", "\n").strip()
    return t or None


def sin_dato(v):
    t = limpio(v)
    return None if t is None or t in ("-", "--", "—") else t


def plazo(v):
    t = sin_dato(v)
    if t is None:
        return None, None
    if t.upper() in ("NP", "N.P.", "NO PROCEDE"):
        return "NO PROCEDE", None
    if t.isdigit():
        return t, int(t)
    nums = [int(n) for n in re.findall(r"\d+", t)] if not re.search("BBCH", t, re.I) else []
    return t, (max(nums) if nums else None)


def fecha(v):
    t = limpio(v)
    m = re.match(r"(\d{4})[/-](\d{2})[/-](\d{2})", t or "")
    return f"{m[1]}-{m[2]}-{m[3]}" if m else None


def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn").lower().strip()


def tipo_plaga(codigo):
    return {"6": "artropodos", "8": "hongos", "1": "malas_hierbas", "9": "bacterias",
            "10": "virus", "11": "nematodos"}.get(str(codigo).split(".")[0], "otros")


def num(x):
    if not isinstance(x, (int, float)) or isinstance(x, bool):
        return None
    return int(x) if float(x).is_integer() else round(float(x), 6)


# ------------------------------------------------- modelo intermedio común
# producto: dict(id, registro, nombre, titular, formulado, estado, fr, cad, can, lv, cond, sus=[[n,c]])
# uso: dict(pid, cultivo=(cod,nombre), agente=(cod,nombre), dmin, dmax, unidad, plazo, plazo_dias,
#           apl, inte, caldo, bbch, cond, tu, amb, sis, met)

def serializar(fecha_datos, productos, usos):
    strs, sidx, txts, tidx = [], {}, [], {}

    def S(v):
        v = limpio(v)
        if v is None:
            return -1
        if v not in sidx:
            sidx[v] = len(strs)
            strs.append(v)
        return sidx[v]

    def T(v):
        v = limpio(v)
        if v is None:
            return -1
        if v not in tidx:
            tidx[v] = len(txts)
            txts.append(v)
        return tidx[v]

    cult = sorted({u["cultivo"] for u in usos})
    ag = sorted({u["agente"] for u in usos})
    cidx = {c: i for i, c in enumerate(cult)}
    aidx = {a: i for i, a in enumerate(ag)}
    prods = sorted(productos, key=lambda p: norm(p["nombre"]))
    indice = {
        "fecha": fecha_datos,
        "c": [[c[0], c[1]] for c in cult],
        "a": [[a[0], a[1], tipo_plaga(a[0])] for a in ag],
        "p": [[p["id"], p["registro"], p["nombre"], p["titular"] or "", p["formulado"] or "", p["estado"],
               p["fr"], p["cad"], p["can"], p["lv"], limpio(p["cond"]) or "", p["sus"],
               p.get("alias") or [], p.get("fabricante") or ""] for p in prods],
    }
    out = {}
    for u in usos:
        out.setdefault(str(u["pid"]), []).append([
            cidx[u["cultivo"]], aidx[u["agente"]], num(u["dmin"]), num(u["dmax"]), S(u["unidad"]),
            S(u["plazo"]), u["plazo_dias"], S(u["apl"]), S(u["inte"]), S(u["caldo"]), S(u["bbch"]),
            T(u["cond"]), S(u["tu"]), S(u["amb"]), S(u["sis"]), S(u["met"]),
        ])
    return indice, {"s": strs, "t": txts, "u": out}


# ------------------------------------------------------- fuente: MAPA
def descargar_mapa():
    cuerpo = urllib.parse.urlencode({"tipoExportacion": "ProductosAutorizados"}).encode()
    req = urllib.request.Request(URL_MAPA, data=cuerpo, method="POST",
                                 headers={**UA, "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read().decode("utf-8-sig")


def convertir_mapa(texto):
    obj = json.loads(texto)
    if isinstance(obj, str):
        obj = json.loads(obj)
    contenido = obj["Contenido"]
    if isinstance(contenido, str):
        contenido = json.loads(contenido)
    fecha_datos = fecha(obj.get("Fecha")) or str(obj.get("Fecha"))[:10]
    productos, usos, vistos_id = [], [], set()
    for p in contenido["Productos"]:
        d = p["DATOSPRODUCTO"]
        pid = int(d["IdProducto"])
        if pid in vistos_id:  # el MAPA a veces repite un producto: se conserva la primera aparición
            continue
        vistos_id.add(pid)
        sus = []
        for s in p.get("COMPOSICION") or []:
            nombre = limpio(s.get("Nombre Sustancia")) or limpio(s.get("NombreUE")) or ""
            c = s.get("Concentracion")
            if isinstance(c, float) and c.is_integer():
                c = int(c)
            conc, nota = limpio(c), limpio(s.get("DescripcionNota"))
            sus.append([nombre, conc] + ([nota] if nota and nota != "%" else []))
        propio = norm(limpio(d.get("Nombre")))
        alias, vistos = [], {propio}
        for lista, campo in (("OTRASDENOMINACIONES", "Nombre_Origen"), ("OTROSNOMBRES", "Nombre")):
            for x in p.get(lista) or []:
                n = limpio(x.get(campo)) if isinstance(x, dict) else None
                if n and norm(n) not in vistos:
                    vistos.add(norm(n))
                    alias.append(n)
        productos.append(dict(
            id=pid, registro=limpio(d.get("Num_Registro")) or "", nombre=limpio(d.get("Nombre")) or "",
            titular=limpio(d.get("Titular")), formulado=limpio(d.get("Formulado")),
            estado=limpio(d.get("Estado")) or "Desconocido", fr=fecha(d.get("Fecha_Registro")),
            cad=fecha(d.get("Fecha_Caducidad")), can=fecha(d.get("Fecha_Cancelacion")),
            lv=fecha(d.get("Fecha_LimiteVenta")), cond=d.get("Condicionamiento"), sus=sus, alias=alias,
            fabricante=limpio(d.get("Fabricante"))))
        for u in p.get("USOS") or []:
            pl, pld = plazo(u.get("Plazo Seguridad"))
            usos.append(dict(
                pid=pid,
                cultivo=(str(u.get("CodigoCultivo")).strip(), limpio(u.get("Cultivo")) or ""),
                agente=(str(u.get("CodigoAgente")).strip(), limpio(u.get("Agente")) or ""),
                dmin=u.get("Dosis_Min"), dmax=u.get("Dosis_Max"), unidad=u.get("Unidad Medida dosis"),
                plazo=pl, plazo_dias=pld, apl=sin_dato(u.get("Aplicaciones")),
                inte=sin_dato(u.get("IntervaloAplicaciones")), caldo=sin_dato(u.get("Volumen Caldo")),
                bbch=sin_dato(u.get("Bbch")), cond=u.get("CondicionamientoEspecifico"),
                tu=u.get("TipoUsuario"), amb=u.get("Ambito"), sis=u.get("SistemaCultivo"),
                met=u.get("MetodoAplicacion")))
    return fecha_datos, productos, usos


# --------------------------------------------- fuente de respaldo: SQLite
def descargar_respaldo():
    with urllib.request.urlopen(urllib.request.Request(URL_RESPALDO, headers=UA), timeout=600) as r:
        return gzip.decompress(r.read())


def convertir_sqlite(ruta):
    c = sqlite3.connect(ruta)
    fecha_datos = c.execute("select valor from info where clave='fecha_datos'").fetchone()[0]
    sus = {}
    for pid, n, conc in c.execute("select producto_id,nombre,concentracion from sustancia"):
        sus.setdefault(pid, []).append([n, conc])
    productos = [dict(id=r[0], registro=r[1], nombre=r[2], titular=r[3], formulado=r[4], estado=r[5],
                      fr=r[6], cad=r[7], can=r[8], lv=r[9], cond=r[10], sus=sus.get(r[0], []))
                 for r in c.execute("select id,registro,nombre,titular,formulado,estado,fecha_registro,"
                                    "caducidad,cancelacion,limite_venta,condicionamiento from producto")]
    cult = {r[0]: (r[1], r[2]) for r in c.execute("select id,codigo,nombre from cultivo")}
    ag = {r[0]: (r[1], r[2]) for r in c.execute("select id,codigo,nombre from agente")}
    txt = dict(c.execute("select id,valor from texto"))
    usos = [dict(pid=r[0], cultivo=cult[r[1]], agente=ag[r[2]], dmin=r[3], dmax=r[4], unidad=r[5],
                 plazo=r[6], plazo_dias=r[7], apl=r[8], inte=r[9], caldo=r[10], bbch=r[11],
                 cond=txt.get(r[12]) if r[12] else None, tu=r[13], amb=r[14], sis=r[15], met=r[16])
            for r in c.execute("select producto_id,cultivo_id,agente_id,dosis_min,dosis_max,unidad,plazo,"
                               "plazo_dias,aplicaciones,intervalo,caldo,bbch,condicionamiento_id,"
                               "tipo_usuario,ambito,sistema,metodo from uso")]
    return fecha_datos, productos, usos


# ------------------------------------------------------- validación y cambios
def validar(productos, usos):
    if len(productos) < MIN_PRODUCTOS or len(usos) < MIN_USOS:
        raise ValueError(f"Datos incompletos: {len(productos)} productos, {len(usos)} usos")
    if not any(u["cultivo"][0].startswith(CITRICOS) for u in usos):
        raise ValueError("No aparece ningún uso en cítricos")


GRUPOS_CON_CITRICOS = {"0100000000000000", "0101000000000000", "0101020000000000"}


def citricos(indice, usos):
    cods = [c[0] for c in indice["c"]]
    es_cit = lambda c: c.startswith(CITRICOS) or c.startswith("020101") or c in GRUPOS_CON_CITRICOS
    return {int(pid) for pid, arr in usos["u"].items() if any(es_cit(cods[u[0]]) for u in arr)}


def resumen_cambios(viejo_i, viejo_u, nuevo_i, nuevo_u):
    if not viejo_i or not viejo_u:
        return ["Primera carga de datos."]
    vp = {p[0]: p for p in viejo_i["p"]}
    np_ = {p[0]: p for p in nuevo_i["p"]}
    vc, nc = citricos(viejo_i, viejo_u), citricos(nuevo_i, nuevo_u)
    lin = []
    fmt = lambda p: f"{p[2]} ({p[1]})"
    canc = [fmt(np_[i]) for i in vc if i in np_ and np_[i][5] != "Vigente" and vp[i][5] == "Vigente"]
    fuera = [fmt(vp[i]) for i in vc if i not in np_]
    sin_cit = [fmt(np_[i]) for i in vc if i in np_ and i not in nc and np_[i][5] == "Vigente"]
    lv = [f"{fmt(np_[i])}: {np_[i][9]}" for i in nc if i in vp and np_[i][9] and np_[i][9] != vp[i][9]]
    nuevos = [fmt(np_[i]) for i in nc if i not in vc]
    for titulo, xs in (("Cancelados (tenían uso en cítricos)", canc), ("Ya no figuran en el registro", fuera),
                       ("Han perdido el uso en cítricos", sin_cit), ("Nueva fecha límite de venta", lv),
                       ("Nuevos autorizados en cítricos", nuevos)):
        if xs:
            lin.append(f"### {titulo} ({len(xs)})")
            lin += [f"- {x}" for x in sorted(xs)]
    return lin or ["Sin cambios en productos para cítricos."]


def leer(nombre):
    try:
        with open(os.path.join(DATA, nombre), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def escribir(nombre, obj):
    tmp = os.path.join(DATA, nombre + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, os.path.join(DATA, nombre))


def main():
    forzar = "--forzar" in sys.argv
    os.makedirs(DATA, exist_ok=True)
    origen, errores = None, []
    if "--solo-respaldo" not in sys.argv:
        try:
            fecha_datos, productos, usos = convertir_mapa(descargar_mapa())
            validar(productos, usos)
            origen = "MAPA (regfiweb, exportación JSON de productos autorizados)"
        except Exception as e:  # noqa: BLE001 — cualquier fallo pasa al respaldo
            errores.append(f"MAPA: {e}")
    if origen is None:
        try:
            with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
                tmp.write(descargar_respaldo())
                tmp.flush()
                fecha_datos, productos, usos = convertir_sqlite(tmp.name)
            validar(productos, usos)
            origen = "Copia del registro MAPA en github.com/005Jan/sulfata-datos (respaldo)"
        except Exception as e:  # noqa: BLE001
            errores.append(f"Respaldo: {e}")
            print("ERROR: no se pudo actualizar.\n" + "\n".join(errores), file=sys.stderr)
            sys.exit(1)

    viejo_i, viejo_u = leer("indice.json"), leer("usos.json")
    if viejo_i and fecha_datos < viejo_i.get("fecha", "") and not forzar:
        print(f"La fuente trae datos más antiguos ({fecha_datos}) que los publicados ({viejo_i['fecha']}). No se cambia nada.")
        return
    if viejo_i and viejo_i.get("fecha") == fecha_datos and not forzar:
        print(f"Sin cambios: los datos publicados ya son del {fecha_datos}.")
        return

    indice, usos_out = serializar(fecha_datos, productos, usos)
    cambios = resumen_cambios(viejo_i, viejo_u, indice, usos_out)
    escribir("indice.json", indice)
    escribir("usos.json", usos_out)
    escribir("version.json", {"fecha_datos": fecha_datos, "origen": origen, "productos": len(productos),
                              "usos": len(usos), "avisos": errores})
    texto = [f"## Registro MAPA actualizado: datos a {fecha_datos}",
             f"Origen: {origen}. {len(productos)} productos, {len(usos)} usos.",
             f"Datos anteriores: {viejo_i.get('fecha') if viejo_i else '—'}", ""] + cambios
    if errores:
        texto += ["", "Avisos: " + " | ".join(errores)]
    print("\n".join(texto))
    resumen = os.environ.get("GITHUB_STEP_SUMMARY")
    if resumen:
        with open(resumen, "a", encoding="utf-8") as f:
            f.write("\n".join(texto) + "\n")


if __name__ == "__main__":
    main()
