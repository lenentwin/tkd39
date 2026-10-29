"use strict";
const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const cwd = path.join(__dirname, "..");
const executable = process.argv[2] ? path.resolve(process.argv[2]) : "gitleaks";
const probe = spawnSync(executable, ["version"], { encoding: "utf8", shell: false });
if (probe.error || probe.status !== 0) {
  console.error("Install Gitleaks from its official release and provide its executable path"); process.exitCode = 1;
} else {
  let current = "";
  try { current = execFileSync("git", ["config", "--local", "--get", "core.hooksPath"], { cwd, encoding: "utf8" }).trim(); } catch { /* No custom hooks. */ }
  if (current && current !== ".githooks") throw new Error("Existing custom hooks must be reviewed before replacing");
  if (!current && fs.existsSync(path.join(cwd, ".git", "hooks", "pre-commit"))) throw new Error("Existing pre-commit hook must be preserved and reviewed");
  if (process.platform !== "win32") fs.chmodSync(path.join(cwd, ".githooks", "pre-commit"), 0o755);
  execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], { cwd });
  if (process.argv[2]) execFileSync("git", ["config", "--local", "mft39.gitleaks", executable], { cwd });
  console.log("Commit guard installed locally. Reinstall on each new checkout; CI must also validate commits.");
}
