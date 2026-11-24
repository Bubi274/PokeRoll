// Kiểm tra phần dữ liệu của tab Challenge bằng Node: hòm của từng nguồn (Roulette chỉ bốc nhóm được lên bánh xe, không
// custom pool), đọc ô của mã TW1 về Pokémon trong app (theo dex + special, không theo tên), ô quay tiếp theo khi lập đội
// và khi reroll (reroll bắt buộc nguồn cũ của ô; ô Minigame của mã cũ reroll bằng Case), bánh xe ở lượt pity.
const { loadApp } = require("../sources");
const { A, ALL } = loadApp({
  data: ["data/data.js", "data/special.js", "data/spawns.js"],
  extra: ";state.pokemon = __all; state.dex = __all.filter((p) => !p.group); state.byId = new Map(__all.map((p) => [p.id, p]));",
});
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1. Nguồn
check("Four sources, keyed like the code's mode field (no Minigame)", same(A.CHALLENGE_SOURCES.map((s) => s.key), ["case", "type", "biome", "letter"]));
check("Pity counters: Case/Type/Biome/Letter share the modes' counters",
  same(A.CHALLENGE_SOURCES.map((s) => s.pity), ["case", "type-roulette", "biome-roulette", "letter-roulette"]));
check("Roulette sources have a wheel, Case doesn't", same(A.CHALLENGE_SOURCES.map((s) => Boolean(s.wheel)), [false, true, true, true]));

// 2. Hòm của từng nguồn
const total = (g) => Object.values(g).reduce((n, l) => n + l.length, 0);
const caseBox = A.challengeCase("case", ALL);
check("Case: every Pokémon in the generations, no group", total(caseBox.groups) === ALL.length && caseBox.detail === null);
const r = rng(3), seen = new Set();
let typeOk = true;
for (let i = 0; i < 400; i++) {
  const b = A.challengeCase("type", ALL, r);
  seen.add(b.detail);
  if (!b.list.every((p) => p.types.includes(b.detail)) || !b.list.some((p) => ["blue", "purple", "pink"].includes(p.rarity))) typeOk = false;
}
check("Type: a random type from the wheel; only Pokémon of that type", typeOk && seen.size === 18, `${seen.size} types seen`);
const gen1 = ALL.filter((p) => p.gen === 1);
let wheelOnly = true;
const wheel = Object.keys(A.wheelPools(A.typePools(gen1)).pools);
for (let i = 0; i < 300; i++) if (!wheel.includes(A.challengeCase("type", gen1, r).detail)) wheelOnly = false;
check("Type: only types that can go on the wheel (same rule as Type Roulette)", wheelOnly);
const biome = A.challengeCase("biome", ALL, rng(1));
check("Biome: a biome group, Pokémon that spawn there", biome && A.BIOME_GROUPS.some((g) => g.key === biome.detail)
  && biome.list.every((p) => A.biomeGroupsOf(p).has(biome.detail)));
const letter = A.challengeCase("letter", ALL, rng(2));
check("Letter: a letter, names starting with it", letter && letter.list.every((p) => A.letterOf(p) === letter.detail));
check("Empty generations: no case, a clear reason", A.challengeCase("case", []) === null && /Select at least one generation/.test(A.challengeSourceProblem("case", [])));
const special = ALL.filter((p) => p.group);
check("Roulette case lists every group on the wheel (keys) and includes the picked one",
  same(A.challengeCase("type", gen1, rng(4)).keys, wheel) && wheel.includes(A.challengeCase("type", gen1, rng(4)).detail));
// Lượt pity: chỉ bốc hệ có bậc bảo đảm (Gen 1: chỉ vài hệ có Gold)
const groupsOf = (k) => A.groupByRarity(A.typePools(gen1)[k]);
const goldTypes = wheel.filter((k) => !A.pityTiers("gold", groupsOf(k)).fallback);
let pityOk = true, pitySpin = null;
const rp = rng(11);
for (let i = 0; i < 200; i++) {
  const b = A.challengeCase("type", gen1, rp, { purple: 0, gold: 9 });
  if (!goldTypes.includes(b.detail)) pityOk = false;
  pitySpin = b.pitySpin;
}
check("Gold pity due: the Type wheel only picks types with Gold", pityOk && goldTypes.length > 0 && goldTypes.length < wheel.length, goldTypes.join(","));
check("Gold pity due: pitySpin says how many types could come up", same(pitySpin, { due: "gold", n: goldTypes.length }));
check("Not due: no pitySpin, any type", A.challengeCase("type", gen1, rng(2), { purple: 0, gold: 0 }).pitySpin === null);
const noGold = ALL.filter((p) => p.gen === 1 && p.rarity !== "gold");
check("Gold pity due but no type has Gold: wheel unchanged, no pitySpin (fallback)",
  A.challengeCase("type", noGold, rng(5), { purple: 0, gold: 9 }).pitySpin === null);
check("Only Special forms: Biome can't roll (no spawn data), with a reason", A.challengeCase("biome", special) === null
  && /No biome can go on the wheel/.test(A.challengeSourceProblem("biome", special)));

// 2b. Hai bước của nguồn Roulette: quay bánh xe (pickChallengeGroup), rồi mở hòm của nhóm đó (challengeGroupCase)
const pick = A.pickChallengeGroup("type", gen1, rng(6));
check("Step 1: a type from the wheel, with every wheel type listed", wheel.includes(pick.key) && same(pick.keys, wheel) && pick.pitySpin === null);
const gc = A.challengeGroupCase("type", gen1, pick.key);
check("Step 2: the case of that type", gc.detail === pick.key && gc.list.every((p) => p.types.includes(pick.key)) && gc.list.length === A.typePools(gen1)[pick.key].length);
check("Step 2: a group that's not on the wheel any more → null", A.challengeGroupCase("type", gen1, "nope") === null
  && A.challengeGroupCase("biome", special, "forest") === null);
check("Step 1 with Gold pity due: only types with Gold", Array.from({ length: 100 }, (_, i) => A.pickChallengeGroup("type", gen1, rng(100 + i), { purple: 0, gold: 9 }))
  .every((x) => goldTypes.includes(x.key) && same(x.pitySpin, { due: "gold", n: goldTypes.length })));
// Kết quả bánh xe đã lưu (khoá)
const W = A.cleanChallengeWheel;
check("Saved wheel: valid result kept", same(W({ source: "type", key: "fire", pitySpin: null }), { source: "type", key: "fire", pitySpin: null })
  && same(W({ source: "letter", key: "S", pitySpin: { due: "gold", n: 3 } }), { source: "letter", key: "S", pitySpin: { due: "gold", n: 3 } }));
check("Saved wheel: broken or unknown → null (no lock)", [null, "x", {}, { source: "case", key: "fire" }, { source: "minigame", key: "fire" },
  { source: "type", key: "lava" }, { source: "letter", key: "s" }, { source: "biome", key: 3 }].every((x) => W(x) === null));
check("Saved wheel: a broken pitySpin is dropped, the result is kept", same(W({ source: "type", key: "ice", pitySpin: { due: "blue", n: 2 } }), { source: "type", key: "ice", pitySpin: null }));

// 3. Ô của mã TW1 → Pokémon trong app
const slot = (o) => ({ dex: 25, name: "Pikachu", special: null, rule: "evo", shiny: false, tier: "blue", mode: "case", ...o });
check("Slot by dex: Pikachu", same(A.entryFromSlot(slot({})), { id: 25, rarity: "blue", shiny: false, source: "case", detail: null, pity: null }));
check("Slot by special id: Kazeran Vaporeon (dex = base form)", A.entryFromSlot(slot({ dex: 134, special: "kazeran-vaporeon", name: "x" })).id === "kazeran-vaporeon");
check("Name is ignored", A.entryFromSlot(slot({ name: "Not Pikachu" })).id === 25);
check("Special id with the wrong base dex → not found", A.entryFromSlot(slot({ dex: 25, special: "kazeran-vaporeon" })) === null);
check("Unknown dex or special → not found", A.entryFromSlot(slot({ dex: 99999 })) === null && A.entryFromSlot(slot({ special: "nope" })) === null);
check("Minigame slot: the Pokémon's own tier is kept for display", A.entryFromSlot(slot({ dex: 150, tier: "minigame", mode: "minigame", rule: "exact" })).rarity === "gold");

// 4. Ô quay tiếp theo
const e = { id: 25, rarity: "blue", shiny: false, source: "type", detail: "electric", pity: null };
const c = (o) => ({ team: Array(6).fill(null), pending: null, code: null, reroll: null, source: "case", ...o });
check("Empty team → slot 0", A.nextChallengeIndex(c({})) === 0);
check("Filled in order → first empty slot", A.nextChallengeIndex(c({ team: [e, e, null, null, null, null] })) === 2);
check("Legendary waiting → no roll", A.nextChallengeIndex(c({ pending: { index: 0, entry: e } })) === null);
check("Team with a code → no roll", A.nextChallengeIndex(c({ team: Array(6).fill(e), code: "TW1.x.y" })) === null);
const full = Array(6).fill(e).map((x, i) => ({ ...x, source: ["case", "type", "biome", "letter", "minigame", "case"][i] }));
check("Reroll, nothing picked → no roll", A.nextChallengeIndex(c({ team: full, code: "x", reroll: { allow: 1, picked: [], started: false, changes: {} } })) === null);
const rr = c({ team: full, code: "x", reroll: { allow: 2, picked: [1, 4], started: true, changes: { 1: e } } });
check("Reroll: next picked slot not yet rerolled", A.nextChallengeIndex(rr) === 4);
check("Reroll: the slot's own source, not the selected one", A.sourceForIndex(1, rr) === "type");
check("Reroll of an old Minigame slot: rolled from Case", A.sourceForIndex(4, rr) === "case");
check("Building: the selected source", A.sourceForIndex(0, c({ source: "letter" })) === "letter");
check("Source labels", A.challengeSourceLabel("type", "fire") === "Type Roulette · Fire" && A.challengeSourceLabel("biome", "forest") === "Biome Roulette · Forest"
  && A.challengeSourceLabel("letter", "S") === "Letter Roulette · S" && A.challengeSourceLabel("minigame", null) === "Minigame" && A.challengeSourceLabel("case", null) === "Case");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
