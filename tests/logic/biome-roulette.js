// Kiểm tra logic Biome Roulette bằng Node: nhóm biome, tỉ lệ nhóm, tỉ lệ độ hiếm trong từng nhóm, góc dừng bánh xe.
const fs = require("fs"), vm = require("vm"), path = require("path");
const dir = path.join(__dirname, "..", "..");
const ctx = { console, Math, module: {} };
vm.createContext(ctx);
vm.runInContext(["data.js", "special.js", "spawns.js", "app.js"].map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n")
  + "\n;globalThis.__all=[...POKEMON_DATA,...SPECIAL_DATA].map(p=>({...p,rarity:getRarity(p)})); globalThis.__spawns=SPAWN_DATA;", ctx);
const A = ctx.module.exports, ALL = ctx.__all, SPAWNS = ctx.__spawns;
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

// 1. Mọi tag biome trong dữ liệu đều thuộc đúng một nhóm
const tags = new Set();
for (const v of Object.values(SPAWNS)) for (const e of v.entries) for (const t of e.in || []) tags.add(t);
const unmapped = [...tags].filter((t) => !A.BIOME_TAG_GROUP[t]);
const listed = A.BIOME_GROUPS.flatMap((g) => g.tags);
check(`All ${tags.size} biome tags in spawns.js map to a group`, unmapped.length === 0, unmapped.join(", ") || "none unmapped");
check("Each tag listed in exactly one group, no unknown tags", new Set(listed).size === listed.length && listed.every((t) => tags.has(t)), `${listed.length} tags in 18 groups`);
check("18 groups (fits the wheel), Overworld + Legendary are their own groups", A.BIOME_GROUPS.length === 18
  && A.BIOME_GROUPS.some((g) => g.key === "overworld" && g.name === "Overworld" && g.tags.join() === "Overworld")
  && A.BIOME_GROUPS.some((g) => g.key === "legendary"));

// 2. Thành viên nhóm: theo mọi lượt spawn; Special và Pokémon không có dữ liệu spawn bị loại
const pools = A.biomePools(ALL, SPAWNS);
const inAny = new Set(Object.values(pools).flat());
const noSpawn = ALL.filter((p) => !p.group && !SPAWNS[p.id]);
check("Pokémon without spawn data are excluded", noSpawn.every((p) => !inAny.has(p)), `${noSpawn.length}: ${noSpawn.map((p) => p.name).join(", ")}`);
check("Special (Kazeran) Pokémon are excluded", ALL.filter((p) => p.group).every((p) => !inAny.has(p)));
check("Every Pokémon with spawn data is in at least one group", Object.keys(SPAWNS).every((id) => inAny.has(ALL.find((p) => p.id === Number(id)))), `${inAny.size} Pokémon`);
let wrong = 0;
for (const p of ALL.filter((p) => SPAWNS[p.id])) {
  const expect = new Set(SPAWNS[p.id].entries.flatMap((e) => (e.in || []).map((t) => A.BIOME_TAG_GROUP[t])));
  for (const g of A.BIOME_GROUPS) if (expect.has(g.key) !== (pools[g.key] || []).includes(p)) wrong++;
}
check("Multi-biome Pokémon are in every group they spawn in (and only those)", wrong === 0, `${wrong} mismatches`);
const charizard = ALL.find((p) => p.name === "Charizard");
check("Example: Charizard (Hills, Volcanic, Basalt) → Mountain + Nether", [...A.biomeGroupsOf(charizard, SPAWNS)].sort().join() === "mountain,nether");
console.log("\nPokémon per group (all gens):");
console.table(A.BIOME_GROUPS.map((g) => ({ group: g.name, pokemon: (pools[g.key] || []).length })));

// 3. Lọc gen: nhóm không có Pokémon bị bỏ khỏi bánh xe
const gen9 = A.biomePools(A.filterByGens(ALL, new Set([9])), SPAWNS);
check("Gen 9 only: End has no Pokémon → 17 groups on the wheel", !("end" in gen9) && Object.keys(gen9).length === 17, Object.keys(gen9).length + " groups");

// 3b. Quy tắc "chỉ có Pokémon hiếm": nhóm không có Pokémon Blue/Purple/Pink thì không lên bánh xe
const mk = (r) => ({ rarity: r });
const syn = A.wheelPools({ a: [mk("gold"), mk("red")], b: [mk("gold"), mk("pink")], c: [mk("red")], d: [mk("blue")] });
check("wheelPools: Red/Gold-only groups dropped, a single Pink/Purple/Blue keeps a group, order kept",
  Object.keys(syn.pools).join() === "b,d" && syn.rareOnly.join() === "a,c");
const gen9Wheel = A.wheelPools(gen9);
check("Gen 9 only: Legendary (4 Gold) left off the wheel → 16 biomes", gen9Wheel.rareOnly.join() === "legendary" && Object.keys(gen9Wheel.pools).length === 16,
  gen9.legendary.map((p) => p.name + " " + p.rarity).join(", "));
const gen1Wheel = A.wheelPools(A.biomePools(A.filterByGens(ALL, new Set([1])), SPAWNS));
check("Gen 1 only: Legendary (5 Gold) left off the wheel", gen1Wheel.rareOnly.join() === "legendary");
const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, "kazeran"];
let ruleBad = 0, combos = 0, typeDrops = 0, biomeDrops = 0;
for (let m = 1; m < 1 << KEYS.length; m++) {
  const pool = A.filterByGens(ALL, new Set(KEYS.filter((_, i) => m & (1 << i))));
  for (const [raw, kind] of [[A.typePools(pool), "type"], [A.biomePools(pool, SPAWNS), "biome"]]) {
    const w = A.wheelPools(raw);
    combos++;
    if (kind === "type") typeDrops += w.rareOnly.length; else biomeDrops += w.rareOnly.length;
    const keptOk = Object.values(w.pools).every((l) => l.some((p) => ["blue", "purple", "pink"].includes(p.rarity)));
    const dropOk = w.rareOnly.every((k) => raw[k].every((p) => p.rarity === "red" || p.rarity === "gold"));
    const allOk = [...Object.keys(w.pools), ...w.rareOnly].sort().join() === Object.keys(raw).sort().join();
    if (!keptOk || !dropOk || !allOk) ruleBad++;
  }
}
check(`Every gen combination (${combos} type/biome cases): wheel groups all have a Blue/Purple/Pink Pokémon, dropped ones have none`, ruleBad === 0,
  `${ruleBad} bad; ${typeDrops} type drops, ${biomeDrops} biome drops in total`);

// 4. Mỗi nhóm có cơ hội như nhau (bước chọn nhóm trong spinBiomeWheel: pickRandom trên danh sách nhóm)
const N = 360000;
for (const [label, p] of [["All gens", A.wheelPools(pools).pools], ["Gen 9 only", gen9Wheel.pools]]) {
  const keys = Object.keys(p);
  const hits = Object.fromEntries(keys.map((k) => [k, 0]));
  for (let i = 0; i < N; i++) hits[keys[Math.floor(Math.random() * keys.length)]]++;
  const expect = 1 / keys.length;
  const worst = Math.max(...keys.map((k) => Math.abs(hits[k] / N - expect)));
  check(`${label}: each of ${keys.length} groups ≈ 1 in ${keys.length} (${(expect * 100).toFixed(2)}%)`, worst < 0.004,
    `range ${(Math.min(...Object.values(hits)) / N * 100).toFixed(2)}–${(Math.max(...Object.values(hits)) / N * 100).toFixed(2)}%`);
}

// 5. Trong từng nhóm: tỉ lệ độ hiếm khớp dropOdds (gồm hạ bậc khi bậc trống)
const M = 200000;
let tierFails = 0;
const rows = [];
for (const [label, p] of [["All", A.wheelPools(pools).pools], ["Gen 9", gen9Wheel.pools]]) {
  for (const key of Object.keys(p)) {
    const groups = A.groupByRarity(p[key]);
    const counts = Object.fromEntries(A.RARITIES.map((r) => [r.key, 0]));
    for (let i = 0; i < M; i++) counts[A.rollOnce(groups).rarity]++;
    const row = { gens: label, group: key, n: p[key].length };
    let bad = false;
    for (const r of A.RARITIES) {
      const sample = groups[r.key][0];
      const expected = sample ? A.dropOdds({ pokemon: sample, rarity: r.key, shiny: false }, groups).tier : 0;
      const actual = counts[r.key] / M;
      if (Math.abs(actual - expected) > 5 * Math.sqrt(Math.max(expected * (1 - expected), 1e-9) / M) + 1e-9) bad = true;
      row[r.name] = `${(actual * 100).toFixed(2)} / ${(expected * 100).toFixed(2)}`;
    }
    if (bad) tierFails++;
    rows.push(row);
  }
}
check(`Tier odds inside every group match dropOdds (within 5σ), ${rows.length} group cases × 200k rolls`, tierFails === 0, `${tierFails} off`);
console.log("\nActual % / dropOdds % per tier (selected rows):");
console.table(rows.filter((r) => ["legendary", "end", "cave", "forest"].includes(r.group)));

// 6. Góc dừng bánh xe cho số ô có thể gặp (1–18)
let bad = 0;
for (let n = 1; n <= 18; n++) for (let k = 0; k < 2000; k++) {
  const index = Math.floor(Math.random() * n), current = Math.random() * 1e5 - 5e4;
  if (A.wheelSliceAt(A.wheelTarget(current, index, n, Math.random() * 2 - 1), n) !== index) bad++;
}
check("Wheel target lands on the chosen slice (36,000 cases, 1–18 slices)", bad === 0, `${bad} wrong`);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
