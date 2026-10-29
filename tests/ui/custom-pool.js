// Kiểm tra custom pool ở trang Custom (Type / Biome Roulette) trong Electron, trang mở với ?nomotion
// (số và thanh tỉ lệ hiện ngay giá trị cuối, không phụ thuộc thời gian thật của hiệu ứng).
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-custom-pool"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

// Dữ liệu cũ phải còn nguyên
const OLD_HISTORY = [
  { id: 25, rarity: "blue", shiny: false, t: 1761000000000 },
  { id: 6, rarity: "red", shiny: false, t: 1760500000000, mode: "type-roulette", detail: "fire" },
];
const OLD_COLLECTION = { 25: { count: 1, shiny: 0, first: 1761000000000 }, 6: { count: 1, shiny: 0, first: 1760500000000 }, 147: { count: 2, shiny: 0, first: 1 } };
const DRAGON_KEY = "pokeroll.custom.pools.type-roulette.dragon";
const FIRE_KEY = "pokeroll.custom.pools.type-roulette.fire";

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
  // Ảnh chụp chỉ để xem bằng mắt (không kiểm tra gì): chờ một chút để khung hình offscreen kịp vẽ lại
  const shot = async (name) => { await sleep(250); fs.writeFileSync(path.join(SHOTS, name), (await win.webContents.capturePage()).toPNG()); };
  const waitIdle = async (ms) => { for (let t = 0; t < ms; t += 50) { if (!(await js(`state.spinning`))) return true; await sleep(50); } return false; };
  const tab = (v) => js(`document.querySelector('.tab[data-view="${v}"]').click()`);
  const toMode = async (m) => { await tab("custom"); await js(`document.querySelector('.mode-btn[data-mode="${m}"]').click()`); await sleep(150); };
  const click = (action, quick) => js(`document.querySelector('.${quick ? "action-quick" : "action-main"}[data-action="${action}"]').click()`);
  const closeAll = () => js(`document.querySelectorAll("dialog[open]").forEach(d => d.close())`);
  const openCC = async () => { await js(`document.getElementById("custom-contents").click()`); await sleep(100); };
  const pick = async (key) => { await js(`(() => { const s = document.getElementById("contents-pick"); s.value = "${key}"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`); await sleep(100); };
  const pool = (a) => js(`document.querySelector('[data-pool="${a}"]').click()`);
  const reload = async () => { await win.reload(); await sleep(400); await installHelpers(); };
  const openLabel = () => js(`document.querySelector('.action-main[data-action="open"]').textContent.trim()`);
  const quickOpens = async (n) => { for (let i = 0; i < n; i++) { await click("open", true); await waitIdle(3000); await closeAll(); } };

  const installHelpers = () => js(`
    // Trạng thái popup: chế độ sửa, bộ đếm, lý do, nút Save, các ô và tỉ lệ
    window.pe = () => {
      const q = (s) => document.querySelector(s);
      return {
        open: q("#contents-modal").open,
        editing: Boolean(poolEdit.mode),
        heading: q("#contents-heading").textContent,
        summary: q("#contents-summary").textContent,
        lines: [...document.querySelectorAll("#contents-note .contents-line")].map(l => l.textContent.replace(/\\s+/g, " ").trim()),
        editBtn: q('[data-pool="edit"]') ? { disabled: q('[data-pool="edit"]').disabled, why: (q(".pool-edit-why") || {}).textContent || "" } : null,
        pickDisabled: q("#contents-pick") ? q("#contents-pick").disabled : null,
        count: q("#pool-edit-count") ? q("#pool-edit-count").textContent : null,
        problems: [...document.querySelectorAll("#pool-problems li")].map(l => l.textContent),
        save: q("#pool-save") ? q("#pool-save").disabled : null,
        ticked: [...document.querySelectorAll("#contents-body .mini-check")].filter(i => i.checked).map(i => i.dataset.pick),
        tiles: [...document.querySelectorAll("#contents-body .mini")].map(t => t.dataset.id || t.dataset.pokemon),
      };
    };
    window.dragonFull = () => typePools(custom.pool).dragon;
    // Ô tìm kiếm của popup, các ô đang hiện, nhãn / trạng thái các nút chọn nhanh và chọn cả bậc
    window.search = (q) => { const s = document.getElementById("contents-search"); s.value = q; s.dispatchEvent(new Event("input")); };
    window.shownIds = () => [...document.querySelectorAll("#contents-body .mini")].filter(t => !t.hidden).map(t => t.dataset.id);
    window.quick = () => Object.fromEntries(["all", "none", "missing", "owned"].map(a => {
      const b = document.querySelector('[data-pool="' + a + '"]'); return [a, { text: b.textContent, disabled: b.disabled }]; }));
    window.tierBtn = (tier) => document.querySelector('[data-tier-pick="' + tier + '"]').textContent;
    window.tick = (ids, on) => ids.forEach(id => { const i = document.querySelector('[data-pick="' + id + '"]'); if (i.checked !== on) i.click(); });
    // Chế độ sửa: tỉ lệ từng ô = dropOdds của tập đang tick, ô bỏ tick "—", tổng 100%; bảng tỉ lệ = effectiveChances
    window.editOdds = () => {
      const list = dragonFull().filter(p => poolEdit.picked.has(String(p.id)));
      const groups = groupByRarity(list), chances = effectiveChances(groups), bad = [];
      let sum = 0;
      for (const t of document.querySelectorAll("#contents-body .mini")) {
        const p = state.byId.get(parseId(t.dataset.id)), on = t.querySelector(".mini-check").checked;
        const o = t.querySelector(".mini-odds"), v = Number(o.dataset.odds);
        const want = on ? dropOdds({ rarity: p.rarity, shiny: false }, groups).pokemon : 0;
        if (v !== want || o.textContent !== (on ? formatPct(want * 100) : "—")) bad.push(t.dataset.id + " " + o.textContent);
        if (on === t.classList.contains("is-unpicked")) bad.push("class " + t.dataset.id);
        sum += v;
      }
      for (const r of RARITIES) {
        const row = document.querySelector('#pool-odds [data-tier="' + r.key + '"]');
        if (row.querySelector(".rarity-chance").textContent !== pct2(chances[r.key])) bad.push("table " + r.key + " " + row.querySelector(".rarity-chance").textContent);
        if (row.querySelector(".rarity-count").textContent !== String(groups[r.key].length)) bad.push("count " + r.key);
      }
      return { ok: bad.length === 0, bad: bad.slice(0, 5), sum, n: list.length };
    };
    // Chế độ xem: ô và tỉ lệ đúng tập list
    window.viewMatches = (list) => {
      const groups = groupByRarity(list), bad = [];
      const tiles = [...document.querySelectorAll("#contents-body .mini")];
      if (tiles.map(t => t.dataset.pokemon).sort().join() !== list.map(p => String(p.id)).sort().join()) bad.push("ids");
      let sum = 0;
      for (const t of tiles) {
        const p = state.byId.get(parseId(t.dataset.pokemon)), v = Number(t.querySelector(".mini-odds").dataset.odds);
        if (v !== dropOdds({ rarity: p.rarity, shiny: false }, groups).pokemon) bad.push("odds " + p.id);
        sum += v;
      }
      if (Math.abs(sum - 1) > 1e-9) bad.push("sum " + sum);
      return { ok: bad.length === 0, bad, n: tiles.length };
    };
    window.panel = (pre) => ({
      title: document.getElementById(pre + "-odds-title").textContent.replace(/\\s+/g, " ").trim(),
      sub: document.getElementById(pre + "-odds-sub").textContent.replace(/\\s+/g, " ").trim(),
      count: document.getElementById(pre + "-odds-count").textContent.replace(/\\s+/g, " ").trim(),
      chances: [...document.querySelectorAll("#" + pre + "-odds-list .rarity-chance")].map(e => e.textContent),
    });
    0`);

  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await js(`localStorage.clear();
    localStorage.setItem("pokeroll.history", ${JSON.stringify(JSON.stringify(OLD_HISTORY))});
    localStorage.setItem("pokeroll.collection", ${JSON.stringify(JSON.stringify(OLD_COLLECTION))});
    localStorage.setItem("pokeroll.custom.typeRoulette.type", '"dragon"');`);
  await reload();
  await toMode("type-roulette");

  check("How it works explains the custom pool", /Edit pool lets you pick which Pokémon of your type case can drop \(at least 6, with at least one Blue, Purple or Pink\)/
    .test(await js(`document.getElementById("mode-rule-list").textContent`)));

  // ---- 1. Mặc định: cả hòm ----
  const full = await js(`dragonFull().length`);
  check("Default: Open button \"Open Dragon case\", no custom pool label", (await openLabel()) === "Open Dragon case"
    && !(await js(`panel("tr").title`)).includes("Custom pool"), await openLabel());
  await openCC();
  let p = await js(`pe()`);
  check("Popup (view): full Dragon case, Edit pool enabled, no custom line", p.summary === `${full} Pokémon` && p.editBtn && !p.editBtn.disabled
    && !p.lines.some(l => l.startsWith("Custom pool")), JSON.stringify(p.editBtn));

  // ---- 2. Chế độ sửa ----
  await pool("edit");
  p = await js(`pe()`);
  check("Edit pool: every Pokémon ticked, \"N selected\", Save enabled, picker locked",
    p.editing && p.ticked.length === full && p.count === `${full} selected` && p.save === false && p.pickDisabled === true, p.count);
  check("Edit pool: tiles are tick boxes, not detail buttons", await js(`document.querySelectorAll("#contents-body .mini[data-pokemon]").length === 0 && document.querySelectorAll("#contents-body label.mini .mini-check").length === ${full}`));
  let o = await js(`editOdds()`);
  check("Edit pool (full): per-Pokémon odds = dropOdds, table = effectiveChances, sum 100%", o.ok && Math.abs(o.sum - 1) < 1e-9, o.bad.join("; ") || `sum ${o.sum}`);

  await pool("none");
  p = await js(`pe()`);
  check("None: 0 selected, Save locked, both reasons shown", p.ticked.length === 0 && p.count === "0 selected" && p.save === true
    && p.problems.join("|") === "Pick at least 6 Pokémon|Include at least one Blue, Purple or Pink Pokémon", p.problems.join("|"));
  check("None: odds table says to pick Pokémon", await js(`!document.querySelector("#pool-odds .odds-hint").hidden && document.querySelector("#pool-odds .odds-hint").textContent === "Pick Pokémon to see the odds."`));

  const commons = await js(`dragonFull().filter(p => COMMON_TIERS.includes(p.rarity)).map(p => String(p.id))`);
  const rares = await js(`dragonFull().filter(p => !COMMON_TIERS.includes(p.rarity)).map(p => String(p.id))`);
  await js(`tick(${JSON.stringify(commons.slice(0, 5))}, true)`);
  p = await js(`pe()`);
  check("5 Pokémon: Save locked, \"Pick at least 6 Pokémon\"", p.save === true && p.problems.join("|") === "Pick at least 6 Pokémon" && p.count === "5 selected", p.problems.join("|"));
  await pool("none");
  await js(`tick(${JSON.stringify(rares.slice(0, 7))}, true)`);
  p = await js(`pe()`);
  check("7 Red/Gold only: Save locked, \"Include at least one Blue, Purple or Pink Pokémon\"", p.save === true
    && p.problems.join("|") === "Include at least one Blue, Purple or Pink Pokémon", p.problems.join("|"));
  await js(`tick(["${commons[0]}"], true)`);
  p = await js(`pe()`);
  check("…plus one Blue/Purple/Pink: valid, Save enabled", p.save === false && p.problems.length === 0);

  // Chọn / bỏ cả bậc
  await pool("none");
  const goldN = await js(`dragonFull().filter(p => p.rarity === "gold").length`);
  await js(`document.querySelector('[data-tier-pick="gold"]').click()`);
  p = await js(`pe()`);
  check("Select tier (Gold): every Gold Dragon ticked, button now \"Clear tier\"", p.ticked.length === goldN
    && (await js(`document.querySelector('[data-tier-pick="gold"]').textContent`)) === "Clear tier", `${p.ticked.length}/${goldN}`);
  await js(`document.querySelector('[data-tier-pick="gold"]').click()`);
  check("Clear tier: none ticked again", (await js(`pe().ticked.length`)) === 0);

  // Only owned / Only missing (bộ sưu tập có Dratini #147)
  await pool("owned");
  check("Only owned: just Dratini", (await js(`pe().ticked.join()`)) === "147");
  await pool("missing");
  check("Only missing: everything but Dratini", (await js(`pe().ticked.length`)) === full - 1 && !(await js(`pe().ticked.includes("147")`)));

  // Tìm kiếm theo tên / số trong chế độ sửa
  await js(`(() => { const s = document.getElementById("contents-search"); s.value = "dragon"; s.dispatchEvent(new Event("input")); })()`);
  const shown = await js(`[...document.querySelectorAll("#contents-body .mini")].filter(t => !t.hidden).map(t => t.querySelector(".mini-name").textContent)`);
  check("Search works while editing (\"dragon\")", shown.length > 0 && shown.every(n => /dragon/i.test(n)), shown.join(", "));
  await js(`(() => { const s = document.getElementById("contents-search"); s.value = "149"; s.dispatchEvent(new Event("input")); })()`);
  check("Search by number (\"149\" → Dragonite)", (await js(`[...document.querySelectorAll("#contents-body .mini")].filter(t => !t.hidden).map(t => t.dataset.id).join()`)) === "149");
  await js(`search("")`);

  // Đang tìm kiếm: các nút chọn nhanh / chọn cả bậc chỉ áp cho Pokémon đang hiện, con bị ẩn giữ nguyên
  let q = await js(`quick()`);
  check("Empty search: quick buttons read All / None / Only missing / Only owned", q.all.text === "All" && q.none.text === "None"
    && q.missing.text === "Only missing" && q.owned.text === "Only owned" && !q.all.disabled, JSON.stringify(q));
  await pool("none");
  await js(`search("dra")`);
  const shownDra = await js(`shownIds()`);
  const n = shownDra.length;
  check(`Search "dra": ${n} shown (Dratini among them), others hidden`, n >= 3 && n < full && shownDra.includes("147"), shownDra.join());
  q = await js(`quick()`);
  check(`Filtered labels: "Select ${n} shown", "Clear ${n} shown", "Only missing (${n} shown)", "Only owned (${n} shown)"`,
    q.all.text === `Select ${n} shown` && q.none.text === `Clear ${n} shown` && q.missing.text === `Only missing (${n} shown)`
    && q.owned.text === `Only owned (${n} shown)`, JSON.stringify(q));
  await pool("all");
  check("Select N shown: exactly the shown Pokémon ticked, hidden ones untouched (still off)", (await js(`pe().ticked.sort().join()`)) === [...shownDra].sort().join());
  await js(`search("")`); await pool("all"); await js(`search("dra")`);
  await pool("none");
  p = await js(`pe()`);
  check("Clear N shown: only the shown ones unticked, hidden ones stay ticked", p.ticked.length === full - n && shownDra.every(id => !p.ticked.includes(id)), `${p.ticked.length}/${full}`);
  await pool("missing");
  p = await js(`pe()`);
  check("Only missing (shown): shown missing ticked, owned Dratini off, hidden untouched", p.ticked.length === full - 1 && !p.ticked.includes("147"));
  await pool("owned");
  p = await js(`pe()`);
  check("Only owned (shown): only Dratini of the shown, hidden untouched", p.ticked.length === full - n + 1 && p.ticked.includes("147")
    && shownDra.filter(id => id !== "147").every(id => !p.ticked.includes(id)));
  // Chọn / bỏ cả bậc khi đang tìm: chỉ con của bậc đang hiện
  const tierOf = await js(`state.byId.get(149).rarity`); // Dragonite
  const shownTier = await js(`dragonFull().filter(p => p.rarity === "${tierOf}" && shownIds().includes(String(p.id))).map(p => String(p.id))`);
  const tierAll = await js(`dragonFull().filter(p => p.rarity === "${tierOf}").length`);
  check(`Tier button while filtered: "Select ${shownTier.length} shown"`, shownTier.length < tierAll && (await js(`tierBtn("${tierOf}")`)) === `Select ${shownTier.length} shown`,
    `${await js(`tierBtn("${tierOf}")`)} (${tierOf}: ${shownTier.length} of ${tierAll} shown)`);
  const before = await js(`pe().ticked`);
  await js(`document.querySelector('[data-tier-pick="${tierOf}"]').click()`);
  p = await js(`pe()`);
  check("Select shown in a tier: only those ticked, the rest of the tier unchanged", shownTier.every(id => p.ticked.includes(id))
    && p.ticked.length === new Set([...before, ...shownTier]).size && (await js(`tierBtn("${tierOf}")`)) === `Clear ${shownTier.length} shown`);
  await js(`document.querySelector('[data-tier-pick="${tierOf}"]').click()`);
  p = await js(`pe()`);
  check("Clear shown in a tier: only those unticked", shownTier.every(id => !p.ticked.includes(id))
    && p.ticked.length === before.filter(id => !shownTier.includes(id)).length);
  await shot("pool-edit-search.png");
  // Không có kết quả: các nút chọn nhanh khóa
  await js(`search("zzzz")`);
  q = await js(`quick()`);
  check("No search results: quick buttons \"Select 0 shown\"… locked", q.all.text === "Select 0 shown" && Object.values(q).every(b => b.disabled));
  // Reset vẫn áp cho cả hòm kể cả khi đang tìm
  await js(`search("dra")`); await pool("reset");
  check("Reset to full case while filtered: whole case ticked", (await js(`pe().ticked.length`)) === full);
  // Xóa ô tìm kiếm: nhãn và cách làm như cũ
  await js(`search("")`);
  q = await js(`quick()`);
  check("Search cleared: labels back to All / None / …, tier \"Clear tier\"", q.all.text === "All" && q.none.text === "None"
    && q.missing.text === "Only missing" && q.owned.text === "Only owned" && (await js(`tierBtn("${tierOf}")`)) === "Clear tier");
  await pool("owned");
  check("Search cleared: Only owned applies to the whole case again", (await js(`pe().ticked.join()`)) === "147");

  // 12 Pokémon: tỉ lệ cập nhật theo tập
  const PICK = [...commons.slice(0, 9), ...rares.slice(0, 3)];
  await pool("none");
  await js(`tick(${JSON.stringify(PICK)}, true)`);
  p = await js(`pe()`);
  o = await js(`editOdds()`);
  check("12 picked: \"12 selected\", odds = dropOdds of the 12, unpicked \"—\", sum 100%", p.count === "12 selected" && o.ok && o.n === 12 && Math.abs(o.sum - 1) < 1e-9,
    o.bad.join("; ") || `sum ${o.sum}`);
  await shot("pool-edit.png");

  // Cancel: không lưu gì
  await pool("cancel");
  p = await js(`pe()`);
  check("Cancel: back to view, nothing saved, full case", !p.editing && p.editBtn && (await js(`localStorage.getItem("${DRAGON_KEY}")`)) === null && p.summary === `${full} Pokémon`);
  // Đóng popup khi đang sửa = Cancel
  await pool("edit"); await pool("none"); await closeAll();
  await openCC();
  check("Closing the popup while editing drops the editing layout", !(await js(`document.getElementById("contents-modal").classList.contains("is-editing-pool")`)));
  check("Closing the popup while editing discards the edit", !(await js(`pe().editing`)) && (await js(`localStorage.getItem("${DRAGON_KEY}")`)) === null);

  // ---- 3. Lưu ----
  await pool("edit"); await pool("none");
  await js(`tick(${JSON.stringify(PICK)}, true)`);
  const rot0 = await js(`roulette.rotation`);
  await pool("save");
  check("Save does not move the wheel", (await js(`roulette.rotation`)) === rot0);
  const savedIds = await js(`JSON.parse(localStorage.getItem("${DRAGON_KEY}"))`);
  check("Save: stored under pokeroll.custom.pools.type-roulette.dragon", Array.isArray(savedIds) && savedIds.map(String).sort().join() === [...PICK].sort().join(), JSON.stringify(savedIds));
  p = await js(`pe()`);
  check("After Save: popup shows the 12 Pokémon and \"Custom pool · 12/N\"", !p.editing && p.summary === "12 Pokémon"
    && p.lines.includes(`Custom pool · 12/${full} Pokémon. Only these can drop.`), p.lines.join(" | "));
  check("Case picker: \"Dragon · 12/N Pokémon · custom pool · your case\"", (await js(`[...document.getElementById("contents-pick").options].find(o => o.value === "dragon").textContent.replace(/\\s+/g, " ").trim()`))
    === `Dragon · 12/${full} Pokémon · custom pool · your case`);
  let v = await js(`viewMatches(dragonFull().filter(p => ${JSON.stringify(PICK)}.includes(String(p.id))))`);
  check("After Save: popup odds = dropOdds of the pool, sum 100%", v.ok, v.bad.join("; "));
  await closeAll();
  check("Open button: \"Open Dragon case (custom)\"", (await openLabel()) === "Open Dragon case (custom)", await openLabel());
  let pn = await js(`panel("tr")`);
  const poolChances = await js(`(() => { const g = groupByRarity(dragonFull().filter(p => ${JSON.stringify(PICK)}.includes(String(p.id)))), c = effectiveChances(g); return [...RARITIES].reverse().map(r => pct2(c[r.key])); })()`);
  check("Odds panel: \"Custom pool · 12/N\", 12 Pokémon, odds of the pool", pn.title.includes(`Custom pool · 12/${full}`) && pn.count === "12 Pokémon"
    && pn.chances.join() === poolChances.join(), `${pn.title} / ${pn.count} / ${pn.chances.join()}`);
  await shot("pool-panel.png");

  // ---- 4. Mở thật: luôn trong tập, ghi lịch sử ----
  const h0 = await js(`state.history.length`);
  const collTotal = () => js(`Object.values(JSON.parse(localStorage.getItem("pokeroll.collection"))).reduce((a, e) => a + e.count, 0)`);
  const c0 = await collTotal();
  await quickOpens(40);
  const hist = await js(`state.history.slice(0, 40)`);
  check("40 real opens: every drop is in the custom pool", hist.length === 40 && hist.every(h => PICK.includes(String(h.id))) && (await js(`state.history.length`)) === h0 + 40,
    hist.filter(h => !PICK.includes(String(h.id))).map(h => h.id).join());
  check("History entries: mode type-roulette, detail dragon, pool custom", hist.every(h => h.mode === "type-roulette" && h.detail === "dragon" && h.pool === "custom"));
  const coll = await js(`JSON.parse(localStorage.getItem("pokeroll.collection"))`);
  const all = await js(`JSON.parse(localStorage.getItem("pokeroll.history"))`);
  check("Custom pool drops count in the collection", (await collTotal()) === c0 + 40, `${await collTotal()} vs ${c0} + 40`);
  check("Old history and collection entries kept", JSON.stringify(all.slice(-2)) === JSON.stringify(OLD_HISTORY)
    && coll[25].count === 1 && coll[6].count === 1 && coll[147].count >= 2);
  const recent = await js(`(() => { const t = document.querySelector("#recent-row .recent-item .src-tag"); return { text: t.textContent, mark: Boolean(t.querySelector(".src-mark")), title: (t.querySelector(".src-mark") || {}).title }; })()`);
  check("Recent drops: \"Type · Dragon\" with the custom pool mark", recent.text === "Type · Dragon✦" && recent.mark && recent.title === "Custom pool", JSON.stringify(recent));
  await click("open", true); await waitIdle(3000);
  check("Result popup mentions the custom pool", (await js(`document.querySelector("#result-modal .mode-note").textContent`)).includes(`Custom pool: 12 of ${full} Pokémon.`));
  await closeAll();
  await tab("collection"); await sleep(200);
  const histTags = await js(`[...document.querySelectorAll("#history-list .src-tag")].map(t => t.textContent)`);
  check("Roll history: \"Type Roulette · Dragon · Custom pool\"; old entries unchanged", histTags[0] === "Type Roulette · Dragon · Custom pool"
    && histTags.slice(-2).join("|") === "Case|Type Roulette · Fire", `${histTags[0]} … ${histTags.slice(-2).join("|")}`);

  // ---- 5. Tải lại trang ----
  await reload(); await toMode("type-roulette");
  check("Reload: custom pool still applied", (await openLabel()) === "Open Dragon case (custom)" && (await js(`panel("tr").title`)).includes(`Custom pool · 12/${full}`));

  // ---- 6. Xem nhóm khác: hiện tập đã lưu của nhóm đó, Edit pool khóa ----
  const FIRE = await js(`typePools(custom.pool).fire.filter(p => COMMON_TIERS.includes(p.rarity)).slice(0, 7).map(p => p.id)`);
  await js(`localStorage.setItem("${FIRE_KEY}", ${JSON.stringify(JSON.stringify(FIRE))})`);
  await openCC(); await pick("fire");
  p = await js(`pe()`);
  check("Preview Fire: shows Fire's saved pool (7) with its Custom pool line", p.summary === "7 Pokémon" && p.lines.some(l => l.startsWith("Custom pool · 7/")), p.lines.join(" | "));
  check("Preview Fire: Edit pool locked with the reason", p.editBtn && p.editBtn.disabled && p.editBtn.why === "Spin or select this case on the wheel to edit its pool", JSON.stringify(p.editBtn));
  await pool("edit");
  check("…clicking it does nothing", !(await js(`pe().editing`)));
  await pick("normal");
  p = await js(`pe()`);
  check("Preview Normal (no saved pool): full case", !p.lines.some(l => l.startsWith("Custom pool")) && p.summary === `${await js(`typePools(custom.pool).normal.length`)} Pokémon`);
  await closeAll();
  check("Previewing changed nothing", (await js(`roulette.selected`)) === "dragon" && (await openLabel()) === "Open Dragon case (custom)");

  // ---- 7. Đổi nhóm: nhóm mới dùng tập đã lưu của nó, tập của Dragon giữ nguyên ----
  await js(`localStorage.setItem("pokeroll.custom.typeRoulette.type", '"fire"')`);
  await reload(); await toMode("type-roulette");
  check("Wheel on Fire: Fire's saved pool applies", (await openLabel()) === "Open Fire case (custom)" && (await js(`panel("tr").title`)).includes("Custom pool · 7/"));
  await quickOpens(10);
  check("Fire opens stay in Fire's pool", (await js(`state.history.slice(0, 10).every(h => ${JSON.stringify(FIRE)}.includes(h.id) && h.detail === "fire" && h.pool === "custom")`)));
  check("Dragon's saved pool untouched", JSON.stringify(await js(`JSON.parse(localStorage.getItem("${DRAGON_KEY}"))`)) === JSON.stringify(savedIds));
  await js(`localStorage.setItem("pokeroll.custom.typeRoulette.type", '"dragon"')`);
  await reload(); await toMode("type-roulette");

  // ---- 8. Biome Roulette: riêng với Type Roulette ----
  await toMode("biome-roulette");
  await click("biome", true); await waitIdle(3000);
  const B = await js(`biome.selected`);
  check("Biome Roulette: no custom pool by default", !(await openLabel()).includes("(custom)"));
  await openCC(); await pool("edit"); await pool("none");
  const BPICK = await js(`(() => { const l = biome.pools[biome.selected]; const c = l.filter(p => COMMON_TIERS.includes(p.rarity)); return c.slice(0, 6).map(p => String(p.id)); })()`);
  await js(`tick(${JSON.stringify(BPICK)}, true)`);
  await pool("save"); await closeAll();
  const bKey = `pokeroll.custom.pools.biome-roulette.${B}`;
  check(`Biome save: stored under ${bKey}`, (await js(`JSON.parse(localStorage.getItem("${bKey}")).map(String).sort().join()`)) === [...BPICK].sort().join());
  check("Biome Open button and panel show the custom pool", (await openLabel()).endsWith("case (custom)") && (await js(`panel("br").title`)).includes("Custom pool · 6/"));
  await quickOpens(15);
  const bh = await js(`state.history.slice(0, 15)`);
  check("Biome opens stay in the biome pool, history tagged", bh.every(h => BPICK.includes(String(h.id)) && h.mode === "biome-roulette" && h.pool === "custom"));
  check("Biome dropSource: \"Biome Roulette · X · Custom pool\"", (await js(`dropSource(state.history[0])`)).label === `Biome Roulette · ${await js(`biomeInfo(biome.selected).name`)} · Custom pool`);
  check("Type Roulette pools untouched by Biome", JSON.stringify(await js(`JSON.parse(localStorage.getItem("${DRAGON_KEY}"))`)) === JSON.stringify(savedIds)
    && JSON.stringify(await js(`JSON.parse(localStorage.getItem("${FIRE_KEY}"))`)) === JSON.stringify(FIRE));
  await toMode("type-roulette");
  check("Back on Type Roulette: Dragon custom pool still applied", (await openLabel()) === "Open Dragon case (custom)");

  // ---- 9. Đổi gen: tạm không tính, không hợp lệ → cả hòm + thông báo, hợp lệ lại → custom ----
  const gensOf = await js(`[...new Set(dragonFull().filter(p => ${JSON.stringify(PICK)}.includes(String(p.id))).map(p => p.gen))].sort((a, b) => a - b)`);
  const setGens = (gens) => js(`(() => { custom.gens = new Set(${gens === "all" ? "allSourceKeys()" : JSON.stringify(gens)}); saveSelectedGens(custom.gens, STORAGE_KEY_CUSTOM_GENS);
    syncCheckboxes(document.getElementById("custom-gen-grid"), custom.gens); updateCustomPool(); })()`);
  // Gen 1 chỉ có 3 Dragon (< 6): không hợp lệ
  await setGens([1]);
  pn = await js(`panel("tr")`);
  const gen1Full = await js(`dragonFull().length`);
  check("Gen 1 only: full case (3) + notice, Open without (custom)", pn.sub.includes("Your custom pool isn't valid with these generations — using the full case.")
    && !pn.title.includes("Custom pool") && pn.count === `${gen1Full} Pokémon` && (await openLabel()) === "Open Dragon case", `${pn.sub} / ${pn.count}`);
  check("…saved pool not deleted", JSON.stringify(await js(`JSON.parse(localStorage.getItem("${DRAGON_KEY}"))`)) === JSON.stringify(savedIds));
  await openCC();
  p = await js(`pe()`);
  check("Popup: notice line, full case, Edit pool locked (case under 6)", p.lines.includes("Your custom pool isn't valid with these generations — using the full case.")
    && p.summary === `${gen1Full} Pokémon` && p.editBtn.disabled && p.editBtn.why === "This case has fewer than 6 Pokémon, so it always uses the full case.", JSON.stringify(p.editBtn));
  await closeAll();
  await quickOpens(10);
  check("Invalid pool: opens use the full case, not tagged custom", (await js(`state.history.slice(0, 10).every(h => dragonFull().some(p => p.id === h.id) && !h.pool)`)));

  // Bật lại các gen của tập: hợp lệ lại
  await setGens(gensOf);
  check(`Gens ${gensOf.join(",")}: custom pool back (12)`, (await openLabel()) === "Open Dragon case (custom)" && (await js(`panel("tr").title`)).includes("Custom pool · 12/")
    && !(await js(`panel("tr").sub`)).includes("isn't valid"));

  // Bỏ gen đầu (Gen 1: Dratini, Dragonair, Dragonite): phần còn lại (9) vẫn hợp lệ nên dùng phần đó;
  // sửa + lưu lúc đang ẩn Gen 1 vẫn giữ 3 con Gen 1 trong danh sách đã lưu
  const hiddenGen = gensOf[0];
  const keepGens = gensOf.slice(1);
  const left = await js(`(() => { const g = new Set(${JSON.stringify(keepGens)}); return dragonFull().filter(p => g.has(p.gen) && ${JSON.stringify(PICK)}.includes(String(p.id))).map(p => String(p.id)); })()`);
  await setGens(keepGens);
  pn = await js(`panel("tr")`);
  check(`Without Gen ${hiddenGen}: custom pool of the ${left.length} picks left, no notice`, left.length >= 7 && pn.title.includes(`Custom pool · ${left.length}/`) && !pn.sub.includes("isn't valid"), pn.title);
  await openCC(); await pool("edit");
  check("Edit with a gen hidden: only the visible picks are ticked", (await js(`pe().ticked.sort().join()`)) === [...left].sort().join());
  const drop = left[left.length - 1];
  await js(`tick(["${drop}"], false)`);
  check("…unticking one leaves a valid set", (await js(`pe().save`)) === false);
  await pool("save"); await closeAll();
  const afterSave = (await js(`JSON.parse(localStorage.getItem("${DRAGON_KEY}"))`)).map(String);
  const hiddenIds = PICK.filter((id) => !left.includes(id));
  check("Save keeps the picks hidden by the gen filter", hiddenIds.length === 3 && hiddenIds.every((id) => afterSave.includes(id))
    && !afterSave.includes(drop) && afterSave.length === PICK.length - 1, JSON.stringify(afterSave));
  await setGens(gensOf);
  check(`Re-enable Gen ${hiddenGen}: hidden picks count again`, (await js(`panel("tr").title`)).includes(`Custom pool · ${PICK.length - 1}/`));
  await quickOpens(10);
  check("Opens after the gen round trip stay in the saved pool", (await js(`state.history.slice(0, 10).every(h => ${JSON.stringify(afterSave)}.includes(String(h.id)) && h.pool === "custom")`)));
  await setGens("all");

  // ---- 10. Reset to full case: tick lại tất cả, chỉ áp dụng khi Save; Cancel hoàn tác ----
  await openCC(); await pool("edit");
  await pool("reset");
  p = await js(`pe()`);
  const fullNow = await js(`dragonFull().length`);
  check("Reset: every Pokémon ticked, still editing, nothing saved yet", p.editing && p.ticked.length === fullNow
    && (await js(`localStorage.getItem("${DRAGON_KEY}")`)) !== null);
  await pool("cancel");
  check("Cancel after Reset: custom pool kept", (await js(`localStorage.getItem("${DRAGON_KEY}")`)) !== null && (await js(`pe().lines.some(l => l.startsWith("Custom pool"))`)));
  // Reset lúc đang ẩn một gen của tập: Save vẫn về cả hòm (không giữ các id đang ẩn)
  await closeAll(); await setGens(keepGens); await openCC();
  await pool("edit"); await pool("reset"); await pool("save");
  check("Reset + Save with a gen hidden: saved pool removed, full case", (await js(`localStorage.getItem("${DRAGON_KEY}")`)) === null
    && (await js(`pe().summary`)) === `${await js(`dragonFull().length`)} Pokémon` && !(await js(`pe().lines.some(l => l.startsWith("Custom pool"))`)));
  await closeAll(); await setGens("all"); await openCC();
  check("…and stays the full case after re-enabling the gen", (await js(`pe().summary`)) === `${fullNow} Pokémon`);
  await closeAll();
  check("Open button back to \"Open Dragon case\"", (await openLabel()) === "Open Dragon case");

  // ---- 11. Đang quay: Edit pool khóa ----
  await js(`state.spinning = true; openCustomContents(); 0`);
  p = await js(`pe()`);
  check("While spinning: Edit pool locked", p.editBtn.disabled && p.editBtn.why === "Wait for the spin to finish.");
  await closeAll(); await js(`state.spinning = false; renderCustomControls(); 0`);

  // ---- 12. Điện thoại 390px ----
  win.setContentSize(390, 800); await sleep(300);
  await openCC(); await pool("edit");
  const fit = await js(`(() => { const m = document.querySelector("#contents-modal .modal-inner"), s = document.getElementById("pool-save").getBoundingClientRect(), mr = m.getBoundingClientRect();
    return { ok: m.scrollWidth <= m.clientWidth && s.right <= mr.right && document.documentElement.scrollWidth <= 390, w: m.scrollWidth + "/" + m.clientWidth }; })()`);
  check("390px: editor fits, no horizontal scroll", fit.ok, fit.w);
  await shot("pool-edit-390.png");
  await js(`document.querySelector("#contents-modal .modal-inner").scrollTop = 700; 0`);
  await shot("pool-edit-390-scrolled.png");
  await closeAll();

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
