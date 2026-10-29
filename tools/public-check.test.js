"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { check, forbiddenPath, secretKinds } = require("./public-check");
test("publication path policy blocks case variants, private files and dumps", () => {
  for (const file of ["README.md", "nested/a.MARKDOWN", "a.Md", "backend/.env", ".env.production", "a.key", "a.sql.gz", "backup/a.dump", "private/data.json", "backend/node_modules/a.js", "test-results/a.png"]) assert.equal(forbiddenPath(file), true, file);
  for (const file of ["backend/.env.example", "index.html", "assets/js/auth.js", "backend/package-lock.json"]) assert.equal(forbiddenPath(file), false, file);
});
test("additional scanning catches obvious secrets, not runtime expressions", () => {
  const fake = "a".repeat(45);
  assert.ok(secretKinds("SESSION_SECRET='" + fake + "'").length);
  assert.ok(secretKinds("postgresql://" + "fake:fictional@localhost/db").length);
  assert.ok(secretKinds("-----BEGIN " + "PRIVATE KEY-----").length);
  assert.deepEqual(secretKinds("const secret = randomBytes(48); SESSION_SECRET="), []);
});
test("guard reads staged bytes and blocks tracked Markdown despite ignore rules", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mft39-git-policy-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init");
  await fs.writeFile(path.join(dir, "example.js"), "const harmless = true;");
  git("add", "example.js");
  await fs.writeFile(path.join(dir, "example.js"), "SESSION_SECRET='" + "x".repeat(45) + "'");
  assert.equal(check({ cwd: dir }).findings.length, 0, "Unstaged bytes are not the prospective commit");
  git("add", "example.js");
  assert.equal(check({ cwd: dir }).findings[0].kind, "literal-secret");
  await fs.writeFile(path.join(dir, "README.MD"), "private");
  await fs.writeFile(path.join(dir, ".gitignore"), "*.MD\n");
  git("add", "-f", "README.MD");
  assert.ok(check({ cwd: dir }).findings.some(f => f.kind === "forbidden-file"));
});
