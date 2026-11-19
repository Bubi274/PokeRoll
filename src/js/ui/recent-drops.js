// Danh sách Recent drops và nhãn nguồn của một lượt quay (dùng cả ở Roll history).
"use strict";

// ----- Recent drops (trang Case) -----

// Khung một dòng Recent drops (HTML đã escape sẵn): cls màu vạch (vd. "r-gold"), attrs thuộc tính của nút bấm
// (vd. data-pokemon="25"), title tên (cũng là chú thích khi rê chuột), thumb ảnh nhỏ, sub dòng phụ, extra thêm cuối nút.
// Dùng chung cho lượt của hòm chính / chế độ Custom và lượt Minigame (minigameRecentItem).
function recentRow({ cls, attrs, title, thumb, sub, extra = "" }) {
  return `
    <li>
      <button type="button" class="recent-item ${cls}" ${attrs} title="${title}">
        ${thumb}
        <span class="recent-name">${title}</span>
        <span class="recent-id">${sub}</span>
        ${extra}
      </button>
    </li>`;
}

// Một dòng trong Recent drops: ảnh nhỏ, tên, số # (hoặc "Special"), vạch màu độ hiếm, ★ nếu shiny.
function recentItem(h) {
  if (isMinigameEntry(h)) return minigameRecentItem(h);
  const p = state.byId.get(h.id);
  return recentRow({
    cls: `r-${h.rarity}`, attrs: `data-pokemon="${p.id}"${h.shiny ? ` data-shiny="1"` : ""}`, title: p.name,
    thumb: `<img class="mini-img" src="${thumbUrl(p, h.shiny)}" alt="" loading="lazy">`,
    sub: `${dexLabel(p)}${h.mode ? sourceTag(dropSource(h, true)) : ""}${pityTag(h)}`,
    extra: h.shiny ? `<span class="recent-shiny" aria-label="Shiny">★</span>` : "",
  });
}

// Nguồn của một lượt quay trong lịch sử. Lượt mở hòm (kể cả lịch sử cũ chưa có trường mode) là "Case";
// lượt ở trang Custom lấy nhãn do chế độ đặt, vd. "Type Roulette · Fire" (short: "Type · Fire").
// Lượt quay từ custom pool (h.pool = "custom"): nhãn đầy đủ thêm " · Custom pool", nhãn gọn có thêm dấu ✦ nhỏ.
function dropSource(h, short = false) {
  if (!h.mode) return { label: "Case", color: "" };
  if (h.mode === CHALLENGE_MODE) { // lượt quay ở tab Challenge: "Challenge · Type · Fire", gọn: "Challenge"
    const [source, detail] = String(h.detail || "").split(":");
    return { label: short ? "Challenge" : `Challenge · ${challengeSourceLabel(source, detail)}`, color: "var(--amber)" };
  }
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

// Lịch sử để hiện ra: lịch sử chính gộp với lịch sử Minigame (lưu riêng).
// Bỏ qua mục hỏng (độ hiếm không hợp lệ, hoặc vật phẩm Minigame không còn). Mục hỏng vẫn giữ nguyên trong dữ liệu đã lưu.
// Hai danh sách đều đã mới nhất trước: trộn theo thời gian, giữ nguyên thứ tự bên trong từng danh sách
// (không có lượt Minigame thì lịch sử chính hiện đúng như đã lưu).
function shownHistory() {
  const main = state.history.filter((h) => rarityInfo(h.rarity)), mini = shownMinigameHistory();
  const merged = [];
  let i = 0, j = 0;
  while (i < main.length || j < mini.length) {
    if (j >= mini.length || (i < main.length && (main[i].t || 0) >= (mini[j].t || 0))) merged.push(main[i++]);
    else merged.push(mini[j++]);
  }
  return merged;
}

// Lịch sử lưu mới nhất trước → lượt mới nhất nằm trên cùng.
function renderRecent() {
  const recent = shownHistory().slice(0, RECENT_DROPS);
  $("recent-row").innerHTML = recent.length
    ? recent.map(recentItem).join("")
    : `<li class="recent-empty">No drops yet</li>`;
}

