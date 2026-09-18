// Etapa 4 — páginas de patrones y qué componentes usan.
import { classifyUrl } from "../crawler/siteMap.js";
import { extractHeadings, stripTags } from "./parseHtml.js";
import { VOCAB, extractSections, hasSection } from "./readPage.js";

export function detectPatterns(crawlResult, componentNames, evidenceCollector) {
  const names = [...new Set(componentNames.map((n) => String(n).toLowerCase().replace(/-/g, " ").trim()).filter((n) => n.length >= 3))];
  const out = [];
  for (const page of crawlResult.pages) {
    if (!/html/.test(page.contentType || "") || classifyUrl(page.url) !== "pattern") continue;
    const text = stripTags(page.body).toLowerCase();
    if (text.length < 40) continue;
    const name = extractHeadings(page.body)[0] || page.url;
    const sections = extractSections(page.body);
    const uses = names.filter((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(text));
    const id = evidenceCollector.add({
      source: page.url, location: name, content: uses.join(", ") || null, type: "pattern",
      component: null, section: "pattern", retrieval_method: "html", confidence: 0.6,
    });
    out.push({
      name,
      source: page.url,
      components: uses,
      hierarchy: sections.some((s) => VOCAB.hierarchy.some((re) => re.test(s.title))) || hasSection(sections, VOCAB.anatomy) || null,
      layout: sections.some((s) => VOCAB.layout.some((re) => re.test(s.title))) || null,
      evidence_ids: [id],
    });
  }
  return out;
}
