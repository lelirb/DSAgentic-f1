// Etapa 3 — encontrar el Design System completo desde cualquier dirección.
// Todo es determinístico y genérico: no hay nombres de Design Systems concretos.
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
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) && urls.length + children.length < MAX_LISTED_URLS) {
    const loc = m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").trim();
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
  const blocks = [];
  const re = /<(nav|aside|header)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) blocks.push(m[2]);
  const roleRe = /<[a-z]+\b[^>]*role\s*=\s*["']navigation["'][^>]*>([\s\S]{0,200000}?)<\/(?:div|ul|section)>/gi;
  while ((m = roleRe.exec(html))) blocks.push(m[1]);
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

export function classifyUrl(url) {
  let p;
  try {
    p = new URL(url).pathname.toLowerCase();
  } catch {
    return "other";
  }
  if (/\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|mp4|woff2?|ttf|css|js)$/.test(p)) return "asset";
  if (/changelog|release-notes|\/releases?(\/|$)|whats-new|novedades|historial-de-cambios/.test(p)) return "changelog";
  if (isLikelyComponentPage(url)) return "component";
  if (/\/(patterns?|patrones?|templates?|plantillas?|recipes?)(\/|$)/.test(p)) {
    const slug = p.split("/").filter(Boolean).pop();
    return /^(patterns?|patrones?|templates?|plantillas?|recipes?|overview|index)$/.test(slug) ? "pattern_index" : "pattern";
  }
  if (/tokens?|foundations?|fundamentos|colou?rs?|spacing|espaciado|typography|tipograf|elevation|elevaci|motion|movimiento|themes?|temas?|radius|shadows?|sombras?/.test(p)) return "tokens";
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
  // Los tokens con "token" en la dirección van primero: suelen ser las tablas.
  const tokenUrls = [...byKind.tokens].sort((a, b) => Number(/token/i.test(b)) - Number(/token/i.test(a)) || (a < b ? -1 : 1));
  const ordered = [
    rootUrl,
    ...componentUrls,
    ...byKind.pattern_index.slice(0, 1),
    ...evenlySpaced(byKind.pattern, limits.patterns),
    ...tokenUrls.slice(0, limits.token_pages),
    ...byKind.changelog.slice(0, limits.changelog),
  ];
  const sample = [...new Set(ordered)].slice(0, maxPages);
  return {
    sample,
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
