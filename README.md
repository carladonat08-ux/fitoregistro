# FitoRegistro Cítricos

Buscador del **Registro de Productos Fitosanitarios del MAPA** pensado para el día a día de calidad en cítricos.

- Busca por **nº de registro** (`24526`, `ES01196`, `ES-01196`), **nombre comercial** o **materia activa**.
- Ficha de cada producto: titular, formulado, materias activas, inscripción, caducidad, límite de venta y cancelación.
- Usos autorizados por cultivo (cítricos por defecto): dosis del registro y **convertida a cc/L o g/L**, caldo, **plazo de seguridad**, nº de aplicaciones, intervalo, estado fenológico, usuario y método, con su **condicionamiento específico**.
- Calculadora de producto por superficie y caldo.
- **Verificar lista**: pega una receta y separa fitosanitarios de abonos y bioestimulantes, comprobando vigencia y autorización en cítricos.
- **Mi cuaderno**: añade usos y descárgalos en Excel con las columnas del cuaderno de tratamientos. Se guarda solo en el navegador de cada persona.

## Cómo se actualiza

Una GitHub Action (`.github/workflows/actualizar.yml`) se ejecuta los viernes por la tarde y el sábado temprano:

1. Descarga la exportación oficial de productos autorizados del MAPA (regfiweb). Si la web del MAPA no responde, usa la copia pública [005Jan/sulfata-datos](https://github.com/005Jan/sulfata-datos).
2. Convierte los datos (`scripts/actualizar.py`, solo Python estándar) y comprueba que están completos.
3. Si la fecha de los datos es nueva, guarda `data/` y vuelve a publicar la web. El resumen de la ejecución lista los productos de cítricos cancelados, con nueva fecha límite de venta o recién autorizados.

Para forzar una actualización: pestaña **Actions** → *Actualizar registro y publicar* → **Run workflow**.

## Fuente y aviso

Datos: Registro de Productos Fitosanitarios, Ministerio de Agricultura, Pesca y Alimentación (reutilización permitida citando la fuente). La fecha de los datos aparece en la cabecera de la web y en `data/version.json`.

Herramienta de consulta sin afiliación con el MAPA. Ante cualquier duda prevalecen la resolución de inscripción y la etiqueta autorizada del producto.
