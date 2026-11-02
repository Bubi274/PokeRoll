// Cấu hình và trạng thái của Type Roulette.
"use strict";

const STORAGE_KEY_ROULETTE_TYPE = "pokeroll.custom.typeRoulette.type"; // hệ đang chọn ở Type Roulette

const ICON_CASE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>`;
const ICON_WHEEL_BTN = ICON_WHEEL.replace('width="20" height="20"', 'width="18" height="18" aria-hidden="true"');

// Trạng thái riêng của Type Roulette.
const roulette = {
  types: [],        // các hệ đang có trên bánh xe (đúng thứ tự các ô)
  pools: {},        // Pokémon của từng hệ (đã lọc theo gen của trang Custom)
  rotation: 0,      // góc xoay hiện tại của bánh xe (độ, cộng dồn)
  selected: null,   // hệ đang chọn (trúng ở lần quay bánh xe gần nhất); null = chưa quay
  lost: null,       // hệ vừa bị bỏ vì đổi gen (để báo); đổi gen làm nó hợp lệ lại thì chọn lại
  lostRare: false,  // true nếu hệ đó bị bỏ vì chỉ còn Pokémon hiếm (Red/Gold)
};

// Bánh xe của Type Roulette (xem phần "Khung chung cho các chế độ bánh xe" bên dưới).
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

