// Chế độ Letter Roulette: vòng quay A–Z và đăng ký chế độ.
"use strict";

// =====================================================================
// CHẾ ĐỘ CUSTOM: Letter Roulette (vòng quay A–Z, luôn dùng mọi gen)
// =====================================================================

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

// Chữ cái đầu của tên, bỏ dấu và ký tự đặc biệt: Flabébé → F, Mr. Mime → M, Nidoran♀ → N, Type: Null → T.
// Pokémon Special theo tên gốc (Kazeran Vaporeon → V). Không ra được chữ A–Z thì null.
function letterOf(p) {
  const letters = foldText(p.baseName || p.name).replace(/[^a-z]/g, "");
  return letters ? letters[0].toUpperCase() : null;
}

// Pokémon của từng chữ: { A: [...], ... } — chỉ gồm chữ có Pokémon, theo thứ tự A–Z.
function letterPools(pool) {
  const pools = {};
  for (const p of pool) {
    const l = letterOf(p);
    if (l) (pools[l] = pools[l] || []).push(p);
  }
  return Object.fromEntries(LETTERS.filter((l) => pools[l]).map((l) => [l, pools[l]]));
}

// Mỗi chữ một màu, chuyển dần theo vòng màu A → Z (hex để inkOn chọn được chữ sáng / tối).
function letterColor(l) {
  const h = (LETTERS.indexOf(l) * 360) / LETTERS.length, s = 0.62, v = 0.5;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = v - s * Math.min(v, 1 - v) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const STORAGE_KEY_LETTER = "pokeroll.custom.letterRoulette.letter"; // chữ đang chọn

const ICON_LETTER = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20 10 4h1l6 16M6.5 14h8"/><path d="M17 4h3M18.5 4v6"/></svg>`;

// Trạng thái riêng của Letter Roulette (tên trường dùng chung với hàm bánh xe).
const letter = {
  types: [],        // các chữ đang có trên bánh xe (đúng thứ tự các ô)
  pools: {},        // Pokémon của từng chữ (mọi gen, gồm cả Special)
  rotation: 0,      // góc xoay hiện tại của bánh xe
  selected: null,   // chữ đang chọn; null = chưa quay
  lost: null,
  lostRare: false,
  all: null,        // letterPools của mọi Pokémon (không đổi theo gen nên chỉ tính một lần)
};

function letterChip(l) {
  const c = letterColor(l);
  return `<span class="letter-chip" style="--t:${c};color:${inkOn(c)}">${l}</span>`;
}

// Bánh xe của Letter Roulette (xem phần "Khung chung cho các chế độ bánh xe").
const LETTER_WHEEL = {
  mode: "letter-roulette",
  title: "Letter Roulette",
  prefix: "lr",
  wheel: "lr-wheel",
  disc: "lr-disc",
  hub: "lr-hub",
  state: letter,
  storageKey: STORAGE_KEY_LETTER,
  valid: (v) => LETTERS.includes(v),
  noun: "letter",
  color: letterColor,
  label: (l) => l,
  chip: letterChip,
  groups: () => letter.all || (letter.all = letterPools(state.pokemon)), // mọi Pokémon: dựng một lần
  order: LETTERS,
  idlePool: () => state.pokemon,
  allGens: true,
  upright: true,
  wheelClass: "is-letters",
  spin: { key: "letter", label: "Spin letter", hotkey: "L" },
  text: {
    first: "Spin the letter first.",
    again: "Spin the letter again.",
    pick: "Spin the wheel to pick a letter. Its tiers show here.",
    spinning: "Spinning the letter wheel…",
    stopped: "Letter wheel",
  },
};

registerCustomMode({
  key: "letter-roulette",
  name: "Letter Roulette",
  desc: "Spin for a letter from A to Z, then open cases of Pokémon whose name starts with it",
  icon: ICON_LETTER,
  rules: [
    "Spin letter picks a letter from A to Z. Every letter is on the wheel, each with the same chance: 1 in 26.",
    "Letter Roulette always uses every generation, Special forms included. The Select generations panel is locked here; your choice is kept for the other modes.",
    "Open case opens a case of only Pokémon whose name starts with that letter, with the same tier odds as the Case page. Open it as many times as you like.",
    "Names count by their first letter, ignoring accents and symbols: Flabébé is F, Mr. Mime is M, Nidoran♀ and Nidoran♂ are N, Type: Null is T, Ho-Oh is H.",
    "Special forms count under their original name: Kazeran Vaporeon is V, next to Vaporeon.",
    "Your letter stays until you spin again, even after reloading the page.",
    customPoolRule("letter"),
    `Shiny is rolled separately: 1 in ${oneIn(SHINY_CHANCE)}.`,
  ],
  // Nhãn trong lịch sử: "Letter Roulette · A", gọn: "Letter · A"
  label(detail, short) {
    const name = LETTERS.includes(detail) ? detail : "?";
    return short ? `Letter · ${name}` : `Letter Roulette · ${name}`;
  },
  tagColor: (detail) => (LETTERS.includes(detail) ? letterColor(detail) : ""),
  ...wheelModeParts(LETTER_WHEEL),
});

