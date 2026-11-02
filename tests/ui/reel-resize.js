// Đổi cỡ cửa sổ trong lúc dải đang quay (trang Case và Type Roulette): dải vẫn dừng đúng thẻ thắng và đúng giờ,
// không dừng ở vị trí đã tính theo cỡ cũ, và không tăng tốc lại sau khi đổi cỡ (vẫn giảm tốc như trước).
const { app, BrowserWindow } = require("electron");
const path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-reel-resize"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const TIMING = require("./timing");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

const REELS = [
  { label: "Case", reel: "reel", ms: 6000, limit: TIMING.CASE_POPUP_MS, view: "case", spin: `document.getElementById("btn-spin").click()` },
  { label: "Type Roulette", reel: "tr-reel", ms: 4000, limit: TIMING.ROULETTE_POPUP_MS, view: "custom", spin: `document.querySelector('.action-main[data-action="open"]').click()` },
];
const WIDTHS = [[1300, 800], [800, 1300], [1300, 390]]; // 390: thẻ nhỏ đi nên vị trí mọi thẻ đều đổi

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
  await js(`localStorage.clear(); localStorage.setItem("pokeroll.custom.typeRoulette.type", '"fire"'); localStorage.setItem("pokeroll.custom.mode", '"type-roulette"')`);
  await win.reload(); await sleep(500);

  const stateOf = (id) => js(`(() => {
    const reel = document.getElementById("${id}"), strip = reel.querySelector(".reel-strip"), won = strip.querySelector(".card.is-winner");
    const r = reel.getBoundingClientRect(), mid = r.left + r.width / 2, c = won && won.getBoundingClientRect();
    return { onWinner: !!c && c.left <= mid && mid < c.right, anims: strip.getAnimations().length,
      matches: !!won && won.querySelector(".card-name").textContent === document.getElementById("result-name").textContent }; })()`);

  // Tốc độ dải (px/s, trên màn hình) trong khoảng [from, to] ms tính từ lúc đổi cỡ.
  const startTrack = (id) => js(`(() => {
    const strip = document.querySelector("#${id} .reel-strip"); window.track = []; window.resizedAt = null;
    window.addEventListener("resize", () => { if (window.resizedAt === null) window.resizedAt = performance.now(); });
    const loop = () => { if (!document.getElementById("result-modal").open) { track.push([performance.now(),
      new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41 + (parseFloat(strip.style.translate) || 0)]); requestAnimationFrame(loop); } };
    requestAnimationFrame(loop); })()`);
  const speed = (from, to) => js(`(() => { const a = track.filter(([t]) => t >= resizedAt + ${from} && t <= resizedAt + ${to});
    return a.length > 1 ? Math.abs(a[a.length - 1][1] - a[0][1]) / ((a[a.length - 1][0] - a[0][0]) / 1000) : null; })()`);

  for (const R of REELS) {
    await js(`document.querySelector('.tab[data-view="${R.view}"]').click()`); await sleep(200);
    for (const [from, to] of WIDTHS) {
      win.setContentSize(from, 900); await sleep(300);
      await js(`document.getElementById("${R.reel}").dataset.t0 = performance.now(); ${R.spin}`);
      await sleep(R.ms / 3);
      win.setContentSize(to, 900);
      for (let t = 0; t < R.limit && !(await js(`document.getElementById("result-modal").open`)); t += 50) await sleep(50);
      const at = Math.round(await js(`performance.now() - Number(document.getElementById("${R.reel}").dataset.t0)`));
      const s = await stateOf(R.reel);
      check(`${R.label}, ${from} → ${to}px during the spin: stops on the winner`, s.onWinner && s.matches && s.anims === 0, `onWinner=${s.onWinner}, matches=${s.matches}, animations=${s.anims}`);
      check(`${R.label}, ${from} → ${to}px during the spin: popup comes on time`, at < R.ms + 1500, `${at} ms (reel ${R.ms} ms)`);
      await js(`document.getElementById("result-modal").close()`); await sleep(100);
    }
    // Đổi cỡ lúc dải đã chậm hẳn: sau khi đổi cỡ dải không chạy nhanh lên
    await js(`document.getElementById("${R.reel}").dataset.t0 = performance.now(); ${R.spin}`);
    await sleep(500); await startTrack(R.reel);
    await sleep(R.ms * 0.6);
    win.setContentSize(1000, 900);
    for (let t = 0; t < R.limit && !(await js(`document.getElementById("result-modal").open`)); t += 50) await sleep(50);
    const before = await speed(-300, -20), after = await speed(250, 550);
    const s = await stateOf(R.reel);
    check(`${R.label}, resize late in the spin: reel keeps slowing down, no new burst of speed`, before > 0 && after !== null && after <= before * 1.05 && s.onWinner,
      `${Math.round(before)} px/s before, ${Math.round(after)} px/s after, onWinner=${s.onWinner}`);
    await js(`document.getElementById("result-modal").close()`); await sleep(100);
    win.setContentSize(1300, 900); await sleep(300);
  }

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
