import { safeRatio, pctPoints } from "./utils.js";

// D6 — Documentación (spec section 27).
export function evaluateD6(input, rules) {
  const cfg = rules.d6_documentation;
  const w = cfg.weights;
  const components = input.components || [];
  const doc = input.documentation || {};

  if (components.length === 0) {
    return { dimension: "D6", score: null, status: "NOT_EVALUABLE", note: "No components in input.", max: cfg.max };
  }

  // Decision 4 (METHODOLOGY_DECISIONS.md #4): same principle as D3 — a component
  // detected but never actually inspected (evaluation_status: "NOT_EVALUABLE")
  // doesn't count against documentation coverage. It's neither "documented" nor
  // legitimately "undocumented"; it's simply unknown, and the denominator should
  // reflect that.
  const evaluableComponents = components.filter((c) => c.evaluation_status !== "NOT_EVALUABLE");

  if (evaluableComponents.length === 0) {
    return {
      dimension: "D6",
      score: null,
      status: "NOT_EVALUABLE",
      note: "All detected components are marked evaluation_status=NOT_EVALUABLE.",
      max: cfg.max,
      coverage: { components_detected: components.length, components_scored: 0 },
    };
  }

  const total = evaluableComponents.length;
  const coverageRatio = safeRatio(doc.components_documented ?? 0, total);
  const codeExRatio = safeRatio(doc.components_with_code_examples ?? 0, total);
  const execExRatio = safeRatio(doc.components_with_executable_examples ?? 0, total);
  const variantsStatesRatio = safeRatio(doc.components_with_variants_states_explained ?? 0, total);

  const componentsWithA11y = evaluableComponents.filter((c) => c.accessibility);
  const a11yRatio = safeRatio(componentsWithA11y.length, total);

  const sub = {
    component_coverage: {
      points: coverageRatio === null ? null : pctPoints(cfg.component_coverage_pct, coverageRatio),
      max: w.component_coverage,
    },
    code_examples: {
      points: codeExRatio === null ? null : pctPoints(cfg.code_examples_pct, codeExRatio),
      max: w.code_examples,
    },
    executable_examples: {
      points: execExRatio === null ? null : pctPoints(cfg.executable_examples_pct, execExRatio),
      max: w.executable_examples,
    },
    variants_states_explained: {
      points: variantsStatesRatio === null ? 0 : variantsStatesRatio * w.variants_states_explained,
      max: w.variants_states_explained,
    },
    accessibility: {
      points: a11yRatio === null ? 0 : a11yRatio * w.accessibility,
      max: w.accessibility,
    },
    versioning: {
      points: doc.versioning_present ? w.versioning : 0,
      max: w.versioning,
    },
  };

  const evaluableSub = Object.values(sub).filter((s) => s.points !== null);
  const missing = Object.entries(sub)
    .filter(([, s]) => s.points === null)
    .map(([k]) => k);

  const sumPoints = evaluableSub.reduce((acc, s) => acc + s.points, 0);
  const maxEvaluable = evaluableSub.reduce((acc, s) => acc + s.max, 0);
  const scaled = maxEvaluable > 0 ? (sumPoints / maxEvaluable) * cfg.max : null;

  return {
    dimension: "D6",
    score: scaled,
    status: missing.length === 0 ? "EVALUATED" : "PARTIAL",
    missing_inputs: missing,
    sub_criteria: sub,
    max: cfg.max,
    coverage: {
      components_detected: components.length,
      components_scored: evaluableComponents.length,
    },
  };
}
