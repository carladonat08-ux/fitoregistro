# Listas de protocolos (data/protocolos.json)

`data/protocolos.json` cruza las materias activas del registro con las listas públicas de restricciones:
Tesco, Marks & Spencer, Fairtrade, Rainforest Alliance, PAN (plaguicidas altamente peligrosos), ALDI SÜD,
agricultura ecológica (Reglamento UE 2021/1165) y la base de datos de sustancias activas de la UE.
WWF tiene su propia tabla en `data/wwf.json`. LEAF, GLOBALG.A.P. y Lidl no publican lista de materias activas.

Para regenerarlo cuando cambie alguna lista:

1. En GitHub → Actions → «Descargar fuentes de protocolos» → Run workflow. Deja el texto de los documentos
   en la rama temporal `fuentes-tmp` (bórrala después).
2. Copia esos ficheros en `$FITOLUPA_FUENTES/src/` y `tesco.txt` (la web de Tesco bloquea las descargas
   automáticas: la lista se transcribió a mano) también en `src/`.
3. Ejecuta, con `FITOLUPA_FUENTES` apuntando a esa carpeta: `p_fairtrade.py`, `map_es_en.py`, `build_map.py`
   y `build.py` (desde la raíz del repositorio). `overrides.py` contiene la traducción revisada a mano de las
   materias activas del registro (español) a su nombre ISO en inglés.
