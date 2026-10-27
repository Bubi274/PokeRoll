"use strict";

// =====================================================================
// CẤU HÌNH
// =====================================================================

const GENS = [
  { gen: 1, region: "Kanto" },
  { gen: 2, region: "Johto" },
  { gen: 3, region: "Hoenn" },
  { gen: 4, region: "Sinnoh" },
  { gen: 5, region: "Unova" },
  { gen: 6, region: "Kalos" },
  { gen: 7, region: "Alola" },
  { gen: 8, region: "Galar" },
  { gen: 9, region: "Paldea" },
];

// Nhóm "Special": Pokémon custom từ addon (dữ liệu ở special.js, tạo bằng scripts/build-special.js).
// Mỗi nhóm là một ô chọn riêng; Pokémon trong nhóm có gen = key của nhóm (vd "kazeran") và id dạng chữ.
const SPECIAL_GROUP_LIST = typeof SPECIAL_GROUPS !== "undefined" ? SPECIAL_GROUPS : [];
const SPECIAL_POKEMON = typeof SPECIAL_DATA !== "undefined" ? SPECIAL_DATA : [];

// Thứ tự từ thấp đến cao. chance = tỉ lệ % kiểu CS2.
const RARITIES = [
  { key: "blue",   name: "Blue",   rule: "Base stat total < 400",   chance: 79.92 },
  { key: "purple", name: "Purple", rule: "Base stat total 400–499", chance: 15.98 },
  { key: "pink",   name: "Pink",   rule: "Base stat total 500–579 · Pseudo-legendaries", chance: 3.2 },
  { key: "red",    name: "Red",    rule: "Base stat total ≥ 580",   chance: 0.64 },
  { key: "gold",   name: "Gold",   rule: "Legendary / Mythical",    chance: 0.26 },
];

// Pseudo-legendary (BST 600, 3 giai đoạn tiến hóa) — được xếp vào Pink thay vì Red.
const PSEUDO_LEGENDARY_IDS = new Set([
  149, // Dragonite
  248, // Tyranitar
  373, // Salamence
  376, // Metagross
  445, // Garchomp
  635, // Hydreigon
  706, // Goodra
  784, // Kommo-o
  887, // Dragapult
  998, // Baxcalibur
]);

const SHINY_CHANCE = 1 / 100;

// Ảnh có sẵn trong app (tạo bằng scripts/build-images.js) — dùng trước, không cần mạng.
const LOCAL_ARTWORK = "images/artwork";
const LOCAL_SPRITE = "images/sprite";
// Thiếu ảnh local thì tải qua CDN jsDelivr (nhanh và cache lâu hơn raw.githubusercontent).
const ARTWORK_URL = "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork";
// Ảnh nhỏ (96×96, vài KB) dùng cho danh sách nội dung hòm — nhẹ hơn ảnh artwork rất nhiều.
const SPRITE_URL = "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon";

// Ảnh dự phòng khi không tải được ảnh Pokémon (hình Poké Ball xám).
const FALLBACK_IMG = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#4a505c" stroke-width="6">' +
  '<circle cx="50" cy="50" r="42"/><path d="M8 50h28M64 50h28"/><circle cx="50" cy="50" r="13"/></svg>'
);

// Dải thẻ quay
const REEL_SIZE = 60;           // tổng số thẻ trên dải
const WIN_INDEX = 49;           // vị trí thẻ thắng (thẻ thứ 50)
const IDLE_REEL_SIZE = 12;      // số thẻ hiển thị lúc chưa quay
const SPIN_MS = 6000;           // thời gian quay
const PRELOAD_TIMEOUT_MS = 5000; // chờ tải ảnh tối đa bấy nhiêu rồi quay luôn

// Nơi xuất hiện trong modpack Cobbleverse (dữ liệu ở spawns.js)
const WIKI_URL = "https://thenolan1234.github.io/cobbleverse-wiki";
const SPAWN_BUCKETS = {
  "common": "Common",
  "uncommon": "Uncommon",
  "rare": "Rare",
  "ultra-rare": "Ultra-rare",
};
const SPAWN_CONTEXTS = {
  fishing: "Fishing",
  submerged: "Underwater",
  surface: "Water surface",
  seafloor: "Seafloor",
};
const SPAWN_VISIBLE = 4; // số mục hiện sẵn, còn lại nằm trong "Show more"

// Màu theo hệ (type) Pokémon
const TYPE_COLORS = {
  normal: "#a8a77a", fire: "#ee8130", water: "#6390f0", electric: "#f7d02c",
  grass: "#7ac74c", ice: "#96d9d6", fighting: "#c22e28", poison: "#a33ea1",
  ground: "#e2bf65", flying: "#a98ff3", psychic: "#f95587", bug: "#a6b91a",
  rock: "#b6a136", ghost: "#735797", dragon: "#6f35fc", dark: "#705746",
  steel: "#b7b7ce", fairy: "#d685ad",
};

const HISTORY_LIMIT = 200;   // số lần quay gần nhất được lưu lại
const RECENT_DROPS = 12;     // số thẻ hiện ở mục "Recent drops"

const STORAGE_KEY_GENS = "pokeroll.selectedGens";
const STORAGE_KEY_COLLECTION = "pokeroll.collection"; // { [id]: { count, shiny, first } }
const STORAGE_KEY_HISTORY = "pokeroll.history";       // [{ id, rarity, shiny, t }], mới nhất trước
const STORAGE_KEY_MUTED = "pokeroll.muted";
const STORAGE_KEY_CUSTOM_GENS = "pokeroll.custom.gens"; // gen đã chọn ở trang Custom (riêng với trang Case)
const STORAGE_KEY_CUSTOM_MODE = "pokeroll.custom.mode"; // chế độ Custom đang chọn

// Âm báo kết quả: các nốt nhạc (tần số Hz) chơi nối tiếp, bậc càng hiếm càng dài và cao.
const REVEAL_NOTES = {
  blue:   [523, 659],                          // Đô Mi
  purple: [523, 659, 784],                     // Đô Mi Sol
  pink:   [523, 659, 784, 1047],
  red:    [392, 523, 659, 784, 1047],
  gold:   [392, 523, 659, 784, 1047, 1319],
};

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

const isSpecial = (p) => Boolean(p.group);

// Id trong localStorage / thuộc tính data-* luôn là chữ: "25" → 25 (Pokédex), "kazeran-vaporeon" giữ nguyên.
function parseId(raw) {
  return /^\d+$/.test(String(raw)) ? Number(raw) : String(raw);
}

// Lọc danh sách cho trang bộ sưu tập. filters = { gen, rarity, status } ("all" = không lọc)
function filterCollection(pokemon, collection, filters) {
  return pokemon.filter((p) => {
    const entry = collection[p.id];
    if (filters.gen !== "all" && String(p.gen) !== filters.gen) return false;
    if (filters.rarity !== "all" && p.rarity !== filters.rarity) return false;
    if (filters.status === "owned" && !entry) return false;
    if (filters.status === "missing" && entry) return false;
    if (filters.status === "shiny" && !(entry && entry.shiny > 0)) return false;
    if (filters.status === "dupes" && !(entry && entry.count > 1)) return false;
    return true;
  });
}

// Bỏ dấu và viết thường, để gõ "flabebe" vẫn tìm ra "Flabébé".
const foldText = (str) => str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Ô tìm kiếm trong bộ sưu tập. Mỗi từ gõ vào phải khớp một trong:
// tên (một phần tên), số Pokédex (đúng số, có thể gõ kèm # và số 0 ở đầu), hệ (phần đầu tên hệ).
// Pokémon Special khớp theo số Pokédex của dạng gốc (gõ "134" ra cả Kazeran Vaporeon).
// Ví dụ: "pika", "25", "#0025", "fire", "fire flying".
function matchesSearch(p, query) {
  const terms = foldText(query).split(/\s+/).filter(Boolean);
  return terms.every((t) => {
    const num = t.replace(/^#/, "");
    if (/^\d+$/.test(num)) return p.id === Number(num) || p.baseId === Number(num);
    return foldText(p.name).includes(t) || p.types.some((type) => type.startsWith(t));
  });
}

// Sắp xếp danh sách bộ sưu tập (trả về mảng mới, không sửa mảng gốc).
// sort: "dex" = số Pokédex tăng dần, "rarity" = hiếm nhất trước (Gold → Blue),
//       "count" = nhiều bản nhất trước (chưa có = 0 bản, nằm cuối). Bằng nhau thì xếp theo số Pokédex.
// Pokémon Special xếp sau #1025 (sort ổn định nên giữ thứ tự trong special.js).
function sortCollection(list, collection, sort) {
  const rank = (p) => RARITIES.findIndex((r) => r.key === p.rarity);
  const copies = (p) => (collection[p.id] ? collection[p.id].count : 0);
  const dexOrder = (p) => (typeof p.id === "number" ? p.id : Infinity);
  const compare = {
    rarity: (a, b) => rank(b) - rank(a),
    count: (a, b) => copies(b) - copies(a),
  }[sort] || (() => 0);
  return [...list].sort((a, b) => compare(a, b) || dexOrder(a) - dexOrder(b) || 0);
}

function artworkUrl(id, shiny) {
  return shiny ? `${LOCAL_ARTWORK}/shiny/${id}.webp` : `${LOCAL_ARTWORK}/${id}.webp`;
}

function artworkCdnUrl(id, shiny) {
  return shiny ? `${ARTWORK_URL}/shiny/${id}.png` : `${ARTWORK_URL}/${id}.png`;
}

function spriteUrl(id, shiny = false) {
  return shiny ? `${LOCAL_SPRITE}/shiny/${id}.png` : `${LOCAL_SPRITE}/${id}.png`;
}

// Pokémon Special chỉ có một ảnh GIF (không có ảnh shiny riêng) — dùng cho cả ảnh lớn lẫn ảnh nhỏ.
function imageUrl(p, shiny) {
  return isSpecial(p) ? p.image : artworkUrl(p.id, shiny);
}

function thumbUrl(p, shiny = false) {
  return isSpecial(p) ? p.image : spriteUrl(p.id, shiny);
}

function rarityInfo(key) {
  return RARITIES.find((r) => r.key === key);
}

function specialGroup(key) {
  return SPECIAL_GROUP_LIST.find((g) => g.key === key);
}

// Nhãn số ở góc thẻ: "#0025", hoặc "Special" cho Pokémon custom.
function dexLabel(p) {
  return isSpecial(p) ? "Special" : `#${pad4(p.id)}`;
}

// "Gen 1 · Kanto" hoặc "Special · Kazeran"
function sourceLabel(p) {
  return isSpecial(p) ? `Special · ${specialGroup(p.group).name}` : `Gen ${p.gen} · ${regionOf(p)}`;
}

// Mô phỏng n lần quay và in bảng tỉ lệ ra console để so với tỉ lệ lý thuyết.
function simulateRolls(n = 100000, groups = state.groups) {
  const counts = Object.fromEntries(RARITIES.map((r) => [r.key, 0]));
  let shiny = 0;
  let downgraded = 0;
  for (let i = 0; i < n; i++) {
    const result = rollOnce(groups);
    if (!result) {
      console.warn("Case is empty — select at least one generation.");
      return null;
    }
    counts[result.rarity]++;
    if (result.shiny) shiny++;
    if (result.downgraded) downgraded++;
  }

  const table = RARITIES.map((r) => ({
    rarity: r.name,
    pokemonInCase: groups[r.key].length,
    expected: r.chance.toFixed(2) + "%",
    actual: ((counts[r.key] / n) * 100).toFixed(2) + "%",
    hits: counts[r.key],
  }));
  console.log(`Simulated ${n.toLocaleString("en-US")} rolls:`);
  console.table(table);
  console.log(`Shiny: ${((shiny / n) * 100).toFixed(2)}% (expected ${(SHINY_CHANCE * 100).toFixed(2)}%)`);
  console.log(`Downgraded (rolled tier had no Pokémon): ${downgraded}`);
  return table;
}

// =====================================================================
// LƯU TRỮ (localStorage có thể bị chặn nên luôn bọc try/catch)
// =====================================================================

function loadJson(key, fallback, isValid) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (value !== null && isValid(value)) return value;
  } catch (e) {
    // dữ liệu hỏng hoặc bị chặn → dùng mặc định
  }
  return fallback;
}

// Trả về false nếu không lưu được (bị chặn, đầy bộ nhớ...).
function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

// Tất cả nhóm có thể chọn vào hòm: số gen 1–9 và key các nhóm Special.
function allSourceKeys() {
  return [...GENS.map((g) => g.gen), ...SPECIAL_GROUP_LIST.map((g) => g.key)];
}

// Người đã lưu lựa chọn thì giữ nguyên (nhóm Special mới thêm sẽ chưa được chọn).
// key: khóa localStorage (mặc định là lựa chọn của trang Case).
function loadSelectedGens(key = STORAGE_KEY_GENS) {
  const saved = loadJson(key, null, Array.isArray);
  const valid = allSourceKeys();
  if (saved) return new Set(saved.filter((g) => valid.includes(g)));
  return new Set(valid); // mặc định: chọn tất cả, kể cả Special
}

function saveSelectedGens(gens, key = STORAGE_KEY_GENS) {
  saveJson(key, [...gens]);
}

const isPlainObject = (v) => typeof v === "object" && !Array.isArray(v);

// Đọc bộ sưu tập, bỏ các mục không hợp lệ.
function loadCollection(validIds) {
  const raw = loadJson(STORAGE_KEY_COLLECTION, {}, isPlainObject);
  const clean = {};
  for (const [id, e] of Object.entries(raw)) {
    if (validIds.has(parseId(id)) && e && Number.isInteger(e.count) && e.count > 0) {
      clean[id] = { count: e.count, shiny: Number.isInteger(e.shiny) ? e.shiny : 0, first: e.first || 0 };
    }
  }
  return clean;
}

function loadHistory(validIds) {
  return loadJson(STORAGE_KEY_HISTORY, [], Array.isArray)
    .filter((h) => h && validIds.has(h.id))
    .slice(0, HISTORY_LIMIT);
}

// =====================================================================
// GIAO DIỆN
// =====================================================================

const $ = (id) => document.getElementById(id);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chống chèn mã HTML từ dữ liệu bên ngoài (spawns.js lấy từ trang wiki).
const escHtml = (str) => String(str ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = {
  pokemon: [],          // toàn bộ Pokémon, gồm cả Special (đã gắn sẵn độ hiếm)
  dex: [],              // chỉ Pokédex chính #1–#1025 (để tính tiến độ X/1025)
  byId: new Map(),      // tra Pokémon theo id (số Pokédex, hoặc id chữ của Special)
  selectedGens: new Set(),
  groups: groupByRarity([]), // Pokémon trong hòm hiện tại, chia theo độ hiếm
  spinning: false,
  collection: {},       // bộ sưu tập: { [id]: { count, shiny, first } }
  history: [],          // lịch sử quay, mới nhất trước
  saveFailed: false,    // true nếu không lưu được vào localStorage
  view: "case",         // trang đang xem: "case", "collection" hoặc "custom"
  resultAgain: null,    // nút "Open again" trong popup kết quả sẽ chạy hàm này
};

// Độ lệch điểm dừng của lần quay gần nhất, nhớ riêng cho từng dải thẻ.
const reelOffsets = new WeakMap();

const pad4 = (id) => String(id).padStart(4, "0");

// ----- Chọn gen & thống kê -----

// Vẽ các ô chọn gen vào grid. selected là Set gen đang chọn (sửa trực tiếp trên Set này),
// onChange chạy mỗi khi bấm chọn/bỏ một ô. Mặc định: bảng chọn gen của trang Case.
function buildGenGrid({ grid = $("gen-grid"), selected = state.selectedGens, onChange = onSelectionChanged } = {}) {
  grid.innerHTML = "";
  const count = (gen) => state.pokemon.filter((p) => p.gen === gen).length;
  const options = [
    ...GENS.map(({ gen, region }) => ({ gen, name: `Gen ${gen}`, region, note: `${count(gen)} Pokémon` })),
    // Ô Special: "Kazeran · 8 Pokémon", dòng dưới ghi tên addon và tác giả
    ...SPECIAL_GROUP_LIST.map((g) => ({ gen: g.key, name: "Special", region: `${g.name} · ${count(g.key)} Pokémon`,
      note: `${g.title} by ${g.author}`, special: true })),
  ];
  for (const { gen, name, region, note, special } of options) {
    const label = document.createElement("label");
    label.className = `gen-option${special ? " is-special" : ""}`;
    label.innerHTML = `
      <input type="checkbox" value="${gen}">
      <span class="gen-card">
        <span class="gen-name">${name}</span>
        <span class="gen-region">${region}</span>
        <span class="gen-count">${note}</span>
      </span>`;
    const input = label.querySelector("input");
    input.checked = selected.has(gen);
    input.addEventListener("change", () => {
      if (input.checked) selected.add(gen);
      else selected.delete(gen);
      onChange();
    });
    grid.appendChild(label);
  }
}

function syncCheckboxes(grid = $("gen-grid"), selected = state.selectedGens) {
  for (const input of grid.querySelectorAll("input")) {
    input.checked = selected.has(parseId(input.value));
  }
}

// Tổng số Pokémon trong một hòm đã chia theo độ hiếm.
function groupsSize(groups) {
  return RARITIES.reduce((sum, r) => sum + groups[r.key].length, 0);
}

function poolSize() {
  return groupsSize(state.groups);
}

function renderPoolStats() {
  const pool = filterByGens(state.pokemon, state.selectedGens);
  state.groups = groupByRarity(pool);
  $("pool-count").textContent = pool.length;

  $("rarity-list").innerHTML = RARITIES.map((r) => {
    const n = state.groups[r.key].length;
    const note = n === 0 && pool.length > 0
      ? `<span class="rarity-note">None in this case — rolls drop to the next lower tier</span>`
      : "";
    return `
      <li class="rarity-row r-${r.key}${n === 0 ? " is-empty" : ""}" style="--p:${r.chance}">
        <span class="rarity-swatch"></span>
        <span class="rarity-info">
          <span class="rarity-name">${r.name}</span>
          <span class="rarity-rule">${r.rule}</span>
          ${note}
        </span>
        <span class="rarity-count" title="Pokémon in this tier">${n}</span>
        <span class="rarity-chance">${r.chance.toFixed(2)}%</span>
      </li>`;
  }).join("");

  updateSpinButton();
}

function updateSpinButton(label) {
  const empty = poolSize() === 0;
  const btn = $("btn-spin");
  btn.disabled = empty || state.spinning;
  $("btn-quick").disabled = empty || state.spinning;
  $("btn-contents").disabled = empty;
  if (label || !state.spinning) btn.textContent = label || "Open case";
  $("spin-hint").textContent = empty && !state.spinning ? "Select at least one generation to open the case." : "";
  if (custom.ready) renderCustomControls(); // đang quay ở trang này thì nút quay trang Custom cũng khóa
}

function onSelectionChanged() {
  saveSelectedGens(state.selectedGens);
  renderPoolStats();
  // Đổi gen thì vẽ lại dải thẻ theo hòm mới (không đụng vào khi đang quay).
  if (!state.spinning) renderIdleReel();
}

// ----- Ảnh -----

// Gắn ảnh Pokémon cho thẻ <img>: ảnh local → ảnh CDN → (shiny) ảnh thường trên CDN → ảnh dự phòng.
// Pokémon Special: ảnh GIF trong images/special/ (shiny dùng chung ảnh thường) → ảnh dự phòng.
function setPokemonImage(img, p, shiny) {
  if (isSpecial(p)) {
    img.onerror = () => { img.onerror = null; img.src = FALLBACK_IMG; };
    img.src = p.image;
    return;
  }
  const id = p.id;
  img.onerror = () => {
    if (!img.dataset.step) {
      img.dataset.step = "cdn";
      img.src = artworkCdnUrl(id, shiny);
    } else if (shiny && img.dataset.step !== "normal") {
      img.dataset.step = "normal";
      img.src = artworkCdnUrl(id, false);
    } else {
      img.onerror = null;
      img.src = FALLBACK_IMG;
    }
  };
  img.src = artworkUrl(id, shiny);
}

// Tải trước ảnh để lúc quay không bị trống; quá thời gian chờ thì bỏ qua.
function preloadImages(urls, timeoutMs) {
  const loads = urls.map((url) => new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = url;
  }));
  return Promise.race([Promise.all(loads), sleep(timeoutMs)]);
}

// ----- Dải thẻ quay -----

function createCard(item) {
  const card = document.createElement("div");
  const p = item.pokemon;
  card.className = `card r-${item.rarity}${item.shiny ? " is-shiny" : ""}${isSpecial(p) ? " is-special" : ""}`;
  if (isSpecial(p)) card.title = `${sourceLabel(p)} — base form #${p.baseId} ${p.baseName}`;
  card.innerHTML = `
    <span class="card-top">
      <span class="card-id">${dexLabel(p)}</span>
      <span class="card-type" style="--t:${TYPE_COLORS[p.types[0]] || "#777"}">${p.types.join("/")}</span>
    </span>
    <img class="card-img" alt="" draggable="false">
    <span class="card-name">${p.name}</span>
    <span class="card-meta">BST ${p.bst}<span class="card-tier"> · ${rarityInfo(item.rarity).name}</span></span>
    ${item.shiny ? `<span class="card-shiny" title="Shiny">★</span>` : ""}`;
  setPokemonImage(card.querySelector("img"), p, item.shiny);
  return card;
}

// Mọi hàm dải thẻ nhận reel = khung .reel (mặc định là dải thẻ của trang Case);
// thanh thẻ bên trong là phần tử .reel-strip của khung đó.
const stripOf = (reel) => reel.querySelector(".reel-strip");

// Vẽ lại dải thẻ và đưa về vị trí đầu (không có hiệu ứng).
function renderReel(items, reel = $("reel")) {
  const strip = stripOf(reel);
  strip.style.transition = "none";
  strip.style.transform = "translateX(0)";
  strip.replaceChildren(...items.map(createCard));
  reel.classList.toggle("is-empty", items.length === 0);
}

// Dải thẻ lúc chưa quay: vài thẻ ngẫu nhiên trong hòm (groups).
function renderIdleReel(groups = state.groups, reel = $("reel")) {
  const idle = [];
  for (let i = 0; i < IDLE_REEL_SIZE && groupsSize(groups) > 0; i++) idle.push(rollOnce(groups));
  renderReel(idle, reel);
}

// Vị trí translateX để vạch chỉ nằm trên thẻ thắng, lệch ngẫu nhiên trong phạm vi thẻ
// (tối đa 40% bề rộng thẻ mỗi bên) để không lúc nào cũng dừng đúng tâm.
// offsetFrac: độ lệch từ -1 đến 1 (nhớ lại để căn lại đúng chỗ khi đổi cỡ cửa sổ).
function reelTarget(winIndex, offsetFrac = Math.random() * 2 - 1, reel = $("reel")) {
  reelOffsets.set(reel, offsetFrac);
  const card = stripOf(reel).children[winIndex];
  const offset = offsetFrac * card.offsetWidth * 0.4;
  return reel.clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2 + offset);
}

// Đặt ngay dải thẻ ở thẻ thắng, không có hiệu ứng (dùng cho "Quick open" và khi đổi cỡ cửa sổ).
function jumpReel(winIndex, offsetFrac, reel = $("reel")) {
  const strip = stripOf(reel);
  strip.style.transition = "none";
  strip.style.transform = `translateX(${reelTarget(winIndex, offsetFrac, reel)}px)`;
}

// Đổi cỡ cửa sổ / xoay điện thoại: căn lại để vạch chỉ vẫn nằm trên thẻ thắng.
function realignReel(reel = $("reel")) {
  if (state.spinning) return;
  const strip = stripOf(reel);
  const winner = strip.querySelector(".is-winner");
  if (winner) jumpReel([...strip.children].indexOf(winner), reelOffsets.get(reel), reel);
}

// Theo dõi dải thẻ trong lúc chạy: mỗi khi một thẻ mới đi qua vạch chỉ thì phát tiếng "tick".
// Trả về hàm để dừng theo dõi.
function trackTicks(reel = $("reel")) {
  const strip = stripOf(reel);
  const first = strip.children[0];
  const step = strip.children[1].offsetLeft - first.offsetLeft;
  const center = reel.clientWidth / 2;
  let last = null;
  let running = true;
  const loop = () => {
    if (!running) return;
    const t = getComputedStyle(strip).transform;
    const x = t && t !== "none" ? new DOMMatrixReadOnly(t).m41 : 0;
    const index = Math.floor((center - x - first.offsetLeft) / step);
    if (last !== null && index !== last) playTick();
    last = index;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return () => { running = false; };
}

// Chạy dải thẻ tới thẻ thắng trong ms mili giây (mặc định SPIN_MS như trang Case). Trả về Promise xong khi dải dừng.
function animateReel(winIndex, reel = $("reel"), ms = SPIN_MS) {
  const strip = stripOf(reel);
  const target = reelTarget(winIndex, undefined, reel);

  void strip.offsetWidth; // ép trình duyệt áp vị trí đầu trước khi bắt đầu chạy
  strip.style.transition = `transform ${ms}ms cubic-bezier(0.08, 0.6, 0, 1)`;
  strip.style.transform = `translateX(${target}px)`;
  reel.classList.add("is-spinning");
  const stopTicks = trackTicks(reel);

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      stopTicks();
      reel.classList.remove("is-spinning");
      strip.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onEnd = (e) => { if (e.target === strip) finish(); };
    strip.addEventListener("transitionend", onEnd);
    setTimeout(finish, ms + 500); // phòng khi transitionend không chạy (vd. tab bị ẩn)
  });
}

// ----- Âm thanh (Web Audio API: tự tạo tiếng, không cần file âm thanh) -----

const sound = {
  ctx: null,
  out: null,      // đầu ra chung (qua bộ nén để không bị rè khi nhiều tiếng cùng lúc)
  muted: loadJson(STORAGE_KEY_MUTED, false, (v) => typeof v === "boolean"),
  lastTick: 0,
};

// Trả về AudioContext (tạo lần đầu khi cần), hoặc null nếu đang tắt tiếng / không hỗ trợ.
function audio() {
  if (sound.muted) return null;
  if (!sound.ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    sound.ctx = new Ctx();
    sound.out = sound.ctx.createDynamicsCompressor();
    sound.out.connect(sound.ctx.destination);
  }
  if (sound.ctx.state === "suspended") sound.ctx.resume();
  return sound.ctx;
}

// Phát một nốt: tần số freq (Hz), bắt đầu sau start giây, kéo dài dur giây.
function tone(ctx, { freq, endFreq, start = 0, dur = 0.2, type = "sine", vol = 0.2 }) {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(sound.out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function playTick() {
  const now = performance.now();
  if (now - sound.lastTick < 30) return; // lúc đầu thẻ chạy rất nhanh → bỏ bớt cho đỡ rè
  sound.lastTick = now;
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, { freq: 1500 + Math.random() * 300, endFreq: 700, dur: 0.035, type: "triangle", vol: 0.12 });
}

function playReveal(rarity, shiny) {
  const ctx = audio();
  if (!ctx) return;
  const notes = REVEAL_NOTES[rarity] || REVEAL_NOTES.blue;
  const epic = rarity === "red" || rarity === "gold";
  const gap = epic ? 0.09 : 0.07;
  notes.forEach((freq, i) => {
    tone(ctx, { freq, start: i * gap, dur: epic ? 0.5 : 0.3, type: "triangle", vol: 0.16 });
  });
  if (epic) {
    // Hợp âm vang dài ở cuối + một lớp cao hơn một quãng tám cho "lấp lánh"
    const end = notes.length * gap;
    notes.slice(-3).forEach((freq) => {
      tone(ctx, { freq, start: end, dur: 1.6, type: "triangle", vol: 0.12 });
      tone(ctx, { freq: freq * 2, start: end, dur: 1.2, type: "sine", vol: 0.05 });
    });
  }
  if (shiny) {
    const end = notes.length * gap + 0.1;
    [2093, 2637, 3136, 2637, 3520].forEach((freq, i) => {
      tone(ctx, { freq, start: end + i * 0.06, dur: 0.18, type: "sine", vol: 0.07 });
    });
  }
}

const ICON_SOUND_ON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6M17 9l6 6"/></svg>`;

// Nút Sound có ở cả trang Case và trang Custom (class .btn-sound).
function renderSoundButton() {
  for (const btn of document.querySelectorAll(".btn-sound")) {
    btn.innerHTML = sound.muted ? `${ICON_SOUND_OFF} Muted` : `${ICON_SOUND_ON} Sound`;
    btn.setAttribute("aria-pressed", String(!sound.muted));
    btn.title = sound.muted ? "Turn sound on" : "Mute";
  }
}

function toggleSound() {
  sound.muted = !sound.muted;
  saveJson(STORAGE_KEY_MUTED, sound.muted);
  renderSoundButton();
  if (!sound.muted) playTick(); // nghe thử một tiếng
}

// ----- Popup kết quả -----

function typeChips(types) {
  return types.map((t) =>
    `<span class="type-chip" style="--t:${TYPE_COLORS[t] || "#777"}">${t}</span>`).join("");
}

// Thanh 5 nấc độ hiếm, nấc của Pokémon này sáng lên (chỉ để trình bày).
function tierLadder(rarity) {
  return `
    <div class="tier-ladder" aria-hidden="true">
      ${RARITIES.map((r) => `<span class="rung r-${r.key}${r.key === rarity ? " is-current" : ""}"><i></i>${r.name}</span>`).join("")}
    </div>`;
}

// Khung thông tin độ hiếm: tên bậc, quy tắc xếp bậc và tỉ lệ của bậc (lấy từ RARITIES).
function tierPanel(rarity, shiny) {
  const r = rarityInfo(rarity);
  return `
    <div class="tier-panel">
      <div>
        <div class="result-rarity">${r.name}${shiny ? ` <span class="shiny-tag">★ Shiny</span>` : ""}</div>
        <p class="tier-rule">${r.rule}</p>
      </div>
      <p class="tier-odds"><b>${r.chance.toFixed(2)}%</b> tier odds</p>
    </div>`;
}

function regionOf(p) {
  return GENS.find((g) => g.gen === p.gen).region;
}

// Dòng "Generation" trong popup; Pokémon Special thay bằng nhóm và dạng gốc.
function originFacts(p) {
  if (!isSpecial(p)) return `<div><dt>Generation</dt><dd>${sourceLabel(p)}</dd></div>`;
  return `
    <div><dt>Group</dt><dd>${sourceLabel(p)}</dd></div>
    <div><dt>Base form</dt><dd>#${p.baseId} ${p.baseName}</dd></div>`;
}

// Mục cuối popup: nơi xuất hiện trong Cobbleverse, hoặc cách tiến hóa (Pokémon Special).
function findSection(p) {
  return isSpecial(p)
    ? `<h3 class="detail-section">How to evolve</h3>${renderEvolutionSection(p)}`
    : `<h3 class="detail-section">Where to find in Cobbleverse</h3>${renderSpawnSection(p)}`;
}

// Khung "1 in N": cơ hội ra đúng Pokémon này (và shiny, nếu có) trong hòm lúc quay.
function oddsBlock(result, groups) {
  const { pokemon: p, rarity, shiny } = result;
  const odds = dropOdds(result, groups);
  const tierName = rarityInfo(rarity).name;
  const folded = odds.foldedFrom.map((k) => rarityInfo(k).name);
  const foldNote = folded.length
    ? ` (includes ${folded.join(", ")}, which ${folded.length > 1 ? "have" : "has"} no Pokémon in this case)`
    : "";
  return `
    <div class="odds">
      <span class="odds-label">Odds of pulling ${shiny ? "a shiny " : ""}${p.name}</span>
      <span class="odds-value">1 in ${oneIn(odds.final)}</span>
      <span class="odds-note">
        <span>${tierName} tier: 1 in ${oneIn(odds.tier)}${foldNote}</span>
        <span>1 of ${groups[rarity].length} ${tierName} Pokémon in this case</span>
        ${shiny ? `<span>Shiny: 1 in ${oneIn(SHINY_CHANCE)}</span>` : ""}
      </span>
    </div>`;
}

// groups: Pokémon trong hòm lúc quay (để "1 in N" đúng kể cả khi đổi gen trong lúc dải đang chạy).
// again: hàm chạy khi bấm "Open again" (mặc định mở hòm ở trang Case); canAgain: nút đó có bấm được không.
// extra: HTML thêm vào ngay dưới khung "1 in N" (vd. thông tin riêng của chế độ quay).
function showResultModal(result, { isNew, count, groups = state.groups, again = spin, canAgain = poolSize() > 0, extra = "" }) {
  const { pokemon: p, rarity, shiny, downgraded } = result;
  const epic = rarity === "red" || rarity === "gold";
  const modal = $("result-modal");
  modal.className = `modal modal-narrow result-modal r-${rarity}${epic ? " is-epic" : ""}`;

  $("result-body").innerHTML = `
    <div class="showcase">
      <div class="slab${shiny ? " is-shiny" : ""}">
        <div class="slab-head">
          <span class="slab-tier">${rarityInfo(rarity).name}</span>
          ${shiny ? `<span class="slab-shiny">★ Shiny</span>` : ""}
          <span class="slab-id">${dexLabel(p)}</span>
        </div>
        <div class="reveal${shiny ? " is-shiny" : ""}">
          <div class="reveal-rays"></div>
          <div class="reveal-glow"></div>
          ${shiny ? `<span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span>` : ""}
          <img class="reveal-img" alt="${p.name}">
          <span class="reveal-badge ${isNew ? "is-new" : ""}">${isNew ? "New!" : `Duplicate · ×${count}`}</span>
        </div>
        <div class="slab-foot">
          <h2 class="reveal-name" id="result-name">${p.name}</h2>
          <div class="type-chips">${typeChips(p.types)}</div>
        </div>
      </div>
      <div class="reveal-info">
        ${tierPanel(rarity, shiny)}
        ${oddsBlock(result, groups)}
        ${extra}
        ${downgraded ? `<div class="result-note">Rolled a higher tier with no Pokémon in this case — dropped to ${rarityInfo(rarity).name}.</div>` : ""}
        <dl class="facts">
          ${originFacts(p)}
          <div><dt>Base stat total</dt><dd>${p.bst}</dd></div>
          <div><dt>In collection</dt><dd>×${count}</dd></div>
        </dl>
        ${tierLadder(rarity)}
        ${findSection(p)}
      </div>
    </div>`;
  setPokemonImage($("result-body").querySelector("img"), p, shiny);

  $("result-again").disabled = !canAgain;
  state.resultAgain = again;
  $("result-view").dataset.target = p.id; // nút "View in collection" biết cần tìm Pokémon nào
  modal.showModal();
  playReveal(rarity, shiny);
  $("result-body").scrollTop = 0;
}

// ----- Lưu tiến độ -----

function saveProgress() {
  const ok = saveJson(STORAGE_KEY_COLLECTION, state.collection) &&
             saveJson(STORAGE_KEY_HISTORY, state.history);
  state.saveFailed = !ok;
}

// ----- Recent drops (trang Case) -----

function miniTile(p, { shiny = false, count = 0, shinyCount = 0, missing = false } = {}) {
  return `
    <button type="button" class="mini r-${p.rarity}${missing ? " is-missing" : ""}" data-pokemon="${p.id}"${shiny ? ` data-shiny="1"` : ""}>
      <span class="mini-top">
        <span class="mini-id">${dexLabel(p)}</span>
        ${shiny || shinyCount
          ? `<span class="mini-shiny">★${shinyCount > 1 ? shinyCount : ""}</span>`
          : `<span class="mini-tier">${missing ? "Missing" : rarityInfo(p.rarity).name}</span>`}
      </span>
      <img class="mini-img" src="${thumbUrl(p, shiny)}" alt="" loading="lazy">
      <span class="mini-foot">
        <span class="mini-name">${p.name}</span>
        ${count > 1 ? `<span class="mini-count">×${count}</span>` : ""}
      </span>
    </button>`;
}

// Một dòng trong Recent drops: ảnh nhỏ, tên, số # (hoặc "Special"), vạch màu độ hiếm, ★ nếu shiny.
function recentItem(h) {
  const p = state.byId.get(h.id);
  return `
    <li>
      <button type="button" class="recent-item r-${h.rarity}" data-pokemon="${p.id}"${h.shiny ? ` data-shiny="1"` : ""} title="${p.name}">
        <img class="mini-img" src="${thumbUrl(p, h.shiny)}" alt="" loading="lazy">
        <span class="recent-name">${p.name}</span>
        <span class="recent-id">${dexLabel(p)}${h.mode ? sourceTag(dropSource(h, true)) : ""}</span>
        ${h.shiny ? `<span class="recent-shiny" aria-label="Shiny">★</span>` : ""}
      </button>
    </li>`;
}

// Nguồn của một lượt quay trong lịch sử. Lượt mở hòm (kể cả lịch sử cũ chưa có trường mode) là "Case";
// lượt ở trang Custom lấy nhãn do chế độ đặt, vd. "Type Roulette · Fire" (short: "Type · Fire").
function dropSource(h, short = false) {
  if (!h.mode) return { label: "Case", color: "" };
  const mode = CUSTOM_MODES.find((m) => m.key === h.mode);
  if (!mode) return { label: "Custom", color: "" };
  return {
    label: mode.label ? mode.label(h.detail, short) : mode.name,
    color: mode.tagColor ? mode.tagColor(h.detail) : "",
  };
}

function sourceTag(src) {
  return `<span class="src-tag"${src.color ? ` style="--t:${src.color}"` : ""}>${escHtml(src.label)}</span>`;
}

// Lịch sử lưu mới nhất trước → lượt mới nhất nằm trên cùng.
function renderRecent() {
  const recent = state.history.slice(0, RECENT_DROPS);
  $("recent-row").innerHTML = recent.length
    ? recent.map(recentItem).join("")
    : `<li class="recent-empty">Chưa có lượt mở nào</li>`;
}

// ----- Trang bộ sưu tập -----

// Tab và thẻ "Pokédex" chỉ đếm Pokédex chính (X/1025); Special có tiến độ riêng.
function dexOwned() {
  return state.dex.filter((p) => state.collection[p.id]).length;
}

function updateCollectionTab() {
  $("tab-collection-count").textContent = `${dexOwned()}/${state.dex.length}`;
}

function collectionFilters() {
  return { gen: $("f-gen").value, rarity: $("f-rarity").value, status: $("f-status").value };
}

function renderCollection() {
  const col = state.collection;
  const owned = dexOwned();
  const total = state.dex.length;
  const opened = Object.values(col).reduce((sum, e) => sum + e.count, 0);
  const shinies = Object.values(col).reduce((sum, e) => sum + e.shiny, 0);
  const golds = state.dex.filter((p) => p.rarity === "gold");
  const goldOwned = golds.filter((p) => col[p.id]).length;
  const pct = (a, b) => (b ? (a / b) * 100 : 0);

  const stat = (label, value, bar) => `
    <div class="stat">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${value}</span>
      ${bar !== undefined ? `<span class="bar"><span style="width:${bar}%"></span></span>` : ""}
    </div>`;
  $("coll-summary").innerHTML =
    stat("Pokédex", `${owned}<small>/${total}</small><span class="stat-pct">${pct(owned, total).toFixed(1)}%</span>`, pct(owned, total)) +
    stat("Cases opened", opened) +
    stat("Shiny drops", `★ ${shinies}`) +
    stat("Gold collected", `${goldOwned}<small>/${golds.length}</small>`, pct(goldOwned, golds.length));
  $("save-warning").hidden = !state.saveFailed;

  const activeRarity = $("f-rarity").value;
  $("rarity-progress").innerHTML = rarityProgress(state.dex, col).map((r) => `
    <button type="button" class="rp r-${r.key}${r.key === activeRarity ? " is-active" : ""}${r.owned === r.total ? " is-done" : ""}" data-rarity="${r.key}">
      <span class="rp-top"><span class="rp-name">${r.name}</span><span class="rp-count"><b>${r.owned}</b>/${r.total}</span></span>
      <span class="bar"><span style="width:${pct(r.owned, r.total)}%"></span></span>
    </button>`).join("");

  const activeGen = $("f-gen").value;
  $("gen-progress").innerHTML = genProgress(state.pokemon, col).map((g) => `
    <button type="button" class="gp${String(g.gen) === activeGen ? " is-active" : ""}${g.owned === g.total ? " is-done" : ""}" data-gen="${g.gen}">
      <span class="gp-top"><b>Gen ${g.gen}</b> <span class="gp-region">${g.region}</span></span>
      <span class="gp-count">Owned ${g.owned}/${g.total}</span>
      <span class="bar"><span style="width:${pct(g.owned, g.total)}%"></span></span>
    </button>`).join("") + specialProgress(state.pokemon, col).map((g) => `
    <button type="button" class="gp gp-special${g.key === activeGen ? " is-active" : ""}${g.owned === g.total ? " is-done" : ""}" data-gen="${g.key}">
      <span class="gp-top"><b>Special</b> <span class="gp-region">${g.name}</span></span>
      <span class="gp-count">Owned ${g.owned}/${g.total}</span>
      <span class="bar"><span style="width:${pct(g.owned, g.total)}%"></span></span>
    </button>`).join("");

  const query = $("coll-search").value.trim();
  const list = sortCollection(
    filterCollection(state.pokemon, col, collectionFilters()).filter((p) => matchesSearch(p, query)),
    col, $("f-sort").value);
  $("coll-count").textContent = `${list.length} Pokémon`;
  $("coll-grid").innerHTML = list.map((p) => {
    const e = col[p.id];
    return miniTile(p, e ? { count: e.count, shinyCount: e.shiny } : { missing: true });
  }).join("") || `<p class="hint">${query
    ? `No Pokémon match “${escHtml(query)}” with these filters.`
    : "No Pokémon match these filters."}</p>`;

  $("history-count").textContent = state.history.length
    ? `Last ${state.history.length} opens` : "";
  const fmtTime = (t) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  $("history-list").innerHTML = state.history.length
    ? state.history.map((h) => {
      const p = state.byId.get(h.id);
      return `
        <li>
          <button type="button" class="hist r-${h.rarity}" data-pokemon="${p.id}"${h.shiny ? ` data-shiny="1"` : ""}>
            <span class="hist-thumb"><img class="mini-img" src="${thumbUrl(p, h.shiny)}" alt="" loading="lazy"></span>
            <span class="hist-main">
              <span class="hist-name">${p.name}${h.shiny ? ` <span class="mini-shiny">★ Shiny</span>` : ""}</span>
              <span class="hist-meta">${isSpecial(p) ? sourceLabel(p) : `#${pad4(p.id)} · Gen ${p.gen}`} · BST ${p.bst} ${sourceTag(dropSource(h))}</span>
            </span>
            <span class="hist-rarity">${rarityInfo(h.rarity).name}</span>
            <time class="hist-time">${fmtTime(h.t)}</time>
          </button>
        </li>`;
    }).join("")
    : `<li class="hint">No cases opened yet. Open your first case on the Case tab.</li>`;
}

function clearData() {
  if (!confirm("Delete your whole collection and roll history?\nThis cannot be undone.")) return;
  state.collection = {};
  state.history = [];
  saveProgress();
  renderRecent();
  updateCollectionTab();
  renderCollection();
}

// "View in collection": mở trang bộ sưu tập, cuộn tới ô của Pokémon này và nháy sáng ô đó.
// Nếu bộ lọc hoặc ô tìm kiếm đang làm ẩn Pokémon này thì đưa chúng về mặc định (giữ nguyên cách sắp xếp).
function locateInCollection(id) {
  showView("collection");
  const find = () => $("coll-grid").querySelector(`[data-pokemon="${id}"]`);
  if (!find()) {
    $("coll-search").value = "";
    for (const f of ["f-gen", "f-rarity", "f-status"]) $(f).value = "all";
    renderCollection();
  }
  const tile = find();
  if (!tile) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  tile.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  tile.focus({ preventScroll: true }); // dùng bàn phím: Enter/Space trên ô này mở chi tiết
  tile.classList.remove("is-located");
  void tile.offsetWidth; // chạy lại hiệu ứng nháy nếu bấm nhiều lần
  tile.classList.add("is-located");
}

const VIEWS = ["case", "collection", "custom"];

function showView(view) {
  state.view = view;
  for (const v of VIEWS) $(`view-${v}`).hidden = view !== v;
  for (const tab of document.querySelectorAll(".tab")) {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  if (view === "collection") renderCollection();
  if (view === "custom") showCustomMode(); // trang vừa hiện ra mới đo được kích thước để căn dải quay
  window.scrollTo(0, 0);
}

// ----- Danh sách nội dung hòm -----

function formatPct(x) {
  if (x === 0) return "0%";
  return (x >= 1 ? x.toFixed(2) : x.toPrecision(2)) + "%";
}

function openContents() {
  const chances = effectiveChances(state.groups);
  const total = poolSize();
  $("contents-summary").textContent = `${total} Pokémon`;

  // Hiện từ bậc hiếm nhất xuống thấp nhất, giống CS2.
  $("contents-body").innerHTML = [...RARITIES].reverse().map((r) => {
    const list = state.groups[r.key];
    if (list.length === 0) return "";
    const each = chances[r.key] / list.length;
    const tiles = list.map((p) => `
      <button type="button" class="mini" data-pokemon="${p.id}" data-search="${p.name.toLowerCase()} ${p.baseId || p.id}">
        <img class="mini-img" src="${thumbUrl(p)}" alt="" loading="lazy">
        <span class="mini-name">${p.name}</span>
        <span class="mini-id">${dexLabel(p)}</span>
      </button>`).join("");
    return `
      <section class="contents-group r-${r.key}">
        <h3 class="contents-head">
          <span class="contents-name">${r.name}</span>
          <span class="contents-meta">${list.length} Pokémon · ${formatPct(chances[r.key])} total · ≈${formatPct(each)} each</span>
        </h3>
        <div class="contents-grid">${tiles}</div>
      </section>`;
  }).join("");

  $("contents-search").value = "";
  $("contents-empty").hidden = true;
  $("contents-modal").showModal();
}

function filterContents() {
  const q = $("contents-search").value.trim().toLowerCase();
  let shown = 0;
  for (const group of $("contents-body").querySelectorAll(".contents-group")) {
    let groupShown = 0;
    for (const tile of group.querySelectorAll(".mini")) {
      const match = !q || tile.dataset.search.includes(q);
      tile.hidden = !match;
      if (match) groupShown++;
    }
    group.hidden = groupShown === 0;
    shown += groupShown;
  }
  $("contents-empty").hidden = shown > 0;
}

// ----- Chi tiết Pokémon & nơi xuất hiện (Cobbleverse) -----

function renderSpawnEntry(e) {
  const line = (label, value) => value
    ? `<div class="spawn-line"><span class="spawn-label">${label}</span>${escHtml(value)}</div>` : "";
  return `
    <li class="spawn">
      <div class="spawn-tags">
        <span class="bucket b-${escHtml(e.b)}">${escHtml(SPAWN_BUCKETS[e.b] || e.b)}</span>
        <span class="spawn-tag">Lv. ${escHtml(e.l)}</span>
        ${e.c ? `<span class="spawn-tag">${escHtml(SPAWN_CONTEXTS[e.c] || e.c)}</span>` : ""}
      </div>
      ${line("Form", e.f)}
      ${line("Biomes", (e.in || []).join(", ") || "Any biome")}
      ${line("Not in", (e.ex || []).join(", "))}
      ${line("Conditions", e.cond)}
      ${line("Bonus", e.w)}
    </li>`;
}

function renderSpawnSection(p) {
  if (typeof SPAWN_DATA === "undefined") {
    return `<p class="hint">Spawn data not found — make sure <b>spawns.js</b> is next to index.html.</p>`;
  }
  const info = SPAWN_DATA[p.id];
  if (!info) {
    return `
      <p class="spawn-none">${p.name} doesn't spawn naturally in Cobbleverse — it is obtained another way
      (summoning, fossils, events…). <a href="${WIKI_URL}/legendaries.html" target="_blank" rel="noopener">Check the wiki ↗</a></p>`;
  }
  const shown = info.entries.slice(0, SPAWN_VISIBLE).map(renderSpawnEntry).join("");
  const rest = info.entries.slice(SPAWN_VISIBLE);
  return `
    <ul class="spawn-list">${shown}</ul>
    ${rest.length ? `
      <details class="spawn-more">
        <summary>Show ${rest.length} more</summary>
        <ul class="spawn-list">${rest.map(renderSpawnEntry).join("")}</ul>
      </details>` : ""}
    <a class="spawn-link" href="${WIKI_URL}/spawns.html#${encodeURIComponent(info.id)}" target="_blank" rel="noopener">
      Spawn odds & build guide on Cobbleverse Wiki ↗</a>`;
}

// Cách tiến hóa của Pokémon Special (dữ liệu lấy từ file mod, xem scripts/build-special.js).
function renderEvolutionSection(p) {
  const g = specialGroup(p.group);
  return `
    <div class="evo">
      <p class="evo-how">${escHtml(p.evolution.how)}</p>
      <ul class="evo-list">${p.evolution.conditions.map((c) => `<li>${escHtml(c)}</li>`).join("")}</ul>
    </div>
    <a class="spawn-link" href="${g.url}" target="_blank" rel="noopener">${escHtml(g.title)} on Modrinth ↗</a>`;
}

// Dòng nguồn dữ liệu cuối popup chi tiết.
function detailCredit(p) {
  if (!isSpecial(p)) {
    return `Spawn data: <a href="${WIKI_URL}/" target="_blank" rel="noopener">Cobbleverse Wiki</a>`;
  }
  const g = specialGroup(p.group);
  return `<a href="${g.url}" target="_blank" rel="noopener">${escHtml(g.title)}</a> by ${escHtml(g.author)}, licensed ${g.license}`;
}

function ownedLine(p) {
  const e = state.collection[p.id];
  if (!e) return `<div class="owned-line">Not collected yet</div>`;
  return `<div class="owned-line is-owned">Owned ×${e.count}${e.shiny ? ` · ★ ${e.shiny} shiny` : ""}</div>`;
}

function openPokemonDetail(p, shiny = false) {
  const r = rarityInfo(p.rarity);
  $("detail-body").innerHTML = `
    <div class="showcase r-${p.rarity}">
      <div class="slab${shiny ? " is-shiny" : ""}">
        <div class="slab-head">
          <span class="slab-tier">${r.name}</span>
          ${shiny ? `<span class="slab-shiny">★ Shiny</span>` : ""}
          <span class="slab-id">${dexLabel(p)}</span>
        </div>
        <div class="slab-art"><img class="detail-img" alt="${p.name}"></div>
        <div class="slab-foot">
          <div class="detail-name">${p.name}</div>
          <div class="type-chips">${typeChips(p.types)}</div>
        </div>
      </div>
      <div class="reveal-info">
        ${tierPanel(p.rarity, shiny)}
        <dl class="facts">
          ${originFacts(p)}
          <div><dt>Base stat total</dt><dd>${p.bst}</dd></div>
        </dl>
        ${ownedLine(p)}
        ${tierLadder(p.rarity)}
        ${findSection(p)}
      </div>
    </div>`;
  $("detail-credit").innerHTML = detailCredit(p);
  setPokemonImage($("detail-body").querySelector("img"), p, shiny);
  $("detail-modal").showModal();
  $("detail-body").parentElement.scrollTop = 0;
}

// ----- Quay -----

// quick = true: "Quick open" — bỏ qua hiệu ứng dải thẻ, ra kết quả ngay.
async function spin({ quick = false } = {}) {
  if (state.spinning) return;
  const groups = state.groups; // hòm lúc quay
  const result = rollOnce(groups);
  if (!result) return;

  // Ghi vào bộ sưu tập ngay (không mất kết quả nếu lỡ đóng app giữa chừng),
  // nhưng chỉ hiện ra sau khi dải thẻ dừng.
  const isNew = !state.collection[result.pokemon.id];
  const entry = recordDrop(state.collection, state.history, result);
  saveProgress();

  state.spinning = true;
  const items = buildReelItems(result, state.groups);

  if (quick) {
    renderReel(items);
    jumpReel(WIN_INDEX);
  } else {
    updateSpinButton("Loading…");
    audio(); // mở âm thanh ngay trong lúc bấm (trình duyệt chỉ cho phát tiếng sau thao tác của người dùng)
    // Chỉ chờ các thẻ thấy được lúc bắt đầu và lúc dừng; thẻ ở giữa tải trong lúc dải đang chạy.
    const visible = items.filter((_, i) => i < IDLE_REEL_SIZE || Math.abs(i - WIN_INDEX) <= 6);
    const urls = [...new Set(visible.map((it) => imageUrl(it.pokemon, it.shiny)))];
    await preloadImages(urls, PRELOAD_TIMEOUT_MS);

    renderReel(items);
    updateSpinButton("Opening…");
    await animateReel(WIN_INDEX);
  }

  $("reel-strip").children[WIN_INDEX].classList.add("is-winner");
  state.spinning = false;
  updateSpinButton();
  renderRecent();
  updateCollectionTab();
  if (state.view === "collection") renderCollection();
  showResultModal(result, { isNew, count: entry.count, groups });
}

// =====================================================================
// TRANG CUSTOM: khung chung cho các chế độ quay vui
// =====================================================================

// Mỗi chế độ là một đối tượng, đăng ký bằng registerCustomMode({...}). Thêm chế độ mới chỉ cần
// đăng ký thêm một mục — thanh chọn chế độ, các nút hành động, phím tắt và panel "How it works" tự có.
//   key             mã chế độ (lưu trong localStorage và lịch sử quay)
//   name, desc      tên và mô tả một dòng trên thanh chọn chế độ
//   icon            SVG nhỏ cạnh tên
//   rules           các dòng trong panel "How it works"
//   mount(stage)    vẽ giao diện vào khung riêng của chế độ (chạy một lần)
//   actions         các nút hành động; mỗi nút có thêm nút ⚡ (quick: bỏ qua hiệu ứng)
//     key             mã nút
//     label()         chữ trên nút, vd. "Open Fire case"
//     icon            SVG nhỏ trước chữ                                          — tuỳ chọn
//     hotkey          phím tắt một chữ cái, vd. "W"                              — tuỳ chọn
//     hint()          lý do nút đang khóa, "" nếu bấm được                       — tuỳ chọn
//     run({ quick })  chạy hành động; trả về Promise xong khi chạy xong
//   defaultAction() mã nút mà phím Space bấm (mặc định: nút đầu tiên)            — tuỳ chọn
//   status()        dòng nhắc dưới các nút (mặc định: lý do khóa của nút Space)   — tuỳ chọn
//   onShow(), onPoolChanged() (custom.pool đã cập nhật), realign() (đổi cỡ cửa sổ) — tuỳ chọn
// Chế độ chỉ có một hành động có thể khai báo spin({ quick }) (kèm spinLabel, emptyHint) thay cho actions.
// Trong lúc chạy, hành động gọi setCustomSpinning(true, "Spinning…") và setCustomSpinning(false) khi xong.
const CUSTOM_MODES = [];

const custom = {
  gens: new Set(),  // gen đã chọn ở trang Custom
  pool: [],         // Pokémon thuộc các gen đó (đã gắn độ hiếm), dùng chung cho mọi chế độ
  active: null,     // chế độ đang chọn
  running: null,    // mã hành động đang chạy
  ready: false,     // true khi trang Custom đã dựng xong
};

const ICON_QUICK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>`;

function registerCustomMode(mode) {
  CUSTOM_MODES.push(mode);
  if (!custom.ready) return; // initCustom sẽ dựng các chế độ đăng ký trước đó
  mountCustomMode(mode);
  renderModeBar();
  if (!custom.active) selectCustomMode(mode.key, { save: false });
}

// Các nút hành động của chế độ (chế độ chỉ khai báo spin() thì có một nút "Spin").
function modeActions(mode) {
  if (!mode.actions) {
    mode.actions = [{
      key: "spin",
      label: () => mode.spinLabel || "Spin",
      hint: () => (mode.emptyHint ? mode.emptyHint() : ""),
      run: (opts) => mode.spin(opts),
    }];
  }
  return mode.actions;
}

function defaultActionKey(mode) {
  return mode.defaultAction ? mode.defaultAction() : modeActions(mode)[0].key;
}

const actionHint = (action) => (action && action.hint ? action.hint() : "");
const lowerFirst = (str) => str.charAt(0).toLowerCase() + str.slice(1);

function mountCustomMode(mode) {
  const panel = document.createElement("section");
  panel.className = "mode-panel";
  panel.id = `mode-${mode.key}`;
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-label", mode.name);
  panel.hidden = true;
  $("mode-stage").appendChild(panel);
  mode.root = panel;
  mode.mount(panel);
}

function renderModeBar() {
  $("mode-bar").innerHTML = CUSTOM_MODES.map((m) => `
    <button type="button" class="mode-btn" role="tab" data-mode="${m.key}" aria-controls="mode-${m.key}"
      aria-selected="${m === custom.active}">
      <span class="mode-icon" aria-hidden="true">${m.icon || ""}</span>
      <span class="mode-name">${m.name}</span>
      <span class="mode-desc">${m.desc}</span>
    </button>`).join("");
  renderCustomControls();
}

function selectCustomMode(key, { save = true } = {}) {
  const mode = CUSTOM_MODES.find((m) => m.key === key);
  if (!mode || state.spinning) return;
  custom.active = mode;
  for (const m of CUSTOM_MODES) m.root.hidden = m !== mode;
  for (const btn of $("mode-bar").querySelectorAll(".mode-btn")) {
    btn.setAttribute("aria-selected", String(btn.dataset.mode === key));
  }
  if (save) saveJson(STORAGE_KEY_CUSTOM_MODE, key);
  $("mode-rules-name").textContent = mode.name;
  $("mode-rule-list").innerHTML = (mode.rules || []).map((r) => `<li>${r}</li>`).join("");
  renderCustomActions();
  if (state.view === "custom") showCustomMode();
}

// Tab Custom hoặc chế độ vừa hiện ra.
function showCustomMode() {
  const mode = custom.active;
  if (!mode) return;
  if (mode.onShow) mode.onShow();
  if (mode.realign) mode.realign();
}

// Dựng các nút hành động của chế độ đang chọn: nút chính + nút ⚡ quick cho mỗi hành động.
function renderCustomActions() {
  const mode = custom.active;
  $("custom-actions").innerHTML = mode ? modeActions(mode).map((a) => `
    <div class="action-group" data-group="${a.key}">
      <button type="button" class="btn btn-spin action-main" data-action="${a.key}">${a.icon || ""}<span class="action-label"></span></button>
      <button type="button" class="btn btn-ghost action-quick" data-action="${a.key}" data-quick="1">${ICON_QUICK}</button>
    </div>`).join("") : "";
  renderCustomControls();
}

// Trạng thái các nút của trang Custom. Khóa quay dùng chung với trang Case (state.spinning).
// Nút mà phím Space bấm là nút nổi bật (xanh đặc), các nút khác viền xanh.
// label: chữ hiện trên nút đang chạy (vd. "Spinning…").
function renderCustomControls(label) {
  const mode = custom.active;
  const actions = mode ? modeActions(mode) : [];
  const def = mode ? defaultActionKey(mode) : null;
  for (const a of actions) {
    const group = $("custom-actions").querySelector(`[data-group="${a.key}"]`);
    if (!group) continue;
    const main = group.querySelector(".action-main");
    const quick = group.querySelector(".action-quick");
    const text = a.label();
    main.disabled = quick.disabled = state.spinning || Boolean(actionHint(a));
    main.classList.toggle("is-secondary", a.key !== def);
    if (!(state.spinning && custom.running === a.key)) main.querySelector(".action-label").textContent = text;
    else if (label) main.querySelector(".action-label").textContent = label;
    quick.title = `Quick: ${lowerFirst(text)} without the animation`;
    quick.setAttribute("aria-label", quick.title);
  }

  const defAction = actions.find((a) => a.key === def);
  const status = !mode ? "No modes available yet." : mode.status ? mode.status() : actionHint(defAction);
  $("custom-hint").textContent = state.spinning ? "" : status;
  // Ghi chú phím: nút Space đứng đầu, sau đó các nút có phím tắt riêng
  $("custom-kbd").innerHTML = [defAction, ...actions.filter((a) => a !== defAction)].filter(Boolean).map((a) => {
    const keys = [...(a.key === def ? ["Space"] : []), ...(a.hotkey ? [a.hotkey] : [])];
    return keys.length ? `${keys.map((k) => `<kbd>${k}</kbd>`).join(" ")} ${escHtml(lowerFirst(a.label()))}` : "";
  }).filter(Boolean).join(" · ");

  for (const b of $("mode-bar").querySelectorAll(".mode-btn")) b.disabled = state.spinning;
  // Đang quay: khóa bảng chọn gen của trang Custom, quay xong mới đổi được
  for (const input of $("custom-gen-grid").querySelectorAll("input")) input.disabled = state.spinning;
  $("custom-all").disabled = state.spinning;
  $("custom-none").disabled = state.spinning;
}

// Bắt đầu / kết thúc một hành động của chế độ Custom (khóa cả nút quay của trang Case).
function setCustomSpinning(on, label) {
  state.spinning = on;
  if (!on) custom.running = null;
  updateSpinButton();
  renderCustomControls(label);
}

function runCustomAction(key, { quick = false } = {}) {
  const mode = custom.active;
  const action = mode && modeActions(mode).find((a) => a.key === key);
  if (!action || state.spinning || actionHint(action)) return;
  custom.running = key;
  return action.run({ quick });
}

// Chạy hành động mà phím Space đang chỉ tới.
function runCustomSpin(opts) {
  return custom.active ? runCustomAction(defaultActionKey(custom.active), opts) : undefined;
}

// Nút ứng với phím vừa bấm ở trang Custom: Space → nút nổi bật, chữ cái → nút có phím tắt đó.
function customActionButton(code) {
  const mode = custom.active;
  if (!mode) return null;
  const key = code === "Space"
    ? defaultActionKey(mode)
    : (modeActions(mode).find((a) => a.hotkey && `Key${a.hotkey.toUpperCase()}` === code) || {}).key;
  return key ? $("custom-actions").querySelector(`.action-main[data-action="${key}"]`) : null;
}

function onCustomGensChanged() {
  saveSelectedGens(custom.gens, STORAGE_KEY_CUSTOM_GENS);
  updateCustomPool();
}

function updateCustomPool() {
  custom.pool = filterByGens(state.pokemon, custom.gens);
  $("custom-pool-count").textContent = custom.pool.length;
  for (const m of CUSTOM_MODES) if (m.onPoolChanged) m.onPoolChanged();
  renderCustomControls();
}

function initCustom() {
  custom.gens = loadSelectedGens(STORAGE_KEY_CUSTOM_GENS);
  const grid = $("custom-gen-grid");
  buildGenGrid({ grid, selected: custom.gens, onChange: onCustomGensChanged });
  $("custom-all").addEventListener("click", () => {
    for (const key of allSourceKeys()) custom.gens.add(key);
    syncCheckboxes(grid, custom.gens);
    onCustomGensChanged();
  });
  $("custom-none").addEventListener("click", () => {
    custom.gens.clear();
    syncCheckboxes(grid, custom.gens);
    onCustomGensChanged();
  });

  custom.ready = true;
  for (const m of CUSTOM_MODES) mountCustomMode(m);
  renderModeBar();
  updateCustomPool();
  const saved = loadJson(STORAGE_KEY_CUSTOM_MODE, null, (v) => typeof v === "string");
  const first = CUSTOM_MODES.find((m) => m.key === saved) || CUSTOM_MODES[0];
  if (first) selectCustomMode(first.key, { save: false });

  $("mode-bar").addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (btn) selectCustomMode(btn.dataset.mode);
  });
  $("custom-actions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn) runCustomAction(btn.dataset.action, { quick: btn.dataset.quick === "1" });
  });
}

// =====================================================================
// CHẾ ĐỘ CUSTOM: Type Roulette
// =====================================================================

const ICON_WHEEL = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V5M12 13l6.9 4M12 13l-6.9 4M12 2v3"/></svg>`;

// 18 hệ theo thứ tự trong game — cũng là thứ tự các ô trên bánh xe (theo chiều kim đồng hồ, bắt đầu từ kim chỉ).
const TYPE_ORDER = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];

const WHEEL_SPIN_MS = 3600;   // thời gian quay bánh xe
const WHEEL_TURNS = 5;        // số vòng quay trọn trước khi dừng
const ROULETTE_REEL_MS = 4000; // dải thẻ ở Type Roulette ngắn hơn trang Case

const typeName = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Pokémon của từng hệ: { fire: [...], water: [...] } — chỉ gồm hệ có Pokémon, theo thứ tự TYPE_ORDER.
// Pokémon hai hệ nằm trong cả hai nhóm (Gyarados thuộc cả Water lẫn Flying).
function typePools(pool) {
  const pools = {};
  for (const t of TYPE_ORDER) {
    const list = pool.filter((p) => p.types.includes(t));
    if (list.length > 0) pools[t] = list;
  }
  return pools;
}

// Ô nằm dưới kim chỉ khi bánh xe đã xoay rotation độ (chiều kim đồng hồ).
// Bánh xe có n ô bằng nhau; ô i chiếm cung [i·a, (i+1)·a) tính từ kim chỉ, a = 360/n.
function wheelSliceAt(rotation, n) {
  const a = 360 / n;
  const angle = (((-rotation) % 360) + 360) % 360;
  return Math.min(Math.floor(angle / a), n - 1);
}

// Góc xoay cuối để kim chỉ dừng trên ô index: quay thêm turns vòng trọn từ góc hiện tại (current),
// lệch ngẫu nhiên khỏi tâm ô tối đa 40% bề rộng ô (giống dải thẻ) để không lúc nào cũng dừng đúng giữa.
function wheelTarget(current, index, n, offsetFrac = Math.random() * 2 - 1, turns = WHEEL_TURNS) {
  const a = 360 / n;
  const angle = (index + 0.5 + offsetFrac * 0.4) * a; // điểm trên bánh xe cần nằm dưới kim
  const delta = (((-angle - current) % 360) + 360) % 360;
  return current + turns * 360 + delta;
}

// Chữ trên ô màu: tối trên màu sáng, trắng trên màu tối.
function inkOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "#12151c" : "#fff";
}

// Bánh xe SVG: một ô cho mỗi hệ, màu theo hệ, tên hệ chạy dọc bán kính.
function wheelSvg(types) {
  const n = types.length, a = 360 / n, R = 97, r0 = 32;
  const pt = (deg, rad) => {
    const t = (deg - 90) * Math.PI / 180;
    return `${(rad * Math.cos(t)).toFixed(3)} ${(rad * Math.sin(t)).toFixed(3)}`;
  };
  const slices = types.map((t, i) => {
    const s = i * a, e = (i + 1) * a, mid = s + a / 2, large = a > 180 ? 1 : 0;
    const color = TYPE_COLORS[t] || "#777";
    const d = n === 1
      ? `M 0 ${-R} A ${R} ${R} 0 1 1 0 ${R} A ${R} ${R} 0 1 1 0 ${-R} Z M 0 ${-r0} A ${r0} ${r0} 0 1 0 0 ${r0} A ${r0} ${r0} 0 1 0 0 ${-r0} Z`
      : `M ${pt(s, r0)} L ${pt(s, R)} A ${R} ${R} 0 ${large} 1 ${pt(e, R)} L ${pt(e, r0)} A ${r0} ${r0} 0 ${large} 0 ${pt(s, r0)} Z`;
    // Chữ chạy dọc bán kính, mọi ô cùng chiều (từ tâm ra ngoài) vì bánh xe dừng ở góc bất kỳ
    return `
      <g class="wheel-slice" data-type="${t}" data-index="${i}">
        <path d="${d}" fill="${color}" fill-rule="evenodd"/>
        <text transform="rotate(${mid - 90}) translate(${(R + r0) / 2} 0)" fill="${inkOn(color)}">${typeName(t)}</text>
      </g>`;
  }).join("");
  return `
    <svg viewBox="-100 -100 200 200" aria-hidden="true">
      <circle class="wheel-rim" r="99"/>
      ${slices}
    </svg>`;
}

const STORAGE_KEY_ROULETTE_TYPE = "pokeroll.custom.typeRoulette.type"; // hệ đang chọn ở Type Roulette

const ICON_CASE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>`;
const ICON_WHEEL_BTN = ICON_WHEEL.replace('width="20" height="20"', 'width="18" height="18" aria-hidden="true"');

// Trạng thái riêng của Type Roulette.
const roulette = {
  types: [],        // các hệ đang có trên bánh xe (đúng thứ tự các ô)
  pools: {},        // Pokémon của từng hệ (đã lọc theo gen của trang Custom)
  rotation: 0,      // góc xoay hiện tại của bánh xe (độ, cộng dồn)
  selected: null,   // hệ đang chọn (trúng ở lần quay bánh xe gần nhất); null = chưa quay
  lost: null,       // hệ vừa bị bỏ vì đổi gen làm hệ đó hết Pokémon (để báo người dùng)
};

// Đặt hệ đang chọn và lưu lại (tải lại trang vẫn giữ).
function selectType(type) {
  roulette.selected = type;
  saveJson(STORAGE_KEY_ROULETTE_TYPE, type);
}

// Đặt ngay góc xoay của bánh xe, không có hiệu ứng.
function setWheelRotation(deg) {
  const disc = $("tr-disc");
  disc.style.transition = "none";
  disc.style.transform = `rotate(${deg}deg)`;
  roulette.rotation = deg;
}

// Vẽ lại bánh xe theo các hệ hiện có; đang có hệ thì kim chỉ vào giữa ô của hệ đó.
function renderWheel() {
  setWheelRotation(roulette.rotation % 360);
  $("tr-disc").innerHTML = roulette.types.length ? wheelSvg(roulette.types) : "";
  $("tr-wheel").classList.toggle("is-empty", roulette.types.length === 0);
  $("tr-wheel").classList.remove("has-winner");
  $("tr-hub").textContent = roulette.types.length ? "?" : "";
  $("tr-hub").style.removeProperty("--t");
  const n = roulette.types.length;
  $("tr-wheel-caption").textContent = n
    ? `${n} type${n > 1 ? "s" : ""} on the wheel · each 1 in ${n}`
    : "No types: select at least one generation";
  if (roulette.pools[roulette.selected]) {
    setWheelRotation(wheelTarget(0, roulette.types.indexOf(roulette.selected), n, 0, 0));
    markWheelWinner(roulette.selected);
  }
}

// Làm sáng ô trúng, các ô khác mờ đi; tên hệ hiện ở giữa bánh xe.
function markWheelWinner(type) {
  const svg = $("tr-disc").querySelector("svg");
  const slice = svg.querySelector(`.wheel-slice[data-type="${type}"]`);
  for (const g of svg.querySelectorAll(".wheel-slice")) g.classList.toggle("is-winner", g === slice);
  svg.appendChild(slice); // vẽ sau cùng để viền sáng không bị ô bên cạnh che
  $("tr-wheel").classList.add("has-winner");
  $("tr-hub").textContent = typeName(type);
  $("tr-hub").style.setProperty("--t", TYPE_COLORS[type]);
}

// Ô đang nằm dưới kim chỉ, đọc từ góc xoay thật trên màn hình (để kiểm tra và phát tiếng tick).
function wheelSliceOnScreen() {
  const t = getComputedStyle($("tr-disc")).transform;
  const m = t && t !== "none" ? new DOMMatrixReadOnly(t) : new DOMMatrixReadOnly();
  const deg = Math.atan2(m.b, m.a) * 180 / Math.PI;
  return wheelSliceAt(deg, roulette.types.length);
}

// Quay bánh xe tới góc target. Trả về Promise xong khi bánh xe dừng hẳn.
function animateWheel(target) {
  const disc = $("tr-disc");
  void disc.offsetWidth; // áp vị trí đầu trước khi bắt đầu quay
  disc.style.transition = `transform ${WHEEL_SPIN_MS}ms cubic-bezier(0.15, 0.75, 0.12, 1)`;
  disc.style.transform = `rotate(${target}deg)`;
  roulette.rotation = target;
  $("tr-wheel").classList.add("is-spinning");

  let running = true;
  let last = null;
  const loop = () => {
    if (!running) return;
    const index = wheelSliceOnScreen();
    if (last !== null && index !== last) playTick();
    last = index;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      running = false;
      $("tr-wheel").classList.remove("is-spinning");
      disc.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onEnd = (e) => { if (e.target === disc) finish(); };
    disc.addEventListener("transitionend", onEnd);
    setTimeout(finish, WHEEL_SPIN_MS + 500); // phòng khi transitionend không chạy (vd. tab bị ẩn)
  });
}

// Panel tỉ lệ: có hệ thì hiện số Pokémon và tỉ lệ thật mỗi bậc của hệ đó, chưa có thì nhắc quay bánh xe.
function renderTypeOdds(type, note) {
  const n = roulette.types.length;
  if (!type) {
    $("tr-odds-title").textContent = "Type case";
    $("tr-odds-count").innerHTML = "";
    $("tr-odds-list").innerHTML = "";
    $("tr-odds-sub").textContent = note || (!n
      ? "Select at least one generation below."
      : roulette.lost
        ? `${typeName(roulette.lost)} has no Pokémon in the selected generations. Spin the wheel again.`
        : "Spin the wheel to pick a type. Its tiers show here.");
    return;
  }
  const groups = groupByRarity(roulette.pools[type]);
  const chances = effectiveChances(groups);
  $("tr-odds-title").innerHTML = `<span class="type-chip" style="--t:${TYPE_COLORS[type]}">${typeName(type)}</span> case`;
  $("tr-odds-count").innerHTML = `<strong>${groupsSize(groups)}</strong> <span>Pokémon</span>`;
  $("tr-odds-sub").textContent = `${typeName(type)} is 1 in ${n} on the wheel. Empty tiers drop to the next lower tier.`;
  $("tr-odds-list").innerHTML = RARITIES.map((r) => {
    const count = groups[r.key].length;
    return `
      <li class="rarity-row r-${r.key}${count === 0 ? " is-empty" : ""}" style="--p:${chances[r.key]}">
        <span class="rarity-swatch"></span>
        <span class="rarity-info"><span class="rarity-name">${r.name}</span></span>
        <span class="rarity-count" title="Pokémon in this tier">${count}</span>
        <span class="rarity-chance">${formatPct(chances[r.key])}</span>
      </li>`;
  }).reverse().join("");
}

// Dải thẻ lúc chưa mở hòm: Pokémon của hệ đang chọn, chưa có hệ thì Pokémon bất kỳ trong các gen đã chọn.
function renderRouletteIdleReel() {
  const pool = roulette.pools[roulette.selected] || custom.pool;
  renderIdleReel(groupByRarity(pool), $("tr-reel"));
}

// Đổi gen: dựng lại bánh xe. Hệ đang chọn hết Pokémon thì bỏ hệ đó và báo người dùng quay lại.
// Chưa chọn gen nào (vd. vừa bấm None để chọn lại) thì vẫn giữ hệ — lúc đó các nút đều khóa.
function refreshRoulette() {
  roulette.pools = typePools(custom.pool);
  roulette.types = Object.keys(roulette.pools);
  if (roulette.selected && roulette.types.length > 0 && !roulette.pools[roulette.selected]) {
    roulette.lost = roulette.selected;
    selectType(null);
  }
  renderWheel();
  renderTypeOdds(roulette.pools[roulette.selected] ? roulette.selected : null);
  renderRouletteIdleReel();
}

// Hành động 1: quay bánh xe ra một hệ (mỗi hệ trên bánh xe có cơ hội như nhau). Không mở hòm.
async function spinTypeWheel({ quick = false }) {
  const types = roulette.types;
  const type = pickRandom(types, Math.random());
  const target = wheelTarget(roulette.rotation % 360, types.indexOf(type), types.length);
  // Lưu ngay kết quả (tải lại trang giữa chừng vẫn giữ), nhưng chỉ hiện ra khi bánh xe dừng
  roulette.selected = null;
  roulette.lost = null;
  saveJson(STORAGE_KEY_ROULETTE_TYPE, type);
  $("tr-wheel").classList.remove("has-winner");
  $("tr-hub").textContent = "?";
  $("tr-hub").style.removeProperty("--t");

  if (quick) {
    setCustomSpinning(true);
    setWheelRotation(target);
  } else {
    setCustomSpinning(true, "Spinning…");
    audio(); // mở âm thanh ngay trong lúc bấm
    renderTypeOdds(null, "Spinning the wheel…");
    setWheelRotation(roulette.rotation % 360); // thu góc về 0–360° (nhìn không đổi) để số không lớn dần
    await animateWheel(target);
    const landed = types[wheelSliceOnScreen()];
    if (landed !== type) console.error(`Wheel stopped on ${landed}, expected ${type}`);
  }

  roulette.selected = type;
  markWheelWinner(type);
  renderTypeOdds(type);
  renderRouletteIdleReel();
  setCustomSpinning(false);
  playReveal("blue", false);
}

// Hành động 2: mở hòm chỉ gồm Pokémon của hệ đang chọn (cùng tỉ lệ độ hiếm và cách hạ bậc như trang Case).
async function openTypeCase({ quick = false }) {
  const type = roulette.selected;
  const groups = groupByRarity(roulette.pools[type]);
  const result = rollOnce(groups);
  if (!result) return;

  // Ghi ngay vào bộ sưu tập (giống trang Case), kèm chế độ và hệ trong lịch sử.
  const isNew = !state.collection[result.pokemon.id];
  const entry = recordDrop(state.collection, state.history, result);
  Object.assign(state.history[0], { mode: "type-roulette", detail: type });
  saveProgress();

  const reel = $("tr-reel");
  const items = buildReelItems(result, groups);
  if (quick) {
    setCustomSpinning(true);
    renderReel(items, reel);
    jumpReel(WIN_INDEX, undefined, reel);
  } else {
    setCustomSpinning(true, "Loading…");
    audio();
    const visible = items.filter((_, i) => i < IDLE_REEL_SIZE || Math.abs(i - WIN_INDEX) <= 6);
    await preloadImages([...new Set(visible.map((it) => imageUrl(it.pokemon, it.shiny)))], PRELOAD_TIMEOUT_MS);
    renderReel(items, reel);
    setCustomSpinning(true, "Opening…");
    await animateReel(WIN_INDEX, reel, ROULETTE_REEL_MS);
  }

  stripOf(reel).children[WIN_INDEX].classList.add("is-winner");
  setCustomSpinning(false);
  renderRecent();
  updateCollectionTab();
  if (state.view === "collection") renderCollection();
  const name = typeName(type);
  showResultModal(result, {
    isNew, count: entry.count, groups,
    again: () => runCustomAction("open"),
    canAgain: roulette.selected === type,
    extra: `
      <div class="result-note mode-note" style="--t:${TYPE_COLORS[type]}">
        Type Roulette · <b>${name}</b> case. The odds above are within the ${name} case; ${name} is 1 in ${roulette.types.length} on the wheel.
      </div>`,
  });
}

registerCustomMode({
  key: "type-roulette",
  name: "Type Roulette",
  desc: "Spin the wheel for a type, then open cases of only that type",
  icon: ICON_WHEEL,
  rules: [
    "Spin wheel picks a type. The wheel holds every type with Pokémon in your selected generations, each with the same chance.",
    "Open case opens a case of only that type, with the same tier odds as the Case page. Open it as many times as you like.",
    "Your type stays until you spin the wheel again, even after reloading the page. If a generation change leaves it with no Pokémon, spin again.",
    "Dual-type Pokémon count for both types: Gyarados can drop from Water or Flying.",
    "Shiny is rolled separately: 1 in 100.",
  ],
  // Nhãn trong lịch sử: "Type Roulette · Fire", gọn: "Type · Fire"
  label(detail, short) {
    const name = TYPE_ORDER.includes(detail) ? typeName(detail) : "?";
    return short ? `Type · ${name}` : `Type Roulette · ${name}`;
  },
  tagColor: (detail) => TYPE_COLORS[detail] || "",

  actions: [
    {
      key: "wheel",
      label: () => "Spin wheel",
      icon: ICON_WHEEL_BTN,
      hotkey: "W",
      hint: () => (roulette.types.length ? "" : "Select at least one generation."),
      run: spinTypeWheel,
    },
    {
      key: "open",
      label: () => (roulette.selected ? `Open ${typeName(roulette.selected)} case` : "Open case"),
      icon: ICON_CASE,
      hint: () => (!roulette.types.length ? "Select at least one generation." : roulette.selected ? "" : "Spin the wheel first."),
      run: openTypeCase,
    },
  ],
  // Space: mở hòm nếu đã có hệ, chưa có thì quay bánh xe
  defaultAction: () => (roulette.selected ? "open" : "wheel"),
  status() {
    if (!roulette.types.length) return "Select at least one generation to spin.";
    if (roulette.lost) return `${typeName(roulette.lost)} has no Pokémon in these generations. Spin the wheel again.`;
    if (!roulette.selected) return "Spin the wheel first.";
    return "";
  },

  mount(stage) {
    roulette.selected = loadJson(STORAGE_KEY_ROULETTE_TYPE, null, (v) => TYPE_ORDER.includes(v));
    stage.innerHTML = `
      <div class="tr-layout">
        <div class="tr-wheel-col">
          <div class="wheel" id="tr-wheel">
            <div class="wheel-disc" id="tr-disc"></div>
            <div class="wheel-hub"><span class="wheel-hub-type" id="tr-hub"></span></div>
            <div class="wheel-pointer" aria-hidden="true"></div>
          </div>
          <p class="wheel-caption" id="tr-wheel-caption" aria-live="polite"></p>
        </div>
        <div class="tr-side">
          <section class="reel" id="tr-reel" aria-label="Type case reel">
            <div class="reel-strip"></div>
            <div class="reel-marker" aria-hidden="true"></div>
            <p class="reel-empty">Select at least one generation</p>
          </section>
          <section class="panel tr-odds" aria-live="polite">
            <div class="panel-head">
              <div class="panel-title">
                <h2 id="tr-odds-title">Type case</h2>
                <p class="panel-sub" id="tr-odds-sub"></p>
              </div>
              <p class="pool-total" id="tr-odds-count"></p>
            </div>
            <ul class="rarity-list is-compact" id="tr-odds-list"></ul>
          </section>
        </div>
      </div>`;
  },

  // Bảng chọn gen bị khóa trong lúc quay nên ở đây không bao giờ đang quay
  onPoolChanged: refreshRoulette,

  realign() {
    realignReel($("tr-reel"));
  },
});

function init() {
  if (typeof POKEMON_DATA === "undefined") {
    document.querySelector("main").innerHTML =
      `<p class="error">Data not found. Make sure <b>data.js</b> is in the same folder as index.html.</p>`;
    return;
  }

  state.pokemon = [...POKEMON_DATA, ...SPECIAL_POKEMON].map((p) => ({ ...p, rarity: getRarity(p) }));
  state.dex = state.pokemon.filter((p) => !isSpecial(p));
  state.byId = new Map(state.pokemon.map((p) => [p.id, p]));
  state.selectedGens = loadSelectedGens();
  const validIds = new Set(state.byId.keys());
  state.collection = loadCollection(validIds);
  state.history = loadHistory(validIds);

  // Bộ lọc nhóm trong bộ sưu tập: thêm một mục cho mỗi nhóm Special
  $("f-gen").insertAdjacentHTML("beforeend",
    SPECIAL_GROUP_LIST.map((g) => `<option value="${g.key}">Special · ${g.name}</option>`).join(""));

  buildGenGrid();
  renderPoolStats();
  renderRecent();
  updateCollectionTab();

  renderIdleReel();
  initCustom();

  $("btn-all").addEventListener("click", () => {
    for (const key of allSourceKeys()) state.selectedGens.add(key);
    syncCheckboxes();
    onSelectionChanged();
  });

  $("btn-none").addEventListener("click", () => {
    state.selectedGens.clear();
    syncCheckboxes();
    onSelectionChanged();
  });

  $("btn-spin").addEventListener("click", () => spin());
  $("btn-quick").addEventListener("click", () => spin({ quick: true }));
  for (const btn of document.querySelectorAll(".btn-sound")) btn.addEventListener("click", toggleSound);
  renderSoundButton();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      realignReel();
      if (state.view === "custom" && custom.active && custom.active.realign) custom.active.realign();
    }, 100);
  });

  // Danh sách nội dung hòm
  const modal = $("contents-modal");
  $("btn-contents").addEventListener("click", openContents);
  $("contents-close").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); }); // bấm ra ngoài để đóng
  $("contents-search").addEventListener("input", filterContents);

  const detail = $("detail-modal");
  $("detail-close").addEventListener("click", () => detail.close());
  detail.addEventListener("click", (e) => { if (e.target === detail) detail.close(); });

  // Popup kết quả
  const resultModal = $("result-modal");
  $("result-close").addEventListener("click", () => resultModal.close());
  resultModal.addEventListener("click", (e) => { if (e.target === resultModal) resultModal.close(); });
  $("result-again").addEventListener("click", () => {
    resultModal.close();
    state.resultAgain();
  });

  // Phím Space: mở hòm ở trang Case, bấm nút nổi bật của chế độ đang chọn ở trang Custom,
  // hoặc "Open again" khi đang xem popup kết quả (chạy lại đúng hành động vừa ra kết quả).
  // Phím chữ cái (vd. W): phím tắt của các nút ở trang Custom.
  // Bấm giống hệt bấm nút (nút đang khóa thì không làm gì).
  document.addEventListener("keydown", (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    // Đang ở nút, ô nhập, ô chọn, link... thì để phím làm việc mặc định của nó.
    if (e.target.closest("button, a, input, select, textarea, summary, [contenteditable]")) return;
    const otherDialog = document.querySelector("dialog[open]");
    let btn = null;
    if (e.code === "Space") {
      if (resultModal.open) btn = $("result-again");
      else if (!otherDialog) btn = state.view === "case" ? $("btn-spin") : state.view === "custom" ? customActionButton("Space") : null;
    } else if (state.view === "custom" && !otherDialog) {
      btn = customActionButton(e.code);
    }
    if (!btn) return;
    e.preventDefault(); // không cuộn trang
    if (!btn.disabled) btn.click();
  });

  // Chuyển trang Case / Collection
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  }
  $("btn-see-collection").addEventListener("click", () => showView("collection"));
  $("result-view").addEventListener("click", () => {
    resultModal.close();
    locateInCollection(parseId($("result-view").dataset.target));
  });

  // Trang bộ sưu tập
  for (const id of ["f-gen", "f-rarity", "f-status", "f-sort"]) {
    $(id).addEventListener("change", renderCollection);
  }
  $("coll-search").addEventListener("input", renderCollection);
  $("gen-progress").addEventListener("click", (e) => {
    const card = e.target.closest(".gp");
    if (!card) return;
    const f = $("f-gen");
    f.value = f.value === card.dataset.gen ? "all" : card.dataset.gen; // bấm lần nữa để bỏ lọc
    renderCollection();
  });
  $("rarity-progress").addEventListener("click", (e) => {
    const card = e.target.closest(".rp");
    if (!card) return;
    const f = $("f-rarity");
    f.value = f.value === card.dataset.rarity ? "all" : card.dataset.rarity; // bấm lần nữa để bỏ lọc
    renderCollection();
  });
  $("btn-clear").addEventListener("click", clearData);

  // Bấm vào bất kỳ Pokémon nào (danh sách hòm, recent drops, bộ sưu tập, lịch sử) → xem chi tiết
  document.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-pokemon]");
    if (tile) openPokemonDetail(state.byId.get(parseId(tile.dataset.pokemon)), tile.dataset.shiny === "1");
  });
  // Ảnh nhỏ bị lỗi: ảnh local → ảnh CDN → ảnh dự phòng
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!img.classList || !img.classList.contains("mini-img") || img.src === FALLBACK_IMG) return;
    const local = img.src.match(/images\/sprite\/((?:shiny\/)?\d+\.png)$/);
    img.src = local ? `${SPRITE_URL}/${local[1]}` : FALLBACK_IMG;
  }, true);
}

// Chỉ chạy giao diện khi mở trong trình duyệt; khi chạy bằng Node (để test) thì xuất các hàm logic.
if (typeof document !== "undefined") {
  init();
} else if (typeof module !== "undefined") {
  module.exports = { RARITIES, SHINY_CHANCE, getRarity, filterByGens, groupByRarity,
    rollRarityKey, resolveRarity, effectiveChances, rollOnce, buildReelItems, simulateRolls,
    recordDrop, genProgress, filterCollection, matchesSearch, sortCollection, dropOdds, oneIn, rarityProgress,
    specialProgress, parseId, TYPE_ORDER, typePools, wheelSliceAt, wheelTarget };
}
