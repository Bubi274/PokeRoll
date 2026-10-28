// Giữ / bỏ nhóm đang chọn khi đổi gen — cùng một bộ kịch bản cho Type Roulette và Biome Roulette
// (cả hai dùng chung refreshWheelGroups): None → bật lại gen, có và không tải lại trang giữa chừng.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-wheel-keep"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

// Mỗi chế độ: nút, phần tử, khóa lưu, và các bộ gen biết trước là hợp lệ / không hợp lệ với một nhóm.
const MODES = [
  {
    label: "Type", mode: "type-roulette", st: "roulette", spin: "wheel", wheel: "tr-wheel", disc: "tr-disc", hub: "tr-hub", sub: "tr-odds-sub",
    key: "pokeroll.custom.typeRoulette.type", again: "Spin the wheel again.", poolsOf: "typePools", nameOf: "typeName",
    // Dark: không có ở Gen 1, có ở Gen 2. Normal: chỉ Special thì không có, Special + Gen 1 thì có.
    cases: [{ group: "dark", good: [2], bad: [1], spinAfterDrop: true }, { group: "normal", good: [1], bad: ["kazeran"] }],
  },
  {
    label: "Biome", mode: "biome-roulette", st: "biome", spin: "biome", wheel: "br-wheel", disc: "br-disc", hub: "br-hub", sub: "br-odds-sub",
    key: "pokeroll.custom.biomeRoulette.biome", again: "Spin the biome again.", poolsOf: "biomePools", nameOf: "(k) => biomeInfo(k).name",
    // Forest: Special không có dữ liệu spawn. End: không có ở Gen 9. Legendary: Gen 9 chỉ có Gold (rare-only).
    cases: [{ group: "forest", good: [1], bad: ["kazeran"] }, { group: "end", good: [1], bad: [9], spinAfterDrop: true }, { group: "legendary", good: [4], bad: [9], rare: true }],
  },
];

process.on("unhandledRejection", (e) => { console.log("FAIL  test crashed: " + e); app.exit(1); });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1300, height: 900, show: false, webPreferences: { offscreen: true } });
  const errors = [];
  win.webContents.on("console-message", (e, level, msg) => {
    const lv = e.level !== undefined ? e.level : level, text = e.message !== undefined ? e.message : msg;
    if (lv === "error" || lv === 3) errors.push(text);
  });
  const js = (code) => win.webContents.executeJavaScript(code);

  const reload = async (M) => {
    await win.reload(); await sleep(400);
    await js(`document.querySelector('.tab[data-view="custom"]').click(); document.querySelector('.mode-btn[data-mode="${M.mode}"]').click(); 0`); await sleep(200);
  };
  const none = () => js(`document.getElementById("custom-none").click(); 0`);
  const tick = (gens) => js(`${JSON.stringify(gens)}.forEach(g => document.querySelector('#custom-gen-grid input[value="' + g + '"]').click()); 0`);
  // Trạng thái hiện tại của chế độ: nhóm chọn, đã lưu, câu báo, bánh xe chỉ vào đâu, nút Open
  const view = (M) => js(`(() => {
    const st = ${M.st}, w = document.getElementById("${M.wheel}").getBoundingClientRect(), svg = document.querySelector("#${M.disc} svg");
    let under = null;
    if (svg) {
      const pt = new DOMPoint(w.left + w.width / 2, w.top + w.height * 0.09).matrixTransform(svg.getScreenCTM().inverse());
      const g = [...svg.querySelectorAll(".wheel-slice")].find(g => g.querySelector("path").isPointInFill(pt));
      under = g ? g.dataset.type : null;
    }
    const open = document.querySelector('.action-main[data-action="open"]');
    return { selected: st.selected, lost: st.lost, saved: JSON.parse(localStorage.getItem("${M.key}")), under,
      winner: (document.querySelector("#${M.wheel} .wheel-slice.is-winner") || {}).dataset?.type || null,
      hub: document.getElementById("${M.hub}").textContent, openDisabled: open.disabled, openLabel: open.textContent.trim(),
      hint: document.getElementById("custom-hint").textContent, sub: document.getElementById("${M.sub}").textContent };
  })()`);
  // Nhóm được giữ: bánh xe chỉ đúng nhóm, nút Open mở được và mở đúng nhóm đó
  const keptOk = async (M, group) => {
    const v = await view(M), name = await js(`(${M.nameOf})("${group}")`);
    const pointing = v.selected === group && v.saved === group && v.lost === null && v.under === group && v.winner === group && v.hub === name;
    const ready = !v.openDisabled && v.openLabel === `Open ${name} case` && v.hint === "";
    let opened = false;
    if (pointing && ready) {
      await js(`document.querySelector('.action-quick[data-action="open"]').click()`); await sleep(100);
      opened = (await js(`state.history[0].mode === "${M.mode}" && state.history[0].detail === "${group}"`));
      await js(`document.getElementById("result-modal").close()`);
    }
    return { ok: pointing && ready && opened, v };
  };
  // Nhóm bị bỏ: không chọn, Open khóa, câu báo đúng lý do, vẫn được lưu để có thể chọn lại
  const droppedOk = async (M, group, rare) => {
    const v = await view(M), name = await js(`(${M.nameOf})("${group}")`);
    // Bánh xe vẫn còn nhóm khác: báo nhóm bị bỏ và nhắc quay lại. Bánh xe trống (vd. Biome chỉ với Special): không quay được → nhắc chọn gen khác.
    const wheelEmpty = await js(`${M.st}.types.length === 0`), noun = M.label.toLowerCase();
    const msg = wheelEmpty ? `No ${noun} can go on the wheel with these generations. Select other generations.`
      : rare ? `${name} only has rare Pokémon in these generations. Spin again.` : `${name} has no Pokémon in these generations. ${M.again}`;
    const valid = await js(`!!wheelPools(${M.poolsOf}(custom.pool)).pools["${group}"]`);
    return { ok: !valid && v.selected === null && v.lost === group && v.saved === group && v.openDisabled && v.hint === msg && v.sub === msg && v.under !== group, v, msg };
  };
  const info = (r) => JSON.stringify({ sel: r.v.selected, lost: r.v.lost, saved: r.v.saved, under: r.v.under, hint: r.v.hint });
  // Chọn nhóm như sau một lần quay: lưu vào localStorage rồi tải trang với tất cả gen
  const start = async (M, group) => {
    await js(`localStorage.clear(); localStorage.setItem("${M.key}", '"${group}"'); localStorage.setItem("pokeroll.custom.mode", '"${M.mode}"')`);
    await reload(M);
  };

  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  for (const M of MODES) {
    // ---- Chọn bằng cách quay thật, rồi None → bật lại một gen mà nhóm vẫn hợp lệ ----
    await js(`localStorage.clear()`); await reload(M);
    await js(`document.querySelector('.action-quick[data-action="${M.spin}"]').click()`); await sleep(100);
    const spun = await js(`${M.st}.selected`);
    const goodGen = await js(`allSourceKeys().find(g => !!wheelPools(${M.poolsOf}(state.pokemon.filter(p => p.gen === g))).pools["${spun}"])`);
    await none();
    let v = await view(M);
    check(`${M.label}: spun ${spun} → None: kept, Open locked`, v.selected === spun && v.saved === spun && v.openDisabled && v.hint === "Select at least one generation to spin.", info({ v }));
    await tick([goodGen]);
    let r = await keptOk(M, spun);
    check(`${M.label}: spun ${spun} → None → Gen ${goodGen} (still valid): kept, wheel on it, Open works`, r.ok, info(r));

    for (const c of M.cases) {
      const tag = `${M.label} ${c.group}`;
      // 1. None → gen hợp lệ: giữ
      await start(M, c.group);
      await none(); await tick(c.good);
      r = await keptOk(M, c.group);
      check(`${tag}: None → Gen ${c.good} (valid): kept, wheel on it, Open works`, r.ok, info(r));

      // 2. None → gen không hợp lệ: bỏ, có câu báo
      await start(M, c.group);
      await none(); await tick(c.bad);
      r = await droppedOk(M, c.group, c.rare);
      check(`${tag}: None → Gen ${c.bad} (invalid): dropped with message`, r.ok, info(r) + " want " + r.msg);
      // …bật thêm gen làm nhóm hợp lệ lại (trước khi quay): chọn lại, hết câu báo (lỗi cũ: vẫn bỏ, câu báo sai)
      await tick(c.good);
      r = await keptOk(M, c.group);
      check(`${tag}: …then also Gen ${c.good} (valid again): restored, message gone, Open works`, r.ok, info(r));

      // 3. Tải lại sau None: vẫn giữ (nút khóa), rồi bật gen hợp lệ: giữ
      await start(M, c.group);
      await none(); await reload(M);
      v = await view(M);
      check(`${tag}: None → reload: still kept, buttons locked`, v.selected === c.group && v.saved === c.group && v.openDisabled, info({ v }));
      await tick(c.good);
      r = await keptOk(M, c.group);
      check(`${tag}: None → reload → Gen ${c.good}: kept, Open works`, r.ok, info(r));

      // 4. Tải lại sau None, rồi bật gen không hợp lệ: bỏ, có câu báo
      await start(M, c.group);
      await none(); await reload(M); await tick(c.bad);
      r = await droppedOk(M, c.group, c.rare);
      check(`${tag}: None → reload → Gen ${c.bad}: dropped with message`, r.ok, info(r));

      // 5. Bị bỏ rồi tải lại: vẫn bị bỏ, vẫn có câu báo; bật gen hợp lệ: chọn lại
      await reload(M);
      r = await droppedOk(M, c.group, c.rare);
      check(`${tag}: dropped → reload: still dropped, same message`, r.ok, info(r));
      await tick(c.good);
      r = await keptOk(M, c.group);
      check(`${tag}: dropped → reload → Gen ${c.good}: restored, Open works`, r.ok, info(r));
    }

    // ---- Quay lại sau khi bị bỏ: nhóm cũ bị quên, không tự chọn lại nữa ----
    const c = M.cases.find((x) => x.spinAfterDrop); // bộ gen "bad" vẫn còn nhóm khác trên bánh xe để quay
    await start(M, c.group);
    await none(); await tick(c.bad);
    await js(`document.querySelector('.action-quick[data-action="${M.spin}"]').click()`); await sleep(100);
    const fresh = await js(`${M.st}.selected`);
    await tick(c.good); // giờ nhóm cũ lại hợp lệ
    v = await view(M);
    check(`${M.label}: spinning after a drop forgets ${c.group} (not restored when valid again)`,
      fresh !== null && fresh !== c.group && v.selected === fresh && v.saved === fresh && v.lost === null, `spun ${fresh}; ` + info({ v }));
  }

  // ---- Biome chỉ với Special: gen đã chọn nhưng không biome nào lên được bánh xe → không bảo "chọn ít nhất một gen" ----
  await start(MODES[1], "forest");
  await none(); await tick(["kazeran"]);
  const sp = await js(`({ hint: document.getElementById("custom-hint").textContent, cap: document.getElementById("br-wheel-caption").textContent,
    reel: document.querySelector("#br-reel .reel-empty").textContent, spin: document.querySelector('.action-main[data-action="biome"]').disabled })`);
  check("Biome, Special only: says no biome fits these generations (not \"select a generation\"), spin locked",
    sp.hint === "No biome can go on the wheel with these generations. Select other generations." && sp.cap === "No biomes on the wheel" && sp.spin
    && sp.reel === sp.hint, JSON.stringify(sp));
  await none();
  check("…None: back to \"Select at least one generation to spin.\"", (await js(`document.getElementById("custom-hint").textContent`)) === "Select at least one generation to spin.");

  // ---- Hai chế độ cùng lúc: dùng chung bảng gen, mỗi chế độ giữ / bỏ nhóm của mình theo cùng quy tắc ----
  await js(`localStorage.clear(); localStorage.setItem("pokeroll.custom.typeRoulette.type", '"normal"'); localStorage.setItem("pokeroll.custom.biomeRoulette.biome", '"forest"')`);
  await reload(MODES[0]);
  await none(); await tick(["kazeran"]);
  let both = await js(`({ t: roulette.selected, tl: roulette.lost, b: biome.selected, bl: biome.lost })`);
  check("Both modes, None → Special only: Normal (no Normal Kazeran form) and Forest (no spawn data) both dropped", both.t === null && both.tl === "normal" && both.b === null && both.bl === "forest", JSON.stringify(both));
  await tick([2]);
  both = await js(`({ t: roulette.selected, b: biome.selected })`);
  check("Both modes, …+ Gen 2: Normal and Forest both restored", both.t === "normal" && both.b === "forest", JSON.stringify(both));

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
