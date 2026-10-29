/* Мини-сервер для локального просмотра (без зависимостей).
 * Запуск:  node tools/serve.js   →  http://localhost:5173
 * Остановить: Ctrl + C
 */
const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const root = path.join(__dirname, "..");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

// Only browser assets are public. Repository files, future CRM data and secrets
// must never become downloadable just because they exist in the project root.
function isPublicPath(url) {
  return url === "/index.html" || url === "/content/site.data.js" ||
    /^\/auth\/(?:login|account|callback)\.html$/.test(url) ||
    /^\/assets\/css\/[A-Za-z0-9_/-]+\.css$/.test(url) ||
    /^\/assets\/js\/[A-Za-z0-9_/-]+\.js$/.test(url) ||
    /^\/assets\/img\/[A-Za-z0-9_./-]+\.(?:svg|png|jpe?g|webp|ico)$/.test(url);
}

function isInside(base, file) {
  const relative = path.relative(base, file);
  return relative !== "" && relative !== ".." &&
    !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function createStaticServer(rootDir = root) {
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    const reply = (status, message) => {
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(req.method === "HEAD" ? undefined : message);
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return reply(405, "Method not allowed");
    }

    let url;
    try {
      url = decodeURIComponent((req.url || "/").split("?")[0]);
    } catch {
      // A malformed percent escape must not crash the preview process.
      return reply(400, "Bad request");
    }
    if (!url.startsWith("/") || url.includes("\\") || url.includes("\0") ||
        url.split("/").some((part) => part === ".." || part === ".")) {
      return reply(404, "Not found");
    }
    if (url === "/") url = "/index.html";
    if (!isPublicPath(url)) return reply(404, "Not found");

    try {
      const base = await fs.realpath(rootDir);
      const requested = path.resolve(base, "." + url);
      if (!isInside(base, requested)) return reply(404, "Not found");
      const file = await fs.realpath(requested);
      // Resolve links too: a symlink inside assets must not expose outside data.
      const canonicalUrl = "/" + path.relative(base, file).split(path.sep).join("/");
      if (!isInside(base, file) || !isPublicPath(canonicalUrl) || !(await fs.stat(file)).isFile()) {
        return reply(404, "Not found");
      }
      const data = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(url)] || "application/octet-stream",
        "Content-Length": data.length,
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (error) {
      if (["ENOENT", "ENOTDIR", "EACCES", "ELOOP", "EPERM"].includes(error.code)) {
        return reply(404, "Not found");
      }
      reply(500, "Internal server error");
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  // This is a local preview, not a production web server.
  createStaticServer().listen(port, "127.0.0.1", () => {
    console.log("Liquid Glass → http://127.0.0.1:" + port);
  });
}

module.exports = { createStaticServer, isPublicPath };
