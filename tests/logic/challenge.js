// Kiểm tra phần dữ liệu của tab Challenge bằng Node: hòm của từng nguồn (Roulette chỉ bốc nhóm được lên bánh xe, không
// custom pool), đọc ô của mã TW1 về Pokémon trong app (theo dex + special, không theo tên), ô quay tiếp theo khi lập đội
// và khi reroll (reroll bắt buộc nguồn cũ của ô).
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
check("Five sources, keyed like the code's mode field", same(A.CHALLENGE_SOURCES.map((s) => s.key), ["case", "type", "biome", "letter", "minigame"]));
check("Pity counters: Case/Type/Biome/Letter share the modes' counters, Minigame has none",
  same(A.CHALLENGE_SOURCES.map((s) => s.pity), ["case", "type-roulette", "biome-roulette", "letter-roulette", null]));

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
check("Only Special forms: Biome can't roll (no spawn data), with a reason", A.challengeCase("biome", special) === null
  && /No biome can go on the wheel/.test(A.challengeSourceProblem("biome", special)));

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
check("Reroll: the slot's own source, not the selected one", A.sourceForIndex(4, rr) === "minigame" && A.sourceForIndex(1, rr) === "type");
check("Building: the selected source", A.sourceForIndex(0, c({ source: "letter" })) === "letter");
check("Source labels", A.challengeSourceLabel("type", "fire") === "Type · Fire" && A.challengeSourceLabel("biome", "forest") === "Biome · Forest"
  && A.challengeSourceLabel("letter", "A") === "Letter · A" && A.challengeSourceLabel("minigame", null) === "Minigame" && A.challengeSourceLabel("case", null) === "Case");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
