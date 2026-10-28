// Hiệu ứng chuyển động (bật, không có ?nomotion): bảng tỉ lệ chạy từ giá trị cũ tới mới rồi dừng đúng
// effectiveChances, đếm số, lệch hàng, bấm gen liên tục, tắt khi giảm chuyển động; các hiệu ứng CSS khác.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-motion"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
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
  const SETTLE = 900; // 550ms + trễ hàng cuối 160ms + dư

  await win.loadFile(PAGE);
  await js(`localStorage.clear(); localStorage.setItem("pokeroll.selectedGens", "[6]")`);
  await win.reload();
  let s;
  check("Without ?nomotion: effects on (no no-motion class)", !(await js(`document.documentElement.classList.contains("no-motion")`)));

  await js(`
    // Một khung hình: số tổng, và mỗi hàng (Gold→Blue) chữ %, chữ số Pokémon, --p đang hiển thị (đang chạy transition)
    window.frame = (list = "#rarity-list", total = "pool-count") => ({
      pool: document.getElementById(total).textContent,
      rows: [...document.querySelectorAll(list + " .rarity-row")].map(li => ({
        tier: li.dataset.tier, pct: li.querySelector(".rarity-chance").textContent, count: li.querySelector(".rarity-count").textContent,
        p: parseFloat(getComputedStyle(li).getPropertyValue("--p")), target: parseFloat(li.style.getPropertyValue("--p")) })),
    });
    // Chạy act() rồi ghi từng khung hình trong ms mili giây (t tính từ lúc act)
    window.record = (act, ms, list, total) => new Promise((res) => {
      const out = [], t0 = performance.now();
      act();
      const f = () => { const t = performance.now() - t0; out.push({ t, ...frame(list, total) }); if (t < ms) requestAnimationFrame(f); else res(out); };
      requestAnimationFrame(f);
    });
    window.tickGen = (g) => document.querySelector('#gen-grid input[value="' + g + '"]').click();
    window.settledOk = (list = "#rarity-list", groups = state.groups) => {
      const eff = effectiveChances(groups), fr = frame(list), bad = [];
      const fmt = (x) => x === 0 ? "0%" : x.toFixed(2) + "%";
      for (const r of fr.rows) {
        if (r.pct !== fmt(eff[r.tier])) bad.push(r.tier + " " + r.pct + " ≠ " + fmt(eff[r.tier]));
        if (Math.abs(r.p - eff[r.tier]) > 1e-6) bad.push(r.tier + " bar " + r.p + " ≠ " + eff[r.tier]);
        if (r.count !== String(groups[r.tier].length)) bad.push(r.tier + " count " + r.count);
      }
      const sum = fr.rows.reduce((a, r) => a + parseFloat(r.pct), 0);
      if (Math.abs(sum - 100) > 0.001) bad.push("sum " + sum);
      return { ok: bad.length === 0, bad: bad.slice(0, 4), shown: fr.rows.map(r => r.tier + " " + r.pct).join(", ") + " · " + fr.pool + " Pokémon" };
    };
    0`);

  // Lúc tải trang khung hình đầu có thể đến muộn: chờ tới khi bảng đứng yên (tối đa 3 s)
  for (let t = 0; t < 3000 && !(await js(`settledOk().ok`)); t += 100) await sleep(100);
  // ---- 1. Gen 6 → thêm Gen 9: Red 0→0.64, Pink 3.84→3.20, tổng 72→192 ----
  s = await js(`settledOk()`);
  check("Settled at Gen 6 before the change", s.ok, s.ok ? s.shown : s.bad.join("; "));
  const fr = await js(`record(() => tickGen(9), 1000)`);
  const at = (i, tier) => fr[i].rows.find((r) => r.tier === tier);
  const series = (tier, key) => fr.map((f) => ({ t: f.t, v: key === "pool" ? Number(f.pool) : parseFloat(f.rows.find((r) => r.tier === tier)[key]) }));
  const firstMove = (s) => (s.find((x) => Math.abs(x.v - s[0].v) > 1e-6) || {}).t;
  const lastMove = (s) => { for (let i = s.length - 1; i > 0; i--) if (Math.abs(s[i].v - s[i - 1].v) > 1e-6) return s[i].t; return 0; };
  const monotone = (s, dir) => s.every((x, i) => i === 0 || dir * (x.v - s[i - 1].v) >= -1e-9);

  const pool = series(null, "pool"), redBar = series("red", "p"), pinkBar = series("pink", "p"), redPct = series("red", "pct"), pinkPct = series("pink", "pct");
  check("Pool count counts up 72 → 192 through in-between values", pool[0].v <= 80 && pool.at(-1).v === 192 && pool.some((x) => x.v > 80 && x.v < 185) && monotone(pool, 1),
    pool.filter((_, i) => i % 6 === 0).map((x) => x.v).join(" "));
  check("Red bar grows 0 → 0.64 smoothly (no jump, no overshoot)", redBar.some((x) => x.v > 0.05 && x.v < 0.6) && monotone(redBar, 1) && Math.abs(redBar.at(-1).v - 0.64) < 1e-6);
  check("Pink bar shrinks 3.84 → 3.20 smoothly", pinkBar.some((x) => x.v < 3.8 && x.v > 3.25) && monotone(pinkBar, -1) && Math.abs(pinkBar.at(-1).v - 3.2) < 1e-6);
  check("% counts with the bar and keeps 2 decimals the whole way", fr.every((f) => f.rows.every((r) => /^\d+\.\d{2}%$|^0%$/.test(r.pct)))
    && redPct.some((x) => x.v > 0.05 && x.v < 0.6) && pinkPct.some((x) => x.v < 3.8 && x.v > 3.25));
  const dur = lastMove(pool);
  check("Duration ≈ 500–600 ms (pool count, no row delay)", dur > 450 && dur < 700, `${dur.toFixed(0)} ms`);
  // Đường cong giảm tốc: nửa thời gian đầu đi được hơn nửa quãng đường
  const half = pool.find((x) => x.t >= 275);
  check("Ease-out: more than half the way done at half the time", half && (half.v - 72) / 120 > 0.7, half && `${(((half.v - 72) / 120) * 100).toFixed(0)}% at ${half.t.toFixed(0)}ms`);
  const redStart = firstMove(redBar), pinkStart = firstMove(pinkBar);
  check("Rows staggered ≈ 40 ms (Red row starts before Pink row)", pinkStart - redStart >= 20 && pinkStart - redStart <= 75, `Red ${redStart.toFixed(0)} ms, Pink ${pinkStart.toFixed(0)} ms`);
  check("Numbers move together with their bar", Math.abs(firstMove(redPct) - redStart) <= 34 && Math.abs(firstMove(pinkPct) - pinkStart) <= 34,
    `Red % ${firstMove(redPct).toFixed(0)} / bar ${redStart.toFixed(0)}; Pink % ${firstMove(pinkPct).toFixed(0)} / bar ${pinkStart.toFixed(0)}`);
  s = await js(`settledOk()`);
  check("After the animation: values = effectiveChances, bars at target, sum 100%", s.ok, s.ok ? s.shown : s.bad.join("; "));

  // ---- 2. Không khóa nút trong lúc bảng chạy ----
  const h0 = await js(`state.history.length`);
  const busy = await js(`(() => { tickGen(1); const b = document.getElementById("btn-quick"); const was = b.disabled; b.click(); return { was, spinning: state.spinning }; })()`);
  await sleep(150);
  check("Buttons not locked while the odds animate (Quick open works mid-animation)", !busy.was && (await js(`state.history.length`)) === h0 + 1);
  await js(`document.getElementById("result-modal").close()`); await sleep(SETTLE);

  // ---- 3. Bấm gen liên tục nhanh: chạy tiếp từ giá trị đang hiện, không về 0, không chồng chéo ----
  const rapid = await js(`(async () => {
    const out = [], targets = [poolSize()], t0 = performance.now(); let done = false;
    const f = () => { out.push({ t: performance.now() - t0, ...frame() }); if (!done) requestAnimationFrame(f); };
    requestAnimationFrame(f);
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    for (const [g, ms] of [[3, 90], [9, 60], [4, 120], ["kazeran", 40], [1, 0]]) { tickGen(g); targets.push(poolSize()); await wait(ms); }
    await wait(${SETTLE}); done = true; await wait(50);
    return { out, targets };
  })()`);
  const { out: rapidFrames, targets } = rapid;
  const pools = rapidFrames.map((f) => Number(f.pool));
  const blue = rapidFrames.map((f) => f.rows.find((r) => r.tier === "blue").p);
  // Giá trị hiển thị luôn nằm giữa giá trị nhỏ nhất và lớn nhất trong các mục tiêu lần lượt
  const lo = Math.min(...pools), hi = Math.max(...pools);
  check("Rapid clicks: pool count stays between the targets, never 0 or \"—\"", rapidFrames.every((f) => /^\d+$/.test(f.pool))
    && lo >= Math.min(...targets) && hi <= Math.max(...targets), `shown ${lo}–${hi}, targets ${targets.join(" → ")}`);
  check("Rapid clicks: Blue bar never drops toward 0 (stays near 79.92)", Math.min(...blue) > 79, `min ${Math.min(...blue).toFixed(2)}`);
  let jumps = 0;
  for (let i = 1; i < pools.length; i++) if (Math.abs(pools[i] - pools[i - 1]) > 60) jumps++;
  check("Rapid clicks: no sudden jumps between frames", jumps === 0, `${jumps} jumps`);
  const tail = rapidFrames.filter((f) => f.t > rapidFrames.at(-1).t - 200);
  check("Rapid clicks: settles once, no leftover animation fighting (stable for the last 200 ms)", tail.every((f) => JSON.stringify(f) === JSON.stringify({ ...tail[0], t: f.t })));
  s = await js(`settledOk()`);
  check("Rapid clicks: final values = effectiveChances", s.ok, s.ok ? s.shown : s.bad.join("; "));

  // ---- 3b. None rồi chọn lại gen ngay: số % và thanh chạy cùng nhau từng khung hình (không lệch nhau) ----
  const resync = await js(`(async () => {
    const out = [], t0 = performance.now(); let done = false;
    const f = () => { out.push({ t: performance.now() - t0, ...frame() }); if (!done) requestAnimationFrame(f); };
    requestAnimationFrame(f);
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    document.getElementById("btn-none").click(); await wait(180); tickGen(6); await wait(${SETTLE}); done = true; await wait(50);
    return out;
  })()`);
  // Bộ ghi khung hình ở đây chạy trước app trong mỗi khung hình, nên chữ có thể là của khung hình trước:
  // so với thanh ở khung hình này hoặc khung hình trước, lấy sai lệch nhỏ hơn.
  let worst = 0;
  resync.forEach((f, i) => f.rows.forEach((r, k) => {
    if (!/%$/.test(r.pct)) return;
    const prev = i > 0 ? resync[i - 1].rows[k].p : r.p;
    const diff = Math.min(Math.abs(parseFloat(r.pct) - r.p), Math.abs(parseFloat(r.pct) - prev));
    worst = Math.max(worst, diff / Math.max(0.006, 0.005 * r.target)); // > 1 = lệch hơn sai số làm tròn 2 chữ số / 0.5%
  }));
  check("None then a gen 180 ms later: every frame the % shown matches its bar (only rounding error)", worst <= 1, `worst ${worst.toFixed(2)} of allowed`);
  check("…and \"—\" while the case is empty", resync.some((f) => f.rows.every((r) => r.pct === "—")));

  // ---- 4. Giá trị cuối khớp effectiveChances với nhiều bộ gen (bấm, chờ hiệu ứng xong) ----
  for (const [label, keys] of [["Gen 6 only", [6]], ["Gen 1 only", [1]], ["Special only", ["kazeran"]], ["Gen 9 only", [9]], ["All", null]]) {
    await js(keys ? `document.getElementById("btn-none").click(); ${JSON.stringify(keys)}.forEach(tickGen)` : `document.getElementById("btn-all").click()`);
    await sleep(SETTLE);
    s = await js(`settledOk()`);
    check(`${label}: after the animation, table = effectiveChances, sum 100%`, s.ok, s.ok ? s.shown : s.bad.join("; "));
  }
  // Hòm rỗng: "—" ngay, thanh về 0; chọn lại gen: đếm từ 0
  await js(`document.getElementById("btn-none").click()`); await sleep(SETTLE);
  const none = await js(`frame()`);
  check("None: \"—\" for counts and %, bars back to 0", none.rows.every((r) => r.pct === "—" && r.count === "—" && r.p === 0));
  const back = await js(`record(() => tickGen(6), 700)`);
  check("…ticking a gen again counts up from 0", back.some((f) => { const r = f.rows.find((x) => x.tier === "blue"); return r.p > 1 && r.p < 70 && parseFloat(r.pct) > 1 && parseFloat(r.pct) < 70; }));
  await sleep(300);

  // ---- 5. Panel Custom: lần đầu chạy từ 0; đổi hệ chạy từ giá trị cũ ----
  await js(`document.querySelector('.tab[data-view="custom"]').click()`); await sleep(300);
  check("Custom: no type yet → no odds rows", (await js(`document.querySelectorAll("#tr-odds-list .rarity-row").length`)) === 0);
  const first = await js(`record(() => document.querySelector('.action-quick[data-action="wheel"]').click(), 800, "#tr-odds-list", "custom-pool-count")`);
  const blueFirst = first.map((f) => (f.rows.find((r) => r.tier === "blue") || {}).p).filter((x) => x !== undefined);
  check("Type Roulette first odds: bars run from 0 to the target", blueFirst[0] < 20 && Math.abs(blueFirst.at(-1) - first.at(-1).rows.find((r) => r.tier === "blue").target) < 1e-6,
    `Blue ${blueFirst[0].toFixed(1)} → ${blueFirst.at(-1).toFixed(2)}`);
  const caseCount = await js(`document.querySelector("#tr-odds-count strong").textContent`);
  check("Type Roulette case count settles on the case size", caseCount === String(await js(`roulette.pools[roulette.selected].length`)), caseCount);
  s = await js(`settledOk("#tr-odds-list", groupByRarity(roulette.pools[roulette.selected]))`);
  check("Type Roulette: final odds = effectiveChances of the type", s.ok, s.ok ? s.shown : s.bad.join("; "));

  // ---- 6. Các hiệu ứng CSS khác ----
  const anim = (sel, name) => js(`(() => { const el = ${sel}; return el ? el.getAnimations().filter(a => a.animationName === "${name}").map(a => ({ d: a.effect.getTiming().duration, k: a.effect.getKeyframes() })) : null; })()`);
  // Bánh xe: đổi gen làm thêm / bớt ô → fade; bộ ô giữ nguyên → không
  await js(`document.getElementById("custom-all").click()`); await sleep(400);
  await js(`document.querySelector('#custom-gen-grid input[value="5"]').click()`);
  check("Wheel redraw with the same slices (18 → 18): no fade", (await anim(`document.querySelector("#tr-disc svg")`, "wheel-redraw")).length === 0);
  await js(`document.getElementById("custom-none").click(); document.querySelector('#custom-gen-grid input[value="1"]').click()`);
  const wf = await anim(`document.querySelector("#tr-disc svg")`, "wheel-redraw");
  check("Wheel loses a slice (Gen 1: no Dark) → redrawn wheel fades in", wf.length === 1 && wf[0].d === 350 && (await js(`document.querySelectorAll("#tr-disc .wheel-slice").length`)) === 17);
  await js(`document.getElementById("custom-all").click()`); await sleep(400);
  // Chuyển chế độ Custom / tab
  await js(`document.querySelector('.mode-btn[data-mode="biome-roulette"]').click()`);
  let a = await anim(`document.getElementById("mode-biome-roulette")`, "view-in");
  check("Switching Custom mode: panel fades/slides in (200 ms)", a.length === 1 && a[0].d === 200 && a[0].k[0].opacity === "0" && /translateY\(6px\)/.test(a[0].k[0].transform));
  await js(`document.querySelector('.tab[data-view="collection"]').click()`);
  a = await anim(`document.getElementById("view-collection")`, "view-in");
  check("Switching tab: page fades/slides in (200 ms)", a.length === 1 && a[0].d === 200);
  await js(`document.querySelector('.tab[data-view="case"]').click()`); await sleep(300);
  // Ô gen: dấu tick bật ra
  await js(`tickGen(2)`);
  const tick = await js(`document.getAnimations().filter(a => a.animationName === "tick-pop").map(a => a.effect.pseudoElement)`);
  check("Ticking a gen: the tick mark pops in", tick.length === 1 && tick[0] === "::after");
  await sleep(SETTLE);
  // Popup
  await js(`document.getElementById("btn-contents").click()`);
  a = await anim(`document.getElementById("contents-modal")`, "modal-enter");
  check("View case contents popup: fade + scale 0.96 → 1", a.length === 1 && a[0].k[0].opacity === "0" && a[0].k[0].transform === "scale(0.96)" && a[0].k.at(-1).transform === "scale(1)");
  await js(`document.getElementById("contents-modal").close()`);
  await js(`document.getElementById("btn-quick").click()`); await sleep(50);
  a = await anim(`document.getElementById("result-modal")`, "modal-enter");
  check("Result popup: fade + scale 0.96 → 1", a.length === 1 && a[0].k[0].transform === "scale(0.96)");
  await sleep(400); await js(`document.getElementById("result-modal").close()`);
  // Hover: nhấc ô gen lên 2px
  const box = await js(`(() => { const r = document.querySelector('#gen-grid .gen-option .gen-card').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  win.webContents.sendInputEvent({ type: "mouseMove", x: box.x, y: box.y }); await sleep(300);
  const lift = await js(`getComputedStyle(document.querySelector('#gen-grid .gen-option .gen-card')).transform`);
  check("Hover a gen card: lifts 2px", lift === "matrix(1, 0, 0, 1, 0, -2)", lift);
  win.webContents.sendInputEvent({ type: "mouseMove", x: 5, y: 5 }); await sleep(200);

  // ---- 7. Dải quay và bánh xe giữ nguyên thời gian ----
  await js(`document.getElementById("btn-spin").click()`); await sleep(400);
  check("Case reel still runs 6 s", /transform 6000ms/.test(await js(`document.querySelector("#reel .reel-strip").style.transition`)));
  for (let t = 0; t < 9000 && !(await js(`document.getElementById("result-modal").open`)); t += 100) await sleep(100);
  await js(`document.getElementById("result-modal").close()`);

  // ---- 8. Giảm chuyển động (hệ điều hành): hiện giá trị cuối ngay, không có hiệu ứng CSS ----
  win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const rm = await js(`(() => { tickGen(2); const f = frame(); return { f, ok: settledOk() }; })()`);
  check("Reduced motion: final values immediately after a gen change (numbers and bars)", rm.ok.ok && rm.f.rows.every((r) => Math.abs(r.p - r.target) < 1e-9), rm.ok.ok ? rm.ok.shown : rm.ok.bad.join("; "));
  await js(`document.querySelector('.tab[data-view="collection"]').click()`);
  check("Reduced motion: no tab fade", (await anim(`document.getElementById("view-collection")`, "view-in")).length === 0);
  await js(`document.querySelector('.tab[data-view="case"]').click(); document.getElementById("btn-contents").click()`);
  check("Reduced motion: no popup animation", (await anim(`document.getElementById("contents-modal")`, "modal-enter")).length === 0);
  await js(`document.getElementById("contents-modal").close()`);
  win.webContents.debugger.detach();

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
