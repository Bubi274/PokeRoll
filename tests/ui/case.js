// Kiểm tra trang Case trong Electron (cửa sổ ẩn, dữ liệu lưu ở thư mục tạm).
const { app, BrowserWindow } = require("electron");
const path = require("path");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1300, height: 900, show: false, webPreferences: { backgroundThrottling: false, offscreen: true } }); win.webContents.setFrameRate(60);
  const js = (code) => win.webContents.executeJavaScript(code);
  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await js("localStorage.clear()"); await win.reload(); await sleep(300);

  // Kim (tâm khung reel) nằm trong thẻ thắng? Tên thẻ thắng trùng tên trong popup?
  const ALIGN = `(() => {
    const reel = document.getElementById("reel"), r = reel.getBoundingClientRect();
    const win = reel.querySelector(".card.is-winner"); if (!win) return {ok:false, why:"no winner"};
    const c = win.getBoundingClientRect(), mid = r.left + r.width / 2;
    const under = [...reel.querySelectorAll(".card")].filter(k => { const b = k.getBoundingClientRect(); return b.left <= mid && mid < b.right; });
    const strip = document.getElementById("reel-strip");
    const settled = Math.abs(new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41 - parseFloat(strip.style.transform.slice(11))) < 0.5;
    return { ok: settled && c.left <= mid && mid < c.right && under.length === 1 && under[0] === win, settled,
      card: win.querySelector(".card-name").textContent,
      modal: document.getElementById("result-name") && document.getElementById("result-name").textContent,
      open: document.getElementById("result-modal").open, pos: ((mid - c.left) / c.width).toFixed(2) };
  })()`;
  const waitModal = async (ms) => { for (let t = 0; t < ms; t += 100) { if (await js(`document.getElementById("result-modal").open`)) return true; await sleep(100); } return false; };
  const histLen = () => js(`JSON.parse(localStorage.getItem("pokeroll.history") || "[]").length`);

  // 1. Quay thường (nhiều lần)
  for (let i = 0; i < 3; i++) {
    if (i === 0) await js(`document.getElementById("btn-spin").click()`);
    else await js(`document.getElementById("result-again").click()`); // 2. Open again
    await sleep(500);
    const spinning = await js(`document.getElementById("btn-spin").disabled`);
    const opened = await waitModal(9000);
    // Đo khi dải đã dừng hẳn: máy chậm (CI) thì dải có thể còn trượt nốt một chút lúc popup vừa mở
    let a = await js(ALIGN);
    for (let t = 0; t < 4000 && !a.settled; t += 100) { await sleep(100); a = await js(ALIGN); }
    check(`${i === 0 ? "Normal spin" : "Open again #" + i}: button locked while spinning, popup opens`, spinning && opened);
    check(`${i === 0 ? "Normal spin" : "Open again #" + i}: marker on winning card, matches popup`, a.ok && a.card === a.modal, `${a.card} @${a.pos}`);
  }
  check("History saved 3 opens", (await histLen()) === 3);
  const caseTransition = await js(`document.getElementById("reel-strip").style.transition`);
  check("Case reel still runs 6 s", caseTransition.includes("6000ms"), caseTransition);
  await js(`document.getElementById("result-close").click()`);

  // 3. Quick open (20 lần)
  let qOk = 0;
  for (let i = 0; i < 20; i++) {
    await js(`document.getElementById("btn-quick").click()`);
    const opened = await waitModal(1000);
    const a = await js(ALIGN);
    if (opened && a.ok && a.card === a.modal) qOk++;
    await js(`document.getElementById("result-close").click()`);
  }
  check("Quick open ×20: popup immediately, marker on winner", qOk === 20, `${qOk}/20`);

  // 4. Đổi cỡ cửa sổ → căn lại
  for (const [w, h] of [[420, 800], [800, 700], [1600, 900]]) {
    win.setContentSize(w, h); await sleep(400);
    const a = await js(ALIGN);
    check(`Resize to ${w}px: marker still on winner`, a.ok, `pos ${a.pos}`);
  }
  win.setContentSize(1300, 900); await sleep(300);

  // 5. Phím Space
  const space = (target = "document.body") => js(`${target}.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }))`);
  let before = await histLen();
  await space(); await sleep(300);
  check("Space on Case page starts a spin", (await histLen()) === before + 1 && (await js(`document.getElementById("btn-spin").disabled`)));
  await waitModal(9000);
  before = await histLen();
  await space(); await sleep(300); // popup đang mở → Open again
  check("Space with result popup open → Open again", (await histLen()) === before + 1 && !(await js(`document.getElementById("result-modal").open`)));
  await waitModal(9000);
  await js(`document.getElementById("result-close").click()`);
  await js(`document.querySelector('.tab[data-view="collection"]').click()`);
  before = await histLen();
  await space(); await sleep(300);
  check("Space on Collection page does nothing", (await histLen()) === before);
  await js(`document.querySelector('.tab[data-view="case"]').click()`);

  // 6. Chọn gen + lưu
  await js(`document.getElementById("btn-none").click()`);
  check("None: case empty, spin disabled", await js(`document.getElementById("btn-spin").disabled && document.getElementById("pool-count").textContent === "0"`));
  await js(`document.querySelector('#gen-grid input[value="1"]').click()`);
  const g1 = await js(`document.getElementById("pool-count").textContent`);
  check("Tick Gen 1 only: pool = 151, saved", g1 === "151" && (await js(`localStorage.getItem("pokeroll.selectedGens")`)) === "[1]", `pool ${g1}`);
  await js(`document.getElementById("btn-all").click()`);
  await js(`document.querySelector('#gen-grid input[value="kazeran"]').click()`); // bỏ Special
  await js(`document.querySelector('#gen-grid input[value="3"]').click()`);       // bỏ Gen 3
  // Sau "All", ô chọn vẫn điều khiển đúng Set đang dùng
  const saved = await js(`JSON.parse(localStorage.getItem("pokeroll.selectedGens")).sort().join(",")`);
  check("All, then untick Special + Gen 3: saved selection correct", saved === "1,2,4,5,6,7,8,9", saved);
  await win.reload(); await sleep(400);
  const ticks = await js(`[...document.querySelectorAll("#gen-grid input:checked")].map(i => i.value).join(",")`);
  check("Selection survives reload", ticks === "1,2,4,5,6,7,8,9", ticks);
  // Quay sau reload chỉ ra gen đã chọn
  for (let i = 0; i < 15; i++) {
    await js(`document.getElementById("btn-quick").click()`); await waitModal(1000);
    await js(`document.getElementById("result-close").click()`);
  }
  const drops = await js(`(() => { const ids = new Set(JSON.parse(localStorage.getItem("pokeroll.history")).slice(0, 15).map(h => h.id));
    return POKEMON_DATA.concat(SPECIAL_DATA).filter(p => ids.has(p.id)).map(p => p.gen); })()`);
  check("Drops after reload only from selected gens", drops.every((g) => g !== 3 && g !== "kazeran"), drops.join(","));

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
