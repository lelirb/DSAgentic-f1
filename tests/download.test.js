// Descargar el resultado (PDF vía impresión del navegador, y JSON). Nada se
// envía ni se guarda en el servidor: todo ocurre en el navegador.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { evaluate } from "../engine/src/evaluator/index.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf-8");
const weights = JSON.parse(read("engine/config/weights.json"));
const rules = JSON.parse(read("engine/config/rules.json"));
const report = evaluate(JSON.parse(read("engine/fixtures/qa/fixture_partial.json")), { weights, rules });

// Mini navegador: registra clics, descargas, impresión y bloques plegables.
function mount(stored, lang = "es") {
  const handlers = {};
  const winHandlers = {};
  const details = [{ open: false }, { open: true }, { open: false }].map((d) => ({
    ...d,
    setAttribute() { this.open = true; },
    removeAttribute() { this.open = false; },
  }));
  const root = {
    innerHTML: "",
    querySelector: (sel) => {
      const m = /data-action="(\w+)"/.exec(sel);
      return m && root.innerHTML.includes(`data-action="${m[1]}"`)
        ? { addEventListener: (_, fn) => (handlers[m[1]] = fn) }
        : null;
    },
    querySelectorAll: (sel) => (sel === "details:not([open])" ? details.filter((d) => !d.open) : []),
  };
  const btn = () => ({ setAttribute() {}, addEventListener() {} });
  const els = { "page-root": root, "btn-es": btn(), "btn-en": btn() };
  const store = { "agentic-ds-last-result": JSON.stringify(stored), "agentic-ds-lang": lang };
  const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
  const downloads = [];
  let printed = 0;
  let titleAtPrint = null;
  const document = {
    title: "Agentic DS",
    getElementById: (id) => els[id],
    querySelectorAll: () => [],
    documentElement: {},
    body: { appendChild() {} },
    createElement: () => {
      const a = { click() { downloads.push({ name: a.download, href: a.href }); }, remove() {} };
      return a;
    },
  };
  const blobs = new Map();
  class FakeBlob {
    constructor(parts, opts) { this.text = parts.join(""); this.type = opts.type; }
  }
  const URLx = Object.assign(function (...a) { return new URL(...a); }, {
    createObjectURL: (b) => { const id = `blob:${blobs.size}`; blobs.set(id, b); return id; },
    revokeObjectURL: () => {},
  });
  const window = {
    addEventListener: (ev, fn) => (winHandlers[ev] = fn),
    print: () => { printed++; titleAtPrint = document.title; },
  };
  const ctx = {
    window, document, sessionStorage: storage, localStorage: storage,
    Blob: FakeBlob, URL: URLx, setTimeout: (fn) => fn(), Intl, Date,
  };
  vm.createContext(ctx);
  for (const f of ["public/i18n.js", "public/report-texts.js", "public/report.js"]) vm.runInContext(read(f), ctx);
  return {
    html: () => root.innerHTML,
    click: (a) => handlers[a](),
    fire: (ev) => winHandlers[ev](),
    downloads, blobs, details, document,
    get printed() { return printed; },
    get titleAtPrint() { return titleAtPrint; },
  };
}

const LIVE = {
  report, mode: "live",
  sources: { entry_url: "https://www.ds.example.com/docs/", counts: { READ: 1 }, items: [], truncated: {} },
  evaluated_at: "2026-09-14T15:30:00.000Z",
};

test("el informe muestra los botones de descarga y el aviso de que no se guarda nada", () => {
  const html = mount(LIVE).html();
  assert.ok(html.includes('data-action="pdf"'));
  assert.ok(html.includes('data-action="json"'));
  assert.ok(html.includes("Descargar PDF"));
  assert.ok(html.includes("No guardamos tu resultado"));
});

test("en inglés, los botones y el aviso también se traducen", () => {
  const html = mount(LIVE, "en").html();
  assert.ok(html.includes("Download PDF"));
  assert.ok(html.includes("We don&#39;t store your result"));
});

test("la versión impresa lleva encabezado con fecha y un pie aclaratorio", () => {
  const html = mount(LIVE).html();
  assert.ok(html.includes('class="print-only print-head"'));
  assert.match(html, /Evaluado el 14 de septiembre de 2026/);
  assert.ok(html.includes("no es una certificación"));
});

test("resultados sin fecha (versiones anteriores) no muestran una fecha inventada", () => {
  const { evaluated_at, ...old } = LIVE;
  const html = mount(old).html();
  assert.ok(!html.includes("Evaluado el"));
});

test("PDF: abre la impresión con todo desplegado y un nombre de archivo útil; después restaura", () => {
  const app = mount(LIVE);
  const titleBefore = app.document.title;
  app.click("pdf");
  assert.equal(app.printed, 1);
  assert.equal(app.titleAtPrint, "agentic-ds-ds.example.com-2026-09-14");
  assert.equal(app.document.title, titleBefore, "el título vuelve a su valor");
  assert.deepEqual(app.details.map((d) => d.open), [false, true, false], "los bloques vuelven a como estaban");
});

test("PDF desde el menú del navegador (Ctrl+P) también despliega todo", () => {
  const app = mount(LIVE);
  app.fire("beforeprint");
  assert.ok(app.details.every((d) => d.open));
  app.fire("afterprint");
  assert.deepEqual(app.details.map((d) => d.open), [false, true, false]);
});

test("JSON: descarga un archivo autodescriptivo con el resultado completo", () => {
  const app = mount(LIVE);
  app.click("json");
  assert.equal(app.downloads.length, 1);
  assert.equal(app.downloads[0].name, "agentic-ds-ds.example.com-2026-09-14.json");
  const blob = app.blobs.get(app.downloads[0].href);
  assert.equal(blob.type, "application/json");
  const data = JSON.parse(blob.text);
  assert.equal(data.tool, "Agentic DS");
  assert.equal(data.export_format_version, 1);
  assert.equal(data.mode, "live");
  assert.equal(data.evaluated_at, "2026-09-14T15:30:00.000Z");
  assert.equal(data.entry_url, "https://www.ds.example.com/docs/");
  assert.deepEqual(data.report, report, "el informe va completo y sin cambios");
  assert.deepEqual(data.sources, LIVE.sources);
});

test("JSON de una demo: se identifica como demo", () => {
  const app = mount({ report, mode: "demo" });
  app.click("json");
  assert.match(app.downloads[0].name, /^agentic-ds-demo-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(JSON.parse(app.blobs.get(app.downloads[0].href).text).mode, "demo");
});

test("la pantalla de inicio guarda la fecha de la evaluación (solo en el navegador)", () => {
  const html = read("public/index.html");
  assert.ok(html.includes("evaluated_at: new Date().toISOString()"));
  assert.ok(html.includes("sessionStorage.setItem('agentic-ds-last-result'"));
});

test("estilos de impresión: ocultan botones y navegación, y evitan que la tabla de capacidades se corte", () => {
  const css = read("public/results.html");
  const print = css.slice(css.indexOf("@media print{\n"));
  assert.ok(print.includes("header,.report-actions,.src-jump{display:none!important;}"));
  assert.ok(print.includes(".chain{grid-template-columns:repeat(4,minmax(0,1fr));}"));
});
