// Kiểm tra logic custom pool bằng Node: luật hợp lệ, tập đang dùng khi đổi gen, gộp khi lưu, kết quả quay luôn trong tập.
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

const pools = A.typePools(ALL);
const dragon = pools.dragon;
const ofTier = (list, tier) => list.filter((p) => p.rarity === tier);
const ids = (list) => list.map((p) => p.id);

// 1. Luật hợp lệ
check("CUSTOM_POOL_MIN is 6", A.CUSTOM_POOL_MIN === 6);
const commons = dragon.filter((p) => ["blue", "purple", "pink"].includes(p.rarity));
const rares = dragon.filter((p) => ["red", "gold"].includes(p.rarity));
check("Dragon case has enough Pokémon of each kind for these tests", commons.length >= 6 && rares.length >= 6, `${commons.length} common, ${rares.length} rare`);
check("6 Pokémon with a Blue/Purple/Pink one: valid", A.customPoolProblems([commons[0], ...rares.slice(0, 5)]).length === 0);
check("5 Pokémon: \"Pick at least 6 Pokémon\"", JSON.stringify(A.customPoolProblems(commons.slice(0, 5))) === JSON.stringify(["Pick at least 6 Pokémon"]));
check("Only Red/Gold: \"Include at least one Blue, Purple or Pink Pokémon\"",
  JSON.stringify(A.customPoolProblems(rares.slice(0, 6))) === JSON.stringify(["Include at least one Blue, Purple or Pink Pokémon"]));
check("Empty set: both reasons", A.customPoolProblems([]).length === 2);
// Cùng quy tắc với wheelPools cho mọi bậc
let mismatch = 0;
for (const tier of A.RARITIES.map((r) => r.key)) {
  const one = ofTier(dragon, tier).slice(0, 1);
  if (!one.length) continue;
  const list = [...one, ...rares.slice(0, 6)];
  const wheelOk = Boolean(A.wheelPools({ x: list }).pools.x);
  if (wheelOk !== (A.customPoolProblems(list).length === 0)) mismatch++;
}
check("Tier rule agrees with wheelPools for every tier", mismatch === 0);
check("Case with fewer than 6 Pokémon cannot be customized", !A.canCustomizePool(commons.slice(0, 5)) && A.canCustomizePool(commons.slice(0, 6)));

// 2. Tập đang dùng
let r = A.resolveCustomPool(dragon, null);
check("No saved pool: full case, not custom", r.list === dragon && !r.custom && !r.invalid && r.picked === dragon.length);
const pick = [...commons.slice(0, 4), ...rares.slice(0, 4)];
r = A.resolveCustomPool(dragon, ids(pick));
check("Saved pool: only those Pokémon, in case order", r.custom && !r.invalid && r.list.length === 8 && r.list.every((p) => pick.includes(p))
  && r.list.every((p, i) => i === 0 || dragon.indexOf(r.list[i - 1]) < dragon.indexOf(p)) && r.total === dragon.length);
r = A.resolveCustomPool(dragon, ids(pick).map(String));
check("Ids saved as text still match (JSON round trip)", r.custom && r.list.length === 8);
r = A.resolveCustomPool(dragon, ids(rares.slice(0, 6)));
check("Saved pool with only Red/Gold: full case, invalid", !r.custom && r.invalid && r.list === dragon);
r = A.resolveCustomPool(commons.slice(0, 5), ids(commons.slice(0, 5)));
check("Case under 6 Pokémon with a saved pool: full case, invalid", !r.custom && r.invalid && r.list.length === 5);

// 3. Đổi gen: id ngoài gen tạm không tính; không hợp lệ → cả hòm; bật lại gen → hợp lệ lại
const gen1 = dragon.filter((p) => p.gen === 1), gen4 = dragon.filter((p) => p.gen === 4);
const saved = ids([...gen1, ...gen4.slice(0, 4)]); // Dratini, Dragonair, Dragonite + 4 con Gen 4
const both = A.filterByGens(dragon, new Set([1, 4]));
const only1 = A.filterByGens(dragon, new Set([1]));
r = A.resolveCustomPool(both, saved);
check("Gens 1+4: custom pool of 7", r.custom && r.list.length === gen1.length + 4, `${r.list.length}`);
r = A.resolveCustomPool(only1, saved);
check("Gen 1 only: case has < 6 Pokémon → full case, invalid", !r.custom && r.invalid && r.list.length === only1.length, `${only1.length} Dragons in Gen 1`);
const only4 = A.filterByGens(dragon, new Set([4]));
r = A.resolveCustomPool(only4, saved);
check("Gen 4 only: 4 picked left (< 6) → full case, invalid", !r.custom && r.invalid);
r = A.resolveCustomPool(both, saved);
check("Back to Gens 1+4: custom pool again", r.custom && r.list.length === gen1.length + 4);

// 4. Gộp khi lưu: giữ id đang bị ẩn vì gen; tick đủ cả hòm = không tùy chỉnh
const pickedNow = new Set(ids(gen4.slice(1, 7)).map(String));
const merged = A.mergeCustomPool(saved, only4, pickedNow);
check("Save keeps ids hidden by the gen filter", JSON.stringify(merged) === JSON.stringify([...ids(gen4.slice(1, 7)), ...ids(gen1)]), JSON.stringify(merged));
const allNow = new Set(ids(only4).map(String));
check("Every Pokémon ticked (All / Reset to full case): no custom pool (null), even with ids hidden by gens",
  A.mergeCustomPool(saved, only4, allNow) === null && A.mergeCustomPool(null, only4, allNow) === null);
check("Save with no saved pool yet", JSON.stringify(A.mergeCustomPool(null, dragon, new Set(ids(pick).map(String)))) === JSON.stringify(ids(dragon.filter((p) => pick.includes(p)))));

// 5. Quay thật: kết quả luôn trong tập, tỉ lệ = dropOdds của tập, tổng 100%
const pool = A.resolveCustomPool(dragon, ids(pick)).list;
const groups = A.groupByRarity(pool);
const rand = rng(42);
const N = 200000;
const counts = new Map();
let outside = 0, nulls = 0;
for (let i = 0; i < N; i++) {
  const res = A.rollOnce(groups, rand);
  if (!res) { nulls++; continue; }
  if (!pool.includes(res.pokemon)) outside++;
  counts.set(res.pokemon.id, (counts.get(res.pokemon.id) || 0) + 1);
}
check(`${N.toLocaleString()} opens all land inside the custom pool`, outside === 0 && nulls === 0, `${outside} outside`);
const odds = pool.map((p) => A.dropOdds({ rarity: p.rarity, shiny: false }, groups).pokemon);
const sum = odds.reduce((a, b) => a + b, 0);
check("Per-Pokémon odds (dropOdds of the pool) sum to 100%", Math.abs(sum - 1) < 1e-9, sum.toFixed(12));
let worst = 0;
pool.forEach((p, i) => {
  const want = odds[i], got = (counts.get(p.id) || 0) / N;
  const sd = Math.sqrt(want * (1 - want) / N);
  worst = Math.max(worst, Math.abs(got - want) / sd);
});
check("Simulated drop rates match dropOdds (within 5σ)", worst < 5, `worst ${worst.toFixed(2)}σ`);
check("Every Pokémon in the pool can drop", pool.every((p) => counts.get(p.id) > 0));

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
