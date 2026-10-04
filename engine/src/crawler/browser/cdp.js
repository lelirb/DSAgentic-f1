// Cliente mínimo del protocolo de depuración de Chromium (CDP), sin dependencias.
//
// Por qué a mano: el proyecto no tiene dependencias externas y controlar un
// navegador necesita muy pocas órdenes (abrir pestaña, navegar, ejecutar un
// script, cerrar). Se usa `--remote-debugging-pipe`: los mensajes van por dos
// descriptores de archivo del proceso hijo, no por un puerto de red. Así ninguna
// página puede intentar conectarse al puerto de depuración del navegador.
import { spawn } from "node:child_process";

const NUL = 0;
// Un mensaje del navegador nunca debería acercarse a esto. Si una página logra
// provocar uno más grande (por ejemplo, un alert() con un texto enorme), se
// cierra el navegador en vez de acumularlo en memoria.
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

// Variables de entorno que el navegador sí necesita. No hereda el resto del
// entorno del servidor: el código de una página ajena corre dentro de ese
// proceso y no tiene por qué poder ver la configuración de la app.
const PASSED_ENV = ["PATH", "TMPDIR", "TZ", "LD_LIBRARY_PATH", "FONTCONFIG_PATH", "FONTCONFIG_FILE"];

export function browserEnv(home, source = process.env) {
  const env = { LANG: "en_US.UTF-8" };
  for (const key of PASSED_ENV) if (source[key]) env[key] = source[key];
  if (home) env.HOME = home; // su carpeta temporal, no la del usuario del servidor
  return env;
}

export function launchChromium(executable, args, { commandTimeoutMs = 30000, home = null, inheritEnv = false } = {}) {
  const child = spawn(executable, [...args, "--remote-debugging-pipe"], {
    // 0 stdin, 1 stdout, 2 stderr, 3 órdenes hacia el navegador, 4 respuestas.
    stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
    env: inheritEnv ? { ...process.env, LANG: "en_US.UTF-8" } : browserEnv(home),
    // Grupo de procesos propio: al cerrar se termina el grupo entero, para que
    // no queden procesos auxiliares de Chromium (renderizadores, utilidades).
    detached: true,
  });
  const killGroup = () => {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* el grupo ya no existe */ }
    try { child.kill("SIGKILL"); } catch { /* ya terminó */ }
  };
  const toBrowser = child.stdio[3];
  const fromBrowser = child.stdio[4];

  let nextId = 1;
  let closed = false;
  let exitInfo = null;
  let stderrTail = "";
  const pending = new Map();
  const listeners = new Set();
  let chunks = [];
  let chunkBytes = 0;

  const failAll = (reason) => {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    pending.clear();
  };

  child.stderr.on("data", (d) => {
    stderrTail = (stderrTail + d.toString("utf-8")).slice(-2000);
  });
  child.on("error", (err) => {
    closed = true;
    exitInfo = { error: err.message };
    failAll(`BROWSER_SPAWN_FAILED: ${err.message}`);
  });
  child.on("exit", (code, signal) => {
    closed = true;
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* sin auxiliares vivos */ }
    exitInfo = { code, signal };
    failAll(`BROWSER_EXITED (code ${code}, signal ${signal})`);
    for (const l of listeners) {
      try { l({ method: "__exit", params: { code, signal } }); } catch { /* el oyente no debe tumbar el proceso */ }
    }
  });
  toBrowser.on("error", () => {});
  fromBrowser.on("error", () => {});

  const onMessage = (text) => {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(`CDP ${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result || {});
      return;
    }
    if (msg.method) {
      for (const l of listeners) {
        try { l(msg); } catch { /* idem */ }
      }
    }
  };

  // Los mensajes llegan separados por un byte 0. Se acumulan los trozos como
  // Buffer (no como texto) para no partir un carácter UTF-8 por la mitad.
  fromBrowser.on("data", (chunk) => {
    let start = 0;
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] !== NUL) continue;
      chunks.push(chunk.subarray(start, i));
      onMessage(Buffer.concat(chunks).toString("utf-8"));
      chunks = [];
      chunkBytes = 0;
      start = i + 1;
    }
    if (start < chunk.length) {
      chunks.push(chunk.subarray(start));
      chunkBytes += chunk.length - start;
      if (chunkBytes > MAX_MESSAGE_BYTES) {
        chunks = [];
        chunkBytes = 0;
        failAll("MESSAGE_TOO_LARGE");
        killGroup();
      }
    }
  });

  function send(method, params = {}, sessionId = undefined, timeoutMs = commandTimeoutMs) {
    if (closed) return Promise.reject(new Error("BROWSER_CLOSED"));
    const id = nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP_TIMEOUT ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer, method });
      try {
        toBrowser.write(JSON.stringify(payload) + "\0");
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(new Error(`BROWSER_WRITE_FAILED: ${err.message}`));
      }
    });
  }

  function on(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function close() {
    if (closed) return;
    try {
      await send("Browser.close", {}, undefined, 2000);
    } catch { /* si no responde, se mata abajo */ }
    await new Promise((r) => setTimeout(r, 200));
    // Siempre se termina el grupo: aunque el proceso principal ya haya salido,
    // puede quedar algún auxiliar.
    killGroup();
    closed = true;
  }

  return {
    send, on, close,
    kill: () => { killGroup(); closed = true; },
    get closed() { return closed; },
    get exitInfo() { return exitInfo; },
    get stderrTail() { return stderrTail; },
    pid: child.pid,
  };
}
