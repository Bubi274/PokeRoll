// Kiểm tra logic Letter Roulette bằng Node: xếp chữ cái, tỉ lệ chữ, tỉ lệ độ hiếm trong từng chữ, góc dừng bánh xe 26 ô.
const fs = require("fs"), vm = require("vm"), path = require("path");
const dir = path.join(__dirname, "..", "..");
const ctx = { console, Math, module: {} };
vm.createContext(ctx);
vm.runInContext(["data.js", "special.js", "app.js"].map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n")
  + "\n;globalThis.__all=[...POKEMON_DATA,...SPECIAL_DATA].map(p=>({...p,rarity:getRarity(p)}));", ctx);
const A = ctx.module.exports, ALL = ctx.__all;
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
const byName = (n) => ALL.find((p) => p.name === n);

// 1. Mọi Pokémon thuộc đúng một chữ A–Z
const noLetter = ALL.filter((p) => !/^[A-Z]$/.test(A.letterOf(p) || ""));
check(`All ${ALL.length} Pokémon (1025 + Special) get a letter A–Z`, ALL.length === 1033 && noLetter.length === 0, noLetter.map((p) => p.name).join(", ") || "none missing");
const pools = A.letterPools(ALL);
const placed = Object.values(pools).flat();
check("Each Pokémon is in exactly one letter", placed.length === ALL.length && new Set(placed).size === ALL.length
  && Object.entries(pools).every(([l, list]) => list.every((p) => A.letterOf(p) === l)));
check("26 letters in A–Z order", Object.keys(pools).join("") === "ABCDEFGHIJKLMNOPQRSTUVWXYZ" && A.LETTERS.length === 26);

// 2. Tên đặc biệt
const cases = { "Flabébé": "F", "Mr. Mime": "M", "Nidoran♀": "N", "Nidoran♂": "N", "Type: Null": "T", "Ho-Oh": "H",
  "Farfetch’d": "F", "Porygon-Z": "P", "Porygon2": "P", "Mime Jr.": "M", "Jangmo-o": "J", "Sirfetch’d": "S", "Tapu Koko": "T" };
const wrong = Object.entries(cases).filter(([n, l]) => !byName(n) || A.letterOf(byName(n)) !== l);
check("Special-character names map to the right letter (Flabébé F, Mr. Mime M, Nidoran♀/♂ N, Type: Null T, Ho-Oh H, Farfetch’d F, Porygon-Z P…)",
  wrong.length === 0, wrong.map(([n]) => `${n} → ${byName(n) ? A.letterOf(byName(n)) : "not found"}`).join(", ") || `${Object.keys(cases).length} names`);

// 3. Special theo tên gốc
const special = ALL.filter((p) => p.group);
check("Special forms use their original name (Kazeran Vaporeon → V, with Vaporeon)",
  special.length === 8 && special.every((p) => A.letterOf(p) === p.baseName[0]) && pools.V.includes(byName("Kazeran Vaporeon")) && pools.V.includes(byName("Vaporeon")),
  special.map((p) => `${p.name} → ${A.letterOf(p)}`).join(", "));
check("No Special form lands in K because of \"Kazeran\"", !pools.K.some((p) => p.group));

// 4. Bánh xe: mọi chữ đều hợp lệ theo wheelPools khi dùng mọi Pokémon
const wp = A.wheelPools(pools);
check("All 26 letters pass wheelPools with every generation", Object.keys(wp.pools).length === 26 && wp.rareOnly.length === 0);
check("X has 3 Pokémon, so its pool cannot be customized", pools.X.length === 3 && !A.canCustomizePool(pools.X), pools.X.map((p) => p.name).join(", "));

// 5. Mỗi chữ ra khoảng 1/26 (cách quay bánh xe: pickRandom trên các ô)
const r = rng(7), N = 520000, counts = {};
const keys = Object.keys(wp.pools);
for (let i = 0; i < N; i++) { const k = keys[Math.floor(r() * keys.length)]; counts[k] = (counts[k] || 0) + 1; }
const p26 = 1 / 26, sd = Math.sqrt(p26 * (1 - p26) / N);
const worstL = Math.max(...keys.map((k) => Math.abs(counts[k] / N - p26) / sd));
check(`Each letter comes up ~1/26 (${N.toLocaleString()} spins, within 5σ)`, worstL < 5, `worst ${worstL.toFixed(2)}σ`);

// 6. Tỉ lệ độ hiếm trong từng chữ khớp dropOdds; tổng tỉ lệ từng Pokémon 100%
let worstT = 0, badSum = 0, outside = 0;
const rr = rng(13), M = 30000;
for (const [l, list] of Object.entries(pools)) {
  const groups = A.groupByRarity(list);
  const sum = list.reduce((s, p) => s + A.dropOdds({ rarity: p.rarity, shiny: false }, groups).pokemon, 0);
  if (Math.abs(sum - 1) > 1e-9) badSum++;
  const tiers = {};
  for (let i = 0; i < M; i++) {
    const res = A.rollOnce(groups, rr);
    if (A.letterOf(res.pokemon) !== l) outside++;
    tiers[res.rarity] = (tiers[res.rarity] || 0) + 1;
  }
  for (const t of A.RARITIES) {
    const want = groups[t.key].length ? A.dropOdds({ rarity: t.key, shiny: false }, groups).tier : 0;
    const got = (tiers[t.key] || 0) / M;
    if (want === 0) { if (got > 0) worstT = Infinity; continue; }
    worstT = Math.max(worstT, Math.abs(got - want) / Math.sqrt(want * (1 - want) / M));
  }
}
check("Opens always give a Pokémon of the letter", outside === 0, `${outside} outside`);
check("Per-Pokémon odds of every letter case sum to 100%", badSum === 0);
check(`Tier rates in every letter case match dropOdds (${M.toLocaleString()} opens each, within 5σ)`, worstT < 5, `worst ${worstT.toFixed(2)}σ`);

// 7. Góc dừng bánh xe 26 ô
let wrongStop = 0, viaMatrix = 0;
for (let k = 0; k < 30000; k++) {
  const index = Math.floor(Math.random() * 26);
  const current = k % 3 === 0 ? (Math.random() * 2 - 1) * 1e5 : Math.random() * 360;
  const off = k % 50 === 0 ? 1 : k % 50 === 1 ? -1 : Math.random() * 2 - 1;
  const target = A.wheelTarget(current, index, 26, off);
  if (A.wheelSliceAt(target, 26) !== index) wrongStop++;
  const rad = target * Math.PI / 180;
  if (A.wheelSliceAt(Math.atan2(Math.sin(rad), Math.cos(rad)) * 180 / Math.PI, 26) !== index) viaMatrix++;
}
check("26-slice wheel: target lands on the chosen letter (30,000 cases, incl. edges and large angles)", wrongStop === 0 && viaMatrix === 0, `${wrongStop} / ${viaMatrix} wrong`);

// 8. Màu: 26 màu khác nhau, dạng #rrggbb, chuyển dần theo bảng chữ cái
const colors = A.LETTERS.map(A.letterColor);
check("26 distinct #rrggbb slice colours", colors.every((c) => /^#[0-9a-f]{6}$/.test(c)) && new Set(colors).size === 26, colors.slice(0, 4).join(" "));

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
