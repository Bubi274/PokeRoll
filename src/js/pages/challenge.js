// Tab Challenge, phần giao diện: 6 ô đội hình, chọn nguồn, dải quay, hộp thoại Legendary / Mythical, mã TW1, dán mã TWR1 / TW1.
// Dữ liệu và luật ở pages/challenge-team.js.
"use strict";

const CHALLENGE_MODE = "challenge"; // mã chế độ trong lịch sử quay (nhãn "Challenge")

const CHALLENGE_RULES_TEXT = [
  "Pick a source, then roll: each roll fills the next empty slot until you have 6 Pokémon. There is no way to remove one slot, only Start over for the whole team.",
  "Case, Type, Biome and Letter use the same tier odds as their modes, and the same pity counters. Custom pools are not used here.",
  "Type, Biome and Letter spin their wheel first, so you see the type, biome or letter you got, then open a case of it. The wheel holds the same groups as in Custom, each with the same chance. Quick skips both animations.",
  "Pity: when the next roll is guaranteed Purple or better or Gold, the wheel only stops on groups that have that tier (if any do), and the reel only shows that tier.",
  "Later evolutions of a rolled Pokémon are allowed in the game.",
  "Legendary and Mythical Pokémon ask first: keep it, or reroll that slot from the same source.",
  "Every roll is added to your collection and roll history, marked Challenge.",
  "When the team is complete you get a TW1 code. Paste it into Trainer's Workshop.",
  "After a loss, the game gives you a TWR1 reroll code. Paste it below, pick the slots to reroll (as many as the code allows) and roll them again from their own sources. You get a new TW1 code.",
  "Lost your team? Import its TW1 code to get it back.",
  "Old codes with a Minigame slot still work. Rerolling that slot rolls it from Case.",
];

const ICON_COPY = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="1.5"/><path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1"/></svg>`;

// ----- Đội hình -----

// Lớp màu của một ô: Minigame một màu trung tính, các nguồn khác theo bậc.
const slotTierClass = (e) => (e.source === "minigame" ? "r-minigame" : `r-${e.rarity}`);
const slotTierName = (e) => (e.source === "minigame" ? "Minigame" : rarityInfo(e.rarity).name);

// Một thẻ Pokémon trong ô. attrs: thuộc tính của nút (mở chi tiết, chọn reroll...); badge: nhãn nhỏ góc phải.
function slotCard(e, { attrs, badge = "", cls = "" }) {
  const p = challengePokemon(e);
  return `
    <button type="button" class="mini ch-card ${slotTierClass(e)}${cls}" ${attrs}>
      <span class="mini-top">
        <span class="mini-id">${dexLabel(p)}</span>
        ${badge ? `<span class="ch-badge">${badge}</span>` : `<span class="mini-tier">${slotTierName(e)}${e.shiny ? " ★" : ""}</span>`}
      </span>
      <img class="mini-img" src="${thumbUrl(p, e.shiny)}" alt="" loading="lazy">
      <span class="mini-name">${escHtml(p.name)}</span>
      <span class="ch-card-src">${escHtml(challengeSourceLabel(e.source, e.detail))}</span>
    </button>`;
}

function renderChallengeTeam() {
  const c = challenge, next = nextChallengeIndex(), r = c.reroll;
  const picking = r && !r.started;
  $("ch-team").innerHTML = c.team.map((e, i) => {
    const num = `<span class="ch-slot-num">${i + 1}</span>`;
    if (c.pending && c.pending.index === i) {
      return `<li class="ch-slot is-pending">${num}${slotCard(c.pending.entry, { attrs: `data-legend="1" title="Keep or reroll this Pokémon"`, badge: "Keep?" })}</li>`;
    }
    const changed = r && r.changes[i];
    const shown = changed || e;
    if (!shown) {
      const src = challengeSource(sourceForIndex(i));
      return `
        <li class="ch-slot is-empty${i === next ? " is-next" : ""}">${num}
          <span class="ch-empty">
            <span class="ch-empty-title">Slot ${i + 1}</span>
            <span class="ch-empty-sub">${i === next ? `Next roll · ${escHtml(src.name)}` : "Empty"}</span>
          </span>
        </li>`;
    }
    if (picking) {
      const on = r.picked.includes(i);
      return `<li class="ch-slot${on ? " is-picked" : ""}">${num}${slotCard(shown, {
        attrs: `data-pick="${i}" aria-pressed="${on}" title="${on ? "Don't reroll this slot" : "Reroll this slot"}"`, badge: on ? "Reroll" : "" })}</li>`;
    }
    const waiting = r && r.picked.includes(i) && !changed;
    const badge = changed ? "New" : waiting ? (i === next ? "Next" : "Reroll") : "";
    return `<li class="ch-slot${waiting ? " is-waiting" : ""}${changed ? " is-changed" : ""}">${num}${slotCard(shown, {
      attrs: `data-pokemon="${shown.id}"${shown.shiny ? ` data-shiny="1"` : ""}`, badge })}</li>`;
  }).join("");
  const filled = c.team.filter(Boolean).length;
  $("ch-team-count").textContent = c.code ? `Team ${c.data.id}` : `${filled}/${CHALLENGE_TEAM_SIZE}`;
}

// ----- Bánh xe (nguồn Roulette) -----
// Dùng chung bánh xe của trang Custom (wheelMarkup / drawWheel / spinWheelTo ở modes/wheel-spin.js). Màu, nhãn và kiểu chữ
// lấy từ bánh xe của chế độ tương ứng (TYPE_WHEEL...). Các ô là nhóm được lên bánh xe với gen của tab Challenge.
const CHALLENGE_WHEEL_PAUSE_MS = 450; // dừng một chút sau khi bánh xe dừng để kịp nhìn nhóm trúng, rồi dải mới chạy
const CH_WHEEL = {
  wheel: "ch-wheel", disc: "ch-disc", hub: "ch-hub",
  state: { types: [], rotation: 0 },
  text: { stopped: "Challenge wheel" },
  color: () => "#777", label: (k) => k, upright: false, noun: "group",
  drawn: null, // "<nguồn>|<các ô>" đang vẽ: chỉ vẽ lại khi đổi
  last: null,  // lượt quay gần nhất: { source, key, pitySpin } (để giữ chú thích của lượt đó)
};

// Nguồn của lượt quay kế tiếp (đang lập đội: nguồn đang chọn; reroll: nguồn của ô kế tiếp).
function challengeShownSource() {
  const c = challenge, i = nextChallengeIndex();
  if (i !== null) return sourceForIndex(i);
  return c.reroll && c.reroll.picked.length ? sourceForIndex(c.reroll.picked[0]) : c.source;
}

// Đặt bánh xe theo nguồn source: màu / nhãn của chế độ đó, các ô là keys. Bộ ô không đổi thì giữ nguyên (cả ô trúng).
function setChallengeWheel(source, keys) {
  const m = challengeSource(source).wheel();
  Object.assign(CH_WHEEL, { color: m.color, label: m.label, upright: Boolean(m.upright), noun: m.noun });
  $("ch-wheel").classList.toggle("is-letters", Boolean(m.upright));
  const drawn = `${source}|${keys.join()}`;
  if (CH_WHEEL.drawn === drawn) return;
  CH_WHEEL.drawn = drawn;
  CH_WHEEL.last = null;
  drawWheel(CH_WHEEL, keys);
}

// Dòng dưới bánh xe: số nhóm và cơ hội mỗi nhóm; lượt vừa quay bị pity giới hạn thì ghi rõ.
function challengeWheelCaption() {
  const n = CH_WHEEL.state.types.length, noun = CH_WHEEL.noun;
  const plural = (k) => `${k} ${noun}${k > 1 ? "s" : ""}`;
  const ps = CH_WHEEL.last && CH_WHEEL.last.pitySpin;
  return ps ? `Pity spin: only the ${plural(ps.n)} with ${PITY_KINDS[ps.due].label} could come up`
    : n ? `${plural(n)} on the wheel · each 1 in ${n}` : `No ${noun}s on the wheel`;
}

// Các nhóm trên bánh xe của nguồn với gen đang chọn. Nhớ theo nguồn + gen: hàm vẽ nút chạy rất thường xuyên.
let challengeKeysMemo = { at: null, keys: [] };
function challengeWheelKeys(source) {
  const at = `${source}|${[...challenge.gens].sort((a, b) => String(a).localeCompare(String(b))).join()}`;
  if (challengeKeysMemo.at !== at) challengeKeysMemo = { at, keys: challengeWheelGroups(source, challengePool()).keys };
  return challengeKeysMemo.keys;
}

// Hiện bánh xe khi nguồn kế tiếp là Roulette (Case: ẩn). Không vẽ lại trong lúc quay.
function renderChallengeWheel() {
  if (state.spinning) return;
  const source = challengeShownSource();
  const src = challengeSource(source);
  const keys = src && src.wheel ? challengeWheelKeys(source) : [];
  const on = Boolean(src && src.wheel) && keys.length > 0;
  $("ch-wheel-col").hidden = !on;
  $("ch-play").classList.toggle("has-wheel", on);
  if (!on) return;
  setChallengeWheel(source, keys);
  $("ch-wheel-caption").textContent = challengeWheelCaption();
}

// ----- Nguồn quay -----

function renderChallengeSources() {
  const locked = state.spinning || Boolean(challenge.reroll) || Boolean(challenge.code) || Boolean(challenge.pending);
  const shown = (() => { const i = nextChallengeIndex(); return i === null ? challenge.source : sourceForIndex(i); })();
  for (const btn of $("ch-sources").querySelectorAll(".ch-source")) {
    btn.setAttribute("aria-checked", String(btn.dataset.source === shown));
    btn.disabled = locked;
  }
}

function selectChallengeSource(key) {
  if (!challengeSource(key) || state.spinning || challenge.reroll || challenge.code) return;
  challenge.source = key;
  saveChallenge();
  renderChallenge();
}

// ----- Nút và dòng nhắc -----

// Lý do nút Roll đang khóa ("" = bấm được).
function challengeRollHint() {
  const c = challenge, i = nextChallengeIndex();
  if (c.pending) return `Keep or reroll ${challengePokemon(c.pending.entry).name} first.`;
  if (c.reroll && !c.reroll.started && !c.reroll.picked.length) {
    return `Pick up to ${c.reroll.allow} slot${c.reroll.allow > 1 ? "s" : ""} to reroll.`;
  }
  if (i === null) return c.code ? "Team complete. Copy the code below into Trainer's Workshop." : "";
  return challengeSourceProblem(sourceForIndex(i));
}

function challengeRollLabel() {
  const c = challenge, i = nextChallengeIndex();
  if (c.reroll && !c.reroll.started) {
    const n = c.reroll.picked.length;
    return n ? `Reroll ${n} slot${n > 1 ? "s" : ""}` : "Pick slots to reroll";
  }
  if (i === null) return c.code ? "Team complete" : "Roll";
  const src = challengeSource(sourceForIndex(i)).name;
  return `${c.reroll ? "Reroll" : "Roll"} slot ${i + 1} · ${src}`;
}

// Trạng thái các nút của tab Challenge. Khóa quay dùng chung với trang Case và Custom (state.spinning).
function renderChallengeControls(label) {
  if (!challenge.ready) return;
  const hint = challengeRollHint();
  const btn = $("ch-roll");
  btn.disabled = $("ch-quick").disabled = state.spinning || Boolean(hint) || (nextChallengeIndex() === null && !(challenge.reroll && challenge.reroll.picked.length));
  if (!state.spinning || label) btn.querySelector(".action-label").textContent = label || challengeRollLabel();
  $("ch-quick").title = "Quick: roll without the animation";
  $("ch-quick").setAttribute("aria-label", $("ch-quick").title);
  $("ch-hint").textContent = state.spinning ? "" : hint;
  // Đang quay: lượt quay đã ghi xong (pity, ô, reroll) nhưng chưa được lộ ra. Chỉ khóa nút; phần còn lại vẽ khi dải dừng.
  if (state.spinning) {
    for (const b of $("ch-sources").querySelectorAll(".ch-source")) b.disabled = true;
    for (const input of $("ch-gen-grid").querySelectorAll("input")) input.disabled = true;
    $("ch-all").disabled = $("ch-none").disabled = true;
    return;
  }
  $("ch-start-over").disabled = state.spinning || (!challenge.team.some(Boolean) && !challenge.pending);
  for (const id of ["ch-import", "ch-use-reroll"]) $(id).disabled = state.spinning;
  const r = challenge.reroll;
  $("ch-reroll-bar").hidden = !r;
  if (r) {
    $("ch-reroll-text").textContent = r.started
      ? `Rerolling ${r.picked.map((i) => `slot ${i + 1}`).join(", ")} from ${r.picked.length > 1 ? "their own sources" : "its own source"}.`
      : `Reroll code accepted for team ${challenge.data.id}. Click up to ${r.allow} slot${r.allow > 1 ? "s" : ""} above to reroll (${r.picked.length}/${r.allow} picked).`;
    $("ch-reroll-cancel").hidden = r.started;
  }
  for (const input of $("ch-gen-grid").querySelectorAll("input")) input.disabled = false;
  $("ch-all").disabled = $("ch-none").disabled = false;
  renderChallengeSources();
  renderChallengeWheel();
  // Thanh pity của nguồn sẽ quay ở lượt tới; đội đã xong (không còn gì để quay) thì ẩn
  const i = nextChallengeIndex();
  const done = i === null && !(challenge.reroll && challenge.reroll.picked.length);
  renderPityMeter($("ch-pity"), done ? null : challengeSource(i === null ? sourceForIndex(challenge.reroll.picked[0]) : sourceForIndex(i)).pity);
}

// ----- Mã -----

function renderChallengeCode() {
  const c = challenge;
  $("ch-code-box").hidden = !c.code;
  $("ch-code-empty").hidden = Boolean(c.code);
  if (!c.code) {
    const left = c.team.filter((e) => !e).length;
    $("ch-code-empty").textContent = `Roll ${left} more Pokémon to get your code.`;
    return;
  }
  $("ch-code").value = c.code;
  const d = c.data;
  const when = new Date(d.ts * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  $("ch-code-meta").textContent = `Team ${d.id} · ${when}`
    + (d.parent ? ` · rerolled from ${d.parent} (slot${d.rerolled.length > 1 ? "s" : ""} ${d.rerolled.map((i) => i + 1).join(", ")})` : "");
}

// Dòng báo dưới ô dán mã. kind: "error" | "ok" | "" (xoá).
function challengeMessage(text, kind = "") {
  const el = $("ch-msg");
  el.textContent = text;
  el.className = `ch-msg${kind ? ` is-${kind}` : ""}`;
}

function renderChallenge() {
  if (!challenge.ready) return;
  renderChallengeTeam();
  renderChallengeCode();
  renderChallengeControls();
}

// ----- Quay -----

function setChallengeSpinning(on, label) {
  state.spinning = on;
  updateSpinButton(); // khóa luôn nút trang Case, Custom và vẽ lại nút Challenge
  renderCustomControls();
  renderChallengeControls(label);
}

// Đặt mục vào ô index: lập đội thì vào đội (đủ 6 ô → mã TW1), reroll thì vào danh sách đổi (xong hết → mã TW1 mới).
function placeChallengeEntry(index, entry) {
  const c = challenge;
  if (c.reroll) {
    c.reroll.changes[index] = entry;
    if (c.reroll.picked.every((i) => i in c.reroll.changes)) finishReroll();
  } else {
    c.team[index] = entry;
    if (!c.team.includes(null)) completeChallenge();
  }
}

// Một lượt quay của tab Challenge cho ô tiếp theo. Ghi ngay (bộ sưu tập, lịch sử, pity, đội) trước khi dải chạy,
// để tải lại trang giữa chừng không quay lại được.
async function runChallengeRoll({ quick = false } = {}) {
  const index = nextChallengeIndex();
  if (index === null || state.spinning || challengeRollHint()) return;
  const source = sourceForIndex(index);
  const src = challengeSource(source);
  const pool = challengePool();
  // Bộ đếm trước lượt quay: lượt pity thì bánh xe chỉ bốc nhóm có bậc bảo đảm
  const box = challengeCase(source, pool, Math.random, state.pity[src.pity]);
  if (!box) return;
  if (challenge.reroll && !challenge.reroll.started) {
    challenge.reroll.started = true;
    // Mã reroll của đội này đã được dùng: không dùng lại được, kể cả khi Start over rồi nhập lại mã TW1 cũ
    if (!challenge.used.includes(challenge.data.id)) challenge.used.push(challenge.data.id);
  }

  const result = rollModePity(src.pity, box.groups);
  const p = result.pokemon;
  const isNew = !state.collection[p.id];
  const record = recordDrop(state.collection, state.history, result);
  Object.assign(state.history[0], { mode: CHALLENGE_MODE, detail: box.detail ? `${source}:${box.detail}` : source });
  tagPityDrop(result);
  saveProgress();

  const entry = { id: p.id, rarity: result.rarity, shiny: result.shiny, source, detail: box.detail, pity: result.pity };
  const legendary = Boolean(p.isLegendary || p.isMythical);
  if (legendary) challenge.pending = { index, entry };
  else placeChallengeEntry(index, entry);
  saveChallenge();

  // Roulette: quay bánh xe ra nhóm trước (hiện rõ nhóm trúng), rồi mới tới dải thẻ của hòm nhóm đó
  if (box.detail) {
    setChallengeWheel(source, box.keys);
    $("ch-wheel-col").hidden = false;
    $("ch-play").classList.add("has-wheel");
    CH_WHEEL.last = null;
    $("ch-wheel-caption").textContent = challengeWheelCaption();
    setChallengeSpinning(true, quick ? undefined : "Spinning…");
    if (!quick) audio();
    const done = spinWheelTo(CH_WHEEL, box.detail, { quick });
    if (done) {
      await done;
      playReveal("blue", false);
      await new Promise((r) => setTimeout(r, CHALLENGE_WHEEL_PAUSE_MS));
    }
    CH_WHEEL.last = { source, key: box.detail, pitySpin: box.pitySpin };
    $("ch-wheel-caption").textContent = challengeWheelCaption();
  }
  await runCustomReel($("ch-reel"), buildReelItems(result, box.groups), {
    quick, setSpinning: setChallengeSpinning, urlsOf: (it) => [imageUrl(it.pokemon, it.shiny)],
  });
  renderRecent();
  renderPityMeters();
  updateCollectionTab();
  if (state.view === "collection") renderCollection();
  renderChallenge();
  if (legendary) openChallengeLegend({ quick });
  else showChallengeResult(result, { index, source, box, isNew, count: record.count });
}

// Popup kết quả: như các chế độ khác, thêm dòng "Challenge · slot 3/6 · Type Roulette · Fire" (lượt bánh xe bị pity giới hạn
// thì ghi thêm).
function showChallengeResult(result, { index, source, box, isNew, count }) {
  const done = Boolean(challenge.code) && nextChallengeIndex() === null;
  const ps = box.pitySpin;
  const pityNote = ps ? ` Pity spin: only the ${ps.n} ${CH_WHEEL.noun}${ps.n > 1 ? "s" : ""} with ${PITY_KINDS[ps.due].label} could come up.` : "";
  showResultModal(result, {
    isNew, count, groups: box.groups,
    again: () => runChallengeRoll(),
    canAgain: nextChallengeIndex() !== null && !challengeRollHint(),
    extra: `
      <div class="result-note mode-note" style="--t:var(--amber)">
        Challenge · slot ${index + 1}/${CHALLENGE_TEAM_SIZE} · <b>${escHtml(challengeSourceLabel(source, box.detail))}</b>.${pityNote}
        ${done ? "Your team is complete: copy its code on the Challenge tab." : ""}
      </div>`,
  });
}

// ----- Legendary / Mythical: Keep hoặc Reroll -----

let legendQuick = false;

function openChallengeLegend({ quick = legendQuick } = {}) {
  const pend = challenge.pending;
  if (!pend) return;
  legendQuick = quick;
  const e = pend.entry, p = challengePokemon(e), src = challengeSource(e.source);
  const from = challengeSourceLabel(e.source, e.detail);
  const kind = p.isMythical ? "Mythical" : "Legendary";
  $("ch-legend-title").textContent = `${kind} Pokémon`;
  $("ch-legend-body").innerHTML = `
    <div class="ch-legend-head ${slotTierClass(e)}">
      <img class="ch-legend-img" alt="${escHtml(p.name)}">
      <div class="ch-legend-info">
        <div class="ch-legend-name">${escHtml(p.name)}${e.shiny ? ` <span class="shiny-tag">★ Shiny</span>` : ""}</div>
        <div class="type-chips">${typeChips(p.types)}</div>
        <p class="ch-legend-text">You rolled a ${kind} Pokémon for slot ${pend.index + 1} (${escHtml(from)}). Keep it, or reroll this slot from the same source (${escHtml(src.name)}).</p>
      </div>
    </div>
    ${findSection(p)}`;
  setPokemonImage($("ch-legend-body").querySelector("img"), p, e.shiny);
  $("ch-legend-keep").textContent = `Keep ${p.name}`;
  $("ch-legend-reroll").textContent = `Reroll (${src.name})`;
  if (!$("ch-legend-modal").open) $("ch-legend-modal").showModal();
  $("ch-legend-body").scrollTop = 0;
  playReveal(e.rarity, e.shiny);
}

function keepChallengeLegend() {
  const pend = challenge.pending;
  if (!pend) return;
  challenge.pending = null;
  placeChallengeEntry(pend.index, pend.entry);
  saveChallenge();
  $("ch-legend-modal").close();
  renderChallenge();
}

function rerollChallengeLegend() {
  if (!challenge.pending) return;
  challenge.pending = null;
  saveChallenge();
  $("ch-legend-modal").close();
  renderChallenge();
  runChallengeRoll({ quick: legendQuick });
}

// ----- Dán mã, reroll, nhập mã, làm lại -----

function useRerollCode() {
  if (state.spinning) return;
  if (challenge.reroll && challenge.reroll.started) {
    return challengeMessage("Finish the reroll you started first.", "error");
  }
  try {
    const allow = checkRerollCode($("ch-paste").value);
    challenge.reroll = { allow, picked: [], started: false, changes: {} };
    saveChallenge();
    $("ch-paste").value = "";
    challengeMessage(`Reroll code accepted: pick up to ${allow} slot${allow > 1 ? "s" : ""} to reroll.`, "ok");
  } catch (e) {
    challengeMessage(e.message, "error");
  }
  renderChallenge();
}

function toggleRerollPick(index) {
  const r = challenge.reroll;
  if (!r || r.started || state.spinning) return;
  if (r.picked.includes(index)) r.picked = r.picked.filter((i) => i !== index);
  else if (r.picked.length < r.allow) r.picked = [...r.picked, index].sort((a, b) => a - b);
  else if (r.allow === 1) r.picked = [index]; // chỉ được một ô: bấm ô khác thì đổi sang ô đó
  saveChallenge();
  renderChallenge();
}

function cancelReroll() {
  if (!challenge.reroll || challenge.reroll.started) return;
  challenge.reroll = null;
  saveChallenge();
  challengeMessage("");
  renderChallenge();
}

function importChallenge() {
  if (state.spinning) return;
  let imported;
  try {
    imported = importChallengeCode($("ch-paste").value);
  } catch (e) {
    challengeMessage(e.message, "error");
    return;
  }
  const has = challenge.team.some(Boolean) || challenge.pending;
  if (has && imported.code !== challenge.code
    && !confirm(`Replace your current team with team ${imported.data.id} from this code?`)) return;
  challenge.team = imported.team;
  challenge.code = imported.code;
  challenge.data = imported.data;
  challenge.pending = null;
  challenge.reroll = null;
  saveChallenge();
  $("ch-paste").value = "";
  challengeMessage(`Team ${imported.data.id} imported.`, "ok");
  renderChallenge();
}

function startChallengeOver() {
  if (state.spinning) return;
  if (!confirm("Start over? Your current team and its code are cleared. Pokémon you rolled stay in your collection.")) return;
  resetChallenge();
  challengeMessage("");
  renderChallenge();
}

async function copyChallengeCode() {
  const area = $("ch-code");
  let ok = false;
  try {
    await navigator.clipboard.writeText(area.value);
    ok = true;
  } catch (e) {
    area.select(); // không có quyền clipboard: chọn sẵn để người dùng tự copy
    ok = document.execCommand && document.execCommand("copy");
  }
  challengeMessage(ok ? "Code copied. Paste it into Trainer's Workshop." : "Select the code and copy it (Ctrl+C).", ok ? "ok" : "");
}

// ----- Dải thẻ lúc chưa quay, gen -----

function renderChallengeIdleReel() {
  const reel = $("ch-reel");
  renderIdleReel(groupByRarity(challengePool()), reel);
}

function onChallengeGensChanged() {
  saveSelectedGens(challenge.gens, STORAGE_KEY_CHALLENGE_GENS);
  renderChallengeIdleReel();
  renderChallenge();
}

// ----- Khởi tạo -----

function initChallenge() {
  challenge.gens = loadSelectedGens(STORAGE_KEY_CHALLENGE_GENS);
  loadChallenge();
  const grid = $("ch-gen-grid");
  buildGenGrid({ grid, selected: challenge.gens, onChange: onChallengeGensChanged });
  $("ch-all").addEventListener("click", () => {
    for (const key of allSourceKeys()) challenge.gens.add(key);
    syncCheckboxes(grid, challenge.gens);
    onChallengeGensChanged();
  });
  $("ch-none").addEventListener("click", () => {
    challenge.gens.clear();
    syncCheckboxes(grid, challenge.gens);
    onChallengeGensChanged();
  });

  $("ch-sources").innerHTML = CHALLENGE_SOURCES.map((s) => `
    <button type="button" class="ch-source" role="radio" data-source="${s.key}" aria-checked="false">
      <span class="ch-source-name">${escHtml(s.name)}</span>
      <span class="ch-source-desc">${escHtml(s.desc)}</span>
    </button>`).join("");
  $("ch-sources").addEventListener("click", (e) => {
    const btn = e.target.closest(".ch-source");
    if (btn && !btn.disabled) selectChallengeSource(btn.dataset.source);
  });
  $("ch-rule-list").innerHTML = CHALLENGE_RULES_TEXT.map((r) => `<li>${escHtml(r)}</li>`).join("");
  $("ch-quick").innerHTML = ICON_QUICK;
  $("ch-wheel-col").insertAdjacentHTML("afterbegin", wheelMarkup(CH_WHEEL));
  $("ch-copy").insertAdjacentHTML("afterbegin", ICON_COPY);

  $("ch-roll").addEventListener("click", () => runChallengeRoll());
  $("ch-quick").addEventListener("click", () => runChallengeRoll({ quick: true }));
  $("ch-team").addEventListener("click", (e) => {
    const pick = e.target.closest("[data-pick]");
    if (pick) toggleRerollPick(Number(pick.dataset.pick));
    if (e.target.closest("[data-legend]")) openChallengeLegend();
  });
  $("ch-legend-keep").addEventListener("click", keepChallengeLegend);
  $("ch-legend-reroll").addEventListener("click", rerollChallengeLegend);
  $("ch-use-reroll").addEventListener("click", useRerollCode);
  $("ch-import").addEventListener("click", importChallenge);
  $("ch-reroll-cancel").addEventListener("click", cancelReroll);
  $("ch-start-over").addEventListener("click", startChallengeOver);
  $("ch-copy").addEventListener("click", copyChallengeCode);
  $("ch-code").addEventListener("focus", () => $("ch-code").select());

  challenge.ready = true;
  renderChallengeIdleReel();
  renderChallenge();
}

// Tab Challenge vừa hiện ra: căn lại dải thẻ; Legendary còn chờ (vd. sau khi tải lại trang) thì hỏi lại.
function showChallengeView() {
  realignReel($("ch-reel"));
  renderChallengeWheel();
  renderChallenge();
  if (challenge.pending && !state.spinning && !document.querySelector("dialog[open]")) openChallengeLegend();
}

// "Clear data" ở trang Collection: bỏ đội, mã, reroll và danh sách đội đã reroll của tab Challenge.
function clearChallengeProgress() {
  challenge.used = [];
  resetChallenge();
  if (challenge.ready) {
    challengeMessage("");
    renderChallenge();
  }
}
