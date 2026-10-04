// Proceso auxiliar de tests/browser-security.test.js: hace de "servidor" que
// arranca el navegador, avisa su PID y se queda vivo hasta que lo terminen.
import http from "node:http";
import { createRenderer } from "../../engine/src/crawler/renderer.js";

const site = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<body><main><h1>Ok</h1><p>${"texto de documentación ".repeat(20)}</p></main></body>`);
});
await new Promise((r) => site.listen(0, "127.0.0.1", r));
const renderer = createRenderer({
  resolveHost: async () => ({ address: "127.0.0.1" }), allowedPorts: null, idleCloseMs: 600000,
  lowMemory: process.env.LOW !== "0",
});
const out = await renderer.render(`http://ds.test:${site.address().port}/`, { timeoutMs: 20000 });
console.log(JSON.stringify({ ok: out.ok, pid: renderer.info().pid }));
setInterval(() => {}, 1000);
