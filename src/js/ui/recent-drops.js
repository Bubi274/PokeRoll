// Lưu tiến độ, thẻ nhỏ và danh sách Recent drops.
"use strict";

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
// Lượt quay từ custom pool (h.pool = "custom"): nhãn đầy đủ thêm " · Custom pool", nhãn gọn có thêm dấu ✦ nhỏ.
function dropSource(h, short = false) {
  if (!h.mode) return { label: "Case", color: "" };
  const mode = CUSTOM_MODES.find((m) => m.key === h.mode);
  if (!mode) return { label: "Custom", color: "" };
  const customPool = h.pool === "custom";
  return {
    label: (mode.label ? mode.label(h.detail, short) : mode.name) + (customPool && !short ? " · Custom pool" : ""),
    color: mode.tagColor ? mode.tagColor(h.detail) : "",
    mark: customPool && short,
  };
}

function sourceTag(src) {
  return `<span class="src-tag"${src.color ? ` style="--t:${src.color}"` : ""}>${escHtml(src.label)}${src.mark
    ? `<span class="src-mark" title="Custom pool" aria-label="Custom pool">✦</span>` : ""}</span>`;
}

// Lịch sử lưu mới nhất trước → lượt mới nhất nằm trên cùng.
function renderRecent() {
  const recent = state.history.slice(0, RECENT_DROPS);
  $("recent-row").innerHTML = recent.length
    ? recent.map(recentItem).join("")
    : `<li class="recent-empty">No drops yet</li>`;
}

