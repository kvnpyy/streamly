#!/usr/bin/env node
/**
 * TLS front for Next.js (`next start` on PORT → HTTPS on HTTPS_PORT).
 *
 * When `changeOrigin: true` alone is used, http-proxy rewrites Host to 127.0.0.1:PORT.
 * Turbopack/static routing in Next 16 then often 404s chunk/CSS URLs while HTML still loads
 * → unstyled HTML + ChunkLoadError. We keep changeOrigin (Node 25-safe URL target) but
 * restore the browser Host + forwarding headers so upstream matches the public URL.
 *
 * After `npm run build`, restart Next + this proxy and hard-refresh (⌘⇧R): old HTML can
 * reference deleted hashed chunks → 404 until cache is cleared.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const httpProxy = require("http-proxy");

const root = path.join(__dirname, "..");
const certDir = path.join(root, "node_modules/local-ssl-proxy/resources");
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || "3443", 10);
const TARGET_PORT = parseInt(process.env.PORT || "3000", 10);
/** Must be a URL string — `host`/`port` object + `changeOrigin` can crash `requires-port` (Node 25+). */
const target = `http://127.0.0.1:${TARGET_PORT}`;

const proxy = httpProxy.createServer({
  xfwd: true,
  ws: true,
  changeOrigin: true,
  target,
  ssl: {
    key: fs.readFileSync(path.join(certDir, "localhost-key.pem"), "utf8"),
    cert: fs.readFileSync(path.join(certDir, "localhost.pem"), "utf8"),
  },
});

function applyPublicHost(proxyReq, req) {
  const host = req.headers.host;
  if (host) {
    proxyReq.setHeader("Host", host);
    proxyReq.setHeader("X-Forwarded-Host", host);
  }
  proxyReq.setHeader("X-Forwarded-Proto", "https");
}

proxy.on("proxyReq", (proxyReq, req) => {
  applyPublicHost(proxyReq, req);
});

proxy.on("proxyReqWs", (proxyReq, req) => {
  applyPublicHost(proxyReq, req);
});

proxy.on("proxyRes", (proxyRes, req, res) => {
  const urlPath = (req.url || "").split("?")[0];
  // Turbopack/dev hashed chunks change on restart — caching `/_next/static/*` causes ChunkLoadError + blank UI.
  if (urlPath.startsWith("/_next/static/") || urlPath.startsWith("/_next/image")) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    return;
  }

  const ct = proxyRes.headers["content-type"];
  const s = ct ? String(ct).toLowerCase() : "";
  // Avoid stale document/RSC payloads pointing at old hashed chunks after rebuild or restart.
  if (
    s.includes("text/html") ||
    s.includes("text/x-component") ||
    s.includes("application/xhtml")
  ) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  }
});

proxy.on("error", (err, req, res) => {
  console.error("[https-proxy-front]", err.code || err.message);
  if (res && typeof res.writeHead === "function" && !res.headersSent) {
    try {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Bad gateway");
    } catch {
      /* noop */
    }
  }
});

proxy.listen(HTTPS_PORT);
console.error(
  `[https-proxy-front] https://0.0.0.0:${HTTPS_PORT} -> ${target} (Host preserved from client)`
);
