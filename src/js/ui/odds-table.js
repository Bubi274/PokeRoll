// Bảng tỉ lệ độ hiếm dùng chung và các phép tính tỉ lệ cho bảng / popup.
"use strict";

// Tổng số Pokémon trong một hòm đã chia theo độ hiếm.
function groupsSize(groups) {
  return RARITIES.reduce((sum, r) => sum + groups[r.key].length, 0);
}

// Tỉ lệ % kiểu bảng tỉ lệ: "3.84%", bậc không ra được thì "0%".
const pct2 = (x) => (x === 0 ? "0%" : `${x.toFixed(2)}%`);

// Tỉ lệ thật của một bậc trong hòm groups (đã tính hạ bậc) và các bậc trống dồn tỉ lệ về bậc này.
function tierOdds(key, groups) {
  return {
    chance: effectiveChances(groups)[key],
    base: rarityInfo(key).chance,
    from: RARITIES.filter((r) => r.key !== key && resolveRarity(r.key, groups) === key),
  };
}

// "base 3.20% + 0.64% from Red" — bậc nhận thêm tỉ lệ của các bậc trống.
function foldedOddsText({ base, from }) {
  return `base ${pct2(base)} + ${from.map((r) => `${pct2(r.chance)} from ${r.name}`).join(" + ")}`;
}

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
