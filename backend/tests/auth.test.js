"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers");
const { token } = require("../src/security");

test("PKCE preparation, verified profile, rotated cookie, session and logout", async t => {
  const f = await fixture(t), c = f.client();
  assert.equal((await c.call("/api/v1/me")).status, 401);
  const anonymous = await c.bootstrap(), previousCookie = c.cookie;
  assert.equal(anonymous.authenticated, false);
  const flow = await c.prepare(anonymous.csrfToken);
  assert.match(flow.state, /^[\w-]{43}$/);
  assert.match(flow.codeChallenge, /^[\w-]{43}$/);
  assert.equal(flow.verifier, undefined);
  const row = [...f.store.flows.values()][0];
  assert.notEqual(row.verifier, flow.codeChallenge);
  assert.equal(f.store.flows.has(flow.state), false, "Only the state hash is stored");
  const callback = await c.callback(flow, f.vkMock.issue(flow));
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get("location"), f.config.completionUrl);
  assert.match(callback.headers.get("set-cookie"), /HttpOnly/);
  assert.match(callback.headers.get("set-cookie"), /SameSite=Lax/);
  assert.doesNotMatch(callback.headers.get("set-cookie"), /Domain=/i);
  assert.notEqual(c.cookie, previousCookie, "Login rotates session identifier");
  const session = await (await c.call("/api/v1/session")).json();
  assert.equal(session.authenticated, true);
  assert.equal(session.user.role, "parent");
  assert.notEqual(session.csrfToken, anonymous.csrfToken);
  assert.doesNotMatch(JSON.stringify(session), /access_token|refresh_token|id_token|900000001|birthday|email|verifier/);
  assert.equal((await c.call("/api/v1/me")).status, 200);
  const old = f.client(); old.cookie = previousCookie;
  assert.equal((await old.call("/api/v1/me")).status, 401);
  const logout = await c.call("/api/v1/session/logout", { method: "POST", body: {}, headers: { "X-CSRF-Token": session.csrfToken } });
  assert.equal(logout.status, 204);
  assert.equal((await c.call("/api/v1/me")).status, 401);
  assert.deepEqual(f.events, ["oauth_prepared", "oauth_completed", "session_revoked"]);
});

test("wrong state and another browser cannot consume a legitimate attempt", async t => {
  const f = await fixture(t), a = f.client(), b = f.client();
  const flow = await a.prepare((await a.bootstrap()).csrfToken);
  const code = f.vkMock.issue(flow);
  await b.bootstrap();
  assert.match((await b.callback(flow, code)).headers.get("location"), /auth_error=login_failed$/);
  assert.match((await a.callback({ ...flow, state: token() }, code)).headers.get("location"), /auth_error=/);
  assert.equal(f.vkMock.stats.exchanges, 0);
  assert.equal((await a.callback(flow, code)).headers.get("location"), f.config.completionUrl);
});

test("expired attempt is rejected before any provider call", async t => {
  let now = Date.now();
  const f = await fixture(t, { now: () => now }), c = f.client();
  const flow = await c.prepare((await c.bootstrap()).csrfToken);
  now += f.config.oauthTtlMs + 1;
  assert.match((await c.callback(flow, f.vkMock.issue(flow))).headers.get("location"), /auth_error=/);
  assert.equal(f.vkMock.stats.exchanges, 0);
});

test("wrong PKCE verifier and expired authorization code fail closed", async t => {
  const f = await fixture(t), c = f.client();
  let flow = await c.prepare((await c.bootstrap()).csrfToken);
  const code = f.vkMock.issue(flow);
  [...f.store.flows.values()][0].verifier = token();
  assert.match((await c.callback(flow, code)).headers.get("location"), /auth_error=/);
  flow = await c.prepare((await c.bootstrap()).csrfToken);
  assert.match((await c.callback(flow, token())).headers.get("location"), /auth_error=/);
  assert.equal((await c.call("/api/v1/me")).status, 401);
});

test("idle expiry on the server rejects a cookie which the caller keeps sending", async t => {
  let now = Date.now();
  const f = await fixture(t, { now: () => now }), c = f.client();
  const flow = await c.prepare((await c.bootstrap()).csrfToken);
  await c.callback(flow, f.vkMock.issue(flow));
  now += f.config.idleTtlMs + 1000;
  assert.equal((await c.call("/api/v1/me")).status, 401);
  assert.equal((await c.bootstrap()).authenticated, false);
});

test("parallel callback and replay execute one exchange only", async t => {
  const f = await fixture(t), c = f.client();
  const flow = await c.prepare((await c.bootstrap()).csrfToken), code = f.vkMock.issue(flow);
  const cookie = c.cookie;
  const other = f.client(); other.cookie = cookie;
  const responses = await Promise.all([c.callback(flow, code), other.callback(flow, code)]);
  assert.equal(responses.filter(r => r.headers.get("location") === f.config.completionUrl).length, 1);
  assert.equal(f.vkMock.stats.exchanges, 1);
  const replay = f.client(); replay.cookie = cookie;
  assert.match((await replay.callback(flow, code)).headers.get("location"), /auth_error=/);
});

test("a new prepare replaces the browser's previous invitation to OAuth", async t => {
  const f = await fixture(t), c = f.client();
  const csrf = (await c.bootstrap()).csrfToken;
  const first = await c.prepare(csrf), second = await c.prepare(csrf);
  assert.match((await c.callback(first, f.vkMock.issue(first))).headers.get("location"), /auth_error=/);
  assert.equal((await c.callback(second, f.vkMock.issue(second))).headers.get("location"), f.config.completionUrl);
});

for (const [label, options] of Object.entries({ "provider failure": { fail: true }, "token state mismatch": { wrongState: true }, "subject mismatch": { mismatch: true } })) {
  test(label + " cannot create an authenticated session", async t => {
    const f = await fixture(t), c = f.client();
    const flow = await c.prepare((await c.bootstrap()).csrfToken), code = f.vkMock.issue(flow, options);
    const response = await c.callback(flow, code);
    assert.match(response.headers.get("location"), /auth_error=login_failed$/);
    assert.equal((await c.call("/api/v1/me")).status, 401);
    assert.equal(f.store.users.size, 0);
    await c.callback(flow, code);
    assert.equal(f.vkMock.stats.exchanges, 1, "Failed attempt is consumed too");
  });
}

test("denial and duplicate callback parameters fail without leaking provider text", async t => {
  const f = await fixture(t), c = f.client();
  let flow = await c.prepare((await c.bootstrap()).csrfToken);
  const denial = await c.callback(flow, "unused", "&error=access_denied&error_description=private-provider-text");
  assert.doesNotMatch(denial.headers.get("location"), /private-provider-text|access_denied/);
  flow = await c.prepare((await c.bootstrap()).csrfToken);
  await c.callback(flow, "unused", "&state=duplicate");
  assert.equal(f.vkMock.stats.exchanges, 0);
});

test("Origin, CSRF, content type, redirects, privilege fields and unknown routes", async t => {
  const f = await fixture(t), c = f.client(), csrf = (await c.bootstrap()).csrfToken;
  for (const origin of ["https://evil.example", "null", null]) {
    const res = await c.call("/auth/vk/prepare", { method: "POST", origin, body: { completionUrl: f.config.completionUrl }, headers: { "X-CSRF-Token": csrf } });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  }
  assert.equal((await c.call("/auth/vk/prepare", { method: "POST", body: { completionUrl: f.config.completionUrl } })).status, 403);
  assert.equal((await c.call("/api/v1/session/logout", { method: "POST", body: {}, headers: { "X-CSRF-Token": token() } })).status, 403);
  for (const body of [{ completionUrl: "https://evil.example" }, { completionUrl: f.config.completionUrl, role: "administrator" }, { completionUrl: f.config.completionUrl, userId: "arbitrary" }]) {
    assert.equal((await c.call("/auth/vk/prepare", { method: "POST", body, headers: { "X-CSRF-Token": csrf } })).status, 400);
  }
  const res = await fetch(f.base + "/auth/vk/prepare", { method: "POST", headers: { Origin: f.config.origin, Cookie: c.cookie, "Content-Type": "text/plain", "X-CSRF-Token": csrf }, body: "{}" });
  assert.equal(res.status, 403);
  for (const path of ["/debug/login", "/admin", "/api/v1/students", "/.env", "/src/server.js"]) assert.equal((await c.call(path)).status, 404);
});

test("credentialed CORS is exact and preflight is bounded", async t => {
  const f = await fixture(t);
  const preflight = await fetch(f.base + "/auth/vk/prepare", { method: "OPTIONS", headers: { Origin: f.config.origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-csrf-token" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), f.config.origin);
  assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
  assert.match(preflight.headers.get("vary"), /Origin/);
  const evil = await fetch(f.base + "/api/v1/session", { headers: { Origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
  const header = await fetch(f.base + "/auth/vk/prepare", { method: "OPTIONS", headers: { Origin: f.config.origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization" } });
  assert.equal(header.status, 403);
});

test("trusted loopback TLS termination sets Secure, HttpOnly, host-only __Host cookie", async t => {
  const f = await fixture(t, { secure: true }), c = f.client();
  const response = await c.call("/api/v1/session");
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /^__Host-mft39_session=/);
  for (const flag of ["Secure", "HttpOnly", "Path=/", "SameSite=Lax"]) assert.ok(cookie.includes(flag));
  assert.doesNotMatch(cookie, /Domain=/i);
});

test("same-origin GET fetch works without Origin, without admitting cross-site reads", async t => {
  const f = await fixture(t, { frontendUrl: "same-origin" }), c = f.client();
  const headers = { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" };
  assert.equal((await c.call("/api/v1/session", { origin: null, headers })).status, 200);
  assert.equal((await c.call("/api/v1/session", { origin: null })).status, 403);
  assert.equal((await c.call("/api/v1/session", { origin: "https://evil.example", headers })).status, 403);
  assert.equal((await c.call("/api/v1/session", { origin: null, headers: { ...headers, "Sec-Fetch-Site": "cross-site" } })).status, 403);
});

test("malformed and oversized JSON are rejected without internal details", async t => {
  const f = await fixture(t), c = f.client();
  const csrf = (await c.bootstrap()).csrfToken;
  for (const [body, status] of [["{", 400], [JSON.stringify({ completionUrl: "x".repeat(3000) }), 413]]) {
    const response = await fetch(f.base + "/auth/vk/prepare", { method: "POST", headers: { Origin: f.config.origin, Cookie: c.cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" }, body });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: "invalid_request" });
  }
});

test("two independent first logins map to one identity, roles stay server-assigned", async t => {
  const f = await fixture(t), a = f.client(), b = f.client();
  const flows = await Promise.all([a, b].map(async c => c.prepare((await c.bootstrap()).csrfToken)));
  await Promise.all([a.callback(flows[0], f.vkMock.issue(flows[0]), "&role=administrator&user_id=1"), b.callback(flows[1], f.vkMock.issue(flows[1]))]);
  const profiles = await Promise.all([a, b].map(async c => (await c.call("/api/v1/me")).json()));
  assert.equal(profiles[0].user.id, profiles[1].user.id);
  assert.equal(profiles[0].user.role, "parent");
  assert.equal(f.store.users.size, 1);
});

test("logout cancels an in-flight exchange; a late callback cannot resurrect access", async t => {
  const f = await fixture(t), c = f.client();
  const csrf = (await c.bootstrap()).csrfToken, flow = await c.prepare(csrf);
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const started = f.vkMock.started();
  const callback = c.callback(flow, f.vkMock.issue(flow, { wait }));
  await started;
  const logout = await c.call("/api/v1/session/logout", { method: "POST", body: {}, headers: { "X-CSRF-Token": csrf } });
  assert.equal(logout.status, 204);
  release();
  assert.match((await callback).headers.get("location"), /auth_error=/);
  assert.equal((await c.call("/api/v1/me")).status, 401);
});

test("absolute expiry and tampered signed cookie remove access", async t => {
  let now = Date.now();
  const f = await fixture(t, { now: () => now }), c = f.client();
  const flow = await c.prepare((await c.bootstrap()).csrfToken);
  await c.callback(flow, f.vkMock.issue(flow));
  const old = c.cookie;
  c.cookie = old.slice(0, -3) + "bad";
  assert.equal((await c.call("/api/v1/me")).status, 401);
  c.cookie = old;
  now += f.config.absoluteTtlMs + 1;
  assert.equal((await c.call("/api/v1/me")).status, 401);
});

test("configuration absence disables authentication honestly", async t => {
  const f = await fixture(t, { disabled: true }), c = f.client();
  assert.equal((await c.call("/health")).status, 200);
  const response = await c.call("/api/v1/session");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "auth_not_configured");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("storage failure is a generic failure, never a fabricated successful session", async t => {
  const f = await fixture(t), c = f.client();
  await c.bootstrap();
  f.store.get = (sid, cb) => cb(new Error("private-storage-details"));
  const response = await c.call("/api/v1/session");
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private-storage-details|stack/);
  assert.deepEqual(f.events, ["request_failed"]);
});

test("OAuth endpoints rate-limit controlled repeated calls", async t => {
  const f = await fixture(t, { limits: { prepare: 2 } }), c = f.client();
  const csrf = (await c.bootstrap()).csrfToken;
  await c.prepare(csrf); await c.prepare(csrf);
  const response = await c.call("/auth/vk/prepare", { method: "POST", body: { completionUrl: f.config.completionUrl }, headers: { "X-CSRF-Token": csrf } });
  assert.equal(response.status, 429);
  assert.ok(response.headers.get("retry-after"));
});
