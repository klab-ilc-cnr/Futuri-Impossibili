#!/usr/bin/env node
// Proxy locale che replica le regole Apache di klab per il basePath.
// vinext serve /_next/static/* solo alla root: il proxy riscrive
// /futuri-impossibili/_next/static/* -> /_next/static/* e inoltra tutto a
// vinext start (upstream). Nessuna dipendenza esterna.
// Utilizzo: node deploy/local-proxy.mjs  (dopo `npm run build:deploy` e `npm run start`)

import { createServer, request as upstreamRequest } from "node:http";

const PREFIX = process.env.LOCAL_PROXY_PREFIX ?? "/futuri-impossibili";
const UPSTREAM_HOST = process.env.LOCAL_PROXY_UPSTREAM_HOST ?? "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.LOCAL_PROXY_UPSTREAM_PORT ?? 3000);
const PORT = Number(process.env.LOCAL_PROXY_PORT ?? process.env.PORT ?? 3001);

const server = createServer((clientReq, clientRes) => {
  const path = clientReq.url ?? "/";
  const rewrittenPath = path.startsWith(`${PREFIX}/_next/static`)
    ? path.slice(PREFIX.length)
    : path;

  const proxyReq = forward(rewrittenPath, clientReq, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.statusMessage, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on("error", (error) => {
    console.error(`[local-proxy] ${path} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}: ${error.message}`);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "text/plain; charset=UTF-8" });
    }
    clientRes.end(`Proxy: upstream ${UPSTREAM_HOST}:${UPSTREAM_PORT} non raggiungibile. Avvia prima \`npm run start\`.`);
  });

  clientRes.on("close", () => proxyReq.destroy());
  clientReq.pipe(proxyReq);
});

function forward(rewrittenPath, clientReq, onResponse) {
  const headers = { ...clientReq.headers };
  delete headers.host;
  return upstreamRequest(
    {
      hostname: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: clientReq.method,
      path: rewrittenPath,
      headers,
    },
    onResponse,
  );
}

server.listen(PORT, () => {
  console.log(`[local-proxy] http://localhost:${PORT}${PREFIX}/  ->  http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
});