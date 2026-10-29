"use strict";
const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");
const token = () => randomBytes(32).toString("base64url");
const hash = value => createHash("sha256").update(value).digest("hex");
const challenge = value => createHash("sha256").update(value).digest("base64url");
function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length > 512 || b.length > 512) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function scalar(query, name, max = 2048) {
  const value = query[name];
  if (typeof value !== "string" || !value.length || value.length > max || /[\x00-\x20\x7f]/.test(value)) throw new Error("Invalid callback");
  return value;
}
module.exports = { token, hash, challenge, equal, scalar };
