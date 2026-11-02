// Dải thẻ của một trang trong lúc trang đó đang ẩn (người dùng ở tab khác).
const { app, BrowserWindow } = require("electron");
const path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-reel-hidden"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const TIMING = require("./timing");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

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

  const tab = (v) => js(`document.querySelector('.tab[data-view="${v}"]').click()`);
  const popupOpen = () => js(`document.getElementById("result-modal").open`);
  const waitPopup = async (ms) => { for (let t = 0; t < ms && !(await popupOpen()); t += 50) await sleep(50); };
  const closePopup = () => js(`document.getElementById("result-modal").close()`);
  const again = () => js(`document.getElementById("result-again").click()`);
  const stateOf = (id) => js(`(() => {
    const reel = document.getElementById("${id}"), strip = reel.querySelector(".reel-strip"), won = strip.querySelector(".card.is-winner");
    const r = reel.getBoundingClientRect(), mid = r.left + r.width / 2, c = won && won.getBoundingClientRect();
    return { onWinner: !!c && c.left <= mid && mid < c.right, anims: strip.getAnimations().length, inline: strip.style.transform,
      matches: !!won && won.querySelector(".card-name").textContent === document.getElementById("result-name").textContent }; })()`);

  // ---- 1. "Open again" khi trang của dải đang ẩn ----
  await js(`window.ticks = 0; { const play = playTick; playTick = () => { window.ticks++; play(); }; } 0`);

  // Rời trang Case giữa lượt quay, popup hiện ở trang khác, bấm Open again, quay về sau khi xong
  await js(`document.getElementById("btn-spin").click()`); await sleep(300);
  await tab("collection"); await waitPopup(TIMING.CASE_POPUP_MS);
  await js(`window.ticks = 0`);
  await again(); await sleep(500); await waitPopup(TIMING.CASE_POPUP_MS);
  check("Case hidden: no tick sounds from a reel nobody can see", (await js(`window.ticks`)) === 0, `${await js(`window.ticks`)} ticks`);
  await closePopup(); await tab("case"); await sleep(100);
  let s = await stateOf("reel");
  check("Open again from another page, back after it ends: Case reel on the winner", s.onWinner && s.matches && s.anims === 0, `onWinner=${s.onWinner}, matches=${s.matches}`);

  // Quay về khi lượt quay còn đang chạy
  await js(`document.getElementById("btn-quick").click()`); await waitPopup(3000);
  await tab("collection"); await again(); await sleep(1500);
  await tab("case"); await sleep(300);
  const midway = await js(`document.getElementById("reel-strip").getAnimations().length`);
  await waitPopup(TIMING.CASE_POPUP_MS); s = await stateOf("reel");
  check("Open again from another page, back during the spin: reel runs on to the winner", midway === 1 && s.onWinner && s.matches && s.anims === 0, `running on return=${midway}, onWinner=${s.onWinner}, matches=${s.matches}`);
  await closePopup();

  // Rời trang Case giữa lượt quay rồi quay lại ngay: lượt quay đã bị huỷ lúc trang ẩn → kết thúc luôn ở thẻ thắng,
  // không đứng yên chờ đồng hồ dự phòng
  await js(`document.getElementById("btn-spin").click()`); await sleep(1500);
  await tab("collection"); await sleep(300);
  const back = Date.now(); await tab("case");
  await waitPopup(TIMING.CASE_POPUP_MS); s = await stateOf("reel");
  check("Leave the Case page mid-spin and come straight back: popup at once, reel on the winner", s.onWinner && s.matches && Date.now() - back < 1000,
    `popup ${Date.now() - back} ms after coming back, onWinner=${s.onWinner}`);
  await closePopup();

  // Cùng tình huống với dải Custom
  await tab("custom"); await sleep(300);
  await js(`document.querySelector('.action-quick[data-action="open"]').click()`); await waitPopup(3000);
  await tab("case"); await again(); await sleep(1000);
  await tab("custom"); await sleep(300);
  await waitPopup(TIMING.ROULETTE_POPUP_MS); s = await stateOf("tr-reel");
  check("Type Roulette, back during the spin: reel runs on to the winner", s.onWinner && s.matches && s.anims === 0, `onWinner=${s.onWinner}, matches=${s.matches}`);
  await closePopup();

  // ---- 2. Đổi cỡ cửa sổ khi đang ở tab khác ----
  await tab("case"); await sleep(100);
  await js(`document.getElementById("btn-quick").click()`); await waitPopup(3000); await closePopup();
  const before = await stateOf("reel");
  await tab("collection"); await sleep(100);
  win.setContentSize(1300, 700); await sleep(300);
  const hidden = await stateOf("reel");
  check("Resize on another page: Case reel left where it is", hidden.inline === before.inline, `${before.inline} → ${hidden.inline}`);
  win.setContentSize(800, 700); await sleep(300);
  await tab("case"); await sleep(100);
  s = await stateOf("reel");
  check("Back on the Case page at a new width: reel on the winner", s.onWinner && s.anims === 0, `onWinner=${s.onWinner}`);
  win.setContentSize(1300, 900); await sleep(300);

  // ---- 3. Đổi gen ở trang Case trong lúc Custom đang quay ----
  const caseCards = () => js(`(() => {
    const ids = new Set(Object.values(state.groups).flat().map((p) => p.name));
    const names = [...document.querySelectorAll("#reel-strip .card-name")].map((n) => n.textContent);
    return { cards: names.length, outside: names.filter((n) => !ids.has(n)).length, empty: document.getElementById("reel").classList.contains("is-empty") }; })()`);
  const onlyGen = async (gen) => {
    await js(`document.getElementById("btn-none").click(); document.querySelector('#gen-grid input[value="${gen}"]').click()`);
    await sleep(100);
  };
  await tab("custom"); await sleep(300);
  await js(`document.querySelector('.action-main[data-action="wheel"]').click()`); await sleep(400);
  await tab("case"); await sleep(100);
  await onlyGen(1);
  let c = await caseCards();
  check("Gen changed while Custom spins: Case reel redrawn from the new case", c.cards > 0 && c.outside === 0, `${c.outside} of ${c.cards} cards outside the case`);
  await js(`document.getElementById("btn-none").click()`); await sleep(100);
  c = await caseCards();
  check("No gen selected while Custom spins: Case reel empty", c.cards === 0 && c.empty, `${c.cards} cards`);
  await js(`document.getElementById("btn-all").click()`);
  for (let t = 0; t < TIMING.WHEEL_MS && (await js(`state.spinning`)); t += 50) await sleep(50);

  // Trang Case đang quay: đổi gen vẫn không đụng vào dải
  await js(`document.getElementById("btn-spin").click()`); await sleep(1000);
  const running = await js(`document.getElementById("reel-strip").children.length`);
  await onlyGen(2);
  const during = await js(`document.getElementById("reel-strip").children.length`);
  check("Gen changed while the Case reel itself spins: reel left alone", during === running && during > 20, `${running} → ${during} cards`);
  await js(`document.getElementById("btn-all").click()`);
  await waitPopup(TIMING.CASE_POPUP_MS); await closePopup();

  // Cùng tình huống, khi một hành động Custom trước đó kết thúc mà không xoá cờ custom.running
  await js(`custom.running = "open"; document.getElementById("btn-spin").click()`); await sleep(1000);
  await onlyGen(4);
  const kept = await js(`document.getElementById("reel-strip").children.length`);
  await js(`document.getElementById("btn-all").click()`);
  await waitPopup(TIMING.CASE_POPUP_MS); s = await stateOf("reel");
  check("…even with a Custom flag left over: reel left alone, spin ends on the winner", kept === running && s.onWinner && s.matches, `${kept} cards, onWinner=${s.onWinner}`);
  await closePopup(); await js(`custom.running = null`);

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
