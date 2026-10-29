/* Security regressions for the local preview. Run: node --test tools/serve.test.js */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createStaticServer } = require("./serve.js");

test("preview exposes public files only and survives hostile requests", async (t) => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "tkd39-preview-"));
  const root = path.join(fixture, "site");
  const sibling = path.join(fixture, "site-private");
  await fs.mkdir(path.join(root, "assets", "img"), { recursive: true });
  await fs.mkdir(path.join(root, "content"), { recursive: true });
  await fs.mkdir(path.join(root, ".git"));
  await fs.mkdir(path.join(root, "private"));
  await fs.mkdir(path.join(root, "auth"));
  for (const page of ["login", "account", "callback", "private"]) {
    await fs.writeFile(path.join(root, "auth", page + ".html"), "<h1>Auth shell</h1>");
  }
  await fs.mkdir(sibling);
  await fs.writeFile(path.join(root, "index.html"), "<h1>Preview</h1>");
  await fs.writeFile(path.join(root, "content", "site.data.js"), "window.SITE = {};");
  await fs.writeFile(path.join(root, ".git", "HEAD"), "private marker");
  await fs.writeFile(path.join(root, ".env"), "private marker");
  await fs.writeFile(path.join(root, "CRM_ARCHITECTURE.md"), "private marker");
  await fs.writeFile(path.join(root, "content", "students.json"), "private marker");
  await fs.writeFile(path.join(sibling, "secret.jpg"), "private marker");
  await fs.writeFile(path.join(root, "private", "secret.jpg"), "private marker");
  const server = createStaticServer(root);
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    const tempRoot = await fs.realpath(os.tmpdir());
    const cleanupTarget = await fs.realpath(fixture);
    assert.equal(path.dirname(cleanupTarget), tempRoot);
    assert.ok(path.basename(cleanupTarget).startsWith("tkd39-preview-"));
    await fs.rm(cleanupTarget, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const request = (url, method = "GET") => new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: server.address().port,
      path: url, method }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers,
        body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("Request timed out")));
    req.end();
  });
  await t.test("public page, query string, content and HEAD work", async () => {
    const page = await request("/?v=1");
    assert.equal(page.status, 200);
    assert.match(page.body, /Preview/);
    assert.equal(page.headers["x-content-type-options"], "nosniff");
    assert.equal((await request("/content/site.data.js")).status, 200);
    const head = await request("/", "HEAD");
    assert.equal(head.status, 200);
    assert.equal(head.body, "");
    assert.equal(head.headers["content-length"], page.headers["content-length"]);
  });
  await t.test("Git, secrets, documents, future personal data and traversal are blocked", async () => {
    for (const url of ["/.git/HEAD", "/.env", "/CRM_ARCHITECTURE.md",
      "/content/students.json", "/%2eenv", "/../site-private/secret.jpg",
      "/assets/img/../../../site-private/secret.jpg",
      "/assets/img/%2e%2e/%2e%2e/%2e%2e/site-private/secret.jpg",
      "/assets/img/..%5c..%5csecret.jpg", "/assets/img/a%00.jpg"]) {
      const response = await request(url);
      assert.equal(response.status, 404, url);
      assert.doesNotMatch(response.body, /private marker/);
    }
  });
  await t.test("only three explicit static auth pages are public", async () => {
    for (const page of ["login", "account", "callback"]) {
      assert.equal((await request("/auth/" + page + ".html")).status, 200);
    }
    assert.equal((await request("/auth/private.html")).status, 404);
    assert.equal((await request("/api/v1/session")).status, 404);
  });
  await t.test("malformed URL returns 400 and server remains available", async () => {
    assert.equal((await request("/%E0%A4%A")).status, 400);
    assert.equal((await request("/%")).status, 400);
    assert.equal((await request("/")).status, 200);
    const post = await request("/", "POST");
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, "GET, HEAD");
  });
  await t.test("symlinks cannot expose sibling or private in-root directories", async () => {
    await fs.symlink(sibling, path.join(root, "assets", "img", "external"),
      process.platform === "win32" ? "junction" : "dir");
    assert.equal((await request("/assets/img/external/secret.jpg")).status, 404);
    await fs.symlink(path.join(root, "private"), path.join(root, "assets", "img", "internal"),
      process.platform === "win32" ? "junction" : "dir");
    assert.equal((await request("/assets/img/internal/secret.jpg")).status, 404);
  });
});
