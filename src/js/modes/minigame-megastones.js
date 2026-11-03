// Hòm Minigame "Mega Stone Case": 156 viên đá Mega của 3 mod Cobblemon, mỗi viên 1/N, có bộ sưu tập riêng.
// Dữ liệu ở data/megastones.js (tạo bằng scripts/build-megastones.js). Ảnh đá là ảnh item 16×16 gốc của mod
// (assets/images/megastones/, chép bằng scripts/build-megastone-images.js), phóng to theo bội số nguyên, giữ nét pixel;
// kèm ảnh nhỏ của Pokémon dùng đá lấy từ ảnh sẵn có trong app. Ảnh đá không tải được thì thay bằng biểu tượng SVG.
"use strict";

const MEGA_STONES = typeof MEGA_STONE_DATA !== "undefined" ? MEGA_STONE_DATA : [];
const MEGA_STONE_MOD_LIST = typeof MEGA_STONE_MODS !== "undefined" ? MEGA_STONE_MODS : [];
const megaStoneById = new Map(MEGA_STONES.map((s) => [s.id, s]));
const LOCAL_MEGASTONE = "assets/images/megastones"; // <stone_id>.png
const stoneImageUrl = (s) => `${LOCAL_MEGASTONE}/${s.id}.png`;

const stoneMod = (s) => MEGA_STONE_MOD_LIST.find((m) => m.key === s.mod) || { key: s.mod, name: s.mod, author: "" };
// Pokémon dùng đá (có trong app), hoặc null (vd. Mushiro)
const stoneMon = (s) => (s.pokemonId ? state.byId.get(s.pokemonId) || null : null);

// Màu đá: hệ chính của dạng Mega; mod không ghi hệ thì hệ chính của Pokémon dùng đá; không có thì màu trung tính.
function stoneColor(s) {
  const mon = stoneMon(s);
  const type = s.types[0] || (mon && mon.types[0]);
  return TYPE_COLORS[type] || MINIGAME_COLOR;
}

// Biểu tượng dự phòng (ảnh đá không tải được): viên ngọc tròn có mặt cắt, đổi màu bằng --gem (CSS ở modes/minigame.css).
const GEM_SVG = `
  <svg class="gem" viewBox="0 0 64 64" aria-hidden="true">
    <circle class="gem-rim" cx="32" cy="32" r="29"/>
    <circle class="gem-body" cx="32" cy="32" r="25"/>
    <path class="gem-dark" d="M49.7 14.3A25 25 0 0 1 14.3 49.7Z"/>
    <polygon class="gem-table" points="42.2,36.2 36.2,42.2 27.8,42.2 21.8,36.2 21.8,27.8 27.8,21.8 36.2,21.8 42.2,27.8"/>
    <path class="gem-lines" d="M42.2 36.2 55.1 41.6M36.2 42.2 41.6 55.1M27.8 42.2 22.4 55.1M21.8 36.2 8.9 41.6M21.8 27.8 8.9 22.4M27.8 21.8 22.4 8.9M36.2 21.8 41.6 8.9M42.2 27.8 55.1 22.4"/>
    <ellipse class="gem-shine" cx="23" cy="19" rx="7" ry="3.6" transform="rotate(-35 23 19)"/>
  </svg>`;

// Ảnh đá + ảnh nhỏ của Pokémon ở góc (nếu có trong app). cls: class của khung (mini-img, card-img, reveal-img…);
// cỡ ảnh đá theo khung (bội số của 16, CSS ở modes/minigame.css). Ảnh đá nhẹ (vài trăm byte) nên không tải lười.
function stoneIcon(s, cls) {
  const mon = stoneMon(s);
  return `
    <span class="${cls} stone-icon" style="--gem:${stoneColor(s)}">
      <img class="stone-img" src="${stoneImageUrl(s)}" alt="" draggable="false">
      ${mon ? `<img class="stone-mon" src="${thumbUrl(mon)}" alt="" loading="lazy">` : ""}
    </span>`;
}

// Ảnh đá lỗi: thay bằng biểu tượng SVG, giữ màu theo hệ của khung. Sự kiện error không nổi bọt nên bắt ở pha capture.
function stoneImageFailed(img) {
  img.insertAdjacentHTML("afterend", GEM_SVG);
  img.remove();
}
// --dpr cho CSS chọn cỡ ảnh đá theo pixel màn hình (modes/minigame.css). Đổi mức phóng hoặc kéo cửa sổ sang màn hình
// khác thì devicePixelRatio đổi: media query (resolution: <dpr hiện tại>dppx) hết khớp, hoặc cửa sổ báo resize
// (không phải lúc nào trình duyệt cũng báo cả hai) → đặt lại --dpr và theo dõi giá trị mới.
let pixelRatioQuery = null;
function updatePixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  document.documentElement.style.setProperty("--dpr", String(dpr));
  if (pixelRatioQuery) pixelRatioQuery.removeEventListener("change", updatePixelRatio);
  pixelRatioQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
  pixelRatioQuery.addEventListener("change", updatePixelRatio);
}

if (typeof document !== "undefined") {
  document.addEventListener("error", (e) => {
    if (e.target.classList && e.target.classList.contains("stone-img")) stoneImageFailed(e.target);
  }, true);
  updatePixelRatio();
  window.addEventListener("resize", updatePixelRatio);
}

// "iron_ingot" → "Iron Ingot"
const itemName = (id) => id.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const STAT_LABELS = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };

// Thông tin đá trong popup. Ô mod không ghi (hệ, chỉ số, ability) thì ẩn hẳn.
function stoneFacts(s, { count }) {
  const mon = stoneMon(s), mod = stoneMod(s);
  return `
    <dl class="facts">
      <div><dt>Pokémon</dt><dd>${escHtml(s.pokemon)}${mon && !isSpecial(mon) ? ` <small class="facts-sub">#${pad4(mon.id)}</small>` : ""}</dd></div>
      <div><dt>Form</dt><dd>${escHtml(`${s.form} ${s.pokemon}`)}</dd></div>
      ${s.bst !== null ? `<div><dt>Base stat total</dt><dd>${s.bst}</dd></div>` : ""}
      ${s.ability ? `<div><dt>Ability</dt><dd class="facts-code">${escHtml(s.ability)}</dd></div>` : ""}
      <div><dt>Mod</dt><dd>${escHtml(mod.name)}</dd></div>
      ${count !== null && count > 0 ? `<div><dt>In collection</dt><dd>×${count}</dd></div>` : ""}
    </dl>
    ${s.stats ? `
      <ul class="stone-stats" aria-label="Base stats">
        ${Object.entries(STAT_LABELS).map(([k, label]) => `<li><span>${label}</span><b>${s.stats[k]}</b></li>`).join("")}
      </ul>` : ""}
    <h3 class="detail-section">Crafting recipe</h3>
    <ul class="recipe">
      ${s.recipe.map((r) => `<li class="recipe-item${r.item === "mega_stone" ? " is-key" : ""}">${escHtml(itemName(r.item))}${r.count > 1 ? ` <b>×${r.count}</b>` : ""}</li>`).join("")}
    </ul>
    <p class="stone-credit">Stone data and image from the Cobblemon mod <b>${escHtml(mod.name)}</b>${mod.author ? ` by ${escHtml(mod.author)}` : ""}, used for non-commercial purposes only.</p>`;
}

registerMinigameCase({
  key: "megastone",
  name: "Mega Stone Case",
  desc: `${MEGA_STONES.length} Mega Stones from Cobblemon mods, collected separately`,
  noun: { one: "stone", many: "stones" },
  rules: [
    `Mega Stone Case holds ${MEGA_STONES.length} Mega Stones from the Cobblemon mods ${MEGA_STONE_MOD_LIST.map((m) => m.name).join(", ")}. Each stone is 1 in ${MEGA_STONES.length}.`,
    "Stones go into their own Mega Stones collection on the Collection tab, with duplicates counted. Your Pokémon collection and stats don't change.",
  ],
  items: () => MEGA_STONES,
  idOf: (s) => s.id,
  byId: (id) => megaStoneById.get(id),
  title: (s) => s.name,
  short: (s) => s.pokemon,
  meta: (s) => `${s.form} ${s.pokemon} · ${stoneMod(s).name}`,
  search: (s) => foldText(`${s.name} ${s.pokemon}`),
  searchHint: "Search by stone or Pokémon name…",
  attrs: (s) => `data-minigame="megastone" data-item="${escHtml(s.id)}"`,
  thumb: (s) => stoneIcon(s, "mini-img"),
  card: (s) => `
    <span class="card-top">
      <span class="card-id">${escHtml(stoneMod(s).name)}</span>
      <span class="card-type" style="--t:${stoneColor(s)}">${escHtml(s.form)}</span>
    </span>
    ${stoneIcon(s, "card-img")}
    <span class="card-name">${escHtml(s.name)}</span>
    <span class="card-meta">${escHtml(s.pokemon)}</span>`,
  art: (s, cls) => stoneIcon(s, cls),
  chips: (s) => (s.types.length ? `<div class="type-chips">${typeChips(s.types)}</div>` : ""),
  facts: stoneFacts,
  images: (s) => [stoneImageUrl(s), ...(stoneMon(s) ? [thumbUrl(stoneMon(s))] : [])],
  credit: (s) => {
    const mod = stoneMod(s);
    return `Stone data and image: ${escHtml(mod.name)}${mod.author ? ` by ${escHtml(mod.author)}` : ""} (Cobblemon mod, non-commercial use only)`;
  },
  collect: {
    title: "Mega Stones",
    detailTitle: "Mega Stone details",
    filter: {
      label: "Mod",
      all: "All mods",
      options: MEGA_STONE_MOD_LIST.map((m) => ({ key: m.key, name: m.name })),
      match: (s, key) => s.mod === key,
    },
  },
});
