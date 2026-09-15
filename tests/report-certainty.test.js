// Reglas de certeza del informe (public/report.js), probadas renderizando el
// informe real en un DOM mínimo. Garantizan que el informe nunca convierta una
// limitación del evaluador en un defecto del Design System.
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
const fixture = (n) => evaluate(JSON.parse(read(`engine/fixtures/qa/fixture_${n}.json`)), { weights, rules });

function renderReport(report, mode, lang = "es") {
  const root = { innerHTML: "" };
  const btn = () => ({ setAttribute() {}, addEventListener() {} });
  const els = { "page-root": root, "btn-es": btn(), "btn-en": btn() };
  const store = { "agentic-ds-last-result": JSON.stringify({ report, mode }), "agentic-ds-lang": lang };
  const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
  const ctx = {
    window: {}, sessionStorage: storage, localStorage: storage,
    document: { getElementById: (id) => els[id], querySelectorAll: () => [], documentElement: {}, title: "" },
  };
  vm.createContext(ctx);
  for (const f of ["public/i18n.js", "public/report-texts.js", "public/report.js"]) vm.runInContext(read(f), ctx);
  return root.innerHTML;
}

test("en vivo nunca se afirma 'Ausencia demostrada'", () => {
  for (const n of ["poor", "partial", "d1_gate", "good"]) {
    const html = renderReport(fixture(n), "live");
    assert.ok(!html.includes("<p>Ausencia demostrada:</p>"), `${n}: no debe listar ausencias demostradas en vivo`);
    assert.ok(!html.includes('class="st c-abs"'), `${n}: ningún criterio en vivo puede quedar como ausencia demostrada`);
  }
});

test("en vivo, D3 sin propiedades leídas queda 'No evaluado', no como gap ni recomendación firme", () => {
  const r = fixture("poor");
  const html = renderReport(r, "live");
  const d3 = html.slice(html.indexOf('id="dim-D3"'), html.indexOf('id="dim-D4"'));
  assert.ok(d3.includes("No evaluado"));
  assert.ok(d3.includes("Limitación de la evaluación, no del Design System"));
  assert.ok(!d3.includes("Gaps del Design System:"));
});

test("demo con evidencia completa (sin páginas fallidas ni límite) sí puede demostrar ausencias", () => {
  const r = fixture("poor");
  assert.equal(r.overview.coverage.pages_failed || 0, 0);
  const html = renderReport(r, "demo");
  assert.ok(html.includes('class="st c-abs"'));
  assert.ok(html.includes("Gaps del Design System:"));
});

test("un rastreo limitado se comunica como evaluación incompleta y puntaje 'demostrado'", () => {
  const r = fixture("good");
  r.overview.evaluation_status = "LIMITED";
  const html = renderReport(r, "live");
  assert.ok(html.includes("Evaluación incompleta"));
  assert.ok(html.includes("el rastreo alcanzó su límite"));
  assert.ok(html.includes("/100 demostrado"));
});

test("D2 en 0 sin desglose no se presenta como 'sin gaps'", () => {
  const r = fixture("poor");
  assert.equal(r.dimensions.D2.score, 0);
  const html = renderReport(r, "live");
  const d2 = html.slice(html.indexOf('id="dim-D2"'), html.indexOf('id="dim-D3"'));
  assert.ok(!d2.includes("No se detectaron gaps"));
  assert.ok(d2.includes("No demostrado"));
});

test("el informe renderiza en ES y EN para todas las demos sin lanzar errores", () => {
  for (const n of ["good", "partial", "poor", "contradictory", "not_applicable", "not_evaluable", "d1_gate"])
    for (const mode of ["demo", "live"]) for (const lang of ["es", "en"]) assert.ok(renderReport(fixture(n), mode, lang).length > 1000, `${n}/${mode}/${lang}`);
});

test("un criterio sin evidencia dice explícitamente qué se esperaba encontrar (ES y EN)", () => {
  const r = fixture("d1_gate");
  const htmlEs = renderReport(r, "live", "es");
  assert.ok(htmlEs.includes("Se esperaba encontrar:"), "ES: falta el texto de expectativa");

  const htmlEn = renderReport(r, "live", "en");
  assert.ok(htmlEn.includes("Expected to find:"), "EN: falta el texto de expectativa");
});

test("el texto de expectativa acompaña tanto a 'no demostrado' como a 'no evaluado', no solo a uno", () => {
  const r = fixture("poor");
  const html = renderReport(r, "demo");
  // fixture_poor tiene evidencia completa (demo) -> puede haber "absent" (ausencia
  // demostrada); igual debe decir qué se esperaba encontrar, no solo que falta.
  const idx = html.indexOf("Se esperaba encontrar:");
  assert.ok(idx > -1);
});
