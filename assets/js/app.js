/* ============================================================================
 *  app.js  —  ИНТЕРАКТИВ (тема, меню, анимации, счётчики, FAQ, ripple)
 * ----------------------------------------------------------------------------
 *  Запускает рендер из конфига и оживляет страницу. Правки обычно не нужны.
 * ==========================================================================*/

(function () {
  "use strict";
  const LG = window.__LG;
  const S = window.SITE || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ------------------------------ ТЕМА -------------------------------- */
  function applyTheme() {
    const theme = S.theme || "aurora";
    document.documentElement.setAttribute("data-theme", theme);
  }

  function initScheme() {
    const saved = localStorage.getItem("lg-scheme");
    const scheme =
      saved || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-scheme", scheme);
  }

  function toggleScheme() {
    const cur = document.documentElement.getAttribute("data-scheme");
    const next = cur === "light" ? "dark" : "light";
    animateThemeChange();
    document.documentElement.setAttribute("data-scheme", next);
    localStorage.setItem("lg-scheme", next);
  }

  /* Плавная смена темы: включаем переходы + лёгкая вспышка */
  function animateThemeChange() {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      root.classList.add("theme-anim");
      const flash = document.createElement("div");
      flash.className = "theme-flash";
      flash.style.background =
        getComputedStyle(root).getPropertyValue("--bg-a").trim() || "#0b1020";
      document.body.appendChild(flash);
      requestAnimationFrame(() => flash.classList.add("on"));
      setTimeout(() => {
        flash.classList.remove("on");
        setTimeout(() => flash.remove(), 460);
      }, 240);
      clearTimeout(animateThemeChange._t);
      animateThemeChange._t = setTimeout(() => root.classList.remove("theme-anim"), 700);
    }
  }

  /* --------------------------- ПОЯВЛЕНИЕ ------------------------------ */
  function initReveal() {
    const els = $$(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((e, i) => {
      e.style.transitionDelay = Math.min(i % 6, 5) * 60 + "ms";
      io.observe(e);
    });
  }

  /* ----------------------------- СЧЁТЧИКИ ----------------------------- */
  function initCounters() {
    const nums = $$("[data-count]");
    if (!nums.length) return;
    const run = (node) => {
      const target = Number(node.getAttribute("data-count")) || 0;
      const suffix = node.getAttribute("data-suffix") || "";
      const dur = 1200;
      const start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            run(en.target);
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    nums.forEach((n) => io.observe(n));
  }

  /* ------------------------- ПОЛОСКИ МЕДАЛЬНОГО ЗАЧЁТА ----------------- */
  function initBars() {
    const bars = $$(".bar[data-pct]");
    if (!bars.length) return;
    const fill = (node) => {
      const f = $(".bar__fill", node);
      if (f) f.style.width = Math.max(0, Math.min(100, Number(node.getAttribute("data-pct")) || 0)) + "%";
    };
    if (!("IntersectionObserver" in window)) {
      bars.forEach(fill);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            fill(en.target);
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    bars.forEach((b) => io.observe(b));
  }

  /* ------------------------------- FAQ -------------------------------- */
  function initFaq() {
    $$(".faq__item").forEach((item) => {
      const q = $(".faq__q", item);
      if (!q) return;
      q.addEventListener("click", () => {
        const open = item.classList.toggle("open");
        q.setAttribute("aria-expanded", String(open));
      });
    });
  }

  /* ------------------------------ RIPPLE ------------------------------ */
  function initRipple() {
    $$(".btn").forEach((b) => {
      b.addEventListener("click", (e) => {
        const r = b.getBoundingClientRect();
        const size = Math.max(r.width, r.height);
        const span = document.createElement("span");
        span.className = "ripple";
        span.style.width = span.style.height = size + "px";
        span.style.left = e.clientX - r.left - size / 2 + "px";
        span.style.top = e.clientY - r.top - size / 2 + "px";
        b.appendChild(span);
        setTimeout(() => span.remove(), 620);
      });
    });
  }

  /* --------------------------- МЕНЮ / ШАПКА --------------------------- */
  function initHeader() {
    const header = $("#site-header");
    const nav = $("#site-nav");
    const toggle = $("#menu-toggle");
    const themeBtn = $("#theme-toggle");

    const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (toggle && nav) {
      toggle.addEventListener("click", () => nav.classList.toggle("open"));
      nav.addEventListener("click", (e) => {
        if (e.target.tagName === "A") nav.classList.remove("open");
      });
    }
    if (themeBtn) themeBtn.addEventListener("click", toggleScheme);
  }

  /* -------------------------- СВЕТ ЗА КУРСОРОМ ------------------------ */
  function initGlow() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;
    const glow = $(".cursor-glow");
    if (!glow) return;
    document.body.classList.add("glow-on");
    let tx = 0, ty = 0, cx = 0, cy = 0;
    window.addEventListener("pointermove", (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function loop() {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      glow.style.transform = "translate3d(" + cx + "px," + cy + "px,0)";
      requestAnimationFrame(loop);
    })();
  }

  /* ------------- НАКЛОН И ПЛАВНАЯ ПОДСВЕТКА ПЛИТОК (FX) ----------------- */
  /* Плитки галереи и карточки «О клубе», «Соревнования», «Где мы», отзывы,
     фото тренера плавно наклоняются за курсором и мягко подсвечиваются.
     Наклон считается от центра КАЖДОЙ плитки (perspective задаётся внутри
     её собственного transform) — поэтому плитки независимы друг от друга.
     Плавность — сглаживание (lerp) в кадре: ease in/out.
       .fx      — наклон + свечение
       .fx-glow — только плавное свечение (крупные плашки: VK и призыв) */
  function initTiles() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;
    const tiles = $$(".gallery .tile, .glass.fx, .glass.fx-glow");
    if (!tiles.length) return;
    document.documentElement.classList.add("tilt-js"); // отключает CSS-фолбэк

    const MAX_TILT = 6;      // максимальный наклон, градусы (мягкий)
    const PERSPECTIVE = 900; // px — глубина 3D для каждой плитки
    const MAX_SCALE = 1.02;  // лёгкое увеличение при наведении
    const SETTLE = 0.12;     // сглаживание движения (ease in/out)

    const state = tiles.map((el) => ({
      el,
      // .fx-glow — только свечение; всё остальное (плитки и .fx) наклоняем
      tilt: !el.classList.contains("fx-glow"),
      liveClass: el.classList.contains("tile") ? "tile--tilt" : "fx--live",
      mx: 50, my: 50,   // точка курсора на плитке, %
      glow: 0, glowT: 0, // текущая/целевая яркость подсветки (0..1)
      rx: 0, ry: 0,     // текущий наклон, градусы
      rxT: 0, ryT: 0,   // целевой наклон
    }));
    const byEl = new Map(state.map((s) => [s.el, s]));

    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

    function aim(s, e) {
      const r = s.el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = clamp01((e.clientX - r.left) / r.width);
      const py = clamp01((e.clientY - r.top) / r.height);
      s.mx = px * 100;
      s.my = py * 100;
      if (!s.tilt) return;
      s.ryT = (px - 0.5) * 2 * MAX_TILT;   // влево/вправо
      s.rxT = -(py - 0.5) * 2 * MAX_TILT;  // вверх/вниз
    }

    tiles.forEach((el) => {
      const s = byEl.get(el);
      el.addEventListener("pointerenter", (e) => {
        if (s.tilt) el.classList.add(s.liveClass); // transform переходит под управление JS
        el.style.transitionDelay = "0ms"; // убираем задержку анимации появления
        s.glowT = 1;
        aim(s, e);
        s.wake();
      });
      el.addEventListener("pointermove", (e) => {
        aim(s, e);
        s.wake();
      }, { passive: true });
      el.addEventListener("pointerleave", () => {
        const s = byEl.get(el);
        s.glowT = 0;
        s.rxT = 0;
        s.ryT = 0;
        s.wake();
      });
      // клавиатура: фокус подсвечивает плитку (без наклона)
      el.addEventListener("focus", () => { const s = byEl.get(el); s.glowT = 1; s.wake(); });
      el.addEventListener("blur", () => { const s = byEl.get(el); s.glowT = 0; s.wake(); });
    });

    const lerp = (a, b, k) => a + (b - a) * k;
    let running = false;

    function frame() {
      let active = false;
      state.forEach((s) => {
        // SETTLE — плавный разгон и мягкое затухание (ease in/out)
        s.glow = lerp(s.glow, s.glowT, SETTLE);
        s.rx = lerp(s.rx, s.rxT, SETTLE);
        s.ry = lerp(s.ry, s.ryT, SETTLE);
        if (Math.abs(s.glow - s.glowT) < 0.001) s.glow = s.glowT;
        if (Math.abs(s.rx - s.rxT) < 0.02) s.rx = s.rxT;
        if (Math.abs(s.ry - s.ryT) < 0.02) s.ry = s.ryT;
        if (s.glowT > 0 || s.glow > 0.001 || s.rx !== 0 || s.ry !== 0) active = true;
        s.el.style.setProperty("--glow", s.glow.toFixed(3));
        if (s.glow > 0.001) {
          s.el.style.setProperty("--mx", s.mx.toFixed(1) + "%");
          s.el.style.setProperty("--my", s.my.toFixed(1) + "%");
        }
        // transform пишем только тем плиткам, которые наклоняются
        if (!s.tilt) return;
        const scale = lerp(1, MAX_SCALE, s.glow);
        // perspective() внутри transform — 3D-центр совпадает с центром плитки
        s.el.style.transform =
          "perspective(" + PERSPECTIVE + "px) rotateX(" + s.rx.toFixed(2) +
          "deg) rotateY(" + s.ry.toFixed(2) + "deg) scale(" + scale.toFixed(3) + ")";
      });
      // пока ни одна плитка не активна — цикл спит, не тратя ресурсы
      if (active) requestAnimationFrame(frame);
      else running = false;
    }

    function wake() {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    }
    state.forEach((s) => { s.wake = wake; });
  }

  /* ---------------------------- ЛАЙТБОКС (ФОТО) ------------------------ */
  /* Клик по фото в галерее открывает оригинал без кадрирования на затемнённом
     фоне. Закрытие: ESC, клик в любом месте экрана или крестик справа сверху. */
  function initLightbox() {
    const items = $$(".gallery .lb-item");
    if (!items.length) return;

    // разметка оверлея создаётся один раз и переиспользуется
    const box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Просмотр фотографии");
    box.hidden = true;
    box.innerHTML = `
      <figure class="lightbox__figure">
        <div class="lightbox__frame">
          <img class="lightbox__img" alt="" />
          <button class="lightbox__close" type="button" aria-label="Закрыть (Esc)">✕</button>
        </div>
        <figcaption class="lightbox__caption" hidden></figcaption>
      </figure>`;
    document.body.appendChild(box);

    const imgEl = $(".lightbox__img", box);
    const capEl = $(".lightbox__caption", box);
    const closeBtn = $(".lightbox__close", box);
    let lastFocus = null;

    // Доля экрана для большей стороны фото. Вписываем фото в бокс FIT×FIT от
    // окна: тогда бо́льшая сторона всегда ≈70% экрана (50–75%), а мера не зависит
    // от исходного разрешения — маленькие фото увеличиваются, большие уменьшаются.
    const FIT = 0.7;

    function fitToScreen() {
      const nw = imgEl.naturalWidth;
      const nh = imgEl.naturalHeight;
      if (!nw || !nh) return; // размеры ещё не известны — сработает событие load
      const k = Math.min((window.innerWidth * FIT) / nw, (window.innerHeight * FIT) / nh);
      imgEl.style.setProperty("--lb-w", Math.round(nw * k) + "px");
      imgEl.style.setProperty("--lb-h", Math.round(nh * k) + "px");
    }
    imgEl.addEventListener("load", fitToScreen);
    window.addEventListener("resize", () => {
      if (!box.hidden) fitToScreen();
    });

    function open(item) {
      const src = item.getAttribute("data-img");
      if (!src) return;
      lastFocus = document.activeElement;
      imgEl.src = src;
      imgEl.alt = item.getAttribute("data-title") || "";
      fitToScreen(); // подгоняем размер (если картинка уже в кеше — сработает сразу)
      // подпись: заголовок + пояснение (если есть)
      const title = item.getAttribute("data-title") || "";
      const caption = item.getAttribute("data-caption") || "";
      const text = [title, caption].filter(Boolean).join(" — ");
      if (text) {
        capEl.textContent = text;
        capEl.hidden = false;
      } else {
        capEl.textContent = "";
        capEl.hidden = true;
      }
      box.hidden = false;
      // даём браузеру отрисовать, затем запускаем плавное появление
      requestAnimationFrame(() => box.classList.add("on"));
      document.documentElement.classList.add("lb-open"); // блокируем прокрутку
      closeBtn.focus();
    }

    function close() {
      if (box.hidden) return;
      box.classList.remove("on");
      document.documentElement.classList.remove("lb-open");
      const done = () => {
        box.hidden = true;
        imgEl.removeAttribute("src"); // освобождаем память
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      };
      // ждём завершения анимации затухания (или завершаем сразу)
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) done();
      else setTimeout(done, 220);
    }

    items.forEach((item) => {
      item.addEventListener("click", () => open(item));
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(item);
        }
      });
    });

    // клик в любом месте экрана (фон, фото, крестик) — закрываем
    box.addEventListener("click", () => close());
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
    });
    // ESC — закрываем
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !box.hidden) close();
    });
  }

  /* ------------------------------ СТАРТ ------------------------------- */
  function boot() {
    applyTheme();
    initScheme();
    LG.ensureBackdrop();
    const header = LG.renderHeader();
    const footer = LG.renderFooter();
    const main = $("#sections");
    document.body.insertBefore(header, main);
    document.body.appendChild(footer);
    LG.buildSections();
    initReveal();
    initCounters();
    initBars();
    initFaq();
    initRipple();
    initHeader();
    initGlow();
    initTiles();
    initLightbox();
    console.log(
      "%cLiquid Glass",
      "color:#6d5efc;font-weight:bold",
      "— контент правится в content/site.data.js"
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();