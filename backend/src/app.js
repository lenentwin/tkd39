"use strict";
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { token, hash, challenge, equal, scalar } = require("./security");
const { MemoryAuthStore } = require("./stores");
const { VkClient } = require("./vk-client");
const { promisify } = require("node:util");

function createApp(config, { store = new MemoryAuthStore(), vk = new VkClient(config), now = Date.now, audit = () => {}, limits = {} } = {}) {
  if (config.mode === "production" && store.kind === "memory") throw new Error("Memory storage is not suitable for production");
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.set("query parser", "simple");
  app.use(helmet({ strictTransportSecurity: false, crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use((req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Pragma": "no-cache", "Referrer-Policy": "no-referrer" });
    // Never log req.url: callback query strings contain OAuth credentials.
    if (req.url.length > 8192) return res.status(414).json({ error: "request_too_large" });
    const host = new URL(config.backendUrl).host;
    if (req.get("host") !== host) return res.status(421).json({ error: "invalid_host" });
    const origin = req.get("origin");
    res.vary("Origin");
    if (origin && origin !== config.origin) return res.status(403).json({ error: "origin_denied" });
    if (origin) res.set({ "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" });
    if (req.method === "OPTIONS") {
      if (!origin || !["GET", "POST"].includes(req.get("access-control-request-method"))) return res.sendStatus(403);
      const headers = (req.get("access-control-request-headers") || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
      if (headers.some(s => !["content-type", "x-csrf-token", "accept"].includes(s))) return res.sendStatus(403);
      res.set({ "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token, Accept", "Access-Control-Max-Age": "300" });
      return res.sendStatus(204);
    }
    if (req.method === "POST" && (origin !== config.origin || !req.is("application/json"))) return res.status(403).json({ error: "request_denied" });
    // Same-origin GET fetches often omit Origin. Accept Fetch Metadata only
    // when frontend and API really share an origin, never for sibling origins.
    const sameOriginFetch = !origin && new URL(config.backendUrl).origin === config.origin &&
      req.get("sec-fetch-site") === "same-origin" && ["cors", "same-origin"].includes(req.get("sec-fetch-mode")) && req.get("sec-fetch-dest") === "empty";
    if (req.path.startsWith("/api/") && req.method === "GET" && origin !== config.origin && !sameOriginFetch) return res.status(403).json({ error: "origin_denied" });
    next();
  });
  const limiter = (limit, windowMs = 60000) => rateLimit({ windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "rate_limited" }, passOnStoreError: false });
  app.use(limiter(limits.global || 120));
  app.get("/health", (req, res) => res.json({ status: "ok", authConfigured: config.enabled }));
  app.use((req, res, next) => {
    if (!config.enabled) return res.status(503).json({ error: "auth_not_configured" });
    next();
  });
  // HTTPS can be terminated only by a local trusted proxy. No forwarded client
  // IP is trusted; production proxy topology requires a separate reviewed setup.
  if (config.secure) app.set("trust proxy", "loopback");
  app.use(session({ name: config.cookieName, secret: config.secret, store,
    resave: false, saveUninitialized: false, rolling: true,
    genid: token,
    cookie: { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge: config.anonymousTtlMs } }));
  const clearCookie = res => res.clearCookie(config.cookieName, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/" });
  app.use(async (req, res, next) => {
    if (req.session.family && (req.session.deadline <= now() || !await store.familyActive(req.session.family))) {
      await store.revokeFamily(req.session.family);
      if (req.method === "GET" && req.path === "/api/v1/session") {
        await promisify(req.session.regenerate).call(req.session);
        return next();
      }
      await promisify(req.session.destroy).call(req.session);
      clearCookie(res);
      return res.status(401).json({ authenticated: false });
    }
    next();
  });
  const csrfCheck = async (req, res, next) => {
    if (!req.session.family || !await store.familyActive(req.session.family) || !equal(req.get("x-csrf-token"), req.session.csrf)) return res.status(403).json({ error: "csrf_denied" });
    next();
  };
  const profile = async req => req.session.userId ? store.getUser(req.session.userId) : null;
  app.get("/api/v1/session", async (req, res) => {
    if (!req.session.family) {
      req.session.deadline = now() + config.anonymousTtlMs;
      req.session.family = await store.newFamily(req.session.deadline);
      req.session.csrf = token();
    }
    const user = await profile(req);
    // authenticated:false is an explicit public session-state DTO, not a login.
    res.json({ authenticated: Boolean(user), csrfToken: req.session.csrf, ...(user ? { user } : {}) });
  });
  app.get("/api/v1/me", async (req, res) => {
    const user = await profile(req);
    if (!user) return res.status(401).json({ authenticated: false });
    res.json({ user });
  });
  app.post("/auth/vk/prepare", limiter(limits.prepare || 10), express.json({ limit: "2kb", strict: true }), csrfCheck, async (req, res) => {
    if (!req.body || Object.keys(req.body).length !== 1 || req.body.completionUrl !== config.completionUrl) return res.status(400).json({ error: "invalid_request" });
    if (req.session.userId) return res.status(409).json({ error: "already_authenticated" });
    const state = token(), verifier = token(), expiresAt = now() + config.oauthTtlMs;
    await store.putFlow(state, { verifier, expiresAt, binding: hash(req.sessionID), family: req.session.family });
    audit("oauth_prepared");
    res.json({ state, codeChallenge: challenge(verifier), expiresAt, appId: config.appId, redirectUri: config.redirectUri });
  });
  app.get("/auth/vk/callback", limiter(limits.callback || 20), async (req, res) => {
    let flow;
    try {
      const state = scalar(req.query, "state", 128);
      if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !req.session.family) throw new Error("Invalid state");
      flow = await store.takeFlow(state, hash(req.sessionID));
      if (!flow || flow.expiresAt <= now()) throw new Error("Invalid state");
      if (req.query.error) throw new Error("Authorization declined");
      const code = scalar(req.query, "code"), deviceId = scalar(req.query, "device_id");
      const identity = await vk.verify({ code, deviceId, state, verifier: flow.verifier });
      if (!await store.familyActive(flow.family)) throw new Error("Session revoked");
      const user = await store.upsertUser("vkid:" + config.appId, identity.subject, identity.displayName);
      const family = flow.family;
      await promisify(req.session.regenerate).call(req.session);
      req.session.deadline = now() + config.absoluteTtlMs;
      await store.extendFamily(family, req.session.deadline);
      req.session.family = family;
      req.session.userId = user.id;
      req.session.csrf = token();
      req.session.cookie.maxAge = config.idleTtlMs;
      await promisify(req.session.save).call(req.session);
      audit("oauth_completed");
      return res.redirect(303, config.completionUrl);
    } catch {
      audit("oauth_failed");
      // Only our own marker is sent to the frontend. Provider data never leaves.
      return res.redirect(303, config.completionUrl + "?auth_error=login_failed");
    } finally { if (flow) flow.verifier = undefined; }
  });
  app.post("/api/v1/session/logout", express.json({ limit: "2kb", strict: true }), csrfCheck, async (req, res) => {
    if (!req.body || Object.keys(req.body).length) return res.status(400).json({ error: "invalid_request" });
    await store.revokeFamily(req.session.family);
    await promisify(req.session.destroy).call(req.session);
    clearCookie(res);
    audit("session_revoked");
    res.sendStatus(204);
  });
  app.use((req, res) => res.status(404).json({ error: "not_found" }));
  app.use((error, req, res, next) => {
    audit("request_failed");
    if (res.headersSent) return res.destroy();
    const status = error.type === "entity.too.large" ? 413 : error.type === "entity.parse.failed" ? 400 : 503;
    res.status(status).json({ error: status === 503 ? "service_unavailable" : "invalid_request" });
  });
  return { app, store };
}
module.exports = { createApp };
