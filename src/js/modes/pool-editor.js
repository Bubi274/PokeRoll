// Giao diện sửa custom pool trong popup View case contents.
"use strict";

// ----- Sửa custom pool (trong popup "View case contents") -----

// Đang sửa: mode + key = chế độ và nhóm; full = cả hòm của nhóm; picked = id (dạng chữ) đang tick; saved = tập đã lưu.
const poolEdit = { mode: null, key: null, full: [], picked: new Set(), saved: null };

// Lý do nút "Edit pool" đang khóa ("" = bấm được).
function poolEditBlock(c) {
  if (state.spinning) return "Wait for the spin to finish.";
  if (c.key !== c.current) return "Spin or select this case on the wheel to edit its pool";
  if (!canCustomizePool(c.pool.full)) return `This case has fewer than ${CUSTOM_POOL_MIN} Pokémon, so it always uses the full case.`;
  return "";
}

// Chế độ xem: trạng thái custom pool của nhóm + nút "Edit pool". Nhóm không có trên bánh xe thì không có gì.
function poolLines(c, line) {
  if (!c.pool) return "";
  const block = poolEditBlock(c);
  return `
    ${line(c.pool.custom ? `<b>Custom pool</b> · ${c.pool.picked}/${c.pool.total} Pokémon. Only these can drop.` : "")}
    ${line(c.pool.invalid ? CUSTOM_POOL_INVALID : "", " is-off")}
    <div class="pool-edit-row">
      <button type="button" class="btn btn-ghost" data-pool="edit"${block ? " disabled" : ""}>Edit pool</button>
      ${block ? `<span class="pool-edit-why">${escHtml(block)}</span>` : ""}
    </div>`;
}

// Chế độ sửa: bộ đếm, nút chọn nhanh, bảng tỉ lệ của tập đang tick, lý do chưa lưu được, Save / Cancel / Reset.
function poolEditorHtml(c) {
  return `
    <div class="pool-editor">
      <div class="pool-editor-side">
        <p class="pool-edit-count"><strong id="pool-edit-count">0 selected</strong> <span>of ${poolEdit.full.length} in the ${escHtml(c.title)}</span></p>
        <div class="pool-quick">
          <button type="button" class="btn btn-ghost" data-pool="all">All</button>
          <button type="button" class="btn btn-ghost" data-pool="none">None</button>
          <button type="button" class="btn btn-ghost" data-pool="missing">Only missing</button>
          <button type="button" class="btn btn-ghost" data-pool="owned">Only owned</button>
        </div>
        <ul class="pool-problems" id="pool-problems" aria-live="polite"></ul>
        <div class="pool-actions">
          <button type="button" class="btn btn-ghost" data-pool="reset">Reset to full case</button>
          <button type="button" class="btn btn-ghost" data-pool="cancel">Cancel</button>
          <button type="button" class="btn btn-spin" data-pool="save" id="pool-save">Save</button>
        </div>
      </div>
      <ul class="rarity-list is-compact pool-odds" id="pool-odds" aria-label="Odds with your picks"></ul>
    </div>`;
}

// Bắt đầu sửa custom pool của nhóm đang chọn: tick sẵn tập đã lưu (phần thuộc các gen đang chọn), chưa có thì cả hòm.
function startPoolEdit() {
  const mode = custom.active;
  const c = mode && mode.contents ? mode.contents() : null;
  if (!c || !c.pool || poolEditBlock(c)) return;
  const { full, saved } = c.pool;
  const ids = saved ? new Set(saved.map(String)) : null;
  const picked = full.filter((p) => !ids || ids.has(String(p.id))).map((p) => String(p.id));
  Object.assign(poolEdit, { mode, key: c.key, full, picked: new Set(picked), saved });
  openCustomContents(c.key);
}

function stopPoolEdit() {
  Object.assign(poolEdit, { mode: null, key: null, full: [], picked: new Set(), saved: null });
  $("contents-modal").classList.remove("is-editing-pool");
}

// Tập đang tick theo đúng thứ tự trong hòm.
const pickedList = () => poolEdit.full.filter((p) => poolEdit.picked.has(String(p.id)));

// Vẽ lại phần thay đổi theo tập đang tick (không dựng lại ô, giữ nguyên chỗ cuộn và ô đang focus):
// ô tick, tỉ lệ từng Pokémon (dropOdds của tập đang tick), dòng đầu mỗi bậc, bộ đếm, bảng tỉ lệ, nút Save.
function updatePoolEdit() {
  const list = pickedList();
  const groups = groupByRarity(list);
  const chances = effectiveChances(groups);
  const fullGroups = groupByRarity(poolEdit.full);
  for (const sec of $("contents-body").querySelectorAll(".contents-group")) {
    const tier = sec.dataset.tier;
    const n = groups[tier].length, all = fullGroups[tier].length;
    const rate = n ? dropOdds({ rarity: tier, shiny: false }, groups).pokemon : 0;
    sec.querySelector(".contents-meta").textContent = `${n}/${all} picked · ${formatPct(chances[tier])} total`
      + (n ? ` · ≈${formatPct(rate * 100)} each` : "");
    for (const tile of sec.querySelectorAll(".mini")) {
      const on = poolEdit.picked.has(tile.dataset.id);
      tile.querySelector(".mini-check").checked = on;
      tile.classList.toggle("is-unpicked", !on);
      const odds = tile.querySelector(".mini-odds");
      odds.dataset.odds = on ? rate : 0;
      odds.textContent = on ? formatPct(rate * 100) : "—";
      odds.title = on ? `1 in ${oneIn(rate)}` : "Not in your pool";
    }
  }
  countTo($("pool-edit-count"), list.length, (x, final) => `${fmtCount(x, final)} selected`);
  renderOddsTable($("pool-odds"), groups);
  $("pool-odds").querySelector(".odds-hint").textContent = "Pick Pokémon to see the odds.";
  const problems = customPoolProblems(list);
  $("pool-problems").innerHTML = problems.map((t) => `<li>${t}</li>`).join("");
  $("pool-save").disabled = problems.length > 0;
  updatePoolLabels();
}

// Pokémon mà các nút chọn nhanh / chọn cả bậc tác động: ô tìm kiếm trống = cả hòm (hoặc cả bậc),
// đang có chữ = chỉ những con đang hiện trong kết quả tìm. tier: chỉ lấy một bậc.
function poolShown(tier = null) {
  const q = contentsQuery();
  const tiles = $("contents-body").querySelectorAll(tier ? `.contents-group[data-tier="${tier}"] .mini` : ".mini");
  const ids = new Set([...tiles].filter((t) => matchesContents(t, q)).map((t) => t.dataset.id));
  return poolEdit.full.filter((p) => ids.has(String(p.id)));
}

const allPicked = (list) => list.every((p) => poolEdit.picked.has(String(p.id)));

// Nhãn các nút chọn nhanh và chọn cả bậc. Đang tìm kiếm thì ghi rõ số con đang hiện, vd. "Select 4 shown".
// Đọc thẳng từ khóa (không đợi filterContents ẩn ô) nên gọi trước hay sau filterContents đều đúng.
function updatePoolLabels() {
  if (!poolEdit.mode) return;
  const filtered = Boolean(contentsQuery());
  const n = poolShown().length;
  const quick = filtered
    ? { all: `Select ${n} shown`, none: `Clear ${n} shown`, missing: `Only missing (${n} shown)`, owned: `Only owned (${n} shown)` }
    : { all: "All", none: "None", missing: "Only missing", owned: "Only owned" };
  for (const [action, text] of Object.entries(quick)) {
    const btn = $("contents-note").querySelector(`[data-pool="${action}"]`);
    btn.textContent = text;
    btn.disabled = n === 0;
  }
  for (const btn of $("contents-body").querySelectorAll("[data-tier-pick]")) {
    const tier = btn.dataset.tierPick, list = poolShown(tier), on = allPicked(list);
    const name = rarityInfo(tier).name;
    btn.textContent = filtered ? `${on ? "Clear" : "Select"} ${list.length} shown` : `${on ? "Clear" : "Select"} tier`;
    btn.setAttribute("aria-label", filtered
      ? `${on ? "Clear" : "Select"} the ${list.length} ${name} Pokémon shown`
      : `${on ? "Clear" : "Select"} all ${name} Pokémon`);
  }
}

// Các nút trong chế độ sửa. Quick (All, None, Only missing, Only owned) đặt lại tick của các Pokémon trong
// poolShown(): ô tìm kiếm trống = cả hòm (thay hẳn lựa chọn), đang tìm = chỉ những con đang hiện, con bị ẩn giữ nguyên.
const QUICK_PICKS = {
  all: () => true,
  none: () => false,
  missing: (p) => !state.collection[p.id],
  owned: (p) => Boolean(state.collection[p.id]),
};

function onPoolAction(action) {
  if (action === "edit") return startPoolEdit();
  if (!poolEdit.mode) return;
  const key = poolEdit.key;
  if (QUICK_PICKS[action]) {
    for (const p of poolShown()) {
      if (QUICK_PICKS[action](p)) poolEdit.picked.add(String(p.id));
      else poolEdit.picked.delete(String(p.id));
    }
  } else if (action === "reset") {
    poolEdit.picked = new Set(poolEdit.full.map((p) => String(p.id))); // tick lại cả hòm, bấm Save mới lưu
  } else if (action === "cancel") {
    stopPoolEdit();
    openCustomContents(key);
    return;
  } else if (action === "save") {
    if (customPoolProblems(pickedList()).length) return;
    const mode = poolEdit.mode;
    if (!saveCustomPoolIds(mode.key, key, mergeCustomPool(poolEdit.saved, poolEdit.full, poolEdit.picked))) {
      $("pool-problems").innerHTML = "<li>Couldn't save your pool: storage is blocked or full.</li>";
      return;
    }
    stopPoolEdit();
    if (mode.onCustomPoolChanged) mode.onCustomPoolChanged();
    renderCustomControls();
    openCustomContents(key);
    return;
  }
  updatePoolEdit();
}

// Chọn / bỏ cả một bậc (đang tìm kiếm: chỉ những con của bậc đang hiện): đã tick hết thì bỏ hết, chưa thì tick hết.
function togglePoolTier(tier) {
  const list = poolShown(tier);
  const allOn = allPicked(list);
  for (const p of list) {
    if (allOn) poolEdit.picked.delete(String(p.id));
    else poolEdit.picked.add(String(p.id));
  }
  updatePoolEdit();
}

