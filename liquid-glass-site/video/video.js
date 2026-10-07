/* ============================================================================
 *  video.js  —  НАДСТРОЙКА ДВИЖКА для страницы «Видео и контакты»
 * ----------------------------------------------------------------------------
 *  Регистрирует три дополнительных типа секций в общий движок (window.__LG),
 *  не изменяя исходные файлы сайта. Разметка и классы намеренно повторяют
 *  решения из assets/js/render.js и assets/css/styles.css, поэтому страница
 *  выглядит как часть того же сайта.
 *
 *     video     — адаптивный YouTube-плеер в стеклянной карточке
 *     contacts  — телефон / e-mail / адрес + соцсети (как блок contact на главной)
 *     info      — «Мы в социальных сетях»: часы работы, описание, кнопки связи
 * ==========================================================================*/

(function () {
  "use strict";

  var LG = window.__LG;
  if (!LG || !LG.builders) return;
  var esc = LG.esc;

  // локальный дубль заголовка секции (совпадает с head() в render.js по вёрстке)
  function head(sec) {
    if (!sec.eyebrow && !sec.title && !sec.subtitle) return "";
    return '<div class="section__head reveal">' +
      (sec.eyebrow ? '<span class="eyebrow">' + esc(sec.eyebrow) + "</span>" : "") +
      (sec.title ? '<h2 class="h2">' + esc(sec.title) + "</h2>" : "") +
      (sec.subtitle ? '<p class="lead">' + esc(sec.subtitle) + "</p>" : "") +
      "</div>";
  }

  // ------------------------------ ВИДЕО ------------------------------------
  // iframe YouTube в контейнере 16:9, обёрнутом в стеклянную карточку.
  LG.builders.video = function (sec) {
    var caption = sec.caption
      ? '<p class="video-caption">' + esc(sec.caption) + "</p>"
      : "";
    return '<section class="section" id="' + esc(sec.id) + '">' +
      '<div class="container">' +
        head(sec) +
        '<div class="glass video-card fx-glow reveal">' +
          '<div class="video-embed">' +
            '<iframe src="' + esc(sec.youtube) + '"' +
              ' title="' + esc(sec.title || "Видео") + '"' +
              ' loading="lazy"' +
              ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"' +
              ' referrerpolicy="strict-origin-when-cross-origin"' +
              ' allowfullscreen></iframe>' +
          "</div>" +
          caption +
        "</div>" +
      "</div>" +
    "</section>";
  };

  // ---------------------------- КОНТАКТЫ -----------------------------------
  // Та же структура, что и у секции contact (две стеклянные карточки),
  // но с добавленной строкой адреса. Все данные приходят из конфига.
  LG.builders.contacts = function (sec) {
    var tel = sec.phone ? String(sec.phone).replace(/[^+\d]/g, "") : "";
    var socials = (sec.socials || [])
      .map(function (s) {
        return '<a class="btn btn--ghost" href="' + esc(s.href) + '"' +
          ' target="_blank" rel="noopener noreferrer">' + esc(s.label) + "</a>";
      })
      .join("");
    return '<section class="section" id="' + esc(sec.id) + '">' +
      '<div class="container">' +
        head(sec) +
        '<div class="contact">' +
          '<div class="glass contact__card fx reveal">' +
            (sec.phone
              ? '<div class="contact__row"><span class="contact__icon">☎</span><a href="tel:' +
                esc(tel) + '">' + esc(sec.phone) + "</a></div>"
              : "") +
            (sec.email
              ? '<div class="contact__row"><span class="contact__icon">✉</span><a href="mailto:' +
                esc(sec.email) + '">' + esc(sec.email) + "</a></div>"
              : "") +
            (sec.address
              ? '<div class="contact__row"><span class="contact__icon">📍</span><span>' +
                esc(sec.address) + "</span></div>"
              : "") +
          "</div>" +
          '<div class="glass contact__card fx reveal">' +
            '<div class="socials">' + socials + "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>";
  };

  // ------------------------- ИНФО «МЫ В СЕТЯХ» -----------------------------
  // Две стеклянные карточки: часы работы и краткое описание с кнопками связи.
  LG.builders.info = function (sec) {
    var hours = (sec.hours || [])
      .map(function (h) {
        return '<div class="hours__row"><span>' + esc(h.days) + "</span><span>" +
          esc(h.time) + "</span></div>";
      })
      .join("");
    var buttons = (sec.buttons || [])
      .map(function (b) {
        var ext = /^https?:/i.test(b.href)
          ? ' target="_blank" rel="noopener noreferrer"'
          : "";
        return '<a class="btn ' + esc(b.kind || "btn--ghost") + '" href="' +
          esc(b.href) + '"' + ext + ">" + esc(b.label) + "</a>";
      })
      .join("");
    return '<section class="section" id="' + esc(sec.id) + '">' +
      '<div class="container">' +
        head(sec) +
        '<div class="info-grid">' +
          '<div class="glass info-card fx reveal">' +
            '<h3 class="info-card__title">Часы работы</h3>' +
            '<div class="hours">' + hours + "</div>" +
          "</div>" +
          '<div class="glass info-card fx reveal">' +
            '<h3 class="info-card__title">Коротко о нас</h3>' +
            '<p class="info-card__text">' + esc(sec.text || "") + "</p>" +
            '<div class="socials">' + buttons + "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>";
  };
})();
