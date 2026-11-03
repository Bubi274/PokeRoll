// Đọc và ghi localStorage: gen đã chọn, bộ sưu tập, lịch sử quay.
"use strict";

// =====================================================================
// LƯU TRỮ (localStorage có thể bị chặn nên luôn bọc try/catch)
// =====================================================================

function loadJson(key, fallback, isValid) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (value !== null && isValid(value)) return value;
  } catch (e) {
    // dữ liệu hỏng hoặc bị chặn → dùng mặc định
  }
  return fallback;
}

// Trả về false nếu không lưu được (bị chặn, đầy bộ nhớ...).
function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

// Tất cả nhóm có thể chọn vào hòm: số gen 1–9 và key các nhóm Special.
function allSourceKeys() {
  return [...GENS.map((g) => g.gen), ...SPECIAL_GROUP_LIST.map((g) => g.key)];
}

// Người đã lưu lựa chọn thì giữ nguyên (nhóm Special mới thêm sẽ chưa được chọn).
// key: khóa localStorage (mặc định là lựa chọn của trang Case).
function loadSelectedGens(key = STORAGE_KEY_GENS) {
  const saved = loadJson(key, null, Array.isArray);
  const valid = allSourceKeys();
  if (saved) return new Set(saved.filter((g) => valid.includes(g)));
  return new Set(valid); // mặc định: chọn tất cả, kể cả Special
}

function saveSelectedGens(gens, key = STORAGE_KEY_GENS) {
  saveJson(key, [...gens]);
}

const isPlainObject = (v) => typeof v === "object" && !Array.isArray(v);

// Đọc bộ sưu tập, bỏ các mục không hợp lệ.
function loadCollection(validIds) {
  const raw = loadJson(STORAGE_KEY_COLLECTION, {}, isPlainObject);
  const clean = {};
  for (const [id, e] of Object.entries(raw)) {
    if (validIds.has(parseId(id)) && e && Number.isInteger(e.count) && e.count > 0) {
      clean[id] = { count: e.count, shiny: Number.isInteger(e.shiny) ? e.shiny : 0, first: e.first || 0 };
    }
  }
  return clean;
}

function loadHistory(validIds) {
  return loadJson(STORAGE_KEY_HISTORY, [], Array.isArray)
    .filter((h) => h && validIds.has(h.id))
    .slice(0, HISTORY_LIMIT);
}

// Phần dữ liệu đang lưu lỗi ("progress": bộ sưu tập + lịch sử chính, "minigame": dữ liệu Minigame).
// state.saveFailed = true khi còn phần nào lỗi, để lưu thành công phần này không che lỗi của phần kia.
const saveFailures = new Set();
function markSaved(part, ok) {
  if (ok) saveFailures.delete(part);
  else saveFailures.add(part);
  state.saveFailed = saveFailures.size > 0;
}

// Lưu bộ sưu tập và lịch sử quay; state.saveFailed = true nếu không lưu được.
function saveProgress() {
  const ok = saveJson(STORAGE_KEY_COLLECTION, state.collection) &&
             saveJson(STORAGE_KEY_HISTORY, state.history);
  markSaved("progress", ok);
}
