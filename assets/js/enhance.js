/* ============================================================================
 *  enhance.js  —  ДОПОЛНИТЕЛЬНОЕ ПОВЕДЕНИЕ (не меняет render.js/app.js)
 * ----------------------------------------------------------------------------
 *   1) «овал» меню — единая стеклянная капсула, которая с инерцией едет к
 *      пункту при наведении и переливается мини-овалами внутри;
 *   2) клик по телефону/почте — копирование в буфер (телефон + звонок на моб.);
 *   3) «Написать письмо» — выбор Mail.ru или Gmail с готовым адресом;
 *   4) плашка с номером (desktop) — закрытие кликом/крестиком/Esc;
 *   5) над фотографиями галереи свечение курсора отключается.
 * ==========================================================================*/
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = () =>
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 900;
  const lerp = (a, b, k) => a + (b - a) * k;

  /* ---------------------- 1) «ОВАЛ» В МЕНЮ (ИНЕРЦИЯ) ------------------- */
  function initNavOval() {
    const nav = $("#site-nav");
    if (!nav) return;
    const oval = $(".nav__oval", nav);
    const links = $$("a", nav);
    if (!oval || !links.length) return;

    const cur = { x: 0, y: 0, w: 0, h: 0, o: 0 };
    const tgt = { x: 0, y: 0, w: 0, h: 0, o: 0 };
    let running = false;
    let active = null;

    function to(link) {
      if (!link) return;
      active = link;
      tgt.x = link.offsetLeft; tgt.y = link.offsetTop;
      tgt.w = link.offsetWidth; tgt.h = link.offsetHeight;
      tgt.o = 1; wake();
    }
    function hide() { tgt.o = 0; wake(); }
    function wake() {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    }
    function frame() {
      cur.x = lerp(cur.x, tgt.x, 0.18);
      cur.y = lerp(cur.y, tgt.y, 0.18);
      cur.w = lerp(cur.w, tgt.w, 0.18);
      cur.h = lerp(cur.h, tgt.h, 0.18);
      cur.o = lerp(cur.o, tgt.o, 0.2);
      oval.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0)`;
      oval.style.width = cur.w.toFixed(1) + "px";
      oval.style.height = cur.h.toFixed(1) + "px";
      oval.style.opacity = cur.o.toFixed(3);
      oval.classList.toggle("on", tgt.o > 0.35);
      const settled =
        Math.abs(cur.o - tgt.o) < 0.01 && Math.abs(cur.x - tgt.x) < 0.4 &&
        Math.abs(cur.y - tgt.y) < 0.4 && Math.abs(cur.w - tgt.w) < 0.4 &&
        Math.abs(cur.h - tgt.h) < 0.4;
      if (!settled) requestAnimationFrame(frame);
      else running = false;
    }

    window.addEventListener("resize", () => {
      if (isMobile()) { hide(); oval.style.display = "none"; return; }
      oval.style.display = "";
      if (active) to(active);
    });

    if (reduce() || isMobile()) { oval.style.display = "none"; return; }

    links.forEach((l) => {
      l.addEventListener("pointerenter", () => to(l));
      l.addEventListener("focus", () => to(l));
    });
    nav.addEventListener("pointerleave", hide);
    nav.addEventListener("focusout", (e) => {
      if (!nav.contains(e.relatedTarget)) hide();
    });
  }

  /* ------------------------------- БУФЕР ------------------------------- */
  function copyText(text, title) {
    const ok = () => showToast(title || "Скопировано", text);
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", "");
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove(); ok();
      } catch (e) { /* ничего */ }
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else fallback();
  }

  /* ------------------------------- ПЛАШКА ------------------------------ */
  let toastEl = null, toastTimer = 0, toastUnbind = null;
  function toastKey(e) { if (e.key === "Escape") closeToast(); }
  function closeToast() {
    if (!toastEl) return;
    toastEl.classList.remove("on");
    document.removeEventListener("keydown", toastKey, true);
    if (toastUnbind) { toastUnbind(); toastUnbind = null; }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
    const el = toastEl;
    setTimeout(() => el.classList.add("hidden"), 260);
  }
  function showToast(title, value) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "lg-toast hidden";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      toastEl.innerHTML =
        `<div class="lg-toast__body"><div class="lg-toast__title"></div>` +
        `<div class="lg-toast__value"></div></div>` +
        `<button class="lg-toast__close" type="button" aria-label="Закрыть (Esc)">✕</button>`;
      document.body.appendChild(toastEl);
      $(".lg-toast__close", toastEl).addEventListener("click", (e) => {
        e.stopPropagation(); closeToast();
      });
    }
    $(".lg-toast__title", toastEl).textContent = title || "";
    const v = $(".lg-toast__value", toastEl);
    v.textContent = value || "";
    v.style.display = value ? "" : "none";
    toastEl.classList.remove("hidden");
    requestAnimationFrame(() => toastEl.classList.add("on"));
    document.addEventListener("keydown", toastKey, true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(closeToast, 5200);
    if (toastUnbind) toastUnbind();
    // «закрыть кликом в любом месте» — со следующего тика, чтобы не поймать текущий клик
    setTimeout(() => {
      const onAny = (e) => { if (toastEl && !toastEl.contains(e.target)) closeToast(); };
      document.addEventListener("click", onAny);
      toastUnbind = () => document.removeEventListener("click", onAny);
    }, 0);
  }

  /* --------------------------- ВЫБОР ПОЧТЫ ----------------------------- */
  let mailEl = null, mailKey = null;
  function closeMail() {
    if (!mailEl) return;
    mailEl.classList.remove("on");
    document.removeEventListener("keydown", mailKey);
    const el = mailEl;
    setTimeout(() => el.classList.add("hidden"), 240);
  }
  function showMail(to) {
    if (!mailEl) {
      mailEl = document.createElement("div");
      mailEl.className = "lg-mail hidden";
      mailEl.setAttribute("role", "dialog");
      mailEl.setAttribute("aria-modal", "true");
      mailEl.setAttribute("aria-label", "Куда написать письмо");
      mailEl.innerHTML =
        `<div class="lg-mail__card glass" role="document">
           <button class="lg-mail__close" type="button" aria-label="Закрыть (Esc)">✕</button>
           <h3 class="lg-mail__title">Куда написать письмо?</h3>
           <p class="lg-mail__sub">Получатель: <b class="lg-mail__to"></b></p>
           <div class="lg-mail__actions">
             <a class="lg-mail__opt lg-mail__opt--mailru" target="_blank" rel="noopener">Написать в Mail.ru</a>
             <a class="lg-mail__opt lg-mail__opt--gmail" target="_blank" rel="noopener">Написать в Gmail</a>
           </div>
         </div>`;
      document.body.appendChild(mailEl);
      $(".lg-mail__close", mailEl).addEventListener("click", closeMail);
      mailEl.addEventListener("click", (e) => { if (e.target === mailEl) closeMail(); });
      mailKey = (e) => { if (e.key === "Escape") closeMail(); };
    }
    $(".lg-mail__to", mailEl).textContent = to;
    const su = "Запись на тренировку по тхэквондо МФТ";
    const body = "Здравствуйте! Хочу записаться на тренировку по тхэквондо МФТ. Подскажите расписание, пожалуйста.";
    $(".lg-mail__opt--mailru", mailEl).href =
      "https://e.mail.ru/compose/?to=" + encodeURIComponent(to) +
      "&subject=" + encodeURIComponent(su) + "&body=" + encodeURIComponent(body);
    $(".lg-mail__opt--gmail", mailEl).href =
      "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to) +
      "&su=" + encodeURIComponent(su) + "&body=" + encodeURIComponent(body);
    mailEl.classList.remove("hidden");
    requestAnimationFrame(() => mailEl.classList.add("on"));
    document.addEventListener("keydown", mailKey);
    $(".lg-mail__opt--mailru", mailEl).focus();
  }

  /* --------------------------- формат номера --------------------------- */
  function formatPhone(d) {
    const s = String(d || "").replace(/[^\d+]/g, "");
    const m = s.match(/^\+?7(\d{3})(\d{3})(\d{2})(\d{2})$/);
    return m ? `+7 (${m[1]}) ${m[2]}-${m[3]}-${m[4]}` : String(d || "");
  }


  /* ------------------------------ ДЕЙСТВИЯ ----------------------------- */
  function initActions() {
    // телефон и почта в контактах: клик = копирование (+ звонок на мобильных)
    $$(".js-copy").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const val = el.getAttribute("data-copy") || el.textContent.trim();
        const isPhone = /^[+\d][\d\s()\-]*$/.test(val);
        copyText(val, isPhone ? "Номер телефона" : "Почта");
        if (isPhone && isMobile()) window.location.href = "tel:" + val.replace(/[^\d+]/g, "");
      });
    });

    // кнопка «Записаться по телефону» (обычная tel:-ссылка, без .js-copy)
    $$('a[href^="tel:"]:not(.js-copy)').forEach((el) => {
      el.addEventListener("click", (e) => {
        const tel = (el.getAttribute("href") || "").replace(/^tel:/, "");
        if (isMobile()) return;             // моб. — штатно откроется набор номера
        e.preventDefault();
        copyText(formatPhone(tel) || tel, "Номер телефона");
      });
    });

    // «Написать письмо» → выбор Mail.ru / Gmail
    $$(".js-mail").forEach((b) => {
      b.addEventListener("click", () => showMail(b.getAttribute("data-mail-to") || ""));
    });
  }

  /* ------------- СВЕЧЕНИЕ КУРСОРА НЕ ПОКАЗЫВАЕМ НАД ФОТОГРАФИЯМИ ---------- */
  function initCursorGlowGuard() {
    $$(".gallery .tile").forEach((t) => {
      t.addEventListener("pointerenter", () => document.body.classList.add("no-cursor-glow"));
      t.addEventListener("pointerleave", () => document.body.classList.remove("no-cursor-glow"));
    });
  }

  /* ------------------------------ СТАРТ -------------------------------- */
  function boot() {
    initNavOval();
    initActions();
    initCursorGlowGuard();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

