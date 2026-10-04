// Prueba de punta a punta con un navegador REAL contra un sitio simulado que
// arma todo su contenido con JavaScript (componentes web con shadow DOM y datos
// que llegan por fetch). Si en la máquina no hay Chromium, la prueba se salta.
// Correr con: npm test
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRenderer, findChromium } from "../engine/src/crawler/renderer.js";
import { evaluateUrl } from "../engine/src/pipeline.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const weights = JSON.parse(readFileSync(path.join(ROOT, "engine/config/weights.json"), "utf-8"));
const rules = JSON.parse(readFileSync(path.join(ROOT, "engine/config/rules.json"), "utf-8"));
const chromium = findChromium();
const skip = chromium ? false : "no hay Chromium instalado en esta máquina";

const LONG = "This guidance explains how the component behaves inside the design system, which decisions the team already made, and which alternatives exist for nearby cases so nobody has to guess.";
const CONTENT = {
  "/": { title: "Design System", html: `<p>${LONG} ${LONG}</p>` },
  "/components/button/usage": {
    title: "Button",
    html: `<p>Buttons trigger an action. ${LONG}</p><h2>When to use</h2><p>Use a button to submit a form. Don't use a button for navigation. Use a link instead of a button for navigation.</p><h2>Variants</h2><ul><li>Primary</li><li>Secondary</li></ul><h2>States</h2><p>Hover, focus and disabled.</p>`,
  },
  "/components/modal/usage": {
    title: "Modal",
    html: `<p>Modals interrupt the flow to ask for a decision. ${LONG}</p><h2>When to use</h2><p>Use a modal for decisions that block the task.</p>`,
  },
  "/foundations/tokens": {
    title: "Tokens",
    html: `<p>${LONG}</p><table><tr><th>Token</th><th>Value</th></tr><tr><td>$color-primary</td><td>#3d5afe</td></tr><tr><td>$space-200</td><td>8px</td></tr></table>`,
  },
};
const SHELL = `<!doctype html><html><head><meta charset="utf-8"><title>DS</title></head><body>
<noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div><script src="/app.js"></script></body></html>`;
// El contenido vive dentro de un componente web (shadow DOM) y llega por fetch.
const APP_JS = `
class DsPage extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = '<nav><a href="/components/button/usage">Button</a> <a href="/components/modal/usage">Modal</a></nav><main><h1></h1><div id="c"></div><slot></slot></main>';
    fetch("/content.json?path=" + encodeURIComponent(location.pathname)).then((r) => r.json()).then((d) => {
      root.querySelector("h1").textContent = d.title;
      root.getElementById("c").innerHTML = d.html;
    });
  }
}
customElements.define("ds-page", DsPage);
setTimeout(() => document.getElementById("root").appendChild(document.createElement("ds-page")), 150);
new Image().src = "/logo.png";
`;

function startSite() {
  const hits = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    hits.push(u.pathname);
    if (u.pathname === "/sitemap.xml") {
      res.writeHead(200, { "content-type": "application/xml" });
      return res.end(`<?xml version="1.0"?><urlset>${Object.keys(CONTENT).map((p) => `<url><loc>http://${req.headers.host}${p}</loc></url>`).join("")}</urlset>`);
    }
    if (u.pathname === "/app.js") { res.writeHead(200, { "content-type": "application/javascript" }); return res.end(APP_JS); }
    if (u.pathname === "/content.json") {
      const c = CONTENT[u.searchParams.get("path")];
      res.writeHead(c ? 200 : 404, { "content-type": "application/json" });
      return res.end(JSON.stringify(c || {}));
    }
    if (u.pathname === "/logo.png") { res.writeHead(200, { "content-type": "image/png" }); return res.end("png"); }
    if (u.pathname in CONTENT) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(SHELL); }
    res.writeHead(404, { "content-type": "text/html" });
    res.end("not found");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, hits, port: server.address().port })));
}

const renderers = [];
after(async () => { for (const r of renderers) await r.close(); });

test("navegador real: un sitio hecho con JavaScript y shadow DOM se lee y se evalúa", { skip, timeout: 120000 }, async () => {
  const site = await startSite();
  // Solo en la prueba se permite 127.0.0.1; en producción el proxy lo bloquea.
  const renderer = createRenderer({ executablePath: chromium, resolveHost: async () => ({ address: "127.0.0.1" }), allowedPorts: null });
  renderers.push(renderer);
  const events = [];
  try {
    const { report, crawlResult } = await evaluateUrl(`http://127.0.0.1:${site.port}/`, {
      weights, rules, ssrfCheck: null,
      crawlOptions: { renderer, render_timeout: 30000, on_progress: (e) => events.push(e.step) },
    });
    assert.equal(crawlResult.render.unavailable, false, JSON.stringify(renderer.info()));
    assert.ok(crawlResult.render.rendered >= 4, `abrió ${crawlResult.render.rendered}: ${JSON.stringify(crawlResult.render)} ${JSON.stringify(renderer.info())}`);
    assert.equal(report.overview.coverage.components_evaluated, 2);
    assert.ok(report.dimensions.D4.score > 0, "leyó el contenido que estaba dentro del shadow DOM");
    assert.ok(report.overview.coverage.tokens_detected >= 2, "leyó la tabla de tokens");
    assert.equal(report.dimensions.D1.sub_criteria.documentation_recoverability.points, 0);
    assert.ok(events.includes("js_detected"));
    // Las imágenes no se descargan: no aportan texto y consumen memoria.
    assert.equal(site.hits.includes("/logo.png"), false);
  } finally {
    site.server.close();
  }
});

test("navegador real: con la regla de producción no puede llegar a una dirección interna", { skip, timeout: 60000 }, async () => {
  const site = await startSite();
  const renderer = createRenderer({ executablePath: chromium, allowedPorts: null });
  renderers.push(renderer);
  try {
    const out = await renderer.render(`http://127.0.0.1:${site.port}/components/button/usage`, { timeoutMs: 20000 });
    assert.equal(out.ok, false);
    assert.equal(site.hits.length, 0, "ninguna petición debe llegar al servidor interno");
    assert.ok(renderer.info().proxy.blocked >= 1);
  } finally {
    site.server.close();
  }
});

test("sin ejecutable de navegador, el lector se declara no disponible sin romper nada", async () => {
  const renderer = createRenderer({ executablePath: null });
  assert.equal(renderer.available, false);
  assert.deepEqual(await renderer.render("https://example.com/"), { ok: false, error: "BROWSER_UNAVAILABLE" });

  const broken = createRenderer({ executablePath: "/no/existe/chromium", launchTimeoutMs: 3000 });
  renderers.push(broken);
  const out = await broken.render("https://example.com/", { timeoutMs: 8000 });
  assert.equal(out.ok, false);
  assert.equal(out.error, "BROWSER_UNAVAILABLE");
  assert.equal(broken.available, false, "tras fallar al arrancar no se reintenta por cada página");
});

// ---------- páginas hostiles (el visitante controla el JavaScript que se ejecuta) ----------

function startHostile() {
  const hits = [];
  const secretHits = [];
  // "secreto": un servicio interno al que la página NO debe poder llegar.
  const secret = http.createServer((req, res) => { secretHits.push(req.url); res.end("SECRETO-INTERNO"); });
  const big = "A".repeat(4_000_000);
  const pages = {
    "/hang": `<body><p>start</p><script>setTimeout(() => { for (;;) {} }, 200)</script></body>`,
    "/alerts": `<body><p>start</p><script>setInterval(() => alert("x"), 20)</script></body>`,
    "/popups": `<body><p>${LONG} ${LONG}</p><script>for (let i = 0; i < 30; i++) window.open("/ok", "_blank")</script></body>`,
    "/tofile": `<body><p>${LONG} ${LONG}</p><script>setTimeout(() => { location.href = "file:///etc/passwd" }, 100)</script></body>`,
    "/huge": `<head><title>${"T".repeat(100000)}</title></head><body><a href="/x?${"q".repeat(100000)}">link</a><p id="p"></p><script>document.getElementById("p").textContent = "${big.slice(0, 10)}".repeat(400000)</script></body>`,
    "/ok": `<body><main><h1>Button</h1><p>${LONG} ${LONG}</p></main></body>`,
  };
  const site = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    hits.push(u.pathname);
    if (u.pathname === "/reach") {
      const p = secret.address().port;
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<body><p id="out">${LONG} ${LONG}</p>
        <img src="http://127.0.0.1:${p}/img"><iframe src="http://localhost:${p}/frame"></iframe>
        <script>
          const out = document.getElementById("out");
          const tries = [fetch("http://127.0.0.1:${p}/fetch", { mode: "no-cors" }), fetch("http://localhost:${p}/fetch2", { mode: "no-cors" }), fetch("http://[::1]:${p}/v6", { mode: "no-cors" })];
          try { new WebSocket("ws://127.0.0.1:${p}/ws"); } catch (e) {}
          Promise.allSettled(tries).then((r) => { out.textContent += " resultados:" + r.map((x) => x.status).join(","); });
        </script></body>`);
    }
    if (u.pathname in pages) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(`<!doctype html><html>${pages[u.pathname]}</html>`); }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => secret.listen(0, "127.0.0.1", () => site.listen(0, "127.0.0.1", () => resolve({
    site, secret, hits, secretHits, port: site.address().port,
    close: () => { site.close(); secret.close(); },
  }))));
}

test("navegador real: una página que cuelga el navegador no afecta a la siguiente", { skip, timeout: 120000 }, async () => {
  const h = await startHostile();
  const renderer = createRenderer({ executablePath: chromium, resolveHost: async () => ({ address: "127.0.0.1" }), allowedPorts: null });
  renderers.push(renderer);
  try {
    const t0 = Date.now();
    const hang = await renderer.render(`http://ds.test:${h.port}/hang`, { timeoutMs: 6000 });
    assert.equal(hang.ok, false);
    assert.ok(Date.now() - t0 < 15000, `tardó ${Date.now() - t0} ms`);
    const alerts = await renderer.render(`http://ds.test:${h.port}/alerts`, { timeoutMs: 8000 });
    assert.equal(typeof alerts.ok, "boolean"); // puede leerla o no, pero vuelve a tiempo
    const next = await renderer.render(`http://ds.test:${h.port}/ok`, { timeoutMs: 15000 });
    assert.equal(next.ok, true, JSON.stringify(next).slice(0, 300));
    assert.ok(next.body.includes("<h1>Button</h1>"));
  } finally {
    h.close();
  }
});

test("navegador real: no devuelve archivos locales ni respuestas gigantes, y no deja ventanas abiertas", { skip, timeout: 120000 }, async () => {
  const h = await startHostile();
  const renderer = createRenderer({ executablePath: chromium, resolveHost: async () => ({ address: "127.0.0.1" }), allowedPorts: null });
  renderers.push(renderer);
  try {
    const file = await renderer.render(`http://ds.test:${h.port}/tofile`, { timeoutMs: 10000 });
    assert.ok(!String(file.body || "").includes("root:"), "no debe aparecer el contenido de /etc/passwd");
    if (file.ok) assert.match(file.finalUrl, /^http:\/\/ds\.test/);

    const huge = await renderer.render(`http://ds.test:${h.port}/huge`, { timeoutMs: 15000 });
    assert.equal(huge.ok, true, JSON.stringify(huge).slice(0, 200));
    assert.ok(huge.body.length < 1_700_000, `devolvió ${huge.body.length} caracteres`);
    assert.equal(huge.truncated, true);

    await renderer.render(`http://ds.test:${h.port}/popups`, { timeoutMs: 10000 });
    assert.equal(h.hits.filter((p) => p === "/ok").length, 0, "las ventanas emergentes no deben abrirse");
  } finally {
    h.close();
  }
});

test("navegador real: el código de la página no puede alcanzar servicios internos", { skip, timeout: 120000 }, async () => {
  const h = await startHostile();
  // Regla parecida a la de producción: solo el sitio evaluado es alcanzable; el
  // resto pasa por la validación real, que rechaza 127.0.0.1, localhost y ::1.
  const { resolvePublicAddress } = await import("../engine/src/crawler/ssrfGuard.js");
  const renderer = createRenderer({
    executablePath: chromium, allowedPorts: null,
    resolveHost: async (host) => (host === "ds.test" ? { address: "127.0.0.1" } : resolvePublicAddress(host)),
  });
  renderers.push(renderer);
  try {
    const out = await renderer.render(`http://ds.test:${h.port}/reach`, { timeoutMs: 15000 });
    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
    assert.deepEqual(h.secretHits, [], "ninguna petición debe llegar al servicio interno");
    assert.ok(renderer.info().proxy.blocked >= 3, JSON.stringify(renderer.info().proxy));
    assert.ok(!out.body.includes("SECRETO-INTERNO"));
  } finally {
    h.close();
  }
});
