/* Проверка: рендер всех секций + наличие ключевых данных (node tools/verify.js) */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const sandbox = { window: {}, console };
sandbox.window = sandbox;
sandbox.document = {
  createElement: () => ({ set innerHTML(v) { this._h = v; }, content: { firstElementChild: {} } }),
  querySelector: () => null,
};
vm.createContext(sandbox);
vm.runInContext(read("content/site.data.js"), sandbox);
vm.runInContext("window.__LG=null;" + read("assets/js/render.js"), sandbox);

const SITE = sandbox.window.SITE;
const LG = sandbox.window.__LG;
let html = "";
SITE.sections.forEach((s) => (html += LG.builders[s.kind](s)));

const checks = [
  ["телефон", /\+7 \(960\) 297-53-77/],
  ["VK ссылка", /https:\/\/vk\.ru\/tkdmft39/],
  ["почта", /tkdmft39@mail\.ru/],
  ["RuTube", /rutube\.ru\/play\/embed\//],
  ["тренер", /Иван Николаевич Миховский/],
  ["чёрный пояс", /Чёрный пояс/],
  ["31 медаль", /31 медаль/],
  ["Ташкент", /Ташкент/],
  ["Челнокова 43", /Челнокова, 43/],
  ["ТЦ Гиант", /ТЦ Гиант/],
  ["Юность", /Маршала Баграмяна, 2/],
  ["фото", /assets\/img\//],
];
let fail = 0;
checks.forEach(([name, re]) => {
  const ok = re.test(html);
  console.log((ok ? "OK   " : "FAIL ") + name);
  if (!ok) fail++;
});
// все img-файлы существуют
const imgs = [...new Set((html.match(/assets\/img\/[^"]+/g) || []))];
imgs.forEach((p) => {
  const ok = fs.existsSync(path.join(root, p));
  console.log((ok ? "OK   " : "FAIL ") + "файл " + p);
  if (!ok) fail++;
});
console.log("\nОшибок:", fail);
process.exit(fail ? 1 : 0);
