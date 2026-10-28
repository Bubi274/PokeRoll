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

  // Đọc bảng và so với effectiveChances của hòm hiện tại
  await js(`
    window.readTable = () => [...document.querySelectorAll("#rarity-list .rarity-row")].map(li => ({
      tier: [...li.classList].find(c => c.startsWith("r-")).slice(2),
      pct: li.querySelector(".rarity-pct").textContent,
      p: Number(li.style.getPropertyValue("--p")),
      base: (li.querySelector(".rarity-base") || {}).textContent || null,
      fold: (li.querySelector(".rarity-fold") || {}).textContent || null,
      note: !!li.querySelector(".rarity-note"),
      count: Number(li.querySelector(".rarity-count").textContent),
    }));
    window.checkTable = () => {
      const rows = readTable(), eff = effectiveChances(state.groups), bad = [];
      const fmt = (x) => x === 0 ? "0%" : x.toFixed(2) + "%";
      for (const r of RARITIES) {
        const row = rows.find(x => x.tier === r.key), n = state.groups[r.key].length;
        if (row.pct !== fmt(eff[r.key])) bad.push(r.name + " shows " + row.pct + " ≠ " + fmt(eff[r.key]));
        if (Math.abs(row.p - eff[r.key]) > 1e-9) bad.push(r.name + " bar " + row.p);
        if (row.count !== n) bad.push(r.name + " count");
        // Bậc trống: 0%, tỉ lệ gốc gạch ngang, giữ dòng "None in this case"
        if (n === 0 && (row.pct !== "0%" || row.base !== fmt(r.chance) || !row.note)) bad.push(r.name + " empty-tier display");
        if (n > 0 && (row.base || row.note)) bad.push(r.name + " has empty-tier marks");
        // Bậc nhận thêm: "base X% + Y% from Z"
        const from = RARITIES.filter(t => t.key !== r.key && resolveRarity(t.key, state.groups) === r.key);
        const want = n > 0 && from.length ? "base " + fmt(r.chance) + " + " + from.map(t => fmt(t.chance) + " from " + t.name).join(" + ") : null;
        if (row.fold !== want) bad.push(r.name + " fold " + row.fold + " ≠ " + want);
      }
      const sum = rows.reduce((a, x) => a + parseFloat(x.pct), 0);
      if (Math.abs(sum - 100) > 0.001) bad.push("sum " + sum.toFixed(3));
      return { ok: bad.length === 0, bad: bad.slice(0, 4), shown: rows.map(x => x.tier[0].toUpperCase() + " " + x.pct + (x.fold ? " (" + x.fold + ")" : "")).join(", "), sum };
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
    check(`${label}: table % = effectiveChances, bars match, sum 100%`, r.ok, r.ok ? r.shown : r.bad.join("; "));
  }
  await js(`document.getElementById("btn-all").click()`);
  let r = await js(`checkTable()`);
  check("All gens + Special: table % = effectiveChances, sum 100%", r.ok && r.shown === "B 79.92%, P 15.98%, P 3.20%, R 0.64%, G 0.26%", r.ok ? r.shown : r.bad.join("; "));

  // Ví dụ trong yêu cầu: chỉ Gen 6 → Red 0%, Pink 3.84%
  await js(`pickGens([6])`);
  const g6 = await js(`readTable()`);
  const red = g6.find((x) => x.tier === "red"), pink = g6.find((x) => x.tier === "pink");
  check("Gen 6: Red 0% with struck 0.64% and \"None in this case\"", red.count === 0 && red.pct === "0%" && red.base === "0.64%" && red.note, JSON.stringify(red));
  check("Gen 6: Pink 3.84% with \"base 3.20% + 0.64% from Red\"", pink.pct === "3.84%" && pink.fold === "base 3.20% + 0.64% from Red" && Math.abs(pink.p - 3.84) < 1e-9, JSON.stringify(pink));
  check("Gen 6: struck base is a <s> element", await js(`document.querySelector("#rarity-list .r-red .rarity-base").tagName === "S"`));
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

  // ---- 4. Không chọn gen: hòm rỗng, hiện tỉ lệ gốc, không có dấu hạ bậc ----
  await js(`document.getElementById("btn-none").click()`);
  const none = await js(`readTable()`);
  check("None selected: base odds shown, no fold or empty-tier marks", none.map((x) => x.pct).join() === "79.92%,15.98%,3.20%,0.64%,0.26%"
    && none.every((x) => !x.fold && !x.base && !x.note));

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
