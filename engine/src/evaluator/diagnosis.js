import { readinessLevel } from "./utils.js";

// Correction prompt section 10: "El diagnóstico debe explicar: score, qué
// funciona, gaps, por qué importa, recomendación. No limitarse a mostrar un
// número." This is purely templated from data the dimension modules already
// computed (sub_criteria points vs max) — no LLM, no free-text generation,
// no new judgment calls beyond what the scoring already decided.
const WHY_IT_MATTERS = {
  D1: "Si un agente no puede llegar mecánicamente al contenido, ninguna otra dimensión importa: no hay nada que interpretar.",
  D2: "Sin tokens estructurados y con intención documentada, un agente inventa valores en vez de reutilizar los del sistema.",
  D3: "Sin una API completa por componente, un agente puede pasar props inválidas, ignorar defaults o desconocer estados.",
  D4: "Sin criterios explícitos de selección, un agente elige entre componentes técnicamente válidos sin fundamento — el gap más costoso de los seis.",
  D5: "Sin reglas de composición, un agente arma pantallas por intuición en vez de seguir los patrones del sistema.",
  D6: "Sin documentación recuperable y con ejemplos, un agente carece del contexto mínimo para tomar decisiones informadas.",
  D7: "No evaluado en Fase 1 — requiere conexión a Figma.",
};

export function buildDiagnosis(dimensionResult, findings, levels) {
  const { dimension, score, status, sub_criteria } = dimensionResult;

  if (dimension === "D7") {
    return {
      dimension,
      summary: "D7: no evaluado — requiere conexión a Figma.",
      works: [],
      gaps: [],
      gap_notes: [],
      excluded: [],
      why_it_matters: WHY_IT_MATTERS.D7,
      recommendation: null,
    };
  }

  if (score === null || status === "NOT_EVALUABLE") {
    return {
      dimension,
      summary: `${dimension}: no evaluable — no hubo evidencia/acceso suficiente para determinar un score.`,
      works: [],
      gaps: [],
      gap_notes: [],
      excluded: [],
      why_it_matters: WHY_IT_MATTERS[dimension] || null,
      recommendation: "Asegurar acceso a la fuente antes de re-evaluar esta dimensión.",
    };
  }

  const works = [];
  const gaps = [];
  const excluded = [];
  const gapNotes = [];
  for (const [key, sc] of Object.entries(sub_criteria || {})) {
    if (sc.points === null || sc.points === undefined) {
      excluded.push(key); // NOT_EVALUABLE/NOT_APPLICABLE — deliberately not a gap
    } else if (sc.points >= sc.max) {
      works.push(key);
    } else {
      gaps.push(key);
      // Decision 3: when the sub-criterion itself carries a reframing note (e.g. a
      // D2 category that may legitimately not apply), surface that note instead of
      // just the bare key — same score, honest framing.
      if (sc.note) gapNotes.push(sc.note);
    }
  }

  const level = readinessLevel(Math.round(score), levels);
  const dimensionFindings = findings.filter((f) => f.dimension === dimension);
  const recommendation =
    dimensionFindings.length > 0
      ? dimensionFindings.map((f) => f.recommendation).join(" ")
      : gaps.length > 0
      ? `Priorizar: ${gaps.join(", ")}.`
      : "Sin acciones pendientes para esta dimensión.";

  return {
    dimension,
    summary: `${dimension}: ${Math.round(score)}/100 (${level}). Funciona: ${
      works.join(", ") || "nada evaluado en máximo"
    }. Gaps: ${gaps.join(", ") || "ninguno"}.`,
    works,
    gaps,
    gap_notes: gapNotes,
    excluded,
    why_it_matters: WHY_IT_MATTERS[dimension] || null,
    recommendation,
  };
}
