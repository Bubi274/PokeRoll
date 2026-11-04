// Chạy toàn bộ test: npm test   (danh sách bộ test và cách chia nhóm ở tests/suites.js)
//   tests/logic/*.js  logic quay và tỉ lệ, chạy bằng Node
//   tests/ui/*.js     giao diện, chạy trong Electron với cửa sổ ẩn (dữ liệu và ảnh chụp ở thư mục tạm của hệ thống)
// Tuỳ chọn: npm test -- <tên>          chỉ chạy bộ test có tên chứa <tên>, vd. npm test -- roulette
//           npm test -- -v              in toàn bộ kết quả từng bộ, không chỉ các dòng FAIL
//           npm test -- --shard 2/4     chỉ chạy nhóm 2 trong 4 nhóm (CI chạy các nhóm song song, xem .github/workflows/test.yml)
//           npm test -- --list          chỉ in các bộ sẽ chạy, không chạy
const { spawnSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const { SUITES, suiteName, shardSuites, parseShard } = require("./suites");

const args = process.argv.slice(2);
const verbose = args.includes("-v");
const listOnly = args.includes("--list");
let shard = null;
const filters = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-v" || a === "--list") continue;
  if (a === "--shard" || a.startsWith("--shard=")) {
    const value = a === "--shard" ? args[++i] : a.slice("--shard=".length);
    shard = parseShard(value);
    if (!shard) {
      console.error(`--shard needs i/n with 1 ≤ i ≤ n, e.g. --shard 2/4 (got "${value ?? ""}")`);
      process.exit(1);
    }
    continue;
  }
  filters.push(a);
}
const pool = shard ? shardSuites(SUITES, shard.total)[shard.index - 1].suites : SUITES;
const picked = pool.filter((s) => !filters.length || filters.some((f) => suiteName(s).includes(f)));

if (shard) {
  const expected = shardSuites(SUITES, shard.total)[shard.index - 1].seconds;
  console.log(`Shard ${shard.index}/${shard.total}: ${picked.length} suites (≈${Math.round(expected)}s measured): ${picked.map(suiteName).join(", ")}\n`);
}
if (listOnly) {
  for (const s of picked) console.log(suiteName(s));
  process.exit(picked.length ? 0 : 1);
}

// Khi ELECTRON_RUN_AS_NODE=1 (vd. đặt sẵn trong terminal của VS Code), Electron chạy như Node và không mở được cửa sổ.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const electron = require("electron"); // chạy bằng Node thì đây là đường dẫn tới file chạy Electron

// Thư mục tạm của lần chạy trước (localStorage, ảnh chụp) — xoá để mỗi lần chạy như mới
const TMP = path.join(os.tmpdir(), "pokeroll-tests");
fs.rmSync(TMP, { recursive: true, force: true });

// Dòng cảnh báo của Chromium/Electron không liên quan tới kết quả test
const NOISE = /ozone|Vulkan|deprecated|^\s*$/;
let failed = 0;
const times = [];
const started = Date.now();
let warmedUp = false;
for (const [kind, name] of picked) {
  // Trước bộ test giao diện đầu tiên: mở Electron một lần cho sẵn sàng (tests/warmup.js) — máy CI mới tinh có thể chưa chụp được
  // màn hình ở lần mở đầu tiên. Không tính là bộ test, không bao giờ làm lượt chạy lỗi.
  if (kind === "ui" && !warmedUp) {
    warmedUp = true;
    const w = spawnSync(electron, [path.join(__dirname, "warmup.js")], { env, encoding: "utf8", timeout: 60 * 1000 });
    const msg = `${w.stdout || ""}`.split("\n").filter((l) => l.startsWith("Electron warm-up")).join(" | ");
    console.log(msg || "Electron warm-up: no output");
  }
  const file = path.join(__dirname, kind, `${name}.js`);
  const t0 = Date.now();
  const res = kind === "ui"
    ? spawnSync(electron, [file], { env, encoding: "utf8", timeout: 5 * 60 * 1000 })
    : spawnSync(process.execPath, [file], { env, encoding: "utf8", timeout: 5 * 60 * 1000 });
  const out = `${res.stdout || ""}${res.stderr || ""}`;
  const lines = out.split("\n").filter((l) => !NOISE.test(l));
  const pass = lines.filter((l) => l.startsWith("PASS")).length;
  const fails = lines.filter((l) => l.startsWith("FAIL"));
  const ok = res.status === 0 && fails.length === 0 && out.includes("ALL PASSED");
  if (!ok) failed++;
  times.push({ suite: `${kind}/${name}`, ok, seconds: (Date.now() - t0) / 1000 });
  // Trên GitHub Actions: các dòng FAIL thành annotation lỗi (thấy ngay ở trang tóm tắt, không phải mở log)
  if (!ok && process.env.GITHUB_ACTIONS === "true") {
    for (const l of (fails.length ? fails : lines.slice(-5)).slice(0, 10)) console.log(`::error title=${kind}/${name}::${l.replace(/%/g, "%25").replace(/\r?\n/g, " ")}`);
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${kind}/${name}  ${pass} passed${fails.length ? `, ${fails.length} failed` : ""}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (verbose) console.log(lines.map((l) => "      " + l).join("\n"));
  else if (!ok) console.log((fails.length ? fails : lines.slice(-20)).map((l) => "      " + l).join("\n"));
}

if (!picked.length) {
  console.log(`No test suite matches "${filters.join(" ")}".`);
  process.exit(1);
}
console.log(`\n${picked.length - failed}/${picked.length} suites passed in ${((Date.now() - started) / 1000).toFixed(0)}s`);

// Trên GitHub Actions: thời gian từng bộ thành một annotation (đọc được qua API, để cập nhật SUITE_TIMES) và bảng tóm tắt của job
if (process.env.GITHUB_ACTIONS === "true") {
  const label = shard ? `Shard ${shard.index}/${shard.total}` : "All suites";
  console.log(`::notice title=${label} suite times::${times.map((t) => `${t.suite} ${t.seconds.toFixed(1)}s${t.ok ? "" : " FAIL"}`).join(", ")}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${label}: ${picked.length - failed}/${picked.length} suites passed\n\n| Suite | Result | Time |\n|---|---|---|\n`
      + times.map((t) => `| ${t.suite} | ${t.ok ? "PASS" : "FAIL"} | ${t.seconds.toFixed(1)}s |`).join("\n") + "\n");
  }
}
process.exit(failed ? 1 : 0);
