# FitoRegistro Cítricos

Buscador del **Registro de Productos Fitosanitarios del MAPA** pensado para el trabajo diario de calidad en cítricos: consultar fichas sin tener que leerlas una a una en la web del Ministerio.

## Qué hace

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

**Verificar lista**
- Pega una receta o un parte de tratamientos.
- Separa los fitosanitarios de los abonos y bioestimulantes y comprueba vigencia, nº de registro, otras denominaciones, autorización en cítricos (campo o postcosecha), plazo y caducidad.
- Descarga el resultado en Excel.

**Cuaderno**
- Añade usos desde las fichas con las columnas del cuaderno de tratamientos y descárgalos en Excel.
- Se guarda solo en el navegador de cada persona.

**Revisar cuaderno**
- Sube el cuaderno en Excel (tipo Atalaya, una fila por aplicación) o el PDF «Resumen recetas foliares».
- Elige revisión **genérica** (registro MAPA) o **WWF** (registro + Proyecto Zitrus).
- Revisa cada aplicación: nº de registro y nombre (incluidas otras denominaciones), materia activa y concentración, vigencia en la fecha, uso autorizado contra la plaga en cítricos, dosis, caldo, plazo de seguridad (incluida la fecha de cumplimiento) y nº de aplicaciones (por producto según el registro; por materia activa según WWF).
- El archivo se procesa en el navegador: no se envía a ningún sitio ni se guarda. Informe descargable en Excel.

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
