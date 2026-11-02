// Khởi động app; khi chạy bằng Node thì xuất các hàm logic cho test.
"use strict";

function init() {
  if (new URLSearchParams(location.search).has("nomotion")) document.documentElement.classList.add("no-motion");
  if (typeof POKEMON_DATA === "undefined") {
    document.querySelector("main").innerHTML =
      `<p class="error">Data not found. Make sure <b>data/data.js</b> is next to index.html.</p>`;
    return;
  }

  state.pokemon = [...POKEMON_DATA, ...SPECIAL_POKEMON].map((p) => ({ ...p, rarity: getRarity(p) }));
  state.dex = state.pokemon.filter((p) => !isSpecial(p));
  state.byId = new Map(state.pokemon.map((p) => [p.id, p]));
  state.selectedGens = loadSelectedGens();
  const validIds = new Set(state.byId.keys());
  state.collection = loadCollection(validIds);
  state.history = loadHistory(validIds);

  // Bộ lọc nhóm trong bộ sưu tập: thêm một mục cho mỗi nhóm Special
  $("f-gen").insertAdjacentHTML("beforeend",
    SPECIAL_GROUP_LIST.map((g) => `<option value="${g.key}">Special · ${g.name}</option>`).join(""));

  buildGenGrid();
  $("pool-sub").textContent = `Each open rolls a tier by these odds. Shiny is rolled separately: 1 in ${oneIn(SHINY_CHANCE)}.`;
  renderPoolStats();
  renderRecent();
  updateCollectionTab();

  renderIdleReel();
  initCustom();

  $("btn-all").addEventListener("click", () => {
    for (const key of allSourceKeys()) state.selectedGens.add(key);
    syncCheckboxes();
    onSelectionChanged();
  });

  $("btn-none").addEventListener("click", () => {
    state.selectedGens.clear();
    syncCheckboxes();
    onSelectionChanged();
  });

  $("btn-spin").addEventListener("click", () => spin());
  $("btn-quick").addEventListener("click", () => spin({ quick: true }));
  for (const btn of document.querySelectorAll(".btn-sound")) btn.addEventListener("click", toggleSound);
  renderSoundButton();
  renderAppVersion();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      realignReel();
      if (state.view === "custom") revealActiveModeButton();
      if (state.view === "custom" && custom.active && custom.active.realign) custom.active.realign();
    }, 100);
  });

  // Danh sách nội dung hòm
  const modal = $("contents-modal");
  $("btn-contents").addEventListener("click", () => openContents());
  $("contents-close").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); }); // bấm ra ngoài để đóng
  $("contents-search").addEventListener("input", filterContents);

  const detail = $("detail-modal");
  $("detail-close").addEventListener("click", () => detail.close());
  detail.addEventListener("click", (e) => { if (e.target === detail) detail.close(); });

  // Popup kết quả
  const resultModal = $("result-modal");
  $("result-close").addEventListener("click", () => resultModal.close());
  resultModal.addEventListener("click", (e) => { if (e.target === resultModal) resultModal.close(); });
  $("result-again").addEventListener("click", () => {
    resultModal.close();
    state.resultAgain();
  });

  // Phím Space: mở hòm ở trang Case, bấm nút nổi bật của chế độ đang chọn ở trang Custom,
  // hoặc "Open again" khi đang xem popup kết quả (chạy lại đúng hành động vừa ra kết quả).
  // Phím chữ cái (vd. W): phím tắt của các nút ở trang Custom.
  // Bấm giống hệt bấm nút (nút đang khóa thì không làm gì).
  document.addEventListener("keydown", (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    // Đang ở nút, ô nhập, ô chọn, link... thì để phím làm việc mặc định của nó.
    if (e.target.closest("button, a, input, select, textarea, summary, [contenteditable]")) return;
    const otherDialog = document.querySelector("dialog[open]");
    let btn = null;
    if (e.code === "Space") {
      if (resultModal.open) btn = $("result-again");
      else if (!otherDialog) btn = state.view === "case" ? $("btn-spin") : state.view === "custom" ? customActionButton("Space") : null;
    } else if (state.view === "custom" && !otherDialog) {
      btn = customActionButton(e.code);
    }
    if (!btn) return;
    e.preventDefault(); // không cuộn trang
    if (!btn.disabled) btn.click();
  });

  // Chuyển trang Case / Collection
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  }
  $("btn-see-collection").addEventListener("click", () => showView("collection"));
  $("result-view").addEventListener("click", () => {
    resultModal.close();
    locateInCollection(parseId($("result-view").dataset.target));
  });

  // Trang bộ sưu tập
  for (const id of ["f-gen", "f-rarity", "f-status", "f-sort"]) {
    $(id).addEventListener("change", renderCollection);
  }
  $("coll-search").addEventListener("input", renderCollection);
  $("gen-progress").addEventListener("click", (e) => {
    const card = e.target.closest(".gp");
    if (!card) return;
    const f = $("f-gen");
    f.value = f.value === card.dataset.gen ? "all" : card.dataset.gen; // bấm lần nữa để bỏ lọc
    renderCollection();
  });
  $("rarity-progress").addEventListener("click", (e) => {
    const card = e.target.closest(".rp");
    if (!card) return;
    const f = $("f-rarity");
    f.value = f.value === card.dataset.rarity ? "all" : card.dataset.rarity; // bấm lần nữa để bỏ lọc
    renderCollection();
  });
  $("btn-clear").addEventListener("click", clearData);

  // Bấm vào bất kỳ Pokémon nào (danh sách hòm, recent drops, bộ sưu tập, lịch sử) → xem chi tiết
  document.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-pokemon]");
    if (tile) openPokemonDetail(state.byId.get(parseId(tile.dataset.pokemon)), tile.dataset.shiny === "1");
  });
  // Ảnh nhỏ bị lỗi: ảnh local → ảnh CDN → ảnh dự phòng
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!img.classList || !img.classList.contains("mini-img") || img.src === FALLBACK_IMG) return;
    const local = img.src.match(/images\/sprite\/((?:shiny\/)?\d+\.png)$/);
    img.src = local ? `${SPRITE_URL}/${local[1]}` : FALLBACK_IMG;
  }, true);
}

// Chỉ chạy giao diện khi mở trong trình duyệt; khi chạy bằng Node (để test) thì xuất các hàm logic.
if (typeof document !== "undefined") {
  init();
} else if (typeof module !== "undefined") {
  module.exports = { RARITIES, SHINY_CHANCE, getRarity, filterByGens, groupByRarity,
    rollRarityKey, resolveRarity, effectiveChances, rollOnce, buildReelItems, simulateRolls,
    recordDrop, genProgress, filterCollection, matchesSearch, sortCollection, dropOdds, oneIn, rarityProgress,
    specialProgress, parseId, TYPE_ORDER, typePools, wheelSliceAt, wheelTarget,
    BIOME_GROUPS, BIOME_TAG_GROUP, biomeGroupsOf, biomePools, wheelPools, COMMON_TIERS,
    CUSTOM_POOL_MIN, customPoolProblems, canCustomizePool, resolveCustomPool, mergeCustomPool,
    LETTERS, letterOf, letterPools, letterColor };
}
