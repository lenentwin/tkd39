"use strict";
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createStaticServer } = require("./serve");
const { loadConfig } = require("../backend/src/config");

// Local development overlay only: never writes a real app ID into source files.
function createDevServer(config) {
  if (config.mode === "production") throw new Error("Development preview only");
  const frontend = new URL(config.frontendUrl), backend = new URL(config.backendUrl);
  if (frontend.protocol === "http:" && !["127.0.0.1", "localhost"].includes(frontend.hostname)) throw new Error("HTTP preview must stay on loopback");
  const prefix = frontend.pathname.replace(/\/$/, "");
  const preview = createStaticServer();
  return http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    if (req.headers.host !== frontend.host) { res.writeHead(421); return res.end(); }
    if (prefix && !req.url.startsWith(prefix + "/")) { res.writeHead(404); return res.end(); }
    if (prefix) req.url = req.url.slice(prefix.length);
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); return res.end(); }
    const urlPath = req.url.split("?")[0];
    if (urlPath === "/assets/js/auth-config.js") {
      const data = { backendBaseUrl: config.enabled ? config.backendUrl : null, appId: config.appId, redirectUri: config.redirectUri };
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      return res.end(req.method === "HEAD" ? undefined : "window.MFT39_AUTH_CONFIG=Object.freeze(" + JSON.stringify(data) + ");");
    }
    if (/^\/auth\/(login|account|callback)\.html$/.test(urlPath)) {
      try {
        const html = await fs.readFile(path.join(__dirname, "..", urlPath), "utf8");
        // Public Pages retains HTTPS-only connections; only this local response
        // allows the exact loopback backend configured by the developer.
        const rendered = html.replace("connect-src 'self' https:", "connect-src 'self' https: " + backend.origin);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(req.method === "HEAD" ? undefined : rendered);
      } catch { res.writeHead(500); return res.end("Preview unavailable"); }
    }
    preview.emit("request", req, res);
  });
}
if (require.main === module) {
  try {
    const config = loadConfig();
    const url = new URL(config.frontendUrl);
    const server = createDevServer(config);
    server.on("error", () => { console.error("Frontend preview could not start; check its port"); process.exitCode = 1; });
    const port = Number(process.env.FRONTEND_PORT || (url.protocol === "http:" ? url.port || 80 : 5173));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid frontend port");
    server.listen(port, "127.0.0.1", () => console.log("MFT39 local frontend ready"));
  } catch { console.error("Development configuration rejected"); process.exitCode = 1; }
}
module.exports = { createDevServer };
