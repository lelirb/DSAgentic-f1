// Section 1 (correction prompt) — Evidence Corpus, priority máxima.
// Deterministic ID assignment (section 5.4: no randomness), shared across every
// extractor module so components/tokens/manifests/schemas can all reference real
// entries in the same corpus instead of each producing isolated, unlinked data.
export function createEvidenceCollector() {
  let counter = 0;
  const items = [];

  function add(entry) {
    counter += 1;
    const id = `ev-${String(counter).padStart(4, "0")}`;
    // Required shape (correction prompt section 1): id, source, location, content,
    // type, component, section, version, retrieval_method, confidence.
    const full = {
      id,
      source: entry.source ?? null,
      location: entry.location ?? null,
      content: entry.content ?? null,
      type: entry.type,
      component: entry.component ?? null,
      section: entry.section ?? null,
      version: entry.version ?? null,
      retrieval_method: entry.retrieval_method ?? null,
      confidence: entry.confidence,
      status: entry.status ?? "FOUND",
    };
    items.push(full);
    return id;
  }

  return { add, items };
}
