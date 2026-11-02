// Khung trang Custom: đăng ký chế độ, thanh chọn chế độ, nút hành động.
"use strict";

// =====================================================================
// TRANG CUSTOM: khung chung cho các chế độ quay vui
// =====================================================================

// Mỗi chế độ là một đối tượng, đăng ký bằng registerCustomMode({...}). Thêm chế độ mới chỉ cần
// đăng ký thêm một mục — thanh chọn chế độ, các nút hành động, phím tắt và panel "How it works" tự có.
//   key             mã chế độ (lưu trong localStorage và lịch sử quay)
//   name, desc      tên và mô tả một dòng trên thanh chọn chế độ
//   icon            SVG nhỏ cạnh tên
//   rules           các dòng trong panel "How it works"
//   mount(stage)    vẽ giao diện vào khung riêng của chế độ (chạy một lần)
//   actions         các nút hành động; mỗi nút có thêm nút ⚡ (quick: bỏ qua hiệu ứng)
//     key             mã nút
//     label()         chữ trên nút, vd. "Open Fire case"
//     icon            SVG nhỏ trước chữ                                          — tuỳ chọn
//     hotkey          phím tắt một chữ cái, vd. "W"                              — tuỳ chọn
//     hint()          lý do nút đang khóa, "" nếu bấm được                       — tuỳ chọn
//     run({ quick })  chạy hành động; trả về Promise xong khi chạy xong
//   defaultAction() mã nút mà phím Space bấm (mặc định: nút đầu tiên)            — tuỳ chọn
//   status()        dòng nhắc dưới các nút (mặc định: lý do khóa của nút Space)   — tuỳ chọn
//   onShow(), onPoolChanged() (custom.pool đã cập nhật), realign() (đổi cỡ cửa sổ) — tuỳ chọn
//   allGens         true: chế độ luôn dùng mọi Pokémon, không theo bảng chọn gen (bảng bị khóa khi ở chế độ này;
//                   onPoolChanged chỉ chạy một lần lúc dựng trang, không chạy khi đổi gen)                  — tuỳ chọn
//   contents(key)   nội dung hòm cho nút "View case contents" (có khai báo thì khung tự hiện nút) — tuỳ chọn
//                   key: nhóm muốn xem; bỏ trống = nhóm đang chọn (chưa chọn thì nhóm đầu tiên). Trả về
//                   { key, current, title, list, off, info, options }:
//                     key      nhóm đang xem          current  nhóm đang chọn trên bánh xe (null = chưa quay)
//                     title    vd. "Fire case"        list     Pokémon trong hòm (đúng nhóm nút Open quay)
//                     off      lý do nhóm không có trên bánh xe ("" nếu có)
//                     info     dòng thêm (HTML)       options  [{ key, name, count, off, custom }] các nhóm xem được
//                                                     (custom: số Pokémon trong custom pool, null = cả hòm)
//                     pool     (tuỳ chọn) kết quả wheelCase của nhóm đang xem — có thì popup hiện custom pool và
//                              nút "Edit pool" (sửa được khi nhóm đang xem là nhóm đang chọn)
//   onCustomPoolChanged() vẽ lại phần dùng hòm (panel tỉ lệ, dải thẻ) sau khi lưu custom pool       — tuỳ chọn
// Chế độ chỉ có một hành động có thể khai báo spin({ quick }) (kèm spinLabel, emptyHint) thay cho actions.
// Trong lúc chạy, hành động gọi setCustomSpinning(true, "Spinning…") và setCustomSpinning(false) khi xong.
const CUSTOM_MODES = [];

const custom = {
  gens: new Set(),  // gen đã chọn ở trang Custom
  pool: [],         // Pokémon thuộc các gen đó (đã gắn độ hiếm), dùng chung cho mọi chế độ
  active: null,     // chế độ đang chọn
  running: null,    // mã hành động đang chạy
  ready: false,     // true khi trang Custom đã dựng xong
};

const ICON_QUICK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>`;

function registerCustomMode(mode) {
  CUSTOM_MODES.push(mode);
  if (!custom.ready) return; // initCustom sẽ dựng các chế độ đăng ký trước đó
  mountCustomMode(mode);
  renderModeBar();
  if (!custom.active) selectCustomMode(mode.key, { save: false });
}

// Các nút hành động của chế độ (chế độ chỉ khai báo spin() thì có một nút "Spin").
function modeActions(mode) {
  if (!mode.actions) {
    mode.actions = [{
      key: "spin",
      label: () => mode.spinLabel || "Spin",
      hint: () => (mode.emptyHint ? mode.emptyHint() : ""),
      run: (opts) => mode.spin(opts),
    }];
  }
  return mode.actions;
}

function defaultActionKey(mode) {
  return mode.defaultAction ? mode.defaultAction() : modeActions(mode)[0].key;
}

const actionHint = (action) => (action && action.hint ? action.hint() : "");
const lowerFirst = (str) => str.charAt(0).toLowerCase() + str.slice(1);

function mountCustomMode(mode) {
  const panel = document.createElement("section");
  panel.className = "mode-panel";
  panel.id = `mode-${mode.key}`;
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-label", mode.name);
  panel.hidden = true;
  $("mode-stage").appendChild(panel);
  mode.root = panel;
  mode.mount(panel);
}

function renderModeBar() {
  $("mode-bar").innerHTML = CUSTOM_MODES.map((m) => `
    <button type="button" class="mode-btn" role="tab" data-mode="${m.key}" aria-controls="mode-${m.key}"
      aria-selected="${m === custom.active}">
      <span class="mode-icon" aria-hidden="true">${m.icon || ""}</span>
      <span class="mode-name">${m.name}</span>
      <span class="mode-desc">${m.desc}</span>
    </button>`).join("");
  renderCustomControls();
}

function selectCustomMode(key, { save = true } = {}) {
  const mode = CUSTOM_MODES.find((m) => m.key === key);
  if (!mode || state.spinning) return;
  custom.active = mode;
  for (const m of CUSTOM_MODES) m.root.hidden = m !== mode;
  for (const btn of $("mode-bar").querySelectorAll(".mode-btn")) {
    btn.setAttribute("aria-selected", String(btn.dataset.mode === key));
  }
  if (save) saveJson(STORAGE_KEY_CUSTOM_MODE, key);
  $("mode-rules-name").textContent = mode.name;
  $("mode-rule-list").innerHTML = (mode.rules || []).map((r) => `<li>${r}</li>`).join("");
  renderCustomActions();
  renderInPlayCount();
  if (state.view === "custom") showCustomMode();
}

// Thanh chọn chế độ cuộn ngang (điện thoại / nhiều chế độ): cuộn để nút đang chọn nằm trọn trong khung.
function revealActiveModeButton() {
  const bar = $("mode-bar");
  const btn = bar.querySelector('.mode-btn[aria-selected="true"]');
  if (!btn) return;
  const b = bar.getBoundingClientRect(), a = btn.getBoundingClientRect();
  if (a.left < b.left) bar.scrollLeft -= b.left - a.left;
  else if (a.right > b.right) bar.scrollLeft += a.right - b.right;
}

// Tab Custom hoặc chế độ vừa hiện ra.
function showCustomMode() {
  const mode = custom.active;
  if (!mode) return;
  revealActiveModeButton();
  if (mode.onShow) mode.onShow();
  if (mode.realign) mode.realign();
}

// Dựng các nút hành động của chế độ đang chọn: nút chính + nút ⚡ quick cho mỗi hành động.
function renderCustomActions() {
  const mode = custom.active;
  $("custom-actions").innerHTML = mode ? modeActions(mode).map((a) => `
    <div class="action-group" data-group="${a.key}">
      <button type="button" class="btn btn-spin action-main" data-action="${a.key}">${a.icon || ""}<span class="action-label"></span></button>
      <button type="button" class="btn btn-ghost action-quick" data-action="${a.key}" data-quick="1">${ICON_QUICK}</button>
    </div>`).join("") : "";
  renderCustomControls();
}

// Trạng thái các nút của trang Custom. Khóa quay dùng chung với trang Case (state.spinning).
// Nút mà phím Space bấm là nút nổi bật (xanh đặc), các nút khác viền xanh.
// label: chữ hiện trên nút đang chạy (vd. "Spinning…").
function renderCustomControls(label) {
  const mode = custom.active;
  const actions = mode ? modeActions(mode) : [];
  const def = mode ? defaultActionKey(mode) : null;
  for (const a of actions) {
    const group = $("custom-actions").querySelector(`[data-group="${a.key}"]`);
    if (!group) continue;
    const main = group.querySelector(".action-main");
    const quick = group.querySelector(".action-quick");
    const text = a.label();
    main.disabled = quick.disabled = state.spinning || Boolean(actionHint(a));
    main.classList.toggle("is-secondary", a.key !== def);
    if (!(state.spinning && custom.running === a.key)) main.querySelector(".action-label").textContent = text;
    else if (label) main.querySelector(".action-label").textContent = label;
    quick.title = `Quick: ${lowerFirst(text)} without the animation`;
    quick.setAttribute("aria-label", quick.title);
  }

  const defAction = actions.find((a) => a.key === def);
  const status = !mode ? "No modes available yet." : mode.status ? mode.status() : actionHint(defAction);
  $("custom-hint").textContent = state.spinning ? "" : status;
  // Ghi chú phím: nút Space đứng đầu, sau đó các nút có phím tắt riêng
  $("custom-kbd").innerHTML = [defAction, ...actions.filter((a) => a !== defAction)].filter(Boolean).map((a) => {
    const keys = [...(a.key === def ? ["Space"] : []), ...(a.hotkey ? [a.hotkey] : [])];
    return keys.length ? `${keys.map((k) => `<kbd>${k}</kbd>`).join(" ")} ${escHtml(lowerFirst(a.label()))}` : "";
  }).filter(Boolean).join(" · ");

  const allGens = Boolean(mode && mode.allGens);
  $("custom-contents").hidden = !(mode && mode.contents);
  $("custom-contents").disabled = state.spinning || (!allGens && custom.pool.length === 0);
  for (const b of $("mode-bar").querySelectorAll(".mode-btn")) b.disabled = state.spinning;
  // Đang quay: khóa bảng chọn gen của trang Custom, quay xong mới đổi được.
  // Chế độ allGens: khóa luôn (mờ đi, kèm dòng giải thích); lựa chọn gen đã lưu giữ nguyên.
  const locked = state.spinning || allGens;
  for (const input of $("custom-gen-grid").querySelectorAll("input")) input.disabled = locked;
  $("custom-all").disabled = locked;
  $("custom-none").disabled = locked;
  $("custom-gen-panel").classList.toggle("is-locked", allGens);
  $("custom-gen-lock").hidden = !allGens;
  $("custom-gen-lock").textContent = allGens ? `${mode.name} always uses every generation.` : "";
}

// Ô "N Pokémon in play": số Pokémon chế độ đang chọn dùng (chế độ allGens: mọi Pokémon).
function renderInPlayCount() {
  const mode = custom.active;
  countTo($("custom-pool-count"), mode && mode.allGens ? state.pokemon.length : custom.pool.length, fmtCount);
}

// Bắt đầu / kết thúc một hành động của chế độ Custom (khóa cả nút quay của trang Case).
function setCustomSpinning(on, label) {
  state.spinning = on;
  if (!on) custom.running = null;
  updateSpinButton();
  renderCustomControls(label);
}

function runCustomAction(key, { quick = false } = {}) {
  const mode = custom.active;
  const action = mode && modeActions(mode).find((a) => a.key === key);
  if (!action || state.spinning || actionHint(action)) return;
  custom.running = key;
  return action.run({ quick });
}

// Chạy hành động mà phím Space đang chỉ tới. Phím Space thật đi qua customActionButton;
// hàm này để gọi thẳng từ code (test dùng làm "Open again" cho chế độ thử).
function runCustomSpin(opts) {
  return custom.active ? runCustomAction(defaultActionKey(custom.active), opts) : undefined;
}

// Nút ứng với phím vừa bấm ở trang Custom: Space → nút nổi bật, chữ cái → nút có phím tắt đó.
function customActionButton(code) {
  const mode = custom.active;
  if (!mode) return null;
  const key = code === "Space"
    ? defaultActionKey(mode)
    : (modeActions(mode).find((a) => a.hotkey && `Key${a.hotkey.toUpperCase()}` === code) || {}).key;
  return key ? $("custom-actions").querySelector(`.action-main[data-action="${key}"]`) : null;
}

// Popup "View case contents" của chế độ đang chọn. key: nhóm muốn xem (đổi ở ô chọn trong popup).
// Chỉ để xem: không đổi nhóm đang chọn trên bánh xe. Đang sửa custom pool của nhóm này thì vẽ chế độ sửa.
function openCustomContents(key) {
  const mode = custom.active;
  if (!mode || !mode.contents) return;
  if (!$("contents-modal").open) stopPoolEdit(); // mở popup mới luôn ở chế độ xem (sự kiện close chạy sau)
  const c = mode.contents(key);
  const editing = poolEdit.mode === mode && poolEdit.key === c.key;
  const nameOf = (k) => c.options.find((o) => o.key === k).name;
  const options = c.options.map((o) => `
    <option value="${o.key}"${o.key === c.key ? " selected" : ""}>${escHtml(o.name)} · ${o.off ? "not on the wheel"
      : typeof o.custom === "number" ? `${o.custom}/${o.count} Pokémon · custom pool` : `${o.count} Pokémon`}${o.key === c.current ? " · your case" : ""}</option>`).join("");
  const line = (html, cls = "") => (html ? `<p class="contents-line${cls}">${html}</p>` : "");
  const note = `
    <div class="filters contents-pick">
      <select id="contents-pick" aria-label="Case to view"${editing ? " disabled" : ""}>${options}</select>
    </div>
    ${line(!c.current ? "Spin the wheel to pick a case."
      : c.current !== c.key ? `Preview only. Your case on the wheel stays ${escHtml(nameOf(c.current))}.` : "")}
    ${line(c.off && `<b>Not on the wheel</b>: ${c.off}`, " is-off")}
    ${editing ? poolEditorHtml(c) : poolLines(c, line)}
    ${line(c.info)}`;
  $("contents-modal").classList.toggle("is-editing-pool", editing);
  if (editing) {
    openContents({ groups: groupByRarity(poolEdit.full), title: c.title, note, owned: true, odds: true, pick: true });
    updatePoolEdit();
  } else {
    openContents({ groups: groupByRarity(c.list), title: c.title, note, owned: true, odds: true });
  }
}

