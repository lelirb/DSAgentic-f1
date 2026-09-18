// Etapa 1 — transparencia: qué intentó leer el evaluador y qué pasó con cada cosa.
// Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { crawl } from "../engine/src/crawler/crawl.js";
import { evaluateUrl } from "../engine/src/pipeline.js";
import { evaluate } from "../engine/src/evaluator/index.js";
import { summarizeSources } from "../server.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf-8");
const weights = JSON.parse(read("engine/config/weights.json"));
const rules = JSON.parse(read("engine/config/rules.json"));

function mkRes(status, type, body) {
  const headers = new Map([["content-type", type]]);
  return { status, ok: status >= 200 && status < 300, headers: { get: (k) => headers.get(k) ?? null }, body: null, text: async () => body };
}
function fakeFetch(routes) {
  return async (url) => {
    const r = routes[url];
    if (typeof r === "function") return r();
    if (!r) return mkRes(404, "text/html", "not found");
    return mkRes(r.status ?? 200, r.type ?? "text/html", r.body ?? "");
  };
}

const ENTRY = "https://ds.test/components/button/usage/";
const SITE = {
  [ENTRY]: {
    body: `<h1>Button</h1><p>Buttons trigger actions.</p>
      <a href="/components/modal/usage/">m</a><a href="/components/button/style/">s</a>
      <a href="https://github.com/org/repo">gh</a><a href="/components/missing/usage/">x</a>
      <a href="/tokens/colors.json">t</a><a href="/components/slow/usage/">slow</a>`,
  },
  "https://ds.test/components/modal/usage/": { body: "<h1>Modal</h1><p>Dialogs.</p>" },
  "https://ds.test/components/button/style/": { body: "<h1>Button</h1><p>Style.</p>" },
  "https://ds.test/tokens/colors.json": { type: "application/json", body: '{"color":{"primary":{"value":"#00f"}}}' },
  "https://ds.test/components/slow/usage/": { status: 503 },
  "https://ds.test/llms.txt": { type: "text/plain", body: "# DS\n- [Button](https://ds.test/components/button/usage/)" },
};
const bySource = (sources) => Object.fromEntries(sources.map((s) => [s.url, s]));

// ---------- rastreador ----------

test("cada fuente queda registrada con un estado claro", async () => {
  const { sources } = await crawl(ENTRY, { discovery: false }, fakeFetch(SITE));
  const s = bySource(sources);
  assert.equal(s[ENTRY].status, "READ");
  assert.equal(s[ENTRY].role, "entry");
  assert.equal(s["https://ds.test/components/modal/usage/"].status, "READ");
  assert.equal(s["https://github.com/org/repo"].status, "OUT_OF_SCOPE");
  assert.equal(s["https://ds.test/components/missing/usage/"].status, "FAILED");
  assert.equal(s["https://ds.test/components/missing/usage/"].reason, "HTTP_404");
  assert.equal(s["https://ds.test/components/slow/usage/"].reason, "HTTP_503");
  assert.equal(s["https://ds.test/llms.txt"].status, "READ");
  assert.equal(s["https://ds.test/llms.txt"].role, "well_known");
  assert.ok(!sources.some((x) => x.status === "PENDING"), "nunca se devuelve un estado interno");
});

test("los archivos conocidos que no existen se informan como 'no estaban', no como fallas", async () => {
  const { sources, stats } = await crawl("https://ds.test/components/modal/usage/", {}, fakeFetch({
    "https://ds.test/components/modal/usage/": { body: "<h1>Modal</h1>" },
  }));
  const probes = sources.filter((x) => x.role === "well_known");
  assert.ok(probes.length >= 1);
  assert.ok(probes.every((p) => p.status === "NOT_PRESENT"));
  assert.equal(stats.pages_failed, 0, "las estadísticas existentes no cambian");
});

test("un 200 con HTML en /llms.txt se informa como 'no estaba' (página común del sitio)", async () => {
  const { sources } = await crawl("https://ds.test/components/modal/usage/", {}, fakeFetch({
    "https://ds.test/components/modal/usage/": { body: "<h1>Modal</h1>" },
    "https://ds.test/llms.txt": { body: "<html>app</html>" },
  }));
  const probe = sources.find((x) => x.url === "https://ds.test/llms.txt");
  assert.equal(probe.status, "NOT_PRESENT");
  assert.equal(probe.reason, "HTML_FALLBACK");
});

test("los links encontrados pero no leídos por el límite de páginas quedan registrados", async () => {
  const links = Array.from({ length: 12 }, (_, i) => `<a href="/components/c${i}/">c</a>`).join("");
  const routes = { "https://ds.test/components/": { body: links } };
  for (let i = 0; i < 12; i++) routes[`https://ds.test/components/c${i}/`] = { body: "<h1>x</h1>" };
  const { sources, stats } = await crawl("https://ds.test/components/", { max_pages: 5 }, fakeFetch(routes));
  const skipped = sources.filter((x) => x.status === "SKIPPED" && x.reason === "PAGE_LIMIT");
  assert.equal(stats.pages_retrieved, 5);
  assert.equal(skipped.length, 12 - 4);
});

test("los links no leídos por el límite de tiempo se registran con ese motivo", async () => {
  const links = Array.from({ length: 10 }, (_, i) => `<a href="/components/c${i}/">c</a>`).join("");
  const slow = () => new Promise((r) => setTimeout(() => r(mkRes(200, "text/html", "<h1>x</h1>")), 150));
  const routes = { "https://ds.test/components/": { body: links } };
  for (let i = 0; i < 10; i++) routes[`https://ds.test/components/c${i}/`] = slow;
  const { sources } = await crawl("https://ds.test/components/", { concurrency: 2, max_duration_ms: 300 }, fakeFetch(routes));
  assert.ok(sources.some((x) => x.status === "SKIPPED" && x.reason === "TIME_LIMIT"));
});

test("los links más allá de la profundidad máxima se registran como no leídos", async () => {
  const routes = {
    "https://ds.test/components/": { body: '<a href="/components/a/">a</a>' },
    "https://ds.test/components/a/": { body: '<a href="/components/b/">b</a>' },
    "https://ds.test/components/b/": { body: "<h1>b</h1>" },
  };
  const { sources } = await crawl("https://ds.test/components/", { max_depth: 1 }, fakeFetch(routes));
  const b = sources.find((x) => x.url === "https://ds.test/components/b/");
  assert.equal(b.status, "SKIPPED");
  assert.equal(b.reason, "DEPTH_LIMIT");
});

test("una redirección a otra página ya leída se informa como repetida", async () => {
  const routes = {
    "https://ds.test/components/": { body: '<a href="/components/old/">old</a><a href="/components/new/">new</a>' },
    "https://ds.test/components/new/": { body: "<h1>New</h1>" },
  };
  const fetchImpl = async (url) => {
    if (url === "https://ds.test/components/old/") {
      const headers = new Map([["location", "/components/new/"]]);
      return { status: 301, ok: false, headers: { get: (k) => headers.get(k) ?? null }, body: null, text: async () => "" };
    }
    return fakeFetch(routes)(url);
  };
  const { sources } = await crawl("https://ds.test/components/", { concurrency: 1 }, fetchImpl);
  const old = sources.find((x) => x.url === "https://ds.test/components/old/");
  assert.ok(["DUPLICATE", "READ"].includes(old.status));
  const readNew = sources.filter((x) => x.status === "READ" && (x.url === "https://ds.test/components/new/" || x.final_url === "https://ds.test/components/new/"));
  assert.equal(readNew.length, 1, "la misma página no se cuenta dos veces como leída");
});

// ---------- para qué se usó cada fuente ----------

test("cada fuente leída dice para qué la usó el extractor", async () => {
  const { sources } = await evaluateUrl(ENTRY, { weights, rules, fetchImpl: fakeFetch(SITE), ssrfCheck: null, crawlOptions: { discovery: false } });
  const s = bySource(sources);
  assert.deepEqual(s[ENTRY].used_as, [{ kind: "component", name: "Button" }]);
  assert.deepEqual(s["https://ds.test/components/modal/usage/"].used_as, [{ kind: "component", name: "Modal" }]);
  assert.deepEqual(s["https://ds.test/tokens/colors.json"].used_as, [{ kind: "tokens", count: 1 }]);
  assert.deepEqual(s["https://ds.test/llms.txt"].used_as, [{ kind: "manifest", name: "llms.txt" }]);
  assert.deepEqual(s["https://ds.test/components/button/style/"].used_as, [{ kind: "component", name: "Button" }], "etapa 4: todas las pestañas de un componente se leen");
});

test("el registro de fuentes no cambia el puntaje", async () => {
  const a = await evaluateUrl(ENTRY, { weights, rules, fetchImpl: fakeFetch(SITE), ssrfCheck: null, crawlOptions: { discovery: false } });
  const b = evaluate(a.normalized, { weights, rules });
  assert.deepEqual(a.report, b);
});

// ---------- resumen que envía el servidor ----------

test("el resumen tiene totales exactos y recorta solo las listas largas", () => {
  const sources = [
    { url: "https://ds.test/", role: "entry", status: "READ", used_as: [] },
    ...Array.from({ length: 100 }, (_, i) => ({ url: `https://other.test/${i}`, role: "link", status: "OUT_OF_SCOPE", reason: "OUTSIDE_SCOPE" })),
    ...Array.from({ length: 70 }, (_, i) => ({ url: `https://ds.test/f${i}`, role: "link", status: "FAILED", reason: "TIMEOUT" })),
  ];
  const sum = summarizeSources("https://ds.test/", sources);
  assert.equal(sum.counts.OUT_OF_SCOPE, 100);
  assert.equal(sum.items.filter((i) => i.status === "OUT_OF_SCOPE").length, 60);
  assert.equal(sum.truncated.OUT_OF_SCOPE, 40);
  assert.equal(sum.items.filter((i) => i.status === "FAILED").length, 70, "las fallas se muestran todas");
  assert.equal(sum.entry_url, "https://ds.test/");
});

// ---------- informe ----------

function renderReport(stored, lang = "es") {
  const root = { innerHTML: "" };
  const btn = () => ({ setAttribute() {}, addEventListener() {} });
  const els = { "page-root": root, "btn-es": btn(), "btn-en": btn() };
  const store = { "agentic-ds-last-result": JSON.stringify(stored), "agentic-ds-lang": lang };
  const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
  const ctx = {
    URL, // disponible en cualquier navegador; vm no lo trae por defecto
    window: {}, sessionStorage: storage, localStorage: storage,
    document: { getElementById: (id) => els[id], querySelectorAll: () => [], documentElement: {}, title: "" },
  };
  vm.createContext(ctx);
  for (const f of ["public/i18n.js", "public/report-texts.js", "public/report.js"]) vm.runInContext(read(f), ctx);
  return root.innerHTML;
}

async function liveStored() {
  const { report, sources } = await evaluateUrl(ENTRY, { weights, rules, fetchImpl: fakeFetch(SITE), ssrfCheck: null, crawlOptions: { discovery: false } });
  return { report, mode: "live", sources: summarizeSources(ENTRY, sources) };
}

test("informe en vivo: sección 'Qué revisamos' con lo leído y para qué se usó", async () => {
  const html = renderReport(await liveStored());
  const sec = html.slice(html.indexOf('id="sources"'));
  assert.ok(sec.startsWith('id="sources">Qué revisamos'));
  assert.ok(sec.includes("leída como componente «Button»"));
  assert.ok(sec.includes("archivo de tokens (tokens leídos: 1)"));
  assert.ok(sec.includes("No se pudieron abrir"));
  assert.ok(sec.includes("error del sitio (error 503)"));
  assert.ok(sec.includes("Fuera del alcance"));
  assert.ok(sec.includes("busca llms.txt y sitemap.xml"));
  assert.ok(html.includes('href="#sources"'), "hay un acceso directo desde el encabezado");
});

test("informe en inglés: la sección también se traduce", async () => {
  const html = renderReport(await liveStored(), "en");
  assert.ok(html.includes("What we reviewed"));
  assert.ok(html.includes("read as component “Button”"));
  assert.ok(!html.includes("Qué revisamos"));
});

test("informe: aviso de 'no evaluado' en las limitaciones de un resultado en vivo", async () => {
  const html = renderReport(await liveStored());
  assert.ok(html.includes("Qué todavía no se puede leer"));
  const demo = renderReport({ report: evaluate(JSON.parse(read("engine/fixtures/qa/fixture_good.json")), { weights, rules }), mode: "demo" });
  assert.ok(!demo.includes("Qué todavía no se puede leer"));
  assert.ok(demo.includes("no se leyó ningún sitio real"));
});

test("informe: resultados guardados antes de esta versión no se rompen", async () => {
  const { report } = await liveStored();
  const html = renderReport({ report, mode: "live" });
  assert.ok(html.includes("no incluye la lista de lo revisado"));
});

test("informe: las direcciones del sitio se muestran escapadas y solo se enlazan si son http(s)", async () => {
  const stored = await liveStored();
  stored.sources.items.push(
    { url: 'https://ds.test/"><img src=x onerror=alert(1)>', role: "link", status: "FAILED", reason: "TIMEOUT", used_as: [] },
    { url: "javascript:alert(1)", role: "link", status: "FAILED", reason: "TIMEOUT", used_as: [] }
  );
  stored.sources.counts.FAILED += 2;
  const html = renderReport(stored);
  assert.ok(!html.includes("<img src=x"), "no debe inyectar HTML");
  assert.ok(!html.includes('href="javascript:'), "no debe enlazar esquemas peligrosos");
  assert.ok(html.includes('rel="noopener noreferrer nofollow"'));
  assert.ok(html.includes('href="https://ds.test/components/modal/usage/"'), "las direcciones http(s) sí se enlazan");
});

test("pantalla de inicio: aviso de lo que todavía no se puede leer, en ES y EN", () => {
  const html = read("public/index.html");
  assert.ok(html.includes('data-i18n="form.note.notEvaluable"'));
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read("public/i18n.js"), ctx);
  assert.ok(ctx.window.AgenticDSDict.es["form.note.notEvaluable"].includes("quedan fuera de la nota"));
  assert.ok(ctx.window.AgenticDSDict.en["form.note.notEvaluable"].includes("left out of the score"));
});
