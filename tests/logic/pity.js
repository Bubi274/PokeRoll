// Kiểm tra pity bằng Node (số ngẫu nhiên có seed): ngưỡng Purple-trở-lên (5) và Gold (10), cách đặt lại bộ đếm,
// hòm thiếu bậc mục tiêu, tỉ lệ giữa các bậc khi pity kích hoạt, và lượt không tới pity giống hệt rollOnce.
const { loadApp } = require("../sources");
const { A, ALL } = loadApp();
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const C = (purple, gold) => ({ purple, gold });

// Bộ sinh số ngẫu nhiên cố định (mulberry32) để kết quả lặp lại được
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const full = A.groupByRarity(ALL);
// Hòm chỉ gồm các bậc keys (lấy Pokémon từ hòm đầy đủ)
const only = (...keys) => Object.fromEntries(A.RARITIES.map((r) => [r.key, keys.includes(r.key) ? full[r.key] : []]));

// 1. Ngưỡng
check("Thresholds: Purple or better on the 5th open, Gold on the 10th", A.PITY_PURPLE === 5 && A.PITY_GOLD === 10);
check("Pity modes: Case, Type, Biome, Letter (no Minigame)", same(A.PITY_MODES, ["case", "type-roulette", "biome-roulette", "letter-roulette"]));
check("pityDue: nothing before the threshold", A.pityDue(C(0, 0)) === null && A.pityDue(C(3, 8)) === null);
check("pityDue: 4 opens without Purple+ → the next is Purple pity", A.pityDue(C(4, 0)) === "purple");
check("pityDue: 9 opens without Gold → the next is Gold pity", A.pityDue(C(0, 9)) === "gold");
check("pityDue: both due → Gold first", A.pityDue(C(4, 9)) === "gold");

// 2. Đặt lại bộ đếm
const n = A.nextPityCounter;
check("Blue: both counters +1", same(n(C(2, 5), "blue"), C(3, 6)));
check("Purple / Pink / Red: Purple counter resets, Gold +1", ["purple", "pink", "red"].every((t) => same(n(C(3, 5), t), C(0, 6))));
check("Gold: both counters reset", same(n(C(3, 5), "gold"), C(0, 0)));
check("Purple pity that had to give Blue (no Purple+ in case): Purple resets, Gold +1", same(n(C(4, 5), "blue", "purple"), C(0, 6)));
check("Gold pity that had to give Red or Blue (no Gold in case): both reset", same(n(C(4, 9), "red", "gold"), C(0, 0)) && same(n(C(2, 9), "blue", "gold"), C(0, 0)));

// 3. Mô phỏng hòm đầy đủ: không bao giờ quá ngưỡng, lượt không tới pity giống rollOnce
function simulate(groups, count, seed) {
  const r = rng(seed);
  let counter = A.newPityCounter(), sincePurple = 0, sinceGold = 0, maxPurple = 0, maxGold = 0;
  const forced = { purple: {}, gold: {} };
  let shiny = 0;
  for (let i = 0; i < count; i++) {
    const before = counter;
    const out = A.rollWithPity(groups, counter, r);
    if (counter !== before || !same(counter, before)) throw new Error("rollWithPity changed the old counter");
    counter = out.counter;
    const t = out.result.rarity;
    if (out.result.pity) forced[out.result.pity][t] = (forced[out.result.pity][t] || 0) + 1;
    if (out.result.shiny) shiny++;
    sincePurple = t === "blue" ? sincePurple + 1 : 0;
    sinceGold = t === "gold" ? 0 : sinceGold + 1;
    maxPurple = Math.max(maxPurple, sincePurple);
    maxGold = Math.max(maxGold, sinceGold);
  }
  return { forced, maxPurple, maxGold, shiny, counter };
}
const sim = simulate(full, 100000, 42);
check("Full case: never 5 opens in a row without Purple or better", sim.maxPurple === 4, `longest run ${sim.maxPurple}`);
check("Full case: never 10 opens in a row without Gold", sim.maxGold === 9, `longest run ${sim.maxGold}`);
const fp = sim.forced.purple, fpTotal = Object.values(fp).reduce((a, b) => a + b, 0);
check("Purple pity never gives Blue", !fp.blue && fpTotal > 0);
// Tỉ lệ gốc giữa Purple : Pink : Red : Gold = 15.98 : 3.2 : 0.64 : 0.26
const share = (k) => (fp[k] || 0) / fpTotal;
const expect = (k) => A.RARITIES.find((r) => r.key === k).chance / (15.98 + 3.2 + 0.64 + 0.26);
check("Purple pity splits tiers by their base odds (Purple ≈ 79.6%, Pink ≈ 15.9%)",
  Math.abs(share("purple") - expect("purple")) < 0.02 && Math.abs(share("pink") - expect("pink")) < 0.02,
  `Purple ${(share("purple") * 100).toFixed(1)}%, Pink ${(share("pink") * 100).toFixed(1)}%, of ${fpTotal}`);
check("Gold pity always gives Gold in a case with Gold", same(Object.keys(sim.forced.gold), ["gold"]));
check("Shiny is still 1 in 100 with pity (no Shiny pity)", sim.shiny > 850 && sim.shiny < 1150, `${sim.shiny} of 100000`);

const r1 = rng(5), r2 = rng(5);
let sameAsRollOnce = true;
for (let i = 0; i < 200; i++) {
  const a = A.rollWithPity(full, C(0, 0), r1).result, b = A.rollOnce(full, r2);
  if (a.pokemon.id !== b.pokemon.id || a.rarity !== b.rarity || a.shiny !== b.shiny || a.downgraded !== b.downgraded || a.pity !== null) sameAsRollOnce = false;
}
check("A roll that isn't due for pity is exactly rollOnce (same seed → same Pokémon)", sameAsRollOnce);

// 4. Hòm thiếu bậc mục tiêu: vẫn tính lượt, tới ngưỡng thì ra bậc cao nhất hòm có, không bao giờ lỗi
const once = (groups, counter, seed = 1) => A.rollWithPity(groups, counter, rng(seed));
const blueOnly = once(only("blue"), C(4, 0));
check("Purple pity in a Blue-only case: gives Blue, marked fallback, Purple counter resets",
  blueOnly.result.rarity === "blue" && blueOnly.result.pity === "purple" && blueOnly.result.pityFallback && same(blueOnly.counter, C(0, 1)));
const noGold = once(only("blue", "purple", "red"), C(0, 9));
check("Gold pity in a case with no Gold: gives the highest tier there (Red), both counters reset",
  noGold.result.rarity === "red" && noGold.result.pity === "gold" && noGold.result.pityFallback && same(noGold.counter, C(0, 0)));
const bluePink = Array.from({ length: 50 }, (_, s) => once(only("blue", "pink"), C(4, 0), s).result);
check("Purple pity in a Blue + Pink case: always Pink, not a fallback", bluePink.every((x) => x.rarity === "pink" && !x.pityFallback));
const sim2 = simulate(only("blue", "purple"), 2000, 9);
check("Case with no Gold: Gold pity every 10th open gives Purple, never crashes", sim2.forced.gold.purple > 150 && Object.keys(sim2.forced.gold).length === 1);
check("Empty case: rollWithPity returns null (with or without pity due)", A.rollWithPity(only(), C(0, 0)) === null && A.rollWithPity(only(), C(4, 9)) === null);
check("Forced results are not marked as downgraded", !blueOnly.result.downgraded && !noGold.result.downgraded);

// 4b. Dải quay của lượt pity: mọi thẻ phụ chỉ thuộc bậc mà pity đó cho ra; lượt thường không đổi
const reelTiers = (winner, groups, seed) => {
  const items = A.buildReelItems(winner, groups, 60, 50, rng(seed));
  return { winnerKept: items[50] === winner, tiers: [...new Set(items.filter((_, i) => i !== 50).map((x) => x.rarity))].sort() };
};
const purpleWin = once(full, C(4, 0)).result, goldWin = once(full, C(0, 9)).result;
const pr = Array.from({ length: 30 }, (_, s) => reelTiers(purpleWin, full, s));
check("Purple pity reel: every card is Purple, Pink, Red or Gold (no Blue)",
  pr.every((x) => x.winnerKept && x.tiers.every((t) => ["purple", "pink", "red", "gold"].includes(t))) && pr.some((x) => x.tiers.includes("purple")),
  JSON.stringify(pr[0].tiers));
const gr = Array.from({ length: 30 }, (_, s) => reelTiers(goldWin, full, s));
check("Gold pity reel: every card is Gold", gr.every((x) => x.winnerKept && same(x.tiers, ["gold"])), JSON.stringify(gr[0].tiers));
const fbGold = once(only("blue", "purple", "red"), C(0, 9)).result;
check("Gold pity reel, case with no Gold: every card is the fallback tier (Red)",
  Array.from({ length: 20 }, (_, s) => reelTiers(fbGold, only("blue", "purple", "red"), s)).every((x) => same(x.tiers, ["red"])));
const fbPurple = once(only("blue"), C(4, 0)).result;
check("Purple pity reel, Blue-only case: every card is Blue (the fallback)",
  same(reelTiers(fbPurple, only("blue"), 3).tiers, ["blue"]));
const bpWin = once(only("blue", "pink"), C(4, 0)).result;
check("Purple pity reel, Blue + Pink case: every card is Pink", same(reelTiers(bpWin, only("blue", "pink"), 4).tiers, ["pink"]));
const normalWin = A.rollOnce(full, rng(1));
const ra = A.buildReelItems({ ...normalWin, pity: null }, full, 60, 50, rng(8)), rb = A.buildReelItems(normalWin, full, 60, 50, rng(8));
const ro = rng(8), byRollOnce = Array.from({ length: 59 }, () => A.rollOnce(full, ro));
check("Normal reel: filler cards are exactly rollOnce (unchanged), all tiers can show",
  ra.filter((_, i) => i !== 50).every((x, i) => x.pokemon.id === byRollOnce[i].pokemon.id && x.rarity === byRollOnce[i].rarity)
  && same(ra.map((x) => x.pokemon.id), rb.map((x) => x.pokemon.id)) && ra.some((x) => x.rarity === "blue"));
check("pityReelRoll: empty case → null", A.pityReelRoll("gold", only()) === null);

// 4c. Bánh xe ở lượt pity: chỉ dừng ở nhóm có bậc bảo đảm
const wheelGroups = { a: only("blue", "purple"), b: only("blue", "gold"), c: only("blue", "pink", "gold"), d: only("blue") };
const wOf = (k) => wheelGroups[k];
const wk = (counter, keys = ["a", "b", "c", "d"]) => A.pityWheelKeys(keys, wOf, counter);
check("pityWheelKeys: not due → every group, not limited", same(wk(C(3, 8)), { keys: ["a", "b", "c", "d"], due: null, limited: false }));
check("pityWheelKeys: Gold due → only groups with Gold", same(wk(C(0, 9)), { keys: ["b", "c"], due: "gold", limited: true }));
check("pityWheelKeys: Purple due → only groups with Purple or better", same(wk(C(4, 0)), { keys: ["a", "b", "c"], due: "purple", limited: true }));
check("pityWheelKeys: no group has the tier → wheel unchanged (fallback)", same(wk(C(0, 9), ["a", "d"]), { keys: ["a", "d"], due: "gold", limited: false }));
check("pityWheelKeys: every group has the tier → not limited", same(wk(C(4, 0), ["a", "b"]), { keys: ["a", "b"], due: "purple", limited: false }));

// 5. Đọc lại bộ đếm đã lưu
check("cleanPityCounter: missing or broken → 0", same(A.cleanPityCounter(null), C(0, 0)) && same(A.cleanPityCounter({ purple: -1, gold: 2.5 }), C(0, 0))
  && same(A.cleanPityCounter({ purple: "3", gold: 4 }), C(0, 4)));
check("cleanPityCounter: values above the threshold are capped", same(A.cleanPityCounter({ purple: 99, gold: 99 }), C(4, 9)));
check("cleanPityCounters: every pity mode, unknown keys dropped", same(A.cleanPityCounters({ case: C(2, 3), minigame: C(1, 1), "type-roulette": "x" }),
  { case: C(2, 3), "type-roulette": C(0, 0), "biome-roulette": C(0, 0), "letter-roulette": C(0, 0) }) && same(A.cleanPityCounters([1]), A.cleanPityCounters({})));

// 6. Chữ hiện ra
check("pityProgress: Purple or better 3/5, Gold 7/10", same(A.pityProgress(C(3, 7)).map((p) => `${p.label} ${p.count}/${p.need}`), ["Purple or better 3/5", "Gold 7/10"]));
check("pityDropText", A.pityDropText("purple") === "Pity drop: guaranteed Purple or better after 5 opens"
  && A.pityDropText("gold") === "Pity drop: guaranteed Gold after 10 opens");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
