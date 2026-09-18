// Section 35: findings must cite concrete evidence, never generic statements
// like "falta claridad semántica en el sistema" (spec, "reporte de hallazgo").

export function generateFindings(input, dimensionResults) {
  const findings = [];

  // D2: no structured tokens at all.
  const d2 = dimensionResults.find((d) => d.dimension === "D2");
  if (d2 && d2.score === 0 && d2.note?.includes("No tokens found")) {
    findings.push({
      dimension: "D2",
      severity: "CRITICAL",
      component: null,
      status: "NOT_FOUND",
      evidence: [],
      finding: "No se detectaron tokens estructurados en el Design System.",
      impact: "Un agente no puede seleccionar valores fundacionales (color, spacing, tipografía) sin inventarlos.",
      recommendation: "Exportar tokens en un formato estructurado (idealmente W3C DTCG) accesible sin scraping.",
      finding_en: "No structured tokens were detected in the Design System.",
      impact_en: "An agent can't choose foundational values (color, spacing, typography) without inventing them.",
      recommendation_en: "Export tokens in a structured format (ideally W3C DTCG) that can be accessed without scraping.",
    });
  }

  // D4: components with competing siblings but no disambiguation.
  const components = input.components || [];
  for (const c of components) {
    const competing = c.usage?.competing_components || [];
    const disambig = c.usage?.disambiguation_rules || [];
    if (competing.length > 0 && disambig.length === 0) {
      findings.push({
        dimension: "D4",
        severity: "HIGH",
        component: c.name,
        status: "FOUND",
        evidence: c.evidence_ids || [],
        finding: `${c.name} compite con ${competing.join(", ")} y no existe criterio de selección documentado.`,
        impact: `Un agente puede elegir entre ${c.name} y ${competing.join(
          ", "
        )} sin fundamento en escenarios ambiguos.`,
        recommendation: `Documentar criterio explícito de cuándo usar ${c.name} vs. ${competing.join(", ")}.`,
        finding_en: `${c.name} competes with ${competing.join(", ")} and there's no documented selection criterion.`,
        impact_en: `An agent may choose between ${c.name} and ${competing.join(", ")} without grounds in ambiguous cases.`,
        recommendation_en: `Document an explicit criterion for when to use ${c.name} vs. ${competing.join(", ")}.`,
      });
    }

    if ((c.props || []).length > 0 && !c.usage?.purpose) {
      findings.push({
        dimension: "D4",
        severity: "MEDIUM",
        component: c.name,
        status: "NOT_FOUND",
        evidence: c.evidence_ids || [],
        finding: `${c.name} tiene props documentadas pero no declara su propósito (purpose).`,
        impact: `Un agente puede conocer la API de ${c.name} sin saber cuándo corresponde usarlo.`,
        recommendation: `Añadir descripción de propósito/uso a ${c.name}.`,
        finding_en: `${c.name} has documented props but doesn't state its purpose.`,
        impact_en: `An agent may know ${c.name}'s API without knowing when to use it.`,
        recommendation_en: `Add a purpose/usage description to ${c.name}.`,
      });
    }
  }

  // Contradictions (section 38).
  for (const contradiction of input.contradictions || []) {
    // Section 18 traceability: prefer real evidence_ids into the corpus; sources
    // (raw URLs) are kept as a fallback for inputs that don't populate them yet,
    // but that fallback is itself a traceability gap — see README known-gaps.
    const evidenceRefs =
      contradiction.evidence_ids && contradiction.evidence_ids.length > 0
        ? contradiction.evidence_ids
        : contradiction.sources || [];
    findings.push({
      dimension: contradiction.field?.startsWith("token") ? "D2" : "D3",
      severity: "HIGH",
      component: contradiction.component || null,
      status: "FOUND",
      evidence: evidenceRefs,
      evidence_traceable: Boolean(contradiction.evidence_ids && contradiction.evidence_ids.length > 0),
      finding: `Contradicción detectada en "${contradiction.field}": ${JSON.stringify(contradiction.values)}.`,
      impact: "Un agente puede recibir información inconsistente según la fuente que consulte.",
      recommendation: "Reconciliar las fuentes; no se resuelve automáticamente.",
      finding_en: `Contradiction detected in "${contradiction.field}": ${JSON.stringify(contradiction.values)}.`,
      impact_en: "An agent may get inconsistent information depending on which source it reads.",
      recommendation_en: "Reconcile the sources; this isn't resolved automatically.",
      contradiction: true,
    });
  }

  // D6: low overall documentation coverage.
  const d6 = dimensionResults.find((d) => d.dimension === "D6");
  if (d6 && d6.sub_criteria?.component_coverage?.points !== null && d6.sub_criteria?.component_coverage?.points !== undefined && d6.sub_criteria.component_coverage.points < 15) {
    findings.push({
      dimension: "D6",
      severity: "MEDIUM",
      component: null,
      status: "FOUND",
      evidence: [],
      finding: "La cobertura de documentación por componente es baja (<50% aprox.).",
      impact: "Un agente carece de contexto textual para una parte significativa de los componentes.",
      recommendation: "Priorizar documentar los componentes más usados primero (purpose, uso, API mínima).",
      finding_en: "Per-component documentation coverage is low (under ~50%).",
      impact_en: "An agent lacks written context for a significant share of the components.",
      recommendation_en: "Document the most-used components first (purpose, usage, minimal API).",
    });
  }

  // Decision 4 (METHODOLOGY_DECISIONS.md #4): components detected but excluded
  // from D3/D6 scoring because they couldn't actually be inspected. This was a
  // silent number before — now it's a narrated finding so it doesn't get lost.
  for (const d of dimensionResults) {
    if ((d.dimension === "D3" || d.dimension === "D6") && d.coverage) {
      const { components_detected, components_scored } = d.coverage;
      if (
        typeof components_scored === "number" &&
        typeof components_detected === "number" &&
        components_scored < components_detected
      ) {
        const excluded = components_detected - components_scored;
        findings.push({
          dimension: d.dimension,
          severity: "LOW",
          component: null,
          status: "NOT_EVALUABLE",
          evidence: [],
          finding: `${excluded} de ${components_detected} componentes detectados no pudieron inspeccionarse y se excluyeron del cálculo de ${d.dimension} (score calculado sobre ${components_scored}).`,
          impact: "El score de esta dimensión refleja solo los componentes que sí se pudieron evaluar; puede no representar el sistema completo.",
          recommendation: "Revisar por qué esas páginas no fueron accesibles (permisos, errores 4xx/5xx, contenido armado con JavaScript) y volver a evaluar.",
          finding_en: `${excluded} of ${components_detected} detected components couldn't be inspected and were left out of ${d.dimension} (score based on ${components_scored}).`,
          impact_en: "This dimension's score reflects only the components that could be evaluated; it may not represent the whole system.",
          recommendation_en: "Check why those pages weren't readable (permissions, 4xx/5xx errors, JavaScript-rendered content) and evaluate again.",
        });
      }
    }
  }

  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return findings;
}
