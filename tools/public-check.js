"use strict";
const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");

function forbiddenPath(name) {
  const normalized = name.toLowerCase();
  return /\.(md|markdown)$/.test(normalized) ||
    /(^|\/)(node_modules|private|docs-private|backups|exports|uploads|test-results|\.local|\.cache|dist|coverage)(\/|$)/.test(normalized) ||
    /(^|\/)\.env(?:\..*)?$/.test(normalized) && !/(^|\/)\.env\.example$/.test(normalized) ||
    /\.(pem|key|p12|pfx|crt|cer|jks|db|sqlite3?|dump|dmp|backup|log|sql|heapsnapshot)(?:[.-].*)?$/.test(normalized) ||
    /(?:^|\/)(?:credentials|secrets|config\.local)(?:[./]|$)/.test(normalized);
}
// Additional high-signal checks, not a replacement for Gitleaks or review.
function secretKinds(text) {
  return [
    ["private-key", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
    ["provider-token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|vk1\.[A-Za-z0-9_.-]{40,})\b/],
    ["credential-url", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:]+:[^\s/@]+@/i],
    ["literal-secret", /\b(?:client[_-]?secret|session[_-]?secret|access[_-]?token|refresh[_-]?token|password)\s*[=:]\s*["'][A-Za-z0-9_+/.=-]{24,}["']/i],
  ].filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
function git(args, cwd, encoding = "utf8") { return execFileSync("git", args, { cwd, encoding, maxBuffer: 30 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); }
function check({ cwd = path.join(__dirname, ".."), tree = null } = {}) {
  const files = (tree ? git(["ls-tree", "-r", "--name-only", "-z", tree], cwd) : git(["ls-files", "-z"], cwd)).split("\0").filter(Boolean);
  const findings = [];
  for (const name of files) {
    if (forbiddenPath(name)) { findings.push({ file: name, kind: "forbidden-file" }); continue; }
    const mode = (tree ? git(["ls-tree", tree, "--", name], cwd) : git(["ls-files", "--stage", "--", name], cwd)).slice(0, 6);
    if (["120000", "160000"].includes(mode)) { findings.push({ file: name, kind: "link-or-submodule" }); continue; }
    const bytes = git(["show", tree ? tree + ":" + name : ":" + name], cwd, null);
    if (bytes.includes(0)) continue;
    for (const kind of secretKinds(bytes.toString("utf8"))) findings.push({ file: name, kind });
  }
  return { files: files.length, findings };
}
function runGitleaks(cwd, staged) {
  let configured = "";
  try { configured = git(["config", "--local", "--get", "mft39.gitleaks"], cwd).trim(); } catch { /* PATH is the portable fallback. */ }
  const executable = process.env.GITLEAKS_BIN || configured || "gitleaks";
  const args = ["git", "--redact", "--no-banner", "--ignore-gitleaks-allow", ...(staged ? ["--pre-commit", "--staged"] : ["--log-opts=--all"]), "."];
  const result = spawnSync(executable, args, { cwd, encoding: "utf8", shell: false });
  // Keep scanner output redacted, including on failure; never print matched text.
  if (result.error || result.status !== 0) throw new Error("Gitleaks failed or found a potential secret. Inspect a redacted scan privately.");
  console.log(staged ? "Gitleaks: staged diff passed" : "Gitleaks: full history passed");
}
function scanHistory(cwd = path.join(__dirname, "..")) {
  const objects = git(["rev-list", "--objects", "--all"], cwd).trim().split("\n");
  const findings = [];
  let blobs = 0;
  for (const line of objects) {
    const [id, ...parts] = line.split(" ");
    if (!id || git(["cat-file", "-t", id], cwd).trim() !== "blob") continue;
    blobs++;
    const bytes = git(["cat-file", "blob", id], cwd, null);
    if (bytes.includes(0)) continue;
    for (const kind of secretKinds(bytes.toString("utf8"))) findings.push({ file: parts.join(" ") || id, kind });
  }
  return { blobs, findings };
}
if (require.main === module) {
  try {
    const treeArg = process.argv.find(arg => arg.startsWith("--tree="));
    const result = check({ tree: treeArg ? treeArg.slice(7) : null });
    for (const finding of result.findings) console.error(finding.kind + ": " + finding.file);
    if (result.findings.length) process.exitCode = 1;
    else {
      console.log("Public tree check passed: " + result.files + " files; no Markdown or prohibited files");
      if (process.argv.includes("--history-secrets")) {
        const history = scanHistory();
        for (const finding of history.findings) console.error("Historical " + finding.kind + ": " + finding.file);
        if (history.findings.length) throw new Error("Historical potential secret");
        console.log("Additional history pattern scan passed: " + history.blobs + " unique blobs");
      }
      if (process.argv.includes("--gitleaks")) runGitleaks(path.join(__dirname, ".."), !treeArg);
      if (process.argv.includes("--publication")) {
        const oldPaths = git(["-c", "core.quotepath=false", "log", "--all", "--format=", "--name-only"], path.join(__dirname, "..")).split(/\r?\n/).filter(Boolean);
        const prohibited = [...new Set(oldPaths)].filter(forbiddenPath);
        for (const name of prohibited) console.error("Publication blocked by historical private/prohibited path: " + name);
        if (prohibited.length) process.exitCode = 1;
      }
    }
  } catch { console.error("Public tree validation failed; scanner/configuration may be missing"); process.exitCode = 1; }
}
module.exports = { check, forbiddenPath, secretKinds, scanHistory };
