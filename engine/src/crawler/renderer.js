// Lector con navegador: abre la página como lo haría una persona, espera a que
// su JavaScript arme el contenido y devuelve el HTML resultante.
//
// Se usa SOLO cuando una página llega vacía (ver crawl.js). Las páginas que ya
// traen su contenido en el HTML se siguen leyendo como antes, sin navegador.
//
// Límites deliberados:
//   - una página a la vez (un navegador consume mucha memoria);
//   - todo el tráfico sale por egressProxy.js, que solo permite direcciones públicas;
//   - imágenes, fuentes y vídeo no se descargan;
//   - tiempo máximo por página y tamaño máximo del HTML devuelto;
//   - si no hay navegador instalado o no arranca, `available` es false y el
//     evaluador sigue funcionando como antes (esas páginas quedan "no se pudo leer").
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { launchChromium } from "./browser/cdp.js";
import { startEgressProxy } from "./browser/egressProxy.js";

const MAX_HTML_CHARS = 1_500_000;
const POLL_MS = 400;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 AgenticDS/1.0 (Design System agent-readiness evaluator)";

const BLOCKED_URL_PATTERNS = [
  "*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.avif", "*.ico", "*.bmp",
  "*.woff", "*.woff2", "*.ttf", "*.otf", "*.eot",
  "*.mp4", "*.webm", "*.mp3", "*.ogg", "*.wav", "*.mov",
];

// Dónde buscar un Chromium ya instalado, en orden de preferencia. CHROMIUM_PATH
// manda si está definido. Se prefiere la variante "headless shell": no trae
// interfaz gráfica y usa menos memoria.
export function findChromium(env = process.env) {
  return findChromiumCandidates(env)[0] || null;
}

export function findChromiumCandidates(env = process.env) {
  const candidates = [];
  if (env.CHROMIUM_PATH) candidates.push(env.CHROMIUM_PATH);
  candidates.push(
    "/usr/bin/chromium-headless-shell",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome"
  );
  // Instalaciones de Playwright (entornos de desarrollo).
  for (const base of [env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), ".cache", "ms-playwright")]) {
    if (!base || !existsSync(base)) continue;
    let entries = [];
    try { entries = readdirSync(base).sort().reverse(); } catch { entries = []; }
    for (const e of entries) {
      if (e.startsWith("chromium_headless_shell-")) candidates.push(path.join(base, e, "chrome-linux", "headless_shell"));
    }
    for (const e of entries) {
      if (/^chromium-\d+$/.test(e)) candidates.push(path.join(base, e, "chrome-linux", "chrome"));
    }
  }
  return [...new Set(candidates.filter((c) => c && existsSync(c)))];
}

function chromiumArgs({ proxyPort, userDataDir, lowMemory }) {
  // En un servidor con poca memoria (512 MB) varios procesos de Chromium no
  // caben. Con un solo proceso el navegador usa bastante menos; a cambio, si
  // una página lo tumba se cae entero, y por eso el lector lo vuelve a arrancar.
  const memoryFlags = lowMemory ? ["--single-process", "--no-zygote"] : ["--renderer-process-limit=2"];
  return [
    ...memoryFlags,
    "--headless",
    // Dentro de un contenedor el aislamiento propio de Chromium no puede
    // activarse. El aislamiento lo da el contenedor; por eso además el tráfico
    // pasa por el proxy de salida y la app no guarda secretos.
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-sync",
    "--disable-client-side-phishing-detection",
    "--disable-domain-reliability",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "--mute-audio",
    "--hide-scrollbars",
    "--blink-settings=imagesEnabled=false",
    "--disable-features=Translate,MediaRouter,OptimizationHints,BackForwardCache,IsolateOrigins,site-per-process",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    // Nada debe salir por fuera del proxy: sin QUIC (UDP) ni resolución anticipada de nombres.
    "--disable-quic",
    "--dns-prefetch-disable",
    // Una página no puede abrir ventanas nuevas (se quedarían abiertas consumiendo memoria).
    "--block-new-web-contents",
    "--disable-breakpad",
    "--js-flags=--max-old-space-size=256",
    "--window-size=1280,900",
    `--proxy-server=http://127.0.0.1:${proxyPort}`,
    // Sin esto Chromium se salta el proxy para localhost: todo debe pasar por él.
    "--proxy-bypass-list=<-loopback>",
    `--user-data-dir=${userDataDir}`,
  ];
}

// Cuenta el texto visible del árbol YA COMPUESTO (incluye shadow DOM abierto),
// fuera de menús, cabecera y pie. Se usa para saber cuándo terminó de cargar.
const MEASURE_SCRIPT = `(() => {
  const SKIP = { script:1, style:1, noscript:1, template:1, svg:1, nav:1, header:1, footer:1, iframe:1, canvas:1, link:1, meta:1 };
  let chars = 0, nodes = 0;
  const walk = (node) => {
    if (chars > 20000 || nodes > 80000) return;
    nodes++;
    if (node.nodeType === 3) { const t = node.nodeValue.trim(); if (t) chars += t.length; return; }
    if (node.nodeType !== 1) return;
    const name = node.localName;
    if (SKIP[name]) return;
    if (name === "slot") {
      const assigned = node.assignedNodes({ flatten: true });
      for (const k of (assigned.length ? assigned : node.childNodes)) walk(k);
      return;
    }
    const kids = node.shadowRoot ? node.shadowRoot.childNodes : node.childNodes;
    for (const k of kids) { if (chars > 20000 || nodes > 80000) return; walk(k); }
  };
  if (document.body) walk(document.body);
  return { chars, nodes, ready: document.readyState };
})()`;

// Convierte el árbol compuesto a HTML simple: el contenido de los shadow roots
// abiertos se escribe en su sitio y cada <slot> se reemplaza por lo que muestra.
// Solo se conservan los atributos que el extractor usa.
const SERIALIZE_SCRIPT = `(() => {
  const SKIP = { script:1, style:1, noscript:1, template:1, svg:1, canvas:1, link:1, meta:1, video:1, audio:1, object:1, embed:1, img:1, picture:1, source:1 };
  const VOID = { br:1, hr:1, input:1, wbr:1 };
  const KEEP = { id:1, role:1, "aria-label":1, colspan:1, rowspan:1, datetime:1, title:1, lang:1, name:1, "data-playground":1 };
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escAttr = (s) => esc(String(s)).replace(/"/g, "&quot;");
  let budget = ${MAX_HTML_CHARS};
  const ser = (node) => {
    if (budget <= 0) return "";
    // Todo lo que la página controla se recorta: un solo nodo de texto o un
    // atributo gigante no pueden saltarse el presupuesto.
    if (node.nodeType === 3) { const t = esc(String(node.nodeValue).slice(0, budget)); budget -= t.length; return t; }
    if (node.nodeType !== 1) return "";
    const name = String(node.localName).slice(0, 60);
    if (SKIP[name]) return "";
    if (name === "slot") {
      const assigned = node.assignedNodes({ flatten: true });
      let out = "";
      for (const k of (assigned.length ? assigned : node.childNodes)) { if (budget <= 0) break; out += ser(k); }
      return out;
    }
    const cut = (v) => String(v).slice(0, 2000);
    let attrs = "";
    for (const a of node.attributes) if (KEEP[a.name]) attrs += " " + a.name + '="' + escAttr(cut(a.value)) + '"';
    if ((name === "a" || name === "area") && node.href) attrs += ' href="' + escAttr(cut(node.href)) + '"';
    if (name === "iframe") { const src = cut(node.src || ""); budget -= src.length + 30; return '<iframe src="' + escAttr(src) + '"></iframe>'; }
    budget -= name.length * 2 + attrs.length + 5;
    if (VOID[name]) return "<" + name + attrs + ">";
    const kids = node.shadowRoot ? node.shadowRoot.childNodes : node.childNodes;
    let inner = "";
    for (const k of kids) { if (budget <= 0) break; inner += ser(k); }
    return "<" + name + attrs + ">" + inner + "</" + name + ">";
  };
  const body = document.body ? ser(document.body) : "<body></body>";
  return {
    html: "<!doctype html><html><head><title>" + esc(String(document.title || "").slice(0, 300)) + "</title></head>" + body + "</html>",
    url: String(location.href).slice(0, 2000),
    truncated: budget <= 0,
  };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * createRenderer(options) -> { available, render(url, opts), close(), info() }
 * resolveHost / allowedPorts se pasan al proxy de salida (ver egressProxy.js).
 */
export function createRenderer({
  executablePath = undefined,
  executablePaths = undefined,
  resolveHost = undefined,
  allowedPorts = undefined,
  maxPagesPerBrowser = 15,
  idleCloseMs = 15000,
  launchTimeoutMs = 30000,
  // BROWSER_LOW_MEMORY=0 vuelve al modo de varios procesos (más estable, más memoria).
  lowMemory = process.env.BROWSER_LOW_MEMORY !== "0",
} = {}) {
  // Formas de arrancar, de la más liviana a la más estable. Si una no arranca o
  // se cae, se pasa a la siguiente y no se vuelve atrás: cada servidor tiene un
  // Chromium distinto y no todos aceptan el modo de un solo proceso.
  const paths = executablePath !== undefined
    ? (executablePath ? [executablePath] : [])
    : (executablePaths || findChromiumCandidates());
  const attempts = [];
  for (const p of paths) {
    if (lowMemory) attempts.push({ path: p, low: true });
    attempts.push({ path: p, low: false });
  }
  const state = {
    browser: null, proxy: null, userDataDir: null, pagesOnBrowser: 0, attempt: 0,
    launches: 0, pages: 0, failures: 0, lastError: null, broken: null, idleTimer: null,
    launchTimeouts: 0, lastUse: 0,
  };
  // Si el proceso de Node termina, el navegador no debe quedar huérfano.
  process.once("exit", () => { if (state.browser) state.browser.kill(); });
  const current = () => attempts[state.attempt] || null;
  let chain = Promise.resolve();

  async function shutdownBrowser() {
    clearTimeout(state.idleTimer);
    const { browser, proxy, userDataDir } = state;
    state.browser = null;
    state.proxy = null;
    state.userDataDir = null;
    state.pagesOnBrowser = 0;
    if (browser) await browser.close().catch(() => {});
    if (proxy) await proxy.close().catch(() => {});
    if (userDataDir) {
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* se limpia con el contenedor */ }
    }
  }

  async function ensureBrowser(deadline) {
    if (state.browser && !state.browser.closed && state.pagesOnBrowser < maxPagesPerBrowser) return state.browser;
    await shutdownBrowser();
    const errors = [];
    while (current()) {
      const { path: exe, low } = current();
      const proxyOpts = {};
      if (resolveHost !== undefined) proxyOpts.resolveHost = resolveHost;
      if (allowedPorts !== undefined) proxyOpts.allowedPorts = allowedPorts;
      state.proxy = await startEgressProxy(proxyOpts);
      state.userDataDir = mkdtempSync(path.join(os.tmpdir(), "agentic-ds-browser-"));
      state.launches++;
      const browser = launchChromium(exe, chromiumArgs({ proxyPort: state.proxy.port, userDataDir: state.userDataDir, lowMemory: low }));
      state.browser = browser;
      // El arranque nunca espera más allá del límite de la evaluación.
      const wait = Math.max(5000, Math.min(launchTimeoutMs, deadline - Date.now()));
      try {
        await browser.send("Browser.getVersion", {}, undefined, wait);
        await browser.send("Browser.setDownloadBehavior", { behavior: "deny" }, undefined, 5000).catch(() => {});
        state.launchTimeouts = 0;
        return browser;
      } catch (err) {
        const exited = browser.closed;
        const note = `[${path.basename(exe)}${low ? " 1-proceso" : ""}] ${err.message} ${browser.stderrTail || ""}`.trim().slice(0, 400);
        errors.push(note);
        await shutdownBrowser();
        if (exited) {
          state.attempt++; // esta forma no arranca en este servidor: se prueba la siguiente
          continue;
        }
        // No respondió a tiempo pero tampoco se cerró: el servidor está lento, no
        // roto. No se cambia de modo (el otro es más pesado); a la segunda vez
        // seguida se da por no disponible para no gastar el tiempo de todos.
        state.launchTimeouts++;
        if (state.launchTimeouts >= 2) throw new Error(`BROWSER_LAUNCH_FAILED: no arrancó a tiempo. ${note}`);
        throw new Error(`BROWSER_SLOW_START: ${note}`);
      }
    }
    throw new Error(`BROWSER_LAUNCH_FAILED: ${errors.join(" | ").slice(0, 900) || "no hay Chromium instalado"}`);
  }

  async function renderOnce(url, { timeoutMs, minText, settleMs, deadline }) {
    const browser = await ensureBrowser(deadline);
    // El tiempo de la página empieza a contar con el navegador ya arrancado.
    const startedAt = Date.now();
    const hardDeadline = Math.min(startedAt + timeoutMs, deadline);
    if (hardDeadline - startedAt < 3000) throw new Error("TIME_LIMIT");
    const left = () => Math.max(500, hardDeadline - Date.now());
    state.pagesOnBrowser++;

    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" }, undefined, left());
    let sessionId = null;
    let crashed = false;
    const documentStatus = new Map(); // frameId -> último código HTTP del documento
    const off = browser.on((msg) => {
      if (msg.method === "Inspector.targetCrashed" && msg.sessionId === sessionId) crashed = true;
      if (msg.method === "Network.responseReceived" && msg.sessionId === sessionId && msg.params.type === "Document") {
        documentStatus.set(msg.params.frameId, msg.params.response.status);
      }
      if (msg.method === "Page.javascriptDialogOpening" && msg.sessionId === sessionId) {
        browser.send("Page.handleJavaScriptDialog", { accept: false }, sessionId, 3000).catch(() => {});
      }
    });
    try {
      ({ sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true }, undefined, left()));
      const cmd = (method, params = {}) => browser.send(method, params, sessionId, left());
      await cmd("Page.enable");
      await cmd("Network.enable");
      await cmd("Network.setBlockedURLs", { urls: BLOCKED_URL_PATTERNS });
      await cmd("Network.setBypassServiceWorker", { bypass: true });
      await cmd("Emulation.setUserAgentOverride", { userAgent: USER_AGENT });

      const nav = await cmd("Page.navigate", { url });
      if (nav.errorText) throw new Error(`NAVIGATION_FAILED: ${nav.errorText}`);

      // Espera a que el contenido deje de cambiar: mismo conteo en tres lecturas
      // seguidas con la página ya cargada. Si nunca llega al mínimo, se devuelve
      // lo que haya (quien llama decide si alcanza).
      let last = null;
      let stable = 0;
      let loadedAt = null;
      let measure = { chars: 0, nodes: 0, ready: "loading" };
      while (Date.now() < hardDeadline - POLL_MS) {
        if (crashed) throw new Error("PAGE_CRASHED");
        await sleep(POLL_MS);
        const out = await cmd("Runtime.evaluate", { expression: MEASURE_SCRIPT, returnByValue: true });
        if (out.exceptionDetails || !out.result || !out.result.value) continue;
        measure = out.result.value;
        if (measure.ready === "complete" && loadedAt === null) loadedAt = Date.now();
        const key = `${measure.chars}:${measure.nodes}`;
        stable = key === last ? stable + 1 : 0;
        last = key;
        if (loadedAt !== null && stable >= 2 && measure.chars >= minText) break;
        if (loadedAt !== null && Date.now() - loadedAt > settleMs && stable >= 2) break; // cargó y no hay más que esperar
      }

      const out = await cmd("Runtime.evaluate", { expression: SERIALIZE_SCRIPT, returnByValue: true });
      if (out.exceptionDetails || !out.result || !out.result.value) throw new Error("SERIALIZE_FAILED");
      const { html, url: finalUrl, truncated } = out.result.value;
      // Página de error del propio navegador (sitio caído, o bloqueado por el proxy).
      if (/^chrome-error:/.test(finalUrl || "")) throw new Error("NAVIGATION_FAILED: error page");
      // Solo se acepta contenido de una dirección web. Si la página terminó en
      // file:, chrome:, blob: o data:, se descarta.
      if (!/^https?:\/\//i.test(finalUrl || "")) throw new Error("NAVIGATION_FAILED: non-web final address");
      const status = documentStatus.get(nav.frameId);
      if (status && status >= 400) throw new Error(`NAVIGATION_FAILED: HTTP ${status}`);
      return { ok: true, body: html, finalUrl, textLength: measure.chars, truncated: !!truncated, ms: Date.now() - startedAt };
    } finally {
      off();
      browser.send("Target.closeTarget", { targetId }, undefined, 3000).catch(() => {});
    }
  }

  async function doRender(url, { timeoutMs = 20000, minText = 200, settleMs = 6000, deadline = Infinity } = {}, isRetry = false) {
    clearTimeout(state.idleTimer);
    state.lastUse = Date.now();
    if (!attempts.length) return { ok: false, error: "BROWSER_UNAVAILABLE" };
    if (state.broken) return { ok: false, error: "BROWSER_UNAVAILABLE", detail: state.broken };
    if (!/^https?:\/\//i.test(String(url))) return { ok: false, error: "RENDER_FAILED", detail: "only http(s) addresses" };
    if (deadline - Date.now() < 3000) return { ok: false, error: "TIME_LIMIT" };
    try {
      const result = await renderOnce(url, { timeoutMs, minText, settleMs, deadline });
      state.pages++;
      // Si a pesar de todo quedaron ventanas abiertas, se reinicia el navegador.
      const targets = await state.browser.send("Target.getTargets", {}, undefined, 3000).catch(() => null);
      if (targets && (targets.targetInfos || []).filter((t) => t.type === "page").length > 3) await shutdownBrowser();
      return result;
    } catch (err) {
      const message = String(err.message || err);
      if (message === "TIME_LIMIT") return { ok: false, error: "TIME_LIMIT" };
      // El navegador se cayó en modo de un solo proceso: se pasa al modo estable
      // y se reintenta esta misma página una vez.
      const died = /BROWSER_EXITED|BROWSER_CLOSED|BROWSER_WRITE_FAILED|MESSAGE_TOO_LARGE/.test(message);
      if (died && !isRetry && current() && current().low && attempts[state.attempt + 1]) {
        state.attempt++;
        state.lastError = `cambio a modo estable: ${message.slice(0, 200)}`;
        await shutdownBrowser();
        return doRender(url, { timeoutMs, minText, settleMs, deadline }, true);
      }
      state.failures++;
      state.lastError = message.slice(0, 600);
      if (/^BROWSER_LAUNCH_FAILED|BROWSER_SPAWN_FAILED/.test(state.lastError)) {
        // Si el navegador no arranca, no tiene sentido reintentarlo por cada página.
        state.broken = state.lastError;
        return { ok: false, error: "BROWSER_UNAVAILABLE", detail: state.lastError };
      }
      const timeout = /CDP_TIMEOUT|BROWSER_SLOW_START/.test(state.lastError);
      // Una página que cuelga o tumba el navegador lo deja inservible para la
      // siguiente: se cierra y la próxima página arranca uno limpio.
      if (timeout || died || /PAGE_CRASHED/.test(state.lastError) || (state.browser && state.browser.closed)) await shutdownBrowser();
      return { ok: false, error: timeout ? "RENDER_TIMEOUT" : "RENDER_FAILED", detail: state.lastError };
    } finally {
      state.lastUse = Date.now();
      clearTimeout(state.idleTimer);
      // El cierre por inactividad pasa por la misma cola que las páginas, para
      // no cerrar el navegador mientras otra evaluación lo está usando.
      state.idleTimer = setTimeout(() => {
        const p = chain.then(() => (Date.now() - state.lastUse >= idleCloseMs - 100 ? shutdownBrowser() : null));
        chain = p.catch(() => {});
      }, idleCloseMs);
      state.idleTimer.unref();
    }
  }

  return {
    get available() { return attempts.length > 0 && !state.broken; },
    get executablePath() { return current() ? current().path : null; },
    // Una página a la vez: cada llamada espera a que termine la anterior.
    render(url, opts) {
      const p = chain.then(() => doRender(url, opts));
      chain = p.catch(() => {});
      return p;
    },
    close: () => { const p = chain.then(() => shutdownBrowser()); chain = p.catch(() => {}); return p; },
    info: () => ({
      available: attempts.length > 0 && !state.broken,
      executable: current() ? `${path.basename(current().path)}${current().low ? " (1 proceso)" : ""}` : null,
      launches: state.launches, pages: state.pages, failures: state.failures,
      last_error: state.lastError,
      proxy: state.proxy ? { ...state.proxy.stats } : null,
    }),
  };
}
