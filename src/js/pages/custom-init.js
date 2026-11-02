// Khởi tạo trang Custom và xử lý khi đổi gen của trang này.
"use strict";

function onCustomGensChanged() {
  saveSelectedGens(custom.gens, STORAGE_KEY_CUSTOM_GENS);
  updateCustomPool();
}

function updateCustomPool() {
  custom.pool = filterByGens(state.pokemon, custom.gens);
  renderInPlayCount();
  // Chế độ allGens không theo gen: chỉ vẽ một lần lúc dựng trang (initCustom), đổi gen không đụng tới.
  for (const m of CUSTOM_MODES) if (m.onPoolChanged && !m.allGens) m.onPoolChanged();
  renderCustomControls();
}

function initCustom() {
  custom.gens = loadSelectedGens(STORAGE_KEY_CUSTOM_GENS);
  const grid = $("custom-gen-grid");
  buildGenGrid({ grid, selected: custom.gens, onChange: onCustomGensChanged });
  $("custom-all").addEventListener("click", () => {
    for (const key of allSourceKeys()) custom.gens.add(key);
    syncCheckboxes(grid, custom.gens);
    onCustomGensChanged();
  });
  $("custom-none").addEventListener("click", () => {
    custom.gens.clear();
    syncCheckboxes(grid, custom.gens);
    onCustomGensChanged();
  });

  custom.ready = true;
  for (const m of CUSTOM_MODES) mountCustomMode(m);
  renderModeBar();
  updateCustomPool();
  for (const m of CUSTOM_MODES) if (m.onPoolChanged && m.allGens) m.onPoolChanged();
  const saved = loadJson(STORAGE_KEY_CUSTOM_MODE, null, (v) => typeof v === "string");
  const first = CUSTOM_MODES.find((m) => m.key === saved) || CUSTOM_MODES[0];
  if (first) selectCustomMode(first.key, { save: false });

  $("mode-bar").addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (btn) selectCustomMode(btn.dataset.mode);
  });
  $("custom-actions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn) runCustomAction(btn.dataset.action, { quick: btn.dataset.quick === "1" });
  });
  $("custom-contents").addEventListener("click", () => openCustomContents());
  // Ô chọn nhóm trong popup: xem nhóm khác, giữ ô chọn trong tầm bàn phím sau khi vẽ lại
  $("contents-modal").addEventListener("change", (e) => {
    if (e.target.dataset.pick !== undefined && poolEdit.mode) {
      if (e.target.checked) poolEdit.picked.add(e.target.dataset.pick);
      else poolEdit.picked.delete(e.target.dataset.pick);
      updatePoolEdit();
      return;
    }
    if (e.target.id !== "contents-pick") return;
    openCustomContents(e.target.value);
    $("contents-pick").focus();
  });
  // Custom pool: nút Edit pool / chọn nhanh / Save / Cancel / Reset, và nút chọn cả bậc
  $("contents-modal").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pool], [data-tier-pick]");
    if (!btn || btn.disabled) return;
    if (btn.dataset.tierPick) togglePoolTier(btn.dataset.tierPick);
    else onPoolAction(btn.dataset.pool);
  });
  // Đang sửa: nhãn nút chọn nhanh / chọn cả bậc theo kết quả tìm kiếm
  $("contents-search").addEventListener("input", updatePoolLabels);
  // Đóng popup (×, Esc, bấm ra ngoài) khi đang sửa = Cancel
  $("contents-modal").addEventListener("close", stopPoolEdit);
}

