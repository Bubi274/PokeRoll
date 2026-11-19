// Pity trong app: thanh "Purple or better x/5" và "Gold x/10" cạnh nút Open (trang Case và từng chế độ Custom, Minigame thì
// không có), mỗi chế độ một bộ đếm lưu ở localStorage, lượt pity có khung riêng trong popup và nhãn "Pity" trong lịch sử,
// hòm thiếu Gold thì bảng tỉ lệ ghi rõ pity cho bậc nào, và Clear data đưa mọi bộ đếm về 0.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-pity"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

process.on("unhandledRejection", (e) => { console.log("FAIL  test crashed: " + e); app.exit(1); });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1300, height: 900, show: false, webPreferences: { offscreen: true } });
  const errors = [];
  win.webContents.on("console-message", (e, level, msg) => {
    const lv = e.level !== undefined ? e.level : level, text = e.message !== undefined ? e.message : msg;
    if (lv === "error" || lv === 3) errors.push(text);
  });
  const js = (code) => win.webContents.executeJavaScript(code);
  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await js("localStorage.clear()");
  await win.reload(); await sleep(500);

  // Chữ của hai thanh trong el (id), vd. ["Purple or better 0/5", "Gold 0/10"], kèm thanh nào đang "is-due"
  const meters = (id) => js(`(() => { const el = document.getElementById("${id}");
    return { hidden: el.hidden || !el.getClientRects().length,
      text: [...el.querySelectorAll(".pity-meter")].map((m) => m.querySelector(".pity-label").textContent + " " + m.querySelector(".pity-count").textContent),
      due: [...el.querySelectorAll(".pity-meter.is-due")].map((m) => m.dataset.pity),
      on: [...el.querySelectorAll(".pity-meter")].map((m) => m.querySelectorAll(".pity-segs i.is-on").length) }; })()`);
  const setPity = (mode, purple, gold) => js(`state.pity[${JSON.stringify(mode)}] = { purple: ${purple}, gold: ${gold} }; savePity(); renderPityMeters()`);
  const popup = () => js(`(() => { const b = document.getElementById("result-body");
    const h = state.history[0];
    return { open: document.getElementById("result-modal").open, text: b.textContent.replace(/\\s+/g, " "),
      pityBlock: Boolean(b.querySelector(".odds.is-pity")), rarity: h.rarity, pity: h.pity || null, mode: h.mode || null }; })()`);
  const closePopup = () => js(`document.getElementById("result-modal").close()`);
  const openCase = () => js(`spin({ quick: true }).then(() => 1)`);
  const openCustom = () => js(`runCustomAction("open", { quick: true }).then(() => 1)`);

  // 1. Thanh lúc đầu
  let m = await meters("case-pity");
  check("Case page: two pity bars at 0", !m.hidden && same(m.text, ["Purple or better 0/5", "Gold 0/10"]) && same(m.on, [0, 0]), JSON.stringify(m));
  check("Case page: bars sit right under the Open case button", await js(`document.getElementById("btn-spin").nextElementSibling.id === "case-pity"`));
  check("Case page: pity explained under Current case", await js(`/Pity: the 5th open in a row without Purple or better/.test(document.getElementById("pool-sub").textContent)`));

  // 2. Một lượt thường: bộ đếm đi đúng một bước (các thẻ phụ trên dải không tính)
  await setPity("case", 0, 0);
  await openCase();
  let p = await popup();
  const c1 = await js(`state.pity.case`);
  const step = p.rarity === "gold" ? { purple: 0, gold: 0 } : p.rarity === "blue" ? { purple: 1, gold: 1 } : { purple: 0, gold: 1 };
  check("Normal open: the counter moves exactly one step", same(c1, step), `${p.rarity} → ${JSON.stringify(c1)}`);
  check("Normal open: popup shows the usual odds, no pity block", p.open && !p.pityBlock && /Odds of pulling/.test(p.text) && !/Pity drop/.test(p.text));
  check("Normal open: not tagged as pity", p.pity === null);
  await closePopup();
  m = await meters("case-pity");
  check("Bars show the counter after the open", same(m.text, [`Purple or better ${step.purple}/5`, `Gold ${step.gold}/10`]), m.text.join(", "));

  // 3. Pity tím (đọc lại từ localStorage sau khi tải lại trang)
  await js(`localStorage.setItem("pokeroll.pity", JSON.stringify({ case: { purple: 4, gold: 2 } }))`);
  await win.reload(); await sleep(500);
  m = await meters("case-pity");
  check("Counter is read back after reload, 4/5 is marked due", same(m.text, ["Purple or better 4/5", "Gold 2/10"]) && same(m.due, ["purple"]) && same(m.on, [4, 2]), JSON.stringify(m));
  await openCase();
  p = await popup();
  check("5th open: Purple or better", ["purple", "pink", "red", "gold"].includes(p.rarity), p.rarity);
  check("5th open: popup says the pity line", p.pityBlock && p.text.includes("Pity drop: guaranteed Purple or better after 5 opens") && !/Odds of pulling/.test(p.text));
  check("5th open: history entry tagged pity = purple", p.pity === "purple");
  check("5th open: Purple counter back to 0, saved", same(await js(`JSON.parse(localStorage.getItem("pokeroll.pity")).case.purple`), 0));
  check("Recent drops shows a Pity tag on that drop", await js(`Boolean(document.querySelector("#recent-row li:first-child .pity-tag"))`));
  await closePopup();

  // 4. Pity vàng
  await setPity("case", 1, 9);
  check("Gold 9/10 is marked due", same((await meters("case-pity")).due, ["gold"]));
  await openCase();
  p = await popup();
  check("10th open: Gold", p.rarity === "gold", p.rarity);
  check("10th open: popup says the Gold pity line", p.text.includes("Pity drop: guaranteed Gold after 10 opens"));
  check("10th open: both counters reset", same(await js(`state.pity.case`), { purple: 0, gold: 0 }));
  await closePopup();
  await js(`showView("collection")`); await sleep(200);
  check("Roll history shows the Pity tags", await js(`document.querySelectorAll("#history-list .pity-tag").length`) === 2);

  // 5. Custom: mỗi chế độ một bộ đếm; Minigame không có thanh
  await js(`showView("custom"); selectCustomMode("type-roulette")`); await sleep(200);
  m = await meters("custom-pity");
  check("Type Roulette: its own bars under the buttons", !m.hidden && same(m.text, ["Purple or better 0/5", "Gold 0/10"]), JSON.stringify(m));
  check("Type Roulette: pity rule in How it works", await js(`[...document.querySelectorAll("#mode-rule-list li")].some((li) => /guaranteed Gold/.test(li.textContent))`));
  await js(`document.querySelector('.action-quick[data-action="wheel"]').click()`); await sleep(300);
  const caseBefore = await js(`state.pity.case`);
  await setPity("type-roulette", 0, 9);
  await openCustom();
  p = await popup();
  check("Type Roulette pity: tagged gold, uses the Type Roulette counter", p.pity === "gold" && p.mode === "type-roulette");
  check("Type Roulette pity: Case counter unchanged", same(await js(`state.pity.case`), caseBefore));
  await closePopup();
  await js(`selectCustomMode("minigame")`); await sleep(200);
  check("Minigame Case: no pity bars", (await meters("custom-pity")).hidden);
  await js(`selectCustomMode("biome-roulette")`); await sleep(200);
  check("Biome Roulette: bars back, with its own count", same((await meters("custom-pity")).text, ["Purple or better 0/5", "Gold 0/10"]));

  // 6. Hòm thiếu Gold: Bug ở Gen 1 (Scyther, Pinsir là Pink cao nhất)
  await js(`selectCustomMode("type-roulette"); custom.gens = new Set([1]); syncCheckboxes(document.getElementById("custom-gen-grid"), custom.gens);
    onCustomGensChanged(); roulette.selected = "bug"; refreshRoulette()`); await sleep(300);
  const note = await js(`(() => { const li = document.querySelector("#tr-odds-list .odds-pity"); return li && !li.hidden ? li.textContent : ""; })()`);
  check("Odds table explains the Gold pity in a case with no Gold", note === "No Gold in this case: Gold pity (10th open) gives Pink instead.", note);
  check("Case page odds table (all gens) has no pity note", await js(`document.querySelector("#rarity-list .odds-pity").hidden`));
  await setPity("type-roulette", 2, 9);
  await openCustom();
  p = await popup();
  check("Gold pity with no Gold: gives Pink (highest tier there)", p.rarity === "pink" && p.pity === "gold", p.rarity);
  check("Gold pity with no Gold: popup explains it", p.text.includes("This case has no Gold Pokémon, so it gave its highest tier: Pink."));
  check("Gold pity with no Gold: both counters reset", same(await js(`state.pity["type-roulette"]`), { purple: 0, gold: 0 }));
  await closePopup();

  // 7. Clear data
  await setPity("case", 3, 7);
  await js(`window.__msg = ""; window.confirm = (msg) => { window.__msg = msg; return true; }; clearData()`);
  check("Clear data warns that pity counters are deleted", /pity counters/.test(await js("window.__msg")));
  const saved = await js(`JSON.parse(localStorage.getItem("pokeroll.pity"))`);
  check("Clear data: every counter back to 0, saved", Object.values(saved).every((c) => same(c, { purple: 0, gold: 0 })) && Object.keys(saved).length === 4);
  check("Clear data: bars show 0", same((await meters("case-pity")).text, ["Purple or better 0/5", "Gold 0/10"]));

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
