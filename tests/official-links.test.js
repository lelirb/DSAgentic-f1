// Fuentes oficiales: reconocer el Storybook que el sistema enlaza aunque su
// dirección no lleve "storybook" en el nombre. Caso real: Fluent 2 enlaza desde
// cada componente a react.fluentui.dev/?path=/docs/components-checkbox--docs y
// en producción no se detectaba ninguna fuente oficial.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateUrl } from "../engine/src/pipeline.js";
import { normalizeUrl } from "../engine/src/crawler/discovery.js";
import { officialSourceKind, officialSourceKey } from "../engine/src/crawler/siteMap.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf-8");
const weights = JSON.parse(read("engine/config/weights.json"));
const rules = JSON.parse(read("engine/config/rules.json"));

function mkRes(status, type, body, location) {
  const headers = new Map([["content-type", type]]);
  if (location) headers.set("location", location);
  return { status, ok: status >= 200 && status < 300, headers: { get: (k) => headers.get(k) ?? null }, body: null, text: async () => body };
}
function fakeFetch(routes, log = []) {
  return async (url) => {
    log.push(url);
    const r = routes[url];
    if (!r) return mkRes(404, "text/html", "not found");
    return mkRes(r.status ?? 200, r.type ?? "text/html; charset=utf-8", r.body ?? "", r.location);
  };
}

test("una dirección de Storybook se reconoce también después de normalizarla", () => {
  const raw = "https://react.fluentui.dev/?path=/docs/components-checkbox--docs";
  const normalized = normalizeUrl(raw, "https://fluent.test/components/checkbox/usage/");
  assert.ok(normalized.includes("%2Fdocs%2F"), "la normalización codifica las barras del parámetro");
  for (const u of [raw, normalized]) {
    assert.equal(officialSourceKind(u), "storybook", u);
    assert.equal(officialSourceKey(u, "storybook"), "https://react.fluentui.dev");
  }
  assert.equal(officialSourceKind("https://x.test/?path=/story/button--primary"), "storybook");
  // Un parámetro "path" cualquiera no convierte un sitio en Storybook.
  assert.equal(officialSourceKind("https://x.test/files?path=/docs.pdf"), null);
  assert.equal(officialSourceKind("https://x.test/search?q=1&path=/home/docs/"), null);
});

const O = "https://fluent.test";
const FILLER = "<div class=\"nota\">Esta guía describe cómo usar el componente dentro del sistema de diseño: su propósito, los casos en que conviene elegirlo, las alternativas disponibles y los criterios que el equipo ya decidió para mantener la coherencia entre productos.</div>";
const page = (title, inner) => `<html><body><nav><a href="/">Inicio</a></nav><main><h1>${title}</h1>${inner}${FILLER}</main></body></html>`;
// Un ícono dentro del enlace: más de 200 caracteres antes del texto.
const ICON = `<svg viewBox="0 0 20 20"><path d="${"M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z ".repeat(12)}"/></svg>`;
const component = (name, slug) =>
  page(name, `<p>${name} lets people choose.</p><h2>Resources</h2>
    <a class="card" href="https://react.sb.test/?path=/docs/components-${slug}--docs">${ICON}<span>${name} storybook React guidance</span></a>`);
const SITE = {
  [`${O}/sitemap.xml`]: {
    type: "application/xml",
    body: `<urlset>${["/", "/components/checkbox/usage/", "/components/switch/usage/"].map((p) => `<url><loc>${O}${p}</loc></url>`).join("")}</urlset>`,
  },
  [`${O}/`]: { body: page("Fluent-like", "<p>Welcome to the design system of the example company.</p>") },
  [`${O}/components/checkbox/usage/`]: { body: component("Checkbox", "checkbox") },
  [`${O}/components/switch/usage/`]: { body: component("Switch", "switch") },
  // El índice del Storybook está en otra dirección, tras una redirección.
  "https://react.sb.test/index.json": { status: 302, location: "https://storybooks.sb.test/react/index.json" },
  "https://storybooks.sb.test/react/index.json": {
    type: "application/json",
    body: JSON.stringify({ v: 5, entries: { a: { title: "Components/Checkbox" }, b: { title: "Components/Switch" }, c: { title: "Components/Accordion" } } }),
  },
};

test("el Storybook enlazado desde cada componente se detecta y se lee su índice", async () => {
  const log = [];
  const { report, crawlResult } = await evaluateUrl(`${O}/`, { weights, rules, fetchImpl: fakeFetch(SITE, log), ssrfCheck: null });
  const discovery = crawlResult.discovery;
  assert.deepEqual(discovery.official_sources.map((s) => [s.url, s.kind]), [["https://react.sb.test", "storybook"]]);
  assert.ok(log.includes("https://storybooks.sb.test/react/index.json"), "sigue la redirección hasta el índice");
  const d1 = report.dimensions.D1.sub_criteria;
  assert.equal(d1.component_index.status, "FOUND", "el índice del Storybook es un índice de componentes legible por máquina");
  // Las propiedades viven en ese Storybook, que todavía no se lee por dentro:
  // quedan fuera de la nota en vez de contar como "no encontradas".
  assert.equal(report.dimensions.D3.sub_criteria.props_documented.status, "NOT_EVALUABLE");
  assert.equal(report.dimensions.D3.sub_criteria.props_documented.reason, "EXTERNAL_NOT_READ");
});

test("sin enlace a un Storybook, nada cambia: las propiedades siguen 'no encontradas'", async () => {
  const site = { ...SITE };
  for (const [name, slug] of [["Checkbox", "checkbox"], ["Switch", "switch"]])
    site[`${O}/components/${slug}/usage/`] = { body: page(name, `<p>${name} lets people choose.</p>`) };
  const { report, crawlResult } = await evaluateUrl(`${O}/`, { weights, rules, fetchImpl: fakeFetch(site), ssrfCheck: null });
  const discovery = crawlResult.discovery;
  assert.deepEqual(discovery.official_sources, []);
  assert.equal(report.dimensions.D1.sub_criteria.component_index.status, "NOT_FOUND");
  assert.equal(report.dimensions.D3.sub_criteria.props_documented.status, "NOT_FOUND");
});
