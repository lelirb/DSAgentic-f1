import { safeRatio } from "./utils.js";

// D4 — Claridad semántica (spec section 25). Fase 1 only measures documentary/structural
// evidence of purpose, selection criteria, disambiguation and restrictions. It does NOT
// run Agent Tasks — that is Fase 2 (explicitly out of scope here, spec section 3/25).
export function evaluateD4(input, rules) {
  const cfg = rules.d4_semantic_clarity;
  const w = cfg.weights;
  // Componentes que no se pudieron leer no cuentan ni a favor ni en contra.
  const components = (input.components || []).filter((c) => c.evaluation_status !== "NOT_EVALUABLE");

  if (components.length === 0) {
    return { dimension: "D4", score: null, status: "NOT_EVALUABLE", note: "No components in input.", max: cfg.max };
  }

  const withPurpose = components.filter((c) => c.usage?.purpose);
  const withWhenToUse = components.filter((c) => c.usage?.when_to_use);
  const withWhenNotToUse = components.filter((c) => c.usage?.when_not_to_use);
  const withCompeting = components.filter((c) => (c.usage?.competing_components || []).length > 0);
  const withDisambiguation = components.filter((c) => (c.usage?.disambiguation_rules || []).length > 0);
  const withRestrictions = components.filter((c) => (c.usage?.restrictions || []).length > 0);

  const purposeRatio = safeRatio(withPurpose.length, components.length);
  const selectionRatio = safeRatio(withWhenToUse.length, components.length);

  // Disambiguation only applies to components that actually have competing siblings —
  // components with no competitors are NOT_APPLICABLE for this sub-criterion, not penalized.
  const competingCount = withCompeting.length;
  const disambiguationRatio =
    competingCount > 0 ? safeRatio(withDisambiguation.length, competingCount) : null;

  const restrictionsRatio = safeRatio(withRestrictions.length, components.length);
  const justificationRatio = safeRatio(withWhenNotToUse.length, components.length);

  const sub = {
    purpose_identification: { points: pts(purposeRatio, w.purpose_identification), max: w.purpose_identification },
    component_selection: { points: pts(selectionRatio, w.component_selection), max: w.component_selection },
    disambiguation: {
      // Sin componentes que compitan, el criterio NO APLICA: queda fuera de la nota
      // (antes sumaba los 20 puntos completos sin evidencia).
      points: disambiguationRatio === null ? null : disambiguationRatio * w.disambiguation,
      max: w.disambiguation,
      applicable: competingCount > 0,
      note: competingCount === 0 ? "NOT_APPLICABLE: no competing/similar components detected" : null,
    },
    restrictions: { points: pts(restrictionsRatio, w.restrictions), max: w.restrictions },
    justification: { points: pts(justificationRatio, w.justification), max: w.justification },
  };

  const total = Object.values(sub).reduce((acc, s) => acc + (s.points || 0), 0);

  return {
    dimension: "D4",
    score: total,
    status: "EVALUATED",
    agent_tested: false,
    note: "Fase 1: structural/documentary evidence only. Agent Task execution is Fase 2.",
    sub_criteria: sub,
    max: cfg.max,
    competing_pairs_detected: competingCount,
  };
}

function pts(ratio, max) {
  return ratio === null ? 0 : ratio * max;
}
