// Kiểm tra logic Minigame Case bằng Node: dữ liệu đá Mega, chọn đều 1/N (mô phỏng có seed), không Shiny,
// lịch sử Minigame giới hạn riêng, và code Minigame không dùng hàm quay / độ hiếm của hòm chính.
const fs = require("fs"), path = require("path");
const { loadApp, appFiles } = require("../sources");
const ROOT = path.join(__dirname, "..", "..");
const { A, ALL, ctx } = loadApp({
  data: ["data/data.js", "data/special.js", "data/megastones.js"],
  extra: ";state.pokemon = __all; state.dex = __all.filter((p) => !p.group); state.byId = new Map(__all.map((p) => [p.id, p]));"
    + "globalThis.__mods = MEGA_STONE_MODS;",
});
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

// Bộ sinh số ngẫu nhiên cố định (mulberry32) để kết quả lặp lại được
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1. Dữ liệu đá Mega
const S = A.MEGA_STONES;
const ids = S.map((s) => s.id);
check("data/megastones.js has 156 stones", S.length === 156, String(S.length));
check("Stone ids are unique", new Set(ids).size === S.length);
check("Every stone has a name, mod, Pokémon, form and recipe", S.every((s) => s.name && s.mod && s.pokemon && /^Mega( [XYZ])?$/.test(s.form) && s.recipe.length > 0));
const modKeys = ctx.__mods.map((m) => m.key);
const perMod = Object.fromEntries(modKeys.map((k) => [k, S.filter((s) => s.mod === k).length]));
check("Mods: Mega Showdown 81, ZA Mega 11, Mushiromega 64", perMod["mega-showdown"] === 81 && perMod["za-mega"] === 11 && perMod.mushiromega === 64, JSON.stringify(perMod));
check("Stats and BST agree when listed", S.every((s) => !s.stats || s.bst === Object.values(s.stats).reduce((a, b) => a + b, 0)));
const noMon = [...new Set(S.filter((s) => !s.pokemonId).map((s) => s.pokemon))];
check("Every Pokémon is found in the app except Mushiro", noMon.join() === "Mushiro", noMon.join());
check("pokemonId points to the Pokémon of the same name", S.every((s) => !s.pokemonId || ALL.find((p) => p.id === s.pokemonId).name === s.pokemon));
check("Generated file matches the CSV row count", fs.readFileSync(path.join(ROOT, "scripts/data/mega-stones.csv"), "utf8").trim().split("\n").length - 1 === S.length);

// 1b. Ảnh đá (assets/images/megastones/<stone_id>.png, chép từ file mod bằng scripts/build-megastone-images.js)
const IMG_DIR = path.join(ROOT, "assets/images/megastones");
const pngs = fs.existsSync(IMG_DIR) ? fs.readdirSync(IMG_DIR).filter((f) => f.endsWith(".png")) : [];
const missingImg = ids.filter((id) => !pngs.includes(`${id}.png`));
check("All 156 stone images exist, one per stone id, nothing extra", missingImg.length === 0 && pngs.length === 156, missingImg.join(", ") || `${pngs.length} files`);
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const badImg = pngs.filter((f) => {
  const b = fs.readFileSync(path.join(IMG_DIR, f));
  return !(b.subarray(0, 8).equals(SIG) && b.toString("ascii", 12, 16) === "IHDR" && b.readUInt32BE(16) === 16 && b.readUInt32BE(20) === 16);
});
check("Every stone image is a PNG of 16×16", badImg.length === 0, badImg.join(", "));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
check("Stone images are packaged in the desktop build (build.files)", pkg.build.files.some((f) => f === "assets/**" || f === "assets/images/**" || f === "assets/images/megastones/**"));

// 2. Các hòm đã đăng ký
const cases = A.MINIGAME_CASES;
check("Two Minigame cases registered: Pokémon Case, Mega Stone Case", cases.map((c) => c.key).join() === "pokemon,megastone" && cases.map((c) => c.name).join() === "Pokémon Case,Mega Stone Case");
const pkm = A.minigameCase("pokemon"), stones = A.minigameCase("megastone");
check("Pokémon Case holds every Pokémon (1025 + Special), no gen filter", pkm.items().length === 1033 && pkm.items().length === ALL.length);
check("Mega Stone Case holds all 156 stones", stones.items().length === 156);
check("Pokémon Case is not collected; Mega Stone Case has its own collection", pkm.collect === false && stones.collect && stones.collect.title === "Mega Stones");
check("idOf / byId round-trip in both cases", cases.every((c) => c.items().every((it) => c.byId(c.idOf(it)) === it)));

// 3. Chọn đều: mỗi vật phẩm ~1/N (mô phỏng có seed, trong 5σ), không Shiny, không độ hiếm
for (const [c, perItem, seed] of [[pkm, 300, 11], [stones, 2000, 23]]) {
  const items = c.items(), N = items.length, M = N * perItem, r = rng(seed);
  const counts = new Map(items.map((it) => [it, 0]));
  let outside = 0, extra = 0;
  for (let i = 0; i < M; i++) {
    const it = A.pickUniform(items, r);
    if (!counts.has(it)) { outside++; continue; }
    counts.set(it, counts.get(it) + 1);
  }
  const p = 1 / N, sd = Math.sqrt(p * (1 - p) / M);
  const worst = Math.max(...[...counts.values()].map((n) => Math.abs(n / M - p) / sd));
  const chi = [...counts.values()].reduce((s, n) => s + (n - M * p) ** 2 / (M * p), 0);
  // χ² với N-1 bậc tự do: trung bình N-1, độ lệch chuẩn √(2(N-1))
  const chiZ = (chi - (N - 1)) / Math.sqrt(2 * (N - 1));
  check(`${c.name}: every item comes up ~1/${N} (${M.toLocaleString()} picks, within 5σ)`, outside === 0 && worst < 5, `worst ${worst.toFixed(2)}σ`);
  check(`${c.name}: counts fit a uniform distribution (χ² z-score < 4)`, Math.abs(chiZ) < 4, `χ²=${chi.toFixed(0)}, z=${chiZ.toFixed(2)}`);
  check(`${c.name}: every item drawn at least once`, [...counts.values()].every((n) => n > 0));
  // Phần Minigame trả về đúng vật phẩm, không gắn shiny / rarity
  const reel = A.buildUniformReel(items[0], items, 60, 49, rng(seed + 1));
  extra = reel.filter((it) => !counts.has(it)).length;
  check(`${c.name}: reel has the winner at index 49 and 60 items from the case`, reel.length === 60 && reel[49] === items[0] && extra === 0);
}
check("pickUniform: rng() just below 1 still returns the last item; empty case → null",
  A.pickUniform([1, 2, 3], () => 0.9999999999) === 3 && A.pickUniform([], Math.random) === null);

// 4. Ghi lượt: không Shiny, không độ hiếm; lịch sử Minigame giới hạn riêng 200; bộ sưu tập đếm trùng
const history = [], col = {};
for (let i = 0; i < 250; i++) A.recordMinigameDrop(history, col, "megastone", ids[i % 3], 1000 + i);
check("Minigame history keeps only the last 200, newest first", history.length === 200 && A.MINIGAME_HISTORY_LIMIT === 200 && history[0].t === 1249 && history[199].t === 1050);
check("History entries: { mode: minigame, detail, item, t } — no rarity, no shiny, no Pokémon id",
  history.every((h) => h.mode === "minigame" && h.detail === "megastone" && ids.includes(h.item) && !("rarity" in h) && !("shiny" in h) && !("id" in h)));
check("Collection counts every drop, including ones past the history limit", col[ids[0]].count === 84 && col[ids[1]].count === 83 && col[ids[2]].count === 83 && col[ids[0]].first === 1000);
const h2 = [];
check("Uncollected case (collection = null): history only, returns null", A.recordMinigameDrop(h2, null, "pokemon", 25) === null && h2.length === 1 && h2[0].item === 25);

// 5. Code Minigame không dùng hàm quay / độ hiếm / Shiny của hòm chính
const FORBIDDEN = /\b(getRarity|rollOnce|rollRarityKey|resolveRarity|effectiveChances|dropOdds|groupByRarity|buildReelItems|pickRandom|recordDrop|RARITIES|SHINY_CHANCE|rarityInfo)\b/g;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const mgFiles = appFiles.filter((f) => /modes\/minigame/.test(f));
const hits = mgFiles.flatMap((f) => (strip(fs.readFileSync(path.join(ROOT, f), "utf8")).match(FORBIDDEN) || []).map((h) => `${f}: ${h}`));
check(`Minigame code (${mgFiles.length} files) uses none of the main case's roll / rarity / Shiny functions`, mgFiles.length === 3 && hits.length === 0, hits.join(", "));

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
