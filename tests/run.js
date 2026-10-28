// Chạy toàn bộ test: npm test
//   tests/logic/*.js  logic quay và tỉ lệ, chạy bằng Node
//   tests/ui/*.js     giao diện, chạy trong Electron với cửa sổ ẩn (dữ liệu và ảnh chụp ở thư mục tạm của hệ thống)
// Tuỳ chọn: npm test -- <tên>   chỉ chạy bộ test có tên chứa <tên>, vd. npm test -- roulette
//           npm test -- -v       in toàn bộ kết quả từng bộ, không chỉ các dòng FAIL
const { spawnSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");

const SUITES = [
  ["logic", "case"], ["logic", "type-roulette"], ["logic", "biome-roulette"], ["logic", "ui-text"],
  ["ui", "case"], ["ui", "case-odds"], ["ui", "custom"], ["ui", "layout"], ["ui", "type-roulette"], ["ui", "biome-roulette"], ["ui", "case-contents"], ["ui", "wheel-keep"], ["ui", "motion"], ["ui", "desktop"],
];
const args = process.argv.slice(2);
const verbose = args.includes("-v");
const filters = args.filter((a) => a !== "-v");
const picked = SUITES.filter(([kind, name]) => !filters.length || filters.some((f) => `${kind}/${name}`.includes(f)));

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
const started = Date.now();
for (const [kind, name] of picked) {
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
  console.log(`${ok ? "PASS" : "FAIL"}  ${kind}/${name}  ${pass} passed${fails.length ? `, ${fails.length} failed` : ""}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (verbose) console.log(lines.map((l) => "      " + l).join("\n"));
  else if (!ok) console.log((fails.length ? fails : lines.slice(-20)).map((l) => "      " + l).join("\n"));
}

if (!picked.length) {
  console.log(`No test suite matches "${filters.join(" ")}".`);
  process.exit(1);
}
console.log(`\n${picked.length - failed}/${picked.length} suites passed in ${((Date.now() - started) / 1000).toFixed(0)}s`);
process.exit(failed ? 1 : 0);
