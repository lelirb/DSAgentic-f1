# Agentic DS — Fase 1

Evaluador de qué tan preparado está un Design System para ser usado por
agentes de IA. Esta app ya está lista para funcionar: local primero, y
después en internet (Render), sin tocar código en ningún momento.

---

## A. Probarlo en tu computadora (opcional, para verificar antes de subirlo)

1. Instala [Node.js](https://nodejs.org) si no lo tienes (botón "LTS").
2. Descomprime este ZIP en cualquier carpeta.
3. Abre la Terminal (Mac) o Símbolo del sistema (Windows) en esa carpeta.
4. Escribe `npm install` y Enter (tarda unos segundos, no requiere internet real).
5. Escribe `npm start` y Enter.
6. Abre `http://localhost:8787` en el navegador.

Si ves la pantalla con el botón "Evaluate a Design System", funcionó.

*(Este paso es opcional — puedes saltarlo directamente al paso B si
prefieres ver primero la versión online.)*

---

## B. Subir el proyecto a GitHub

1. Ve a [github.com](https://github.com) y crea una cuenta gratis (si no tienes).
2. Arriba a la derecha, botón verde **"New"** (o el símbolo `+` → "New repository").
3. Ponle un nombre (ej. `agentic-ds`) → **"Create repository"**.
4. En la página del repo recién creado, busca el link que dice
   **"uploading an existing file"** (o el botón "Add file" → "Upload files").
5. Arrastra **todos los archivos y carpetas de adentro del ZIP** (no el ZIP en sí)
   a esa página.
6. Abajo, botón **"Commit changes"**.

Listo — tu código ya está en GitHub.

---

## C. Conectar GitHub con Render

1. Ve a [render.com](https://render.com) y crea una cuenta gratis
   (te conviene entrar con "Sign up with GitHub" para que quede conectado de una).
2. Botón **"New"** → elige **"Blueprint"** (no "Web Service" — Blueprint es el
   que lee la configuración que ya te dejé preparada y no te pregunta nada raro).
3. Elige el repositorio que creaste en el paso B.
4. Render va a detectar automáticamente el archivo `render.yaml` que está
   incluido en el proyecto — no hace falta que completes ningún campo a mano.

---

## D. Primer deploy

1. Pulsa **"Apply"** (o "Deploy Blueprint", según cómo lo muestre Render).
2. Espera 2 a 4 minutos — verás registros pasando, es normal.
3. Cuando el estado cambie a **"Live"**, ya está online.

---

## E. Abrir la aplicación funcionando

1. Arriba de la página del servicio en Render verás una URL, algo como
   `https://agentic-ds-xxxx.onrender.com`.
2. Haz clic ahí (o cópialo y pégalo en el navegador).
3. Esa es tu app real, funcionando, con un link que puedes compartir.

**Aviso importante**: el plan gratis de Render "duerme" la app si nadie
la visita por un rato. La primera vez que alguien entra después de estar
dormida, tarda unos 30-50 segundos en responder — no es un error, es así
como funciona el plan gratuito. Los usos siguientes son instantáneos.

---

## Qué hace esta app

- **Home** — pegas la URL de un Design System (o pruebas una demo).
- **Results** — el informe completo: puntaje, las 6 dimensiones con
  detalle (qué funciona, qué falta, por qué importa, recomendación),
  todos los hallazgos, y las limitaciones de esa evaluación.

## Qué NO incluye todavía (a propósito — esto es solo Fase 1)

- No hay Fase 2 (agentes probando el Design System en tareas reales).
- No hay cuentas, historial, ni guardar resultados — cada evaluación
  vive solo en esa visita.
- Storybook, repositorios de código y paquetes publicados: la herramienta
  los detecta cuando la documentación los enlaza, pero todavía no los lee.
  Lo que vive solo ahí queda fuera de la nota (no cuenta como 0).
- Páginas con login y archivos de Figma siguen sin poder leerse. Ver la
  página "Cómo funciona" dentro de la app.

## Sitios que arman su contenido con JavaScript

Algunos Design Systems entregan una página vacía y la completan con
JavaScript (por ejemplo, Material 3). Para leerlos, la app abre esas páginas
con un navegador (Chromium) instalado en el servidor. Solo lo usa cuando una página llega vacía; el resto se lee igual
que antes.

Qué cambia para quien usa la app:
- Esas evaluaciones tardan más: hasta unos 3 minutos. Mientras tanto se
  muestra un cargador que dice en qué paso va.
- El informe avisa cuántas páginas se abrieron con navegador.
- D1 sigue marcando que el contenido no está disponible sin JavaScript,
  porque muchos agentes no lo ejecutan. Las demás dimensiones se evalúan
  con el contenido ya cargado.

Qué cambia en Render:
- El servidor ahora se construye con Docker (archivo `Dockerfile`), porque
  es la forma de tener Chromium instalado. `render.yaml` ya lo indica.
- Si creaste el servicio con "Blueprint" (paso C), el cambio se aplica solo
  al subir el código. Si en la página del servicio sigue diciendo "Node" en
  vez de "Docker", entra al Blueprint en Render y pulsa **"Manual Sync"**.
- El primer despliegue con Docker tarda más (5 a 10 minutos).
- Si el navegador no está disponible, la app sigue funcionando: esas páginas
  quedan como "no se pudo leer" y el informe lo dice.

**Límite conocido:** el plan gratuito de Render tiene 512 MB y poca CPU. En
la primera prueba real (Material 3, 2026-10-03) el navegador funcionó de forma
estable, pero leyó 14 de las 32 páginas de la muestra en unos 2 minutos y
medio; el resto quedó como "no se pudo leer" por tiempo. Con un plan de más
potencia leería más páginas en el mismo tiempo.

Para apagar el navegador sin tocar código: variable de entorno
`BROWSER_RENDERING=0` en Render.

## Seguridad ya incluida (verificada, no solo prometida)

- Protección contra SSRF (no se puede apuntar a IPs internas/privadas).
- Protección contra path traversal en el servidor de archivos.
- Límite de 5 evaluaciones de URL real por minuto, por visitante.
- Límite de tamaño de respuesta al rastrear (5MB) — evita que un sitio
  malicioso cuelgue el servidor.
- Sin LLM en el motor — el puntaje es 100% determinístico (reglas), no
  hay una IA a la que se le pueda "inyectar" instrucciones.

Detalle completo más abajo en este mismo archivo, si quieres profundizar
— no hace falta leerlo para poder usar la app.

---

## Apéndice técnico (opcional — no hace falta leerlo para usar la app)

- `server.js` — servidor Node sin dependencias externas. Puerto
  configurable vía `process.env.PORT` (Render lo asigna automáticamente).
- `engine/` — el motor evaluador completo: crawler, extractor, y las
  6 dimensiones de scoring (D1-D6).
- `public/` — el frontend (Home, Results, y una versión de vista previa
  sin servidor con datos de ejemplo ya calculados).
- `render.yaml` — le dice a Render cómo correr el proyecto sin que
  tengas que configurar nada manualmente.
- `Dockerfile` — la imagen del servidor: Node 22 más Chromium.
- `engine/src/crawler/renderer.js` y `engine/src/crawler/browser/` — el
  lector con navegador y su proxy de salida.
- `package.json` — sin dependencias externas (`dependencies: {}`), así
  que `npm install` es casi instantáneo.

### Seguridad — cobertura completa

Cubierto y verificado con pruebas automatizadas (`npm test`):
- SSRF (resolución DNS real antes de CADA petición — URL de entrada, enlaces
  descubiertos y cada salto de redirect —, bloquea IPs privadas IPv4/IPv6
  incluyendo el endpoint de metadata de nube).
- Path traversal en el servidor de archivos estáticos.
- Rate limiting (5 evaluaciones de URL real por minuto por IP).
- XSS (todo contenido de un DS rastreado pasa por escape antes de
  mostrarse).
- DoS por memoria (límite de 5MB por respuesta, verificado con streaming).
- DoS por pila (JSON de tokens anidado maliciosamente no revienta el proceso).
- Cuerpo de petición a la API limitado a 16KB.
- HTML mal formado: las lecturas son de tiempo lineal; una página con miles
  de etiquetas sin cerrar ya no bloquea el servidor.
- Navegador (ver `tests/browser-security.test.js`, una prueba por caso):
  - todo su tráfico sale por un proxy propio que solo permite direcciones
    públicas (puertos 80 y 443) y se conecta a la IP que validó;
  - bloqueados: localhost, 127.0.0.1, 0.0.0.0, rangos privados IPv4, IPv6 de
    loopback, link-local y locales, el endpoint de metadata de nube, y sus
    formas alternativas (decimal, hexadecimal, octal, IPv4 dentro de IPv6);
  - una redirección (HTTP, JavaScript o meta) desde un sitio público hacia una
    dirección interna no llega; tampoco fetch, iframe, imagen, WebSocket ni
    WebRTC lanzados por el código de la página;
  - no devuelve archivos locales (`file:`) ni contenido de otra dirección que
    la pedida;
  - límite de tiempo por página y por evaluación; una página que cuelga o
    tumba el navegador no afecta a la siguiente ni congela el servidor;
  - tope de tamaño del contenido devuelto (1,5 millones de caracteres) y de
    descarga por navegador (80 MB);
  - al cerrar no quedan procesos, carpetas temporales ni puertos abiertos, ni
    siquiera si el servidor muere de golpe;
  - el navegador corre sin privilegios de administrador, sin heredar las
    variables de entorno del servidor y sin permisos (cámara, ubicación…).

NO cubierto (limitaciones reales):
- Sin autenticación.
- Rate limiting en memoria — no sirve con múltiples instancias del servidor.
- DNS rebinding (un dominio que resuelve a una IP pública al chequearlo y a
  una privada un instante después): cubierto para el tráfico del navegador;
  NO cubierto para las peticiones directas del rastreador. Los redirects HTTP
  hacia hosts internos SÍ están cubiertos (ver `CAMBIOS.md`).
- El navegador corre sin el aislamiento propio de Chromium (`--no-sandbox`),
  como es habitual dentro de un contenedor. Si alguien explotara un fallo del
  propio Chromium, podría ejecutar código dentro del contenedor y saltarse el
  proxy. La app no guarda secretos; mantener la imagen actualizada (cada
  despliegue reinstala Chromium) es la defensa.
- El control del navegador es código propio, nuevo, sin revisión externa.

### Verificación realizada antes de esta entrega

Corrido en un entorno limpio (solo los archivos que van en este ZIP,
sin nada del entorno de desarrollo), usando `npm install` + `npm start`
con `PORT` como variable de entorno (igual que lo hace Render):

- Home (`/`) → HTTP 200
- `/i18n.js` → HTTP 200
- Evaluate → API → Engine (demo real) → score 95, Operable, diagnóstico
  completo presente
- Results (`/results.html`) → HTTP 200
- Caso con gate activado (demo "poor") → score 0, gate aplicado (antes 5: ver CAMBIOS.md, arreglo de D4)
- Path traversal → bloqueado (403)
- SSRF contra IP privada → bloqueado
- El proceso no crasheó en ningún momento de la prueba
