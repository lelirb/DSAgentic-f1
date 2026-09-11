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
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json" };

const MAX_API_BODY_BYTES = 16 * 1024;

const DEMO_FIXTURES = new Set(["good", "partial", "poor", "contradictory", "not_applicable", "not_evaluable", "d1_gate"]);

// Rate limiting: only on the "url" path (real crawl). In-memory sliding window
// per client IP — fine for a single-process prototype; a real deployment
// behind a load balancer would need a shared store and to trust
// X-Forwarded-For only from a known proxy (documented, not set up here).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateLimitLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (rateLimitLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitLog.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

function statusForError(message) {
  if (/^Blocked:/.test(message)) return 400;
  if (/^Could not resolve hostname/.test(message)) return 400;
  return 500;
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
        sendJson(res, 413, { error: "Request body too large" });
        req.destroy();
      }
    });
    req.on("end", async () => {
      if (tooLarge) return;
      try {
        const { url, demo } = JSON.parse(body || "{}");

        if (demo) {
          if (!DEMO_FIXTURES.has(demo)) {
            return sendJson(res, 400, { error: `Unknown demo fixture: ${demo}` });
          }
          const input = JSON.parse(
            readFileSync(path.join(__dirname, "engine/fixtures/qa", `fixture_${demo}.json`), "utf-8")
          );
          const report = evaluate(input, { weights, rules });
          return sendJson(res, 200, { report, mode: "demo" });
        }

        if (url) {
          const ip = req.socket.remoteAddress || "unknown";
          if (isRateLimited(ip)) {
            return sendJson(res, 429, {
              error: `Too many evaluations. Max ${RATE_LIMIT_MAX} per minute — try again shortly.`,
            });
          }

          let parsed;
          try {
            parsed = new URL(url);
          } catch {
            return sendJson(res, 400, { error: "Invalid URL" });
          }
          if (!/^https?:$/.test(parsed.protocol)) {
            return sendJson(res, 400, { error: "URL must be http or https" });
          }

          try {
            // evaluateUrl runs the SSRF guard (real DNS resolution) internally
            // before ever fetching anything from this URL.
            const { report, crawlResult } = await evaluateUrl(url, {
              weights,
              rules,
              crawlOptions: { max_pages: 25, max_depth: 2, request_timeout: 8000, concurrency: 4 },
            });
            return sendJson(res, 200, {
              report,
              mode: "live",
              crawl_summary: {
                pages_found: crawlResult.stats.pages_found,
                pages_retrieved: crawlResult.stats.pages_retrieved,
                pages_failed: crawlResult.stats.pages_failed,
              },
            });
          } catch (err) {
            return sendJson(res, statusForError(err.message || ""), { error: err.message || "Evaluation failed" });
          }
        }

        return sendJson(res, 400, { error: "Provide either { url } or { demo }" });
      } catch (err) {
        return sendJson(res, 500, { error: err.message || "Internal error" });
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

server.listen(PORT, () => {
  console.log(`Agentic DS corriendo en http://localhost:${PORT}`);
});

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
