// Sinh file data/megastones.js (đá Mega cho hòm Minigame "Mega Stone Case") từ scripts/data/mega-stones.csv.
// Chạy (cần Node.js 18 trở lên):  node scripts/build-megastones.js
//
// CSV gồm đá Mega của 3 mod Cobblemon (Mega Showdown, ZA Mega, Mushiromega). Ảnh đá chép riêng bằng
// scripts/build-megastone-images.js. Muốn thêm đá: thêm dòng vào CSV, chạy lại script này rồi script ảnh.
// Mod mới: thêm một mục vào MODS bên dưới (cột "mod" của CSV phải khớp name).

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const INPUT = path.join(__dirname, "data", "mega-stones.csv");
const OUTPUT = path.join(ROOT, "data", "megastones.js");

const MODS = [
  { key: "mega-showdown", name: "Mega Showdown", author: "YajatKaul, Navas" },
  { key: "za-mega", name: "ZA Mega", author: "YajatKaul, Navas" },
  { key: "mushiromega", name: "Mushiromega", author: "" },
];

const COLUMNS = ["stone", "stone_id", "mod", "group", "pokemon", "form", "types", "hp", "atk", "def_", "spa", "spd", "spe",
  "bst", "ability", "data_source", "recipe"];
const STAT_COLUMNS = { hp: "hp", atk: "atk", def: "def_", spa: "spa", spd: "spd", spe: "spe" };
const FORMS = ["Mega", "Mega X", "Mega Y", "Mega Z"];
const TYPES = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying",
  "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];

// Một dòng CSV → mảng ô (ô trong ngoặc kép có thể chứa dấu phẩy, "" là một dấu ngoặc kép).
function parseCsvLine(line) {
  const cells = [];
  let cell = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { cells.push(cell); cell = ""; }
    else cell += c;
  }
  cells.push(cell);
  return cells;
}

// Pokémon trong data/data.js, tra theo tên (viết thường) để biết số Pokédex của Pokémon dùng đá.
function loadBaseDex() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "data", "data.js"), "utf8") + ";globalThis.__dex = POKEMON_DATA;", ctx);
  return new Map(ctx.__dex.map((p) => [p.name.toLowerCase(), p]));
}

// "never_melt_ice, iron_ingot×2, mega_stone" → [{ item: "never_melt_ice", count: 1 }, { item: "iron_ingot", count: 2 }, …]
function parseRecipe(text) {
  return text.split(",").map((s) => s.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^(.+?)×(\d+)$/);
    return m ? { item: m[1], count: Number(m[2]) } : { item: part, count: 1 };
  });
}

function buildStone(row, line, dex) {
  const fail = (msg) => { throw new Error(`Dòng ${line} (${row.stone || "?"}): ${msg}`); };
  const mod = MODS.find((m) => m.name === row.mod);
  if (!mod) fail(`mod lạ "${row.mod}" — thêm vào MODS`);
  if (!row.stone || !row.stone_id || !row.pokemon) fail("thiếu tên đá, stone_id hoặc pokemon");
  if (!FORMS.includes(row.form)) fail(`dạng lạ "${row.form}"`);

  const types = row.types ? row.types.split("/") : [];
  if (types.some((t) => !TYPES.includes(t))) fail(`hệ lạ "${row.types}"`);

  // Chỉ số: có đủ cả 6 hoặc không có ô nào; có BST thì phải bằng tổng
  const statValues = Object.values(STAT_COLUMNS).map((c) => row[c]);
  let stats = null;
  if (statValues.some(Boolean)) {
    if (!statValues.every((v) => /^\d+$/.test(v))) fail("chỉ số thiếu hoặc không phải số");
    stats = Object.fromEntries(Object.entries(STAT_COLUMNS).map(([k, c]) => [k, Number(row[c])]));
  }
  const bst = row.bst ? Number(row.bst) : null;
  if (row.bst && !/^\d+$/.test(row.bst)) fail(`BST không phải số "${row.bst}"`);
  if (stats && bst !== null && Object.values(stats).reduce((a, b) => a + b, 0) !== bst) fail("BST không bằng tổng chỉ số");

  const base = dex.get(row.pokemon.toLowerCase());
  return {
    id: row.stone_id,
    name: row.stone,
    mod: mod.key,
    group: row.group,
    pokemon: row.pokemon,
    pokemonId: base ? base.id : null, // null: Pokémon không có trong app (vd. Mushiro) — chỉ hiện biểu tượng đá
    form: row.form,
    types,
    stats,
    bst,
    ability: row.ability || null,
    recipe: parseRecipe(row.recipe),
  };
}

function main() {
  const lines = fs.readFileSync(INPUT, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  if (header.join() !== COLUMNS.join()) throw new Error(`Tiêu đề CSV khác dự kiến:\n  ${header.join()}\n  cần: ${COLUMNS.join()}`);
  const dex = loadBaseDex();

  const stones = [];
  lines.slice(1).forEach((text, i) => {
    if (!text.trim()) return;
    const cells = parseCsvLine(text);
    if (cells.length !== COLUMNS.length) throw new Error(`Dòng ${i + 2}: có ${cells.length} ô, cần ${COLUMNS.length}`);
    stones.push(buildStone(Object.fromEntries(COLUMNS.map((c, k) => [c, cells[k].trim()])), i + 2, dex));
  });
  const dup = stones.filter((s, i) => stones.findIndex((t) => t.id === s.id) !== i);
  if (dup.length) throw new Error(`stone_id bị trùng: ${dup.map((s) => s.id).join(", ")}`);

  const content =
    `// File này được sinh tự động bởi scripts/build-megastones.js — đừng sửa tay.\n` +
    `// Nguồn: scripts/data/mega-stones.csv (dữ liệu đá Mega của các mod Cobblemon). Ngày tạo: ${new Date().toISOString().slice(0, 10)}\n` +
    `const MEGA_STONE_MODS = [\n${MODS.map((m) => "  " + JSON.stringify(m)).join(",\n")}\n];\n` +
    `const MEGA_STONE_DATA = [\n${stones.map((s) => "  " + JSON.stringify(s)).join(",\n")}\n];\n`;
  fs.writeFileSync(OUTPUT, content, "utf8");

  console.log(`Đã ghi ${OUTPUT}: ${stones.length} viên đá`);
  for (const m of MODS) console.log(`  ${m.name.padEnd(14)} ${stones.filter((s) => s.mod === m.key).length}`);
  const missing = [...new Set(stones.filter((s) => !s.pokemonId).map((s) => s.pokemon))];
  if (missing.length) console.log(`  Pokémon không có trong app (chỉ hiện biểu tượng đá): ${missing.join(", ")}`);
}

try {
  main();
} catch (err) {
  console.error("\nThất bại:", err.message);
  console.error("megastones.js chưa được ghi.");
  process.exit(1);
}
