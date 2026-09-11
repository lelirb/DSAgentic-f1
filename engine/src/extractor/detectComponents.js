import {
  extractHeadings,
  extractCodeBlocks,
  extractFirstParagraphAfterHeading,
  extractSectionByLabel,
  extractRestrictions,
  extractDisambiguationSignals,
  APOSTROPHE,
} from "./parseHtml.js";

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
const NON_COMPONENT_SLUGS = new Set(["", "index", "overview", "components", "guidelines", "getting-started"]);

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
const TAB_SUFFIXES = new Set(["usage", "style", "code", "accessibility", "examples"]);
// Cuando hay varias páginas para el mismo componente, se prefiere la que tenga
// más probabilidad de contener descripción/propósito en prosa; "examples" y
// "code" suelen ser solo snippets sin texto explicativo.
const TAB_PREFERENCE = ["usage", "style", "examples", "code", "accessibility"];

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

  // Deduplicate tab-style pages (usage/style/code/accessibility) down to one
  // canonical page per component identity, preferring "usage" when available.
  const byIdentity = new Map();
  for (const page of allComponentPages) {
    const identity = componentIdentity(page.url);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, page);
      continue;
    }
    const existingRank = TAB_PREFERENCE.indexOf(lastSegment(existing.url));
    const candidateRank = TAB_PREFERENCE.indexOf(lastSegment(page.url));
    // -1 (not a known tab suffix, i.e. the URL segment itself IS the component,
    // like Material UI's /react-button/) outranks any tab page.
    if (candidateRank === -1 || (existingRank !== -1 && candidateRank < existingRank)) {
      byIdentity.set(identity, page);
    }
  }
  const componentPages = [...byIdentity.values()];
  const successfulIdentities = new Set([...byIdentity.keys()]);

  const found = componentPages.map((page) => {
    const headings = extractHeadings(page.body);
    const codeBlocks = extractCodeBlocks(page.body);
    const description = extractFirstParagraphAfterHeading(page.body);
    const whenToUse = extractSectionByLabel(page.body, WHEN_TO_USE_PATTERNS);
    const whenNotToUse = extractSectionByLabel(page.body, WHEN_NOT_TO_USE_PATTERNS);
    const restrictions = extractRestrictions(page.body);
    const disambiguation = extractDisambiguationSignals(page.body);
    const name = headings[0] || pathToName(page.url);

    const evidenceIds = [];
    if (description) {
      const id = evidenceCollector.add({
        source: page.url,
        location: `${name} > description`,
        content: description,
        type: "documentation",
        component: name,
        section: "description",
        retrieval_method: "html",
        // 0.6, not 1.0: regex-based "first <p> after heading" is a best-effort
        // structural signal, not a guaranteed-correct parse (section 17).
        confidence: 0.6,
      });
      evidenceIds.push(id);
    }
    if (whenToUse) {
      const id = evidenceCollector.add({
        source: page.url,
        location: `${name} > when_to_use`,
        content: whenToUse,
        type: "usage_guideline",
        component: name,
        section: "when_to_use",
        retrieval_method: "html",
        confidence: 0.6,
      });
      evidenceIds.push(id);
    }
    if (whenNotToUse) {
      const id = evidenceCollector.add({
        source: page.url,
        location: `${name} > when_not_to_use`,
        content: whenNotToUse,
        type: "usage_guideline",
        component: name,
        section: "when_not_to_use",
        retrieval_method: "html",
        confidence: 0.6,
      });
      evidenceIds.push(id);
    }
    restrictions.forEach((restriction, i) => {
      const id = evidenceCollector.add({
        source: page.url,
        location: `${name} > restriction[${i}]`,
        content: restriction,
        type: "restriction",
        component: name,
        section: "restrictions",
        retrieval_method: "html",
        // Same confidence as when_to_use/when_not_to_use — a sentence-level regex
        // match on "Do not X"/"Don't X" is a real structural signal, but not a
        // guaranteed-correct parse of the author's full intent (section 17).
        confidence: 0.6,
      });
      evidenceIds.push(id);
    });
    disambiguation.forEach((d, i) => {
      const id = evidenceCollector.add({
        source: page.url,
        location: `${name} > disambiguation[${i}]`,
        content: d.rule,
        type: "restriction",
        component: name,
        section: "disambiguation_rules",
        retrieval_method: "html",
        // Lower than restrictions (0.5, not 0.6): the sentence itself is a solid
        // structural match ("instead of" is unambiguous), but the extracted
        // competitor phrase is a raw noun-phrase slice, not a validated component
        // name — it's a real signal, not a confirmed cross-reference.
        confidence: 0.5,
      });
      evidenceIds.push(id);
    });
    codeBlocks.forEach((code, i) => {
      const id = evidenceCollector.add({
        source: page.url,
        location: `${name} > example[${i}]`,
        content: code,
        type: "code_example",
        component: name,
        section: "examples",
        retrieval_method: "html",
        confidence: 0.8,
      });
      evidenceIds.push(id);
    });

    const usage = {};
    if (description) usage.purpose = description;
    if (whenToUse) usage.when_to_use = whenToUse;
    if (whenNotToUse) usage.when_not_to_use = whenNotToUse;
    if (restrictions.length > 0) usage.restrictions = restrictions;
    if (disambiguation.length > 0) {
      usage.disambiguation_rules = disambiguation.map((d) => d.rule);
      usage.competing_components = [...new Set(disambiguation.map((d) => d.competitor))];
    }

    return {
      name,
      source: page.url,
      description,
      props: [],
      variants: [],
      states: [],
      usage,
      composition: [],
      accessibility: null,
      code_examples_count: codeBlocks.length,
      executable_examples_count: 0,
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

function componentIdentity(url) {
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

function isLikelyComponentPage(url) {
  const p = safePath(url);
  if (!COMPONENT_URL_PATTERNS.some((re) => re.test(p))) return false;
  const slug = p.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
  return !NON_COMPONENT_SLUGS.has(slug);
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
