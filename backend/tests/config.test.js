"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../src/config");

test("configuration rejects unsafe, incomplete and unimplemented deployments", () => {
  for (const env of [
    { NODE_ENV: "production" }, { SESSION_STORE: "postgres" }, { VK_CLIENT_ID: "123456" },
    { VK_CLIENT_ID: "no-number", VK_REDIRECT_URI: "http://127.0.0.1:3001/auth/vk/callback" },
    { BACKEND_URL: "http://example.com" }, { SESSION_SECRET: "too-short" }, { DEBUG: "*" },
    { BACKEND_URL: "https://api.example.com", FRONTEND_URL: "https://attacker.example.net" },
    { BACKEND_URL: "https://one.github.io", FRONTEND_URL: "https://two.github.io" },
    { VK_CLIENT_ID: "123456", VK_REDIRECT_URI: "http://127.0.0.1:3001/wrong" },
  ]) assert.throws(() => loadConfig(env));
});
test("same-site HTTPS cookies are host-only Lax with __Host prefix", () => {
  const config = loadConfig({ BACKEND_URL: "https://api.mft39.ru", FRONTEND_URL: "https://mft39.ru/project/" });
  assert.equal(config.secure, true);
  assert.equal(config.cookieName, "__Host-mft39_session");
  assert.equal(config.completionUrl, "https://mft39.ru/project/auth/callback.html");
});
