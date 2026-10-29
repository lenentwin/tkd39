"use strict";
const { equal } = require("./security");

// Endpoints and fields verified against VKCOM/vkid-web-sdk v2.6.1 auth.ts.
// All sensitive parameters are sent in form bodies, never in request URLs.
const VK_ORIGIN = "https://id.vk.ru";
class VkClient {
  constructor(config, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }
  async post(path, fields) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(VK_ORIGIN + path, { method: "POST", redirect: "error",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields), signal: controller.signal });
      if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) throw new Error("Provider failure");
      const reader = response.body.getReader();
      let size = 0;
      const chunks = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 32768) { await reader.cancel(); throw new Error("Provider failure"); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!data || typeof data !== "object" || Array.isArray(data) || data.error) throw new Error("Provider failure");
      return data;
    } catch { throw new Error("Provider failure"); }
    finally { clearTimeout(timeout); }
  }
  async verify({ code, deviceId, state, verifier }) {
    const data = await this.post("/oauth2/auth", { grant_type: "authorization_code", client_id: String(this.config.appId),
      redirect_uri: this.config.redirectUri, code, device_id: deviceId, state, code_verifier: verifier });
    if (!equal(data.state, state) || typeof data.access_token !== "string" || !data.access_token || data.access_token.length > 8192 ||
        !/^bearer$/i.test(data.token_type || "") || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error("Provider failure");
    const subject = validSubject(data.user_id);
    const profile = await this.post("/oauth2/user_info", { client_id: String(this.config.appId), access_token: data.access_token });
    if (!profile.user || validSubject(profile.user.user_id) !== subject) throw new Error("Provider identity mismatch");
    // Neither JWT contents nor browser-supplied IDs are accepted as identity.
    // Access/refresh/id tokens are discarded; only the verified subject survives.
    const firstName = profile.user.first_name;
    const displayName = typeof firstName === "string" ? firstName.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 100) : "";
    return { subject, displayName };
  }
}
function validSubject(value) {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value <= 0)) throw new Error("Invalid provider subject");
  if (!["string", "number"].includes(typeof value) || !/^[1-9][0-9]{0,19}$/.test(String(value))) throw new Error("Invalid provider subject");
  return String(value);
}
module.exports = { VkClient };
