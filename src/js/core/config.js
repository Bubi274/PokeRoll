// Hằng số cấu hình: gen, độ hiếm, thời gian quay, nguồn ảnh, khóa lưu trữ.
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
const LOCAL_ARTWORK = "assets/images/artwork";
const LOCAL_SPRITE = "assets/images/sprite";
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

// Bánh xe (Type / Biome / Letter Roulette)
const WHEEL_SPIN_MS = 3600;   // thời gian quay bánh xe
const WHEEL_TURNS = 5;        // số vòng quay trọn trước khi dừng
const ROULETTE_REEL_MS = 4000; // dải thẻ ở các chế độ bánh xe ngắn hơn trang Case

// Dải thẻ hoặc bánh xe chưa báo bắt đầu chạy (transitionstart) thì đồng hồ dự phòng chờ thêm bấy nhiêu (watchTransform)
const TRANSITION_START_WAIT_MS = 2000;

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

