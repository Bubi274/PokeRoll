// Chế độ Biome Roulette: nhóm biome Cobbleverse và đăng ký chế độ.
"use strict";

// =====================================================================
// CHẾ ĐỘ CUSTOM: Biome Roulette (dữ liệu spawn Cobbleverse trong spawns.js)
// =====================================================================

// 129 tag biome trong dữ liệu spawn được gộp thành 18 nhóm dễ hiểu — đúng 18 ô trên bánh xe.
// Thứ tự ở đây là thứ tự các ô trên bánh xe (theo chiều kim đồng hồ, bắt đầu từ kim chỉ).
const BIOME_GROUPS = [
  { key: "ocean", name: "Ocean", color: "#1f5fbf",
    tags: ["Ocean", "Warm Ocean", "Lukewarm Ocean", "Cold Ocean", "Deep Ocean", "Frozen Ocean"] },
  { key: "beach", name: "Beach", color: "#efd9a0",
    tags: ["Beach", "Coast", "Island", "Tropical Island", "Snowy Beach"] },
  { key: "river", name: "River", color: "#3fb0e0",
    tags: ["Freshwater", "River", "Frozen River"] },
  { key: "swamp", name: "Swamp", color: "#66783a",
    tags: ["Swamp", "Mud"] },
  { key: "plains", name: "Plains", color: "#a9cf55",
    tags: ["Plains", "Grassland", "Temperate", "Floral", "Floral Meadow", "Sunflower Plains", "Blooming Valley", "Steppe",
      "Shrubland", "Highlands", "Secret Garden", "The Bumblezone", "Pollinated Fields"] },
  { key: "forest", name: "Forest", color: "#2e8b4f",
    tags: ["Forest", "Taiga", "Dark Forest", "Flower Forest", "Windswept Forest", "Cherry Grove", "Cherry Blossom",
      "Sakura Grove", "Sakura Valley", "Pale Garden", "Overgrowth"] },
  { key: "jungle", name: "Jungle", color: "#14b38a",
    tags: ["Jungle", "Bamboo", "Bamboo Jungle", "Lush"] },
  { key: "savanna", name: "Savanna", color: "#d4a03c",
    tags: ["Savanna"] },
  { key: "desert", name: "Desert", color: "#e2763f",
    tags: ["Desert", "Badlands", "Arid", "Sandy", "Wasteland", "Warped Desert"] },
  { key: "mountain", name: "Mountain", color: "#8e929e",
    tags: ["Hills", "Mountain", "Peak", "Plateau", "White Cliffs", "Crystal Canyon", "Volcanic", "Thermal"] },
  { key: "snowy", name: "Snowy", color: "#e4eef7",
    tags: ["Freezing", "Snowy Forest", "Snowy Taiga", "Tundra", "Glacial", "Frozen", "Snowy", "Snowy Plains",
      "Snowy Slopes", "Ice Spikes", "Frozen Peaks", "Cold"] },
  { key: "cave", name: "Cave", color: "#4b5068",
    tags: ["Cave", "Deep Dark", "Dripstone", "Dripstone Caves", "Lush Caves", "Crystalline Chasm", "Quartz"] },
  { key: "mystic", name: "Mystic", color: "#b45cd6",
    tags: ["Mushroom", "Mushroom Fields", "Fungus", "Magical", "Spooky"] },
  { key: "nether", name: "Nether", color: "#b3302c",
    tags: ["Nether", "Basalt", "Basalt Deltas", "Crimson", "Crimson Forest", "Warped", "Soul Sand", "Soul Sand Valley", "Soul Fire"] },
  { key: "end", name: "End", color: "#5b3f99",
    tags: ["End"] },
  { key: "sky", name: "Sky", color: "#9cc9ff",
    tags: ["Aether", "Sky", "Skyroot Forest", "Skyroot Woodland", "Skyroot Grove", "Skyroot Meadow"] },
  { key: "overworld", name: "Overworld", color: "#8a6a4b",
    tags: ["Overworld"] },
  { key: "legendary", name: "Legendary", color: "#ffc233",
    tags: ["Custom Spawn", "Howling Constructs", "Split Decision Temple", "Articuno Tower", "Zapdos Tower", "Moltres Tower",
      "Team Rocket Radio", "Origin Temple", "Whirl Island", "Bell Tower", "Ilex Shrine", "Regirock Temple", "Regice Temple",
      "Registeel Temple", "Kyogre Temple", "Groudon Vulcano", "Sky Pillar", "Jirachi Structure", "Deoxys Meteorite",
      "Newmoon Island", "Flower Paradise", "Sinnoh Temple", "Eternatus Cocoon", "Crown Spire", "Crown Cemetery",
      "Grasswither Shrine", "Icerend Shrine", "Groundblight Shrine", "Firescoruge Shrine"] },
];

const biomeInfo = (key) => BIOME_GROUPS.find((g) => g.key === key);

// Tag biome → mã nhóm, vd. "Dark Forest" → "forest"
const BIOME_TAG_GROUP = Object.fromEntries(BIOME_GROUPS.flatMap((g) => g.tags.map((t) => [t, g.key])));

// Các nhóm biome mà Pokémon spawn (theo mọi lượt spawn trong dữ liệu, kể cả câu cá / dưới nước).
// Không có dữ liệu spawn (hoặc là Pokémon Special) → không thuộc nhóm nào.
function biomeGroupsOf(p, spawns = typeof SPAWN_DATA !== "undefined" ? SPAWN_DATA : {}) {
  const info = isSpecial(p) ? null : spawns[p.id];
  const groups = new Set();
  if (info) for (const e of info.entries) for (const tag of e.in || []) if (BIOME_TAG_GROUP[tag]) groups.add(BIOME_TAG_GROUP[tag]);
  return groups;
}

// Pokémon của từng nhóm biome: { forest: [...], ... } — chỉ gồm nhóm có Pokémon, theo thứ tự BIOME_GROUPS.
// Pokémon spawn ở nhiều nhóm nằm trong tất cả các nhóm đó.
function biomePools(pool, spawns) {
  const pools = {};
  const memberships = pool.map((p) => [p, biomeGroupsOf(p, spawns)]);
  for (const g of BIOME_GROUPS) {
    const list = memberships.filter(([, groups]) => groups.has(g.key)).map(([p]) => p);
    if (list.length > 0) pools[g.key] = list;
  }
  return pools;
}

const STORAGE_KEY_BIOME = "pokeroll.custom.biomeRoulette.biome"; // nhóm biome đang chọn

const ICON_BIOME = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M2 20h20L15 8l-4 6-2-3-7 9z"/><circle cx="17" cy="5" r="2"/></svg>`;

// Trạng thái riêng của Biome Roulette. types = các nhóm đang có trên bánh xe (tên trường dùng chung với hàm bánh xe).
const biome = {
  types: [],        // mã các nhóm biome đang có trên bánh xe (đúng thứ tự các ô)
  pools: {},        // Pokémon của từng nhóm (đã lọc theo gen của trang Custom)
  rotation: 0,      // góc xoay hiện tại của bánh xe
  selected: null,   // nhóm đang chọn; null = chưa quay
  lost: null,       // nhóm vừa bị bỏ vì đổi gen (để báo); đổi gen làm nó hợp lệ lại thì chọn lại
  lostRare: false,  // true nếu nhóm đó bị bỏ vì chỉ còn Pokémon hiếm (Red/Gold)
};

function biomeChip(key) {
  const g = biomeInfo(key);
  return `<span class="biome-chip" style="--t:${g.color};color:${inkOn(g.color)}">${g.name}</span>`;
}

// "Cobbleverse biomes Forest, Taiga, …" — các biome Cobbleverse trong nhóm.
function biomeTagsLine(key) {
  return `<span class="br-tags-label">Cobbleverse biomes</span> ${biomeInfo(key).tags.map(escHtml).join(", ")}`;
}

// Bánh xe của Biome Roulette (xem phần "Khung chung cho các chế độ bánh xe").
const BIOME_WHEEL = {
  mode: "biome-roulette",
  title: "Biome Roulette",
  prefix: "br",
  wheel: "br-wheel",
  disc: "br-disc",
  hub: "br-hub",
  state: biome,
  storageKey: STORAGE_KEY_BIOME,
  valid: (v) => Boolean(biomeInfo(v)),
  noun: "biome",
  color: (key) => biomeInfo(key).color,
  label: (key) => biomeInfo(key).name,
  chip: biomeChip,
  groups: () => biomePools(custom.pool),
  order: BIOME_GROUPS.map((g) => g.key),
  // Chưa có nhóm: Pokémon bất kỳ có trong các nhóm trên bánh xe
  idlePool: () => [...new Set(Object.values(biome.pools).flat())],
  info: biomeTagsLine,
  blocked: () => (typeof SPAWN_DATA === "undefined" ? "Spawn data not found — make sure data/spawns.js is next to index.html." : ""),
  spin: { key: "biome", label: "Spin biome", hotkey: "B" },
  text: {
    first: "Spin the biome first.",
    again: "Spin the biome again.",
    pick: "Spin the biome wheel to pick a biome. Its tiers show here.",
    spinning: "Spinning the biome wheel…",
    stopped: "Biome wheel",
  },
};

registerCustomMode({
  key: "biome-roulette",
  name: "Biome Roulette",
  desc: "Spin for a Cobbleverse biome, then open cases of Pokémon that spawn there",
  icon: ICON_BIOME,
  rules: [
    "Spin biome picks a biome group. The wheel holds every group with Pokémon in your selected generations, each with the same chance.",
    "A biome only goes on the wheel if it has at least one Blue, Purple or Pink Pokémon in your generations. Biomes with only Red or Gold Pokémon are left off, since every case would be a rare drop.",
    "Each group covers several Cobbleverse biomes: Forest also covers Taiga, Dark Forest and more. The biomes of your group are listed under its odds.",
    "Open case opens a case of only Pokémon that spawn there, with the same tier odds as the Case page. Open it as many times as you like.",
    "A Pokémon that spawns in several groups belongs to all of them. Pokémon without Cobbleverse spawn data, and Special forms, are not included.",
    "Your biome stays until you spin again, even after reloading the page. If a generation change leaves it with no Pokémon, spin again.",
    customPoolRule("biome"),
    `Shiny is rolled separately: 1 in ${oneIn(SHINY_CHANCE)}.`,
  ],
  // Nhãn trong lịch sử: "Biome Roulette · Forest", gọn: "Biome · Forest"
  label(detail, short) {
    const name = biomeInfo(detail) ? biomeInfo(detail).name : "?";
    return short ? `Biome · ${name}` : `Biome Roulette · ${name}`;
  },
  tagColor: (detail) => (biomeInfo(detail) ? biomeInfo(detail).color : ""),

  ...wheelModeParts(BIOME_WHEEL),
});

// Gọi thẳng từ test / console: vẽ lại Biome Roulette theo các gen đang chọn.
const refreshBiome = () => refreshWheelMode(BIOME_WHEEL);

