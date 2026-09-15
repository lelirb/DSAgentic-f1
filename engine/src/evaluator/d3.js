import { safeRatio, pctPoints } from "./utils.js";

// D3 — Componentes y API (spec section 24).
export function evaluateD3(input, rules) {
  const cfg = rules.d3_components_api;
  const w = cfg.weights;
  const components = input.components || [];

  if (components.length === 0) {
    return { dimension: "D3", score: null, status: "NOT_EVALUABLE", note: "No components in input.", max: cfg.max };
  }

  // Decision 4 (METHODOLOGY_DECISIONS.md #4): a component the extractor detected
  // but could not actually inspect (evaluation_status: "NOT_EVALUABLE") is excluded
  // from coverage denominators — same principle already applied to NOT_APPLICABLE
  // states. "Detected but unreachable" must not count against "detected, reachable,
  // and found undocumented".
  const evaluableComponents = components.filter((c) => c.evaluation_status !== "NOT_EVALUABLE");

  if (evaluableComponents.length === 0) {
    return {
      dimension: "D3",
      score: null,
      status: "NOT_EVALUABLE",
      note: "All detected components are marked evaluation_status=NOT_EVALUABLE.",
      max: cfg.max,
      coverage: { components_detected: components.length, components_scored: 0 },
    };
  }

  const withProps = evaluableComponents.filter((c) => (c.props || []).length > 0);
  const propsRatio = safeRatio(withProps.length, evaluableComponents.length);
  const propsDocumentedPoints =
    propsRatio === null ? null : pctPoints(cfg.props_documented_coverage, propsRatio);

  const allProps = evaluableComponents.flatMap((c) => c.props || []);
  const propsWithType = allProps.filter((p) => p.type);
  const propsWithAllowedValues = allProps.filter((p) => Array.isArray(p.allowed_values) && p.allowed_values.length > 0);
  const propsWithDefault = allProps.filter((p) => p.default !== undefined && p.default !== null);
  const propsWithDescription = allProps.filter((p) => p.description);

  const componentsWithVariants = evaluableComponents.filter((c) => (c.variants || []).length > 0);

  // Section 24/16: a states array is only evidence if individual entries carry a
  // real status. NOT_APPLICABLE/NOT_EVALUABLE states are excluded from both
  // numerator and denominator — they must never inflate OR deflate this score.
  let statesFoundTotal = 0;
  let statesEvaluableTotal = 0;
  for (const c of evaluableComponents) {
    for (const s of c.states || []) {
      if (s.status === "FOUND") {
        statesFoundTotal += 1;
        statesEvaluableTotal += 1;
      } else if (s.status === "NOT_FOUND") {
        statesEvaluableTotal += 1;
      }
      // NOT_APPLICABLE / NOT_EVALUABLE / missing status: excluded entirely.
    }
  }
  const statesRatio = safeRatio(statesFoundTotal, statesEvaluableTotal);

  const typesRatio = safeRatio(propsWithType.length, allProps.length);
  const allowedValuesRatio = safeRatio(propsWithAllowedValues.length, allProps.length);
  const defaultsRatio = safeRatio(propsWithDefault.length, allProps.length);
  const variantsRatio = safeRatio(componentsWithVariants.length, evaluableComponents.length);
  const purposeRatio = safeRatio(propsWithDescription.length, allProps.length);

  const apiConsistency = estimateApiConsistency(evaluableComponents);

  const sub = {
    props_documented: { points: propsDocumentedPoints, max: w.props_documented },
    types: { points: ratioToPoints(typesRatio, w.types), max: w.types },
    allowed_values: { points: ratioToPoints(allowedValuesRatio, w.allowed_values), max: w.allowed_values },
    defaults: { points: ratioToPoints(defaultsRatio, w.defaults), max: w.defaults },
    variants: { points: ratioToPoints(variantsRatio, w.variants), max: w.variants },
    states: { points: ratioToPoints(statesRatio, w.states), max: w.states },
    api_consistency: { points: apiConsistency * w.api_consistency, max: w.api_consistency },
    prop_purpose: { points: ratioToPoints(purposeRatio, w.prop_purpose), max: w.prop_purpose },
  };

  const evaluableSub = Object.values(sub).filter((s) => s.points !== null);
  const notEvaluableKeys = Object.entries(sub)
    .filter(([, s]) => s.points === null)
    .map(([k]) => k);

  const total = evaluableSub.reduce((acc, s) => acc + s.points, 0);
  const maxEvaluable = evaluableSub.reduce((acc, s) => acc + s.max, 0);
  const scaled = maxEvaluable > 0 ? (total / maxEvaluable) * cfg.max : null;

  return {
    dimension: "D3",
    score: scaled,
    status: notEvaluableKeys.length === 0 ? "EVALUATED" : "PARTIAL",
    missing_inputs: notEvaluableKeys,
    sub_criteria: sub,
    max: cfg.max,
    coverage: {
      // Decision 4: both numbers shown — total detected vs. what actually fed the
      // score — rather than picking one and hiding the other.
      components_detected: components.length,
      components_scored: evaluableComponents.length,
      components_with_props: withProps.length,
    },
  };
}

function ratioToPoints(ratio, max) {
  if (ratio === null) return null;
  return ratio * max;
}

function estimateApiConsistency(components) {
  // Heuristic, deterministic: do similarly-purposed prop names repeat consistently
  // across components (e.g. "variant" used the same way rather than "type"/"kind" mixed)?
  const propNameCounts = {};
  for (const c of components) {
    for (const p of c.props || []) {
      propNameCounts[p.name] = (propNameCounts[p.name] || 0) + 1;
    }
  }
  const totalPropUses = Object.values(propNameCounts).reduce((a, b) => a + b, 0);
  if (totalPropUses === 0) return 0;
  const repeatedUses = Object.values(propNameCounts)
    .filter((count) => count > 1)
    .reduce((a, b) => a + b, 0);
  return repeatedUses / totalPropUses;
}
