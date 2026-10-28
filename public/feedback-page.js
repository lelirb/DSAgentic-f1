// Página «Califica este resultado». Toma el último resultado de esta pestaña
// (sessionStorage), lo muestra como contexto de solo lectura y manda el
// formulario a /api/feedback, que lo envía por correo. No guarda nada.
(function () {
  const T = {
    es: {
      title: "Agentic DS — Califica este resultado",
      skip: "Saltar al contenido principal",
      back: "← Volver al resultado",
      h1: "Califica este resultado",
      lead: "Si algo no coincide con lo que conoces de este Design System, cuéntanos qué. Cada comentario llega por correo al equipo de Agentic DS.",
      ctxLabel: "Resultado que estás calificando",
      ctxEmpty: "No encontramos un resultado en esta pestaña. Puedes enviar tu comentario igual: escribe la URL del Design System.",
      ctxMeta: "Reglas {rules} · {mode} · {date}",
      ctxNoScore: "Sin puntaje general",
      modeLive: "evaluación en vivo",
      modeDemo: "demostración",
      ctxSent: "Estos datos se envían junto con tu comentario.",
      editSys: "Corregir la URL",
      reqNote: "Solo la URL y la valoración son obligatorias.",
      required: "(obligatorio)",
      optional: "(opcional)",
      rating: "¿Qué tan acertado es el resultado?",
      endLow: "1 · Nada acertado",
      endHigh: "5 · Muy acertado",
      comment: "Comentario",
      url: "URL del Design System",
      person: "Tu nombre",
      email: "Correo electrónico",
      emailHint: "Solo si quieres que te respondamos.",
      fine: "El comentario se envía por correo mediante Resend, un servicio de envío de correos, y no se guarda en el servidor.",
      privacy: "Ver privacidad",
      send: "Enviar calificación",
      sending: "Enviando…",
      sumTitle: "Revisa lo siguiente antes de enviar",
      eRating: "Elige una valoración del 1 al 5.",
      eUrl: "Escribe la URL del Design System.",
      eUrlFormat: "La URL debe empezar con http:// o https://, por ejemplo https://carbondesignsystem.com.",
      eEmail: "Escribe un correo válido, por ejemplo nombre@dominio.com, o deja el campo vacío.",
      eUnavailable: "El envío de comentarios todavía no está configurado, así que tu mensaje no se envió. Intenta más tarde.",
      eRate: "Enviaste varios comentarios seguidos. Espera unos minutos e intenta de nuevo.",
      eGeneric: "No se pudo enviar. Tu mensaje no se guardó; revisa tu conexión e intenta de nuevo.",
      doneTitle: "Gracias, recibimos tu calificación",
      doneBody: "Tu comentario llegó al equipo de Agentic DS. Si dejaste tu correo, puede que te escribamos.",
      doneBack: "Volver al resultado",
    },
    en: {
      title: "Agentic DS — Rate this result",
      skip: "Skip to main content",
      back: "← Back to the result",
      h1: "Rate this result",
      lead: "If something doesn't match what you know about this Design System, tell us what. Every comment is emailed to the Agentic DS team.",
      ctxLabel: "Result you're rating",
      ctxEmpty: "We didn't find a result in this tab. You can still send your comment: enter the Design System URL.",
      ctxMeta: "Rules {rules} · {mode} · {date}",
      ctxNoScore: "No overall score",
      modeLive: "live evaluation",
      modeDemo: "demo",
      ctxSent: "This information is sent along with your comment.",
      editSys: "Fix the URL",
      reqNote: "Only the URL and the rating are required.",
      required: "(required)",
      optional: "(optional)",
      rating: "How accurate is the result?",
      endLow: "1 · Not accurate",
      endHigh: "5 · Very accurate",
      comment: "Comment",
      url: "Design System URL",
      person: "Your name",
      email: "Email",
      emailHint: "Only if you'd like a reply.",
      fine: "Your comment is emailed through Resend, an email delivery service, and isn't stored on the server.",
      privacy: "See privacy",
      send: "Send rating",
      sending: "Sending…",
      sumTitle: "Check the following before sending",
      eRating: "Choose a rating from 1 to 5.",
      eUrl: "Enter the Design System URL.",
      eUrlFormat: "The URL must start with http:// or https://, for example https://carbondesignsystem.com.",
      eEmail: "Enter a valid email, for example name@domain.com, or leave it empty.",
      eUnavailable: "Feedback sending isn't set up yet, so your message wasn't sent. Please try later.",
      eRate: "You sent several comments in a row. Wait a few minutes and try again.",
      eGeneric: "It couldn't be sent. Your message wasn't saved; check your connection and try again.",
      doneTitle: "Thank you, we received your rating",
      doneBody: "Your comment reached the Agentic DS team. If you left your email, we may write to you.",
      doneBack: "Back to the result",
    },
  };
  const DIMS = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"];
  const LEVEL_EN = { Opaco: "Opaque", Legible: "Legible", Interpretable: "Interpretable", Operable: "Operable" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const page = document.getElementById("page");

  let lang = "es";
  try { lang = localStorage.getItem("agentic-ds-lang") === "en" ? "en" : "es"; } catch {}
  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem("agentic-ds-last-result")); } catch { stored = null; }
  const report = stored && stored.report ? stored.report : null;

  // Lo escrito se conserva al cambiar de idioma.
  let draft = null;
  let sent = false;

  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } }
  function dateOf(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return "";
    try { return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(d); } catch { return d.toISOString(); }
  }

  function contextCard(t, sysFields, open) {
    if (!report) return `<div class="context empty"><p>${esc(t.ctxEmpty)}</p></div>`;
    const ov = report.overview || {};
    const url = (report.system && report.system.url) || "";
    const name = (report.system && report.system.name) || hostOf(url);
    const level = ov.readiness_level ? (lang === "en" ? LEVEL_EN[ov.readiness_level] || ov.readiness_level : ov.readiness_level) : "";
    const score = isNum(ov.global_score)
      ? `<p class="score"><span class="num">${esc(ov.global_score)}</span><span class="of">/100</span>${level ? `<span class="lvl band-${esc(ov.readiness_level)}">${esc(level)}</span>` : ""}</p>`
      : `<p class="score"><span class="of">${esc(t.ctxNoScore)}</span></p>`;
    const meta = fmt(t.ctxMeta, { rules: report.rules_version || "—", mode: stored.mode === "demo" ? t.modeDemo : t.modeLive, date: dateOf(stored.evaluated_at) }).replace(/ · $/, "");
    return `<section class="context" aria-label="${esc(t.ctxLabel)}">
        <p class="k">${esc(t.ctxLabel)}</p>
        <p class="sys">${esc(name)}</p>
        <p class="url">${esc(url)}</p>
        ${score}
        <p class="meta">${esc(meta)}. ${esc(t.ctxSent)}</p>
        <details class="edit" id="edit-sys"${open ? " open" : ""}><summary>${esc(t.editSys)}</summary>${sysFields}</details>
      </section>`;
  }

  function render() {
    const t = T[lang];
    document.documentElement.lang = lang;
    document.title = t.title;
    document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t[el.getAttribute("data-t")]; });
    document.getElementById("btn-es").setAttribute("aria-pressed", String(lang === "es"));
    document.getElementById("btn-en").setAttribute("aria-pressed", String(lang === "en"));

    if (sent) {
      page.innerHTML = `<div class="done"><h2 id="done-title" tabindex="-1">${esc(t.doneTitle)}</h2><p>${esc(t.doneBody)}</p>
        <a class="btn" href="results.html">${esc(t.doneBack)}</a></div>`;
      return;
    }
    const url = draft ? draft.ds_url : (report && report.system && report.system.url) || "";
    const opts = [1, 2, 3, 4, 5].map((n) =>
      `<label class="opt"><input type="radio" name="rating" value="${n}"${draft && draft.rating === n ? " checked" : ""} aria-describedby="rating-ends rating-err"><span>${n}</span></label>`).join("");
    const sysFields = `
        <div class="sys-fields">
          <div class="field">
            <label for="ds_url">${esc(t.url)} <span class="tag">${esc(t.required)}</span></label>
            <input type="url" id="ds_url" name="ds_url" maxlength="500" value="${esc(url)}" inputmode="url" aria-describedby="ds_url-err" autocomplete="url">
            <p class="err" id="ds_url-err" hidden></p>
          </div>
        </div>`;
    // Con un resultado, la URL ya está en la tarjeta: se corrige solo si hace falta.
    // Sin resultado, es lo primero que se pide.
    page.innerHTML = `
      <h1>${esc(t.h1)}</h1>
      <p class="lead">${esc(t.lead)}</p>
      ${contextCard(t, sysFields, Boolean(draft && draft.editOpen))}
      <form id="fb" novalidate>
        <div class="summary" id="summary" tabindex="-1" hidden><h2>${esc(t.sumTitle)}</h2><ul></ul></div>
        <p class="req-note">${esc(t.reqNote)}</p>
        ${report ? "" : sysFields}
        <fieldset id="rating">
          <legend>${esc(t.rating)} <span class="tag">${esc(t.required)}</span></legend>
          <div class="scale">${opts}</div>
          <div class="scale-ends" id="rating-ends"><span>${esc(t.endLow)}</span><span>${esc(t.endHigh)}</span></div>
          <p class="err" id="rating-err" hidden></p>
        </fieldset>
        <div class="field">
          <label for="comment">${esc(t.comment)} <span class="tag">${esc(t.optional)}</span></label>
          <textarea id="comment" name="comment" class="big" maxlength="5000">${esc(draft ? draft.comment : "")}</textarea>
        </div>
        <div class="field">
          <label for="name">${esc(t.person)} <span class="tag">${esc(t.optional)}</span></label>
          <input type="text" id="name" name="name" maxlength="120" value="${esc(draft ? draft.name : "")}" autocomplete="name">
        </div>
        <div class="field">
          <label for="email">${esc(t.email)} <span class="tag">${esc(t.optional)}</span></label>
          <p class="hint" id="email-hint">${esc(t.emailHint)}</p>
          <input type="email" id="email" name="email" maxlength="200" value="${esc(draft ? draft.email : "")}" aria-describedby="email-hint email-err" autocomplete="email" inputmode="email" spellcheck="false">
          <p class="err" id="email-err" hidden></p>
        </div>
        <div class="trap" aria-hidden="true"><label for="website">Website</label><input type="text" id="website" name="website" tabindex="-1" autocomplete="off"></div>
        <p class="fine">${esc(t.fine)} <a href="como-funciona.html#privacidad">${esc(t.privacy)}</a></p>
        <div class="actions"><button type="submit" class="btn">${esc(t.send)}</button><p class="status" id="status" role="status" aria-live="polite"></p></div>
      </form>`;
    document.getElementById("fb").addEventListener("submit", onSubmit);
  }

  function values() {
    const form = document.getElementById("fb");
    const v = (n) => { const el = document.getElementById(n) || form.elements[n]; return el ? el.value : ""; };
    const checked = form.querySelector('input[name="rating"]:checked');
    return { ds_url: v("ds_url"), rating: checked ? Number(checked.value) : null,
      comment: v("comment"), name: v("name"), email: v("email"), website: v("website"),
      editOpen: Boolean(document.getElementById("edit-sys") && document.getElementById("edit-sys").open) };
  }

  function reportData() {
    if (!report) return null;
    const ov = report.overview || {};
    const dims = {};
    for (const k of DIMS) {
      const d = report.dimensions && report.dimensions[k];
      dims[k] = d && isNum(d.score) ? Math.round(d.score * 10) / 10 : null;
    }
    return {
      rules_version: report.rules_version || null,
      global_score: isNum(ov.global_score) ? ov.global_score : null,
      readiness_level: ov.readiness_level || null,
      mode: stored.mode === "demo" ? "demo" : "live",
      evaluated_at: stored.evaluated_at || null,
      dimensions: dims,
    };
  }

  function validate(v) {
    const t = T[lang];
    const errs = [];
    if (!v.ds_url.trim()) errs.push({ id: "ds_url", msg: t.eUrl });
    else { try { const u = new URL(v.ds_url.trim()); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { errs.push({ id: "ds_url", msg: t.eUrlFormat }); } }
    if (!v.rating) errs.push({ id: "rating", focus: 'input[name="rating"]', msg: t.eRating });
    if (v.email.trim() && !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(v.email.trim())) errs.push({ id: "email", msg: t.eEmail });
    return errs;
  }

  function showErrors(errs) {
    const form = document.getElementById("fb");
    const edit = document.getElementById("edit-sys");
    if (edit && errs.some((e) => e.id === "ds_url")) edit.open = true;
    for (const id of ["ds_url", "rating", "email"]) {
      const box = document.getElementById(`${id}-err`);
      const field = document.getElementById(id);
      const e = errs.find((x) => x.id === id);
      box.hidden = !e;
      box.textContent = e ? e.msg : "";
      if (e) field.setAttribute("aria-invalid", "true"); else field.removeAttribute("aria-invalid");
    }
    const summary = document.getElementById("summary");
    summary.hidden = errs.length === 0;
    if (!errs.length) return;
    summary.querySelector("ul").innerHTML = errs.map((e) => `<li><a href="#${e.id}" data-to="${e.id}">${esc(e.msg)}</a></li>`).join("");
    summary.querySelectorAll("a[data-to]").forEach((a) => a.addEventListener("click", (ev) => {
      ev.preventDefault();
      const e = errs.find((x) => x.id === a.getAttribute("data-to"));
      const target = e.focus ? form.querySelector(e.focus) : document.getElementById(e.id);
      if (target) target.focus();
    }));
    summary.focus();
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const t = T[lang];
    const v = values();
    const status = document.getElementById("status");
    status.className = "status";
    status.textContent = "";
    const errs = validate(v);
    showErrors(errs);
    if (errs.length) return;
    const button = document.querySelector("#fb button[type=submit]");
    button.disabled = true;
    status.textContent = t.sending;
    let ok = false, code = null, data = null;
    try {
      const res = await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ds_url: v.ds_url, rating: v.rating, comment: v.comment, name: v.name, email: v.email,
          website: v.website, lang, report: reportData() }),
      });
      try { data = await res.json(); } catch { data = null; }
      ok = res.ok && data && data.ok === true;
      code = data && data.code;
    } catch { code = null; }
    button.disabled = false;
    if (ok) {
      sent = true; draft = null; render();
      const h = document.getElementById("done-title");
      if (h) h.focus();
      return;
    }
    if (code === "INVALID_FIELD") return showErrors([data && data.field === "email" ? { id: "email", msg: t.eEmail } : { id: "ds_url", msg: t.eUrlFormat }]);
    status.className = "status bad";
    status.textContent = code === "FEEDBACK_UNAVAILABLE" ? t.eUnavailable : code === "RATE_LIMITED" ? t.eRate : t.eGeneric;
  }

  function setLang(l) {
    if (!sent && document.getElementById("fb")) draft = values();
    lang = l === "en" ? "en" : "es";
    try { localStorage.setItem("agentic-ds-lang", lang); } catch {}
    render();
  }
  document.getElementById("btn-es").addEventListener("click", () => setLang("es"));
  document.getElementById("btn-en").addEventListener("click", () => setLang("en"));
  render();
})();
