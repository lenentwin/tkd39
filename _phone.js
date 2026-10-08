/* Запуск мобильной версии сайта с эмуляцией экрана iPhone 17 Pro Max.
 * Открывает Edge в отдельном профиле, включает удалённую отладку и через CDP
 * задаёт метрики устройства: 440x956 CSS px, DPR 3, мобильный UA + touch.
 * Запуск: node _phone.js
 */
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9222;
const USER_DIR = path.join(os.tmpdir(), "edge-iphone17pm");
const URL = "http://localhost:5173/";

// iPhone 17 Pro Max (логическое разрешение 440 x 956, физическое 1320 x 2868, DPR 3)
const DEVICE = {
  width: 440,
  height: 956,
  deviceScaleFactor: 3,
  mobile: true,
  ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

const send = (ws, id, method, params = {}) => {
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => {
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === id) { ws.removeEventListener("message", onMsg); resolve(m); }
    };
    ws.addEventListener("message", onMsg);
  });
};

(async () => {
  // чистим прошлые запуски
  try { spawn("taskkill", ["/F", "/IM", "msedge.exe"], { stdio: "ignore" }); } catch (_) {}
  await new Promise((r) => setTimeout(r, 1200));

  spawn(EDGE, [
    "--remote-debugging-port=" + PORT,
    "--remote-allow-origins=*",
    "--user-data-dir=" + USER_DIR,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=" + DEVICE.width + "," + DEVICE.height,
    "about:blank",
  ], { detached: true, stdio: "ignore" }).unref();

  // ждём появления цели
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const list = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
      target = list.find((t) => t.type === "page");
    } catch (_) {}
  }
  if (!target) { console.error("Edge не поднялся на порту " + PORT); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 1;
  // метрики устройства (настоящий мобильный вьюпорт)
  await send(ws, id++, "Emulation.setDeviceMetricsOverride", {
    width: DEVICE.width,
    height: DEVICE.height,
    deviceScaleFactor: DEVICE.deviceScaleFactor,
    mobile: DEVICE.mobile,
    screenWidth: DEVICE.width,
    screenHeight: DEVICE.height,
  });
  await send(ws, id++, "Emulation.setUserAgentOverride", { userAgent: DEVICE.ua });
  await send(ws, id++, "Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  await send(ws, id++, "Page.enable", {});
  await send(ws, id++, "Page.navigate", { url: URL });
  await new Promise((r) => setTimeout(r, 1800));

  const read = `(()=>{const n=document.querySelector('#site-nav');const cs=n?getComputedStyle(n):null;
    return {device:'iPhone 17 Pro Max',css:'440 x 956',dpr:window.devicePixelRatio,
      innerW:window.innerWidth,innerH:window.innerHeight,
      touch:'ontouchstart' in window,
      navBg:cs?cs.backgroundColor:'(no .nav)',
      navBlur:cs?cs.backdropFilter:'',
      burger:!!document.querySelector('#menu-toggle')};})()`;
  const r = await send(ws, id++, "Runtime.evaluate", { expression: read, returnByValue: true });
  const val = r && r.result && (r.result.result ? r.result.result.value : r.result.value);
  console.log(JSON.stringify(val, null, 2));

  // открываем мобильное меню и проверяем «шторку»
  const openMenu = `(()=>{const b=document.querySelector('#menu-toggle');if(!b)return'нет кнопки';
    b.click();return'tap';})()`;
  await send(ws, id++, "Runtime.evaluate", { expression: openMenu, returnByValue: true });
  await new Promise((r) => setTimeout(r, 500));
  const readMenu = `(()=>{const n=document.querySelector('#site-nav');const cs=getComputedStyle(n);
    return {open:n.classList.contains('open'),display:cs.display,bg:cs.backgroundColor,
      blur:cs.backdropFilter,radius:cs.borderRadius,links:n.querySelectorAll('a').length};})()`;
  const r2 = await send(ws, id++, "Runtime.evaluate", { expression: readMenu, returnByValue: true });
  const val2 = r2 && r2.result && (r2.result.result ? r2.result.result.value : r2.result.value);
  console.log("\nМобильное меню (после тапа по ☰):");
  console.log(JSON.stringify(val2, null, 2));
  console.log("\nОкно Edge открыто. Адрес: " + URL);
  process.exit(0);
})();
