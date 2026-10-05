// Etapa 3 — encontrar el Design System completo desde cualquier dirección.
// Todo es determinístico y genérico: no hay nombres de Design Systems concretos.
import { findBlocks } from "../extractor/blocks.js";
import { normalizeUrl, extractLinks } from "./discovery.js";
import { isLikelyComponentPage, componentIdentity } from "../extractor/detectComponents.js";

// Segmentos que indican una SECCIÓN dentro de un Design System. La raíz del DS
// es todo lo que está antes del primero de ellos.
const SECTION_SEGMENTS = new Set([
  "components", "component", "componentes", "componente",
  "foundations", "foundation", "fundamentos", "fundamentals",
  "tokens", "design-tokens", "patterns", "pattern", "patrones",
  "guidelines", "guias", "guías", "pautas", "elements", "elementos",
  "styles", "estilos", "getting-started", "get-started", "primeros-pasos",
  "resources", "recursos", "templates", "plantillas", "layouts",
  "accessibility", "accesibilidad", "changelog", "releases", "release-notes",
  "docs", "documentation", "documentacion", "documentación",
]);

export function findDsRoot(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  const kept = [];
  for (const seg of parts) {
    const s = decodeSafe(seg).toLowerCase();
    // Convención /react-<nombre>/ (componente como segmento propio).
    if (SECTION_SEGMENTS.has(s) || /^react-[a-z0-9-]+$/.test(s)) break;
    kept.push(seg);
  }
  // Si nada coincidió, la raíz es el directorio de la dirección escrita.
  if (kept.length === parts.length && parts.length > 0 && /\.[a-z0-9]{2,5}$/i.test(parts[parts.length - 1])) kept.pop();
  const path = "/" + kept.join("/") + (kept.length ? "/" : "");
  return `${u.origin}${path}`;
}

function decodeSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---------- lectura de listados ----------

const MAX_LISTED_URLS = 20000;

export function parseSitemap(xml) {
  const urls = [];
  const children = [];
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  for (const b of findBlocks(xml, "loc", MAX_LISTED_URLS)) {
    if (urls.length + children.length >= MAX_LISTED_URLS) break;
    const loc = b.inner.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").trim();
    (isIndex ? children : urls).push(loc);
  }
  return { urls, children, isIndex };
}

export function parseRobotsSitemaps(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

// llms.txt es Markdown: enlaces [texto](url) y direcciones sueltas.
export function parseLlmsTxt(text, baseUrl) {
  const out = new Set();
  const re = /\]\(\s*([^)\s]+)\s*\)|(https?:\/\/[^\s)<>"']+)/g;
  let m;
  while ((m = re.exec(String(text || ""))) && out.size < MAX_LISTED_URLS) {
    const n = normalizeUrl(m[1] || m[2], baseUrl);
    if (n) out.add(n);
  }
  return [...out];
}

// Enlaces del menú de navegación (<nav>, <aside>, <header>). Si la página no
// tiene ninguno de esos bloques, devuelve [] y se usa el recorrido de enlaces.
export function extractNavLinks(html, baseUrl) {
  const source = String(html ?? "");
  const blocks = findBlocks(source, "nav|aside|header").map((b) => b.inner);
  // Bloques con role="navigation": se busca la apertura y luego su cierre dentro
  // de 200 000 caracteres. Tope de 200 aperturas para que una página hostil con
  // miles de ellas no multiplique el trabajo.
  const roleRe = /<[a-z]+\b[^<>]*role\s*=\s*["']navigation["'][^<>]*>/gi;
  const closeRe = /<\/(?:div|ul|section)>/gi;
  let m;
  for (let n = 0; n < 200 && (m = roleRe.exec(source)); n++) {
    const from = m.index + m[0].length;
    const window = source.slice(from, from + 200000);
    closeRe.lastIndex = 0;
    const c = closeRe.exec(window);
    if (c) blocks.push(window.slice(0, c.index));
  }
  const out = new Set();
  for (const b of blocks) for (const l of extractLinks(b, baseUrl)) out.add(l);
  return [...out];
}

// ---------- fuentes oficiales externas ----------

// Un sitio externo solo cuenta como fuente oficial si la documentación lo enlaza.
export function officialSourceKind(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (/(^|\.)storybook\b|storybook\./.test(host) || /\/storybook(\/|$)/i.test(u.pathname) || /(^|&)path=\/(story|docs)\//i.test(u.search.slice(1))) {
    return "storybook";
  }
  if (host === "github.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && !["sponsors", "orgs", "features", "topics", "about", "login"].includes(parts[0].toLowerCase())) return "repository";
  }
  if (host === "www.npmjs.com" || host === "npmjs.com") {
    if (/^\/package\//.test(u.pathname)) return "package";
  }
  return null;
}

export function officialSourceKey(url, kind) {
  const u = new URL(url);
  if (kind === "repository") {
    const [owner, repo] = u.pathname.split("/").filter(Boolean);
    return `https://github.com/${owner}/${repo.replace(/\.git$/, "")}`;
  }
  if (kind === "package") {
    const m = /^\/package\/((?:@[^/]+\/)?[^/]+)/.exec(u.pathname);
    return m ? `https://www.npmjs.com/package/${m[1]}` : url;
  }
  if (kind === "storybook") return u.origin + (u.pathname.match(/^(.*?\/storybook)(\/|$)/i)?.[1] || "");
  return url;
}

// ---------- clasificación y muestra ----------

// "token" también nombra cosas que NO son tokens de diseño: los tokens que
// consume un modelo de IA o los de acceso a una API. Visto en producción con
// Carbon: "/getting-started/carbon-mcp/token-conservation" (tokens de IA) entró
// en la muestra como página de tokens y dejó fuera la de color.
const NOT_DESIGN_TOKEN_RE = /(^|[\/_-])(mcp|llms?|ai|auth|oauth|access|bearer|jwt|csrf|session|prompts?)([\/_-]|$)/;
const TOKEN_WORD_RE = /tokens?/;
const FOUNDATION_WORD_RE = /foundations?|fundamentos|colou?rs?|spacing|espaciado|typography|tipograf|elevation|elevaci|motion|movimiento|themes?|temas?|radius|shadows?|sombras?/;

function pathOf(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
}

// ¿La dirección habla de tokens DE DISEÑO?
export function isDesignTokenUrl(url) {
  const p = pathOf(url);
  return p !== null && TOKEN_WORD_RE.test(p) && !NOT_DESIGN_TOKEN_RE.test(p);
}

// Orden de preferencia entre páginas de tokens/fundamentos (menor = primero).
// Antes se tomaban por orden alfabético y la muestra de Carbon quedaba en
// "2x-grid" y "accessibility" en vez de color, espaciado y tipografía.
const CORE_SEGMENT_RE = /^(colou?rs?|colores|spacing|espaciado|typography|tipograf[ií]a|type|themes?|temas?)$/;
const CORE_WORD_RE = /colou?rs?|colores|spacing|espaciado|typography|tipograf|themes?|temas?/;
const STYLE_WORD_RE = /elevation|elevaci|motion|movimiento|radius|radio|shadows?|sombras?|shape|forma|layout|grid|breakpoints?|sizing|size/;
export function tokenPageRank(url) {
  const p = pathOf(url);
  if (p === null) return 9;
  const segs = p.split("/").filter(Boolean);
  if (isDesignTokenUrl(url)) return 0; // la dirección dice "tokens": suelen ser las tablas
  if (segs.some((s) => CORE_SEGMENT_RE.test(s))) return 1; // /color, /spacing, /typography, /themes
  if (CORE_WORD_RE.test(p)) return 2; // /color-palettes, /colores-de-marca…
  if (STYLE_WORD_RE.test(p)) return 3; // elevación, movimiento, radios, sombras
  return 4; // otras páginas de fundamentos (accesibilidad, contenido, íconos…)
}

export function classifyUrl(url) {
  const p = pathOf(url);
  if (p === null) return "other";
  if (/\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|mp4|woff2?|ttf|css|js)$/.test(p)) return "asset";
  if (/changelog|release-notes|\/releases?(\/|$)|whats-new|novedades|historial-de-cambios/.test(p)) return "changelog";
  if (isLikelyComponentPage(url)) return "component";
  if (/\/(patterns?|patrones?|templates?|plantillas?|recipes?)(\/|$)/.test(p)) {
    const slug = p.split("/").filter(Boolean).pop();
    return /^(patterns?|patrones?|templates?|plantillas?|recipes?|overview|index)$/.test(slug) ? "pattern_index" : "pattern";
  }
  if (FOUNDATION_WORD_RE.test(p)) return "tokens";
  if (TOKEN_WORD_RE.test(p) && !NOT_DESIGN_TOKEN_RE.test(p)) return "tokens";
  return "other";
}

// Elige `n` elementos repartidos de forma pareja en una lista ordenada.
export function evenlySpaced(list, n) {
  if (list.length <= n) return [...list];
  const out = [];
  const step = list.length / n;
  for (let i = 0; i < n; i++) out.push(list[Math.floor(i * step + step / 2)]);
  return out;
}

export const SAMPLE_DEFAULTS = {
  components: 8,
  tabs_per_component: 5,
  patterns: 3,
  token_pages: 4,
  changelog: 1,
};

// Devuelve la lista ordenada de direcciones a leer y el conteo de lo encontrado.
export function buildSample(urls, { rootUrl, limits = SAMPLE_DEFAULTS, maxPages = 45 } = {}) {
  const inRoot = (u) => {
    try {
      const a = new URL(u);
      const r = new URL(rootUrl);
      return a.hostname === r.hostname && a.pathname.toLowerCase().startsWith(r.pathname.toLowerCase());
    } catch {
      return false;
    }
  };
  const byKind = { component: new Map(), pattern: [], pattern_index: [], tokens: [], changelog: [] };
  for (const u of [...new Set(urls)].sort()) {
    if (!inRoot(u)) continue;
    const kind = classifyUrl(u);
    if (kind === "component") {
      const id = componentIdentity(u);
      if (!byKind.component.has(id)) byKind.component.set(id, []);
      byKind.component.get(id).push(u);
    } else if (byKind[kind]) byKind[kind].push(u);
  }

  const componentIds = [...byKind.component.keys()].sort();
  const chosenIds = evenlySpaced(componentIds, limits.components);
  const componentUrls = [];
  for (const id of chosenIds) {
    const tabs = byKind.component.get(id).sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    componentUrls.push(...tabs.slice(0, limits.tabs_per_component));
  }
  // Primero las que dicen "tokens", después color/espaciado/tipografía/temas y
  // al final el resto de fundamentos. Dentro de cada grupo, la dirección más
  // corta (la página principal del tema) y, a igualdad, orden alfabético.
  const tokenUrls = [...byKind.tokens].sort(
    (a, b) => tokenPageRank(a) - tokenPageRank(b) || a.split("/").length - b.split("/").length || (a < b ? -1 : 1)
  );
  const ordered = [
    rootUrl,
    ...componentUrls,
    ...byKind.pattern_index.slice(0, 1),
    ...evenlySpaced(byKind.pattern, limits.patterns),
    ...tokenUrls.slice(0, limits.token_pages),
    ...byKind.changelog.slice(0, limits.changelog),
  ];
  const sample = [...new Set(ordered)].slice(0, maxPages);
  // Candidatas que NO entraron en la muestra, por tipo y en orden. Sirven para
  // REPONER las que fallen: si las 3 páginas de tokens elegidas dan 404, el
  // evaluador debe probar las siguientes antes de afirmar "no hay tokens"
  // (visto en vivo con Carbon: su llms.txt lista páginas de fundamentos que ya
  // no existen, y D2 daba 0 sin haber leído una sola página de fundamentos).
  const chosen = new Set(sample);
  const reserves = { component: [], pattern: [], pattern_index: [], tokens: [], changelog: [] };
  for (const [id, tabs] of byKind.component) {
    if (chosenIds.includes(id)) continue;
    for (const u of tabs.sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).slice(0, limits.tabs_per_component)) {
      if (!chosen.has(u)) reserves.component.push(u);
    }
  }
  for (const kind of ["pattern", "pattern_index", "changelog"]) {
    for (const u of byKind[kind]) if (!chosen.has(u)) reserves[kind].push(u);
  }
  for (const u of tokenUrls) if (!chosen.has(u)) reserves.tokens.push(u);
  return {
    sample,
    reserves,
    counts: {
      components_found: componentIds.length,
      components_sampled: chosenIds.length,
      component_names_found: componentIds,
      patterns_found: byKind.pattern.length,
      token_pages_found: byKind.tokens.length,
      changelog_found: byKind.changelog.length > 0,
    },
  };
}
