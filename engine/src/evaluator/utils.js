// Shared deterministic helpers. No randomness (section 5.4 Reproducibility).

export function bandPoints(table, value) {
  // table: { max: N, KEY1: points, KEY2: points, ... } — value is the KEY string
  if (value === undefined || value === null) return null;
  if (!(value in table)) return null;
  return table[value];
}

export function pctPoints(bands, pct) {
  // bands: [{ min_pct, points }, ...] sorted ascending by min_pct. A band applies
  // once pct reaches its min_pct (inclusive) — this mirrors the spec's own wording
  // ("30-49% = 10", "50-69% = 14", ...) where the threshold value belongs to the
  // band that STARTS at it, not the band that ends there.
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  let result = bands[0].points;
  for (const band of bands) {
    if (pct >= band.min_pct) result = band.points;
    else break;
  }
  return result;
}

export function safeRatio(numerator, denominator) {
  if (!denominator || denominator <= 0) return null; // NOT_EVALUABLE, not 0 (section 34)
  return numerator / denominator;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function round5(n) {
  // Section 30/section 47 display: report in bands of 5 to avoid false precision.
  return Math.round(n / 5) * 5;
}

export function readinessLevel(score, levels) {
  const found = levels.find((l) => score >= l.min && score <= l.max);
  return found ? found.label : "Opaco";
}

// Counts evidence-style items by status, excluding NOT_APPLICABLE from denominator (section 16/34).
export function statusCounts(items, statusOf) {
  const counts = { FOUND: 0, NOT_FOUND: 0, NOT_EVALUABLE: 0, NOT_APPLICABLE: 0 };
  for (const item of items) {
    const s = statusOf(item);
    if (s in counts) counts[s] += 1;
  }
  const applicable = counts.FOUND + counts.NOT_FOUND + counts.NOT_EVALUABLE;
  const evaluable = counts.FOUND + counts.NOT_FOUND;
  return { ...counts, applicable_count: applicable, evaluable_count: evaluable };
}
