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

// Tiến độ mỗi gen: [{ gen, region, owned, total }]
function genProgress(pokemon, collection) {
  return GENS.map(({ gen, region }) => {
    const list = pokemon.filter((p) => p.gen === gen);
    return { gen, region, total: list.length, owned: list.filter((p) => collection[p.id]).length };
  });
}

// Lọc danh sách cho trang bộ sưu tập. filters = { gen, rarity, status } ("all" = không lọc)
function filterCollection(pokemon, collection, filters) {
  return pokemon.filter((p) => {
    const entry = collection[p.id];
    if (filters.gen !== "all" && p.gen !== Number(filters.gen)) return false;
    if (filters.rarity !== "all" && p.rarity !== filters.rarity) return false;
    if (filters.status === "owned" && !entry) return false;
    if (filters.status === "missing" && entry) return false;
    if (filters.status === "shiny" && !(entry && entry.shiny > 0)) return false;
    if (filters.status === "dupes" && !(entry && entry.count > 1)) return false;
    return true;
  });
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

function rarityInfo(key) {
  return RARITIES.find((r) => r.key === key);
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

function loadSelectedGens() {
  const saved = loadJson(STORAGE_KEY_GENS, null, Array.isArray);
  if (saved) return new Set(saved.filter((g) => GENS.some((x) => x.gen === g)));
  return new Set(GENS.map((g) => g.gen)); // mặc định: chọn tất cả
}

function saveSelectedGens(gens) {
  saveJson(STORAGE_KEY_GENS, [...gens]);
}

const isPlainObject = (v) => typeof v === "object" && !Array.isArray(v);

// Đọc bộ sưu tập, bỏ các mục không hợp lệ.
function loadCollection(validIds) {
  const raw = loadJson(STORAGE_KEY_COLLECTION, {}, isPlainObject);
  const clean = {};
  for (const [id, e] of Object.entries(raw)) {
    if (validIds.has(Number(id)) && e && Number.isInteger(e.count) && e.count > 0) {
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
  pokemon: [],          // toàn bộ Pokémon (đã gắn sẵn độ hiếm)
  byId: new Map(),      // tra Pokémon theo số Pokédex
  selectedGens: new Set(),
  groups: groupByRarity([]), // Pokémon trong hòm hiện tại, chia theo độ hiếm
  spinning: false,
  collection: {},       // bộ sưu tập: { [id]: { count, shiny, first } }
  history: [],          // lịch sử quay, mới nhất trước
  saveFailed: false,    // true nếu không lưu được vào localStorage
  view: "case",         // trang đang xem: "case" hoặc "collection"
  reelOffset: 0,        // độ lệch điểm dừng của lần quay gần nhất
};

const pad4 = (id) => String(id).padStart(4, "0");

// ----- Chọn gen & thống kê -----

function buildGenGrid() {
  const grid = $("gen-grid");
  grid.innerHTML = "";
  for (const { gen, region } of GENS) {
    const total = state.pokemon.filter((p) => p.gen === gen).length;
    const label = document.createElement("label");
    label.className = "gen-option";
    label.innerHTML = `
      <input type="checkbox" value="${gen}">
      <span class="gen-card">
        <span class="gen-name">Gen ${gen}</span>
        <span class="gen-region">${region}</span>
        <span class="gen-count">${total} Pokémon</span>
      </span>`;
    const input = label.querySelector("input");
    input.checked = state.selectedGens.has(gen);
    input.addEventListener("change", () => {
      if (input.checked) state.selectedGens.add(gen);
      else state.selectedGens.delete(gen);
      onSelectionChanged();
    });
    grid.appendChild(label);
  }
}

function syncCheckboxes() {
  for (const input of $("gen-grid").querySelectorAll("input")) {
    input.checked = state.selectedGens.has(Number(input.value));
  }
}

function poolSize() {
  return RARITIES.reduce((sum, r) => sum + state.groups[r.key].length, 0);
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
}

function onSelectionChanged() {
  saveSelectedGens(state.selectedGens);
  renderPoolStats();
  // Đổi gen thì vẽ lại dải thẻ theo hòm mới (không đụng vào khi đang quay).
  if (!state.spinning) renderIdleReel();
}

// ----- Ảnh -----

// Gắn ảnh Pokémon cho thẻ <img>: ảnh local → ảnh CDN → (shiny) ảnh thường trên CDN → ảnh dự phòng.
function setPokemonImage(img, id, shiny) {
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
  card.className = `card r-${item.rarity}${item.shiny ? " is-shiny" : ""}`;
  const p = item.pokemon;
  card.innerHTML = `
    <span class="card-top">
      <span class="card-id">#${pad4(p.id)}</span>
      <span class="card-type" style="--t:${TYPE_COLORS[p.types[0]] || "#777"}">${p.types.join("/")}</span>
    </span>
    <img class="card-img" alt="" draggable="false">
    <span class="card-name">${p.name}</span>
    <span class="card-meta">BST ${p.bst}<span class="card-tier"> · ${rarityInfo(item.rarity).name}</span></span>
    ${item.shiny ? `<span class="card-shiny" title="Shiny">★</span>` : ""}`;
  setPokemonImage(card.querySelector("img"), item.pokemon.id, item.shiny);
  return card;
}

// Vẽ lại dải thẻ và đưa về vị trí đầu (không có hiệu ứng).
function renderReel(items) {
  const strip = $("reel-strip");
  strip.style.transition = "none";
  strip.style.transform = "translateX(0)";
  strip.replaceChildren(...items.map(createCard));
  $("reel").classList.toggle("is-empty", items.length === 0);
}

// Dải thẻ lúc chưa quay: vài thẻ ngẫu nhiên trong hòm hiện tại.
function renderIdleReel() {
  const idle = [];
  for (let i = 0; i < IDLE_REEL_SIZE && poolSize() > 0; i++) idle.push(rollOnce(state.groups));
  renderReel(idle);
}

// Vị trí translateX để vạch chỉ nằm trên thẻ thắng, lệch ngẫu nhiên trong phạm vi thẻ
// (tối đa 40% bề rộng thẻ mỗi bên) để không lúc nào cũng dừng đúng tâm.
// offsetFrac: độ lệch từ -1 đến 1 (nhớ lại để căn lại đúng chỗ khi đổi cỡ cửa sổ).
function reelTarget(winIndex, offsetFrac = Math.random() * 2 - 1) {
  state.reelOffset = offsetFrac;
  const card = $("reel-strip").children[winIndex];
  const offset = offsetFrac * card.offsetWidth * 0.4;
  return $("reel").clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2 + offset);
}

// Đặt ngay dải thẻ ở thẻ thắng, không có hiệu ứng (dùng cho "Quick open" và khi đổi cỡ cửa sổ).
function jumpReel(winIndex, offsetFrac) {
  const strip = $("reel-strip");
  strip.style.transition = "none";
  strip.style.transform = `translateX(${reelTarget(winIndex, offsetFrac)}px)`;
}

// Đổi cỡ cửa sổ / xoay điện thoại: căn lại để vạch chỉ vẫn nằm trên thẻ thắng.
function realignReel() {
  if (state.spinning) return;
  const strip = $("reel-strip");
  const winner = strip.querySelector(".is-winner");
  if (winner) jumpReel([...strip.children].indexOf(winner), state.reelOffset);
}

// Theo dõi dải thẻ trong lúc chạy: mỗi khi một thẻ mới đi qua vạch chỉ thì phát tiếng "tick".
// Trả về hàm để dừng theo dõi.
function trackTicks() {
  const strip = $("reel-strip");
  const first = strip.children[0];
  const step = strip.children[1].offsetLeft - first.offsetLeft;
  const center = $("reel").clientWidth / 2;
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

// Chạy dải thẻ tới thẻ thắng. Trả về Promise xong khi dải dừng.
function animateReel(winIndex) {
  const reel = $("reel");
  const strip = $("reel-strip");
  const target = reelTarget(winIndex);

  void strip.offsetWidth; // ép trình duyệt áp vị trí đầu trước khi bắt đầu chạy
  strip.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.6, 0, 1)`;
  strip.style.transform = `translateX(${target}px)`;
  reel.classList.add("is-spinning");
  const stopTicks = trackTicks();

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
    setTimeout(finish, SPIN_MS + 500); // phòng khi transitionend không chạy (vd. tab bị ẩn)
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

function renderSoundButton() {
  const btn = $("btn-sound");
  btn.innerHTML = sound.muted ? `${ICON_SOUND_OFF} Muted` : `${ICON_SOUND_ON} Sound`;
  btn.setAttribute("aria-pressed", String(!sound.muted));
  btn.title = sound.muted ? "Turn sound on" : "Mute";
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

function showResultModal(result, { isNew, count }) {
  const { pokemon: p, rarity, shiny, downgraded } = result;
  const epic = rarity === "red" || rarity === "gold";
  const modal = $("result-modal");
  modal.className = `modal modal-narrow result-modal r-${rarity}${epic ? " is-epic" : ""}`;

  $("result-body").innerHTML = `
    <div class="reveal${shiny ? " is-shiny" : ""}">
      <div class="reveal-rays"></div>
      <div class="reveal-glow"></div>
      ${shiny ? `<span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span>` : ""}
      <img class="reveal-img" alt="${p.name}">
      <span class="reveal-badge ${isNew ? "is-new" : ""}">${isNew ? "New!" : `Duplicate · ×${count}`}</span>
    </div>
    <div class="reveal-info">
      <div class="result-rarity">${rarityInfo(rarity).name}${shiny ? ` <span class="shiny-tag">★ Shiny</span>` : ""}</div>
      <h2 class="reveal-name" id="result-name">${p.name}</h2>
      <div class="result-meta">#${pad4(p.id)} · Gen ${p.gen} · BST ${p.bst}</div>
      <div class="type-chips">${typeChips(p.types)}</div>
      ${downgraded ? `<div class="result-note">Rolled a higher tier with no Pokémon in this case — dropped to ${rarityInfo(rarity).name}.</div>` : ""}
    </div>
    <h3 class="detail-section">Where to find in Cobbleverse</h3>
    ${renderSpawnSection(p)}`;
  setPokemonImage($("result-body").querySelector("img"), p.id, shiny);

  $("result-again").disabled = poolSize() === 0;
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
      <img class="mini-img" src="${spriteUrl(p.id, shiny)}" alt="" loading="lazy">
      <span class="mini-name">${p.name}</span>
      <span class="mini-id">#${pad4(p.id)}</span>
      ${count > 1 ? `<span class="mini-count">×${count}</span>` : ""}
      ${shiny || shinyCount ? `<span class="mini-shiny">★${shinyCount > 1 ? shinyCount : ""}</span>` : ""}
    </button>`;
}

function renderRecent() {
  const recent = state.history.slice(0, RECENT_DROPS);
  $("recent-panel").hidden = recent.length === 0;
  $("recent-row").innerHTML = recent
    .map((h) => miniTile({ ...state.byId.get(h.id), rarity: h.rarity }, { shiny: h.shiny }))
    .join("");
}

// ----- Trang bộ sưu tập -----

function updateCollectionTab() {
  const owned = Object.keys(state.collection).length;
  $("tab-collection-count").textContent = `${owned}/${state.pokemon.length}`;
}

function collectionFilters() {
  return { gen: $("f-gen").value, rarity: $("f-rarity").value, status: $("f-status").value };
}

function renderCollection() {
  const col = state.collection;
  const owned = Object.keys(col).length;
  const total = state.pokemon.length;
  const opened = Object.values(col).reduce((sum, e) => sum + e.count, 0);
  const shinies = Object.values(col).reduce((sum, e) => sum + e.shiny, 0);
  const golds = state.pokemon.filter((p) => p.rarity === "gold");
  const goldOwned = golds.filter((p) => col[p.id]).length;
  const pct = (a, b) => (b ? (a / b) * 100 : 0);

  const stat = (label, value, bar) => `
    <div class="stat">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${value}</span>
      ${bar !== undefined ? `<span class="bar"><span style="width:${bar}%"></span></span>` : ""}
    </div>`;
  $("coll-summary").innerHTML =
    stat("Pokédex", `${owned}<small>/${total}</small>`, pct(owned, total)) +
    stat("Cases opened", opened) +
    stat("Shiny drops", `★ ${shinies}`) +
    stat("Gold collected", `${goldOwned}<small>/${golds.length}</small>`, pct(goldOwned, golds.length));
  $("save-warning").hidden = !state.saveFailed;

  const activeGen = $("f-gen").value;
  $("gen-progress").innerHTML = genProgress(state.pokemon, col).map((g) => `
    <button type="button" class="gp${String(g.gen) === activeGen ? " is-active" : ""}${g.owned === g.total ? " is-done" : ""}" data-gen="${g.gen}">
      <span class="gp-top"><b>Gen ${g.gen}</b> <span class="gp-region">${g.region}</span></span>
      <span class="gp-count">Owned ${g.owned}/${g.total}</span>
      <span class="bar"><span style="width:${pct(g.owned, g.total)}%"></span></span>
    </button>`).join("");

  const list = filterCollection(state.pokemon, col, collectionFilters());
  $("coll-count").textContent = `${list.length} Pokémon`;
  $("coll-grid").innerHTML = list.map((p) => {
    const e = col[p.id];
    return miniTile(p, e ? { count: e.count, shinyCount: e.shiny } : { missing: true });
  }).join("") || `<p class="hint">No Pokémon match these filters.</p>`;

  $("history-count").textContent = state.history.length
    ? `Last ${state.history.length} opens` : "";
  const fmtTime = (t) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  $("history-list").innerHTML = state.history.length
    ? state.history.map((h) => {
      const p = state.byId.get(h.id);
      return `
        <li>
          <button type="button" class="hist r-${h.rarity}" data-pokemon="${p.id}"${h.shiny ? ` data-shiny="1"` : ""}>
            <img class="mini-img" src="${spriteUrl(p.id, h.shiny)}" alt="" loading="lazy">
            <span class="hist-name">${p.name}${h.shiny ? ` <span class="mini-shiny">★</span>` : ""}</span>
            <span class="hist-rarity">${rarityInfo(h.rarity).name}</span>
            <time class="hist-time">${fmtTime(h.t)}</time>
          </button>
        </li>`;
    }).join("")
    : `<li class="hint">No cases opened yet.</li>`;
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

function showView(view) {
  state.view = view;
  $("view-case").hidden = view !== "case";
  $("view-collection").hidden = view !== "collection";
  for (const tab of document.querySelectorAll(".tab")) {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  if (view === "collection") renderCollection();
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
      <button type="button" class="mini" data-pokemon="${p.id}" data-search="${p.name.toLowerCase()} ${p.id}">
        <img class="mini-img" src="${spriteUrl(p.id)}" alt="" loading="lazy">
        <span class="mini-name">${p.name}</span>
        <span class="mini-id">#${pad4(p.id)}</span>
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

function ownedLine(p) {
  const e = state.collection[p.id];
  if (!e) return `<div class="owned-line">Not collected yet</div>`;
  return `<div class="owned-line is-owned">Owned ×${e.count}${e.shiny ? ` · ★ ${e.shiny} shiny` : ""}</div>`;
}

function openPokemonDetail(p, shiny = false) {
  const r = rarityInfo(p.rarity);
  $("detail-body").innerHTML = `
    <div class="detail-top r-${p.rarity}">
      <img class="detail-img" alt="${p.name}">
      <div>
        <div class="result-rarity">${r.name}${shiny ? ` <span class="shiny-tag">★ Shiny</span>` : ""}</div>
        <div class="detail-name">${p.name}</div>
        <div class="result-meta">#${pad4(p.id)} · Gen ${p.gen} · BST ${p.bst}</div>
        <div class="type-chips">${typeChips(p.types)}</div>
        ${ownedLine(p)}
      </div>
    </div>
    <h3 class="detail-section">Where to find in Cobbleverse</h3>
    ${renderSpawnSection(p)}`;
  setPokemonImage($("detail-body").querySelector("img"), p.id, shiny);
  $("detail-modal").showModal();
  $("detail-body").parentElement.scrollTop = 0;
}

// ----- Quay -----

// quick = true: "Quick open" — bỏ qua hiệu ứng dải thẻ, ra kết quả ngay.
async function spin({ quick = false } = {}) {
  if (state.spinning) return;
  const result = rollOnce(state.groups);
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
    const urls = [...new Set(visible.map((it) => artworkUrl(it.pokemon.id, it.shiny)))];
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
  showResultModal(result, { isNew, count: entry.count });
}

function init() {
  if (typeof POKEMON_DATA === "undefined") {
    document.querySelector("main").innerHTML =
      `<p class="error">Data not found. Make sure <b>data.js</b> is in the same folder as index.html.</p>`;
    return;
  }

  state.pokemon = POKEMON_DATA.map((p) => ({ ...p, rarity: getRarity(p) }));
  state.byId = new Map(state.pokemon.map((p) => [p.id, p]));
  state.selectedGens = loadSelectedGens();
  const validIds = new Set(state.byId.keys());
  state.collection = loadCollection(validIds);
  state.history = loadHistory(validIds);

  buildGenGrid();
  renderPoolStats();
  renderRecent();
  updateCollectionTab();

  renderIdleReel();

  $("btn-all").addEventListener("click", () => {
    state.selectedGens = new Set(GENS.map((g) => g.gen));
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
  $("btn-sound").addEventListener("click", toggleSound);
  renderSoundButton();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(realignReel, 100);
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
    spin();
  });

  // Chuyển trang Case / Collection
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  }
  $("btn-see-collection").addEventListener("click", () => showView("collection"));

  // Trang bộ sưu tập
  for (const id of ["f-gen", "f-rarity", "f-status"]) {
    $(id).addEventListener("change", renderCollection);
  }
  $("gen-progress").addEventListener("click", (e) => {
    const card = e.target.closest(".gp");
    if (!card) return;
    const f = $("f-gen");
    f.value = f.value === card.dataset.gen ? "all" : card.dataset.gen; // bấm lần nữa để bỏ lọc
    renderCollection();
  });
  $("btn-clear").addEventListener("click", clearData);

  // Bấm vào bất kỳ Pokémon nào (danh sách hòm, recent drops, bộ sưu tập, lịch sử) → xem chi tiết
  document.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-pokemon]");
    if (tile) openPokemonDetail(state.byId.get(Number(tile.dataset.pokemon)), tile.dataset.shiny === "1");
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
    recordDrop, genProgress, filterCollection };
}
