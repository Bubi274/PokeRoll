// Logic thuần về độ hiếm, tỉ lệ, quay hòm, ghi lượt quay và tiến độ sưu tập.
"use strict";

// =====================================================================
// LOGIC (hàm thuần — không đụng tới giao diện)
// =====================================================================

function getRarity(p) {
  if (p.isLegendary || p.isMythical) return "gold";
  if (PSEUDO_LEGENDARY_IDS.has(p.id)) return "pink";
  if (p.bst >= 580) return "red";
  if (p.bst >= 500) return "pink";
  if (p.bst >= 400) return "purple";
  return "blue";
}

// Lọc Pokémon thuộc các gen đã chọn (gens là một Set số).
function filterByGens(list, gens) {
  return list.filter((p) => gens.has(p.gen));
}

// Chia Pokémon theo độ hiếm: { blue: [...], purple: [...], ... }
function groupByRarity(list) {
  const groups = Object.fromEntries(RARITIES.map((r) => [r.key, []]));
  for (const p of list) groups[p.rarity].push(p);
  return groups;
}

// Quay ra một độ hiếm theo tỉ lệ. rand là số ngẫu nhiên trong [0, 1).
function rollRarityKey(rand) {
  const total = RARITIES.reduce((sum, r) => sum + r.chance, 0);
  let x = rand * total;
  for (const r of RARITIES) {
    if (x < r.chance) return r.key;
    x -= r.chance;
  }
  return RARITIES[0].key; // phòng sai số làm tròn
}

// Nếu độ hiếm quay ra không có Pokémon nào, hạ xuống bậc thấp hơn gần nhất còn Pokémon.
// (Nếu không còn bậc thấp hơn thì mới thử lên bậc cao hơn.) Trả về null nếu hòm rỗng.
function resolveRarity(key, groups) {
  const start = RARITIES.findIndex((r) => r.key === key);
  for (let i = start; i >= 0; i--) {
    if (groups[RARITIES[i].key].length > 0) return RARITIES[i].key;
  }
  for (let i = start + 1; i < RARITIES.length; i++) {
    if (groups[RARITIES[i].key].length > 0) return RARITIES[i].key;
  }
  return null;
}

// Tỉ lệ % thực tế của mỗi bậc trong hòm (đã cộng phần bị hạ bậc từ bậc trống).
function effectiveChances(groups) {
  const result = Object.fromEntries(RARITIES.map((r) => [r.key, 0]));
  for (const r of RARITIES) {
    const final = resolveRarity(r.key, groups);
    if (final) result[final] += r.chance;
  }
  return result;
}

// Xác suất thật của một kết quả quay, tính theo hòm lúc quay (groups):
//   tier       = ra đúng bậc này (đã cộng phần bị hạ từ các bậc cao hơn không có Pokémon)
//   pokemon    = ra đúng Pokémon này (mỗi Pokémon trong bậc có cơ hội như nhau)
//   final      = như pokemon, nhân thêm tỉ lệ shiny nếu kết quả là shiny
//   foldedFrom = các bậc trống đã bị hạ xuống bậc này
function dropOdds(result, groups) {
  const total = RARITIES.reduce((sum, r) => sum + r.chance, 0);
  const tier = effectiveChances(groups)[result.rarity] / total;
  const pokemon = tier / groups[result.rarity].length;
  return {
    tier,
    pokemon,
    final: result.shiny ? pokemon * SHINY_CHANCE : pokemon,
    foldedFrom: RARITIES
      .filter((r) => r.key !== result.rarity && resolveRarity(r.key, groups) === result.rarity)
      .map((r) => r.key),
  };
}

// Xác suất p → chữ "N" trong "1 in N" (vd. 0.0064 → "156", 0.7992 → "1.3").
function oneIn(p) {
  const n = 1 / p;
  return n < 10 ? String(Number(n.toFixed(1))) : Math.round(n).toLocaleString("en-US");
}

function pickRandom(list, rand) {
  return list[Math.floor(rand * list.length)];
}

// Một lần quay hoàn chỉnh. rng là hàm sinh số ngẫu nhiên (mặc định Math.random,
// truyền hàm khác vào để test). Trả về null nếu hòm rỗng.
function rollOnce(groups, rng = Math.random) {
  const rolledRarity = rollRarityKey(rng());
  const rarity = resolveRarity(rolledRarity, groups);
  if (!rarity) return null;
  return {
    pokemon: pickRandom(groups[rarity], rng()),
    rarity,                                  // độ hiếm thực nhận
    downgraded: rarity !== rolledRarity,     // có bị hạ bậc không
    shiny: rng() < SHINY_CHANCE,             // độc lập với độ hiếm
  };
}

// Tạo danh sách thẻ cho dải quay: thẻ thắng ở winIndex, các thẻ khác quay ngẫu nhiên
// theo đúng tỉ lệ độ hiếm. Mỗi thẻ có dạng { pokemon, rarity, shiny }.
function buildReelItems(winner, groups, size = REEL_SIZE, winIndex = WIN_INDEX, rng = Math.random) {
  const items = [];
  for (let i = 0; i < size; i++) {
    items.push(i === winIndex ? winner : rollOnce(groups, rng));
  }
  return items;
}

// Ghi một lần quay vào bộ sưu tập và lịch sử. Trả về mục của Pokémon đó trong bộ sưu tập.
function recordDrop(collection, history, result, time = Date.now()) {
  const id = result.pokemon.id;
  if (!collection[id]) collection[id] = { count: 0, shiny: 0, first: time };
  const entry = collection[id];
  entry.count++;
  if (result.shiny) entry.shiny++;
  history.unshift({ id, rarity: result.rarity, shiny: result.shiny, t: time });
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  return entry;
}

// Tiến độ mỗi độ hiếm, hiếm nhất trước: [{ key, name, owned, total }]
function rarityProgress(pokemon, collection) {
  return [...RARITIES].reverse().map(({ key, name }) => {
    const list = pokemon.filter((p) => p.rarity === key);
    return { key, name, total: list.length, owned: list.filter((p) => collection[p.id]).length };
  });
}

// Tiến độ mỗi gen: [{ gen, region, owned, total }]
function genProgress(pokemon, collection) {
  return GENS.map(({ gen, region }) => {
    const list = pokemon.filter((p) => p.gen === gen);
    return { gen, region, total: list.length, owned: list.filter((p) => collection[p.id]).length };
  });
}

// Tiến độ mỗi nhóm Special: [{ key, name, owned, total }]
function specialProgress(pokemon, collection, groups = SPECIAL_GROUP_LIST) {
  return groups.map(({ key, name }) => {
    const list = pokemon.filter((p) => p.group === key);
    return { key, name, total: list.length, owned: list.filter((p) => collection[p.id]).length };
  });
}

