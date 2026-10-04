// Proxy de salida para el navegador.
//
// Un navegador no hace una petición: hace decenas (scripts, datos, marcos,
// workers, WebSockets), y las decide el código de la página, que es ajeno. Para
// que ninguna pueda llegar a una dirección interna, TODO el tráfico del
// navegador sale por este proxy, y el proxy aplica la misma regla que el resto
// del evaluador: solo direcciones públicas.
//
// Además el proxy se conecta a la IP que él mismo validó, sin volver a resolver
// el nombre. Eso cierra, para el tráfico del navegador, el hueco de "DNS
// rebinding" (resolver público al validar y privado al conectar).
import http from "node:http";
import net from "node:net";

import { resolvePublicAddress } from "../ssrfGuard.js";

const DEFAULT_PORTS = new Set([80, 443]);
const SOCKET_IDLE_MS = 30000;

function splitHostPort(authority, defaultPort) {
  // "example.com:443", "[::1]:443", "example.com"
  const m = /^\[([^\]]+)\](?::(\d+))?$/.exec(authority) || /^([^:]+)(?::(\d+))?$/.exec(authority);
  if (!m) return null;
  const port = m[2] ? Number(m[2]) : defaultPort;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: m[1], port };
}

/**
 * resolveHost(hostname) -> { address } | lanza. Por defecto valida que sea pública.
 * En pruebas con un servidor local se inyecta uno que permite 127.0.0.1.
 * allowedPorts: null permite cualquiera (solo pruebas).
 */
export async function startEgressProxy({
  resolveHost = (h) => resolvePublicAddress(h),
  allowedPorts = DEFAULT_PORTS,
  maxBytes = 80 * 1024 * 1024,
  maxSockets = 60,
} = {}) {
  const sockets = new Set();
  const stats = { bytes: 0, requests: 0, blocked: 0, budgetExceeded: false };

  const track = (s) => {
    sockets.add(s);
    s.setTimeout(SOCKET_IDLE_MS, () => s.destroy());
    s.on("close", () => sockets.delete(s));
    s.on("error", () => {});
  };
  const count = (n) => {
    stats.bytes += n;
    if (stats.bytes > maxBytes && !stats.budgetExceeded) {
      stats.budgetExceeded = true;
      for (const s of sockets) s.destroy();
    }
  };
  const allowed = async (host, port) => {
    if (stats.budgetExceeded) throw new Error("Blocked: byte budget exceeded");
    if (sockets.size > maxSockets * 2) throw new Error("Blocked: too many connections");
    if (allowedPorts && !allowedPorts.has(port)) throw new Error(`Blocked: port ${port} not allowed`);
    const resolved = await resolveHost(host);
    return resolved.address;
  };

  const server = http.createServer(async (req, res) => {
    // Petición HTTP sin cifrar: llega con la dirección completa.
    stats.requests++;
    let target;
    try {
      target = new URL(req.url);
      if (target.protocol !== "http:") throw new Error("Blocked: only http here");
    } catch {
      stats.blocked++;
      res.writeHead(400).end();
      return;
    }
    let address;
    const port = Number(target.port) || 80;
    try {
      address = await allowed(target.hostname, port);
    } catch {
      stats.blocked++;
      res.writeHead(403).end();
      return;
    }
    const headers = { ...req.headers, host: target.host };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const upstream = http.request(
      { host: address, port, method: req.method, path: target.pathname + target.search, headers, timeout: SOCKET_IDLE_MS },
      (up) => {
        up.on("error", () => res.destroy());
        res.writeHead(up.statusCode || 502, up.headers);
        up.on("data", (d) => count(d.length));
        up.pipe(res);
      }
    );
    upstream.on("socket", track);
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.on("error", () => upstream.destroy());
    res.on("error", () => upstream.destroy());
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  });

  // Túnel para HTTPS: el navegador pide "CONNECT host:443" y cifra de punta a punta.
  server.on("connect", async (req, clientSocket, head) => {
    stats.requests++;
    track(clientSocket);
    const hp = splitHostPort(req.url || "", 443);
    let address;
    try {
      if (!hp) throw new Error("Blocked: bad authority");
      address = await allowed(hp.host, hp.port);
    } catch {
      stats.blocked++;
      clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = net.connect(hp.port, address);
    track(upstream);
    upstream.on("connect", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head && head.length) upstream.write(head);
      upstream.on("data", (d) => count(d.length));
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", () => {
      if (clientSocket.writable) clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    });
    clientSocket.on("close", () => upstream.destroy());
    upstream.on("close", () => clientSocket.destroy());
  });

  server.on("connection", track);
  server.on("clientError", (_err, socket) => socket.destroy());

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  return {
    port: server.address().port,
    stats,
    close: () => new Promise((resolve) => {
      for (const s of sockets) s.destroy();
      server.close(() => resolve());
      setTimeout(resolve, 500).unref();
    }),
  };
}
