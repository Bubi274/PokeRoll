// Popup chi tiết Pokémon và nơi xuất hiện trong Cobbleverse.
"use strict";

// ----- Chi tiết Pokémon & nơi xuất hiện (Cobbleverse) -----

function renderSpawnEntry(e) {
  const line = (label, value) => value
    ? `<div class="spawn-line"><span class="spawn-label">${label}</span>${escHtml(value)}</div>` : "";
  return `
    <li class="spawn">
      <div class="spawn-tags">
        <span class="bucket b-${escHtml(e.b)}">${escHtml(SPAWN_BUCKETS[e.b] || e.b)}</span>
        <span class="spawn-tag">Lv. ${escHtml(e.l)}</span>
        ${e.c ? `<span class="spawn-tag">${escHtml(SPAWN_CONTEXTS[e.c] || e.c)}</span>` : ""}
      </div>
      ${line("Form", e.f)}
      ${line("Biomes", (e.in || []).join(", ") || "Any biome")}
      ${line("Not in", (e.ex || []).join(", "))}
      ${line("Conditions", e.cond)}
      ${line("Bonus", e.w)}
    </li>`;
}

function renderSpawnSection(p) {
  if (typeof SPAWN_DATA === "undefined") {
    return `<p class="hint">Spawn data not found — make sure <b>data/spawns.js</b> is next to index.html.</p>`;
  }
  const info = SPAWN_DATA[p.id];
  if (!info) {
    return `
      <p class="spawn-none">${p.name} doesn't spawn naturally in Cobbleverse — it is obtained another way
      (summoning, fossils, events…). <a href="${WIKI_URL}/legendaries.html" target="_blank" rel="noopener">Check the wiki ↗</a></p>`;
  }
  const shown = info.entries.slice(0, SPAWN_VISIBLE).map(renderSpawnEntry).join("");
  const rest = info.entries.slice(SPAWN_VISIBLE);
  return `
    <ul class="spawn-list">${shown}</ul>
    ${rest.length ? `
      <details class="spawn-more">
        <summary>Show ${rest.length} more</summary>
        <ul class="spawn-list">${rest.map(renderSpawnEntry).join("")}</ul>
      </details>` : ""}
    <a class="spawn-link" href="${WIKI_URL}/spawns.html#${encodeURIComponent(info.id)}" target="_blank" rel="noopener">
      Spawn odds & build guide on Cobbleverse Wiki ↗</a>`;
}

// Cách tiến hóa của Pokémon Special (dữ liệu lấy từ file mod, xem scripts/build-special.js).
function renderEvolutionSection(p) {
  const g = specialGroup(p.group);
  return `
    <div class="evo">
      <p class="evo-how">${escHtml(p.evolution.how)}</p>
      <ul class="evo-list">${p.evolution.conditions.map((c) => `<li>${escHtml(c)}</li>`).join("")}</ul>
    </div>
    <a class="spawn-link" href="${g.url}" target="_blank" rel="noopener">${escHtml(g.title)} on Modrinth ↗</a>`;
}

// Dòng nguồn dữ liệu cuối popup chi tiết.
function detailCredit(p) {
  if (!isSpecial(p)) {
    return `Spawn data: <a href="${WIKI_URL}/" target="_blank" rel="noopener">Cobbleverse Wiki</a>`;
  }
  const g = specialGroup(p.group);
  return `<a href="${g.url}" target="_blank" rel="noopener">${escHtml(g.title)}</a> by ${escHtml(g.author)}, licensed ${g.license}`;
}

function ownedLine(p) {
  const e = state.collection[p.id];
  if (!e) return `<div class="owned-line">Not collected yet</div>`;
  return `<div class="owned-line is-owned">Owned ×${e.count}${e.shiny ? ` · ★ ${e.shiny} shiny` : ""}</div>`;
}

function openPokemonDetail(p, shiny = false) {
  const r = rarityInfo(p.rarity);
  $("detail-body").innerHTML = `
    <div class="showcase r-${p.rarity}">
      <div class="slab${shiny ? " is-shiny" : ""}">
        <div class="slab-head">
          <span class="slab-tier">${r.name}</span>
          ${shiny ? `<span class="slab-shiny">★ Shiny</span>` : ""}
          <span class="slab-id">${dexLabel(p)}</span>
        </div>
        <div class="slab-art"><img class="detail-img" alt="${p.name}"></div>
        <div class="slab-foot">
          <div class="detail-name">${p.name}</div>
          <div class="type-chips">${typeChips(p.types)}</div>
        </div>
      </div>
      <div class="reveal-info">
        ${tierPanel(p.rarity, shiny)}
        <dl class="facts">
          ${originFacts(p)}
          <div><dt>Base stat total</dt><dd>${p.bst}</dd></div>
        </dl>
        ${ownedLine(p)}
        ${tierLadder(p.rarity)}
        ${findSection(p)}
      </div>
    </div>`;
  $("detail-credit").innerHTML = detailCredit(p);
  setPokemonImage($("detail-body").querySelector("img"), p, shiny);
  $("detail-modal").showModal();
  $("detail-body").parentElement.scrollTop = 0;
}

