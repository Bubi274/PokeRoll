// Tab Challenge: quay đội 6 ô (mỗi lượt vào ô kế tiếp, không xoá từng ô), nguồn Case / Roulette / Minigame dùng bộ đếm pity
// của chế độ tương ứng, Legendary / Mythical hỏi Keep / Reroll (còn nhớ sau khi tải lại), mã TW1 đúng định dạng, reroll bằng
// mã TWR1 (chỉ mã của đội đang dùng, không dùng lại được), nhập mã TW1, Start over, Clear data, lịch sử gắn nhãn Challenge.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-challenge"));
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

  const ui = () => js(`(() => ({
    label: document.querySelector("#ch-roll .action-label").textContent,
    disabled: document.getElementById("ch-roll").disabled,
    hint: document.getElementById("ch-hint").textContent,
    slots: [...document.querySelectorAll("#ch-team .ch-slot")].map((li) => li.classList.contains("is-empty") ? "-" : li.querySelector(".mini-name").textContent),
    pityHidden: document.getElementById("ch-pity").hidden,
    pity: [...document.querySelectorAll("#ch-pity .pity-count")].map((x) => x.textContent),
    result: document.getElementById("result-modal").open,
    legend: document.getElementById("ch-legend-modal").open,
    msg: document.getElementById("ch-msg").textContent,
    msgKind: document.getElementById("ch-msg").className,
    code: challenge.code,
  }))()`);
  const roll = () => js(`runChallengeRoll({ quick: true }).then(() => 1)`);
  const closeAll = () => js(`for (const d of document.querySelectorAll("dialog[open]")) d.close()`);
  // Quay tới khi đầy các ô (Legendary thì giữ)
  const fill = () => js(`(async () => {
    for (let n = 0; n < 40 && (nextChallengeIndex() !== null || challenge.pending); n++) {
      if (challenge.pending) { keepChallengeLegend(); continue; }
      await runChallengeRoll({ quick: true });
      document.getElementById("result-modal").close();
    }
    document.getElementById("ch-legend-modal").close();
    return challenge.code;
  })()`);

  // 1. Tab và trạng thái đầu
  check("Challenge tab is in the tab bar", await js(`Boolean(document.querySelector('.tab[data-view="challenge"]'))`));
  await js(`document.querySelector('.tab[data-view="challenge"]').click()`); await sleep(300);
  let u = await ui();
  check("Empty team: 6 empty slots, Roll slot 1 · Case", same(u.slots, ["-", "-", "-", "-", "-", "-"]) && u.label === "Roll slot 1 · Case" && !u.disabled, JSON.stringify(u));
  check("No Remove button on slots", await js(`!document.querySelector("#ch-team [data-remove], #ch-team .ch-remove")`));
  check("Case source: Case pity bars shown", !u.pityHidden && same(u.pity, ["0/5", "0/10"]));
  check("No code yet", !u.code && await js(`document.getElementById("ch-code-box").hidden`));
  check("Space rolls on the Challenge tab", await js(`(() => { let hit = false; const b = document.getElementById("ch-roll"); // chặn lượt quay thật, chỉ ghi nhận cú bấm
    const f = (e) => { hit = true; e.stopImmediatePropagation(); }; b.addEventListener("click", f, { capture: true });
    b.blur(); document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true })); b.removeEventListener("click", f, { capture: true }); return hit; })()`));
  await js(`resetChallenge(); renderChallenge(); state.pity = cleanPityCounters({}); savePity(); renderPityMeters()`);

  // 2. Nguồn Type: bộ đếm Type Roulette, lịch sử gắn nhãn Challenge
  await js(`selectChallengeSource("type")`);
  u = await ui();
  check("Type source: label and Type Roulette pity bars", u.label === "Roll slot 1 · Type Roulette" && !u.pityHidden);
  await js(`state.pity["type-roulette"] = { purple: 2, gold: 2 }; savePity(); renderPityMeters()`);
  await roll();
  u = await ui();
  const h = await js(`state.history[0]`);
  const typeEntry = await js(`challenge.pending ? challenge.pending.entry : challenge.team[0]`);
  if (u.legend) await js(`keepChallengeLegend()`);
  check("Roll fills slot 1 with source type and the rolled type", typeEntry.source === "type" && typeof typeEntry.detail === "string", JSON.stringify(typeEntry));
  check("History entry: mode challenge, detail type:<type>", h.mode === "challenge" && h.detail === `type:${typeEntry.detail}`, JSON.stringify(h));
  check("Rolled Pokémon is added to the collection", await js(`Boolean(state.collection[${JSON.stringify(typeEntry.id)}])`));
  const tp = await js(`state.pity["type-roulette"]`), cp = await js(`state.pity.case`);
  check("Type source uses the Type Roulette pity counter (Case counter untouched)", !same(tp, { purple: 2, gold: 2 }) && same(cp, { purple: 0, gold: 0 }), JSON.stringify(tp));
  check("Recent drops: tagged Challenge", await js(`document.querySelector("#recent-row li:first-child .src-tag").textContent`) === "Challenge");
  check("Result popup says Challenge · slot 1/6", u.result && await js(`/Challenge · slot 1\\/6 · Type Roulette/.test(document.getElementById("result-body").textContent)`));
  await closeAll();
  u = await ui();
  check("Next roll is slot 2", u.label === "Roll slot 2 · Type Roulette" && u.slots[0] !== "-" && u.slots[1] === "-");

  // 3. Nguồn Minigame: không pity, popup 1 in N đều
  await js(`selectChallengeSource("minigame")`);
  u = await ui();
  check("Minigame source: no pity bars", u.pityHidden);
  const before = await js(`JSON.stringify(state.pity)`);
  await roll();
  const mg = await js(`challenge.pending ? challenge.pending.entry : challenge.team[1]`);
  check("Minigame roll: source minigame, not Shiny", mg.source === "minigame" && mg.shiny === false);
  check("Minigame roll: no pity counter changes", await js(`JSON.stringify(state.pity)`) === before);
  if (!(await ui()).legend) {
    check("Minigame popup: uniform odds, no tier ladder", await js(`(() => { const b = document.getElementById("result-body"); return /each with the same chance/.test(b.textContent) && !b.querySelector(".tier-ladder"); })()`));
  }
  await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);

  // 4. Legendary: hỏi Keep / Reroll, nhớ sau khi tải lại
  await js(`selectChallengeSource("case"); state.pity.case = { purple: 0, gold: 9 }; savePity(); renderChallenge()`);
  const slotsBefore = (await ui()).slots;
  await js(`runChallengeRoll(); 1`); await sleep(150); // có hiệu ứng: xem giữa lúc dải đang chạy
  const mid = await ui();
  check("While the reel spins: pity bars and slots don't give the result away", await js("state.spinning")
    && !mid.pityHidden && same(mid.pity, ["0/5", "9/10"]) && same(mid.slots, slotsBefore), JSON.stringify(mid.pity));
  await js(`new Promise((done) => { const t = setInterval(() => { if (!state.spinning) { clearInterval(t); done(1); } }, 50); })`); await sleep(200);
  u = await ui();
  check("Gold (Legendary/Mythical): Keep/Reroll dialog instead of the result popup", u.legend && !u.result);
  const legendName = await js(`challengePokemon(challenge.pending.entry).name`);
  check("Dialog buttons: Keep <name> / Reroll (Case)", await js(`document.getElementById("ch-legend-keep").textContent`) === `Keep ${legendName}`
    && await js(`document.getElementById("ch-legend-reroll").textContent`) === "Reroll (Case)");
  check("Dialog shows where it spawns (or how to get it)", await js(`/Where to find in Cobbleverse/.test(document.getElementById("ch-legend-body").textContent)`));
  check("While waiting: Roll is locked", (await ui()).disabled);
  await win.reload(); await sleep(500);
  await js(`showView("challenge")`); await sleep(300);
  u = await ui();
  check("After reload: the Legendary still waits and the dialog opens again", u.legend && await js(`challenge.pending && challengePokemon(challenge.pending.entry).name`) === legendName);
  const slot3 = await js(`challenge.pending.index`);
  // Sau khi tải lại, Reroll quay có hiệu ứng (không phải Quick): chờ dải dừng
  await js(`document.getElementById("ch-legend-reroll").click()`); await sleep(100);
  await js(`new Promise((done) => { const t = setInterval(() => { if (!state.spinning) { clearInterval(t); done(1); } }, 50); })`); await sleep(200);
  u = await ui();
  const after = await js(`challenge.pending ? challengePokemon(challenge.pending.entry).name + "*" : challengePokemon(challenge.team[${slot3}]).name`);
  check("Reroll: the slot is rolled again from Case", (u.result || u.legend) && await js(`(challenge.pending ? challenge.pending.entry : challenge.team[${slot3}]).source`) === "case", after);
  await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);
  await js(`state.pity.case = { purple: 0, gold: 9 }; savePity()`);
  await roll();
  const kept = await js(`challenge.pending && challenge.pending.index`);
  await js(`document.getElementById("ch-legend-keep").click()`); await sleep(200);
  check("Keep: the Legendary goes into the next slot", await js(`challenge.team[${kept}] && challenge.team[${kept}].rarity`) === "gold" && !(await ui()).legend);

  // 5. Đầy đội → mã TW1
  const code = await fill();
  u = await ui();
  check("Team complete: a TW1 code", typeof code === "string" && code.startsWith("TW1.") && !await js(`document.getElementById("ch-code-box").hidden`));
  check("Team complete: Roll is locked, label Team complete", u.disabled && u.label === "Team complete" && /Team complete/.test(u.hint));
  check("Team complete: sources locked", await js(`[...document.querySelectorAll(".ch-source")].every((b) => b.disabled)`));
  const d = await js(`decodeChallengeCode(challenge.code)`);
  const expected = await js(`challenge.team.map(challengeSlotOf)`);
  check("Code: team matches the slots, in order", same(d.team, expected));
  check("Code: v 1, 8-char id, app pokeroll <version>, parent null", d.v === 1 && /^[A-Z0-9]{8}$/.test(d.id) && d.app === `pokeroll ${await js("APP_VERSION")}`
    && d.parent === null && same(d.rerolled, []) && Math.abs(d.ts - Date.now() / 1000) < 600);
  check("Code: Minigame slot is exact / minigame / not Shiny", d.team[1].mode === "minigame" && d.team[1].rule === "exact" && d.team[1].tier === "minigame" && d.team[1].shiny === false);
  check("Code: other slots are evo with a tier", d.team.filter((s) => s.mode !== "minigame").every((s) => s.rule === "evo" && s.tier !== "minigame"));
  check("Code box shows the same code", await js(`document.getElementById("ch-code").value`) === code);
  await win.reload(); await sleep(500);
  check("Code survives a reload", await js(`challenge.code`) === code);
  await js(`showView("challenge")`); await sleep(200);

  // 6. Reroll
  const paste = (text) => js(`document.getElementById("ch-paste").value = ${JSON.stringify(text)}`);
  await paste("hello"); await js(`useRerollCode()`);
  u = await ui();
  check("Reroll: garbage is rejected with a clear error", /is-error/.test(u.msgKind) && /must start with "TWR1\."/.test(u.msg), u.msg);
  const other = await js(`(() => { const d = decodeChallengeCode(challenge.code); return encodeRerollCode(encodeChallengeCode({ ...d, id: "ZZZZ0000" }), 1); })()`);
  await paste(other); await js(`useRerollCode()`);
  u = await ui();
  check("Reroll: code for another team is rejected", /is for team ZZZZ0000, but your active team is/.test(u.msg), u.msg);
  // Mã TW1 bên trong có padding và CRC chữ hoa vẫn khớp
  const loose = code.replace(/\.([0-9a-f]{8})$/, (m, c) => `.${c.toUpperCase()}`);
  await paste(await js(`encodeRerollCode(${JSON.stringify(loose)}, 1)`)); await js(`useRerollCode()`);
  u = await ui();
  check("Reroll: accepted (inner code with uppercase CRC still matches)", /is-ok/.test(u.msgKind) && u.disabled && /Pick up to 1 slot/.test(u.hint), u.msg);
  check("Reroll: the reroll bar explains what to do", await js(`!document.getElementById("ch-reroll-bar").hidden && /Click up to 1 slot/.test(document.getElementById("ch-reroll-text").textContent)`));
  await js(`document.querySelector('#ch-team [data-pick="2"]').click()`);
  await js(`document.querySelector('#ch-team [data-pick="4"]').click()`); // chỉ được 1 ô: đổi sang ô 5
  u = await ui();
  check("Reroll: allow 1 → clicking another slot switches the pick", same(await js(`challenge.reroll.picked`), [4]) && u.label === "Reroll 1 slot" && !u.disabled);
  const oldTeam = await js(`challenge.team.map(challengeSlotOf)`), oldId = d.id;
  const oldSource = oldTeam[4].mode;
  await roll(); await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);
  const d2 = await js(`decodeChallengeCode(challenge.code)`);
  check("Reroll: new code, parent = old id, rerolled [4]", d2.id !== oldId && d2.parent === oldId && same(d2.rerolled, [4]));
  check("Reroll: slot 5 rolled from its own source", d2.team[4].mode === oldSource, `${oldSource} → ${d2.team[4].mode}`);
  check("Reroll: other slots copied unchanged", [0, 1, 2, 3, 5].every((i) => same(d2.team[i], oldTeam[i])));
  check("Reroll: done, the bar is gone", await js(`!challenge.reroll && document.getElementById("ch-reroll-bar").hidden`));
  await paste(await js(`encodeRerollCode(${JSON.stringify(code)}, 1)`)); await js(`useRerollCode()`);
  u = await ui();
  check("Reroll: the same reroll code can't be used twice", /already used/.test(u.msg) && /is-error/.test(u.msgKind), u.msg);
  // Start over rồi nhập lại mã TW1 cũ (nằm trong mã reroll) cũng không dùng lại được mã reroll đó
  const newCode = await js(`challenge.code`);
  await js(`resetChallenge(); renderChallenge()`);
  await paste(code); await js(`importChallenge()`);
  check("Old team imported again", await js(`challenge.code`) === code);
  await paste(await js(`encodeRerollCode(${JSON.stringify(code)}, 1)`)); await js(`useRerollCode()`);
  u = await ui();
  check("Reroll: still rejected after Start over + importing the old code", /already used/.test(u.msg) && !(await js(`challenge.reroll`)), u.msg);
  await js(`resetChallenge(); renderChallenge()`);
  await paste(newCode); await js(`importChallenge()`);
  // Cancel trước khi quay
  await paste(await js(`encodeRerollCode(challenge.code, 2)`)); await js(`useRerollCode()`);
  await js(`document.getElementById("ch-reroll-cancel").click()`);
  check("Reroll: Cancel before rolling keeps the code", !(await js(`challenge.reroll`)) && await js(`decodeChallengeCode(challenge.code).id`) === d2.id);

  // 7. Start over, Import
  const code2 = await js(`challenge.code`);
  await js(`window.confirm = () => true; document.getElementById("ch-start-over").click()`); await sleep(200);
  u = await ui();
  check("Start over: team and code cleared", same(u.slots, ["-", "-", "-", "-", "-", "-"]) && !u.code);
  await paste("TW1.abc.12345678"); await js(`document.getElementById("ch-import").click()`);
  check("Import: damaged code is rejected", /is-error/.test((await ui()).msgKind));
  await paste(`  ${code2}\n`); await js(`document.getElementById("ch-import").click()`);
  u = await ui();
  check("Import: team restored from the TW1 code", u.code === code2 && !u.slots.includes("-") && /imported/.test(u.msg), u.msg);
  check("Import: the restored team can take a reroll code", await js(`(() => { document.getElementById("ch-paste").value = encodeRerollCode(challenge.code, 1); useRerollCode(); const ok = Boolean(challenge.reroll); cancelReroll(); return ok; })()`));
  await js(`window.__asked = ""; window.confirm = (m) => { window.__asked = m; return false; }; 1`);
  await paste(V1()); await js(`document.getElementById("ch-import").click()`);
  check("Import over an existing team asks first (and No keeps it)", /Replace your current team/.test(await js("window.__asked")) && await js(`challenge.code`) === code2);

  // 8. Gen
  await js(`window.confirm = () => true; resetChallenge(); renderChallenge(); document.getElementById("ch-none").click()`);
  u = await ui();
  check("No generations: Roll locked with a hint", u.disabled && /Select at least one generation/.test(u.hint));
  await js(`document.getElementById("ch-all").click()`);
  check("All generations: Roll back", !(await ui()).disabled);
  check("Gen choice saved separately", Array.isArray(await js(`JSON.parse(localStorage.getItem("pokeroll.challenge.gens"))`)));

  // 9. Clear data
  await js(`selectChallengeSource("case")`);
  await roll(); await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);
  await js(`window.__msg = ""; window.confirm = (m) => { window.__msg = m; return true; }; clearData()`);
  check("Clear data warns about the Challenge team", /Challenge team/.test(await js("window.__msg")));
  check("Clear data: Challenge team cleared and saved", same((await ui()).slots, ["-", "-", "-", "-", "-", "-"])
    && await js(`JSON.parse(localStorage.getItem("pokeroll.challenge")).team.every((e) => e === null)`));

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});

// Mã TW1 cố định trong docs/challenge-vectors.json (đội khác với đội đang dùng)
function V1() {
  return require("../../docs/challenge-vectors.json").challenge[0].code;
}
