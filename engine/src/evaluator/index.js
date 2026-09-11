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

  const d1 = evaluateD1(input, rules);
  const d2 = evaluateD2(input, rules);
  const d3 = evaluateD3(input, rules);
  const d4 = evaluateD4(input, rules);
  const d5 = evaluateD5(input, rules);
  const d6 = evaluateD6(input, rules);
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
  } else if (global.data_sufficiency === "INSUFFICIENT_COVERAGE") {
    limitations.push(
      `No se muestra Global Score: solo se pudo evaluar ${Math.round(
        global.dimension_weight_coverage * 100
      )}% del peso total de las dimensiones (mínimo requerido: ${Math.round(
        (rules.partial_evaluation_threshold ?? 0.5) * 100
      )}%). Ver diagnóstico por dimensión.`
    );
  }

  if ((input.contradictions || []).length > 0) {
    limitations.push(`${input.contradictions.length} contradicción(es) detectada(s) entre fuentes.`);
  }

  return limitations;
}
