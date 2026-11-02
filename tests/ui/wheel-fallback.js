// Đồng hồ dự phòng của bánh xe (animateWheel) ở cả 3 chế độ (giả lập máy chậm bằng CSS transition-delay):
//   - bánh xe bắt đầu quay trễ 1,5 s: không bị cắt ngang, kết quả chỉ hiện khi bánh xe tự dừng;
//   - bánh xe bắt đầu quay trễ hơn cả đồng hồ dự phòng, hoặc người dùng sang tab khác lúc bánh xe đang quay
//     (trình duyệt không báo bánh xe dừng) → bánh xe nhảy ngay tới góc dừng của ô trúng, không còn chuyển động nào.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-wheel-fallback"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const TIMING = require("./timing");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

const WHEELS = [
  { label: "Type Roulette", mode: "type-roulette", action: "wheel", w: "TYPE_WHEEL" },
  { label: "Biome Roulette", mode: "biome-roulette", action: "biome", w: "BIOME_WHEEL" },
  { label: "Letter Roulette", mode: "letter-roulette", action: "letter", w: "LETTER_WHEEL" },
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
  await js(`localStorage.clear(); document.querySelector('.tab[data-view="custom"]').click()`);

  for (const W of WHEELS) {
    await js(`document.querySelector('.mode-btn[data-mode="${W.mode}"]').click()`); await sleep(300);
    const spinWithDelay = (delay, watch) => js(`(async () => {
      const w = ${W.w}, disc = document.getElementById(w.disc);
      const style = document.createElement("style"); style.textContent = "#" + w.disc + " { transition-delay: ${delay}ms !important; }"; document.head.appendChild(style);
      const angle = () => { const m = new DOMMatrixReadOnly(getComputedStyle(disc).transform); return Math.atan2(m.b, m.a) * 180 / Math.PI; };
      const t0 = performance.now();
      document.querySelector('.action-main[data-action="${W.action}"]').click();
      await new Promise((r) => setTimeout(r, 100));
      while (state.spinning && performance.now() - t0 < ${TIMING.WHEEL_MS}) await new Promise((r) => setTimeout(r, 20));
      const at = Math.round(performance.now() - t0);
      const a = angle(), res = { at, anims: disc.getAnimations().length, landed: w.state.types[wheelSliceOnScreen(w)], key: w.state.selected };
      await new Promise((r) => setTimeout(r, ${watch}));
      res.moved = Math.round(Math.abs(angle() - a)); res.animsLater = disc.getAnimations().length;
      style.remove();
      return res; })()`);
    const spinMs = await js(`WHEEL_SPIN_MS`), late = await js(`WHEEL_SPIN_MS + 500 + REEL_START_WAIT_MS + 1000`);

    // Bắt đầu trễ 1,5 s: bánh xe tự dừng, không bị đồng hồ dự phòng cắt ngang
    const slow = await spinWithDelay(1500, 300);
    check(`${W.label}, wheel starts 1.5s late: not cut short, result once it stops by itself`,
      slow.landed === slow.key && slow.anims === 0 && slow.moved === 0 && slow.at >= spinMs + 1400 && slow.at < spinMs + 2500,
      `after ${slow.at} ms (wheel ends ≈ ${spinMs + 1500} ms), landed ${slow.landed}, picked ${slow.key}`);

    // Bắt đầu trễ hơn cả đồng hồ dự phòng
    const s = await spinWithDelay(late, 2000); // đo lại sau lúc bánh xe lẽ ra bắt đầu
    check(`${W.label}, wheel starts after the fallback: stops at once on the picked slice`, s.landed === s.key && s.anims === 0, `landed ${s.landed}, picked ${s.key}, animations ${s.anims}, after ${s.at} ms`);
    check(`${W.label}, wheel starts after the fallback: does not spin on behind the result`, s.moved === 0 && s.animsLater === 0, `moved ${s.moved}°, animations ${s.animsLater}`);
    // Sang tab Case lúc bánh xe đang quay, quay lại sau khi xong
    const before = errors.length;
    await js(`document.querySelector('.action-main[data-action="${W.action}"]').click()`); await sleep(400);
    await js(`document.querySelector('.tab[data-view="case"]').click()`);
    for (let t = 0; t < TIMING.WHEEL_MS && (await js(`state.spinning`)); t += 50) await sleep(50);
    await js(`document.querySelector('.tab[data-view="custom"]').click()`); await sleep(200);
    const h = await js(`(() => { const w = ${W.w}, slice = document.querySelector("#" + w.disc + " .wheel-slice.is-winner");
      return { landed: w.state.types[wheelSliceOnScreen(w)], key: w.state.selected, marked: slice && slice.dataset.type,
        anims: document.getElementById(w.disc).getAnimations().length }; })()`);
    check(`${W.label}, other tab during the spin: wheel on the picked slice when you come back`,
      h.landed === h.key && h.marked === h.key && h.anims === 0 && errors.length === before, `landed ${h.landed}, picked ${h.key}, ${errors.slice(before).join(" | ")}`);
  }

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
