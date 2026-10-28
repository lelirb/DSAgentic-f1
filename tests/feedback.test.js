// Formulario de feedback: validación, armado del correo, envío por la API de
// Resend (simulada) y el recorrido completo navegador → servidor → proveedor.
// Ninguna prueba sale a internet: el proveedor se reemplaza por un servidor local.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { validateFeedback, buildFeedbackEmail, sendFeedbackEmail, feedbackConfig } from "../feedback.js";
import { evaluate } from "../engine/src/evaluator/index.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf-8");

const GOOD = {
  ds_url: "https://carbondesignsystem.com/",
  rating: 4,
  comment: "D6: dice que no hay ejemplos de código y la pestaña Code los tiene. Faltan guías de contenido.",
  name: "Ana Pérez",
  email: "persona@example.com",
  lang: "es",
  report: {
    rules_version: "0.1.1", global_score: 80, readiness_level: "Operable", mode: "live",
    evaluated_at: "2026-10-26T02:30:45.591Z",
    dimensions: { D1: 90, D2: 66.4, D3: 80.6, D4: 87.5, D5: 78.3, D6: 72.5, D7: null },
  },
};

// ------------------------------------------------------------------ validación

test("validación: acepta un envío completo", () => {
  const v = validateFeedback(GOOD);
  assert.equal(v.ok, true);
  assert.equal(v.value.rating, 4);
  assert.equal(v.value.report.rules_version, "0.1.1");
  assert.equal(v.value.report.dimensions.D7, null);
});

test("validación: URL y valoración son obligatorias; comentario, nombre y correo no", () => {
  assert.deepEqual(pick(validateFeedback({ ...GOOD, ds_url: "" })), { ok: false, code: "MISSING_FIELD", field: "ds_url" });
  assert.deepEqual(pick(validateFeedback({ ...GOOD, rating: 7 })), { ok: false, code: "MISSING_FIELD", field: "rating" });
  assert.deepEqual(pick(validateFeedback({ ...GOOD, ds_url: "javascript:alert(1)" })), { ok: false, code: "INVALID_FIELD", field: "ds_url" });
  assert.deepEqual(pick(validateFeedback({ ...GOOD, email: "no-es-correo" })), { ok: false, code: "INVALID_FIELD", field: "email" });
  const minimal = validateFeedback({ ds_url: "https://x.example/", rating: 1 });
  assert.equal(minimal.ok, true);
  assert.equal(minimal.value.email, "");
  assert.equal(minimal.value.name, "");
  assert.equal(minimal.value.comment, "");
  assert.equal(minimal.value.report, null);
});
const pick = (v) => (v.ok ? { ok: true } : { ok: false, code: v.code, field: v.field });

test("validación: el campo trampa para robots se reconoce", () => {
  assert.equal(validateFeedback({ ...GOOD, website: "http://spam" }).code, "SPAM");
});

test("validación: recorta textos largos y quita caracteres de control y saltos en campos de una línea", () => {
  const v = validateFeedback({ ...GOOD, name: "An\na\u0007", comment: "x".repeat(9000) });
  assert.equal(v.value.name, "An a");
  assert.equal(v.value.comment.length, 5000);
  // Un salto de línea en el correo (intento de agregar destinatarios) se rechaza.
  assert.equal(validateFeedback({ ...GOOD, email: "a@b.co\r\nBcc: otro@x.com" }).ok, false);
});

test("validación: datos del informe con forma inesperada se descartan, no se inventan", () => {
  const v = validateFeedback({ ...GOOD, report: { rules_version: "<b>1</b>", global_score: 900, dimensions: { D1: "90", D2: -3 } } });
  assert.equal(v.value.report.rules_version, null);
  assert.equal(v.value.report.global_score, null);
  assert.equal(v.value.report.dimensions.D1, null);
  assert.equal(v.value.report.dimensions.D2, null);
});

// ------------------------------------------------------------------ correo

test("correo: incluye todos los campos y los datos del informe", () => {
  const { subject, text, reply_to } = buildFeedbackEmail(validateFeedback(GOOD).value, { now: new Date("2026-10-26T20:00:00Z") });
  assert.equal(subject, "Feedback Agentic DS: carbondesignsystem.com (4/5)");
  for (const s of ["Design System (URL): https://carbondesignsystem.com/", "Valoración del resultado: 4 de 5",
    "Comentario:", "D6: dice que no hay ejemplos", "Nombre: Ana Pérez", "Correo: persona@example.com",
    "Versión de reglas: 0.1.1", "Puntuación global: 80 (Operable)", "D1: 90", "D3: 80.6", "D7: sin puntaje",
    "no se verificaron en el servidor"]) assert.ok(text.includes(s), s);
  assert.equal(reply_to, "persona@example.com");
});

test("correo: sin correo no se agrega «responder a» y los opcionales vacíos se muestran como —", () => {
  const e2 = buildFeedbackEmail(validateFeedback({ ...GOOD, email: "", name: "", comment: "", report: null }).value);
  assert.equal(e2.reply_to, undefined);
  assert.ok(e2.text.includes("Correo: —"));
  assert.ok(e2.text.includes("Nombre: —"));
  assert.ok(e2.text.includes("Datos del informe: no se enviaron."));
});

// ------------------------------------------------------------------ envío (proveedor simulado)

const ENV = { RESEND_API_KEY: "re_test_123", FEEDBACK_TO_EMAIL: "destino@example.com" };

test("envío: sin configuración responde «no disponible» y no llama al proveedor", async () => {
  let called = false;
  const r = await sendFeedbackEmail(validateFeedback(GOOD).value, { env: {}, fetchImpl: async () => { called = true; } });
  assert.deepEqual(r, { ok: false, status: 503, code: "FEEDBACK_UNAVAILABLE" });
  assert.equal(called, false);
  assert.equal(feedbackConfig({ RESEND_API_KEY: "x" }).configured, false, "también hace falta el destinatario");
});

test("envío: llama a la API de Resend con la clave, el destinatario y el texto", async () => {
  let req = null;
  const r = await sendFeedbackEmail(validateFeedback(GOOD).value, {
    env: ENV,
    fetchImpl: async (url, init) => { req = { url, init }; return { status: 200 }; },
  });
  assert.deepEqual(r, { ok: true, status: 200, code: "SENT" });
  assert.equal(req.url, "https://api.resend.com/emails");
  assert.equal(req.init.method, "POST");
  assert.equal(req.init.headers.Authorization, "Bearer re_test_123");
  assert.ok(req.init.headers["User-Agent"], "Resend exige User-Agent");
  const body = JSON.parse(req.init.body);
  assert.deepEqual(body.to, ["destino@example.com"]);
  assert.equal(body.from, "Agentic DS <onboarding@resend.dev>");
  assert.equal(body.reply_to, "persona@example.com");
  assert.ok(body.text.includes("Design System (URL): https://carbondesignsystem.com/"));
  assert.equal(body.html, undefined, "solo texto plano");
});

test("envío: si el proveedor rechaza o no responde, se informa el fallo sin exponer la clave", async () => {
  const fb = validateFeedback(GOOD).value;
  const rejected = await sendFeedbackEmail(fb, { env: ENV, fetchImpl: async () => ({ status: 403 }) });
  assert.deepEqual(rejected, { ok: false, status: 502, code: "FEEDBACK_SEND_FAILED", provider_status: 403 });
  const down = await sendFeedbackEmail(fb, { env: ENV, fetchImpl: async () => { throw new Error("re_test_123 network"); } });
  assert.equal(down.code, "FEEDBACK_SEND_FAILED");
  assert.ok(!JSON.stringify([rejected, down]).includes("re_test_123"));
});

// ------------------------------------------------------------------ recorrido completo por HTTP

function startProvider(status = 200) {
  const received = [];
  const srv = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      received.push({ url: req.url, headers: req.headers, body: b ? JSON.parse(b) : null });
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "test-id" }));
    });
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve({ srv, received, port: srv.address().port })));
}

async function startApp(env) {
  const port = 8800 + Math.floor(Math.random() * 150);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, PORT: String(port), BROWSER_RENDERING: "0", ...env },
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { await fetch(base + "/"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  return { base, child, log: () => log };
}
const post = (base, body) =>
  fetch(base + "/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

test("HTTP: un envío válido llega al proveedor con la clave del servidor y responde ok", async () => {
  const provider = await startProvider(200);
  const app = await startApp({ ...ENV, FEEDBACK_API_URL: `http://127.0.0.1:${provider.port}/emails` });
  try {
    const r = await post(app.base, GOOD);
    assert.deepEqual(r, { status: 200, body: { ok: true } });
    assert.equal(provider.received.length, 1);
    const got = provider.received[0];
    assert.equal(got.headers.authorization, "Bearer re_test_123");
    assert.deepEqual(got.body.to, ["destino@example.com"]);
    assert.ok(got.body.text.includes("Valoración del resultado: 4 de 5"));
    assert.ok(!app.log().includes("re_test_123"), "la clave no aparece en el registro");
  } finally { app.child.kill(); provider.srv.close(); }
});

test("HTTP: datos inválidos, robots, fallos del proveedor y exceso de envíos", async () => {
  const provider = await startProvider(500);
  const app = await startApp({ ...ENV, FEEDBACK_API_URL: `http://127.0.0.1:${provider.port}/emails` });
  try {
    assert.deepEqual(await post(app.base, { ...GOOD, rating: null }), { status: 400, body: { code: "MISSING_FIELD", field: "rating" } });
    assert.deepEqual(await post(app.base, { ...GOOD, website: "x" }), { status: 200, body: { ok: true } }, "al robot se le responde ok…");
    assert.equal(provider.received.length, 0, "…pero no se envía nada");
    assert.deepEqual(await post(app.base, GOOD), { status: 502, body: { code: "FEEDBACK_SEND_FAILED" } }, "si el proveedor falla, se dice");
    // Límite: 5 por IP cada 10 minutos (ya van 3).
    await post(app.base, GOOD); await post(app.base, GOOD);
    assert.equal((await post(app.base, GOOD)).status, 429);
  } finally { app.child.kill(); provider.srv.close(); }
});

test("HTTP: sin configurar, responde «no disponible» (503) en vez de fingir el envío", async () => {
  const app = await startApp({});
  try {
    assert.deepEqual(await post(app.base, GOOD), { status: 503, body: { code: "FEEDBACK_UNAVAILABLE" } });
  } finally { app.child.kill(); }
});

// ------------------------------------------------------------------ botón junto al resultado y página del formulario

const weights = JSON.parse(read("engine/config/weights.json"));
const rules = JSON.parse(read("engine/config/rules.json"));
const report = evaluate(JSON.parse(read("engine/fixtures/qa/fixture_good.json")), { weights, rules });

function renderReport(lang) {
  const root = { innerHTML: "" };
  const btn = () => ({ setAttribute() {}, addEventListener() {} });
  const els = { "page-root": root, "btn-es": btn(), "btn-en": btn() };
  const store = { "agentic-ds-last-result": JSON.stringify({ report, mode: "live" }), "agentic-ds-lang": lang };
  const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
  const ctx = { window: {}, sessionStorage: storage, localStorage: storage,
    document: { getElementById: (id) => els[id], querySelectorAll: () => [], documentElement: {}, title: "" } };
  vm.createContext(ctx);
  for (const f of ["public/i18n.js", "public/report-texts.js", "public/report.js"]) vm.runInContext(read(f), ctx);
  return { html: root.innerHTML, T: ctx.window.AgenticDSReport };
}

test("informe: junto al resultado hay un botón «Califica este resultado» que lleva al formulario (ES y EN)", () => {
  for (const lang of ["es", "en"]) {
    const { html, T } = renderReport(lang);
    const top = html.slice(html.indexOf('class="verdict"'), html.indexOf('class="chain"'));
    assert.ok(top.includes('href="feedback.html"'), `${lang}: el enlace está en la parte del resultado`);
    assert.ok(top.includes(T[lang].ui.rateCta), `${lang}: texto del botón`);
    assert.ok(!html.includes("<form"), `${lang}: el formulario ya no está dentro del informe`);
  }
});

test("página del formulario: los textos en español e inglés tienen las mismas claves y marcadores", () => {
  const ctx = { document: { getElementById: () => ({ addEventListener() {}, setAttribute() {}, innerHTML: "" }), querySelectorAll: () => [], documentElement: {} },
    localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null } };
  const src = read("public/feedback-page.js");
  const dict = src.slice(src.indexOf("const T = {"), src.indexOf("const DIMS"));
  const T = vm.runInNewContext(`(() => { ${dict.replace("const T =", "return")} })()`, ctx);
  assert.deepEqual(Object.keys(T.en).sort(), Object.keys(T.es).sort());
  const marks = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(T.es)) assert.equal(marks(T.en[k]), marks(T.es[k]), k);
  // Los campos que pidió el diseño están en la página.
  for (const n of ['name="ds_url"', 'name="rating"', 'name="comment"', 'name="name"', 'name="email"', 'name="website"'])
    assert.ok(src.includes(n), n);
  for (const n of ['name="ds_name"', 'name="errors"', 'name="missing_criteria"', 'name="contact"'])
    assert.ok(!src.includes(n), `ya no se pide: ${n}`);
  assert.ok(read("public/feedback.html").includes("feedback-page.js"));
});

// ------------------------------------------------------------------ nada secreto en el repositorio

test("ninguna clave ni dirección de destino está escrita en el código", () => {
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(path.join(ROOT, d))) {
      if ([".git", "node_modules"].includes(n)) continue;
      const rel = path.join(d, n);
      if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(js|mjs|html|json|ya?ml|md)$/.test(n) && !rel.startsWith("tests")) files.push(rel);
    }
  };
  walk(".");
  for (const f of files) {
    const s = read(f);
    assert.ok(!/\bre_[A-Za-z0-9]{16,}\b/.test(s), `${f}: parece una clave de Resend`);
    assert.ok(!/@gmail\.com/i.test(s), `${f}: dirección de correo escrita en el código`);
  }
  // La clave solo se lee de variables de entorno, y solo en el servidor.
  assert.ok(read("feedback.js").includes("env.RESEND_API_KEY"));
  for (const f of ["public/report.js", "public/report-texts.js", "public/results.html", "public/feedback.html", "public/feedback-page.js"]) assert.ok(!/RESEND_API|api\.resend\.com/.test(read(f)), f);
});

// ------------------------------------------------------------------ pie de página y términos

test("pie de página: está en todas las páginas y enlaza a los términos", () => {
  for (const f of ["index.html", "results.html", "como-funciona.html", "feedback.html", "terminos.html"]) {
    const h = read(`public/${f}`);
    assert.ok(h.includes('<footer id="site-footer"></footer>') && h.includes('<script src="footer.js"></script>'), f);
  }
  const js = read("public/footer.js");
  assert.ok(js.includes("© ${YEAR} Agentic DS.") && js.includes("Todos los derechos reservados.") && js.includes("All rights reserved."));
  assert.ok(js.includes('href="terminos.html"'));
  assert.ok(/@media print\{#site-footer\{display:none/.test(js), "no va en el PDF");
});

test("términos: ES y EN tienen las mismas secciones y no prometen lo que el evaluador no hace", () => {
  const h = read("public/terminos.html");
  const code = h.slice(h.indexOf("const T = {"), h.indexOf("const esc ="));
  const T = vm.runInNewContext(`(() => { ${code.replace("const T =", "return")} })()`);
  assert.deepEqual(T.en.sections.map((s) => s[0]), T.es.sections.map((s) => s[0]));
  const all = JSON.stringify(T);
  assert.ok(!/robots\.txt/i.test(all), "el rastreo no aplica las reglas de robots.txt: no se afirma");
  assert.ok(/5 evaluaciones por minuto/.test(all) && /5 evaluations per minute/.test(all));
  assert.match(read("server.js"), /RATE_LIMIT_MAX = 5;/, "el límite citado en los términos es el del servidor");
  assert.ok(/«AgenticDS»/.test(all));
  assert.match(read("engine/src/crawler/fetcher.js"), /"user-agent": "AgenticDS\//);
});
