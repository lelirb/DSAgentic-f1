import { crawl } from "./crawler/crawl.js";
import { assertPublicHost } from "./crawler/ssrfGuard.js";
import { detectAccess } from "./extractor/detectAccess.js";
import { detectComponents } from "./extractor/detectComponents.js";
import { detectTokens } from "./extractor/detectTokens.js";
import { detectManifestsAndSchemas, detectVersioning } from "./extractor/detectManifestsSchemas.js";
import { createEvidenceCollector } from "./extractor/evidence.js";
import { normalize } from "./extractor/normalize.js";
import { evaluate } from "./evaluator/index.js";

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
  const evidenceCollector = createEvidenceCollector();

  const access = detectAccess(crawlResult);
  const components = detectComponents(crawlResult, evidenceCollector);
  const tokens = detectTokens(crawlResult, evidenceCollector);
  const { manifests, schemas } = detectManifestsAndSchemas(crawlResult, evidenceCollector);
  const versioningPresent = detectVersioning(crawlResult, null);

  const normalized = normalize(entryUrl, crawlResult, access, components, tokens, {
    manifests,
    schemas,
    evidence: evidenceCollector.items,
    versioningPresent,
  });
  const report = evaluate(normalized, { weights, rules });

  return { report, normalized, crawlResult };
}
