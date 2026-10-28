// Footer bản desktop: dùng đúng preload.js và tham số như main.js truyền vào.
//   - Không có preload (bản web, GitHub Pages): footer như cũ, không có dòng phiên bản.
//   - Bản đã đóng gói: "PokéRoll vX.Y.Z · Check for updates"; bấm nút gọi main process (ipc "check-for-updates").
//   - npm start (chưa đóng gói): "PokéRoll vX.Y.Z (dev)", không có nút.
// Mỗi trường hợp chạy trong một tiến trình Electron riêng, giống app thật (một cửa sổ, một bộ tham số):
// mở lần lượt nhiều cửa sổ với additionalArguments khác nhau trong cùng tiến trình làm Electron bị lỗi.
const { app, BrowserWindow, ipcMain } = require("electron");
const { spawnSync } = require("child_process");
const path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-desktop"));
const ROOT = path.join(__dirname, "..", "..");
const PAGE = path.join(ROOT, "index.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

// Giả main process: ghi lại lần gọi, trả lời sau 400 ms (như lúc đang kiểm tra cập nhật)
let calls = 0;
ipcMain.handle("check-for-updates", async () => { calls++; await sleep(400); return "latest"; });

async function open(args) {
  const errors = [];
  const win = new BrowserWindow({ width: 1300, height: 900, show: false, webPreferences: {
    offscreen: true, contextIsolation: true, nodeIntegration: false, sandbox: true,
    ...(args ? { preload: path.join(ROOT, "preload.js"), additionalArguments: args } : {}) } });
  win.webContents.on("console-message", (e, level, msg) => {
    const lv = e.level !== undefined ? e.level : level, text = e.message !== undefined ? e.message : msg;
    if (lv === "error" || lv === 3) errors.push(text);
  });
  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await sleep(300);
  const js = (code) => win.webContents.executeJavaScript(code);
  const footer = () => js(`(() => { const v = document.getElementById("app-version"), u = document.getElementById("app-update"), b = document.getElementById("btn-update");
    return { shown: !v.hidden && v.offsetParent !== null, text: v.innerText.replace(/\\s+/g, " ").trim(), button: !u.hidden, label: b.textContent, disabled: b.disabled,
      dataLine: getComputedStyle(document.querySelector(".site-footer p:last-of-type")).marginTop, api: typeof window.pokeroll }; })()`);
  return { win, js, footer, errors };
}

const CASE = process.env.POKEROLL_DESKTOP_CASE;
if (!CASE) {
  // Tiến trình cha: chạy từng trường hợp trong tiến trình con, gộp kết quả
  let failed = 0;
  for (const c of ["web", "packaged", "dev"]) {
    const r = spawnSync(process.execPath, [__filename], { env: { ...process.env, POKEROLL_DESKTOP_CASE: c }, encoding: "utf8", timeout: 120000 });
    const lines = (r.stdout || "").split("\n").filter((l) => /^(PASS|FAIL)  /.test(l));
    console.log(lines.join("\n"));
    if (r.status !== 0 || !lines.length || lines.some((l) => l.startsWith("FAIL"))) failed++;
    if (!lines.length) console.log(`FAIL  ${c}: no result (exit ${r.status}, signal ${r.signal})`);
  }
  console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
  app.exit(failed ? 1 : 0);
} else app.whenReady().then(() => runCase(CASE));

process.on("unhandledRejection", (e) => { console.log("FAIL  test crashed: " + e); app.exit(1); });
async function runCase(CASE) {
  if (CASE === "web") {
  // ---- Bản web: không có preload ----
  const w = await open(null);
  const f = await w.footer();
  check("Web (no preload): no window.pokeroll, version line hidden", f.api === "undefined" && !f.shown);
  check("Web: footer \"Data\" line keeps its spacing (10px)", f.dataLine === "10px", f.dataLine);
  check("Web: no console errors", w.errors.length === 0, w.errors.join(" | "));
  }

  if (CASE === "packaged") {
  // ---- Bản đã đóng gói ----
  const w = await open(["--pokeroll-version=9.8.7", "--pokeroll-packaged=1"]);
  let f = await w.footer();
  check("Packaged: \"PokéRoll v9.8.7 · Check for updates\"", f.shown && f.button && f.text === "PokéRoll v9.8.7 · Check for updates", f.text);
  check("Packaged: preload exposes only version, packaged, checkForUpdates", (await w.js(`Object.keys(window.pokeroll).sort().join()`)) === "checkForUpdates,packaged,version");
  check("Packaged: no Node / Electron access in the page", (await w.js(`typeof require === "undefined" && typeof process === "undefined"`)));
  await w.js(`document.getElementById("btn-update").click()`);
  await sleep(100);
  f = await w.footer();
  check("Click: asks the main process to check for updates", calls === 1, `${calls} call(s)`);
  check("…button shows \"Checking…\" and is disabled while it runs", f.label === "Checking…" && f.disabled);
  await w.js(`document.getElementById("btn-update").click()`); // bấm lại khi đang chạy: không gọi thêm
  await sleep(500);
  f = await w.footer();
  check("…a second click while checking does nothing", calls === 1, `${calls} call(s)`);
  check("…back to \"Check for updates\" afterwards", f.label === "Check for updates" && !f.disabled);
  check("Space on the button still doesn't open a case", await w.js(`(() => { const h = state.history.length; document.getElementById("btn-update").dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true })); return state.history.length === h && !state.spinning; })()`));
  check("Packaged: no console errors", w.errors.length === 0, w.errors.join(" | "));
  }

  if (CASE === "dev") {
  // ---- npm start (chưa đóng gói) ----
  const w = await open(["--pokeroll-version=9.8.7", "--pokeroll-packaged=0"]);
  const f = await w.footer();
  check("npm start: \"PokéRoll v9.8.7 (dev)\", no update button", f.shown && !f.button && f.text === "PokéRoll v9.8.7 (dev)", f.text);
  }

  app.exit(fails ? 1 : 0);
}
