// Kiểm tra cách chia bộ test thành nhóm cho CI (tests/suites.js, npm test -- --shard i/n):
// mọi bộ thuộc đúng một nhóm, bộ mới chưa đo vẫn được chạy, chia ổn định và đều, tests/run.js và test.yml dùng đúng cách chia.
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");
const { SUITES, SUITE_TIMES, suiteName, shardSuites, parseShard } = require("../suites");
const ROOT = path.join(__dirname, "..", "..");
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

const names = (list) => list.map(suiteName);
const all = names(SUITES);

// 1. Mọi bộ test thuộc đúng một nhóm, với mọi số nhóm
let bad = [];
for (let n = 1; n <= 10; n++) {
  const shards = shardSuites(SUITES, n);
  const flat = shards.flatMap((s) => names(s.suites));
  if (shards.length !== n) bad.push(`${n}: ${shards.length} groups`);
  if (flat.length !== all.length || new Set(flat).size !== all.length || !all.every((s) => flat.includes(s))) bad.push(`${n}: groups ≠ all suites`);
  if (n <= all.length && shards.some((s) => s.suites.length === 0)) bad.push(`${n}: empty group`);
}
check(`Shards 1–10: the groups together are exactly all ${all.length} suites, each in one group, none empty`, bad.length === 0, bad.join("; "));

// 2. Danh sách bộ test khớp file test: mọi file trong tests/logic và tests/ui (trừ file trợ giúp) đều có trong SUITES
const HELPERS = ["ui/timing"];
const files = ["logic", "ui"].flatMap((k) => fs.readdirSync(path.join(ROOT, "tests", k)).filter((f) => f.endsWith(".js")).map((f) => `${k}/${f.slice(0, -3)}`));
const unlisted = files.filter((f) => !all.includes(f) && !HELPERS.includes(f));
const missingFile = all.filter((s) => !files.includes(s));
check("Every test file is in SUITES, and every suite has a file", unlisted.length === 0 && missingFile.length === 0 && new Set(all).size === all.length,
  [...unlisted.map((f) => `unlisted ${f}`), ...missingFile.map((f) => `no file ${f}`)].join(", "));

// 3. Bộ mới chưa có thời gian vẫn được chạy (đúng một nhóm)
const extra = [...SUITES, ["ui", "brand-new"], ["logic", "also-new"]];
bad = [];
for (let n = 1; n <= 10; n++) {
  const flat = shardSuites(extra, n).flatMap((s) => names(s.suites));
  for (const s of ["ui/brand-new", "logic/also-new"]) if (flat.filter((x) => x === s).length !== 1) bad.push(`${n}: ${s}`);
  if (flat.length !== extra.length) bad.push(`${n}: ${flat.length}/${extra.length}`);
}
check("Suites without a measured time are still run, in exactly one group", bad.length === 0, bad.join("; "));
check("No times at all: still splits every suite", shardSuites(SUITES, 4, {}).flatMap((s) => s.suites).length === SUITES.length);

// 4. Ổn định: cùng danh sách → cùng nhóm, kể cả khi thứ tự đầu vào khác; trong nhóm giữ thứ tự của SUITES
const a = shardSuites(SUITES, 4).map((s) => names(s.suites).join());
const shuffled = [...SUITES].reverse();
const b = shardSuites(shuffled, 4).map((s) => names(s.suites).sort().join());
check("Stable: same groups every time and for any input order", JSON.stringify(a) === JSON.stringify(shardSuites(SUITES, 4).map((s) => names(s.suites).join()))
  && JSON.stringify(a.map((x) => x.split(",").sort().join())) === JSON.stringify(b));
check("Inside a group, suites keep the SUITES order", shardSuites(SUITES, 4).every((s) => s.suites.every((x, i, arr) => i === 0 || SUITES.indexOf(arr[i - 1]) < SUITES.indexOf(x))));

// 5. Đều: nhóm dài nhất không dài hơn nhóm ngắn nhất quá một bộ test dài nhất (tham lam theo thời gian)
const longest = Math.max(...Object.values(SUITE_TIMES));
const four = shardSuites(SUITES, 4).map((s) => s.seconds);
check(`4 shards are balanced (max − min ≤ longest suite ${longest}s)`, Math.max(...four) - Math.min(...four) <= longest, four.map((x) => x.toFixed(0) + "s").join(" / "));

// 6. parseShard
check("parseShard: 2/4 ok; 0/4, 5/4, 2, a/b, 1/0 rejected", JSON.stringify(parseShard("2/4")) === '{"index":2,"total":4}'
  && ["0/4", "5/4", "2", "a/b", "1/0", "", undefined].every((x) => parseShard(x) === null));

// 7. tests/run.js: --shard i/n chạy đúng nhóm, không tham số chạy hết; tham số sai thì dừng
const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, "tests/run.js"), ...args, "--list"], { encoding: "utf8" });
const listed = (res) => res.stdout.split("\n").filter((l) => /^(logic|ui)\//.test(l));
const full = listed(run());
check("run.js with no shard lists all suites in order", full.join() === all.join(), `${full.length}`);
const viaRun = [1, 2, 3, 4].map((i) => listed(run("--shard", `${i}/4`)));
check("run.js --shard i/4 lists exactly group i, and the 4 groups cover every suite once",
  viaRun.every((l, i) => l.join() === a[i]) && viaRun.flat().length === all.length && new Set(viaRun.flat()).size === all.length);
check("run.js --shard=2/4 works too, and filters apply inside the shard", listed(run("--shard=2/4")).join() === a[1]
  && listed(run("--shard", "1/4", "ui/")).every((s) => s.startsWith("ui/") && a[0].includes(s)));
const wrong = run("--shard", "5/4");
check("run.js --shard 5/4 stops with an error", wrong.status === 1 && /--shard needs i\/n/.test(wrong.stderr));

// 8. test.yml: matrix 1..N và lệnh dùng đúng /N; có job tổng hợp chờ mọi shard
const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
const matrix = (yml.match(/shard:\s*\[([^\]]+)\]/) || [])[1];
const nums = matrix ? matrix.split(",").map((x) => Number(x.trim())) : [];
const totals = [...yml.matchAll(/--shard \$\{\{ matrix\.shard \}\}\/(\d+)/g)].map((m) => Number(m[1]));
check("test.yml: matrix shards are 1..N and the command uses /N", nums.length > 0 && nums.every((x, i) => x === i + 1) && totals.length === 1 && totals[0] === nums.length,
  `matrix [${nums}] / ${totals}`);
check("test.yml: fail-fast off, and a final job that needs every shard and fails unless all passed",
  /fail-fast:\s*false/.test(yml) && /needs:\s*test\b/.test(yml) && /if:\s*always\(\)/.test(yml) && /needs\.test\.result/.test(yml));

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
