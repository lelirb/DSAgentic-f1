import {
  extractHeadings,
  extractCodeBlocks,
  extractFirstParagraphAfterHeading,
  extractSectionByLabel,
  extractRestrictions,
  extractDisambiguationSignals,
  APOSTROPHE,
} from "./parseHtml.js";
import {
  VOCAB, visibleTextLength, extractSections, sectionText, extractTables, propsFromTables,
  variantsFrom, statesFrom, hasSection, liveDemoCount, restrictionsFrom, disambiguationFrom,
} from "./readPage.js";

// Menos texto visible que esto = página armada con JavaScript (no legible).
const MIN_VISIBLE_TEXT = 40;

function emptyComponent(name, source, evidenceIds, extra = {}) {
  return {
    name, source, description: null, props: [], variants: [], states: [], usage: {},
    composition: [], accessibility: null, code_examples_count: 0, executable_examples_count: 0,
    evidence_ids: evidenceIds, ...extra,
  };
}

// Section 44 (build spec) / section 2 (correction prompt): conservative. v0.1 does
// NOT attempt to parse prop tables, variants, or states from arbitrary HTML — that
// requires structure we can't reliably infer with regex alone, and inventing it
// would violate section 5.5. It only captures what's safely extractable: name, a
// best-effort description, and code examples. props/variants/states/usage arrive
// empty here on purpose; a real Storybook/JSON adapter is the correct place to
// fill those in (documented as a known limitation, not silently worked around).
//
// Correction prompt section 8: "NO convertir heurísticas de URL en evidencia de
// contenido" — a URL containing /components/ is necessary but not sufficient; we
// also exclude generic listing/index pages by filename, and still require the
// page to actually have a heading before treating it as documenting one component.
//
// PRUEBA CONTRA DS REALES (2026-09-05): la lista original solo reconocía /components?/,
// que cubre Carbon, Polaris y la mayoría de sitios estilo Storybook — pero NO cubre
// Material UI, que usa la convención /react-<nombre>/ (ej. /material-ui/react-button/)
// sin la palabra "component" en ningún segmento de la URL. Contra HTML real de MUI,
// esto producía 0 componentes detectados pese a que la página es una de las docs de
// componente más completas que existen. Se amplía a una lista explícita de
// convenciones DOCUMENTADAS y verificadas contra sitios reales — sigue siendo un
// allowlist finito, no un intento de detectar "cualquier" convención posible; ese
// problema general requeriría cruzar contra un índice real de componentes
// (D1.2), que detectComponents() no recibe hoy como input.
const COMPONENT_URL_PATTERNS = [
  /\/components?\//i, // Carbon, Polaris, Storybook-style: /components/button/
  /\/react-[a-z0-9-]+\/?$/i, // Material UI: /material-ui/react-button/
];
const NON_COMPONENT_SLUGS = new Set([
  "",
  "index",
  "overview",
  "components",
  "guidelines",
  "getting-started",
  // PRUEBA CONTRA DS REALES (2026-09-11, prueba en vivo contra fluent2.microsoft.design):
  // Fluent 2 publica páginas de PLATAFORMA bajo /components/ (web/react, ios,
  // android, windows) que listan muchos componentes cada una — se detectaban
  // como si fueran, ellas mismas, un componente ("react", "ios", "android",
  // "windows"), igual que ya pasó con el índice bare "/components/" de Carbon.
  // Un componente real de Fluent vive más profundo, ej.
  // /components/web/react/core/button/usage — el segmento final ahí es "usage"
  // (sufijo de pestaña), no "react", así que excluir estos nombres de
  // plataforma no afecta la detección de componentes reales.
  "web",
  "react",
  "ios",
  "android",
  "windows",
]);

// PRUEBA CONTRA DS REALES (2026-09-05, hallazgo adicional al validar Hallazgo 4
// contra el HTML real de Carbon): Carbon publica CUATRO páginas por componente
// bajo el mismo nombre — /components/button/usage/, /style/, /code/,
// /accessibility — que son cuatro VISTAS del mismo componente, no cuatro
// componentes distintos. Sin deduplicar, D3/D4/D6 dividían entre 4 en vez de 1,
// diluyendo artificialmente cualquier score (ej. D4 component_selection pasó de
// 25/25 a 6.25/25 en la validación real, solo por este efecto). La identidad real
// del componente es el segmento ANTERIOR a estos sufijos de pestaña, no el
// último segmento de la URL.
//
// Confirmado que NO es exclusivo de Carbon: Atlassian Design System usa el mismo
// patrón con un sufijo DISTINTO — atlassian.design/components/button (principal)
// + atlassian.design/components/button/examples (pestaña separada). La lista de
// sufijos conocidos es un allowlist finito construido incrementalmente contra
// evidencia real, no una detección general — sigue siendo posible que otro DS use
// un sufijo que no está aquí todavía (ver limitación documentada abajo).
const TAB_SUFFIXES = new Set(["usage", "style", "code", "accessibility", "examples", "api", "props", "design", "guidelines", "overview", "uso", "estilo", "codigo", "código", "accesibilidad", "ejemplos", "diseno", "diseño"]);
// Cuando hay varias páginas para el mismo componente, se prefiere la que tenga
// más probabilidad de contener descripción/propósito en prosa; "examples" y
// "code" suelen ser solo snippets sin texto explicativo.
const TAB_PREFERENCE = ["usage", "uso", "overview", "guidelines", "design", "diseno", "diseño", "style", "estilo", "examples", "ejemplos", "code", "codigo", "código", "api", "props", "accessibility", "accesibilidad"];

// Hallazgo 4 (REAL_WORLD_VALIDATION.md): the real Carbon page fetched during
// validation had this exact labeled structure verbatim. English-only for now —
// no evidence yet of other phrasings in the DS actually tested; extending this
// list should be evidence-driven (another real DS confirmed to use different
// wording), not speculative.
const WHEN_TO_USE_PATTERNS = [/^when to use:?$/i, /^use when:?$/i];
const WHEN_NOT_TO_USE_PATTERNS = [/^when not to use:?$/i, /^do not use:?$/i, new RegExp(`^don${APOSTROPHE}?t use:?$`, "i")];

export function detectComponents(crawlResult, evidenceCollector) {
  const allComponentPages = crawlResult.pages.filter(
    (p) => /html/.test(p.contentType || "") && isLikelyComponentPage(p.url)
  );

  // Todas las pestañas (uso/estilo/código/accesibilidad…) de un mismo componente
  // se leen juntas. La página principal (para nombre y descripción) sigue siendo
  // la de "usage" si existe; una URL que ES el componente (sin sufijo) gana.
  const byIdentity = new Map();
  for (const page of allComponentPages) {
    const identity = componentIdentity(page.url);
    if (!byIdentity.has(identity)) byIdentity.set(identity, []);
    byIdentity.get(identity).push(page);
  }
  const rank = (url) => {
    const r = TAB_PREFERENCE.indexOf(lastSegment(url));
    return r === -1 ? -1 : r;
  };
  for (const list of byIdentity.values()) list.sort((a, b) => rank(a.url) - rank(b.url));
  const successfulIdentities = new Set([...byIdentity.keys()]);

  const found = [...byIdentity.values()].map((tabs) => {
    const page = tabs[0];
    const headings = extractHeadings(page.body);
    const name = headings[0] || pathToName(page.url);
    const readable = tabs.filter((t) => visibleTextLength(t.body) >= MIN_VISIBLE_TEXT || /<p\b[^>]*>\s*[^<\s]/i.test(t.body || ""));
    const evidenceIds = [];
    const ev = (entry) => {
      const id = evidenceCollector.add({ component: name, retrieval_method: "html", confidence: 0.6, ...entry });
      evidenceIds.push(id);
      return id;
    };

    if (readable.length === 0) {
      // La página existe pero su contenido se arma con JavaScript: no se pudo leer.
      ev({ source: page.url, location: null, content: null, type: "documentation", section: null, confidence: 0.4, status: "NOT_EVALUABLE" });
      return emptyComponent(name, page.url, evidenceIds, { evaluation_status: "NOT_EVALUABLE", unreadable_reason: "SCRIPT_RENDERED", tabs_read: tabs.map((t) => t.url) });
    }

    const description = extractFirstParagraphAfterHeading(page.body);
    let whenToUse = null, whenNotToUse = null;
    const restrictions = new Set();
    const disambiguation = [];
    const props = [];
    const variants = new Set();
    const states = new Set();
    let accessibility = null;
    const composition = [];
    let codeCount = 0;
    let liveCount = 0;

    for (const tab of readable) {
      const sections = extractSections(tab.body);
      const tabName = lastSegment(tab.url);
      whenToUse ||= extractSectionByLabel(tab.body, VOCAB.whenToUse) || sectionText(sections, VOCAB.whenToUse);
      whenNotToUse ||= extractSectionByLabel(tab.body, VOCAB.whenNotToUse) || sectionText(sections, VOCAB.whenNotToUse);
      for (const r of extractRestrictions(tab.body)) restrictions.add(r);
      for (const r of restrictionsFrom(tab.body)) restrictions.add(r);
      for (const d of [...disambiguationFrom(tab.body), ...extractDisambiguationSignals(tab.body)]) {
        if (!disambiguation.some((x) => x.rule === d.rule)) disambiguation.push({ rule: d.rule, competitor: d.competitor.toLowerCase() });
      }
      const tables = extractTables(tab.body);
      for (const p of propsFromTables(tables)) if (!props.some((x) => x.name === p.name)) props.push({ ...p, source: tab.url });
      for (const v of variantsFrom(sections, tab.body)) variants.add(v);
      for (const st of statesFrom(sections)) states.add(st);
      if (!accessibility && (tabName === "accessibility" || tabName === "accesibilidad" || hasSection(sections, VOCAB.accessibility))) {
        accessibility = { source: tab.url };
      }
      if (hasSection(sections, VOCAB.anatomy)) composition.push({ source: tab.url, section: "anatomy" });
      codeCount += extractCodeBlocks(tab.body).length;
      liveCount += liveDemoCount(tab.body);
    }
    // Una propiedad "variant"/"kind"/"type" con valores enumerados también documenta variantes.
    for (const p of props) {
      if (/^(variant|kind|appearance|type|intent|tone|color|size)$/i.test(p.name)) for (const v of p.allowed_values || []) variants.add(v);
    }

    if (description) ev({ source: page.url, location: `${name} > description`, content: description, type: "documentation", section: "description" });
    if (whenToUse) ev({ source: page.url, location: `${name} > when_to_use`, content: whenToUse, type: "usage_guideline", section: "when_to_use" });
    if (whenNotToUse) ev({ source: page.url, location: `${name} > when_not_to_use`, content: whenNotToUse, type: "usage_guideline", section: "when_not_to_use" });
    [...restrictions].forEach((r, i) => ev({ source: page.url, location: `${name} > restriction[${i}]`, content: r, type: "restriction", section: "restrictions" }));
    disambiguation.forEach((d, i) => ev({ source: page.url, location: `${name} > disambiguation[${i}]`, content: d.rule, type: "restriction", section: "disambiguation_rules", confidence: 0.5 }));
    props.forEach((p) => ev({ source: p.source, location: `${name} > props > ${p.name}`, content: JSON.stringify({ type: p.type, default: p.default }), type: "prop", section: "props", confidence: 0.7 }));
    if (variants.size) ev({ source: page.url, location: `${name} > variants`, content: [...variants].join(", "), type: "documentation", section: "variants" });
    if (states.size) ev({ source: page.url, location: `${name} > states`, content: [...states].join(", "), type: "documentation", section: "states" });
    if (accessibility) ev({ source: accessibility.source, location: `${name} > accessibility`, content: null, type: "accessibility", section: "accessibility" });
    for (let i = 0; i < codeCount; i++) ev({ source: page.url, location: `${name} > example[${i}]`, content: null, type: "code_example", section: "examples", confidence: 0.8 });

    const usage = {};
    if (description) usage.purpose = description;
    if (whenToUse) usage.when_to_use = whenToUse;
    if (whenNotToUse) usage.when_not_to_use = whenNotToUse;
    if (restrictions.size > 0) usage.restrictions = [...restrictions];
    if (disambiguation.length > 0) {
      usage.disambiguation_rules = disambiguation.map((d) => d.rule);
      usage.competing_components = [...new Set(disambiguation.map((d) => d.competitor))];
    }

    return {
      name,
      source: page.url,
      tabs_read: readable.map((t) => t.url),
      description,
      props: props.map(({ source, ...p }) => p),
      variants: [...variants].map((v) => ({ name: v })),
      // Si ninguna pestaña tiene una sección de estados, se registra como "no encontrado".
      states: states.size
        ? [...states].map((n) => ({ name: n, status: "FOUND" }))
        : [{ name: "states", status: "NOT_FOUND" }],
      usage,
      composition,
      accessibility,
      code_examples_count: codeCount,
      executable_examples_count: liveCount,
      evidence_ids: evidenceIds,
    };
  });

  // Decision 4 wiring (METHODOLOGY_DECISIONS.md #4): a URL that LOOKED like a
  // component page (by the same isLikelyComponentPage rule) but failed to fetch
  // is not silently dropped and not treated as "confirmed" anything — it becomes
  // a NOT_EVALUABLE placeholder, so D3/D6 can correctly exclude it from their
  // coverage denominator instead of it just vanishing from components_detected.
  // Also deduplicated by componentIdentity: a failed /button/style/ must not
  // become its own phantom placeholder if /button/usage/ already succeeded for
  // the same component, and multiple failed tab pages for the same never-reached
  // component collapse into exactly one placeholder, not one per tab.
  const failedIdentitiesSeen = new Set();
  const notEvaluable = [];
  for (const rec of crawlResult.pageRecords) {
    if (rec.status !== "FAILED" || !isLikelyComponentPage(rec.url)) continue;
    const identity = componentIdentity(rec.url);
    if (successfulIdentities.has(identity) || failedIdentitiesSeen.has(identity)) continue;
    failedIdentitiesSeen.add(identity);

    const evidenceId = evidenceCollector.add({
      source: rec.url,
      location: null,
      content: null,
      type: "documentation",
      component: identity,
      section: null,
      retrieval_method: "html",
      // Low confidence: all we actually know is "a link matching a component URL
      // pattern existed and the fetch failed" — not a claim about the component itself.
      confidence: 0.4,
      status: "NOT_EVALUABLE",
    });
    notEvaluable.push({
      name: identity,
      source: rec.url,
      description: null,
      props: [],
      variants: [],
      states: [],
      usage: {},
      composition: [],
      accessibility: null,
      code_examples_count: 0,
      executable_examples_count: 0,
      evidence_ids: [evidenceId],
      evaluation_status: "NOT_EVALUABLE",
    });
  }

  return [...found, ...notEvaluable];
}

export function componentIdentity(url) {
  const parts = safePath(url).split("/").filter(Boolean);
  const last = parts[parts.length - 1]?.toLowerCase();
  if (last && TAB_SUFFIXES.has(last) && parts.length >= 2) {
    return parts[parts.length - 2].toLowerCase(); // e.g. "button" from /button/style/
  }
  return last ?? url;
}

function lastSegment(url) {
  const parts = safePath(url).split("/").filter(Boolean);
  return parts[parts.length - 1]?.toLowerCase() ?? "";
}

export function isLikelyComponentPage(url) {
  const p = safePath(url);
  if (!COMPONENT_URL_PATTERNS.some((re) => re.test(p))) return false;
  const parts = p.split("/").filter(Boolean).map((x) => x.toLowerCase());
  const slug = parts[parts.length - 1] ?? "";
  if (!NON_COMPONENT_SLUGS.has(slug)) return true;
  // /components/button/overview es una pestaña de "button", no el índice.
  const parent = parts[parts.length - 2] ?? "";
  return TAB_SUFFIXES.has(slug) && !!parent && !/^components?$|^componentes?$/.test(parent) && !NON_COMPONENT_SLUGS.has(parent);
}

function safePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function pathToName(url) {
  const parts = safePath(url).split("/").filter(Boolean);
  return parts[parts.length - 1] || url;
}
