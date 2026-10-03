import { findBlocks, removeBlocks } from "./blocks.js";

// Deliberately minimal. No HTML-parsing library is available offline in this
// build environment, and per section 44 ("El extractor debe ser conservador")
// it is preferable to extract less, correctly, than to guess with a fragile
// parser and call it evidence. This is Extractor v0.1 — section 54 explicitly
// anticipates it being swapped for a more capable version later.

// Tiempo lineal: ninguna de las expresiones de aquí vuelve a recorrer el
// documento por cada etiqueta sin cierre (ver blocks.js). Misma salida que la
// versión con expresiones regulares para HTML normal.
export function stripTags(html) {
  let s = removeBlocks(removeBlocks(String(html ?? ""), "script"), "style");
  // Equivale a replace(/<[^>]+>/g, " ") pero sin volver a buscar un ">" desde
  // cada "<" cuando no queda ninguno.
  let out = "";
  let i = 0;
  for (;;) {
    const lt = s.indexOf("<", i);
    if (lt === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, lt);
    const gt = s.indexOf(">", lt + 1);
    if (gt === -1) {
      out += s.slice(lt);
      break;
    }
    if (gt === lt + 1) {
      out += "<"; // "<>" no es una etiqueta
      i = lt + 1;
    } else {
      out += " ";
      i = gt + 1;
    }
  }
  return out.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function extractHeadings(html) {
  const out = [];
  for (const b of findBlocks(html, "h[1-3]")) {
    const text = stripTags(b.inner);
    if (text) out.push(text);
  }
  return out;
}

export function extractCodeBlocks(html) {
  return findBlocks(html, "pre").map((b) => stripTags(b.inner));
}

// Best-effort: first <p> that appears after the first heading. Low-confidence
// signal used only to populate `description`/`purpose`; never invented if absent.
export function extractFirstParagraphAfterHeading(html) {
  const heading = findBlocks(html, "h[1-3]", 1)[0];
  const rest = heading ? String(html).slice(heading.end) : String(html ?? "");
  const p = findBlocks(rest, "p", 1)[0];
  if (!p) return null;
  const text = stripTags(p.inner);
  return text.length > 0 ? text : null;
}

// PRUEBA CONTRA DS REALES (2026-09-05, Hallazgo 4): busca una etiqueta corta de
// sección ("When to use", "When not to use") sin asumir que vive en un heading
// real — la validación contra Carbon mostró que el contenido real puede llegar
// sin jerarquía de <h2>/<h3> limpia, con las mismas etiquetas dentro de <span>,
// <div>, <strong>, etc. Se exige que la etiqueta sea el contenido ENTERO y corto
// de un tag (no una subcadena dentro de una oración larga) para evitar falsos
// positivos — "when to use" apareciendo de pasada en un párrafo no cuenta.
// "[^<>]*" y no "[^>]*": así cada "<" sin ">" cercano cuesta solo hasta el
// siguiente "<" y la búsqueda sigue siendo lineal.
const SECTION_LABEL_TAG_RE = /<(h[1-6]|span|div|dt|strong|b)[^<>]*>\s*([^<]{1,80}?)\s*<\/\1>/gi;

export function extractSectionByLabel(html, labelPatterns) {
  const source = String(html ?? "");
  let paragraphs = null; // se calcula una sola vez y solo si hace falta
  let next = 0;
  SECTION_LABEL_TAG_RE.lastIndex = 0;
  let m;
  while ((m = SECTION_LABEL_TAG_RE.exec(source))) {
    const labelText = m[2].trim();
    if (labelPatterns.some((re) => re.test(labelText))) {
      const searchFrom = m.index + m[0].length;
      if (!paragraphs) paragraphs = findBlocks(source, "p");
      // Las etiquetas se recorren de izquierda a derecha: el puntero solo avanza.
      while (next < paragraphs.length && paragraphs[next].start < searchFrom) next++;
      for (let k = next; k < paragraphs.length; k++) {
        const text = stripTags(paragraphs[k].inner);
        if (text) return text;
        break; // igual que antes: solo se mira el primer párrafo después de la etiqueta
      }
    }
  }
  return null;
}

// PRUEBA CONTRA DS REALES (2026-09-05): búsqueda real contra el texto público de
// Carbon confirmó que las guías "Do / Don't" en la práctica NO viven en una lista
// <li> confiable, ni siempre en pares imagen+caption parseables — aparecen como
// oraciones cortas e imperativas dentro de párrafos normales. Ejemplos reales
// citados textualmente (carbondesignsystem.com/components/button/usage,
// .../radio-button/usage):
//   "Do use a primary and two of the same lower emphasis buttons in a button
//    group. Do not mix primary, secondary, and tertiary buttons in the same
//    button group."
//   "Do use checkboxes when multiple items can be selected. Don't use radio
//    buttons when multiple items can be selected."
// Por eso la extracción opera a nivel de ORACIÓN dentro de cada <p>, no de
// heading/label — es el único patrón para el que tengo evidencia real de que
// funciona. Solo se capturan negativas ("Do not"/"Don't") porque el campo
// `usage.restrictions` del schema es específicamente para eso; las positivas
// ("Do X") no tienen un campo claro donde encajar todavía y se descartan en vez
// de forzarlas en algún lado.
// PRUEBA CONTRA DS REALES (2026-09-10, Fluent 2): sitios con tipografía cuidada
// escriben "Don’t" con apóstrofo tipográfico (U+2019) o su entidad HTML, no con
// "'". La versión anterior solo aceptaba el recto y perdía TODAS esas
// restricciones (0 de 2 en frases reales de fluent2.microsoft.design).
export const APOSTROPHE = "(?:'|\u2019|&rsquo;|&#8217;|&#x2019;|&#39;)";
const RESTRICTION_SENTENCE_RE = new RegExp(`^(do not|don${APOSTROPHE}?t)\\s+\\S.{2,180}$`, "i");

export function extractRestrictions(html) {
  const restrictions = [];
  for (const p of findBlocks(html, "p")) {
    const text = stripTags(p.inner);
    if (!text) continue;
    // Naive sentence split on ". "/"! "/"? " boundaries — conservative, not a
    // real sentence tokenizer, but DS guidance sentences are short and rarely
    // contain internal abbreviation periods that would confuse this.
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const raw of sentences) {
      const sentence = raw.trim().replace(/[.!?]+$/, "");
      if (RESTRICTION_SENTENCE_RE.test(sentence)) {
        restrictions.push(sentence);
      }
    }
  }
  return [...new Set(restrictions)]; // de-dupe, preserve first-seen order
}

// PRUEBA CONTRA DS REALES (2026-09-05): búsqueda confirmó el patrón real de
// desambiguación entre componentes que compiten — citado textualmente:
//   Carbon Modal: "For non-critical messaging, consider using a toast or
//   inline notification instead of a modal."
//   Carbon Radio button: "If a user can select from multiple options, use
//   checkboxes instead of radio buttons."
// El marcador real es "instead of". A diferencia de restrictions (que solo
// captura la oración completa), aquí SÍ hace falta identificar qué componente
// se menciona como alternativa, porque el scoring de D4 (evaluateD4) solo
// puntúa disambiguation cuando `usage.competing_components` no está vacío —
// una oración capturada sin eso nunca afecta el score. Se extrae la frase tal
// cual aparece (sin normalizar a un "nombre canónico" de componente, porque no
// hay evidencia de que eso funcione bien) — es una señal de "este componente sí
// habla de una alternativa", no un intento de emparejar IDs de componentes.
const COMPETITOR_STOPWORDS = /^(when|if|unless|for|in|because|so|as|to|and|or|but)$/i;

function extractCompetitorPhrase(sentence) {
  const m = /instead of\s+(?:an?\s+|the\s+)?([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2})/i.exec(sentence);
  if (!m) return null;
  const words = m[1].split(/\s+/);
  while (words.length > 1 && COMPETITOR_STOPWORDS.test(words[words.length - 1])) {
    words.pop();
  }
  const phrase = words.join(" ").trim();
  return phrase.length > 0 ? phrase : null;
}

export function extractDisambiguationSignals(html) {
  const results = [];
  for (const p of findBlocks(html, "p")) {
    const text = stripTags(p.inner);
    if (!text) continue;
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const raw of sentences) {
      const sentence = raw.trim().replace(/[.!?]+$/, "");
      if (!/\binstead of\b/i.test(sentence)) continue;
      const competitor = extractCompetitorPhrase(sentence);
      if (competitor) {
        results.push({ rule: sentence, competitor });
      }
    }
  }
  return results;
}
