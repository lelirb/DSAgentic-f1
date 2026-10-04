import { fetchWithTimeout } from "./fetcher.js";
import { adapterFor, isScriptShell, markdownToHtml, doccJsonToHtml } from "./adapters.js";
import { readOfficialSources } from "./officialSources.js";
import { extractLinks, isInScope, normalizeUrl } from "./discovery.js";
import {
  findDsRoot, parseLlmsTxt, parseSitemap, parseRobotsSitemaps, extractNavLinks,
  buildSample, officialSourceKind, officialSourceKey, classifyUrl,
} from "./siteMap.js";
import { isLikelyComponentPage, componentIdentity } from "../extractor/detectComponents.js";
import { visibleTextLength, MIN_READABLE_TEXT } from "../extractor/readPage.js";

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
  // Lector con navegador para páginas que arman su contenido con JavaScript
  // (ver renderer.js). null = no se usa. Se inyecta para poder probarlo sin
  // navegador real: basta un objeto con `available` y `render(url, opts)`.
  renderer: null,
  render_timeout: 20000,
  // Abrir páginas con un navegador es mucho más lento que pedirlas. Cuando hace
  // falta, el límite de tiempo del rastreo se amplía una vez en esta cantidad.
  render_extra_ms: 0,
  // Avisos de avance para la interfaz: on_progress({ step, ...datos }).
  on_progress: null,
};

const MAX_REPLACEMENTS = 12;

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
    outOfScopeSeen: new Set(), variantsPerPath: new Map(), listingDocs: [],
    limited: false, timeLimited: false,
    deadline: opts.max_duration_ms ? Date.now() + opts.max_duration_ms : Infinity,
    // Scope is anchored to where the entry URL actually LANDS (apex -> www, etc.).
    ctx: {
      scopeUrl: entryUrl, sources: createSourceLog(),
      render: { used: false, rendered: 0, failed: 0, empty: 0, skipped: 0, unavailable: false, detail: null },
    },
  };
  const emit = (event) => {
    if (typeof opts.on_progress !== "function") return;
    try { opts.on_progress(event); } catch { /* un aviso de avance nunca debe romper el rastreo */ }
  };
  st.emit = emit;
  st.ctx.emit = emit;
  st.ctx.deadline = () => st.deadline;
  st.ctx.onRenderStart = () => {
    if (Number.isFinite(st.deadline) && opts.render_extra_ms > 0) st.deadline += opts.render_extra_ms;
  };
  emit({ step: "open" });
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
      emit({ step: "listing" });
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

    let planned = listing.urls.length ? buildSample(listing.urls, { rootUrl: root, maxPages: opts.max_pages }) : null;
    // La raíz se adivina a partir de la dirección PEGADA. Si el usuario pegó una
    // página profunda cuyo segmento no está en SECTION_SEGMENTS (p. ej.
    // /design-principles), la raíz queda demasiado abajo y el filtro `inRoot`
    // descarta el sistema entero: visto en vivo con Fluent 2, donde un sitemap
    // de ~140 direcciones quedó reducido a 1. Si la lista existe pero no
    // sobrevive ningún componente, se reintenta desde el origen del sitio.
    if (listing.urls.length && planned && planned.counts.components_found === 0) {
      let origin = null;
      try { origin = `${new URL(root).origin}/`; } catch { origin = null; }
      if (origin && origin !== root) {
        const wider = buildSample(listing.urls, { rootUrl: origin, maxPages: opts.max_pages });
        if (wider.counts.components_found > 0) {
          planned = wider;
          discovery.root_url = origin;
          discovery.root_widened_from = root;
        }
      }
    }
    if (planned && planned.counts.components_found > 0) {
      discovery.method = listing.method;
      discovery.listing_url = listing.url;
      Object.assign(discovery, planned.counts);
      emit({
        step: "plan", method: listing.method, components_found: planned.counts.components_found,
        components_sampled: planned.counts.components_sampled, pages: planned.sample.length,
      });
      await readSample(st, planned.sample, listing.urls, planned.reserves);
    } else {
      // Plan B: recorrido de enlaces desde la entrada (comportamiento anterior).
      emit({ step: "plan", method: "links", components_found: null, components_sampled: null, pages: null });
      queue = enqueueLinks(st, [entry]);
      queue = await bfs(st, queue);
      const names = new Set(st.pages.filter((p) => /html/.test(p.contentType || "") && isLikelyComponentPage(p.url)).map((p) => componentIdentity(p.url)));
      discovery.components_sampled = names.size;
    }
    discovery.official_sources = collectOfficialSources(st);
    // Lo que el sistema declara como suyo se lee; lo que no se pueda leer queda
    // marcado como declarado-no-leído, nunca como ausente.
    if (opts.official_sources !== false) {
      if (discovery.official_sources.some((x) => x.kind === "storybook")) emit({ step: "official" });
      discovery.official_sources_read = await readOfficialSources(
        discovery.official_sources, opts, fetchImpl, st.ctx, st.pages, st.pageRecords
      );
      // Si el presupuesto de lectura se agotó, el resultado cuenta como limitado
      // por tiempo (el informe ya sabe explicar eso).
      if (discovery.official_sources.some((x) => x.time_limited)) {
        st.limited = true;
        st.timeLimited = true;
      }
    }
  }

  // Links discovered but never read because the page or time budget ran out.
  for (const item of queue) {
    st.ctx.sources.update(item.url, { status: "SKIPPED", reason: st.timeLimited ? "TIME_LIMIT" : "PAGE_LIMIT" });
  }

  // The llms.txt probe is cheap and matters for D1, so it still runs when time is
  // short — with a short timeout of its own.
  const probeOpts = st.timeLimited ? { ...opts, request_timeout: Math.min(opts.request_timeout, 3000) } : opts;
  await probeAgentManifests(probeOpts, st.visited, st.pageRecords, st.pages, fetchImpl, st.ctx, discovery);

  // Páginas que necesitaban navegador y no se llegaron a abrir por tiempo.
  if (st.ctx.render.skipped > 0) {
    st.limited = true;
    st.timeLimited = true;
  }

  discovery.render = { ...st.ctx.render };

  return {
    pages: st.pages,
    pageRecords: st.pageRecords,
    sources: st.ctx.sources.list(),
    discovery,
    render: { ...st.ctx.render },
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
    st.emit({ step: "read", done: st.pages.length, total: null });
    queue.push(...enqueueLinks(st, results));
  }
  return queue;
}

// Lee la muestra planificada. Las pestañas de un componente elegido (uso,
// estilo, código, accesibilidad…) que no estaban en el listado se agregan
// cuando aparecen enlazadas desde su propia página.
// Una candidata caída no es evidencia de ausencia: si la lista del sitio ofrece
// otra página del mismo tipo, hay que leerla antes de concluir "no lo tiene".
async function refillFailures(st, plannedSet, reserves) {
  if (!reserves) return 0;
  const kinds = ["tokens", "component", "pattern", "pattern_index", "changelog"];
  const attempted = new Set(plannedSet);
  const used = Object.fromEntries(kinds.map((k) => [k, 0]));
  let replaced = 0;
  for (let round = 0; round < 3 && replaced < MAX_REPLACEMENTS; round++) {
    if (outOfBudget(st)) break;
    const need = Object.fromEntries(kinds.map((k) => [k, 0]));
    for (const r of st.pageRecords) {
      if (r.status !== "FAILED" || !attempted.has(r.url)) continue;
      const k = classifyUrl(r.url);
      if (k in need) need[k] += 1;
    }
    const batch = [];
    for (const kind of kinds) {
      const pool = reserves[kind] || [];
      let take = need[kind] - used[kind];
      while (take > 0 && used[kind] < pool.length && replaced < MAX_REPLACEMENTS) {
        const url = pool[used[kind]++];
        if (st.visited.has(url) || st.queued.has(url)) continue;
        st.queued.add(url);
        st.ctx.sources.add({ url, role: "listed", depth: 1, status: "PENDING", reason: "REPLACEMENT" });
        batch.push({ url, depth: 1 });
        attempted.add(url);
        replaced += 1;
        take -= 1;
      }
    }
    if (!batch.length) break;
    await fetchBatch(st, batch);
  }
  return replaced;
}

async function readSample(st, sample, listedUrls, reserves) {
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
    st.emit({ step: "read", done: st.pages.length, total: st.pages.length + queue.length });
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
  await refillFailures(st, plannedSet, reserves);
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
  // El llms.txt suele declarar el Storybook y el repositorio. No es una página
  // de documentación (no va a st.pages), pero su contenido hay que mirarlo para
  // descubrir las fuentes oficiales del sistema.
  st.listingDocs.push({ url, contentType: res.contentType || "text/plain", body: res.body });
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

// Enlaces con su etiqueta. El host no siempre delata la fuente: el Storybook de
// Carbon vive en react.carbondesignsystem.com, sin la palabra "storybook" por
// ningún lado. Lo que sí lo dice es el texto del enlace.
function labelledLinks(body, contentType, baseUrl) {
  const out = [];
  if (typeof body !== "string") return out;
  if (/html/.test(contentType || "")) {
    const re = /<a\s[^<>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^<>]*>([\s\S]{0,200}?)<\/a>/gi;
    let m;
    while ((m = re.exec(body))) {
      const raw = m[1] ?? m[2] ?? m[3] ?? "";
      const link = normalizeUrl(raw, baseUrl);
      if (link) out.push({ url: link, label: (m[4] || "").replace(/<[^>]*>/g, " ").trim() });
    }
    return out;
  }
  const md = /\[([^\]]{0,120})\]\((https?:\/\/[^\s)]+)\)/g;
  let m;
  while ((m = md.exec(body))) out.push({ url: m[2], label: m[1].trim() });
  for (const u of body.match(/https?:\/\/[^\s)<>"'\]]+/g) || []) {
    if (!out.some((e) => e.url === u)) out.push({ url: u, label: "" });
  }
  return out;
}

// El sistema puede declarar su Storybook sin que la dirección lo diga.
const LABEL_KINDS = [
  [/storybook/i, "storybook"],
  [/\brepositorio\b|\brepository\b|source code|codigo fuente|c\u00f3digo fuente/i, "repository"],
];
function kindFromLabel(label) {
  for (const [re, kind] of LABEL_KINDS) if (re.test(label || "")) return kind;
  return null;
}

function collectOfficialSources(st) {
  const found = new Map();
  for (const p of [...st.pages, ...st.listingDocs]) {
    // El llms.txt es donde muchos sistemas declaran su Storybook y su repo, y no
    // es HTML: antes no se miraba y esas fuentes quedaban invisibles.
    for (const { url: link, label } of labelledLinks(p.body, p.contentType, p.url)) {
      const kind = officialSourceKind(link) || kindFromLabel(label);
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

  // Si la página llegó vacía porque se arma con JavaScript, se prueba la puerta
  // alternativa antes de darla por ilegible. El diseñador pegó el link público:
  // averiguar en qué formato publica su sitio es trabajo del evaluador.
  let contentType = res.contentType;
  let body = res.body;
  let recovered = null;
  if (opts.adapters !== false && isScriptShell(contentType, body)) {
    recovered = await recoverContent(finalUrl, body, opts, fetchImpl, log);
    if (recovered) { body = recovered.body; contentType = "text/html"; }
  }

  // Última puerta: si la página sigue vacía, se abre con un navegador, que es
  // como la vería una persona. Es lento, por eso solo se usa cuando hace falta.
  let rendered = null;
  let renderProblem = null;
  if (opts.renderer && needsBrowser(contentType, body)) {
    const out = await renderWithBrowser(finalUrl, opts, ctx);
    if (out.body) {
      rendered = out;
      body = out.body;
      contentType = "text/html";
    } else {
      renderProblem = out.problem;
    }
  }

  log && log.update(url, {
    status: "READ", reason: null, http_status: res.status, content_type: res.contentType || null,
    final_url: finalUrl !== url ? finalUrl : null,
    recovered_from: recovered ? recovered.url : null,
    via: rendered ? "browser" : null,
    render_problem: renderProblem,
    bytes: typeof body === "string" ? Buffer.byteLength(body, "utf-8") : 0,
  });
  pages.push({
    url: finalUrl, depth, contentType, body,
    recovered_from: recovered ? recovered.url : null,
    // `rendered`: el contenido solo existe después de ejecutar JavaScript.
    rendered: Boolean(rendered),
    render_problem: renderProblem,
  });
  return { url: finalUrl, depth, body, contentType };
}

// ¿La página llegó sin contenido legible? Mismo umbral que usa el extractor.
export function needsBrowser(contentType, body) {
  if (!/html/.test(contentType || "")) return false;
  return isScriptShell(contentType, body) || visibleTextLength(body) < MIN_READABLE_TEXT;
}

// Devuelve { body } si el navegador obtuvo contenido legible, o { problem }.
async function renderWithBrowser(url, opts, ctx) {
  const r = ctx.render;
  if (!opts.renderer.available) {
    if (!r.unavailable) ctx.emit && ctx.emit({ step: "browser_unavailable" });
    r.unavailable = true;
    return { problem: "BROWSER_UNAVAILABLE" };
  }
  if (!r.used) {
    r.used = true;
    ctx.onRenderStart && ctx.onRenderStart();
    ctx.emit && ctx.emit({ step: "js_detected" });
  }
  const out = await opts.renderer.render(url, {
    timeoutMs: opts.render_timeout,
    minText: MIN_READABLE_TEXT,
    deadline: ctx.deadline ? ctx.deadline() : Infinity,
  });
  if (!out.ok) {
    if (out.error === "TIME_LIMIT") r.skipped++;
    else if (out.error === "BROWSER_UNAVAILABLE") {
      if (!r.unavailable) ctx.emit && ctx.emit({ step: "browser_unavailable" });
      r.unavailable = true;
      r.detail = out.detail || null;
    } else {
      r.failed++;
      r.detail = out.detail || out.error;
    }
    return { problem: out.error };
  }
  // Una página que al cargar se va a otro sitio no es la que se pidió.
  if (out.finalUrl && !sameHost(out.finalUrl, url)) {
    r.failed++;
    return { problem: "REDIRECTED_OUTSIDE" };
  }
  if (visibleTextLength(out.body) < MIN_READABLE_TEXT) {
    r.empty++;
    return { problem: "STILL_EMPTY" };
  }
  r.rendered++;
  ctx.emit && ctx.emit({ step: "render", done: r.rendered });
  return { body: out.body };
}

// Pide las direcciones paralelas que declara el adaptador y devuelve la primera
// que traiga contenido real, convertida a HTML simple para el extractor.
async function recoverContent(url, shellBody, opts, fetchImpl, log) {
  const adapter = adapterFor(url, shellBody);
  if (!adapter) return null;
  for (const candidate of adapter.candidates) {
    const res = await fetchWithTimeout(candidate, {
      timeoutMs: Math.min(opts.request_timeout, 6000), fetchImpl, hostCheck: opts.host_check,
    });
    if (!res.ok || !res.body) continue;
    const html = /json/.test(res.contentType || "") || candidate.endsWith(".json")
      ? doccJsonToHtml(res.body)
      : markdownToHtml(res.body);
    if (!html || isScriptShell("text/html", html)) continue;
    log && log.add({
      url: candidate, role: "adapter", depth: 0, status: "READ",
      reason: `RECOVERED_${adapter.name.toUpperCase()}`, used_for: "page_content",
    });
    return { url: candidate, body: html };
  }
  return null;
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
