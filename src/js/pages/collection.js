// Trang Collection: bộ lọc, lưới Pokémon, lịch sử quay, xóa dữ liệu.
"use strict";

// ----- Trang bộ sưu tập -----

// Thẻ nhỏ của một Pokémon trong lưới bộ sưu tập.
function miniTile(p, { shiny = false, count = 0, shinyCount = 0, missing = false } = {}) {
  return `
    <button type="button" class="mini r-${p.rarity}${missing ? " is-missing" : ""}" data-pokemon="${p.id}"${shiny ? ` data-shiny="1"` : ""}>
      <span class="mini-top">
        <span class="mini-id">${dexLabel(p)}</span>
        ${shiny || shinyCount
          ? `<span class="mini-shiny">★${shinyCount > 1 ? shinyCount : ""}</span>`
          : `<span class="mini-tier">${missing ? "Missing" : rarityInfo(p.rarity).name}</span>`}
      </span>
      <img class="mini-img" src="${thumbUrl(p, shiny)}" alt="" loading="lazy">
      <span class="mini-foot">
        <span class="mini-name">${p.name}</span>
        ${count > 1 ? `<span class="mini-count">×${count}</span>` : ""}
      </span>
    </button>`;
}

// Tab và thẻ "Pokédex" chỉ đếm Pokédex chính (X/1025); Special có tiến độ riêng.
function dexOwned() {
  return state.dex.filter((p) => state.collection[p.id]).length;
}

function updateCollectionTab() {
  $("tab-collection-count").textContent = `${dexOwned()}/${state.dex.length}`;
}

function collectionFilters() {
  return { gen: $("f-gen").value, rarity: $("f-rarity").value, status: $("f-status").value };
}

function renderCollection() {
  const col = state.collection;
  const owned = dexOwned();
  const total = state.dex.length;
  const opened = Object.values(col).reduce((sum, e) => sum + e.count, 0);
  const shinies = Object.values(col).reduce((sum, e) => sum + e.shiny, 0);
  const golds = state.dex.filter((p) => p.rarity === "gold");
  const goldOwned = golds.filter((p) => col[p.id]).length;
  const pct = (a, b) => (b ? (a / b) * 100 : 0);

  const stat = (label, value, bar) => `
    <div class="stat">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${value}</span>
      ${bar !== undefined ? `<span class="bar"><span style="width:${bar}%"></span></span>` : ""}
    </div>`;
  $("coll-summary").innerHTML =
    stat("Pokédex", `${owned}<small>/${total}</small><span class="stat-pct">${pct(owned, total).toFixed(1)}%</span>`, pct(owned, total)) +
    stat("Cases opened", opened) +
    stat("Shiny drops", `★ ${shinies}`) +
    stat("Gold collected", `${goldOwned}<small>/${golds.length}</small>`, pct(goldOwned, golds.length));
  $("save-warning").hidden = !state.saveFailed;

  const activeRarity = $("f-rarity").value;
  $("rarity-progress").innerHTML = rarityProgress(state.dex, col).map((r) => `
    <button type="button" class="rp r-${r.key}${r.key === activeRarity ? " is-active" : ""}${r.owned === r.total ? " is-done" : ""}" data-rarity="${r.key}">
      <span class="rp-top"><span class="rp-name">${r.name}</span><span class="rp-count"><b>${r.owned}</b>/${r.total}</span></span>
      <span class="bar"><span style="width:${pct(r.owned, r.total)}%"></span></span>
    </button>`).join("");

  const activeGen = $("f-gen").value;
  $("gen-progress").innerHTML = genProgress(state.pokemon, col).map((g) => `
    <button type="button" class="gp${String(g.gen) === activeGen ? " is-active" : ""}${g.owned === g.total ? " is-done" : ""}" data-gen="${g.gen}">
      <span class="gp-top"><b>Gen ${g.gen}</b> <span class="gp-region">${g.region}</span></span>
      <span class="gp-count">Owned ${g.owned}/${g.total}</span>
      <span class="bar"><span style="width:${pct(g.owned, g.total)}%"></span></span>
    </button>`).join("") + specialProgress(state.pokemon, col).map((g) => `
    <button type="button" class="gp gp-special${g.key === activeGen ? " is-active" : ""}${g.owned === g.total ? " is-done" : ""}" data-gen="${g.key}">
      <span class="gp-top"><b>Special</b> <span class="gp-region">${g.name}</span></span>
      <span class="gp-count">Owned ${g.owned}/${g.total}</span>
      <span class="bar"><span style="width:${pct(g.owned, g.total)}%"></span></span>
    </button>`).join("");

  const query = $("coll-search").value.trim();
  const list = sortCollection(
    filterCollection(state.pokemon, col, collectionFilters()).filter((p) => matchesSearch(p, query)),
    col, $("f-sort").value);
  $("coll-count").textContent = `${list.length} Pokémon`;
  $("coll-grid").innerHTML = list.map((p) => {
    const e = col[p.id];
    return miniTile(p, e ? { count: e.count, shinyCount: e.shiny } : { missing: true });
  }).join("") || `<p class="hint">${query
    ? `No Pokémon match “${escHtml(query)}” with these filters.`
    : "No Pokémon match these filters."}</p>`;

  renderMinigameCollections();

  const history = shownHistory();
  $("history-count").textContent = history.length
    ? `Last ${history.length} opens` : "";
  const fmtTime = (t) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  $("history-list").innerHTML = history.length
    ? history.map((h) => {
      if (isMinigameEntry(h)) return minigameHistoryRow(h, fmtTime(h.t));
      const p = state.byId.get(h.id);
      return `
        <li>
          <button type="button" class="hist r-${h.rarity}" data-pokemon="${p.id}"${h.shiny ? ` data-shiny="1"` : ""}>
            <span class="hist-thumb"><img class="mini-img" src="${thumbUrl(p, h.shiny)}" alt="" loading="lazy"></span>
            <span class="hist-main">
              <span class="hist-name">${p.name}${h.shiny ? ` <span class="mini-shiny">★ Shiny</span>` : ""}</span>
              <span class="hist-meta">${isSpecial(p) ? sourceLabel(p) : `#${pad4(p.id)} · Gen ${p.gen}`} · BST ${p.bst} ${sourceTag(dropSource(h))}</span>
            </span>
            <span class="hist-rarity">${rarityInfo(h.rarity).name}</span>
            <time class="hist-time">${fmtTime(h.t)}</time>
          </button>
        </li>`;
    }).join("")
    : `<li class="hint">No cases opened yet. Open your first case on the Case tab.</li>`;
}

function clearData() {
  if (!confirm("Delete your whole collection (Pokémon and Mega Stones) and roll history?\nThis cannot be undone.")) return;
  state.collection = {};
  state.history = [];
  saveProgress();
  clearMinigameProgress(); // bộ sưu tập và lịch sử riêng của Minigame
  renderRecent();
  updateCollectionTab();
  renderCollection();
}

// "View in collection": mở trang bộ sưu tập, cuộn tới ô của Pokémon này và nháy sáng ô đó.
// Nếu bộ lọc hoặc ô tìm kiếm đang làm ẩn Pokémon này thì đưa chúng về mặc định (giữ nguyên cách sắp xếp).
function locateInCollection(id) {
  showView("collection");
  const find = () => $("coll-grid").querySelector(`[data-pokemon="${id}"]`);
  if (!find()) {
    $("coll-search").value = "";
    for (const f of ["f-gen", "f-rarity", "f-status"]) $(f).value = "all";
    renderCollection();
  }
  flashTile(find());
}

// Cuộn tới một ô trong trang Collection và nháy sáng ô đó (dùng cả cho bộ sưu tập Minigame).
function flashTile(tile) {
  if (!tile) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  tile.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  tile.focus({ preventScroll: true }); // dùng bàn phím: Enter/Space trên ô này mở chi tiết
  tile.classList.remove("is-located");
  void tile.offsetWidth; // chạy lại hiệu ứng nháy nếu bấm nhiều lần
  tile.classList.add("is-located");
}

