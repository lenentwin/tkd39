"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const { fixture, listen, stop } = require("../backend/tests/helpers");
const { createDevServer } = require("./dev");

// Acceptance inventory: actual loopback API + cookies/CORS/CSRF + pinned SDK;
// successful fictional VK exchange, reload, second browser, logout, denial,
// forged success flags, API outage, browser storage and 390px/1440px layouts.
(async () => {
  const cleanups = [];
  let browser;
  try {
    const sdk = await fs.readFile(process.env.MFT39_SDK_BUNDLE || path.join(__dirname, "..", "test-results", "auth", "vkid-sdk-2.6.1.js"));
    const frontend = http.createServer();
    await listen(frontend);
    cleanups.push(() => stop(frontend));
    const frontendUrl = "http://127.0.0.1:" + frontend.address().port + "/project/";
    const f = await fixture({ after: cb => cleanups.push(cb) }, { frontendUrl });
    const overlay = createDevServer(f.config);
    frontend.on("request", (req, res) => overlay.emit("request", req, res));
    browser = await chromium.launch({ channel: process.env.MFT39_BROWSER || "msedge", headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const errors = [], outgoing = [];
    let deny = false;
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1") return route.continue();
      outgoing.push(url.origin + url.pathname);
      if (url.hostname === "unpkg.com") return route.fulfill({ contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" }, body: sdk });
      if (url.hostname === "id.vk.ru" && url.pathname === "/authorize") {
        assert.equal(url.searchParams.get("client_id"), "123456");
        assert.equal(url.searchParams.get("redirect_uri"), f.config.redirectUri);
        const flow = { state: url.searchParams.get("state"), codeChallenge: url.searchParams.get("code_challenge") };
        const callback = new URL(f.config.redirectUri);
        callback.searchParams.set("state", flow.state);
        if (deny) callback.searchParams.set("error", "access_denied");
        else {
          callback.searchParams.set("code", f.vkMock.issue(flow));
          callback.searchParams.set("device_id", "fictional-device");
        }
        return route.fulfill({ status: 303, headers: { Location: callback.href }, body: "" });
      }
      if (["fetch", "xhr"].includes(route.request().resourceType())) {
        assert.doesNotMatch(url.pathname, /\/oauth2\//, "No browser token exchange");
        return route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": f.config.origin, "Access-Control-Allow-Credentials": "true" }, body: '{"response":1}' });
      }
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    const state = expected => page.waitForFunction(value => document.body.dataset.authState === value, expected);
    const fit = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.goto(frontendUrl + "auth/login.html");
    await state("anonymous");
    await page.locator("#auth-login").click();
    await state("authenticated");
    assert.equal(page.url(), f.config.completionUrl);
    const cookies = await context.cookies(f.base);
    const sessionCookie = cookies.find(cookie => cookie.name === f.config.cookieName);
    assert.ok(sessionCookie?.httpOnly);
    assert.equal(sessionCookie.sameSite, "Lax");
    assert.doesNotMatch(await page.evaluate(() => document.cookie), /mft39_dev_session/);
    const storage = await page.evaluate(async () => ({ local: { ...localStorage }, session: { ...sessionStorage }, databases: indexedDB.databases ? await indexedDB.databases() : [] }));
    assert.deepEqual(storage, { local: {}, session: {}, databases: [] });
    await page.locator("#auth-account").click();
    await state("authenticated");
    await page.reload(); await state("authenticated");
    assert.match(await page.locator("#auth-description").innerText(), /Вымышленный родитель/);
    const output = path.join(__dirname, "..", "test-results", "backend");
    await fs.mkdir(output, { recursive: true });
    await fit();
    await page.screenshot({ path: path.join(output, "account-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await fit();
    await page.screenshot({ path: path.join(output, "account-mobile.png"), fullPage: true });
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(frontendUrl + "auth/account.html");
    await otherPage.waitForFunction(() => document.body.dataset.authState === "anonymous");
    await other.close();
    await page.locator("#auth-logout").click();
    await state("anonymous");
    const old = await fetch(f.base + "/api/v1/me", { headers: { Origin: f.config.origin, Cookie: sessionCookie.name + "=" + sessionCookie.value } });
    assert.equal(old.status, 401);
    await page.goto(frontendUrl + "auth/account.html?success=1&authenticated=true&role=administrator");
    await state("anonymous");
    assert.equal(page.url(), frontendUrl + "auth/account.html");
    deny = true;
    await page.locator("#auth-login").click();
    await state("error");
    assert.equal(page.url(), f.config.completionUrl);
    await page.locator("#auth-retry").click();
    await state("anonymous");
    await context.route(f.base + "/api/**", route => route.abort());
    await page.reload(); await state("error");
    assert.equal(await page.locator("#auth-logout").isVisible(), false);
    assert.deepEqual(errors, []);
    assert.equal(f.vkMock.stats.exchanges, 1);
    console.log("Browser/backend acceptance passed: actual local session, cookie, CSRF/CORS, SDK redirect, reload, isolated browser, logout, denial, outage, storage, desktop/mobile");
    console.log("All external browser requests were intercepted; real VK login was not attempted");
  } finally {
    if (browser) await browser.close();
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
