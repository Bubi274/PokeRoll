// Kiểm tra Biome Roulette (Spin biome → Open <biome> case) trong Electron, render offscreen 60 fps.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-biome"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const T = require("./timing");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const KEY = "pokeroll.custom.biomeRoulette.biome";

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
  // Chờ đo bằng đồng hồ thật; giới hạn tính từ hằng số thời gian của app (tests/ui/timing.js).
  // Các lần chờ dài được ghi thành kiểm tra kèm thời gian thực tế, để log CI cho biết chậm ở đâu.
  let lastWaitMs = 0, waitNo = 0;
  const waitModal = async (ms) => { const t0 = Date.now(); for (;;) { if (await js(`document.getElementById("result-modal").open`)) { lastWaitMs = Date.now() - t0; return true; } if (Date.now() - t0 >= ms) { lastWaitMs = Date.now() - t0; return false; } await sleep(50); } };
  const waitIdle = async (ms) => { const t0 = Date.now(); for (;;) { if (!(await js(`state.spinning`))) { lastWaitMs = Date.now() - t0; return true; } if (Date.now() - t0 >= ms) { lastWaitMs = Date.now() - t0; return false; } await sleep(50); } };
  const expectPopup = async (ms = T.ROULETTE_POPUP_MS) => { const ok = await waitModal(ms); check(`Wait #${++waitNo}: result popup opens`, ok, `after ${lastWaitMs} ms (limit ${ms} ms)`); return ok; };
  const expectIdle = async (ms = T.WHEEL_MS) => { const ok = await waitIdle(ms); check(`Wait #${++waitNo}: spin finishes`, ok, `after ${lastWaitMs} ms (limit ${ms} ms)`); return ok; };
  const key = (code, k) => js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "${code}", key: "${k}", bubbles: true }))`);
  const space = () => key("Space", " ");
  const pressB = () => key("KeyB", "b");
  const pressW = () => key("KeyW", "w");
  const btn = (action, quick = false) => `document.querySelector('.${quick ? "action-quick" : "action-main"}[data-action="${action}"]')`;
  const click = (action, quick) => js(`${btn(action, quick)}.click()`);
  const histLen = () => js(`state.history.length`);
  const closeModal = () => js(`document.getElementById("result-modal").close()`);
  const tab = (v) => js(`document.querySelector('.tab[data-view="${v}"]').click()`);
  const toBiome = async () => { await tab("custom"); await js(`document.querySelector('.mode-btn[data-mode="biome-roulette"]').click()`); await sleep(250); };
  const nameOf = (k) => k[0].toUpperCase() + k.slice(1); // mã nhóm → tên (ocean → Ocean …)

  const installHelpers = () => js(`
    window.sliceUnderPointer = () => {
      const wr = document.getElementById("br-wheel").getBoundingClientRect();
      const svg = document.querySelector("#br-disc svg");
      if (!svg) return null;
      const pt = new DOMPoint(wr.left + wr.width / 2, wr.top + wr.height * 0.09).matrixTransform(svg.getScreenCTM().inverse());
      const g = [...svg.querySelectorAll(".wheel-slice")].find(g => g.querySelector("path").isPointInFill(pt));
      return g ? g.dataset.type : null;
    };
    window.inBiome = (p, k) => biomeGroupsOf(p).has(k);
    window.wheelState = () => ({
      geom: sliceUnderPointer(), angle: biome.types[wheelSliceOnScreen(BIOME_WHEEL)], selected: biome.selected,
      saved: JSON.parse(localStorage.getItem("${KEY}")),
      hub: document.getElementById("br-hub").textContent,
      winnerSlice: (document.querySelector("#br-wheel .wheel-slice.is-winner") || {}).dataset?.type || null,
      openLabel: ${btn("open")}.textContent.trim(), openDisabled: ${btn("open")}.disabled, spinDisabled: ${btn("biome")}.disabled,
      primary: document.querySelector("#custom-actions .action-main:not(.is-secondary)").dataset.action,
      hint: document.getElementById("custom-hint").textContent, kbd: document.getElementById("custom-kbd").textContent.replace(/\\s+/g, " ").trim(),
      oddsTitle: document.getElementById("br-odds-title").textContent.trim(),
      tags: document.getElementById("br-tags").hidden ? "" : document.getElementById("br-tags").textContent.replace(/\\s+/g, " ").trim(),
      slices: document.querySelectorAll("#br-wheel .wheel-slice").length,
      reelOk: [...document.querySelectorAll("#br-reel .card")].every(c => inBiome(state.pokemon.find(p => p.name === c.querySelector(".card-name").textContent), biome.selected)),
    });
    window.reelState = () => {
      const reel = document.getElementById("br-reel"), r = reel.getBoundingClientRect(), mid = r.left + r.width / 2;
      const strip = reel.querySelector(".reel-strip"), winCard = strip.querySelector(".card.is-winner");
      const under = [...strip.children].filter(k => { const b = k.getBoundingClientRect(); return b.left <= mid && mid < b.right; });
      const settled = Math.abs(new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41 - parseFloat(strip.style.transform.slice(11))) < 0.5;
      const h = state.history[0], p = state.byId.get(h.id);
      return { ok: settled && !!winCard && under.length === 1 && under[0] === winCard, card: winCard && winCard.querySelector(".card-name").textContent,
        modal: document.getElementById("result-modal").open && document.getElementById("result-name").textContent,
        extra: (document.querySelector("#result-body .mode-note") || {}).textContent || "", mode: h.mode, detail: h.detail,
        spawnsThere: inBiome(p, h.detail), special: !!p.group };
    };
    window.locks = () => [...document.querySelectorAll("#custom-gen-grid input")].every(i => i.disabled) && document.getElementById("custom-all").disabled && document.getElementById("custom-none").disabled;
    0`);
  const wheelOn = (s) => s.selected && s.geom === s.selected && s.angle === s.selected && s.winnerSlice === s.selected
    && s.hub === nameOf(s.selected) && s.saved === s.selected && s.openLabel === `Open ${nameOf(s.selected)} case`;

  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await js(`localStorage.clear();
    localStorage.setItem("pokeroll.history", ${JSON.stringify(JSON.stringify(OLD_HISTORY))});
    localStorage.setItem("pokeroll.collection", ${JSON.stringify(JSON.stringify(OLD_COLLECTION))});`);
  await win.reload(); await sleep(400);
  await toBiome();
  await installHelpers();

  // ---- 0. Chưa quay ----
  let s = await js(`wheelState()`);
  check("Start: 18 biome slices, no biome, Open locked with \"Spin the biome first.\"",
    s.slices === 18 && !s.selected && s.openDisabled && s.openLabel === "Open case" && !s.spinDisabled && s.hint === "Spin the biome first." && s.hub === "?", `hint "${s.hint}"`);
  check("Start: Spin biome is the Space button; key notes \"Space B spin biome\"", s.primary === "biome" && s.kbd === "Space B spin biome", `"${s.kbd}"`);
  check("How it works shows Biome Roulette rules", (await js(`document.getElementById("mode-rules-name").textContent`)) === "Biome Roulette"
    && (await js(`document.querySelectorAll("#mode-rule-list li").length`)) === 7
    && /only goes on the wheel if it has at least one Blue, Purple or Pink/.test(await js(`document.getElementById("mode-rule-list").textContent`)));
  await shot("br-start.png");

  // ---- 1. Spin biome (nút) ----
  let h0 = await histLen();
  await click("biome"); await sleep(1200);
  const during = await js(`({ spinning: document.getElementById("br-wheel").classList.contains("is-spinning"), label: ${btn("biome")}.textContent.trim(),
    open: ${btn("open")}.disabled, caseBtn: document.getElementById("btn-spin").disabled, locked: locks(), modes: [...document.querySelectorAll(".mode-btn")].every(b => b.disabled) })`);
  check("Spin biome: wheel turns, \"Spinning…\", Open + Case + gen grid + mode bar locked", during.spinning && during.label === "Spinning…" && during.open && during.caseBtn && during.locked && during.modes, JSON.stringify(during));
  await expectIdle(); await sleep(100);
  s = await js(`wheelState()`);
  check("Spin biome: stops on the rolled biome (pointer geometry + angle + hub + saved)", wheelOn(s), `${s.selected}: under pointer ${s.geom}/${s.angle}`);
  check("Spin biome: no case opened, nothing recorded", (await histLen()) === h0 && !(await js(`document.getElementById("result-modal").open`)));
  check("After spin: Open is the Space button, key notes updated, gen grid unlocked",
    !s.openDisabled && s.primary === "open" && s.kbd === `Space open ${nameOf(s.selected)} case · B spin biome` && !(await js(`locks()`)) && s.hint === "", `"${s.kbd}"`);
  const groupTags = await js(`biomeInfo(biome.selected).tags.join(", ")`);
  check("Odds panel: biome case, tier rows, list of Cobbleverse biomes in the group", s.oddsTitle === `${nameOf(s.selected)} case`
    && (await js(`document.querySelectorAll("#br-odds-list .rarity-row").length`)) === 5 && s.tags === `Cobbleverse biomes ${groupTags}`, s.tags);
  check("Idle reel shows Pokémon that spawn in that biome", s.reelOk);
  await shot("br-after-spin.png");

  // ---- 2. Open case (nút): dải 4 giây, đúng biome ----
  const b1 = s.selected;
  const rot1 = await js(`biome.rotation`);
  await js(`window.__log = []; window.__stop = false; (function poll() {
      const r = document.getElementById("br-reel").classList.contains("is-spinning");
      const last = window.__log[window.__log.length - 1];
      if (!last || last.r !== r) window.__log.push({ r, t: performance.now(), w: document.getElementById("br-wheel").classList.contains("is-spinning") });
      if (!window.__stop) requestAnimationFrame(poll);
    })(); 0`);
  await click("open"); await sleep(300);
  check("Open case: locks while opening", await js(`locks() && ${btn("biome")}.disabled && ${btn("open")}.disabled`));
  await expectPopup();
  await js(`window.__stop = true`);
  const log = await js(`window.__log`);
  const rs = log.find((l) => l.r), re = log.slice(log.indexOf(rs)).find((l) => !l.r);
  const reelSecs = (re.t - rs.t) / 1000;
  check("Open case: Pokémon reel runs ~4 s, wheel does not spin", reelSecs > 3.9 && reelSecs < 4.4 && log.every((l) => !l.w), `${reelSecs.toFixed(2)}s`);
  let r = await js(`reelState()`);
  check("Open case: reel marker on winner, matches popup", r.ok && r.card === r.modal, r.card);
  check("Open case: Pokémon spawns in that biome, history tagged, popup note", r.mode === "biome-roulette" && r.detail === b1 && r.spawnsThere && !r.special && r.extra.includes(`${nameOf(b1)} case`), r.card);
  s = await js(`wheelState()`);
  check("Open case: wheel unchanged, biome kept", wheelOn(s) && s.selected === b1 && (await js(`biome.rotation`)) === rot1);
  await shot("br-result-popup.png");

  // ---- 3. Open again + Space trong popup ----
  h0 = await histLen();
  await js(`document.getElementById("result-again").click()`);
  await expectPopup();
  r = await js(`reelState()`);
  check("Open again: same biome case again", (await histLen()) === h0 + 1 && r.detail === b1 && r.spawnsThere && r.ok && r.card === r.modal, r.card);
  await space(); await sleep(200);
  check("Space in the popup: opens the same biome again", (await histLen()) === h0 + 2 && (await js(`state.history[0].detail`)) === b1);
  await expectPopup(); await closeModal();

  // ---- 4. Space (có biome) → mở hòm; B → quay; W không làm gì ở chế độ này ----
  h0 = await histLen();
  await space(); await sleep(200);
  check("Space with a biome: opens the case", (await histLen()) === h0 + 1 && !(await js(`document.getElementById("br-wheel").classList.contains("is-spinning")`)));
  await expectPopup(); await closeModal();
  h0 = await histLen();
  await pressW(); await sleep(200);
  check("W (Type Roulette's key) does nothing in Biome Roulette", (await histLen()) === h0 && !(await js(`state.spinning`)));
  await pressB(); await sleep(400);
  check("B: spins the biome wheel, no case", await js(`document.getElementById("br-wheel").classList.contains("is-spinning")`) && (await histLen()) === h0);
  await expectIdle(); await sleep(100);
  s = await js(`wheelState()`);
  check("B: wheel stops on the new biome", wheelOn(s), `${s.selected}: ${s.geom}/${s.angle}`);

  // ---- 5. Quick ----
  let qw = 0, qwInstant = 0; const seen = new Set();
  h0 = await histLen();
  for (let i = 0; i < 30; i++) {
    const t = Date.now();
    await click("biome", true);
    if (!(await js(`state.spinning`)) && Date.now() - t < 300) qwInstant++;
    s = await js(`wheelState()`);
    seen.add(s.selected);
    if (wheelOn(s) && s.reelOk) qw++;
  }
  check("Quick spin biome ×30: stops at once on the rolled biome, no case", qw === 30 && qwInstant === 30 && (await histLen()) === h0, `${qw}/30, ${seen.size} different biomes`);
  let qo = 0;
  for (let i = 0; i < 20; i++) {
    if (i % 4 === 0) await click("biome", true);
    const sel = await js(`biome.selected`);
    const t = Date.now();
    await click("open", true);
    const opened = await waitModal(800);
    r = await js(`reelState()`); s = await js(`wheelState()`);
    if (opened && Date.now() - t < 800 && r.ok && r.card === r.modal && r.detail === sel && r.spawnsThere && !r.special && wheelOn(s)) qo++;
    await closeModal();
  }
  check("Quick open ×20: opens at once, Pokémon from that biome, reel marker on winner", qo === 20, `${qo}/20`);

  // ---- 6. Đổi cỡ cửa sổ ----
  for (const [w, h] of [[390, 900], [800, 800], [1600, 1000], [1300, 900]]) {
    win.setContentSize(w, h); await sleep(450);
    s = await js(`wheelState()`); r = await js(`reelState()`);
    check(`Resize to ${w}px: wheel still on ${s.selected}, reel still on winner`, wheelOn(s) && r.ok, `${s.geom}, ${r.card}`);
    if (w === 390) {
      const visible = await js(`(() => { const b = document.getElementById("mode-bar").getBoundingClientRect(), a = document.querySelector('.mode-btn[aria-selected="true"]').getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1; })()`);
      check("390px: mode bar scrolls so the selected mode is fully visible", visible);
      await js(`window.scrollTo(0, 0)`); await shot("br-mobile-390.png");
    }
  }

  // ---- 7. Chuyển chế độ: mỗi chế độ giữ lựa chọn riêng ----
  const keptBiome = await js(`biome.selected`);
  await js(`document.querySelector('.mode-btn[data-mode="type-roulette"]').click()`); await sleep(200);
  await js(`document.querySelector('.action-quick[data-action="wheel"]').click()`);
  await js(`document.querySelector('.action-quick[data-action="open"]').click()`); await waitModal(1000); await closeModal(); // một lượt Type để có nhãn "Type · …"
  const typeSel = await js(`roulette.selected`);
  h0 = await histLen();
  await pressB(); await sleep(200);
  check("B does nothing in Type Roulette", (await histLen()) === h0 && !(await js(`state.spinning`)) && (await js(`roulette.selected`)) === typeSel);
  await js(`document.querySelector('.mode-btn[data-mode="biome-roulette"]').click()`); await sleep(200);
  s = await js(`wheelState()`);
  check("Switching modes keeps each mode's own pick", wheelOn(s) && s.selected === keptBiome && (await js(`roulette.selected`)) === typeSel, `biome ${keptBiome}, type ${typeSel}`);

  // ---- 8. Tải lại trang: giữ biome ----
  await win.reload(); await sleep(500); await installHelpers(); await toBiome();
  s = await js(`wheelState()`);
  check("Reload: biome kept, wheel points at it, Space opens", wheelOn(s) && s.selected === keptBiome && s.primary === "open", `${keptBiome} → ${s.selected}`);
  h0 = await histLen();
  await space(); await expectPopup();
  check("…and Space opens that biome's case", (await histLen()) === h0 + 1 && (await js(`state.history[0].detail`)) === keptBiome);
  await closeModal();

  // ---- 9. Đổi gen ----
  await js(`localStorage.setItem("${KEY}", '"forest"'); localStorage.setItem("pokeroll.custom.gens", "[1,2,3,4,5,6,7,8,9]")`);
  await win.reload(); await sleep(500); await installHelpers(); await toBiome();
  await js(`document.getElementById("custom-none").click(); document.querySelector('#custom-gen-grid input[value="9"]').click()`); await sleep(150);
  s = await js(`wheelState()`);
  check("Gen 9 only, Forest selected: kept, wheel redrawn (16 slices: no End, no Gold-only Legendary), still points at Forest",
    wheelOn(s) && s.selected === "forest" && s.slices === 16 && !(await js(`!!document.querySelector('#br-wheel .wheel-slice[data-type="end"], #br-wheel .wheel-slice[data-type="legendary"]')`)), `${s.geom}/${s.angle}, ${s.slices} slices`);
  await js(`localStorage.setItem("${KEY}", '"end"'); localStorage.setItem("pokeroll.custom.gens", "[1]")`);
  await win.reload(); await sleep(500); await installHelpers(); await toBiome();
  check("End selected with Gen 1: kept", (await js(`biome.selected`)) === "end");
  await js(`document.querySelector('#custom-gen-grid input[value="1"]').click()`); await sleep(100);
  s = await js(`wheelState()`);
  check("None (no gens): End kept, both buttons locked", s.selected === "end" && s.spinDisabled && s.openDisabled && s.hint === "Select at least one generation to spin.");
  await js(`document.querySelector('#custom-gen-grid input[value="9"]').click()`); await sleep(150);
  s = await js(`wheelState()`);
  check("Switch to Gen 9 (no End): biome dropped (still saved), Open locked, user told to spin again",
    s.selected === null && s.saved === "end" && s.openDisabled && s.openLabel === "Open case" && s.primary === "biome"
    && s.hint === "End has no Pokémon in these generations. Spin the biome again." && /End has no Pokémon/.test(await js(`document.getElementById("br-odds-sub").textContent`)), `"${s.hint}"`);
  await shot("br-biome-dropped.png");
  await space(); await sleep(300);
  check("…Space now spins the biome wheel", await js(`document.getElementById("br-wheel").classList.contains("is-spinning")`));
  await expectIdle(); await sleep(100);
  s = await js(`wheelState()`);
  check("…new biome picked, message cleared", wheelOn(s) && s.selected !== "end" && s.hint === "", s.selected);
  await js(`document.getElementById("custom-all").click()`); await sleep(100);

  // ---- 9b. Quy tắc "chỉ có Pokémon hiếm" (dữ liệu thật: Legendary ở Gen 9 chỉ có 4 Gold) ----
  const RARE_MSG = "Legendary only has rare Pokémon in these generations. Spin again.";
  await js(`localStorage.setItem("${KEY}", '"legendary"'); localStorage.setItem("pokeroll.custom.gens", "[1,2,3,4,5,6,7,8,9]")`);
  await win.reload(); await sleep(500); await installHelpers(); await toBiome();
  s = await js(`wheelState()`);
  check("All gens: Legendary on the wheel and kept", wheelOn(s) && s.selected === "legendary" && s.slices === 18);
  await js(`document.getElementById("custom-none").click()`); await sleep(100);
  check("None: Legendary kept (buttons locked)", (await js(`biome.selected`)) === "legendary");
  await js(`document.querySelector('#custom-gen-grid input[value="9"]').click()`); await sleep(150);
  s = await js(`wheelState()`);
  const noLegendSlice = !(await js(`!!document.querySelector('#br-wheel .wheel-slice[data-type="legendary"]')`));
  check("Gen 9 only: Legendary (Gold only) dropped (still saved), Open locked, rare-only message",
    s.selected === null && s.saved === "legendary" && s.openDisabled && s.primary === "biome" && s.hint === RARE_MSG
    && (await js(`document.getElementById("br-odds-sub").textContent`)) === RARE_MSG, `"${s.hint}"`);
  check("Gen 9 only: wheel has 16 biomes, no Legendary slice (End empty, Legendary rare-only)", s.slices === 16 && noLegendSlice, `${s.slices} slices`);
  await shot("br-rare-only.png");
  const seen9 = new Set();
  for (let i = 0; i < 40; i++) { await click("biome", true); seen9.add(await js(`biome.selected`)); }
  check("Gen 9 only ×40 quick spins: never lands on Legendary", !seen9.has("legendary"), `${seen9.size} different biomes`);
  // Biome đã lưu từ trước mà giờ không hợp lệ → bỏ ngay khi tải trang
  await js(`localStorage.setItem("${KEY}", '"legendary"'); localStorage.setItem("pokeroll.custom.gens", "[9]")`);
  await win.reload(); await sleep(500); await installHelpers(); await toBiome();
  s = await js(`wheelState()`);
  check("Page load with a saved Legendary + Gen 9: dropped at load, rare-only message", s.selected === null && s.saved === "legendary" && s.openDisabled && s.hint === RARE_MSG, `"${s.hint}"`);
  await js(`document.getElementById("custom-all").click()`); await sleep(100);

  // ---- 10. Lịch sử và nhãn ----
  const hist = await js(`JSON.parse(localStorage.getItem("pokeroll.history"))`);
  check("Old history entries kept unchanged", JSON.stringify(hist.slice(-2)) === JSON.stringify(OLD_HISTORY), `${hist.length} entries`);
  const coll = await js(`JSON.parse(localStorage.getItem("pokeroll.collection"))`);
  check("Every opened case counted once in the collection", Object.values(coll).reduce((a, e) => a + e.count, 0) === hist.length);
  await tab("case"); await sleep(200);
  await js(`document.getElementById("btn-quick").click()`); await waitModal(1000); await closeModal();
  const lastBiome = hist.find((h) => h.mode === "biome-roulette");
  const lastType = hist.find((h) => h.mode === "type-roulette");
  const recent = await js(`[...document.querySelectorAll("#recent-row .recent-item")].map(b => (b.querySelector(".src-tag") || {}).textContent || "")`);
  check("Recent drops: Case untagged, \"Biome · <biome>\" and \"Type · <type>\" tags", recent[0] === "" && recent.includes(`Biome · ${nameOf(lastBiome.detail)}`) && recent.includes(`Type · ${nameOf(lastType.detail)}`), JSON.stringify(recent.slice(0, 4)));
  await shot("br-case-recent.png");
  await tab("collection"); await sleep(300);
  const histTags = await js(`[...document.querySelectorAll("#history-list .src-tag")].map(t => t.textContent)`);
  check("Roll history: \"Case\", \"Biome Roulette · <biome>\", \"Type Roulette · <type>\"", histTags[0] === "Case" && histTags.includes(`Biome Roulette · ${nameOf(lastBiome.detail)}`)
    && histTags.includes(`Type Roulette · ${nameOf(lastType.detail)}`) && histTags.slice(-2).every((t) => t === "Case"));
  await js(`document.getElementById("history-list").scrollIntoView()`); await sleep(200); await shot("br-history.png");

  check("No console errors", errors.length === 0, errors.join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
