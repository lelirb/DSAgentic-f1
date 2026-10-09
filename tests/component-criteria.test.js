// Criterios de la dueña sobre qué es un componente y cómo se llama.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSample } from "../engine/src/crawler/siteMap.js";
import { componentName, componentIdentity } from "../engine/src/extractor/detectComponents.js";

test("un componente publicado por plataforma es uno solo, con sus adaptaciones", () => {
  const F = "https://fluent.test";
  const urls = [
    "/components/ios/core/avatargroup/usage/", "/components/android/core/avatargroup/usage/",
    "/components/web/react/core/avatargroup/usage/", "/components/web/react/core/checkbox/usage/",
  ].map((p) => F + p);
  const { sample, counts } = buildSample(urls, { rootUrl: `${F}/` });
  assert.equal(counts.components_found, 2);
  assert.deepEqual(counts.component_names_found, ["avatargroup", "checkbox"]);
  for (const u of urls) assert.ok(sample.includes(u), "las tres versiones se leen como pestañas del mismo componente");
});

test("el nombre es aquello de lo que habla la página", () => {
  assert.equal(componentName("Checkbox Preview", componentIdentity("https://f.test/components/web/react/core/checkbox/usage/")), "Checkbox");
  assert.equal(componentName("Avatar group Preview", "avatargroup"), "Avatar group");
  assert.equal(componentName("Data table", "data-table"), "Data table");
  assert.equal(componentName("Botón primario Beta", "boton-primario"), "Botón primario");
  // Si el título no empieza con lo que dice la dirección, se respeta.
  assert.equal(componentName("Buttons", "button"), "Buttons");
  assert.equal(componentName("Navigation bar", "navigation-bar"), "Navigation bar");
  assert.equal(componentName("Toast", "toast"), "Toast");
  assert.equal(componentName("", "toast"), null);
});

import { extractSections, findSections, VOCAB } from "../engine/src/extractor/readPage.js";

test("'Usage' y 'Uso' cuentan como 'Cuándo usar'", () => {
  for (const title of ["Usage", "Uso", "Usage guidelines", "When to use", "Cuándo usarlo"]) {
    const s = extractSections(`<h2>${title}</h2><p>Use badges to show counts on navigation items.</p>`);
    assert.equal(findSections(s, VOCAB.whenToUse).length, 1, title);
  }
  for (const title of ["Usage examples", "Usuario", "Use cases"]) {
    const s = extractSections(`<h2>${title}</h2><p>Texto.</p>`);
    assert.equal(findSections(s, VOCAB.whenToUse).length, 0, title);
  }
});
