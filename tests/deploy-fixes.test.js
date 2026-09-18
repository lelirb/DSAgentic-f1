// Regresión de los arreglos previos a publicar el link (2026-09-14).
// Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractLinks, normalizeUrl } from "../engine/src/crawler/discovery.js";
import { crawl } from "../engine/src/crawler/crawl.js";
import { evaluateUrl } from "../engine/src/pipeline.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const weights = JSON.parse(readFileSync(path.join(ROOT, "engine/config/weights.json"), "utf-8"));
const rules = JSON.parse(readFileSync(path.join(ROOT, "engine/config/rules.json"), "utf-8"));

function mkRes(status, type, body) {
  const headers = new Map([["content-type", type]]);
  return { status, ok: status >= 200 && status < 300, headers: { get: (k) => headers.get(k) ?? null }, body: null, text: async () => body };
}
function fakeFetch(routes, calls = []) {
  return async (url) => {
    calls.push(url);
    const r = routes[url];
    if (typeof r === "function") return r();
    if (!r) return mkRes(404, "text/plain", "not found");
    return mkRes(r.status ?? 200, r.type ?? "text/html", r.body ?? "");
  };
}

// ---------- IP real del visitante detrás del proxy de Render ----------

test("rate limiting: detrás de Render usa la IP real (último valor de X-Forwarded-For)", async () => {
  const { clientIp } = await import("../server.js");
  const req = { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" }, socket: { remoteAddress: "10.0.0.1" } };
  assert.equal(clientIp(req, { RENDER: "true" }), "203.0.113.9", "el primer valor lo puede falsificar el visitante");
});

test("rate limiting: fuera de Render ignora X-Forwarded-For (no se puede falsificar)", async () => {
  const { clientIp } = await import("../server.js");
  const req = { headers: { "x-forwarded-for": "6.6.6.6" }, socket: { remoteAddress: "10.0.0.1" } };
  assert.equal(clientIp(req, {}), "10.0.0.1");
});

// ---------- Links que antes se salteaban ----------

test("links con #fragmento se siguen (antes se descartaban enteros)", () => {
  const links = extractLinks('<a href="/components/button#usage">x</a>', "https://ds.test/");
  assert.deepEqual(links, ["https://ds.test/components/button"]);
});

test("links sin comillas y con comillas simples se leen", () => {
  const links = extractLinks("<a href=/components/tabs>a</a><a class='x' href='/components/card'>b</a>", "https://ds.test/");
  assert.deepEqual(links.sort(), ["https://ds.test/components/card", "https://ds.test/components/tabs"]);
});

test("anclas de la misma página, mailto y javascript no se tratan como páginas", () => {
  const html = '<a href="#top">a</a><a href="mailto:x@y.z">b</a><a href="javascript:void(0)">c</a><a href="tel:123">d</a>';
  assert.deepEqual(extractLinks(html, "https://ds.test/components/"), []);
});

test("parámetros de seguimiento se quitan y el resto se ordena (una sola URL por página)", () => {
  assert.equal(normalizeUrl("/c/button?utm_source=x&b=2&a=1#props", "https://ds.test/"), "https://ds.test/c/button?a=1&b=2");
  assert.equal(normalizeUrl("/c/button?utm_source=x", "https://ds.test/"), "https://ds.test/c/button");
  assert.equal(normalizeUrl("/c/x?a=1&amp;b=2", "https://ds.test/"), "https://ds.test/c/x?a=1&b=2");
});

test("un mismo componente enlazado con distintas anclas se rastrea una sola vez", async () => {
  const calls = [];
  const fetchImpl = fakeFetch({
    "https://ds.test/components/": {
      body: '<a href="/components/button#usage">1</a><a href="/components/button#props">2</a><a href="/components/button">3</a>',
    },
    "https://ds.test/components/button": { body: "<h1>Button</h1>" },
  }, calls);
  const result = await crawl("https://ds.test/components/", {}, fetchImpl);
  assert.equal(calls.filter((u) => u === "https://ds.test/components/button").length, 1);
  assert.ok(result.pages.some((p) => p.url === "https://ds.test/components/button"));
});

test("variantes de la misma ruta con distintos parámetros no agotan el límite de páginas", async () => {
  const many = Array.from({ length: 30 }, (_, i) => `<a href="/components/list?page=${i}">p</a>`).join("");
  const fetchImpl = fakeFetch({
    "https://ds.test/components/": { body: many + '<a href="/components/card">card</a>' },
    "https://ds.test/components/card": { body: "<h1>Card</h1>" },
  });
  const result = await crawl("https://ds.test/components/", { max_pages: 10 }, fetchImpl);
  const variants = result.pageRecords.filter((p) => p.url.includes("/components/list?"));
  assert.ok(variants.length <= 3, `se esperaban como máximo 3 variantes, hubo ${variants.length}`);
  assert.ok(result.pages.some((p) => p.url === "https://ds.test/components/card"), "el componente real debe rastrearse");
});

test("URLs tipo Storybook (?path=) no se limitan: el parámetro ES la página", async () => {
  const stories = Array.from({ length: 6 }, (_, i) => `<a href="/storybook/?path=/docs/c${i}">s</a>`).join("");
  const fetchImpl = fakeFetch({ "https://ds.test/storybook/": { body: stories } });
  const result = await crawl("https://ds.test/storybook/", { max_pages: 20 }, fetchImpl);
  const seen = result.pageRecords.filter((p) => p.url.includes("?path="));
  assert.equal(seen.length, 6);
});

// ---------- Tiempo máximo del rastreo ----------

test("el rastreo se corta al llegar al tiempo máximo y se informa como limitado", async () => {
  const links = Array.from({ length: 20 }, (_, i) => `<a href="/components/c${i}">c</a>`).join("");
  const slow = () => new Promise((r) => setTimeout(() => r(mkRes(200, "text/html", "<h1>x</h1>")), 150));
  const routes = { "https://ds.test/components/": { body: links } };
  for (let i = 0; i < 20; i++) routes[`https://ds.test/components/c${i}`] = slow;
  const started = Date.now();
  const result = await crawl("https://ds.test/components/", { max_pages: 50, concurrency: 2, max_duration_ms: 400 }, fakeFetch(routes));
  assert.ok(Date.now() - started < 2000, "no debe seguir mucho después del límite");
  assert.equal(result.stats.time_limited, true);
  assert.equal(result.stats.crawl_limited, true);
  assert.ok(result.pages.length < 21);
});

// ---------- Sitio que no abre: error claro, no informe vacío ----------

for (const [status, kind] of [[403, "REFUSED"], [429, "REFUSED"], [404, "NOT_FOUND"], [503, "FAILED"]]) {
  test(`si la página de entrada responde ${status}, error claro (${kind}) en vez de D1 = 0`, async () => {
    const fetchImpl = fakeFetch({ "https://ds.test/": { status, body: "no" } });
    await assert.rejects(
      evaluateUrl("https://ds.test/", { weights, rules, fetchImpl, ssrfCheck: null }),
      new RegExp(`^Error: UNREACHABLE:${kind}`)
    );
  });
}

test("si la entrada tarda demasiado, error TIMEOUT", async () => {
  const fetchImpl = (url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  await assert.rejects(
    evaluateUrl("https://ds.test/", { weights, rules, fetchImpl, ssrfCheck: null, crawlOptions: { request_timeout: 100 } }),
    /^Error: UNREACHABLE:TIMEOUT/
  );
});

test("si la entrada falla pero hay otra evidencia (llms.txt), igual se evalúa", async () => {
  const fetchImpl = fakeFetch({
    "https://ds.test/": { status: 503 },
    "https://ds.test/llms.txt": { type: "text/plain", body: "# DS\n- components: https://ds.test/components" },
  });
  const { report } = await evaluateUrl("https://ds.test/", { weights, rules, fetchImpl, ssrfCheck: null });
  assert.ok(report.overview);
});

// ---------- Servidor: códigos de error y textos para el diseñador ----------

async function withServer(fn, env = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, PORT: String(port), ...env } });
  await new Promise((resolve) => proc.stdout.on("data", (d) => String(d).includes("corriendo") && resolve()));
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    proc.kill();
  }
}

const post = (base, payload) =>
  fetch(`${base}/api/evaluate`, { method: "POST", body: typeof payload === "string" ? payload : JSON.stringify(payload) });

test("servidor: cada error trae un código que la interfaz sabe traducir", async () => {
  await withServer(async (base) => {
    let r = await post(base, { url: "notaurl" });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, "INVALID_URL");

    r = await post(base, { url: "http://localhost/admin" });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, "BLOCKED");

    r = await post(base, "{not json");
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.code, "BAD_REQUEST");
    assert.ok(!/JSON|position|token/i.test(body.error), "no debe mostrar mensajes internos");
  });
});

test("servidor: el límite por visitante sigue funcionando (6ª evaluación en un minuto → 429)", async () => {
  await withServer(async (base) => {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await (await post(base, { url: "http://localhost/" })).json()).code);
    assert.equal(codes[5], "RATE_LIMITED");
  });
});

test("servidor: el archivo viejo preview-standalone.html ya no se publica", async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/preview-standalone.html`);
    assert.equal(r.status, 404);
  });
});

test("interfaz: todos los códigos de error tienen texto en español e inglés", () => {
  globalThis.window = {};
  const src = readFileSync(path.join(ROOT, "public/i18n.js"), "utf-8");
  new Function("window", src)(globalThis.window);
  const dict = globalThis.window.AgenticDSDict;
  const codes = [
    "RATE_LIMITED", "BUSY", "INVALID_URL", "BLOCKED", "NOT_RESOLVED", "INTERNAL", "BAD_REQUEST",
    "UNREACHABLE_REFUSED", "UNREACHABLE_TIMEOUT", "UNREACHABLE_NOT_FOUND", "UNREACHABLE_FAILED",
  ];
  for (const lang of ["es", "en"]) {
    for (const c of codes) assert.ok(dict[lang][`form.error.${c}`], `${lang}: falta form.error.${c}`);
  }
});
