# Cambios — revisión previa a la primera prueba en vivo (2026-09-10)

Todas las correcciones tienen prueba de regresión en `tests/fixes.test.js`
(`npm test`, 16 pruebas, sin dependencias). Ninguna toca el evaluador ni la
metodología: las 7 demos producen exactamente el mismo informe que antes.

## Seguridad

1. **SSRF por redirect (real, demostrado).** `fetch()` seguía redirects solo, y
   el guard únicamente revisaba la URL de entrada. Un sitio público que
   respondiera `302 → http://169.254.169.254/...` hacía que el servidor pidiera
   la URL interna. Ahora los redirects se siguen a mano (máx. 5) y cada salto se
   valida antes de pedirlo. Además se valida cada enlace descubierto, no solo la
   entrada. Si la propia URL de entrada redirige a un host interno, la API
   devuelve error 400 en vez de un informe vacío.
   Archivos: `crawler/fetcher.js`, `crawler/crawl.js`, `pipeline.js`.
2. **Guard IPv6 con error de precedencia de operadores.** Toda la cadena
   `a || b || ... ? x : y` era la condición del ternario. `::1` y `fd00::` se
   bloqueaban por casualidad; `::127.0.0.1`, NAT64 (`64:ff9b::…`) y multicast
   pasaban; y `::ffff:8.8.8.8` (pública) se bloqueaba por error.
   Archivo: `crawler/ssrfGuard.js`.
3. **URL con codificación inválida colgaba la petición** (`/%E0%A4%A`):
   `decodeURIComponent` lanzaba dentro del handler y nunca se respondía. Ahora 403.
4. **Cuerpo de la API sin límite**: se aceptaban cuerpos de cualquier tamaño en
   memoria. Ahora 413 por encima de 16KB.
5. **Si `listen` fallaba** (puerto ocupado), el manejador `uncaughtException` se
   tragaba el error y quedaba un proceso vivo que no servía nada. Ahora sale con
   código 1 para que Render lo reinicie o lo marque como caído.

## Precisión del rastreo en vivo (extractor, no metodología)

6. **Alcance anclado a la URL escrita, no a donde aterriza.** Si la entrada
   redirigía (apex → www, dominio viejo → nuevo), todos los enlaces quedaban
   "fuera de alcance" y el rastreo se reducía a 1 página. Los enlaces relativos
   ahora se resuelven contra la URL final.
7. **`llms.txt` nunca se descubría** si no estaba enlazado (casi nunca lo está):
   D1 marcaba `agent_manifest = NONE` aunque existiera. Ahora se sondea
   `/llms.txt` en la raíz y en la ruta de entrada. Un 404 no cuenta como página
   fallida, y un 200 con HTML (fallback de SPA) no cuenta como manifiesto.
8. **Tokens `.json` servidos como `text/plain`** (p. ej. raw.githubusercontent.com)
   daban 0 tokens, mientras D1 los contaba como presentes. Probado en vivo con
   un archivo real de Style Dictionary: antes 0 tokens, ahora 5 (D2 = 60).
9. **`pages_found` inflado**: un mismo enlace externo repetido en cada página se
   contaba una vez por página (1859 "encontradas" para 25 rastreadas en GitHub;
   ahora 270).
11. **Restricciones "Don’t" con apóstrofo tipográfico** (`’`, `&rsquo;`) eran
    invisibles: el regex solo aceptaba `'`. Con frases reales de
    fluent2.microsoft.design: antes 0 de 2 detectadas, ahora 2 de 2.
10. **User-Agent identificable** (`AgenticDS/1.0 …`) en lugar del genérico de Node.

## Lo que NO se cambió a propósito (requiere decisión metodológica)

Ver la conversación de revisión: D3/D5 dan 0 estructural en cualquier sitio en
vivo, D4 regala 20 puntos cuando no detecta componentes competidores, y D2
salta entre 0 y "no evaluable" según si falló alguna página no relacionada.

## Hallazgos con contenido real de Fluent 2

**Corregido (2026-09-11, sesión de revisión de falsos positivos):**
- Las páginas de plataforma (`/components/web/react`, `/components/ios`,
  `/components/android`, `/components/windows`) se detectaban como si fueran
  componentes. Mismo patrón que el índice bare `/components/` de Carbon, con
  nombres de plataforma en vez de "components" — se agregaron a
  `NON_COMPONENT_SLUGS` (`web`, `react`, `ios`, `android`, `windows`), mismo
  mecanismo de allowlist evidencia-primero que ya usa el resto del archivo.
  Verificado: 4 páginas de plataforma reconstruidas de Fluent 2 + 1 componente
  real (`/components/web/react/core/button/usage`) → detecta exactamente 1
  componente. Test de regresión en `tests/fixes.test.js`. 162 tests del motor
  + 27 del paquete (antes 26), todos pasando.

**Sin corregir, requieren decisión:**
- La lista de componentes de la home y de `/components/web/react` parece
  cargarse con JavaScript: sin JS, el crawler no encuentra enlaces a páginas de
  componentes desde ahí. Entrar por una página de componente (p. ej.
  `/components/web/react/core/button/usage`) sí permite avanzar, porque su
  contenido enlaza a link, dialog, drawer, message bar y toast.
- Fluent desambigua con "try a link instead" / "use a switch", no con
  "instead of": el extractor no lo capta.

# Rediseño de la explicación de resultados (2026-09-11)

Capa de interpretación sobre el resultado del motor, siguiendo el documento
"FASE 1 — REDISEÑO DE LA EXPLICACIÓN DE RESULTADOS". El motor, la rúbrica y
los scores no cambiaron (las 7 demos dan exactamente el mismo informe).

- `public/report-texts.js` (nuevo): textos fijos ES/EN. Cada dimensión tiene su
  capacidad (Descubrir, Reutilizar, Utilizar, Decidir, Componer, Resolver,
  Verificar), qué evalúa, para qué sirve, por qué importa para un agente y 4
  lecturas del resultado. Cada uno de los 41 criterios técnicos del motor tiene
  nombre humano, cómo se enumera si se cumple, qué no se encontró, qué tendría
  que inferir el agente y qué debería hacer el equipo.
- `public/report.js` (nuevo): arma el informe eligiendo esos textos según los
  puntos reales de cada criterio. Sin IA, sin recalcular nada.
- `public/results.html`: nueva jerarquía: resultado general → qué significa →
  capacidades fuertes / a inferir / no confiables → cadena de capacidades →
  cada dimensión (concepto → evidencia → interpretación → recomendación) →
  evidencia técnica plegable con los identificadores originales → limitaciones.
- Casos donde la presentación evita afirmar lo que no se evaluó:
  - Desambiguación sin componentes parecidos: se muestra como "no aplica",
    no como algo que el sistema documenta.
  - Consistencia de la API sin ninguna propiedad detectada: se muestra como
    "no se pudo comparar", no como "API inconsistente", y no se recomienda.
  - En vivo, si no se leyó ninguna propiedad (D3) o patrón (D5): se avisa que
    el evaluador no puede leerlas y que la dimensión puede estar subestimada.
- `tests/report-texts.test.js` (nuevo): falla si el motor produce un criterio
  sin texto humano en ES o EN. 20 pruebas en total.

# Certeza de la evidencia (2026-09-11, después de la prueba con Fluent 2)

Capa de presentación. El motor, la rúbrica y los scores no cambiaron.

- Cada criterio se clasifica como Demostrado, Demostrado en parte,
  No demostrado (con su motivo), Ausencia demostrada, No evaluado o No aplica,
  según lo que la evaluación pudo observar.
- "Ausencia demostrada" solo se usa con evidencia completa: demos sin páginas
  fallidas ni rastreo limitado. En rastreos en vivo nunca se afirma ausencia,
  porque el extractor reconoce formatos y frases concretas.
- En vivo se distinguen tres motivos: lo que el extractor no puede leer desde
  HTML (props, variantes, estados, patrones, a11y, ejemplos ejecutables) queda
  "No evaluado" aunque cuente 0; lo que solo se detecta si está enlazado
  (tokens, índice, tipos, MCP, changelog) queda "No demostrado"; lo que se buscó
  en páginas leídas y no se reconoció queda "No demostrado".
- Encabezado: si hay rastreo limitado, páginas fallidas, tope por D1, fuentes
  ilegibles o dimensiones sin evaluar, se muestra "Evaluación incompleta" con
  los motivos, y el puntaje se presenta como "demostrado".
- Recomendaciones separadas en: limitación de la evaluación (no es tarea del
  equipo), gaps del Design System (solo con ausencia demostrada) y posibles gaps
  (verificar antes de actuar).
- D2 sin tokens (el motor la fuerza a 0 sin desglose) ya no aparece como
  "sin gaps".
- Los hallazgos originales del motor se rotulan como texto original, con una
  nota de cómo leer sus frases de ausencia cuando la evidencia es incompleta.
- `tests/report-certainty.test.js` (nuevo): renderiza el informe real y verifica
  estas reglas. 26 pruebas en total.

# Transparencia de expectativa en criterios sin evidencia (2026-09-12)

Capa de presentación (`public/report.js`, `public/report-texts.js`). El motor,
la rúbrica y los scores no cambiaron.

- Cuando un criterio queda "No demostrado", "Ausencia demostrada" o "No
  evaluado", el informe ahora dice explícitamente qué se esperaba encontrar,
  no solo que no se encontró. Reutiliza el mismo texto (`found`) que ya se
  usaba para listar lo que SÍ se cumple — no se agregó contenido nuevo, se
  reutilizó el existente en el sentido inverso.
- Ejemplo real (fixture `d1_gate`, en vivo): antes decía solo "Índice de
  componentes. No se encontró un índice de componentes legible por
  máquinas." — ahora agrega: "Se esperaba encontrar: un índice de
  componentes legible por máquinas."
- `tests/report-certainty.test.js`: 2 pruebas nuevas (ES y EN, y que el
  texto acompañe tanto a "no demostrado" como a "ausencia demostrada", no
  solo a uno). 29 pruebas en total en el paquete de tests nuevo (162 del
  motor sin tocar, sin cambios).

# Pasada completa de "qué se esperaba encontrar" (2026-09-12)

Capa de presentación (`public/report-texts.js`). El motor, la rúbrica y los
scores no cambiaron.

- El texto `found` de cada uno de los 41 criterios (usado ahora también para
  decir "Se esperaba encontrar: …" cuando falta evidencia) describía muy poco
  en la mayoría de los casos — para varios era literalmente la misma palabra
  que el nombre del criterio (`states` → found: "states"). Se reescribieron
  los 41 × 2 idiomas para que cada uno diga qué forma concreta debería tener
  esa evidencia, no solo repita el nombre.
- Ejemplo real (D3, estados): antes "Se esperaba encontrar: estados." — ahora
  "Se esperaba encontrar: los estados de interacción documentados por nombre
  (hover, foco, deshabilitado, error, cargando)."
- `tests/report-texts.test.js`: prueba nueva que falla si algún `found`
  vuelve a ser tan corto como el nombre del criterio — bloquea que este
  problema reaparezca en silencio. 30 pruebas en total en el paquete de
  tests nuevo (162 del motor sin tocar, sin cambios).

# Arreglos antes de publicar el link (2026-09-14)

Ninguno cambia el motor, la rúbrica ni cómo se calcula el puntaje. `npm test`:
50 pruebas (20 nuevas en `tests/deploy-fixes.test.js`).

1. **Límite por visitante detrás de Render.** Antes se usaba la IP del proxy de
   Render, así que el límite de 5 evaluaciones/minuto era uno solo para todo el
   mundo. Ahora se usa la IP real (último valor de `X-Forwarded-For`, solo en
   Render o con `TRUST_PROXY=1`). Las IPs viejas se limpian solas. `server.js`.
2. **Tope de evaluaciones simultáneas** (2 por defecto, `MAX_CONCURRENT_EVALUATIONS`).
   Si se llena, el visitante ve "el evaluador está ocupado, probá en un minuto"
   en vez de arriesgar que el servidor gratuito se quede sin memoria. `server.js`.
3. **Links con `#` se descartaban enteros** (`/components/button#usage` nunca se
   seguía). Ahora se quita el fragmento y se sigue el link. También se leen
   `href` sin comillas, se ignoran `mailto:`/`tel:`/`javascript:`, se quitan
   parámetros de seguimiento (`utm_*`, etc.) y se ordena el resto. `discovery.js`.
4. **Variantes de la misma ruta con distintos parámetros** (lo visto en Polaris):
   máximo 3 por ruta, excepto URLs tipo Storybook (`?path=`, `?id=`). Un link ya
   en cola no se vuelve a encolar. `crawl.js`.
5. **Tiempo máximo por evaluación: 45 s.** Al llegar, el rastreo se corta y se
   informa como limitado (`time_limited`); el sondeo de `llms.txt` igual corre,
   con timeout corto. `crawl.js`, `server.js`.
6. **Sitio que no abre → mensaje claro, no informe vacío.** Si la página de
   entrada falla y no hay ninguna otra evidencia, antes salía D1 = 0 "evaluada".
   Ahora la API responde un error clasificado: bloquea bots (401/403/429), no
   existe (404), tardó demasiado, u otro fallo. `pipeline.js`.
7. **Errores con código y texto para el diseñador (ES/EN).** La API devuelve
   `code`; la pantalla de inicio muestra un texto en lenguaje simple en el
   idioma elegido. Los errores internos (500) ya no muestran mensajes técnicos.
   `server.js`, `public/index.html`, `public/i18n.js`.
8. **Node 22** en `render.yaml` (Node 20 dejó de recibir parches en abril de 2026).
9. **Borrado `public/preview-standalone.html`**: versión vieja que quedaba publicada.
10. Menores: respuestas binarias liberan la conexión (`fetcher.js`); comentario
    desactualizado de `ssrfGuard.js` corregido; `localStorage` protegido con try.

**Sigue abierto (documentado):** DNS rebinding; D3/D5 no leen props ni patrones
desde HTML; D4 y D2 con las decisiones metodológicas pendientes.

# Nota sin nivel cuando el evaluador no pudo leer mucho (2026-09-14)

Capa de presentación (`public/report.js`, `public/report-texts.js`,
`public/results.html`). El motor, la rúbrica y el número del puntaje no cambian.

Motivo: la primera prueba en vivo con Carbon dio "Opaco, 20/100", aunque Carbon
es uno de los sistemas mejor documentados. D3 y D5 (30 % del peso) valían 0 solo
porque el evaluador no sabe leerlas desde páginas web.

- **Regla:** en resultados en vivo se calcula qué parte de la nota depende de
  criterios que el evaluador no puede leer (los "No evaluado" que igual cuentan
  0). Si es el 15 % o más, **no se asigna nivel**: se muestra el número como
  "demostrado", la etiqueta "Sin nivel asignado", y una explicación con ese
  porcentaje ("la nota real puede ser bastante más alta"). No se muestra la
  escala de niveles ni la conclusión de nivel ("Por tanto: …").
- **Dimensiones que no se pudieron leer en absoluto** (hoy D3 y D5 en vivo):
  muestran "No se pudo leer" en vez de un 0 como resultado, y pasan a la lista
  "No se pudo evaluar" en vez de "No se pudo demostrar".
- Las demos se ven exactamente igual que antes.
- `tests/report-certainty.test.js`: 5 pruebas nuevas. 55 en total.

Umbral (15 %): decisión de producto, en `PROVISIONAL_THRESHOLD` de `report.js`.

# Etapa 1 — Ver qué leyó el evaluador (2026-09-14)

Primer paso del plan para medir correctamente la evidencia de Design Systems
reales. No cambia el motor, la rúbrica ni el puntaje (hay una prueba que lo
verifica). `npm test`: 71 pruebas (16 nuevas en `tests/sources.test.js`).

- **Registro de fuentes** (`crawl.js`): cada dirección que el evaluador tocó o
  descartó queda con un estado: leída, no se pudo abrir (con motivo), buscada y
  no estaba (archivos conocidos como `llms.txt`), encontrada pero no leída
  (límite de páginas, tiempo o profundidad; variantes de parámetros), fuera del
  alcance, o repetida. Va en `crawlResult.sources`, separado de `pageRecords`,
  así que las estadísticas y los extractores no cambian.
- **Para qué se usó cada fuente leída** (`pipeline.js`): componente, archivo de
  tokens (con cantidad, desde el Evidence Corpus), índice para agentes, tipos, u
  "otra pestaña de un componente ya leído" (hoy se lee una página por
  componente). Se exportaron `componentIdentity` e `isLikelyComponentPage` de
  `detectComponents.js`, sin cambiar su comportamiento.
- **API** (`server.js`): la respuesta en vivo incluye `sources` con totales
  exactos por estado; las listas largas (fuera de alcance, no leídas) se
  recortan a 60, las leídas y fallidas se envían completas.
- **Informe** (`report.js`, `report-texts.js`, `results.html`): sección nueva
  "Qué revisamos" (ES/EN) con acceso directo desde el encabezado; cada grupo se
  puede plegar. Direcciones escapadas y enlazadas solo si son http(s), con
  `rel="noopener noreferrer nofollow"`. Resultados guardados con la versión
  anterior muestran un aviso en vez de fallar.
- **Aviso de "no evaluado"**: en la pantalla de inicio y en las limitaciones de
  cada resultado en vivo, explicando qué no se puede leer todavía (JavaScript,
  login, Figma, documentación en otros sitios) y que hoy parte de eso todavía
  cuenta como 0 (se corrige en la etapa 2).

# Descargar el resultado: PDF y JSON (2026-09-14)

No hay base de datos: el resultado vive solo en la pestaña del navegador. Ahora
se puede conservar. Todo se genera en el navegador; el servidor no recibe ni
guarda nada nuevo. Sin dependencias nuevas. `npm test`: 81 pruebas (10 nuevas
en `tests/download.test.js`).

- **Descargar PDF**: abre la impresión del navegador ("Guardar como PDF"; en
  celulares, desde el menú de compartir). Antes de imprimir se despliegan todos
  los bloques plegables (evidencia técnica, "Qué revisamos") y el título de la
  página pasa a ser el nombre sugerido del archivo
  (`agentic-ds-<sitio>-<fecha>`); después se restaura todo. Funciona también
  con Ctrl+P / Cmd+P.
- **Estilos de impresión** (`results.html`): sin botones ni navegación, con
  encabezado (fecha de la evaluación) y pie aclaratorio ("no es una
  certificación"), cortes de página cuidados y la fila de capacidades en dos
  filas para que no se corte. Verificado generando el PDF en Chromium (ES y EN).
- **Descargar datos (JSON)**: formato versionado y autodescriptivo
  (`tool`, `export_format_version`, `phase`, `exported_at`, `evaluated_at`,
  `mode`, `entry_url`, `report`, `sources`, `crawl_summary`), pensado para poder
  importarlo en la Fase 2 si se agrega almacenamiento.
- **Fecha de la evaluación**: `index.html` la guarda junto al resultado (solo en
  `sessionStorage`). Resultados de versiones anteriores no muestran fecha.
- Aviso en pantalla (ES/EN): el resultado no se guarda; para conservarlo, hay
  que descargarlo.

# Entrega 1 del plan de medición: etapas 2, 3 y 4 (2026-09-15)

`npm test`: 101 pruebas (20 nuevas en `tests/discovery-reading.test.js`; las
pruebas de la nota sin nivel se reescribieron para la regla nueva).

## Etapa 1 · Ver qué leyó el evaluador

Ya estaba hecha (ver 2026-09-14). Se amplió el registro con los nuevos tipos
de fuente: inicio del Design System, archivos buscados (llms.txt, sitemap.xml,
robots.txt), páginas de la lista del sitio que no entraron en la muestra, y
fuentes oficiales externas (Storybook, repositorio, paquete) todavía sin leer.

## Etapa 2 · Separar "no existe" de "no lo pudimos leer"

**Esto sí cambia el motor** (no los pesos ni las dimensiones).

- Cada criterio queda en un estado: Encontrado, Encontrado en parte, No
  encontrado, No existe, No se pudo leer o No aplica
  (`sub_criteria[x].status` y `.reason`). `evaluator/index.js`
  (`finalizeDimension`).
- Lo que no se pudo leer queda **fuera de la nota**: cada dimensión se calcula
  solo con los criterios evaluables. El rastreo informa qué no pudo buscar y
  por qué (`normalize.js`, `criteriaStatus`): está en una fuente oficial que no
  se lee todavía, no se leyó el lugar donde suele estar, o no hay con qué
  compararlo.
- "No existe" solo se afirma con certeza: hoy, cuando `llms.txt` se buscó en
  su dirección estándar y no estaba.
- **Tokens:** antes se marcaban "no existen" aunque nunca se hubieran buscado.
  Ahora "no encontrado" solo si se leyó una página de tokens/fundamentos o un
  archivo de tokens; si no, queda fuera de la nota.
- **Regla de la mitad** (reemplaza la "nota sin nivel" del 2026-09-14): si lo
  que se pudo revisar es menos del 50 % de la nota, se muestra el número con
  un aviso y sin nivel (`data_sufficiency: LOW_COVERAGE`,
  `overview.evaluable_share`). Umbral: `partial_evaluation_threshold` en
  `rules.json`. Se eliminó el cálculo aproximado que hacía el navegador.
- **Arreglo en D4:** sin componentes que compitan, la desambiguación "no
  aplica" y queda fuera del cálculo. Antes sumaba los 20 puntos completos sin
  evidencia. Cambian las demos: poor 5 → 0, partial 30 → 25,
  contradictory 55 → 50, not_evaluable 55 → 50, d1_gate 20 → 15.
  good (95) y not_applicable (70) no cambian.
- D3: sin propiedades, la consistencia de la API queda "no se pudo comparar"
  (antes 0). D2: el formato estructurado solo suma si hay un archivo de tokens,
  no solo tablas. D4 y D5 excluyen componentes que no se pudieron leer.

## Etapa 3 · Encontrar el Design System completo

Módulo nuevo `crawler/siteMap.js`; `crawler/crawl.js` reorganizado.

- Se reconoce la raíz del Design System (lo que está antes de secciones como
  components, foundations, patterns, componentes, patrones…), entrando por la
  dirección principal o por cualquier componente.
- Se busca la lista de páginas: `llms.txt` (raíz del DS y del sitio), luego
  `sitemap.xml` (incluidos índices de sitemaps y los declarados en
  `robots.txt`), luego el menú de navegación. Si no hay nada, se siguen los
  enlaces como antes.
- Muestra ordenada y siempre igual: 8 componentes repartidos a lo largo de la
  lista, con todas sus pestañas (hasta 5 cada uno), un índice y hasta 3
  patrones, hasta 4 páginas de tokens y el changelog. Máximo 45 páginas.
- Storybook, repositorios de GitHub y paquetes de npm enlazados desde la
  documentación se registran como fuentes oficiales (se leerán en la etapa 5).
- Todo pasa por los mismos controles de seguridad, tiempo y tamaño.
- El informe dice "Empezamos por X, reconocimos el Design System en Y,
  encontramos N componentes y evaluamos M" y de dónde salió la lista.
- Pantalla de inicio: "Pegá la dirección principal o la de cualquier
  componente". Página nueva `public/como-funciona.html` (ES/EN), enlazada
  desde el menú y el formulario.
- **Corregido:** el lector de respuestas ignoraba el contenido
  `application/xml`, así que la mayoría de los sitemaps no se habrían leído.

## Etapa 4 · Leer más cosas de cada página, en español e inglés

Módulo nuevo `extractor/readPage.js`; también `detectPatterns.js` (nuevo).

- Todas las pestañas de un componente se leen juntas (antes, una sola).
- Tablas de propiedades (nombre, tipo, valor por defecto, descripción, valores
  permitidos) y de tokens (nombre y valor).
- Variantes, estados (hover, foco, activo, deshabilitado, error, cargando,
  seleccionado, solo lectura), accesibilidad, anatomía, demos en vivo, versión
  o fecha de actualización.
- Páginas de patrones y qué componentes usan; si tienen guías de disposición
  o jerarquía.
- Declaración de un servidor MCP en el texto de la documentación.
- Vocabulario en español: «Cuándo usar», «Cuándo no usar», «No uses…»,
  «Nunca…», «Evitá…», «en lugar de», «en vez de», «Propiedades», «Variantes»,
  «Estados», «Accesibilidad», «Anatomía», «Última actualización».
- Una página armada con JavaScript deja el componente como "no se pudo leer".
- Los hallazgos del motor salen en el idioma elegido.

## Pendiente (entrega 2)

- Etapa 5: leer Storybook, paquetes publicados y archivos puntuales del
  repositorio.
- Etapa 6: validar con Design Systems reales (Carbon por la raíz y por el
  botón, un kit básico, uno pobre y un sitio que no es DS) y la prueba que
  falla si una regla menciona un Design System concreto. Hoy quedan
  comentarios en el código con nombres de sistemas usados como evidencia;
  las reglas en sí son genéricas.
- Etapa 7: documentación final con lo que quede funcionando.
- Sigue abierto: DNS rebinding.

---

# Cambios — correcciones de las primeras corridas en vivo (2026-09-18)

Origen: corridas reales contra Apple HIG, Fluent 2 y Carbon. Las tres daban
informes que no distinguían entre Design Systems. Ninguna corrección toca la
metodología ni los pesos: todas son del recorrido y de cómo se redacta lo que
no se pudo ver. Regresión en `tests/live-runs.test.js` (6 pruebas nuevas;
`npm test` pasa 107).

1. **La raíz adivinada descartaba el sistema entero.** `findDsRoot` deduce la
   raíz del DS de la dirección PEGADA. Con `/design-principles` (segmento que no
   está en `SECTION_SEGMENTS`) la raíz quedó en `/design-principles/`, y el
   filtro `inRoot` de `buildSample` redujo un sitemap de ~140 direcciones de
   Fluent 2 a 1. Ahora, si la lista del sitio existe pero no sobrevive ningún
   componente, se reintenta la muestra desde el origen del sitio y se registra
   en `discovery.root_widened_from`.
   Archivo: `crawler/crawl.js`.
2. **Una candidata caída se tomaba como evidencia de ausencia.** El `llms.txt`
   de Carbon lista páginas que hoy dan 404; las tres de fundamentos que el
   muestreador eligió eran tres de ellas, y D2 daba 0 sin haber leído una sola
   página de fundamentos. `buildSample` ahora devuelve `reserves` por tipo y
   `readSample` repone las caídas (máx. 12, 3 rondas, dentro del presupuesto).
   Archivos: `crawler/siteMap.js`, `crawler/crawl.js`.
3. **D2 afirmaba ausencia sobre cero evidencia.** `tokenPlacesRead` daba
   verdadero por una paleta de data-viz (el clasificador la cuenta como tokens
   porque contiene "color"), mientras las páginas de fundamentos fallaban. Ahora
   si alguna página de tokens/fundamentos falló, el estado es `NOT_EVALUABLE`
   en vez de `NOT_FOUND`.
   Archivo: `extractor/normalize.js`.
4. **`documentation_recoverability` medía éxito HTTP, no documentación.** El
   criterio se presenta como "el contenido está en el HTML del servidor y las
   páginas responden", pero era `páginas recuperadas / páginas pedidas` sobre
   TODO lo pedido. Consecuencias medidas: Fluent 2 sacaba 15/15 con 3 de sus 4
   "páginas" siendo `robots.txt` y dos sitemaps, y quedaba por encima de Apple;
   y la página de Apple que dice "This page requires JavaScript" aprobaba en
   parte el criterio de no requerir JavaScript. Ahora los archivos técnicos se
   excluyen del cálculo, el numerador exige texto visible en el HTML, y sin
   ninguna página de documentación intentada el criterio queda `NOT_EVALUABLE`
   (null) en vez de 0.
   Archivo: `extractor/detectAccess.js`.
5. **Texto de interpretación que contradecía al informe.** La banda baja de D1
   afirma "el agente tiene serias dificultades para llegar a la información del
   sistema"; en Carbon aparecía junto a un `llms.txt` encontrado y 49
   componentes descubiertos. Cuando la dimensión está incompleta y aun así hay
   criterios demostrados, ahora se usa un texto que dice lo único que la
   evidencia sostiene: no alcanzó para demostrarlo.
   Archivos: `public/report.js`, `public/report-texts.js`.

## Pendiente (no incluido en esta tanda)

- **Alcance por dominio registrable.** `isInScope` exige el mismo hostname y
  `allowed_domains` está declarado en `DEFAULTS` pero nunca se pasa a
  `isInScope`: es una opción muerta. Mientras siga así, `component_index` (20),
  `types_or_schema` (10) y `structured_tokens` (15) son inalcanzables para casi
  cualquier DS, porque viven en el Storybook, el repo o el paquete npm.
- **Contenido renderizado con JavaScript** (Apple DocC sirve todo en
  `/tutorials/data/<ruta>.json` y en Markdown con sufijo `.md`).
- **Rótulo "Evidencia completa"** en D6 cuando la muestra fueron 3 componentes
  de 49, y encabezado que dice "evaluamos 8" cuando 5 de esos 8 dieron 404.

## Puertas alternativas (adaptadores) — 2026-09-18

Requisito de producto: el diseñador pega el link público de su Design System y
obtiene un resultado. Saber si ese sitio entrega HTML, JSON o Markdown no es su
problema, es del evaluador.

6. **Contenido renderizado con JavaScript.** Si una página llega sin texto
   visible (o dice explícitamente que requiere JavaScript), el evaluador prueba
   ahora la dirección paralela donde el sitio publica lo mismo en un formato
   legible por máquina, que es lo que haría un agente real. Primer adaptador:
   DocC (Apple, Swift, y cualquier sitio publicado con esa herramienta), que
   sirve el contenido en `/tutorials/data/<ruta>.md` y `.json`. El Markdown y el
   modelo de contenido de DocC se convierten a un HTML simple —encabezados,
   párrafos, listas, tablas, código y enlaces— para que el extractor no tenga
   que duplicar lógica por formato. Los enlaces recuperados permiten además
   seguir recorriendo el sistema: sin ellos la HIG moría en 1 página.
   Se registra en el informe como una fuente propia ("misma página en formato
   legible por máquina") con la dirección de la que salió el contenido, para que
   el diseñador vea por qué puerta se entró.
   Archivos: `crawler/adapters.js` (nuevo), `crawler/crawl.js`,
   `public/report.js`, `public/report-texts.js`.
   Se desactiva con `adapters: false` en las opciones del crawl.

   Si NO hay adaptador que aplique, un cascarón sigue contando como ilegible: la
   recuperación no puede convertirse en una forma de aprobar el criterio sin
   haber leído nada.

## Fuentes oficiales: salir del dominio, con regla — 2026-09-18

Decisión de producto: el diseñador pega el link de su documentación y el
evaluador va a buscar la evidencia donde el sistema dice que está. Alcance
acotado: SOLO se entra a lo que el propio Design System declara como fuente
oficial (enlazado desde su documentación o su `llms.txt`). Un enlace a un blog
que menciona el sistema no habilita nada.

7. **El Storybook declarado ahora se lee.** Storybook publica su índice de
   componentes en `index.json` (v7+) o `stories.json` (v6). Ese archivo es
   exactamente el "índice de componentes legible por máquinas" que pide D1 y que
   Carbon tenía publicado mientras el informe le recomendaba publicarlo.
   Archivos: `crawler/officialSources.js` (nuevo), `crawler/crawl.js`.
   Se desactiva con `official_sources: false`.
8. **Detección de fuentes por la etiqueta del enlace, no solo por el host.** El
   Storybook de Carbon vive en `react.carbondesignsystem.com`: no contiene la
   palabra "storybook" y por eso nunca se detectaba. Ahora también se mira el
   texto del enlace ("Storybook (React)").
9. **El `llms.txt` se mira para descubrir fuentes oficiales.** Se leía como lista
   de páginas, pero su contenido nunca se inspeccionaba en busca del Storybook o
   el repositorio, que es justo donde muchos sistemas los declaran.
10. **Los artefactos para máquinas no entran en la legibilidad de documentación.**
    `index.json` / `stories.json` puntúan en su criterio propio y quedan fuera
    del denominador de `documentation_recoverability`.

### Sigue pendiente (requiere trabajo de pantallas)

- Leer el repositorio y los paquetes publicados (tipos `.d.ts`, tokens del
  paquete). Hoy se declaran y se marcan como no leídos, nunca como ausentes.
- Preguntarle al diseñador por las direcciones que falten, DESPUÉS del resultado
  automático y pidiendo direcciones, nunca respuestas: si se le cree lo que dice
  tener, el evaluador deja de medir evidencia y pasa a ser una autoevaluación.

## Alineación con el diseño de la home — 2026-09-18

Revisión de los cambios anteriores contra lo que `public/index.html` ya promete.

11. **El aviso de la home decía de menos.** `form.note.notEvaluable` afirmaba que
    el evaluador no puede leer contenido con JavaScript ni el Storybook. Ambas
    cosas cambiaron con los puntos 6 y 7: ahora se busca la versión legible por
    máquina de una página renderizada con JavaScript, y el Storybook declarado se
    lee. El aviso ahora describe lo que el evaluador hace hoy y deja explícito
    lo que sigue fuera (login, Figma, repositorios y paquetes).
    Archivos: `public/i18n.js`, `tests/sources.test.js`.

### Confirmado contra el diseño

- El campo de entrada dice "Pegá la dirección principal o la de cualquier
  componente". El bug de Fluent (una entrada profunda descartaba el sistema
  entero) no era una decisión pendiente: era el código incumpliendo la home. La
  corrección 1 lo alinea.
- La home ya declara las limitaciones bajo el campo, que era justo el "aviso
  honesto" pendiente. No hacía falta inventarlo, solo mantenerlo al día.

### Desajustes con el diseño que quedan abiertos

- La home dice "Six dimensions. One goal." y lista 01 a 06, pero el informe
  muestra siete (D7, Consistencia Design–Code, "requiere conectar Figma"). O la
  home suma la séptima o el informe deja de mostrarla en esta fase.
- La navegación tiene "Methodology" y "About" apuntando a anclas (`#method`,
  `#about`) dentro de la misma página; no hay páginas de metodología. Falta
  también el documento `METHODOLOGY_DECISIONS.md` que el motor cita siete veces
  (`scoring.js`, `d1.js`, `d2.js`, `detectAccess.js`) y que no está en el
  repositorio: sin él no se puede verificar que el escalado de D1 y la regla
  "tokens NOT_FOUND = 0" sigan respetándose.

## Bandas de nivel y redondeo — 2026-09-18 (METHODOLOGY_DECISION aprobada)

12. **Los cortes de banda pasan a múltiplos de 5.** El score global se muestra
    redondeado a múltiplos de 5 (`round5`, para no fingir precisión) pero los
    cortes de la Build Specification v0.1 estaban en 26, 51 y 76 — números que
    `round5` nunca produce. Como el nivel se calcula sobre el número mostrado,
    los umbrales EFECTIVOS eran 27,5 / 52,5 / 77,5: cada banda corrida 1,5
    puntos hacia arriba, siempre en contra del sistema evaluado. Un DS con 76
    —Operable según la metodología— se mostraba como 75 y se etiquetaba
    Interpretable.
    Nuevos cortes: Opaco 0–24, Legible 25–49, Interpretable 50–74,
    Operable 75–100. Ahora el número que se muestra y la tabla que el propio
    informe imprime coinciden siempre, que es la propiedad que el diseñador
    puede verificar a ojo.
    Queda como consecuencia aceptada del redondeo: el score mostrado tiene una
    granularidad de ±2,5 respecto del crudo. `global_score_raw` sigue en el JSON
    para trazabilidad.
    Archivos: `engine/config/rules.json`, `public/report-texts.js` (tabla
    impresa, ES y EN).

13. **`readinessLevel` ya no cae en silencio a la peor banda.** Buscaba
    `score >= min && score <= max`; entre banda y banda había huecos (25–26,
    50–51, 75–76) y un score caído ahí no encontraba ninguna, devolviendo el
    valor por defecto "Opaco". Un 75,5 se reportaba como Opaco. Ahora los cortes
    se leen como intervalos semiabiertos por su `min`: no hay huecos posibles.
    Con un score no numérico devuelve `null` en vez de inventar un nivel.
    Archivo: `engine/src/evaluator/utils.js`.

Nota: las bandas por dimensión usan la misma tabla, así que el cambio aplica a
las seis dimensiones y al global por igual.

# Correcciones tras la revisión del zip y las pruebas con Carbon, Fluent 2 y Material 3 — 2026-10-03

`npm test`: 123 pruebas (10 nuevas), todas pasando. No se tocaron pesos, tablas de
puntos ni la rúbrica. Las demos producen las mismas cifras.

14. **Una sola página hostil bloqueaba el servidor para todos.** Las lecturas de
    HTML usaban expresiones del tipo `<p[^>]*>([\s\S]*?)<\/p>`, que son
    cuadráticas cuando hay muchas etiquetas sin cierre: cada `<p>` volvía a
    recorrer el documento entero. Medido con páginas de 300 KB: ~98 s para `<p>`,
    ~34 s para `<h2>` y ~17 s para `<li>` por evaluación (3 páginas). Como Node usa
    un solo hilo, mientras tanto no se atendía a nadie, ni la home. El tope de 2
    evaluaciones simultáneas y el límite por IP no ayudaban: el bloqueo era
    interno. Ahora todas las lecturas de bloques usan `findBlocks`
    (`engine/src/extractor/blocks.js`), de tiempo lineal y con la misma salida en
    HTML normal. Con páginas de 900 KB: de 0,04 a 0,6 s. `stripTags` se reescribió
    sin expresiones regulares sobre el documento completo. Otros patrones con
    `[^>]*` se cambiaron por `[^<>]*` (`discovery.js`, `crawl.js`, `siteMap.js`,
    `readPage.js`).
    Archivos: `extractor/blocks.js` (nuevo), `parseHtml.js`, `readPage.js`,
    `crawler/siteMap.js`, `crawler/crawl.js`, `crawler/discovery.js`.
    Prueba: `tests/linear-parsing.test.js`.

15. **La lectura de fuentes oficiales no respetaba el límite de tiempo.** Corría
    después del rastreo sin tope. Con 10 Storybooks lentos: 6 s frente a un
    presupuesto de 1,5 s. Con tiempos reales (hasta 8 s por petición) la cota era
    de ~160 s frente a 45 s. Ahora tiene su propio presupuesto
    (`official_sources_max_ms`, 10 s por defecto, solo cuando el rastreo tiene
    límite de tiempo). Lo que no alcanza a leerse queda marcado `time_limited` en
    la fuente (declarada, no leída) y el resultado cuenta como limitado por tiempo.
    El peor caso total pasa a ~55 s en vez de ~160 s.
    Archivos: `crawler/officialSources.js`, `crawler/crawl.js`.
    Prueba: `tests/official-sources-budget.test.js`.

16. **Una página cascarón contaba como "leída".** `visibleTextLength` sumaba
    todo el HTML (título y aviso de `<noscript>` incluidos) y bastaban 40
    caracteres, o cualquier `<p>` con texto (un aviso de cookies), para que la
    página contara como legible. Efecto visible en Material 3: D1 decía "el
    contenido está en el HTML" (15/15) y, en esas mismas páginas, D3, D4 y D5 no
    hallaban nada y lo puntuaban 0 en vez de "no se pudo leer". Ahora el texto
    visible es el del `<body>` sin `<head>`, menús, `<noscript>` ni `<template>`, y el
    mínimo es `MIN_READABLE_TEXT` (200 caracteres), igual en D1 y en la lectura de
    componentes; ya no existe el atajo del `<p>`. Una página por debajo queda
    `NOT_EVALUABLE` (fuera de la nota).
    Es un umbral de producto. Se ajustaron los textos de relleno de 3 pruebas
    que usaban páginas de una línea.
    Archivos: `extractor/readPage.js`, `detectAccess.js`, `detectComponents.js`.
    Prueba: `tests/readability.test.js`.
    **No verificado:** que Material 3 o Fluent 2 sirvan hoy un cascarón; sin
    acceso a esos sitios desde el entorno de desarrollo no se pudo comprobar.
    La prueba es abrir una página de componente, Ctrl+U, y buscar un título
    visible. Si aparece en el código fuente, la causa de los ceros no es esta.

17. **El aviso "el acceso limita el resultado a un máximo de 40" aparecía aunque
    el tope no cambiara nada.** Con D1 < 25 se mostraba siempre; en Fluent 2 y
    Material 3 la nota cruda ya era 22 y 4. Ahora el motor expone
    `gate.capped` (el tope bajó el número) y el informe solo avisa en ese caso.
    Los informes guardados sin ese campo mantienen el criterio anterior.
    Archivos: `evaluator/scoring.js`, `public/report.js`.

18. **Español neutro.** Se quitó el voseo ("Pegá", "Probá", "Podés"…) de la
    pantalla de inicio, los mensajes de error, "Cómo funciona" y el README.

**Pendiente, sin decidir ni tocar:**
- D2 y los criterios `component_index` y `structured_tokens` de D1 puntúan 0
  cuando la evidencia vive en fuentes oficiales declaradas pero no leídas
  (Storybook, paquete, repositorio). El mismo faltante se penaliza dos veces
  (15 puntos en D1 y toda D2). Es una decisión de metodología.
- La desambiguación de D4 se da por encontrada con una sola frase "instead of";
  Fluent 2 sacó 20/20 con ese detector. Sin comparar contra la página real.
- Bandas 25/50/75: el nivel se calcula sobre la nota redondeada a 5, lo que ahora
  favorece al sistema evaluado (~2,5 puntos) en vez de perjudicarlo. La rúbrica
  original sigue diciendo 26/51/76.
- Tabla "Design System → cómo entrega su contenido" (HTML completo, parcial,
  JavaScript) para el README, con pruebas reales, empezando por Material 3.

# Leer sitios que dependen de JavaScript, con cargador de avance — 2026-10-03

`npm test`: 140 pruebas (17 nuevas). Pesos, tablas de puntos y rúbrica sin cambios.
Las pruebas con navegador real se saltan si la máquina no tiene Chromium.

19. **Lector con navegador.** Cuando una página llega sin contenido legible
    (menos de 200 caracteres en el `<body>`), y los adaptadores no la recuperan,
    se abre con Chromium, se espera a que el contenido deje de cambiar y se lee
    el DOM ya compuesto, incluido el shadow DOM abierto. Las páginas que ya
    traen su contenido no pasan por el navegador. Una página a la vez; el
    navegador se reinicia cada 15 páginas y se cierra tras 15 s sin uso.
    Chromium se controla con un cliente propio del protocolo de depuración
    (sin dependencias de npm), por `--remote-debugging-pipe`.
    Si no hay Chromium o no arranca, el evaluador sigue como antes y el informe
    lo dice. Si el modo de un solo proceso (menos memoria) no arranca o se cae,
    pasa solo al modo de varios procesos.
    Archivos: `crawler/renderer.js`, `crawler/browser/cdp.js`, `crawler/crawl.js`.

20. **Proxy de salida.** Todo el tráfico del navegador pasa por un proxy local
    que solo permite direcciones públicas, puertos 80 y 443, y se conecta a la
    IP que validó. Tiene tope de bytes y de conexiones.
    Archivos: `crawler/browser/egressProxy.js`, `crawler/ssrfGuard.js`
    (`resolvePublicAddress`).

21. **Tiempo.** Abrir páginas con navegador es lento. Cuando hace falta, el
    límite del rastreo (45 s) se amplía una sola vez en `RENDER_EXTRA_MS`
    (100 s por defecto). Lo que no alcanza a abrirse queda "no se pudo leer" y
    el resultado se marca como limitado por tiempo.

22. **D1 conserva la barrera de JavaScript.** `documentation_recoverability`
    no cuenta las páginas que hubo que abrir con navegador: el criterio mide si
    el contenido llega sin ejecutar JavaScript. Las demás dimensiones se evalúan
    con el contenido cargado. Es una decisión de método (se puede revertir en
    `detectAccess.js`).

23. **D2 ya no marca "evaluado: 0" con páginas de tokens vacías.** Si alguna
    página de tokens llegó sin contenido, D2 queda `NOT_EVALUABLE`. Visto en
    Material 3: D2 = 0 con sus cuatro páginas de tokens vacías.
    Archivo: `extractor/normalize.js`.

24. **Cargador con avance.** Pantalla completa con el paso actual en una línea
    ("Conectando…", "Encontramos 40 componentes…", "Este sitio arma su contenido
    con JavaScript…", "Evaluando las 6 dimensiones…"). La página manda un
    identificador aleatorio y consulta `GET /api/progress`. Si la conexión del
    pedido principal se corta en una evaluación larga, la página recupera el
    resultado por esa misma vía. Los avances viven en memoria, 4 minutos, con
    tope de 20.
    Archivos: `server.js`, `public/index.html`, `public/i18n.js`, `pipeline.js`.

25. **Despliegue con Docker.** `render.yaml` pasa de `runtime: node` a
    `runtime: docker` y se agrega `Dockerfile` (Node 22 + Chromium de Debian).
    El entorno Node estándar de Render no trae navegador ni permite instalar
    paquetes del sistema.

26. **Informe.** Dice cuántas páginas se abrieron con navegador y, si alguna no
    se pudo abrir, lo lista entre las razones de evaluación incompleta. El JSON
    descargado incluye `crawl_summary.render` y `crawl_summary.browser`
    (disponible o no, y el último error), para poder diagnosticar sin acceso al
    servidor.

27. **Español neutro**: restos de voseo en el informe, mensajes de error y README.

**Revisión de seguridad (hecha por el mismo autor, sin revisor externo).**
Corregido tras repasar el código con páginas hostiles reales:
- una página que cuelga el navegador (`for(;;){}`) lo dejaba inservible para la
  siguiente: ahora se cierra y se arranca uno limpio;
- título, atributos o nodos de texto gigantes podían saltarse el tope del HTML
  devuelto: ahora todo se recorta (1,5 millones de caracteres en total);
- un mensaje enorme del navegador (por ejemplo `alert()` con un texto de 100 MB)
  se acumulaba en memoria: tope de 16 MB y se cierra el navegador;
- el arranque del navegador podía pasarse del límite de la evaluación;
- ventanas emergentes, descargas, QUIC y resolución anticipada de nombres:
  desactivados; direcciones finales que no sean http(s) (file:, chrome:, blob:)
  se descartan;
- el identificador de avance no se puede reutilizar, y al llenarse el registro
  se descarta primero una evaluación terminada, no una en curso.

**No verificado (no se puede desde el entorno de desarrollo):**
- que el plan gratuito de Render (512 MB, 0,1 CPU) aguante el navegador. Medido
  aquí: ~300 MB de pico en modo de un proceso, ~400 MB con varios, más ~80 MB
  de Node;
- que el `Dockerfile` construya en Render (no hay Docker en desarrollo);
- el resultado contra Material 3, Fluent 2 u otro sitio real.
