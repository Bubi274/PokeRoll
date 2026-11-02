// Bản web khai báo icon: mở qua server tĩnh ở đường dẫn con như GitHub Pages, trình duyệt lấy đúng icon của app
// (trả về 200) và không tìm tới /favicon.ico (không có file đó, sẽ nhận 404).
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), http = require("http"), path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-favicon"));
const ROOT = path.join(__dirname, "..", "..");
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

process.on("unhandledRejection", (e) => { console.log("FAIL  test crashed: " + e); app.exit(1); });
app.whenReady().then(async () => {
  const server = http.createServer((q, s) => {
    const p = decodeURIComponent(q.url.split("?")[0]);
    const f = path.join(ROOT, p.replace(/^\/PokeRoll\//, "") || "index.html");
    if (!p.startsWith("/PokeRoll/") || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200); fs.createReadStream(f).pipe(s);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const win = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { offscreen: true } });
  const icons = new Promise((r) => win.webContents.once("page-favicon-updated", (e, list) => r(list)));
  await win.loadURL(`${base}/PokeRoll/index.html`);
  const list = await Promise.race([icons, new Promise((r) => setTimeout(() => r([]), 5000))]);
  check("Page declares one icon, and not the default /favicon.ico", list.length === 1 && !list[0].endsWith("/favicon.ico"), list.join(" "));
  const res = list[0] ? await new Promise((r) => http.get(list[0], (m) => { const chunks = []; m.on("data", (c) => chunks.push(c)); m.on("end", () => r({ status: m.statusCode, body: Buffer.concat(chunks) })); })) : {};
  check("Icon loads from the site", res.status === 200, `${res.status} ${list[0]}`);
  check("It is the app's own icon", !!res.body && res.body.equals(fs.readFileSync(path.join(ROOT, "build", "icon.png"))));

  server.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
