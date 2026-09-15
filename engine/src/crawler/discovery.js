const DS_KEYWORDS = [
  "foundation", "token", "component", "pattern", "accessib",
  "guideline", "resource", "changelog", "storybook", "story", "agent",
];

// Query parameters that never change the page content (analytics / tracking).
const TRACKING_PARAMS = /^(utm_\w+|gclid|fbclid|msclkid|mc_cid|mc_eid|ref|ref_src|_ga|_gl)$/i;

const decodeEntities = (s) => s.replace(/&amp;/g, "&").replace(/&#38;/g, "&");

// One canonical form per page: no #fragment (same document), no tracking
// params, remaining params sorted. Returns null for non-http(s) links
// (mailto:, tel:, javascript:) — those are not pages.
export function normalizeUrl(raw, baseUrl) {
  let u;
  try {
    u = new URL(decodeEntities(raw.trim()), baseUrl);
  } catch {
    return null; // invalid/relative-to-nothing URL — skip rather than guess (section 5.5)
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = "";
  const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = kept.length ? new URLSearchParams(kept).toString() : "";
  return u.toString();
}

// FIX: the previous pattern ([^"'#]+ followed by a closing quote) did not strip
// the fragment — it silently DROPPED every link that had one, so
// /components/button#usage was never followed. Unquoted href=... was also missed.
// Same-page anchors (href="#section") resolve to the current page and are skipped.
export function extractLinks(html, baseUrl) {
  const links = new Set();
  const current = normalizeUrl(baseUrl, baseUrl);
  const re = /<a\s[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const link = normalizeUrl(raw, baseUrl);
    if (link && link !== current) links.add(link);
  }
  return [...links];
}

export function isInScope(url, entryUrl, allowedPaths) {
  let u, entry;
  try {
    u = new URL(url);
    entry = new URL(entryUrl);
  } catch {
    return false;
  }
  if (u.hostname !== entry.hostname) return false; // section 10: allowed_domains
  if (allowedPaths && allowedPaths.length > 0) {
    return allowedPaths.some((p) => u.pathname.startsWith(p));
  }
  const lower = u.pathname.toLowerCase();
  if (lower.startsWith(entry.pathname.toLowerCase())) return true;
  return DS_KEYWORDS.some((k) => lower.includes(k));
}
