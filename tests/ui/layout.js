// Kiểm tra không có cuộn ngang ở các độ rộng điện thoại, cho cả 3 trang.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-overflow"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 390, height: 800, show: false, webPreferences: { offscreen: true } });
  const js = (code) => win.webContents.executeJavaScript(code);
  await win.loadFile(PAGE); await sleep(400);
  // Quay một lượt ở trang Custom để dải thẻ, bánh xe và bảng tỉ lệ đều có nội dung
  await js(`showView("custom"); document.querySelector('.action-quick[data-action="wheel"]').click(); document.querySelector('.action-quick[data-action="open"]').click(); document.getElementById("result-modal").close();
    selectCustomMode("biome-roulette"); document.querySelector('.action-quick[data-action="biome"]').click(); document.querySelector('.action-quick[data-action="open"]').click(); document.getElementById("result-modal").close()`); // trang Custom kiểm tra với Biome Roulette đang mở
  for (const w of [320, 360, 390, 430, 768]) {
    win.setContentSize(w, 800); await sleep(300);
    for (const view of ["case", "collection", "custom"]) {
      await js(`showView("${view}")`); await sleep(150);
      const r = await js(`(() => { const d = document.documentElement;
        const tabs = [...document.querySelectorAll(".tab")].map(t => t.getBoundingClientRect());
        // Phần tử nhô ra ngoài mép phải mà không nằm trong khung có overflow ẩn/cuộn
        const clipped = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return p !== d && p !== document.body; } return false; };
        const out = [...document.querySelectorAll("#view-${view} *, .tabs *")].filter(el => el.getClientRects().length && el.getBoundingClientRect().right > d.clientWidth + 0.5 && !clipped(el))
          .slice(0, 4).map(el => el.tagName.toLowerCase() + "." + [...el.classList].join(".") + " → " + el.getBoundingClientRect().right.toFixed(0));
        return { sw: d.scrollWidth, cw: d.clientWidth, tabRight: Math.max(...tabs.map(b => b.right)), tabLeft: Math.min(...tabs.map(b => b.left)), out }; })()`);
      const ok = r.sw <= r.cw && r.tabRight <= r.cw && r.tabLeft >= 0;
      if (!ok) fails++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${w}px ${view}: scrollWidth ${r.sw} / ${r.cw}, tabs ${r.tabLeft.toFixed(0)}–${r.tabRight.toFixed(0)}${r.out.length ? "  overflow: " + r.out.join(", ") : ""}`);
    }
  }
  win.setContentSize(360, 300); await js(`showView("custom")`); await sleep(300);
  fs.writeFileSync(path.join(SHOTS, "tabs-360.png"), (await win.webContents.capturePage()).toPNG());
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
