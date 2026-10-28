// Kiểm tra popup "View case contents" ở trang Custom (Type / Biome Roulette) và trang Case không đổi.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-contents"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
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
  const shot = async (name) => fs.writeFileSync(path.join(SHOTS, name), (await win.webContents.capturePage()).toPNG());
  const waitIdle = async (ms) => { for (let t = 0; t < ms; t += 50) { if (!(await js(`state.spinning`))) return true; await sleep(50); } return false; };
  const tab = (v) => js(`document.querySelector('.tab[data-view="${v}"]').click()`);
  const toMode = async (m) => { await tab("custom"); await js(`document.querySelector('.mode-btn[data-mode="${m}"]').click()`); await sleep(200); };
  const click = (action, quick) => js(`document.querySelector('.${quick ? "action-quick" : "action-main"}[data-action="${action}"]').click()`);
  const closeAll = () => js(`document.querySelectorAll("dialog[open]").forEach(d => d.close())`);
  const openCC = async () => { await js(`document.getElementById("custom-contents").click()`); await sleep(150); };
  const pick = async (key) => { await js(`(() => { const s = document.getElementById("contents-pick"); s.value = "${key}"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`); await sleep(150); };

  // Ảnh chụp popup: tiêu đề, dòng ghi chú, ô Pokémon theo từng bậc (kèm tỉ lệ và trạng thái sưu tập)
  const installHelpers = () => js(`
    window.popup = () => {
      const m = document.getElementById("contents-modal");
      const note = document.getElementById("contents-note");
      const pickEl = document.getElementById("contents-pick");
      return {
        open: m.open,
        heading: document.getElementById("contents-heading").textContent,
        summary: document.getElementById("contents-summary").textContent,
        noteHidden: note.hidden,
        lines: [...note.querySelectorAll(".contents-line")].map(l => l.textContent.replace(/\\s+/g, " ").trim()),
        pick: pickEl ? pickEl.value : null,
        options: pickEl ? [...pickEl.options].map(o => ({ v: o.value, t: o.textContent.replace(/\\s+/g, " ").trim() })) : [],
        sections: [...document.querySelectorAll("#contents-body .contents-group")].map(g => ({
          tier: [...g.classList].find(c => c.startsWith("r-")).slice(2),
          meta: g.querySelector(".contents-meta").textContent,
          tiles: [...g.querySelectorAll(".mini")].map(t => ({
            id: t.dataset.pokemon,
            odds: t.querySelector(".mini-odds") ? Number(t.querySelector(".mini-odds").dataset.odds) : null,
            oddsText: t.querySelector(".mini-odds") ? t.querySelector(".mini-odds").textContent : null,
            own: t.querySelector(".mini-own") ? t.querySelector(".mini-own").textContent : null,
            missing: t.classList.contains("is-unowned") || t.classList.contains("is-missing"),
          })),
        })),
      };
    };
    // So popup với hòm list (đúng mảng mà nút Open quay): cùng Pokémon trong từng bậc, tỉ lệ = dropOdds, đánh dấu sưu tập đúng
    window.matchCase = (list) => {
      const p = popup(), groups = groupByRarity(list), bad = [];
      const want = [...RARITIES].reverse().filter(r => groups[r.key].length).map(r => r.key);
      if (p.sections.map(s => s.tier).join() !== want.join()) bad.push("tiers " + p.sections.map(s => s.tier) + " vs " + want);
      for (const s of p.sections) {
        const ids = groups[s.tier].map(x => String(x.id));
        if (s.tiles.map(t => t.id).join() !== ids.join()) bad.push("ids " + s.tier);
        const rate = dropOdds({ rarity: s.tier, shiny: false }, groups).pokemon;
        for (const t of s.tiles) {
          if (t.odds !== rate || t.oddsText !== formatPct(rate * 100)) bad.push("odds " + t.id + " " + t.odds + " vs " + rate);
          const e = state.collection[t.id];
          if (t.missing !== !e || t.own !== (e ? "Owned" + (e.count > 1 ? " ×" + e.count : "") : "Missing")) bad.push("own " + t.id);
        }
      }
      const sum = p.sections.flatMap(s => s.tiles).reduce((a, t) => a + t.odds, 0);
      if (list.length && Math.abs(sum - 1) > 1e-9) bad.push("sum " + sum);
      if (p.summary !== list.length + " Pokémon") bad.push("summary " + p.summary);
      return { ok: bad.length === 0, bad: bad.slice(0, 5), n: list.length, sum };
    };
    0`);

  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await js(`localStorage.clear(); localStorage.setItem("pokeroll.selectedGens", "[1]");
    localStorage.setItem("pokeroll.collection", JSON.stringify({ 4: { count: 3, shiny: 0, first: 1 }, 6: { count: 1, shiny: 0, first: 1 }, 25: { count: 1, shiny: 0, first: 1 } }));`);
  await win.reload(); await sleep(400);
  await installHelpers();

  // ---- 1. Trang Case: popup như cũ ----
  await js(`document.getElementById("btn-contents").click()`); await sleep(150);
  let p = await js(`popup()`);
  const caseIds = await js(`[...RARITIES].reverse().flatMap(r => state.groups[r.key].map(x => String(x.id))).join()`);
  check("Case page: title \"Case contents\", 151 Pokémon, no note, no picker", p.open && p.heading === "Case contents" && p.summary === "151 Pokémon" && p.noteHidden && p.pick === null,
    `${p.heading} / ${p.summary}`);
  check("Case page: same Pokémon as before, no per-tile odds, no Owned/Missing marks",
    p.sections.flatMap(s => s.tiles.map(t => t.id)).join() === caseIds && p.sections.every(s => s.tiles.every(t => t.odds === null && t.own === null && !t.missing)));
  check("Case page: tier header still shows ≈ each", p.sections.every(s => /Pokémon · .*% total · ≈.*% each/.test(s.meta)));
  check("Case page: title text unchanged", (await js(`document.getElementById("contents-title").textContent.replace(/\\s+/g, " ").trim()`)) === "Case contents 151 Pokémon");
  await closeAll();

  // ---- 2. Type Roulette chưa quay ----
  await toMode("type-roulette");
  const btnState = () => js(`(() => { const b = document.getElementById("custom-contents"); return { hidden: b.hidden, disabled: b.disabled, visible: b.offsetParent !== null }; })()`);
  let b = await btnState();
  check("Type Roulette: View case contents shown next to the actions, enabled before any spin", !b.hidden && b.visible && !b.disabled);
  await openCC();
  p = await js(`popup()`);
  const firstType = await js(`roulette.types[0]`);
  check("Not spun yet: opens on the first type on the wheel with \"Spin the wheel to pick a case.\"",
    p.open && p.pick === firstType && p.heading === "Normal case" && p.lines[0] === "Spin the wheel to pick a case.", `${p.heading}; ${p.lines.join(" | ")}`);
  let m = await js(`matchCase(roulette.pools[roulette.types[0]])`);
  check("Not spun yet: list + odds match the Normal case", m.ok, m.bad.join("; ") || `${m.n} Pokémon, odds sum ${m.sum.toFixed(12)}`);
  check("Picker lists all 18 types in wheel order", p.options.map(o => o.v).join() === (await js(`TYPE_ORDER.join()`)));
  check("Previewing changes nothing (still not spun)", (await js(`roulette.selected === null && localStorage.getItem("pokeroll.custom.typeRoulette.type") === null`)));
  await shot("cc-type-unspun.png");
  await closeAll();

  // ---- 3. Đang quay: nút khóa ----
  await click("wheel"); await sleep(300);
  b = await btnState();
  check("While spinning the wheel: View case contents locked", b.disabled && (await js(`state.spinning`)));
  await waitIdle(TIMING.WHEEL_MS);
  check("After spin: unlocked", !(await btnState()).disabled);
  const T = await js(`roulette.selected`);

  // ---- 4. Hòm đang chọn ----
  await openCC();
  p = await js(`popup()`);
  const cap = (k) => k[0].toUpperCase() + k.slice(1);
  check(`Selected type: popup opens on ${T}, title "${cap(T)} case", no preview line`, p.pick === T && p.heading === `${cap(T)} case` && p.lines.length === 0
    && p.options.find(o => o.v === T).t.endsWith("· your case"), `${p.heading} ${p.summary}`);
  m = await js(`matchCase(roulette.pools[roulette.selected])`);
  check("Selected type: list = exactly what Open rolls (roulette.pools), odds = dropOdds, owned/missing marks", m.ok, m.bad.join("; ") || `${m.n} Pokémon`);
  const listIds = new Set(p.sections.flatMap(s => s.tiles.map(t => t.id)));
  await closeAll();
  // Mở thật 40 lần: mọi kết quả đều nằm trong danh sách popup
  const h0 = await js(`state.history.length`);
  let outside = 0;
  for (let i = 0; i < 40; i++) {
    await click("open", true); await waitIdle(3000); await closeAll();
    const h = await js(`state.history[0]`);
    if (!listIds.has(String(h.id)) || h.detail !== T) outside++;
  }
  check("40 quick opens: every drop is in the popup list", outside === 0 && (await js(`state.history.length`)) === h0 + 40, `${outside} outside`);
  await openCC();
  m = await js(`matchCase(roulette.pools[roulette.selected])`);
  check("After opening: Owned/Missing marks follow the collection", m.ok, m.bad.join("; "));
  await closeAll();

  // ---- 5. Xem nhóm khác: không đổi nhóm đang chọn ----
  const before = await js(`JSON.stringify({ sel: roulette.selected, saved: localStorage.getItem("pokeroll.custom.typeRoulette.type"), rot: roulette.rotation,
    hub: document.getElementById("tr-hub").textContent, odds: document.getElementById("tr-odds-title").textContent, open: document.querySelector('.action-main[data-action="open"]').textContent.trim(),
    kbd: document.getElementById("custom-kbd").textContent, winner: (document.querySelector("#tr-wheel .wheel-slice.is-winner") || {}).dataset?.type })`);
  await openCC();
  const other = await js(`roulette.types.find(t => t !== roulette.selected)`);
  await pick(other);
  p = await js(`popup()`);
  check(`Preview ${other}: title, list and odds switch to ${other}`, p.heading === `${cap(other)} case` && p.pick === other, p.heading);
  m = await js(`matchCase(roulette.pools["${other}"])`);
  check(`Preview ${other}: list = that type's wheel case, odds = its dropOdds`, m.ok, m.bad.join("; ") || `${m.n} Pokémon`);
  check("Preview: says your case stays the selected type", p.lines[0] === `Preview only. Your case on the wheel stays ${cap(T)}.`, p.lines[0]);
  check("Preview: picker keeps keyboard focus", await js(`document.activeElement === document.getElementById("contents-pick")`));
  // Space trong popup (ô chọn đang focus) không quay gì
  const hBefore = await js(`state.history.length`);
  await js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }))`); await sleep(200);
  check("Space with the contents popup open does nothing", !(await js(`state.spinning`)) && (await js(`state.history.length`)) === hBefore);
  // Tìm kiếm vẫn chạy
  await js(`(() => { const s = document.getElementById("contents-search"); s.value = "zzzz"; s.dispatchEvent(new Event("input")); })()`);
  check("Search still works in the Custom popup", await js(`!document.getElementById("contents-empty").hidden`));
  await pick(T);
  check("Switching back resets the search", (await js(`document.getElementById("contents-search").value`)) === "" && (await js(`document.getElementById("contents-empty").hidden`)));
  await pick(other);
  await shot("cc-type-preview.png");
  await closeAll();
  const after = await js(`JSON.stringify({ sel: roulette.selected, saved: localStorage.getItem("pokeroll.custom.typeRoulette.type"), rot: roulette.rotation,
    hub: document.getElementById("tr-hub").textContent, odds: document.getElementById("tr-odds-title").textContent, open: document.querySelector('.action-main[data-action="open"]').textContent.trim(),
    kbd: document.getElementById("custom-kbd").textContent, winner: (document.querySelector("#tr-wheel .wheel-slice.is-winner") || {}).dataset?.type })`);
  check("After previewing: selected type, saved type, wheel, odds panel, Open button unchanged", before === after, after);
  await click("open", true); await waitIdle(3000); await closeAll();
  check("Open after previewing still opens the selected type", (await js(`state.history[0].detail`)) === T);
  await openCC();
  check("Reopening the popup goes back to the selected type", (await js(`popup().pick`)) === T);
  await closeAll();

  // ---- 6. Nhóm không có trên bánh xe (Type): Gen 1 không có Dark ----
  await js(`localStorage.setItem("pokeroll.custom.gens", "[1]"); localStorage.setItem("pokeroll.custom.typeRoulette.type", '"fire"');
    localStorage.setItem("pokeroll.collection", JSON.stringify({ 4: { count: 3, shiny: 0, first: 1 }, 6: { count: 1, shiny: 0, first: 1 }, 25: { count: 1, shiny: 0, first: 1 } }))`); // bỏ các lượt mở ngẫu nhiên ở trên
  await win.reload(); await sleep(400); await installHelpers(); await toMode("type-roulette");
  await openCC();
  check("Gen 1 Fire: Charmander (×3), Charizard owned, Vulpix missing", await js(`(() => { const t = (id) => document.querySelector('#contents-body .mini[data-pokemon="' + id + '"]');
    return t(4).querySelector(".mini-own").textContent === "Owned ×3" && !t(4).classList.contains("is-unowned") && t(6).querySelector(".mini-own").textContent === "Owned"
      && t(37).classList.contains("is-unowned") && t(37).querySelector(".mini-own").textContent === "Missing"; })()`));
  await shot("cc-fire-owned.png");
  await pick("dark");
  p = await js(`popup()`);
  check("Gen 1, Dark: viewable, \"Not on the wheel\" + reason, 0 Pokémon",
    p.heading === "Dark case" && p.summary === "0 Pokémon" && p.sections.length === 0
    && p.lines.includes("Not on the wheel: no Pokémon in your selected generations.") && p.options.find(o => o.v === "dark").t === "Dark · not on the wheel", p.lines.join(" | "));
  check("…still on Fire", (await js(`roulette.selected`)) === "fire");
  await closeAll();

  // Hệ chỉ có hàng hiếm (giả lập như test Type Roulette: mọi Ghost thường đổi thành Red)
  await js(`state.pokemon.forEach(p => { if (p.types.includes("ghost") && ["blue", "purple", "pink"].includes(p.rarity)) p.rarity = "red"; }); updateCustomPool(); 0`);
  await openCC(); await pick("ghost");
  p = await js(`popup()`);
  const ghostAll = await js(`typePools(custom.pool).ghost.length`);
  check("Rare-only Ghost: viewable, \"Not on the wheel\" + rare-only reason",
    p.heading === "Ghost case" && p.lines.some(l => l.startsWith("Not on the wheel: only Red or Gold Pokémon")) && p.summary === `${ghostAll} Pokémon`, p.lines.join(" | "));
  m = await js(`matchCase(typePools(custom.pool).ghost)`);
  check("Rare-only Ghost: odds = dropOdds of that case (folded into Red)", m.ok && (await js(`popup().sections.every(s => s.tier === "red" || s.tier === "gold")`)), m.bad.join("; ") || `${m.n} Pokémon`);
  await closeAll();

  // ---- 7. Biome Roulette ----
  await js(`localStorage.setItem("pokeroll.custom.gens", "[9]"); localStorage.removeItem("pokeroll.custom.biomeRoulette.biome")`);
  await win.reload(); await sleep(400); await installHelpers(); await toMode("biome-roulette");
  b = await btnState();
  check("Biome Roulette: button shown and enabled before any spin", !b.hidden && !b.disabled);
  await openCC();
  p = await js(`popup()`);
  const firstBiome = await js(`biome.types[0]`);
  check("Biome not spun: first biome on the wheel + \"Spin the wheel to pick a case.\"", p.pick === firstBiome && p.lines[0] === "Spin the wheel to pick a case.", `${p.heading}; ${p.lines[0]}`);
  check("Picker lists all 18 biome groups", p.options.length === 18);
  await closeAll();
  await click("biome", true); await waitIdle(3000);
  const B = await js(`biome.selected`), BN = await js(`biomeInfo(biome.selected).name`);
  await openCC();
  p = await js(`popup()`);
  m = await js(`matchCase(biome.pools[biome.selected])`);
  check(`Selected biome ${BN}: title "${BN} case", list = what Open rolls, odds = dropOdds`, p.heading === `${BN} case` && m.ok, m.bad.join("; ") || `${m.n} Pokémon`);
  const tags = await js(`"Cobbleverse biomes " + biomeInfo(biome.selected).tags.join(", ")`);
  check("Biome popup: \"Cobbleverse biomes …\" line, same as the odds panel", p.lines.includes(tags)
    && tags === (await js(`document.getElementById("br-tags").textContent.replace(/\\s+/g, " ").trim()`)), tags);
  await pick("legendary");
  p = await js(`popup()`);
  check("Gen 9, Legendary: rare-only, \"Not on the wheel\" + reason, 4 Gold, each 25%",
    p.heading === "Legendary case" && p.summary === "4 Pokémon" && p.lines.some(l => l.startsWith("Not on the wheel: only Red or Gold"))
    && p.sections.length === 1 && p.sections[0].tier === "gold" && p.sections[0].tiles.every(t => t.oddsText === "25.00%"), p.lines.join(" | "));
  check("…with its Cobbleverse biomes line", p.lines.some(l => l.startsWith("Cobbleverse biomes Custom Spawn")));
  await pick("end");
  p = await js(`popup()`);
  check("Gen 9, End: 0 Pokémon, \"Not on the wheel\" + no-Pokémon reason", p.summary === "0 Pokémon" && p.lines.includes("Not on the wheel: no Pokémon in your selected generations."));
  await shot("cc-biome-end.png");
  await pick(B);
  await shot("cc-biome.png");
  await closeAll();
  check("Biome kept after previewing", (await js(`biome.selected === "${B}" && JSON.parse(localStorage.getItem("pokeroll.custom.biomeRoulette.biome")) === "${B}"`)));
  await click("open", true); await waitIdle(3000); await closeAll();
  check("Biome Open after previewing opens the selected biome", (await js(`state.history[0].detail`)) === B);

  // ---- 8. Không chọn gen nào: nút khóa; chế độ không khai báo contents(): không có nút ----
  await js(`document.getElementById("custom-none").click()`);
  check("No gens: View case contents locked", (await btnState()).disabled);
  await js(`document.getElementById("custom-all").click()`);
  await js(`registerCustomMode({ key: "plain", name: "Plain", desc: "No contents()", mount(s) { s.innerHTML = "<p>plain</p>"; }, async spin() {} }); 0`);
  await js(`document.querySelector('.mode-btn[data-mode="plain"]').click()`); await sleep(100);
  check("Mode without contents(): no View case contents button", (await btnState()).hidden);
  await toMode("type-roulette");
  check("Back to Type Roulette: button shown again", !(await btnState()).hidden);

  // ---- 9. Điện thoại 390px: popup không tràn ngang ----
  win.setContentSize(390, 800); await sleep(400);
  await openCC(); await pick("water");
  const fit = await js(`(() => { const m = document.querySelector("#contents-modal .modal-inner"), s = document.getElementById("contents-pick");
    const mr = m.getBoundingClientRect(), sr = s.getBoundingClientRect();
    return { ok: m.scrollWidth <= m.clientWidth && sr.right <= mr.right && document.documentElement.scrollWidth <= 390, w: m.scrollWidth + "/" + m.clientWidth }; })()`);
  check("390px: popup and picker fit, no horizontal scroll", fit.ok, fit.w);
  await shot("cc-390.png");
  await closeAll();

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
