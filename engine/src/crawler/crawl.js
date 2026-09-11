import { fetchWithTimeout } from "./fetcher.js";
import { extractLinks, isInScope } from "./discovery.js";

const DEFAULTS = {
  max_pages: 40,
  max_depth: 3,
  request_timeout: 10000,
  concurrency: 4,
  allowed_domains: null,
  allowed_paths: null,
  // SSRF: validates EVERY URL the crawler requests (entry, discovered links,
  // each redirect hop, manifest probes) — not only the entry URL. null = off
  // (fully mocked tests), same convention as pipeline.js's ssrfCheck.
  host_check: null,
};

// URL -> Discovery -> Crawl. Never lets one failed page abort the whole run (section 9).
export async function crawl(entryUrl, options = {}, fetchImpl = fetch) {
  const opts = { ...DEFAULTS, ...options };
  const visited = new Set();
  const queue = [{ url: entryUrl, depth: 0 }];
  const pages = [];
  const pageRecords = [];
  const outOfScopeSeen = new Set();
  // Scope is anchored to where the entry URL actually LANDS. Real sites often
  // redirect apex -> www, http -> https, or an old domain to a new one; anchoring
  // scope to the typed URL made every discovered link "out of scope" in that case,
  // silently shrinking the crawl to a single page.
  const ctx = { scopeUrl: entryUrl };
  let limited = false;

  while (queue.length > 0) {
    if (pages.length >= opts.max_pages) {
      limited = true;
      break;
    }
    const remainingBudget = opts.max_pages - pages.length;
    const batchSize = Math.min(opts.concurrency, remainingBudget);
    const batch = queue.splice(0, batchSize);
    const results = await Promise.all(batch.map((item) => processOne(item, opts, visited, pageRecords, pages, fetchImpl, ctx)));

    for (const r of results) {
      if (!r || !r.body || !/html/.test(r.contentType || "")) continue;
      // Resolve relative links against the FINAL url (after redirects), not the requested one.
      const links = extractLinks(r.body, r.url);
      for (const link of links) {
        if (visited.has(link)) continue;
        if (!isInScope(link, ctx.scopeUrl, opts.allowed_paths)) {
          // Counted once per distinct URL — the same nav/footer link repeated on
          // every page was inflating pages_found (e.g. 1859 "found" for 25 fetched).
          if (!outOfScopeSeen.has(link)) {
            outOfScopeSeen.add(link);
            pageRecords.push({ url: link, status: "OUT_OF_SCOPE", reason: "outside crawl scope" });
          }
          continue;
        }
        queue.push({ url: link, depth: r.depth + 1 });
      }
    }
  }

  await probeAgentManifests(opts, visited, pageRecords, pages, fetchImpl, ctx);

  return {
    pages,
    pageRecords,
    stats: {
      pages_found: pageRecords.length,
      pages_retrieved: pages.length,
      pages_failed: pageRecords.filter((p) => p.status === "FAILED").length,
      crawl_limited: limited,
    },
  };
}

async function processOne({ url, depth }, opts, visited, pageRecords, pages, fetchImpl, ctx) {
  if (visited.has(url)) return null;
  visited.add(url);

  if (depth > opts.max_depth) {
    pageRecords.push({ url, status: "OUT_OF_SCOPE", reason: "max_depth exceeded" });
    return null;
  }

  const res = await fetchWithTimeout(url, { timeoutMs: opts.request_timeout, fetchImpl, hostCheck: opts.host_check });
  if (!res.ok) {
    // Section 45: distinguish the actual technical reason, don't collapse into NOT_FOUND.
    pageRecords.push({ url, status: "FAILED", reason: res.error || `HTTP ${res.status}` });
    return null;
  }

  const finalUrl = res.url || url;
  if (depth === 0) {
    ctx.scopeUrl = finalUrl;
  } else if (finalUrl !== url && !sameHost(finalUrl, ctx.scopeUrl)) {
    pageRecords.push({ url, status: "OUT_OF_SCOPE", reason: `redirected outside crawl scope (${finalUrl})` });
    return null;
  }
  if (finalUrl !== url) {
    if (visited.has(finalUrl) && depth > 0) return null; // already crawled under its canonical URL
    visited.add(finalUrl);
  }

  pageRecords.push({ url: finalUrl, status: "CRAWLED", reason: null });
  pages.push({ url: finalUrl, depth, contentType: res.contentType, body: res.body });
  return { url: finalUrl, depth, body: res.body, contentType: res.contentType };
}

// llms.txt lives at a well-known location and is almost never LINKED from HTML —
// an agent looks for it directly. Discovering it only via <a href> meant a DS
// that publishes one still scored agent_manifest = NONE ("no sé" -> "está mal").
// Probed at the origin root and at the entry path. Only a SUCCESSFUL, non-HTML
// response is recorded: a missing probe is not a failed page (it must not feed
// pages_failed / tokens_status), and an HTML 200 is treated as a soft-404 (SPA
// fallback), not as a manifest.
async function probeAgentManifests(opts, visited, pageRecords, pages, fetchImpl, ctx) {
  let base;
  try {
    base = new URL(ctx.scopeUrl);
  } catch {
    return;
  }
  const dir = base.pathname.endsWith("/") ? base.pathname : base.pathname.replace(/[^/]*$/, "");
  const candidates = [...new Set([new URL("/llms.txt", base).toString(), new URL(`${dir}llms.txt`, base).toString()])];

  for (const url of candidates) {
    if (visited.has(url)) continue;
    visited.add(url);
    const res = await fetchWithTimeout(url, { timeoutMs: opts.request_timeout, fetchImpl, hostCheck: opts.host_check });
    const looksLikeHtml = /html/.test(res.contentType || "") || /^\s*</.test(res.body || "");
    if (!res.ok || !res.body || !res.body.trim() || looksLikeHtml) continue;
    if (!sameHost(res.url || url, ctx.scopeUrl)) continue;
    pageRecords.push({ url, status: "CRAWLED", reason: "well-known location probe" });
    pages.push({ url, depth: 0, contentType: res.contentType, body: res.body });
  }
}

function sameHost(a, b) {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}
