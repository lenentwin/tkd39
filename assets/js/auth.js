/* Authentication is established exclusively by a configured
 * backend session. OAuth codes, query flags and SDK events never sign users in.
 */
(function () {
  "use strict";
  const scriptUrl = document.currentScript.src;
  const siteRoot = new URL("../../", scriptUrl);
  const body = document.body;
  const title = document.getElementById("auth-title");
  const description = document.getElementById("auth-description");
  const card = document.querySelector(".auth-card");
  const login = document.getElementById("auth-login");
  const account = document.getElementById("auth-account");
  const retry = document.getElementById("auth-retry");
  const logout = document.getElementById("auth-logout");
  const pageKind = body.dataset.authPage;
  let settings = null;
  let csrf = null;
  let generation = 0;
  let sdkPromise = null;

  // Reuse the site's appearance preference only; no authentication in storage.
  try {
    const scheme = localStorage.getItem("lg-scheme");
    document.documentElement.dataset.scheme = ["light", "dark"].includes(scheme)
      ? scheme : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  } catch { /* Storage may be unavailable; the HTML default remains usable. */ }

  // Strip all callback material before API/SDK requests; never echo or persist it.
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  const unexpectedOAuth = ["code", "state", "device_id", "access_token", "refresh_token", "id_token", "error"]
    .some(key => query.has(key) || fragment.has(key));
  const loginFailed = pageKind === "callback" && query.has("auth_error");
  if (location.search || location.hash) history.replaceState(null, "", location.pathname);

  function render(state, heading, message) {
    body.dataset.authState = state;
    card.setAttribute("aria-busy", String(state === "loading"));
    title.textContent = heading;
    description.textContent = message;
    login.hidden = state === "authenticated" || state === "loading";
    login.disabled = state !== "anonymous";
    account.hidden = state !== "authenticated" || pageKind === "account";
    logout.hidden = state !== "authenticated";
    retry.hidden = !settings || state === "loading" || state === "authenticated";
  }

  function unconfigured() {
    csrf = null;
    render("unconfigured", "Авторизация ещё не настроена", "Вход пока недоступен. Пожалуйста, попробуйте позже.");
  }

  function failure(message) {
    render("error", "Не удалось проверить вход", message || "Сервис входа недоступен. Попробуйте проверить ещё раз.");
  }

  function getSettings() {
    const config = window.MFT39_AUTH_CONFIG;
    if (!config || !config.backendBaseUrl || !config.appId || !config.redirectUri) return null;
    const base = new URL(config.backendBaseUrl);
    const redirect = new URL(config.redirectUri);
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
    if ((!Number.isSafeInteger(config.appId) || config.appId <= 0) ||
        (base.protocol !== "https:" && !(base.protocol === "http:" && loopback && location.protocol === "http:")) ||
        base.username || base.password || base.search || base.hash ||
        redirect.origin !== base.origin || redirect.username || redirect.password || redirect.search || redirect.hash) {
      throw new Error("Invalid public configuration");
    }
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    return { base, appId: config.appId, redirectUri: redirect.href };
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(new URL(path, settings.base), {
        ...options,
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: { Accept: "application/json", ...options.headers },
      });
      if (response.status === 401) return { authenticated: false };
      if (!response.ok) throw new Error("Backend unavailable");
      if (response.status === 204) return null;
      if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("Invalid response");
      const text = await response.text();
      if (text.length > 32768) throw new Error("Response too large");
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  function csrfValue(data) {
    return typeof data?.csrfToken === "string" && /^[A-Za-z0-9_-]{32,256}$/.test(data.csrfToken) ? data.csrfToken : null;
  }

  async function refresh() {
    if (!settings) return unconfigured();
    const current = ++generation;
    csrf = null;
    render("loading", "Проверяем вход", "Подождите немного…");
    try {
      const session = await request("api/v1/session");
      if (current !== generation) return;
      if (!session || typeof session.authenticated !== "boolean") throw new Error("Invalid session response");
      csrf = csrfValue(session);
      if (session.authenticated) {
        if (!csrf) throw new Error("Missing CSRF protection");
        const name = session.user?.displayName;
        render("authenticated", "Вы вошли в аккаунт", typeof name === "string" && name.length <= 100 ? "Здравствуйте, " + name + "." : "Вход подтверждён. Вы можете выйти из аккаунта в любой момент.");
      } else {
        render("anonymous", pageKind === "callback" ? "Вход не подтверждён" : "Вы не авторизованы", "Войдите через VK ID, чтобы открыть свой аккаунт.");
      }
    } catch {
      if (current === generation) failure();
    }
  }

  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = setTimeout(() => done(new Error("SDK unavailable")), 8000);
      function done(error) {
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); }
        else resolve(window.VKIDSDK);
      }
      script.src = "https://unpkg.com/@vkid/sdk@2.6.1/dist-sdk/umd/index.js";
      script.integrity = "sha384-ivJwdpd4aR/VZJeHbQ46TiWzqIinGmZHQOX52Ihx6mD+6UriEowpGrjwjDo7uQlf";
      script.crossOrigin = "anonymous";
      script.referrerPolicy = "no-referrer";
      script.onload = () => {
        if (!window.VKIDSDK?.Config?.init || !window.VKIDSDK?.Auth?.login || !window.VKIDSDK?.ConfigAuthMode?.Redirect) done(new Error("Invalid SDK"));
        else done();
      };
      script.onerror = () => done(new Error("SDK unavailable"));
      document.head.appendChild(script);
    }).catch(error => { sdkPromise = null; throw error; });
    return sdkPromise;
  }

  async function startLogin() {
    if (!settings || body.dataset.authState !== "anonymous") return;
    const current = ++generation;
    render("loading", "Подготовка входа", "Сейчас откроется страница VK ID.");
    try {
      if (!csrf) throw new Error("Missing CSRF protection");
      // Backend creates browser-bound state and stores the real PKCE verifier.
      const flow = await request("auth/vk/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
        body: JSON.stringify({ completionUrl: new URL("auth/callback.html", siteRoot).href }),
      });
      if (current !== generation) return;
      if (!flow || typeof flow.state !== "string" || typeof flow.codeChallenge !== "string" ||
          !/^[A-Za-z0-9_-]{43,128}$/.test(flow.state) ||
          !/^[A-Za-z0-9_-]{43}$/.test(flow.codeChallenge) ||
          !Number.isSafeInteger(flow.expiresAt) || flow.expiresAt <= Date.now() || flow.expiresAt > Date.now() + 300000 ||
          flow.appId !== settings.appId || flow.redirectUri !== settings.redirectUri) throw new Error("Invalid prepared flow");
      const sdk = await loadSdk();
      if (current !== generation) return;
      // Official SDK redirect mode, server-supplied S256 challenge. Never call
      // Auth.exchangeCode here: only the backend can establish the CRM session.
      sdk.Config.init({ app: settings.appId, redirectUrl: settings.redirectUri,
        state: flow.state, codeChallenge: flow.codeChallenge, scope: "",
        mode: sdk.ConfigAuthMode.Redirect });
      await sdk.Auth.login();
    } catch {
      if (current === generation) failure("Не удалось начать вход. Попробуйте проверить соединение и повторить попытку.");
    }
  }

  async function signOut() {
    if (!settings || body.dataset.authState !== "authenticated" || !csrf) return;
    const token = csrf;
    const current = ++generation;
    csrf = null;
    render("loading", "Выходим из аккаунта", "Подтверждаем завершение сессии…");
    try {
      await request("api/v1/session/logout", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: "{}" });
      if (current !== generation) return;
      // Check actual revocation; a successful POST alone is not a local login flag.
      await refresh();
    } catch {
      if (current === generation) failure("Не удалось подтвердить выход. Проверьте соединение и состояние входа ещё раз.");
    }
  }

  login.addEventListener("click", startLogin);
  retry.addEventListener("click", refresh);
  logout.addEventListener("click", signOut);
  window.addEventListener("pagehide", () => { ++generation; csrf = null; render("loading", "Проверяем вход", "Подождите немного…"); });
  window.addEventListener("pageshow", event => { if (event.persisted) refresh(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && settings) refresh(); });

  try { settings = getSettings(); }
  catch { failure("Настройки входа недоступны. Пожалуйста, попробуйте позже."); return; }
  if (!settings) unconfigured();
  else if (unexpectedOAuth) failure("Получен неподтверждённый возврат. Начните вход заново. Код из адресной строки не подтверждает вход.");
  else if (loginFailed) failure("Вход не завершён. Проверьте состояние аккаунта и начните вход заново.");
  else refresh();
})();
