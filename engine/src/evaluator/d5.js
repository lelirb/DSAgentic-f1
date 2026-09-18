import { safeRatio } from "./utils.js";

// D5 — Patrones y composición (spec section 26). Absence of a specific pattern is
// never automatically penalized (section 26); we only score what IS documented.
export function evaluateD5(input, rules) {
  const cfg = rules.d5_patterns_composition;
  const w = cfg.weights;
  const patterns = input.patterns || [];
  const components = (input.components || []).filter((c) => c.evaluation_status !== "NOT_EVALUABLE");

  if (components.length === 0) {
    return { dimension: "D5", score: null, status: "NOT_EVALUABLE", note: "No components in input.", max: cfg.max };
  }

  const componentsWithComposition = components.filter((c) => (c.composition || []).length > 0);
  const compositionRatio = safeRatio(componentsWithComposition.length, components.length);

  const patternsWithNesting = patterns.filter((p) => p.nesting_rules || p.hierarchy);
  const patternsWithLayout = patterns.filter((p) => p.layout || p.spacing);

  const hasPatterns = patterns.length > 0;

  const sub = {
    reuse_of_existing_components: {
      points: hasPatterns ? w.reuse_of_existing_components : 0,
      max: w.reuse_of_existing_components,
      note: hasPatterns ? null : "No documented patterns to assess reuse against.",
    },
    composition_rules: {
      points: (compositionRatio || 0) * w.composition_rules,
      max: w.composition_rules,
    },
    hierarchy_nesting: {
      points: hasPatterns ? (patternsWithNesting.length / patterns.length) * w.hierarchy_nesting : 0,
      max: w.hierarchy_nesting,
    },
    documented_patterns: {
      points: hasPatterns ? w.documented_patterns : 0,
      max: w.documented_patterns,
    },
    layout_spacing: {
      points: hasPatterns ? (patternsWithLayout.length / patterns.length) * w.layout_spacing : 0,
      max: w.layout_spacing,
    },
  };

  const total = Object.values(sub).reduce((acc, s) => acc + s.points, 0);

  return {
    dimension: "D5",
    score: total,
    status: "EVALUATED",
    sub_criteria: sub,
    max: cfg.max,
    patterns_detected: patterns.length,
  };
}
