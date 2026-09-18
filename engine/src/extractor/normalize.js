import { classifyUrl } from "../crawler/siteMap.js";

export function normalize(entryUrl, crawlResult, access, components, tokens, extras = {}) {
  const { manifests = [], schemas = [], evidence = [], versioningPresent = false, patterns = [] } = extras;
  const discovery = crawlResult.discovery || null;

  const documentedComponents = components.filter((c) => c.description).length;
  const withCodeExamples = components.filter((c) => c.code_examples_count > 0).length;

  // Etapa 2: "no encontrado" solo si se buscó donde suelen estar los tokens
  // (páginas de fundamentos/tokens o un archivo de tokens). Si nunca se miró
  // ahí, no se puede afirmar nada: queda fuera de la nota.
  const tokenPlacesRead = crawlResult.pages.some((p) => classifyUrl(p.url) === "tokens" || /token/i.test(p.url));
  let tokensStatus = "NOT_EVALUABLE";
  if (tokens.length > 0) tokensStatus = "FOUND";
  else if (tokenPlacesRead) tokensStatus = "NOT_FOUND";

  return {
    schema_version: "0.1",
    methodology_version: "0.1",
    rules_version: "0.1",
    system: { url: entryUrl, name: null, version: null },
    coverage: {
      // Correction prompt section 7: explicit denominators, not just detected/evaluated.
      pages_found: crawlResult.stats.pages_found,
      pages_retrieved: crawlResult.stats.pages_retrieved,
      pages_failed: crawlResult.stats.pages_failed,
      components_detected: components.length,
      components_evaluated: components.length,
      documented_components: documentedComponents,
      components_with_examples: withCodeExamples,
      tokens_detected: tokens.length,
      crawl_limited: crawlResult.stats.crawl_limited,
      evaluation_status: crawlResult.stats.crawl_limited ? "LIMITED" : "COMPLETE",
    },
    access,
    // Correction prompt section 1 (priority máxima): real Evidence Corpus, not [].
    evidence,
    components,
    tokens,
    foundations: [],
    patterns,
    // Correction prompt section 1/2: manifests/schemas now carry real entries with
    // evidence_ids instead of being permanently empty regardless of what was found.
    manifests,
    schemas,
    accessibility: [],
    documentation: {
      components_documented: documentedComponents,
      components_with_code_examples: withCodeExamples,
      components_with_executable_examples: components.filter((c) => c.executable_examples_count > 0).length,
      components_with_variants_states_explained: components.filter(
        (c) => (c.variants || []).length > 0 || (c.states || []).some((s) => s.status === "FOUND")
      ).length,
      versioning_present: versioningPresent,
    },
    contradictions: [],
    metadata: {
      tokens_status: tokensStatus,
      discovery,
      criteria: criteriaStatus({ crawlResult, discovery, access, components, tokens, patterns, tokensStatus }),
    },
  };
}

// Etapa 2 — qué criterios NO se pudieron buscar (quedan fuera de la nota) y
// cuáles se buscaron con certeza de ausencia ("No existe"). Lo que no aparece
// aquí se clasifica por su puntaje: encontrado / en parte / no encontrado.
// reason: EXTERNAL_NOT_READ (está en una fuente oficial que todavía no se lee),
// NOT_LOOKED (no se leyó el lugar donde suele estar), NO_BASIS (no hay con qué
// compararlo), PROBED (se buscó en su dirección estándar y no existe).
export function criteriaStatus({ crawlResult, discovery, access, components, tokens, patterns, tokensStatus }) {
  const out = {};
  const set = (key, status, reason) => (out[key] = { status, reason });
  const officials = (discovery && discovery.official_sources) || [];
  const hasStorybook = officials.some((o) => o.kind === "storybook");
  const hasCodeSource = officials.some((o) => o.kind === "repository" || o.kind === "package");
  const readable = components.filter((c) => c.evaluation_status !== "NOT_EVALUABLE");
  const anyProps = readable.some((c) => (c.props || []).length > 0);
  const listingKnown = discovery && ["llms.txt", "sitemap", "navigation"].includes(discovery.method);

  // D1
  if (access.agent_manifest === "NONE") {
    if (discovery && discovery.probed && discovery.probed.llms_txt === "ABSENT") set("D1.agent_manifest", "ABSENT", "PROBED");
  }
  if (access.component_index === "NONE" && hasStorybook) set("D1.component_index", "NOT_EVALUABLE", "EXTERNAL_NOT_READ");
  if (access.types_or_schema === "NONE" && hasCodeSource) set("D1.types_or_schema", "NOT_EVALUABLE", "EXTERNAL_NOT_READ");
  if (access.props_types_accessibility === "NAMES_ONLY" && (hasStorybook || hasCodeSource)) {
    set("D1.props_types_accessibility", "NOT_EVALUABLE", "EXTERNAL_NOT_READ");
  }
  if (access.structured_tokens === "NOT_RECOVERABLE" && tokensStatus === "NOT_EVALUABLE") {
    set("D1.structured_tokens", "NOT_EVALUABLE", hasCodeSource ? "EXTERNAL_NOT_READ" : "NOT_LOOKED");
  }

  // D2: tokens leídos solo de tablas HTML no muestran alias ni modos.
  if (tokens.length && tokens.every((t) => t.origin === "html_table")) {
    if (!tokens.some((t) => t.alias_of)) set("D2.primitive_to_semantic", "NOT_EVALUABLE", "UNREADABLE");
    if (!tokens.some((t) => t.mode)) set("D2.modes", "NOT_EVALUABLE", "UNREADABLE");
  }

  // D3
  if (readable.length && !anyProps && (hasStorybook || hasCodeSource)) {
    set("D3.props_documented", "NOT_EVALUABLE", "EXTERNAL_NOT_READ");
  }

  // D5: patrones.
  const patternPagesRead = crawlResult.pages.some((p) => /^pattern/.test(classifyUrl(p.url)));
  if (!patterns.length) {
    const reason = patternPagesRead || (listingKnown && !discovery.patterns_found) ? null
      : discovery && discovery.patterns_found ? "NOT_READ" : "NOT_LOOKED";
    if (reason) {
      for (const k of ["reuse_of_existing_components", "hierarchy_nesting", "documented_patterns", "layout_spacing"]) {
        set(`D5.${k}`, "NOT_EVALUABLE", reason);
      }
    }
  }

  // D6
  if (readable.length && !readable.some((c) => c.executable_examples_count > 0) && hasStorybook) {
    set("D6.executable_examples", "NOT_EVALUABLE", "EXTERNAL_NOT_READ");
  }
  return out;
}
