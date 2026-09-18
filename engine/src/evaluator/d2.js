import { safeRatio } from "./utils.js";

// D2 — Foundations / Tokens (spec section 23, 34).
// Rule: if tokens are NOT_FOUND (explicitly absent, not just unreachable), D2 = 0.
// Rule: if tokens NOT_EVALUABLE (couldn't access), whole dimension is NOT_EVALUABLE, not 0.
export function evaluateD2(input, rules) {
  const cfg = rules.d2_foundations;
  const tokens = input.tokens || [];
  const tokenStatus = input.metadata?.tokens_status; // "FOUND" | "NOT_FOUND" | "NOT_EVALUABLE" (explicit signal expected from extractor)

  if (tokenStatus === "NOT_FOUND" || (tokenStatus === undefined && tokens.length === 0)) {
    return {
      dimension: "D2",
      score: 0,
      status: "EVALUATED",
      note: "No tokens found — forced to 0 per spec section 23/34 (no partial credit for well-written CSS without structured tokens).",
      max: cfg.max,
    };
  }

  if (tokenStatus === "NOT_EVALUABLE") {
    return {
      dimension: "D2",
      score: null,
      status: "NOT_EVALUABLE",
      note: "Token section could not be accessed/inspected.",
      max: cfg.max,
    };
  }

  const w = cfg.weights;
  const semantic = tokens.filter((t) => t.category === "semantic");
  const primitive = tokens.filter((t) => t.category === "primitive");
  const aliased = semantic.filter((t) => t.alias_of);
  const withIntent = tokens.filter((t) => t.intent);
  const withMode = tokens.filter((t) => t.mode);

  const colorTokens = tokens.filter((t) => t.type === "color");
  const spacingTokens = tokens.filter((t) => t.type === "spacing" || t.type === "sizing");
  const typographyTokens = tokens.filter((t) => t.type === "typography");
  const otherTokens = tokens.filter((t) =>
    ["radius", "shadow", "border", "motion", "opacity", "z-index"].includes(t.type)
  );

  const namingConsistent = checkNamingConsistency(tokens);

  const sub = {
    tokens_identifiable: { points: tokens.length > 0 ? w.tokens_identifiable : 0, max: w.tokens_identifiable },
    structured_format: {
      // Formato estructurado solo si algún token vino de un archivo (JSON), no
      // únicamente de tablas en páginas web.
      points: tokens.some((t) => t.origin !== "html_table") ? w.structured_format : 0,
      max: w.structured_format,
    },
    naming_consistency: {
      points: namingConsistent ? w.naming_consistency : w.naming_consistency * 0.5,
      max: w.naming_consistency,
    },
    primitive_to_semantic: {
      points:
        primitive.length > 0 && aliased.length > 0
          ? w.primitive_to_semantic
          : semantic.length > 0
          ? w.primitive_to_semantic * 0.5
          : 0,
      max: w.primitive_to_semantic,
    },
    color_coverage: { points: colorTokens.length > 0 ? w.color_coverage : 0, max: w.color_coverage },
    spacing_sizing_coverage: {
      points: spacingTokens.length > 0 ? w.spacing_sizing_coverage : 0,
      max: w.spacing_sizing_coverage,
    },
    typography: { points: typographyTokens.length > 0 ? w.typography : 0, max: w.typography },
    other_foundations: {
      points: otherTokens.length > 0 ? w.other_foundations : 0,
      max: w.other_foundations,
      // Decision 3 (METHODOLOGY_DECISIONS.md #3): the CALCULATION stays "absence = 0"
      // — we're not changing the score — but the framing shown to a human must not
      // read as an accusation when the category may genuinely not apply (radius,
      // shadow, border, motion, opacity, z-index are not universal needs).
      note:
        otherTokens.length === 0
          ? "No se detectaron tokens de radius/shadow/border/motion/opacity/z-index. Si tu Design System no usa estas categorías, este punto no aplica realmente — puedes ignorarlo con confianza."
          : null,
    },
    modes: {
      points: withMode.length > 0 ? w.modes : 0,
      max: w.modes,
      note:
        withMode.length === 0
          ? "No se detectaron modos (light/dark/densidad). Si tu Design System es de un solo modo por diseño, este punto no aplica — no es necesariamente un defecto."
          : null,
    },
    intent_documentation: {
      points: (safeRatio(withIntent.length, tokens.length) || 0) * w.intent_documentation,
      max: w.intent_documentation,
    },
  };

  const total = Object.values(sub).reduce((acc, s) => acc + (s.points || 0), 0);

  return {
    dimension: "D2",
    score: total,
    status: "EVALUATED",
    sub_criteria: sub,
    max: cfg.max,
  };
}

function checkNamingConsistency(tokens) {
  if (tokens.length < 2) return true;
  const dotted = tokens.filter((t) => t.name.includes(".")).length;
  const ratio = dotted / tokens.length;
  return ratio > 0.8 || ratio < 0.2; // mostly one convention or the other = consistent enough
}
