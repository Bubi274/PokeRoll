// Bảng tỉ lệ độ hiếm, số Pokémon trong hòm, trạng thái nút mở hòm.
"use strict";

// Ô "N Pokémon" của panel tỉ lệ bên Custom, số đếm dần.
function renderCaseCount(el, n) {
  if (!el.querySelector("strong")) el.innerHTML = `<strong>0</strong> <span>Pokémon</span>`;
  countTo(el.querySelector("strong"), n, fmtCount);
}

// Bảng tỉ lệ dùng chung (trang Case, Type Roulette, Biome Roulette): 5 hàng, hiếm nhất trên cùng.
// Mỗi hàng: tên bậc, số Pokémon, % thật (effectiveChances, đã tính hạ bậc), thanh nền dài theo % thật.
// Bậc nhận thêm tỉ lệ của bậc trống có dòng "base 3.20% + 0.64% from Red"; bậc trống 0%, chữ mờ.
// Hòm rỗng (chưa chọn gen nào): "—" thay cho số và %, kèm dòng nhắc chọn gen.
// rules: hiện dòng quy tắc xếp bậc dưới tên (bảng chính ở trang Case).
// Các hàng được giữ lại giữa các lần vẽ để thanh (CSS transition), % (followBar) và số Pokémon (countTo)
// chạy từ giá trị cũ tới giá trị mới; lần đầu (hoặc bảng vừa bị xoá) thì chạy từ 0.
function renderOddsTable(list, groups, { rules = false } = {}) {
  const order = [...RARITIES].reverse();
  if (list.querySelectorAll(".rarity-row").length !== order.length || list.dataset.rules !== String(rules)) {
    list.dataset.rules = rules;
    list.innerHTML = order.map((r, i) => `
      <li class="rarity-row r-${r.key}" data-tier="${r.key}" style="--p:0;--i:${i}">
        <span class="rarity-swatch"></span>
        <span class="rarity-info">
          <span class="rarity-name">${r.name}</span>
          ${rules ? `<span class="rarity-rule">${r.rule}</span>` : ""}
          <span class="rarity-fold" hidden></span>
        </span>
        <span class="rarity-count" title="Pokémon in this tier">0</span>
        <span class="rarity-chance">0%</span>
      </li>`).join("") + `<li class="odds-hint" hidden>Select at least one generation to see the odds.</li>`;
    void list.offsetWidth; // áp --p:0 trước để thanh chạy từ 0
  }
  const empty = groupsSize(groups) === 0;
  order.forEach((r, i) => {
    const li = list.querySelector(`[data-tier="${r.key}"]`);
    const n = groups[r.key].length;
    const odds = empty ? null : tierOdds(r.key, groups);
    li.classList.toggle("is-empty", n === 0);
    li.style.setProperty("--p", odds ? odds.chance : 0);
    const fold = li.querySelector(".rarity-fold");
    fold.hidden = !(odds && n > 0 && odds.from.length);
    fold.textContent = fold.hidden ? "" : foldedOddsText(odds);
    const count = li.querySelector(".rarity-count"), chance = li.querySelector(".rarity-chance");
    if (empty) {
      clearCount(count, i * MOTION_STAGGER);
      cancelAnimationFrame(countFrames.get(chance));
      chance.textContent = "—";
    } else {
      countTo(count, n, fmtCount, i * MOTION_STAGGER);
      followBar(li, chance, odds.chance);
    }
  });
  list.querySelector(".odds-hint").hidden = !empty;
}

function renderPoolStats() {
  const pool = filterByGens(state.pokemon, state.selectedGens);
  state.groups = groupByRarity(pool);
  countTo($("pool-count"), pool.length, fmtCount);

  renderOddsTable($("rarity-list"), state.groups, { rules: true });

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
  if (custom.ready) renderCustomControls(); // đang quay ở trang này thì nút quay trang Custom cũng khóa
}

function onSelectionChanged() {
  saveSelectedGens(state.selectedGens);
  renderPoolStats();
  // Đổi gen thì vẽ lại dải thẻ theo hòm mới (không đụng vào khi đang quay).
  if (!state.spinning) renderIdleReel();
}

