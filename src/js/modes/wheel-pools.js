// Hằng số bánh xe, nhóm Pokémon theo hệ, logic custom pool.
"use strict";

// =====================================================================
// CHẾ ĐỘ CUSTOM: Type Roulette
// =====================================================================

const ICON_WHEEL = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V5M12 13l6.9 4M12 13l-6.9 4M12 2v3"/></svg>`;

// 18 hệ theo thứ tự trong game — cũng là thứ tự các ô trên bánh xe (theo chiều kim đồng hồ, bắt đầu từ kim chỉ).
const TYPE_ORDER = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];

const WHEEL_SPIN_MS = 3600;   // thời gian quay bánh xe
const WHEEL_TURNS = 5;        // số vòng quay trọn trước khi dừng
const ROULETTE_REEL_MS = 4000; // dải thẻ ở Type Roulette ngắn hơn trang Case

const typeName = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Pokémon của từng hệ: { fire: [...], water: [...] } — chỉ gồm hệ có Pokémon, theo thứ tự TYPE_ORDER.
// Pokémon hai hệ nằm trong cả hai nhóm (Gyarados thuộc cả Water lẫn Flying).
function typePools(pool) {
  const pools = {};
  for (const t of TYPE_ORDER) {
    const list = pool.filter((p) => p.types.includes(t));
    if (list.length > 0) pools[t] = list;
  }
  return pools;
}

// Bậc "thường": nhóm (hệ / biome) phải có ít nhất 1 Pokémon ở một trong các bậc này mới được lên bánh xe.
const COMMON_TIERS = ["blue", "purple", "pink"];

// Lọc các nhóm được lên bánh xe. Nhóm chỉ có Pokémon Red và/hoặc Gold bị bỏ (giống nhóm không có Pokémon),
// vì hòm đó luôn ra Pokémon hiếm (bậc trống bị hạ/nâng về bậc còn Pokémon).
// Trả về { pools: các nhóm được giữ (giữ thứ tự), rareOnly: mã các nhóm bị bỏ vì chỉ có Pokémon hiếm }.
function wheelPools(pools) {
  const kept = {};
  const rareOnly = [];
  for (const [key, list] of Object.entries(pools)) {
    if (list.some((p) => COMMON_TIERS.includes(p.rarity))) kept[key] = list;
    else rareOnly.push(key);
  }
  return { pools: kept, rareOnly };
}

// ----- Custom pool: người chơi tự chọn một phần Pokémon trong hòm của nhóm đang chọn -----
// Lưu riêng theo chế độ và nhóm: pokeroll.custom.pools.<chế độ>.<nhóm> = [id…]. Không có khóa = cả hòm.
// Id đã lưu nhưng không thuộc các gen đang chọn tạm không tính, vẫn giữ trong danh sách (bật lại gen thì có lại).
const CUSTOM_POOL_MIN = 6;
const STORAGE_KEY_CUSTOM_POOLS = "pokeroll.custom.pools";
const CUSTOM_POOL_INVALID = "Your custom pool isn't valid with these generations — using the full case.";

// Lý do một tập chưa dùng được (rỗng = hợp lệ). Điều kiện bậc dùng đúng quy tắc lên bánh xe (wheelPools).
function customPoolProblems(list) {
  const problems = [];
  if (list.length < CUSTOM_POOL_MIN) problems.push(`Pick at least ${CUSTOM_POOL_MIN} Pokémon`);
  if (!wheelPools({ pool: list }).pools.pool) problems.push("Include at least one Blue, Purple or Pink Pokémon");
  return problems;
}

// Hòm ít hơn CUSTOM_POOL_MIN con thì không cho tùy chỉnh, luôn dùng cả hòm.
const canCustomizePool = (full) => full.length >= CUSTOM_POOL_MIN;

// Hòm thật sự dùng để quay. full: cả hòm của nhóm (đã lọc theo gen); savedIds: tập đã lưu (null = chưa tùy chỉnh).
// Trả về { list, custom, invalid, picked, total }: invalid = có tập đã lưu nhưng không hợp lệ với các gen này
// (hoặc hòm quá nhỏ), nên tạm dùng cả hòm.
function resolveCustomPool(full, savedIds) {
  const whole = { list: full, custom: false, invalid: false, picked: full.length, total: full.length };
  if (!savedIds) return whole;
  const ids = new Set(savedIds.map(String));
  const list = full.filter((p) => ids.has(String(p.id)));
  if (!canCustomizePool(full) || customPoolProblems(list).length) return { ...whole, invalid: true };
  return { list, custom: true, invalid: false, picked: list.length, total: full.length };
}

// Danh sách để lưu khi bấm Save: Pokémon đang tick (theo thứ tự trong hòm) + các id đã lưu đang bị ẩn vì gen.
// Tick đủ cả hòm (All, Reset to full case) thì trả về null = dùng cả hòm, xóa khóa (bỏ luôn các id đang bị ẩn).
function mergeCustomPool(savedIds, full, picked) {
  const chosen = full.filter((p) => picked.has(String(p.id)));
  if (chosen.length === full.length) return null;
  const inCase = new Set(full.map((p) => String(p.id)));
  const hidden = (savedIds || []).filter((id) => !inCase.has(String(id)));
  return [...chosen.map((p) => p.id), ...hidden];
}

const customPoolKey = (mode, group) => `${STORAGE_KEY_CUSTOM_POOLS}.${mode}.${group}`;

function loadCustomPoolIds(mode, group) {
  return loadJson(customPoolKey(mode, group), null,
    (v) => Array.isArray(v) && v.every((id) => typeof id === "number" || typeof id === "string"));
}

// ids = null: xóa tập đã lưu. Trả về false nếu không lưu được.
function saveCustomPoolIds(mode, group, ids) {
  if (ids) return saveJson(customPoolKey(mode, group), ids);
  try {
    localStorage.removeItem(customPoolKey(mode, group));
    return true;
  } catch (e) {
    return false;
  }
}

