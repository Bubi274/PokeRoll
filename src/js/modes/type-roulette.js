// Chế độ Type Roulette: nhóm Pokémon theo hệ và đăng ký chế độ.
"use strict";

// =====================================================================
// CHẾ ĐỘ CUSTOM: Type Roulette
// =====================================================================

// 18 hệ theo thứ tự trong game — cũng là thứ tự các ô trên bánh xe (theo chiều kim đồng hồ, bắt đầu từ kim chỉ).
const TYPE_ORDER = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];

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

const STORAGE_KEY_ROULETTE_TYPE = "pokeroll.custom.typeRoulette.type"; // hệ đang chọn ở Type Roulette

// Trạng thái riêng của Type Roulette.
const roulette = {
  types: [],        // các hệ đang có trên bánh xe (đúng thứ tự các ô)
  pools: {},        // Pokémon của từng hệ (đã lọc theo gen của trang Custom)
  rotation: 0,      // góc xoay hiện tại của bánh xe (độ, cộng dồn)
  selected: null,   // hệ đang chọn (trúng ở lần quay bánh xe gần nhất); null = chưa quay
  lost: null,       // hệ vừa bị bỏ vì đổi gen (để báo); đổi gen làm nó hợp lệ lại thì chọn lại
  lostRare: false,  // true nếu hệ đó bị bỏ vì chỉ còn Pokémon hiếm (Red/Gold)
};

// Bánh xe của Type Roulette (xem phần "Khung chung cho các chế độ bánh xe" ở wheel-mode.js).
// Các hàm bánh xe nhận w = bánh xe nào; bỏ trống = bánh xe này.
const TYPE_WHEEL = {
  mode: "type-roulette",
  title: "Type Roulette",
  prefix: "tr",
  wheel: "tr-wheel",
  disc: "tr-disc",
  hub: "tr-hub",
  state: roulette,
  storageKey: STORAGE_KEY_ROULETTE_TYPE,
  valid: (v) => TYPE_ORDER.includes(v),
  noun: "type",
  color: (t) => TYPE_COLORS[t] || "#777",
  label: typeName,
  chip: (t) => `<span class="type-chip" style="--t:${TYPE_COLORS[t]}">${typeName(t)}</span>`,
  groups: () => typePools(custom.pool),
  order: TYPE_ORDER,
  idlePool: () => custom.pool,
  spin: { key: "wheel", label: "Spin wheel", hotkey: "W" },
  text: {
    first: "Spin the wheel first.",
    again: "Spin the wheel again.",
    pick: "Spin the wheel to pick a type. Its tiers show here.",
    spinning: "Spinning the wheel…",
    stopped: "Wheel",
  },
};

registerCustomMode({
  key: "type-roulette",
  name: "Type Roulette",
  desc: "Spin the wheel for a type, then open cases of only that type",
  icon: ICON_WHEEL,
  rules: [
    "Spin wheel picks a type. The wheel holds every type with Pokémon in your selected generations, each with the same chance.",
    "A type only goes on the wheel if it has at least one Blue, Purple or Pink Pokémon in your generations. Types with only Red or Gold Pokémon are left off, since every case would be a rare drop.",
    "Open case opens a case of only that type, with the same tier odds as the Case page. Open it as many times as you like.",
    "Your type stays until you spin the wheel again, even after reloading the page. If a generation change leaves it with no Pokémon, spin again.",
    "Dual-type Pokémon count for both types: Gyarados can drop from Water or Flying.",
    customPoolRule("type"),
    `Shiny is rolled separately: 1 in ${oneIn(SHINY_CHANCE)}.`,
  ],
  // Nhãn trong lịch sử: "Type Roulette · Fire", gọn: "Type · Fire"
  label(detail, short) {
    const name = TYPE_ORDER.includes(detail) ? typeName(detail) : "?";
    return short ? `Type · ${name}` : `Type Roulette · ${name}`;
  },
  tagColor: (detail) => TYPE_COLORS[detail] || "",

  ...wheelModeParts(TYPE_WHEEL),
});

// Gọi thẳng từ test / console: vẽ lại Type Roulette theo các gen đang chọn.
const refreshRoulette = () => refreshWheelMode(TYPE_WHEEL);
