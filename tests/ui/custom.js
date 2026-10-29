// Kiểm tra khung trang Custom (giai đoạn 0) trong Electron, render offscreen.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-custom"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const T = require("./timing");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1300, height: 900, show: false, webPreferences: { backgroundThrottling: false, offscreen: true } });
  win.webContents.setFrameRate(60);
  const errors = [];
  win.webContents.on("console-message", (e, level, msg) => {
    const lv = e.level !== undefined ? e.level : level, text = e.message !== undefined ? e.message : msg;
    if (lv === "error" || lv === 3) errors.push(text);
  });
  win.webContents.on("did-finish-load", () => win.webContents.executeJavaScript(`window.addEventListener("error", (e) => console.error("PAGE ERROR " + e.message))`));
  const js = (code) => win.webContents.executeJavaScript(code);
  const shot = async (name) => fs.writeFileSync(path.join(SHOTS, name), (await win.webContents.capturePage()).toPNG());
  const fullShot = async (name, w) => {
    const h = await js(`document.documentElement.scrollHeight`);
    win.setContentSize(w, Math.min(h, 4000)); await sleep(400);
    await shot(name);
  };
  const space = () => js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }))`);
  const $t = (id) => js(`document.getElementById("${id}").textContent.trim()`);

  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await js(`localStorage.clear(); localStorage.setItem("pokeroll.selectedGens", "[1]")`); // trang Case chỉ chọn Gen 1
  await win.reload(); await sleep(400);

  // 1. Tab Custom
  const tabs = await js(`[...document.querySelectorAll(".tab")].map(t => t.dataset.view).join(",")`);
  check("Tab bar: Case, Collection, Custom", tabs === "case,collection,custom", tabs);
  await js(`document.querySelector('.tab[data-view="custom"]').click()`); await sleep(200);
  const vis = await js(`["case","collection","custom"].map(v => document.getElementById("view-" + v).hidden ? 0 : 1).join("")`);
  check("Custom tab shows only the Custom page", vis === "001" && await js(`document.querySelector('.tab[data-view="custom"]').getAttribute("aria-selected") === "true"`), vis);

  // 2. Thanh chọn chế độ + luật
  check("Mode bar lists Type Roulette (selected) + Biome Roulette", await js(`(() => { const b = document.querySelectorAll(".mode-btn"); return b.length === 2 && b[0].dataset.mode === "type-roulette" && b[0].getAttribute("aria-selected") === "true" && b[1].dataset.mode === "biome-roulette" && b[1].getAttribute("aria-selected") === "false"; })()`));
  check("How it works shows the mode's 7 rules", (await js(`document.querySelectorAll("#mode-rule-list li").length`)) === 7 && (await $t("mode-rules-name")) === "Type Roulette");
  check("Type Roulette actions rendered: Spin wheel + Open case", (await js(`[...document.querySelectorAll("#custom-actions .action-main")].map(b => b.dataset.action + ":" + b.textContent.trim()).join()`)) === "wheel:Spin wheel,open:Open case");

  // 3. Bộ lọc gen riêng
  const total = await js(`state.pokemon.length`);
  check("Custom gens default to all (separate from Case = Gen 1)", (await $t("custom-pool-count")) === String(total) && (await $t("pool-count")) === "151", `custom ${await $t("custom-pool-count")}, case ${await $t("pool-count")}`);
  await js(`document.getElementById("custom-none").click()`);
  await js(`document.querySelector('#custom-gen-grid input[value="2"]').click()`);
  await js(`document.querySelector('#custom-gen-grid input[value="kazeran"]').click()`);
  const cg = await js(`localStorage.getItem("pokeroll.custom.gens")`);
  check("Custom None + Gen 2 + Special: saved under its own key", cg === `[2,"kazeran"]` && (await $t("custom-pool-count")) === "108", `${cg}, pool ${await $t("custom-pool-count")}`);
  check("Case selection untouched", (await js(`localStorage.getItem("pokeroll.selectedGens")`)) === "[1]" && (await $t("pool-count")) === "151" &&
    (await js(`[...document.querySelectorAll("#gen-grid input:checked")].map(i => i.value).join()`)) === "1");
  await win.reload(); await sleep(400);
  check("Custom selection survives reload", (await js(`[...document.querySelectorAll("#custom-gen-grid input:checked")].map(i => i.value).join()`)) === "2,kazeran");
  await js(`document.getElementById("custom-all").click()`);
  await js(`document.querySelector('.tab[data-view="custom"]').click()`); await sleep(200); // tải lại thì về tab Case
  check("Custom All selects everything again", (await $t("custom-pool-count")) === String(total));

  // 4. Đăng ký thêm một chế độ lúc chạy (thử khung: chỉ cần đăng ký một mục)
  await js(`window.__spins = []; registerCustomMode({
    key: "test-mode", name: "Test Mode", desc: "A fake mode for testing", rules: ["Rule A", "Rule B"],
    mount(stage) { stage.innerHTML = '<p id="test-stage">test stage</p>'; },
    async spin({ quick }) {
      window.__spins.push(quick ? "quick" : "normal");
      setCustomSpinning(true, "Spinning…");
      if (!quick) await new Promise(r => setTimeout(r, 1200));
      const groups = groupByRarity(custom.pool);
      const result = rollOnce(groups);
      setCustomSpinning(false);
      showResultModal(result, { isNew: true, count: 1, groups, again: () => runCustomSpin(), canAgain: true, extra: '<p id="test-extra">extra</p>' });
    },
  })`);
  await sleep(100);
  check("Registered mode appears in the mode bar", (await js(`document.querySelectorAll(".mode-btn").length`)) === 3);
  await js(`document.querySelector('.mode-btn[data-mode="test-mode"]').click()`); await sleep(100);
  check("Selecting it: stage, rules and saved mode switch",
    await js(`!document.getElementById("mode-test-mode").hidden && document.getElementById("mode-type-roulette").hidden
      && document.querySelectorAll("#mode-rule-list li").length === 2 && localStorage.getItem("pokeroll.custom.mode") === '"test-mode"'
      && document.querySelector('.action-main[data-action="spin"]').textContent.trim() === "Spin" && document.getElementById("custom-kbd").textContent.trim() === "Space spin" && !document.querySelector('.action-main[data-action="spin"]').disabled`));

  // 5. Space ở trang Custom quay chế độ Custom, không mở hòm
  const hist0 = await js(`state.history.length`);
  await space(); await sleep(300);
  check("Space on Custom runs the Custom mode, not the Case", (await js(`window.__spins.join()`)) === "normal" && (await js(`state.history.length`)) === hist0);
  check("While spinning: Custom + Case buttons and mode bar locked, label shown",
    await js(`document.querySelector('.action-main[data-action="spin"]').disabled && document.getElementById("btn-spin").disabled
      && [...document.querySelectorAll(".mode-btn")].every(b => b.disabled) && document.querySelector('.action-main[data-action="spin"]').textContent.trim() === "Spinning…"`));
  await space(); await sleep(100);
  check("Space while spinning does nothing", (await js(`window.__spins.length`)) === 1);
  await sleep(1300);
  check("Result popup shows the mode's extra line", await js(`document.getElementById("result-modal").open && !!document.getElementById("test-extra")`));
  check("After spin: buttons unlocked", await js(`!document.getElementById("btn-spin").disabled && !document.querySelector('.action-main[data-action="spin"]').disabled`));
  await shot("custom-result-popup.png");
  await space(); await sleep(200);
  check("Space / Open again on a Custom result re-runs the Custom mode", (await js(`window.__spins.join()`)) === "normal,normal" && (await js(`state.history.length`)) === hist0);
  await sleep(1400);
  await js(`document.getElementById("result-close").click()`);
  await js(`document.querySelector('.action-quick[data-action="spin"]').click()`); await sleep(100);
  check("Quick spin passes quick: true", (await js(`window.__spins.join()`)) === "normal,normal,quick");
  await js(`document.getElementById("result-close").click()`);

  // 6. Trang Case: Space và Open again vẫn mở hòm
  await js(`document.querySelector('.tab[data-view="case"]').click()`); await sleep(200);
  await space(); await sleep(300);
  check("Space on Case opens the case, not the Custom mode", (await js(`state.history.length`)) === hist0 + 1 && (await js(`window.__spins.length`)) === 3);
  for (const t0 = Date.now(); Date.now() - t0 < T.CASE_POPUP_MS && !(await js(`document.getElementById("result-modal").open`));) await sleep(100);
  await js(`document.getElementById("result-again").click()`); await sleep(300);
  check("Open again after a Case result opens the case", (await js(`state.history.length`)) === hist0 + 2 && (await js(`window.__spins.length`)) === 3);
  for (const t0 = Date.now(); Date.now() - t0 < T.CASE_POPUP_MS && !(await js(`document.getElementById("result-modal").open`));) await sleep(100);
  await js(`document.getElementById("result-close").click()`);

  // 7. Nút Sound đồng bộ hai trang
  await js(`document.querySelectorAll(".btn-sound")[1].click()`);
  check("Sound toggle syncs both pages", await js(`[...document.querySelectorAll(".btn-sound")].every(b => b.textContent.includes("Muted"))`));
  await js(`document.querySelectorAll(".btn-sound")[0].click()`);

  // 8. Chế độ đã chọn giữ sau khi tải lại; chế độ không còn tồn tại → về chế độ đầu tiên
  await win.reload(); await sleep(400);
  check("Saved mode that no longer exists falls back to the first mode", await js(`custom.active.key === "type-roulette"`));

  // Ảnh chụp
  await js(`document.querySelector('.tab[data-view="custom"]').click()`); await sleep(300);
  await fullShot("custom-desktop.png", 1300);
  await fullShot("custom-mobile-390.png", 390);
  await js(`document.querySelector('.tab[data-view="case"]').click()`); await sleep(300);
  win.setContentSize(360, 700); await sleep(400); await shot("case-mobile-360-tabs.png");

  check("No console errors", errors.length === 0, errors.join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
