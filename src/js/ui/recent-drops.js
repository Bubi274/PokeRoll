// Danh sách Recent drops và nhãn nguồn của một lượt quay (dùng cả ở Roll history).
"use strict";

// ----- Recent drops (trang Case) -----

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

// Lịch sử để hiện ra: bỏ qua mục hỏng (độ hiếm không hợp lệ). Mục hỏng vẫn giữ nguyên trong dữ liệu đã lưu.
const shownHistory = () => state.history.filter((h) => rarityInfo(h.rarity));

// Lịch sử lưu mới nhất trước → lượt mới nhất nằm trên cùng.
function renderRecent() {
  const recent = shownHistory().slice(0, RECENT_DROPS);
  $("recent-row").innerHTML = recent.length
    ? recent.map(recentItem).join("")
    : `<li class="recent-empty">No drops yet</li>`;
}

