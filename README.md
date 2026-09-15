# Agentic DS — Fase 1

Evaluador de qué tan preparado está un Design System para ser usado por
agentes de IA. Esta app ya está lista para funcionar: local primero, y
después en internet (Render), sin tocar código en ningún momento.

---

## A. Probarlo en tu computadora (opcional, para verificar antes de subirlo)

1. Instalá [Node.js](https://nodejs.org) si no lo tenés (botón "LTS").
2. Descomprimí este ZIP en cualquier carpeta.
3. Abrí la Terminal (Mac) o Símbolo del sistema (Windows) en esa carpeta.
4. Escribí `npm install` y Enter (tarda unos segundos, no requiere internet real).
5. Escribí `npm start` y Enter.
6. Abrí `http://localhost:8787` en el navegador.

Si ves la pantalla con el botón "Evaluate a Design System", funcionó.

*(Este paso es opcional — podés saltarlo directamente al paso B si
preferís ver primero la versión online.)*

---

## B. Subir el proyecto a GitHub

1. Andá a [github.com](https://github.com) y creá una cuenta gratis (si no tenés).
2. Arriba a la derecha, botón verde **"New"** (o el símbolo `+` → "New repository").
3. Ponele un nombre (ej. `agentic-ds`) → **"Create repository"**.
4. En la página del repo recién creado, buscá el link que dice
   **"uploading an existing file"** (o el botón "Add file" → "Upload files").
5. Arrastrá **todos los archivos y carpetas de adentro del ZIP** (no el ZIP en sí)
   a esa página.
6. Abajo, botón **"Commit changes"**.

Listo — tu código ya está en GitHub.

---

## C. Conectar GitHub con Render

1. Andá a [render.com](https://render.com) y creá una cuenta gratis
   (te conviene entrar con "Sign up with GitHub" para que quede conectado de una).
2. Botón **"New"** → elegí **"Blueprint"** (no "Web Service" — Blueprint es el
   que lee la configuración que ya te dejé preparada y no te pregunta nada raro).
3. Elegí el repositorio que creaste en el paso B.
4. Render va a detectar automáticamente el archivo `render.yaml` que está
   incluido en el proyecto — no hace falta que completes ningún campo a mano.

---

## D. Primer deploy

1. Apretá **"Apply"** (o "Deploy Blueprint", según cómo lo muestre Render).
2. Esperá 2 a 4 minutos — vas a ver logs pasando, es normal.
3. Cuando el estado cambie a **"Live"**, ya está online.

---

## E. Abrir la aplicación funcionando

1. Arriba de la página del servicio en Render vas a ver una URL, algo como
   `https://agentic-ds-xxxx.onrender.com`.
2. Hacé clic ahí (o copialo y pegalo en el navegador).
3. Esa es tu app real, funcionando, con un link que podés compartir.

**Aviso importante**: el plan gratis de Render "duerme" la app si nadie
la visita por un rato. La primera vez que alguien entra después de estar
dormida, tarda unos 30-50 segundos en responder — no es un error, es así
como funciona el plan gratuito. Los usos siguientes son instantáneos.

---

## Qué hace esta app

- **Home** — pegás la URL de un Design System (o probás una demo).
- **Results** — el informe completo: puntaje, las 6 dimensiones con
  detalle (qué funciona, qué falta, por qué importa, recomendación),
  todos los hallazgos, y las limitaciones de esa evaluación.

## Qué NO incluye todavía (a propósito — esto es solo Fase 1)

- No hay Fase 2 (agentes probando el Design System en tareas reales).
- No hay cuentas, historial, ni guardar resultados — cada evaluación
  vive solo en esa visita.
- Los hallazgos del motor salen siempre en español, incluso con la
  interfaz en inglés — limitación conocida, no corregida en este empaquetado.
- El extractor todavía no lee props/variantes/estados desde HTML real,
  así que la dimensión "Componentes y API" puede puntuar bajo en un
  sitio real no porque esté mal documentado, sino porque todavía no se
  lo está leyendo del todo bien.

## Seguridad ya incluida (verificada, no solo prometida)

- Protección contra SSRF (no se puede apuntar a IPs internas/privadas).
- Protección contra path traversal en el servidor de archivos.
- Límite de 5 evaluaciones de URL real por minuto, por visitante.
- Límite de tamaño de respuesta al rastrear (5MB) — evita que un sitio
  malicioso cuelgue el servidor.
- Sin LLM en el motor — el puntaje es 100% determinístico (reglas), no
  hay una IA a la que se le pueda "inyectar" instrucciones.

Detalle completo más abajo en este mismo archivo, si querés profundizar
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

NO cubierto (limitaciones reales):
- Sin autenticación.
- Rate limiting en memoria — no sirve con múltiples instancias del servidor.
- No protege contra DNS rebinding (un dominio que resuelve a una IP pública
  al chequearlo y a una privada un instante después). Los redirects HTTP
  hacia hosts internos SÍ están cubiertos desde la corrección del 2026-09-10
  (ver `CAMBIOS.md`).
- Regex del extractor no auditados formalmente contra ReDoS.

### Verificación realizada antes de esta entrega

Corrido en un entorno limpio (solo los archivos que van en este ZIP,
sin nada del entorno de desarrollo), usando `npm install` + `npm start`
con `PORT` como variable de entorno (igual que lo hace Render):

- Home (`/`) → HTTP 200
- `/i18n.js` → HTTP 200
- Evaluate → API → Engine (demo real) → score 95, Operable, diagnóstico
  completo presente
- Results (`/results.html`) → HTTP 200
- Caso con gate activado (demo "poor") → score 5, gate aplicado
- Path traversal → bloqueado (403)
- SSRF contra IP privada → bloqueado
- El proceso no crasheó en ningún momento de la prueba
