// Tab Challenge: quay đội 6 ô (mỗi lượt vào ô kế tiếp, không xoá từng ô), nguồn Case / Roulette dùng bộ đếm pity
// của chế độ tương ứng, Roulette quay bánh xe trước (cả Quick) và ghi rõ nhóm trúng, lượt pity chỉ hiện bậc bảo đảm,
// không còn nguồn Minigame (mã cũ có ô minigame vẫn đọc và reroll bằng Case), nút Remove ở mọi ô có Pokémon (có hộp xác nhận)
// cho tới khi bấm "Create TW1 code", Legendary / Mythical hỏi Keep / Reroll (còn nhớ sau khi tải lại), mã TW1 đúng định dạng, reroll bằng
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
    spinShown: !document.getElementById("ch-spin-group").hidden,
    spinLabel: document.querySelector("#ch-spin .action-label").textContent,
    spinDisabled: document.getElementById("ch-spin").disabled,
    kbd: document.getElementById("ch-kbd").textContent,
    sourcesLocked: [...document.querySelectorAll(".ch-source")].every((b) => b.disabled),
    space: challengeSpaceButton().id,
  }))()`);
  // Một lượt đủ (Roulette: quay bánh xe rồi mở hòm), Quick
  // Roulette chưa có nhóm thì quay bánh xe trước; có rồi thì mở luôn hòm của nhóm đang giữ
  const roll = () => js(`(async () => { if (challengeTwoStep() && !challengeHeldGroup()) await runChallengeSpin({ quick: true }); await runChallengeRoll({ quick: true }); return 1; })()`);
  const waitIdle = () => js(`new Promise((done) => { const t = setInterval(() => { if (!state.spinning) { clearInterval(t); done(1); } }, 50); })`);
  // Bánh xe của tab Challenge
  const wheel = () => js(`(() => { const col = document.getElementById("ch-wheel-col"), w = document.getElementById("ch-wheel");
    const win = w.querySelector(".wheel-slice.is-winner");
    return { hidden: col.hidden || !col.getClientRects().length, hub: document.getElementById("ch-hub").textContent,
      winner: w.classList.contains("has-winner") && win ? win.dataset.type : null, letters: w.classList.contains("is-letters"),
      slices: w.querySelectorAll(".wheel-slice").length, caption: document.getElementById("ch-wheel-caption").textContent }; })()`);
  // Bậc của các thẻ phụ trên dải Challenge
  const reelOthers = () => js(`[...new Set([...document.querySelectorAll("#ch-reel .reel-strip .card:not(.is-winner)")].map((c) => [...c.classList].find((k) => k.startsWith("r-")).slice(2)))].sort()`);
  const srcLabel = (i) => js(`(() => { const li = document.querySelectorAll("#ch-team .ch-slot")[${i}]; const el = li && li.querySelector(".ch-card-src"); return el ? el.textContent : ""; })()`);
  const closeAll = () => js(`for (const d of document.querySelectorAll("dialog[open]")) d.close()`);
  // Ô có nút Remove (theo thứ tự ô)
  const removable = () => js(`[...document.querySelectorAll("#ch-team .ch-slot")].map((li) => Boolean(li.querySelector("[data-remove]")))`);
  // Quay tới khi đầy các ô (Legendary thì giữ), chưa tạo mã
  const fillTeam = () => js(`(async () => {
    for (let n = 0; n < 80 && (nextChallengeIndex() !== null || challenge.pending); n++) {
      if (challenge.pending) { keepChallengeLegend(); continue; }
      await runChallengeNext({ quick: true });
      document.getElementById("result-modal").close();
    }
    document.getElementById("ch-legend-modal").close();
    return 1;
  })()`);
  // Quay tới khi đầy các ô rồi bấm Create TW1 code
  const fill = () => js(`(async () => {
    for (let n = 0; n < 80 && (nextChallengeIndex() !== null || challenge.pending); n++) {
      if (challenge.pending) { keepChallengeLegend(); continue; }
      await runChallengeNext({ quick: true });
      document.getElementById("result-modal").close();
    }
    document.getElementById("ch-legend-modal").close();
    if (challengeTeamFull()) document.getElementById("ch-create").click();
    return challenge.code;
  })()`);

  // 1. Tab và trạng thái đầu
  check("Challenge tab is in the tab bar", await js(`Boolean(document.querySelector('.tab[data-view="challenge"]'))`));
  await js(`document.querySelector('.tab[data-view="challenge"]').click()`); await sleep(300);
  let u = await ui();
  check("Empty team: 6 empty slots, Roll slot 1 · Case", same(u.slots, ["-", "-", "-", "-", "-", "-"]) && u.label === "Roll slot 1 · Case" && !u.disabled, JSON.stringify(u));
  check("Empty team: no Remove buttons", same(await removable(), [false, false, false, false, false, false]));
  check("Case source: Case pity bars shown", !u.pityHidden && same(u.pity, ["0/5", "0/10"]));
  check("Case source: no wheel", (await wheel()).hidden);
  check("Sources: Case, Type, Biome, Letter (no Minigame Pokémon Case)",
    same(await js(`[...document.querySelectorAll(".ch-source")].map((b) => b.dataset.source)`), ["case", "type", "biome", "letter"])
    && !/Minigame Pokémon Case/.test(await js(`document.getElementById("ch-sources").textContent`)));
  check("No code yet", !u.code && await js(`document.getElementById("ch-code-box").hidden`));
  check("Space rolls on the Challenge tab", await js(`(() => { let hit = false; const b = document.getElementById("ch-roll"); // chặn lượt quay thật, chỉ ghi nhận cú bấm
    const f = (e) => { hit = true; e.stopImmediatePropagation(); }; b.addEventListener("click", f, { capture: true });
    b.blur(); document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true })); b.removeEventListener("click", f, { capture: true }); return hit; })()`));
  await js(`resetChallenge(); renderChallenge(); state.pity = cleanPityCounters({}); savePity(); renderPityMeters()`);

  // 2. Nguồn Type như trang Custom: Spin type wheel giữ một hệ, Open <type> case mở nhiều lần; bộ đếm Type Roulette; lịch sử
  await js(`selectChallengeSource("type")`);
  u = await ui();
  check("Type source: two buttons, Spin type wheel and Open case (locked until the first spin)", u.spinShown && u.spinLabel === "Spin type wheel" && !u.spinDisabled
    && u.label === "Open case" && u.disabled && !u.pityHidden, JSON.stringify(u));
  check("No type yet: Space spins the wheel, Open case is the secondary button", u.space === "ch-spin" && /to spin the wheel/.test(u.kbd)
    && await js(`document.getElementById("ch-roll").classList.contains("is-secondary")`));
  let wh = await wheel();
  check("Type source: the type wheel shows before rolling (18 types, hub ?)", !wh.hidden && wh.slices === 18 && wh.hub === "?" && !wh.winner
    && wh.caption === "18 types on the wheel · each 1 in 18", JSON.stringify(wh));
  await js(`state.pity["type-roulette"] = { purple: 2, gold: 2 }; savePity(); renderPityMeters()`);
  const histLen = await js(`state.history.length`);
  // Quay bánh xe (Quick): chỉ chọn hệ
  await js(`runChallengeSpin({ quick: true }).then(() => 1)`);
  u = await ui();
  const held1 = await js(`challenge.groups.type`);
  const typeName1 = await js(`typeName(${JSON.stringify(held1 && held1.key)})`);
  wh = await wheel();
  check("Spin (Quick): the wheel shows the type, no Pokémon yet", held1 && wh.winner === held1.key && wh.hub === typeName1
    && u.slots[0] === "-" && await js(`state.history.length`) === histLen, JSON.stringify(held1));
  check("Spin: pity counter not touched", same(await js(`state.pity["type-roulette"]`), { purple: 2, gold: 2 }));
  check("Spin: the type is saved for the Type source", same(await js(`JSON.parse(localStorage.getItem("pokeroll.challenge")).groups.type`), held1));
  check("With a type: Open <type> case, Space opens it, Spin still available", u.label === `Open ${typeName1} case` && !u.disabled && !u.spinDisabled
    && u.space === "ch-roll" && /to open the case/.test(u.kbd) && u.hint === "", JSON.stringify(u));
  check("Nothing else is locked by the wheel: sources, generations, Import, Use reroll code", !u.sourcesLocked
    && await js(`["ch-import", "ch-use-reroll", "ch-all", "ch-none"].every((id) => !document.getElementById(id).disabled)
      && [...document.querySelectorAll("#ch-gen-grid input")].every((x) => !x.disabled)`));
  // Mở hòm (Quick), hai lần liên tiếp với cùng hệ
  await js(`runChallengeRoll({ quick: true }).then(() => 1)`);
  u = await ui();
  const h = await js(`state.history[0]`);
  const typeEntry = await js(`challenge.pending ? challenge.pending.entry : challenge.team[0]`);
  if (u.legend) await js(`keepChallengeLegend()`);
  check("Open fills slot 1 from the type on the wheel", typeEntry.source === "type" && typeEntry.detail === held1.key, JSON.stringify(typeEntry));
  check("The type is kept after opening", same(await js(`challenge.groups.type`), held1));
  check("History entry: mode challenge, detail type:<type>", h.mode === "challenge" && h.detail === `type:${typeEntry.detail}`, JSON.stringify(h));
  check("Rolled Pokémon is added to the collection", await js(`Boolean(state.collection[${JSON.stringify(typeEntry.id)}])`));
  const tp = await js(`state.pity["type-roulette"]`), cp = await js(`state.pity.case`);
  check("Type source uses the Type Roulette pity counter (Case counter untouched)", !same(tp, { purple: 2, gold: 2 }) && same(cp, { purple: 0, gold: 0 }), JSON.stringify(tp));
  check("Recent drops: tagged Challenge", await js(`document.querySelector("#recent-row li:first-child .src-tag").textContent`) === "Challenge");
  check("Result popup says Challenge · slot 1/6 · Type Roulette · <type>", u.result
    && await js(`document.getElementById("result-body").textContent.replace(/\\s+/g, " ")`).then((t) => t.includes(`Challenge · slot 1/6 · Type Roulette · ${typeName1}.`)));
  await closeAll();
  u = await ui();
  check("Next slot: still Open <type> case, no need to spin again", u.label === `Open ${typeName1} case` && !u.disabled && u.space === "ch-roll"
    && u.slots[0] !== "-" && u.slots[1] === "-", JSON.stringify(u));
  check("Slot 1 says its source: Type Roulette · <type>", await srcLabel(0) === `Type Roulette · ${typeName1}`, await srcLabel(0));
  check("Slot 1 has a Remove button, empty slots don't", same(await removable(), [true, false, false, false, false, false]));
  await js(`runChallengeRoll({ quick: true }).then(() => 1)`);
  const again = await js(`challenge.pending ? challenge.pending.entry : challenge.team[1]`);
  check("Open again: slot 2 from the same type", again && again.detail === held1.key, JSON.stringify(again));
  await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);
  await js(`removeChallengeSlot(1); saveChallenge(); renderChallenge()`); // giữ số ô cho các mục sau

  // 2b. Spin bất cứ lúc nào; mỗi nguồn nhớ nhóm riêng; tải lại trang vẫn giữ; có hiệu ứng; Space
  await js(`selectChallengeSource("biome")`);
  u = await ui();
  check("Biome has no group yet: Open case locked, Space spins (Type keeps its own)", u.label === "Open case" && u.disabled && u.space === "ch-spin"
    && same(await js(`challenge.groups.type`), held1) && await js(`challenge.groups.biome`) === null, JSON.stringify(u));
  await js(`runChallengeSpin({ quick: true }).then(() => 1)`);
  const heldBiome = await js(`challenge.groups.biome`);
  await js(`selectChallengeSource("type")`);
  u = await ui(); wh = await wheel();
  check("Back to Type: its type is still there (wheel and Open button)", u.label === `Open ${typeName1} case` && wh.winner === held1.key
    && same(await js(`challenge.groups.biome`), heldBiome), JSON.stringify(wh));
  // Có hiệu ứng: bánh xe quay (chưa lộ hệ mới)
  await js(`state.pity["type-roulette"] = { purple: 0, gold: 0 }; savePity(); renderChallenge(); runChallengeSpin(); 1`); await sleep(120);
  const midWheel = await wheel();
  u = await ui();
  check("While the wheel spins: no winner yet, hub ?, Spinning… on the Spin button, Open locked", await js("state.spinning") && !midWheel.winner && midWheel.hub === "?"
    && u.slots[1] === "-" && u.spinLabel === "Spinning…" && u.disabled, JSON.stringify(midWheel));
  await waitIdle(); await sleep(200);
  const held2 = await js(`challenge.groups.type`);
  wh = await wheel();
  check("After the spin: the wheel shows the new type, slot 2 still empty", held2 && wh.winner === held2.key && (await ui()).slots[1] === "-", JSON.stringify(wh));
  await win.reload(); await sleep(500);
  await js(`showView("challenge")`); await sleep(300);
  u = await ui();
  wh = await wheel();
  const typeName2 = await js(`typeName(${JSON.stringify(held2.key)})`);
  check("After reload: Type and Biome keep their groups; the wheel shows the type", same(await js(`challenge.groups.type`), held2)
    && same(await js(`challenge.groups.biome`), heldBiome) && wh.winner === held2.key && u.label === `Open ${typeName2} case` && !u.disabled && !u.spinDisabled, JSON.stringify(u));
  await js(`document.activeElement && document.activeElement.blur(); document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true })); 1`);
  await sleep(100); await waitIdle(); await sleep(200);
  const e2 = await js(`challenge.pending ? challenge.pending.entry : challenge.team[1]`);
  check("Space opens the type's case", e2 && e2.source === "type" && e2.detail === held2.key
    && await js(`challengePokemon(${JSON.stringify(e2)}).types.includes(${JSON.stringify(held2.key)})`), JSON.stringify(e2));
  await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);
  check("Quick buttons on both", await js(`Boolean(document.querySelector("#ch-spin-quick svg")) && Boolean(document.querySelector("#ch-quick svg"))`));
  await js(`document.getElementById("ch-spin-quick").click(); 1`);
  check("⚡ Spin: the new type shows at once", await js(`!state.spinning && document.getElementById("ch-wheel").classList.contains("has-winner")
    && document.querySelector("#ch-wheel .wheel-slice.is-winner").dataset.type === challenge.groups.type.key`));

  // 3. Nguồn Minigame không còn; Biome và Letter có bánh xe riêng
  await js(`selectChallengeSource("minigame")`);
  check("Minigame can't be selected any more", await js(`challenge.source`) === "type");
  await js(`selectChallengeSource("letter")`);
  wh = await wheel();
  check("Letter source: the letter wheel (upright letters)", !wh.hidden && wh.letters && wh.hub === "?" && /letters? on the wheel/.test(wh.caption), JSON.stringify(wh));
  await js(`selectChallengeSource("biome")`);
  wh = await wheel();
  check("Biome source: the biome wheel", !wh.hidden && !wh.letters && /biomes? on the wheel/.test(wh.caption), JSON.stringify(wh));
  const i3 = await js(`nextChallengeIndex()`);
  await roll();
  const e3 = await js(`challenge.pending ? challenge.pending.entry : challenge.team[${i3}]`);
  const biomeName = await js(`biomeInfo(${JSON.stringify(e3.detail)}).name`);
  wh = await wheel();
  check("Biome roll: wheel shows the biome, slot says Biome Roulette · <biome>", e3.source === "biome" && wh.winner === e3.detail
    && wh.hub === biomeName && await srcLabel(i3) === `Biome Roulette · ${biomeName}`, `${await srcLabel(i3)} / ${JSON.stringify(wh)}`);
  await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);

  // 3b. Pity ở Challenge: Gen 1, Gold pity → bánh xe chỉ dừng ở hệ có Gold, dải chỉ toàn Gold
  await js(`challenge.gens = new Set([1]); syncCheckboxes(document.getElementById("ch-gen-grid"), challenge.gens); onChallengeGensChanged();
    selectChallengeSource("type"); state.pity["type-roulette"] = { purple: 0, gold: 9 }; savePity(); renderChallenge()`);
  check("Gold pity due: Next open line under the Challenge pity bars", await js(`(document.querySelector("#ch-pity .pity-next") || {}).textContent`) === "Next open: guaranteed Gold");
  const goldTypes = await js(`challengeWheelGroups("type", challengePool()).keys.filter((k) => !pityTiers("gold", groupByRarity(typePools(challengePool())[k])).fallback)`);
  // Pity mà hệ đang giữ không có Gold: cảnh báo như trang Custom (mở lúc này thì dùng fallback)
  await js(`challenge.groups.type = { key: "bug", pitySpin: null }; saveChallenge(); renderChallenge()`);
  check("Gold pity due, held type has no Gold: warning next to Open", (await ui()).hint === "This type has no Gold — spin the wheel again to use your Gold pity.", (await ui()).hint);
  await js(`state.pity["type-roulette"] = { purple: 4, gold: 2 }; savePity(); renderChallenge()`);
  check("Purple pity due, Bug has Purple or better: no warning", (await ui()).hint === "", (await ui()).hint);
  await js(`state.pity["type-roulette"] = { purple: 0, gold: 9 }; savePity(); renderChallenge()`);
  const i4 = await js(`nextChallengeIndex()`);
  await js(`runChallengeSpin({ quick: true }).then(() => 1)`);
  check("Spin with Gold pity due: lands on a type with Gold, the warning goes away", goldTypes.includes(await js(`challenge.groups.type.key`)) && (await ui()).hint === "");
  await roll();
  const e4 = await js(`challenge.pending ? challenge.pending.entry : challenge.team[${i4}]`);
  wh = await wheel();
  check("Gold pity: the wheel landed on a type with Gold", goldTypes.includes(e4.detail) && wh.winner === e4.detail, `${e4.detail} / ${goldTypes.join(",")}`);
  check("Gold pity: caption says it was a pity spin", wh.caption === `Pity spin: only the ${goldTypes.length} types with Gold could come up`, wh.caption);
  check("Gold pity: Gold, every card on the reel is Gold", e4.rarity === "gold" && same(await reelOthers(), ["gold"]), JSON.stringify(await reelOthers()));
  // Legendary từ Roulette → Reroll: mở lại hòm của hệ đang giữ (không phải quay bánh xe)
  check("Gold from the Type wheel: Keep/Reroll dialog, Reroll (Type Roulette)", (await ui()).legend
    && await js(`document.getElementById("ch-legend-reroll").textContent`) === "Reroll (Type Roulette)");
  const histBefore = await js(`state.history.length`);
  const heldGold = await js(`challenge.groups.type`);
  await js(`legendQuick = true; document.getElementById("ch-legend-reroll").click()`); await sleep(150); await waitIdle(); await sleep(100);
  const rr4 = await js(`challenge.pending ? challenge.pending.entry : challenge.team[${i4}]`);
  check("Reroll a Roulette Legendary: opens the held type's case again (no new spin)", rr4 && rr4.detail === heldGold.key && rr4.source === "type"
    && await js(`state.history.length`) === histBefore + 1 && same(await js(`challenge.groups.type`), heldGold), JSON.stringify(rr4));
  await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);
  check("After the pity roll: Next open line gone", !(await js(`Boolean(document.querySelector("#ch-pity .pity-next"))`)));
  await js(`document.getElementById("ch-all").click()`);

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
  check("Case Gold pity: every card on the reel is Gold", same(await reelOthers(), ["gold"]), JSON.stringify(await reelOthers()));

  // 4b. Xoá Pokémon khỏi đội, đội đủ 6 → nút Create TW1 code
  await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);
  await js(`selectChallengeSource("case")`);
  await fillTeam();
  u = await ui();
  const full6 = u.slots;
  check("Team full: no code yet, Create TW1 code button, Roll says Team full", !u.code && u.label === "Team full" && u.disabled
    && /Your team is full/.test(u.hint) && await js(`!document.getElementById("ch-create-box").hidden && !document.getElementById("ch-create").disabled`), JSON.stringify(u));
  check("Team full: every slot has a Remove button", same(await removable(), [true, true, true, true, true, true]));
  const pityBefore = await js(`JSON.stringify(state.pity)`), histBefore2 = await js(`state.history.length`);
  // Hộp xác nhận: Cancel không xoá
  await js(`document.querySelector('#ch-team [data-remove="5"]').click()`);
  const dlg = () => js(`({ open: document.getElementById("ch-remove-modal").open, text: document.getElementById("ch-remove-text").textContent,
    shiny: document.getElementById("ch-remove-shiny").hidden ? "" : document.getElementById("ch-remove-shiny").textContent,
    buttons: [...document.querySelectorAll("#ch-remove-modal .result-actions button")].map((b) => b.textContent) })`);
  let dd = await dlg();
  const name6 = full6[5];
  check("Remove asks first: \"Remove <name> from slot 6? This can't be undone.\" with Remove / Cancel", dd.open
    && dd.text === `Remove ${name6} from slot 6? This can't be undone.` && same(dd.buttons, ["Cancel", "Remove"]), JSON.stringify(dd));
  check("Not Shiny: no Shiny warning", await js(`challenge.team[5].shiny`) || dd.shiny === "");
  await js(`document.getElementById("ch-remove-cancel").click()`);
  check("Cancel: nothing removed", !(await dlg()).open && same((await ui()).slots, full6));
  // Shiny: thêm dòng cảnh báo
  await js(`challenge.team[2].shiny = true; saveChallenge(); renderChallenge(); document.querySelector('#ch-team [data-remove="2"]').click()`);
  dd = await dlg();
  check("Shiny: the dialog warns you lose the Shiny reward for that slot", dd.open && dd.shiny === `${full6[2]} is Shiny: you lose the Shiny reward for this slot.`, dd.shiny);
  await js(`document.getElementById("ch-remove-cancel").click()`);
  // Remove: ô 6 (chưa tạo mã thì ô thứ 6 vẫn xoá được), rồi ô 5
  await js(`document.querySelector('#ch-team [data-remove="5"]').click(); document.getElementById("ch-remove-confirm").click()`);
  u = await ui();
  check("Remove: slot 6 is empty again (before Create TW1 code)", u.slots[5] === "-" && same(u.slots.slice(0, 5), full6.slice(0, 5)) && !u.code
    && await js(`document.getElementById("ch-create-box").hidden`), JSON.stringify(u.slots));
  await js(`document.querySelector('#ch-team [data-remove="4"]').click(); document.getElementById("ch-remove-confirm").click()`);
  u = await ui();
  check("Remove: slot 5 empty too; saved", u.slots[4] === "-" && u.slots[5] === "-"
    && await js(`JSON.parse(localStorage.getItem("pokeroll.challenge")).team.map((e) => e === null)`).then((t) => same(t, [false, false, false, false, true, true])));
  check("Remove: pity counters not given back, collection and history kept", await js(`JSON.stringify(state.pity)`) === pityBefore
    && await js(`state.history.length`) === histBefore2);
  check("After removing: the next roll goes into the first empty slot (5)", u.label === "Roll slot 5 · Case" && !u.disabled, u.label);
  await roll(); await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);
  u = await ui();
  check("The roll filled slot 5, slot 6 is next", u.slots[4] !== "-" && u.slots[5] === "-" && u.label === "Roll slot 6 · Case", JSON.stringify(u.slots));
  await roll(); await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);
  check("Full again: Create TW1 code shows again", await js(`challengeTeamFull() && !document.getElementById("ch-create-box").hidden`));
  await js(`document.getElementById("ch-create").click()`);
  u = await ui();
  check("Create TW1 code: the code appears, the button goes away", typeof u.code === "string" && u.code.startsWith("TW1.")
    && await js(`document.getElementById("ch-create-box").hidden && !document.getElementById("ch-code-box").hidden`));
  check("After Create TW1 code: no Remove buttons, removing does nothing", same(await removable(), [false, false, false, false, false, false])
    && await js(`(() => { const before = JSON.stringify(challenge.team); askRemoveChallengeSlot(5); const open = document.getElementById("ch-remove-modal").open;
      return !open && !removeChallengeSlot(5) && JSON.stringify(challenge.team) === before; })()`));

  // 5. Đầy đội → mã TW1 (đội vừa tạo mã ở 4b)
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
  check("Code: no Minigame slot; every slot is evo with a tier", d.team.every((s) => s.mode !== "minigame" && s.rule === "evo" && s.tier !== "minigame"));
  check("Code: slot modes match the sources rolled (type, type, biome, type, ...)", same(d.team.slice(0, 4).map((s) => s.mode), ["type", "type", "biome", "type"]), JSON.stringify(d.team.map((s) => s.mode)));
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
  check("Reroll: no Remove buttons", same(await removable(), [false, false, false, false, false, false]));
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

  // 7b. Mã TW1 cũ có ô Minigame (rule "exact"): vẫn đọc được, reroll ô đó thì quay bằng Case
  await js(`window.confirm = () => true; 1`);
  const legacy = await js(`(() => { const d = decodeChallengeCode(challenge.code);
    d.team[4] = { ...d.team[4], rule: "exact", tier: "minigame", shiny: false, mode: "minigame" };
    return encodeChallengeCode({ ...d, id: "LEGACY01", parent: null, rerolled: [] }); })()`);
  await paste(legacy); await js(`document.getElementById("ch-import").click()`);
  u = await ui();
  check("Old code with a Minigame slot: imported", u.code === legacy && /imported/.test(u.msg), u.msg);
  check("Old Minigame slot: shown as Minigame (neutral colour)", await srcLabel(4) === "Minigame"
    && await js(`document.querySelectorAll("#ch-team .ch-slot")[4].querySelector(".ch-card").classList.contains("r-minigame")`));
  await win.reload(); await sleep(500);
  await js(`showView("challenge")`); await sleep(200);
  check("Old Minigame slot: still there after a reload", await js(`challenge.code`) === legacy && await js(`challenge.team[4].source`) === "minigame");
  const legacyTeam = await js(`decodeChallengeCode(challenge.code).team`);
  await paste(await js(`encodeRerollCode(challenge.code, 1)`)); await js(`useRerollCode()`);
  await js(`document.querySelector('#ch-team [data-pick="4"]').click()`);
  u = await ui();
  check("Reroll an old Minigame slot: it will roll from Case", u.label === "Reroll 1 slot" && !u.disabled && await js(`sourceForIndex(4)`) === "case");
  await roll(); await closeAll();
  if (await js(`Boolean(challenge.pending)`)) await js(`keepChallengeLegend()`);
  const d3 = await js(`decodeChallengeCode(challenge.code)`);
  check("Reroll an old Minigame slot: rolled from Case (mode case, rule evo, a tier)", d3.parent === "LEGACY01" && same(d3.rerolled, [4])
    && d3.team[4].mode === "case" && d3.team[4].rule === "evo" && d3.team[4].tier !== "minigame", JSON.stringify(d3.team[4]));
  check("Reroll an old Minigame slot: other slots unchanged", [0, 1, 2, 3, 5].every((i) => same(d3.team[i], legacyTeam[i])));

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
