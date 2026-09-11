const DS_KEYWORDS = [
  "foundation", "token", "component", "pattern", "accessib",
  "guideline", "resource", "changelog", "storybook", "story", "agent",
];

export function extractLinks(html, baseUrl) {
  const links = new Set();
  const re = /<a\s+[^>]*href=["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      links.add(new URL(m[1], baseUrl).toString());
    } catch {
      // invalid/relative-to-nothing URL — skip rather than guess (section 5.5)
    }
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
  if (lower.startsWith(entry.pathname)) return true;
  return DS_KEYWORDS.some((k) => lower.includes(k));
}
