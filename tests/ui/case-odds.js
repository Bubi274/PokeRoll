// Kiểm tra bảng "Current case" ở trang Case: % hiển thị là tỉ lệ thật (effectiveChances, đã tính hạ bậc),
// cộng lại bằng 100%, thanh nền dài theo tỉ lệ thật; tỉ lệ bậc trong popup kết quả; "No drops yet".
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-case-odds"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

process.on("unhandledRejection", (e) => { console.log("FAIL  test crashed: " + e); app.exit(1); });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1300, height: 900, show: false, webPreferences: { offscreen: true } });
  const errors = [];
  win.webContents.on("console-message", (e, level, msg) => {
    const lv = e.level !== undefined ? e.level : level, text = e.message !== undefined ? e.message : msg;
    if (lv === "error" || lv === 3) errors.push(text);
  });
  const js = (code) => win.webContents.executeJavaScript(code);
  const shot = async (name) => fs.writeFileSync(path.join(SHOTS, name), (await win.webContents.capturePage()).toPNG());

  await win.loadFile(PAGE);
  await js(`localStorage.clear()`); await win.reload(); await sleep(400);

  // ---- 1. Recent drops chưa có lượt nào ----
  check("Recent drops empty: \"No drops yet\"", (await js(`document.querySelector("#recent-row .recent-empty").textContent`)) === "No drops yet");

  // Đọc một bảng tỉ lệ (Case hoặc panel Custom) và so với effectiveChances của hòm groups
  await js(`
    window.readTable = (sel = "#rarity-list") => [...document.querySelectorAll(sel + " .rarity-row")].map(li => ({
      tier: [...li.classList].find(c => c.startsWith("r-")).slice(2),
      pct: li.querySelector(".rarity-chance").textContent.trim(),
      count: li.querySelector(".rarity-count").textContent.trim(),
      p: Number(li.style.getPropertyValue("--p")),
      bar: getComputedStyle(li).backgroundImage !== "none",
      rule: (li.querySelector(".rarity-rule") || {}).textContent || null,
      fold: (li.querySelector(".rarity-fold") || {}).textContent || null,
      empty: li.classList.contains("is-empty"),
      dim: Number(getComputedStyle(li.querySelector(".rarity-chance")).opacity) < 1,
    }));
    window.hintOf = (sel = "#rarity-list") => (document.querySelector(sel + " .odds-hint") || {}).textContent || null;
    window.checkTable = (sel = "#rarity-list", groups = state.groups, rules = true) => {
      const rows = readTable(sel), eff = effectiveChances(groups), bad = [];
      const fmt = (x) => x === 0 ? "0%" : x.toFixed(2) + "%";
      if (rows.map(x => x.tier).join() !== "gold,red,pink,purple,blue") bad.push("order " + rows.map(x => x.tier));
      for (const r of RARITIES) {
        const row = rows.find(x => x.tier === r.key), n = groups[r.key].length;
        if (row.pct !== fmt(eff[r.key])) bad.push(r.name + " shows " + row.pct + " ≠ " + fmt(eff[r.key]));
        if (Math.abs(row.p - eff[r.key]) > 1e-9) bad.push(r.name + " bar " + row.p);
        if (row.count !== String(n)) bad.push(r.name + " count " + row.count);
        if (row.rule !== (rules ? r.rule : null)) bad.push(r.name + " rule line " + row.rule);
        // Bậc trống: 0%, chữ mờ, không có thanh nền
        if (n === 0 && (row.pct !== "0%" || !row.empty || !row.dim || row.bar)) bad.push(r.name + " empty-tier display");
        if (n > 0 && (row.empty || !row.bar)) bad.push(r.name + " non-empty tier looks empty");
        // Bậc nhận thêm: "base X% + Y% from Z"
        const from = RARITIES.filter(t => t.key !== r.key && resolveRarity(t.key, groups) === r.key);
        const want = n > 0 && from.length ? "base " + fmt(r.chance) + " + " + from.map(t => fmt(t.chance) + " from " + t.name).join(" + ") : null;
        if (row.fold !== want) bad.push(r.name + " fold " + row.fold + " ≠ " + want);
      }
      if (hintOf(sel)) bad.push("hint shown for a non-empty case");
      const sum = rows.reduce((a, x) => a + parseFloat(x.pct), 0);
      if (Math.abs(sum - 100) > 0.001) bad.push("sum " + sum.toFixed(3));
      return { ok: bad.length === 0, bad: bad.slice(0, 4), shown: rows.map(x => x.tier[0].toUpperCase() + x.tier[1] + " " + x.pct + (x.fold ? " (" + x.fold + ")" : "")).join(", "), sum };
    };
    // Chọn đúng bộ gen bằng cách bấm None rồi bấm từng ô (như người dùng)
    window.pickGens = (keys) => {
      document.getElementById("btn-none").click();
      for (const k of keys) document.querySelector('#gen-grid input[value="' + k + '"]').click();
    };
    0`);

  // ---- 2. Các bộ gen tiêu biểu, chọn bằng cách bấm ----
  const NAMED = [["Gen 6 only", [6]], ["Gen 1 only", [1]], ["Special only", ["kazeran"]], ["Gen 9 only", [9]], ["Gen 2 + Special", [2, "kazeran"]]];
  for (const [label, keys] of NAMED) {
    await js(`pickGens(${JSON.stringify(keys)})`); // không chờ: bảng phải cập nhật ngay khi đổi gen
    const r = await js(`checkTable()`);
    check(`${label}: Gold→Blue, % = effectiveChances, bars, BST rules, sum 100%`, r.ok, r.ok ? r.shown : r.bad.join("; "));
  }
  await js(`document.getElementById("btn-all").click()`);
  let r = await js(`checkTable()`);
  check("All gens + Special: % = effectiveChances, sum 100%", r.ok && r.shown === "Go 0.26%, Re 0.64%, Pi 3.20%, Pu 15.98%, Bl 79.92%", r.ok ? r.shown : r.bad.join("; "));

  // Ví dụ: chỉ Gen 6 → Red 0%, Pink 3.84%
  await js(`pickGens([6])`);
  const g6 = await js(`readTable()`);
  const red = g6.find((x) => x.tier === "red"), pink = g6.find((x) => x.tier === "pink");
  check("Gen 6: Red 0%, dimmed, no bar", red.count === "0" && red.pct === "0%" && red.empty && red.dim && !red.bar, JSON.stringify(red));
  check("Gen 6: Pink 3.84% with \"base 3.20% + 0.64% from Red\"", pink.pct === "3.84%" && pink.fold === "base 3.20% + 0.64% from Red" && Math.abs(pink.p - 3.84) < 1e-9, JSON.stringify(pink));
  await js(`document.querySelector(".panel-pool").scrollIntoView()`); await sleep(200);
  await shot("case-odds-gen6.png");

  // ---- 3. Mọi tổ hợp gen (1023 bộ khác rỗng) ----
  const all = await js(`(() => {
    const keys = allSourceKeys(); let bad = [], n = 0;
    for (let mask = 1; mask < (1 << keys.length); mask++) {
      state.selectedGens.clear(); // giữ nguyên Set (các ô chọn gen giữ tham chiếu tới nó)
      keys.filter((_, i) => mask & (1 << i)).forEach((k) => state.selectedGens.add(k));
      syncCheckboxes(); onSelectionChanged(); n++;
      const r = checkTable();
      if (!r.ok) bad.push([...state.selectedGens].join("+") + ": " + r.bad.join("; "));
    }
    return { n, bad: bad.slice(0, 3), nbad: bad.length };
  })()`);
  check(`Every gen combination (${all.n}): table % = effectiveChances and sums to 100%`, all.nbad === 0, all.nbad ? all.bad.join(" | ") : "");

  // ---- 4. Không chọn gen: "—" thay cho số và %, không có thanh nền, dòng nhắc chọn gen ----
  await js(`document.getElementById("btn-none").click()`);
  const none = await js(`readTable()`);
  check("None selected: every row shows \"—\" for count and %, no base odds",
    none.length === 5 && none.every((x) => x.pct === "—" && x.count === "—" && x.p === 0), none.map((x) => x.count + "/" + x.pct).join(" "));
  check("None selected: bars empty, no fold lines", none.every((x) => !x.bar && !x.fold));
  check("None selected: \"Select at least one generation to see the odds.\"", (await js(`hintOf()`)) === "Select at least one generation to see the odds.");
  await js(`document.querySelector(".panel-pool").scrollIntoView()`); await sleep(200);
  await shot("case-odds-none.png");
  await js(`document.getElementById("gen-grid").querySelector('input[value="3"]').click()`);
  check("Ticking a gen again: odds back immediately, hint gone", (await js(`checkTable()`)).ok && !(await js(`hintOf()`)));

  // ---- 4b. Không còn tỉ lệ viết cứng trong HTML; câu shiny lấy từ SHINY_CHANCE ----
  const html = fs.readFileSync(PAGE, "utf8");
  check("index.html has no hard-coded odds", !/79\.92|15\.98|3\.20|0\.64|0\.26|1 in 100/.test(html));
  check("Case sub line: shiny odds from SHINY_CHANCE", (await js(`document.getElementById("pool-sub").textContent`)) === `Each open rolls a tier by these odds. Shiny is rolled separately: 1 in ${await js(`oneIn(SHINY_CHANCE)`)}.`);

  // ---- 4c. Panel tỉ lệ Type / Biome Roulette: cùng bảng, không có dòng BST ----
  await js(`document.getElementById("custom-none").click(); document.querySelector('#custom-gen-grid input[value="6"]').click(); 0`);
  await js(`document.querySelector('.tab[data-view="custom"]').click(); document.querySelector('.mode-btn[data-mode="type-roulette"]').click(); 0`); await sleep(200);
  // Chọn một hệ có bậc Red trống ở Gen 6 để thấy dòng "base … from Red"
  const typeKey = await js(`roulette.types.find(t => groupByRarity(roulette.pools[t]).red.length === 0 && groupByRarity(roulette.pools[t]).pink.length > 0)`);
  await js(`selectType("${typeKey}"); refreshRoulette(); 0`);
  r = await js(`checkTable("#tr-odds-list", groupByRarity(roulette.pools[roulette.selected]), false)`);
  check(`Type Roulette (${typeKey}, Gen 6): same table, Gold→Blue, no BST line, fold line`, r.ok && /from Red/.test(r.shown), r.ok ? r.shown : r.bad.join("; "));
  check("Type Roulette panel uses the compact style", await js(`document.getElementById("tr-odds-list").classList.contains("is-compact")`));
  await js(`document.querySelector('.mode-btn[data-mode="biome-roulette"]').click(); 0`); await sleep(200);
  const biomeKey = await js(`biome.types.find(k => groupByRarity(biome.pools[k]).red.length === 0 && groupByRarity(biome.pools[k]).pink.length > 0)`);
  await js(`selectBiome("${biomeKey}"); refreshBiome(); 0`);
  r = await js(`checkTable("#br-odds-list", groupByRarity(biome.pools[biome.selected]), false)`);
  check(`Biome Roulette (${biomeKey}, Gen 6): same table, Gold→Blue, no BST line, fold line`, r.ok && /from Red/.test(r.shown), r.ok ? r.shown : r.bad.join("; "));
  await js(`document.getElementById("br-odds-list").scrollIntoView()`); await sleep(200);
  await shot("case-odds-biome.png");
  await js(`document.querySelector('.tab[data-view="case"]').click(); 0`); await sleep(200);

  // ---- 5. Popup kết quả: tỉ lệ bậc trong hòm lúc quay ----
  await js(`pickGens([6])`);
  const tierLine = () => js(`document.querySelector("#result-body .tier-odds").textContent.replace(/\\s+/g, " ").trim()`);
  await js(`showResultModal({ pokemon: state.groups.pink[0], rarity: "pink", shiny: false }, { isNew: true, count: 1, groups: state.groups })`);
  let t = await tierLine();
  check("Result popup (Gen 6, Pink): \"3.84% tier odds in this case\" + base breakdown", t === "3.84% tier odds in this case base 3.20% + 0.64% from Red", t);
  check("Result popup (Gen 6, Pink): \"1 in N\" still from dropOdds", (await js(`document.querySelector("#result-body .odds-value").textContent`))
    === `1 in ${await js(`oneIn(dropOdds({ rarity: "pink", shiny: false }, state.groups).pokemon)`)}`);
  await sleep(700); await shot("case-odds-result.png");
  await js(`document.getElementById("result-modal").close()`);
  await js(`showResultModal({ pokemon: state.groups.blue[0], rarity: "blue", shiny: false }, { isNew: true, count: 1, groups: state.groups })`);
  t = await tierLine();
  check("Result popup (Gen 6, Blue): 79.92%, no breakdown", t === "79.92% tier odds in this case", t);
  await js(`document.getElementById("result-modal").close()`);
  // Thật: mở hòm Gen 6 nhiều lần, popup luôn khớp tỉ lệ thật của bậc ra được
  let wrong = 0;
  for (let i = 0; i < 40; i++) {
    await js(`document.getElementById("btn-quick").click()`); await sleep(60);
    const ok = await js(`(() => { const h = state.history[0]; const want = (effectiveChances(state.groups)[h.rarity]).toFixed(2) + "%";
      return document.querySelector("#result-body .tier-odds b").textContent === want; })()`);
    if (!ok) wrong++;
    await js(`document.getElementById("result-modal").close()`);
  }
  check("40 real Gen 6 opens: result popup tier odds = effectiveChances of the dropped tier", wrong === 0, `${wrong} wrong`);

  // Popup chi tiết (không gắn với hòm nào): ghi rõ là tỉ lệ gốc
  await js(`openPokemonDetail(state.byId.get(149))`); await sleep(100);
  t = await js(`document.querySelector("#detail-body .tier-odds").textContent.replace(/\\s+/g, " ").trim()`);
  check("Pokémon detail popup: labelled \"base tier odds\"", t === "3.20% base tier odds", t);
  await js(`document.getElementById("detail-modal").close()`);

  // ---- 6. Điện thoại 390px: dòng "base … from …" không làm tràn ngang ----
  await js(`pickGens([6])`);
  win.setContentSize(390, 900); await sleep(400);
  const fit = await js(`(() => { const d = document.documentElement; return d.scrollWidth <= d.clientWidth; })()`);
  check("390px: odds table with breakdown fits, no horizontal scroll", fit);
  await js(`document.querySelector(".panel-pool").scrollIntoView()`); await sleep(200);
  await shot("case-odds-390.png");

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
