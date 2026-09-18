import { evaluateD1 } from "./d1.js";
import { evaluateD2 } from "./d2.js";
import { evaluateD3 } from "./d3.js";
import { evaluateD4 } from "./d4.js";
import { evaluateD5 } from "./d5.js";
import { evaluateD6 } from "./d6.js";
import { computeGlobalScore, computeCoverageStatus } from "./scoring.js";
import { generateFindings } from "./findings.js";
import { buildDiagnosis } from "./diagnosis.js";

// Section 46: engine output contract.
export function evaluate(input, { weights, rules }) {
  validateBasicShape(input);

  // Etapa 2: cada criterio queda Encontrado / En parte / No encontrado / No existe /
  // No evaluable / No aplica. Lo no evaluable queda FUERA de la nota.
  const criteria = (input.metadata && input.metadata.criteria) || {};
  const d1 = finalizeDimension(evaluateD1(input, rules), criteria);
  const d2 = finalizeDimension(evaluateD2(input, rules), criteria);
  const d3 = finalizeDimension(evaluateD3(input, rules), criteria);
  const d4 = finalizeDimension(evaluateD4(input, rules), criteria);
  const d5 = finalizeDimension(evaluateD5(input, rules), criteria);
  const d6 = finalizeDimension(evaluateD6(input, rules), criteria);
  const d7 = {
    dimension: "D7",
    score: null,
    status: rules.d7_design_code_consistency.status,
    note: rules.d7_design_code_consistency.message,
  };

  const dimensionResults = [d1, d2, d3, d4, d5, d6];

  const global = computeGlobalScore(dimensionResults, weights, rules);
  const coverage = computeCoverageStatus(input, rules.partial_evaluation_threshold);
  const findings = generateFindings(input, dimensionResults);

  const limitations = buildLimitations(input, coverage, dimensionResults, global, rules);

  // Correction prompt section 10: diagnosis must explain score + what works +
  // gaps + why it matters + recommendation, not just a number.
  const diagnosis = {
    D1: buildDiagnosis(d1, findings, rules.readiness_levels),
    D2: buildDiagnosis(d2, findings, rules.readiness_levels),
    D3: buildDiagnosis(d3, findings, rules.readiness_levels),
    D4: buildDiagnosis(d4, findings, rules.readiness_levels),
    D5: buildDiagnosis(d5, findings, rules.readiness_levels),
    D6: buildDiagnosis(d6, findings, rules.readiness_levels),
    D7: buildDiagnosis(d7, findings, rules.readiness_levels),
  };

  return {
    schema_version: input.schema_version || "0.1",
    methodology_version: weights.methodology_version,
    rules_version: rules.rules_version,

    system: input.system,

    overview: {
      global_score: global.global_score,
      global_score_raw: global.global_score_raw,
      data_sufficiency: global.data_sufficiency,
      dimension_weight_coverage: global.dimension_weight_coverage,
      evaluable_share: global.evaluable_share,
      readiness_level: global.readiness_level,
      evaluation_status: coverage.evaluation_status,
      coverage: coverage,
    },

    gate: global.gate,

    dimensions: {
      D1: d1,
      D2: d2,
      D3: d3,
      D4: d4,
      D5: d5,
      D6: d6,
      D7: d7,
    },

    findings,
    recommendations: findings.map((f) => f.recommendation).filter(Boolean),
    diagnosis,
    limitations,
  };
}

export function finalizeDimension(d, criteria = {}) {
  const subs = d.sub_criteria;
  if (!subs) {
    d.evaluable_share = d.score === null || d.score === undefined ? 0 : 1;
    return d;
  }
  let sumAll = 0, sumEval = 0, points = 0;
  const missing = [];
  for (const [k, sc] of Object.entries(subs)) {
    const o = criteria[`${d.dimension}.${k}`];
    sumAll += sc.max;
    if (o && o.status === "NOT_EVALUABLE") {
      sc.points = null;
      sc.status = "NOT_EVALUABLE";
      sc.reason = o.reason || null;
    } else if (sc.points === null || sc.points === undefined) {
      sc.points = null;
      sc.status = sc.applicable === false ? "NOT_APPLICABLE" : "NOT_EVALUABLE";
      sc.reason = sc.reason || (sc.applicable === false ? "NOT_APPLICABLE" : "NO_BASIS");
    } else if (sc.points >= sc.max - 1e-9) {
      sc.status = "FOUND";
    } else if (sc.points > 0) {
      sc.status = "PARTIAL";
    } else {
      sc.status = o && o.status === "ABSENT" ? "ABSENT" : "NOT_FOUND";
      if (o && o.reason) sc.reason = o.reason;
    }
    if (sc.points === null) {
      if (sc.status === "NOT_EVALUABLE") missing.push(k);
      continue;
    }
    sumEval += sc.max;
    points += sc.points;
  }
  d.evaluable_share = sumAll > 0 ? sumEval / sumAll : 0;
  if (sumEval === 0) {
    d.score = null;
    d.status = "NOT_EVALUABLE";
  } else {
    d.score = (points / sumEval) * (d.max || 100);
    d.status = missing.length ? "PARTIAL" : "EVALUATED";
  }
  d.missing_inputs = missing;
  return d;
}

function validateBasicShape(input) {
  if (!input || typeof input !== "object") throw new Error("Invalid input: not an object");
  if (!input.system?.url) throw new Error("Invalid input: system.url is required");
  if (!Array.isArray(input.evidence)) throw new Error("Invalid input: evidence must be an array");
  if (!Array.isArray(input.components)) throw new Error("Invalid input: components must be an array");
  if (!Array.isArray(input.tokens)) throw new Error("Invalid input: tokens must be an array");
}

function buildLimitations(input, coverage, dimensionResults, global, rules) {
  const limitations = [];

  if (coverage.evaluation_status === "PARTIAL") {
    limitations.push(
      "Evaluación parcial: la evidencia recuperada cubre menos del 50% del sistema detectado."
    );
  }
  if (coverage.evaluation_status === "LIMITED") {
    limitations.push("El crawler alcanzó un límite técnico (max_pages/max_depth/timeout) antes de completar el análisis.");
  }
  if (coverage.pages_failed) {
    limitations.push(`${coverage.pages_failed} página(s) no pudieron recuperarse.`);
  }

  for (const d of dimensionResults) {
    if (d.status === "PARTIAL" || d.status === "NOT_EVALUABLE") {
      limitations.push(
        `${d.dimension}: ${d.status === "NOT_EVALUABLE" ? "no evaluable" : "parcialmente evaluado"}${
          d.missing_inputs ? ` (falta: ${d.missing_inputs.join(", ")})` : ""
        }.`
      );
    }
  }

  limitations.push("D7 (Consistencia Design–Code) no evaluado — requiere conexión a Figma.");

  if (global.gate.methodology_decision_required) {
    limitations.push(`METHODOLOGY_DECISION_REQUIRED: ${global.gate.methodology_decision_required}`);
  }
  if (global.data_sufficiency === "INSUFFICIENT_D1") {
    limitations.push(
      "No se muestra Global Score: D1 (acceso mecánico) no pudo determinarse. Ver diagnóstico por dimensión."
    );
  } else if (global.data_sufficiency === "LOW_COVERAGE") {
    limitations.push(
      `No se asigna nivel: solo se pudo revisar el ${Math.round(
        global.evaluable_share * 100
      )}% de lo que compone la nota (mínimo para asignar nivel: ${Math.round(
        (rules.partial_evaluation_threshold ?? 0.5) * 100
      )}%).`
    );
  }

  if ((input.contradictions || []).length > 0) {
    limitations.push(`${input.contradictions.length} contradicción(es) detectada(s) entre fuentes.`);
  }

  return limitations;
}
