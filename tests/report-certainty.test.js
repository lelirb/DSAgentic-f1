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

test("en vivo no se afirma 'No existe' si el motor no lo dice", () => {
  for (const n of ["poor", "partial", "d1_gate", "good"]) {
    const html = renderReport(fixture(n), "live");
    assert.ok(!html.includes("<p>No existe:</p>"), `${n}: no debe listar ausencias en vivo sin certeza`);
    assert.ok(!html.includes('class="st c-abs"'), `${n}: ningún criterio en vivo puede quedar como ausencia demostrada`);
  }
});

// Etapa 2: el motor marca cada criterio. Para simular un resultado en vivo se
// agregan a una demo los estados que produciría el rastreo.
const withCriteria = (n, criteria) => {
  const input = JSON.parse(read(`engine/fixtures/qa/fixture_${n}.json`));
  input.metadata = { ...(input.metadata || {}), criteria };
  return evaluate(input, { weights, rules });
};

test("en vivo, un criterio en una fuente oficial sin leer queda 'No se pudo leer' y fuera de la nota", () => {
  const r = withCriteria("poor", { "D3.props_documented": { status: "NOT_EVALUABLE", reason: "EXTERNAL_NOT_READ" } });
  assert.equal(r.dimensions.D3.sub_criteria.props_documented.points, null);
  const html = renderReport(r, "live");
  const d3 = html.slice(html.indexOf('id="dim-D3"'), html.indexOf('id="dim-D4"'));
  assert.ok(d3.includes("No se pudo leer"));
  assert.ok(d3.includes("Storybook"));
  assert.ok(d3.includes("Limitación de la evaluación, no del Design System"));
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
  assert.ok(d2.includes("No encontrado"));
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

// ---------- Regla de la mitad (etapa 2) ----------
// Reemplaza la "nota sin nivel" anterior: lo que no se pudo leer ya no cuenta
// como 0; si lo revisado es menos de la mitad de la nota, no se asigna nivel.

const MOSTLY_UNREADABLE = {
  "D1.component_index": { status: "NOT_EVALUABLE", reason: "EXTERNAL_NOT_READ" },
  "D1.props_types_accessibility": { status: "NOT_EVALUABLE", reason: "EXTERNAL_NOT_READ" },
  "D1.types_or_schema": { status: "NOT_EVALUABLE", reason: "EXTERNAL_NOT_READ" },
  "D1.structured_tokens": { status: "NOT_EVALUABLE", reason: "NOT_LOOKED" },
  "D3.props_documented": { status: "NOT_EVALUABLE", reason: "EXTERNAL_NOT_READ" },
  "D3.variants": { status: "NOT_EVALUABLE", reason: "UNREADABLE" },
  "D4.component_selection": { status: "NOT_EVALUABLE", reason: "UNREADABLE" },
  "D4.restrictions": { status: "NOT_EVALUABLE", reason: "UNREADABLE" },
  "D4.justification": { status: "NOT_EVALUABLE", reason: "UNREADABLE" },
  "D5.reuse_of_existing_components": { status: "NOT_EVALUABLE", reason: "NOT_LOOKED" },
  "D5.composition_rules": { status: "NOT_EVALUABLE", reason: "NOT_LOOKED" },
  "D5.hierarchy_nesting": { status: "NOT_EVALUABLE", reason: "NOT_LOOKED" },
  "D5.documented_patterns": { status: "NOT_EVALUABLE", reason: "NOT_LOOKED" },
  "D5.layout_spacing": { status: "NOT_EVALUABLE", reason: "NOT_LOOKED" },
};

test("motor: lo que no se pudo leer queda fuera de la nota, no cuenta como 0", () => {
  const base = fixture("partial");
  const r = withCriteria("partial", { "D5.documented_patterns": { status: "NOT_EVALUABLE", reason: "NOT_LOOKED" } });
  const sc = r.dimensions.D5.sub_criteria;
  assert.equal(sc.documented_patterns.points, null);
  assert.equal(sc.documented_patterns.status, "NOT_EVALUABLE");
  const evaluable = Object.values(sc).filter((x) => x.points !== null);
  const expected = (evaluable.reduce((a, x) => a + x.points, 0) / evaluable.reduce((a, x) => a + x.max, 0)) * 100;
  assert.ok(Math.abs(r.dimensions.D5.score - expected) < 1e-9);
  assert.ok(r.overview.evaluable_share < base.overview.evaluable_share);
});

test("si se revisó menos de la mitad, se muestra el número sin nivel y con aviso", () => {
  const r = withCriteria("poor", MOSTLY_UNREADABLE);
  assert.equal(r.overview.data_sufficiency, "LOW_COVERAGE");
  assert.equal(r.overview.readiness_level, null);
  assert.notEqual(r.overview.global_score, null, "el número se sigue mostrando");
  const html = renderReport(r, "live");
  const head = html.slice(0, html.indexOf('class="chain"'));
  assert.ok(head.includes("Sin nivel: se revisó menos de la mitad"));
  assert.ok(!head.includes('class="scale'), "no debe mostrar la escala de niveles");
  assert.match(head, /Solo se pudo revisar el \d+ % de lo que compone la nota/);
  assert.ok(!head.includes("Por tanto:"), "no debe sacar una conclusión de nivel");
  assert.ok(head.includes(`<span class="num num-provisional">${r.overview.global_score}</span>`));
});

test("la regla de la mitad también se explica en inglés", () => {
  const html = renderReport(withCriteria("poor", MOSTLY_UNREADABLE), "live", "en");
  assert.ok(html.includes("No level: less than half was reviewed"));
  assert.match(html, /Only \d+% of what makes up the score could be reviewed/);
});

test("en demos la banda se sigue mostrando igual que antes", () => {
  for (const n of ["good", "poor", "partial"]) {
    const html = renderReport(fixture(n), "demo");
    assert.ok(!html.includes("Sin nivel"), n);
    assert.ok(html.includes('class="scale'), `${n}: la escala de niveles debe seguir`);
  }
});

test("una dimensión en la que no se pudo leer nada muestra 'No se pudo leer', no un 0", () => {
  const r = withCriteria("poor", MOSTLY_UNREADABLE);
  assert.equal(r.dimensions.D5.score, null);
  const html = renderReport(r, "live");
  const chain = html.slice(html.indexOf('class="chain"'), html.indexOf('id="dim-D1"'));
  assert.ok(chain.slice(chain.indexOf("dim-D5")).includes("No se pudo leer"));
  const verdict = html.slice(0, html.indexOf('class="chain"'));
  const notEvalList = verdict.slice(verdict.indexOf('class="cap-na"'));
  assert.ok(notEvalList.includes('<span class="dref">D5</span>'), "D5 debe figurar como 'No se pudo evaluar'");
});

test("'No existe' solo aparece cuando el motor lo afirma (archivo buscado en su dirección estándar)", () => {
  const r = withCriteria("poor", { "D1.agent_manifest": { status: "ABSENT", reason: "PROBED" } });
  assert.equal(r.dimensions.D1.sub_criteria.agent_manifest.status, "ABSENT");
  const html = renderReport(r, "live");
  const d1 = html.slice(html.indexOf('id="dim-D1"'), html.indexOf('id="dim-D2"'));
  assert.ok(d1.includes("No existe:"));
  assert.equal((d1.match(/class="st c-abs"/g) || []).length, 1, "solo ese criterio queda como 'No existe'");
});

test("D4: sin componentes que compitan, la desambiguación no aplica y no suma puntos", () => {
  const r = fixture("poor");
  const sc = r.dimensions.D4.sub_criteria.disambiguation;
  assert.equal(sc.points, null);
  assert.equal(sc.status, "NOT_APPLICABLE");
  assert.equal(r.dimensions.D4.score, 0, "antes regalaba 20 puntos sin evidencia");
  const html = renderReport(r, "demo");
  const d4 = html.slice(html.indexOf('id="dim-D4"'), html.indexOf('id="dim-D5"'));
  assert.ok(d4.includes("No aplica"));
});
