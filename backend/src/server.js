"use strict";
const http = require("node:http");
const { loadConfig } = require("./config");
const { createApp } = require("./app");
try {
  const config = loadConfig();
  const { app, store } = createApp(config, { audit: event => process.stdout.write(JSON.stringify({ event }) + "\n") });
  const server = http.createServer({ maxHeaderSize: 16384 }, app);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on("error", () => { console.error("Backend could not start"); store.close(); process.exitCode = 1; });
  // Local only. An HTTPS tunnel or production listener is never started here.
  server.listen(config.port, "127.0.0.1", () => {
    console.log("MFT39 auth backend listening on loopback; " + (config.enabled ? "VK configured" : "VK disabled: configuration required"));
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { store.close(); server.close(); });
} catch {
  console.error("Backend configuration rejected; check private environment and configuration instructions");
  process.exitCode = 1;
}
