// Tab Challenge, phần dữ liệu: nguồn quay, đội 6 ô, lưu / đọc lại, hòm của mỗi nguồn, dựng mã TW1, nhập mã TW1, reroll bằng mã TWR1.
// Giao diện ở pages/challenge.js. Định dạng mã ở core/challenge-code.js và docs/challenge-code.md.
"use strict";

const STORAGE_KEY_CHALLENGE = "pokeroll.challenge";           // { source, team, pending, code, reroll, groups }
const STORAGE_KEY_CHALLENGE_GENS = "pokeroll.challenge.gens"; // gen đã chọn ở tab Challenge (riêng với Case và Custom)
const STORAGE_KEY_CHALLENGE_USED = "pokeroll.challenge.used"; // id các đội đã dùng mã reroll (Start over / Import không xoá)

// Nguồn quay của một ô (các nút chọn nguồn). key: "mode" ghi trong mã TW1; pity: mã chế độ có bộ đếm pity dùng chung;
// wheel: nguồn Roulette quay bánh xe của chế độ đó trước (TYPE_WHEEL... ở modes/, chỉ lấy màu, nhãn, kiểu chữ).
const CHALLENGE_SOURCES = [
  { key: "case", name: "Case", desc: "Same tier odds as the Case page", pity: "case" },
  { key: "type", name: "Type Roulette", desc: "Spin the type wheel, then open a case of that type", pity: "type-roulette", wheel: () => TYPE_WHEEL },
  { key: "biome", name: "Biome Roulette", desc: "Spin the Cobbleverse biome wheel, then open a case of Pokémon that spawn there", pity: "biome-roulette", wheel: () => BIOME_WHEEL },
  { key: "letter", name: "Letter Roulette", desc: "Spin the letter wheel, then open a case of Pokémon whose name starts with it", pity: "letter-roulette", wheel: () => LETTER_WHEEL },
];

// Nguồn cũ không còn chọn được nhưng vẫn đọc được từ mã TW1 / dữ liệu đã lưu. rerollAs: nguồn dùng khi reroll ô đó.
// "minigame" (Minigame Pokémon Case, rule "exact"): mã cũ vẫn hợp lệ, reroll ô đó thì quay bằng Case.
const LEGACY_CHALLENGE_SOURCES = [
  { key: "minigame", name: "Minigame Pokémon Case", pity: null, rerollAs: "case" },
];

// Nguồn quay được (nút chọn nguồn, lượt quay). Nguồn cũ → undefined.
const challengeSource = (key) => CHALLENGE_SOURCES.find((s) => s.key === key);
// Mọi nguồn đọc được (kể cả nguồn cũ): để hiện và kiểm tra các ô đã có.
const knownChallengeSource = (key) => challengeSource(key) || LEGACY_CHALLENGE_SOURCES.find((s) => s.key === key);

const challenge = {
  gens: new Set(),   // gen đã chọn ở tab Challenge
  source: "case",    // nguồn đang chọn cho ô kế tiếp
  team: Array(CHALLENGE_TEAM_SIZE).fill(null), // mỗi ô: { id, rarity, shiny, source, detail, pity } (id: id Pokémon trong app)
  pending: null,     // Legendary / Mythical chờ "Keep" hoặc "Reroll": { index, entry }
  code: null,        // mã TW1 của đội đã đủ 6 ô (đội đang dùng)
  data: null,        // Challenge đọc từ code
  reroll: null,      // reroll đang làm: { allow, picked: [ô], started, changes: { [ô]: mục mới } }
  groups: { type: null, biome: null, letter: null }, // nhóm đang giữ của từng nguồn Roulette: { key, pitySpin } (như trang Custom:
                                                     // giữ tới lần quay bánh xe sau, mở hòm bao nhiêu lần cũng được)
  running: null,     // nút đang chạy: "spin" (bánh xe) | "open" (hòm) | null
  used: [],          // id các đội đã bắt đầu reroll: mã reroll của các đội này không dùng lại được (kể cả sau khi nhập lại mã TW1 cũ)
  ready: false,      // true khi tab Challenge đã dựng xong
};

// ----- Ô đội hình -----

const challengePokemon = (entry) => (entry ? state.byId.get(entry.id) : undefined);

// Ô trong mã TW1 của một mục đội hình.
function challengeSlotOf(entry) {
  return challengeSlot(challengePokemon(entry), { rarity: entry.rarity, shiny: entry.shiny, mode: entry.source });
}

// Mục đội hình từ một ô của mã TW1 (nhập mã). Pokémon tìm theo special (nếu có) hoặc dex, không theo tên.
// Không tìm thấy (vd. mã từ bản app mới hơn) → null.
function entryFromSlot(slot, byId = state.byId) {
  const p = slot.special ? byId.get(slot.special) : byId.get(slot.dex);
  if (!p || (slot.special ? p.baseId !== slot.dex : isSpecial(p))) return null;
  return {
    id: p.id,
    rarity: slot.tier === "minigame" ? p.rarity : slot.tier,
    shiny: slot.shiny,
    source: slot.mode,
    detail: null,
    pity: null,
  };
}

// Tên nhóm của lượt quay Roulette: "Fire", "Forest", "A".
function challengeDetailName(source, detail) {
  if (!detail) return "";
  if (source === "type") return TYPE_ORDER.includes(detail) ? typeName(detail) : "";
  if (source === "biome") return biomeInfo(detail) ? biomeInfo(detail).name : "";
  if (source === "letter") return LETTERS.includes(detail) ? detail : "";
  return "";
}

// Nhãn nguồn của một ô (ô đội hình, popup, hộp Legendary): "Case", "Type Roulette · Fire", "Biome Roulette · Forest",
// "Letter Roulette · S", "Minigame" (ô minigame của mã cũ).
function challengeSourceLabel(source, detail) {
  const base = { case: "Case", type: "Type Roulette", biome: "Biome Roulette", letter: "Letter Roulette", minigame: "Minigame" }[source] || "?";
  const name = challengeDetailName(source, detail);
  return name ? `${base} · ${name}` : base;
}

// ----- Hòm của mỗi nguồn -----

// Pokémon theo gen của tab Challenge (mọi nguồn đều theo bảng này).
const challengePool = () => filterByGens(state.pokemon, challenge.gens);

// Các nhóm trên bánh xe của nguồn Roulette source với pool: { keys, all } (all: Pokémon của từng nhóm).
function challengeWheelGroups(source, pool) {
  const all = source === "type" ? typePools(pool) : source === "biome" ? biomePools(pool) : letterPools(pool);
  return { keys: Object.keys(wheelPools(all).pools), all };
}

// Bước 1 của nguồn Roulette: quay bánh xe ra một nhóm. Trả về { key, keys, pitySpin } hoặc null nếu bánh xe trống.
// keys = mọi nhóm trên bánh xe. counter (bộ đếm pity của nguồn, tuỳ chọn): lượt mở tới là pity thì chỉ bốc nhóm có bậc
// bảo đảm (pityWheelKeys); pitySpin = { due, n } khi bánh xe bị giới hạn như vậy, không thì null.
function pickChallengeGroup(source, pool, rng = Math.random, counter = null) {
  const { keys, all } = challengeWheelGroups(source, pool);
  if (!keys.length) return null;
  const pity = counter ? pityWheelKeys(keys, (k) => groupByRarity(all[k]), counter) : { keys, limited: false };
  return { key: pickRandom(pity.keys, rng()), keys, pitySpin: pity.limited ? { due: pity.due, n: pity.keys.length } : null };
}

// Bước 2 của nguồn Roulette: hòm của nhóm key đã trúng. { groups, detail, list } hoặc null nếu nhóm không còn trên bánh xe.
function challengeGroupCase(source, pool, key) {
  const { keys, all } = challengeWheelGroups(source, pool);
  return keys.includes(key) ? { groups: groupByRarity(all[key]), detail: key, list: all[key] } : null;
}

// Hòm của nguồn source trong pool (quay bánh xe và lấy hòm luôn một lần): { groups, detail, list, keys, pitySpin } hoặc null.
// Roulette: bốc đều một nhóm trong các nhóm được lên bánh xe (cùng luật với chế độ thật, wheelPools), không dùng custom pool;
// keys = mọi nhóm trên bánh xe. counter (bộ đếm pity của nguồn, tuỳ chọn): lượt tới là pity thì chỉ bốc nhóm có bậc bảo đảm
// (pityWheelKeys); pitySpin = { due, n } khi bánh xe bị giới hạn như vậy, không thì null.
function challengeCase(source, pool, rng = Math.random, counter = null) {
  if (source === "case") return pool.length ? { groups: groupByRarity(pool), detail: null, list: pool, keys: [], pitySpin: null } : null;
  const pick = pickChallengeGroup(source, pool, rng, counter);
  if (!pick) return null;
  return { ...challengeGroupCase(source, pool, pick.key), keys: pick.keys, pitySpin: pick.pitySpin };
}

// Lý do nguồn không quay được với các gen đang chọn ("" = quay được).
function challengeSourceProblem(source, pool = challengePool()) {
  if (!pool.length) return "Select at least one generation below.";
  if (challengeCase(source, pool)) return "";
  const noun = { type: "type", biome: "biome", letter: "letter" }[source];
  return `No ${noun} can go on the wheel with these generations. Select other generations.`;
}

// ----- Lượt tiếp theo -----

// Ô sẽ được quay ở lượt tới: ô trống đầu tiên khi đang lập đội, ô đã chọn tiếp theo khi đang reroll; null nếu không có.
function nextChallengeIndex(c = challenge) {
  if (c.pending) return null;
  if (c.reroll) {
    if (!c.reroll.started && !c.reroll.picked.length) return null;
    const left = c.reroll.picked.filter((i) => !(i in c.reroll.changes));
    return left.length ? left[0] : null;
  }
  if (c.code) return null;
  const i = c.team.indexOf(null);
  return i < 0 ? null : i;
}

// Nguồn của ô index: reroll thì bắt buộc nguồn cũ của ô (nguồn cũ không còn quay được, vd. minigame, thì nguồn rerollAs:
// Case), lập đội thì nguồn đang chọn.
function sourceForIndex(index, c = challenge) {
  if (!(c.reroll && c.team[index])) return c.source;
  const own = c.team[index].source;
  return challengeSource(own) ? own : knownChallengeSource(own).rerollAs;
}

// ----- Mã TW1 -----

const unixNow = () => Math.floor(Date.now() / 1000);

// Đội đủ 6 ô mà chưa tạo mã: hiện nút "Create TW1 code" (trước đó ô nào cũng xoá được).
const challengeTeamFull = (c = challenge) => !c.code && !c.pending && !c.team.includes(null);

// Ô index xoá được không: có Pokémon, chưa tạo mã TW1, không đang reroll, không phải Legendary đang chờ Keep / Reroll.
function canRemoveChallengeSlot(index, c = challenge) {
  return Boolean(c.team[index]) && !c.code && !c.reroll && !(c.pending && c.pending.index === index);
}

// Xoá Pokémon ở ô index (ô trở thành trống, lượt sau điền vào ô trống đầu tiên). Không hoàn lại bộ đếm pity; bộ sưu tập và
// lịch sử giữ nguyên (lượt đó đã thật sự quay ra). Trả về false nếu không xoá được.
function removeChallengeSlot(index, c = challenge) {
  if (!canRemoveChallengeSlot(index, c)) return false;
  c.team[index] = null;
  return true;
}

// Bấm "Create TW1 code": đội đủ 6 ô → mã TW1 mới (id ngẫu nhiên, parent null). Sau đó không xoá ô được nữa.
function createChallengeCode(c = challenge) {
  if (!challengeTeamFull(c)) return false;
  completeChallenge(c);
  return true;
}

// Đội đủ 6 ô → mã TW1 mới (id ngẫu nhiên, parent null).
function completeChallenge(c = challenge) {
  const data = {
    v: 1, id: newChallengeId(), ts: unixNow(), app: `pokeroll ${APP_VERSION}`,
    team: c.team.map(challengeSlotOf), parent: null, rerolled: [],
  };
  c.code = encodeChallengeCode(data);
  c.data = decodeChallengeCode(c.code);
}

// Reroll xong mọi ô đã chọn → mã TW1 mới: parent = id cũ, rerolled = các ô đã đổi, các ô khác giữ nguyên.
function finishReroll(c = challenge) {
  const changes = Object.fromEntries(Object.entries(c.reroll.changes).map(([i, e]) => [i, challengeSlotOf(e)]));
  const data = rerolledChallenge(c.data, changes, { id: newChallengeId(), ts: unixNow(), app: `pokeroll ${APP_VERSION}` });
  for (const [i, e] of Object.entries(c.reroll.changes)) c.team[i] = e;
  c.code = encodeChallengeCode(data);
  c.data = decodeChallengeCode(c.code);
  c.reroll = null;
}

// Nhập mã TW1 (khôi phục đội đang dùng). Trả về đội đọc được { data, team, code }; mã sai hoặc có Pokémon app không có
// thì báo ChallengeCodeError.
function importChallengeCode(text) {
  const data = decodeChallengeCode(text);
  const team = data.team.map((s) => entryFromSlot(s));
  const missing = team.findIndex((e) => !e);
  if (missing >= 0) {
    const s = data.team[missing];
    throw new ChallengeCodeError("unknown", `Team slot ${missing + 1} (${s.name}, #${s.dex}) isn't in this version of PokéRoll.`);
  }
  return { data, team, code: encodeChallengeCode(data) };
}

// Đọc mã TWR1 cho đội đang dùng. Trả về số ô được reroll; mã sai, không phải của đội này, hoặc đã dùng → ChallengeCodeError.
// Mã TW1 bên trong được so sau khi đọc và mã hoá lại (padding, CRC chữ hoa vẫn khớp).
function checkRerollCode(text, c = challenge) {
  const r = decodeRerollCode(text);
  if (!c.code) throw new ChallengeCodeError("no-team", "You have no finished team yet. Finish your team or import its TW1 code first.");
  if (c.used.includes(r.challenge.id) && r.challenge.id !== c.data.parent) {
    throw new ChallengeCodeError("used", `This reroll code was already used: team ${r.challenge.id} has been rerolled before.`);
  }
  if (encodeChallengeCode(r.challenge) !== c.code) {
    const used = r.challenge.id === c.data.parent;
    throw new ChallengeCodeError("other-team", used
      ? `This reroll code was already used: team ${r.challenge.id} was rerolled into ${c.data.id}.`
      : `This reroll code is for team ${r.challenge.id}, but your active team is ${c.data.id}.`);
  }
  return r.allow;
}

// ----- Lưu / đọc lại -----

function isValidEntry(e) {
  return Boolean(e && typeof e === "object" && state.byId.get(parseId(e.id))
    && RARITIES.some((r) => r.key === e.rarity) && typeof e.shiny === "boolean" && knownChallengeSource(e.source));
}

function cleanEntry(e) {
  if (!isValidEntry(e)) return null;
  return {
    id: parseId(e.id), rarity: e.rarity, shiny: e.shiny, source: e.source,
    detail: typeof e.detail === "string" ? e.detail : null, pity: PITY_KINDS[e.pity] ? e.pity : null,
  };
}

// Nhóm đang giữ của nguồn Roulette source, đọc lại từ storage: { key (nhóm có thật của nguồn đó), pitySpin } hoặc null nếu hỏng.
function cleanChallengeGroup(source, raw) {
  if (!raw || typeof raw !== "object" || typeof raw.key !== "string" || !challengeDetailName(source, raw.key)) return null;
  const ps = raw.pitySpin;
  const pitySpin = ps && PITY_KINDS[ps.due] && Number.isInteger(ps.n) && ps.n > 0 ? { due: ps.due, n: ps.n } : null;
  return { key: raw.key, pitySpin };
}

// Nhóm đang giữ của mọi nguồn Roulette: { type, biome, letter } (thiếu hoặc hỏng → null).
function cleanChallengeGroups(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(CHALLENGE_SOURCES.filter((s) => s.wheel).map((s) => [s.key, cleanChallengeGroup(s.key, src[s.key])]));
}

function saveChallenge() {
  const { source, team, pending, code, reroll, groups } = challenge;
  const ok = saveJson(STORAGE_KEY_CHALLENGE, { source, team, pending, code, reroll, groups })
    && saveJson(STORAGE_KEY_CHALLENGE_USED, challenge.used);
  markSaved("challenge", ok);
}

// Đọc lại tab Challenge. Phần nào hỏng thì bỏ phần đó (mã không đọc được → đội về chưa xong; reroll không hợp lệ → bỏ).
function loadChallenge() {
  const raw = loadJson(STORAGE_KEY_CHALLENGE, {}, isPlainObject);
  challenge.used = loadJson(STORAGE_KEY_CHALLENGE_USED, [], Array.isArray).filter((id) => /^[A-Z0-9]{8}$/.test(id));
  challenge.source = challengeSource(raw.source) ? raw.source : "case";
  challenge.groups = cleanChallengeGroups(raw.groups);
  const team = Array.isArray(raw.team) ? raw.team.slice(0, CHALLENGE_TEAM_SIZE) : [];
  challenge.team = Array.from({ length: CHALLENGE_TEAM_SIZE }, (_, i) => cleanEntry(team[i]));
  challenge.code = null;
  challenge.data = null;
  if (typeof raw.code === "string") {
    try {
      const imported = importChallengeCode(raw.code);
      challenge.code = imported.code;
      challenge.data = imported.data;
      // Đội lưu kèm thông tin chi tiết (nhóm Roulette, pity); thiếu hoặc lệch mã thì lấy từ mã
      challenge.team = imported.team.map((e, i) => {
        const saved = challenge.team[i];
        return saved && JSON.stringify(challengeSlotOf(saved)) === JSON.stringify(imported.data.team[i]) ? saved : e;
      });
    } catch (e) {
      // mã hỏng: giữ các ô đã có, đội coi như chưa xong
    }
  }
  const p = raw.pending;
  challenge.pending = p && Number.isInteger(p.index) && p.index >= 0 && p.index < CHALLENGE_TEAM_SIZE && cleanEntry(p.entry)
    ? { index: p.index, entry: cleanEntry(p.entry) } : null;
  const r = raw.reroll;
  challenge.reroll = null;
  if (challenge.code && r && Number.isInteger(r.allow) && Array.isArray(r.picked)) {
    const picked = [...new Set(r.picked)].filter((i) => Number.isInteger(i) && i >= 0 && i < CHALLENGE_TEAM_SIZE).slice(0, r.allow);
    const changes = {};
    for (const [i, e] of Object.entries(r.changes || {})) if (picked.includes(Number(i)) && cleanEntry(e)) changes[i] = cleanEntry(e);
    challenge.reroll = { allow: r.allow, picked, started: Boolean(r.started) && picked.length > 0, changes };
  }
}


// "Start over" và "Clear data": bỏ đội, mã và reroll (giữ gen và nguồn đang chọn).
function resetChallenge() {
  challenge.team = Array(CHALLENGE_TEAM_SIZE).fill(null);
  challenge.pending = null;
  challenge.code = null;
  challenge.data = null;
  challenge.reroll = null;
  saveChallenge();
}
