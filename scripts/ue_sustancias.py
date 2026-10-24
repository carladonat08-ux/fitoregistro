#!/usr/bin/env python3
"""Descarga la base de datos de sustancias activas de la UE (EU Pesticides Database, API pública
de la Comisión) y guarda lo necesario para FitoLupa: nombre, CAS, situación de aprobación,
fecha de caducidad, candidata a sustitución, bajo riesgo y sustancia básica.

Uso: python3 scripts/ue_sustancias.py [salida.json]
Solo usa la biblioteca estándar de Python.
"""
import json, sys, time, urllib.request

URL = "https://api.datalake.sante.service.ec.europa.eu/sante/pesticides/active-substances?format=json&api-version=v3.0"
KEEP = ["substance_id", "substance_name", "cas_number", "substance_status", "approval_date", "expiry_date",
        "candidate_for_substitution", "low_risk_active_substance", "basic_substance", "substance_category",
        "as_micro_org", "tox_value_arfd", "tox_value_adi"]


def get(url):
    for intento in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "FitoLupa (github.com/carladonat08-ux/fitoregistro)"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if intento == 3:
                raise
            time.sleep(5 * (intento + 1))


def main():
    out, url, paginas = [], URL, 0
    while url and paginas < 200:
        d = get(url)
        out += [{k: v.get(k) for k in KEEP} for v in d.get("value", [])]
        url = d.get("nextLink")
        paginas += 1
    if len(out) < 1000:
        sys.exit(f"Respuesta incompleta de la API de la UE: {len(out)} sustancias")
    dst = sys.argv[1] if len(sys.argv) > 1 else "ue_sustancias.json"
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} sustancias en {paginas} páginas → {dst}")


if __name__ == "__main__":
    main()
