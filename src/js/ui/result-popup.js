// Popup kết quả sau khi quay.
"use strict";

// ----- Popup kết quả -----

function typeChips(types) {
  return types.map((t) =>
    `<span class="type-chip" style="--t:${TYPE_COLORS[t] || "#777"}">${t}</span>`).join("");
}

// Thanh 5 nấc độ hiếm, nấc của Pokémon này sáng lên (chỉ để trình bày).
function tierLadder(rarity) {
  return `
    <div class="tier-ladder" aria-hidden="true">
      ${RARITIES.map((r) => `<span class="rung r-${r.key}${r.key === rarity ? " is-current" : ""}"><i></i>${r.name}</span>`).join("")}
    </div>`;
}

// Khung thông tin độ hiếm: tên bậc, quy tắc xếp bậc và tỉ lệ của bậc.
// groups: hòm lúc quay (popup kết quả) → tỉ lệ thật trong hòm đó; không có hòm (popup chi tiết) → tỉ lệ gốc.
function tierPanel(rarity, shiny, groups) {
  const r = rarityInfo(rarity);
  const odds = groups ? tierOdds(rarity, groups) : null;
  return `
    <div class="tier-panel">
      <div>
        <div class="result-rarity">${r.name}${shiny ? ` <span class="shiny-tag">★ Shiny</span>` : ""}</div>
        <p class="tier-rule">${r.rule}</p>
      </div>
      ${odds
        ? `<p class="tier-odds"><b>${pct2(odds.chance)}</b> tier odds in this case${odds.from.length ? ` <span class="tier-fold">${foldedOddsText(odds)}</span>` : ""}</p>`
        : `<p class="tier-odds"><b>${pct2(r.chance)}</b> base tier odds</p>`}
    </div>`;
}

function regionOf(p) {
  return GENS.find((g) => g.gen === p.gen).region;
}

// Dòng "Generation" trong popup; Pokémon Special thay bằng nhóm và dạng gốc.
function originFacts(p) {
  if (!isSpecial(p)) return `<div><dt>Generation</dt><dd>${sourceLabel(p)}</dd></div>`;
  return `
    <div><dt>Group</dt><dd>${sourceLabel(p)}</dd></div>
    <div><dt>Base form</dt><dd>#${p.baseId} ${p.baseName}</dd></div>`;
}

// Mục cuối popup: nơi xuất hiện trong Cobbleverse, hoặc cách tiến hóa (Pokémon Special).
function findSection(p) {
  return isSpecial(p)
    ? `<h3 class="detail-section">How to evolve</h3>${renderEvolutionSection(p)}`
    : `<h3 class="detail-section">Where to find in Cobbleverse</h3>${renderSpawnSection(p)}`;
}

// Khung "1 in N": cơ hội ra đúng Pokémon này (và shiny, nếu có) trong hòm lúc quay.
function oddsBlock(result, groups) {
  const { pokemon: p, rarity, shiny } = result;
  const odds = dropOdds(result, groups);
  const tierName = rarityInfo(rarity).name;
  const folded = odds.foldedFrom.map((k) => rarityInfo(k).name);
  const foldNote = folded.length
    ? ` (includes ${folded.join(", ")}, which ${folded.length > 1 ? "have" : "has"} no Pokémon in this case)`
    : "";
  return `
    <div class="odds">
      <span class="odds-label">Odds of pulling ${shiny ? "a shiny " : ""}${p.name}</span>
      <span class="odds-value">1 in ${oneIn(odds.final)}</span>
      <span class="odds-note">
        <span>${tierName} tier: 1 in ${oneIn(odds.tier)}${foldNote}</span>
        <span>1 of ${groups[rarity].length} ${tierName} Pokémon in this case</span>
        ${shiny ? `<span>Shiny: 1 in ${oneIn(SHINY_CHANCE)}</span>` : ""}
      </span>
    </div>`;
}

// groups: Pokémon trong hòm lúc quay (để "1 in N" đúng kể cả khi đổi gen trong lúc dải đang chạy).
// again: hàm chạy khi bấm "Open again" (mặc định mở hòm ở trang Case); canAgain: nút đó có bấm được không.
// extra: HTML thêm vào ngay dưới khung "1 in N" (vd. thông tin riêng của chế độ quay).
function showResultModal(result, { isNew, count, groups = state.groups, again = spin, canAgain = poolSize() > 0, extra = "" }) {
  const { pokemon: p, rarity, shiny, downgraded } = result;
  const epic = rarity === "red" || rarity === "gold";
  const modal = $("result-modal");
  modal.className = `modal modal-narrow result-modal r-${rarity}${epic ? " is-epic" : ""}`;

  $("result-body").innerHTML = `
    <div class="showcase">
      <div class="slab${shiny ? " is-shiny" : ""}">
        <div class="slab-head">
          <span class="slab-tier">${rarityInfo(rarity).name}</span>
          ${shiny ? `<span class="slab-shiny">★ Shiny</span>` : ""}
          <span class="slab-id">${dexLabel(p)}</span>
        </div>
        <div class="reveal${shiny ? " is-shiny" : ""}">
          <div class="reveal-rays"></div>
          <div class="reveal-glow"></div>
          ${shiny ? `<span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span>` : ""}
          <img class="reveal-img" alt="${p.name}">
          <span class="reveal-badge ${isNew ? "is-new" : ""}">${isNew ? "New!" : `Duplicate · ×${count}`}</span>
        </div>
        <div class="slab-foot">
          <h2 class="reveal-name" id="result-name">${p.name}</h2>
          <div class="type-chips">${typeChips(p.types)}</div>
        </div>
      </div>
      <div class="reveal-info">
        ${tierPanel(rarity, shiny, groups)}
        ${oddsBlock(result, groups)}
        ${extra}
        ${downgraded ? `<div class="result-note">Rolled a higher tier with no Pokémon in this case — dropped to ${rarityInfo(rarity).name}.</div>` : ""}
        <dl class="facts">
          ${originFacts(p)}
          <div><dt>Base stat total</dt><dd>${p.bst}</dd></div>
          <div><dt>In collection</dt><dd>×${count}</dd></div>
        </dl>
        ${tierLadder(rarity)}
        ${findSection(p)}
      </div>
    </div>`;
  setPokemonImage($("result-body").querySelector("img"), p, shiny);

  $("result-again").disabled = !canAgain;
  state.resultAgain = again;
  $("result-view").dataset.target = p.id; // nút "View in collection" biết cần tìm Pokémon nào
  modal.showModal();
  playReveal(rarity, shiny);
  $("result-body").scrollTop = 0;
}

