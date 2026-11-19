// Pity trong giao diện: quay thẻ thắng bằng bộ đếm của chế độ, hai thanh tiến độ cạnh nút Open,
// dòng ghi chú trong bảng tỉ lệ khi hòm thiếu bậc mục tiêu, khung pity trong popup và nhãn "Pity" trong lịch sử.
// Luật pity (hàm thuần) ở core/pity.js; bộ đếm lưu ở localStorage (loadPity / savePity ở core/storage.js).
"use strict";

// Dòng "How it works" chung của các chế độ có pity.
const PITY_RULE = `Pity: the ${ordinal(PITY_PURPLE)} open in a row without Purple or better is guaranteed Purple or better, `
  + `and the ${ordinal(PITY_GOLD)} open in a row without Gold is guaranteed Gold. Each mode keeps its own count, shown under the Open button.`;

function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return `${n}${s}`;
}

// Quay thẻ thắng của chế độ mode (mã trong PITY_MODES) bằng bộ đếm của chế độ đó, rồi lưu ngay bộ đếm mới (như lượt quay:
// tải lại trang giữa chừng không quay lại được). Thanh tiến độ chỉ vẽ lại khi dải dừng (renderPityMeters), để không lộ kết quả.
// Hòm rỗng → null, bộ đếm không đổi.
function rollModePity(mode, groups) {
  const out = rollWithPity(groups, state.pity[mode]);
  if (!out) return null;
  state.pity[mode] = out.counter;
  savePity();
  return out.result;
}

// Ghi loại pity vào lượt vừa thêm vào lịch sử (state.history[0]).
function tagPityDrop(result) {
  if (result.pity) state.history[0].pity = result.pity;
}

// Hai thanh của một chế độ: "Purple or better 3/5" và "Gold 3/10". Mỗi thanh có một ô cho mỗi lượt; ô cuối là lượt chắc chắn.
function pityMetersHtml(mode) {
  return pityProgress(state.pity[mode]).map(({ kind, label, count, need }) => {
    const due = count === need - 1;
    const title = due
      ? `${count} opens in a row without ${label}. The next open is guaranteed ${label}.`
      : `${count} of ${need}: the ${ordinal(need)} open in a row without ${label} is guaranteed ${label}.`;
    return `
      <div class="pity-meter r-${kind}${due ? " is-due" : ""}" data-pity="${kind}" title="${title}">
        <span class="pity-label">${label}</span>
        <span class="pity-segs" aria-hidden="true">${Array.from({ length: need }, (_, i) =>
          `<i class="${i < count ? "is-on" : ""}${i === need - 1 ? " is-last" : ""}"></i>`).join("")}</span>
        <span class="pity-count">${count}/${need}</span>
      </div>`;
  }).join("");
}

// Vẽ thanh vào el theo chế độ mode; mode không có pity (vd. Minigame) thì ẩn.
function renderPityMeter(el, mode) {
  const on = PITY_MODES.includes(mode);
  el.hidden = !on;
  el.innerHTML = on ? pityMetersHtml(mode) : "";
}

// Thanh pity ở trang Case và ở chế độ Custom đang chọn.
function renderPityMeters() {
  renderPityMeter($("case-pity"), "case");
  if (custom.active) renderPityMeter($("custom-pity"), custom.active.key);
}

// Dòng ghi chú dưới bảng tỉ lệ khi hòm thiếu bậc mục tiêu của pity: pity sẽ cho bậc cao nhất hòm có. "" nếu không thiếu.
function pityCaseNote(groups) {
  if (groupsSize(groups) === 0) return "";
  const lines = [];
  for (const kind of ["purple", "gold"]) {
    const { tiers, fallback } = pityTiers(kind, groups);
    if (fallback) lines.push({ kind, tier: rarityInfo(tiers[0]).name });
  }
  if (!lines.length) return "";
  const k = (kind) => PITY_KINDS[kind];
  if (lines.length === 2 && lines[0].tier === lines[1].tier) {
    return `No Purple or better in this case: both pities give ${lines[0].tier} instead.`;
  }
  return lines.map(({ kind, tier }) => `No ${k(kind).label} in this case: ${k(kind).label} pity (${ordinal(k(kind).need)} open) gives ${tier} instead.`).join(" ");
}

// Khung thay cho "1 in N" trong popup khi pity kích hoạt (tỉ lệ thường không còn đúng cho lượt này).
function pityOddsBlock(result, groups) {
  const { rarity, shiny, pity, pityFallback } = result;
  const tierName = rarityInfo(rarity).name;
  return `
    <div class="odds is-pity">
      <span class="odds-label">Guaranteed by pity</span>
      <span class="odds-value">Pity drop</span>
      <span class="odds-note">
        <span class="pity-text">${pityDropText(pity)}</span>
        ${pityFallback ? `<span>This case has no ${PITY_KINDS[pity].label} Pokémon, so it gave its highest tier: ${tierName}.</span>` : ""}
        <span>1 of ${groups[rarity].length} ${tierName} Pokémon in this case</span>
        ${shiny ? `<span>Shiny: 1 in ${oneIn(SHINY_CHANCE)}</span>` : ""}
      </span>
    </div>`;
}

// Nhãn "Pity" trong Recent drops và Roll history (màu của loại pity).
function pityTag(h) {
  if (!PITY_KINDS[h.pity]) return "";
  return `<span class="src-tag pity-tag" style="--t:var(--r-${h.pity})" title="${escHtml(pityDropText(h.pity))}">Pity</span>`;
}
