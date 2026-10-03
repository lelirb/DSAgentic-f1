// Regresión de las correcciones surgidas de las primeras corridas en vivo
// (Apple HIG, Fluent 2, Carbon). Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { crawl } from "../engine/src/crawler/crawl.js";
import { buildSample } from "../engine/src/crawler/siteMap.js";
import { detectAccess, isUtilityFile } from "../engine/src/extractor/detectAccess.js";
import { normalize } from "../engine/src/extractor/normalize.js";

function fakeFetch(routes, calls = []) {
  return async (url) => {
    calls.push(url);
    const r = routes[url];
    if (!r) return mkRes(404, "text/plain", "not found");
    return mkRes(r.status ?? 200, r.type ?? "text/html", r.body ?? "");
  };
}
function mkRes(status, type, body) {
  const headers = new Map([["content-type", type]]);
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get: (k) => headers.get(k) ?? null },
    body: null, text: async () => body,
  };
}
const FILLER = "<div class=\"nota\">Esta guía describe cómo usar el componente dentro del sistema de diseño: su propósito, los casos en que conviene elegirlo, las alternativas disponibles y los criterios que el equipo ya decidió. El texto es de relleno, pero tiene la extensión de una página de documentación real.</div>";
const page = (title, extra = "") =>
  `<html><body><h1>${title}</h1><p>Texto de documentación suficientemente largo para contar como legible.</p>${extra}${FILLER}</body></html>`;

// ---------- Fluent 2: la raíz adivinada no debe descartar el sistema ----------

test("una entrada profunda no descarta el resto del sistema listado en el sitemap", async () => {
  const origin = "https://ds.example.com";
  const listed = [
    `${origin}/components/web/react/core/button/usage/`,
    `${origin}/components/web/react/core/checkbox/usage/`,
    `${origin}/design-tokens/`,
    `${origin}/design-principles/`,
  ];
  const routes = {
    [`${origin}/design-principles`]: { body: page("Design principles") },
    [`${origin}/robots.txt`]: { type: "text/plain", body: `Sitemap: ${origin}/sitemap.xml` },
    [`${origin}/sitemap.xml`]: {
      type: "application/xml",
      body: `<urlset>${listed.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`,
    },
  };
  for (const u of listed) routes[u] = { body: page(u.split("/").filter(Boolean).pop()) };

  const res = await crawl(`${origin}/design-principles`, { max_pages: 20 }, fakeFetch(routes));

  assert.equal(res.discovery.root_widened_from, `${origin}/design-principles/`);
  assert.equal(res.discovery.root_url, `${origin}/`);
  assert.ok(res.discovery.components_found >= 2, `esperaba componentes, hubo ${res.discovery.components_found}`);
  assert.ok(
    res.pages.some((p) => p.url.includes("/button/")),
    "las páginas de componentes del sitemap deben leerse, no descartarse"
  );
});

// ---------- Carbon: una candidata caída no es evidencia de ausencia ----------

test("si una página de tokens da 404 se prueba la siguiente candidata de la lista", async () => {
  const origin = "https://carbon.example.com";
  const listed = [
    `${origin}/components/breadcrumb/usage/`,
    `${origin}/components/button/usage/`,
    `${origin}/foundations/color/overview/`, // 404, como en el llms.txt real
    `${origin}/foundations/grid/overview/`, // 404
    `${origin}/foundations/spacing/overview/`, // reserva viva
    `${origin}/foundations/themes/overview/`, // reserva viva
  ];
  const routes = {
    [`${origin}/`]: { body: page("Inicio") },
    [`${origin}/llms.txt`]: { type: "text/plain", body: listed.map((u) => `- [x](${u})`).join("\n") },
  };
  for (const u of listed) routes[u] = { body: page(u) };
  delete routes[`${origin}/foundations/color/overview/`];
  delete routes[`${origin}/foundations/grid/overview/`];

  const calls = [];
  const res = await crawl(`${origin}/`, { max_pages: 30 }, fakeFetch(routes, calls));

  assert.ok(
    calls.some((u) => u.includes("/foundations/spacing/") || u.includes("/foundations/themes/")),
    "tras los 404 debe intentarse otra página de fundamentos"
  );
  assert.ok(
    res.pages.some((p) => p.url.includes("/foundations/")),
    "debe quedar al menos una página de fundamentos leída"
  );
});

test("sin ninguna página de fundamentos leída, los tokens quedan NOT_EVALUABLE y no en 0", () => {
  const crawlResult = {
    pages: [{ url: "https://x.com/data-visualization/color-palettes/", contentType: "text/html", body: page("Paletas") }],
    pageRecords: [
      { url: "https://x.com/data-visualization/color-palettes/", status: "CRAWLED" },
      { url: "https://x.com/foundations/color/overview/", status: "FAILED" },
    ],
    stats: { pages_found: 2, pages_retrieved: 1, pages_failed: 1, crawl_limited: false },
    discovery: null,
  };
  const input = normalize("https://x.com/", crawlResult, {}, [], []);
  assert.equal(input.metadata.tokens_status, "NOT_EVALUABLE");
});

// ---------- Recuperabilidad: no premiar archivos técnicos ----------

test("robots.txt y sitemap no cuentan como documentación recuperada", () => {
  assert.equal(isUtilityFile("https://x.com/robots.txt"), true);
  assert.equal(isUtilityFile("https://x.com/sitemap-0.xml"), true);
  assert.equal(isUtilityFile("https://x.com/components/button/usage/"), false);

  const crawlResult = {
    pages: [
      { url: "https://x.com/robots.txt", contentType: "text/plain", body: "User-agent: *" },
      { url: "https://x.com/sitemap-0.xml", contentType: "application/xml", body: "<urlset/>" },
      { url: "https://x.com/sitemap-index.xml", contentType: "application/xml", body: "<urlset/>" },
      { url: "https://x.com/design-principles", contentType: "text/html", body: page("Principios") },
    ],
    pageRecords: [
      { url: "https://x.com/robots.txt", status: "CRAWLED" },
      { url: "https://x.com/sitemap-0.xml", status: "CRAWLED" },
      { url: "https://x.com/sitemap-index.xml", status: "CRAWLED" },
      { url: "https://x.com/design-principles", status: "CRAWLED" },
    ],
  };
  const access = detectAccess(crawlResult);
  // Antes: 4/4 -> FULLY_RECOVERABLE (15/15 puntos por tener robots.txt).
  // Ahora el denominador es 1 página de documentación real, que sí es legible.
  assert.equal(access.documentation_recoverability, "FULLY_RECOVERABLE");

  const soloTecnicos = { pages: crawlResult.pages.slice(0, 3), pageRecords: crawlResult.pageRecords.slice(0, 3) };
  assert.equal(
    detectAccess(soloTecnicos).documentation_recoverability, null,
    "sin páginas de documentación intentadas no se puede puntuar el criterio"
  );
});

test("una página que solo se arma con JavaScript no aprueba el criterio de HTML del servidor", () => {
  const shell = "<html><body><div id=\"app\"></div><noscript>This page requires JavaScript.</noscript></body></html>";
  const crawlResult = {
    pages: [{ url: "https://apple.example.com/design/hig/", contentType: "text/html", body: shell }],
    pageRecords: [{ url: "https://apple.example.com/design/hig/", status: "CRAWLED" }],
  };
  assert.equal(detectAccess(crawlResult).documentation_recoverability, "NOT_RECOVERABLE");
});

// ---------- buildSample expone reservas ----------

test("buildSample devuelve candidatas de reserva que no están en la muestra", () => {
  const urls = [];
  for (let i = 0; i < 20; i++) urls.push(`https://x.com/components/c${i}/usage/`);
  urls.push("https://x.com/foundations/color/overview/", "https://x.com/foundations/spacing/overview/");
  const { sample, reserves } = buildSample(urls, { rootUrl: "https://x.com/", maxPages: 40 });
  const inSample = new Set(sample);
  assert.ok(reserves.component.length > 0, "con 20 componentes y un límite de 8 debe haber reservas");
  for (const u of [...reserves.component, ...reserves.tokens]) {
    assert.ok(!inSample.has(u), `la reserva ${u} no debe estar ya en la muestra`);
  }
});

// ---------- Apple HIG: la puerta alternativa cuando el HTML viene vacío ----------

test("una página que se arma con JavaScript se recupera por su gemela legible", async () => {
  const origin = "https://developer.example.com";
  const hig = `${origin}/design/human-interface-guidelines`;
  const shell = `<html><body><div id="app" data-bundle="com.apple.HIG"></div>
    <noscript>This page requires JavaScript.</noscript></body></html>`;
  const md = [
    "# Human Interface Guidelines",
    "",
    "Guia de diseño para todas las plataformas, con criterios de uso por componente.",
    "",
    "## Temas",
    "",
    `- [Buttons](${origin}/design/human-interface-guidelines/buttons)`,
    `- [Layout](${origin}/design/human-interface-guidelines/layout)`,
  ].join("\n");

  const routes = {
    [hig]: { body: shell },
    [`${origin}/tutorials/data/design/human-interface-guidelines.md`]: { type: "text/markdown", body: md },
    [`${origin}/design/human-interface-guidelines/buttons`]: { body: shell },
    [`${origin}/tutorials/data/design/human-interface-guidelines/buttons.md`]: {
      type: "text/markdown",
      body: "# Buttons\n\nUsá un botón para iniciar una accion inmediata en la interfaz.\n\n## Cuando usarlo\n\n- Para confirmar una accion.",
    },
  };

  const res = await crawl(hig, { max_pages: 10 }, fakeFetch(routes));
  const entry = res.pages.find((p) => p.url === hig);

  assert.ok(entry, "la pagina de entrada debe quedar registrada");
  assert.match(entry.body, /Human Interface Guidelines/, "debe traer el contenido recuperado, no el cascaron");
  assert.equal(entry.recovered_from, `${origin}/tutorials/data/design/human-interface-guidelines.md`);
  assert.ok(
    res.pages.some((p) => p.url.includes("/buttons")),
    "los enlaces del contenido recuperado permiten seguir recorriendo el sistema"
  );
  const fuente = res.sources.find((s) => s.reason === "RECOVERED_DOCC");
  assert.ok(fuente, "el informe debe poder mostrar por que puerta entro");
});

test("sin puerta alternativa, un cascaron sigue contando como ilegible", async () => {
  const origin = "https://spa.example.com";
  const shell = "<html><body><div id=\"root\"></div></body></html>";
  const res = await crawl(`${origin}/ds`, { max_pages: 5 }, fakeFetch({ [`${origin}/ds`]: { body: shell } }));
  const { detectAccess: da } = await import("../engine/src/extractor/detectAccess.js");
  assert.equal(da(res).documentation_recoverability, "NOT_RECOVERABLE");
});

// ---------- Fuentes oficiales: el Storybook que el sistema declara ----------

test("el indice del Storybook declarado en el llms.txt se lee y cuenta como indice de componentes", async () => {
  const origin = "https://carbon.example.com";
  const sb = "https://react.carbon.example.com";
  const listed = [`${origin}/components/button/usage/`, `${origin}/components/tag/usage/`];
  const routes = {
    [`${origin}/`]: { body: page("Inicio") },
    [`${origin}/llms.txt`]: {
      type: "text/plain",
      body: [
        ...listed.map((u) => `- [x](${u})`),
        `- [Storybook (React)](${sb}/): Interactive component demos`,
      ].join("\n"),
    },
    [`${sb}/index.json`]: {
      type: "application/json",
      body: JSON.stringify({
        v: 5,
        entries: {
          "components-button--primary": { title: "Components/Button", name: "Primary" },
          "components-tag--default": { title: "Components/Tag", name: "Default" },
          "components-modal--basic": { title: "Components/Modal", name: "Basic" },
        },
      }),
    },
  };
  for (const u of listed) routes[u] = { body: page(u) };

  const res = await crawl(`${origin}/`, { max_pages: 20 }, fakeFetch(routes));

  const declarado = res.discovery.official_sources.find((s) => s.kind === "storybook");
  assert.ok(declarado, "el Storybook declarado en el llms.txt debe detectarse");
  assert.equal(declarado.status, "READ");
  assert.equal(declarado.components, 3);

  const access = detectAccess(res, { components: [], tokens: [] });
  assert.equal(
    access.component_index, "COMPLETE",
    "leer el indice del Storybook es lo que demuestra el criterio: antes daba NONE con el indice publicado"
  );
});

test("una fuente oficial que no se puede leer queda declarada, no ausente", async () => {
  const origin = "https://ds.example.com";
  const routes = {
    [`${origin}/`]: { body: page("Inicio", '<a href="https://github.com/acme/ds">Repo</a>') },
  };
  const res = await crawl(`${origin}/`, { max_pages: 5 }, fakeFetch(routes));
  const repo = res.discovery.official_sources.find((s) => s.kind === "repository");
  assert.ok(repo, "el repositorio enlazado debe quedar registrado");
  assert.notEqual(repo.status, "READ");
  assert.ok(
    res.discovery.official_sources.some((s) => s.url === repo.url),
    "el informe debe poder decir 'declarada pero no leida', no tratarla como ausente"
  );
});

// ---------- Bandas y redondeo ----------

test("el numero que se muestra y la tabla de bandas nunca se contradicen", async () => {
  const { readinessLevel, round5 } = await import("../engine/src/evaluator/utils.js");
  const fs = await import("node:fs");
  const levels = JSON.parse(fs.readFileSync("engine/config/rules.json", "utf-8")).readiness_levels;

  // Todo corte de banda debe ser multiplo de 5: el score se muestra redondeado a
  // multiplos de 5, asi que un corte en 26 o en 76 hace que el nivel nunca caiga
  // donde dice la tabla (con los cortes viejos, un 76 -Operable- salia 75 e
  // Interpretable: la banda superior quedaba fuera de alcance).
  for (const l of levels) {
    assert.equal(l.min % 5, 0, `el corte ${l.min} (${l.label}) no es multiplo de 5`);
  }

  // Para cualquier score crudo, el nivel debe corresponder al numero MOSTRADO.
  for (let raw = 0; raw <= 100; raw += 0.25) {
    const shown = round5(raw);
    const band = levels.find((l) => shown >= l.min && shown <= l.max);
    assert.ok(band, `el numero mostrado ${shown} no cae en ninguna banda`);
    assert.equal(readinessLevel(shown, levels), band.label);
  }
});

test("readinessLevel nunca cae a la peor banda por no encontrar uno", async () => {
  const { readinessLevel } = await import("../engine/src/evaluator/utils.js");
  const levels = [
    { min: 0, max: 24, label: "Opaco" },
    { min: 25, max: 49, label: "Legible" },
    { min: 50, max: 74, label: "Interpretable" },
    { min: 75, max: 100, label: "Operable" },
  ];
  // Valores que antes caian en los huecos entre bandas y volvian "Opaco".
  assert.equal(readinessLevel(75.5, levels), "Operable");
  assert.equal(readinessLevel(49.9, levels), "Legible");
  assert.equal(readinessLevel(24.99, levels), "Opaco");
  assert.equal(readinessLevel(100, levels), "Operable");
  assert.equal(readinessLevel(NaN, levels), null);
});
