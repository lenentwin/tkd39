"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { VkClient } = require("../src/vk-client");
const { token } = require("../src/security");

test("provider network, redirect, JSON and oversized response failures are redacted", async () => {
  for (const fetchImpl of [
    async () => { throw new Error("private-network-data"); },
    async () => new Response("secret", { status: 302 }),
    async () => new Response("not-json", { headers: { "Content-Type": "application/json" } }),
    async () => new Response("x".repeat(33000), { headers: { "Content-Type": "application/json" } }),
  ]) {
    const client = new VkClient({}, { fetchImpl });
    await assert.rejects(() => client.verify({ code: token(), state: token(), verifier: token(), deviceId: "fictional" }), { message: "Provider failure" });
  }
});
test("provider timeout aborts even while reading the response", async () => {
  const client = new VkClient({}, { timeoutMs: 15, fetchImpl: (url, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("timeout")))) });
  await assert.rejects(() => client.verify({ code: token(), state: token(), verifier: token(), deviceId: "fictional" }), { message: "Provider failure" });
});
