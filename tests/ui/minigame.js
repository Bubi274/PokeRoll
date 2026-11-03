// Kiểm tra chế độ Minigame Case (Pokémon Case, Mega Stone Case) trong Electron, render offscreen 60 fps:
// quay thường / Quick / Space / Open again, đổi hòm, tải lại trang, kim dừng đúng thẻ thắng, Pokémon Case không đổi
// bộ sưu tập và thống kê, bộ sưu tập đá Mega, lịch sử Minigame lưu riêng, View case contents, bảng gen, bố cục điện thoại.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-minigame"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const T = require("./timing");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

// Dữ liệu cũ phải còn nguyên (lịch sử lưu mới nhất trước)
const OLD_HISTORY = [
  { id: 6, rarity: "pink", shiny: true, t: 1761000000500, mode: "type-roulette", detail: "fire" },
  { id: 25, rarity: "blue", shiny: false, t: 1761000000000 },
];
const OLD_COLLECTION = { 25: { count: 1, shiny: 0, first: 1761000000000 }, 6: { count: 1, shiny: 1, first: 1761000000500 } };
const K = { history: "pokeroll.minigame.history", stones: "pokeroll.minigame.collection.megastone", picked: "pokeroll.minigame.case" };

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
  const shot = async (name) => { await sleep(250); fs.writeFileSync(path.join(SHOTS, name), (await win.webContents.capturePage()).toPNG()); };
  let lastWaitMs = 0, waitNo = 0;
  const waitFor = async (cond, ms) => { const t0 = Date.now(); for (;;) { if (await js(cond)) { lastWaitMs = Date.now() - t0; return true; } if (Date.now() - t0 >= ms) { lastWaitMs = Date.now() - t0; return false; } await sleep(50); } };
  const expectPopup = async (ms = T.ROULETTE_POPUP_MS) => { const ok = await waitFor(`document.getElementById("result-modal").open`, ms); check(`Wait #${++waitNo}: result popup opens`, ok, `after ${lastWaitMs} ms (limit ${ms} ms)`); return ok; };
  const space = () => js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }))`);
  const btn = (quick = false) => `document.querySelector('.${quick ? "action-quick" : "action-main"}[data-action="open"]')`;
  const tab = async (v) => { await js(`document.querySelector('.tab[data-view="${v}"]').click()`); await sleep(200); };
  const toMode = async (m) => { await js(`document.querySelector('.mode-btn[data-mode="${m}"]').click()`); await sleep(150); };
  const closeResult = () => js(`document.getElementById("result-modal").close()`);
  const store = (key) => js(`JSON.parse(localStorage.getItem("${key}"))`);

  const installHelpers = () => js(`
    // Thẻ dưới vạch chỉ (đo ở vị trí dừng = đích transform), thẻ thắng và popup
    window.reelState = () => {
      const reel = document.getElementById("mg-reel"), r = reel.getBoundingClientRect(), mid = r.left + r.width / 2;
      const strip = reel.querySelector(".reel-strip"), winCard = strip.querySelector(".card.is-winner");
      const x = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41, target = parseFloat(strip.style.transform.slice(11));
      const under = [...strip.children].filter(k => { const b = k.getBoundingClientRect(); return b.left + target - x <= mid && mid < b.right + target - x; });
      return { ok: !!winCard && under.length === 1 && under[0] === winCard, settled: Math.abs(x - target) < 0.5,
        card: winCard && winCard.querySelector(".card-name").textContent,
        modal: document.getElementById("result-modal").open && document.getElementById("result-name").textContent };
    };
    // Popup kết quả: không có chữ / màu độ hiếm, không Shiny
    window.popupState = () => {
      const m = document.getElementById("result-modal"), body = document.getElementById("result-body");
      return { cls: m.className, text: body.textContent.replace(/\\s+/g, " "), badge: (body.querySelector(".reveal-badge") || {}).textContent,
        viewHidden: document.getElementById("result-view").getClientRects().length === 0, odds: (body.querySelector(".odds-value") || {}).textContent,
        tierWords: /\\b(Blue|Purple|Pink|Red|Gold)\\b/.test(body.querySelector(".slab").textContent + body.querySelector(".odds").textContent),
        shiny: !!body.querySelector(".slab-shiny, .shiny-tag, .sparkle, .is-shiny") || /shiny/i.test(body.querySelector(".slab").textContent),
        ladder: !!body.querySelector(".tier-ladder, .tier-panel") };
    };
    window.cardsNeutral = () => [...document.querySelectorAll("#mg-reel .card")].every(c => c.classList.contains("r-minigame")
      && !c.querySelector(".card-tier, .card-shiny") && !/r-(blue|purple|pink|red|gold)/.test(c.className));
    // Mọi thứ trang Collection tính từ bộ sưu tập Pokémon (phải không đổi khi quay Pokémon Case)
    window.statsSnap = () => { renderCollection(); return JSON.stringify({
      tab: document.getElementById("tab-collection-count").textContent, summary: document.getElementById("coll-summary").textContent.replace(/\\s+/g, " "),
      rarity: document.getElementById("rarity-progress").textContent.replace(/\\s+/g, " "), gens: document.getElementById("gen-progress").textContent.replace(/\\s+/g, " "),
      grid: document.getElementById("coll-count").textContent + [...document.querySelectorAll("#coll-grid .mini:not(.is-missing)")].map(t => t.dataset.pokemon).join(),
      collection: localStorage.getItem("pokeroll.collection"), history: localStorage.getItem("pokeroll.history"), state: JSON.stringify([state.collection, state.history]) }); };
    window.genPanel = () => ({
      locked: [...document.querySelectorAll("#custom-gen-grid input")].every(i => i.disabled) && document.getElementById("custom-all").disabled,
      unlocked: [...document.querySelectorAll("#custom-gen-grid input")].every(i => !i.disabled) && !document.getElementById("custom-all").disabled,
      note: document.getElementById("custom-gen-lock").hidden ? null : document.getElementById("custom-gen-lock").textContent,
      inPlay: document.getElementById("custom-pool-count").textContent + " " + document.getElementById("custom-pool-count").nextElementSibling.textContent,
    });
    window.mgPanel = () => ({
      picked: [...document.querySelectorAll(".mg-case")].filter(b => b.getAttribute("aria-checked") === "true").map(b => b.dataset.case).join(),
      title: document.getElementById("mg-info-title").textContent, count: document.getElementById("mg-info-count").textContent.replace(/\\s+/g, " ").trim(),
      odds: document.getElementById("mg-odds").textContent, label: ${btn()}.textContent.trim(), contents: !document.getElementById("custom-contents").hidden,
      kbd: document.getElementById("custom-kbd").textContent.replace(/\\s+/g, " ").trim(),
    });
    0`);
  const settledReel = async () => {
    const t0 = Date.now();
    let r = await js(`reelState()`);
    while (!r.settled && Date.now() - t0 < T.ROULETTE_SETTLE_MS) { await sleep(100); r = await js(`reelState()`); }
    return r;
  };

  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await js(`localStorage.clear(); localStorage.setItem("pokeroll.custom.gens", "[1]");
    localStorage.setItem("pokeroll.history", ${JSON.stringify(JSON.stringify(OLD_HISTORY))});
    localStorage.setItem("pokeroll.collection", ${JSON.stringify(JSON.stringify(OLD_COLLECTION))});`);
  await win.reload(); await sleep(400);
  await installHelpers();
  const snap0 = await js(`statsSnap()`);
  await tab("custom");

  // ---- 0. Chế độ, bảng gen, panel thông tin ----
  check("Mode bar ends with Minigame Case", (await js(`[...document.querySelectorAll(".mode-btn")].map(b => b.dataset.mode).join()`)) === "type-roulette,biome-roulette,letter-roulette,minigame");
  let g = await js(`genPanel()`);
  check("Type Roulette: gen panel open", g.unlocked && g.note === null && g.inPlay === "151 Pokémon in play", JSON.stringify(g));
  await toMode("minigame");
  g = await js(`genPanel()`);
  check("Minigame: gen panel locked with \"Minigame Case always uses every Pokémon.\"", g.locked && g.note === "Minigame Case always uses every Pokémon.", JSON.stringify(g));
  check("Minigame · Pokémon Case: 1033 Pokémon in play", g.inPlay === "1033 Pokémon in play", g.inPlay);
  check("Saved gen choice untouched", (await js(`localStorage.getItem("pokeroll.custom.gens")`)) === "[1]");
  let m = await js(`mgPanel()`);
  check("Default case: Pokémon Case, panel \"1033 Pokémon in case\" + \"Each item: 1 in 1,033 (0.10%)\"",
    m.picked === "pokemon" && m.title === "Pokémon Case" && m.count === "1033 Pokémon in case" && m.odds.startsWith("Each item: 1 in 1,033 (0.10%)"), JSON.stringify(m));
  check("One action: Open Pokémon Case (Space), View case contents shown", m.label === "Open Pokémon Case" && m.kbd === "Space open Pokémon Case" && m.contents, `${m.label} / ${m.kbd}`);
  check("No odds table in the Minigame stage", (await js(`document.querySelectorAll("#mode-minigame .rarity-list, #mode-minigame .rarity-row").length`)) === 0);
  const rules = await js(`document.getElementById("mode-rule-list").textContent`);
  check("How it works: no tiers / no Shiny, Pokémon Case not collected, Mega Stones collected separately",
    /No rarity tiers and no Shiny/.test(rules) && /1 in N/.test(rules) && /not added to your collection/.test(rules) && /own Mega Stones collection/.test(rules) && /1025 \+ Special/.test(rules), rules.slice(0, 160));
  check("Idle reel: neutral Minigame cards", await js(`cardsNeutral() && document.querySelectorAll("#mg-reel .card").length === 12`));
  await shot("mg-start.png");

  // ---- 1. Pokémon Case: quay thường ----
  await js(`${btn()}.click()`);
  await expectPopup();
  let r = await settledReel();
  check("Pokémon Case: pointer stops on the winner card, popup shows the same Pokémon", r.ok && r.card === r.modal, JSON.stringify(r));
  check("Pokémon Case: reel cards are neutral (no tier colour / tier text / shiny)", await js(`cardsNeutral()`));
  let p = await js(`popupState()`);
  check("Pokémon Case popup: neutral colour, no tier words, no Shiny, no tier ladder", p.cls.includes("r-minigame") && !/r-(blue|purple|pink|red|gold)|is-epic/.test(p.cls) && !p.tierWords && !p.shiny && !p.ladder, JSON.stringify(p).slice(0, 200));
  check("Pokémon Case popup: \"1 in 1,033\", \"Not added to collection\", no View in collection", p.odds === "1 in 1,033" && p.badge === "Not added to collection" && p.viewHidden, `${p.odds} / ${p.badge}`);
  let mh = await store(K.history);
  const firstWinner = r.modal;
  check("Pokémon Case: Minigame history has the open", mh.length === 1 && mh[0].mode === "minigame" && mh[0].detail === "pokemon"
    && (await js(`state.byId.get(${JSON.stringify(mh[0].item)}).name`)) === firstWinner, JSON.stringify(mh[0]));
  await shot("mg-pokemon-popup.png");

  // ---- 2. Space = Open again; Quick ----
  await space();
  check("Space on the popup opens the Pokémon Case again", await js(`state.spinning`));
  await expectPopup();
  r = await settledReel();
  check("Open again: winner under the pointer = popup", r.ok && r.card === r.modal, JSON.stringify(r));
  await closeResult();
  await js(`${btn(true)}.click()`); await sleep(100);
  r = await js(`reelState()`);
  check("Quick open: popup at once, winner under the pointer", r.modal && r.ok && r.card === r.modal, JSON.stringify(r));
  await closeResult();
  await space(); // Space ở trang Custom (không có popup) = nút Open
  await expectPopup();
  r = await settledReel();
  check("Space on the page opens the Pokémon Case", r.ok && r.card === r.modal);
  await js(`document.getElementById("result-again").click()`); // Open again bằng nút
  await expectPopup();
  await closeResult();
  mh = await store(K.history);
  check("5 Pokémon Case opens in the Minigame history", mh.length === 5 && mh.every((h) => h.detail === "pokemon"), String(mh.length));

  // ---- 3. Pokémon Case không đổi bộ sưu tập / thống kê, nhưng có trong lịch sử ----
  const snap1 = await js(`statsSnap()`);
  check("Pokémon Case: collection, tab count, Pokédex / Cases opened / Shiny / Gold, tier & gen progress unchanged", snap1 === snap0,
    snap1 === snap0 ? "" : `${snap0.slice(0, 200)} vs ${snap1.slice(0, 200)}`);
  check("Main roll history (pokeroll.history) unchanged", JSON.stringify(await store("pokeroll.history")) === JSON.stringify(OLD_HISTORY));
  await tab("collection");
  const rows = await js(`[...document.querySelectorAll("#history-list .hist")].map(b => ({ cls: b.className, meta: b.querySelector(".hist-meta").textContent.replace(/\\s+/g, " "), name: b.querySelector(".hist-name").firstChild.textContent.trim() }))`);
  check("Roll history: Minigame opens first (newest), labelled \"Minigame · Pokémon Case\", then the old opens",
    rows.length === 7 && rows.slice(0, 5).every((x) => x.cls.includes("r-minigame") && x.meta.includes("Minigame · Pokémon Case")) && rows[4].name === firstWinner
    && rows[5].name === "Charizard" && rows[6].name === "Pikachu", rows.map((x) => x.name + " / " + x.meta).slice(3).join(" | "));
  check("Roll history count covers both sources", (await js(`document.getElementById("history-count").textContent`)) === "Last 7 opens");
  await tab("case");
  const recent = await js(`[...document.querySelectorAll("#recent-row .recent-item")].map(b => ({ cls: b.className, tag: (b.querySelector(".src-tag") || {}).textContent || "" }))`);
  check("Recent drops: Minigame opens with a small \"Minigame\" tag, old opens after them", recent.length === 7
    && recent.slice(0, 5).every((x) => x.cls.includes("r-minigame") && x.tag === "Minigame") && recent[5].tag === "Type · Fire" && recent[6].tag === "", recent.map((x) => x.tag).join());
  await tab("custom");

  // ---- 4. Đổi hòm: Mega Stone Case ----
  await js(`document.querySelector('.mg-case[data-case="megastone"]').click()`); await sleep(150);
  m = await js(`mgPanel()`);
  g = await js(`genPanel()`);
  check("Switch to Mega Stone Case: saved, panel \"156 stones in case\" + \"1 in 156 (0.64%)\", 156 stones in play",
    m.picked === "megastone" && (await store(K.picked)) === "megastone" && m.count === "156 stones in case" && m.odds.startsWith("Each item: 1 in 156 (0.64%)") && g.inPlay === "156 stones in play" && g.locked,
    JSON.stringify(m) + " " + g.inPlay);
  check("Open button follows the case", m.label === "Open Mega Stone Case");
  check("Idle reel shows the stone images (PNG), neutral cards", await js(`cardsNeutral() && [...document.querySelectorAll("#mg-reel .card")].every(c => c.querySelector(".stone-icon img.stone-img"))`));
  await js(`${btn()}.click()`);
  await expectPopup();
  r = await settledReel();
  check("Mega Stone Case: pointer stops on the winner card, popup shows the same stone", r.ok && r.card === r.modal, JSON.stringify(r));
  p = await js(`popupState()`);
  const stoneInfo = await js(`(() => { const id = JSON.parse(localStorage.getItem("${K.history}"))[0].item; const s = MEGA_STONES.find(x => x.id === id);
    const b = document.getElementById("result-body"); const facts = [...b.querySelectorAll(".facts dt")].map(d => d.textContent);
    return { id, name: s.name, facts, types: b.querySelectorAll(".slab-foot .type-chip").length, hasTypes: s.types.length, bst: s.bst, ability: s.ability,
      recipe: b.querySelectorAll(".recipe-item").length, recipeLen: s.recipe.length, mod: b.textContent.includes(MEGA_STONE_MODS.find(m => m.key === s.mod).name),
      mon: !!b.querySelector(".reveal .stone-mon"), hasMon: !!s.pokemonId, gem: (b.querySelector(".reveal img.stone-img") || {}).getAttribute?.("src") === "assets/images/megastones/" + id + ".png" }; })()`);
  check("Stone popup: name, Pokémon + form, mod, recipe, stone image (+ Pokémon image when the app has it)",
    stoneInfo.name === r.modal && stoneInfo.facts.includes("Pokémon") && stoneInfo.facts.includes("Form") && stoneInfo.facts.includes("Mod")
    && stoneInfo.mod && stoneInfo.recipe === stoneInfo.recipeLen && stoneInfo.gem && stoneInfo.mon === stoneInfo.hasMon, JSON.stringify(stoneInfo));
  check("Stone popup: type / BST / ability rows only when the mod lists them",
    stoneInfo.types === stoneInfo.hasTypes && stoneInfo.facts.includes("Base stat total") === (stoneInfo.bst !== null) && stoneInfo.facts.includes("Ability") === Boolean(stoneInfo.ability)
    && !/not listed/i.test(p.text));
  check("Stone popup: neutral, no tiers / Shiny, \"New!\", \"1 in 156\", View in collection shown",
    p.cls.includes("r-minigame") && !p.tierWords && !p.shiny && p.badge === "New!" && p.odds === "1 in 156" && !p.viewHidden, `${p.badge} / ${p.odds}`);
  check("Stone saved to its own collection", JSON.stringify(await store(K.stones)) === JSON.stringify({ [stoneInfo.id]: { count: 1, first: (await store(K.stones))[stoneInfo.id].first } }));
  await shot("mg-stone-popup.png");

  // Nhiều lượt Quick: đếm trùng khớp lịch sử, nhãn Duplicate ×N khớp số bản
  let badDupe = 0;
  for (let i = 0; i < 60; i++) {
    await js(`${btn(true)}.click()`);
    const d = await js(`(() => { const id = JSON.parse(localStorage.getItem("${K.history}"))[0].item; const n = JSON.parse(localStorage.getItem("${K.stones}"))[id].count;
      const b = document.querySelector("#result-body .reveal-badge").textContent; return { n, b }; })()`);
    if (d.b !== (d.n === 1 ? "New!" : `Duplicate ×${d.n}`)) badDupe++;
    await closeResult();
  }
  check("60 quick opens: every popup shows New! / Duplicate ×N matching the collection", badDupe === 0, `${badDupe} wrong`);
  const tally = await js(`(() => { const h = JSON.parse(localStorage.getItem("${K.history}")).filter(x => x.detail === "megastone"); const t = {};
    for (const x of h) t[x.item] = (t[x.item] || 0) + 1; const col = JSON.parse(localStorage.getItem("${K.stones}"));
    return { same: Object.keys(t).length === Object.keys(col).length && Object.entries(t).every(([k, n]) => col[k].count === n), owned: Object.keys(col).length, opens: h.length }; })()`);
  check("Stone collection counts = stone opens in the history", tally.same && tally.opens === 61, JSON.stringify(tally));
  check("Stone opens leave the Pokémon collection and stats alone", (await js(`statsSnap()`)) === snap0);

  // ---- 5. View in collection, mục Mega Stones ----
  await js(`${btn(true)}.click()`);
  const lastId = (await store(K.history))[0].item;
  await js(`document.getElementById("result-view").click()`); await sleep(400);
  check("View in collection → Collection tab, the stone tile is located", await js(`state.view === "collection" && (document.querySelector("#mgc-megastone-grid .is-located") || {}).dataset?.item === ${JSON.stringify(lastId)}`));
  const coll = () => js(`(() => { const col = JSON.parse(localStorage.getItem("${K.stones}")); const tiles = [...document.querySelectorAll("#mgc-megastone-grid .mini")];
    return { count: document.getElementById("mgc-megastone-count").textContent, title: document.getElementById("mgc-megastone-title").textContent.replace(/\\s+/g, " ").trim(),
      tiles: tiles.length, missing: tiles.filter(t => t.classList.contains("is-missing")).length, owned: Object.keys(col).length,
      dupesOk: tiles.every(t => { const e = col[t.dataset.item]; const c = t.querySelector(".mini-count"); return e && e.count > 1 ? c && c.textContent === "×" + e.count : !c; }),
      missingOk: tiles.every(t => t.classList.contains("is-missing") === !col[t.dataset.item]),
      tab: document.getElementById("tab-collection-count").textContent }; })()`);
  let c = await coll();
  check("Mega Stones X/156: all 156 tiles, missing ones dimmed, ×N on duplicates",
    c.title === `Mega Stones ${c.owned}/156` && c.tiles === 156 && c.missing === 156 - c.owned && c.dupesOk && c.missingOk, JSON.stringify(c));
  check("Collection tab count still counts only the Pokédex", c.tab === JSON.parse(snap0).tab, c.tab);
  check("Missing stones are dimmed, not hidden", await js(`(() => { const t = document.querySelector("#mgc-megastone-grid .mini.is-missing .stone-icon"); const s = getComputedStyle(t); return !t || (Number(s.opacity) < 0.6 && s.filter.includes("grayscale")); })()`));
  await js(`document.getElementById("mgc-megastone-filter").value = "mushiromega"; document.getElementById("mgc-megastone-filter").dispatchEvent(new Event("change"))`);
  check("Filter by mod: Mushiromega → 64 stones, all from that mod", await js(`(() => { const t = [...document.querySelectorAll("#mgc-megastone-grid .mini")]; return t.length === 64 && t.every(x => MEGA_STONES.find(s => s.id === x.dataset.item).mod === "mushiromega"); })()`));
  const search = async (q, filter = "all") => js(`(() => { const f = document.getElementById("mgc-megastone-filter"); f.value = "${filter}"; f.dispatchEvent(new Event("change"));
    const s = document.getElementById("mgc-megastone-search"); s.value = ${JSON.stringify(q)}; s.dispatchEvent(new Event("input"));
    return [...document.querySelectorAll("#mgc-megastone-grid .mini .mini-name")].map(n => n.textContent).join(); })()`);
  check("Search by Pokémon name: \"charizard\" → Charizardite X, Y, Z", (await search("charizard")) === "Charizardite X,Charizardite Y,Charizardite Z", await search("charizard"));
  check("Search by stone name, accents / case ignored: \"GÉNGARITE\" → Gengarite", (await search("GÉNGARITE")) === "Gengarite");
  check("Search + mod filter: \"absol\" in ZA Mega → Absolite Z", (await search("absol", "za-mega")) === "Absolite Z", await search("absol", "za-mega"));
  check("No match: hint shown", (await search("zzzz")) === "" && await js(`/No stones match/.test(document.getElementById("mgc-megastone-grid").textContent)`));
  await search("");
  await js(`document.querySelector('#mgc-megastone-grid [data-item="mushironitex"]').click()`); await sleep(200);
  check("Stone tile → stone detail popup (Mushiro: stone image only, no Pokémon image)", await js(`document.getElementById("detail-modal").open && document.getElementById("detail-title").textContent === "Mega Stone details"
    && document.querySelector("#detail-body .detail-name").textContent === "Mushironite X" && !!document.querySelector("#detail-body img.stone-img") && !document.querySelector("#detail-body .stone-mon")`));
  await shot("mg-stone-detail.png");
  await js(`document.getElementById("detail-modal").close()`);
  await js(`document.getElementById("mgc-megastone").scrollIntoView(); 0`); await shot("mg-stone-collection.png");
  await js(`document.querySelector('#coll-grid [data-pokemon="25"]').click()`); await sleep(150);
  check("Pokémon detail popup still titled \"Pokémon details\"", await js(`document.getElementById("detail-title").textContent === "Pokémon details" && document.querySelector("#detail-body .detail-name").textContent === "Pikachu"`));
  await js(`document.getElementById("detail-modal").close()`);

  // ---- 6. Tải lại trang: còn nguyên ----
  const before = { stones: JSON.stringify(await store(K.stones)), history: JSON.stringify(await store(K.history)) };
  await win.reload(); await sleep(500);
  await installHelpers();
  await tab("collection");
  c = await coll();
  check("After reload: stone collection, duplicates and Minigame history kept", JSON.stringify(await store(K.stones)) === before.stones && JSON.stringify(await store(K.history)) === before.history
    && c.title === `Mega Stones ${c.owned}/156` && c.dupesOk && c.missingOk && (await js(`minigame.history.length`)) === 67); // 5 Pokémon + 62 đá
  check("After reload: Roll history shows Minigame + old opens", (await js(`document.getElementById("history-count").textContent`)) === "Last 69 opens"
    && (await js(`document.querySelectorAll("#history-list .hist.r-minigame").length`)) === 67);
  check("After reload: Pokémon collection and stats unchanged", (await js(`statsSnap()`)) === snap0);
  await tab("custom");
  m = await js(`mgPanel()`);
  check("After reload: Minigame mode and Mega Stone Case still picked", (await js(`custom.active.key`)) === "minigame" && m.picked === "megastone" && m.label === "Open Mega Stone Case", JSON.stringify(m));

  // ---- 7. View case contents ----
  await js(`document.getElementById("custom-contents").click()`); await sleep(300);
  const contents = () => js(`(() => { const tiles = [...document.querySelectorAll("#contents-body .mini")];
    return { open: document.getElementById("contents-modal").open, heading: document.getElementById("contents-heading").textContent, summary: document.getElementById("contents-summary").textContent,
      tiles: tiles.length, odds: [...new Set(tiles.map(t => t.querySelector(".mini-odds").textContent))].join(), tiers: document.querySelectorAll("#contents-body .contents-group").length,
      edit: document.querySelectorAll("#contents-modal [data-pool]").length, picker: !!document.getElementById("contents-pick"), placeholder: document.getElementById("contents-search").placeholder }; })()`);
  const filterContents = (q) => js(`(() => { const s = document.getElementById("contents-search"); s.value = ${JSON.stringify(q)}; s.dispatchEvent(new Event("input"));
    return { shown: [...document.querySelectorAll("#contents-body .mini")].filter(t => !t.hidden).map(t => t.querySelector(".mini-name").textContent).join(), empty: !document.getElementById("contents-empty").hidden,
      emptyText: document.getElementById("contents-empty").textContent }; })()`);
  let ct = await contents();
  check("Contents (Mega Stone Case): 156 stones, each \"1 in 156\", one group, no Edit pool", ct.open && ct.heading === "Mega Stone Case" && ct.summary === "156 stones"
    && ct.tiles === 156 && ct.odds === "1 in 156" && ct.tiers === 1 && ct.edit === 0 && !ct.picker, JSON.stringify(ct));
  let f = await filterContents("venusaur");
  check("Contents search: \"venusaur\" → Venusaurite", f.shown === "Venusaurite" && !f.empty, f.shown);
  f = await filterContents("qqqq");
  check("Contents search: no match → hint", f.shown === "" && f.empty && f.emptyText === "Nothing in this case matches your search.");
  await shot("mg-contents.png");
  await js(`document.getElementById("contents-modal").close()`);
  await js(`document.querySelector('.mg-case[data-case="pokemon"]').click()`); await sleep(150);
  await js(`document.getElementById("custom-contents").click()`); await sleep(500);
  ct = await contents();
  check("Contents (Pokémon Case): all 1033 Pokémon, each \"1 in 1,033\", no Edit pool", ct.summary === "1,033 Pokémon" && ct.tiles === 1033 && ct.odds === "1 in 1,033" && ct.edit === 0, JSON.stringify(ct));
  f = await filterContents("flabebe");
  check("Contents search ignores accents: \"flabebe\" → Flabébé", f.shown === "Flabébé", f.shown);
  await js(`document.getElementById("contents-modal").close()`);
  await toMode("type-roulette");
  await js(`document.querySelector('.action-quick[data-action="wheel"]').click()`); await sleep(100);
  await js(`document.getElementById("custom-contents").click()`); await sleep(300);
  check("Type Roulette contents still the tiered view with its own search text", await js(`document.querySelectorAll("#contents-body .contents-group").length > 1 && document.getElementById("contents-search").placeholder === "Search by name or Pokédex number…" && !!document.getElementById("contents-pick")`));
  await js(`document.getElementById("contents-modal").close()`);

  // ---- 8. Bảng gen ----
  g = await js(`genPanel()`);
  check("Type Roulette: gen panel unlocked again, lock note hidden, Pokémon in play", g.unlocked && g.note === null && g.inPlay === "151 Pokémon in play", JSON.stringify(g));
  await toMode("minigame");
  g = await js(`genPanel()`);
  check("Back to Minigame: locked again", g.locked && g.note === "Minigame Case always uses every Pokémon." && g.inPlay === "1033 Pokémon in play", JSON.stringify(g));
  await js(`${btn()}.click()`); await sleep(300);
  check("While opening: case picker, mode bar and Case button locked", await js(`[...document.querySelectorAll(".mg-case")].every(b => b.disabled) && [...document.querySelectorAll(".mode-btn")].every(b => b.disabled) && document.getElementById("btn-spin").disabled`));
  await expectPopup();
  await closeResult();
  check("After opening: case picker unlocked", await js(`[...document.querySelectorAll(".mg-case")].every(b => !b.disabled)`));

  // ---- 9. Lịch sử Minigame lưu riêng: hơn 200 lượt không đẩy lịch sử hòm chính ra ----
  await js(`document.querySelector('.mg-case[data-case="megastone"]').click()`); await sleep(100);
  const mainBefore = JSON.stringify(await store("pokeroll.history"));
  await js(`(() => { for (let i = 0; i < 230; i++) { runCustomAction("open", { quick: true }); document.getElementById("result-modal").close(); } })()`);
  const lim = await js(`({ mg: JSON.parse(localStorage.getItem("${K.history}")).length, state: minigame.history.length, main: localStorage.getItem("pokeroll.history"), mainState: state.history.length })`);
  check("230 more Minigame opens: Minigame history capped at its own 200", lim.mg === 200 && lim.state === 200, JSON.stringify({ mg: lim.mg, state: lim.state }));
  check("…and the main history is still intact", lim.main === mainBefore && lim.mainState === OLD_HISTORY.length, lim.main);
  await tab("collection");
  check("Roll history after: 200 Minigame + the 2 old opens", (await js(`document.getElementById("history-count").textContent`)) === "Last 202 opens"
    && (await js(`[...document.querySelectorAll("#history-list .hist")].slice(-2).map(b => b.querySelector(".hist-name").firstChild.textContent.trim()).join()`)) === "Charizard,Pikachu");
  check("Stone collection counts every open (incl. ones past the history limit)", await js(`Object.values(JSON.parse(localStorage.getItem("${K.stones}"))).reduce((s, e) => s + e.count, 0)`) === 61 + 1 + 230);
  check("Pokémon collection and stats still unchanged", (await js(`statsSnap()`)) === snap0);

  // ---- 10. Bố cục: không tràn ngang ----
  await tab("custom");
  for (const w of [320, 390, 768]) {
    win.setContentSize(w, 800); await sleep(300);
    for (const view of ["custom", "collection"]) {
      await js(`showView("${view}")`); await sleep(150);
      const o = await js(`(() => { const d = document.documentElement;
        const clipped = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return p !== d && p !== document.body; } return false; };
        const out = [...document.querySelectorAll("#view-${view} *")].filter(el => el.getClientRects().length && el.getBoundingClientRect().right > d.clientWidth + 0.5 && !clipped(el))
          .slice(0, 3).map(el => el.tagName.toLowerCase() + "." + [...el.classList].join("."));
        return { sw: d.scrollWidth, cw: d.clientWidth, out }; })()`);
      check(`${w}px ${view} (Minigame): no horizontal scroll`, o.sw <= o.cw && o.out.length === 0, `${o.sw}/${o.cw} ${o.out.join(", ")}`);
    }
    await js(`showView("custom")`); await sleep(100);
    await js(`${btn(true)}.click()`); await sleep(200);
    const o = await js(`(() => { const b = document.getElementById("result-body"), m = document.getElementById("result-modal"); return { body: b.scrollWidth <= b.clientWidth + 1, modal: m.getBoundingClientRect().right <= document.documentElement.clientWidth + 0.5 }; })()`);
    check(`${w}px stone popup fits`, o.body && o.modal, JSON.stringify(o));
    if (w === 390) { await shot("mg-stone-popup-390.png"); await closeResult(); await js(`window.scrollTo(0, 0)`); await shot("mg-custom-390.png"); }
    await closeResult();
  }
  win.setContentSize(1300, 900); await sleep(300);

  // ---- 10b. Lưu bộ sưu tập chính bị lỗi: lượt Minigame lưu được không che mất cảnh báo ----
  const flags = await js(`(() => { const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === "pokeroll.collection") throw new Error("full"); return orig.call(this, k, v); };
    saveProgress(); const before = state.saveFailed;
    runCustomAction("open", { quick: true }); document.getElementById("result-modal").close(); const afterMinigame = state.saveFailed;
    Storage.prototype.setItem = orig; saveProgress();
    return { before, afterMinigame, fixed: state.saveFailed }; })()`);
  check("Main save failing: a successful Minigame save keeps the save warning; it clears once the main save works", flags.before && flags.afterMinigame && !flags.fixed, JSON.stringify(flags));

  // ---- 11. Clear data: xoá luôn bộ sưu tập đá và lịch sử Minigame ----
  await tab("collection");
  const confirmText = await js(`(() => { let text = ""; window.confirm = (t) => { text = t; return true; }; document.getElementById("btn-clear").click(); return text; })()`);
  check("Clear data asks about Pokémon and Mega Stones", confirmText.startsWith("Delete your whole collection (Pokémon and Mega Stones) and roll history?"), confirmText);
  const cleared = await js(`({ h: localStorage.getItem("${K.history}"), s: localStorage.getItem("${K.stones}"), count: document.getElementById("mgc-megastone-count").textContent,
    rows: document.querySelectorAll("#history-list .hist").length, recent: document.querySelectorAll("#recent-row .recent-item").length })`);
  check("Clear data: Minigame history + stone collection emptied, 0/156, no history rows", cleared.h === "[]" && cleared.s === "{}" && cleared.count === "0/156" && cleared.rows === 0 && cleared.recent === 0, JSON.stringify(cleared));
  await win.reload(); await sleep(400);
  check("After clear + reload: still empty", (await js(`minigame.history.length + Object.keys(minigame.collections.megastone).length`)) === 0);

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
