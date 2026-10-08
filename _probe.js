/* Проба мобильной шторки: воспроизводим баг с backdrop-filter при повторном
 * открытии + измеряем выравнивание кнопок и текста. Пиксельная проверка
 * (brightness региона шторки) — потому что баг рендера в computed style не виден.
 * Запуск: node _probe.js
 */
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9222;
const USER_DIR = path.join(os.tmpdir(), "edge-iphone17pm");
const URL = "http://localhost:5173/";
const DEVICE = { width: 440, height: 956, deviceScaleFactor: 3, mobile: true,
  ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" };

const send = (ws, id, method, params = {}) => {
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => {
    const onMsg = (ev) => { const m = JSON.parse(ev.data); if (m.id === id) { ws.removeEventListener("message", onMsg); resolve(m); } };
    ws.addEventListener("message", onMsg);
  });
};
const val = (m) => m && m.result && (m.result.result ? m.result.result.value : m.result.value);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodePNG(buf) {
  let p = 8, w, h, ct, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 4, stride = w * ch, out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++], line = raw.subarray(pos, pos + stride); pos += stride;
    const o = y * stride, prev = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[o + x - ch] : 0, b = y > 0 ? out[prev + x] : 0, c = (x >= ch && y > 0) ? out[prev + x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      out[o + x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}
function stats(png) {
  let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < png.data.length; i += png.ch) {
    const l = 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
    s += l; s2 += l * l; n++;
  }
  const m = s / n;
  return { mean: +m.toFixed(1), sd: +Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(1), px: png.w + "x" + png.h };
}


(async () => {
  try { spawn("taskkill", ["/F", "/IM", "msedge.exe"], { stdio: "ignore" }); } catch (_) {}
  await sleep(900);
  spawn(EDGE, ["--remote-debugging-port=" + PORT, "--remote-allow-origins=*", "--user-data-dir=" + USER_DIR,
    "--no-first-run", "--no-default-browser-check", "--window-size=" + DEVICE.width + "," + DEVICE.height, "about:blank"],
    { detached: true, stdio: "ignore" }).unref();

  let target = null;
  for (let i = 0; i < 40 && !target; i++) { await sleep(300); try { const l = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json(); target = l.find((t) => t.type === "page"); } catch (_) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 1;
  await send(ws, id++, "Emulation.setDeviceMetricsOverride", { width: DEVICE.width, height: DEVICE.height, deviceScaleFactor: DEVICE.deviceScaleFactor, mobile: true, screenWidth: DEVICE.width, screenHeight: DEVICE.height });
  await send(ws, id++, "Emulation.setUserAgentOverride", { userAgent: DEVICE.ua });
  await send(ws, id++, "Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send(ws, id++, "Page.enable");
  await send(ws, id++, "Page.navigate", { url: URL });
  await sleep(1300);

  const ev = async (expr) => val(await send(ws, id++, "Runtime.evaluate", { expression: expr, returnByValue: true }));
  /* первый снимок после изменения иногда отдаёт «залипший» кадр — поэтому
     берём два снимка подряд и используем второй */
  async function settle() { await sleep(450); }

  /* Полный скриншот вьюпорта + ручная обрезка: clip-режим у Page.captureScreenshot
     в headless считает координаты непоследовательно, поэтому вырезаем сами. */
  const DPR = 3;
  async function fullShot() {
    const r = await send(ws, id++, "Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    return decodePNG(Buffer.from(r.result.data, "base64"));
  }
  function cropStats(png, x, y, w, h) {
    let s = 0, s2 = 0, n = 0;
    const step = 2; // сэмплируем каждый 2-й пиксель — вдвое быстрее, точно для mean/sd
    const x0 = Math.max(0, Math.round(x * DPR)), y0 = Math.max(0, Math.round(y * DPR));
    const x1 = Math.min(png.w, Math.round((x + w) * DPR)), y1 = Math.min(png.h, Math.round((y + h) * DPR));
    for (let py = y0; py < y1; py += step) {
      const row = py * png.w;
      for (let px = x0; px < x1; px += step) {
        const i = (row + px) * png.ch;
        const l = 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
        s += l; s2 += l * l; n++;
      }
    }
    const m = n ? s / n : 0;
    return { mean: +m.toFixed(1), sd: +(n ? Math.sqrt(Math.max(0, s2 / n - m * m)) : 0).toFixed(1), n };
  }

  const layout = await ev(`(()=>{const r=(s)=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return{x:Math.round(b.x),w:Math.round(b.width),right:Math.round(b.right)}};
    const c=document.querySelector('.header .container').getBoundingClientRect();
    return{vw:window.innerWidth,dpr:window.devicePixelRatio,containerRight:Math.round(c.right),
      linkAlign:getComputedStyle(document.querySelector('.nav a')).textAlign,linkPad:getComputedStyle(document.querySelector('.nav a')).padding,
      logo:r('.logo'),actions:r('.header__actions'),theme:r('#theme-toggle'),burger:r('#menu-toggle')};})()`);
  await settle();
  console.log("РАСКЛАДКА:", JSON.stringify(layout));
  console.log("  -> ЗАЗОР справа (containerRight - actions.right) =", layout.containerRight - layout.actions.right, "px  [0 = прижато вправо]");
  console.log("  -> зазор logo->actions =", layout.actions.x - layout.logo.right, "px | текст меню:", layout.linkAlign, layout.linkPad);

  /* --- интерактив: тема работает, меню закрывается по ссылке (мобильный) --- */
  const scheme0 = await ev(`document.documentElement.getAttribute('data-scheme')`);
  await ev(`document.querySelector('#menu-toggle').click()`); await sleep(450);
  const openedAfterTheme = await ev(`document.querySelector('#site-nav').classList.contains('open')`);
  await ev(`document.querySelector('#theme-toggle').click()`); await sleep(450);
  const scheme1 = await ev(`document.documentElement.getAttribute('data-scheme')`);
  await ev(`document.querySelector('#theme-toggle').click()`); await sleep(450);
  await ev(`document.querySelector('#site-nav a').click()`); await sleep(600);
  const afterLink = await ev(`(()=>{const n=document.querySelector('#site-nav');return{open:n.classList.contains('open'),vis:getComputedStyle(n).visibility,cls:n.className};})()`);
  /* гигиена состояния перед замерами: без smooth-скролла (иначе scrollY «плывёт»)
     и гарантированно закрытое меню — иначе базовые замеры ловят открытую шторку.
     Клик по ссылке выше выставил location.hash, и браузер «дотягивал» страницу к
     якорю уже после scrollTo — поэтому hash обязательно очищаем. */
  await ev(`document.documentElement.style.scrollBehavior='auto'`);
  await ev(`history.replaceState(null,'',location.pathname+location.search)`);
  await ev(`(()=>{const n=document.querySelector('#site-nav');if(n.classList.contains('open')){
    n.classList.remove('open');n.style.visibility='hidden';n.style.opacity='0';n.classList.add('nav--closed');}
    const t=document.querySelector('#menu-toggle');t&&t.setAttribute('aria-expanded','false');})()`);
  await ev(`window.scrollTo(0,0)`); await sleep(600);
  const homeY = await ev(`Math.round(window.scrollY)`);
  if (homeY !== 0) { await ev(`window.scrollTo(0,0)`); await sleep(400); }
  console.log("ГИГИЕНА: hash очищен, scrollY =", await ev(`Math.round(window.scrollY)`));
  console.log("ИНТЕРАКТИВ: тема", scheme0, "->", scheme1, "| меню было открыто:", openedAfterTheme,
    "| после клика по ссылке:", JSON.stringify(afterLink));

  // Область шторки (в CSS px): 4vw .. 96vw, от 74px вниз на 250px
  const REG = { x: Math.round(layout.vw * 0.04), y: 78, w: Math.round(layout.vw * 0.92), h: 250 };

  async function probe(label) {
    await settle();
    await fullShot();                        // «прогревающий» кадр — отбрасываем
    const st = cropStats(await fullShot(), REG.x, REG.y, REG.w, REG.h);
    const s = await ev(`(()=>{const n=document.querySelector('#site-nav');const cs=getComputedStyle(n);
      const h=document.querySelector('#site-header');const hb=getComputedStyle(h).backdropFilter;
      return{open:n.classList.contains('open'),vis:cs.visibility,op:cs.opacity,inlineVis:n.style.visibility,inlineOp:n.style.opacity,
        blur:cs.backdropFilter,anim:cs.animationName,scrolled:h.classList.contains('scrolled'),headerBlur:hb,
        scrollY:Math.round(window.scrollY),
        /* отпечаток отрисовки шторки: всё, что влияет на её вид. Должен совпадать
           при любом scrollY — тогда вид зависит только от вкл/выкл. */
        sig:[cs.visibility,cs.opacity,cs.transform,cs.backdropFilter,cs.backgroundImage,
             cs.backgroundColor,cs.boxShadow,cs.borderRadius,cs.position,cs.zIndex,cs.isolation].join('|')};})()`);
    console.log(`  ${label}: mean=${String(st.mean).padStart(5)} sd=${String(st.sd).padStart(5)}  vis=${s.vis.padEnd(7)} op=${s.op.padEnd(3)} inline=${(s.inlineVis + "/" + s.inlineOp).padEnd(13)} anim=${s.anim.padEnd(8)} blur=${s.blur}`);
    console.log(`        scrollY=${s.scrollY}  header.scrolled=${s.scrolled}  header.backdropFilter=${s.headerBlur}`);
    st.headerBlur = s.headerBlur;
    st.scrolled = s.scrolled;
    st.scrollY = s.scrollY;
    st.blur = s.blur;
    st.sig = s.sig;
    return st;
  }

  const out = {};
  for (const scrollY of [0, 400]) {
    /* мгновенный скролл (scroll-behavior уже auto) + подтверждение позиции */
    await ev(`document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,${scrollY})`);
    await sleep(800);
    const realY = await ev(`Math.round(window.scrollY)`);
    const isScrolled = await ev(`document.querySelector('#site-header').classList.contains('scrolled')`);
    console.log(`\n=== цель scrollY=${scrollY} | фактически ${realY} | header.scrolled=${isScrolled} ===`);
    out["base0_" + scrollY] = await probe("база A (закр)");
    out["base2_" + scrollY] = await probe("база B (закр)");
    await ev(`document.querySelector('#menu-toggle').click()`); await sleep(600);
    out["o1_" + scrollY] = await probe("открытие #1  ");
    await ev(`document.querySelector('#menu-toggle').click()`); await sleep(600);
    out["c1_" + scrollY] = await probe("закрыто A    ");
    out["c1b_" + scrollY] = await probe("закрыто B    ");
    await ev(`document.querySelector('#menu-toggle').click()`); await sleep(600);
    out["o2_" + scrollY] = await probe("открытие #2  ");
    await ev(`document.querySelector('#menu-toggle').click()`); await sleep(600);
    out["c2_" + scrollY] = await probe("закрыто      ");
  }

  console.log("\n--- ВЫВОДЫ (регион шторки) ---");
  const b = out.base2_0, o1 = out.o1_0, o2 = out.o2_0, c = out.c1b_0;
  const verdict = (ok) => (ok ? "OK" : "ПРОВАЛ");
  const drift = Math.abs(out.base0_0.sd - out.base2_0.sd);
  if (out.base2_0.sd <= 0) { console.log("нет данных"); process.exit(0); }
  console.log("  0) стабильность замера фона (шум):", verdict(drift < 8), `(два замера базы: sd ${out.base0_0.sd} / ${out.base2_0.sd})`);
  console.log("  1) blur гасит детали (sd падает):", verdict(o1.sd < b.sd * 0.8), `(база sd ${b.sd} -> открыто sd ${o1.sd})`);
  console.log("  2) повторное открытие = первое (блюр стабилен):", verdict(Math.abs(o2.sd - o1.sd) < b.sd * 0.15), `(#1 sd ${o1.sd} vs #2 sd ${o2.sd})`);
  console.log("  3) после закрытия фон вернулся:", verdict(c.sd > Math.max(b.sd, o1.sd) * 0.95), `(база sd ${b.sd} -> закрыто sd ${c.sd})`);
  console.log("  4) надписи меню по центру:", verdict(layout.linkAlign === "center"), "(text-align =", layout.linkAlign + ")");
  console.log("  5) тема+бургер прижаты вправо:", verdict(layout.containerRight - layout.actions.right <= 1),
    "(зазор", layout.containerRight - layout.actions.right, "px, было 43)");

  /* ---- ГЛАВНОЕ (жалоба была именно на это): вид шторки определяется ТОЛЬКО
     состоянием вкл/выкл, а не прокруткой. Проверяем:
       а) повторное открытие в ТОЙ ЖЕ точке (scrollY=400) = первое открытие;
       б) blur слой шторки не зависит от прокрутки (рисуемый backdrop-filter);
       в) у шапки blur погашен -> .header не становится backdrop root,
          значит blur шторки всегда видит контент за ней.                        */
  console.log("\n--- ШТОРКА ЗАВИСИТ ТОЛЬКО ОТ ВКЛ/ВЫКЛ, НЕ ОТ ПРОКРУТКИ ---");
  const o1S = out.o1_400, o2S = out.o2_400;            // открыто при scrollY=400, дважды
  const o1T = out.o1_0;                                // открыто при scrollY=0
  console.log(`  blur шторки: @scrollY=0 → ${o1T.blur}`);
  console.log(`               @scrollY=400 → ${o1S.blur}`);
  console.log(`  header.blur: @scrollY=0 → ${o1T.headerBlur} | @scrollY=400 → ${o1S.headerBlur}`);
  console.log(`  открыто при скролле: #1 sd ${o1S.sd} mean ${o1S.mean} | #2 sd ${o2S.sd} mean ${o2S.mean}`);
  if (o1S && o2S && o1T) {
    console.log("  6) открытие в одной точке стабильно при скролле:",
      verdict(Math.abs(o2S.sd - o1S.sd) < 5 && Math.abs(o2S.mean - o1S.mean) < 5),
      `(#1 sd ${o1S.sd} vs #2 sd ${o2S.sd}; mean ${o1S.mean} vs ${o2S.mean})`);
    console.log("  7) blur шторки одинаков при вкл/выкл скролла:",
      verdict(o1T.blur === o1S.blur),
      `("${o1T.blur}" == "${o1S.blur}")`);
    console.log("  8) у шапки нет blur (не ломает blur шторки):",
      verdict(/none/.test(o1T.headerBlur) && /none/.test(o1S.headerBlur)),
      `("${o1T.headerBlur}" / "${o1S.headerBlur}")`);
    const b1 = out.base2_0, b4 = out.base2_400;
    console.log("  9) отрисовка шторки зависит только от вкл/выкл (не от скролла):",
      verdict(o1T.sig === o1S.sig && b1 && b4 && b1.sig === b4.sig),
      "(отпечаток открытой: scrollY=0 " + (o1T.sig === o1S.sig ? "==" : "!=") +
      " scrollY=400; закрытой: " + (b1 && b4 ? (b1.sig === b4.sig ? "==" : "!=") : "?") + " scrollY=400)");
    if (o1T.sig !== o1S.sig) {
      const A = o1T.sig.split("|"), B = o1S.sig.split("|");
      const keys = ["visibility","opacity","transform","backdropFilter","backgroundImage","backgroundColor","boxShadow","borderRadius","position","zIndex","isolation"];
      keys.forEach((k, i) => { if (A[i] !== B[i]) console.log(`      ├ ${k}: scrollY=0 "${A[i]}"  ≠  scrollY=400 "${B[i]}"`); });
    }
  }

  /* ---- DESKTOP-РЕГРЕССИЯ: 1280px должен совпасть до и после правки ---- */
  await send(ws, id++, "Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1280, screenHeight: 900 });
  await send(ws, id++, "Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" });
  await send(ws, id++, "Page.navigate", { url: URL });
  await sleep(1600);
  const desk = await ev(`(()=>{const r=(s)=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return{x:Math.round(b.x),w:Math.round(b.width),right:Math.round(b.right)}};
    const n=document.querySelector('#site-nav');const cs=getComputedStyle(n);
    const c=document.querySelector('.header .container').getBoundingClientRect();
    const a=document.querySelector('.nav a');const acs=getComputedStyle(a);
    return{vw:window.innerWidth,containerRight:Math.round(c.right),logo:r('.logo'),nav:r('#site-nav'),actions:r('.header__actions'),
      navPos:cs.position,navDisplay:cs.display,navVisibility:cs.visibility,navRadius:cs.borderRadius,navBg:cs.backgroundColor,navClass:n.className,
      links:n.querySelectorAll('a').length,linkAlign:acs.textAlign,linkPad:acs.padding};})()`);
  console.log("\n=== DESKTOP 1280px (должно совпасть до/после) ===");
  console.log(JSON.stringify(desk));
  console.log("  -> зазор справа =", desk.containerRight - desk.actions.right,
    "| nav:", desk.navPos, desk.navDisplay, desk.navVisibility, "| ссылок =", desk.links, "| align =", desk.linkAlign,
    "| nav bg =", desk.navBg, "| nav--js =", /nav--js/.test(desk.navClass));
  console.log("  DESKTOP:", (desk.containerRight - desk.actions.right === 0 && desk.navDisplay === "flex" &&
    desk.navVisibility === "visible" && desk.links === 6 && !/nav--js/.test(desk.navClass)) ? "OK (не тронут)" : "ИЗМЕНИЛСЯ!");
  process.exit(0);
})();


