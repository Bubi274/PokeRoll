// Ảnh đá Mega sắc nét ở mọi devicePixelRatio (100%, 125%, 150%, 175%, 200%), trong Electron, render offscreen:
// mỗi pixel gốc (ảnh 16×16) phủ đúng số nguyên pixel màn hình, cỡ gần cỡ mong muốn nhất; cập nhật khi đổi mức phóng
// (setZoomFactor) và khi đổi tỉ lệ màn hình (giả lập kéo cửa sổ sang màn hình khác bằng Emulation.setDeviceMetricsOverride).
const { app, BrowserWindow, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-megastone-dpr"));
const ROOT = path.join(__dirname, "..", "..");
const PAGE = path.join(ROOT, "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

// Cỡ mong muốn (CSS px) của từng chỗ hiện ảnh đá, ở màn hình rộng — giống modes/minigame.css
const TARGETS = { "#mg-reel": 96, "#result-body": 192, "#contents-body": 48, "#mgc-megastone-grid": 64, "#recent-row": 32, "#history-list": 32 };
// Cỡ thật cần có: cỡ × dpr làm tròn tới bội số của 16 pixel màn hình (ít nhất 16), đổi lại ra CSS px
const expected = (target, dpr) => { const dev = Math.max(16, Math.round((target * dpr) / 16) * 16); return { dev, css: dev / dpr }; };

process.on("unhandledRejection", (e) => { console.log("FAIL  test crashed: " + e); app.exit(1); });
app.whenReady().then(async () => {
  // Cửa sổ cao để ở 200% (vùng nhìn = 650×800 CSS px) popup vẫn hiện trọn ảnh đá
  const win = new BrowserWindow({ width: 1300, height: 1600, show: false, webPreferences: { backgroundThrottling: false, offscreen: true } });
  win.webContents.setFrameRate(60);
  const errors = [];
  win.webContents.on("console-message", (e, level, msg) => {
    const lv = e.level !== undefined ? e.level : level, text = e.message !== undefined ? e.message : msg;
    if (lv === "error" || lv === 3) errors.push(text);
  });
  const js = (code) => win.webContents.executeJavaScript(code);
  const waitFor = async (cond, ms = 4000) => { const t0 = Date.now(); for (;;) { if (await js(cond)) return true; if (Date.now() - t0 >= ms) return false; await sleep(50); } };
  const closeAll = () => js(`document.querySelectorAll("dialog[open]").forEach(d => d.close())`);

  await win.loadFile(PAGE, { query: { nomotion: "1" } });
  await js(`localStorage.clear(); localStorage.setItem("pokeroll.custom.mode", '"minigame"'); localStorage.setItem("pokeroll.minigame.case", '"megastone"')`);
  await win.webContents.reload(); await sleep(500);
  // Có vài lượt mở để Recent drops, Roll history, bộ sưu tập có ảnh đá
  await js(`showView("custom"); for (let i = 0; i < 5; i++) { runCustomAction("open", { quick: true }); document.getElementById("result-modal").close(); } 0`);
  check("CSS round() is supported here (the DPR-aware sizing is active)", await js(`CSS.supports("width", "round(nearest, 10px, 16px)")`));

  // Cỡ ảnh đá trong vùng sel (đo khi hiệu ứng đã xong)
  const measure = (sel) => js(`(async () => {
    const imgs = [...document.querySelectorAll(${JSON.stringify(sel)} + " img.stone-img")];
    for (let i = 0; i < 100 && !imgs.every(im => im.complete); i++) await new Promise(r => setTimeout(r, 30));
    await Promise.all(document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
    return { count: imgs.length, widths: [...new Set(imgs.map(im => Math.round(im.getBoundingClientRect().width * 1000) / 1000))],
      heights: [...new Set(imgs.map(im => Math.round(im.getBoundingClientRect().height * 1000) / 1000))] };
  })()`);

  // Ảnh chụp thật: mỗi pixel gốc không trong suốt phải là một khối n×n pixel màn hình đồng màu (không bị trộn ở mép)
  async function crispCheck(dpr, label) {
    // Ẩn ảnh Pokémon ở góc (đè lên đá) và đưa ảnh đá vào giữa khung popup trước khi chụp
    const info = await js(`(async () => { const im = document.querySelector("#result-body img.stone-img");
      document.querySelectorAll("#result-body .stone-mon").forEach(m => m.style.visibility = "hidden");
      im.scrollIntoView({ block: "center" }); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = im.getBoundingClientRect();
      return { id: im.getAttribute("src").split("/").pop(), x: r.left, y: r.top, w: r.width }; })()`);
    await sleep(250); // khung hình offscreen kịp vẽ lại
    const n = Math.round((info.w * dpr) / 16);
    const src = nativeImage.createFromPath(path.join(ROOT, "assets/images/megastones", info.id)).toBitmap(); // BGRA 16×16
    const pad = 2;
    const zoom = win.webContents.getZoomFactor();
    // capturePage nhận toạ độ theo DIP (= CSS px × zoom); ảnh trả về theo pixel màn hình
    const shot = await win.webContents.capturePage({ x: Math.floor(info.x * zoom) - pad, y: Math.floor(info.y * zoom) - pad, width: Math.ceil(info.w * zoom) + pad * 2, height: Math.ceil(info.w * zoom) + pad * 2 });
    const scale = shot.getSize().width / (Math.ceil(info.w * zoom) + pad * 2);
    const bmp = shot.toBitmap(), W = shot.getSize().width, H = shot.getSize().height;
    const at = (x, y) => { const i = (y * W + x) * 4; return [bmp[i], bmp[i + 1], bmp[i + 2]]; };
    const origin = (info.x * zoom - (Math.floor(info.x * zoom) - pad)) * scale, originY = (info.y * zoom - (Math.floor(info.y * zoom) - pad)) * scale;
    let best = 0, total = 0;
    for (const dx of [-2, -1, 0, 1, 2]) for (const dy of [-2, -1, 0, 1, 2]) {
      let good = 0; total = 0;
      for (let sy = 0; sy < 16; sy++) for (let sx = 0; sx < 16; sx++) {
        if (src[(sy * 16 + sx) * 4 + 3] !== 255) continue; // chỉ pixel đặc (pixel trong suốt lộ bóng đổ phía sau)
        total++;
        const x0 = Math.round(origin) + dx + sx * n, y0 = Math.round(originY) + dy + sy * n;
        if (x0 < 0 || y0 < 0 || x0 + n > W || y0 + n > H) continue;
        const c = at(x0, y0);
        let same = true;
        for (let y = y0; y < y0 + n && same; y++) for (let x = x0; x < x0 + n; x++) {
          const d = at(x, y);
          if (Math.abs(d[0] - c[0]) > 2 || Math.abs(d[1] - c[1]) > 2 || Math.abs(d[2] - c[2]) > 2) { same = false; break; }
        }
        if (same) good++;
      }
      best = Math.max(best, good);
    }
    fs.writeFileSync(path.join(SHOTS, `mg-dpr-${label}-${dpr}.png`), shot.toPNG());
    return { n, scale, ratio: total ? best / total : 0, total };
  }

  async function checkAll(dpr, label) {
    const got = await js(`({ dpr: window.devicePixelRatio, css: getComputedStyle(document.documentElement).getPropertyValue("--dpr").trim() })`);
    check(`${label} ${dpr}: devicePixelRatio and --dpr follow`, Math.abs(got.dpr - dpr) < 1e-6 && Math.abs(Number(got.css) - dpr) < 1e-6, JSON.stringify(got));
    const sizes = {};
    await js(`showView("custom")`); await sleep(150);
    sizes["#mg-reel"] = await measure("#mg-reel");
    await js(`document.getElementById("custom-contents").click()`); await sleep(200);
    sizes["#contents-body"] = await measure("#contents-body");
    await closeAll();
    await js(`document.querySelector('.action-quick[data-action="open"]').click()`); await sleep(200);
    sizes["#result-body"] = await measure("#result-body");
    const crisp = await crispCheck(dpr, label);
    await closeAll();
    sizes["#mg-reel"] = await measure("#mg-reel"); // sau khi mở: có cả thẻ thắng (phóng 1.04, ảnh đá thu lại)
    await js(`showView("case")`); await sleep(150);
    sizes["#recent-row"] = await measure("#recent-row");
    await js(`showView("collection")`); await sleep(200);
    sizes["#mgc-megastone-grid"] = await measure("#mgc-megastone-grid");
    sizes["#history-list"] = await measure("#history-list");
    for (const [sel, target] of Object.entries(TARGETS)) {
      const s = sizes[sel], e = expected(target, dpr);
      const ok = s.count > 0 && s.widths.length === 1 && s.heights.length === 1
        && Math.abs(s.widths[0] - e.css) < 0.05 && Math.abs(s.heights[0] - e.css) < 0.05 && Math.abs(s.widths[0] * dpr - e.dev) < 0.1 && e.dev % 16 === 0;
      check(`${label} ${dpr}: ${sel} (${target}px wanted) → ${e.dev / 16} screen px per source pixel, ${e.css.toFixed(2)} CSS px`, ok, JSON.stringify(s));
    }
    check(`${label} ${dpr}: popup screenshot — every solid source pixel is a uniform ${crisp.n}×${crisp.n} block of screen pixels`, crisp.ratio >= 0.98 && crisp.total > 20, JSON.stringify(crisp));
  }

  // 1. Đổi mức phóng (Ctrl + / Ctrl −): devicePixelRatio = zoom
  for (const z of [1, 1.25, 1.5, 1.75, 2]) {
    win.webContents.setZoomFactor(z);
    await waitFor(`Math.abs(window.devicePixelRatio - ${z}) < 1e-6 && getComputedStyle(document.documentElement).getPropertyValue("--dpr").trim() === String(window.devicePixelRatio)`);
    await checkAll(z, "zoom");
  }
  win.webContents.setZoomFactor(1);
  await waitFor(`window.devicePixelRatio === 1`);

  // 2. Kéo cửa sổ sang màn hình có tỉ lệ khác (không đổi mức phóng): giả lập deviceScaleFactor.
  // Giả lập của Chromium chỉ báo thay đổi (media query / resize) khi bỏ giả lập rồi đặt lại, hoặc khi cỡ vùng nhìn cũng đổi —
  // đổi tỉ lệ tại chỗ thì devicePixelRatio đổi mà không có sự kiện nào (màn hình thật thì có). Nên ở đây mô phỏng cả hai kiểu:
  // từ màn hình 1× sang màn hình d (bỏ giả lập rồi đặt), và đi thẳng từ màn hình này sang màn hình khác (cỡ vùng nhìn đổi theo).
  win.webContents.debugger.attach("1.3");
  for (const [i, d] of [1.25, 1.5, 1.75, 2, 1.25].entries()) {
    const direct = i % 2 === 1;
    if (!direct) await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
    await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride",
      direct ? { width: 1300 - i * 20, height: 1600, deviceScaleFactor: d, mobile: false } : { width: 0, height: 0, deviceScaleFactor: d, mobile: false });
    const moved = await waitFor(`Math.abs(window.devicePixelRatio - ${d}) < 1e-6 && getComputedStyle(document.documentElement).getPropertyValue("--dpr").trim() === String(window.devicePixelRatio)`);
    check(`screen ${d} (${direct ? "straight from the previous screen" : "from a 1× screen"}): --dpr updated without a reload`, moved);
    // Ảnh chụp offscreen không theo tỉ lệ giả lập, nên ở đây chỉ đo kích thước
    await js(`showView("custom")`); await sleep(150);
    const s = { reel: await measure("#mg-reel") };
    await js(`showView("collection")`); await sleep(150);
    s.coll = await measure("#mgc-megastone-grid");
    const eReel = expected(96, d), eColl = expected(64, d);
    check(`screen ${d}: reel ${eReel.css.toFixed(2)}px, collection ${eColl.css.toFixed(2)}px (whole screen pixels per source pixel)`,
      Math.abs(s.reel.widths[0] - eReel.css) < 0.05 && Math.abs(s.coll.widths[0] - eColl.css) < 0.05 && s.reel.widths.length === 1 && s.coll.widths.length === 1, JSON.stringify(s));
    await js(`showView("custom")`); await sleep(100);
  }
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  check("back to the real screen: --dpr = 1 again", await waitFor(`window.devicePixelRatio === 1 && getComputedStyle(document.documentElement).getPropertyValue("--dpr").trim() === "1"`));
  win.webContents.debugger.detach();

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
