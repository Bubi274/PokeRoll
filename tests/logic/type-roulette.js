// Kiểm tra logic Type Roulette bằng Node: góc dừng bánh xe, tỉ lệ hệ, tỉ lệ độ hiếm trong từng hệ.
const fs = require("fs"), vm = require("vm"), path = require("path");
const dir = path.join(__dirname, "..", "..");
const ctx = { console, Math, module: {} };
vm.createContext(ctx);
vm.runInContext(["data.js", "special.js", "app.js"].map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n")
  + "\n;globalThis.__all=[...POKEMON_DATA,...SPECIAL_DATA].map(p=>({...p,rarity:getRarity(p)}));", ctx);
const A = ctx.module.exports, ALL = ctx.__all;
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

// 1. Góc dừng: mọi số ô 1–18, góc bắt đầu bất kỳ (kể cả góc cộng dồn lớn, góc âm), lệch tối đa hai bên
let wrong = 0, total = 0, viaMatrix = 0, minMargin = Infinity;
for (let n = 1; n <= 18; n++) {
  for (let k = 0; k < 3000; k++) {
    const index = Math.floor(Math.random() * n);
    const current = k % 3 === 0 ? (Math.random() * 2 - 1) * 1e5 : Math.random() * 360;
    const off = k % 50 === 0 ? 1 : k % 50 === 1 ? -1 : Math.random() * 2 - 1;
    const target = A.wheelTarget(current, index, n, off);
    total++;
    if (A.wheelSliceAt(target, n) !== index) wrong++;
    if (!(target - current >= 5 * 360 && target - current < 6 * 360)) wrong++;
    // Như trình duyệt: rotate(target) → ma trận → atan2 → ô dưới kim
    const rad = target * Math.PI / 180;
    const deg = Math.atan2(Math.sin(rad), Math.cos(rad)) * 180 / Math.PI;
    if (A.wheelSliceAt(deg, n) !== index) viaMatrix++;
    // Khoảng cách tới mép ô gần nhất (độ)
    const a = 360 / n, ang = (((-target) % 360) + 360) % 360, inSlice = ang - index * a;
    minMargin = Math.min(minMargin, inSlice, a - inSlice);
  }
}
check(`Wheel target lands on the chosen slice (${total.toLocaleString()} cases, 1–18 slices)`, wrong === 0, `${wrong} wrong`);
check("Same result read back from the rotation matrix (as the browser does)", viaMatrix === 0, `${viaMatrix} wrong`);
check("Stop point never closer than 10% of a slice to its edge", minMargin >= 0.1 * 20 - 1e-6, `min margin ${minMargin.toFixed(2)}° (18 slices: slice = 20°)`);

// 2. Nhóm theo hệ: Pokémon hai hệ nằm ở cả hai nhóm
const pools = A.typePools(ALL);
const gyarados = ALL.find((p) => p.name === "Gyarados");
check("18 types with all generations", Object.keys(pools).length === 18, Object.keys(pools).join(","));
check("Gyarados is in both Water and Flying", pools.water.includes(gyarados) && pools.flying.includes(gyarados));
const sumSizes = Object.values(pools).reduce((s, l) => s + l.length, 0);
const typeSlots = ALL.reduce((s, p) => s + p.types.length, 0);
check("Every Pokémon counted once per type it has", sumSizes === typeSlots, `${sumSizes} = ${typeSlots}`);

// Hệ không có Pokémon trong các gen đã chọn bị bỏ khỏi bánh xe
const gen1 = A.typePools(A.filterByGens(ALL, new Set([1])));
const gen1Pool = A.filterByGens(ALL, new Set([1]));
check("Gen 1 only: wheel keeps exactly the types that have Gen 1 Pokémon",
  A.TYPE_ORDER.every((t) => (t in gen1) === gen1Pool.some((p) => p.types.includes(t))) && Object.keys(gen1).length < 18,
  `${Object.keys(gen1).length} types; missing ${A.TYPE_ORDER.filter((t) => !(t in gen1)).join(", ")}`);

// 3. Mô phỏng: hệ ra đều nhau (giống bước chọn hệ trong spin(): pickRandom trên danh sách hệ)
const N = 360000;
function typeDistribution(types) {
  const hits = Object.fromEntries(types.map((t) => [t, 0]));
  for (let i = 0; i < N; i++) hits[types[Math.floor(Math.random() * types.length)]]++;
  return hits;
}
for (const [label, p] of [["All gens", pools], ["Gen 1 only", gen1]]) {
  const types = Object.keys(p);
  const hits = typeDistribution(types);
  const expect = 1 / types.length;
  const worst = Math.max(...types.map((t) => Math.abs(hits[t] / N - expect)));
  check(`${label}: each of ${types.length} types ≈ 1 in ${types.length} (${(expect * 100).toFixed(2)}%)`, worst < 0.004,
    `worst deviation ${(worst * 100).toFixed(2)} pts; range ${(Math.min(...Object.values(hits)) / N * 100).toFixed(2)}–${(Math.max(...Object.values(hits)) / N * 100).toFixed(2)}%`);
}

// 4. Trong một hệ: tỉ lệ độ hiếm khớp dropOdds của nhóm đó (gồm cả hạ bậc khi bậc trống)
const M = 200000;
const rows = [];
let tierFails = 0;
for (const [label, p] of [["All", pools], ["Gen 1", gen1]]) {
  for (const type of Object.keys(p)) {
    const groups = A.groupByRarity(p[type]);
    const counts = Object.fromEntries(A.RARITIES.map((r) => [r.key, 0]));
    for (let i = 0; i < M; i++) counts[A.rollOnce(groups).rarity]++;
    const row = { gens: label, type, n: p[type].length };
    let bad = false;
    for (const r of A.RARITIES) {
      const sample = groups[r.key][0];
      const expected = sample ? A.dropOdds({ pokemon: sample, rarity: r.key, shiny: false }, groups).tier : 0;
      const actual = counts[r.key] / M;
      const sd = Math.sqrt(Math.max(expected * (1 - expected), 1e-9) / M);
      if (Math.abs(actual - expected) > 5 * sd + 1e-9) bad = true;
      row[r.name] = `${(actual * 100).toFixed(2)} / ${(expected * 100).toFixed(2)}`;
    }
    if (bad) tierFails++;
    rows.push(row);
  }
}
check("Tier odds inside every type match dropOdds (within 5σ), 33 type cases × 200k rolls", tierFails === 0, `${tierFails} off`);
console.log("\nActual % / dropOdds % per tier (selected rows):");
console.table(rows.filter((r) => ["fire", "dragon", "water", "ghost"].includes(r.type)));

// Một Pokémon cụ thể trong hệ: tần suất khớp dropOdds(...).pokemon
const fire = A.groupByRarity(pools.fire);
const charizard = ALL.find((p) => p.name === "Charizard");
let hit = 0;
for (let i = 0; i < 2e6; i++) { const r = A.rollOnce(fire); if (r.pokemon === charizard) hit++; }
const exp = A.dropOdds({ pokemon: charizard, rarity: charizard.rarity, shiny: false }, fire).pokemon;
check("Charizard inside the Fire case: frequency matches dropOdds", Math.abs(hit / 2e6 - exp) < 5 * Math.sqrt(exp / 2e6),
  `${(hit / 2e6 * 100).toFixed(4)}% vs ${(exp * 100).toFixed(4)}%`);

// Shiny vẫn 1/100
let sh = 0;
for (let i = 0; i < 1e6; i++) if (A.rollOnce(fire).shiny) sh++;
check("Shiny ≈ 1 in 100", Math.abs(sh / 1e6 - 0.01) < 0.0005, `${(sh / 1e4).toFixed(3)}%`);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
