// Regresión de las correcciones aplicadas al empaquetado de despliegue.
// Correr con: npm test   (node:test, sin dependencias externas)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchWithTimeout } from "../engine/src/crawler/fetcher.js";
import { crawl } from "../engine/src/crawler/crawl.js";
import { assertPublicHost } from "../engine/src/crawler/ssrfGuard.js";
import { detectTokens } from "../engine/src/extractor/detectTokens.js";
import { detectAccess } from "../engine/src/extractor/detectAccess.js";
import { createEvidenceCollector } from "../engine/src/extractor/evidence.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Fake fetch: map of url -> { status, type, body, location }
function fakeFetch(routes, calls = []) {
  return async (url) => {
    calls.push(url);
    const r = routes[url];
    if (!r) return mkRes(404, "text/plain", "not found");
    return mkRes(r.status ?? 200, r.type ?? "text/html", r.body ?? "", r.location);
  };
}
function mkRes(status, type, body, location) {
  const headers = new Map([["content-type", type]]);
  if (location) headers.set("location", location);
  return { status, ok: status >= 200 && status < 300, headers: { get: (k) => headers.get(k) ?? null }, body: null, text: async () => body };
}

// ---------- SSRF por redirects ----------

test("un redirect hacia la IP de metadata de nube se bloquea antes de pedirla", async () => {
  const calls = [];
  const fetchImpl = fakeFetch(
    { "http://8.8.8.8/": { status: 302, location: "http://169.254.169.254/latest/meta-data/" } },
    calls
  );
  const res = await fetchWithTimeout("http://8.8.8.8/", { fetchImpl, hostCheck: assertPublicHost });
  assert.equal(res.ok, false);
  assert.equal(res.error, "BLOCKED");
  assert.ok(!calls.some((u) => u.includes("169.254")), "nunca debe llegar a pedir la URL interna");
});

test("una cadena de redirects entre hosts públicos sí se sigue", async () => {
  const fetchImpl = fakeFetch({
    "http://8.8.8.8/": { status: 301, location: "https://8.8.4.4/docs/" },
    "https://8.8.4.4/docs/": { body: "<h1>ok</h1>" },
  });
  const res = await fetchWithTimeout("http://8.8.8.8/", { fetchImpl, hostCheck: assertPublicHost });
  assert.equal(res.ok, true);
  assert.equal(res.url, "https://8.8.4.4/docs/");
});

test("un redirect a un esquema no http(s) se bloquea", async () => {
  const fetchImpl = fakeFetch({ "http://8.8.8.8/": { status: 302, location: "file:///etc/passwd" } });
  const res = await fetchWithTimeout("http://8.8.8.8/", { fetchImpl });
  assert.equal(res.error, "BLOCKED");
});

test("un bucle de redirects termina con error, no se cuelga", async () => {
  const fetchImpl = fakeFetch({ "http://8.8.8.8/": { status: 302, location: "http://8.8.8.8/" } });
  const res = await fetchWithTimeout("http://8.8.8.8/", { fetchImpl });
  assert.equal(res.error, "TOO_MANY_REDIRECTS");
});

test("el crawler valida también los enlaces descubiertos, no solo la URL de entrada", async () => {
  const checked = [];
  const hostCheck = async (u) => {
    checked.push(u);
    if (u.includes("/admin")) throw new Error("Blocked: test");
  };
  const fetchImpl = fakeFetch({
    "http://ds.test/": { body: '<a href="/components/button/">b</a><a href="/components/admin/">x</a>' },
    "http://ds.test/components/button/": { body: "<h1>Button</h1>" },
  });
  const result = await crawl("http://ds.test/", { host_check: hostCheck }, fetchImpl);
  assert.ok(checked.includes("http://ds.test/components/button/"));
  const admin = result.pageRecords.find((r) => r.url.includes("/admin"));
  assert.equal(admin.status, "FAILED");
  assert.equal(admin.reason, "BLOCKED");
});

// ---------- Guard IPv6 (bug de precedencia) ----------

test("IPv6: bloquea direcciones internas en todas sus formas", async () => {
  for (const u of [
    "http://[::1]/", "http://[::]/", "http://[::ffff:127.0.0.1]/", "http://[::127.0.0.1]/",
    "http://[::ffff:169.254.169.254]/", "http://[64:ff9b::a9fe:a9fe]/", "http://[fd00::1]/",
    "http://[fe80::1]/", "http://[ff02::1]/",
  ]) {
    await assert.rejects(assertPublicHost(u), /Blocked/, u);
  }
});

test("IPv6: permite direcciones públicas (antes ::ffff:8.8.8.8 se bloqueaba por error)", async () => {
  for (const u of ["http://[::ffff:8.8.8.8]/", "http://[2606:4700::1111]/", "http://[2001:4860:4860::8888]/"]) {
    await assert.doesNotReject(assertPublicHost(u), u);
  }
});

// ---------- Alcance del crawl ----------

test("si la URL de entrada redirige (apex -> www), el alcance se ancla al destino real", async () => {
  const fetchImpl = fakeFetch({
    "http://ds.test/": { status: 301, location: "http://www.ds.test/" },
    "http://www.ds.test/": { body: '<a href="/components/button/">b</a>' },
    "http://www.ds.test/components/button/": { body: "<h1>Button</h1>" },
  });
  const result = await crawl("http://ds.test/", {}, fetchImpl);
  assert.ok(result.pages.some((p) => p.url === "http://www.ds.test/components/button/"));
});

test("un mismo enlace externo repetido en cada página se cuenta una sola vez", async () => {
  const nav = '<a href="https://twitter.com/x">t</a><a href="/components/a/">a</a><a href="/components/b/">b</a>';
  const fetchImpl = fakeFetch({
    "http://ds.test/": { body: nav },
    "http://ds.test/components/a/": { body: nav },
    "http://ds.test/components/b/": { body: nav },
  });
  const result = await crawl("http://ds.test/", {}, fetchImpl);
  assert.equal(result.pageRecords.filter((r) => r.url === "https://twitter.com/x").length, 1);
});

// ---------- Sondeo de llms.txt ----------

test("un llms.txt no enlazado se descubre y cuenta como agent_manifest", async () => {
  const fetchImpl = fakeFetch({
    "http://ds.test/": { body: "<h1>DS</h1>" },
    "http://ds.test/llms.txt": { type: "text/plain", body: "# DS\n- [Button](/components/button/)" },
  });
  const result = await crawl("http://ds.test/", {}, fetchImpl);
  assert.equal(detectAccess(result).agent_manifest, "COMPLETE");
});

test("un llms.txt ausente NO cuenta como página fallida", async () => {
  const fetchImpl = fakeFetch({ "http://ds.test/": { body: "<h1>DS</h1>" } });
  const result = await crawl("http://ds.test/", {}, fetchImpl);
  assert.equal(result.stats.pages_failed, 0);
  assert.equal(detectAccess(result).agent_manifest, "NONE");
});

test("un 200 con HTML en /llms.txt (fallback de SPA) no se toma como manifiesto", async () => {
  const fetchImpl = fakeFetch({
    "http://ds.test/": { body: "<h1>DS</h1>" },
    "http://ds.test/llms.txt": { type: "text/html", body: "<!doctype html><div id=root></div>" },
  });
  const result = await crawl("http://ds.test/", {}, fetchImpl);
  assert.equal(detectAccess(result).agent_manifest, "NONE");
});

// ---------- Tokens servidos como text/plain ----------

test("tokens .json servidos como text/plain se leen (D1 y D2 ya no se contradicen)", () => {
  const crawlResult = {
    pages: [{ url: "https://raw.example.test/ds/tokens/color.json", contentType: "text/plain; charset=utf-8",
      body: JSON.stringify({ color: { primary: { value: "#0f62fe" } } }) }],
    pageRecords: [],
  };
  const tokens = detectTokens(crawlResult, createEvidenceCollector());
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].value, "#0f62fe");
});

// ---------- Servidor HTTP ----------

async function withServer(fn) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, PORT: String(port) } });
  await new Promise((resolve) => proc.stdout.on("data", (d) => String(d).includes("corriendo") && resolve()));
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    proc.kill();
  }
}

test("servidor: demo, cuerpo gigante, URL malformada y path traversal", async () => {
  await withServer(async (base) => {
    const demo = await fetch(`${base}/api/evaluate`, { method: "POST", body: JSON.stringify({ demo: "good" }) });
    assert.equal(demo.status, 200);
    assert.equal((await demo.json()).report.overview.readiness_level, "Operable");

    const big = await fetch(`${base}/api/evaluate`, { method: "POST", body: "a".repeat(1_000_000) }).catch(() => null);
    assert.ok(big === null || big.status === 413, "un cuerpo de 1MB debe rechazarse");

    const ctrl = AbortSignal.timeout(3000);
    const malformed = await fetch(`${base}/%E0%A4%A`, { signal: ctrl });
    assert.equal(malformed.status, 403, "antes esta petición quedaba colgada sin respuesta");

    // fetch() normaliza "../" en el cliente; http.request envía la ruta tal cual
    // (equivalente a curl --path-as-is), que es lo que haría un atacante.
    for (const rawPath of ["/../../../../etc/passwd", "/%2e%2e/%2e%2e/%2e%2e/etc/passwd"]) {
      const status = await new Promise((resolve, reject) => {
        const u = new URL(base);
        http.get({ host: u.hostname, port: u.port, path: rawPath }, (r) => { r.resume(); resolve(r.statusCode); }).on("error", reject);
      });
      assert.equal(status, 403, rawPath);
    }
  });
});

test("pipeline: si la URL de entrada redirige a un host interno, error claro (no informe vacío)", async () => {
  const { evaluateUrl } = await import("../engine/src/pipeline.js");
  const { readFileSync } = await import("node:fs");
  const weights = JSON.parse(readFileSync(path.join(ROOT, "engine/config/weights.json"), "utf-8"));
  const rules = JSON.parse(readFileSync(path.join(ROOT, "engine/config/rules.json"), "utf-8"));
  const fetchImpl = fakeFetch({ "http://8.8.8.8/": { status: 302, location: "http://10.0.0.5/admin" } });
  await assert.rejects(evaluateUrl("http://8.8.8.8/", { weights, rules, fetchImpl }), /^Error: Blocked:/);
});

test("restricciones 'Don’t' con apóstrofo tipográfico o entidad HTML (frases reales de Fluent 2)", async () => {
  const { extractRestrictions, extractSectionByLabel } = await import("../engine/src/extractor/parseHtml.js");
  const html = "<p>Don’t confuse Close with Cancel.</p><p>Don&rsquo;t give secondary actions the same visual weight.</p><p>Don't mix styles here.</p>";
  assert.equal(extractRestrictions(html).length, 3);
  // no debe capturar oraciones que solo mencionan "don’t" a mitad de frase
  assert.equal(extractRestrictions("<p>In error messages, don’t use OK as a label.</p>").length, 0);
  const label = extractSectionByLabel("<h2>Don’t use</h2><p>For navigation.</p>", [/^don(?:'|\u2019)?t use:?$/i]);
  assert.equal(label, "For navigation.");
});
