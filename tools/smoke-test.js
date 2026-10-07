/* Простой дымовой тест конфига и рендереров (запуск: node tools/smoke-test.js) */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// минимальная заглушка браузера
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.document = {
  createElement: () => ({ set innerHTML(v) { this._h = v; }, content: { firstElementChild: {} } }),
  querySelector: () => null,
};
vm.createContext(sandbox);

// 1) конфиг
vm.runInContext(read("content/site.data.js"), sandbox);
// 2) движок
vm.runInContext(read("assets/js/render.js"), sandbox);

const SITE = sandbox.window.SITE;
const LG = sandbox.window.__LG;
let fail = 0;

if (!SITE || !Array.isArray(SITE.sections) || SITE.sections.length === 0) {
  console.error("FAIL: конфиг пустой или sections отсутствует");
  fail++;
}

SITE.sections.forEach((sec) => {
  const make = LG.builders[sec.kind];
  if (!make) {
    console.error("FAIL: нет рендерера для kind =", sec.kind);
    fail++;
    return;
  }
  const html = make(sec);
  if (typeof html !== "string" || html.length < 20) {
    console.error("FAIL: пустая разметка для", sec.kind, sec.id);
    fail++;
  }
  if (/undefined|NaN/.test(html)) {
    console.error("FAIL: в разметке", sec.id, "встречается undefined/NaN");
    fail++;
  }
  if (!html.includes('id="' + sec.id + '"')) {
    console.error("FAIL: секция", sec.id, "без id-якоря");
    fail++;
  }
  console.log("OK  ·", sec.kind.padEnd(9), "→", sec.id);
});

// проверка темы
const themes = ["aurora", "sunset", "mint", "mono", "taekwondo"];
if (!themes.includes(SITE.theme)) {
  console.error("FAIL: неизвестная тема", SITE.theme);
  fail++;
}

console.log("\nСекций:", SITE.sections.length, "| Ошибок:", fail);
process.exit(fail ? 1 : 0);
