import { versionSignal } from "./readPage.js";
// Correction prompt section 1/2: manifests[] and schemas[] must be populated with
// real entries, not left permanently empty just because detectAccess() already
// derived a binary signal from the same URLs. Each entry gets a corpus evidence_id.
export function detectManifestsAndSchemas(crawlResult, evidenceCollector) {
  const crawled = crawlResult.pageRecords.filter((r) => r.status === "CRAWLED");

  const manifests = [];
  for (const rec of crawled) {
    const lower = rec.url.toLowerCase();
    if (lower.endsWith("agents.md") || lower.endsWith("llms.txt")) {
      const id = evidenceCollector.add({
        source: rec.url,
        location: null,
        content: null,
        type: "manifest",
        retrieval_method: "html",
        confidence: 1.0, // existence + successful fetch is directly observed, not inferred
      });
      manifests.push({ type: lower.endsWith("llms.txt") ? "llms.txt" : "AGENTS.md", url: rec.url, evidence_ids: [id] });
    }
  }

  const schemas = [];
  for (const rec of crawled) {
    if (rec.url.toLowerCase().endsWith(".d.ts")) {
      const id = evidenceCollector.add({
        source: rec.url,
        location: null,
        content: null,
        type: "schema",
        retrieval_method: "static-file",
        confidence: 1.0,
      });
      schemas.push({ type: "d.ts", url: rec.url, evidence_ids: [id] });
    }
  }

  return { manifests, schemas };
}

// Conservative, deterministic versioning signal (correction prompt section 2:
// "versioning" is one of the categories the extractor should detect when explicit
// evidence exists). We only claim versioning is present when there's a concrete,
// observable signal — a crawled changelog/release page, or an explicit system
// version string — never inferred from silence.
export function detectVersioning(crawlResult, systemVersion) {
  const crawled = crawlResult.pageRecords.filter((r) => r.status === "CRAWLED");
  const hasChangelogPage = crawled.some((r) => /changelog|release-notes|releases|novedades/i.test(r.url));
  // Etapa 4: versión o fecha de actualización visibles en las páginas leídas.
  const hasVersionText = crawlResult.pages.some((p) => /html/.test(p.contentType || "") && versionSignal(p.body));
  return Boolean(systemVersion) || hasChangelogPage || hasVersionText;
}
