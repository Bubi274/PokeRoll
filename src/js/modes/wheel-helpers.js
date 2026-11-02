// Hàm dùng chung cho bánh xe: hòm đang quay, nhóm trên bánh xe, góc dừng, vẽ SVG.
"use strict";

// Hòm mà nút Open của chế độ bánh xe quay: nhóm key trên bánh xe w, đã áp custom pool (nếu có và hợp lệ).
// Thêm: key, full (cả hòm của nhóm), saved (tập đã lưu hoặc null).
function wheelCase(mode, w, key) {
  const full = w.pools[key] || [];
  const saved = loadCustomPoolIds(mode, key);
  return { key, full, saved, ...resolveCustomPool(full, saved) };
}

// Chữ nút Open của chế độ bánh xe: "Open Dragon case", "Open Dragon case (custom)".
function wheelOpenLabel(mode, w, name) {
  if (!w.selected) return "Open case";
  return `Open ${name(w.selected)} case${wheelCase(mode, w, w.selected).custom ? " (custom)" : ""}`;
}

// Nhãn cạnh tiêu đề panel tỉ lệ khi đang dùng custom pool: "Custom pool · 12/83".
function customPoolBadge(c) {
  return c.custom ? ` <span class="pool-badge">Custom pool · ${c.picked}/${c.total}</span>` : "";
}

// Dòng phụ dưới tiêu đề panel tỉ lệ, kèm thông báo khi tập đã lưu không hợp lệ với các gen đang chọn.
function setOddsSub(el, text, c) {
  el.innerHTML = escHtml(text) + (c.invalid ? `<span class="pool-warn">${CUSTOM_POOL_INVALID}</span>` : "");
}

// Trường thêm vào lượt quay trong lịch sử, và câu thêm trong popup kết quả.
const customPoolTag = (c) => (c.custom ? { pool: "custom" } : {});
const customPoolNote = (c) => (c.custom ? ` Custom pool: ${c.picked} of ${c.total} Pokémon.` : "");

// Dòng "How it works" chung của các chế độ bánh xe. noun: "type", "biome".
const customPoolRule = (noun) => `View case contents → Edit pool lets you pick which Pokémon of your ${noun} case can drop `
  + `(at least ${CUSTOM_POOL_MIN}, with at least one Blue, Purple or Pink). It is saved for that ${noun} and used whenever the wheel lands on it.`;

// Đổi gen (và lúc tải trang): dựng lại các nhóm trên bánh xe và quyết định giữ / bỏ nhóm đang chọn.
// Dùng chung cho mọi chế độ bánh xe để các chế độ không thể xử lý lệch nhau.
//   w          trạng thái bánh xe: { pools, types, selected, lost, lostRare }
//   groupPools Pokémon của từng nhóm trong các gen đang chọn (trước khi lọc bánh xe)
// Quy tắc (chỉ phụ thuộc bộ gen hiện tại, không phụ thuộc thứ tự bấm):
//   - Chưa chọn gen nào: giữ nguyên, các nút đều khóa.
//   - Nhóm đang chọn — hoặc nhóm vừa bị bỏ mà chưa quay lại — hợp lệ với các gen mới: chọn (lại) nhóm đó.
//   - Không hợp lệ (không có Pokémon, hoặc chỉ có Red/Gold): bỏ khỏi lựa chọn và báo (lost / lostRare).
// Nhóm bị bỏ vẫn được lưu (chỉ quay bánh xe mới thay), nên tải lại trang cũng theo đúng quy tắc này.
function refreshWheelGroups(w, groupPools) {
  const { pools, rareOnly } = wheelPools(groupPools);
  w.pools = pools;
  w.types = Object.keys(pools);
  const wanted = w.selected || w.lost;
  if (!wanted || custom.pool.length === 0) return;
  if (pools[wanted]) {
    w.selected = wanted;
    w.lost = null;
  } else {
    w.selected = null;
    w.lost = wanted;
    w.lostRare = rareOnly.includes(wanted);
  }
}

// Bánh xe trống: chưa chọn gen nào, hoặc các gen đã chọn không có nhóm nào đủ điều kiện lên bánh xe
// (vd. chỉ chọn Special ở Biome Roulette: các dạng Special không có dữ liệu spawn). noun: "type", "biome"…
// where: đuôi câu khi chưa chọn gen ("to spin", "below"…).
function emptyWheelText(noun, where = "to spin") {
  return custom.pool.length === 0
    ? `Select at least one generation${where ? ` ${where}` : ""}.`
    : `No ${noun} can go on the wheel with these generations. Select other generations.`;
}

// Câu báo khi nhóm đang chọn bị bỏ vì đổi gen. rare = bị bỏ vì chỉ còn Pokémon hiếm.
function lostGroupMessage(name, rare, again) {
  return rare
    ? `${name} only has rare Pokémon in these generations. Spin again.`
    : `${name} has no Pokémon in these generations. ${again}`;
}

// Nội dung hòm cho popup "View case contents" của chế độ bánh xe (xem contents() ở khung Custom).
// all: Pokémon của từng nhóm trong các gen đã chọn, trước khi lọc bánh xe; wheel: trạng thái bánh xe
// (pools, types, selected); order: mọi nhóm theo thứ tự ô; name(k), info(k): tên và dòng thêm của nhóm.
// Nhóm trên bánh xe dùng đúng danh sách wheel.pools mà nút Open quay.
// mode (tuỳ chọn): mã chế độ — nhóm trên bánh xe khi đó trả về hòm đã áp custom pool (wheelCase) trong list,
// và pool = kết quả wheelCase (null nếu nhóm không có trên bánh xe) để popup hiện và sửa custom pool.
function wheelContents(key, { all, wheel, order, name, info = () => "", mode = null }) {
  const { rareOnly } = wheelPools(all);
  const off = (k) => (wheel.pools[k] ? ""
    : rareOnly.includes(k) ? "only Red or Gold Pokémon in your selected generations, so every case would be a rare drop."
    : "no Pokémon in your selected generations.");
  const view = order.includes(key) ? key : wheel.selected || wheel.types[0] || order[0];
  const pool = mode && wheel.pools[view] ? wheelCase(mode, wheel, view) : null;
  return {
    key: view,
    current: wheel.selected,
    title: `${name(view)} case`,
    list: pool ? pool.list : wheel.pools[view] || all[view] || [],
    pool,
    off: off(view),
    info: info(view),
    options: order.map((k) => {
      const c = mode && wheel.pools[k] ? wheelCase(mode, wheel, k) : null;
      return { key: k, name: name(k), count: (all[k] || []).length, off: off(k), custom: c && c.custom ? c.picked : null };
    }),
  };
}

// Ô nằm dưới kim chỉ khi bánh xe đã xoay rotation độ (chiều kim đồng hồ).
// Bánh xe có n ô bằng nhau; ô i chiếm cung [i·a, (i+1)·a) tính từ kim chỉ, a = 360/n.
function wheelSliceAt(rotation, n) {
  const a = 360 / n;
  const angle = (((-rotation) % 360) + 360) % 360;
  return Math.min(Math.floor(angle / a), n - 1);
}

// Góc xoay cuối để kim chỉ dừng trên ô index: quay thêm turns vòng trọn từ góc hiện tại (current),
// lệch ngẫu nhiên khỏi tâm ô tối đa 40% bề rộng ô (giống dải thẻ) để không lúc nào cũng dừng đúng giữa.
function wheelTarget(current, index, n, offsetFrac = Math.random() * 2 - 1, turns = WHEEL_TURNS) {
  const a = 360 / n;
  const angle = (index + 0.5 + offsetFrac * 0.4) * a; // điểm trên bánh xe cần nằm dưới kim
  const delta = (((-angle - current) % 360) + 360) % 360;
  return current + turns * 360 + delta;
}

// Chữ trên ô màu: tối trên màu sáng, trắng trên màu tối.
function inkOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "#12151c" : "#fff";
}

// Vẽ các ô bánh xe vào disc. Bộ ô đổi (đổi gen làm thêm / bớt ô) thì bánh xe mới hiện ra mờ dần (CSS .is-redrawn).
function setWheelDisc(disc, types, svg) {
  const key = types.join();
  const changed = disc.dataset.slices !== undefined && disc.dataset.slices !== key;
  disc.innerHTML = svg;
  disc.dataset.slices = key;
  if (changed && disc.firstElementChild) disc.firstElementChild.classList.add("is-redrawn");
}

// Bánh xe SVG: một ô cho mỗi mục (keys), tên chạy dọc bán kính.
// color(key) / label(key): màu và chữ của ô — mặc định theo hệ (Type Roulette).
// upright (tuỳ chọn): nhãn một ký tự (Letter Roulette) — đứng thẳng gần vành, đỉnh chữ hướng ra ngoài.
function wheelSvg(types, { color = (t) => TYPE_COLORS[t] || "#777", label = typeName, upright = false } = {}) {
  const n = types.length, a = 360 / n, R = 97, r0 = 32;
  const pt = (deg, rad) => {
    const t = (deg - 90) * Math.PI / 180;
    return `${(rad * Math.cos(t)).toFixed(3)} ${(rad * Math.sin(t)).toFixed(3)}`;
  };
  const slices = types.map((t, i) => {
    const s = i * a, e = (i + 1) * a, mid = s + a / 2, large = a > 180 ? 1 : 0;
    const fill = color(t);
    const d = n === 1
      ? `M 0 ${-R} A ${R} ${R} 0 1 1 0 ${R} A ${R} ${R} 0 1 1 0 ${-R} Z M 0 ${-r0} A ${r0} ${r0} 0 1 0 0 ${r0} A ${r0} ${r0} 0 1 0 0 ${-r0} Z`
      : `M ${pt(s, r0)} L ${pt(s, R)} A ${R} ${R} 0 ${large} 1 ${pt(e, R)} L ${pt(e, r0)} A ${r0} ${r0} 0 ${large} 0 ${pt(s, r0)} Z`;
    // Chữ chạy dọc bán kính, mọi ô cùng chiều (từ tâm ra ngoài) vì bánh xe dừng ở góc bất kỳ
    return `
      <g class="wheel-slice" data-type="${t}" data-index="${i}">
        <path d="${d}" fill="${fill}" fill-rule="evenodd"/>
        <text transform="${upright ? `rotate(${mid}) translate(0 ${-(R - 16)})` : `rotate(${mid - 90}) translate(${(R + r0) / 2} 0)`}" fill="${inkOn(fill)}">${label(t)}</text>
      </g>`;
  }).join("");
  return `
    <svg viewBox="-100 -100 200 200" aria-hidden="true">
      <circle class="wheel-rim" r="99"/>
      ${slices}
    </svg>`;
}

