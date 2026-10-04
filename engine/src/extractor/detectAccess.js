// Populates input.access — raw signals only, no scoring happens here (section 6:
// extractor answers "what did I find", evaluator answers "what does that mean").
import { mcpSignal, visibleTextLength, MIN_READABLE_TEXT } from "./readPage.js";

// Archivos técnicos que el evaluador pide siempre: no son documentación y no
// deben contar ni a favor ni en contra en la recuperabilidad.
export function isUtilityFile(url) {
  let p;
  try { p = new URL(url).pathname.toLowerCase(); } catch { return false; }
  return /(^|\/)(robots\.txt|llms\.txt|agents\.md|humans\.txt|security\.txt)$/.test(p) ||
    /(^|\/)sitemap[^/]*\.xml$/.test(p) ||
    // Artefactos para máquinas (el índice del Storybook): cuentan para su
    // criterio propio, no como "página de documentación legible".
    /(^|\/)(index|stories)\.json$/.test(p);
}

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

  // Este criterio dice dos cosas: que las páginas respondan y que su contenido
  // venga en el HTML del servidor. Antes medía SOLO la tasa de éxito HTTP sobre
  // todo lo pedido, así que robots.txt y sitemap.xml contaban como documentación
  // recuperada (Fluent 2 sacaba 15/15 con 3 de sus 4 "páginas" siendo archivos
  // técnicos) y una página que solo dice "requires JavaScript" aprobaba el
  // criterio de no requerir JavaScript (Apple HIG). Ahora el denominador son las
  // páginas de documentación intentadas, y el numerador las que además traen
  // texto real en el HTML.
  const attempted = crawlResult.pageRecords.filter(
    (r) => (r.status === "CRAWLED" || r.status === "FAILED") && !isUtilityFile(r.url)
  );
  const readable = crawlResult.pages.filter(
    // Una página que hubo que abrir con un navegador (`rendered`) NO cuenta: el
    // criterio mide si el contenido llega sin ejecutar JavaScript, que es como
    // lo pide la mayoría de los agentes. Ese contenido sí se usa para evaluar
    // las demás dimensiones; aquí solo se registra la barrera de acceso.
    (p) => !p.rendered && !isUtilityFile(p.url) && /html/.test(p.contentType || "") && visibleTextLength(p.body) >= MIN_READABLE_TEXT
  );
  // Sin ninguna página de documentación intentada no se puede afirmar nada:
  // queda NOT_EVALUABLE (bandPoints devuelve null ante un valor desconocido).
  let documentation_recoverability = null;
  if (attempted.length > 0) {
    const ratio = readable.length / attempted.length;
    documentation_recoverability =
      ratio >= 0.9 ? "FULLY_RECOVERABLE"
      : ratio >= 0.5 ? "MOSTLY_RECOVERABLE"
      : ratio > 0 ? "PARTIAL"
      : "NOT_RECOVERABLE";
  }

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
