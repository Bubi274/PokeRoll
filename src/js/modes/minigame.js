// Chế độ Minigame Case: khung đăng ký hòm, chọn đều 1/N, dải quay, popup, lịch sử và bộ sưu tập riêng.
"use strict";

// =====================================================================
// CHẾ ĐỘ CUSTOM: Minigame Case (nhiều hòm, không độ hiếm, không Shiny, mọi vật phẩm tỉ lệ bằng nhau)
// =====================================================================

// Mỗi hòm là một đối tượng, đăng ký bằng registerMinigameCase({...}) (xem modes/minigame-*.js). Thêm hòm mới chỉ cần
// đăng ký thêm một mục — ô chọn hòm, dải quay, popup, View case contents, lịch sử và bộ sưu tập (nếu có) tự có.
// Mọi hòm Minigame: không độ hiếm, không Shiny, mỗi vật phẩm 1/N (pickUniform). Không dùng hàm quay của hòm chính.
//   key             mã hòm (lưu trong localStorage và lịch sử Minigame)
//   name, desc      tên và mô tả một dòng (ô chọn hòm, panel thông tin)
//   noun            { one, many } tên một / nhiều vật phẩm, vd. { one: "stone", many: "stones" }
//   rules           các dòng thêm vào panel "How it works"                                   — tuỳ chọn
//   items()         mọi vật phẩm trong hòm (gọi sau khi app đã nạp dữ liệu)
//   idOf(item), byId(id)  id của vật phẩm (lưu lại được) và tra ngược; byId trả về undefined nếu không còn
//   title(item)     tên hiện ra; short(item): dòng phụ ngắn (Recent drops); meta(item): dòng phụ dài (Roll history)
//   search(item)    chữ để tìm (đã bỏ dấu bằng foldText)
//   searchHint      chữ mờ trong ô tìm kiếm
//   attrs(item)     thuộc tính HTML của ô bấm được, vd. data-pokemon="25" (mở chi tiết Pokémon)
//   thumb(item)     HTML ảnh nhỏ (phần tử có class mini-img)
//   card(item)      HTML bên trong thẻ trên dải quay
//   art(item, cls)  HTML ảnh lớn (popup), cls là class thêm cho phần tử ảnh
//   chips(item)     HTML dưới tên trong popup (vd. nhãn hệ)                                   — tuỳ chọn
//   facts(item, o)  HTML phần thông tin bên phải popup; o = { count } (count: số bản đang có, null nếu không sưu tập)
//   images(item)    URL ảnh cần tải trước khi quay                                            — tuỳ chọn
//   setImages(el, item) gắn ảnh vào các <img> trong el (thẻ, popup) sau khi vẽ                — tuỳ chọn
//   credit(item)    dòng nguồn dữ liệu cuối popup chi tiết                                    — tuỳ chọn
//   collect         false: vật phẩm quay ra không được lưu vào đâu (chỉ ghi lịch sử).
//                   { title, detailTitle, filter }: bộ sưu tập riêng (localStorage), có mục riêng ở trang Collection:
//                     title        vd. "Mega Stones" (→ "Mega Stones 3/156")    detailTitle  tiêu đề popup chi tiết
//                     filter       (tuỳ chọn) { label, all, options: [{ key, name }], match(item, key) } — ô lọc

const MINIGAME_MODE = "minigame";
const MINIGAME_HISTORY_LIMIT = 200; // lịch sử Minigame lưu riêng, giới hạn riêng (không đẩy lịch sử hòm chính ra)
const MINIGAME_COLOR = "var(--r-minigame)"; // màu trung tính chung của Minigame (không trùng màu độ hiếm), dùng trong style inline

const STORAGE_KEY_MINIGAME_CASE = "pokeroll.minigame.case";       // hòm đang chọn
const STORAGE_KEY_MINIGAME_HISTORY = "pokeroll.minigame.history"; // [{ mode: "minigame", detail: key hòm, item: id, t }], mới nhất trước
const STORAGE_KEY_MINIGAME_COLLECTION = "pokeroll.minigame.collection"; // + "." + key hòm → { [id]: { count, first } }

const ICON_MINIGAME = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="10" width="18" height="11" rx="1"/><path d="M2 7h20v3H2zM12 7v14M12 7c-1.5-3-5-4-5-1.5S10 7 12 7zM12 7c1.5-3 5-4 5-1.5S14 7 12 7z"/></svg>`;

const MINIGAME_CASES = [];

const minigame = {
  selected: null, // hòm đang chọn
  history: loadJson(STORAGE_KEY_MINIGAME_HISTORY, [], Array.isArray)
    .filter((h) => h && h.mode === MINIGAME_MODE).slice(0, MINIGAME_HISTORY_LIMIT),
  collections: {}, // key hòm → { [id]: { count, first } } (chỉ hòm có collect)
};

const collectionKeyOf = (key) => `${STORAGE_KEY_MINIGAME_COLLECTION}.${key}`;

// Đọc bộ sưu tập của một hòm, bỏ các mục không hợp lệ (id không còn trong hòm thì bỏ qua lúc hiển thị).
function loadMinigameCollection(key) {
  const raw = loadJson(collectionKeyOf(key), {}, isPlainObject);
  const clean = {};
  for (const [id, e] of Object.entries(raw)) {
    if (e && Number.isInteger(e.count) && e.count > 0) clean[id] = { count: e.count, first: e.first || 0 };
  }
  return clean;
}

function registerMinigameCase(c) {
  MINIGAME_CASES.push(c);
  if (c.collect) minigame.collections[c.key] = loadMinigameCollection(c.key);
}

const minigameCase = (key) => MINIGAME_CASES.find((c) => c.key === key);

// ----- Logic (hàm thuần) -----

// Chọn đều một vật phẩm: mỗi vật phẩm 1/N. rng: hàm sinh số trong [0, 1) (truyền hàm khác vào để test). Rỗng → null.
function pickUniform(items, rng = Math.random) {
  if (!items.length) return null;
  return items[Math.min(Math.floor(rng() * items.length), items.length - 1)];
}

// Danh sách vật phẩm cho dải quay: thắng ở winIndex, các ô khác chọn đều trong hòm.
function buildUniformReel(winner, items, size = REEL_SIZE, winIndex = WIN_INDEX, rng = Math.random) {
  const reel = [];
  for (let i = 0; i < size; i++) reel.push(i === winIndex ? winner : pickUniform(items, rng));
  return reel;
}

// Ghi một lượt Minigame: lịch sử Minigame (giới hạn riêng) và, nếu hòm có bộ sưu tập, bộ sưu tập đó.
// collection = null: hòm không sưu tập. Trả về mục trong bộ sưu tập (hoặc null).
function recordMinigameDrop(history, collection, caseKey, id, time = Date.now()) {
  let entry = null;
  if (collection) {
    if (!collection[id]) collection[id] = { count: 0, first: time };
    entry = collection[id];
    entry.count++;
  }
  history.unshift({ mode: MINIGAME_MODE, detail: caseKey, item: id, t: time });
  if (history.length > MINIGAME_HISTORY_LIMIT) history.length = MINIGAME_HISTORY_LIMIT;
  return entry;
}

// "1 in 1,033" và "0.10%" cho hòm có n vật phẩm.
const uniformOneIn = (n) => `1 in ${n.toLocaleString("en-US")}`;
const uniformPct = (n) => `${(100 / n).toFixed(2)}%`;

// ----- Lưu trữ -----

function saveMinigameProgress() {
  let ok = saveJson(STORAGE_KEY_MINIGAME_HISTORY, minigame.history);
  for (const [key, col] of Object.entries(minigame.collections)) ok = saveJson(collectionKeyOf(key), col) && ok;
  markSaved("minigame", ok);
}

// "Clear data" ở trang Collection: xoá cả lịch sử Minigame và mọi bộ sưu tập của hòm Minigame.
function clearMinigameProgress() {
  minigame.history = [];
  for (const key of Object.keys(minigame.collections)) minigame.collections[key] = {};
  saveMinigameProgress();
}

// ----- Lịch sử (gộp với lịch sử chính ở Recent drops / Roll history, xem shownHistory) -----

const isMinigameEntry = (h) => h.mode === MINIGAME_MODE;

// Hòm và vật phẩm của một lượt Minigame, null nếu hòm / vật phẩm không còn.
function minigameEntry(h) {
  const c = minigameCase(h.detail);
  const item = c && c.byId(h.item);
  return item ? { c, item } : null;
}

const shownMinigameHistory = () => minigame.history.filter((h) => minigameEntry(h));

function minigameRecentItem(h) {
  const { c, item } = minigameEntry(h);
  return `
    <li>
      <button type="button" class="recent-item r-minigame" ${c.attrs(item)} title="${escHtml(c.title(item))}">
        ${c.thumb(item)}
        <span class="recent-name">${escHtml(c.title(item))}</span>
        <span class="recent-id">${escHtml(c.short(item))}${sourceTag(dropSource(h, true))}</span>
      </button>
    </li>`;
}

function minigameHistoryRow(h, time) {
  const { c, item } = minigameEntry(h);
  return `
    <li>
      <button type="button" class="hist r-minigame" ${c.attrs(item)}>
        <span class="hist-thumb">${c.thumb(item)}</span>
        <span class="hist-main">
          <span class="hist-name">${escHtml(c.title(item))}</span>
          <span class="hist-meta">${escHtml(c.meta(item))} ${sourceTag(dropSource(h))}</span>
        </span>
        <span class="hist-rarity is-blank" aria-hidden="true"></span>
        <time class="hist-time">${time}</time>
      </button>
    </li>`;
}

// ----- Giao diện chế độ -----

const itemsOf = (c) => c.items();
const nounOf = (c, n) => (n === 1 ? c.noun.one : c.noun.many);

// Thẻ trên dải quay (reel.js gọi khi mục có trường minigame). Một màu trung tính, không chữ độ hiếm.
function minigameCard({ minigame: c, item }) {
  const card = document.createElement("div");
  card.className = "card r-minigame is-minigame";
  card.innerHTML = c.card(item);
  if (c.setImages) c.setImages(card, item);
  return card;
}

const reelItemsOf = (c, list) => list.map((item) => ({ minigame: c, item }));

function renderMinigameIdleReel() {
  const c = minigame.selected, items = itemsOf(c);
  const idle = [];
  for (let i = 0; i < IDLE_REEL_SIZE && items.length; i++) idle.push(pickUniform(items));
  renderReel(reelItemsOf(c, idle), $("mg-reel"));
}

// Panel thông tin thay cho bảng tỉ lệ: số vật phẩm và "Each item: 1 in N (x.xx%)".
function renderMinigameInfo() {
  const c = minigame.selected, n = itemsOf(c).length;
  $("mg-info-title").textContent = c.name;
  $("mg-info-sub").textContent = c.desc;
  const count = $("mg-info-count");
  if (!count.querySelector("strong")) count.innerHTML = `<strong>0</strong> <span></span>`;
  countTo(count.querySelector("strong"), n, fmtCount);
  count.querySelector("span").textContent = `${nounOf(c, n)} in case`;
  $("mg-odds").innerHTML = n
    ? `Each item: <b>${uniformOneIn(n)}</b> (${uniformPct(n)}) · no tiers, no Shiny`
    : "This case is empty.";
}

function renderMinigameCases() {
  for (const btn of $("mg-cases").querySelectorAll(".mg-case")) {
    btn.setAttribute("aria-checked", String(btn.dataset.case === minigame.selected.key));
  }
}

// Vẽ lại phần của hòm đang chọn: ô chọn hòm, panel thông tin, dải thẻ lúc chưa quay.
function renderMinigame() {
  renderMinigameCases();
  renderMinigameInfo();
  renderMinigameIdleReel();
}

function selectMinigameCase(key) {
  const c = minigameCase(key);
  if (!c || state.spinning) return;
  minigame.selected = c;
  saveJson(STORAGE_KEY_MINIGAME_CASE, key);
  renderMinigame();
  renderInPlayCount();
  renderCustomControls(); // chữ nút Open đổi theo hòm
}

function mountMinigame(stage) {
  const saved = loadJson(STORAGE_KEY_MINIGAME_CASE, null, (v) => typeof v === "string");
  minigame.selected = minigameCase(saved) || MINIGAME_CASES[0];
  stage.innerHTML = `
    <div class="mg-layout">
      <div class="mg-cases" id="mg-cases" role="radiogroup" aria-label="Minigame cases">
        ${MINIGAME_CASES.map((c) => `
          <button type="button" class="mg-case mode-lock" role="radio" data-case="${c.key}" aria-checked="false">
            <span class="mg-case-name">${escHtml(c.name)}</span>
            <span class="mg-case-desc">${escHtml(c.desc)}</span>
          </button>`).join("")}
      </div>
      <section class="reel" id="mg-reel" aria-label="Minigame case reel">
        <div class="reel-strip"></div>
        <div class="reel-marker" aria-hidden="true"></div>
        <p class="reel-empty">This case is empty</p>
      </section>
      <section class="panel mg-info" aria-live="polite">
        <div class="panel-head">
          <div class="panel-title">
            <h2 id="mg-info-title"></h2>
            <p class="panel-sub" id="mg-info-sub"></p>
          </div>
          <p class="pool-total" id="mg-info-count"></p>
        </div>
        <p class="mg-odds" id="mg-odds"></p>
      </section>
    </div>`;
  $("mg-cases").addEventListener("click", (e) => {
    const btn = e.target.closest(".mg-case");
    if (btn && !btn.disabled) selectMinigameCase(btn.dataset.case);
  });
  renderMinigame(); // mount chạy trong initCustom, sau khi dữ liệu Pokémon đã nạp
}

// ----- Mở hòm -----

async function openMinigameCase({ quick = false } = {}) {
  const c = minigame.selected, items = itemsOf(c);
  const item = pickUniform(items);
  if (!item) return;

  // Ghi ngay (không mất kết quả nếu lỡ đóng app giữa chừng), chỉ hiện ra khi dải dừng.
  // Không gọi recordDrop: bộ sưu tập Pokémon và mọi thống kê không đổi.
  const entry = recordMinigameDrop(minigame.history, minigame.collections[c.key] || null, c.key, c.idOf(item));
  saveMinigameProgress();

  const reel = $("mg-reel");
  const list = buildUniformReel(item, items);
  if (quick) {
    setCustomSpinning(true);
    renderReel(reelItemsOf(c, list), reel);
    jumpReel(WIN_INDEX, undefined, reel);
  } else {
    setCustomSpinning(true, "Loading…");
    audio();
    if (c.images) {
      const visible = list.filter((_, i) => i < IDLE_REEL_SIZE || Math.abs(i - WIN_INDEX) <= 6);
      await preloadImages([...new Set(visible.flatMap((it) => c.images(it)))], PRELOAD_TIMEOUT_MS);
    }
    renderReel(reelItemsOf(c, list), reel);
    setCustomSpinning(true, "Opening…");
    await animateReel(WIN_INDEX, reel, ROULETTE_REEL_MS);
  }

  stripOf(reel).children[WIN_INDEX].classList.add("is-winner");
  setCustomSpinning(false);
  renderRecent();
  if (state.view === "collection") renderCollection();
  showMinigameResult(c, item, { isNew: entry ? entry.count === 1 : false, count: entry ? entry.count : null });
}

// Khung "1 in N" của popup: mọi vật phẩm như nhau.
function minigameOddsBlock(c, item) {
  const n = itemsOf(c).length;
  return `
    <div class="odds">
      <span class="odds-label">Odds of pulling ${escHtml(c.title(item))}</span>
      <span class="odds-value">${uniformOneIn(n)}</span>
      <span class="odds-note">
        <span>1 of ${n.toLocaleString("en-US")} ${nounOf(c, n)} in the ${escHtml(c.name)}, each with the same chance</span>
        <span>No rarity tiers · no Shiny</span>
      </span>
    </div>`;
}

// Popup kết quả của Minigame (dùng chung #result-modal với hòm chính, một màu trung tính).
// count: số bản đang có (hòm có bộ sưu tập); null = hòm không sưu tập (Pokémon Case).
function showMinigameResult(c, item, { isNew, count }) {
  const modal = $("result-modal");
  modal.className = "modal modal-narrow result-modal r-minigame";
  const badge = count === null
    ? `<span class="reveal-badge">Not added to collection</span>`
    : `<span class="reveal-badge${isNew ? " is-new" : ""}">${isNew ? "New!" : `Duplicate ×${count}`}</span>`;
  $("result-body").innerHTML = `
    <div class="showcase">
      <div class="slab">
        <div class="slab-head">
          <span class="slab-tier">${escHtml(c.name)}</span>
          <span class="slab-id">Minigame</span>
        </div>
        <div class="reveal">
          ${c.art(item, "reveal-img")}
          ${badge}
        </div>
        <div class="slab-foot">
          <h2 class="reveal-name" id="result-name">${escHtml(c.title(item))}</h2>
          ${c.chips ? c.chips(item) : ""}
        </div>
      </div>
      <div class="reveal-info">
        ${minigameOddsBlock(c, item)}
        ${c.facts(item, { count })}
      </div>
    </div>`;
  if (c.setImages) c.setImages($("result-body"), item);

  $("result-again").disabled = false;
  state.resultAgain = () => runCustomAction("open");
  const view = $("result-view");
  view.hidden = !c.collect; // hòm không sưu tập: không có gì để xem trong Collection
  view.dataset.target = c.idOf(item);
  view.dataset.minigameCase = c.key; // không dùng data-minigame: thuộc tính đó là ô bấm mở chi tiết vật phẩm
  modal.showModal();
  playReveal(MINIGAME_MODE, false); // không có độ hiếm → tiếng mặc định
  $("result-body").scrollTop = 0;
}

// Popup chi tiết của vật phẩm có bộ sưu tập (bấm ô ở trang Collection, Recent drops, Roll history).
function openMinigameDetail(key, id) {
  const c = minigameCase(key);
  const item = c && c.collect && c.byId(id);
  if (!item) return;
  const entry = minigame.collections[key][id];
  $("detail-title").textContent = c.collect.detailTitle;
  $("detail-modal").setAttribute("aria-label", c.collect.detailTitle);
  $("detail-body").innerHTML = `
    <div class="showcase r-minigame">
      <div class="slab">
        <div class="slab-head">
          <span class="slab-tier">${escHtml(c.name)}</span>
          <span class="slab-id">Minigame</span>
        </div>
        <div class="slab-art">${c.art(item, "detail-img")}</div>
        <div class="slab-foot">
          <div class="detail-name">${escHtml(c.title(item))}</div>
          ${c.chips ? c.chips(item) : ""}
        </div>
      </div>
      <div class="reveal-info">
        ${entry ? `<div class="owned-line is-owned">Owned ×${entry.count}</div>` : `<div class="owned-line">Not collected yet</div>`}
        ${c.facts(item, { count: entry ? entry.count : 0 })}
      </div>
    </div>`;
  $("detail-credit").innerHTML = c.credit ? c.credit(item) : "";
  if (c.setImages) c.setImages($("detail-body"), item);
  $("detail-modal").showModal();
  $("detail-body").parentElement.scrollTop = 0;
}

// View case contents: mọi vật phẩm, mỗi cái "1 in N", có ô tìm kiếm (bỏ dấu). Không có Edit pool.
function openMinigameContents() {
  const c = minigame.selected, items = itemsOf(c), n = items.length;
  const col = minigame.collections[c.key];
  $("contents-modal").classList.remove("is-editing-pool");
  $("contents-heading").textContent = c.name;
  $("contents-summary").textContent = `${n.toLocaleString("en-US")} ${nounOf(c, n)}`;
  $("contents-note").innerHTML = `<p class="contents-line">No rarity tiers and no Shiny: every ${c.noun.one} in this case has the same chance, ${uniformOneIn(n)} (${uniformPct(n)}).</p>`;
  $("contents-note").hidden = false;
  const tiles = items.map((item) => {
    const owned = col ? col[c.idOf(item)] : null;
    return `
      <button type="button" class="mini${col && !owned ? " is-unowned" : ""}" ${c.attrs(item)} data-search="${escHtml(c.search(item))}">
        ${c.thumb(item)}
        <span class="mini-name">${escHtml(c.title(item))}</span>
        <span class="mini-id">${escHtml(c.short(item))}</span>
        <span class="mini-odds">${uniformOneIn(n)}</span>
        ${col ? `<span class="mini-own">${owned ? `Owned${owned.count > 1 ? ` ×${owned.count}` : ""}` : "Missing"}</span>` : ""}
      </button>`;
  }).join("");
  $("contents-body").innerHTML = `
    <section class="contents-group r-minigame" data-tier="${MINIGAME_MODE}">
      <h3 class="contents-head">
        <span class="contents-name">${escHtml(c.name)}</span>
        <span class="contents-meta">${n.toLocaleString("en-US")} ${nounOf(c, n)} · ${uniformOneIn(n)} each</span>
      </h3>
      <div class="contents-grid">${tiles}</div>
    </section>`;
  $("contents-search").value = "";
  $("contents-search").placeholder = c.searchHint;
  $("contents-empty").textContent = "Nothing in this case matches your search.";
  $("contents-empty").hidden = true;
  if (!$("contents-modal").open) $("contents-modal").showModal();
}

// ----- Bộ sưu tập riêng ở trang Collection (hòm có collect) -----

function buildMinigameCollection(c) {
  const p = `mgc-${c.key}`, f = c.collect.filter;
  const panel = document.createElement("section");
  panel.className = "panel mg-coll";
  panel.id = p;
  panel.setAttribute("aria-labelledby", `${p}-title`);
  panel.innerHTML = `
    <div class="panel-head">
      <h2 id="${p}-title">${escHtml(c.collect.title)} <span class="modal-sub" id="${p}-count"></span></h2>
      ${f ? `
        <div class="filters">
          <select id="${p}-filter" aria-label="${escHtml(f.label)}">
            <option value="all">${escHtml(f.all)}</option>
            ${f.options.map((o) => `<option value="${o.key}">${escHtml(o.name)}</option>`).join("")}
          </select>
        </div>` : ""}
    </div>
    <input type="search" class="modal-search coll-search" id="${p}-search" placeholder="${escHtml(c.searchHint)}" autocomplete="off" aria-label="Search ${escHtml(c.collect.title)}">
    <div class="contents-grid mg-coll-grid" id="${p}-grid"></div>`;
  $("minigame-collections").appendChild(panel);
  $(`${p}-search`).addEventListener("input", () => renderMinigameCollection(c));
  if (f) $(`${p}-filter`).addEventListener("change", () => renderMinigameCollection(c));
}

function renderMinigameCollection(c) {
  const p = `mgc-${c.key}`, f = c.collect.filter;
  if (!$(p)) buildMinigameCollection(c);
  const col = minigame.collections[c.key], items = itemsOf(c);
  const owned = items.filter((item) => col[c.idOf(item)]).length;
  $(`${p}-count`).textContent = `${owned}/${items.length}`;
  const filter = f ? $(`${p}-filter`).value : "all";
  const raw = $(`${p}-search`).value.trim();
  const terms = foldText(raw).split(/\s+/).filter(Boolean);
  const list = items.filter((item) => (filter === "all" || f.match(item, filter))
    && terms.every((t) => c.search(item).includes(t)));
  $(`${p}-grid`).innerHTML = list.map((item) => {
    const e = col[c.idOf(item)];
    return `
      <button type="button" class="mini r-minigame mg-tile${e ? "" : " is-missing"}" ${c.attrs(item)}>
        <span class="mini-top">
          <span class="mini-id">${escHtml(c.short(item))}</span>
          <span class="mini-tier">${e ? "Owned" : "Missing"}</span>
        </span>
        ${c.thumb(item)}
        <span class="mini-foot">
          <span class="mini-name">${escHtml(c.title(item))}</span>
          ${e && e.count > 1 ? `<span class="mini-count">×${e.count}</span>` : ""}
        </span>
      </button>`;
  }).join("") || `<p class="hint">${raw
    ? `No ${escHtml(c.noun.many)} match “${escHtml(raw)}” with this filter.` : `No ${escHtml(c.noun.many)} match this filter.`}</p>`;
}

function renderMinigameCollections() {
  for (const c of MINIGAME_CASES) if (c.collect) renderMinigameCollection(c);
}

// "View in collection" của Minigame: cuộn tới ô của vật phẩm; bộ lọc / ô tìm làm ẩn nó thì đưa về mặc định.
function locateMinigameItem(key, id) {
  const c = minigameCase(key);
  if (!c || !c.collect) return;
  showView("collection");
  const p = `mgc-${key}`;
  const find = () => [...$(`${p}-grid`).querySelectorAll("[data-item]")].find((t) => t.dataset.item === String(id));
  if (!find()) {
    $(`${p}-search`).value = "";
    if ($(`${p}-filter`)) $(`${p}-filter`).value = "all";
    renderMinigameCollection(c);
  }
  flashTile(find());
}

// ----- Đăng ký chế độ -----

registerCustomMode({
  key: MINIGAME_MODE,
  name: "Minigame Case",
  desc: "Just-for-fun cases with no tiers and no Shiny: every item has the same chance",
  icon: ICON_MINIGAME,
  // Đọc lúc chọn chế độ (sau khi mọi hòm đã đăng ký và dữ liệu đã nạp)
  get rules() {
    return [
      `Pick a case above the reel, then open it as many times as you like. ${MINIGAME_CASES.length} cases so far: ${MINIGAME_CASES.map((c) => c.name).join(", ")}. Your case stays picked after reloading.`,
      "No rarity tiers and no Shiny in any Minigame case: every item in a case has the same chance, 1 in N, where N is the number of items in that case.",
      ...MINIGAME_CASES.flatMap((c) => c.rules || []),
      "Every Minigame open goes into your roll history, marked Minigame. It has its own history (last 200 opens), so it never pushes out your Case and Roulette opens.",
    ];
  },
  allGens: true,
  genLock: "Minigame Case always uses every Pokémon.",
  inPlay: () => {
    const c = minigame.selected, n = c ? itemsOf(c).length : 0;
    return { count: n, label: c ? `${nounOf(c, n)} in play` : "items in play" };
  },
  // Nhãn trong lịch sử: "Minigame · Pokémon Case", gọn: "Minigame"
  label(detail, short) {
    const c = minigameCase(detail);
    return short ? "Minigame" : `Minigame · ${c ? c.name : "?"}`;
  },
  tagColor: () => MINIGAME_COLOR,
  actions: [{
    key: "open",
    label: () => (minigame.selected ? `Open ${minigame.selected.name}` : "Open case"),
    icon: ICON_CASE,
    hint: () => (minigame.selected && !itemsOf(minigame.selected).length ? "This case is empty." : ""),
    run: (opts) => openMinigameCase(opts),
  }],
  mount: mountMinigame,
  showContents: openMinigameContents,
  realign() {
    realignReel($("mg-reel"));
  },
});
