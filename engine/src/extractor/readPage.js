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
      // El texto de los botones ("Copiar", "Copy alias name") no es contenido de la celda.
      const cells = findBlocks(r.inner, "t[hd]").map((c) => ({ th: c.tag === "th", text: stripTags(removeBlocks(c.inner, "button")) }));
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
const H_TOKEN = /^(token|tokens|token name|nombre del token|name|nombre|variable|css variable|scss|sass|(alias|design|global|semantic|sem[aá]ntico|color|css|scss|sass) tokens?|tokens? (alias|global|sem[aá]ntico))$/i;
// "Hex value" (Carbon), "rem" / "px" (escalas), "Light" / "Dark" (un valor por tema).
const H_VALUE = /^(values?|valor(es)?|hex|rgba?|hsl|rem|px|pt|dp|sp|em|ms|resolved value|valor resuelto|(hex|rgba?|hsl|color|css|scss|raw|computed|resolved|light|dark|claro|oscuro)[ -](values?|valor(es)?|code|c[oó]digo)|(valor(es)?|c[oó]digo) (hex|rgba?|css|claro|oscuro)|light|dark|claro|oscuro)$/i;

// Para qué sirve el token: "Description", o "Role" / "Usage" (Carbon: Token | Role | Value).
const H_TOKEN_DESC = /^(description|descripci[oó]n|details|detalles|purpose|prop[oó]sito|role|rol|usage|use|uso|applied to|se aplica a)$/i;

// Un token tiene un nombre de máquina. Tres formas vistas en sistemas reales:
//   $background, --color-bg, @spacing        (con prefijo; puede ser una sola palabra)
//   color-blue-10, color.text.primary        (con guiones o puntos)
//   colorNeutralBackground1                  (camelCase: Fluent 2)
export function isTokenName(name) {
  const n = String(name || "");
  if (n.length < 2 || n.length > 80) return false;
  return (
    /^(\$|--|@)[A-Za-z][\w-]*([.-][\w-]+)*$/.test(n) ||
    /^[A-Za-z][\w-]*([.-][\w-]+)+$/.test(n) ||
    /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(n)
  );
}

// Tablas "agrupadas": una fila con solo el nombre del token y, debajo, otra fila
// con sus valores (Fluent 2: nombre, y debajo Rest / Hover / Pressed con el valor
// claro y oscuro). No hay una columna "valor" que buscar por encabezado.
function groupedTokenRows(t) {
  if (!/token/i.test(t.headers.join(" "))) return [];
  const filled = (row) => (row || []).map((c) => String(c || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < t.rows.length; i++) {
    const cells = filled(t.rows[i]);
    if (cells.length !== 1 || !isTokenName(cells[0])) continue;
    const next = filled(t.rows[i + 1]);
    if (!next.length || (next.length === 1 && isTokenName(next[0]))) continue; // sin valor a la vista: no se inventa
    out.push({ name: cells[0], value: next.join(" ").slice(0, 200), description: null });
  }
  return out;
}

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
    if (col(t.headers, H_TYPE) >= 0 && col(t.headers, H_DEFAULT) >= 0) continue; // tabla de propiedades
    const iTok = col(t.headers, H_TOKEN);
    const iVal = t.headers.findIndex((h, i) => i !== iTok && H_VALUE.test(h));
    if (iTok < 0 || iVal < 0) {
      tokens.push(...groupedTokenRows(t));
      continue;
    }
    for (const row of t.rows) {
      const name = (row[iTok] || "").trim().split(/\s+/)[0];
      const value = (row[iVal] || "").replace(/\s+/g, " ").trim();
      if (!isTokenName(name) || !value) continue;
      const iDesc = t.headers.findIndex((h, i) => i !== iTok && i !== iVal && H_TOKEN_DESC.test(h));
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
