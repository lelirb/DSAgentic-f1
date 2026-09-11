// Only parses tokens from JSON that fetched and parsed cleanly — never guesses
// values out of CSS or prose (section 5.5, 44). Each token gets a real evidence
// entry in the corpus (correction prompt section 1) rather than an empty
// evidence_ids array.
export function detectTokens(crawlResult, evidenceCollector) {
  // A .json URL counts even when served as text/plain (e.g. raw.githubusercontent.com
  // serves every file that way). detectAccess() already credited such a URL as
  // structured_tokens = COMPLETE by URL alone, so D1 and D2 disagreed about the same
  // file. JSON.parse below is still the gate: nothing unparseable becomes a token.
  const tokenPages = crawlResult.pages.filter(
    (p) => (/json/.test(p.contentType || "") || /\.json$/i.test(safePathname(p.url))) && /token/i.test(p.url)
  );

  const tokens = [];
  for (const page of tokenPages) {
    let json;
    try {
      json = JSON.parse(page.body);
    } catch {
      continue; // unparseable — skip, do not invent (section 5.5)
    }
    flatten(json, "", tokens, page.url, evidenceCollector, 0);
  }
  return tokens;
}

const ROOT_METADATA_KEYS = new Set(["$schema", "version", "name", "description"]);
// Even with the 5MB response-size cap (fetcher.js), a maliciously nested JSON
// like {"a":{"a":{"a":...}}} could still recurse deep enough to blow the stack
// well before hitting the byte limit — real token files are rarely more than
// 3-4 levels deep, so this is generous headroom, not a functional limit.
const MAX_TOKEN_NESTING_DEPTH = 20;

function flatten(obj, prefix, out, source, evidenceCollector, depth) {
  if (obj === null || typeof obj !== "object") return;
  if (depth > MAX_TOKEN_NESTING_DEPTH) return; // stop silently — do not crash, do not invent
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const isWrappedTokenLeaf = value && typeof value === "object" && ("value" in value || "$value" in value);
    const isPrimitiveLeaf =
      (typeof value === "string" || typeof value === "number") &&
      !(prefix === "" && ROOT_METADATA_KEYS.has(key));

    if (isWrappedTokenLeaf) {
      const resolvedValue = value.value ?? value.$value ?? null;
      const intent = value.description ?? value.$description ?? null;
      pushToken(out, evidenceCollector, source, path, resolvedValue, intent, 1.0);
    } else if (isPrimitiveLeaf) {
      // PRUEBA CONTRA DS REALES (2026-09-05): el formato que Shopify/Polaris
      // documenta como su propia exportación JSON oficial es plano —
      // {"color-blue-lighter": "rgb(235, 245, 250)"} — sin envoltorio {value:...}.
      // La versión anterior de este extractor solo reconocía hojas envueltas y
      // descartaba en silencio TODO archivo de tokens con este formato, produciendo
      // 0 tokens detectados pese a tener 9 tokens reales. Confidence más baja
      // (0.8, no 1.0) porque no hay metadata de tipo/descripción que confirme la
      // interpretación — solo el nombre de la clave y el valor crudo.
      pushToken(out, evidenceCollector, source, path, value, null, 0.8);
    } else if (value && typeof value === "object") {
      flatten(value, path, out, source, evidenceCollector, depth + 1);
    }
  }
}

function pushToken(out, evidenceCollector, source, path, resolvedValue, intent, confidence) {
  const evidenceId = evidenceCollector.add({
    source,
    location: path,
    content: JSON.stringify({ value: resolvedValue, description: intent }),
    type: "token",
    component: null,
    section: path,
    retrieval_method: "json",
    confidence,
  });
  out.push({
    name: path,
    type: guessType(path),
    value: resolvedValue,
    // category (primitive/semantic) is only inferable from actual JSON nesting
    // depth — a flat kebab-case name like "color-blue-lighter" gives no reliable
    // signal either way (hyphen count is NOT a proxy for semantic intent; a
    // primitive palette color can have just as many hyphens as a semantic one).
    // Guessing here would be exactly the "invented evidence" section 5.5 forbids.
    category: path.split(".").length > 2 ? "semantic" : null,
    alias_of: null,
    mode: null,
    intent,
    evidence_ids: [evidenceId],
  });
}

function guessType(path) {
  const lower = path.toLowerCase();
  if (lower.includes("color")) return "color";
  if (lower.includes("space") || lower.includes("spacing") || lower.includes("size")) return "spacing";
  if (lower.includes("font") || lower.includes("type")) return "typography";
  if (lower.includes("radius")) return "radius";
  if (lower.includes("shadow")) return "shadow";
  return "other";
}

function safePathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}
