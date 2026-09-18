// Etapas 2, 3 y 4 — encontrar el Design System, leer más de cada página y
// separar "no encontrado" de "no se pudo leer". Sitio simulado, sin red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { crawl } from "../engine/src/crawler/crawl.js";
import { evaluateUrl } from "../engine/src/pipeline.js";
import { findDsRoot, parseSitemap, parseLlmsTxt, buildSample, classifyUrl, officialSourceKind } from "../engine/src/crawler/siteMap.js";
import { extractTables, propsFromTables, tokensFromTables, restrictionsFrom, disambiguationFrom, extractSections, statesFrom } from "../engine/src/extractor/readPage.js";
import { publicDiscovery } from "../server.js";

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

const O = "https://ds.test";
const page = (title, inner) => `<html><body><nav><a href="/">Inicio</a></nav><main><h1>${title}</h1>${inner}</main></body></html>`;
const SITE = {
  [`${O}/robots.txt`]: { type: "text/plain", body: `User-agent: *\nSitemap: ${O}/sitemap.xml` },
  [`${O}/sitemap.xml`]: {
    type: "application/xml",
    body: `<?xml version="1.0"?><urlset>
      ${["/", "/components/button/usage", "/components/button/code", "/components/button/accessibility",
        "/components/modal/usage", "/components/checkbox/usage", "/components/", "/patterns/forms",
        "/foundations/color", "/whats-new/changelog", "/blog/hello"].map((p) => `<url><loc>${O}${p}</loc></url>`).join("")}
    </urlset>`,
  },
  [`${O}/`]: { body: page("Our DS", "<p>Welcome to the design system of the example company.</p>") },
  [`${O}/components/button/usage`]: {
    body: page("Button", `<p>Buttons trigger an action.</p>
      <h2>When to use</h2><p>Use a button to submit a form or confirm a dialog.</p>
      <h2>When not to use</h2><p>To navigate between pages.</p>
      <p>Don’t use more than one primary button per page. Use a link instead of a button for navigation.</p>
      <h2>Variants</h2><h3>Primary</h3><p>Main action.</p><h3>Secondary</h3><p>Other actions.</p>
      <h2>States</h2><p>Buttons show hover, focus and disabled states.</p>
      <p>Last updated: March 2026</p>`),
  },
  [`${O}/components/button/code`]: {
    body: page("Button", `<p>React API.</p>
      <table><thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
      <tbody><tr><td>kind</td><td>'primary' | 'secondary'</td><td>'primary'</td><td>Visual emphasis</td></tr>
      <tr><td>disabled</td><td>boolean</td><td>false</td><td>Disables the button</td></tr></tbody></table>
      <pre><code>&lt;Button kind="primary"&gt;Save&lt;/Button&gt;</code></pre>
      <a href="https://react.ds.test/storybook/?path=/docs/button">Storybook</a>
      <a href="https://github.com/example/ds">GitHub</a>`),
  },
  [`${O}/components/button/accessibility`]: { body: page("Button", "<p>Buttons are reachable with the keyboard and announce their label.</p>") },
  [`${O}/components/modal/usage`]: {
    body: page("Modal", `<p>Modals focus attention on a task.</p>
      <h2>When to use</h2><p>For critical confirmations.</p>
      <p>For non-critical messages, use a toast instead of a modal.</p>`),
  },
  // Página en español
  [`${O}/components/checkbox/usage`]: {
    body: page("Casilla de verificación", `<p>Permite elegir varias opciones.</p>
      <h2>Cuándo usar</h2><p>Cuando la persona puede elegir más de una opción.</p>
      <h2>Cuándo no usar</h2><p>Si solo se puede elegir una opción.</p>
      <p>No uses casillas para acciones inmediatas. Usá un interruptor en lugar de una casilla para activar ajustes.</p>
      <h2>Propiedades</h2><table><tr><th>Nombre</th><th>Tipo</th><th>Predeterminado</th></tr>
      <tr><td>checked</td><td>boolean</td><td>false</td></tr></table>
      <h2>Estados</h2><p>Marcado, deshabilitado y con error.</p>
      <h2>Accesibilidad</h2><p>Se puede marcar con la barra espaciadora y tiene etiqueta visible.</p>`),
  },
  [`${O}/patterns/forms`]: {
    body: page("Forms", `<p>Forms combine a checkbox, a button and a modal for confirmation.</p>
      <h2>Layout</h2><p>Stack fields vertically with consistent spacing.</p>`),
  },
  [`${O}/foundations/color`]: {
    body: page("Color", `<p>Color tokens.</p><table><tr><th>Token</th><th>Value</th></tr>
      <tr><td>$color-primary</td><td>#0f62fe</td></tr><tr><td>$color-text-error</td><td>$color-red-60</td></tr></table>`),
  },
  [`${O}/whats-new/changelog`]: { body: page("Changelog", "<p>Version 11.2.0 released.</p>") },
};

// ---------- etapa 3: raíz y listados ----------

test("la raíz del Design System se reconoce desde la dirección principal o desde un componente", () => {
  assert.equal(findDsRoot("https://ds.test/components/web/react/core/button/usage"), "https://ds.test/");
  assert.equal(findDsRoot("https://ds.test/"), "https://ds.test/");
  assert.equal(findDsRoot("https://site.test/design/components/button"), "https://site.test/design/");
  assert.equal(findDsRoot("https://site.test/material-ui/react-button/"), "https://site.test/material-ui/");
  assert.equal(findDsRoot("https://site.test/es/componentes/boton"), "https://site.test/es/");
});

test("se leen sitemap.xml (incluido un índice) y llms.txt", () => {
  const idx = parseSitemap("<sitemapindex><sitemap><loc>https://a.test/s1.xml</loc></sitemap></sitemapindex>");
  assert.deepEqual(idx.children, ["https://a.test/s1.xml"]);
  const set = parseSitemap("<urlset><url><loc>https://a.test/x?a=1&amp;b=2</loc></url></urlset>");
  assert.deepEqual(set.urls, ["https://a.test/x?a=1&b=2"]);
  const llms = parseLlmsTxt("# DS\n- [Button](/components/button)\nhttps://a.test/tokens.json", "https://a.test/llms.txt");
  assert.deepEqual(llms, ["https://a.test/components/button", "https://a.test/tokens.json"]);
});

test("la muestra es ordenada y reparte los componentes a lo largo de la lista", () => {
  const urls = Array.from({ length: 40 }, (_, i) => `https://a.test/components/c${String(i).padStart(2, "0")}/usage`);
  const { sample, counts } = buildSample(urls, { rootUrl: "https://a.test/" });
  assert.equal(counts.components_found, 40);
  assert.equal(counts.components_sampled, 8);
  const ids = sample.filter((u) => u.includes("/components/")).map((u) => u.split("/")[4]);
  assert.ok(ids[0] !== "c00" || ids[ids.length - 1] > "c30", "no toma solo las primeras");
  assert.deepEqual(buildSample(urls, { rootUrl: "https://a.test/" }).sample, sample, "siempre la misma muestra");
});

test("clasificación de direcciones y fuentes oficiales", () => {
  assert.equal(classifyUrl("https://a.test/patterns/forms"), "pattern");
  assert.equal(classifyUrl("https://a.test/patrones/"), "pattern_index");
  assert.equal(classifyUrl("https://a.test/foundations/color"), "tokens");
  assert.equal(classifyUrl("https://a.test/whats-new/changelog"), "changelog");
  assert.equal(officialSourceKind("https://github.com/org/repo/tree/main"), "repository");
  assert.equal(officialSourceKind("https://github.com/sponsors/org"), null);
  assert.equal(officialSourceKind("https://react.ds.test/storybook/?path=/docs/button"), "storybook");
  assert.equal(officialSourceKind("https://www.npmjs.com/package/@org/ds"), "package");
});

test("entrando por la raíz o por un componente se lee lo mismo", async () => {
  const a = await crawl(`${O}/`, { max_pages: 45 }, fakeFetch(SITE));
  const b = await crawl(`${O}/components/button/usage`, { max_pages: 45 }, fakeFetch(SITE));
  const urls = (r) => r.pages.map((p) => p.url).sort();
  assert.deepEqual(urls(a), urls(b));
  assert.equal(a.discovery.method, "sitemap");
  assert.equal(b.discovery.root_url, `${O}/`);
  assert.equal(b.discovery.components_found, 3);
  assert.equal(b.discovery.components_sampled, 3);
  assert.equal(b.discovery.probed.llms_txt, "ABSENT");
  assert.ok(!urls(b).includes(`${O}/blog/hello`), "el blog no entra en la muestra");
  const kinds = b.discovery.official_sources.map((s) => s.kind).sort();
  assert.deepEqual(kinds, ["repository", "storybook"]);
  const ext = b.sources.find((s) => s.role === "official_external" && s.url === "https://github.com/example/ds");
  assert.equal(ext.status, "SKIPPED");
  assert.equal(ext.reason, "EXTERNAL_NOT_READ_YET");
  const blog = b.sources.find((s) => s.url === `${O}/blog/hello`);
  assert.equal(blog.reason, "NOT_IN_SAMPLE");
});

test("sin sitemap ni llms.txt se usa el menú de navegación", async () => {
  const site = {
    [`${O}/components/button/`]: { body: `<nav><a href="/components/button/">Button</a><a href="/components/tabs/">Tabs</a></nav><h1>Button</h1><p>Buttons trigger an action.</p>` },
    [`${O}/components/tabs/`]: { body: "<h1>Tabs</h1><p>Tabs organize content.</p>" },
  };
  const r = await crawl(`${O}/components/button/`, {}, fakeFetch(site));
  assert.equal(r.discovery.method, "navigation");
  assert.equal(r.discovery.components_found, 2);
  assert.equal(r.stats.pages_failed, 0, "no encontrar la página de inicio no es una página fallida");
});

test("sin lista de páginas, se siguen los enlaces como antes", async () => {
  const site = {
    [`${O}/docs/`]: { body: `<h1>Docs</h1><p>Intro.</p><a href="/components/tabs/">Tabs</a>` },
    [`${O}/components/tabs/`]: { body: "<h1>Tabs</h1><p>Tabs organize content.</p>" },
  };
  const r = await crawl(`${O}/docs/`, {}, fakeFetch(site));
  assert.equal(r.discovery.method, "links");
  assert.ok(r.pages.some((p) => p.url === `${O}/components/tabs/`));
});

test("las direcciones de los listados pasan por el control de seguridad", async () => {
  const checked = [];
  const hostCheck = async (u) => {
    checked.push(u);
    if (u.includes("internal")) throw new Error("Blocked: internal");
  };
  const site = {
    ...SITE,
    [`${O}/sitemap.xml`]: { type: "application/xml", body: `<urlset><url><loc>${O}/components/a/usage</loc></url></urlset>` },
    [`${O}/components/a/usage`]: { body: "<h1>A</h1><p>A component.</p>" },
  };
  await crawl(`${O}/`, { host_check: hostCheck }, fakeFetch(site));
  for (const u of [`${O}/sitemap.xml`, `${O}/robots.txt`, `${O}/components/a/usage`]) assert.ok(checked.includes(u), u);
});

// ---------- etapa 4: lectura de páginas ----------

test("tablas de propiedades y de tokens, en inglés y español", () => {
  const props = propsFromTables(extractTables(SITE[`${O}/components/button/code`].body));
  assert.deepEqual(props.map((p) => p.name), ["kind", "disabled"]);
  assert.deepEqual(props[0].allowed_values, ["primary", "secondary"]);
  assert.equal(props[1].default, "false");
  const es = propsFromTables(extractTables(SITE[`${O}/components/checkbox/usage`].body));
  assert.equal(es[0].name, "checked");
  assert.equal(es[0].type, "boolean");
  const tokens = tokensFromTables(extractTables(SITE[`${O}/foundations/color`].body));
  assert.deepEqual(tokens.map((t) => t.name), ["$color-primary", "$color-text-error"]);
});

test("restricciones y alternativas en español e inglés", () => {
  const html = "<p>No uses casillas para acciones. Nunca combines dos variantes. Don’t stack buttons. Usá un interruptor en lugar de una casilla. Try a link instead.</p>";
  assert.equal(restrictionsFrom(html).length, 3);
  const d = disambiguationFrom(html).map((x) => x.competitor);
  assert.deepEqual(d, ["casilla", "link"]);
});

test("estados reconocidos dentro de su sección", () => {
  const s = extractSections("<h2>Estados</h2><p>Marcado, deshabilitado y con error.</p><h2>Otro</h2><p>hover</p>");
  assert.deepEqual(statesFrom(s).sort(), ["disabled", "error", "selected"]);
});

test("un componente se lee con todas sus pestañas", async () => {
  const { normalized } = await evaluateUrl(`${O}/components/button/usage`, { weights, rules, fetchImpl: fakeFetch(SITE), ssrfCheck: null });
  const button = normalized.components.find((c) => c.name === "Button");
  assert.equal(button.tabs_read.length, 3);
  assert.equal(button.props.length, 2, "props de la pestaña de código");
  assert.ok(button.accessibility, "accesibilidad desde su pestaña");
  assert.deepEqual(button.variants.map((v) => v.name).sort(), ["Primary", "Secondary", "primary", "secondary"].sort());
  assert.deepEqual(button.states.map((s) => s.name).sort(), ["disabled", "focus", "hover"]);
  assert.ok(button.usage.when_to_use && button.usage.when_not_to_use);
  assert.ok(button.usage.restrictions.length >= 1);
  assert.deepEqual(button.usage.competing_components, ["button"]);
  const checkbox = normalized.components.find((c) => c.name === "Casilla de verificación");
  assert.ok(checkbox.usage.when_to_use, "«Cuándo usar» en español");
  assert.ok(checkbox.usage.when_not_to_use, "«Cuándo no usar» en español");
  assert.ok(checkbox.accessibility, "«Accesibilidad» en español");
  assert.equal(normalized.patterns.length, 1);
  assert.deepEqual([...normalized.patterns[0].components].sort(), ["button", "checkbox", "modal"]);
  assert.ok(normalized.patterns[0].layout);
  assert.equal(normalized.tokens.length, 2);
  assert.equal(normalized.documentation.versioning_present, true);
});

test("página armada con JavaScript: el componente queda 'no se pudo leer', no 'mal documentado'", async () => {
  const site = {
    [`${O}/sitemap.xml`]: { type: "application/xml", body: `<urlset><url><loc>${O}/components/a/usage</loc></url></urlset>` },
    [`${O}/`]: { body: "<div id=root></div><script src=app.js></script>" },
    [`${O}/components/a/usage`]: { body: "<div id=root></div><script src=app.js></script>" },
  };
  const { report } = await evaluateUrl(`${O}/`, { weights, rules, fetchImpl: fakeFetch(site), ssrfCheck: null });
  assert.equal(report.dimensions.D3.score, null);
  assert.equal(report.dimensions.D4.score, null);
  assert.equal(report.dimensions.D6.score, null);
});

test("un sitio que no es un Design System no inventa componentes", async () => {
  const site = {
    [`${O}/sitemap.xml`]: { type: "application/xml", body: `<urlset>${["/", "/blog/a", "/about", "/pricing"].map((p) => `<url><loc>${O}${p}</loc></url>`).join("")}</urlset>` },
    [`${O}/`]: { body: `<nav><a href="/blog/a">Blog</a><a href="/about">About</a></nav><h1>Acme</h1><p>We sell shoes online.</p>` },
    [`${O}/blog/a`]: { body: "<h1>Post</h1><p>Hello.</p>" },
    [`${O}/about`]: { body: "<h1>About</h1><p>Us.</p>" },
  };
  const { normalized, report } = await evaluateUrl(`${O}/`, { weights, rules, fetchImpl: fakeFetch(site), ssrfCheck: null });
  assert.equal(normalized.components.length, 0);
  assert.equal(normalized.patterns.length, 0);
  assert.equal(report.dimensions.D3.score, null);
});

// ---------- etapa 2 en vivo ----------

test("en vivo: lo que vive en Storybook/repositorio queda fuera de la nota; llms.txt ausente queda 'No existe'", async () => {
  const site = { ...SITE };
  // Sin tablas de propiedades en ningún lado:
  site[`${O}/components/button/code`] = { body: page("Button", `<p>See Storybook.</p><a href="https://react.ds.test/storybook/?path=/docs/button">Storybook</a>`) };
  site[`${O}/components/checkbox/usage`] = { body: page("Checkbox", "<p>Pick several options.</p>") };
  const { report } = await evaluateUrl(`${O}/`, { weights, rules, fetchImpl: fakeFetch(site), ssrfCheck: null });
  const d3 = report.dimensions.D3.sub_criteria;
  assert.equal(d3.props_documented.status, "NOT_EVALUABLE");
  assert.equal(d3.props_documented.reason, "EXTERNAL_NOT_READ");
  assert.equal(report.dimensions.D1.sub_criteria.component_index.status, "NOT_EVALUABLE");
  assert.equal(report.dimensions.D1.sub_criteria.agent_manifest.status, "ABSENT");
  assert.equal(report.dimensions.D6.sub_criteria.executable_examples.status, "NOT_EVALUABLE");
  assert.ok(report.overview.evaluable_share < 1);
});

test("tokens: si no se leyó ninguna página de tokens, no se afirma que falten", async () => {
  const site = {
    [`${O}/components/button/`]: { body: `<nav><a href="/components/button/">Button</a></nav><h1>Button</h1><p>Buttons trigger an action.</p>` },
  };
  const { report, normalized } = await evaluateUrl(`${O}/components/button/`, { weights, rules, fetchImpl: fakeFetch(site), ssrfCheck: null });
  assert.equal(normalized.metadata.tokens_status, "NOT_EVALUABLE");
  assert.equal(report.dimensions.D2.score, null);
});

test("tokens: si se leyó la página de tokens y no hay nada, es 'no encontrado'", async () => {
  const site = {
    ...SITE,
    [`${O}/foundations/color`]: { body: page("Color", "<p>We use blue a lot.</p>") },
  };
  const { normalized, report } = await evaluateUrl(`${O}/`, { weights, rules, fetchImpl: fakeFetch(site), ssrfCheck: null });
  assert.equal(normalized.metadata.tokens_status, "NOT_FOUND");
  assert.equal(report.dimensions.D2.score, 0);
});

test("el servidor envía cómo se encontró el Design System", async () => {
  const r = await crawl(`${O}/components/button/usage`, {}, fakeFetch(SITE));
  const d = publicDiscovery(r.discovery);
  assert.equal(d.method, "sitemap");
  assert.equal(d.components_found, 3);
  assert.ok(!("component_names_found" in d), "la lista completa de nombres no viaja al navegador");
});
