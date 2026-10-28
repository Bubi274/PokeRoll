// Kiểm tra tỉ lệ quay của trang Case bằng Node (số ngẫu nhiên có seed nên mỗi lần chạy ra như nhau):
// tần suất từng bậc khớp effectiveChances (đã tính hạ bậc), shiny ≈ 1 in 100.
// Tuỳ chọn: node tests/logic/case.js <app.js cũ> — so thêm với bản cũ, cùng seed phải quay ra giống hệt.
const fs = require("fs"), vm = require("vm"), path = require("path");
const dir = path.join(__dirname, "..", "..");
const baseline = process.argv[2];
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

// Nạp app.js (và dữ liệu) vào một môi trường riêng, Math.random thay bằng bộ sinh số có seed.
function load(appFile) {
  let seed = 12345;
  const ctx = { console: { log() {}, table() {}, warn() {} }, Math: Object.create(Math), module: {} };
  ctx.Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  vm.createContext(ctx);
  vm.runInContext(["data.js", "special.js"].map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n")
    + "\n" + fs.readFileSync(appFile, "utf8")
    + "\n;globalThis.__all=[...POKEMON_DATA,...SPECIAL_DATA].map(p=>({...p,rarity:getRarity(p)}));", ctx);
  return { ...ctx.module.exports, __all: ctx.__all }; // các hàm app.js xuất ra khi chạy bằng Node
}

// Quay n lần một hòm; trả về số lần ra mỗi bậc, số shiny và chuỗi id để so hai bản.
function roll(ctx, gens, n) {
  const pool = gens ? ctx.filterByGens(ctx.__all, gens) : ctx.__all;
  const groups = ctx.groupByRarity(pool);
  const counts = Object.fromEntries(ctx.RARITIES.map((r) => [r.key, 0]));
  let shiny = 0, trace = "";
  for (let i = 0; i < n; i++) {
    const res = ctx.rollOnce(groups);
    counts[res.rarity]++;
    if (res.shiny) shiny++;
    if (i < 2000) trace += res.pokemon.id + (res.shiny ? "*" : "") + ",";
  }
  return { groups, counts, shiny, trace };
}

const N = 200000;
const CASES = [["All gens + Special", null], ["Gen 1 only", new Set([1])], ["Gen 9 only", new Set([9])]];
const ctx = load(path.join(dir, "app.js"));
const runs = [];
for (const [label, gens] of CASES) {
  const r = roll(ctx, gens, N);
  runs.push(r);
  const chances = ctx.effectiveChances(r.groups);
  const total = ctx.RARITIES.reduce((s, x) => s + x.chance, 0);
  const off = ctx.RARITIES.filter((t) => {
    const p = chances[t.key] / total, sd = Math.sqrt(N * p * (1 - p));
    return Math.abs(r.counts[t.key] - N * p) > Math.max(5 * sd, 1e-9);
  });
  const row = ctx.RARITIES.map((t) => `${t.name} ${(r.counts[t.key] / N * 100).toFixed(2)}/${(chances[t.key] / total * 100).toFixed(2)}%`).join(", ");
  check(`${label}: tier frequencies match effectiveChances (within 5σ, ${N.toLocaleString("en-US")} rolls)`, off.length === 0, row);
  const sd = Math.sqrt(N * ctx.SHINY_CHANCE * (1 - ctx.SHINY_CHANCE));
  check(`${label}: shiny ≈ 1 in 100`, Math.abs(r.shiny - N * ctx.SHINY_CHANCE) < 5 * sd, `${(r.shiny / N * 100).toFixed(3)}%`);
}
// Bậc trống hạ xuống bậc thấp hơn: Gen 1 không có Red nên Red không bao giờ ra
check("Gen 1: empty Red tier never drops (folded into Pink)", runs[1].groups.red.length > 0 || runs[1].counts.red === 0, `Red ${runs[1].groups.red.length} Pokémon, ${runs[1].counts.red} drops`);

if (baseline) {
  const old = load(baseline);
  const same = CASES.every(([, gens], i) => {
    const a = roll(old, gens, N);
    return a.trace === runs[i].trace && JSON.stringify(a.counts) === JSON.stringify(runs[i].counts) && a.shiny === runs[i].shiny;
  });
  check(`Same seed: identical rolls to ${path.basename(baseline)}`, same);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
