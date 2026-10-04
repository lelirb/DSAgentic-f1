// Revisión final de seguridad y estabilidad del navegador (2026-10-03).
// Una prueba por cada punto de la lista pedida antes de publicar:
//   1 página HTML normal            6 URL localhost
//   2 página que requiere JavaScript 7 IP privada
//   3 página que hace timeout        8 redirección de pública a privada
//   4 página mal formada             9 fallo/crash del navegador
//   5 redirección                   10 cierre correcto del proceso
// Las que usan un navegador real se saltan si la máquina no tiene Chromium.
// Correr con: npm test
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRenderer, findChromium } from "../engine/src/crawler/renderer.js";
import { browserEnv } from "../engine/src/crawler/browser/cdp.js";
import { startEgressProxy } from "../engine/src/crawler/browser/egressProxy.js";
import { resolvePublicAddress, assertPublicHost } from "../engine/src/crawler/ssrfGuard.js";
import { crawl } from "../engine/src/crawler/crawl.js";
import { evaluateUrl } from "../engine/src/pipeline.js";
import { extractSections, restrictionsFrom, extractTables } from "../engine/src/extractor/readPage.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const weights = JSON.parse(readFileSync(path.join(ROOT, "engine/config/weights.json"), "utf-8"));
const rules = JSON.parse(readFileSync(path.join(ROOT, "engine/config/rules.json"), "utf-8"));
const chromium = findChromium();
const skip = chromium ? false : "no hay Chromium instalado en esta máquina";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const LONG = "This guidance explains how the component behaves inside the design system, which decisions the team already made, and which alternatives exist for nearby cases so nobody has to guess.";

const renderers = [];
after(async () => { for (const r of renderers) await r.close(); });
const track = (r) => { renderers.push(r); return r; };
// Regla parecida a la de producción: "ds.test" y "otro.test" hacen de sitios
// públicos; todo lo demás pasa por la validación real, que rechaza direcciones internas.
const prodLike = async (host) => (host === "ds.test" || host === "otro.test" ? { address: "127.0.0.1" } : resolvePublicAddress(host));
const newRenderer = (extra = {}) => track(createRenderer({ executablePath: chromium, resolveHost: prodLike, allowedPorts: null, ...extra }));

function startSite(handler) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    hits.push(u.pathname);
    handler(u, res, req);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, hits, port: server.address().port, close: () => { server.closeAllConnections?.(); server.close(); } })));
}
const html = (res, body, head = "") => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(`<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`); };
const SHELL_APP = (content) => `<noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div><script>setTimeout(() => { document.getElementById("root").innerHTML = ${JSON.stringify(content)}; }, 150)</script>`;

// ---------- 1. página HTML normal ----------
test("1. página HTML normal: se lee sin arrancar el navegador", { skip, timeout: 60000 }, async () => {
  const site = await startSite((u, res) => {
    if (u.pathname === "/sitemap.xml") { res.writeHead(404); return res.end(); }
    html(res, `<nav><a href="/components/button/usage">Button</a></nav><main><h1>Button</h1><p>Buttons trigger an action. ${LONG}</p><h2>When to use</h2><p>Use a button to submit a form.</p></main>`);
  });
  const renderer = newRenderer();
  try {
    const { crawlResult } = await evaluateUrl(`http://127.0.0.1:${site.port}/components/button/usage`, { weights, rules, ssrfCheck: null, crawlOptions: { renderer, max_pages: 3 } });
    assert.equal(crawlResult.render.used, false);
    assert.equal(renderer.info().launches, 0, "el navegador no debe arrancar para páginas que ya traen su contenido");
    assert.equal(crawlResult.pages.some((p) => p.rendered), false);
  } finally { site.close(); }
});

// ---------- 2. página que requiere JavaScript ----------
test("2. página que requiere JavaScript: se carga con el navegador y se lee su contenido", { skip, timeout: 60000 }, async () => {
  const site = await startSite((u, res) => html(res, SHELL_APP(`<main><h1>Button</h1><p>Buttons trigger an action. ${LONG}</p><h2>When to use</h2><p>Use a button to submit a form.</p></main>`)));
  const renderer = newRenderer();
  try {
    const out = await renderer.render(`http://ds.test:${site.port}/components/button/usage`, { timeoutMs: 20000 });
    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
    assert.ok(out.body.includes("<h2>When to use</h2>"));
    assert.ok(!out.body.includes("enable JavaScript"), "el aviso de <noscript> no forma parte del contenido leído");
    assert.match(out.finalUrl, /^http:\/\/ds\.test/);
  } finally { site.close(); }
});

// ---------- 3. página que hace timeout ----------
test("3. timeout: una página que nunca responde o se queda colgada vuelve dentro del plazo", { skip, timeout: 90000 }, async () => {
  const site = await startSite((u, res) => {
    if (u.pathname === "/never") return; // el servidor no contesta nunca
    if (u.pathname === "/loop") return html(res, `<p>inicio</p><script>setTimeout(() => { for (;;) {} }, 100)</script>`);
    if (u.pathname === "/grow") return html(res, `<div id="r"></div><script>setInterval(() => { for (let i = 0; i < 200; i++) { const p = document.createElement("p"); p.textContent = "crece sin parar " + Math.random(); document.getElementById("r").appendChild(p); } }, 20)</script>`);
    html(res, `<main><h1>Ok</h1><p>${LONG} ${LONG}</p></main>`);
  });
  const renderer = newRenderer();
  let maxLag = 0, last = Date.now();
  const lagTimer = setInterval(() => { const n = Date.now(); maxLag = Math.max(maxLag, n - last - 100); last = n; }, 100);
  try {
    for (const p of ["/never", "/loop", "/grow"]) {
      const t0 = Date.now();
      const out = await renderer.render(`http://ds.test:${site.port}${p}`, { timeoutMs: 5000 });
      const ms = Date.now() - t0;
      assert.ok(ms < 12000, `${p} tardó ${ms} ms con un plazo de 5000`);
      if (p !== "/grow") assert.equal(out.ok, false, `${p}: ${JSON.stringify(out).slice(0, 200)}`);
      else if (out.ok) assert.ok(out.body.length < 1_700_000);
    }
    // El plazo global de la evaluación también manda: con el tiempo agotado no se abre nada.
    const late = await renderer.render(`http://ds.test:${site.port}/ok`, { timeoutMs: 5000, deadline: Date.now() + 1000 });
    assert.deepEqual(late, { ok: false, error: "TIME_LIMIT" });
    // Una página problemática no deja inservible a la siguiente.
    const next = await renderer.render(`http://ds.test:${site.port}/ok`, { timeoutMs: 15000 });
    assert.equal(next.ok, true, JSON.stringify(next).slice(0, 300));
    // ...ni congela el proceso principal mientras tanto.
    assert.ok(maxLag < 1000, `el proceso principal se pausó ${maxLag} ms`);
  } finally { clearInterval(lagTimer); site.close(); }
});

// ---------- 4. página mal formada ----------
test("4. página mal formada: HTML roto y enorme se lee sin bloquear", { skip, timeout: 60000 }, async () => {
  const junk = "<p>".repeat(60000) + "<div <span <<< <table><tr><td>";
  const site = await startSite((u, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<html><body><div id="root"></div>${junk}<script>document.getElementById("root").innerHTML = "<main><h1>Button</h1><p>${LONG}</p><h2>When to use</h2><p>Use it. Don't use it for navigation.</p></main>"</script>`);
  });
  const renderer = newRenderer();
  try {
    const out = await renderer.render(`http://ds.test:${site.port}/roto`, { timeoutMs: 20000 });
    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
    // Lo que devuelve el navegador se procesa en tiempo acotado.
    const t0 = Date.now();
    const sections = extractSections(out.body);
    restrictionsFrom(out.body);
    extractTables(out.body);
    assert.ok(Date.now() - t0 < 1500, `procesar el HTML tardó ${Date.now() - t0} ms`);
    assert.ok(sections.some((s) => s.title === "When to use"));
  } finally { site.close(); }
});

// ---------- 5. redirección ----------
test("5. redirección: dentro del mismo sitio se sigue; hacia otro sitio se descarta", { skip, timeout: 90000 }, async () => {
  const content = `<main><h1>Button</h1><p>${LONG} ${LONG}</p></main>`;
  const site = await startSite((u, res, req) => {
    if (u.pathname === "/viejo") { res.writeHead(302, { location: "/nuevo" }); return res.end(); }
    if (u.pathname === "/nuevo") return html(res, SHELL_APP(content));
    if (u.pathname === "/sitemap.xml" || u.pathname === "/robots.txt" || u.pathname === "/llms.txt") { res.writeHead(404); return res.end(); }
    if (u.pathname === "/components/button/usage" && /^ds\.test/.test(req.headers.host || "")) {
      // La página, al cargar, se va a otro sitio público.
      return html(res, `<script>location.href = "http://otro.test:${site.port}/components/button/usage"</script>`);
    }
    return html(res, SHELL_APP(content));
  });
  const renderer = newRenderer();
  try {
    const same = await renderer.render(`http://ds.test:${site.port}/viejo`, { timeoutMs: 20000 });
    assert.equal(same.ok, true, JSON.stringify(same).slice(0, 300));
    assert.equal(same.finalUrl, `http://ds.test:${site.port}/nuevo`);

    const fetchVia = (url) => fetch(url.replace("ds.test", "127.0.0.1"), { redirect: "manual", headers: { host: new URL(url).host } }).then((r) => Object.assign(r, { url }));
    const result = await crawl(`http://ds.test:${site.port}/components/button/usage`, { renderer, discovery: false, max_pages: 1 }, (url, opts) => fetch(url.replace("ds.test", "127.0.0.1"), { ...opts, headers: { ...(opts && opts.headers), host: new URL(url).host } }));
    assert.equal(result.render.rendered, 0, "el contenido de otro sitio no se acepta como si fuera de este");
    assert.ok(result.render.failed >= 1);
    assert.equal(result.pages[0].rendered, false);
    assert.equal(result.pages[0].render_problem, "REDIRECTED_OUTSIDE");
    void fetchVia;
  } finally { site.close(); }
});

// ---------- 6. URL localhost ----------
test("6. URL localhost: se rechaza en la entrada y dentro del navegador", { skip, timeout: 60000 }, async () => {
  const internal = await startSite((u, res) => res.end("SECRETO-INTERNO"));
  const renderer = track(createRenderer({ executablePath: chromium, allowedPorts: null })); // regla real de producción
  try {
    for (const host of ["localhost", "LOCALHOST", "localhost.", "app.localhost", "127.0.0.1", "[::1]"]) {
      await assert.rejects(assertPublicHost(`http://${host}:${internal.port}/`), /Blocked|Could not resolve/, host);
    }
    await assert.rejects(evaluateUrl(`http://localhost:${internal.port}/`, { weights, rules }), /Blocked/);
    for (const host of ["localhost", "127.0.0.1"]) {
      const out = await renderer.render(`http://${host}:${internal.port}/`, { timeoutMs: 10000 });
      assert.equal(out.ok, false, host);
      assert.ok(!String(out.body || "").includes("SECRETO-INTERNO"));
    }
    assert.deepEqual(internal.hits, [], "ninguna petición debe llegar al servicio local");
  } finally { internal.close(); }
});

// ---------- 7. IP privada ----------
test("7. IP privada: todos los rangos internos y sus formas alternativas quedan bloqueados", async () => {
  const blocked = [
    "127.0.0.1", "127.1", "0.0.0.0", "0", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.10",
    "169.254.169.254", "100.64.0.1", "[::1]", "[::]", "[fe80::1]", "[fd00::1]", "[::ffff:127.0.0.1]", "[::ffff:7f00:1]",
    "[64:ff9b::7f00:1]", "2130706433", "0x7f.0.0.1", "0177.0.0.1",
  ];
  for (const host of blocked) {
    await assert.rejects(resolvePublicAddress(host), /Blocked|Could not resolve/, `debería bloquear ${host}`);
  }
  // Un nombre público que resuelve a una dirección interna (p. ej. metadata.google.internal).
  const metadata = async () => [{ address: "169.254.169.254", family: 4 }];
  await assert.rejects(resolvePublicAddress("metadata.google.internal", { dnsLookup: metadata }), /private address/);
  // Mezcla de registro público y privado: basta uno privado para rechazar.
  const mixed = async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.7", family: 4 }];
  await assert.rejects(resolvePublicAddress("mezcla.test", { dnsLookup: mixed }), /private address/);
  // Las direcciones públicas sí pasan.
  assert.equal((await resolvePublicAddress("8.8.8.8")).address, "8.8.8.8");

  // El proxy del navegador aplica la misma regla, también para túneles HTTPS.
  const proxy = await startEgressProxy();
  const connect = (authority) => new Promise((resolve) => {
    const s = net.connect(proxy.port, "127.0.0.1", () => s.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
    let buf = "";
    s.on("data", (d) => { buf += d; if (buf.includes("\r\n\r\n")) { resolve(Number(/^HTTP\/1\.1 (\d+)/.exec(buf)?.[1])); s.destroy(); } });
    s.on("error", () => resolve(0));
  });
  try {
    for (const authority of ["10.0.0.1:443", "192.168.1.10:443", "172.16.0.1:443", "169.254.169.254:80", "0.0.0.0:443", "[fd00::1]:443", `127.0.0.1:${proxy.port}`]) {
      assert.equal(await connect(authority), 403, authority);
    }
  } finally { await proxy.close(); }
});

// ---------- 8. redirección de pública a privada ----------
test("8. redirección desde una URL pública hacia una IP privada: nunca llega", { skip, timeout: 120000 }, async () => {
  const internal = await startSite((u, res) => res.end("SECRETO-INTERNO"));
  const ip = internal.port;
  const site = await startSite((u, res) => {
    if (u.pathname === "/r302") { res.writeHead(302, { location: `http://127.0.0.1:${ip}/por-302` }); return res.end(); }
    if (u.pathname === "/r307") { res.writeHead(307, { location: `http://169.254.169.254/latest/meta-data/` }); return res.end(); }
    if (u.pathname === "/rjs") return html(res, `<p>${LONG} ${LONG}</p><script>location.href = "http://127.0.0.1:${ip}/por-js"</script>`);
    if (u.pathname === "/rmeta") return html(res, `<p>${LONG} ${LONG}</p>`, `<meta http-equiv="refresh" content="0;url=http://localhost:${ip}/por-meta">`);
    if (u.pathname === "/sub") return html(res, `<p id="o">${LONG} ${LONG}</p><img src="http://127.0.0.1:${ip}/img"><iframe src="http://localhost:${ip}/frame"></iframe>
      <script>fetch("http://127.0.0.1:${ip}/fetch", { mode: "no-cors" }).catch(() => {}); fetch("http://[::1]:${ip}/v6", { mode: "no-cors" }).catch(() => {});
      try { new WebSocket("ws://127.0.0.1:${ip}/ws"); } catch (e) {}
      try { const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:127.0.0.1:${ip}" }] }); pc.createDataChannel("x"); pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => {}); } catch (e) {}
      fetch("file:///etc/passwd").then((r) => r.text()).then((t) => document.body.append(t)).catch(() => {});</script><iframe src="file:///etc/passwd"></iframe>`);
    res.writeHead(404); res.end();
  });
  const renderer = newRenderer();
  try {
    for (const p of ["/r302", "/r307", "/rjs", "/rmeta"]) {
      const out = await renderer.render(`http://ds.test:${site.port}${p}`, { timeoutMs: 8000 });
      assert.ok(!String(out.body || "").includes("SECRETO-INTERNO"), p);
      if (out.ok) assert.match(out.finalUrl, /^http:\/\/ds\.test/, `${p} terminó en ${out.finalUrl}`);
    }
    const sub = await renderer.render(`http://ds.test:${site.port}/sub`, { timeoutMs: 10000 });
    assert.equal(sub.ok, true, JSON.stringify(sub).slice(0, 300));
    assert.ok(!sub.body.includes("SECRETO-INTERNO"));
    assert.ok(!sub.body.includes("root:"), "no debe aparecer contenido de archivos locales");
    await sleep(500);
    assert.deepEqual(internal.hits, [], "ninguna petición (redirección, fetch, iframe, imagen, WebSocket) debe llegar al servicio interno");
    assert.ok(renderer.info().proxy.blocked >= 4, JSON.stringify(renderer.info().proxy));
  } finally { site.close(); internal.close(); }
});

// ---------- 9. fallo/crash del navegador ----------
test("9. crash del navegador: si muere a mitad de una página, se recupera", { skip, timeout: 120000 }, async () => {
  const site = await startSite((u, res) => {
    if (u.pathname === "/lenta") return setTimeout(() => html(res, `<main><h1>Lenta</h1><p>${LONG} ${LONG}</p></main>`), 2500);
    html(res, `<main><h1>Ok</h1><p>${LONG} ${LONG}</p></main>`);
  });
  const renderer = newRenderer();
  try {
    assert.equal((await renderer.render(`http://ds.test:${site.port}/a`, { timeoutMs: 15000 })).ok, true);
    const pid = renderer.info().pid;
    assert.ok(pid && alive(pid));
    const pending = renderer.render(`http://ds.test:${site.port}/lenta`, { timeoutMs: 20000 });
    await sleep(800);
    process.kill(pid, "SIGKILL"); // el navegador se cae (o el sistema lo mata por memoria)
    const out = await pending;
    assert.equal(out.ok, true, `debe reintentar con un navegador nuevo: ${JSON.stringify(out).slice(0, 300)}`);
    assert.notEqual(renderer.info().pid, pid);
    assert.equal((await renderer.render(`http://ds.test:${site.port}/b`, { timeoutMs: 15000 })).ok, true);
    assert.equal(renderer.available, true);
  } finally { site.close(); }
});

// ---------- 10. cierre correcto del proceso ----------
test("10. cierre: no quedan procesos, carpetas temporales ni puertos abiertos", { skip, timeout: 120000 }, async () => {
  const site = await startSite((u, res) => html(res, `<main><h1>Ok</h1><p>${LONG} ${LONG}</p></main>`));
  const tmpBefore = new Set(readdirSync(os.tmpdir()).filter((n) => n.startsWith("agentic-ds-browser-")));
  for (const lowMemory of [true, false]) {
    const renderer = track(createRenderer({ executablePath: chromium, resolveHost: prodLike, allowedPorts: null, lowMemory }));
    assert.equal((await renderer.render(`http://ds.test:${site.port}/`, { timeoutMs: 20000 })).ok, true);
    const pid = renderer.info().pid;
    // Procesos vivos del grupo del navegador. Los "zombis" (estado Z) ya
    // terminaron y solo esperan a que el sistema los retire: no cuentan.
    const group = () => {
      try {
        return execSync(`ps -o stat= -g ${pid} 2>/dev/null || true`).toString().split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("Z")).length;
      } catch { return 0; }
    };
    assert.ok(alive(pid) && group() >= 1);
    await renderer.close();
    let left = group();
    for (let i = 0; i < 20 && left > 0; i++) { await sleep(150); left = group(); }
    assert.equal(left, 0, "no deben quedar procesos del navegador en ejecución");
    assert.equal(renderer.info().proxy, null, "el proxy de salida se cierra con el navegador");
  }
  const tmpAfter = readdirSync(os.tmpdir()).filter((n) => n.startsWith("agentic-ds-browser-") && !tmpBefore.has(n));
  assert.deepEqual(tmpAfter, [], "las carpetas temporales del navegador se borran");

  // Cierre por inactividad.
  const idle = track(createRenderer({ executablePath: chromium, resolveHost: prodLike, allowedPorts: null, idleCloseMs: 600 }));
  assert.equal((await idle.render(`http://ds.test:${site.port}/`, { timeoutMs: 20000 })).ok, true);
  const idlePid = idle.info().pid;
  await sleep(2000);
  assert.equal(alive(idlePid), false, "sin uso, el navegador se cierra solo");

  // Si el servidor muere de golpe, el navegador no queda huérfano.
  for (const signal of ["SIGKILL", "SIGTERM"]) {
    const child = spawn(process.execPath, [path.join(HERE, "helpers", "browser-child.mjs")], { stdio: ["ignore", "pipe", "inherit"] });
    const info = await new Promise((resolve) => child.stdout.once("data", (d) => resolve(JSON.parse(String(d)))));
    assert.equal(info.ok, true);
    assert.ok(alive(info.pid));
    child.kill(signal);
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) { await sleep(150); gone = !alive(info.pid); }
    assert.equal(gone, true, `tras ${signal} al servidor, el navegador debe terminar`);
  }
  site.close();
});

// ---------- aislamiento ----------
test("aislamiento: el navegador no hereda el entorno del servidor", () => {
  const env = browserEnv("/tmp/perfil", { PATH: "/usr/bin", HOME: "/home/node", RENDER_API_KEY: "secreto", DATABASE_URL: "postgres://x", RENDER: "true", TZ: "UTC" });
  assert.deepEqual(Object.keys(env).sort(), ["HOME", "LANG", "PATH", "TZ"]);
  assert.equal(env.HOME, "/tmp/perfil");
  // La dirección de la página nunca viaja como argumento del proceso: va por el canal de control.
  const src = readFileSync(path.join(ROOT, "engine/src/crawler/renderer.js"), "utf-8");
  assert.ok(/"--remote-debugging-pipe"|remote-debugging-pipe/.test(readFileSync(path.join(ROOT, "engine/src/crawler/browser/cdp.js"), "utf-8")));
  assert.ok(!/--remote-debugging-port/.test(src), "no se abre un puerto de depuración");
  assert.ok(!/--disable-web-security/.test(src));
  assert.ok(existsSync(path.join(ROOT, "Dockerfile")) && /\nUSER node\n/.test(readFileSync(path.join(ROOT, "Dockerfile"), "utf-8")), "el contenedor no corre como administrador");
});
