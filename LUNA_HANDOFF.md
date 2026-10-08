# LUNA_HANDOFF.md — передача проекта «Центр развития тхэквондо МФТ»

> Документ для следующей AI-модели (или разработчика), которая продолжит работу над проектом.
> Составлен по фактическому анализу файлов репозитория. Всё, что здесь описано, подтверждено
> чтением кода; ничего не додумано. Где есть сомнения/ограничения — это явно отмечено.
>
> Корень проекта: `C:\Users\manxinxx\Desktop\liquid-glass-site`
> Дата анализа: 2026-10-07. Стек: чистый HTML + CSS + JS, **без сборки и без зависимостей**.

---

## 0. TL;DR (кратко для быстрого старта)

- Это **статический сайт-визитка** региональной федерации тхэквондо МФТ (Калининград) на «стеклянном» (liquid-glass) дизайне.
- Никаких сборщиков, npm-зависимостей, `package.json` или git-репозитория **нет**. Вся «магия» — три файла кода: `content/site.data.js` (контент), `assets/js/render.js` (движок), `assets/js/app.js` (интерактив).
- Запуск: `node tools/serve.js` → http://localhost:5173 (или просто открыть `index.html` двойным кликом).
- Проверка: `node tools/smoke-test.js` и `node tools/verify.js` — оба сейчас проходят без ошибок.
- Главная недавняя фича: **лайтбокс галереи** с подгонкой фото под ~70% экрана (`FIT = 0.7` в `app.js`).
- Не сломать в первую очередь: рендер секций из конфига, `initLightbox()`, систему тем, `IntersectionObserver`-эффекты, отсутствие BOM в файлах.

---

## 1. Что это за проект

Одностраничный сайт (SPA-подобный, но без роутинга) для «Центра развития тхэквондо МФТ».
Дизайн-идея: тёмный/светлый фон, размытые цветные «блобы», стеклянные карточки c `backdrop-filter`,
плавные появления при скролле, «наклон за курсором» (tilt), счётчики цифр, раскрывающийся FAQ,
переключатель тёмной/светлой темы и лайтбокс для фото.

Ключевой принцип архитектуры — **«сайт-конструктор»**: пользователь правит только
`content/site.data.js` (тексты, фото, блоки), а разметку рисует `render.js`. HTML/CSS трогать не нужно.

Контент — данные клуба тхэквондо МФТ (Калининград):
тренер Иван Николаевич Миховский, телефон +7 (960) 297-53-77, достижения, 4 зала.
Часть данных (например, распределение медалей по достоинству) помечена в README как примерная.

---

## 2. Структура проекта

```
liquid-glass-site/
├─ index.html                 каркас страницы (32 стр.): <head> + <main id="sections"> + 3 <script>
├─ README.md                  краткая документация проекта (6.1 КБ)
├─ КАК-ПРАВИТЬ-САЙТ.md         пошаговая инструкция по content/site.data.js (19 КБ)
├─ content/
│  └─ site.data.js            ★ ЕДИНЫЙ ИСТОЧНИК КОНТЕНТА: бренд, меню, 12 секций, футер (313 стр.)
├─ assets/
│  ├─ css/
│  │  ├─ theme.css            ДИЗАЙН-ТОКЕНЫ: палитры, тёмная/светлая схема, анимация смены темы (97 стр.)
│  │  └─ styles.css           ОСНОВНЫЕ СТИЛИ: вся вёрстка, эффекты, лайтбокс, адаптив (814 стр.)
│  ├─ js/
│  │  ├─ render.js            ДВИЖОК: строит Header/Footer/секции из window.SITE (381 стр.)
│  │  └─ app.js               ИНТЕРАКТИВ: тема, reveal, счётчики, полоски, FAQ, ripple, tilt, лайтбокс (455 стр.)
│  └─ img/                    11 используемых + 1 неиспользуемое фото (см. §13)
└─ tools/
   ├─ serve.js                мини-стат-сервер (без зависимостей), порт 5173 (45 стр.)
   ├─ smoke-test.js           дымовой тест конфига и всех рендереров (64 стр.)
   └─ verify.js               проверка ключевых данных и наличия файлов фото (49 стр.)
```

Файлы изображений (`assets/img/`, размеры — важны для производительности, см. §13):
`cover.jpg` (380 КБ), `demid.jpg` (3.2 МБ), `kids-01.jpg` … `kids-06.jpg` (25–34 КБ каждый),
`team-01.jpg` (2.0 МБ), `team-02.jpg` (78 КБ), `training-01.jpg` (47 КБ), `training-02.jpg` (43 КБ).

Кодировка всех текстовых файлов: **UTF-8 без BOM** (проверено побайтово). ВАЖНО сохранять это,
иначе `render.js`/`app.js` могут «поехать» из-за кириллицы в комментариях.
(В PowerShell-консоли кириллица иногда показывается как «кракозябры» — это косметика консоли, файл при этом корректен.)

---

## 3. Архитектура и поток данных

```
content/site.data.js   →  window.SITE  (объект-конфиг)
        │
        ▼
assets/js/render.js    →  window.__LG = { esc, el, $, builders, buildSections,
                                          renderHeader, renderFooter, ensureBackdrop }
        │  рисует: .bg/.grain/.cursor-glow, <header>, секции в <main id="sections">, <footer>
        ▼
assets/js/app.js       →  boot(): applyTheme → initScheme → ensureBackdrop → рендер шапки/футера
                          → buildSections → reveal/counters/bars/faq/ripple/header/glow/tiles/lightbox
```

Порядок подключения скриптов жёстко задан в `index.html` (строки 26–30):
1. `content/site.data.js` — просто присваивает `window.SITE` (никаких зависимостей),
2. `assets/js/render.js` — IIFE, читает `window.SITE`, кладёт API в `window.__LG`,
3. `assets/js/app.js` — IIFE, читает `window.__LG` и `window.SITE`, всё оживляет.

`app.js` запускает и рендер, и интерактив внутри `boot()`; `boot()` вызывается по
`DOMContentLoaded` или сразу, если DOM уже готов (строки 450–454).

`index.html` сам по себе пустой внутри `<main>` — вся страница строится JS-ом.
Это значит: при отключённом JS сайт будет пустым (важно помнить при выборе хостинга/SEO — SEO сейчас
рассчитывает только на базовые `<meta>` в `<head>`).
---

## 4. Назначение ключевых файлов

### 4.1 `index.html` (каркас)
- `<html lang="ru" data-theme="taekwondo" data-scheme="dark">` — тема и схема (значения затем
  перезаписываются из `site.data.js`/`localStorage` в `app.js`).
- `<head>`: meta charset/viewport/description, `theme-color`, Open Graph (title/description/type),
  favicon — inline SVG (data-URI, фиолетово-голубой кружок).
- Подключены `theme.css` (сначала) и `styles.css` (потом). Порядок важен: `styles.css` использует
  переменные из `theme.css`.
- `<main id="sections"></main>` — точка монтирования секций.
- Три `<script>` без `defer` в конце `<body>` — классический для проекта паттерн.
- ⚠️ OG-теги статические и **не обновляются из конфига** — если менять бренд/описание, править и здесь.

### 4.2 `content/site.data.js` (★ контент-конструктор)
Структура `window.SITE`:
- `theme` — одна из `"aurora" | "sunset" | "mint" | "mono" | "taekwondo"` (сейчас `"taekwondo"`).
- `brand` — `{ name, accent, tagline }` (используется в логотипе шапки).
- `nav[]` — пункты меню `{ label, href }` (href ведут к `#id` секций).
- `sections[]` — 12 секций; **порядок массива = порядок на странице**.
- `footer` — `{ note, links[] }`.

Типы секций (`kind`) и их фактические поля (сверено с рендерерами в `render.js`):

| kind | Обязательные/используемые поля |
|------|--------------------------------|
| `hero` | `eyebrow, title, subtitle, primaryCta{label,href}, secondaryCta{...}, badges[]` |
| `features` | `eyebrow, title, subtitle, items[{icon,title,text}]` |
| `stats` | `items[{value,suffix,label}]` (счётчики; `data-count`) |
| `medals` | `eyebrow,title,subtitle, items[{tone,icon,value,label}], bars[{tone,label,pct}], awards[{year,title,text}]` |
| `coach` | `eyebrow,title,subtitle, photo, name, role, facts[], bio[], quote` |
| `gallery` | `eyebrow,title,subtitle, items[{img,title,caption,hue?}]` |
| `locations` | `eyebrow,title,subtitle, items[{name,address,hours,open,href?}]` |
| `reviews` | `eyebrow,title, items[{quote,author,role}]` |
| `faq` | `eyebrow,title, items[{q,a}]` |
| `vk` | `title, subtitle, label, href` |
| `cta` | `title, subtitle, primaryCta{label,href}` |
| `contact` | `eyebrow,title,subtitle, email, phone, socials[{label,href}]` |

Порядок секций сейчас: hero → features → stats → medals → coach → gallery → locations →
reviews → faq → vk → cta → contact. Меню (`nav`) ссылается на `#features, #medals, #coach,
#gallery, #locations, #contact`.

⚠️ Известные особенности конфига (не выдумано, видно в файле):
- В галерее (строки ~204–215) **последний элемент продублирован**: `kids-06.jpg` («Наши звёздочки»)
  встречается дважды подряд (второй — с отступом табом). Вероятно, случайная опечатка.
- `locations[].href` у всех залов — заглушка `https://www.google.com` (комментарий в файле прямо
  просит заменить на реальные ссылки на карты).
- Если у элемента `locations` **нет** `href` — рендерер сделает некликабельную плитку `<div>`,
  если `href` есть — вся плитка становится `<a target="_blank">`. Это заявленное поведение.



### 4.3 `assets/js/render.js` (движок)
IIFE. Читает `const S = window.SITE || {}`. Экспортирует в `window.__LG`:
- `esc(s)` — HTML-экранирование (`& < > "`); применяется ко **всем** текстовым вставкам.
  ⚠️ Сами строки конфига НЕ допускают HTML — разметка внутри них будет экранирована.
- `el(html)` — создаёт DOM-элемент через `<template>` (`content.firstElementChild`).
- `$` — `querySelector`.
- `ensureBackdrop()` — добавляет `.bg` (3 блоба), `.grain`, `.cursor-glow`, если их нет.
- `renderHeader()` — логотип (с `.logo__dot` и `.logo__accent`), `nav`, кнопки `#theme-toggle` (◐)
  и `#menu-toggle` (☰).
- `renderFooter()` — note + links.
- `head(sec)` — общий блок заголовка секции (`.section__head.reveal`: eyebrow/h2/lead).
- `btn(cta, kind)` — кнопка `<a class="btn ...">`.
- `builders` — объект рендереров по `kind` (hero, features, stats, gallery, reviews, faq, cta,
  contact, coach, medals, locations, vk).
- `buildSections()` — проходит `S.sections`, для каждой берёт `builders[kind]`, неизвестные kind
  логирует через `console.warn` и пропускает.

Важные детали рендереров:
- **`gallery`** (строки ~150–176): фото-плитки получают классы `tile reveal tile--photo lb-item`,
  `tabindex="0"`, `role="button"` и data-атрибуты `data-img / data-title / data-caption` +
  `aria-label`. Именно эти атрибуты читает лайтбокс. Плитка без `img` рисуется без фото
  (фолбэк-градиент по `--hue`).
- **`stats`/`medals`**: числовые значения идут в `data-count`, суффикс — в `data-suffix`.
- **`locations`**: `href` → кликабельный `<a>`; иначе `<div>`.
- Нигде не используется `innerHTML` от пользовательских данных напрямую — только через `esc()`.

### 4.4 `assets/js/app.js` (интерактив)
IIFE. Читает `window.__LG` и `window.SITE`. Функции:
- `applyTheme()` — ставит `data-theme` из `S.theme`.
- `initScheme()` / `toggleScheme()` — тёмная/светлая схема: `localStorage["lg-scheme"]`,
  иначе системная (`prefers-color-scheme`); переключение через `#theme-toggle`.
- `animateThemeChange()` — добавляет `html.theme-anim` (плавные переходы) + короткая «вспышка»
  `.theme-flash`; уважает `prefers-reduced-motion`.
- `initReveal()` — `IntersectionObserver` по `.reveal` (порог 0.14), стаггер-задержка по индексу.
- `initCounters()` — анимация чисел `[data-count]` (easeOutCubic, 1200мс) по появлению (порог 0.5).
- `initBars()` — заполнение `.bar[data-pct]` по появлению (порог 0.4).
- `initFaq()` — клик по `.faq__q` переключает `.open` и `aria-expanded`.
- `initRipple()` — «волна» при клике по `.btn` (span `.ripple`, удаляется через 620мс).
- `initHeader()` — `#site-header.scrolled` при скролле >12px; мобильное меню `#menu-toggle`
  переключает `.nav.open`; закрытие меню по клику на ссылку. `syncNav()` дополнительно ставит
  инлайновые `visibility`/`opacity` и классы `.nav--js` / `.nav--closed` (мобильный показ через
  visibility, а не `display:none` — иначе при повторном открытии терялся `backdrop-filter`).
  На ширине >900px все инлайновые стили снимаются (desktop не затрагивается).
- `initGlow()` — «свет за курсором» (`.cursor-glow`), только если нет `reduced-motion` и
  есть hover; крутит `requestAnimationFrame`-цикл с lerp.
- `initTiles()` — эффект **tilt + glow** (см. §6).
- `initLightbox()` — лайтбокс фото (см. §7).
- `boot()` — вся инициализация; логирует в консоль `%cLiquid Glass`.

⚠️ `S.brand.tagline` в `site.data.js` присутствует, но **в рендере не используется** (видно по
`render.js` — берутся только `name`/`accent`). Это «спящее» поле.

### 4.5 `assets/css/theme.css` (токены)
- `:root` — базовые `--radius-sm/--radius/--radius-lg`, `--blur`, `--glass-border`, `--glass-bg`,
  `--glass-hi`, `--shadow`, `--transition`.
- `:root[data-scheme="dark"]` / `[data-scheme="light"]` — `--text`, `--text-dim`, `--bg-a/b`,
  `--glass-*`, `--shadow` для схем.
- `:root[data-theme="..."]` — палитры `--c1/--c2/--c3` для `aurora|sunset|mint|mono|taekwondo`.
- `html.theme-anim …` — глобальные плавные переходы на момент смены темы (с `!important`).
- `.theme-flash` / `.theme-flash.on` — вспышка при переключении.

### 4.6 `assets/css/styles.css` (основные стили, 814 стр.)
Крупные блоки: `* / html / body`, фон (`.bg`, `.blob`, `.grain`, `.cursor-glow`), `.container`,
`.glass` (+`::before` световая кромка), шапка (`.header`, `.logo`, `.nav`, `.icon-btn`), кнопки
(`.btn`, `::after` блик, `.ripple`), секции (`.section`, `.section__head`, `.eyebrow`, `.h1/h2/lead`),
hero (`.orb`), features (`.grid--3`, `.card`), stats, gallery (`.gallery`, `.tile`, `.tile__img`,
`.tile__meta`, `.tile--photo`), эффект `.fx` / `.fx-glow`, reviews, faq, cta, contact, footer,
**лайтбокс** (`.lightbox` … см. §7), плашка VK, залы (`.loc`), прогресс-полосы (`.bar`),
`.reveal`, медиазапросы (900px / 560px) и `prefers-reduced-motion`.

**Мобильная «шторка» меню** (`@media (max-width: 900px)` → `.nav`): показ через
`visibility` + `opacity` (+ анимация `navDrop` при классе `.nav--js:not(.nav--closed)`),
матовая подложка `color-mix(in srgb, var(--bg-a) 50%, transparent)` с
`backdrop-filter: blur(30px) saturate(150%)`, `overflow: hidden`, `isolation: isolate`;
ссылки центрированы (`text-align: center`), `.header__actions` прижат вправо
(`margin-left: auto` + `justify-content: space-between`). На desktop меню (`position: relative`,
`border-radius: 999px`) не меняется.

### 4.7 `tools/*.js`
- **`serve.js`** — мини-http-сервер без зависимостей: корень = родитель `tools/`, порт `5173`
  (`PORT` env override), MIME по расширению, защита от выхода за корень. `node tools/serve.js`.
- **`smoke-test.js`** — прогоняет конфиг + `render.js` в `vm`-песочнице с заглушкой браузера
  (`document.createElement`, `querySelector: () => null`), для каждой секции проверяет:
  есть рендерер, разметка ≥20 символов, нет `undefined/NaN`, есть `id="<sec.id>"`; проверяет тему.
  Возвращает код выхода 1 при ошибках.
- **`verify.js`** — рендерит все секции в `vm` и проверяет наличие ключевых данных регулярками
  (телефон, VK-ссылка, тренер, «Чёрный пояс», «31 медаль», Ташкент, адреса) и что все
  `assets/img/*`, встречающиеся в разметке, физически существуют.

⚠️ Тесты используют `vm` и **не запускают DOM целиком** — они ловят ошибки рендера/данных, но не
проверяют CSS, лайтбокс, анимации и реальные события. Это «быстрые» проверки, не e2e.


---

## 5. Как запускать / собирать

**Сборки нет.** Это статический сайт. Достаточно файлов как есть.

### Запуск локально
```
# вариант 1 — двойной клик по index.html (откроется file://), работает сразу
# вариант 2 — локальный сервер (рекомендуется, корректные пути/MIME):
node tools/serve.js         # → http://localhost:5173  (Ctrl+C — остановить)
```
Требуется Node.js (используются только встроенные модули: `http`, `fs`, `path`, `vm`).
Никаких `npm install` не нужно. `package.json` отсутствует.

### Проверки (запускать после правок)
```
node --check assets/js/app.js assets/js/render.js content/site.data.js   # синтаксис
node tools/smoke-test.js     # конфиг + рендер всех 12 секций
node tools/verify.js         # ключевые данные + наличие файлов фото
```
На момент анализа обе проверки проходят: smoke-test — «Секций: 12 | Ошибок: 0»,
verify — «Ошибок: 0».

### Публикация
Залить всю папку на любой статический хостинг (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
Сборка не требуется; точка входа — `index.html`.

⚠️ Правило кодировки: файлы должны оставаться **UTF-8 без BOM** (проверено текущее состояние).
При редактировании в чужом редакторе следи, чтобы не появился BOM и не поехала кириллица —
это частая причина «сломалось после сохранения».

---

## 6. Эффект «tilt + glow» (`initTiles` в `app.js`)

- Отключается при `prefers-reduced-motion: reduce` или `(hover: none)` (тач).
- Выбирает элементы: `.glass.fx, .glass.fx-glow` (фото галереи исключены —
  у них нет ни наклона, ни подсветки за курсором).
- Ставит `html.tilt-js`, что **отключает CSS-фолбэк** (`:root:not(.tilt-js) …`).
- Константы: `MAX_TILT = 6°`, `PERSPECTIVE = 900px`, `MAX_SCALE = 1.02`, `SETTLE = 0.12`.
- Для каждого элемента: `pointerenter/move/leave` + `focus/blur`; вычисляет позицию курсора
  (`--mx/--my`, %) и наклон `rotateX/rotateY`; сколько «яркость» (`--glow`, 0..1) через lerp.
- `.fx-glow` — только свечение (без наклона, `tilt: false`); `.fx` — с наклоном.
- Кадр крутится только пока хоть один элемент активен (`wake()`/`running`), иначе засыпает.
- Класс «живого» состояния: `.fx--live` для карточек `.fx` (снимает
  CSS-transition у transform).

⚠️ Не сломать: `state.forEach((s)=>…); if (!s.tilt) return;` внутри `frame()` — это `return` из
колбэка (пропуск), не из цикла. Если переписать цикл на `for`, `return` выйдет из функции — баг.

---

## 7. Лайтбокс галереи (`initLightbox` в `app.js` + CSS `.lightbox*`)

Недавно доработанная фича. Как работает:

**Разметка (создаётся один раз, переиспользуется):** `.lightbox[role=dialog][aria-modal]` →
`.lightbox__figure` → `.lightbox__frame` → `.lightbox__img` + `.lightbox__close` (кнопка ✕) →
`.lightbox__caption` (скрыт, пока нет подписи).

**Открытие:** клик по `.gallery .lb-item`, а также `Enter`/`Space` (плитки имеют `tabindex="0"`
и `role="button"`). Читаются `data-img / data-title / data-caption`; подпись = «title — caption».
Ставится `html.lb-open` (блокирует скролл), фокус уходит на кнопку закрытия.

**Закрытие:** `Escape`, клик где угодно по оверлею (`box.addEventListener("click", close)`),
клик по ✕ (с `stopPropagation`). После закрытия `src` у `<img>` удаляется (освобождение памяти),
фокус возвращается на сохранённый `lastFocus`.

**Подгонка под экран — ключевая недавняя правка:**
- В `app.js` есть `const FIT = 0.7;` и функция `fitToScreen()`:
  ```
  const k = Math.min((innerWidth * FIT)/nw, (innerHeight * FIT)/nh);
  imgEl.style.setProperty("--lb-w", Math.round(nw*k)+"px");
  imgEl.style.setProperty("--lb-h", Math.round(nh*k)+"px");
  ```
  где `nw/nh` — `naturalWidth/naturalHeight` изображения.
- Вызывается при `open()` (после установки `src`), по событию `imgEl "load"` и по `window "resize"`
  (только пока `!box.hidden`).
- Итог: **бо́льшая сторона фото ≈70% окна** независимо от исходного разрешения: маленькие фото
  увеличиваются, большие уменьшаются. Без кадрирования: `object-fit: contain`.
- CSS `.lightbox__img`: `width: var(--lb-w, auto); height: var(--lb-h, auto); max-width: 96vw;
  max-height: 88vh; border-radius: 18px; object-fit: contain;`.
- Оверлей: тёмный фон `rgba(8,10,20,.74)` + `backdrop-filter: blur`, `padding: 5vh 5vw`,
  фейд `.on` (opacity 0.22s). Рамка `.lightbox__frame` «обнимает» фото, чтобы ✕ стоял у правого
  верхнего угла. Есть `prefers-reduced-motion` (мгновенно).

**Единственная «ручка» размера — `FIT`** (разумно 0.65–0.75). Математика проверена на реальных
размерах фото (1920×768, 2303×2303, 200×267, 2560×2560, 360×640, 320×240) при окнах
1920×1080 / 1366×768 / 390×844 — бо́льшая сторона = ровно 70%.

⚠️ Важно не сломать при правках: атрибут `hidden` на `.lightbox` (CSS `.lightbox[hidden]{display:none}`),
`html.lb-open` для блокировки скролла, `stopPropagation` на кнопке ✕ (иначе клик закроет через
всплытие), очистку `src` при закрытии.


---

## 8. Зависимости и внешние ресурсы

- **JS-библиотеки:** отсутствуют. Только встроенные Web API браузера
  (`IntersectionObserver`, `matchMedia`, `localStorage`, `requestAnimationFrame`, `template`).
- **npm-зависимости:** отсутствуют. `package.json` нет.
- **Внешние CDN/шрифты:** не подключаются. Шрифт — системный стек
  `"Segoe UI", Inter, system-ui, -apple-system, Roboto, sans-serif`.
- **Изображения:** только локальные в `assets/img/` (фото скачаны со страницы ВК).
- **Иконки:** emoji-символы и inline-SVG (favicon, `.grain` noise) — без внешних файлов.
- **Тема/схема:** `localStorage` ключ `lg-scheme` (значения `"light"`/`"dark"`).
- **Внешние ссылки в контенте:** `vk.ru/tkdmft39`, `mailto:tkdmft39@mail.ru`,
  `tel:+79602975377`, и заглушки карт `https://www.google.com`.

Практический вывод: сайт полностью автономен, работает офлайн (кроме внешних ссылок), легко
хостится как статика.

---

## 9. Текущая функциональность (что уже работает)

- Рендер всей страницы из одного конфига (12 секций, шапка, футер, фон/декор).
- Тёмная/светлая схема: переключатель ◐ в шапке, запоминание в localStorage, авторежим по системе,
  плавная смена (уважает `prefers-reduced-motion`).
- Пять палитр (текущая — `taekwondo`: синий добок + небесный + золото).
- Плавное появление `.reveal` при скролле (стаггер).
- Анимированные счётчики (`stats`, медали) и прогресс-полосы медального зачёта.
- FAQ-аккордеон, ripple на кнопках.
- «Свет за курсором», tilt+glow на плитках/карточках.
- Галерея фото с лайтбоксом (клик/Enter/Space → крупное фото ~70% экрана, закрытие ESC/клик/✕).
- Кликабельные плитки залов (ссылки на карты, `target=_blank`).
- Плашка VK, CTA, контакты (tel/mailto/соцсети).
- Адаптив: 3→2→1 колонки (900px / 560px), мобильное бургер-меню.
- SEO/OG: базовые meta + OG в `index.html` (статично).

Всё это подтверждено чтением кода и прохождением `smoke-test.js` / `verify.js`.


---

## 10. Известные проблемы и «места, которые важно не сломать»

Всё ниже — фактически замечено в коде/данных (не предположения).

### 10.1 Контент/данные
- **Дубль в галерее:** `kids-06.jpg` в `site.data.js` указан дважды (две одинаковые плитки).
- **Заглушки ссылок:** у всех залов `href = "https://www.google.com"` — не настоящие карты.
- **`brand.tagline` не используется** рендером (есть в данных, но нигде не выводится).
- **Часть данных — примерная** (распределение медалей, часы работы залов всегда «закрыто»/`open:false`).
  README прямо просит заменить на достоверные.
- В галерее есть **неиспользуемые фото** в папке: `kids-02.jpg` не встречается ни в конфиге,
  ни (соответственно) в галерее. Остальные фото задействованы.

### 10.2 Крупные файлы изображений (производительность)
- `demid.jpg` ≈ **3.2 МБ** и `team-01.jpg` ≈ **2.0 МБ**, `cover.jpg` ≈ 380 КБ.
- Заметно на мобильных и на медленной сети. `loading="lazy"` стоит на фото галереи и тренера,
  но размеры всё равно большие. Рекомендация: сжать/перекодировать (WebP, `quality ~80`,
  целевой вес < 300–400 КБ), сохранив имена или обновив их в `site.data.js`.
- Первый элемент галереи (`cover.jpg`) грузится лениво (не `eager`) — при желании сделать
  приоритетным можно добавить `loading="eager"` в рендерер.

### 10.3 Поведение/UX
- **Нет реального «фокуса-ловушки»** в лайтбоксе: фокус ставится на ✕, но Tab может уйти на
  элементы под оверлеем (aria-modal задан, но focus trap не реализован). Для полной
  доступности стоит добавить циклический фокус.
- При открытом лайтбоксе **любой клик закрывает** — включая клик по подписи (подпись вне `.frame`,
  но внутри `.lightbox`, поэтому всплывает до `box`). Это заявленное поведение, но стоит знать.
- Галерея кликабельна на мобильных (тач), но **tilt/glow для тача отключён** (`hover:none`).
- Мобильное меню `.nav` позиционируется `inset: 74px 4vw auto 4vw` — завязано на высоту шапки;
  при изменении `padding` шапки подгонять.
- `scroll-behavior: smooth` глобально + `overflow-x: hidden` на `body` — учитывать при правках.

### 10.4 Архитектурные ограничения
- **JS-only рендер**: при отключённом JS контента нет (пустой `<main>`). Плохо для SEO/доступности
  без JS. Плюс: есть meta/OG в `<head>`, но body-контента для краулера нет.
- **Тесты не покрывают UI**: `smoke-test.js`/`verify.js` работают в `vm` без DOM — не проверяют
  CSS, лайтбокс, события, доступность.
- **Нет версионирования/git**: папка не под git. Любые правки не отслеживаются — легко потерять
  рабочее состояние. Рекомендуется `git init` перед крупными изменениями.
- **Кодировка UTF-8 без BOM** критична (см. §5).

### 10.5 Что НЕ ломать (чек-лист при правках)
1. Порядок `<script>` в `index.html`: данные → движок → app.
2. `window.SITE` и `window.__LG` как контракт между файлами.
3. `esc()`-экранирование — не вставлять сырой HTML из конфига.
4. Классы/селекторы, на которые завязан JS: `.reveal`, `.bar[data-pct]`, `.faq__item/.faq__q`,
   `.btn`, `#site-header`, `#site-nav`, `#menu-toggle`, `#theme-toggle`, `.glass.fx`, `.fx-glow`,
   `.gallery .tile`, `.gallery .lb-item`, data-атрибуты `data-img/title/caption`, `data-count/suffix`.
5. `html.tilt-js`, `html.lb-open`, `html.theme-anim` — управляют CSS-состояниями.
   Мобильная шторка: `.nav.open` (контракт) + `.nav--js` / `.nav--closed` и инлайновые
   `visibility`/`opacity` на `#site-nav` — не завязывай на них layout desktop-меню.
6. Класс `hidden` на `.lightbox` (display:none через атрибутный селектор).
7. `stopPropagation` на кнопке ✕ лайтбокса.
8. Отсутствие BOM и корректная кириллица в комментариях.
9. Ключи `kind` в конфиге должны совпадать с `builders` в `render.js` (иначе секция пропадёт —
   `smoke-test.js` это поймает).


---

## 11. Рекомендации по дальнейшей работе

Приоритезировано (сначала то, что даёт больше пользы и меньше риска).

### Высокий приоритет
1. **Сжать тяжёлые фото** (`demid.jpg` 3.2 МБ, `team-01.jpg` 2 МБ) — самый заметный выигрыш
   по скорости. Перекодировать в WebP/JPEG качеством ~80; при смене имён обновить `site.data.js`.
2. **Убрать дубль** `kids-06.jpg` в галерее.
3. **Заменить заглушки `href` залов** на реальные ссылки на карты (Google/Яндекс/2GIS).
4. **`git init`** и первый коммит, если планируется активная доработка.

### Средний приоритет
5. **Focus trap в лайтбоксе** (+ возврат фокуса уже есть) для полноценной доступности.
6. **Использовать/убрать `brand.tagline`** — сейчас «мертвое» поле.
7. **Уточнить контент** (медали по достоинству, часы работы залов, реальные отзывы) —
   README и сам файл помечают эти данные как примерные.
8. **OG-картинка** (`og:image`) и, при желании, `og:url` — сейчас нет.
9. Проверка на **низких/больших разрешениях** и в Safari (важно для `backdrop-filter`).

### Низкий приоритет / идеи
10. **Кнопки/ссылки вверх/вниз по галерее, превью-навигация** в лайтбоксе (сейчас одну фото можно
    только открыть/закрыть; перелистывания нет).
11. **Предзагрузка** соседних фото галереи.
12. **SSR/pre-render** или хотя бы `<noscript>`-фолбэк, если важна индексация без JS.
13. Расширить тесты: простой DOM-e2e (например, через Playwright) для лайтбокса и меню —
    но это добавит зависимости, что противоречит «без сборки». Взвешивать осознанно.

### Как безопасно менять
- Меняй контент только в `content/site.data.js`; дизайн-токены — в `theme.css`; структуру — в
  `styles.css`/`render.js`; поведение — в `app.js`.
- После правок: `node --check` затронутых JS, затем `node tools/smoke-test.js` и `node tools/verify.js`.
- Прогоняй руками: открыть каждое фото галереи, проверить размер/скругление/подпись/три способа
  закрытия; переключить тему; проверить мобильное меню; проверить залы-ссылки. Готово, когда
  «Ctrl+F5» показывает ожидаемое без ошибок в консоли.

---

## 12. Быстрая шпаргалка для новой модели

| Задача | Где править |
|--------|-------------|
| Тексты, фото, порядок блоков, меню, бренд | `content/site.data.js` |
| Цвета/палитры, радиусы, тени, схемы | `assets/css/theme.css` |
| Вёрстка, эффекты, лайтбокс-стили, адаптив | `assets/css/styles.css` |
| Новая секция / разметка блока | `assets/js/render.js` (добавить в `builders`) |
| Поведение (скролл/тема/лайтбокс/tilt) | `assets/js/app.js` |
| Размер фото в лайтбоксе | `const FIT` в `app.js` (~0.65–0.75) |
| Заголовок/OG/favicon | `index.html` |

Команды:
```
node tools/serve.js
node --check assets/js/app.js assets/js/render.js content/site.data.js
node tools/smoke-test.js
node tools/verify.js
```

---

## 13. Приложение: сводка фактов

- Файлов кода: 3 JS (app, render, data) + 2 CSS (theme, styles) + 1 HTML + 3 tools JS.
- Длина: `app.js` 455, `render.js` 381, `styles.css` 814, `theme.css` 97, `site.data.js` 313,
  `index.html` 32, `serve.js` 45, `smoke-test.js` 64, `verify.js` 49 строк.
- Секций: **12** (`hero, features, stats, medals, coach, gallery, locations, reviews, faq, vk, cta, contact`).
- Фото в `assets/img/`: **12 файлов**, из них используются **11** (`kids-02.jpg` — нет).
- Изображения галереи (по конфигу): cover, training-01, training-02, team-01, team-02, kids-01,
  demid, kids-03, kids-04, kids-05, kids-06 (kids-06 — дважды).
- Тема: `taekwondo`; схема по умолчанию: `dark` (или системная через localStorage).
- Внешние зависимости: **нет**.
- BOM: **нет** ни в одном текстовом файле (проверено).
- Тесты: `smoke-test` — 12/12 OK, 0 ошибок; `verify` — 0 ошибок.
- Кодировка/язык интерфейса: русский (`lang="ru"`).
- `package.json` / git: отсутствуют.

> Конец документа. Если что-то в коде изменится после этой даты — сверяйся с фактическими файлами,
> а не с этим текстом.

