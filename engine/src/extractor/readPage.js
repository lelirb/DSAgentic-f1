// Etapa 4 — leer más cosas de cada página, en español e inglés.
// Conservador: solo se toma lo que tiene una forma reconocible (una tabla con
// encabezados, una sección con título). Nada se inventa.
import { stripTags } from "./parseHtml.js";
import { findBlocks, removeBlocks } from "./blocks.js";

// ---------- vocabulario (ES / EN) ----------
// Etiquetas de sección: se comparan contra el título ENTERO de la sección.
export const VOCAB = {
  whenToUse: [/^when to use( it| this)?:?$/i, /^use (it )?when:?$/i, /^usage guidelines:?$/i, /^cu[aá]ndo usar(lo|la)?:?$/i, /^us(a|á|e|ar)(lo|la)? cuando:?$/i],
  whenNotToUse: [
    /^when not to use( it| this)?:?$/i, /^do not use( when)?:?$/i, /^don(?:'|\u2019|&rsquo;|&#8217;|&#39;)?t use( when)?:?$/i,
    /^avoid( using)?( when)?:?$/i, /^cu[aá]ndo no usar(lo|la)?:?$/i, /^no (lo |la )?us(es|ar)( cuando)?:?$/i, /^evit(a|á|ar)( usar(lo|la)?)?( cuando)?:?$/i,
  ],
  props: [/^(props|properties|api|component api|parameters|inputs|attributes|propiedades|par[aá]metros|atributos|api del componente)$/i],
  variants: [/^(variants?|variations?|types|kinds|variantes?|variaciones|tipos)$/i],
  states: [/^(states?|interactive states|interaction states|estados?|estados de interacci[oó]n|estados interactivos)$/i],
  accessibility: [/^(accessibility|a11y|accesibilidad|accessibility (guidelines|considerations))$/i],
  anatomy: [/^(anatomy|composition|structure|anatom[ií]a|composici[oó]n|estructura)$/i],
  layout: [/(layout|spacing|alignment|grid|dise[nñ]o de p[aá]gina|espaciado|alineaci[oó]n|disposici[oó]n)/i],
  hierarchy: [/(hierarchy|nesting|order|jerarqu[ií]a|anidaci[oó]n|anidamiento|orden)/i],
};

// Frases dentro de oraciones.
export const RESTRICTION_START = /^(do not|don(?:'|\u2019|&rsquo;|&#8217;|&#39;)?t|never|avoid|no (uses?|utilices|utilizar|usar|combines?|mezcles?|pongas?|agregues?)|nunca|evit(a|á|ar)|no se debe)\s+\S.{2,180}$/i;
export const DISAMBIGUATION = [
  /\binstead of\s+(?:an?\s+|the\s+)?([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2})/i,
  /\b(?:use|try|consider using|prefer)\s+(?:an?\s+|the\s+)?([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,1})\s+instead\b/i,
  /\ben (?:lugar|vez) de(?:l| la| el| un| una| los| las)?\s+([a-záéíóúñ][a-záéíóúñ-]*(?:\s+[a-záéíóúñ][a-záéíóúñ-]*){0,2})/i,
  /\b(?:us[aáe]r?|prefer[ií]?r?)\s+(?:un|una|el|la)?\s*([a-záéíóúñ][a-záéíóúñ-]*)\s+en su lugar\b/i,
];
const COMPETITOR_STOP = /^(when|if|unless|for|in|because|so|as|to|and|or|but|with|on|cuando|si|para|en|porque|y|o|pero|que|con|al|del|de)$/i;

export const STATE_NAMES = {
  hover: /\bhover(ed)?\b|\bal pasar el (cursor|puntero)\b|\bsobrevuelo\b/i,
  focus: /\bfocus(ed)?\b|\bfoco\b|\benfocad[oa]\b/i,
  active: /\bactive\b|\bpressed\b|\bactivo\b|\bpresionad[oa]\b/i,
  disabled: /\bdisabled\b|\bdeshabilitad[oa]\b|\binhabilitad[oa]\b/i,
  error: /\berror\b|\binvalid\b|\binv[aá]lid[oa]\b/i,
  loading: /\bloading\b|\bcargando\b|\bbusy\b/i,
  selected: /\bselected\b|\bchecked\b|\bseleccionad[oa]\b|\bmarcad[oa]\b/i,
  readonly: /\bread[- ]?only\b|\bsolo lectura\b/i,
};

// ---------- estructura ----------

// Texto visible de la página: el del <body>, sin menús (nav, header, footer), sin
// <noscript> ni <template>. Antes se contaba TODO el HTML, incluidos el <title> y
// el aviso de <noscript> ("necesitas activar JavaScript"), así que un cascarón
// vacío armado con JavaScript sumaba más de 40 caracteres y contaba como página
// leída. Resultado: D1 decía "el contenido está en el HTML" (15/15) mientras D3,
// D4 y D5 no encontraban nada en esas mismas páginas y lo puntuaban como 0.
export function visibleTextLength(html) {
  const s = String(html || "");
  const body = findBlocks(s, "body", 1)[0];
  const scope = body ? body.inner : s;
  return stripTags(removeBlocks(scope, "head|nav|header|footer|noscript|template")).length;
}
// Una página con menos texto que esto se trata como "no se pudo leer" (se
// excluye de la nota), no como "se leyó y no apareció" (0 puntos). Es un umbral
// de producto: se usa igual en D1 y en la lectura de componentes.
export const MIN_READABLE_TEXT = 200;

// Divide la página por títulos h1–h4. Cada sección incluye su HTML hasta el
// siguiente título del mismo nivel o superior.
export function extractSections(html) {
  const heads = findBlocks(html, "h[1-4]").map((b) => ({ level: Number(b.tag[1]), title: cleanTitle(stripTags(b.inner)), start: b.start, bodyStart: b.end }));
  return heads.map((h, i) => {
    let end = html.length;
    for (let j = i + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) {
        end = heads[j].start;
        break;
      }
    }
    return { level: h.level, title: h.title, html: html.slice(h.bodyStart, end) };
  });
}

function cleanTitle(t) {
  return t.replace(/[#¶§]+/g, "").replace(/\s+/g, " ").trim();
}

export function findSections(sections, patterns) {
  return sections.filter((s) => patterns.some((re) => re.test(s.title)));
}

export function extractTables(html) {
  const out = [];
  for (const table of findBlocks(html, "table", 40)) {
    const rows = [];
    for (const r of findBlocks(table.inner, "tr", 300)) {
      const cells = findBlocks(r.inner, "t[hd]").map((c) => ({ th: c.tag === "th", text: stripTags(c.inner) }));
      if (cells.length) rows.push(cells);
    }
    if (rows.length < 2) continue;
    const headerRow = rows.shift();
    out.push({ headers: headerRow.map((c) => c.text.toLowerCase()), rows: rows.map((row) => row.map((c) => c.text)) });
  }
  return out;
}

const col = (headers, re) => headers.findIndex((h) => re.test(h));
const H_NAME = /^(name|prop|props|property|propiedad|nombre|parameter|par[aá]metro|attribute|atributo|input)s?$/i;
const H_TYPE = /^(type|tipo|types|tipos)$/i;
const H_DEFAULT = /^(default|default value|defaults?|predeterminado|valor (por defecto|predeterminado)|por defecto)$/i;
const H_DESC = /^(description|descripci[oó]n|details|detalles|purpose|prop[oó]sito)$/i;
const H_TOKEN = /^(token|tokens|token name|nombre del token|name|nombre|variable|css variable|scss|sass)$/i;
const H_VALUE = /^(value|valor|values|valores|hex|rem|px|resolved value|valor resuelto)$/i;

export function propsFromTables(tables) {
  const props = [];
  for (const t of tables) {
    const iName = col(t.headers, H_NAME);
    const iType = col(t.headers, H_TYPE);
    const iDef = col(t.headers, H_DEFAULT);
    const iDesc = col(t.headers, H_DESC);
    // Una tabla de propiedades tiene nombre y al menos tipo o valor por defecto.
    if (iName < 0 || (iType < 0 && iDef < 0)) continue;
    if (col(t.headers, H_VALUE) >= 0 && iType < 0) continue; // parece tabla de tokens
    for (const row of t.rows) {
      const name = (row[iName] || "").replace(/[*?]$/, "").trim();
      if (!/^[A-Za-z_$@][\w$.:-]{0,60}$/.test(name)) continue;
      const type = iType >= 0 ? (row[iType] || "").trim() || null : null;
      const def = iDef >= 0 ? normalizeEmpty(row[iDef]) : null;
      const description = iDesc >= 0 ? (row[iDesc] || "").trim() || null : null;
      props.push({ name, type, default: def, description, allowed_values: allowedValues(type) });
    }
  }
  return dedupeBy(props, (p) => p.name);
}

function normalizeEmpty(v) {
  const s = String(v ?? "").trim();
  return !s || /^(-|—|–|n\/a|none|undefined)$/i.test(s) ? null : s;
}

// "'primary' | 'secondary'" o "primary, secondary" -> lista de valores.
export function allowedValues(type) {
  if (!type) return [];
  const quoted = [...type.matchAll(/["'`]([^"'`]{1,40})["'`]/g)].map((m) => m[1]);
  if (quoted.length >= 2) return [...new Set(quoted)];
  if (/\|/.test(type)) {
    const parts = type.split("|").map((s) => s.trim()).filter((s) => /^[\w-]{1,30}$/.test(s) && !/^(string|number|boolean|null|undefined|object|any|node|function|reactnode|element)$/i.test(s));
    if (parts.length >= 2) return [...new Set(parts)];
  }
  return [];
}

export function tokensFromTables(tables) {
  const tokens = [];
  for (const t of tables) {
    const iTok = col(t.headers, H_TOKEN);
    const iVal = col(t.headers, H_VALUE);
    if (iTok < 0 || iVal < 0 || col(t.headers, H_TYPE) >= 0 && col(t.headers, H_DEFAULT) >= 0) continue;
    for (const row of t.rows) {
      const name = (row[iTok] || "").trim().split(/\s+/)[0];
      const value = (row[iVal] || "").trim();
      // Un token tiene un nombre de máquina: $token, --token, token.name o token-name.
      if (!/^(\$|--|@)?[a-z][\w-]*([.-][\w-]+)+$/i.test(name) || !value) continue;
      const iDesc = col(t.headers, H_DESC);
      tokens.push({ name, value, description: iDesc >= 0 ? row[iDesc] || null : null });
    }
  }
  return dedupeBy(tokens, (t) => t.name);
}

// Variantes: títulos de las subsecciones de "Variants", o la primera columna de
// una tabla dentro de esa sección.
export function variantsFrom(sections, html) {
  const out = new Set();
  for (const s of findSections(sections, VOCAB.variants)) {
    for (const sub of findBlocks(s.html, "h[3-5]")) {
      const t = cleanTitle(stripTags(sub.inner));
      if (t && t.length <= 40) out.add(t);
    }
    for (const tb of extractTables(s.html)) for (const row of tb.rows) if (row[0] && row[0].length <= 40) out.add(row[0].trim());
    if (!out.size) {
      for (const li of findBlocks(s.html, "li")) {
        const t = stripTags(li.inner).split(/[:.–—-]/)[0].trim();
        if (t && t.length <= 30) out.add(t);
      }
    }
  }
  // Propiedad "variant"/"kind" con valores enumerados también cuenta.
  return [...out].slice(0, 30);
}

// Estados: dentro de una sección de estados, o como columnas/filas de una
// tabla de estados. Devuelve los nombres reconocidos.
export function statesFrom(sections) {
  const found = new Set();
  for (const s of findSections(sections, VOCAB.states)) {
    const text = stripTags(s.html);
    for (const [name, re] of Object.entries(STATE_NAMES)) if (re.test(text)) found.add(name);
  }
  return [...found];
}

export function hasSection(sections, patterns) {
  return findSections(sections, patterns).some((s) => stripTags(s.html).length > 20);
}

// Demos en vivo: iframes o enlaces a entornos que ejecutan el componente.
const LIVE_DEMO_RE = /<iframe\b[^<>]*\bsrc\s*=\s*["'][^"']*(storybook|iframe\.html|codesandbox|stackblitz|codepen|playground|sandbox|demo)[^"']*["']|<a\b[^<>]*\bhref\s*=\s*["'][^"']*(codesandbox\.io|stackblitz\.com|codepen\.io)[^"']*["']|\b(data-)?(playground|live-?demo|live-?code|sandpack)\b/gi;
export function liveDemoCount(html) {
  return (String(html || "").match(LIVE_DEMO_RE) || []).length;
}

// Versión o fecha de actualización visibles.
export function versionSignal(text) {
  const t = String(text || "");
  return /\b(version|versi[oó]n|v)\s?\d+\.\d+(\.\d+)?\b/i.test(t) ||
    /\b(last updated|updated on|last modified|[uú]ltima actualizaci[oó]n|actualizado el)\b/i.test(t) ||
    /<time\b[^<>]*datetime=/i.test(t);
}

// Declaración de un servidor MCP (Model Context Protocol).
export function mcpSignal(text) {
  return /\bmodel context protocol\b|\bmcp server\b|\bservidor mcp\b|\bmcp\s+(endpoint|integration|integraci[oó]n)\b/i.test(String(text || ""));
}

// Oraciones con restricciones o con desambiguación, en ES y EN.
export function sentencesFrom(html) {
  const out = [];
  for (const b of findBlocks(html, "p|li")) {
    const text = stripTags(b.inner);
    if (!text) continue;
    for (const raw of text.split(/(?<=[.!?])\s+/)) {
      const s = raw.trim().replace(/[.!?]+$/, "");
      if (s) out.push(s);
    }
  }
  return out;
}

export function restrictionsFrom(html) {
  return [...new Set(sentencesFrom(html).filter((s) => RESTRICTION_START.test(s)))];
}

export function disambiguationFrom(html) {
  const out = [];
  for (const s of sentencesFrom(html)) {
    for (const re of DISAMBIGUATION) {
      const m = re.exec(s);
      if (!m) continue;
      const words = [];
      for (const w of m[1].split(/\s+/)) {
        if (COMPETITOR_STOP.test(w) || /^(un|una|el|la|los|las|a|an|the)$/i.test(w)) {
          if (words.length) break;
          continue;
        }
        words.push(w);
      }
      const competitor = words.join(" ").trim().toLowerCase();
      if (competitor && !COMPETITOR_STOP.test(competitor)) {
        out.push({ rule: s, competitor });
        break;
      }
    }
  }
  return out;
}

// Texto de la primera sección cuyo título coincide.
export function sectionText(sections, patterns) {
  for (const s of findSections(sections, patterns)) {
    const t = stripTags(s.html);
    if (t) return t.slice(0, 600);
  }
  return null;
}

function dedupeBy(list, key) {
  const seen = new Set();
  return list.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
