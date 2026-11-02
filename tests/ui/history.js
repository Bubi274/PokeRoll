// Lịch sử quay có mục hỏng (độ hiếm không hợp lệ): tab Collection vẫn chạy, mục hỏng không hiện (cả ở Recent drops)
// nhưng không bị xoá khỏi dữ liệu đã lưu.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-history"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

const HISTORY = [
  { id: 25, rarity: "blue", shiny: false, t: 1760000000000 },
  { id: 1, rarity: "not-a-tier", shiny: false, t: 1760000000001 },
  { id: 4, shiny: false, t: 1760000000002 },
  { id: 7, rarity: "pink", shiny: true, t: 1760000000003 },
];

process.on("unhandledRejection", (e) => { console.log("FAIL  test crashed: " + e); app.exit(1); });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1300, height: 900, show: false, webPreferences: { offscreen: true } });
  const errors = [];
  win.webContents.on("console-message", (e, level, msg) => {
    const lv = e.level !== undefined ? e.level : level, text = e.message !== undefined ? e.message : msg;
    if (lv === "error" || lv === 3) errors.push(text);
  });
  const js = (code) => win.webContents.executeJavaScript(code);
  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await js(`localStorage.clear(); localStorage.setItem("pokeroll.history", ${JSON.stringify(JSON.stringify(HISTORY))});
    localStorage.setItem("pokeroll.collection", '{"25":{"count":1,"shiny":0,"first":1}}')`);
  await win.reload(); await sleep(500);

  const recent = await js(`[...document.querySelectorAll("#recent-row .recent-item")].map((b) => b.dataset.pokemon + ":" + b.className)`);
  check("Bad history entries: Recent drops lists only the valid ones", recent.join() === "25:recent-item r-blue,7:recent-item r-pink", recent.join());
  await js(`document.querySelector('.tab[data-view="collection"]').click()`); await sleep(300);
  const page = () => js(`({ tiles: document.querySelectorAll("#coll-grid [data-pokemon]").length,
    rows: [...document.querySelectorAll("#history-list .hist")].map((b) => b.dataset.pokemon),
    count: document.getElementById("history-count").textContent })`);
  let p = await page();
  check("Bad history entries: Collection page still renders", p.tiles > 1000, `${p.tiles} tiles`);
  check("Bad history entries: valid ones listed, bad ones skipped", p.rows.join() === "25,7", p.rows.join());
  check("Bad history entries: count matches the rows shown", p.count === "Last 2 opens", p.count);
  check("Bad history entries: no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  // Mở hòm (ghi lại lịch sử) và tải lại: mục hỏng vẫn còn trong dữ liệu đã lưu
  await js(`document.querySelector('.tab[data-view="case"]').click(); document.getElementById("btn-quick").click()`); await sleep(500);
  await js(`document.getElementById("result-modal").close()`);
  const saved = await js(`JSON.parse(localStorage.getItem("pokeroll.history"))`);
  const kept = saved.filter((h) => h.id === 1 || h.id === 4).length;
  check("Saving does not delete the bad entries", saved.length === HISTORY.length + 1 && kept >= 2, `${saved.length} saved`);
  await win.reload(); await sleep(500);
  await js(`document.querySelector('.tab[data-view="collection"]').click()`); await sleep(300);
  p = await page();
  check("After reload: valid entries listed", p.rows.length === 3 && p.count === "Last 3 opens", `${p.rows.join()} · ${p.count}`);

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
