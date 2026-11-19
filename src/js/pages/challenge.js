// Tab Challenge, phần giao diện: 6 ô đội hình, chọn nguồn, dải quay, hộp thoại Legendary / Mythical, mã TW1, dán mã TWR1 / TW1.
// Dữ liệu và luật ở pages/challenge-team.js.
"use strict";

const CHALLENGE_MODE = "challenge"; // mã chế độ trong lịch sử quay (nhãn "Challenge")

const CHALLENGE_RULES_TEXT = [
  "Pick a source, then roll: each roll fills the next empty slot until you have 6 Pokémon. There is no way to remove one slot, only Start over for the whole team.",
  "Case, Type, Biome and Letter use the same tier odds as their modes, and the same pity counters. Type, Biome and Letter pick a random group from the ones that can go on their wheel. Custom pools are not used here.",
  "Minigame Pokémon Case gives every Pokémon the same chance, with no tiers and no Shiny. Only that exact Pokémon is allowed in the game; from the other sources, its later evolutions are allowed too.",
  "Legendary and Mythical Pokémon ask first: keep it, or reroll that slot from the same source.",
  "Every roll is added to your collection and roll history, marked Challenge.",
  "When the team is complete you get a TW1 code. Paste it into Trainer's Workshop.",
  "After a loss, the game gives you a TWR1 reroll code. Paste it below, pick the slots to reroll (as many as the code allows) and roll them again from their own sources. You get a new TW1 code.",
  "Lost your team? Import its TW1 code to get it back.",
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
  const pool = challengePool();
  const box = challengeCase(source, pool);
  if (!box) return;
  if (challenge.reroll && !challenge.reroll.started) {
    challenge.reroll.started = true;
    // Mã reroll của đội này đã được dùng: không dùng lại được, kể cả khi Start over rồi nhập lại mã TW1 cũ
    if (!challenge.used.includes(challenge.data.id)) challenge.used.push(challenge.data.id);
  }

  let result;
  if (source === "minigame") {
    const p = pickUniform(pool);
    result = { pokemon: p, rarity: p.rarity, shiny: false, downgraded: false, pity: null, pityFallback: false };
  } else {
    result = rollModePity(challengeSource(source).pity, box.groups);
  }
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

  const mg = minigameCase("pokemon");
  const items = source === "minigame" ? reelItemsOf(mg, buildUniformReel(p, pool)) : buildReelItems(result, box.groups);
  await runCustomReel($("ch-reel"), items, {
    quick, setSpinning: setChallengeSpinning,
    urlsOf: source === "minigame" ? (it) => mg.images(it.item) : (it) => [imageUrl(it.pokemon, it.shiny)],
  });
  renderRecent();
  renderPityMeters();
  updateCollectionTab();
  if (state.view === "collection") renderCollection();
  renderChallenge();
  if (legendary) openChallengeLegend({ quick });
  else showChallengeResult(result, { index, source, box, pool, isNew, count: record.count });
}

// Popup kết quả: như các chế độ khác, thêm dòng "Challenge · slot 3/6". Minigame: "1 in N" đều, không có bậc.
function showChallengeResult(result, { index, source, box, pool, isNew, count }) {
  const src = challengeSource(source);
  const done = Boolean(challenge.code) && nextChallengeIndex() === null;
  const n = pool.length;
  const odds = source === "minigame" ? `
    <div class="odds">
      <span class="odds-label">Odds of pulling ${escHtml(result.pokemon.name)}</span>
      <span class="odds-value">1 in ${n.toLocaleString("en-US")}</span>
      <span class="odds-note">
        <span>1 of ${n.toLocaleString("en-US")} Pokémon in your generations, each with the same chance</span>
        <span>No rarity tiers · no Shiny · only this exact Pokémon is allowed</span>
      </span>
    </div>` : null;
  const detail = challengeDetailName(source, box.detail);
  showResultModal(result, {
    isNew, count, groups: box.groups, odds,
    again: () => runChallengeRoll(),
    canAgain: nextChallengeIndex() !== null && !challengeRollHint(),
    extra: `
      <div class="result-note mode-note" style="--t:var(--amber)">
        Challenge · slot ${index + 1}/${CHALLENGE_TEAM_SIZE} · <b>${escHtml(src.name)}${detail ? ` · ${escHtml(detail)}` : ""}</b>.
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
  const kind = p.isMythical ? "Mythical" : "Legendary";
  $("ch-legend-title").textContent = `${kind} Pokémon`;
  $("ch-legend-body").innerHTML = `
    <div class="ch-legend-head ${slotTierClass(e)}">
      <img class="ch-legend-img" alt="${escHtml(p.name)}">
      <div class="ch-legend-info">
        <div class="ch-legend-name">${escHtml(p.name)}${e.shiny ? ` <span class="shiny-tag">★ Shiny</span>` : ""}</div>
        <div class="type-chips">${typeChips(p.types)}</div>
        <p class="ch-legend-text">You rolled a ${kind} Pokémon for slot ${pend.index + 1}. Keep it, or reroll this slot from the same source (${escHtml(src.name)}).</p>
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
