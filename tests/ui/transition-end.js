// transitionend của một thuộc tính khác (không phải transform) trên dải thẻ / bánh xe, hoặc transitionend nổi lên từ phần tử
// con, trong lúc đang quay (watchTransform): lượt quay không được kết thúc sớm. Dải / bánh xe vẫn chạy tiếp, kết thúc đúng lúc trình duyệt
// báo transitionend của transform (không phải nhờ đồng hồ dự phòng), ở đúng thẻ / ô trúng.
// Kiểm tra dải trang Case, dải và bánh xe của cả 3 chế độ bánh xe.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-transition-end"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const T = require("./timing");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

const MODES = [
  { label: "Type Roulette", mode: "type-roulette", spin: "wheel", w: "TYPE_WHEEL", reel: "#tr-reel .reel-strip" },
  { label: "Biome Roulette", mode: "biome-roulette", spin: "biome", w: "BIOME_WHEEL", reel: "#br-reel .reel-strip" },
  { label: "Letter Roulette", mode: "letter-roulette", spin: "letter", w: "LETTER_WHEEL", reel: "#lr-reel .reel-strip" },
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
  await js("localStorage.clear()"); await win.reload(); await sleep(300);

  // Bấm nút, chờ phần tử sel bắt đầu chạy, rồi bắn transitionend của thuộc tính khác (opacity) lên chính nó và
  // transitionend của transform nổi lên từ một phần tử con. Trả về trạng thái 400 ms sau đó: lượt quay phải còn đang chạy.
  // Ghi lại vào window.endedOnTransform: ngay sau transitionend thật của transform, lượt quay đã kết thúc chưa
  // (lớp is-spinning đã gỡ). Bỏ qua transitionend thật mà chờ đồng hồ dự phòng thì vẫn còn is-spinning.
  const spinWithOtherEnd = (sel, clickJs) => js(`(async () => {
    const el = document.querySelector(${JSON.stringify(sel)});
    window.endedOnTransform = null;
    const onEnd = (e) => {
      if (!e.isTrusted || e.target !== el || e.propertyName !== "transform") return;
      el.removeEventListener("transitionend", onEnd);
      const box = el.closest(".is-spinning");
      setTimeout(() => { window.endedOnTransform = !!box && !box.classList.contains("is-spinning"); });
    };
    el.addEventListener("transitionend", onEnd);
    ${clickJs};
    const t0 = performance.now();
    while (!el.getAnimations().length && performance.now() - t0 < ${T.CASE_POPUP_MS}) await new Promise((r) => setTimeout(r, 20));
    const started = el.getAnimations().length > 0;
    el.dispatchEvent(new TransitionEvent("transitionend", { propertyName: "opacity", bubbles: true }));
    el.firstElementChild.dispatchEvent(new TransitionEvent("transitionend", { propertyName: "transform", bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    return { started, spinning: state.spinning, anims: el.getAnimations().length, popup: document.getElementById("result-modal").open };
  })()`);
  const waitIdle = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms && (await js("state.spinning"))) await sleep(50); };
  // Dải kết thúc đúng lúc transform dừng, dừng hẳn đúng ở điểm dừng app đặt (không còn chuyển động, vị trí trên màn hình = đích của transform),
  // thẻ thắng nằm dưới vạch chỉ và trùng tên trong popup.
  const reelStopped = (sel) => js(`(() => {
    const strip = document.querySelector(${JSON.stringify(sel)}), reel = strip.parentElement;
    const x = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41, target = parseFloat(strip.style.transform.slice(11));
    const won = strip.querySelector(".card.is-winner"), r = reel.getBoundingClientRect(), mid = r.left + r.width / 2;
    const c = won && won.getBoundingClientRect();
    return { onTransformEnd: window.endedOnTransform, anims: strip.getAnimations().length, settled: Math.abs(x - target) < 0.5,
      onWinner: !!c && c.left <= mid && mid < c.right,
      matches: !!won && won.querySelector(".card-name").textContent === document.getElementById("result-name").textContent,
      popup: document.getElementById("result-modal").open };
  })()`);
  const closePopup = () => js(`document.getElementById("result-modal").close()`);

  // 1. Dải trang Case
  {
    const s = await spinWithOtherEnd("#reel-strip", `document.getElementById("btn-spin").click()`);
    check("Case reel: an opacity transitionend during the spin does not end it", s.started && s.spinning && s.anims > 0 && !s.popup,
      `started ${s.started}, still spinning ${s.spinning}, animations ${s.anims}, popup ${s.popup ? "open" : "closed"}`);
    await waitIdle(T.CASE_POPUP_MS);
    const e = await reelStopped("#reel-strip");
    check("Case reel: result shows when the transform ends, on the winning card", e.popup && e.onTransformEnd && e.anims === 0 && e.settled && e.onWinner && e.matches,
      JSON.stringify(e));
    await closePopup();
  }

  // 2. Bánh xe và dải của từng chế độ bánh xe
  await js(`document.querySelector('.tab[data-view="custom"]').click()`); await sleep(300);
  for (const M of MODES) {
    await js(`document.querySelector('.mode-btn[data-mode="${M.mode}"]').click()`); await sleep(300);
    const disc = `#${await js(`${M.w}.disc`)}`;
    const w = await spinWithOtherEnd(disc, `document.querySelector('.action-main[data-action="${M.spin}"]').click()`);
    check(`${M.label} wheel: an opacity transitionend during the spin does not end it`, w.started && w.spinning && w.anims > 0,
      `started ${w.started}, still spinning ${w.spinning}, animations ${w.anims}`);
    await waitIdle(T.WHEEL_MS);
    const we = await js(`(() => { const w = ${M.w}; return { onTransformEnd: window.endedOnTransform,
      landed: w.state.types[wheelSliceOnScreen(w)], key: w.state.selected,
      anims: document.querySelector(${JSON.stringify(disc)}).getAnimations().length }; })()`);
    check(`${M.label} wheel: stops when the transform ends, on the picked slice`, we.onTransformEnd && we.key && we.landed === we.key && we.anims === 0,
      JSON.stringify(we));

    const r = await spinWithOtherEnd(M.reel, `document.querySelector('.action-main[data-action="open"]').click()`);
    check(`${M.label} reel: an opacity transitionend during the spin does not end it`, r.started && r.spinning && r.anims > 0 && !r.popup,
      `started ${r.started}, still spinning ${r.spinning}, animations ${r.anims}, popup ${r.popup ? "open" : "closed"}`);
    await waitIdle(T.ROULETTE_POPUP_MS);
    const re = await reelStopped(M.reel);
    check(`${M.label} reel: result shows when the transform ends, on the winning card`, re.popup && re.onTransformEnd && re.anims === 0 && re.settled && re.onWinner && re.matches,
      JSON.stringify(re));
    await closePopup();
  }

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
