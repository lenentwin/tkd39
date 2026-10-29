"use strict";
const http = require("node:http");
const { loadConfig } = require("../src/config");
const { createApp } = require("../src/app");
const { MemoryAuthStore } = require("../src/stores");
const { VkClient } = require("../src/vk-client");
const { token, challenge } = require("../src/security");
const assert = require("node:assert/strict");
const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const stop = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });

// A real loopback HTTP mock. It is never imported by src/server.js and cannot
// be enabled by environment variables or a production endpoint.
async function mockVk() {
  const codes = new Map(), tokens = new Map();
  const stats = { exchanges: 0, profiles: 0 };
  let onExchange;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const fields = new URLSearchParams(Buffer.concat(chunks).toString());
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/oauth2/auth") {
      stats.exchanges++;
      const row = codes.get(fields.get("code"));
      if (!row || row.state !== fields.get("state") || row.challenge !== challenge(fields.get("code_verifier") || "") || fields.get("device_id") !== "fictional-device") {
        res.writeHead(400); return res.end('{"error":"invalid_grant"}');
      }
      codes.delete(fields.get("code"));
      if (onExchange) { onExchange(); onExchange = undefined; }
      if (row.wait) await row.wait;
      if (row.fail) { res.writeHead(502); return res.end('{"error":"controlled_failure"}'); }
      const access = token();
      tokens.set(access, row);
      return res.end(JSON.stringify({ access_token: access, refresh_token: token(), id_token: "unused-untrusted-jwt",
        state: row.wrongState ? token() : row.state, token_type: "Bearer", expires_in: 600, user_id: row.subject || 900000001 }));
    }
    if (req.url === "/oauth2/user_info") {
      stats.profiles++;
      const row = tokens.get(fields.get("access_token"));
      if (!row) { res.writeHead(401); return res.end('{"error":"invalid_token"}'); }
      return res.end(JSON.stringify({ user: { user_id: row.mismatch ? 900000002 : row.subject || 900000001, first_name: "Вымышленный родитель", email: "never-retain@example.invalid", birthday: "never-retain" } }));
    }
    res.writeHead(404); res.end("{}");
  });
  await listen(server);
  return { server, stats, issue(flow, options = {}) {
    const code = token(); codes.set(code, { state: flow.state, challenge: flow.codeChallenge, ...options }); return code;
  }, started() { return new Promise(resolve => { onExchange = resolve; }); },
  fetchImpl: (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://id.vk.ru");
    assert.equal(parsed.search, "", "No credentials in provider URL");
    return fetch("http://127.0.0.1:" + server.address().port + parsed.pathname, options);
  } };
}
async function fixture(t, options = {}) {
  const vkMock = await mockVk();
  const server = http.createServer();
  await listen(server);
  const base = "http://127.0.0.1:" + server.address().port;
  const publicBase = options.secure ? base.replace("http:", "https:") : base;
  const config = loadConfig({ NODE_ENV: "test", BACKEND_URL: publicBase, FRONTEND_URL: options.frontendUrl === "same-origin" ? publicBase : options.frontendUrl || (options.secure ? "https:" : "http:") + "//127.0.0.1:5173/",
    ...(options.disabled ? {} : { VK_CLIENT_ID: "123456", VK_REDIRECT_URI: publicBase + "/auth/vk/callback" }) });
  const now = options.now || Date.now;
  const store = options.store || new MemoryAuthStore({ now });
  const events = [];
  const instance = createApp(config, { now, store, vk: new VkClient(config, { fetchImpl: vkMock.fetchImpl }),
    audit: event => events.push(event), limits: { global: 500, prepare: 100, callback: 100, ...options.limits } });
  server.on("request", instance.app);
  t.after(async () => { store.close(); await Promise.all([stop(server), stop(vkMock.server)]); });
  function client() {
    let cookie = "";
    return {
      get cookie() { return cookie; }, set cookie(value) { cookie = value; },
      async call(path, { method = "GET", headers = {}, body, origin = config.origin } = {}) {
        const response = await fetch(base + path, { method, redirect: "manual", headers: {
          ...(options.secure ? { "X-Forwarded-Proto": "https" } : {}),
          ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers,
        }, body: body === undefined ? undefined : JSON.stringify(body) });
        for (const line of response.headers.getSetCookie()) if (line.startsWith(config.cookieName + "=")) cookie = line.split(";")[0];
        return response;
      },
      async bootstrap() { const res = await this.call("/api/v1/session"); assert.equal(res.status, 200); return res.json(); },
      async prepare(csrf) { const res = await this.call("/auth/vk/prepare", { method: "POST", headers: { "X-CSRF-Token": csrf }, body: { completionUrl: config.completionUrl } }); assert.equal(res.status, 200); return res.json(); },
      callback(flow, code, suffix = "") { return this.call("/auth/vk/callback?" + new URLSearchParams({ state: flow.state, code, device_id: "fictional-device" }) + suffix, { origin: null }); },
    };
  }
  return { ...instance, config, base, vkMock, events, client };
}
module.exports = { fixture, listen, stop, mockVk };
