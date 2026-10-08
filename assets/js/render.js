/* ============================================================================
 *  render.js  —  ДВИЖОК "КОНСТРУКТОРА"
 * ----------------------------------------------------------------------------
 *  Читает window.SITE (из content/site.data.js) и рисует весь сайт.
 *  Здесь обычно НЕ нужно ничего менять — правь content/site.data.js.
 * ==========================================================================*/

(function () {
  "use strict";

  const S = window.SITE || {};
  const $ = (sel, root = document) => root.querySelector(sel);

  /* --------------------------- утилиты -------------------------------- */
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const el = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  /* --------------------------- фон и утилиты -------------------------- */
  function ensureBackdrop() {
    if (!$(".bg")) {
      document.body.prepend(el(`<div class="bg" aria-hidden="true">
        <span class="blob a"></span><span class="blob b"></span><span class="blob c"></span>
      </div>`));
    }
    if (!$(".grain")) {
      document.body.appendChild(el(`<div class="grain" aria-hidden="true"></div>`));
    }
    if (!$(".cursor-glow")) {
      document.body.appendChild(el(`<div class="cursor-glow" aria-hidden="true"></div>`));
    }
  }

  /* ------------------------------- ШАПКА ------------------------------ */
  function renderHeader() {
    const brand = S.brand || {};
    const nav = (S.nav || [])
      .map((n) => `<a href="${esc(n.href)}">${esc(n.label)}</a>`)
      .join("");

    return el(`<header class="header" id="site-header">
      <div class="container">
        <a class="logo" href="#top">
          <span class="logo__dot" aria-hidden="true"></span>
          <span>${esc(brand.name || "Liquid")}<span class="logo__accent">${esc(brand.accent || "Glass")}</span></span>
        </a>
        <nav class="nav" id="site-nav"><span class="nav__oval" aria-hidden="true"></span>${nav}</nav>
        <div class="header__actions">
          <button class="icon-btn" id="theme-toggle" type="button" title="Светлая/тёмная тема" aria-label="Переключить тему">◐</button>
          <button class="icon-btn menu-toggle" id="menu-toggle" type="button" title="Меню" aria-label="Открыть меню">☰</button>
        </div>
      </div>
    </header>`);
  }

  /* ------------------------------- ФУТЕР ------------------------------ */
  function renderFooter() {
    const f = S.footer || {};
    const links = (f.links || [])
      .map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`)
      .join("");
    return el(`<footer class="footer">
      <div class="container">
        <div class="footer__note">${esc(f.note || "")}</div>
        <div class="footer__links">${links}</div>
      </div>
    </footer>`);
  }

  /* --------------------------- маленькие блоки ------------------------ */
  function head(sec) {
    if (!sec.eyebrow && !sec.title && !sec.subtitle) return "";
    return `<div class="section__head reveal">
      ${sec.eyebrow ? `<span class="eyebrow">${esc(sec.eyebrow)}</span>` : ""}
      ${sec.title ? `<h2 class="h2">${esc(sec.title)}</h2>` : ""}
      ${sec.subtitle ? `<p class="lead">${esc(sec.subtitle)}</p>` : ""}
    </div>`;
  }

  function btn(cta, kind) {
    if (!cta) return "";
    return `<a class="btn ${kind}" href="${esc(cta.href || "#")}">${esc(cta.label || "")}</a>`;
  }

  /* ------------------------------- СЕКЦИИ ----------------------------- */
  const builders = {
    // 1) HERO
    hero(sec) {
      const badges = (sec.badges || []).map((b) => `<span class="chip">${esc(b)}</span>`).join("");
      // плавающая эмблема клуба (если задана); иначе — прежняя стеклянная "планета"
      const orb = sec.emblem
        ? `<div class="hero__orb reveal">
            <span class="orb__halo" aria-hidden="true"></span>
            <img class="orb orb--emblem" src="${esc(sec.emblem)}" alt="${esc(sec.title || "Эмблема клуба")}" loading="eager" />
          </div>`
        : `<div class="hero__orb reveal"><div class="orb" aria-hidden="true"></div></div>`;
      return `<section class="section hero" id="${esc(sec.id)}">
        <div class="container hero__grid">
          <div class="reveal">
            ${sec.eyebrow ? `<span class="eyebrow">${esc(sec.eyebrow)}</span>` : ""}
            <h1 class="h1">${esc(sec.title)}</h1>
            <p class="lead">${esc(sec.subtitle)}</p>
            <div class="hero__cta hero__cta--stack">
              ${btn(sec.primaryCta, "btn--primary btn--lg")}
              ${btn(sec.secondaryCta, "btn--ghost btn--lg")}
            </div>
            <div class="hero__badges">${badges}</div>
          </div>
          ${orb}
        </div>
      </section>`;
    },

    // 2) FEATURES
    features(sec) {
      const items = (sec.items || [])
        .map(
          (it) => `<article class="glass card fx reveal">
            ${it.icon ? `<div class="card__icon">${esc(it.icon)}</div>` : ""}
            <h3 class="card__title">${esc(it.title)}</h3>
            <p class="card__text">${esc(it.text)}</p>
          </article>`
        )
        .join("");
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container">
          ${head(sec)}
          <div class="grid grid--3">${items}</div>
        </div>
      </section>`;
    },

    // 3) STATS
    stats(sec) {
      const items = (sec.items || [])
        .map(
          (it) => `<div class="glass stat reveal">
            <div class="stat__value" data-count="${esc(it.value)}" data-suffix="${esc(it.suffix || "")}">0</div>
            <div class="stat__label">${esc(it.label)}</div>
          </div>`
        )
        .join("");
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container"><div class="stats">${items}</div></div>
      </section>`;
    },

    // 4) GALLERY
    gallery(sec) {
      const items = (sec.items || [])
        .map((it) => {
          const hasImg = !!it.img;
          const cls = "tile reveal" + (hasImg ? " tile--photo lb-item" : "");
          // клик по фото открывает лайтбокс (данные кладём в data-атрибуты)
          const lb = hasImg
            ? ` data-img="${esc(it.img)}" data-title="${esc(it.title || "")}" data-caption="${esc(it.caption || "")}" role="button" aria-label="${esc(it.title || "Фотография")} — открыть на весь экран"`
            : "";
          return `<figure class="${cls}"${lb} style="--hue:${esc(it.hue || 220)}" tabindex="0">
            ${hasImg ? `<img class="tile__img" src="${esc(it.img)}" alt="${esc(it.title || "")}" loading="lazy" />` : ""}
            <figcaption class="tile__meta">
              <div class="tile__title">${esc(it.title)}</div>
              ${it.caption ? `<div class="tile__caption">${esc(it.caption)}</div>` : ""}
            </figcaption>
          </figure>`;
        })
        .join("");
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container">
          ${head(sec)}
          <div class="gallery">${items}</div>
        </div>
      </section>`;
    },

    // 5) REVIEWS
    reviews(sec) {
      const items = (sec.items || [])
        .map((it) => {
          const initial = (it.author || "?").trim().charAt(0).toUpperCase();
          return `<blockquote class="glass review fx reveal">
            <p class="review__quote">“${esc(it.quote)}”</p>
            <div class="review__author">
              <span class="avatar" aria-hidden="true">${esc(initial)}</span>
              <span>
                <span class="review__name">${esc(it.author)}</span><br>
                <span class="review__role">${esc(it.role)}</span>
              </span>
            </div>
          </blockquote>`;
        })
        .join("");
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container">
          ${head(sec)}
          <div class="reviews">${items}</div>
        </div>
      </section>`;
    },

    // 6) FAQ
    faq(sec) {
      const items = (sec.items || [])
        .map(
          (it) => `<div class="glass faq__item reveal">
            <button class="faq__q" type="button" aria-expanded="false">
              <span>${esc(it.q)}</span><span class="faq__sign" aria-hidden="true">+</span>
            </button>
            <div class="faq__a">${esc(it.a)}</div>
          </div>`
        )
        .join("");
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container">
          ${head(sec)}
          <div class="faq">${items}</div>
        </div>
      </section>`;
    },

    // 7) CTA
    cta(sec) {
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container">
          <div class="glass cta fx-glow reveal">
            <h2 class="h2">${esc(sec.title)}</h2>
            ${sec.subtitle ? `<p class="lead">${esc(sec.subtitle)}</p>` : ""}
            ${btn(sec.primaryCta, "btn--primary")}
          </div>
        </div>
      </section>`;
    },

    // 8) CONTACT
    contact(sec) {
      const socials = (sec.socials || [])
        .map((s) => {
          // кнопка «Написать письмо» — открывает выбор Mail.ru / Gmail (JS),
          // поэтому уводим клик от обычной mailto-ссылки и вешаем data-атрибут
          if (s.mail !== undefined || /^mailto:/i.test(s.href || "")) {
            const who = s.mail || String(s.href || "").replace(/^mailto:/i, "");
            return `<button class="btn btn--ghost js-mail" type="button" data-mail-to="${esc(who)}">${esc(s.label)}</button>`;
          }
          // VK и прочие внешние ссылки — как раньше, в новой вкладке
          const ext = /^https?:/i.test(s.href || "");
          return `<a class="btn btn--ghost" href="${esc(s.href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(s.label)}</a>`;
        })
        .join("");
      const tel = sec.phone ? String(sec.phone).replace(/[^+\d]/g, "") : "";
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container">
          ${head(sec)}
          <div class="contact">
            <div class="glass contact__card reveal">
              ${sec.email ? `<div class="contact__row"><span class="contact__icon">✉</span><a class="js-copy" href="mailto:${esc(sec.email)}" data-copy="${esc(sec.email)}" title="Нажмите, чтобы скопировать">${esc(sec.email)}<span class="copy-hint">копировать</span></a></div>` : ""}
              ${sec.phone ? `<div class="contact__row"><span class="contact__icon">☎</span><a class="js-copy" href="tel:${esc(tel)}" data-copy="${esc(sec.phone)}" title="Нажмите, чтобы скопировать">${esc(sec.phone)}<span class="copy-hint">копировать</span></a></div>` : ""}
            </div>
            <div class="glass contact__card reveal">
              <div class="socials">${socials}</div>
            </div>
          </div>
        </div>
      </section>`;
    },

    // 8.5) ВИДЕО — МЫ НА RUTUBE
    media(sec) {
      const src = `https://rutube.ru/play/embed/${esc(sec.videoId || "")}`;
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container">
          ${head(sec)}
          <div class="media__grid">
            <div class="glass media__player fx-glow reveal">
              <div class="media__frame">
                <iframe src="${src}" title="RuTube — видео клуба" loading="lazy"
                  allow="clipboard-write; autoplay; fullscreen; picture-in-picture"
                  allowfullscreen frameborder="0"></iframe>
              </div>
            </div>
            <aside class="glass media__note fx-glow reveal">
              <span class="media__logo" aria-hidden="true">RuTube</span>
              <h3 class="media__note-title">${esc(sec.noteTitle || "У клуба есть свой RuTube-канал")}</h3>
              <p class="media__note-text">${esc(sec.noteText || "")}</p>
              ${sec.channelUrl ? `<a class="btn btn--primary js-rutube" href="${esc(sec.channelUrl)}" target="_blank" rel="noopener">${esc(sec.channelLabel || "Открыть канал на RuTube")}</a>` : ""}
            </aside>
          </div>
        </div>
      </section>`;
    },

    // 9) ТРЕНЕР (био)
    coach(sec) {
      const facts = (sec.facts || [])
        .map((f) => `<span class="coach__fact">${esc(f)}</span>`)
        .join("");
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container">
          ${head(sec)}
          <div class="coach__grid">
            <div class="glass coach__photo fx reveal">
              ${sec.photo ? `<img src="${esc(sec.photo)}" alt="${esc(sec.name || "")}" loading="lazy" />` : ""}
            </div>
            <div class="reveal">
              ${sec.name ? `<h3 class="h2">${esc(sec.name)}</h3>` : ""}
              ${sec.role ? `<p class="lead">${esc(sec.role)}</p>` : ""}
              ${facts ? `<div class="coach__facts">${facts}</div>` : ""}
              ${(sec.bio || []).map((p) => `<p>${esc(p)}</p>`).join("")}
              ${sec.quote ? `<blockquote class="coach__quote">«${esc(sec.quote)}»</blockquote>` : ""}
            </div>
          </div>
        </div>
      </section>`;
    },

    // 10) МЕДАЛИ / ДОСТИЖЕНИЯ
    medals(sec) {
      const medals = (sec.items || [])
        .map(
          (it) => `<div class="glass medal medal--${esc(it.tone || "gold")} fx reveal">
            ${it.icon ? `<div class="medal__icon">${esc(it.icon)}</div>` : ""}
            <div class="medal__value" data-count="${esc(it.value)}" data-suffix="${esc(it.suffix || "")}">0</div>
            <div class="medal__label">${esc(it.label)}</div>
          </div>`
        )
        .join("");
      const awards = (sec.awards || [])
        .map(
          (a) => `<div class="glass award fx reveal">
            <div class="award__year">${esc(a.year)}</div>
            <div class="award__body">
              <h4>${esc(a.title)}</h4>
              <p>${esc(a.text)}</p>
            </div>
          </div>`
        )
        .join("");
      const bars = (sec.bars || [])
        .map(
          (b) => `<div class="bar bar--${esc(b.tone || "")}" data-pct="${esc(b.pct || 0)}">
            <div class="bar__top"><span>${esc(b.label)}</span><span>${esc(b.pct || 0)}%</span></div>
            <div class="bar__track"><div class="bar__fill"></div></div>
          </div>`
        )
        .join("");
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container">
          ${head(sec)}
          <div class="medals">${medals}</div>
          ${bars ? `<div class="bars">${bars}</div>` : ""}
          ${awards ? `<div class="awards">${awards}</div>` : ""}
        </div>
      </section>`;
    },

    // 7) ЗАЛЫ / АДРЕСА
    locations(sec) {
      const items = (sec.items || [])
        .map((l) => {
          const body = `
            ${l.href ? `<span class="loc__go" aria-hidden="true">↗</span>` : ""}
            <div class="loc__name">${esc(l.name)}</div>
            <div class="loc__addr">${esc(l.address)}</div>
            ${l.hours ? `<div class="loc__hours"><span class="loc__dot${l.open ? "" : " closed"}"></span>${esc(l.hours)}</div>` : ""}`;
          // есть href — делаем всю плитку кликабельной ссылкой на карту
          if (l.href) {
            return `<a class="glass loc fx reveal" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer" title="Открыть на карте" aria-label="${esc(l.name)} — открыть на карте">${body}</a>`;
          }
          // нет href — обычная некликабельная плитка
          return `<div class="glass loc fx reveal">${body}</div>`;
        })
        .join("");
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container">
          ${head(sec)}
          <div class="locs">${items}</div>
        </div>
      </section>`;
    },

    // 12) ПЛАШКА «МЫ ЕСТЬ В VK»
    vk(sec) {
      return `<section class="section" id="${esc(sec.id)}">
        <div class="container">
          <div class="glass vk-banner fx-glow reveal">
            <div class="vk-banner__text">
              <h2 class="vk-banner__title">${esc(sec.title)}</h2>
              ${sec.subtitle ? `<p class="vk-banner__sub">${esc(sec.subtitle)}</p>` : ""}
            </div>
            <a class="vk-banner__btn" href="${esc(sec.href)}" target="_blank" rel="noopener">
              <span class="vk-logo" aria-hidden="true">VK</span>${esc(sec.label || "Мы есть в VK")}
            </a>
          </div>
        </div>
      </section>`;
    },
  };

  /* --------------------------- СБОРКА СТРАНИЦЫ ------------------------ */
  function buildSections() {
    const host = $("#sections");
    if (!host) return;
    const frag = document.createDocumentFragment();
    (S.sections || []).forEach((sec) => {
      const make = builders[sec.kind];
      if (!make) {
        console.warn("[liquid-glass] неизвестный kind:", sec.kind);
        return;
      }
      frag.appendChild(el(make(sec)));
    });
    host.appendChild(frag);
  }

  window.__LG = { esc, el, $, builders, buildSections, renderHeader, renderFooter, ensureBackdrop };
})();
