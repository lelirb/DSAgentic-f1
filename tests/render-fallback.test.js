// Lector con navegador: cuándo se usa, qué pasa si falla y cómo se refleja en la
// nota. Aquí el navegador es simulado (un objeto con `render`), así que estas
// pruebas no necesitan Chromium. La prueba con navegador real está en
// tests/browser-render.test.js.
// Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { crawl, needsBrowser } from "../engine/src/crawler/crawl.js";
import { evaluateUrl } from "../engine/src/pipeline.js";
import { startEgressProxy } from "../engine/src/crawler/browser/egressProxy.js";
import { resolvePublicAddress } from "../engine/src/crawler/ssrfGuard.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const weights = JSON.parse(readFileSync(path.join(ROOT, "engine/config/weights.json"), "utf-8"));
const rules = JSON.parse(readFileSync(path.join(ROOT, "engine/config/rules.json"), "utf-8"));

const O = "https://spa-ds.test";
const SHELL = `<!doctype html><html><head><title>DS</title></head><body><noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div><script src="/app.js"></script></body></html>`;
const LONG = "This guidance explains how the component behaves inside the design system, which decisions the team already made, and which alternatives exist for nearby cases so nobody has to guess. ";

// Lo que el navegador "vería" después de ejecutar el JavaScript de cada página.
const RENDERED = {
  [`${O}/`]: `<html><body><nav><a href="${O}/components/button/usage">Button</a><a href="${O}/components/modal/usage">Modal</a></nav><main><h1>Design System</h1><p>${LONG}${LONG}</p></main></body></html>`,
  [`${O}/components/button/usage`]: `<html><body><main><h1>Button</h1><p>Buttons trigger an action. ${LONG}</p><h2>When to use</h2><p>Use a button to submit a form. Don't use a button for navigation. Use a link instead of a button for navigation.</p><h2>Variants</h2><ul><li>Primary</li><li>Secondary</li></ul><h2>States</h2><p>Hover, focus and disabled.</p></main></body></html>`,
  [`${O}/components/modal/usage`]: `<html><body><main><h1>Modal</h1><p>Modals interrupt the flow to ask for a decision. ${LONG}</p><h2>When to use</h2><p>Use a modal for decisions that block the task.</p></main></body></html>`,
  [`${O}/foundations/tokens`]: `<html><body><main><h1>Tokens</h1><p>${LONG}</p><table><tr><th>Token</th><th>Value</th></tr><tr><td>$color-primary</td><td>#3d5afe</td></tr><tr><td>$space-200</td><td>8px</td></tr></table></main></body></html>`,
};
const SITEMAP = `<?xml version="1.0"?><urlset>${Object.keys(RENDERED).map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;

function fetchImpl(url) {
  const mk = (status, type, body) => ({ status, ok: status < 400, url, headers: { get: (k) => (k === "content-type" ? type : null) }, body: null, text: async () => body });
  if (url === `${O}/sitemap.xml`) return Promise.resolve(mk(200, "application/xml", SITEMAP));
  if (url in RENDERED) return Promise.resolve(mk(200, "text/html", SHELL));
  return Promise.resolve(mk(404, "text/html", "not found"));
}

function fakeRenderer({ available = true, result = null } = {}) {
  const calls = [];
  return {
    calls,
    available,
    render: async (url, opts) => {
      calls.push({ url, opts });
      if (result) return typeof result === "function" ? result(url, calls.length) : result;
      return RENDERED[url] ? { ok: true, body: RENDERED[url], finalUrl: url } : { ok: false, error: "RENDER_FAILED" };
    },
  };
}

test("needsBrowser: solo las páginas HTML sin contenido legible", () => {
  assert.equal(needsBrowser("text/html", SHELL), true);
  assert.equal(needsBrowser("text/html", RENDERED[`${O}/components/button/usage`]), false);
  assert.equal(needsBrowser("application/json", "{}"), false);
});

test("un sitio que depende de JavaScript se lee con el navegador y se evalúa", async () => {
  const renderer = fakeRenderer();
  const events = [];
  const { report, crawlResult } = await evaluateUrl(`${O}/`, {
    weights, rules, fetchImpl, ssrfCheck: null,
    crawlOptions: { renderer, on_progress: (e) => events.push(e.step) },
  });
  assert.ok(crawlResult.render.rendered >= 3, `abrió ${crawlResult.render.rendered} páginas`);
  assert.equal(crawlResult.render.unavailable, false);
  assert.ok(crawlResult.pages.some((p) => p.rendered), "las páginas abiertas con navegador quedan marcadas");

  // Con el contenido cargado, las dimensiones de contenido SÍ se evalúan.
  assert.equal(report.dimensions.D3.status !== "NOT_EVALUABLE", true, "D3 debe evaluarse");
  assert.ok(report.dimensions.D4.score > 0, "D4 debe encontrar cuándo usar el componente");
  assert.equal(report.overview.coverage.components_evaluated, 2);
  // Tokens leídos de la tabla de la página abierta con navegador.
  assert.equal(report.dimensions.D2.status !== "NOT_EVALUABLE", true);
  assert.ok(report.overview.coverage.tokens_detected >= 2);

  // D1 conserva la barrera: sin JavaScript no llega nada.
  const rec = report.dimensions.D1.sub_criteria.documentation_recoverability;
  assert.equal(rec.points, 0, "el contenido no está disponible sin JavaScript");

  // El avance avisa del navegador antes de terminar.
  assert.ok(events.includes("open") && events.includes("js_detected") && events.includes("render"));
  assert.ok(events.indexOf("js_detected") < events.indexOf("score"));
  assert.equal(events.at(-1), "score");
});

test("una página con contenido en su HTML nunca pasa por el navegador", async () => {
  const renderer = fakeRenderer();
  const direct = (url) => {
    const mk = (status, type, body) => ({ status, ok: status < 400, url, headers: { get: (k) => (k === "content-type" ? type : null) }, body: null, text: async () => body });
    if (url in RENDERED) return Promise.resolve(mk(200, "text/html", RENDERED[url]));
    if (url === `${O}/sitemap.xml`) return Promise.resolve(mk(200, "application/xml", SITEMAP));
    return Promise.resolve(mk(404, "text/html", "not found"));
  };
  const result = await crawl(`${O}/`, { renderer }, direct);
  assert.equal(renderer.calls.length, 0);
  assert.equal(result.render.used, false);
});

test("sin navegador disponible: las páginas quedan 'no se pudo leer', no en cero", async () => {
  const renderer = fakeRenderer({ available: false });
  const events = [];
  const { report, crawlResult } = await evaluateUrl(`${O}/`, {
    weights, rules, fetchImpl, ssrfCheck: null,
    crawlOptions: { renderer, discovery: true, on_progress: (e) => events.push(e.step) },
  });
  assert.equal(renderer.calls.length, 0);
  assert.equal(crawlResult.render.unavailable, true);
  assert.ok(events.includes("browser_unavailable"));
  assert.equal(report.dimensions.D3.status, "NOT_EVALUABLE");
  // D2: sus páginas llegaron vacías -> no evaluable (antes: "evaluado, 0").
  assert.equal(report.dimensions.D2.status, "NOT_EVALUABLE");
  assert.equal(report.dimensions.D2.score, null);
});

test("si el navegador se queda sin tiempo, el resultado se marca como limitado por tiempo", async () => {
  const renderer = fakeRenderer({ result: (url, n) => (n <= 1 ? { ok: true, body: RENDERED[url], finalUrl: url } : { ok: false, error: "TIME_LIMIT" }) });
  const result = await crawl(`${O}/`, { renderer, max_duration_ms: 60000 }, fetchImpl);
  assert.ok(result.render.skipped >= 1);
  assert.equal(result.stats.time_limited, true);
});

test("el límite de tiempo se amplía una sola vez cuando hace falta el navegador", async () => {
  const deadlines = [];
  const renderer = fakeRenderer({ result: (url) => ({ ok: true, body: RENDERED[url] || SHELL, finalUrl: url }) });
  const original = renderer.render;
  renderer.render = async (url, opts) => { deadlines.push(opts.deadline); return original(url, opts); };
  const started = Date.now();
  await crawl(`${O}/`, { renderer, max_duration_ms: 10000, render_extra_ms: 50000 }, fetchImpl);
  assert.ok(deadlines.length >= 2);
  // 10 s de base + 50 s extra, aplicados una vez (no 50 s por cada página).
  for (const d of deadlines) {
    assert.ok(d - started >= 59000 && d - started <= 62000, `plazo de ${d - started} ms`);
  }
});

test("una página que al cargar se va a otro sitio no se acepta", async () => {
  const renderer = fakeRenderer({ result: (url) => ({ ok: true, body: RENDERED[`${O}/components/button/usage`], finalUrl: "https://otro-sitio.test/x" }) });
  const result = await crawl(`${O}/`, { renderer, discovery: false }, fetchImpl);
  assert.equal(result.render.rendered, 0);
  assert.ok(result.render.failed >= 1);
  assert.equal(result.pages[0].rendered, false);
});

// ---------- proxy de salida del navegador ----------

function proxyGet(proxyPort, url) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: proxyPort, method: "GET", path: url, headers: { host: new URL(url).host } }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}
function proxyConnect(proxyPort, authority) {
  return new Promise((resolve) => {
    const s = net.connect(proxyPort, "127.0.0.1", () => s.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
    let buf = "";
    s.on("data", (d) => {
      buf += d;
      if (buf.includes("\r\n\r\n")) {
        resolve(Number(/^HTTP\/1\.1 (\d+)/.exec(buf)?.[1]));
        s.destroy();
      }
    });
    s.on("error", () => resolve(0));
  });
}

test("proxy de salida: bloquea direcciones internas y puertos no permitidos", async () => {
  const target = http.createServer((_req, res) => res.end("secreto interno"));
  await new Promise((r) => target.listen(0, "127.0.0.1", r));
  const port = target.address().port;
  const proxy = await startEgressProxy(); // regla real: solo direcciones públicas
  try {
    assert.equal((await proxyGet(proxy.port, `http://127.0.0.1:${port}/`)).status, 403);
    assert.equal((await proxyGet(proxy.port, `http://localhost:${port}/`)).status, 403);
    assert.equal(await proxyConnect(proxy.port, "169.254.169.254:443"), 403);
    assert.equal(await proxyConnect(proxy.port, `127.0.0.1:${port}`), 403);
    assert.equal(await proxyConnect(proxy.port, "[::1]:443"), 403);
    // Dirección pública pero puerto que no es 80 ni 443 (p. ej. SSH).
    assert.equal(await proxyConnect(proxy.port, "8.8.8.8:22"), 403);
    assert.ok(proxy.stats.blocked >= 6);
  } finally {
    await proxy.close();
    target.close();
  }
});

test("proxy de salida: deja pasar lo permitido y se conecta a la IP validada", async () => {
  const target = http.createServer((req, res) => res.end(`hola ${req.headers.host}`));
  await new Promise((r) => target.listen(0, "127.0.0.1", r));
  const port = target.address().port;
  const asked = [];
  // El nombre "docs.ejemplo.test" no existe: si el proxy volviera a resolverlo
  // fallaría. Funciona porque usa la dirección que devolvió la validación.
  const proxy = await startEgressProxy({ resolveHost: async (h) => { asked.push(h); return { address: "127.0.0.1" }; }, allowedPorts: null });
  try {
    const out = await proxyGet(proxy.port, `http://docs.ejemplo.test:${port}/a`);
    assert.equal(out.status, 200);
    assert.equal(out.body, `hola docs.ejemplo.test:${port}`);
    assert.equal(await proxyConnect(proxy.port, `docs.ejemplo.test:${port}`), 200);
    assert.deepEqual(asked, ["docs.ejemplo.test", "docs.ejemplo.test"]);
  } finally {
    await proxy.close();
    target.close();
  }
});

test("resolvePublicAddress devuelve la IP validada y rechaza las internas", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  assert.deepEqual(await resolvePublicAddress("example.com", { dnsLookup: lookup }), { address: "93.184.216.34", family: 4 });
  await assert.rejects(resolvePublicAddress("interno.test", { dnsLookup: async () => [{ address: "10.0.0.5", family: 4 }] }), /private address/);
  await assert.rejects(resolvePublicAddress("app.localhost"), /localhost/);
});

// ---------- avance por /api/progress ----------

async function withServer(fn) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, PORT: String(port), BROWSER_RENDERING: "0" } });
  await new Promise((resolve) => proc.stdout.on("data", (d) => String(d).includes("corriendo") && resolve()));
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    proc.kill();
  }
}

test("servidor: /api/progress valida el identificador y guarda el resultado como respaldo", async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/progress?id=corto`)).status, 400);
    assert.equal((await fetch(`${base}/api/progress?id=${"a".repeat(32)}`)).status, 404);
    assert.equal((await fetch(`${base}/api/progress?id=../../etc/passwd${"a".repeat(16)}`)).status, 400);

    // Una dirección interna se rechaza enseguida: sirve para ver el ciclo completo.
    const pid = "b".repeat(32);
    const res = await fetch(`${base}/api/evaluate`, { method: "POST", body: JSON.stringify({ url: "http://169.254.169.254/", progress_id: pid }) });
    assert.equal(res.status, 400);
    const plain = await (await fetch(`${base}/api/progress?id=${pid}`)).json();
    assert.equal(plain.status, "error");
    assert.equal(plain.response, undefined, "el resultado no viaja si no se pide");
    const full = await (await fetch(`${base}/api/progress?id=${pid}&result=1`)).json();
    assert.equal(full.response.http_status, 400);
    assert.equal(full.response.body.code, "BLOCKED");

    // Un identificador inválido en el pedido no rompe la evaluación.
    const bad = await fetch(`${base}/api/evaluate`, { method: "POST", body: JSON.stringify({ demo: "good", progress_id: "<script>" }) });
    assert.equal(bad.status, 200);
  });
});

// ---------- los tres estados del evaluador ----------
// leída + encontrada = evidencia · leída + no encontrada = ausencia (0) ·
// no se pudo leer = no evaluable (fuera de la nota, nunca 0).

const TOKENS_URL = `${O}/foundations/tokens`;
const TOKENS_WITHOUT_TABLE = `<html><body><main><h1>Tokens</h1><p>${LONG}</p><p>${LONG}</p></main></body></html>`;

async function evaluateWith(resultFor) {
  const renderer = fakeRenderer({ result: (url) => resultFor(url) });
  return evaluateUrl(`${O}/`, { weights, rules, fetchImpl, ssrfCheck: null, crawlOptions: { renderer } });
}
const rendered = (url, body = RENDERED[url]) => ({ ok: true, body, finalUrl: url });

test("D2 — leída y encontrada: los tokens cuentan como evidencia", async () => {
  const { report } = await evaluateWith((url) => rendered(url));
  assert.equal(report.dimensions.D2.status === "NOT_EVALUABLE", false);
  assert.ok(report.dimensions.D2.score > 0, `D2 = ${report.dimensions.D2.score}`);
  assert.ok(report.overview.coverage.tokens_detected >= 2);
});

test("D2 — leída y no encontrada: es una ausencia real y vale 0", async () => {
  const { report } = await evaluateWith((url) => rendered(url, url === TOKENS_URL ? TOKENS_WITHOUT_TABLE : RENDERED[url]));
  assert.equal(report.dimensions.D2.status, "EVALUATED");
  assert.equal(report.dimensions.D2.score, 0);
});

test("D2 — no se pudo leer: queda no evaluable, no en 0", async () => {
  for (const problem of ["RENDER_TIMEOUT", "RENDER_FAILED", "TIME_LIMIT"]) {
    const { report, crawlResult } = await evaluateWith((url) => (url === TOKENS_URL ? { ok: false, error: problem } : rendered(url)));
    assert.equal(report.dimensions.D2.status, "NOT_EVALUABLE", problem);
    assert.equal(report.dimensions.D2.score, null, problem);
    // La página queda registrada con el motivo, no como si no existiera.
    assert.equal(crawlResult.pages.find((p) => p.url === TOKENS_URL).render_problem, problem);
    // Y las dimensiones que sí se leyeron no se ven afectadas.
    assert.ok(report.dimensions.D4.score > 0);
  }
});

test("componentes — una página que no se pudo leer se excluye; una leída sin el dato cuenta como ausencia", async () => {
  const MODAL = `${O}/components/modal/usage`;
  const BUTTON_PLAIN = `<html><body><main><h1>Button</h1><p>Buttons trigger an action. ${LONG}</p></main></body></html>`;

  // Modal no se pudo leer: se evalúa solo Button y Modal no baja la nota.
  const unread = await evaluateWith((url) => (url === MODAL ? { ok: false, error: "RENDER_TIMEOUT" } : rendered(url)));
  assert.equal(unread.report.dimensions.D3.coverage.components_detected, 2);
  assert.equal(unread.report.dimensions.D3.coverage.components_scored, 1);
  assert.equal(unread.report.dimensions.D4.sub_criteria.component_selection.status, "FOUND");

  // Button se leyó y no dice cuándo usarlo: eso sí es "no encontrado".
  const absent = await evaluateWith((url) => (url === MODAL ? { ok: false, error: "RENDER_TIMEOUT" } : rendered(url, url === `${O}/components/button/usage` ? BUTTON_PLAIN : RENDERED[url])));
  assert.equal(absent.report.dimensions.D4.sub_criteria.component_selection.status, "NOT_FOUND");
  assert.equal(absent.report.dimensions.D4.sub_criteria.component_selection.points, 0);

  // Ninguna página se pudo leer: las dimensiones de contenido quedan sin nota.
  const none = await evaluateWith(() => ({ ok: false, error: "RENDER_FAILED" }));
  for (const d of ["D2", "D3", "D4", "D5", "D6"]) {
    assert.equal(none.report.dimensions[d].status, "NOT_EVALUABLE", d);
    assert.equal(none.report.dimensions[d].score, null, d);
  }
  assert.equal(none.report.overview.readiness_level, null, "con tan poca evidencia no se asigna nivel");
});
