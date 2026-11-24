// Pity: bảo đảm ra bậc cao sau một số lượt. Mỗi chế độ (Case, Type / Biome / Letter Roulette) có bộ đếm riêng;
// Minigame không có pity. Hàm thuần — lưu bộ đếm và giao diện ở chỗ khác.
"use strict";

const PITY_PURPLE = 5; // lượt thứ 5 kể từ lần cuối ra Purple trở lên: chắc chắn ra Purple trở lên
const PITY_GOLD = 10;  // lượt thứ 10 kể từ lần cuối ra Gold: chắc chắn ra Gold
const PITY_MODES = ["case", "type-roulette", "biome-roulette", "letter-roulette"]; // mã chế độ có pity

// Hai loại pity: ngưỡng, các bậc mục tiêu (theo tỉ lệ gốc giữa các bậc đó) và tên hiện ra.
const PITY_KINDS = {
  purple: { need: PITY_PURPLE, tiers: ["purple", "pink", "red", "gold"], label: "Purple or better" },
  gold:   { need: PITY_GOLD,   tiers: ["gold"],                          label: "Gold" },
};

// Bộ đếm: số lượt liên tiếp chưa ra Purple trở lên / chưa ra Gold.
const newPityCounter = () => ({ purple: 0, gold: 0 });

const tierRank = (key) => RARITIES.findIndex((r) => r.key === key);

// Đọc lại bộ đếm đã lưu: số nguyên từ 0 tới ngưỡng − 1, sai thì 0.
function cleanPityCounter(raw) {
  const ok = (v, need) => (Number.isInteger(v) && v >= 0 ? Math.min(v, need - 1) : 0);
  return raw && typeof raw === "object"
    ? { purple: ok(raw.purple, PITY_PURPLE), gold: ok(raw.gold, PITY_GOLD) }
    : newPityCounter();
}

// Mọi bộ đếm: { case: {...}, "type-roulette": {...}, ... } — chế độ thiếu hoặc lỗi thì về 0.
function cleanPityCounters(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(PITY_MODES.map((m) => [m, cleanPityCounter(src[m])]));
}

// Pity sẽ kích hoạt ở lượt tới: "gold", "purple" hoặc null. Cả hai cùng tới thì Gold trước.
function pityDue(counter) {
  if (counter.gold + 1 >= PITY_GOLD) return "gold";
  if (counter.purple + 1 >= PITY_PURPLE) return "purple";
  return null;
}

// Các bậc mà pity kind cho ra trong hòm groups: bậc mục tiêu có Pokémon trong hòm; hòm không có bậc mục tiêu nào
// thì bậc cao nhất hòm có (fallback = true). Hòm rỗng → tiers rỗng.
function pityTiers(kind, groups) {
  const present = PITY_KINDS[kind].tiers.filter((k) => groups[k].length > 0);
  if (present.length) return { tiers: present, fallback: false };
  const highest = [...RARITIES].reverse().find((r) => groups[r.key].length > 0);
  return { tiers: highest ? [highest.key] : [], fallback: true };
}

// Chọn một bậc trong tiers theo tỉ lệ gốc giữa các bậc đó (vd. Purple 15.98 : Pink 3.2 : Red 0.64 : Gold 0.26).
function pickPityTier(tiers, rand) {
  const list = RARITIES.filter((r) => tiers.includes(r.key));
  const total = list.reduce((sum, r) => sum + r.chance, 0);
  let x = rand * total;
  for (const r of list) {
    if (x < r.chance) return r.key;
    x -= r.chance;
  }
  return list[list.length - 1].key; // phòng sai số làm tròn
}

// Bộ đếm sau một lượt ra bậc rarity. forced: pity vừa kích hoạt ("purple" / "gold" / null).
// Ra Purple trở lên → bộ tím về 0; ra Gold → cả hai về 0. Pity kích hoạt thì bộ đó về 0 dù hòm phải cho bậc thấp hơn
// (pity Gold coi như ra Gold: cả hai về 0).
function nextPityCounter(counter, rarity, forced = null) {
  const gold = rarity === "gold" || forced === "gold";
  const purple = gold || forced === "purple" || tierRank(rarity) >= tierRank("purple");
  return { purple: purple ? 0 : counter.purple + 1, gold: gold ? 0 : counter.gold + 1 };
}

// Một lượt quay có pity, chỉ dùng cho thẻ thắng (các thẻ khác trên dải vẫn dùng rollOnce, không đụng bộ đếm).
// Trả về { result, counter } — result như rollOnce, thêm pity ("purple" / "gold" / null) và pityFallback
// (hòm không có bậc mục tiêu nên ra bậc cao nhất hòm có); counter là bộ đếm mới (không sửa bộ đếm cũ).
// Hòm rỗng → null.
function rollWithPity(groups, counter, rng = Math.random) {
  const due = pityDue(counter);
  let result;
  if (due) {
    const { tiers, fallback } = pityTiers(due, groups);
    if (!tiers.length) return null;
    const rarity = pickPityTier(tiers, rng());
    result = {
      pokemon: pickRandom(groups[rarity], rng()),
      rarity,
      downgraded: false,
      shiny: rng() < SHINY_CHANCE, // Shiny không có pity
      pity: due,
      pityFallback: fallback,
    };
  } else {
    const rolled = rollOnce(groups, rng);
    if (!rolled) return null;
    result = { ...rolled, pity: null, pityFallback: false };
  }
  return { result, counter: nextPityCounter(counter, result.rarity, result.pity) };
}

// Một thẻ phụ trên dải quay của lượt pity kind: chỉ lấy từ các bậc mà pity cho ra trong hòm groups (Purple trở lên /
// chỉ Gold / chỉ bậc fallback), theo tỉ lệ gốc giữa các bậc đó — dải quay không hiện bậc mà lượt này không thể ra.
// Không đụng bộ đếm. Hòm rỗng → null.
function pityReelRoll(kind, groups, rng = Math.random) {
  const { tiers } = pityTiers(kind, groups);
  if (!tiers.length) return null;
  const rarity = pickPityTier(tiers, rng());
  return { pokemon: pickRandom(groups[rarity], rng()), rarity, downgraded: false, shiny: rng() < SHINY_CHANCE };
}

// Các nhóm bánh xe được dừng khi lượt mở hòm tới là pity (bộ đếm counter): chỉ nhóm có bậc bảo đảm (không phải fallback).
// keys: các nhóm trên bánh xe; groupsOf(k): hòm của nhóm k (theo bậc). Trả về { keys, due, limited }:
//   due      loại pity của lượt tới ("purple" / "gold" / null)
//   limited  true khi bánh xe bị giới hạn (keys chỉ còn các nhóm có bậc bảo đảm). Không có nhóm nào có bậc đó, hoặc nhóm
//            nào cũng có, thì keys giữ nguyên (lượt pity dùng fallback như cũ) và limited = false.
function pityWheelKeys(keys, groupsOf, counter) {
  const due = pityDue(counter);
  if (!due) return { keys, due: null, limited: false };
  const good = keys.filter((k) => !pityTiers(due, groupsOf(k)).fallback);
  return good.length && good.length < keys.length ? { keys: good, due, limited: true } : { keys, due, limited: false };
}

// Hai thanh tiến độ: [{ kind, label, count, need }], vd. "Purple or better 3/5", "Gold 3/10".
function pityProgress(counter) {
  return Object.entries(PITY_KINDS).map(([kind, k]) => ({ kind, label: k.label, count: counter[kind], need: k.need }));
}

// Câu trong popup của lượt pity.
function pityDropText(kind) {
  return kind === "gold"
    ? `Pity drop: guaranteed Gold after ${PITY_GOLD} opens`
    : `Pity drop: guaranteed Purple or better after ${PITY_PURPLE} opens`;
}
