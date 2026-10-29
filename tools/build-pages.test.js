"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { buildPages } = require("./build-pages");

test("Pages artifact preserves the existing domain and excludes server/private files", async () => {
  const { out, copied } = await buildPages();
  assert.equal((await fs.readFile(path.join(out, "CNAME"), "utf8")).trim(), "mft39.ru");
  assert.match(await fs.readFile(path.join(out, "LICENSE"), "utf8"), /MIT License/);
  for (const name of ["index.html", "auth/login.html", "auth/account.html", "auth/callback.html", "assets/js/auth-config.js"]) assert.ok(copied.includes(name));
  assert.ok(copied.every(name => !/\.(md|markdown)$/i.test(name)));
  for (const name of ["backend", "tools", ".git", ".env", "node_modules", "test-results"]) await assert.rejects(fs.access(path.join(out, name)), { code: "ENOENT" });
  const config = await fs.readFile(path.join(out, "assets/js/auth-config.js"), "utf8");
  assert.match(config, /backendBaseUrl:\s*null/);
});
