// Danh sách bộ test (tests/run.js chạy theo thứ tự này) và cách chia bộ test thành nhóm cho CI (npm test -- --shard i/n).
//   tests/logic/*.js  logic quay và tỉ lệ, chạy bằng Node
//   tests/ui/*.js     giao diện, chạy trong Electron với cửa sổ ẩn
// Thêm bộ test mới: thêm vào SUITES. Nên thêm cả thời gian vào SUITE_TIMES để chia nhóm đều; chưa có thì vẫn được chạy
// (tính bằng thời gian trung bình của các bộ đã đo).
"use strict";

const SUITES = [
  ["logic", "case"], ["logic", "type-roulette"], ["logic", "biome-roulette"], ["logic", "custom-pool"], ["logic", "letter-roulette"], ["logic", "minigame"], ["logic", "shards"], ["logic", "ui-text"], ["logic", "release"], ["logic", "wait-for-ci"],
  ["ui", "case"], ["ui", "case-odds"], ["ui", "custom"], ["ui", "layout"], ["ui", "type-roulette"], ["ui", "biome-roulette"], ["ui", "case-contents"], ["ui", "wheel-keep"], ["ui", "motion"], ["ui", "desktop"], ["ui", "reel-timing"], ["ui", "custom-pool"], ["ui", "letter-roulette"],
  ["ui", "reel-resize"], ["ui", "reel-hidden"], ["ui", "wheel-fallback"], ["ui", "transition-end"], ["ui", "history"], ["ui", "favicon"], ["ui", "navigation"], ["ui", "minigame"], ["ui", "megastone-images"], ["ui", "megastone-dpr"],
];

// Thời gian chạy (giây) đo bằng npm test, chỉ dùng để chia nhóm. Lệch chút cũng không sao: mọi bộ vẫn được chạy.
const SUITE_TIMES = {
  "logic/case": 0.2, "logic/type-roulette": 2.7, "logic/biome-roulette": 2.5, "logic/custom-pool": 0.1, "logic/letter-roulette": 0.4,
  "logic/minigame": 0.1, "logic/shards": 0.1, "logic/ui-text": 0.1, "logic/release": 0.1, "logic/wait-for-ci": 0.1,
  "ui/case": 34.8, "ui/case-odds": 9.4, "ui/custom": 20.4, "ui/layout": 5.4, "ui/type-roulette": 47.3, "ui/biome-roulette": 42.8,
  "ui/case-contents": 14.0, "ui/wheel-keep": 29.7, "ui/motion": 22.4, "ui/desktop": 2.7, "ui/reel-timing": 93.7, "ui/custom-pool": 8.1,
  "ui/letter-roulette": 34.6, "ui/reel-resize": 45.3, "ui/reel-hidden": 46.7, "ui/wheel-fallback": 55.2, "ui/transition-end": 31.3,
  "ui/history": 2.6, "ui/favicon": 0.7, "ui/navigation": 1.3, "ui/minigame": 42.0, "ui/megastone-images": 10.9, "ui/megastone-dpr": 16.9,
};

const suiteName = ([kind, name]) => `${kind}/${name}`;

// Chia suites thành n nhóm có tổng thời gian gần bằng nhau (tham lam: bộ dài nhất trước, vào nhóm đang ngắn nhất).
// Ổn định: cùng danh sách thì cùng kết quả (bằng thời gian thì xếp theo tên, bằng tổng thì vào nhóm số nhỏ hơn).
// Mọi bộ thuộc đúng một nhóm; bộ chưa có trong times tính bằng thời gian trung bình. Trong mỗi nhóm giữ thứ tự của suites.
// Trả về [{ suites, seconds }] (n phần tử).
function shardSuites(suites, n, times = SUITE_TIMES) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`shard count must be a positive integer, got ${n}`);
  const known = Object.values(times);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const timeOf = (s) => (suiteName(s) in times ? times[suiteName(s)] : fallback);
  const order = [...suites].sort((a, b) => timeOf(b) - timeOf(a) || suiteName(a).localeCompare(suiteName(b)));
  const shards = Array.from({ length: n }, () => ({ suites: [], seconds: 0 }));
  for (const s of order) {
    const target = shards.reduce((best, sh) => (sh.seconds < best.seconds ? sh : best), shards[0]);
    target.suites.push(s);
    target.seconds += timeOf(s);
  }
  for (const sh of shards) sh.suites.sort((a, b) => suites.indexOf(a) - suites.indexOf(b));
  return shards;
}

// "2/4" → { index: 2, total: 4 }; sai dạng (hoặc index ngoài 1..total) thì null
function parseShard(text) {
  const m = /^(\d+)\/(\d+)$/.exec(String(text || ""));
  if (!m) return null;
  const index = Number(m[1]), total = Number(m[2]);
  return total >= 1 && index >= 1 && index <= total ? { index, total } : null;
}

module.exports = { SUITES, SUITE_TIMES, suiteName, shardSuites, parseShard };
