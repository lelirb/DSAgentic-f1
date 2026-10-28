// Pie de página común: derechos reservados y enlaces a términos y privacidad.
// Lo agrega cada página con <footer id="site-footer"></footer> y este archivo.
// Sigue el idioma elegido (ES/EN) sin depender del código de cada página.
(function () {
  const TEXT = {
    es: { rights: "Todos los derechos reservados.", terms: "Términos y condiciones", privacy: "Política de privacidad" },
    en: { rights: "All rights reserved.", terms: "Terms and conditions", privacy: "Privacy policy" },
  };
  const YEAR = 2026;
  const el = document.getElementById("site-footer");
  if (!el) return;

  const style = document.createElement("style");
  style.textContent =
    "#site-footer{border-top:1px solid #E7EAF0;margin-top:48px;padding:20px 0 28px;}" +
    "#site-footer .ft{max-width:880px;margin:0 auto;padding:0 24px;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;justify-content:space-between;font-size:13px;color:#5B6472;}" +
    "#site-footer p{margin:0;}" +
    "#site-footer .links{display:flex;flex-wrap:wrap;gap:0 18px;}" +
    "#site-footer a{color:#2F46D6;font-weight:500;text-decoration:underline;text-underline-offset:2px;display:inline-block;padding:4px 0;}" +
    "@media print{#site-footer{display:none!important;}}";
  document.head.appendChild(style);

  const langNow = () => {
    const l = (document.documentElement.lang || "").slice(0, 2);
    if (l === "en" || l === "es") return l;
    try { return localStorage.getItem("agentic-ds-lang") === "en" ? "en" : "es"; } catch { return "es"; }
  };
  function render() {
    const t = TEXT[langNow()];
    el.innerHTML = `<div class="ft"><p>© ${YEAR} Agentic DS. ${t.rights}</p><p class="links"><a href="terminos.html">${t.terms}</a><a href="privacidad.html">${t.privacy}</a></p></div>`;
  }
  render();
  // Cada página cambia el idioma con sus botones ES/EN y actualiza <html lang>.
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
