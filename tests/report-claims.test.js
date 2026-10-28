// Fiabilidad del informe: que lo que dice la interfaz coincida con lo que hace
// el motor y no afirme más de lo que la Fase 1 observa.
//
// Cubre cinco puntos de la auditoría del 24-10-2026:
//   1. niveles 25/50/75 con una sola fuente (engine/config/rules.json);
//   2. un criterio no evaluable queda fuera de la nota y el texto lo dice así;
//   3. los textos no contradicen al motor (MCP/API, contradicciones);
//   4. los textos de resultado describen evidencia publicada, no capacidades
//      demostradas del agente;
//   5. español e inglés tienen las mismas claves, marcadores y avisos.
//
// DSA_ROOT permite correr estas pruebas contra otra copia del código (por
// ejemplo, la versión anterior) para comprobar que detectan los defectos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.DSA_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf-8");
const { evaluate } = await import(pathToFileURL(path.join(ROOT, "engine/src/evaluator/index.js")).href);
const { readinessLevel } = await import(pathToFileURL(path.join(ROOT, "engine/src/evaluator/utils.js")).href);
const weights = JSON.parse(read("engine/config/weights.json"));
const rules = JSON.parse(read("engine/config/rules.json"));
const LEVELS = rules.readiness_levels;
const fixtureInput = (n) => JSON.parse(read(`engine/fixtures/qa/fixture_${n}.json`));
const fixture = (n) => evaluate(fixtureInput(n), { weights, rules });

function loadTexts() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read("public/report-texts.js"), ctx);
  return ctx.window.AgenticDSReport;
}

function renderReport(report, mode, lang = "es") {
  const root = { innerHTML: "" };
  const btn = () => ({ setAttribute() {}, addEventListener() {} });
  const els = { "page-root": root, "btn-es": btn(), "btn-en": btn() };
  const store = { "agentic-ds-last-result": JSON.stringify({ report, mode }), "agentic-ds-lang": lang };
  const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
  const ctx = {
    window: {}, sessionStorage: storage, localStorage: storage,
    document: { getElementById: (id) => els[id], querySelectorAll: () => [], documentElement: {}, title: "" },
  };
  vm.createContext(ctx);
  for (const f of ["public/i18n.js", "public/report-texts.js", "public/report.js"]) vm.runInContext(read(f), ctx);
  return root.innerHTML;
}

// Texto visible: sin entidades HTML y en minúsculas (el informe pone en
// mayúscula la primera letra de cada ítem).
const plain = (html) =>
  html.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").toLowerCase();
// El informe a veces cambia el punto final por dos puntos antes de una lista.
const shows = (html, text) => plain(html).includes(text.replace(/[.:]\s*$/, "").toLowerCase());

// Fija el puntaje de una dimensión (capa de presentación) para probar bordes.
function withDimScore(score, dim = "D4") {
  const r = fixture("good");
  r.dimensions[dim].score = score;
  return r;
}
const section = (html, from, to) => {
  const a = html.indexOf(from);
  const b = to ? html.indexOf(to, a + 1) : -1;
  return a < 0 ? "" : html.slice(a, b < 0 ? undefined : b);
};
const listOf = (html, cls) => {
  const s = section(html, `class="${cls}"`, "</ul>");
  return s;
};

// ------------------------------------------------------------------ 1. niveles

test("niveles: el motor copia la tabla de rules.json en cada informe", () => {
  const r = fixture("good");
  assert.deepEqual(r.readiness_levels, LEVELS);
});

test("niveles: el respaldo de la interfaz es idéntico a rules.json", () => {
  const T = loadTexts();
  assert.deepEqual(JSON.parse(JSON.stringify(T.LEVELS_FALLBACK)), LEVELS);
});

test("niveles: la interfaz no tiene cortes de nivel escritos a mano", () => {
  const src = read("public/report.js");
  const hard = src.match(/score\s*(>=|<=|>|<)\s*\d+/g) || [];
  assert.deepEqual(hard, [], `cortes escritos a mano en report.js: ${hard.join(", ")}`);
  assert.ok(!/"Opaco",\s*"Legible",\s*"Interpretable",\s*"Operable"/.test(src), "la lista de niveles no debe estar escrita a mano");
});

test("niveles: en los bordes 24/25, 49/50, 74/75 el color de la dimensión coincide con el motor", () => {
  for (const s of [0, 24, 25, 49, 50, 74, 75, 100]) {
    const html = renderReport(withDimScore(s), "demo");
    const head = section(html, 'id="dim-D4"', "</div>\n      </div>");
    const expected = readinessLevel(s, LEVELS);
    assert.ok(head.includes(`class="band-${expected}">${s}</b>`), `D4=${s}: se esperaba color ${expected}`);
  }
});

test("niveles: las listas del resumen usan los mismos cortes que el motor", () => {
  const T = loadTexts();
  const can = T.es.dims.D4.can;
  const at = (s) => {
    const html = renderReport(withDimScore(s), "demo");
    return {
      good: shows(listOf(html, "cap-good"), can),
      // Por debajo del segundo nivel va a «poca evidencia» o, si la evidencia
      // está incompleta, a «no se pudo demostrar»: las dos son la banda baja.
      bad: shows(listOf(html, "cap-bad"), can) || shows(listOf(html, "cap-nd"), can),
    };
  };
  assert.deepEqual(at(75), { good: true, bad: false }, "75 es el nivel más alto");
  assert.deepEqual(at(74), { good: false, bad: false }, "74 es el segundo nivel");
  assert.deepEqual(at(50), { good: false, bad: false }, "50 es el segundo nivel");
  assert.deepEqual(at(49), { good: false, bad: true }, "49 está por debajo del segundo nivel");
});

test("niveles: una dimensión con decimales usa el mismo número para color, lista y texto", () => {
  const T = loadTexts();
  for (const [raw, shown] of [[74.6, 75], [74.4, 74], [49.5, 50], [49.4, 49]]) {
    const html = renderReport(withDimScore(raw), "demo");
    const level = readinessLevel(shown, LEVELS);
    assert.ok(html.includes(`class="band-${level}">${shown}</b>`), `${raw}: color ${level}`);
    const top = level === LEVELS[LEVELS.length - 1].label;
    assert.equal(shows(listOf(html, "cap-good"), T.es.dims.D4.can), top, `${raw}: lista «Bien documentado»`);
  }
});

test("niveles: la escala muestra los rangos de rules.json", () => {
  const html = renderReport(fixture("good"), "demo");
  for (const l of LEVELS) assert.ok(html.includes(`<span>${l.min}–${l.max}</span>`), `falta el rango ${l.min}–${l.max}`);
});

test("niveles: un informe guardado antes del cambio (sin tabla) se ve igual", () => {
  const r = withDimScore(75);
  const legacy = JSON.parse(JSON.stringify(r));
  delete legacy.readiness_levels;
  assert.equal(renderReport(legacy, "demo"), renderReport(r, "demo"));
});

// ------------------------------------------------------------------ 2. no evaluable

function noPropsReport() {
  const input = fixtureInput("good");
  input.components = input.components.map((c) => ({ ...c, props: [] }));
  return evaluate(input, { weights, rules });
}

test("no evaluable: sin propiedades, la consistencia de la API queda fuera de la nota", () => {
  const r = noPropsReport();
  const d3 = r.dimensions.D3;
  const sc = d3.sub_criteria.api_consistency;
  assert.equal(sc.points, null);
  assert.equal(sc.status, "NOT_EVALUABLE");
  const ev = Object.values(d3.sub_criteria).filter((x) => x.points !== null);
  const expected = (ev.reduce((a, x) => a + x.points, 0) / ev.reduce((a, x) => a + x.max, 0)) * 100;
  assert.ok(Math.abs(d3.score - expected) < 1e-9, "la nota se calcula solo sobre lo evaluado");
});

test("no evaluable: el informe no dice que ese criterio cuenta como 0", () => {
  const r = noPropsReport();
  const es = renderReport(r, "demo", "es");
  const en = renderReport(r, "demo", "en");
  const T = loadTexts();
  assert.ok(shows(es, T.es.ui.noBasisApi), "el texto del caso debe aparecer en el informe");
  assert.ok(shows(en, T.en.ui.noBasisApi), "y también en inglés");
  assert.ok(!/cuenta como 0 en el puntaje/.test(es));
  assert.ok(!/counts it as 0 in the score/.test(en));
  assert.match(T.es.ui.noBasisApi, /fuera de la nota/);
  assert.match(T.en.ui.noBasisApi, /left out of the score/);
});

test("no evaluable: ningún texto del informe afirma que algo no evaluable cuenta como 0", () => {
  const T = loadTexts();
  for (const lang of ["es", "en"]) {
    const all = JSON.stringify(T[lang]);
    const bad = all.match(/[^"]{0,60}(cuenta como 0|counts? (it )?as 0)[^"]{0,20}/g) || [];
    for (const b of bad) assert.match(b, /no cuenta como 0|doesn't count as 0/, `${lang}: «${b}»`);
  }
});

// ------------------------------------------------------------------ 3. textos vs motor

test("MCP/API: el informe aclara que detectar no es poder usar", () => {
  const T = loadTexts();
  for (const mode of ["demo", "live"]) {
    assert.ok(shows(renderReport(fixture("good"), mode, "es"), T.es.ui.limAgentFiles), `${mode} es`);
    assert.ok(shows(renderReport(fixture("good"), mode, "en"), T.en.ui.limAgentFiles), `${mode} en`);
  }
  assert.ok(!/pueda consultar directamente/.test(T.es.subs.agent_interface.found));
  assert.ok(!/can query directly/.test(T.en.subs.agent_interface.found));
  assert.match(T.es.subs.agent_manifest.found, /no se revisa su contenido/);
  assert.match(T.en.subs.agent_manifest.found, /content isn't reviewed/);
});

test("contradicciones: el aviso existe mientras el rastreo real no las busque", () => {
  // Si alguien implementa la detección, esta prueba falla a propósito: hay que
  // quitar o cambiar el aviso limNoContradictions al mismo tiempo.
  assert.ok(read("engine/src/extractor/normalize.js").includes("contradictions: [],"),
    "normalize() ya no entrega la lista vacía: revisar el aviso de contradicciones");
  const T = loadTexts();
  assert.ok(shows(renderReport(fixture("good"), "live", "es"), T.es.ui.limNoContradictions));
  assert.ok(shows(renderReport(fixture("good"), "live", "en"), T.en.ui.limNoContradictions));
  // En demos las contradicciones vienen en el ejemplo y se muestran como hallazgo.
  assert.ok(!shows(renderReport(fixture("contradictory"), "demo", "es"), T.es.ui.limNoContradictions));
});

// ------------------------------------------------------------------ 4. afirmaciones de Fase 1

// Textos que describen el resultado de ESTE sistema. Deben hablar de evidencia
// publicada, no de lo que un agente logra hacer.
function resultTexts(T, lang) {
  const out = [];
  const u = T[lang].ui;
  for (const k of ["scoreNote", "canDo", "mayInfer", "cannot", "chainTitle", "chainLead", "capability",
    "provisionalSummary", "notDemonstratedCap", "meaningLowIncomplete"]) out.push([`ui.${k}`, u[k]]);
  for (const [b, v] of Object.entries(T[lang].bands)) for (const [k, t] of Object.entries(v)) out.push([`bands.${b}.${k}`, t]);
  for (const [d, v] of Object.entries(T[lang].dims)) {
    out.push([`dims.${d}.can`, v.can]);
    for (const [k, t] of Object.entries(v.meaning || {})) out.push([`dims.${d}.meaning.${k}`, t]);
  }
  return out;
}

const CAPABILITY_CLAIM = {
  es: /\bpueden?\b|\bpodrán?\b|suficientes?|sin intervención|autónom|correctamente|demostrad[ao]s? .*capacidad/i,
  en: /\bcan\b|\bwill be able\b|\bsufficient\b|\benough\b|without human|autonom|\bcorrectly\b/i,
};

test("Fase 1: los textos de resultado no atribuyen capacidades demostradas al agente", () => {
  const T = loadTexts();
  for (const lang of ["es", "en"]) {
    // Los marcadores como {can} son nombres de variables, no texto visible.
    const bad = resultTexts(T, lang).filter(([, t]) => CAPABILITY_CLAIM[lang].test(t.replace(/\{\w+\}/g, "")));
    assert.deepEqual(bad.map(([k, t]) => `${k}: ${t}`), [], `${lang}: textos que afirman capacidad`);
  }
});

test("Fase 1: el informe renderizado no promete lo que no se probó", () => {
  const forbidden = /puede hacer bien|can do well|sin intervención humana|without human intervention|altamente preparado|highly prepared/;
  for (const n of ["good", "partial", "poor", "d1_gate"]) {
    for (const lang of ["es", "en"]) {
      for (const mode of ["demo", "live"]) {
        const html = plain(renderReport(fixture(n), mode, lang));
        assert.ok(!forbidden.test(html), `${n}/${lang}/${mode}: ${html.match(forbidden)}`);
      }
    }
  }
});

test("Fase 1: el aviso de que no se pone a un agente a trabajar sigue presente", () => {
  const T = loadTexts();
  for (const lang of ["es", "en"]) {
    assert.ok(shows(renderReport(fixture("good"), "live", lang), T[lang].ui.limDocsOnly), lang);
  }
});

// ------------------------------------------------------------------ 5. español e inglés

function shape(o, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...shape(v, key));
    else out.push(key);
  }
  return out.sort();
}
function leaves(o, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) leaves(v, key, out);
    else out[key] = v;
  }
  return out;
}

test("ES/EN: mismas claves en todos los textos", () => {
  const T = loadTexts();
  assert.deepEqual(shape(T.en), shape(T.es));
});

test("ES/EN: mismos marcadores {…} en cada texto", () => {
  const T = loadTexts();
  const es = leaves(T.es), en = leaves(T.en);
  const marks = (s) => (typeof s === "string" ? (s.match(/\{\w+\}/g) || []).sort() : []);
  const diff = Object.keys(es).filter((k) => JSON.stringify(marks(es[k])) !== JSON.stringify(marks(en[k])));
  assert.deepEqual(diff, []);
});

test("ES/EN: los avisos nuevos dicen lo mismo en los dos idiomas", () => {
  const T = loadTexts();
  const pairs = [
    ["limAgentFiles", [/MCP/, /API/, /llms\.txt/, /AGENTS\.md/], /credenciales/, /credentials/],
    ["limNoContradictions", [], /contradicciones/, /contradictions/],
    ["noBasisApi", [], /fuera de la nota/, /left out of the score/],
  ];
  for (const [k, both, es, en] of pairs) {
    for (const re of both) {
      assert.match(T.es.ui[k], re, `es.${k}`);
      assert.match(T.en.ui[k], re, `en.${k}`);
    }
    assert.match(T.es.ui[k], es, `es.${k}`);
    assert.match(T.en.ui[k], en, `en.${k}`);
  }
});

test("ES/EN: las listas de límites de «Cómo funciona» tienen el mismo largo y los mismos avisos", () => {
  const html = read("public/como-funciona.html");
  const block = (lang) => {
    const a = html.indexOf(`${lang}: {`);
    const s = html.slice(a);
    const l = s.slice(s.indexOf("limits: ["), s.indexOf("],", s.indexOf("limits: [")));
    return l.split("\n").filter((x) => x.trim().startsWith('"'));
  };
  const es = block("es"), en = block("en");
  assert.equal(es.length, en.length);
  assert.ok(es.some((x) => /credenciales/.test(x)) && en.some((x) => /credentials/.test(x)));
  assert.ok(es.some((x) => /contradicciones/i.test(x)) && en.some((x) => /contradictions/i.test(x)));
});

// ------------------------------------------------------------------ 6. D4 desambiguación (0.1.1)

const { criteriaStatus } = await import(pathToFileURL(path.join(ROOT, "engine/src/extractor/normalize.js")).href);
const { evaluateD4 } = await import(pathToFileURL(path.join(ROOT, "engine/src/evaluator/d4.js")).href);
const { finalizeDimension } = await import(pathToFileURL(path.join(ROOT, "engine/src/evaluator/index.js")).href);

test("D4: en sitios reales la desambiguación queda fuera del alcance de la fase", () => {
  const c = criteriaStatus({
    crawlResult: { pages: [], pageRecords: [] }, discovery: null, access: {},
    components: [], tokens: [], patterns: [], tokensStatus: "NOT_EVALUABLE",
  });
  assert.deepEqual(c["D4.disambiguation"], { status: "OUT_OF_SCOPE", reason: "NO_INDEPENDENT_PAIRS" });
});

test("D4: con la forma real del extractor ya no regala 20/20 a 2 de 10 componentes", () => {
  // El extractor solo crea competing_components a partir de la frase de desambiguación.
  const mk = (name, rule) => ({ name, usage: { purpose: "x", ...(rule ? { disambiguation_rules: [rule], competing_components: ["toast"] } : {}) } });
  const comps = [mk("a", "use toast instead of modal"), mk("b", "use x instead of y"), ...Array.from({ length: 8 }, (_, i) => mk("c" + i))];
  const criteria = { "D4.disambiguation": { status: "OUT_OF_SCOPE", reason: "NO_INDEPENDENT_PAIRS" } };
  const d = finalizeDimension(evaluateD4({ components: comps }, rules), criteria);
  const s = d.sub_criteria.disambiguation;
  assert.equal(s.points, null);
  assert.equal(s.status, "OUT_OF_SCOPE");
  assert.equal(d.status, "EVALUATED", "no es una lectura incompleta");
  assert.ok(!d.missing_inputs.includes("disambiguation"));
  const others = Object.entries(d.sub_criteria).filter(([k]) => k !== "disambiguation");
  const expected = (others.reduce((a, [, x]) => a + x.points, 0) / others.reduce((a, [, x]) => a + x.max, 0)) * 100;
  assert.ok(Math.abs(d.score - expected) < 1e-9, "la nota de D4 se calcula sin ese criterio");
  assert.equal(d.evaluable_share, 1, "fuera de alcance no baja la cobertura");
});

test("D4: el informe lo muestra como «fuera de esta fase», no como «no aplica» ni como incompleto", () => {
  const T = loadTexts();
  const input = fixtureInput("good");
  input.metadata = { ...(input.metadata || {}), criteria: { "D4.disambiguation": { status: "OUT_OF_SCOPE", reason: "NO_INDEPENDENT_PAIRS" } } };
  const r = evaluate(input, { weights, rules });
  for (const lang of ["es", "en"]) {
    const html = renderReport(r, "live", lang);
    const d4 = section(html, 'id="dim-D4"', 'id="dim-D5"');
    assert.ok(shows(d4, T[lang].ui.grpScope), `${lang}: grupo fuera de alcance`);
    assert.ok(shows(d4, T[lang].ui.rsNoPairs), `${lang}: motivo`);
    assert.ok(!shows(d4, T[lang].subs.disambiguation.na), `${lang}: no debe decir que no hay componentes parecidos`);
  }
  assert.equal(r.rules_version, "0.1.1");
});

test("D4: las demos con pares independientes se puntúan igual que en 0.1", () => {
  const r = fixture("good");
  assert.equal(r.dimensions.D4.sub_criteria.disambiguation.status, "FOUND");
  assert.equal(r.dimensions.D4.sub_criteria.disambiguation.points, 20);
});

// ------------------------------------------------------------------ 7. D2 y D3: descripciones fieles al código

test("D2/D3: las descripciones de consistencia no prometen más de lo que mide el código", () => {
  const T = loadTexts();
  // naming_consistency solo mira el separador de puntos (d2.js checkNamingConsistency)
  assert.match(T.es.subs.naming_consistency.found, /punto/);
  assert.match(T.en.subs.naming_consistency.found, /dot/);
  assert.ok(!/categoría-propiedad-variante/.test(T.es.subs.naming_consistency.found));
  assert.ok(!/category-property-variant/.test(T.en.subs.naming_consistency.found));
  // api_consistency mide repetición de nombres (d3.js estimateApiConsistency)
  assert.match(T.es.subs.api_consistency.found, /se repiten/);
  assert.match(T.en.subs.api_consistency.found, /repeat/);
  assert.ok(!/el mismo nombre de propiedad usado para el mismo concepto/.test(T.es.subs.api_consistency.found));
  assert.ok(!/same property name used for the same concept/.test(T.en.subs.api_consistency.found));
  // y el código sigue midiendo eso (si cambia la heurística, hay que revisar el texto)
  assert.ok(read("engine/src/evaluator/d2.js").includes('t.name.includes(".")'));
  assert.ok(read("engine/src/evaluator/d3.js").includes("repeatedUses / totalPropUses"));
});

// ------------------------------------------------------------------ 8. otras copias que deben coincidir

test("los pesos copiados en la interfaz son iguales a weights.json", () => {
  const T = loadTexts();
  assert.deepEqual(JSON.parse(JSON.stringify(T.WEIGHTS)), weights.weights);
});

test("«Cómo funciona» usa los mismos nombres de nivel que el informe y declara el tiempo real", () => {
  const T = loadTexts();
  const html = read("public/como-funciona.html");
  for (const lang of ["es", "en"]) for (const l of LEVELS) assert.ok(html.includes(T[lang].ui.bandLabel[l.label]), `${lang}: ${l.label}`);
  assert.ok(!/Readable/.test(html), "en el informe el nivel se llama Legible");
  // server.js: 45 s de rastreo + RENDER_EXTRA_MS (195 s) con navegador ≈ 4 minutos
  assert.match(read("server.js"), /max_duration_ms: 45000/);
  assert.match(read("server.js"), /RENDER_EXTRA_MS\) \|\| 195_000/);
  assert.match(html, /unos 4 minutos/);
  assert.match(html, /about 4 minutes/);
});

// ------------------------------------------------------------------ 9. notas de lanzamiento (cobertura variable y privacidad)

function renderComoFunciona(lang) {
  const html = read("public/como-funciona.html");
  // El script propio de la página (el pie de página se carga aparte, con src).
  const start = html.lastIndexOf("<script>") + 8;
  const script = html.slice(start, html.indexOf("</script>", start));
  const content = { innerHTML: "" };
  const el = () => ({ textContent: "", setAttribute() {}, addEventListener() {} });
  const els = { content, "btn-es": el(), "btn-en": el() };
  const storage = { getItem: () => lang, setItem() {} };
  const ctx = { localStorage: storage, document: { documentElement: {}, title: "", getElementById: (id) => els[id] || el(), querySelector: () => el(), querySelectorAll: () => [] } };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return content.innerHTML;
}

test("cobertura variable: aviso visible junto al resultado y en limitaciones (solo en vivo)", () => {
  const T = loadTexts();
  for (const lang of ["es", "en"]) {
    const live = renderReport(fixture("good"), "live", lang);
    const top = section(live, 'class="verdict"', "</section>");
    assert.ok(shows(top, T[lang].ui.coverageVaries), `${lang}: junto al resultado`);
    assert.ok(shows(section(live, 'class="limitations"'), T[lang].ui.coverageVaries), `${lang}: en limitaciones`);
    assert.ok(!shows(renderReport(fixture("good"), "demo", lang), T[lang].ui.coverageVaries), `${lang}: no en demos`);
  }
});

test("privacidad: la nota de «Cómo funciona» se muestra en ES y EN y dice lo mismo", () => {
  const es = plain(renderComoFunciona("es")), en = plain(renderComoFunciona("en"));
  assert.ok(es.includes("privacidad (nota provisional)") && en.includes("privacy (provisional note)"));
  for (const [a, b] of [["google fonts", "google fonts"], ["render", "render"], ["10 minutos", "10 minutes"],
    ["5 evaluaciones por minuto", "5 evaluations per minute"], ["pendiente", "still pending"], ["agenticds", "agenticds"]]) {
    assert.ok(es.includes(a), `es: ${a}`);
    assert.ok(en.includes(b), `en: ${b}`);
  }
  assert.ok(!/no se guarda nada en el servidor|nothing is stored on the server/.test(es + en), "afirmación más fuerte que lo comprobado");
});

test("privacidad: lo que dice la nota coincide con el código", () => {
  const server = read("server.js");
  assert.match(server, /JOB_TTL_MS = 10 \* 60_000/, "resultado en memoria hasta 10 minutos");
  assert.match(server, /RATE_LIMIT_MAX = 5;/);
  assert.match(server, /RATE_LIMIT_WINDOW_MS = 60_000;/);
  assert.ok(!/writeFile|appendFile|createWriteStream/.test(server), "el servidor no escribe archivos");
  assert.match(read("engine/src/crawler/fetcher.js"), /"user-agent": "AgenticDS\//);
  for (const p of ["public/index.html", "public/results.html", "public/como-funciona.html"]) {
    const h = read(p);
    assert.ok(h.includes("fonts.googleapis.com"), `${p}: carga Google Fonts (la nota lo declara)`);
    assert.ok(!/gtag\(|google-analytics|googletagmanager|plausible|hotjar|document\.cookie/.test(h), `${p}: sin analítica ni cookies`);
  }
  assert.ok(!/document\.cookie/.test(read("public/report.js")));
  // El último resultado vive en sessionStorage (se borra al cerrar la pestaña)
  assert.match(read("public/index.html"), /sessionStorage\.setItem\('agentic-ds-last-result'/);
});
