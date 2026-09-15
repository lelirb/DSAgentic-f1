// Injectable so tests never touch the real network (section 12 principle extended
// to the crawler: must be testable in isolation, no external dependency required).
//
// MAX_BODY_BYTES: without this, a malicious or just misconfigured target site
// could return an arbitrarily large (or slow-drip) response body and exhaust
// this server's memory — res.text() alone has no size limit. Checked twice:
// once cheaply via Content-Length when present (fast rejection, but that
// header can be missing or lie), and authoritatively via a running byte count
// while streaming the body, which is what actually enforces the limit.
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB — generous for HTML/JSON docs

// SSRF FIX (redirects): fetch() follows redirects by default, so a public URL
// that answers "302 Location: http://169.254.169.254/..." used to be followed
// straight to an internal host — assertPublicHost() only ever saw the FIRST URL.
// Now redirects are followed manually, and every hop is re-validated with
// hostCheck before any request is sent to it. hostCheck is injectable (null in
// fully mocked tests, same convention as pipeline.js's ssrfCheck).
const MAX_REDIRECTS = 5;

// Honest, identifiable UA. Node's default UA is generic and some hosts block it;
// this also lets a DS team see in their logs who crawled them.
const DEFAULT_HEADERS = {
  "user-agent": "AgenticDS/1.0 (Design System agent-readiness evaluator)",
  accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.5",
};

async function fetchFollowingSafeRedirects(url, { fetchImpl, signal, hostCheck }) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (hostCheck) await hostCheck(current);
    const res = await fetchImpl(current, { signal, redirect: "manual", headers: DEFAULT_HEADERS });
    const location = res.status >= 300 && res.status < 400 && res.headers && res.headers.get && res.headers.get("location");
    if (!location) return { res, finalUrl: current };
    const next = new URL(location, current);
    if (!/^https?:$/.test(next.protocol)) throw new Error(`Blocked: redirect to non-http(s) URL ${next.protocol}`);
    if (res.body && typeof res.body.cancel === "function") res.body.cancel().catch(() => {});
    current = next.toString();
  }
  throw new Error(`TOO_MANY_REDIRECTS (> ${MAX_REDIRECTS})`);
}

export async function fetchWithTimeout(
  url,
  { timeoutMs = 10000, fetchImpl = fetch, maxBodyBytes = MAX_BODY_BYTES, hostCheck = null } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { res, finalUrl } = await fetchFollowingSafeRedirects(url, { fetchImpl, signal: controller.signal, hostCheck });
    const contentType = (res.headers && res.headers.get && res.headers.get("content-type")) || "";

    const declaredLength = res.headers && res.headers.get && res.headers.get("content-length");
    if (declaredLength && Number(declaredLength) > maxBodyBytes) {
      return {
        ok: false, status: res.status, url: finalUrl, contentType, body: null,
        error: "TOO_LARGE", errorMessage: `Declared Content-Length ${declaredLength} exceeds ${maxBodyBytes}-byte limit`,
      };
    }

    let body = null;
    if (/text|json|javascript/.test(contentType) || contentType === "") {
      body = await readBodyWithLimit(res, maxBodyBytes);
      if (body === null) {
        return {
          ok: false, status: res.status, url: finalUrl, contentType, body: null,
          error: "TOO_LARGE", errorMessage: `Response body exceeded ${maxBodyBytes}-byte limit while streaming`,
        };
      }
    }
    // Binary responses (images, PDFs) are not read: release the connection now
    // instead of leaving it open until garbage collection.
    if (body === null && res.body && typeof res.body.cancel === "function") res.body.cancel().catch(() => {});
    return { ok: res.ok, status: res.status, url: finalUrl, contentType, body, error: null };
  } catch (err) {
    // Section 45: a technical error must never silently become NOT_FOUND.
    const msg = err.message || "";
    const kind =
      err.name === "AbortError" ? "TIMEOUT"
      : /^Blocked:/.test(msg) ? "BLOCKED"
      : /^TOO_MANY_REDIRECTS/.test(msg) ? "TOO_MANY_REDIRECTS"
      : "NETWORK_ERROR";
    return { ok: false, status: null, url, contentType: null, body: null, error: kind, errorMessage: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function readBodyWithLimit(res, maxBytes) {
  // Test mocks in this project implement only `.text()`, not a real streaming
  // `.body` — fall back cleanly so every existing test keeps working unchanged.
  if (!res.body || typeof res.body.getReader !== "function") {
    const text = await res.text();
    return Buffer.byteLength(text, "utf-8") > maxBytes ? null : text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let result = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return null;
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}
