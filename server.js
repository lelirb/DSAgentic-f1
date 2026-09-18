import http from "node:http";
import { readFile, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluate } from "./engine/src/evaluator/index.js";
import { evaluateUrl } from "./engine/src/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const weights = JSON.parse(readFileSync(path.join(__dirname, "engine/config/weights.json"), "utf-8"));
const rules = JSON.parse(readFileSync(path.join(__dirname, "engine/config/rules.json"), "utf-8"));

const PORT = process.env.PORT || 8787;
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript; charset=utf-8", ".json": "application/json" };

const MAX_API_BODY_BYTES = 16 * 1024;

const DEMO_FIXTURES = new Set(["good", "partial", "poor", "contradictory", "not_applicable", "not_evaluable", "d1_gate"]);

// Rate limiting: only on the "url" path (real crawl). In-memory sliding window
// per client IP — fine for a single-process prototype; a real deployment
// behind a load balancer would need a shared store and to trust
// X-Forwarded-For only from a known proxy (documented, not set up here).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateLimitLog = new Map();

// Global cap on simultaneous live crawls. The per-IP limit alone does not stop
// several different visitors from crawling heavy sites at once, and each crawl can
// hold up to max_pages x 5MB in memory — enough to exhaust Render's free 512MB.
const MAX_CONCURRENT_EVALUATIONS = Number(process.env.MAX_CONCURRENT_EVALUATIONS) || 2;
let activeEvaluations = 0;

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (rateLimitLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitLog.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

// Drop IPs with no recent activity so the map cannot grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of rateLimitLog) {
    if (!times.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) rateLimitLog.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// Behind Render's proxy, req.socket.remoteAddress is the PROXY's address, so the
// per-IP limit silently became one global limit shared by every visitor. Render
// appends the real client IP as the LAST entry of X-Forwarded-For; earlier entries
// are client-supplied and can be forged, so they are never used. The header is
// only trusted when running on Render (RENDER=true is set by the platform) or when
// TRUST_PROXY=1 is set explicitly.
export function clientIp(req, env = process.env) {
  const trustProxy = env.RENDER === "true" || env.TRUST_PROXY === "1";
  const xff = req.headers && req.headers["x-forwarded-for"];
  if (trustProxy && typeof xff === "string") {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

// Maps an internal error to { status, code }. The UI translates `code` into a
// plain-language message (ES/EN); internal messages are never shown for 500s.
function classifyError(message) {
  if (/^Blocked:/.test(message)) return { status: 400, code: "BLOCKED" };
  if (/^Could not resolve hostname/.test(message)) return { status: 400, code: "NOT_RESOLVED" };
  const m = /^UNREACHABLE:(\w+)/.exec(message);
  if (m) return { status: 422, code: `UNREACHABLE_${m[1]}` };
  return { status: 500, code: "INTERNAL" };
}

// PATH TRAVERSAL FIX: resolve the requested path against PUBLIC_DIR and verify
// the result is still INSIDE it before ever touching the filesystem. Confirmed
// exploitable before this fix — `curl --path-as-is
// http://localhost:8787/../../../../etc/passwd` returned real file contents.
// path.join alone does NOT protect against this: `path.join(dir, "../../etc/passwd")`
// happily resolves outside `dir`, it just also normalizes the string.
function safeStaticPath(reqUrl) {
  let urlPath;
  try {
    urlPath = decodeURIComponent((reqUrl || "/").split("?")[0]);
  } catch {
    // Malformed percent-encoding (e.g. "/%E0%A4%A") used to throw inside the async
    // handler: the request hung forever with no response. Treat as not allowed.
    return null;
  }
  const target = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "/index.html" : urlPath));
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    return null;
  }
  return target;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "POST" && req.url === "/api/evaluate") {
    // The API only ever receives {"url": "..."} or {"demo": "..."}. Without a cap,
    // any client could stream an arbitrarily large body into memory.
    let body = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > MAX_API_BODY_BYTES) {
        tooLarge = true;
        sendJson(res, 413, { error: "Request body too large", code: "BAD_REQUEST" });
        req.destroy();
      }
    });
    req.on("end", async () => {
      if (tooLarge) return;
      try {
        const { url, demo } = JSON.parse(body || "{}");

        if (demo) {
          if (!DEMO_FIXTURES.has(demo)) {
            return sendJson(res, 400, { error: `Unknown demo fixture: ${demo}`, code: "BAD_REQUEST" });
          }
          const input = JSON.parse(
            readFileSync(path.join(__dirname, "engine/fixtures/qa", `fixture_${demo}.json`), "utf-8")
          );
          const report = evaluate(input, { weights, rules });
          return sendJson(res, 200, { report, mode: "demo" });
        }

        if (url) {
          const ip = clientIp(req);
          if (isRateLimited(ip)) {
            return sendJson(res, 429, {
              error: `Too many evaluations. Max ${RATE_LIMIT_MAX} per minute — try again shortly.`,
              code: "RATE_LIMITED",
            });
          }

          let parsed;
          try {
            parsed = new URL(url);
          } catch {
            return sendJson(res, 400, { error: "Invalid URL", code: "INVALID_URL" });
          }
          if (!/^https?:$/.test(parsed.protocol)) {
            return sendJson(res, 400, { error: "URL must be http or https", code: "INVALID_URL" });
          }

          if (activeEvaluations >= MAX_CONCURRENT_EVALUATIONS) {
            return sendJson(res, 503, { error: "The evaluator is busy — try again in a minute.", code: "BUSY" });
          }

          activeEvaluations++;
          try {
            // evaluateUrl runs the SSRF guard (real DNS resolution) internally
            // before ever fetching anything from this URL.
            const { report, crawlResult, sources } = await evaluateUrl(url, {
              weights,
              rules,
              crawlOptions: {
                max_pages: 45, max_depth: 2, request_timeout: 8000, concurrency: 4,
                max_duration_ms: 45000,
              },
            });
            return sendJson(res, 200, {
              report,
              mode: "live",
              crawl_summary: {
                pages_found: crawlResult.stats.pages_found,
                pages_retrieved: crawlResult.stats.pages_retrieved,
                pages_failed: crawlResult.stats.pages_failed,
                crawl_limited: crawlResult.stats.crawl_limited,
                time_limited: crawlResult.stats.time_limited,
              },
              sources: summarizeSources(url, sources),
              discovery: publicDiscovery(crawlResult.discovery),
            });
          } catch (err) {
            const message = err.message || "";
            const { status, code } = classifyError(message);
            if (status === 500) console.error("[evaluate error]", err);
            return sendJson(res, status, { error: status === 500 ? "Evaluation failed" : message, code });
          } finally {
            activeEvaluations--;
          }
        }

        return sendJson(res, 400, { error: "Provide either { url } or { demo }", code: "BAD_REQUEST" });
      } catch (err) {
        console.error("[api error]", err);
        return sendJson(res, 400, { error: "Invalid request", code: "BAD_REQUEST" });
      }
    });
    return;
  }

  const filePath = safeStaticPath(req.url);
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }
  const ext = path.extname(filePath);
  readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

// Etapa 1 (transparencia): what was read, what failed, what was skipped.
// Long lists are capped per status so the response stays small; totals are exact.
const SOURCES_PER_STATUS_CAP = 60;
export function summarizeSources(entryUrl, sources = []) {
  const counts = {};
  const byStatus = {};
  for (const s of sources) {
    counts[s.status] = (counts[s.status] || 0) + 1;
    (byStatus[s.status] ||= []).push(s);
  }
  const items = [];
  const truncated = {};
  for (const [status, list] of Object.entries(byStatus)) {
    const cap = status === "READ" || status === "FAILED" || status === "NOT_PRESENT" ? Infinity : SOURCES_PER_STATUS_CAP;
    items.push(...list.slice(0, cap).map(({ url, role, status: st, reason, http_status, final_url, used_as }) => ({
      url, role, status: st, reason, http_status, final_url, used_as: used_as || [],
    })));
    if (list.length > cap) truncated[status] = list.length - cap;
  }
  return { entry_url: entryUrl, counts, items, truncated };
}

// Lo que el informe muestra de cómo se encontró el Design System.
export function publicDiscovery(d) {
  if (!d) return null;
  return {
    entry_url: d.entry_url, root_url: d.root_url, method: d.method, listing_url: d.listing_url,
    components_found: d.components_found, components_sampled: d.components_sampled,
    patterns_found: d.patterns_found, token_pages_found: d.token_pages_found,
    official_sources: (d.official_sources || []).map(({ url, kind }) => ({ url, kind })),
    probed: d.probed,
  };
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

// A failed listen (port taken, bad PORT) is fatal: exit so the host (Render)
// restarts/flags the service. Without this, the uncaughtException handler below
// swallowed EADDRINUSE and left a live process that served nothing.
server.on("error", (err) => {
  console.error("[server error]", err);
  process.exit(1);
});

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  server.listen(PORT, () => {
    console.log(`Agentic DS corriendo en http://localhost:${PORT}`);
  });
}

// Basic production hardening: log and keep running instead of crashing silently
// on an unexpected error. This does not change any evaluation logic — it only
// prevents one bad request from taking the whole process down on a host like
// Render, where a silent crash means the app just stops responding.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
