import { crawl } from "./crawler/crawl.js";
import { assertPublicHost } from "./crawler/ssrfGuard.js";
import { detectAccess } from "./extractor/detectAccess.js";
import { detectComponents, componentIdentity, isLikelyComponentPage } from "./extractor/detectComponents.js";
import { detectTokens } from "./extractor/detectTokens.js";
import { detectManifestsAndSchemas, detectVersioning } from "./extractor/detectManifestsSchemas.js";
import { createEvidenceCollector } from "./extractor/evidence.js";
import { normalize } from "./extractor/normalize.js";
import { detectPatterns } from "./extractor/detectPatterns.js";
import { evaluate } from "./evaluator/index.js";
import { extractSections, visibleTextLength } from "./extractor/readPage.js";

// Section 6/56 STEP 11: the full URL -> Report path, built entirely on top of the
// already-tested Evaluator. fetchImpl is injectable so this is testable without
// hitting the real network (see tests/pipeline.test.js).
//
// Correction prompt section 1: every extractor module now shares a single
// evidenceCollector so components/tokens/manifests/schemas all reference real,
// traceable entries in one Evidence Corpus instead of producing isolated data.
//
// ssrfCheck defaults ON (real DNS resolution) — production callers get SSRF
// protection for free. Tests that use fake .test hostnames with an injected
// fetchImpl pass `ssrfCheck: null` to skip it explicitly — they're already
// fully mocked and a real DNS lookup against a fake hostname would just fail
// with no network, for reasons that have nothing to do with what's being tested.
export async function evaluateUrl(
  entryUrl,
  { weights, rules, crawlOptions = {}, fetchImpl = fetch, ssrfCheck = assertPublicHost } = {}
) {
  if (ssrfCheck) {
    await ssrfCheck(entryUrl);
  }
  // Same guard re-applied to every URL the crawler touches (links, redirect hops, probes).
  const crawlResult = await crawl(entryUrl, { ...crawlOptions, host_check: ssrfCheck || null }, fetchImpl);
  // If the ENTRY page itself was blocked (it redirected to a private/internal host),
  // there is nothing to evaluate — surface it as the same "Blocked:" error the
  // initial check produces (HTTP 400), not as an empty report.
  const entryRecord = crawlResult.pageRecords[0];
  if (entryRecord && entryRecord.status === "FAILED" && entryRecord.reason === "BLOCKED") {
    throw new Error("Blocked: the URL redirects to a private/internal address");
  }
  // If the entry page could not be opened at all and nothing else was retrieved,
  // there is no evidence to evaluate. Returning a report here showed D1 = 0 as
  // "evaluated" — turning "we couldn't reach it" into "it is bad". Surface a
  // clear, classified error instead. 401/403/429 are kept distinct: a site that
  // refuses automated visitors is itself useful information for the designer.
  if (entryRecord && entryRecord.status === "FAILED" && crawlResult.pages.length === 0) {
    const r = String(entryRecord.reason || "");
    const kind =
      r === "TIMEOUT" ? "TIMEOUT"
      : /^HTTP (401|403|429)$/.test(r) ? "REFUSED"
      : /^HTTP 404$/.test(r) ? "NOT_FOUND"
      : "FAILED";
    throw new Error(`UNREACHABLE:${kind} (${r})`);
  }
  const progress = (event) => {
    if (typeof crawlOptions.on_progress !== "function") return;
    try { crawlOptions.on_progress(event); } catch { /* un aviso de avance nunca rompe la evaluación */ }
  };
  progress({ step: "extract" });
  const evidenceCollector = createEvidenceCollector();

  const components = detectComponents(crawlResult, evidenceCollector);
  const tokens = detectTokens(crawlResult, evidenceCollector);
  const access = detectAccess(crawlResult, { tokens, components });
  const patterns = detectPatterns(
    crawlResult,
    [...components.map((c) => c.name), ...((crawlResult.discovery && crawlResult.discovery.component_names_found) || [])],
    evidenceCollector
  );
  const { manifests, schemas } = detectManifestsAndSchemas(crawlResult, evidenceCollector);
  const versioningPresent = detectVersioning(crawlResult, null);

  const normalized = normalize(entryUrl, crawlResult, access, components, tokens, {
    manifests,
    schemas,
    evidence: evidenceCollector.items,
    versioningPresent,
    patterns,
  });
  progress({ step: "score" });
  const report = evaluate(normalized, { weights, rules });
  const sources = withPageOutline(annotateSourceUsage(crawlResult.sources || [], {
    components, tokens, manifests, schemas, patterns, evidence: evidenceCollector.items,
  }), crawlResult.pages || []);

  return { report, normalized, crawlResult, sources };
}

// Diagnóstico (no puntúa): para cada página HTML leída, los títulos que el
// evaluador vio y cuánto texto traía. Sirve para comprobar con datos, y no con
// suposiciones, si un "no encontrado" se debe a que la sección no existe o a que
// el sitio la llama de otra manera. Imprescindible en sitios que solo se pueden
// leer con navegador, donde no hay otra forma de ver lo que se leyó.
const MAX_OUTLINE_HEADINGS = 40;
export function withPageOutline(sources, pages) {
  const byUrl = new Map();
  for (const p of pages) {
    if (!p || typeof p.body !== "string" || !/html/.test(p.contentType || "")) continue;
    const seen = new Set();
    const headings = [];
    // Los mismos títulos (h1–h4) que usa el evaluador para reconocer secciones.
    for (const sec of extractSections(p.body)) {
      const t = String(sec.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      headings.push(t);
      if (headings.length >= MAX_OUTLINE_HEADINGS) break;
    }
    byUrl.set(p.url, { headings, text_chars: visibleTextLength(p.body) });
  }
  return sources.map((s) => {
    if (s.status !== "READ") return s;
    const o = byUrl.get(s.final_url) || byUrl.get(s.url);
    return o ? { ...s, headings: o.headings, text_chars: o.text_chars } : s;
  });
}

// Etapa 1 (transparencia): for each source that was read, say what the
// extractor actually used it for. Purely descriptive — scoring never reads this.
export function annotateSourceUsage(sources, { components = [], tokens = [], manifests = [], schemas = [], evidence = [], patterns = [] }) {
  const usage = new Map();
  const note = (url, entry) => {
    if (!url) return;
    const list = usage.get(url) || [];
    list.push(entry);
    usage.set(url, list);
  };
  const nameByIdentity = new Map();
  for (const c of components) {
    if (c.evaluation_status === "NOT_EVALUABLE") continue;
    for (const url of c.tabs_read && c.tabs_read.length ? c.tabs_read : [c.source]) note(url, { kind: "component", name: c.name });
    nameByIdentity.set(componentIdentity(c.source), c.name);
  }
  // Tokens carry no source field; their origin lives in the Evidence Corpus.
  const evidenceSource = new Map(evidence.map((e) => [e.id, e.source]));
  const tokenCounts = new Map();
  for (const t of tokens) {
    const src = (t.evidence_ids || []).map((id) => evidenceSource.get(id)).find(Boolean);
    if (src) tokenCounts.set(src, (tokenCounts.get(src) || 0) + 1);
  }
  for (const [url, count] of tokenCounts) note(url, { kind: "tokens", count });
  for (const m of manifests) note(m.url, { kind: "manifest", name: m.type });
  for (const sc of schemas) note(sc.url, { kind: "schema", name: sc.type });
  for (const pt of patterns) note(pt.source, { kind: "pattern", name: pt.name });

  return sources.map((s) => {
    if (s.status !== "READ") return { ...s, used_as: [] };
    const used = [...(usage.get(s.url) || []), ...(s.final_url ? usage.get(s.final_url) || [] : [])];
    if (!used.length) {
      // Another tab (style/code/accessibility…) of a component whose main page was
      // used instead: the extractor currently reads one page per component.
      const page = s.final_url || s.url;
      const name = isLikelyComponentPage(page) ? nameByIdentity.get(componentIdentity(page)) : null;
      if (name) used.push({ kind: "component_tab_unused", name });
    }
    return { ...s, used_as: used };
  });
}
