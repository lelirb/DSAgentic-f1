// Render del informe. Solo lee el resultado del motor (report) y elige textos
// fijos de report-texts.js. No recalcula scores, no agrega criterios, no usa IA.
//
// MODELO DE CERTEZA (capa de presentación, no toca el scoring)
// Cada criterio técnico se clasifica según QUÉ PUDO OBSERVAR la evaluación:
//   demonstrated   puntos = máximo
//   partial        0 < puntos < máximo (hay evidencia positiva, incompleta)
//   notDemonstrated  0 puntos, pero la evidencia no permite afirmar ausencia
//   absent         0 puntos Y evidencia completa (solo demos sin páginas
//                  fallidas ni rastreo limitado: el ejemplo ES todo el corpus)
//   notEvaluated   el motor no lo evaluó (null) o, en vivo, el extractor no
//                  puede leer esa fuente desde HTML (aunque cuente 0 en el score)
//   na             no aplica (desambiguación sin componentes parecidos)
// En rastreos en vivo NUNCA se afirma ausencia: el extractor reconoce formatos y
// frases concretas, así que "no lo encontré" no prueba "no existe".
(function () {
  const dict = window.AgenticDSDict;
  const R = window.AgenticDSReport;
  const DIMS = ["D1", "D2", "D3", "D4", "D5", "D6"];
  const ALL = [...DIMS, "D7"];
  let lang = "es";

  // Etapa 2: el motor dice, por cada criterio, si se encontró, si no se encontró,
  // si no existe o si no se pudo evaluar (sub_criteria[k].status / .reason).
  // Estos motivos se traducen a textos de la interfaz.
  const REASON_KEY = {
    EXTERNAL_NOT_READ: "rsExternal", NOT_LOOKED: "rsNotLooked", NOT_READ: "rsNotRead",
    UNREADABLE: "rsUnreadable", NO_BASIS: "rsExcluded", PROBED: "rsProbed",
  };

  const root = document.getElementById("page-root");
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = () => R[lang];
  const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const isNum = (v) => v !== null && v !== undefined;
  const bandOf = (score) => (score >= 76 ? "Operable" : score >= 51 ? "Interpretable" : score >= 26 ? "Legible" : "Opaco");

  // ---------- contexto de evidencia global ----------
  function evidenceContext(report, mode) {
    const ov = report.overview;
    const cov = ov.coverage || {};
    return {
      mode,
      limited: ov.evaluation_status === "LIMITED",
      failed: cov.pages_failed || 0,
      // "complete" = se puede afirmar ausencia con lo que hay (solo demos íntegras)
      complete: mode === "demo" && ov.evaluation_status !== "LIMITED" && !(cov.pages_failed > 0),
    };
  }

  // ---------- clasificación de cada criterio ----------
  function classify(dimKey, dim, ctx) {
    const subs = dim.sub_criteria || {};
    const evaluableMax = Object.values(subs).reduce((a, s) => a + (isNum(s.points) ? s.max : 0), 0) || 1;
    const items = [];
    for (const [key, sc] of Object.entries(subs)) {
      const scope = ctx.mode === "live" ? "observable" : "provided";
      let cert, reason = null;
      const st = sc.status;
      if (st === "NOT_APPLICABLE" || (key === "disambiguation" && sc.applicable === false)) cert = "na";
      else if (st === "NOT_EVALUABLE" || !isNum(sc.points)) {
        cert = "notEvaluated";
        reason = dimKey === "D3" && key === "api_consistency" ? "noBasisApi" : REASON_KEY[sc.reason] || "rsExcluded";
      }
      else if (st === "FOUND" || sc.points >= sc.max - 1e-9) cert = "demonstrated";
      else if (st === "PARTIAL" || sc.points > 0) cert = "partial";
      else if (st === "ABSENT") { cert = "absent"; reason = REASON_KEY[sc.reason] || null; }
      else if (ctx.mode === "live") { cert = "notDemonstrated"; reason = "rsObservable"; }
      else if (ctx.complete) cert = "absent";
      else { cert = "notDemonstrated"; reason = "rsIncomplete"; }

      const isGapLike = cert === "partial" || cert === "notDemonstrated" || cert === "absent";
      const loss = isGapLike ? ((sc.max - sc.points) / evaluableMax) * (R.WEIGHTS[dimKey] || 0) : 0;
      items.push({ key, sc, cert, reason, scope, loss, dim: dimKey });
    }
    items.sort((a, b) => b.loss - a.loss);

    // Dimensión con score pero sin criterios detallados (p. ej. D2 sin tokens: el
    // motor la fuerza a 0 sin desglose). Se clasifica como un todo.
    let whole = null;
    if (!items.length && isNum(dim.score)) {
      if (dim.score === 0) whole = ctx.mode === "live" ? "notDemonstrated" : ctx.complete ? "absent" : "notDemonstrated";
      else whole = "demonstrated";
    }

    const by = (c) => items.filter((i) => i.cert === c);
    const partialCountsComplete = ctx.complete;
    const incomplete =
      (whole && whole === "notDemonstrated") ||
      items.some((i) => i.cert === "notDemonstrated" || i.cert === "notEvaluated" || (i.cert === "partial" && !partialCountsComplete));
    return {
      items, whole, incomplete,
      demonstrated: by("demonstrated"), partial: by("partial"), notDemonstrated: by("notDemonstrated"),
      absent: by("absent"), notEvaluated: by("notEvaluated"), na: by("na"),
    };
  }

  function meaningKey(dim, cls) {
    const gapLike = cls.partial.length + cls.notDemonstrated.length + cls.absent.length;
    if (gapLike === 0 && !cls.whole && dim.score >= 76) return "full";
    if (dim.score >= 76) return "high";
    if (dim.score >= 51) return "mid";
    return "low";
  }

  // ---------- regla de la mitad (etapa 2) ----------
  // Si se pudo revisar menos de la mitad de lo que compone la nota, el número se
  // muestra con un aviso y sin nivel. Lo decide el motor (data_sufficiency).
  const lowCoverage = (ov) => ov.data_sufficiency === "LOW_COVERAGE";
  const shareOf = (ov) => (isNum(ov.evaluable_share) ? ov.evaluable_share : ov.dimension_weight_coverage || 0);

  // ---------- razones de evaluación incompleta (encabezado) ----------
  function incompleteReasons(report, ctx, analysis) {
    const u = T().ui, out = [];
    if (ctx.limited) out.push(u.rLimited);
    if (ctx.failed) out.push(fmt(u.rFailed, { n: ctx.failed }));
    if (report.gate && report.gate.applied) out.push(u.rGate);
    const all = Object.values(analysis);
    const hasReason = (r) => all.some((c) => c.items.some((i) => i.reason === r));
    if (hasReason("rsExternal")) out.push(u.rExternal);
    if (hasReason("rsNotLooked") || hasReason("rsNotRead")) out.push(u.rNotLooked);
    if (hasReason("rsUnreadable")) out.push(u.rUnreadable);
    if (lowCoverage(report.overview)) out.push(fmt(u.rLowCoverage, { pct: Math.round(shareOf(report.overview) * 100) }));
    const ne = DIMS.filter((k) => !isNum(report.dimensions[k].score));
    if (ne.length) out.push(fmt(u.rNotEval, { list: ne.map((k) => `${k} (${T().dims[k].name})`).join(", ") }));
    return out;
  }

  // ---------- 1–4: resultado general ----------
  function renderVerdict(report, ctx, analysis, reasons) {
    const ov = report.overview;
    const score = ov.global_score;
    const band = score === null ? null : ov.readiness_level || bandOf(score);
    const u = T().ui;
    const incomplete = reasons.length > 0;

    const provisional = score !== null && lowCoverage(ov);

    const canDo = [], infer = [], cannot = [], notDem = [], notEval = [];
    for (const k of DIMS) {
      const d = report.dimensions[k], td = T().dims[k], c = analysis[k];
      if (!isNum(d.score)) { notEval.push({ text: td.can, k }); continue; }
      if (d.score >= 76) canDo.push({ text: td.can, k });
      else if (d.score <= 50) (c.incomplete ? notDem : cannot).push({ text: td.can, k });
      if (d.score > 50)
        for (const g of c.items) if (g.cert === "partial" || g.cert === "notDemonstrated" || g.cert === "absent") infer.push({ text: T().subs[g.key].infer, k, loss: g.loss });
    }
    notEval.push({ text: T().dims.D7.can, k: "D7" });
    infer.sort((a, b) => b.loss - a.loss);
    const inferTop = infer.slice(0, 6);

    const list = (title, cls, items) =>
      items.length
        ? `<div class="${cls}"><h2>${esc(title)}</h2><ul>${items.map((i) => `<li>${esc(cap(i.text))} <span class="dref">${esc(i.k)}</span></li>`).join("")}</ul></div>`
        : "";

    let scoreBlock, summary, conclusion = "";
    const badge = incomplete
      ? `<span class="cert-badge cb-incomplete">${esc(u.incompleteBadge)}</span>`
      : `<span class="cert-badge cb-complete">${esc(u.completeBadge)}</span>`;
    if (provisional) {
      scoreBlock = `
        <div class="score-line"><span class="num num-provisional">${score}</span><span class="of">/100 ${esc(u.scoreDemonstrated)}</span><span class="band band-none">${esc(u.noBandChip)}</span>${badge}</div>
        <div class="provisional-box measure"><p>${esc(fmt(u.provisionalLead, { pct: Math.round(shareOf(ov) * 100) }))}</p></div>`;
      summary = u.provisionalSummary;
    } else if (score === null) {
      scoreBlock = `<div class="score-line"><span class="none">${esc(u.noResult)}</span>${badge}</div>`;
      summary = ov.data_sufficiency === "INSUFFICIENT_D1" ? u.noResultD1 : u.noResultCoverage;
    } else {
      const segs = ["Opaco", "Legible", "Interpretable", "Operable"];
      const bandCls = `band-${band}`;
      scoreBlock = `
        <div class="score-line"><span class="num">${score}</span><span class="of">/100${incomplete ? ` ${esc(u.scoreDemonstrated)}` : ""}</span><span class="band ${bandCls}">${esc(u.bandLabel[band] || band)}</span>${badge}</div>
        <div class="scale ${bandCls}" role="img" aria-label="${esc(score + "/100 · " + (u.bandLabel[band] || band))}">
          ${segs.map((s) => `<div><div class="seg ${s === band ? "on" : ""}"></div><div class="lbl ${s === band ? "on" : ""}">${esc(u.bandLabel[s])} <span>${esc(u.bandRange[s])}</span></div></div>`).join("")}
          <div class="marker" style="left:${Math.max(0, Math.min(100, score))}%"></div>
        </div>`;
      summary = T().bands[band].summary;
      const concl = band === "Operable" && inferTop.length === 0 ? T().bands[band].conclusionNoGaps : T().bands[band].conclusion;
      const framed = incomplete ? `${u.meaningIncomplete} ${concl.charAt(0).toLowerCase()}${concl.slice(1)}` : concl;
      conclusion = `<p class="conclusion measure"><strong>${esc(u.therefore)}</strong> ${esc(framed)}</p>`;
    }

    const readCount = ctx.sources && ctx.sources.counts ? ctx.sources.counts.READ || 0 : null;
    const sourcesLink = ctx.mode === "live" && readCount !== null
      ? `<a class="src-jump" href="#sources">${esc(fmt(u.sourcesJump, { n: readCount }))}</a>`
      : "";

    const incompleteBox = incomplete
      ? `<div class="incomplete-box measure"><p><strong>${esc(u.incompleteBadge)}.</strong> ${esc(u.incompleteLead)}</p><ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul><p>${esc(u.incompleteReading)}</p></div>`
      : "";

    return `
      <section class="verdict" aria-labelledby="q">
        <h1 id="q">${esc(u.question)}</h1>
        <p class="source"><span>${esc(report.system && report.system.url)}</span><span class="pill">${esc(ctx.mode === "demo" ? u.modeDemo : u.modeLive)}</span>${sourcesLink}</p>
        ${discoveryLine(ctx)}
        ${scoreBlock}
        ${incompleteBox}
        <p class="summary measure">${esc(summary)}</p>
        <div class="cap-lists">
          ${list(u.canDo, "cap-good", canDo)}
          ${list(u.mayInfer, "cap-infer", inferTop)}
          ${list(u.cannot, "cap-bad", cannot)}
          ${list(u.notDemonstratedList, "cap-nd", notDem)}
          ${list(u.notEvaluated, "cap-na", notEval)}
        </div>
        ${conclusion}
        <p class="score-note measure">${esc(u.scoreNote)}</p>
        <p class="score-note measure">${esc(u.certHelp)}</p>
      </section>`;
  }

  // "Empezamos por X, reconocimos el Design System en Y, encontramos N componentes y evaluamos M."
  function discoveryLine(ctx) {
    const d = ctx.discovery;
    if (ctx.mode !== "live" || !d) return "";
    const u = T().ui;
    const parts = [fmt(u.discStart, { url: d.entry_url || "" })];
    if (d.root_url) parts.push(fmt(u.discRoot, { url: d.root_url }));
    const how = u.discMethod[d.method] || "";
    if (isNum(d.components_found)) parts.push(fmt(u.discFound, { n: d.components_found, m: d.components_sampled || 0 }));
    else if (isNum(d.components_sampled)) parts.push(fmt(u.discSampledOnly, { m: d.components_sampled }));
    let txt = parts.join(", ") + ".";
    txt = txt.charAt(0).toUpperCase() + txt.slice(1);
    const off = (d.official_sources || []).map((o) => u.officialKind[o.kind] || o.kind);
    const offTxt = off.length ? " " + fmt(u.discOfficial, { list: [...new Set(off)].join(", ") }) : "";
    return `<p class="discovery measure">${esc(txt)}${how ? ` ${esc(how)}` : ""}${esc(offTxt)}</p>`;
  }

  // ---------- cadena de capacidades ----------
  function renderChain(report, analysis, liveMode) {
    const u = T().ui;
    const items = ALL.map((k) => {
      const d = report.dimensions[k], td = T().dims[k];
      const s = d && isNum(d.score) ? Math.round(d.score) : null;
      const color = s === null ? "" : `band-${bandOf(s)}`;
      const inc = s === null && k !== "D7"
        ? `<div class="inc">${esc(u.dimUnreadable)}</div>`
        : analysis[k] && analysis[k].incomplete ? `<div class="inc">${esc(u.dimIncomplete)}</div>` : "";
      return `<a href="#dim-${k}">
          <div class="verb">${esc(td.verb)}</div>
          ${s === null ? `<div class="val muted">—</div><div class="bar"></div>` : `<div class="val ${color}">${s}</div><div class="bar"><i class="bg-${color}" style="width:${s}%"></i></div>`}
          ${inc}
          <div class="step">${esc(k)} · ${esc(td.name)}</div>
        </a>`;
    }).join("");
    return `<h2 class="section">${esc(u.chainTitle)}</h2><p class="section-lead measure">${esc(u.chainLead)}</p><nav class="chain" aria-label="${esc(u.chainTitle)}">${items}</nav>`;
  }

  // ---------- 5–6: cada dimensión ----------
  const qa = (title, tagCls, tagText, inner) =>
    `<div class="qa"><h4>${esc(title)}${tagText ? ` <span class="tag ${tagCls}">${esc(tagText)}</span>` : ""}</h4>${inner}</div>`;
  const reasonText = (i) => (i.reason === "noBasisApi" ? T().ui.noBasisApi : T().ui[i.reason] || "");

  function certSummary(cls) {
    const u = T().ui;
    const parts = [
      ["c-dem", cls.demonstrated.length, u.certDemonstrated],
      ["c-par", cls.partial.length, u.certPartial],
      ["c-nd", cls.notDemonstrated.length, u.certNotDemonstrated],
      ["c-abs", cls.absent.length, u.certAbsent],
      ["c-ne", cls.notEvaluated.length, u.certNotEvaluated],
      ["c-na", cls.na.length, u.certNA],
    ].filter((p) => p[1] > 0);
    if (!parts.length) return "";
    return `<p class="cert-sum">${parts.map(([c, n, l]) => `<span class="${c}"><i></i>${esc(l)}: ${n}</span>`).join("")}</p>`;
  }

  function renderDim(k, report, analysis, ctx, findings) {
    const u = T().ui, td = T().dims[k], d = report.dimensions[k];
    const s = d && isNum(d.score) ? Math.round(d.score) : null;
    const cls = analysis[k];

    const about = `
      <div class="about">
        <p class="group">${esc(u.aboutDim)}</p>
        ${qa(u.qWhat, "", "", `<p class="measure">${esc(td.what)}</p>`)}
        ${qa(u.qPurpose, "", "", `<p class="measure">${esc(td.purpose)}</p>`)}
        ${qa(u.qWhy, "", "", `<p class="measure">${esc(td.why)}</p>`)}
      </div>`;

    const certBadge = cls
      ? cls.incomplete ? `<span class="cert-badge cb-incomplete">${esc(u.dimIncomplete)}</span>` : `<span class="cert-badge cb-complete">${esc(u.dimComplete)}</span>`
      : "";
    const head = `
      <div class="dim-head">
        <div><h3>${esc(k)} · ${esc(td.name)}</h3><span class="capchip">${esc(td.verb)}</span> ${certBadge}${cls ? certSummary(cls) : ""}</div>
        <div class="dscore">${s === null ? `<span class="na">${esc(u.notScored)}</span>` : `<b class="band-${bandOf(s)}">${s}</b><span>/100</span>${cls && cls.incomplete ? `<div class="demo-cap">${esc(u.scoreDemonstrated)}</div>` : ""}`}</div>
      </div>`;

    let found, meaning, improve, resultLine, tech = "";
    const capLine = `<span>${esc(u.capability)}: <span class="capchip">${esc(td.verb)}</span></span>`;

    if (k === "D7") {
      found = `<p class="measure">${esc(td.notEvaluated)}</p>`;
      meaning = `<p class="measure">${esc(u.dimNotEvaluableMeaning)}</p>`;
      improve = `<p class="measure">${esc(u.d7Pending)}</p>`;
      resultLine = `<div class="result-line"><b>${esc(u.result)}:</b> ${esc(u.certNotEvaluated)} ${capLine}</div>`;
    } else if (s === null) {
      found = `<p class="measure">${esc(u.dimNotEvaluable)}</p>`;
      meaning = `<p class="measure">${esc(u.dimNotEvaluableMeaning)}</p>`;
      improve = `<p class="measure">${esc(u.dimNotEvaluableImprove)}</p>`;
      resultLine = `<div class="result-line"><b>${esc(u.result)}:</b> ${esc(u.certNotEvaluated)} ${capLine}</div>`;
      tech = renderTech(k, d, null, findings);
    } else {
      const S = T().subs;
      const li = (i, withGap, withReason, withExpected) =>
        `<li><strong>${esc(S[i.key].name)}${withGap || withExpected ? "." : ""}</strong>${withGap ? ` ${esc(S[i.key].gap)}` : ""}${withExpected ? ` ${esc(u.expected)} ${esc(S[i.key].found)}.` : ""}${withReason && i.reason ? ` <span class="why">(${esc(reasonText(i))})</span>` : ""}</li>`;
      const parts = [];

      if (cls.whole) {
        // Dimensión sin desglose (p. ej. D2 sin tokens)
        const txt = k === "D2" ? (ctx.mode === "live" ? u.d2NotFoundLive : u.d2NotFoundDemo) : u.emptyDimNote;
        const label = cls.whole === "absent" ? u.certAbsent : cls.whole === "notDemonstrated" ? u.certNotDemonstrated : u.certDemonstrated;
        parts.push(`<p><span class="cert-inline">${esc(label)}.</span> ${esc(txt)}</p>`);
      }
      const dem = [...cls.demonstrated, ...cls.partial];
      if (dem.length)
        parts.push(`<p>${esc(u.grpDemonstrated)}</p><ul>${dem.map((i) => `<li>${esc(S[i.key].found)}${i.cert === "partial" ? ` <span class="why">(${esc(u.partialMark)})</span>` : ""}</li>`).join("")}</ul>`);
      // Mismo motivo = se dice una sola vez, encabezando su grupo.
      const grouped = (heading, arr, withGap, withExpected) => {
        if (!arr.length) return;
        const groups = new Map();
        for (const i of arr) { const r = i.reason || ""; if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
        let h = `<p>${esc(heading)}</p>`;
        for (const [, g] of groups) {
          const r = reasonText(g[0]);
          h += `${r ? `<p class="why-lead">${esc(cap(r.replace(/\.\s*$/, "")))}:</p>` : ""}<ul>${g.map((i) => li(i, withGap, false, withExpected)).join("")}</ul>`;
        }
        parts.push(h);
      };
      grouped(u.grpNotDemonstrated, cls.notDemonstrated, true, true);
      if (cls.absent.length) parts.push(`<p>${esc(u.grpAbsent)}</p><ul>${cls.absent.map((i) => li(i, true, false, true)).join("")}</ul>`);
      grouped(u.grpNotEvaluated, cls.notEvaluated, false, true);
      if (cls.na.length) parts.push(`<p>${esc(u.grpNA)}</p><ul>${cls.na.map((i) => `<li><strong>${esc(S[i.key].name)}.</strong> ${esc(S[i.key].na || "")}</li>`).join("")}</ul>`);
      const onlySolid = cls.items.length && cls.items.every((i) => i.cert === "demonstrated" || i.cert === "na");
      if (!cls.whole && onlySolid) parts.push(`<p>${esc(u.noGaps)}</p>`);
      if (cls.incomplete && cls.items.length) {
        const ne = cls.notEvaluated.length, nd = cls.notDemonstrated.length + (ctx.complete ? 0 : cls.partial.length);
        parts.unshift(`<p class="partial-lead">${esc(fmt(u.dimPartialLead, { total: cls.items.length - cls.na.length, dem: cls.demonstrated.length + (ctx.complete ? cls.partial.length : 0), nd, ne }))}</p>`);
      }
      found = `<div class="measure">${parts.join("")}</div>`;

      let m = td.meaning[meaningKey(d, cls)];
      if (cls.incomplete) m = `${u.meaningIncomplete} ${m.charAt(0).toLowerCase()}${m.slice(1)}`;
      if (cls.incomplete && d.score <= 50) m += " " + fmt(u.notDemonstratedCap, { verb: td.verb.toUpperCase() });
      meaning = `<p class="measure">${esc(m)}</p>`;

      // Recomendaciones: primero limitaciones de la evaluación, después gaps.
      const limits = cls.notEvaluated.filter((i) => i.reason !== "rsExcluded");
      const direct = [...cls.absent, ...(ctx.complete ? cls.partial : [])].sort((a, b) => b.loss - a.loss);
      const possible = [...cls.notDemonstrated, ...(ctx.complete ? [] : cls.partial)].sort((a, b) => b.loss - a.loss);
      const ip = [];
      if (limits.length)
        ip.push(`<p class="limit"><span class="tag tag-li">${esc(u.tagLimit)}</span> ${esc(u.recoLimits)} ${esc(limits.map((i) => S[i.key].name).join(", "))}. ${esc(u.recoLimitsTail)}</p>`);
      if (direct.length) ip.push(`<p><strong>${esc(u.recoDirect)}</strong></p><ol>${direct.map((i) => `<li>${esc(S[i.key].fix)}</li>`).join("")}</ol>`);
      if (cls.whole === "absent" && k === "D2") ip.push(`<p><strong>${esc(u.recoDirect)}</strong></p><ol><li>${esc(u.d2FixPossible)}</li></ol>`);
      if (possible.length) ip.push(`<p><strong>${esc(u.recoPossible)}</strong></p><ol>${possible.map((i) => `<li>${esc(S[i.key].fix)}</li>`).join("")}</ol>`);
      if (cls.whole === "notDemonstrated" && k === "D2") ip.push(`<p><strong>${esc(u.recoPossible)}</strong></p><ol><li>${esc(u.d2FixPossible)}</li></ol>`);
      if (!ip.length) ip.push(`<p>${esc(u.noActions)}</p>`);
      else if (!direct.length && !possible.length && !cls.whole) ip.push(`<p>${esc(u.recoNoneFirm)}</p>`);
      improve = `<div class="measure">${ip.join("")}</div>`;

      resultLine = `<div class="result-line"><b>${esc(u.result)}: ${s}/100${cls.incomplete ? ` ${esc(u.scoreDemonstrated)}` : ""}</b> ${certBadge} ${capLine}</div>`;
      tech = renderTech(k, d, cls, findings);
    }

    const body = `
      <div class="body">
        <p class="group">${esc(u.inThisDs)}</p>
        ${qa(u.qFound, "tag-ev", u.tagEvidence, found)}
        ${qa(u.qMeaning, "tag-in", u.tagInference, meaning)}
        ${qa(u.qImprove, "tag-re", u.tagReco, improve)}
      </div>`;
    return `<article class="dim" id="dim-${k}">${head}${about}${body}${resultLine}${tech}</article>`;
  }

  const pick = (f, field) => (lang === "en" && f[`${field}_en`]) || f[field];

  function renderTech(k, d, cls, findings) {
    const u = T().ui;
    const lbl = {
      demonstrated: ["c-dem", u.certDemonstrated], partial: ["c-par", u.certPartial], notDemonstrated: ["c-nd", u.certNotDemonstrated],
      absent: ["c-abs", u.certAbsent], notEvaluated: ["c-ne", u.certNotEvaluated], na: ["c-na", u.certNA],
    };
    let table = "";
    if (cls && cls.items.length) {
      const order = Object.keys(d.sub_criteria);
      const rows = [...cls.items].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)).map((i) => {
        const [c, l] = lbl[i.cert];
        const pts = isNum(i.sc.points) ? `${+i.sc.points.toFixed(1)} / ${i.sc.max}` : "—";
        return `<tr><td><code>${esc(i.key)}</code></td><td>${esc(T().subs[i.key].name)}</td><td class="pts">${esc(pts)}</td><td class="st ${c}"><i></i>${esc(l)}</td></tr>`;
      }).join("");
      table = `<table class="ev"><thead><tr><th>${esc(u.evCrit)}</th><th>${esc(u.evMeaning)}</th><th>${esc(u.evPoints)}</th><th>${esc(u.evStatus)}</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    const meta = [`<code>dimension: ${esc(k)}</code> · <code>status: ${esc(d.status)}</code> · <code>score: ${isNum(d.score) ? +d.score.toFixed(2) : "null"}</code>`];
    if (d.coverage && d.coverage.components_detected !== undefined) {
      const c = d.coverage;
      meta.push(`${esc(u.coverage)}: ${c.components_detected} ${esc(u.covComponents)}` +
        (c.components_scored !== undefined ? `, ${c.components_scored} ${esc(u.covScored)}` : "") +
        (c.components_with_props !== undefined ? `, ${c.components_with_props} ${esc(u.covWithProps)}` : ""));
    }
    if (d.patterns_detected !== undefined) meta.push(`${esc(u.coverage)}: ${d.patterns_detected} ${esc(u.covPatterns)}`);
    if (d.note) meta.push(`<code>note:</code> ${esc(d.note)}`);
    if (d.missing_inputs && d.missing_inputs.length) meta.push(`<code>missing_inputs:</code> ${esc(d.missing_inputs.join(", "))}`);
    const dimFindings = findings.filter((f) => f.dimension === k);
    const fHtml = dimFindings.length
      ? `<p class="tech-meta"><strong>${esc(u.engineFindings)}</strong>${u.engineLangNote ? ` · ${esc(u.engineLangNote)}` : ""}</p>` +
        dimFindings.map((f) => `<div class="finding"><code>${esc(f.severity)}</code>${f.component ? ` · ${esc(f.component)}` : ""} — ${esc(pick(f, "finding"))}${f.recommendation ? `<br>→ ${esc(pick(f, "recommendation"))}` : ""}</div>`).join("")
      : "";
    const fNote = dimFindings.length && cls && cls.incomplete ? `<p class="tech-meta">${esc(u.engineFindingsIncomplete)}</p>` : "";
    return `<details class="tech"><summary>${esc(u.evidenceTitle)}</summary><div class="tech-body">${table}${meta.map((m) => `<p class="tech-meta">${m}</p>`).join("")}${fHtml}${fNote}</div></details>`;
  }

  // ---------- 7: limitaciones ----------
  function renderLimitations(report, ctx, analysis) {
    const u = T().ui;
    const items = [ctx.mode === "demo" ? u.limDemo : u.limLive, u.limDocsOnly];
    if (ctx.failed) items.push(fmt(u.limFailed, { n: ctx.failed }));
    if (ctx.limited) items.push(u.limLimited);
    const ne = DIMS.filter((k) => !isNum(report.dimensions[k].score));
    if (ne.length) items.push(fmt(u.limNotEval, { list: ne.map((k) => `${k} (${T().dims[k].name})`).join(", ") }));
    const has = (r) => Object.values(analysis).some((c) => c.items.some((i) => i.reason === r));
    if (has("rsExternal")) items.push(u.limExternal);
    if (has("rsNotLooked") || has("rsNotRead")) items.push(u.limNotLooked);
    items.push(u.limD7);
    if (ctx.mode === "live") items.push(u.limNotEvaluableNow);
    return `<h2 class="section">${esc(u.limitationsTitle)}</h2><div class="limitations"><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
  }

  // ---------- etapa 1: qué revisamos ----------
  const SOURCE_GROUPS = [
    ["READ", "srcRead", true],
    ["NOT_PRESENT", "srcNotPresent", true],
    ["FAILED", "srcFailed", true],
    ["SKIPPED", "srcSkipped", false],
    ["OUT_OF_SCOPE", "srcOutOfScope", false],
    ["DUPLICATE", "srcDuplicate", false],
  ];

  function safeHref(url) {
    try {
      const u = new URL(url);
      return /^https?:$/.test(u.protocol) ? u.toString() : null;
    } catch {
      return null;
    }
  }

  function sourceReasonText(item) {
    const u = T().ui, r = String(item.reason || "");
    const http = /^HTTP_(\d{3})$/.exec(r);
    if (http) {
      const n = Number(http[1]);
      if (n === 404 || n === 410) return u.srHttp404;
      if (n === 401 || n === 403 || n === 429) return fmt(u.srHttpRefused, { n });
      if (n >= 500) return fmt(u.srHttpServer, { n });
      return fmt(u.srHttpOther, { n });
    }
    return u.sourceReasons[r] || (r ? r : "");
  }

  function usedAsText(item) {
    const u = T().ui;
    if (!item.used_as || !item.used_as.length) return u.usedNothing;
    return item.used_as.map((x) =>
      x.kind === "component" ? fmt(u.usedComponent, { name: x.name })
      : x.kind === "tokens" ? fmt(u.usedTokens, { n: x.count })
      : x.kind === "manifest" ? fmt(u.usedManifest, { name: x.name })
      : x.kind === "schema" ? u.usedSchema
      : x.kind === "pattern" ? fmt(u.usedPattern, { name: x.name })
      : x.kind === "component_tab_unused" ? fmt(u.usedTabUnused, { name: x.name })
      : ""
    ).filter(Boolean).join(" · ");
  }

  function sourceLine(item, withUse) {
    const href = safeHref(item.url);
    const link = href
      ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${esc(item.url)}</a>`
      : `<span>${esc(item.url)}</span>`;
    const roleKey = { well_known: "roleWellKnown", entry: "roleEntry", root: "roleRoot", official_external: "roleOfficial", listed: "roleListed" }[item.role];
    const role = roleKey && T().ui[roleKey] ? ` <span class="src-role">${esc(T().ui[roleKey])}</span>` : "";
    const detail = withUse ? usedAsText(item) : sourceReasonText(item);
    return `<li>${link}${role}${detail ? `<span class="src-detail">${esc(detail)}</span>` : ""}</li>`;
  }

  function renderSources(stored, ctx) {
    const u = T().ui;
    const head = `<h2 class="section" id="sources">${esc(u.sourcesTitle)}</h2>`;
    if (ctx.mode === "demo") return `${head}<p class="section-lead measure">${esc(u.sourcesDemo)}</p>`;
    const src = stored.sources;
    if (!src || !Array.isArray(src.items)) return `${head}<p class="section-lead measure">${esc(u.sourcesUnavailable)}</p>`;

    const counts = src.counts || {};
    const n = (k) => counts[k] || 0;
    const summary = fmt(u.sourcesSummary, {
      read: n("READ"), failed: n("FAILED"), skipped: n("SKIPPED"), out: n("OUT_OF_SCOPE"),
    });

    const groups = SOURCE_GROUPS.map(([status, key, open]) => {
      const total = n(status);
      if (!total) return "";
      const list = src.items.filter((i) => i.status === status);
      const more = (src.truncated && src.truncated[status]) || 0;
      const body = status === "DUPLICATE"
        ? `<p class="src-help">${esc(u.srcDuplicateHelp)}</p>`
        : `<ul class="src-list">${list.map((i) => sourceLine(i, status === "READ")).join("")}</ul>${more ? `<p class="src-help">${esc(fmt(u.sourcesMore, { n: more }))}</p>` : ""}`;
      const help = u[key + "Help"] ? `<p class="src-help">${esc(u[key + "Help"])}</p>` : "";
      return `<details class="src-group"${open ? " open" : ""}><summary>${esc(u[key])} <span class="src-count">${total}</span></summary>${help}${body}</details>`;
    }).join("");

    return `${head}
      <p class="section-lead measure">${esc(fmt(u.sourcesLead, { url: src.entry_url || (stored.report.system && stored.report.system.url) || "" }))}</p>
      <p class="measure src-summary">${esc(summary)}</p>
      ${groups}
      <p class="measure src-help">${esc(u.sourcesNotYet)}</p>`;
  }

  // ---------- descargar el resultado (nada se guarda en el servidor) ----------
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "resultado"; }
  }
  function dayOf(iso) {
    const d = iso ? new Date(iso) : new Date();
    return isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
  }
  function formatDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    try {
      return new Intl.DateTimeFormat(lang === "en" ? "en" : "es", { dateStyle: "long", timeStyle: "short" }).format(d);
    } catch {
      return d.toISOString();
    }
  }
  const entryUrlOf = (stored) =>
    (stored.sources && stored.sources.entry_url) || (stored.report && stored.report.system && stored.report.system.url) || null;
  function fileBaseName(stored) {
    const url = entryUrlOf(stored);
    const who = stored.mode === "demo" ? "demo" : hostOf(url);
    return `agentic-ds-${who}-${dayOf(stored.evaluated_at)}`.replace(/[^a-z0-9.-]+/gi, "-");
  }
  // Export format: stable, versioned, self-describing (reusable in Phase 2).
  function exportPayload(stored) {
    return {
      tool: "Agentic DS",
      export_format_version: 1,
      phase: 1,
      exported_at: new Date().toISOString(),
      evaluated_at: stored.evaluated_at || null,
      mode: stored.mode === "demo" ? "demo" : "live",
      entry_url: entryUrlOf(stored),
      report: stored.report,
      sources: stored.sources || null,
      discovery: stored.discovery || null,
      crawl_summary: stored.crawl_summary || null,
    };
  }

  function renderActions(stored) {
    const u = T().ui;
    const when = formatDate(stored.evaluated_at);
    return `
      <div class="report-actions" role="group" aria-label="${esc(u.downloadGroup)}">
        <div class="ra-buttons">
          <button type="button" class="ra-btn ra-primary" data-action="pdf">${esc(u.downloadPdf)}</button>
          <button type="button" class="ra-btn" data-action="json">${esc(u.downloadJson)}</button>
        </div>
        <p class="ra-note">${esc(u.downloadNote)}</p>
      </div>
      <div class="print-only print-head">
        <p><strong>Agentic DS</strong> · ${esc(u.printHead)}</p>
        ${when ? `<p>${esc(fmt(u.evaluatedAt, { date: when }))}</p>` : ""}
      </div>`;
  }

  function renderPrintFooter() {
    return `<p class="print-only print-foot">${esc(T().ui.printFooter)}</p>`;
  }

  function downloadJson(stored) {
    const blob = new Blob([JSON.stringify(exportPayload(stored), null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${fileBaseName(stored)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  // Printing: open every collapsible block so the PDF contains everything,
  // and suggest a useful file name (browsers use the page title).
  let printState = null;
  function beforePrint(stored) {
    if (printState || !root.querySelectorAll) return;
    const closed = [...root.querySelectorAll("details:not([open])")];
    closed.forEach((d) => d.setAttribute("open", ""));
    printState = { closed, title: document.title };
    document.title = fileBaseName(stored);
  }
  function afterPrint() {
    if (!printState) return;
    printState.closed.forEach((d) => d.removeAttribute("open"));
    document.title = printState.title;
    printState = null;
  }

  function wireActions(stored) {
    if (!root.querySelector) return;
    const pdf = root.querySelector('[data-action="pdf"]');
    const json = root.querySelector('[data-action="json"]');
    if (pdf) pdf.addEventListener("click", () => {
      beforePrint(stored);
      window.print();
      // Some mobile browsers don't fire afterprint: restore shortly after.
      setTimeout(afterPrint, 1500);
    });
    if (json) json.addEventListener("click", () => downloadJson(stored));
  }
  let currentStored = null;
  if (window.addEventListener) {
    window.addEventListener("beforeprint", () => currentStored && beforePrint(currentStored));
    window.addEventListener("afterprint", afterPrint);
  }

  // ---------- página ----------
  function render() {
    let stored;
    try { stored = JSON.parse(sessionStorage.getItem("agentic-ds-last-result")); } catch { stored = null; }
    if (!stored || !stored.report) {
      root.innerHTML = `<div class="empty-state"><h2>${esc(dict[lang]["results.none.title"])}</h2><p>${esc(dict[lang]["results.none.body"])}</p><a href="index.html" class="btn-primary">${esc(dict[lang]["results.none.cta"])}</a></div>`;
      return;
    }
    const report = stored.report;
    const ctx = evidenceContext(report, stored.mode === "demo" ? "demo" : "live");
    ctx.sources = stored.sources || null;
    ctx.discovery = stored.discovery || null;
    const findings = report.findings || [];
    const analysis = {};
    for (const k of DIMS) {
      const d = report.dimensions[k];
      if (d && isNum(d.score)) analysis[k] = classify(k, d, ctx);
    }
    const reasons = incompleteReasons(report, ctx, analysis);
    document.title = "Agentic DS — " + dict[lang]["results.title"];
    currentStored = stored;
    root.innerHTML =
      renderActions(stored) +
      renderVerdict(report, ctx, analysis, reasons) +
      renderChain(report, analysis, ctx.mode === "live") +
      `<h2 class="section">${esc(T().ui.dimsTitle)}</h2>` +
      ALL.map((k) => renderDim(k, report, analysis, ctx, findings)).join("") +
      renderSources(stored, ctx) +
      renderLimitations(report, ctx, analysis) +
      renderPrintFooter();
    wireActions(stored);
  }

  function setLang(l) {
    lang = l === "en" ? "en" : "es";
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (dict[lang][key] !== undefined) el.textContent = dict[lang][key];
    });
    document.getElementById("btn-es").setAttribute("aria-pressed", lang === "es");
    document.getElementById("btn-en").setAttribute("aria-pressed", lang === "en");
    try { localStorage.setItem("agentic-ds-lang", lang); } catch {}
    render();
  }
  document.getElementById("btn-es").addEventListener("click", () => setLang("es"));
  document.getElementById("btn-en").addEventListener("click", () => setLang("en"));
  let saved = "es";
  try { saved = localStorage.getItem("agentic-ds-lang") || "es"; } catch {}
  setLang(saved);
})();
