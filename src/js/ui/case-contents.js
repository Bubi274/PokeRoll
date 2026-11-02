// Popup danh sách nội dung hòm.
"use strict";

// ----- Danh sách nội dung hòm -----

function formatPct(x) {
  if (x === 0) return "0%";
  return (x >= 1 ? x.toFixed(2) : x.toPrecision(2)) + "%";
}

// Popup danh sách Pokémon của một hòm. Không truyền gì = hòm của trang Case.
//   groups  hòm đã chia theo độ hiếm (mặc định: hòm trang Case)
//   title   tiêu đề popup
//   note    HTML hiện dưới tiêu đề (rỗng thì ẩn)
//   owned   đánh dấu Pokémon đã có / chưa có trong bộ sưu tập
//   odds    hiện tỉ lệ ra thật của từng Pokémon (dropOdds, đã tính hạ bậc)
//   pick    (tuỳ chọn) chế độ sửa custom pool: mỗi ô là một ô tick (không mở chi tiết), có nút chọn / bỏ cả bậc.
//           Tỉ lệ, dòng đầu mỗi bậc và trạng thái tick do updatePoolEdit() điền.
function openContents({ groups = state.groups, title = "Case contents", note = "", owned = false, odds = false, pick = false } = {}) {
  const chances = effectiveChances(groups);
  const total = groupsSize(groups);
  $("contents-heading").textContent = title;
  $("contents-summary").textContent = `${total} Pokémon`;
  $("contents-note").innerHTML = note;
  $("contents-note").hidden = !note;

  // Hiện từ bậc hiếm nhất xuống thấp nhất, giống CS2.
  $("contents-body").innerHTML = [...RARITIES].reverse().map((r) => {
    const list = groups[r.key];
    if (list.length === 0) return "";
    const each = chances[r.key] / list.length;
    const rate = odds ? dropOdds({ rarity: r.key, shiny: false }, groups).pokemon : 0;
    const tiles = list.map((p) => {
      const entry = owned && state.collection[p.id];
      const search = `data-search="${p.name.toLowerCase()} ${p.baseId || p.id}"`;
      const body = (oddsHtml) => `
        <img class="mini-img" src="${thumbUrl(p)}" alt="" loading="lazy">
        <span class="mini-name">${p.name}</span>
        <span class="mini-id">${dexLabel(p)}</span>
        ${oddsHtml}
        ${owned ? `<span class="mini-own">${entry ? `Owned${entry.count > 1 ? ` ×${entry.count}` : ""}` : "Missing"}</span>` : ""}`;
      const cls = owned && !entry ? " is-unowned" : "";
      return pick
        ? `<label class="mini is-pickable${cls}" data-id="${p.id}" ${search}>
             <input type="checkbox" class="mini-check" data-pick="${p.id}" aria-label="${escHtml(p.name)}">
             ${body(`<span class="mini-odds" data-odds="0"></span>`)}
           </label>`
        : `<button type="button" class="mini${cls}" data-pokemon="${p.id}" ${search}>
             ${body(odds ? `<span class="mini-odds" data-odds="${rate}" title="1 in ${oneIn(rate)}">${formatPct(rate * 100)}</span>` : "")}
           </button>`;
    }).join("");
    return `
      <section class="contents-group r-${r.key}" data-tier="${r.key}">
        <h3 class="contents-head">
          <span class="contents-name">${r.name}</span>
          <span class="contents-meta">${pick ? "" : `${list.length} Pokémon · ${formatPct(chances[r.key])} total · ≈${formatPct(each)} each`}</span>
          ${pick ? `<button type="button" class="tier-pick" data-tier-pick="${r.key}"></button>` : ""}
        </h3>
        <div class="contents-grid">${tiles}</div>
      </section>`;
  }).join("");

  $("contents-search").value = "";
  $("contents-empty").hidden = true;
  if (!$("contents-modal").open) $("contents-modal").showModal(); // đổi nhóm khi popup đang mở thì chỉ vẽ lại
}

// Từ khóa ô tìm kiếm của popup nội dung hòm, và ô nào khớp (dùng chung cho filterContents và custom pool).
const contentsQuery = () => $("contents-search").value.trim().toLowerCase();
const matchesContents = (tile, q) => !q || tile.dataset.search.includes(q);

function filterContents() {
  const q = contentsQuery();
  let shown = 0;
  for (const group of $("contents-body").querySelectorAll(".contents-group")) {
    let groupShown = 0;
    for (const tile of group.querySelectorAll(".mini")) {
      const match = matchesContents(tile, q);
      tile.hidden = !match;
      if (match) groupShown++;
    }
    group.hidden = groupShown === 0;
    shown += groupShown;
  }
  $("contents-empty").hidden = shown > 0;
}

