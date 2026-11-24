// Kiểm tra không có cuộn ngang ở các độ rộng điện thoại, cho cả 4 trang.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-overflow"));
const PAGE = path.join(__dirname, "..", "..", "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 390, height: 800, show: false, webPreferences: { offscreen: true } });
  const js = (code) => win.webContents.executeJavaScript(code);
  await win.loadFile(PAGE, { query: { nomotion: "1" } }); await sleep(400);
  // Quay một lượt ở trang Custom để dải thẻ, bánh xe và bảng tỉ lệ đều có nội dung
  await js(`showView("custom"); document.querySelector('.action-quick[data-action="wheel"]').click(); document.querySelector('.action-quick[data-action="open"]').click(); document.getElementById("result-modal").close();
    selectCustomMode("biome-roulette"); document.querySelector('.action-quick[data-action="biome"]').click(); document.querySelector('.action-quick[data-action="open"]').click(); document.getElementById("result-modal").close()`); // trang Custom kiểm tra với Biome Roulette đang mở
  // Tab Challenge kiểm tra với đội đã đủ 6 ô (có mã TW1), nguồn Type Roulette để bánh xe hiện ra
  await js(`(async () => { selectChallengeSource("type"); for (let n = 0; n < 80 && (nextChallengeIndex() !== null || challenge.pending); n++) {
    if (challenge.pending) { keepChallengeLegend(); continue; }
    await runChallengeNext({ quick: true }); document.getElementById("result-modal").close(); }
    document.getElementById("ch-legend-modal").close(); return 1; })()`);
  for (const w of [320, 360, 390, 430, 768, 1280]) {
    win.setContentSize(w, 800); await sleep(300);
    for (const view of ["case", "collection", "custom", "challenge"]) {
      await js(`showView("${view}")`); await sleep(150);
      const r = await js(`(() => { const d = document.documentElement;
        const tabs = [...document.querySelectorAll(".tab")].map(t => t.getBoundingClientRect());
        // Phần tử nhô ra ngoài mép phải mà không nằm trong khung có overflow ẩn/cuộn
        const clipped = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return p !== d && p !== document.body; } return false; };
        const out = [...document.querySelectorAll("#view-${view} *, .tabs *")].filter(el => el.getClientRects().length && el.getBoundingClientRect().right > d.clientWidth + 0.5 && !clipped(el))
          .slice(0, 4).map(el => el.tagName.toLowerCase() + "." + [...el.classList].join(".") + " → " + el.getBoundingClientRect().right.toFixed(0));
        return { sw: d.scrollWidth, cw: d.clientWidth, tabRight: Math.max(...tabs.map(b => b.right)), tabLeft: Math.min(...tabs.map(b => b.left)), out }; })()`);
      const ok = r.sw <= r.cw && r.tabRight <= r.cw && r.tabLeft >= 0;
      if (!ok) fails++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${w}px ${view}: scrollWidth ${r.sw} / ${r.cw}, tabs ${r.tabLeft.toFixed(0)}–${r.tabRight.toFixed(0)}${r.out.length ? "  overflow: " + r.out.join(", ") : ""}`);      // Nút Roll của tab Challenge: chữ dài nhất vẫn hiện đủ (không bị cắt "…", không tràn khỏi nút)
      if (view === "challenge") {
        // Một nút (Case, "Reroll N slots"), rồi hai nút cạnh nhau của nguồn Roulette (Spin … wheel | Open … case)
        const fit = await js(`(() => { const group = document.getElementById("ch-spin-group"), row = document.getElementById("ch-actions");
          const was = { hidden: group.hidden, pair: row.classList.contains("is-pair") };
          const bad = [];
          const tryLabels = (id, labels) => { const btn = document.getElementById(id), lab = btn.querySelector(".action-label"), before = lab.textContent;
            for (const t of labels) { lab.textContent = t;
              const b = btn.getBoundingClientRect(), l = lab.getBoundingClientRect();
              if (lab.scrollWidth > lab.clientWidth + 1 || l.left < b.left - 0.5 || l.right > b.right + 0.5 || l.top < b.top - 0.5 || l.bottom > b.bottom + 0.5) bad.push(id + ": " + t); }
            lab.textContent = before; };
          group.hidden = true; row.classList.remove("is-pair");
          tryLabels("ch-roll", ["Reroll slot 6 · Letter Roulette", "Reroll slot 6 · Biome Roulette", "Roll slot 6 · Case", "Reroll 3 slots", "Pick slots to reroll", "Team complete"]);
          group.hidden = false; row.classList.add("is-pair");
          tryLabels("ch-spin", ["Spin letter wheel", "Spin biome wheel", "Spin type wheel", "Spinning…"]);
          tryLabels("ch-roll", ["Open Fighting case", "Open Electric case", "Open Legendary case", "Open case", "Opening…"]);
          group.hidden = was.hidden; row.classList.toggle("is-pair", was.pair);
          return { bad }; })()`);
        const fits = fit.bad.length === 0;
        if (!fits) fails++;
        console.log(`${fits ? "PASS" : "FAIL"}  ${w}px challenge: Roll / Spin / Open buttons show their whole labels${fits ? "" : "  cut: " + fit.bad.join(" | ")}`);
      }
    }
  }
  win.setContentSize(360, 300); await js(`showView("custom")`); await sleep(300);
  fs.writeFileSync(path.join(SHOTS, "tabs-360.png"), (await win.webContents.capturePage()).toPNG());
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
