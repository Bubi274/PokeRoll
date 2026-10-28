// Đồng hồ dự phòng của dải quay (animateReel) cho cả trang Case, Type Roulette và Biome Roulette:
//   A. Dải bắt đầu chạy trễ (máy chậm; ở đây giả lập bằng CSS transition-delay 1,5 s):
//      popup chỉ hiện khi dải đã dừng đúng ở thẻ thắng, không hiện lúc dải còn trượt.
//   B. Trình duyệt không báo gì (CSS tắt transition → không có transitionstart / transitionend):
//      popup vẫn hiện nhờ đồng hồ dự phòng, dải ở đúng thẻ thắng.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-reel-timing"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

const DELAY = 1500;
const REELS = [
  { label: "Case", reel: "reel", ms: 6000, view: "case", spin: `document.getElementById("btn-spin").click()` },
  { label: "Type Roulette", reel: "tr-reel", ms: 4000, view: "custom", mode: "type-roulette", spin: `document.querySelector('.action-main[data-action="open"]').click()` },
  { label: "Biome Roulette", reel: "br-reel", ms: 4000, view: "custom", mode: "biome-roulette", spin: `document.querySelector('.action-main[data-action="open"]').click()` },
];

process.on("unhandledRejection", (e) => { console.log("FAIL  test crashed: " + e); app.exit(1); });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1300, height: 900, show: false, webPreferences: { backgroundThrottling: false, offscreen: true } });
  win.webContents.setFrameRate(60);
  const errors = [];
  win.webContents.on("console-message", (e, level, msg) => {
    const lv = e.level !== undefined ? e.level : level, text = e.message !== undefined ? e.message : msg;
    if (lv === "error" || lv === 3) errors.push(text);
  });
  const js = (code) => win.webContents.executeJavaScript(code);
  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await js(`localStorage.clear(); localStorage.setItem("pokeroll.custom.typeRoulette.type", '"fire"'); localStorage.setItem("pokeroll.custom.biomeRoulette.biome", '"forest"')`);
  await win.reload(); await sleep(500);

  // Quay một lần với CSS chèn thêm; trả về thời điểm popup mở và trạng thái dải lúc đó (đo ngay trong trang)
  const run = (R, css) => js(`(async () => {
    const style = document.createElement("style"); style.textContent = ${JSON.stringify(css)}; document.head.appendChild(style);
    ${R.mode ? `document.querySelector('.tab[data-view="custom"]').click(); document.querySelector('.mode-btn[data-mode="${R.mode}"]').click();` : `document.querySelector('.tab[data-view="case"]').click();`}
    await new Promise((r) => setTimeout(r, 300));
    const modal = document.getElementById("result-modal"), reel = document.getElementById("${R.reel}");
    const t0 = performance.now(); ${R.spin};
    while (!modal.open && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 20));
    const at = performance.now() - t0;
    const strip = reel.querySelector(".reel-strip"), win = strip.querySelector(".card.is-winner");
    const shown = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41, target = parseFloat(strip.style.transform.slice(11));
    const r = reel.getBoundingClientRect(), mid = r.left + r.width / 2, c = win ? win.getBoundingClientRect() : null;
    const res = { open: modal.open, at: Math.round(at), settled: Math.abs(shown - target) < 0.5, onWinner: !!c && c.left <= mid && mid < c.right,
      matches: !!win && win.querySelector(".card-name").textContent === document.getElementById("result-name").textContent };
    modal.close(); style.remove();
    await new Promise((r) => setTimeout(r, 200));
    return res; })()`);

  for (const R of REELS) {
    // A. Bắt đầu trễ
    let r = await run(R, `#${R.reel} .reel-strip { transition-delay: ${DELAY}ms !important; }`);
    check(`${R.label}, reel starts ${DELAY / 1000}s late: popup opens only once the reel has stopped on the winner`, r.open && r.settled && r.onWinner && r.matches,
      `popup after ${r.at} ms (reel ends ≈ ${R.ms + DELAY} ms), settled=${r.settled}, onWinner=${r.onWinner}`);
    check(`${R.label}, reel starts late: popup not held back much past the reel's end`, r.at >= R.ms + DELAY - 100 && r.at < R.ms + DELAY + 1500, `${r.at} ms`);
    // B. Không có sự kiện transition nào
    r = await run(R, `#${R.reel} .reel-strip { transition: none !important; }`);
    check(`${R.label}, browser reports nothing: popup still opens (fallback timer), reel on the winner`, r.open && r.settled && r.onWinner && r.matches,
      `popup after ${r.at} ms (fallback ≈ ${R.ms + 2500} ms)`);
    check(`${R.label}, browser reports nothing: fallback fires ≈ ms + 500 + 2000`, r.at >= R.ms + 2400 && r.at < R.ms + 4000, `${r.at} ms`);
  }

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
