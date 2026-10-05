// Pestañas de componente y diagnóstico de lo leído.
// Caso real: Material 3 publica cada componente en Overview / Specs /
// Guidelines / Accessibility y "specs" no se reconocía como pestaña.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateUrl, withPageOutline } from "../engine/src/pipeline.js";
import { buildSample } from "../engine/src/crawler/siteMap.js";
import { componentIdentity, isLikelyComponentPage } from "../engine/src/extractor/detectComponents.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf-8");
const weights = JSON.parse(read("engine/config/weights.json"));
const rules = JSON.parse(read("engine/config/rules.json"));

function mkRes(status, type, body) {
  const headers = new Map([["content-type", type]]);
  return { status, ok: status >= 200 && status < 300, headers: { get: (k) => headers.get(k) ?? null }, body: null, text: async () => body };
}
function fakeFetch(routes, log = []) {
  return async (url) => {
    log.push(url);
    const r = routes[url];
    if (!r) return mkRes(404, "text/html", "not found");
    return mkRes(r.status ?? 200, r.type ?? "text/html; charset=utf-8", r.body ?? "");
  };
}

const M = "https://m3.test";

test("'specs' es una pestaña del componente, no un componente", () => {
  assert.equal(componentIdentity(`${M}/components/lists/specs`), "lists");
  assert.equal(componentIdentity(`${M}/components/tabs/specs`), "tabs");
  assert.equal(componentIdentity(`${M}/componentes/boton/especificaciones`), "boton");
  assert.equal(isLikelyComponentPage(`${M}/components/lists/specs`), true);
});

test("la muestra ya no inventa un componente 'specs' y cada componente incluye su pestaña Specs", () => {
  const names = ["badges", "cards", "chips", "lists", "menus", "tabs"];
  const urls = names.flatMap((n) => ["overview", "specs", "guidelines", "accessibility"].map((t) => `${M}/components/${n}/${t}`));
  const { sample, counts } = buildSample(urls, { rootUrl: `${M}/` });
  assert.equal(counts.components_found, 6);
  assert.ok(!counts.component_names_found.includes("specs"));
  for (const n of names) assert.ok(sample.includes(`${M}/components/${n}/specs`), `${n}: falta su pestaña Specs`);
});

const FILLER = "<div class=\"nota\">Esta guía describe cómo usar el componente dentro del sistema de diseño: su propósito, los casos en que conviene elegirlo, las alternativas disponibles y los criterios que el equipo ya decidió para mantener la coherencia entre productos.</div>";
const page = (title, inner) => `<html><body><nav><a href="/">Inicio</a></nav><main><h1>${title}</h1>${inner}${FILLER}</main></body></html>`;
const SITE = {
  [`${M}/sitemap.xml`]: {
    type: "application/xml",
    body: `<urlset>${["/", "/components/lists/overview", "/components/lists/specs", "/components/lists/guidelines"].map((p) => `<url><loc>${M}${p}</loc></url>`).join("")}</urlset>`,
  },
  [`${M}/`]: { body: page("Material-like", "<p>Welcome to the design system of the example company.</p>") },
  [`${M}/components/lists/overview`]: { body: page("Lists", "<p>Lists are continuous, vertical indexes of text and images.</p>") },
  [`${M}/components/lists/guidelines`]: { body: page("Lists", "<h2>Usage</h2><p>Use lists to help people find a specific item.</p><h2>Anatomy</h2><p>Container, headline, supporting text.</p>") },
  [`${M}/components/lists/specs`]: {
    body: page("Lists", "<h2>Variants</h2><h3>One-line</h3><p>Single line.</p><h3>Two-line</h3><p>Two lines.</p><h2>States</h2><p>Lists show hover, focus, pressed and disabled states.</p>"),
  },
};

test("lo que está en la pestaña Specs cuenta para su componente", async () => {
  const { report, sources } = await evaluateUrl(`${M}/`, { weights, rules, fetchImpl: fakeFetch(SITE), ssrfCheck: null });
  assert.equal(report.overview.coverage.components_detected, 1, "un solo componente: Lists");
  const d3 = report.dimensions.D3.sub_criteria;
  assert.ok(d3.variants.points > 0, "variantes leídas desde Specs");
  assert.ok(d3.states.points > 0, "estados leídos desde Specs");
  const specs = sources.find((s) => s.url === `${M}/components/lists/specs`);
  assert.deepEqual(specs.used_as, [{ kind: "component", name: "Lists" }]);
});

test("el JSON dice qué títulos vio el evaluador en cada página leída", async () => {
  const { sources } = await evaluateUrl(`${M}/`, { weights, rules, fetchImpl: fakeFetch(SITE), ssrfCheck: null });
  const g = sources.find((s) => s.url === `${M}/components/lists/guidelines`);
  assert.deepEqual(g.headings, ["Lists", "Usage", "Anatomy"]);
  assert.ok(g.text_chars > 200);
  // Lo que no es HTML o no se leyó no lleva títulos.
  assert.equal(sources.find((s) => s.url === `${M}/sitemap.xml`).headings, undefined);
  // Sin repetidos, recortados y con tope.
  const many = Array.from({ length: 60 }, (_, i) => `<h2>T${i} ${"x".repeat(100)}</h2><h2>Igual</h2>`).join("");
  const out = withPageOutline([{ url: "https://a.test/p", status: "READ" }, { url: "https://a.test/q", status: "SKIPPED" }],
    [{ url: "https://a.test/p", contentType: "text/html", body: many }]);
  assert.equal(out[0].headings.length, 40);
  assert.ok(out[0].headings.every((h) => h.length <= 80));
  assert.equal(out[0].headings.filter((h) => h === "Igual").length, 1);
  assert.equal(out[1].headings, undefined);
});
