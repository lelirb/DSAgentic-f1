// La capa de interpretación del informe (public/report-texts.js) debe tener
// texto humano para CADA criterio técnico que produce el motor, en los dos
// idiomas. Si el motor agrega un criterio nuevo, esta prueba falla en vez de
// que el informe muestre un identificador técnico sin explicación.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { evaluate } from "../engine/src/evaluator/index.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf-8");
const ctx = { window: {} };
vm.runInNewContext(read("public/report-texts.js"), ctx);
const R = ctx.window.AgenticDSReport;

const weights = JSON.parse(read("engine/config/weights.json"));
const rules = JSON.parse(read("engine/config/rules.json"));
const engineKeys = new Set();
for (const f of readdirSync(path.join(ROOT, "engine/fixtures/qa"))) {
  const report = evaluate(JSON.parse(read(`engine/fixtures/qa/${f}`)), { weights, rules });
  for (const dim of Object.values(report.dimensions)) for (const k of Object.keys(dim.sub_criteria || {})) engineKeys.add(k);
}

test("cada criterio del motor tiene nombre, hallazgo, gap, inferencia y recomendación en ES y EN", () => {
  assert.ok(engineKeys.size >= 40);
  for (const lang of ["es", "en"]) {
    for (const k of engineKeys) {
      const t = R[lang].subs[k];
      assert.ok(t, `${lang}: falta texto para ${k}`);
      for (const field of ["name", "found", "gap", "infer", "fix"]) assert.ok(t[field], `${lang}.${k}.${field}`);
    }
  }
});

test("cada dimensión tiene las preguntas conceptuales y las 4 lecturas del resultado", () => {
  for (const lang of ["es", "en"]) {
    for (const d of ["D1", "D2", "D3", "D4", "D5", "D6", "D7"]) {
      const t = R[lang].dims[d];
      for (const f of ["name", "verb", "can", "what", "purpose", "why"]) assert.ok(t[f], `${lang}.${d}.${f}`);
      if (d !== "D7") for (const m of ["full", "high", "mid", "low"]) assert.ok(t.meaning[m], `${lang}.${d}.meaning.${m}`);
    }
    for (const b of ["Operable", "Interpretable", "Legible", "Opaco"]) assert.ok(R[lang].bands[b].summary);
  }
});

test("ES y EN tienen exactamente las mismas claves de interfaz", () => {
  assert.deepEqual(Object.keys(R.es.ui).sort(), Object.keys(R.en.ui).sort());
});

test("los pesos usados para ordenar prioridades coinciden con los del motor", () => {
  for (const [k, w] of Object.entries(weights.weights)) assert.equal(R.WEIGHTS[k], w, k);
});

test("ningún texto de 'qué se esperaba encontrar' repite solo el nombre del criterio (debe describir contenido concreto)", () => {
  const src = readFileSync(path.join(ROOT, "public/report-texts.js"), "utf-8");
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const dict = ctx.window.AgenticDSReport;
  for (const lang of ["es", "en"]) {
    for (const [key, sub] of Object.entries(dict[lang].subs)) {
      // Una descripción útil de "qué se esperaba" debería ser más larga que el
      // nombre del criterio y no ser idéntica a él (regresión del bug real:
      // found:"estados" para el criterio "Estados").
      assert.ok(
        sub.found.length >= sub.name.length + 5,
        `${lang}/${key}: 'found' ("${sub.found}") es tan corto como el nombre ("${sub.name}") — no describe contenido concreto`
      );
    }
  }
});
