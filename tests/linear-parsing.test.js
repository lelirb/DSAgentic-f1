// Regresión: una página hostil (miles de etiquetas sin cierre) no debe bloquear
// el servidor. Antes, con ~300 KB de "<p>" sin cerrar cada lectura tardaba ~10 s
// y, como Node atiende todo en un solo hilo, nadie más podía usar la app.
// Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import * as P from "../engine/src/extractor/parseHtml.js";
import * as R from "../engine/src/extractor/readPage.js";
import { findBlocks } from "../engine/src/extractor/blocks.js";
import { parseSitemap, extractNavLinks } from "../engine/src/crawler/siteMap.js";
import { extractLinks } from "../engine/src/crawler/discovery.js";

// Tope generoso: la versión lineal tarda decenas de ms; la cuadrática, segundos.
const BUDGET_MS = 1500;
const HOSTILE_UNITS = [
  "<p>", "<p ", "<h2>", "<h3>x</h3><p>", "<li>", "<td>", "<tr>", "<table>", "<pre>",
  "<script>", "<style>", "<nav>", "<header>", '<div role="navigation">', "<a href=x ",
  "<b>When to use</b>", "<loc>", "<", "<iframe ", "<time ",
];
const SIZE = 300_000; // caracteres por página

function timed(fn) {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

test("ninguna lectura de HTML supera el presupuesto con etiquetas sin cierre", () => {
  const slow = [];
  for (const unit of HOSTILE_UNITS) {
    const html = unit.repeat(Math.ceil(SIZE / unit.length));
    const calls = {
      stripTags: () => P.stripTags(html),
      extractHeadings: () => P.extractHeadings(html),
      extractCodeBlocks: () => P.extractCodeBlocks(html),
      extractFirstParagraphAfterHeading: () => P.extractFirstParagraphAfterHeading(html),
      extractSectionByLabel: () => P.extractSectionByLabel(html, [/^when to use$/i]),
      extractRestrictions: () => P.extractRestrictions(html),
      extractDisambiguationSignals: () => P.extractDisambiguationSignals(html),
      visibleTextLength: () => R.visibleTextLength(html),
      extractSections: () => R.extractSections(html),
      extractTables: () => R.extractTables(html),
      sentencesFrom: () => R.sentencesFrom(html),
      restrictionsFrom: () => R.restrictionsFrom(html),
      disambiguationFrom: () => R.disambiguationFrom(html),
      variantsFrom: () => R.variantsFrom(R.extractSections(html), html),
      liveDemoCount: () => R.liveDemoCount(html),
      versionSignal: () => R.versionSignal(html),
      parseSitemap: () => parseSitemap(html),
      extractNavLinks: () => extractNavLinks(html, "https://x.test/"),
      extractLinks: () => extractLinks(html, "https://x.test/"),
    };
    for (const [name, call] of Object.entries(calls)) {
      const ms = timed(call);
      if (ms > BUDGET_MS) slow.push(`${name} con ${JSON.stringify(unit)}: ${Math.round(ms)} ms`);
    }
  }
  assert.deepEqual(slow, [], `lecturas demasiado lentas:\n${slow.join("\n")}`);
});

// La versión lineal debe dar lo mismo que la de expresiones regulares en HTML normal.
test("las lecturas devuelven lo mismo en HTML normal", () => {
  const html = `<html><head><style>.a{}</style><script>var x = "<p>";</script></head><body>
    <nav><a href="/a">A</a></nav>
    <h1>Button</h1><p>Triggers an <b>action</b>.</p>
    <h2>When to use</h2><p>Use for primary actions. Don't use it for navigation.</p>
    <p>Use a link instead of a button for navigation.</p>
    <table><tr><th>Prop</th><th>Type</th></tr><tr><td>size</td><td>'sm' | 'lg'</td></tr></table>
    <ul><li>First</li><li>Second</li></ul><pre>const a = 1;</pre></body></html>`;
  assert.equal(P.stripTags("<p>Hola&nbsp;<b>mundo</b></p><script>x()</script>  fin"), "Hola mundo fin");
  assert.equal(P.stripTags("a < b y c > d"), "a < b y c > d".replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  assert.deepEqual(P.extractHeadings(html), ["Button", "When to use"]);
  assert.deepEqual(P.extractCodeBlocks(html), ["const a = 1;"]);
  assert.equal(P.extractFirstParagraphAfterHeading(html), "Triggers an action .");
  assert.equal(P.extractSectionByLabel(html, [/^when to use$/i]), "Use for primary actions. Don't use it for navigation.");
  assert.deepEqual(P.extractRestrictions(html), ["Don't use it for navigation"]);
  assert.equal(P.extractDisambiguationSignals(html).length, 1);
  assert.deepEqual(R.extractSections(html).map((s) => [s.level, s.title]), [[1, "Button"], [2, "When to use"]]);
  const tables = R.extractTables(html);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].headers, ["prop", "type"]);
  assert.deepEqual(tables[0].rows, [["size", "'sm' | 'lg'"]]);
  assert.deepEqual(parseSitemap("<urlset><url><loc>https://x.test/a</loc></url><url><loc> https://x.test/b?x=1&amp;y=2 </loc></url></urlset>").urls, ["https://x.test/a", "https://x.test/b?x=1&y=2"]);
  assert.deepEqual(extractNavLinks(html, "https://x.test/"), ["https://x.test/a"]);
});

test("findBlocks: sin cierre no devuelve nada y no vuelve a buscar", () => {
  assert.deepEqual(findBlocks("<p>uno<p>dos", "p"), []);
  assert.deepEqual(findBlocks("<p>uno</p><p>dos", "p").map((b) => b.inner), ["uno"]);
  // un <p> sin cierre no impide encontrar un <li> cerrado después
  assert.deepEqual(findBlocks("<p>uno<li>dos</li>", "p|li").map((b) => b.inner), ["dos"]);
  assert.deepEqual(findBlocks("<pre>x</pre>", "p"), []); // <pre> no es <p>
});
