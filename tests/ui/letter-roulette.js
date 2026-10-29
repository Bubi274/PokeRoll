// Kiểm tra Letter Roulette (Spin letter → Open <chữ> case, luôn dùng mọi gen) trong Electron, render offscreen 60 fps.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-letter"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const T = require("./timing");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

// Dữ liệu cũ phải còn nguyên
const OLD_HISTORY = [{ id: 25, rarity: "blue", shiny: false, t: 1761000000000 }];
const OLD_COLLECTION = { 25: { count: 1, shiny: 0, first: 1761000000000 } };
const LETTER_KEY = "pokeroll.custom.letterRoulette.letter";

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
  // Ảnh chụp chỉ để xem bằng mắt: chờ một chút để khung hình offscreen kịp vẽ lại
  const shot = async (name) => { await sleep(250); fs.writeFileSync(path.join(SHOTS, name), (await win.webContents.capturePage()).toPNG()); };
  let lastWaitMs = 0, waitNo = 0;
  const waitFor = async (cond, ms) => { const t0 = Date.now(); for (;;) { if (await js(cond)) { lastWaitMs = Date.now() - t0; return true; } if (Date.now() - t0 >= ms) { lastWaitMs = Date.now() - t0; return false; } await sleep(50); } };
  const expectPopup = async (ms = T.ROULETTE_POPUP_MS) => { const ok = await waitFor(`document.getElementById("result-modal").open`, ms); check(`Wait #${++waitNo}: result popup opens`, ok, `after ${lastWaitMs} ms (limit ${ms} ms)`); return ok; };
  const expectIdle = async (ms = T.WHEEL_MS) => { const ok = await waitFor(`!state.spinning`, ms); check(`Wait #${++waitNo}: spin finishes`, ok, `after ${lastWaitMs} ms (limit ${ms} ms)`); return ok; };
  const key = (code, k) => js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "${code}", key: "${k}", bubbles: true }))`);
  const btn = (action, quick = false) => `document.querySelector('.${quick ? "action-quick" : "action-main"}[data-action="${action}"]')`;
  const click = (action, quick) => js(`${btn(action, quick)}.click()`);
  const histLen = () => js(`state.history.length`);
  const closeAll = () => js(`document.querySelectorAll("dialog[open]").forEach(d => d.close())`);
  const tab = (v) => js(`document.querySelector('.tab[data-view="${v}"]').click()`);
  const toMode = async (m) => { await js(`document.querySelector('.mode-btn[data-mode="${m}"]').click()`); await sleep(150); };
  const waitIdle = (ms) => waitFor(`!state.spinning`, ms);

  const installHelpers = () => js(`
    // Ô ngay dưới mũi kim, đo bằng hình học thật (ma trận màn hình gồm cả góc xoay CSS)
    window.sliceUnderPointer = () => {
      const wr = document.getElementById("lr-wheel").getBoundingClientRect();
      const svg = document.querySelector("#lr-disc svg");
      if (!svg) return null;
      const pt = new DOMPoint(wr.left + wr.width / 2, wr.top + wr.height * 0.09).matrixTransform(svg.getScreenCTM().inverse());
      const g = [...svg.querySelectorAll(".wheel-slice")].find(g => g.querySelector("path").isPointInFill(pt));
      return g ? g.dataset.type : null;
    };
    window.wheelState = () => ({
      geom: sliceUnderPointer(), angle: letter.types[wheelSliceOnScreen(LETTER_WHEEL)], selected: letter.selected,
      saved: JSON.parse(localStorage.getItem("${LETTER_KEY}")),
      hub: document.getElementById("lr-hub").textContent,
      winnerSlice: (document.querySelector("#lr-wheel .wheel-slice.is-winner") || {}).dataset?.type || null,
      openLabel: ${btn("open")}.textContent.trim(), openDisabled: ${btn("open")}.disabled,
      primary: document.querySelector("#custom-actions .action-main:not(.is-secondary)").dataset.action,
      hint: document.getElementById("custom-hint").textContent, kbd: document.getElementById("custom-kbd").textContent.replace(/\\s+/g, " ").trim(),
      oddsTitle: document.getElementById("lr-odds-title").textContent.replace(/\\s+/g, " ").trim(),
      reelLetters: [...document.querySelectorAll("#lr-reel .card")].map(c => letterOf(state.pokemon.find(p => p.name === c.querySelector(".card-name").textContent))),
    });
    window.reelState = () => {
      const reel = document.getElementById("lr-reel"), r = reel.getBoundingClientRect(), mid = r.left + r.width / 2;
      const strip = reel.querySelector(".reel-strip"), winCard = strip.querySelector(".card.is-winner");
      const under = [...strip.children].filter(k => { const b = k.getBoundingClientRect(); return b.left <= mid && mid < b.right; });
      const settled = Math.abs(new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41 - parseFloat(strip.style.transform.slice(11))) < 0.5;
      const h = state.history[0];
      return { ok: settled && !!winCard && under.length === 1 && under[0] === winCard, card: winCard && winCard.querySelector(".card-name").textContent,
        modal: document.getElementById("result-modal").open && document.getElementById("result-name").textContent,
        extra: (document.querySelector("#result-body .mode-note") || {}).textContent || "", mode: h.mode, detail: h.detail, letter: letterOf(state.byId.get(h.id)) };
    };
    // Bảng gen của trang Custom: khóa, mờ, dòng giải thích
    window.genPanel = () => ({
      locked: [...document.querySelectorAll("#custom-gen-grid input")].every(i => i.disabled) && document.getElementById("custom-all").disabled && document.getElementById("custom-none").disabled,
      unlocked: [...document.querySelectorAll("#custom-gen-grid input")].every(i => !i.disabled) && !document.getElementById("custom-all").disabled,
      dim: document.getElementById("custom-gen-panel").classList.contains("is-locked") && getComputedStyle(document.getElementById("custom-gen-grid")).opacity < 1,
      note: document.getElementById("custom-gen-lock").hidden ? null : document.getElementById("custom-gen-lock").textContent,
      inPlay: document.getElementById("custom-pool-count").textContent,
    });
    // Mọi thứ Letter Roulette hiện ra (để so trước / sau khi đổi gen)
    window.letterSnap = () => JSON.stringify({
      types: letter.types.join(), sizes: letter.types.map(l => letter.pools[l].length).join(), sel: letter.selected, rot: letter.rotation,
      slices: document.getElementById("lr-disc").innerHTML, caption: document.getElementById("lr-wheel-caption").textContent,
      title: document.getElementById("lr-odds-title").innerHTML, sub: document.getElementById("lr-odds-sub").innerHTML,
      count: document.getElementById("lr-odds-count").textContent, odds: [...document.querySelectorAll("#lr-odds-list .rarity-chance, #lr-odds-list .rarity-count")].map(e => e.textContent).join(),
      contents: wheelContents(letter.selected, { all: LETTER_WHEEL.groups(), wheel: letter, order: LETTERS, name: (l) => l, mode: "letter-roulette" }).list.map(p => p.id).join(),
    });
    0`);
  const wheelOn = (s) => s.selected && s.geom === s.selected && s.angle === s.selected && s.winnerSlice === s.selected
    && s.hub === s.selected && s.saved === s.selected && s.openLabel === `Open ${s.selected} case`;

  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await js(`localStorage.clear(); localStorage.setItem("pokeroll.custom.gens", "[1]");
    localStorage.setItem("pokeroll.history", ${JSON.stringify(JSON.stringify(OLD_HISTORY))});
    localStorage.setItem("pokeroll.collection", ${JSON.stringify(JSON.stringify(OLD_COLLECTION))});`);
  await win.reload(); await sleep(400);
  await tab("custom"); await sleep(300);
  await installHelpers();

  // ---- 0. Thanh chế độ, bảng gen, bánh xe ----
  check("Mode bar: Type, Biome, Letter Roulette", (await js(`[...document.querySelectorAll(".mode-btn")].map(b => b.dataset.mode).join()`)) === "type-roulette,biome-roulette,letter-roulette");
  let g = await js(`genPanel()`);
  check("Type Roulette: gen panel open, no lock note, Gen 1 only = 151 in play", g.unlocked && !g.dim && g.note === null && g.inPlay === "151", JSON.stringify(g));
  await toMode("letter-roulette");
  g = await js(`genPanel()`);
  check("Letter Roulette: gen panel locked + dimmed with \"Letter Roulette always uses every generation.\"", g.locked && g.dim && g.note === "Letter Roulette always uses every generation.", JSON.stringify(g));
  check("Letter Roulette: all 1033 Pokémon in play", g.inPlay === "1033", g.inPlay);
  await js(`document.getElementById("custom-gen-panel").scrollIntoView(); 0`); await shot("lr-gens-locked.png"); await js(`window.scrollTo(0, 0); 0`);
  check("How it works: says every generation is used, explains names and Special forms", await js(`(() => { const t = document.getElementById("mode-rule-list").textContent;
    return document.getElementById("mode-rules-name").textContent === "Letter Roulette" && /always uses every generation/.test(t) && /Flabébé is F, Mr\\. Mime is M/.test(t) && /Kazeran Vaporeon is V/.test(t); })()`));
  check("Saved gen choice untouched", (await js(`localStorage.getItem("pokeroll.custom.gens")`)) === "[1]");
  const slices = await js(`[...document.querySelectorAll("#lr-disc .wheel-slice")].map(s => ({ k: s.dataset.type, fill: s.querySelector("path").getAttribute("fill"), ink: s.querySelector("text").getAttribute("fill"), text: s.querySelector("text").textContent }))`);
  check("26 slices A–Z (Gen 1 only selected, still every letter), one colour each, ink picked for contrast",
    slices.map((s) => s.k).join("") === "ABCDEFGHIJKLMNOPQRSTUVWXYZ" && slices.every((s) => s.text === s.k) && new Set(slices.map((s) => s.fill)).size === 26
    && (await js(`[...document.querySelectorAll("#lr-disc .wheel-slice")].every(s => s.querySelector("text").getAttribute("fill") === inkOn(s.querySelector("path").getAttribute("fill")))`)));
  check("Caption \"26 letters on the wheel · each 1 in 26\"", (await js(`document.getElementById("lr-wheel-caption").textContent`)) === "26 letters on the wheel · each 1 in 26");
  let s = await js(`wheelState()`);
  check("Start: no letter, Open locked \"Spin the letter first.\", Space = Spin letter, L hotkey", !s.selected && s.openDisabled && s.hint === "Spin the letter first."
    && s.primary === "letter" && s.kbd === "Space L spin letter", `"${s.kbd}" / "${s.hint}"`);
  await shot("lr-start.png");

  // ---- 1. Spin letter (nút): chỉ quay bánh xe ----
  let h0 = await histLen();
  await click("letter"); await sleep(800);
  check("Spin letter: wheel turns, gen panel stays locked", (await js(`document.getElementById("lr-wheel").classList.contains("is-spinning")`)) && (await js(`genPanel().locked`)));
  await expectIdle(); await sleep(100);
  s = await js(`wheelState()`);
  check("Spin letter: stops on the rolled letter (pointer geometry + angle + hub + saved)", wheelOn(s), `${s.selected}: ${s.geom}/${s.angle}`);
  check("Spin letter: nothing opened or recorded", (await histLen()) === h0 && !(await js(`document.getElementById("result-modal").open`)));
  check("After spin: Open is the Space button, odds panel + idle reel show that letter", !s.openDisabled && s.primary === "open"
    && s.kbd === `Space open ${s.selected} case · L spin letter` && s.oddsTitle === `${s.selected} case` && s.reelLetters.length > 0 && s.reelLetters.every((l) => l === s.selected), s.oddsTitle);
  const oddsOk = await js(`(() => { const g = groupByRarity(letter.pools[letter.selected]), c = effectiveChances(g);
    return [...document.querySelectorAll("#lr-odds-list .rarity-row")].every(r => r.querySelector(".rarity-chance").textContent === pct2(c[r.dataset.tier]) && r.querySelector(".rarity-count").textContent === String(g[r.dataset.tier].length))
      && document.getElementById("lr-odds-count").textContent.replace(/\\s+/g, " ").trim() === letter.pools[letter.selected].length + " Pokémon"; })()`);
  check("Odds panel: Pokémon count and real tier odds of the letter", oddsOk);
  await shot("lr-after-spin.png");

  // ---- 2. Open case (nút): dải ~4 giây, đúng chữ ----
  const L1 = s.selected;
  await click("open"); await sleep(300);
  check("Open case: locks while opening", await js(`${btn("letter")}.disabled && ${btn("open")}.disabled && genPanel().locked`));
  await expectPopup();
  let r = await js(`reelState()`);
  check("Open case: reel marker on winner, matches popup", r.ok && r.card === r.modal, r.card);
  check(`Open case: a ${L1} Pokémon, history tagged letter-roulette / ${L1}`, r.mode === "letter-roulette" && r.detail === L1 && r.letter === L1
    && r.extra.includes(`Letter Roulette · ${L1} case`), `${r.card}`);
  s = await js(`wheelState()`);
  check("Open case: wheel unchanged", wheelOn(s) && s.selected === L1);
  await shot("lr-result.png");
  h0 = await histLen();
  await js(`document.getElementById("result-again").click()`);
  await expectPopup();
  r = await js(`reelState()`);
  check("Open again: same letter", (await histLen()) === h0 + 1 && r.detail === L1 && r.letter === L1 && r.ok);
  await closeAll();

  // ---- 3. Phím L, Space ----
  h0 = await histLen();
  await key("KeyL", "l"); await sleep(400);
  check("L: spins the letter wheel, no case", (await js(`document.getElementById("lr-wheel").classList.contains("is-spinning")`)) && (await histLen()) === h0);
  await expectIdle(); await sleep(100);
  s = await js(`wheelState()`);
  check("L: wheel stops on the new letter", wheelOn(s), `${s.selected}: ${s.geom}/${s.angle}`);
  h0 = await histLen();
  await key("Space", " "); await sleep(200);
  check("Space with a letter selected: opens the case", (await histLen()) === h0 + 1 && (await js(`state.history[0].detail`)) === s.selected);
  await expectPopup(); await closeAll();
  check("W and B do nothing in Letter Roulette", await (async () => { const h = await histLen(); await key("KeyW", "w"); await key("KeyB", "b"); await sleep(200);
    return !(await js(`state.spinning`)) && (await histLen()) === h; })());

  // ---- 4. Quick: bánh xe ×40, hòm ×30 ----
  let qw = 0; const seen = new Set();
  for (let i = 0; i < 40; i++) {
    await click("letter", true);
    s = await js(`wheelState()`);
    seen.add(s.selected);
    if (wheelOn(s) && !(await js(`state.spinning`))) qw++;
  }
  check("Quick spin ×40: stops at once on the rolled letter", qw === 40, `${qw}/40, ${seen.size} different letters`);
  let qo = 0;
  for (let i = 0; i < 30; i++) {
    if (i % 5 === 0) await click("letter", true);
    const sel = await js(`letter.selected`);
    await click("open", true);
    const opened = await waitFor(`document.getElementById("result-modal").open`, 800);
    r = await js(`reelState()`); s = await js(`wheelState()`);
    if (opened && r.ok && r.card === r.modal && r.detail === sel && r.letter === sel && wheelOn(s)) qo++;
    await closeAll();
  }
  check("Quick open ×30: right letter every time, reel marker on winner, wheel kept", qo === 30, `${qo}/30`);

  // ---- 5. Nhãn lịch sử ----
  const LH = await js(`state.history[0].detail`);
  check("Recent drops: \"Letter · X\"", (await js(`document.querySelector("#recent-row .recent-item .src-tag").textContent`)) === `Letter · ${LH}`);
  check("Roll history label: \"Letter Roulette · X\"", (await js(`dropSource(state.history[0]).label`)) === `Letter Roulette · ${LH}`);

  // ---- 6. Đổi cỡ cửa sổ ----
  for (const [w, h] of [[320, 900], [390, 900], [768, 900], [1600, 1000], [1300, 900]]) {
    win.setContentSize(w, h); await sleep(450);
    s = await js(`wheelState()`); r = await js(`reelState()`);
    const wide = await js(`document.documentElement.scrollWidth <= window.innerWidth`);
    check(`Resize to ${w}px: wheel still on ${s.selected}, reel on winner, no horizontal scroll`, wheelOn(s) && r.ok && wide, `${s.geom}, ${r.card}`);
    if (w === 390) { await js(`window.scrollTo(0, 0)`); await shot("lr-390.png"); }
  }

  // ---- 7. Đổi gen ở chế độ khác: Letter không đổi; bảng gen mở lại ở Type ----
  const before = await js(`letterSnap()`);
  await toMode("type-roulette");
  g = await js(`genPanel()`);
  check("Back to Type Roulette: gen panel unlocked, no note, 151 in play", g.unlocked && !g.dim && g.note === null && g.inPlay === "151", JSON.stringify(g));
  for (const gens of ["[]", "[6]", "[9, \"kazeran\"]", "[1,2,3,4,5,6,7,8,9]"]) {
    await js(`custom.gens = new Set(${gens}); saveSelectedGens(custom.gens, STORAGE_KEY_CUSTOM_GENS); syncCheckboxes(document.getElementById("custom-gen-grid"), custom.gens); updateCustomPool(); 0`);
    await sleep(100);
    check(`Gens ${gens}: Letter wheel, case and odds unchanged`, (await js(`letterSnap()`)) === before);
  }
  await js(`document.getElementById("custom-none").click()`);
  await toMode("letter-roulette");
  s = await js(`wheelState()`);
  check("No gens selected: Letter Roulette still works (Open + View case contents enabled)", (await js(`letterSnap()`)) === before && !s.openDisabled
    && !(await js(`document.getElementById("custom-contents").disabled`)) && !(await js(`${btn("letter")}.disabled`)));
  check("…gen panel locked, 1033 in play", (await js(`genPanel().locked && genPanel().inPlay === "1033"`)));
  // Ô gen bị khóa: bấm vào không làm gì
  await js(`document.querySelector('#custom-gen-grid input').click(); document.getElementById("custom-all").click(); 0`);
  check("Clicking the locked gen panel changes nothing", (await js(`custom.gens.size === 0 && localStorage.getItem("pokeroll.custom.gens") === "[]"`)) && (await js(`letterSnap()`)) === before);
  h0 = await histLen();
  await click("open", true); await waitIdle(3000);
  check("…and opens a Pokémon of the letter", (await histLen()) === h0 + 1 && (await js(`letterOf(state.byId.get(state.history[0].id)) === letter.selected`)));
  await closeAll();
  await toMode("type-roulette");
  check("Type Roulette again: panel unlocked, saved choice (none) kept", (await js(`genPanel().unlocked && genPanel().note === null && custom.gens.size === 0`)));
  await js(`document.getElementById("custom-all").click()`);
  await toMode("letter-roulette");

  // ---- 8. Tải lại trang: giữ chữ ----
  const kept = await js(`letter.selected`);
  await win.reload(); await sleep(500); await installHelpers();
  await tab("custom"); await sleep(300);
  s = await js(`wheelState()`);
  check("Reload: Letter Roulette reopens, letter kept, wheel points at it, panel locked", wheelOn(s) && s.selected === kept && (await js(`genPanel().locked`)), `${kept} → ${s.selected} (${s.geom})`);
  h0 = await histLen();
  await key("Space", " "); await expectPopup();
  check("…and Space opens that letter's case", (await histLen()) === h0 + 1 && (await js(`state.history[0].detail`)) === kept);
  await closeAll();

  // ---- 9. Custom pool ----
  await js(`localStorage.setItem("${LETTER_KEY}", '"S"')`);
  await win.reload(); await sleep(500); await installHelpers(); await tab("custom"); await sleep(300);
  await js(`document.getElementById("custom-contents").click()`); await sleep(150);
  check("View case contents: S case, Edit pool enabled", (await js(`document.getElementById("contents-heading").textContent`)) === "S case"
    && !(await js(`document.querySelector('[data-pool="edit"]').disabled`)));
  await js(`document.querySelector('[data-pool="edit"]').click(); document.querySelector('[data-pool="none"]').click(); 0`);
  const PICK = await js(`(() => { const l = letter.pools.S; return [...l.filter(p => COMMON_TIERS.includes(p.rarity)).slice(0, 5), ...l.filter(p => !COMMON_TIERS.includes(p.rarity)).slice(0, 2)].map(p => String(p.id)); })()`);
  await js(`${JSON.stringify(PICK)}.forEach(id => document.querySelector('[data-pick="' + id + '"]').click()); document.querySelector('[data-pool="save"]').click(); 0`);
  await closeAll();
  check("Custom pool saved under pokeroll.custom.pools.letter-roulette.S", (await js(`JSON.parse(localStorage.getItem("pokeroll.custom.pools.letter-roulette.S")).map(String).sort().join()`)) === [...PICK].sort().join());
  s = await js(`wheelState()`);
  const total = await js(`letter.pools.S.length`);
  check("Open button and panel show the custom pool", (await js(`${btn("open")}.textContent.trim()`)) === "Open S case (custom)" && s.oddsTitle.includes(`Custom pool · 7/${total}`), s.oddsTitle);
  let inPool = 0;
  for (let i = 0; i < 25; i++) { await click("open", true); await waitIdle(3000); if (PICK.includes(String(await js(`state.history[0].id`))) && (await js(`state.history[0].pool`)) === "custom") inPool++; await closeAll(); }
  check("25 opens: all from the custom pool, tagged", inPool === 25, `${inPool}/25`);
  check("History: \"Letter Roulette · S · Custom pool\"", (await js(`dropSource(state.history[0]).label`)) === "Letter Roulette · S · Custom pool");
  // X có 3 con: không tùy chỉnh được
  await js(`localStorage.setItem("${LETTER_KEY}", '"X"')`);
  await win.reload(); await sleep(500); await installHelpers(); await tab("custom"); await sleep(300);
  await js(`document.getElementById("custom-contents").click()`); await sleep(150);
  check("X (3 Pokémon): Edit pool locked, fewer than 6", await js(`(() => { const b = document.querySelector('[data-pool="edit"]'); return b.disabled && document.querySelector(".pool-edit-why").textContent === "This case has fewer than 6 Pokémon, so it always uses the full case."; })()`));
  await closeAll();
  check("S custom pool untouched after switching letter", (await js(`localStorage.getItem("pokeroll.custom.pools.letter-roulette.S")`)) !== null);

  // ---- 10. Dữ liệu cũ ----
  const hist = await js(`JSON.parse(localStorage.getItem("pokeroll.history"))`);
  check("Old history entry kept", JSON.stringify(hist[hist.length - 1]) === JSON.stringify(OLD_HISTORY[0]));

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
