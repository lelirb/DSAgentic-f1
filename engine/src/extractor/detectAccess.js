// Populates input.access — raw signals only, no scoring happens here (section 6:
// extractor answers "what did I find", evaluator answers "what does that mean").
import { mcpSignal } from "./readPage.js";

export function detectAccess(crawlResult, { tokens = [], components = [] } = {}) {
  // Section 6/22: D1 measures whether content can actually be RECOVERED, not
  // whether a link with a suggestive filename was merely discovered. Using the
  // full pageRecords list (which includes FAILED/OUT_OF_SCOPE entries) would give
  // credit for e.g. an AGENTS.md that 404'd — restrict to successfully fetched URLs.
  const successfulUrls = crawlResult.pageRecords
    .filter((r) => r.status === "CRAWLED")
    .map((r) => r.url.toLowerCase());
  const urls = successfulUrls;

  const hasIndexJson = urls.some((u) => u.endsWith("index.json") || u.endsWith("stories.json"));
  const hasAgentManifest = urls.some((u) => u.endsWith("agents.md") || u.endsWith("llms.txt"));
  const hasDts = urls.some((u) => u.endsWith(".d.ts"));
  const hasTokensJson = urls.some((u) => u.includes("token") && u.endsWith(".json"));
  // Etapa 4: un servidor MCP también se reconoce cuando la documentación lo declara.
  const hasMcp = urls.some((u) => /(^|[/.-])mcp([/.-]|$)/.test(u)) ||
    crawlResult.pages.some((p) => /html|text|markdown/.test(p.contentType || "") && mcpSignal(p.body));

  const attempted = crawlResult.pageRecords.filter((r) => r.status === "CRAWLED" || r.status === "FAILED");
  const retrieved = crawlResult.pages.length;
  const ratio = attempted.length > 0 ? retrieved / attempted.length : 0;

  let documentation_recoverability = "NOT_RECOVERABLE";
  if (ratio >= 0.9) documentation_recoverability = "FULLY_RECOVERABLE";
  else if (ratio >= 0.5) documentation_recoverability = "MOSTLY_RECOVERABLE";
  else if (ratio > 0) documentation_recoverability = "PARTIAL";

  return {
    documentation_recoverability,
    // NOTE (documented limitation): v0.1 only distinguishes NONE vs COMPLETE for
    // component_index/tokens/types — it cannot yet tell "partial" index coverage
    // apart without inspecting index.json contents against the crawled component
    // pages. That's a v0.2 extractor improvement (section 54), not a methodology change.
    component_index: hasIndexJson ? "COMPLETE" : "NONE",
    props_types_accessibility: hasDts ? "PROPS_AND_TYPES" : propsInTables(components) ? "PARTIAL" : "NAMES_ONLY",
    // Tokens solo en tablas HTML: se pueden recuperar, pero no en formato estructurado.
    structured_tokens: hasTokensJson ? "COMPLETE" : tokens.some((t) => t.origin === "html_table") ? "PARTIAL" : "NOT_RECOVERABLE",
    types_or_schema: hasDts ? "COMPLETE" : "NONE",
    agent_manifest: hasAgentManifest ? "COMPLETE" : "NONE",
    agent_interface: hasMcp ? "PRESENT" : "NONE",
  };
}

function propsInTables(components) {
  const readable = components.filter((c) => c.evaluation_status !== "NOT_EVALUABLE");
  if (!readable.length) return false;
  const withTyped = readable.filter((c) => (c.props || []).some((p) => p.type));
  return withTyped.length / readable.length >= 0.5;
}
