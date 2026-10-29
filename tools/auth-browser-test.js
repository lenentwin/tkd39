/* Local UI/contract tests with fictional backend responses, never real VK login.
 * Requires Playwright on NODE_PATH (or installed outside the public artifact).
 * Run: node tools/auth-browser-test.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const { createStaticServer } = require("./serve.js");

(async () => {
  const realSdk = process.env.MFT39_SDK_BUNDLE ? await fs.readFile(process.env.MFT39_SDK_BUNDLE) : null;
  const preview = createStaticServer();
  // Exercise GitHub project Pages paths without modifying actual hosting.
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/project/")) req.url = req.url.slice("/project".length);
    preview.emit("request", req, res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const checks = [];
  const output = path.join(__dirname, "..", "test-results", "auth");
  try {
    await fs.mkdir(output, { recursive: true });
    browser = await chromium.launch({ channel: process.env.MFT39_BROWSER || "msedge", headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const externalRequests = [];
    let configured = false, session = "anonymous", delay = false, prepare = "invalid", displayName = "Тестовый пользователь";
    let logoutFailed = false;
    let sessionRequests = 0, prepareRequests = 0, sdkRequests = 0;
    const csrf = "c".repeat(43);
    const fixtureConfig = { backendBaseUrl: "https://mft39-backend.invalid/", appId: 123456, redirectUri: "https://mft39-backend.invalid/auth/vk/callback" };
    await ctx.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname === "mft39-backend.invalid") {
        const headers = { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-credentials": "true" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "Content-Type, X-CSRF-Token" } });
        if (url.pathname === "/api/v1/session") {
          sessionRequests++;
          if (delay) await new Promise(resolve => setTimeout(resolve, 450));
          if (session === "error") return route.fulfill({ status: 503, headers, body: "{}" });
          if (session === "malformed") return route.fulfill({ status: 200, headers, body: JSON.stringify({ authenticated: "true", csrfToken: csrf }) });
          return route.fulfill({ status: 200, headers, body: JSON.stringify(session === "authenticated" ? { authenticated: true, csrfToken: csrf, user: { displayName } } : { authenticated: false, csrfToken: csrf }) });
        }
        if (url.pathname === "/api/v1/session/logout") {
          assert.equal(route.request().headers()["x-csrf-token"], csrf);
          if (logoutFailed) return route.fulfill({ status: 503, headers, body: "{}" });
          session = "anonymous";
          return route.fulfill({ status: 204, headers });
        }
        if (url.pathname === "/auth/vk/prepare") {
          prepareRequests++;
          assert.equal(JSON.parse(route.request().postData()).completionUrl, origin + "/project/auth/callback.html");
          return route.fulfill({ status: 200, headers, body: JSON.stringify({ state: prepare === "valid" ? "s".repeat(43) : "bad", codeChallenge: "p".repeat(43), expiresAt: Date.now() + 60000, appId: fixtureConfig.appId, redirectUri: fixtureConfig.redirectUri }) });
        }
        throw new Error("Unexpected fixture API");
      }
      if (url.hostname === "127.0.0.1") {
        if (configured && url.pathname.endsWith("/assets/js/auth-config.js")) return route.fulfill({ contentType: "application/javascript", body: "window.MFT39_AUTH_CONFIG=" + JSON.stringify(fixtureConfig) });
        return route.continue();
      }
      if (url.hostname === "unpkg.com") {
        sdkRequests++;
        if (realSdk) return route.fulfill({ contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: realSdk });
      }
      if (url.hostname === "id.vk.ru" && url.pathname === "/authorize") {
        return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Controlled SDK redirect destination</title>" });
      }
      if (realSdk && ["fetch", "xhr"].includes(route.request().resourceType())) {
        externalRequests.push(url.origin + url.pathname);
        assert.doesNotMatch(url.pathname, /\/oauth2\/(auth|user_info|public_info|logout)/, "No browser token exchange allowed");
        // SDK telemetry is a controlled fixture too; aborting it produces an
        // unhandled third-party fetch rejection during Config.init.
        return route.fulfill({ status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-credentials": "true" }, body: '{"response":1}' });
      }
      return route.abort(); // Never contact VK, embeds or any other real service.
    });
    const origin = "http://127.0.0.1:" + server.address().port;
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    const state = value => page.waitForFunction(expected => document.body.dataset.authState === expected, value);
    const fit = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Horizontal overflow");

    for (const base of ["/", "/project/"]) {
      await page.goto(origin + base + "auth/login.html");
      await state("unconfigured");
      assert.equal(await page.locator("#auth-login").isDisabled(), true);
      assert.match(await page.locator("#auth-title").innerText(), /Авторизация ещё не настроена/);
      await page.locator(".auth-back").click();
      await page.waitForURL(origin + base + "index.html");
      await page.locator(".vk-entry").click();
      await page.waitForURL(origin + base + "auth/login.html");
    }
    assert.equal(sessionRequests + prepareRequests + sdkRequests, 0);
    checks.push("root/project routes; disabled unconfigured login; no backend/SDK requests");
    await page.screenshot({ path: path.join(output, "login-desktop.png") });
    await page.goto(origin + "/project/index.html");
    await page.waitForFunction(() => [...document.querySelectorAll("#hero .reveal")].filter(el => el.getBoundingClientRect().top < innerHeight).every(el => Number(getComputedStyle(el).opacity) >= .99));
    await page.screenshot({ path: path.join(output, "public-desktop.png") });

    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(origin + "/project/auth/login.html");
      await fit();
      if (width === 390) await page.screenshot({ path: path.join(output, "login-mobile.png") });
      await page.goto(origin + "/project/index.html");
      await page.locator("#menu-toggle").click();
      await page.locator(".vk-entry").waitFor({ state: "visible" });
      await page.waitForFunction(() => Number(getComputedStyle(document.getElementById("site-nav")).opacity) >= .99);
      await fit();
      if (width === 390) await page.screenshot({ path: path.join(output, "public-mobile-menu.png") });
      await page.locator(".vk-entry").click();
      await page.waitForURL(origin + "/project/auth/login.html");
    }
    checks.push("320/390/768px login and public menu entry fit and navigate");
    await page.setViewportSize({ width: 1440, height: 1000 });
    configured = true;
    delay = true;
    await page.goto(origin + "/project/auth/account.html");
    await state("loading");
    await page.screenshot({ path: path.join(output, "account-loading.png") });
    await state("anonymous");
    delay = false;
    checks.push("loading → anonymous from backend session response");
    session = "authenticated";
    await page.locator("#auth-retry").click();
    await state("authenticated");
    assert.equal(await page.locator("#auth-logout").isVisible(), true);
    await page.screenshot({ path: path.join(output, "account-authorized-fixture.png") });
    logoutFailed = true;
    await page.locator("#auth-logout").click();
    await state("error");
    assert.doesNotMatch(await page.locator(".auth-card").innerText(), /Тестовый пользователь/);
    logoutFailed = false;
    await page.locator("#auth-retry").click();
    await state("authenticated");
    await page.locator("#auth-logout").click();
    await state("anonymous");
    checks.push("fictional authenticated DTO; CSRF logout; failed logout hides profile; server recheck");

    session = "error";
    await page.reload();
    await state("error");
    await page.screenshot({ path: path.join(output, "account-error.png") });
    session = "anonymous";
    await page.locator("#auth-retry").click();
    await state("anonymous");
    await page.goto(origin + "/project/auth/callback.html?code=FAKE_CODE&state=FAKE_STATE#access_token=FAKE_TOKEN");
    await state("error");
    assert.equal(new URL(page.url()).search + new URL(page.url()).hash, "");
    assert.doesNotMatch(await page.locator("body").innerText(), /FAKE_CODE|FAKE_STATE|FAKE_TOKEN/);
    await page.goto(origin + "/project/auth/account.html?success=true&authenticated=true");
    await state("anonymous");
    checks.push("API failure/retry; raw OAuth callback rejected and scrubbed; success query ignored");

    session = "malformed";
    await page.reload();
    await state("error");
    session = "anonymous";
    fixtureConfig.appId = null;
    await page.reload();
    await state("unconfigured");
    fixtureConfig.appId = 123456;
    const originalBase = fixtureConfig.backendBaseUrl;
    fixtureConfig.backendBaseUrl = "javascript:alert(1)";
    await page.reload();
    await state("error");
    fixtureConfig.backendBaseUrl = originalBase;
    session = "authenticated";
    displayName = "<img src=x onerror=alert(1)>";
    await page.goto(origin + "/project/auth/callback.html");
    await state("authenticated");
    assert.equal(await page.locator(".auth-card img").count(), 0);
    assert.match(await page.locator("#auth-description").innerText(), /<img/);
    await page.locator("#auth-account").click();
    await page.waitForURL(origin + "/project/auth/account.html");
    await state("authenticated");
    await page.evaluate(() => localStorage.setItem("lg-scheme", "light"));
    await page.reload();
    await state("authenticated");
    assert.equal(await page.locator("html").getAttribute("data-scheme"), "light");
    await page.screenshot({ path: path.join(output, "account-light-fixture.png") });
    await page.evaluate(() => localStorage.removeItem("lg-scheme"));
    displayName = "Тестовый пользователь";
    session = "anonymous";
    await page.reload();
    await state("anonymous");
    checks.push("malformed session and invalid/partial config fail closed; clean callback uses session; text-only profile; shared light theme");

    await page.locator("#auth-login").click();
    await state("error");
    assert.equal(prepareRequests, 1);
    assert.equal(sdkRequests, 0);
    checks.push("invalid prepared state rejected before SDK");

    // A test double checks the SDK adapter contract; never executes real VK login.
    if (!realSdk) await page.addInitScript(() => {
      const append = Node.prototype.appendChild;
      Node.prototype.appendChild = function (node) {
        if (node.tagName === "SCRIPT" && node.src.startsWith("https://unpkg.com/@vkid/sdk@2.6.1/")) {
          window.__sdkAttributes = { integrity: node.integrity, crossOrigin: node.crossOrigin };
          window.VKIDSDK = { ConfigAuthMode: { Redirect: "redirect" }, Config: { init(config) { window.__sdkConfig = config; } }, Auth: { login() { window.__sdkCalled = true; return Promise.resolve(); } } };
          queueMicrotask(() => node.onload());
          return node;
        }
        return append.call(this, node);
      };
    });
    prepare = "valid";
    await page.goto(origin + "/project/auth/login.html");
    await state("anonymous");
    if (realSdk) {
      const authorization = page.waitForRequest(request => {
        const url = new URL(request.url());
        return url.hostname === "id.vk.ru" && url.pathname === "/authorize";
      });
      await page.locator("#auth-login").click();
      const url = new URL((await authorization).url());
      assert.equal(url.searchParams.get("state"), "s".repeat(43));
      assert.equal(url.searchParams.get("code_challenge"), "p".repeat(43));
      assert.equal(url.searchParams.get("redirect_uri"), fixtureConfig.redirectUri);
      assert.equal(url.searchParams.get("response_type"), "code");
      assert.equal(url.searchParams.get("client_id"), String(fixtureConfig.appId));
      assert.equal(url.searchParams.get("code_challenge_method").toLowerCase(), "s256");
      assert.equal(url.searchParams.has("code_verifier"), false);
      checks.push("real pinned SDK + SRI builds correct code/state/challenge redirect; destination intercepted, no VK contact");
    } else {
    await page.locator("#auth-login").click();
    await page.waitForFunction(() => window.__sdkCalled === true);
    const sdk = await page.evaluate(() => ({ config: window.__sdkConfig, attributes: window.__sdkAttributes }));
    assert.equal(sdk.config.codeChallenge, "p".repeat(43));
    assert.equal(sdk.config.state, "s".repeat(43));
    assert.equal(sdk.config.redirectUrl, fixtureConfig.redirectUri);
    assert.equal(sdk.config.mode, "redirect");
    assert.equal(sdk.config.codeVerifier, undefined);
    assert.match(sdk.attributes.integrity, /^sha384-/);
    assert.equal(sdk.attributes.crossOrigin, "anonymous");
    assert.equal(await page.locator("body").getAttribute("data-auth-state"), "loading");
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    checks.push("SDK test double receives server state/challenge and backend callback; SDK result does not authenticate; no persistent token storage");
    }
    assert.deepEqual(pageErrors, []);
    await ctx.close();
    console.log(JSON.stringify({ checks, pageErrors, interceptedSdkTelemetry: externalRequests, screenshots: output, realVkLoginTested: false }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
