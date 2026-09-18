import { bandPoints } from "./utils.js";

// D1 — Acceso mecánico (spec section 22). Entirely deterministic, reads input.access.
export function evaluateD1(input, rules) {
  const cfg = rules.d1_access;
  const access = input.access || {};
  const sub = {};
  const missing = [];

  const fields = [
    ["documentation_recoverability", "documentation_recoverability"],
    ["component_index", "component_index"],
    ["props_types_accessibility", "props_types_accessibility"],
    ["structured_tokens", "structured_tokens"],
    ["types_or_schema", "types_or_schema"],
    ["agent_manifest", "agent_manifest"],
    ["agent_interface", "agent_interface"],
  ];

  let total = 0;
  let maxEvaluable = 0;

  for (const [key, accessKey] of fields) {
    const table = cfg[key];
    const value = access[accessKey];
    const points = bandPoints(table, value);
    if (points === null) {
      missing.push(key);
      sub[key] = { status: "NOT_EVALUABLE", points: null, max: table.max };
    } else {
      total += points;
      maxEvaluable += table.max;
      sub[key] = { status: "FOUND", points, max: table.max };
    }
  }

  const fullyEvaluated = missing.length === 0;
  // ASSUMPTION (documented in README "known gaps"): when some D1 sub-criteria are
  // NOT_EVALUABLE, we scale the score over what WAS evaluable rather than returning
  // null, so the global gate (section 31) still has a number to compare against.
  // This is the simplest option that avoids inventing evidence, but it is itself
  // adjacent to a METHODOLOGY DECISION REQUIRED — see README.
  const scaledScore = maxEvaluable > 0 ? (total / maxEvaluable) * cfg.max : null;

  return {
    dimension: "D1",
    score: fullyEvaluated ? total : scaledScore,
    status: fullyEvaluated ? "EVALUATED" : "PARTIAL",
    missing_inputs: missing,
    sub_criteria: sub,
    max: cfg.max,
  };
}
