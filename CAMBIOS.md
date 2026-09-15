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
