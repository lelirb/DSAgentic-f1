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

## Hallazgos con contenido real de Fluent 2 (sin corregir, requieren decisión)

- La lista de componentes de la home y de `/components/web/react` parece
  cargarse con JavaScript: sin JS, el crawler no encuentra enlaces a páginas de
  componentes desde ahí. Entrar por una página de componente (p. ej.
  `/components/web/react/core/button/usage`) sí permite avanzar, porque su
  contenido enlaza a link, dialog, drawer, message bar y toast.
- Las páginas de plataforma (`/components/web/react`, `/ios`, `/android`,
  `/windows`) se detectan como si fueran componentes (falsos positivos).
- Fluent desambigua con "try a link instead" / "use a switch", no con
  "instead of": el extractor no lo capta.
