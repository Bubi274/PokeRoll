// Ảnh đá Mega (PNG 16×16 của mod) trong Electron, render offscreen: mọi thẻ đá hiện ảnh PNG (không rơi về SVG) ở dải quay,
// popup, View case contents, bộ sưu tập, Recent drops, Roll history — khi mở bằng file:// và qua server tĩnh (http://).
// Ảnh phóng to theo bội số nguyên của 16, giữ nét pixel. Ảnh lỗi thì thay bằng biểu tượng SVG.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const TMP = path.join(require("os").tmpdir(), "pokeroll-tests");
app.setPath("userData", path.join(TMP, "userdata-megastone-images"));
const ROOT = path.join(__dirname, "..", "..");
const PAGE = path.join(ROOT, "index.html");
const SHOTS = path.join(TMP, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

// Server tĩnh tối giản cho thư mục app (chỉ GET, không ra ngoài thư mục gốc)
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };
function startServer() {
  const server = http.createServer((req, res) => {
    const file = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

process.on("unhandledRejection", (e) => { console.log("FAIL  test crashed: " + e); app.exit(1); });
app.whenReady().then(async () => {
  const server = await startServer();
  const win = new BrowserWindow({ width: 1300, height: 900, show: false, webPreferences: { backgroundThrottling: false, offscreen: true } });
  win.webContents.setFrameRate(60);
  let errors = [];
  win.webContents.on("console-message", (e, level, msg) => {
    const lv = e.level !== undefined ? e.level : level, text = e.message !== undefined ? e.message : msg;
    if (lv === "error" || lv === 3) errors.push(text);
  });
  const js = (code) => win.webContents.executeJavaScript(code);
  const shot = async (name) => { await sleep(300); fs.writeFileSync(path.join(SHOTS, name), (await win.webContents.capturePage()).toPNG()); };
  const waitFor = async (cond, ms = 8000) => { const t0 = Date.now(); for (;;) { if (await js(cond)) return true; if (Date.now() - t0 >= ms) return false; await sleep(50); } };
  const tab = async (v) => { await js(`document.querySelector('.tab[data-view="${v}"]').click()`); await sleep(200); };
  const quick = () => js(`document.querySelector('.action-quick[data-action="open"]').click()`);
  const closeAll = () => js(`document.querySelectorAll("dialog[open]").forEach(d => d.close())`);

  // Ảnh đá trong vùng sel: đã tải xong, đúng PNG 16×16 của viên đó, không có SVG dự phòng; cỡ hiển thị và cách phóng to
  const imagesIn = (sel) => js(`(async () => {
    const root = document.querySelector(${JSON.stringify(sel)});
    const imgs = [...root.querySelectorAll("img.stone-img")];
    for (let i = 0; i < 160 && !imgs.every(im => im.complete); i++) await new Promise(r => setTimeout(r, 50));
    // Đo khi hiệu ứng (thẻ thắng nảy lên, ảnh popup hiện ra) đã chạy xong — đo giữa chừng thì cỡ đang đổi
    await Promise.all(document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
    const px = (x) => Math.round(x * 100) / 100; // thẻ thắng: 1.04 × (1 / 1.04) có sai số làm tròn rất nhỏ
    const sizes = [...new Set(imgs.map(im => px(im.getBoundingClientRect().width) + "x" + px(im.getBoundingClientRect().height)))];
    return { count: imgs.length, icons: root.querySelectorAll(".stone-icon").length, svg: root.querySelectorAll(".stone-icon svg.gem").length,
      loaded: imgs.filter(im => im.complete && im.naturalWidth === 16 && im.naturalHeight === 16).length,
      png: imgs.every(im => /assets\\/images\\/megastones\\/[^/]+\\.png$/.test(im.src)),
      pixelated: imgs.every(im => getComputedStyle(im).imageRendering === "pixelated"),
      sizes, multiple: imgs.every(im => { const b = im.getBoundingClientRect(); return b.width > 0 && px(b.width) % 16 === 0 && px(b.height) === px(b.width); }) };
  })()`);
  const allPng = (r, n) => r.count === n && r.icons === n && r.loaded === n && r.svg === 0 && r.png && r.pixelated && r.multiple;

  for (const [label, load] of [
    ["file://", () => win.loadFile(PAGE, { query: { nomotion: "1" } })],
    ["http://", () => win.loadURL(`http://127.0.0.1:${server.address().port}/index.html?nomotion`)],
  ]) {
    errors = [];
    win.setContentSize(1300, 900);
    await load();
    await js(`localStorage.clear(); localStorage.setItem("pokeroll.custom.mode", '"minigame"'); localStorage.setItem("pokeroll.minigame.case", '"megastone"')`);
    await win.webContents.reload(); await sleep(500);
    check(`${label} page loaded`, await js(`location.protocol === "${label.slice(0, -2)}" && custom.active.key === "minigame" && minigame.selected.key === "megastone"`));
    await tab("custom");

    // Dải quay lúc chưa mở
    let r = await imagesIn("#mg-reel");
    check(`${label} idle reel: every stone card shows its PNG, ×16 size (96px), pixelated`, allPng(r, 12) && r.sizes.join() === "96x96", JSON.stringify(r));

    // View case contents: cả 156 viên
    await js(`document.getElementById("custom-contents").click()`); await sleep(300);
    r = await imagesIn("#contents-body");
    check(`${label} View case contents: all 156 stones show their PNG (48px), none fell back to SVG`, allPng(r, 156) && r.sizes.join() === "48x48", JSON.stringify(r));
    if (label === "http://") { await js(`document.getElementById("contents-search").value = "charizard"; filterContents()`); await shot("mg-img-contents.png"); }
    await closeAll();

    // Mở hòm: thẻ thắng và popup
    for (let i = 0; i < 12; i++) { await quick(); await closeAll(); }
    await quick(); await sleep(200);
    const winId = await js(`minigame.history[0].item`);
    r = await imagesIn("#mg-reel");
    check(`${label} reel after opening: all 60 cards show their PNG`, allPng(r, 60), JSON.stringify(r));
    check(`${label} winner card shows the won stone's PNG`, await js(`document.querySelector("#mg-reel .card.is-winner img.stone-img").getAttribute("src") === "assets/images/megastones/${winId}.png"`));
    r = await imagesIn("#result-body");
    check(`${label} popup: the stone's PNG at 192px (12×), pixelated, Pokémon image kept in the corner`, allPng(r, 1) && r.sizes.join() === "192x192"
      && await js(`document.querySelector("#result-body img.stone-img").getAttribute("src") === "assets/images/megastones/${winId}.png"
        && (!MEGA_STONES.find(s => s.id === ${JSON.stringify(winId)}).pokemonId || !!document.querySelector("#result-body .stone-mon"))`), JSON.stringify(r));
    if (label === "http://") {
      await shot("mg-img-popup.png");
      await closeAll(); await js(`window.scrollTo(0, 0)`); await shot("mg-img-reel.png");
    }
    await closeAll();

    // Recent drops (32px)
    await tab("case");
    r = await imagesIn("#recent-row");
    check(`${label} Recent drops: stone PNGs at 32px`, allPng(r, r.count) && r.count === 12 && r.sizes.join() === "32x32", JSON.stringify(r));

    // Bộ sưu tập đá (64px) và Roll history (32px)
    await tab("collection");
    r = await imagesIn("#mgc-megastone-grid");
    check(`${label} Mega Stones collection: all 156 tiles show their PNG (64px), owned or missing`, allPng(r, 156) && r.sizes.join() === "64x64", JSON.stringify(r));
    r = await imagesIn("#history-list");
    check(`${label} Roll history: stone PNGs at 32px`, allPng(r, 13) && r.sizes.join() === "32x32", JSON.stringify(r));
    await js(`document.querySelector('#mgc-megastone-grid [data-item="mushironitex"]').click()`); await sleep(200);
    r = await imagesIn("#detail-body");
    check(`${label} stone detail popup: PNG at 192px; Mushiro has no Pokémon image in the corner`, allPng(r, 1) && r.sizes.join() === "192x192" && !(await js(`!!document.querySelector("#detail-body .stone-mon")`)), JSON.stringify(r));
    await closeAll();
    if (label === "http://") { await js(`document.getElementById("mgc-megastone").scrollIntoView(); 0`); await shot("mg-img-collection.png"); }

    // Điện thoại 390px: cỡ nhỏ hơn, vẫn là bội số của 16
    win.setContentSize(390, 800); await sleep(400);
    r = await imagesIn("#mgc-megastone-grid");
    check(`${label} 390px collection: 48px`, allPng(r, 156) && r.sizes.join() === "48x48", JSON.stringify(r));
    if (label === "http://") { await js(`document.getElementById("mgc-megastone-grid").scrollIntoView(); 0`); await shot("mg-img-collection-390.png"); }
    await tab("custom");
    await quick(); await sleep(300);
    r = await imagesIn("#result-body");
    check(`${label} 390px popup: 128px (8×)`, allPng(r, 1) && r.sizes.join() === "128x128", JSON.stringify(r));
    if (label === "http://") await shot("mg-img-popup-390.png");
    await closeAll();
    r = await imagesIn("#mg-reel");
    check(`${label} 390px reel cards: 64px (4×)`, allPng(r, 60) && r.sizes.join() === "64x64", JSON.stringify(r));
    if (label === "http://") { await js(`window.scrollTo(0, 0)`); await shot("mg-img-reel-390.png"); }
    check(`${label} no console errors`, errors.length === 0, errors.slice(0, 3).join(" | "));

    // Ảnh không tải được → biểu tượng SVG (giữ màu theo hệ, giữ ảnh Pokémon ở góc)
    await js(`document.body.insertAdjacentHTML("beforeend", '<div id="fallback-test">' + stoneIcon({ ...MEGA_STONES.find(s => s.id === "venusaurite"), id: "no-such-stone" }, "mini-img") + '</div>')`);
    const fell = await waitFor(`!!document.querySelector("#fallback-test svg.gem") && !document.querySelector("#fallback-test img.stone-img")`, 5000);
    check(`${label} missing stone image falls back to the SVG icon`, fell && await js(`!!document.querySelector("#fallback-test .stone-mon") && document.querySelector("#fallback-test .stone-icon").style.getPropertyValue("--gem") !== ""`));
  }

  server.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  app.exit(fails ? 1 : 0);
});
