export function normalize(entryUrl, crawlResult, access, components, tokens, extras = {}) {
  const { manifests = [], schemas = [], evidence = [], versioningPresent = false } = extras;

  const documentedComponents = components.filter((c) => c.description).length;
  const withCodeExamples = components.filter((c) => c.code_examples_count > 0).length;

  let tokensStatus = "NOT_EVALUABLE";
  if (tokens.length > 0) tokensStatus = "FOUND";
  else if (access.structured_tokens === "NOT_RECOVERABLE" && crawlResult.stats.pages_failed === 0) {
    // We actually looked and found nothing token-shaped -> NOT_FOUND, not NOT_EVALUABLE
    // (section 15). If pages failed, we can't be that confident, so leave NOT_EVALUABLE.
    tokensStatus = "NOT_FOUND";
  }

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
    patterns: [],
    // Correction prompt section 1/2: manifests/schemas now carry real entries with
    // evidence_ids instead of being permanently empty regardless of what was found.
    manifests,
    schemas,
    accessibility: [],
    documentation: {
      components_documented: documentedComponents,
      components_with_code_examples: withCodeExamples,
      components_with_executable_examples: 0,
      components_with_variants_states_explained: 0,
      versioning_present: versioningPresent,
    },
    contradictions: [],
    metadata: { tokens_status: tokensStatus },
  };
}
