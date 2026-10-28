// Formulario de feedback: valida lo que manda la página y lo envía por correo.
//
// Sin base de datos: cada envío se manda como correo de texto plano a una sola
// dirección y no se guarda en el servidor. El correo sale por la API HTTP de
// Resend (https://resend.com), no por SMTP: el plan gratuito de Render bloquea
// los puertos SMTP (25, 465 y 587) desde septiembre de 2025.
//
// Configuración (variables de entorno en Render; nunca en el código ni en el
// repositorio):
//   RESEND_API_KEY        clave de la API de Resend (secreta)
//   FEEDBACK_TO_EMAIL     dirección que recibe el feedback
//   FEEDBACK_FROM_EMAIL   remitente (opcional). Por defecto el de pruebas de
//                         Resend, que solo puede escribir al correo de la cuenta.
// Sin RESEND_API_KEY o FEEDBACK_TO_EMAIL el formulario responde «no disponible»
// en vez de fingir un envío.

export const FEEDBACK_LIMITS = {
  ds_url: 500,
  comment: 5000,
  name: 120,
  email: 200,
};
export const RATINGS = [1, 2, 3, 4, 5];
const DEFAULT_FROM = "Agentic DS <onboarding@resend.dev>";
const RESEND_URL = "https://api.resend.com/emails";
const DIMS = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"];

const clean = (v, max) =>
  typeof v === "string"
    ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max)
    : "";
// Una sola línea: para el asunto y campos cortos (evita encabezados inyectados).
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, " ");
const num = (v, min, max) => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : null;
};

// Devuelve { ok: true, value } o { ok: false, code, field }.
export function validateFeedback(body) {
  if (!body || typeof body !== "object") return { ok: false, code: "BAD_REQUEST" };
  // Trampa para robots: un campo oculto que una persona nunca llena.
  if (typeof body.website === "string" && body.website.trim() !== "") return { ok: false, code: "SPAM" };

  const ds_url = oneLine(body.ds_url, FEEDBACK_LIMITS.ds_url);
  const rating = Number(body.rating);
  const comment = clean(body.comment, FEEDBACK_LIMITS.comment);
  const name = oneLine(body.name, FEEDBACK_LIMITS.name);
  const email = oneLine(body.email, FEEDBACK_LIMITS.email);

  if (!ds_url) return { ok: false, code: "MISSING_FIELD", field: "ds_url" };
  try {
    const u = new URL(ds_url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("protocol");
  } catch {
    return { ok: false, code: "INVALID_FIELD", field: "ds_url" };
  }
  if (!RATINGS.includes(rating)) return { ok: false, code: "MISSING_FIELD", field: "rating" };
  if (email && !looksLikeEmail(email)) return { ok: false, code: "INVALID_FIELD", field: "email" };

  // Datos del informe: los manda el navegador, así que solo se aceptan si tienen
  // la forma esperada, y el correo los marca como enviados por la página.
  let report = null;
  const r = body.report;
  if (r && typeof r === "object") {
    const dims = {};
    for (const d of DIMS) {
      const v = r.dimensions && r.dimensions[d];
      dims[d] = v === null ? null : num(v, 0, 100);
    }
    report = {
      rules_version: /^\d+(\.\d+){0,3}$/.test(String(r.rules_version || "")) ? String(r.rules_version) : null,
      global_score: r.global_score === null ? null : num(r.global_score, 0, 100),
      readiness_level: /^[A-Za-zÁÉÍÓÚáéíóú ]{1,30}$/.test(String(r.readiness_level || "")) ? String(r.readiness_level) : null,
      mode: r.mode === "demo" ? "demo" : r.mode === "live" ? "live" : null,
      evaluated_at: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(String(r.evaluated_at || "")) ? String(r.evaluated_at) : null,
      dimensions: dims,
    };
  }
  const lang = body.lang === "en" ? "en" : "es";
  return { ok: true, value: { ds_url, rating, comment, name, email, report, lang } };
}

const looksLikeEmail = (s) => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(s);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const show = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

// Correo en texto plano (sin HTML: nada de lo escrito se interpreta).
export function buildFeedbackEmail(fb, { now = new Date() } = {}) {
  const subject = `Feedback Agentic DS: ${hostOf(fb.ds_url)} (${fb.rating}/5)`.slice(0, 180);
  const lines = [
    "Nuevo feedback del evaluador Agentic DS",
    "",
    `Design System (URL): ${fb.ds_url}`,
    `Valoración del resultado: ${fb.rating} de 5`,
    `Nombre: ${show(fb.name)}`,
    `Correo: ${show(fb.email)}`,
    `Idioma de la página: ${fb.lang}`,
    `Recibido: ${now.toISOString()}`,
    "",
    "Comentario:",
    fb.comment || "—",
    "",
  ];
  if (fb.report) {
    const r = fb.report;
    lines.push(
      "Datos del informe (los envía la página; no se verificaron en el servidor):",
      `  Versión de reglas: ${show(r.rules_version)}`,
      `  Modo: ${show(r.mode)}`,
      `  Evaluado: ${show(r.evaluated_at)}`,
      `  Puntuación global: ${show(r.global_score)}${r.readiness_level ? ` (${r.readiness_level})` : ""}`,
      ...DIMS.map((d) => `  ${d}: ${r.dimensions[d] === null ? "sin puntaje" : show(r.dimensions[d])}`),
      "",
    );
  } else {
    lines.push("Datos del informe: no se enviaron.", "");
  }
  const email = { subject, text: lines.join("\n") };
  if (fb.email && looksLikeEmail(fb.email)) email.reply_to = fb.email;
  return email;
}

export function feedbackConfig(env = process.env) {
  const apiKey = (env.RESEND_API_KEY || "").trim();
  const to = (env.FEEDBACK_TO_EMAIL || "").trim();
  const from = (env.FEEDBACK_FROM_EMAIL || "").trim() || DEFAULT_FROM;
  return { configured: Boolean(apiKey && to), apiKey, to, from, url: (env.FEEDBACK_API_URL || "").trim() || RESEND_URL };
}

// Envía el correo. Devuelve { ok, status, code }. Nunca incluye la clave ni el
// contenido en lo que devuelve o registra.
export async function sendFeedbackEmail(fb, { env = process.env, fetchImpl = fetch, timeoutMs = 10_000, now } = {}) {
  const cfg = feedbackConfig(env);
  if (!cfg.configured) return { ok: false, status: 503, code: "FEEDBACK_UNAVAILABLE" };
  const email = buildFeedbackEmail(fb, { now });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(cfg.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "AgenticDS-feedback/1.0",
      },
      body: JSON.stringify({ from: cfg.from, to: [cfg.to], subject: email.subject, text: email.text, ...(email.reply_to ? { reply_to: email.reply_to } : {}) }),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true, status: 200, code: "SENT" };
    return { ok: false, status: 502, code: "FEEDBACK_SEND_FAILED", provider_status: res.status };
  } catch {
    return { ok: false, status: 502, code: "FEEDBACK_SEND_FAILED", provider_status: null };
  } finally {
    clearTimeout(timer);
  }
}
