// Búsqueda de bloques <tag ...>contenido</tag> en tiempo lineal.
//
// Por qué existe: las expresiones del tipo /<p[^>]*>([\s\S]*?)<\/p>/ tienen
// tiempo cuadrático cuando la página trae muchas etiquetas de apertura sin su
// cierre: cada <p> vuelve a recorrer el documento entero buscando un </p> que no
// existe. Con una sola página hostil de ~300 KB el servidor quedaba bloqueado
// unos 10 s (medido), y como Node atiende todo en un solo hilo, nadie más podía
// usar la app mientras tanto.
//
// Este recorrido es equivalente para HTML normal (bloques no solapados, de
// izquierda a derecha, hasta el primer cierre) pero:
//   - si una etiqueta no tiene cierre en el resto del documento, lo averigua UNA
//     vez y deja de buscarla;
//   - si ya no queda ningún ">" en el documento, termina.

const closeCache = new Map();
function closeRegex(tag) {
  let re = closeCache.get(tag);
  if (!re) {
    re = new RegExp(`<\\/${tag}\\s*>`, "gi");
    closeCache.set(tag, re);
  }
  return re;
}

// `names` es una alternativa de nombres de etiqueta en sintaxis de expresión
// regular: "p", "p|li", "h[1-4]", "t[hd]". Devuelve, en orden:
//   { tag, attrs, inner, start, innerStart, end }
export function findBlocks(html, names, max = Infinity) {
  const s = String(html ?? "");
  const openRe = new RegExp(`<(${names})(?=[\\s/>])`, "gi");
  const out = [];
  const withoutClose = new Set();
  let gt = -1;
  let pos = 0;
  while (out.length < max) {
    openRe.lastIndex = pos;
    const m = openRe.exec(s);
    if (!m) break;
    const tag = m[1].toLowerCase();
    const afterName = m.index + m[0].length;
    pos = afterName;
    if (withoutClose.has(tag)) continue;
    if (gt < afterName) {
      gt = s.indexOf(">", afterName);
      if (gt === -1) break;
    }
    const innerStart = gt + 1;
    const closeRe = closeRegex(tag);
    closeRe.lastIndex = innerStart;
    const c = closeRe.exec(s);
    if (!c) {
      withoutClose.add(tag);
      continue;
    }
    const end = c.index + c[0].length;
    out.push({ tag, attrs: s.slice(afterName, gt), inner: s.slice(innerStart, c.index), start: m.index, innerStart, end });
    pos = end;
  }
  return out;
}

// Quita los bloques de esas etiquetas (con su contenido) y deja un espacio.
export function removeBlocks(html, names) {
  const s = String(html ?? "");
  const found = findBlocks(s, names);
  if (!found.length) return s;
  let out = "";
  let last = 0;
  for (const b of found) {
    out += s.slice(last, b.start) + " ";
    last = b.end;
  }
  return out + s.slice(last);
}
