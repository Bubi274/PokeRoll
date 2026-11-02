// App desktop không rời khỏi trang của mình: chạy đúng electron/main.js (cửa sổ được ẩn ngay khi tạo).
// Điều hướng sang file khác (như khi kéo một file vào cửa sổ) bị chặn và không mở ra ngoài; link https vẫn mở bằng
// trình duyệt ngoài; tải lại trang và chính trang với ?query (vd. ?nomotion) vẫn được.
const { app, BrowserWindow, shell } = require("electron");
const fs = require("fs"), path = require("path"), { pathToFileURL } = require("url");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-navigation"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

const opened = [];
shell.openExternal = async (url) => { opened.push(url); }; // ghi lại thay vì mở trình duyệt thật
app.on("browser-window-created", (e, w) => w.hide());
require("../../electron/main.js");

process.on("unhandledRejection", (e) => { console.log("FAIL  test crashed: " + e); app.exit(1); });
app.whenReady().then(async () => {
  for (let t = 0; t < 5000 && !BrowserWindow.getAllWindows().length; t += 50) await sleep(50);
  const wc = BrowserWindow.getAllWindows()[0].webContents;
  if (wc.isLoading()) await new Promise((r) => wc.once("did-finish-load", r));
  const home = wc.getURL();
  const atHome = () => wc.getURL() === home;
  const other = path.join(TMP, "other.html");
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(other, "<!doctype html><title>other</title><p>not the app</p>");

  // Sang một file khác
  await wc.executeJavaScript(`location.href = ${JSON.stringify(pathToFileURL(other).href)}; 0`).catch(() => {});
  await sleep(500);
  check("Navigating to another file: blocked, app stays on its page", atHome(), wc.getURL());
  if (!atHome()) await wc.loadURL(home);
  check("Blocked file is not opened outside the app", opened.length === 0, opened.join(" "));
  check("App still works", await wc.executeJavaScript(`typeof state === "object" && document.getElementById("btn-spin") !== null`).catch(() => false));

  // Như cũ: https mở bằng trình duyệt ngoài; tải lại và đổi query của chính trang thì được
  await wc.executeJavaScript(`location.href = "https://example.com/"; 0`).catch(() => {});
  await sleep(300);
  check("https link: stays in the app, opens in the browser", atHome() && opened.join() === "https://example.com/", opened.join(" "));
  await new Promise((r) => { wc.once("did-finish-load", r); wc.reload(); });
  check("Reload still works", atHome());
  await new Promise((r) => { wc.once("did-finish-load", r); wc.executeJavaScript(`location.href = location.pathname + "?nomotion=1"; 0`); });
  check("Same page with a query (?nomotion): allowed", wc.getURL() === home + "?nomotion=1", wc.getURL());

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
