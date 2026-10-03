// Regresión: una página que solo es un cascarón armado con JavaScript no cuenta
// como "leída". Antes bastaban 40 caracteres en TODO el HTML (título y aviso de
// <noscript> incluidos) o cualquier <p> con texto (un aviso de cookies). Así, D1
// decía "el contenido está en el HTML" (15/15) mientras D3, D4 y D5 no hallaban
// nada en esas mismas páginas y lo puntuaban como 0 en vez de "no se pudo leer".
// Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { visibleTextLength, MIN_READABLE_TEXT } from "../engine/src/extractor/readPage.js";
import { detectAccess } from "../engine/src/extractor/detectAccess.js";
import { detectComponents } from "../engine/src/extractor/detectComponents.js";
import { createEvidenceCollector } from "../engine/src/extractor/evidence.js";

const SHELL = `<!doctype html><html><head><title>Buttons – Material Design 3 – Guidelines</title>
  <meta name="description" content="Buttons let people take action and make choices with one tap."></head>
  <body><noscript>You need to enable JavaScript to run this app.</noscript>
  <div id="root"></div>
  <p>We use cookies to improve your experience on this site.</p>
  <script src="/app.js"></script></body></html>`;

const REAL = `<!doctype html><html><head><title>Button</title></head><body>
  <nav><a href="/">Home</a></nav><main><h1>Button</h1>
  <p>Buttons trigger an action. Use a primary button for the main action on a page and a secondary one for the rest.</p>
  <h2>When to use</h2><p>Use a button when the user needs to submit a form, start a process or confirm a choice in the current context.</p>
  <h2>Variants</h2><ul><li>Primary</li><li>Secondary</li><li>Ghost</li></ul></main><footer>© DS</footer></body></html>`;

test("un cascarón con título, <noscript> y aviso de cookies no llega al mínimo legible", () => {
  assert.ok(visibleTextLength(SHELL) < MIN_READABLE_TEXT, `contó ${visibleTextLength(SHELL)} caracteres`);
  assert.ok(visibleTextLength(REAL) >= MIN_READABLE_TEXT, `contó ${visibleTextLength(REAL)} caracteres`);
});

test("el texto de <head>, <noscript>, menús y pie no cuenta como contenido", () => {
  const onlyChrome = `<html><head><title>${"t".repeat(300)}</title></head><body>
    <nav>${"n".repeat(300)}</nav><header>${"h".repeat(300)}</header><footer>${"f".repeat(300)}</footer>
    <noscript>${"s".repeat(300)}</noscript></body></html>`;
  assert.equal(visibleTextLength(onlyChrome), 0);
});

test("D1: las páginas cascarón no cuentan como documentación recuperada", () => {
  const mk = (body) => ({
    pages: [{ url: "https://x.com/components/button", contentType: "text/html", body }],
    pageRecords: [{ url: "https://x.com/components/button", status: "CRAWLED" }],
  });
  assert.equal(detectAccess(mk(SHELL)).documentation_recoverability, "NOT_RECOVERABLE");
  assert.equal(detectAccess(mk(REAL)).documentation_recoverability, "FULLY_RECOVERABLE");
});

test("un componente cuya página es un cascarón queda 'no se pudo leer', no 'no encontrado'", () => {
  const url = "https://x.com/components/button/usage";
  const crawlResult = {
    pages: [{ url, contentType: "text/html", body: SHELL }],
    pageRecords: [{ url, status: "CRAWLED", reason: null }],
    stats: {},
  };
  const [button] = detectComponents(crawlResult, createEvidenceCollector());
  assert.equal(button.evaluation_status, "NOT_EVALUABLE");
  assert.equal(button.unreadable_reason, "SCRIPT_RENDERED");

  const ok = { ...crawlResult, pages: [{ url, contentType: "text/html", body: REAL }] };
  const [real] = detectComponents(ok, createEvidenceCollector());
  assert.notEqual(real.evaluation_status, "NOT_EVALUABLE");
});

// ---------- Aviso del tope de 40 ----------
import { computeGlobalScore } from "../engine/src/evaluator/scoring.js";
import { readFileSync } from "node:fs";

const W = JSON.parse(readFileSync(new URL("../engine/config/weights.json", import.meta.url), "utf-8"));
const RULES = JSON.parse(readFileSync(new URL("../engine/config/rules.json", import.meta.url), "utf-8"));
const dims = (scores) => Object.entries(scores).map(([dimension, score]) => ({ dimension, score, status: "EVALUATED" }));

test("el tope de 40 solo se anuncia cuando de verdad baja el número", () => {
  // D1 = 15 (< 25) pero el resto es bajo: la nota cruda ya es menor que 40.
  const bajo = computeGlobalScore(dims({ D1: 15, D2: 0, D3: 0, D4: 0, D5: 0, D6: 9 }), W, RULES);
  assert.equal(bajo.gate.applied, true);
  assert.equal(bajo.gate.capped, false);
  assert.ok(bajo.global_score_raw < 40);

  // D1 = 15 pero el resto es alto: la nota cruda pasa de 40 y el tope sí actúa.
  const alto = computeGlobalScore(dims({ D1: 15, D2: 90, D3: 90, D4: 90, D5: 90, D6: 90 }), W, RULES);
  assert.equal(alto.gate.applied, true);
  assert.equal(alto.gate.capped, true);
  assert.ok(alto.global_score_raw > 40);
  assert.ok(alto.global_score <= 40);

  // D1 alto: no hay tope.
  const sinTope = computeGlobalScore(dims({ D1: 80, D2: 90, D3: 90, D4: 90, D5: 90, D6: 90 }), W, RULES);
  assert.equal(sinTope.gate.applied, false);
  assert.equal(sinTope.gate.capped, false);
});
