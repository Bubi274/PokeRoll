// Khung chung cho các chế độ bánh xe: dựng giao diện, quay bánh xe, mở hòm.
"use strict";

// Biểu tượng bánh xe (cũng là biểu tượng của Type Roulette trên thanh chọn chế độ) và biểu tượng hai nút
// của mọi chế độ bánh xe: quay bánh xe, mở hòm.
const ICON_WHEEL = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V5M12 13l6.9 4M12 13l-6.9 4M12 2v3"/></svg>`;
const ICON_CASE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>`;
const ICON_WHEEL_BTN = ICON_WHEEL.replace('width="20" height="20"', 'width="18" height="18" aria-hidden="true"');

// ----- Khung chung cho các chế độ bánh xe (Type Roulette, Biome Roulette…) -----
// Mỗi chế độ bánh xe là một mô tả w; mọi hàm bên dưới chỉ đọc mô tả đó, nên thêm chế độ mới không phải viết lại.
//   mode            mã chế độ (như registerCustomMode, dùng cho custom pool và lịch sử)
//   title           tên chế độ trong popup kết quả, vd. "Type Roulette"
//   prefix          đầu id các phần tử của chế độ, vd. "tr" → tr-wheel, tr-reel, tr-odds-title…
//   wheel, disc, hub id khung bánh xe, phần quay, tâm (= prefix + "-wheel" / "-disc" / "-hub")
//   state           trạng thái: { types, pools, rotation, selected, lost, lostRare, pitySpin }
//                     pitySpin: lần quay ra nhóm đang chọn bị pity giới hạn { key, due, n } (null = quay thường)
//   storageKey      khóa localStorage của nhóm đang chọn; valid(key): nhóm đọc lại được không
//   noun            tên một nhóm, vd. "type" (→ "Type case", "18 types on the wheel"…)
//   color(k), label(k)   màu và tên của nhóm (ô bánh xe, tâm, popup kết quả)
//   chip(k)         HTML tên nhóm trong tiêu đề panel tỉ lệ
//   groups()        Pokémon của từng nhóm trong các gen đang chọn (trước khi lọc bánh xe)
//   order           mọi nhóm theo thứ tự ô (ô chọn trong View case contents)
//   idlePool()      dải thẻ lúc chưa có nhóm: lấy Pokémon từ đây
//   info(k)         dòng thêm (HTML) dưới panel tỉ lệ và trong View case contents        — tuỳ chọn
//   blocked()       lý do cả chế độ không chạy được ("" = chạy được)                     — tuỳ chọn
//   allGens         true: luôn dùng mọi Pokémon (groups/idlePool không theo gen); bảng gen bị khóa — tuỳ chọn
//   upright, wheelClass  nhãn ô một ký tự đứng thẳng (wheelSvg), class thêm cho khung bánh xe  — tuỳ chọn
//   spin            nút quay bánh xe: { key, label, hotkey }
//   text            câu riêng: { first, again, pick, spinning, stopped }
//                     first "Spin the wheel first."      again    "Spin the wheel again." (sau lostGroupMessage)
//                     pick  nhắc khi chưa có nhóm         spinning dòng panel lúc đang quay   stopped tên trong lỗi console
const capFirst = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const wheelCaseTitle = (w) => `${capFirst(w.noun)} case`;
const wheelValid = (w) => w.state.pools[w.state.selected] ? w.state.selected : null;
const wheelPlural = (w, n) => `${n} ${w.noun}${n > 1 ? "s" : ""}`;

// Hòm (theo bậc, đã áp custom pool) của nhóm k trên bánh xe w — dùng để xét pity của bánh xe.
const wheelGroupsOf = (w) => (k) => groupByRarity(wheelCase(w.mode, w.state, k).list);

// Lần quay bánh xe ra nhóm đang chọn có bị giới hạn vì pity không: { key, due, n } hoặc null.
const wheelPitySpin = (w) => (w.state.pitySpin && w.state.pitySpin.key === w.state.selected ? w.state.pitySpin : null);

// Câu về cơ hội của nhóm key trên bánh xe: "Fire is 1 in 18 on the wheel", hoặc lượt quay bị pity giới hạn:
// "Fire came from a pity spin: only the 4 types with Gold could come up".
function wheelChanceText(w, key) {
  const ps = wheelPitySpin(w);
  return ps && ps.key === key
    ? `${w.label(key)} came from a pity spin: only the ${wheelPlural(w, ps.n)} with ${PITY_KINDS[ps.due].label} could come up`
    : `${w.label(key)} is 1 in ${w.state.types.length} on the wheel`;
}

// Dòng dưới bánh xe: số nhóm và cơ hội mỗi nhóm (lượt quay bị pity giới hạn thì ghi rõ).
function renderWheelCaption(w) {
  const st = w.state, n = st.types.length, ps = wheelPitySpin(w);
  $(`${w.prefix}-wheel-caption`).textContent = !n
    ? custom.pool.length ? `No ${w.noun}s on the wheel` : `No ${w.noun}s: select at least one generation`
    : ps ? `Pity spin: only the ${wheelPlural(w, ps.n)} with ${PITY_KINDS[ps.due].label} could come up`
    : `${wheelPlural(w, n)} on the wheel · each 1 in ${n}`;
}

// Cảnh báo cạnh nút Open: lượt mở tới là pity nhưng hòm của nhóm đang chọn không có bậc bảo đảm, trong khi quay lại
// bánh xe thì ra được nhóm có bậc đó. Chỉ dựa vào bộ đếm và nhóm hiện tại (không lộ kết quả). "" nếu không cần.
function pityWheelWarning(w) {
  const st = w.state, counter = state.pity[w.mode], due = pityDue(counter);
  if (!due || !st.pools[st.selected]) return "";
  const groupsOf = wheelGroupsOf(w);
  if (!pityTiers(due, groupsOf(st.selected)).fallback) return "";
  if (!pityWheelKeys(st.types, groupsOf, counter).limited) return ""; // không nhóm nào có bậc đó: quay lại cũng vậy
  const label = PITY_KINDS[due].label;
  return `This ${w.noun} has no ${label} — spin the wheel again to use your ${label} pity.`;
}

// Vẽ lại bánh xe theo các nhóm hiện có; đang có nhóm thì kim chỉ vào giữa ô của nhóm đó.
function renderModeWheel(w) {
  const st = w.state, n = st.types.length;
  drawWheel(w, st.types);
  renderWheelCaption(w);
  if (st.pools[st.selected]) {
    setWheelRotation(wheelTarget(0, st.types.indexOf(st.selected), n, 0, 0), w);
    markWheelWinner(st.selected, w);
  }
}

// Panel tỉ lệ: có nhóm thì hiện số Pokémon và tỉ lệ thật mỗi bậc của hòm (đã áp custom pool), chưa có thì nhắc quay.
// note: dòng thay cho lời nhắc (vd. lúc đang quay).
function renderWheelOdds(w, key, note) {
  const st = w.state, n = st.types.length, p = w.prefix;
  const info = w.info ? $(`${p}-tags`) : null;
  if (!key) {
    $(`${p}-odds-title`).textContent = wheelCaseTitle(w);
    $(`${p}-odds-count`).innerHTML = "";
    $(`${p}-odds-list`).innerHTML = "";
    if (info) info.hidden = true;
    $(`${p}-odds-sub`).textContent = note || (!n
      ? emptyWheelText(w.noun, "below")
      : st.lost
        ? lostGroupMessage(w.label(st.lost), st.lostRare, w.text.again)
        : w.text.pick);
    return;
  }
  const c = wheelCase(w.mode, st, key);
  const groups = groupByRarity(c.list);
  $(`${p}-odds-title`).innerHTML = `${w.chip(key)} case${customPoolBadge(c)}`;
  renderCaseCount($(`${p}-odds-count`), groupsSize(groups));
  setOddsSub($(`${p}-odds-sub`), `${wheelChanceText(w, key)}. Empty tiers drop to the next lower tier.`, c);
  renderOddsTable($(`${p}-odds-list`), groups, { pity: true });
  if (info) {
    info.hidden = false;
    info.innerHTML = w.info(key);
  }
}

// Dải thẻ lúc chưa mở hòm: Pokémon của hòm đang chọn (đã áp custom pool), chưa có nhóm thì từ w.idlePool().
function renderWheelIdleReel(w) {
  const st = w.state;
  const pool = st.pools[st.selected] ? wheelCase(w.mode, st, st.selected).list : w.idlePool();
  renderIdleReel(groupByRarity(pool), $(`${w.prefix}-reel`));
  $(`${w.prefix}-reel`).querySelector(".reel-empty").textContent = emptyWheelText(w.noun, "");
}

// Đổi gen (và lúc tải trang): giữ / bỏ nhóm đang chọn theo refreshWheelGroups, rồi vẽ lại bánh xe.
function refreshWheelMode(w) {
  refreshWheelGroups(w.state, w.groups());
  renderModeWheel(w);
  renderWheelOdds(w, wheelValid(w));
  renderWheelIdleReel(w);
}

// Hành động 1: quay bánh xe ra một nhóm (mỗi nhóm trên bánh xe có cơ hội như nhau). Không mở hòm.
// Lượt mở tới là pity: bánh xe chỉ dừng ở nhóm có bậc bảo đảm (pityWheelKeys); không có nhóm nào như vậy thì quay như thường.
async function spinModeWheel(w, { quick = false }) {
  const st = w.state;
  const pity = pityWheelKeys(st.types, wheelGroupsOf(w), state.pity[w.mode]);
  const key = pickRandom(pity.keys, Math.random());
  // Lưu ngay kết quả (tải lại trang giữa chừng vẫn giữ), nhưng chỉ hiện ra khi bánh xe dừng
  st.selected = null;
  st.lost = null;
  st.pitySpin = pity.limited ? { key, due: pity.due, n: pity.keys.length } : null;
  saveJson(w.storageKey, key);

  if (quick) {
    setCustomSpinning(true);
  } else {
    setCustomSpinning(true, "Spinning…");
    audio(); // mở âm thanh ngay trong lúc bấm
    renderWheelOdds(w, null, w.text.spinning);
  }
  const done = spinWheelTo(w, key, { quick });
  if (done) await done; // Quick: không chờ, xong ngay trong lượt bấm

  st.selected = key;
  renderWheelCaption(w);
  renderWheelOdds(w, key);
  renderWheelIdleReel(w);
  setCustomSpinning(false);
  playReveal("blue", false);
}

// Hành động 2: mở hòm của nhóm đang chọn (đã áp custom pool), cùng tỉ lệ độ hiếm và cách hạ bậc như trang Case.
async function openWheelCase(w, { quick = false }) {
  const st = w.state, key = st.selected;
  const c = wheelCase(w.mode, st, key);
  const groups = groupByRarity(c.list);
  const result = rollModePity(w.mode, groups); // bộ đếm pity riêng của chế độ này
  if (!result) return;

  // Ghi ngay vào bộ sưu tập (giống trang Case), kèm chế độ và nhóm trong lịch sử.
  const isNew = !state.collection[result.pokemon.id];
  const entry = recordDrop(state.collection, state.history, result);
  Object.assign(state.history[0], { mode: w.mode, detail: key, ...customPoolTag(c) });
  tagPityDrop(result);
  saveProgress();

  await runCustomReel($(`${w.prefix}-reel`), buildReelItems(result, groups), {
    quick, urlsOf: (it) => [imageUrl(it.pokemon, it.shiny)],
  });
  renderRecent();
  renderPityMeters();
  updateCollectionTab();
  if (state.view === "collection") renderCollection();
  const name = w.label(key);
  showResultModal(result, {
    isNew, count: entry.count, groups,
    again: () => runCustomAction("open"),
    canAgain: st.selected === key,
    extra: `
      <div class="result-note mode-note" style="--t:${w.color(key)}">
        ${w.title} · <b>${name}</b> case. The odds above are within the ${name} case; ${wheelChanceText(w, key)}.${customPoolNote(c)}
      </div>`,
  });
}

// Khung của chế độ bánh xe: bánh xe, dải thẻ, panel tỉ lệ (+ dòng info nếu có). Nhóm đang chọn đọc lại từ localStorage.
function mountWheelMode(w, stage) {
  w.state.selected = loadJson(w.storageKey, null, w.valid);
  const p = w.prefix, title = wheelCaseTitle(w);
  stage.innerHTML = `
      <div class="tr-layout">
        <div class="tr-wheel-col">
          ${wheelMarkup(w)}
          <p class="wheel-caption" id="${p}-wheel-caption" aria-live="polite"></p>
        </div>
        <div class="tr-side">
          <section class="reel" id="${p}-reel" aria-label="${title} reel">
            <div class="reel-strip"></div>
            <div class="reel-marker" aria-hidden="true"></div>
            <p class="reel-empty">Select at least one generation</p>
          </section>
          <section class="panel tr-odds" aria-live="polite">
            <div class="panel-head">
              <div class="panel-title">
                <h2 id="${p}-odds-title">${title}</h2>
                <p class="panel-sub" id="${p}-odds-sub"></p>
              </div>
              <p class="pool-total" id="${p}-odds-count"></p>
            </div>
            <ul class="rarity-list is-compact" id="${p}-odds-list"></ul>
            ${w.info ? `<p class="br-tags" id="${p}-tags" hidden></p>` : ""}
          </section>
        </div>
      </div>`;
}

// Phần đăng ký dùng chung của một chế độ bánh xe — trải vào registerCustomMode({ key, name, …, ...wheelModeParts(w) }).
function wheelModeParts(w) {
  const st = w.state;
  const empty = () => emptyWheelText(w.noun, "");
  return {
    actions: [
      {
        key: w.spin.key,
        label: () => w.spin.label,
        icon: ICON_WHEEL_BTN,
        hotkey: w.spin.hotkey,
        hint: () => (st.types.length ? "" : empty()),
        run: (opts) => spinModeWheel(w, opts),
      },
      {
        key: "open",
        label: () => wheelOpenLabel(w.mode, st, w.label),
        icon: ICON_CASE,
        hint: () => (!st.types.length ? empty() : st.selected ? "" : w.text.first),
        run: (opts) => openWheelCase(w, opts),
      },
    ],
    // Space: mở hòm nếu đã có nhóm, chưa có thì quay bánh xe
    defaultAction: () => (st.selected ? "open" : w.spin.key),
    status() {
      const blocked = w.blocked ? w.blocked() : "";
      if (blocked) return blocked;
      if (!st.types.length) return emptyWheelText(w.noun);
      if (st.lost) return lostGroupMessage(w.label(st.lost), st.lostRare, w.text.again);
      if (!st.selected) return w.text.first;
      return pityWheelWarning(w);
    },
    mount: (stage) => mountWheelMode(w, stage),
    contents: (key) => wheelContents(key, {
      all: w.groups(), wheel: st, order: w.order, name: w.label, info: w.info, mode: w.mode,
    }),
    allGens: Boolean(w.allGens),
    // Bảng chọn gen bị khóa trong lúc quay nên ở đây không bao giờ đang quay
    onPoolChanged: () => refreshWheelMode(w),
    onCustomPoolChanged() {
      renderWheelOdds(w, st.selected);
      renderWheelIdleReel(w);
    },
    realign() {
      realignReel($(`${w.prefix}-reel`));
    },
  };
}

