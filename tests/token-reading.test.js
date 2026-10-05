// Tokens: elegir bien qué páginas leer y reconocer las tablas de sistemas reales.
// Formatos copiados de lo publicado por Carbon y Fluent 2 (octubre 2026): en
// producción ambos daban D2 = 0 teniendo sus tokens publicados en tablas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateUrl } from "../engine/src/pipeline.js";
import { buildSample, classifyUrl, isDesignTokenUrl, tokenPageRank } from "../engine/src/crawler/siteMap.js";
import { extractTables, tokensFromTables, propsFromTables, isTokenName } from "../engine/src/extractor/readPage.js";

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
const FILLER = "<div class=\"nota\">Esta guía describe cómo se usa esta parte del sistema de diseño: su propósito, los casos en que conviene aplicarla, las alternativas disponibles y los criterios que el equipo ya decidió para mantener la coherencia entre productos.</div>";
const page = (title, inner) => `<html><body><nav><a href="/">Inicio</a></nav><main><h1>${title}</h1>${inner}${FILLER}</main></body></html>`;
const table = (headers, rows) =>
  `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

// ---------- A) qué páginas se eligen ----------

// Lista de fundamentos como la que publica Carbon en su llms.txt.
const C = "https://carbon.test";
const CARBON_LIKE = [
  "/getting-started/carbon-mcp/token-conservation",
  "/building-blocks/data-visualization/color-palettes",
  "/building-blocks/foundations/2x-grid",
  "/building-blocks/foundations/accessibility",
  "/building-blocks/foundations/carbon-for-ai",
  "/building-blocks/foundations/color",
  "/building-blocks/foundations/content",
  "/building-blocks/foundations/icons",
  "/building-blocks/foundations/motion",
  "/building-blocks/foundations/pictograms",
  "/building-blocks/foundations/spacing",
  "/building-blocks/foundations/themes",
  "/building-blocks/foundations/typography",
].map((p) => C + p);

test("una página de tokens de IA o de acceso no es una página de tokens de diseño", () => {
  assert.equal(isDesignTokenUrl(`${C}/getting-started/carbon-mcp/token-conservation`), false);
  assert.equal(classifyUrl(`${C}/getting-started/carbon-mcp/token-conservation`), "other");
  assert.equal(isDesignTokenUrl("https://x.test/docs/auth/access-tokens"), false);
  assert.equal(isDesignTokenUrl("https://x.test/guides/llm/token-limits"), false);
  // Las de diseño siguen contando, con cualquiera de sus nombres habituales.
  for (const u of ["https://x.test/design-tokens/", "https://x.test/color-tokens/", "https://x.test/styles/elevation/tokens", "https://x.test/tokens.json", "https://x.test/foundations/tokens/color"]) {
    assert.equal(isDesignTokenUrl(u), true, u);
    assert.equal(classifyUrl(u), "tokens", u);
  }
  // Una página de fundamentos sigue siendo "tokens" aunque esté en una sección de IA.
  assert.equal(classifyUrl(`${C}/building-blocks/foundations/carbon-for-ai`), "tokens");
});

test("la muestra de tokens prefiere color, espaciado, temas y tipografía al orden alfabético", () => {
  const { sample, counts, reserves } = buildSample(CARBON_LIKE, { rootUrl: `${C}/` });
  const picked = sample.filter((u) => u !== `${C}/`);
  assert.deepEqual(picked, [
    `${C}/building-blocks/foundations/color`,
    `${C}/building-blocks/foundations/spacing`,
    `${C}/building-blocks/foundations/themes`,
    `${C}/building-blocks/foundations/typography`,
  ]);
  assert.equal(counts.token_pages_found, 12, "la de tokens de IA no cuenta");
  assert.ok(!reserves.tokens.includes(`${C}/getting-started/carbon-mcp/token-conservation`));
  // Las reservas siguen el mismo orden: primero lo más parecido a tokens.
  assert.equal(reserves.tokens[0], `${C}/building-blocks/data-visualization/color-palettes`);
});

test("las direcciones que dicen 'tokens' van antes que las de fundamentos", () => {
  const F = "https://fluent.test";
  const urls = ["/accessibility/", "/color/", "/color-tokens/", "/design-tokens/", "/elevation/", "/typography/"].map((p) => F + p);
  const picked = buildSample(urls, { rootUrl: `${F}/` }).sample.slice(1);
  assert.deepEqual(picked, [`${F}/color-tokens/`, `${F}/design-tokens/`, `${F}/color/`, `${F}/typography/`]);
  assert.ok(tokenPageRank(`${F}/color-tokens/`) < tokenPageRank(`${F}/color/`));
  assert.ok(tokenPageRank(`${F}/color/`) < tokenPageRank(`${F}/elevation/`));
  assert.ok(tokenPageRank(`${F}/elevation/`) < tokenPageRank(`${F}/accessibility/`));
});

// ---------- B) qué tablas se reconocen ----------

test("nombres de token: con prefijo, con guiones o puntos, y camelCase", () => {
  for (const n of ["$background", "$layer-background-01", "--color-bg", "@spacing", "color-blue-10", "color.text.primary", "colorNeutralBackground1", "fontSizeBase300"])
    assert.equal(isTokenName(n), true, n);
  for (const n of ["Background", "Rest", "White", "Gray 10", "background", "12", "", "Token"]) assert.equal(isTokenName(n), false, n);
});

test("Carbon, página de color: columna 'Hex value' y nombre de una sola palabra con $", () => {
  const html = table(["Theme", "Primary background", "Token", "Hex value", ""], [
    ["White", "Global background light", "<code>$background</code>", "<code>#ffffff</code>", ""],
    ["Gray 10", "Global background light", "<code>$background</code>", "<code>#f4f4f4</code>", ""],
    ["Gray 90", "Global background dark", "<code>$background</code>", "<code>#262626</code>", ""],
  ]);
  const tokens = tokensFromTables(extractTables(html));
  assert.deepEqual(tokens, [{ name: "$background", value: "#ffffff", description: null }]);
});

test("Carbon, pestaña Tokens: 'Token | Role | Value' y el rol queda como descripción", () => {
  const html = table(["Token", "Role", "Value"], [
    ["<code>$background</code>", "Default page background;UI Shell base color", "White—#ffffff <button>Options</button>"],
    ["<code>$layer-01</code>", "Container color on $background", "Gray 10—#f4f4f4 <button>Options</button>"],
  ]);
  const tokens = tokensFromTables(extractTables(html));
  assert.deepEqual(tokens.map((t) => t.name), ["$background", "$layer-01"]);
  assert.equal(tokens[0].value, "White—#ffffff", "el texto del botón no es parte del valor");
  assert.equal(tokens[0].description, "Default page background;UI Shell base color");
});

test("Carbon, espaciado: el valor está en columnas 'rem' y 'px'", () => {
  const html = table(["Token", "rem", "px", "Example"], [["<code>$spacing-01</code>", "0.125", "2", "<img src='a.svg'>"], ["<code>$spacing-02</code>", "0.25", "4", ""]]);
  assert.deepEqual(tokensFromTables(extractTables(html)), [
    { name: "$spacing-01", value: "0.125", description: null },
    { name: "$spacing-02", value: "0.25", description: null },
  ]);
});

// Fluent 2: un único encabezado con tres rótulos; cada token ocupa una fila con
// su nombre y otra debajo con los valores por estado (claro y oscuro).
const fluentState = (state, light, dark) => `<div><button>Copy alias name</button> <span>${state}</span> <span>${light}</span> <span>${dark}</span></div>`;
const FLUENT_TABLE = `<h2>Neutral Background</h2><table>
  <thead><tr><th><div>Alias token</div> <div>Global token light</div> <div>Global token dark</div></th></tr></thead>
  <tbody>
    <tr><td colspan="3">colorNeutralBackground1</td></tr>
    <tr><td colspan="3">${fluentState("Rest", "white", "grey[16]")} ${fluentState("Hover", "grey[96]", "grey[24]")}</td></tr>
    <tr><td>colorNeutralBackground2</td><td></td><td></td></tr>
    <tr><td>${fluentState("Rest", "grey[98]", "grey[12]")}</td><td></td><td></td></tr>
    <tr><td colspan="3">colorNeutralBackgroundStatic</td></tr>
  </tbody></table>`;

test("Fluent 2: tabla agrupada (fila con el nombre, fila siguiente con los valores)", () => {
  const tokens = tokensFromTables(extractTables(FLUENT_TABLE));
  assert.deepEqual(tokens.map((t) => t.name), ["colorNeutralBackground1", "colorNeutralBackground2"], "el último no trae valor: no se inventa");
  assert.equal(tokens[0].value, "Rest white grey[16] Hover grey[96] grey[24]");
  assert.equal(tokens[1].value, "Rest grey[98] grey[12]");
});

test("lo que no es una tabla de tokens no se lee como tokens", () => {
  const none = (html) => assert.deepEqual(tokensFromTables(extractTables(html)), []);
  // Carbon: "grupos de tokens" y glosario.
  none(table(["Token group", "Applied to"], [["Background", "Page or primary backgrounds"], ["Layer", "Stacked backgrounds"]]));
  none(table(["Term", "Definition"], [["Theme", "A theme is a collection of colors."], ["Token", "A token is the role-based identifier."]]));
  // Tabla de contraste: sin columna de token.
  none(table(["Color 1", "Color 2 (4.5:1 contrast)"], [["Black", "50 through White"], ["100", "50 through White"]]));
  // Tabla de propiedades de un componente (nombre + tipo + valor por defecto).
  const props = table(["Name", "Type", "Default", "Description"], [["onClick", "function", "—", "Runs on click"], ["isDisabled", "boolean", "false", "Disables it"]]);
  none(props);
  assert.equal(propsFromTables(extractTables(props)).length, 2, "sigue leyéndose como propiedades");
  // Una fila suelta con una palabra común no es un token.
  none(`<table><thead><tr><th>Design token</th></tr></thead><tbody><tr><td>Background</td></tr><tr><td>white</td></tr></tbody></table>`);
});

// ---------- de punta a punta ----------

const E = "https://ds.test";
const foundations = ["2x-grid", "accessibility", "color", "content", "spacing"];
const SITE = {
  [`${E}/llms.txt`]: {
    type: "text/plain",
    body: `# DS\n- [Token conservation](${E}/getting-started/ds-mcp/token-conservation)\n` +
      foundations.map((f) => `- [${f}](${E}/foundations/${f})`).join("\n") +
      `\n- [Button](${E}/components/button/usage)\n`,
  },
  [`${E}/`]: { body: page("Our DS", "<p>Welcome to the design system of the example company.</p>") },
  [`${E}/getting-started/ds-mcp/token-conservation`]: { body: page("Token conservation", "<p>Reduce the tokens an AI model consumes by sending less context.</p>") },
  [`${E}/foundations/2x-grid`]: { body: page("2x Grid", "<p>The grid is the geometric foundation of every layout.</p>") },
  [`${E}/foundations/accessibility`]: { body: page("Accessibility", "<p>Accessible design lets everyone use the product.</p>") },
  [`${E}/foundations/content`]: { body: page("Content", "<p>Write clearly and concisely.</p>") },
  [`${E}/foundations/color`]: {
    body: page("Color", `<a href="/foundations/color/tokens">Tokens</a><a href="/foundations/color/code">Code</a><p>Color tokens assign a role to each color.</p>` +
      table(["Theme", "Token", "Hex value"], [["White", "<code>$background</code>", "#ffffff"]])),
  },
  [`${E}/foundations/color/tokens`]: {
    body: page("Color tokens", table(["Token", "Role", "Value"], [
      ["<code>$background</code>", "Default page background", "White—#ffffff"],
      ["<code>$layer-01</code>", "Container color on $background", "Gray 10—#f4f4f4"],
      ["<code>$text-primary</code>", "Primary text", "Gray 100—#161616"],
    ])),
  },
  [`${E}/foundations/spacing`]: { body: page("Spacing", table(["Token", "rem", "px"], [["<code>$spacing-01</code>", "0.125", "2"], ["<code>$spacing-02</code>", "0.25", "4"]])) },
  [`${E}/components/button/usage`]: { body: page("Button", "<p>Buttons trigger an action.</p><h2>When to use</h2><p>Use a button to submit a form.</p>") },
};

test("un sistema con sus tokens en tablas ya no sale con D2 en 0", async () => {
  const log = [];
  const { report, sources } = await evaluateUrl(`${E}/`, { weights, rules, fetchImpl: fakeFetch(SITE, log), ssrfCheck: null });
  assert.ok(log.includes(`${E}/foundations/color`), "lee la página de color");
  assert.ok(log.includes(`${E}/foundations/spacing`), "lee la de espaciado");
  assert.ok(log.includes(`${E}/foundations/color/tokens`), "sigue la pestaña Tokens de la página de color");
  assert.ok(!log.includes(`${E}/foundations/color/code`), "no sigue otras pestañas");
  assert.ok(!log.includes(`${E}/getting-started/ds-mcp/token-conservation`), "la página de tokens de IA no ocupa un lugar de la muestra");
  const tab = sources.find((i) => i.url === `${E}/foundations/color/tokens`);
  assert.equal(tab.status, "READ");
  assert.equal(tab.role, "link");

  const d2 = report.dimensions.D2;
  // "PARTIAL": desde una tabla no se puede saber si hay modos ni la relación
  // primitivo → semántico; esos dos criterios quedan fuera de la nota.
  assert.equal(d2.status, "PARTIAL");
  assert.ok(d2.score > 0, `D2 debe sumar algo, dio ${d2.score}`);
  assert.equal(d2.sub_criteria.tokens_identifiable.status, "FOUND");
  assert.equal(report.overview.coverage.tokens_detected, 5, "$background, $layer-01, $text-primary, $spacing-01, $spacing-02");
  assert.ok(d2.sub_criteria.color_coverage.points > 0);
  assert.ok(d2.sub_criteria.spacing_sizing_coverage.points > 0);
  // 3 de 5 con su rol: $background lo toma de la pestaña Tokens aunque se vio antes en el resumen.
  assert.equal(d2.sub_criteria.intent_documentation.points, 3, "la columna Role cuenta como intención documentada");
  // Publicarlos en una tabla HTML no es publicarlos en un formato estructurado.
  assert.equal(d2.sub_criteria.structured_format.points, 0);
});

test("si las páginas de tokens se leyeron y no traen tablas, sigue siendo 'no encontrado' (0)", async () => {
  const site = { ...SITE };
  delete site[`${E}/foundations/color/tokens`];
  site[`${E}/foundations/color`] = { body: page("Color", "<p>Color brings the brand to life across every product surface.</p>") };
  site[`${E}/foundations/spacing`] = { body: page("Spacing", "<p>Spacing creates rhythm between the elements of a layout.</p>") };
  const { report } = await evaluateUrl(`${E}/`, { weights, rules, fetchImpl: fakeFetch(site), ssrfCheck: null });
  assert.equal(report.dimensions.D2.score, 0);
  assert.equal(report.dimensions.D2.status, "EVALUATED");
});
