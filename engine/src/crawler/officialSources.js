// Fuentes oficiales enlazadas por el propio Design System.
//
// Un Design System no vive en una sola dirección: la documentación está en la
// web, el catálogo de componentes con su API en el Storybook, los tipos en el
// repositorio y los tokens en el paquete publicado. El diseñador pega el link de
// su documentación y espera que eso sea todo lo que tiene que hacer.
//
// Regla de alcance: SOLO se entra a lo que el propio sistema declara como fuente
// oficial (enlazado desde su documentación o desde su llms.txt). Un enlace
// suelto a un blog que menciona el sistema no habilita nada. Así el evaluador
// llega a donde vive la evidencia sin convertirse en un rastreador de internet.
import { fetchWithTimeout } from "./fetcher.js";

// Storybook publica un índice de componentes legible por máquina en una
// dirección conocida: index.json (v7+) o stories.json (v6). Es exactamente el
// "índice de componentes legible por máquinas" que pide D1.
function storybookCandidates(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return [];
  }
  const base = `${u.origin}${u.pathname.replace(/\/+$/, "")}/`;
  const out = [`${base}index.json`, `${base}stories.json`];
  if (base !== `${u.origin}/`) out.push(`${u.origin}/index.json`, `${u.origin}/stories.json`);
  return [...new Set(out)];
}

// Devuelve los nombres de componente del índice, o null si no es un índice.
export function parseStorybookIndex(text) {
  let data;
  try {
    data = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const entries = data.entries || data.stories;
  if (!entries || typeof entries !== "object") return null;
  const names = new Set();
  for (const entry of Object.values(entries)) {
    if (!entry || typeof entry !== "object") continue;
    const title = entry.title || entry.kind;
    if (!title) continue;
    // "Components/Button" -> "Button"; se queda con el último tramo con nombre.
    const leaf = String(title).split("/").filter(Boolean).pop();
    if (leaf) names.add(leaf.trim());
  }
  return names.size ? [...names] : null;
}

// Lee las fuentes oficiales que se pueden leer hoy y anota el resto como
// declaradas pero no leídas, para que el informe no las confunda con ausencias.
//
// Tiempo: esta lectura va DESPUÉS del rastreo y no estaba cubierta por su límite
// (max_duration_ms). Con 10 Storybooks lentos medí 6 s frente a un presupuesto de
// 1,5 s. Ahora tiene su propio presupuesto (official_sources_max_ms, 10 s por
// defecto) y solo corre cuando el rastreo tiene un límite de tiempo; lo que no
// alcanza a leerse queda marcado `time_limited` en la fuente, nunca como ausente.
const DEFAULT_OFFICIAL_BUDGET_MS = 10000;
const MIN_REQUEST_MS = 500;

export async function readOfficialSources(sources, opts, fetchImpl, ctx, pages, pageRecords) {
  const read = [];
  const budget = opts.official_sources_max_ms ?? DEFAULT_OFFICIAL_BUDGET_MS;
  const deadline = opts.max_duration_ms ? Date.now() + budget : Infinity;
  for (const source of sources) {
    if (source.kind !== "storybook") continue;
    for (const candidate of storybookCandidates(source.url)) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_REQUEST_MS) {
        source.time_limited = true;
        break;
      }
      const res = await fetchWithTimeout(candidate, {
        timeoutMs: Math.max(MIN_REQUEST_MS, Math.min(opts.request_timeout, 8000, remaining)), fetchImpl, hostCheck: opts.host_check,
      });
      if (!res.ok || !res.body) continue;
      const names = parseStorybookIndex(res.body);
      if (!names) continue;
      pages.push({ url: candidate, depth: null, contentType: res.contentType || "application/json", body: res.body });
      pageRecords.push({ url: candidate, status: "CRAWLED", reason: null });
      ctx.sources.add({
        url: candidate, role: "official_read", depth: null, status: "READ", reason: null,
        found_on: source.found_on, used_for: "component_index",
      });
      source.status = "READ";
      source.components = names.length;
      read.push({ url: candidate, kind: "storybook", components: names });
      break;
    }
  }
  return read;
}
