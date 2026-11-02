// Logic thuần về Pokémon: id, lọc và sắp xếp bộ sưu tập, URL ảnh, nhãn hiển thị, mô phỏng tỉ lệ.
"use strict";

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

