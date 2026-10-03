// Regresión: leer fuentes oficiales (Storybook) no puede saltarse el límite de
// tiempo. Antes esa lectura corría después del rastreo sin ningún tope: con 10
// Storybooks lentos tardaba 6 s frente a un presupuesto de 1,5 s, y con tiempos
// reales (8 s por petición) podía pasar de 150 s.
// Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { crawl } from "../engine/src/crawler/crawl.js";

const ENTRY = "https://slow-ds.test/docs/";

function makeSite(delayMs) {
  const links = Array.from({ length: 10 }, (_, i) => `<a href="https://sb${i}.storybook.evil.test/sb/">Storybook ${i}</a>`).join("");
  const site = {
    [ENTRY]: `<html><body><h1>DS</h1>${links}<a href="/docs/components/button">Button</a></body></html>`,
    "https://slow-ds.test/docs/components/button": "<html><body><h1>Button</h1><p>Triggers an action.</p></body></html>",
  };
  const counter = { external: 0 };
  const fetchImpl = async (url) => {
    if (/storybook\.evil\.test/.test(url)) {
      counter.external++;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    const body = site[url];
    if (!body) return { ok: false, status: 404, url, headers: { get: () => "text/html" }, text: async () => "" };
    return { ok: true, status: 200, url, headers: { get: (h) => (h === "content-type" ? "text/html" : null) }, text: async () => body };
  };
  return { fetchImpl, counter };
}

test("la lectura de fuentes oficiales respeta su presupuesto de tiempo", async () => {
  const { fetchImpl, counter } = makeSite(300);
  const t0 = Date.now();
  const result = await crawl(ENTRY, { max_duration_ms: 1500, official_sources_max_ms: 1000, request_timeout: 8000, host_check: null }, fetchImpl);
  const elapsed = Date.now() - t0;
  // Sin tope: 10 fuentes x 2 candidatos x 300 ms = 6 s. Con tope: ~1 s de lectura.
  assert.ok(elapsed < 3000, `tardó ${elapsed} ms`);
  assert.ok(counter.external < 10, `hizo ${counter.external} peticiones externas`);
  assert.equal(result.stats.time_limited, true);
  assert.ok(result.discovery.official_sources.some((s) => s.time_limited), "alguna fuente debe quedar marcada como limitada por tiempo");
});

test("sin límite de tiempo en el rastreo, las fuentes oficiales se leen completas", async () => {
  const { fetchImpl, counter } = makeSite(1);
  const result = await crawl(ENTRY, { request_timeout: 8000, host_check: null }, fetchImpl);
  assert.equal(result.discovery.official_sources.filter((s) => s.time_limited).length, 0);
  assert.ok(counter.external >= 10);
});
