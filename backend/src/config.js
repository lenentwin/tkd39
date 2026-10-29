"use strict";
const { randomBytes } = require("node:crypto");
const { getDomain } = require("tldts");

function loadConfig(env = process.env) {
  const mode = env.NODE_ENV || "development";
  if (!["development", "test", "production"].includes(mode)) throw new Error("Invalid NODE_ENV");
  const url = (value, field, trailingSlash = false) => {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error("Invalid " + field); }
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash ||
        (parsed.protocol !== "https:" && !(mode !== "production" && loopback && parsed.protocol === "http:"))) {
      throw new Error("Invalid " + field);
    }
    if (trailingSlash && !parsed.pathname.endsWith("/")) parsed.pathname += "/";
    return parsed;
  };
  const backend = url(env.BACKEND_URL || "http://127.0.0.1:3001", "BACKEND_URL");
  const frontend = url(env.FRONTEND_URL || "http://127.0.0.1:5173/", "FRONTEND_URL", true);
  if (backend.pathname !== "/") throw new Error("BACKEND_URL must be an origin");
  // Lax cookies require a same-site topology. Avoid silent fallback to None.
  const backendSite = getDomain(backend.hostname, { allowPrivateDomains: true });
  const frontendSite = getDomain(frontend.hostname, { allowPrivateDomains: true });
  if (backend.protocol !== frontend.protocol ||
      !(backend.hostname === frontend.hostname || (backendSite && backendSite === frontendSite))) {
    throw new Error("Unsupported cookie topology; use same-site frontend and API");
  }
  const appId = env.VK_CLIENT_ID ? Number(env.VK_CLIENT_ID) : null;
  const enabled = appId !== null || Boolean(env.VK_REDIRECT_URI);
  let redirectUri = null;
  if (enabled) {
    if (!Number.isSafeInteger(appId) || appId <= 0 || !env.VK_REDIRECT_URI) throw new Error("VK configuration is incomplete");
    redirectUri = url(env.VK_REDIRECT_URI, "VK_REDIRECT_URI").href;
    if (redirectUri !== new URL("auth/vk/callback", backend).href) throw new Error("VK_REDIRECT_URI must match the backend callback");
  }
  if (env.VK_CLIENT_SECRET) throw new Error("This PKCE public-client integration does not use VK_CLIENT_SECRET");
  if (env.DEBUG || env.NODE_DEBUG) throw new Error("Disable verbose dependency logging for authentication");
  const storage = env.SESSION_STORE || "memory";
  if (storage !== "memory") throw new Error("The requested storage adapter is not implemented");
  if (mode === "production") throw new Error("Production is disabled until durable storage and deployment review are implemented");
  const secret = env.SESSION_SECRET || randomBytes(48).toString("base64url");
  if (!/^[A-Za-z0-9_-]{43,256}$/.test(secret)) throw new Error("SESSION_SECRET must contain at least 32 random bytes in base64url");
  function integer(name, fallback, min, max) {
    const value = env[name] === undefined || env[name] === "" ? fallback : Number(env[name]);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error("Invalid " + name);
    return value;
  }
  const idleTtlMs = integer("SESSION_IDLE_SECONDS", 1800, 300, 86400) * 1000;
  return Object.freeze({ mode, backendUrl: backend.href, frontendUrl: frontend.href,
    origin: frontend.origin, appId, redirectUri, enabled, secret, secure: backend.protocol === "https:",
    cookieName: backend.protocol === "https:" ? "__Host-mft39_session" : "mft39_dev_session",
    port: integer("PORT", backend.protocol === "http:" ? Number(backend.port || 80) : 3001, 1, 65535),
    completionUrl: new URL("auth/callback.html", frontend).href,
    oauthTtlMs: integer("OAUTH_TTL_SECONDS", 300, 60, 300) * 1000,
    anonymousTtlMs: 10 * 60 * 1000,
    idleTtlMs, absoluteTtlMs: integer("SESSION_ABSOLUTE_SECONDS", 28800, idleTtlMs / 1000, 604800) * 1000,
  });
}
module.exports = { loadConfig };
