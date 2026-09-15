import { round5, readinessLevel, clamp } from "./utils.js";

// Section 29-31, 33: global weighted score, global gate, readiness level, partial evaluation.
export function computeGlobalScore(dimensionResults, weightsConfig, rules) {
  const weights = weightsConfig.weights;
  const sumWeights = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sumWeights - 1.0) > 1e-6) {
    throw new Error(`Configured weights must sum to 1.0, got ${sumWeights}`);
  }

  const evaluated = dimensionResults.filter((d) => d.score !== null && d.score !== undefined);
  const notEvaluable = dimensionResults.filter((d) => d.score === null || d.score === undefined);

  // Weighted average is renormalized over only the dimensions we actually have a score
  // for, so a single NOT_EVALUABLE dimension doesn't silently become a 0. The report
  // must still show which dimensions were excluded (section 34).
  let weightedSum = 0;
  let weightSumUsed = 0;
  for (const d of evaluated) {
    const w = weights[d.dimension];
    weightedSum += d.score * w;
    weightSumUsed += w;
  }

  const rawGlobal = weightSumUsed > 0 ? weightedSum / weightSumUsed : null;

  // Global gate (section 31): IF D1 < 25 THEN Global <= 40.
  const d1 = dimensionResults.find((d) => d.dimension === "D1");
  let gateApplied = false;
  let gated = rawGlobal;

  if (d1 && d1.score !== null && d1.score !== undefined) {
    if (d1.score < rules.global_gate.threshold) {
      gateApplied = true;
      gated = rawGlobal === null ? null : Math.min(rawGlobal, rules.global_gate.cap);
    }
  }
  // If D1 itself is NOT_EVALUABLE: METHODOLOGY DECISION REQUIRED per spec ambiguity —
  // we do NOT apply the gate silently and we do NOT skip flagging it (see README).
  const gateUndetermined = !d1 || d1.score === null || d1.score === undefined;

  // Decision 1 (METHODOLOGY_DECISIONS.md #1): a numeric Global Score always reads as
  // more trustworthy than it is, even with a caveat attached. If D1 — the
  // precondition dimension — could not be determined at all, we don't hand back a
  // number; we say plainly that there isn't enough data to score this DS.
  //
  // Decision 2 (#2): renormalizing the weighted average over whatever dimensions
  // WERE evaluated is correct in principle, but doing that over e.g. 2 of 6
  // dimensions and presenting "Global Score: 72" is false precision. We tie this to
  // the same partial_evaluation_threshold already used for coverage (0.5 by
  // default): below that fraction of total weight actually evaluated, we withhold
  // the single number and let the per-dimension breakdown speak for itself.
  const coverageThreshold = rules.partial_evaluation_threshold ?? 0.5;
  const insufficientCoverage = !gateUndetermined && weightSumUsed < coverageThreshold;

  let dataSufficiency = "SUFFICIENT";
  if (gateUndetermined) dataSufficiency = "INSUFFICIENT_D1";
  else if (insufficientCoverage) dataSufficiency = "INSUFFICIENT_COVERAGE";

  const canDisplayScore = dataSufficiency === "SUFFICIENT";
  const displayScore = canDisplayScore && gated !== null ? round5(clamp(gated, 0, 100)) : null;

  return {
    // Kept for transparency/debugging even when withheld from the "official" score —
    // never surfaced to end users as THE score when data_sufficiency !== SUFFICIENT.
    global_score_raw: rawGlobal,
    global_score: displayScore,
    data_sufficiency: dataSufficiency,
    dimension_weight_coverage: weightSumUsed,
    readiness_level: displayScore === null ? null : readinessLevel(displayScore, rules.readiness_levels),
    gate: {
      applied: gateApplied,
      undetermined: gateUndetermined,
      rule: "IF D1 < 25 THEN Global <= 40",
      methodology_decision_required: gateUndetermined
        ? "D1 is NOT_EVALUABLE — resolved per METHODOLOGY_DECISIONS.md #1: no numeric Global Score is shown."
        : null,
    },
    dimensions_evaluated: evaluated.map((d) => d.dimension),
    dimensions_not_evaluable: notEvaluable.map((d) => d.dimension),
  };
}

// Section 32-33: coverage & partial-evaluation status.
export function computeCoverageStatus(input, partialThreshold) {
  const coverage = input.coverage || {};
  const detected = coverage.components_detected ?? (input.components || []).length;
  const evaluated = coverage.components_evaluated ?? (input.components || []).length;

  const ratio = detected > 0 ? evaluated / detected : null;
  const belowThreshold = ratio !== null && ratio < partialThreshold;

  let status = coverage.evaluation_status || "COMPLETE";
  if (coverage.crawl_limited) status = "LIMITED";
  if (belowThreshold) status = "PARTIAL";

  return {
    components_detected: detected,
    components_evaluated: evaluated,
    // Correction prompt section 7: minimum required explicit denominators — these
    // were being computed by normalize() but silently dropped before reaching the
    // report. Passed through as-received; null (not 0) when the input never set them.
    documented_components: coverage.documented_components ?? null,
    components_with_examples: coverage.components_with_examples ?? null,
    tokens_detected: coverage.tokens_detected ?? (Array.isArray(input.tokens) ? input.tokens.length : null),
    evaluation_coverage: ratio,
    evaluation_status: status,
    pages_found: coverage.pages_found ?? null,
    pages_retrieved: coverage.pages_retrieved ?? null,
    pages_failed: coverage.pages_failed ?? null,
  };
}
