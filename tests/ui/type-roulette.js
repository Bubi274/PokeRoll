// Kiểm tra Type Roulette (luồng 2 bước: Spin wheel → Open <type> case) trong Electron, render offscreen 60 fps.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-roulette"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const cap = (t) => t[0].toUpperCase() + t.slice(1);

// Dữ liệu cũ (định dạng trước khi có Custom) phải còn nguyên
const OLD_HISTORY = [
  { id: 25, rarity: "blue", shiny: false, t: 1761000000000 },
  { id: 150, rarity: "gold", shiny: true, t: 1760000000000 },
];
const OLD_COLLECTION = { 25: { count: 1, shiny: 0, first: 1761000000000 }, 150: { count: 1, shiny: 1, first: 1760000000000 } };

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
  const shot = async (name) => fs.writeFileSync(path.join(SHOTS, name), (await win.webContents.capturePage()).toPNG());
  const waitModal = async (ms) => { for (let t = 0; t < ms; t += 50) { if (await js(`document.getElementById("result-modal").open`)) return true; await sleep(50); } return false; };
  const waitIdle = async (ms) => { for (let t = 0; t < ms; t += 50) { if (!(await js(`state.spinning`))) return true; await sleep(50); } return false; };
  const key = (code, k) => js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "${code}", key: "${k}", bubbles: true }))`);
  const space = () => key("Space", " ");
  const pressW = () => key("KeyW", "w");
  const btn = (action, quick = false) => `document.querySelector('.${quick ? "action-quick" : "action-main"}[data-action="${action}"]')`;
  const click = (action, quick) => js(`${btn(action, quick)}.click()`);
  const histLen = () => js(`state.history.length`);
  const closeModal = () => js(`document.getElementById("result-modal").close()`);
  const tab = (v) => js(`document.querySelector('.tab[data-view="${v}"]').click()`);

  const installHelpers = () => js(`
    // Hình học thật: điểm ngay dưới mũi kim đổi về tọa độ SVG bằng ma trận trên màn hình (gồm cả góc xoay CSS),
    // rồi hỏi ô nào chứa điểm đó. (Không dùng elementFromPoint: popup showModal() làm trang "inert".)
    window.sliceUnderPointer = () => {
      const wr = document.getElementById("tr-wheel").getBoundingClientRect();
      const svg = document.querySelector("#tr-disc svg");
      if (!svg) return null;
      const pt = new DOMPoint(wr.left + wr.width / 2, wr.top + wr.height * 0.09).matrixTransform(svg.getScreenCTM().inverse());
      const g = [...svg.querySelectorAll(".wheel-slice")].find(g => g.querySelector("path").isPointInFill(pt));
      return g ? g.dataset.type : null;
    };
    window.wheelState = () => ({
      geom: sliceUnderPointer(), angle: roulette.types[wheelSliceOnScreen()], selected: roulette.selected,
      saved: JSON.parse(localStorage.getItem("pokeroll.custom.typeRoulette.type")),
      hub: document.getElementById("tr-hub").textContent,
      winnerSlice: (document.querySelector("#tr-wheel .wheel-slice.is-winner") || {}).dataset?.type || null,
      openLabel: ${btn("open")}.textContent.trim(), openDisabled: ${btn("open")}.disabled,
      wheelDisabled: ${btn("wheel")}.disabled,
      primary: document.querySelector("#custom-actions .action-main:not(.is-secondary)").dataset.action,
      hint: document.getElementById("custom-hint").textContent, kbd: document.getElementById("custom-kbd").textContent.replace(/\\s+/g, " ").trim(),
      oddsTitle: document.getElementById("tr-odds-title").textContent.trim(),
      reelTypes: [...document.querySelectorAll("#tr-reel .card")].map(c => state.pokemon.find(p => p.name === c.querySelector(".card-name").textContent).types),
    });
    window.reelState = () => {
      const reel = document.getElementById("tr-reel"), r = reel.getBoundingClientRect(), mid = r.left + r.width / 2;
      const strip = reel.querySelector(".reel-strip"), winCard = strip.querySelector(".card.is-winner");
      const under = [...strip.children].filter(k => { const b = k.getBoundingClientRect(); return b.left <= mid && mid < b.right; });
      const settled = Math.abs(new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41 - parseFloat(strip.style.transform.slice(11))) < 0.5;
      const h = state.history[0];
      return { ok: settled && !!winCard && under.length === 1 && under[0] === winCard, card: winCard && winCard.querySelector(".card-name").textContent,
        modal: document.getElementById("result-modal").open && document.getElementById("result-name").textContent,
        extra: (document.querySelector("#result-body .mode-note") || {}).textContent || "", mode: h.mode, detail: h.detail, types: state.byId.get(h.id).types };
    };
    window.locks = () => [...document.querySelectorAll("#custom-gen-grid input")].every(i => i.disabled) && document.getElementById("custom-all").disabled && document.getElementById("custom-none").disabled;
    0`);
  // Bánh xe đứng trên hệ đang chọn: đo bằng hình học thật, bằng góc xoay, ô sáng, tâm bánh xe, nút Open, ô lưu
  const wheelOn = (s) => s.selected && s.geom === s.selected && s.angle === s.selected && s.winnerSlice === s.selected
    && s.hub === cap(s.selected) && s.saved === s.selected && s.openLabel === `Open ${cap(s.selected)} case`;

  await win.loadFile(PAGE);
  await js(`localStorage.clear();
    localStorage.setItem("pokeroll.history", ${JSON.stringify(JSON.stringify(OLD_HISTORY))});
    localStorage.setItem("pokeroll.collection", ${JSON.stringify(JSON.stringify(OLD_COLLECTION))});`);
  await win.reload(); await sleep(400);
  await tab("custom"); await sleep(300);
  await installHelpers();

  // ---- 0. Chưa quay bánh xe ----
  let s = await js(`wheelState()`);
  check("Start: 18 slices, no type, Open locked with \"Spin the wheel first.\"",
    (await js(`document.querySelectorAll("#tr-wheel .wheel-slice").length`)) === 18 && !s.selected && s.openDisabled && s.openLabel === "Open case"
    && !s.wheelDisabled && s.hint === "Spin the wheel first." && s.hub === "?", `hint "${s.hint}"`);
  check("Start: Spin wheel is the Space button; key notes under the buttons", s.primary === "wheel" && s.kbd === "Space W spin wheel", `"${s.kbd}"`);
  await shot("tr2-start.png");

  // ---- 1. Spin wheel (nút): chỉ quay bánh xe, không mở hòm ----
  let h0 = await histLen();
  await click("wheel"); await sleep(1200);
  const during = await js(`({ spinning: document.getElementById("tr-wheel").classList.contains("is-spinning"),
    label: ${btn("wheel")}.textContent.trim(), open: ${btn("open")}.disabled, caseBtn: document.getElementById("btn-spin").disabled, locked: locks(), hub: document.getElementById("tr-hub").textContent })`);
  check("Spin wheel: wheel turns, label \"Spinning…\", Open + Case + gen grid locked", during.spinning && during.label === "Spinning…" && during.open && during.caseBtn && during.locked && during.hub === "?", JSON.stringify(during));
  await shot("tr2-wheel-spinning.png");
  await waitIdle(6000); await sleep(100);
  s = await js(`wheelState()`);
  check("Spin wheel: stops on the rolled type (pointer geometry + angle + hub + saved)", wheelOn(s), `${s.selected}: under pointer ${s.geom}/${s.angle}`);
  check("Spin wheel: no case opened, nothing recorded", (await histLen()) === h0 && !(await js(`document.getElementById("result-modal").open`)));
  check("After wheel: Open button enabled + becomes the Space button, gen grid unlocked",
    !s.openDisabled && s.primary === "open" && s.kbd === `Space open ${cap(s.selected)} case · W spin wheel` && !(await js(`locks()`)) && s.hint === "", `"${s.kbd}"`);
  check("After wheel: odds panel + idle reel show that type", s.oddsTitle === `${cap(s.selected)} case` && s.reelTypes.length > 0 && s.reelTypes.every((t) => t.includes(s.selected)), s.oddsTitle);
  await shot("tr2-after-wheel.png");

  // ---- 2. Open case (nút): dải 4 giây, đúng hệ, bánh xe đứng yên ----
  const type1 = s.selected;
  const rot1 = await js(`roulette.rotation`);
  await js(`window.__log = []; window.__stop = false; (function poll() {
      const r = document.getElementById("tr-reel").classList.contains("is-spinning");
      const last = window.__log[window.__log.length - 1];
      if (!last || last.r !== r) window.__log.push({ r, t: performance.now(), w: document.getElementById("tr-wheel").classList.contains("is-spinning") });
      if (!window.__stop) requestAnimationFrame(poll);
    })(); 0`);
  await click("open"); await sleep(300);
  check("Open case: locks while opening", await js(`locks() && ${btn("wheel")}.disabled && ${btn("open")}.disabled`));
  await waitModal(12000);
  await js(`window.__stop = true`);
  const log = await js(`window.__log`);
  const rs = log.find((l) => l.r), re = log.slice(log.indexOf(rs)).find((l) => !l.r);
  const reelSecs = (re.t - rs.t) / 1000;
  check("Open case: Pokémon reel runs ~4 s, wheel does not spin", reelSecs > 3.9 && reelSecs < 4.4 && log.every((l) => !l.w), `${reelSecs.toFixed(2)}s`);
  let r = await js(`reelState()`);
  check("Open case: reel marker on winner, matches popup", r.ok && r.card === r.modal, r.card);
  check("Open case: Pokémon of the selected type, history tagged", r.mode === "type-roulette" && r.detail === type1 && r.types.includes(type1) && r.extra.includes(`${cap(type1)} case`), `${r.card} (${r.types.join("/")})`);
  s = await js(`wheelState()`);
  check("Open case: wheel unchanged, type kept", wheelOn(s) && s.selected === type1 && (await js(`roulette.rotation`)) === rot1);
  await shot("tr2-result-popup.png");

  // ---- 3. Open again (popup) và Space trong popup: mở lại hòm cùng hệ ----
  h0 = await histLen();
  await js(`document.getElementById("result-again").click()`);
  await waitModal(12000);
  r = await js(`reelState()`);
  check("Open again: opens the same type's case again", (await histLen()) === h0 + 1 && r.detail === type1 && r.types.includes(type1) && r.ok && r.card === r.modal, r.card);
  await space(); await sleep(200);
  check("Space in the popup: opens the same type again", (await histLen()) === h0 + 2 && (await js(`state.history[0].detail`)) === type1);
  await waitModal(12000); await closeModal();

  // ---- 4. Space trên trang (đã có hệ) → mở hòm; W → quay bánh xe ----
  h0 = await histLen();
  await space(); await sleep(200);
  check("Space with a type selected: opens the case (wheel stays)", (await histLen()) === h0 + 1 && !(await js(`document.getElementById("tr-wheel").classList.contains("is-spinning")`)));
  await waitModal(12000); await closeModal();
  h0 = await histLen();
  await pressW(); await sleep(400);
  check("W: spins the wheel, no case", await js(`document.getElementById("tr-wheel").classList.contains("is-spinning")`) && (await histLen()) === h0);
  await waitIdle(6000); await sleep(100);
  s = await js(`wheelState()`);
  check("W: wheel stops on the new type", wheelOn(s) && (await histLen()) === h0, `${s.selected}: ${s.geom}/${s.angle}`);

  // ---- 5. Quick: bánh xe ×30 (dừng ngay), hòm ×20 (mở ngay) ----
  let qw = 0, qwInstant = 0; const seen = new Set();
  h0 = await histLen();
  for (let i = 0; i < 30; i++) {
    const t = Date.now();
    await click("wheel", true);
    if (!(await js(`state.spinning`)) && Date.now() - t < 300) qwInstant++;
    s = await js(`wheelState()`);
    seen.add(s.selected);
    if (wheelOn(s)) qw++;
  }
  check("Quick spin wheel ×30: stops at once on the rolled type, no case opened", qw === 30 && qwInstant === 30 && (await histLen()) === h0 && !(await js(`document.getElementById("result-modal").open`)),
    `${qw}/30, ${seen.size} different types`);
  let qo = 0;
  for (let i = 0; i < 20; i++) {
    if (i % 4 === 0) await click("wheel", true); // đổi hệ vài lần
    const sel = await js(`roulette.selected`);
    const t = Date.now();
    await click("open", true);
    const opened = await waitModal(800);
    r = await js(`reelState()`);
    s = await js(`wheelState()`);
    if (opened && Date.now() - t < 800 && r.ok && r.card === r.modal && r.detail === sel && r.types.includes(sel) && wheelOn(s) && s.selected === sel) qo++;
    await closeModal();
  }
  check("Quick open ×20: case opens at once, right type, reel marker on winner, wheel kept", qo === 20, `${qo}/20`);

  // ---- 6. Đổi cỡ cửa sổ ----
  for (const [w, h] of [[390, 900], [800, 800], [1600, 1000], [1300, 900]]) {
    win.setContentSize(w, h); await sleep(450);
    s = await js(`wheelState()`); r = await js(`reelState()`);
    check(`Resize to ${w}px: wheel still on ${s.selected}, reel still on winner`, wheelOn(s) && r.ok, `${s.geom}, ${r.card}`);
    if (w === 390) { await js(`window.scrollTo(0, 0)`); await shot("tr2-mobile-390.png"); }
  }

  // ---- 7. Tải lại trang: giữ hệ ----
  const kept = await js(`roulette.selected`);
  await win.reload(); await sleep(500); await installHelpers();
  await tab("custom"); await sleep(300);
  s = await js(`wheelState()`);
  check("Reload: type kept, wheel points at it, Open ready, Space opens", wheelOn(s) && s.selected === kept && !s.openDisabled && s.primary === "open", `${kept} → ${s.selected} (${s.geom})`);
  h0 = await histLen();
  await space(); await waitModal(12000);
  check("…and Space opens that type's case", (await histLen()) === h0 + 1 && (await js(`state.history[0].detail`)) === kept);
  await closeModal();

  // ---- 8. Đổi gen: giữ hệ nếu còn Pokémon; bỏ hệ và báo nếu hết ----
  await js(`localStorage.setItem("pokeroll.custom.typeRoulette.type", '"fire"')`);
  await win.reload(); await sleep(500); await installHelpers(); await tab("custom"); await sleep(300);
  await js(`document.getElementById("custom-none").click(); document.querySelector('#custom-gen-grid input[value="1"]').click()`); await sleep(150);
  s = await js(`wheelState()`);
  check("Gen 1 only, type Fire: kept, wheel redrawn (17 slices) and still points at Fire", wheelOn(s) && s.selected === "fire" && (await js(`document.querySelectorAll("#tr-wheel .wheel-slice").length`)) === 17
    && s.oddsTitle === "Fire case", JSON.stringify({ ...s, reelTypes: undefined, slices: await js(`document.querySelectorAll("#tr-wheel .wheel-slice").length`) }));
  await js(`localStorage.setItem("pokeroll.custom.typeRoulette.type", '"dark"'); localStorage.setItem("pokeroll.custom.gens", "[2]")`);
  await win.reload(); await sleep(500); await installHelpers(); await tab("custom"); await sleep(300);
  check("Dark selected with Gen 2: kept", (await js(`roulette.selected`)) === "dark");
  await js(`document.querySelector('#custom-gen-grid input[value="2"]').click(); document.querySelector('#custom-gen-grid input[value="1"]').click()`); await sleep(150);
  s = await js(`wheelState()`);
  check("Switch to Gen 1 (no Dark): type dropped, Open locked, user told to spin again",
    s.selected === null && s.saved === null && s.openDisabled && s.openLabel === "Open case" && s.primary === "wheel"
    && s.hint === "Dark has no Pokémon in these generations. Spin the wheel again." && /Dark has no Pokémon/.test(await js(`document.getElementById("tr-odds-sub").textContent`)), `"${s.hint}"`);
  await shot("tr2-type-dropped.png");
  h0 = await histLen();
  await space(); await sleep(300);
  check("…Space now spins the wheel", await js(`document.getElementById("tr-wheel").classList.contains("is-spinning")`) && (await histLen()) === h0);
  await waitIdle(6000); await sleep(100);
  s = await js(`wheelState()`);
  check("…new type picked, message cleared", wheelOn(s) && s.selected !== "dark" && s.hint === "", s.selected);

  // ---- 9. Không có gen: giữ hệ (đang chọn lại gen), khóa cả hai nút ----
  const keptType = await js(`roulette.selected`);
  await js(`document.getElementById("custom-none").click()`); await sleep(100);
  s = await js(`wheelState()`);
  check("No gens: both buttons locked, wheel empty, type kept", s.wheelDisabled && s.openDisabled && s.selected === keptType && s.saved === keptType
    && (await js(`document.querySelectorAll("#tr-wheel .wheel-slice").length`)) === 0 && s.hint === "Select at least one generation to spin.", `"${s.hint}"`);
  h0 = await histLen();
  await space(); await pressW(); await sleep(200);
  check("No gens: Space and W do nothing", (await histLen()) === h0 && !(await js(`state.spinning`)));
  await js(`document.getElementById("custom-all").click()`); await sleep(100);
  s = await js(`wheelState()`);
  check("All again: wheel points back at the kept type, Open ready", wheelOn(s) && s.selected === keptType && !s.openDisabled, `${keptType}: ${s.geom}`);

  // ---- 10. Phím ở trang Case ----
  await tab("case"); await sleep(200);
  h0 = await histLen();
  await pressW(); await sleep(200);
  check("W on the Case page does nothing", (await histLen()) === h0 && !(await js(`state.spinning`)));
  await space(); await sleep(200);
  check("Space on the Case page opens the case", (await histLen()) === h0 + 1 && !(await js(`state.history[0].mode`)));
  await waitModal(12000); await closeModal();

  // ---- 11. Lịch sử, bộ sưu tập, nhãn ----
  const hist = await js(`JSON.parse(localStorage.getItem("pokeroll.history"))`);
  check("Old history entries kept unchanged", JSON.stringify(hist.slice(-2)) === JSON.stringify(OLD_HISTORY), `${hist.length} entries`);
  const customCount = hist.filter((h) => h.mode === "type-roulette").length;
  const coll = await js(`JSON.parse(localStorage.getItem("pokeroll.collection"))`);
  check("Every opened case counted once in the collection", Object.values(coll).reduce((a, e) => a + e.count, 0) === hist.length, `${hist.length} opens, ${customCount} from Type Roulette`);
  const recent = await js(`[...document.querySelectorAll("#recent-row .recent-item")].slice(0, 2).map(b => (b.querySelector(".src-tag") || {}).textContent || "")`);
  const lastCustom = hist.find((h) => h.mode);
  check("Recent drops: Case open untagged, Custom drop tagged \"Type · <type>\"", recent[0] === "" && recent[1] === `Type · ${cap(lastCustom.detail)}`, JSON.stringify(recent));
  await tab("collection"); await sleep(300);
  const histTags = await js(`[...document.querySelectorAll("#history-list .src-tag")].map(t => t.textContent)`);
  check("Roll history: \"Case\" / \"Type Roulette · <type>\"", histTags[0] === "Case" && histTags[1] === `Type Roulette · ${cap(lastCustom.detail)}` && histTags.slice(-2).every((t) => t === "Case"));

  // ---- 12. Quy tắc "chỉ có Pokémon hiếm" (giả lập: mọi Ghost Blue/Purple/Pink đổi thành Red trong trang) ----
  await js(`localStorage.setItem("pokeroll.custom.typeRoulette.type", '"ghost"')`);
  await win.reload(); await sleep(500); await installHelpers(); await tab("custom"); await sleep(300);
  check("How it works has the rare-only rule", /only goes on the wheel if it has at least one Blue, Purple or Pink/.test(await js(`document.getElementById("mode-rule-list").textContent`)));
  s = await js(`wheelState()`);
  check("Ghost selected and on the wheel", wheelOn(s) && s.selected === "ghost");
  await js(`state.pokemon.forEach(p => { if (p.types.includes("ghost") && ["blue", "purple", "pink"].includes(p.rarity)) p.rarity = "red"; }); updateCustomPool(); 0`);
  s = await js(`wheelState()`);
  const RARE_T = "Ghost only has rare Pokémon in these generations. Spin again.";
  check("Ghost now Red/Gold only: dropped, Open locked, rare-only message", s.selected === null && s.saved === null && s.openDisabled && s.primary === "wheel"
    && s.hint === RARE_T && (await js(`document.getElementById("tr-odds-sub").textContent`)) === RARE_T, `"${s.hint}"`);
  check("…Ghost slice removed (17 types)", (await js(`document.querySelectorAll("#tr-wheel .wheel-slice").length`)) === 17 && !(await js(`!!document.querySelector('#tr-wheel .wheel-slice[data-type="ghost"]')`)));
  const seenT = new Set();
  for (let i = 0; i < 40; i++) { await click("wheel", true); seenT.add(await js(`roulette.selected`)); }
  check("…×40 quick spins never land on Ghost", !seenT.has("ghost"), `${seenT.size} different types`);
  await win.reload(); await sleep(400); // khôi phục dữ liệu thật

  check("No console errors", errors.length === 0, errors.join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
