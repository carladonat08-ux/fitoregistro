# FitoLupa

Buscador del **Registro de Productos Fitosanitarios del MAPA** por cultivo, pensado para el trabajo diario de calidad: consultar fichas sin tener que leerlas una a una en la web del Ministerio.

## Qué hace

**Especie**
- En Inicio (o en la cabecera) pulsas «Elegir cultivo» y escribes: al teclear «c» salen los cultivos que empiezan por c, con su emoticono. Vale cualquier cultivo del registro. Toda la app muestra solo la información de esa especie: búsqueda, fichas, resúmenes, por plaga, verificador y revisión de cuadernos. Se incluyen los usos registrados para sus grupos superiores (p. ej. «Árboles y arbustos frutales»).
- La especie elegida se ve siempre en la cabecera y se recuerda en el navegador. La pestaña WWF solo aparece con cítricos.

**Especie y variedad dentro del cultivo**
- El registro autoriza por cultivo, no por variedad, pero algunos condicionamientos limitan la especie («Excepto limonero», «Uso en naranjo y mandarino») o nombran variedades («Exclusivamente clementino», «No aplicar en peral variedad Conference»).
- Esos usos llevan una etiqueta ⚠ (Excepto…, Solo…, Solo clementinas, Variedad) en la ficha y en «Por plaga», y la frase se resalta en el condicionamiento.
- En «Revisar» se lee la variedad (columna o línea de variedad, o la parcela: Navelina, Clemenules, Nadorcott, Verna…) y se avisa si el uso no la cubre. Los plazos y dosis se comparan solo con los usos que sí aplican a esa especie.

**Inicio**
- Página corta: elegir cultivo, buscar producto, cifras del registro en una línea y acceso a cada herramienta.
- Preparada para buscadores (SEO): título y descripción, URL canónica, vista previa al compartir (Open Graph), datos estructurados y `sitemap.xml`.

**Producto**
- Busca por nº de registro (`24526`, `ES01196`, `ES-01196`, `1196`), nombre comercial, **otras denominaciones comerciales**, materia activa o titular. Tolera errores de escritura (`tepeki` → TEPPEKI).
- Filtros: solo vigentes, solo con uso en cítricos, por función (insecticida, acaricida, fungicida, herbicida, fitorregulador…).
- Ficha con:
  - **resumen en cítricos**, separado en **campo** y **postcosecha**: plazo de seguridad, dosis, nº de aplicaciones, caldo y plagas;
  - materia activa y otros productos vigentes con la misma composición;
  - datos del registro: titular, fabricante, inscripción, caducidad, límite de venta y cancelación;
  - todos los usos autorizados: dosis del registro y **convertida a cc/L o g/L**, caldo, plazo, aplicaciones, intervalo, estado fenológico, usuario, método y condicionamiento específico;
  - condiciones generales de uso;
  - avisos de cancelación, caducidad en menos de 60 días y fecha límite de venta.
- **Calculadora**: producto total, caldo y concentración por superficie. Avisa si el caldo está fuera del rango autorizado o si el condicionamiento fija un máximo por hectárea.
- Exportar la ficha a **Excel**, **imprimir o guardar en PDF** (con fecha de consulta y fecha de los datos) y copiar un enlace directo a la ficha.

**Por plaga**
- «¿Qué puedo usar contra…?»: elige cultivo (cítricos campo, postcosecha o cualquier otro) y plaga o finalidad.
- Lista todos los productos autorizados con dosis, plazo y aplicaciones. Se puede ordenar, filtrar por plazo máximo y descargar en Excel.
- Incluye los usos registrados para el grupo superior (por ejemplo, «Ácaros» para el ácaro rojo), marcados como uso genérico.

**Cuaderno**
- Añade usos desde las fichas con las columnas del cuaderno de tratamientos y descárgalos en Excel.
- Se guarda solo en el navegador de cada persona.

**Revisar** (antes «Verificar» y «Revisar cuaderno»)
- Pega una lista (o filas copiadas de Excel) o sube el archivo en cualquier formato: Excel (.xlsx, .xls, .ods), CSV, PDF con texto, PDF escaneado, Word (.docx, .doc, .odt), texto o foto. También se puede pegar una captura con Ctrl+V.
- Lector universal: si hay cabecera («Producto», «Nº registro», «Dosis», «Fecha», «Parcela»…) usa sus columnas, aunque se llamen distinto; si no, busca en cada línea los productos del registro, el nº ES-…, la fecha, la dosis (cc/l, g/l, %, cc/hl, l/ha, kg/1.000 l…), la plaga y el plazo. Líneas como «Parcela: 12» o «Variedad: Navelina» se aplican a las siguientes. En PDF reconstruye las tablas aunque las celdas ocupen varias líneas.
- Formatos conocidos (Excel tipo Atalaya y PDF «Resumen recetas foliares») se leen con su lector específico.
- Fotos y PDF escaneados: el texto se reconoce en el propio navegador (Tesseract, se descarga la primera vez). Corrige confusiones típicas (l/1, O/0) y tolera nombres mal escritos.
- Elige revisión **genérica** (registro MAPA) o **WWF** (registro + Proyecto Zitrus) y si se comprueba el uso en campo, postcosecha o ambos.
- Revisa cada línea: nº de registro y nombre (incluidas otras denominaciones), materia activa y concentración, vigencia (en la fecha de aplicación o, si no hay fecha, hoy), uso autorizado contra la plaga, especie y variedad, dosis, caldo, plazo de seguridad y nº de aplicaciones (por producto según el registro; por materia activa según WWF).
- Sin fechas ni parcelas (una lista simple), la tabla se simplifica.
- El archivo se procesa en el navegador: no se envía a ningún sitio ni se guarda. Informe descargable en Excel.

**Protocolos**
- Pestaña con las restricciones de materias activas de clientes, certificaciones y normativa: EDEKA-WWF (solo cítricos), LEAF Marque, GLOBALG.A.P., Tesco, Marks & Spencer, Lidl, ALDI SÜD, Fairtrade, Rainforest Alliance, PAN (plaguicidas altamente peligrosos), agricultura ecológica y Unión Europea (candidatas a sustitución, bajo riesgo, no aprobadas).
- Para cada uno: qué exige, categorías, materias activas del registro afectadas con sus productos vigentes y enlace al documento original.
- En la ficha de cada producto, su situación en cada protocolo. En «Por plaga», filtro «Cumplir protocolo» que quita los productos prohibidos para ese cliente. En «Revisar», se pueden marcar varios protocolos a la vez.
- Listas transcritas de los documentos públicos (octubre de 2026); ver `scripts/protocolos/README.md`. Prevalece la versión que envíe cada cliente o certificadora.

**WWF (Proyecto Zitrus EDEKA-WWF)**
- Pestaña separada con las tablas del proyecto (pesticidas y control de hierbas, campaña 2025-2026).
- Por plaga: medidas culturales, control biológico, plantas auxiliares y alternativas químicas (permitida, excepcional o muy excepcional), con máximos de aplicaciones, toxic load y los productos comerciales del registro autorizados para esa plaga en cítricos.
- Materias activas del proyecto, verificador de recetas WWF (con Excel) y reglas del proyecto.
- Los datos están en `data/wwf.json`. No se actualizan solos: cuando el proyecto publique una nueva tabla, hay que actualizar ese fichero.

**Sin conexión**
- Tras la primera visita funciona sin cobertura en el campo.
- En el móvil se puede añadir a la pantalla de inicio como una app.

## Cómo se actualiza

La GitHub Action `.github/workflows/actualizar.yml` se ejecuta el viernes por la tarde, el viernes por la noche y el sábado temprano:

1. Descarga la exportación oficial de productos autorizados del MAPA (regfiweb). Si la web del MAPA no responde, usa la copia pública [005Jan/sulfata-datos](https://github.com/005Jan/sulfata-datos).
2. Convierte los datos (`scripts/actualizar.py`, solo Python estándar) y comprueba que están completos.
3. Si la fecha de los datos es nueva, guarda `data/` y vuelve a publicar la web.
4. El resumen de la ejecución (pestaña **Actions**) lista los productos de cítricos cancelados, los que tienen nueva fecha límite de venta y los recién autorizados. Si algo falla, GitHub avisa por correo.

Para forzar una actualización: **Actions** → *Actualizar registro y publicar* → **Run workflow**.

## Fuente y aviso

Datos: Registro de Productos Fitosanitarios, Ministerio de Agricultura, Pesca y Alimentación. Su reutilización está permitida citando la fuente. La fecha de los datos aparece en la cabecera de la web y en `data/version.json`.

El registro no incluye en su exportación la clasificación de peligro, las frases de mitigación de riesgos, el plazo de reentrada ni los envases. Para eso, cada ficha enlaza con la ficha oficial.

Herramienta de consulta sin afiliación con el MAPA. Ante cualquier duda prevalecen la resolución de inscripción y la etiqueta autorizada del producto.
