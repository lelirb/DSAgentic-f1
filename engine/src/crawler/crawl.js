import { fetchWithTimeout } from "./fetcher.js";
import { extractLinks, isInScope, normalizeUrl } from "./discovery.js";
import {
  findDsRoot, parseLlmsTxt, parseSitemap, parseRobotsSitemaps, extractNavLinks,
  buildSample, officialSourceKind, officialSourceKey,
} from "./siteMap.js";
import { isLikelyComponentPage, componentIdentity } from "../extractor/detectComponents.js";

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
  // Whole-crawl time budget. Without it a slow site could keep a request open
  // for well over a minute; when it runs out the crawl stops and is reported
  // as limited (never as "the DS lacks this").
  max_duration_ms: null,
  // Same path with different query strings (?page=2, ?sort=..., ?tab=...)
  // can eat the page budget (seen on Polaris). At most this many variants per
  // path, except Storybook-style URLs where the query IS the page (?path=, ?id=).
  max_query_variants_per_path: 3,
};

const QUERY_IS_PAGE = /(^|&)(path|id|story|selectedKind)=/i;

// URL -> Discovery -> Crawl. Never lets one failed page abort the whole run (section 9).
//
// Etapa 3: después de leer la página de entrada se reconoce la raíz del Design
// System y se busca su lista de páginas (llms.txt, sitemap.xml, menú). Si existe,
// se lee una MUESTRA ORDENADA (componentes con sus pestañas, patrones, tokens,
// changelog). Si no, se usa el recorrido de enlaces de siempre.
export async function crawl(entryUrl, options = {}, fetchImpl = fetch) {
  const opts = { ...DEFAULTS, ...options };
  const st = {
    opts, fetchImpl,
    visited: new Set(), queued: new Set([entryUrl]), pages: [], pageRecords: [],
    outOfScopeSeen: new Set(), variantsPerPath: new Map(),
    limited: false, timeLimited: false,
    deadline: opts.max_duration_ms ? Date.now() + opts.max_duration_ms : Infinity,
    // Scope is anchored to where the entry URL actually LANDS (apex -> www, etc.).
    ctx: { scopeUrl: entryUrl, sources: createSourceLog() },
  };
  st.ctx.sources.add({ url: entryUrl, role: "entry", depth: 0, status: "PENDING" });

  const discovery = {
    entry_url: entryUrl, root_url: null, method: "links", listing_url: null,
    components_found: null, components_sampled: null, component_names_found: [],
    patterns_found: null, token_pages_found: null, official_sources: [],
    probed: { llms_txt: "NOT_CHECKED", sitemap: "NOT_CHECKED" },
  };

  const [entry] = await fetchBatch(st, [{ url: entryUrl, depth: 0 }]);
  let queue = [];

  if (entry) {
    const root = findDsRoot(st.ctx.scopeUrl);
    discovery.root_url = root;
    let listing = { method: null, urls: [], url: null };
    if (opts.discovery !== false && root) {
      listing = await discoverListing(st, root, discovery);
      if (!listing.urls.length) {
        // Menú de navegación: de la raíz (si no es la entrada) y de la entrada.
        const navPages = [entry];
        if (normalizeUrl(root, root) !== normalizeUrl(entry.url, entry.url)) {
          const [rootPage] = await fetchBatch(st, [{ url: root, depth: 1, role: "root", soft: true }]);
          if (rootPage) navPages.push(rootPage);
        }
        const nav = new Set([entry.url]);
        for (const p of navPages) if (/html/.test(p.contentType || "")) for (const l of extractNavLinks(p.body, p.url)) nav.add(l);
        const sampleCheck = buildSample([...nav], { rootUrl: root });
        if (sampleCheck.counts.components_found > 0) listing = { method: "navigation", urls: [...nav], url: null };
      }
    }

    const planned = listing.urls.length ? buildSample(listing.urls, { rootUrl: root, maxPages: opts.max_pages }) : null;
    if (planned && planned.counts.components_found > 0) {
      discovery.method = listing.method;
      discovery.listing_url = listing.url;
      Object.assign(discovery, planned.counts);
      await readSample(st, planned.sample, listing.urls);
    } else {
      // Plan B: recorrido de enlaces desde la entrada (comportamiento anterior).
      queue = enqueueLinks(st, [entry]);
      queue = await bfs(st, queue);
      const names = new Set(st.pages.filter((p) => /html/.test(p.contentType || "") && isLikelyComponentPage(p.url)).map((p) => componentIdentity(p.url)));
      discovery.components_sampled = names.size;
    }
    discovery.official_sources = collectOfficialSources(st);
  }

  // Links discovered but never read because the page or time budget ran out.
  for (const item of queue) {
    st.ctx.sources.update(item.url, { status: "SKIPPED", reason: st.timeLimited ? "TIME_LIMIT" : "PAGE_LIMIT" });
  }

  // The llms.txt probe is cheap and matters for D1, so it still runs when time is
  // short — with a short timeout of its own.
  const probeOpts = st.timeLimited ? { ...opts, request_timeout: Math.min(opts.request_timeout, 3000) } : opts;
  await probeAgentManifests(probeOpts, st.visited, st.pageRecords, st.pages, fetchImpl, st.ctx, discovery);

  return {
    pages: st.pages,
    pageRecords: st.pageRecords,
    sources: st.ctx.sources.list(),
    discovery,
    stats: {
      pages_found: st.pageRecords.length,
      pages_retrieved: st.pages.length,
      pages_failed: st.pageRecords.filter((p) => p.status === "FAILED").length,
      crawl_limited: st.limited,
      time_limited: st.timeLimited,
    },
  };
}

function outOfBudget(st) {
  if (st.pages.length >= st.opts.max_pages) {
    st.limited = true;
    return true;
  }
  if (Date.now() >= st.deadline) {
    st.limited = true;
    st.timeLimited = true;
    return true;
  }
  return false;
}

async function fetchBatch(st, batch) {
  const remainingMs = st.deadline - Date.now();
  const timeoutMs = Number.isFinite(remainingMs)
    ? Math.max(1000, Math.min(st.opts.request_timeout, remainingMs))
    : st.opts.request_timeout;
  for (const item of batch) {
    if (item.role) st.ctx.sources.add({ url: item.url, role: item.role, depth: item.depth, status: "PENDING" });
  }
  const results = await Promise.all(
    batch.map((item) => processOne(item, { ...st.opts, request_timeout: timeoutMs }, st.visited, st.pageRecords, st.pages, st.fetchImpl, st.ctx))
  );
  return results;
}

function enqueueLinks(st, results) {
  const queue = [];
  const sources = st.ctx.sources;
  for (const r of results) {
    if (!r || !r.body || !/html/.test(r.contentType || "")) continue;
    // Resolve relative links against the FINAL url (after redirects), not the requested one.
    for (const link of extractLinks(r.body, r.url)) {
      if (st.visited.has(link)) continue;
      if (!isInScope(link, st.ctx.scopeUrl, st.opts.allowed_paths)) {
        // Counted once per distinct URL — the same nav/footer link repeated on
        // every page was inflating pages_found (e.g. 1859 "found" for 25 fetched).
        if (!st.outOfScopeSeen.has(link)) {
          st.outOfScopeSeen.add(link);
          st.pageRecords.push({ url: link, status: "OUT_OF_SCOPE", reason: "outside crawl scope" });
          sources.add({ url: link, role: "link", depth: r.depth + 1, status: "OUT_OF_SCOPE", reason: "OUTSIDE_SCOPE", found_on: r.url });
        }
        continue;
      }
      if (st.queued.has(link)) continue; // already waiting in the queue
      const u = new URL(link);
      if (u.search && !QUERY_IS_PAGE.test(u.search.slice(1))) {
        const key = `${u.origin}${u.pathname}`;
        const n = st.variantsPerPath.get(key) || 0;
        if (n >= st.opts.max_query_variants_per_path) {
          sources.add({ url: link, role: "link", depth: r.depth + 1, status: "SKIPPED", reason: "QUERY_VARIANT_LIMIT", found_on: r.url });
          continue;
        }
        st.variantsPerPath.set(key, n + 1);
      }
      st.queued.add(link);
      queue.push({ url: link, depth: r.depth + 1 });
      sources.add({ url: link, role: "link", depth: r.depth + 1, status: "PENDING", found_on: r.url });
    }
  }
  return queue;
}

async function bfs(st, queue) {
  while (queue.length > 0) {
    if (outOfBudget(st)) break;
    const batchSize = Math.min(st.opts.concurrency, st.opts.max_pages - st.pages.length);
    const batch = queue.splice(0, batchSize);
    const results = await fetchBatch(st, batch);
    queue.push(...enqueueLinks(st, results));
  }
  return queue;
}

// Lee la muestra planificada. Las pestañas de un componente elegido (uso,
// estilo, código, accesibilidad…) que no estaban en el listado se agregan
// cuando aparecen enlazadas desde su propia página.
async function readSample(st, sample, listedUrls) {
  const sources = st.ctx.sources;
  const listed = new Set(listedUrls);
  const plannedSet = new Set(sample);
  const chosenIds = new Set(sample.filter((u) => isLikelyComponentPage(u)).map((u) => componentIdentity(u)));
  const tabsPerId = new Map();
  for (const u of sample) {
    if (isLikelyComponentPage(u)) tabsPerId.set(componentIdentity(u), (tabsPerId.get(componentIdentity(u)) || 0) + 1);
  }
  let queue = sample.filter((u) => !st.visited.has(u)).map((url) => ({ url, depth: 1 }));
  for (const item of queue) {
    st.queued.add(item.url);
    sources.add({ url: item.url, role: "listed", depth: 1, status: "PENDING" });
  }
  while (queue.length > 0) {
    if (outOfBudget(st)) break;
    const batch = queue.splice(0, Math.min(st.opts.concurrency, st.opts.max_pages - st.pages.length));
    const results = await fetchBatch(st, batch);
    for (const r of results) {
      if (!r || !/html/.test(r.contentType || "") || !isLikelyComponentPage(r.url)) continue;
      const id = componentIdentity(r.url);
      if (!chosenIds.has(id)) continue;
      for (const link of extractLinks(r.body, r.url)) {
        if (st.queued.has(link) || st.visited.has(link) || !sameHost(link, st.ctx.scopeUrl)) continue;
        if (!isLikelyComponentPage(link) || componentIdentity(link) !== id) continue;
        if ((tabsPerId.get(id) || 0) >= 5) break;
        tabsPerId.set(id, (tabsPerId.get(id) || 0) + 1);
        st.queued.add(link);
        queue.push({ url: link, depth: 2 });
        sources.add({ url: link, role: "link", depth: 2, status: "PENDING", found_on: r.url });
      }
    }
  }
  for (const item of queue) sources.update(item.url, { status: "SKIPPED", reason: st.timeLimited ? "TIME_LIMIT" : "PAGE_LIMIT" });
  // Lo listado que no entró en la muestra queda registrado como "no leído".
  let n = 0;
  for (const u of listed) {
    if (plannedSet.has(u) || st.visited.has(u)) continue;
    if (n++ >= 400) break; // el registro no necesita miles de filas
    sources.add({ url: u, role: "listed", depth: 1, status: "SKIPPED", reason: "NOT_IN_SAMPLE" });
  }
}

async function fetchListingFile(st, url) {
  if (st.visited.has(url)) return null;
  st.visited.add(url);
  const res = await fetchWithTimeout(url, {
    timeoutMs: Math.min(st.opts.request_timeout, 6000), fetchImpl: st.fetchImpl, hostCheck: st.opts.host_check,
  });
  const log = st.ctx.sources;
  const base = { url, role: "well_known", depth: 0, http_status: res.status ?? null, content_type: res.contentType || null };
  if (!res.ok) {
    const missing = res.status === 404 || res.status === 410;
    log.add({ ...base, status: missing ? "NOT_PRESENT" : "FAILED", reason: missing ? `HTTP_${res.status}` : res.error || `HTTP_${res.status}` });
    return { missing, failed: !missing };
  }
  if (!sameHost(res.url || url, st.ctx.scopeUrl)) {
    log.add({ ...base, status: "OUT_OF_SCOPE", reason: "REDIRECTED_OUTSIDE", final_url: res.url });
    return { missing: false, failed: true };
  }
  return { res, log, base };
}

// llms.txt y sitemap.xml (en la raíz del DS y en la raíz del sitio, más los
// sitemaps declarados en robots.txt).
async function discoverListing(st, root, discovery) {
  const origin = new URL(root).origin + "/";
  const llmsCandidates = [...new Set([`${root}llms.txt`, `${origin}llms.txt`])];
  let llmsMissing = 0;
  for (const url of llmsCandidates) {
    const got = await fetchListingFile(st, url);
    if (!got) continue;
    if (!got.res) {
      if (got.missing) llmsMissing++;
      continue;
    }
    const { res, log, base } = got;
    const looksLikeHtml = /html/.test(res.contentType || "") || /^\s*</.test(res.body || "");
    if (!res.body || !res.body.trim() || looksLikeHtml) {
      log.add({ ...base, status: "NOT_PRESENT", reason: looksLikeHtml ? "HTML_FALLBACK" : "EMPTY" });
      llmsMissing++;
      continue;
    }
    log.add({ ...base, status: "READ", reason: null, bytes: Buffer.byteLength(res.body, "utf-8") });
    st.pageRecords.push({ url, status: "CRAWLED", reason: "well-known location probe" });
    st.pages.push({ url, depth: 0, contentType: res.contentType, body: res.body });
    discovery.probed.llms_txt = "FOUND";
    const urls = parseLlmsTxt(res.body, url);
    if (buildSample(urls, { rootUrl: root }).counts.components_found > 0) {
      return { method: "llms.txt", urls, url };
    }
  }
  if (discovery.probed.llms_txt !== "FOUND") discovery.probed.llms_txt = llmsMissing === llmsCandidates.length ? "ABSENT" : "UNKNOWN";

  const sitemapCandidates = [...new Set([`${root}sitemap.xml`, `${origin}sitemap.xml`])];
  const robots = await fetchListingFile(st, `${origin}robots.txt`);
  if (robots && robots.res) {
    robots.log.add({ ...robots.base, status: "READ", reason: null, used_for: "sitemap_lookup" });
    for (const s of parseRobotsSitemaps(robots.res.body)) {
      const n = normalizeUrl(s, origin);
      if (n && sameHost(n, root)) sitemapCandidates.push(n);
    }
  }
  let sitemapMissing = 0;
  const all = new Set();
  let firstUrl = null;
  const pending = [...new Set(sitemapCandidates)];
  let childBudget = 6;
  while (pending.length) {
    if (Date.now() >= st.deadline) break;
    const url = pending.shift();
    const got = await fetchListingFile(st, url);
    if (!got) continue;
    if (!got.res) {
      if (got.missing) sitemapMissing++;
      continue;
    }
    const { res, log, base } = got;
    if (!/<(urlset|sitemapindex)[\s>]/i.test(res.body || "")) {
      log.add({ ...base, status: "NOT_PRESENT", reason: "NOT_A_SITEMAP" });
      sitemapMissing++;
      continue;
    }
    log.add({ ...base, status: "READ", reason: null, used_for: "page_list", bytes: Buffer.byteLength(res.body, "utf-8") });
    const parsed = parseSitemap(res.body);
    firstUrl = firstUrl || url;
    for (const u of parsed.urls) {
      const n = normalizeUrl(u, url);
      if (n) all.add(n);
    }
    // Índice de sitemaps: primero los hijos que parecen de la documentación.
    const kids = parsed.children
      .map((c) => normalizeUrl(c, url))
      .filter((c) => c && sameHost(c, root))
      .sort((a, b) => Number(/doc|design|component|page/i.test(b)) - Number(/doc|design|component|page/i.test(a)));
    for (const k of kids) {
      if (childBudget-- <= 0) break;
      pending.push(k);
    }
  }
  discovery.probed.sitemap = all.size ? "FOUND" : sitemapMissing >= sitemapCandidates.length ? "ABSENT" : "UNKNOWN";
  if (all.size) return { method: "sitemap", urls: [...all], url: firstUrl };
  return { method: null, urls: [], url: null };
}

function collectOfficialSources(st) {
  const found = new Map();
  for (const p of st.pages) {
    if (!/html/.test(p.contentType || "")) continue;
    for (const link of extractLinks(p.body, p.url)) {
      const kind = officialSourceKind(link);
      if (!kind || sameHost(link, st.ctx.scopeUrl)) continue;
      const key = officialSourceKey(link, kind);
      if (!found.has(key)) found.set(key, { url: key, kind, found_on: p.url });
    }
  }
  const list = [...found.values()].slice(0, 10);
  for (const s of list) {
    st.ctx.sources.add({ url: s.url, role: "official_external", depth: null, status: "SKIPPED", reason: "EXTERNAL_NOT_READ_YET", found_on: s.found_on });
  }
  return list;
}

async function processOne({ url, depth, soft = false }, opts, visited, pageRecords, pages, fetchImpl, ctx) {
  const log = ctx.sources;
  if (visited.has(url)) {
    log && log.update(url, { status: "DUPLICATE", reason: "ALREADY_READ" }, { onlyIfPending: true });
    return null;
  }
  visited.add(url);

  if (depth > opts.max_depth) {
    pageRecords.push({ url, status: "OUT_OF_SCOPE", reason: "max_depth exceeded" });
    log && log.update(url, { status: "SKIPPED", reason: "DEPTH_LIMIT" });
    return null;
  }

  const res = await fetchWithTimeout(url, { timeoutMs: opts.request_timeout, fetchImpl, hostCheck: opts.host_check });
  if (!res.ok) {
    if (soft) {
      // Discovery step (e.g. the DS root page): not having it is not a failed page.
      const gone = res.status === 404 || res.status === 410;
      log && log.update(url, { status: gone ? "NOT_PRESENT" : "FAILED", reason: res.error || `HTTP_${res.status}`, http_status: res.status ?? null });
      return null;
    }
    // Section 45: distinguish the actual technical reason, don't collapse into NOT_FOUND.
    pageRecords.push({ url, status: "FAILED", reason: res.error || `HTTP ${res.status}` });
    log && log.update(url, { status: "FAILED", reason: res.error || `HTTP_${res.status}`, http_status: res.status ?? null });
    return null;
  }

  const finalUrl = res.url || url;
  if (depth === 0) {
    ctx.scopeUrl = finalUrl;
  } else if (finalUrl !== url && !sameHost(finalUrl, ctx.scopeUrl)) {
    pageRecords.push({ url, status: "OUT_OF_SCOPE", reason: `redirected outside crawl scope (${finalUrl})` });
    log && log.update(url, { status: "OUT_OF_SCOPE", reason: "REDIRECTED_OUTSIDE", final_url: finalUrl, http_status: res.status });
    return null;
  }
  if (finalUrl !== url) {
    if (visited.has(finalUrl) && depth > 0) {
      log && log.update(url, { status: "DUPLICATE", reason: "ALREADY_READ", final_url: finalUrl });
      return null; // already crawled under its canonical URL
    }
    visited.add(finalUrl);
  }

  pageRecords.push({ url: finalUrl, status: "CRAWLED", reason: null });
  log && log.update(url, {
    status: "READ", reason: null, http_status: res.status, content_type: res.contentType || null,
    final_url: finalUrl !== url ? finalUrl : null,
    bytes: typeof res.body === "string" ? Buffer.byteLength(res.body, "utf-8") : 0,
  });
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
async function probeAgentManifests(opts, visited, pageRecords, pages, fetchImpl, ctx, discovery = null) {
  let base;
  try {
    base = new URL(ctx.scopeUrl);
  } catch {
    return;
  }
  const dir = base.pathname.endsWith("/") ? base.pathname : base.pathname.replace(/[^/]*$/, "");
  const candidates = [...new Set([new URL("/llms.txt", base).toString(), new URL(`${dir}llms.txt`, base).toString()])];
  let missing = 0;

  for (const url of candidates) {
    if (visited.has(url)) continue;
    visited.add(url);
    const res = await fetchWithTimeout(url, { timeoutMs: opts.request_timeout, fetchImpl, hostCheck: opts.host_check });
    const looksLikeHtml = /html/.test(res.contentType || "") || /^\s*</.test(res.body || "");
    const log = ctx.sources;
    const base = { url, role: "well_known", depth: 0, http_status: res.status ?? null, content_type: res.contentType || null };
    if (!res.ok) {
      const gone = res.status === 404 || res.status === 410;
      log && log.add({ ...base, status: gone ? "NOT_PRESENT" : "FAILED", reason: gone ? `HTTP_${res.status}` : res.error || `HTTP_${res.status}` });
      if (gone) missing++;
      continue;
    }
    if (!res.body || !res.body.trim() || looksLikeHtml) {
      log && log.add({ ...base, status: "NOT_PRESENT", reason: looksLikeHtml ? "HTML_FALLBACK" : "EMPTY" });
      missing++;
      continue;
    }
    if (!sameHost(res.url || url, ctx.scopeUrl)) {
      log && log.add({ ...base, status: "OUT_OF_SCOPE", reason: "REDIRECTED_OUTSIDE", final_url: res.url });
      continue;
    }
    log && log.add({ ...base, status: "READ", reason: null, bytes: Buffer.byteLength(res.body, "utf-8") });
    pageRecords.push({ url, status: "CRAWLED", reason: "well-known location probe" });
    pages.push({ url, depth: 0, contentType: res.contentType, body: res.body });
    if (discovery) discovery.probed.llms_txt = "FOUND";
  }
  if (discovery && discovery.probed.llms_txt !== "FOUND" && candidates.length) {
    const alreadyAbsent = discovery.probed.llms_txt === "ABSENT";
    if (missing === candidates.length) discovery.probed.llms_txt = "ABSENT";
    else if (!alreadyAbsent && discovery.probed.llms_txt === "NOT_CHECKED") discovery.probed.llms_txt = "UNKNOWN";
  }
}

function sameHost(a, b) {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

// Ordered, de-duplicated log of sources. `update` only touches an existing entry;
// statuses: PENDING (internal, never returned), READ, FAILED, NOT_PRESENT,
// OUT_OF_SCOPE, SKIPPED, DUPLICATE.
function createSourceLog() {
  const byUrl = new Map();
  return {
    add(entry) {
      if (byUrl.has(entry.url)) return;
      byUrl.set(entry.url, {
        url: entry.url, role: entry.role, status: entry.status, reason: entry.reason ?? null,
        depth: entry.depth ?? null, found_on: entry.found_on ?? null, http_status: entry.http_status ?? null,
        content_type: entry.content_type ?? null, final_url: entry.final_url ?? null, bytes: entry.bytes ?? null,
      });
    },
    update(url, patch, { onlyIfPending = false } = {}) {
      const e = byUrl.get(url);
      if (!e) return;
      if (onlyIfPending && e.status !== "PENDING") return;
      Object.assign(e, patch);
    },
    // Anything still PENDING was queued but never processed (should not happen
    // after the budget sweep); report it honestly as skipped.
    list() {
      return [...byUrl.values()].map((e) => (e.status === "PENDING" ? { ...e, status: "SKIPPED", reason: "NOT_PROCESSED" } : e));
    },
  };
}
