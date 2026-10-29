"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { isPublicPath } = require("./serve");
const { check } = require("./public-check");
const root = path.resolve(__dirname, "..");
async function buildPages() {
  const result = check();
  if (result.findings.length) throw new Error("Public index check failed");
  const out = path.join(root, "dist", "pages");
  await fs.mkdir(path.dirname(out), { recursive: true });
  // Never recursively remove an unchecked path or a junction/symlink.
  if (await fs.realpath(path.dirname(out)) !== path.dirname(out)) throw new Error("Unsafe output parent");
  try {
    if ((await fs.lstat(out)).isSymbolicLink() || await fs.realpath(out) !== out) throw new Error("Unsafe output path");
    await fs.rm(out, { recursive: true });
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await fs.mkdir(out);
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const copied = [];
  for (const file of files) {
    if (!isPublicPath("/" + file) && !["CNAME", "LICENSE"].includes(file)) continue;
    const source = path.join(root, file);
    if (await fs.realpath(source) !== source || (await fs.lstat(source)).isSymbolicLink()) throw new Error("Asset link rejected");
    const destination = path.join(out, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    // Use the reviewed index bytes, never a local development override.
    const bytes = execFileSync("git", ["show", ":" + file], { cwd: root, maxBuffer: 30 * 1024 * 1024 });
    await fs.writeFile(destination, bytes);
    copied.push(file);
  }
  await fs.writeFile(path.join(out, ".nojekyll"), "");
  console.log("Pages artifact: " + copied.length + " static files; no backend, dependencies or private configuration");
  return { out, copied };
}
if (require.main === module) buildPages().catch(() => { console.error("Pages artifact validation failed"); process.exitCode = 1; });
module.exports = { buildPages };
