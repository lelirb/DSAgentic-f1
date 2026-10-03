// Puertas alternativas.
//
// El diseñador pega un link público y no tiene por qué saber si su sitio entrega
// HTML, JSON o Markdown. Cuando una página llega sin contenido porque se arma
// con JavaScript, el evaluador no puede concluir "no hay nada": tiene que probar
// la dirección paralela donde el mismo sitio publica el contenido en un formato
// legible por máquina, que es exactamente lo que haría un agente.
//
// Medido en vivo (2026-09-18) contra developer.apple.com: la página de la HIG
// devuelve un cascarón que dice "This page requires JavaScript", mientras que
// /tutorials/data/<ruta>.json y /tutorials/data/<ruta>.md devuelven el contenido
// completo, con encabezados, secciones, enlaces a temas relacionados y changelog.
import { visibleTextLength } from "../extractor/readPage.js";

const MIN_VISIBLE_TEXT = 40;

// ¿La respuesta es un cascarón vacío armado con JavaScript?
export function isScriptShell(contentType, body) {
  if (!/html/.test(contentType || "")) return false;
  if (!body) return true;
  if (/requires?\s+javascript|enable\s+javascript|necesitas?\s+javascript/i.test(body)) return true;
  return visibleTextLength(body) < MIN_VISIBLE_TEXT;
}

// ---------- DocC (Apple, Swift, y cualquier sitio publicado con DocC) ----------
//
// DocC sirve el modelo de contenido en /tutorials/data/<misma ruta>.json y el
// mismo texto en Markdown con sufijo .md. Se prefiere .md: ya es texto plano y
// no obliga a recorrer el árbol de bloques del JSON.
function doccCandidates(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return [];
  }
  if (u.pathname.startsWith("/tutorials/data/")) return []; // ya estamos en la puerta buena
  const clean = u.pathname.replace(/\/+$/, "");
  if (!clean) return [];
  return [
    `${u.origin}/tutorials/data${clean}.md`,
    `${u.origin}/tutorials/data${clean}.json`,
  ];
}

export const ADAPTERS = [
  {
    name: "docc",
    // La firma está en el propio cascarón: DocC deja su identificador de bundle
    // y la ruta de datos en el HTML aunque el contenido no se haya renderizado.
    matches: (url, body) =>
      /\/tutorials\/data\//.test(body || "") ||
      /com\.apple\.(HIG|documentation)/.test(body || "") ||
      /"?swift-docc|docc-render/i.test(body || ""),
    candidates: doccCandidates,
  },
];

export function adapterFor(url, body) {
  for (const a of ADAPTERS) {
    if (!a.matches(url, body)) continue;
    const candidates = a.candidates(url);
    if (candidates.length) return { name: a.name, candidates };
  }
  return null;
}

// ---------- Markdown -> HTML mínimo ----------
//
// El resto del extractor lee HTML. En vez de duplicar la lógica de detección
// para Markdown, el contenido recuperado se convierte a un HTML simple con los
// elementos que el extractor usa: encabezados, párrafos, listas, tablas,
// bloques de código y enlaces (necesarios para seguir recorriendo el sistema).
export function markdownToHtml(md) {
  if (!md) return "";
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, t, href) => `<a href="${href}">${t}</a>`);

  const out = [];
  const lines = md.split(/\r?\n/);
  let inCode = false;
  let listOpen = false;
  let tableOpen = false;
  const closeList = () => { if (listOpen) { out.push("</ul>"); listOpen = false; } };
  const closeTable = () => { if (tableOpen) { out.push("</table>"); tableOpen = false; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      closeList(); closeTable();
      out.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(esc(raw)); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList(); closeTable();
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      closeTable();
      if (!listOpen) { out.push("<ul>"); listOpen = true; }
      out.push(`<li>${inline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // fila separadora
      if (!tableOpen) { out.push("<table>"); tableOpen = true; }
      const cells = line.trim().replace(/^\||\|$/g, "").split("|");
      out.push(`<tr>${cells.map((c) => `<td>${inline(c.trim())}</td>`).join("")}</tr>`);
      continue;
    }
    if (!line.trim()) { closeList(); closeTable(); continue; }
    closeTable();
    if (listOpen) closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inCode) out.push("</code></pre>");
  closeList(); closeTable();
  return `<html><body>${out.join("\n")}</body></html>`;
}

// ---------- DocC JSON -> HTML mínimo ----------
export function doccJsonToHtml(json) {
  let doc;
  try {
    doc = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    return "";
  }
  if (!doc || typeof doc !== "object") return "";
  const refs = doc.references || {};
  const parts = [];
  const title = doc.metadata && doc.metadata.title;
  if (title) parts.push(`<h1>${title}</h1>`);
  const abstract = textOf(doc.abstract, refs);
  if (abstract) parts.push(`<p>${abstract}</p>`);

  const walk = (blocks) => {
    for (const b of blocks || []) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "heading" && b.text) parts.push(`<h${Math.min(6, b.level || 2)}>${b.text}</h${Math.min(6, b.level || 2)}>`);
      else if (b.type === "paragraph") parts.push(`<p>${textOf(b.inlineContent, refs)}</p>`);
      else if (b.type === "unorderedList" || b.type === "orderedList") {
        parts.push("<ul>");
        for (const it of b.items || []) parts.push(`<li>${(it.content || []).map((c) => textOf(c.inlineContent, refs)).join(" ")}</li>`);
        parts.push("</ul>");
      } else if (b.type === "table") {
        parts.push("<table>");
        for (const row of b.rows || []) {
          parts.push(`<tr>${row.map((cell) => `<td>${(cell || []).map((c) => textOf(c.inlineContent, refs)).join(" ")}</td>`).join("")}</tr>`);
        }
        parts.push("</table>");
      } else if (b.type === "codeListing") {
        parts.push(`<pre><code>${(b.code || []).join("\n")}</code></pre>`);
      } else if (b.type === "tabNavigator") {
        for (const t of b.tabs || []) { if (t.title) parts.push(`<h4>${t.title}</h4>`); walk(t.content); }
      } else if (b.content) walk(b.content);
    }
  };
  for (const section of doc.primaryContentSections || []) walk(section.content);

  // Los temas relacionados son el índice del sistema: sin ellos el recorrido
  // muere en una página.
  const links = [];
  for (const [key, ref] of Object.entries(refs)) {
    if (ref && ref.url && ref.title) links.push(`<a href="${ref.url}">${ref.title}</a>`);
    else if (key.startsWith("http") && ref && ref.title) links.push(`<a href="${key}">${ref.title}</a>`);
  }
  if (links.length) parts.push(`<nav>${links.join("\n")}</nav>`);
  return `<html><body>${parts.join("\n")}</body></html>`;
}

function textOf(inlineContent, refs) {
  if (!Array.isArray(inlineContent)) return "";
  return inlineContent
    .map((n) => {
      if (!n || typeof n !== "object") return "";
      if (n.type === "text") return n.text || "";
      if (n.type === "codeVoice") return `<code>${n.code || ""}</code>`;
      if (n.type === "emphasis" || n.type === "strong") return textOf(n.inlineContent, refs);
      if (n.type === "reference") {
        const ref = refs[n.identifier];
        const label = (n.overridingTitle) || (ref && ref.title) || "";
        const href = ref && ref.url;
        return href ? `<a href="${href}">${label}</a>` : label;
      }
      if (n.inlineContent) return textOf(n.inlineContent, refs);
      return "";
    })
    .join("");
}
