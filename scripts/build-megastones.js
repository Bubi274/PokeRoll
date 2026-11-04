// Sinh file data/megastones.js (đá Mega cho hòm Minigame "Mega Stone Case") từ scripts/data/mega-stones.csv.
// Chạy (cần Node.js 18 trở lên):  node scripts/build-megastones.js
//
// CSV gồm đá Mega của 3 mod Cobblemon (Mega Showdown, ZA Mega, Mushiromega). Ảnh đá chép riêng bằng
// scripts/build-megastone-images.js. Muốn thêm đá: thêm dòng vào CSV, chạy lại script này rồi script ảnh.
// Mod mới: thêm một mục vào MODS bên dưới (cột "mod" của CSV phải khớp name).
//
// Ô hệ / chỉ số / ability mà CSV để trống (vd. Mega cổ điển: dữ liệu nằm trong Cobblemon gốc, không có trong mod) được
// lấp bằng dạng Mega chính thức trên PokeAPI. Dữ liệu của mod luôn thắng: chỉ lấp ô trống, không ghi đè. Mega tự chế
// (FAN_MADE_MODS) và dạng PokeAPI không có thì để trống. Mỗi trường ghi nguồn: typesSource / statsSource / abilitySource
// = "mod" | "pokeapi" | null (trống).
// Phản hồi PokeAPI (chỉ giữ phần cần dùng) lưu trong scripts/data/pokeapi-cache.json và được commit: chạy lại không cần
// mạng và luôn ra cùng kết quả. Chỉ tải những gì cache chưa có (kể cả "không có": lưu null). Xoá một mục để tải lại.
//
// Tên ability dễ đọc (abilityName, ability vẫn giữ id gốc), lấy theo thứ tự (abilityNameSource):
//   "mod"      file ngôn ngữ en_us của chính mod của viên đá (khoá cobblemon.ability.<id>), đọc từ file mod trong
//              megastone-src/ một lần rồi lưu ở scripts/data/megastone-ability-names.json (commit, chạy lại không cần jar;
//              xoá mục của một mod trong file đó để đọc lại từ jar)
//   "pokeapi"  tên tiếng Anh của ability trên PokeAPI (qua cache như trên)
//   "id"       không có ở đâu: giữ nguyên id
//   --offline     không tải gì và không đọc file mod, cache thiếu thì dừng (test dùng để kiểm tra chạy lại ra đúng data/megastones.js)
//   --out <file>  ghi ra file khác thay cho data/megastones.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { readZip } = require("./zip");
const { SRC_DIR, MOD_JARS, readJson } = require("./build-megastone-images");

const ROOT = path.join(__dirname, "..");
const INPUT = path.join(__dirname, "data", "mega-stones.csv");
const argv = process.argv.slice(2);
const OFFLINE = argv.includes("--offline");
const outAt = argv.indexOf("--out"), outFile = outAt >= 0 ? argv[outAt + 1] : null;
const OUTPUT = outAt < 0 ? path.join(ROOT, "data", "megastones.js") : outFile && !outFile.startsWith("--") ? path.resolve(outFile) : null;
const CACHE = path.join(__dirname, "data", "pokeapi-cache.json");
const MOD_NAMES = path.join(__dirname, "data", "megastone-ability-names.json");
const API = "https://pokeapi.co/api/v2";

const MODS = [
  { key: "mega-showdown", name: "Mega Showdown", author: "YajatKaul, Navas" },
  { key: "za-mega", name: "ZA Mega", author: "YajatKaul, Navas" },
  { key: "mushiromega", name: "Mushiromega", author: "" },
];

const COLUMNS = ["stone", "stone_id", "mod", "group", "pokemon", "form", "types", "hp", "atk", "def_", "spa", "spd", "spe",
  "bst", "ability", "data_source", "recipe"];
const STAT_COLUMNS = { hp: "hp", atk: "atk", def: "def_", spa: "spa", spd: "spd", spe: "spe" };
// Mod có Mega tự chế: dạng PokeAPI cùng tên (nếu có) là Pokémon khác, không dùng để lấp
const FAN_MADE_MODS = new Set(["mushiromega"]);
const FORMS = ["Mega", "Mega X", "Mega Y", "Mega Z"];
// Dạng Mega → đuôi tên dạng trên PokeAPI (vd. charizard-mega-x, tatsugiri-curly-mega)
const FORM_SUFFIX = { "Mega": "-mega", "Mega X": "-mega-x", "Mega Y": "-mega-y", "Mega Z": "-mega-z" };
const API_STATS = { hp: "hp", attack: "atk", defense: "def", "special-attack": "spa", "special-defense": "spd", speed: "spe" };
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
  if (bst !== null && !stats) fail("có BST nhưng không có chỉ số");
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
    typesSource: types.length ? "mod" : null,
    stats,
    bst,
    statsSource: stats ? "mod" : null,
    ability: row.ability || null,
    abilitySource: row.ability ? "mod" : null,
    abilityName: null, // tên dễ đọc, gắn sau (nameAbilities)
    abilityNameSource: null,
    recipe: parseRecipe(row.recipe),
  };
}

// ---- PokeAPI (qua cache) ----

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chỉ giữ phần dùng tới của từng loại phản hồi, để file cache nhỏ và dễ đọc khi xem diff.
const TRIM = {
  "pokemon-species": (j) => ({ name: j.name, varieties: j.varieties.map((v) => v.pokemon.name) }),
  // ability?limit=… (danh sách tên) hoặc ability/<tên> (tên tiếng Anh)
  "ability": (j) => (j.results ? { names: j.results.map((r) => r.name) }
    : { name: j.name, en: (j.names.find((n) => n.language.name === "en") || {}).name || null }),
  "pokemon": (j) => ({
    name: j.name,
    types: j.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    stats: Object.fromEntries(j.stats.map((s) => [API_STATS[s.stat.name], s.base_stat])),
    abilities: j.abilities.sort((a, b) => a.slot - b.slot).map((a) => ({ name: a.ability.name, hidden: a.is_hidden })),
  }),
};

// Cache: { "<endpoint>/<tên>": phản hồi đã rút gọn | null (PokeAPI không có) }
function loadCache() {
  return fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
}
function saveCache(cache) {
  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
  fs.writeFileSync(CACHE, JSON.stringify(sorted, null, 1) + "\n", "utf8");
}

// Lấy "<endpoint>/<tên>" từ cache, thiếu thì tải (404 → null). Lỗi mạng khác thì thử lại vài lần rồi dừng.
async function api(cache, key, stats) {
  if (key in cache) return cache[key];
  if (OFFLINE) throw new Error(`--offline: cache chưa có ${key}`);
  const endpoint = key.split(/[/?]/)[0];
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API}/${key}`, { signal: AbortSignal.timeout(20000) });
      if (res.status === 404) { cache[key] = null; break; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cache[key] = TRIM[endpoint](await res.json());
      break;
    } catch (err) {
      if (attempt >= 4) throw new Error(`PokeAPI ${key}: ${err.message}`);
      await sleep(1000 * attempt);
    }
  }
  stats.fetched++;
  await sleep(100); // nhẹ tay với PokeAPI
  return cache[key];
}

// Dạng Mega chính thức của viên đá trên PokeAPI: các variety của loài có đuôi tên đúng dạng. Một loài có thể có nhiều
// (vd. Tatsugiri: curly / droopy / stretchy) — trường nào các dạng giống nhau thì dùng, khác nhau thì bỏ.
// → { forms: [tên], types, stats, ability, why } (trường không lấy được là null; why: lý do cho từng trường thiếu)
async function officialMega(stone, cache, stats) {
  const none = (why) => ({ forms: [], types: null, stats: null, ability: null, why: { types: why, stats: why, ability: why } });
  if (FAN_MADE_MODS.has(stone.mod)) return none("fan-made Mega (not an official form)");
  if (!stone.pokemonId) return none("Pokémon not in the app");
  const species = await api(cache, `pokemon-species/${stone.pokemonId}`, stats);
  if (!species) return none(`PokeAPI has no species #${stone.pokemonId}`);
  const names = species.varieties.filter((n) => n.endsWith(FORM_SUFFIX[stone.form]));
  if (!names.length) return none(`PokeAPI has no ${stone.form} form of ${species.name}`);
  const forms = [];
  for (const n of names) forms.push(await api(cache, `pokemon/${n}`, stats));
  if (forms.some((f) => !f)) return none(`PokeAPI lists ${names.join(" / ")} but has no data for ${names.filter((n, i) => !forms[i]).join(" / ")}`);
  const why = {};
  const same = (field, pick) => {
    const vals = forms.map((f) => JSON.stringify(pick(f)));
    if (vals.some((v) => v === "null")) why[field] = `PokeAPI ${names.join(" / ")} lists no single ${field}`;
    else if (vals.some((v) => v !== vals[0])) why[field] = `PokeAPI forms ${names.join(" / ")} disagree`;
    return why[field] ? null : JSON.parse(vals[0]);
  };
  // Dạng Mega chỉ có một ability (không tính ability ẩn); không có hoặc nhiều hơn thì không biết lấy cái nào
  const ability = same("ability", (f) => {
    const list = f.abilities.filter((a) => !a.hidden);
    return list.length === 1 ? list[0].name.replace(/-/g, "") : null;
  });
  return { forms: names, types: same("types", (f) => f.types), stats: same("stats", (f) => f.stats), ability, why };
}

// Lấp ô trống của viên đá từ dạng Mega chính thức; ô mod đã có thì giữ, khác PokeAPI thì ghi vào conflicts.
// Hệ lạ trên PokeAPI thì dừng (như hệ lạ trong CSV).
function fillFromApi(stone, mega, conflicts) {
  const differ = (field, mine, theirs) => {
    if (theirs !== null && JSON.stringify(mine) !== JSON.stringify(theirs)) {
      conflicts.push(`${stone.name} ${field}: mod ${JSON.stringify(mine)}, PokeAPI ${JSON.stringify(theirs)}`);
    }
  };
  if (mega.types && mega.types.some((t) => !TYPES.includes(t))) throw new Error(`${stone.name}: hệ lạ trên PokeAPI "${mega.types.join("/")}"`);
  if (stone.types.length) differ("types", stone.types, mega.types);
  else if (mega.types) Object.assign(stone, { types: mega.types, typesSource: "pokeapi" });
  if (stone.stats) differ("stats", stone.stats, mega.stats);
  else if (mega.stats) Object.assign(stone, { stats: mega.stats, bst: Object.values(mega.stats).reduce((a, b) => a + b, 0), statsSource: "pokeapi" });
  if (stone.ability) differ("ability", stone.ability.toLowerCase(), mega.ability);
  else if (mega.ability) Object.assign(stone, { ability: mega.ability, abilitySource: "pokeapi" });
}

// Các dòng của CSV → [{ row: { cột: ô }, line }] (bỏ dòng trống). Sai tiêu đề hoặc sai số ô thì dừng.
function readCsvRows(file = INPUT) {
  const lines = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  if (header.join() !== COLUMNS.join()) throw new Error(`Tiêu đề CSV khác dự kiến:\n  ${header.join()}\n  cần: ${COLUMNS.join()}`);
  const rows = [];
  lines.slice(1).forEach((text, i) => {
    if (!text.trim()) return;
    const cells = parseCsvLine(text);
    if (cells.length !== COLUMNS.length) throw new Error(`Dòng ${i + 2}: có ${cells.length} ô, cần ${COLUMNS.length}`);
    rows.push({ row: Object.fromEntries(COLUMNS.map((c, k) => [c, cells[k].trim()])), line: i + 2 });
  });
  return rows;
}

// Tên ability trong file ngôn ngữ en_us của từng mod: { modKey: { id: tên } }. Mod nào file lưu chưa có thì đọc từ jar.
function loadModAbilityNames() {
  const saved = fs.existsSync(MOD_NAMES) ? JSON.parse(fs.readFileSync(MOD_NAMES, "utf8")) : {};
  const missing = MODS.filter((m) => !saved[m.key]);
  for (const mod of missing) {
    const where = `chưa có tên ability của ${mod.name} trong ${path.relative(ROOT, MOD_NAMES)}`;
    if (OFFLINE) throw new Error(`--offline: ${where}`);
    const jars = fs.existsSync(SRC_DIR) ? fs.readdirSync(SRC_DIR).filter((f) => MOD_JARS[mod.key].test(f)) : [];
    if (jars.length !== 1) throw new Error(`${where}; cần đúng 1 file mod khớp ${MOD_JARS[mod.key]} trong megastone-src/, thấy ${jars.length}`);
    const jar = jars[0], zip = readZip(path.join(SRC_DIR, jar));
    const names = {};
    for (const file of zip.names().filter((n) => /^assets\/[^/]+\/lang\/en_us\.json$/.test(n)).sort()) {
      for (const [k, v] of Object.entries(readJson(zip, file))) {
        const m = k.match(/^cobblemon\.ability\.([^.]+)$/);
        if (!m) continue;
        const id = m[1].toLowerCase();
        if (id in names && names[id] !== v) throw new Error(`${jar}: ability "${id}" có hai tên: "${names[id]}" và "${v}" (${file})`);
        names[id] = v;
      }
    }
    saved[mod.key] = Object.fromEntries(Object.keys(names).sort().map((k) => [k, names[k]]));
  }
  if (missing.length) fs.writeFileSync(MOD_NAMES, JSON.stringify(saved, null, 1) + "\n", "utf8");
  return saved;
}

// Gắn abilityName / abilityNameSource cho mọi viên có ability (mod → PokeAPI → id); viên không có ability giữ null.
async function nameAbilities(stones, cache, stats) {
  const modNames = loadModAbilityNames();
  let apiIds = null; // id viết liền (toughclaws) → tên trên PokeAPI (tough-claws)
  for (const s of stones) {
    if (!s.ability) continue;
    const id = s.ability.toLowerCase();
    const fromMod = (modNames[s.mod] || {})[id];
    if (fromMod) { Object.assign(s, { abilityName: fromMod, abilityNameSource: "mod" }); continue; }
    if (!apiIds) apiIds = new Map((await api(cache, "ability?limit=2000", stats)).names.map((n) => [n.replace(/-/g, ""), n]));
    const ab = apiIds.has(id) ? await api(cache, `ability/${apiIds.get(id)}`, stats) : null;
    Object.assign(s, ab && ab.en ? { abilityName: ab.en, abilityNameSource: "pokeapi" } : { abilityName: s.ability, abilityNameSource: "id" });
  }
}

async function main() {
  if (!OUTPUT) throw new Error("--out cần tên file");
  const dex = loadBaseDex();
  const stones = readCsvRows().map(({ row, line }) => buildStone(row, line, dex));
  const dup = stones.filter((s, i) => stones.findIndex((t) => t.id === s.id) !== i);
  if (dup.length) throw new Error(`stone_id bị trùng: ${dup.map((s) => s.id).join(", ")}`);

  // Lấp ô trống từ PokeAPI (chỉ những viên còn thiếu hệ, chỉ số hoặc ability)
  const cache = loadCache(), apiStats = { fetched: 0 };
  const conflicts = [], stillMissing = [];
  const isIncomplete = (s) => !s.types.length || !s.stats || !s.ability;
  try {
    for (const s of stones.filter(isIncomplete)) {
      const mega = await officialMega(s, cache, apiStats);
      fillFromApi(s, mega, conflicts);
      if (isIncomplete(s)) {
        const gaps = [!s.types.length && "types", !s.stats && "stats", !s.ability && "ability"].filter(Boolean);
        stillMissing.push(`${s.name} (${s.form} ${s.pokemon}): ${gaps.map((f) => `${f} — ${mega.why[f]}`).join("; ")}`);
      }
    }
    await nameAbilities(stones, cache, apiStats);
  } finally {
    if (apiStats.fetched) saveCache(cache); // giữ phần đã tải được kể cả khi dừng giữa chừng
  }

  const content =
    `// File này được sinh tự động bởi scripts/build-megastones.js — đừng sửa tay.\n` +
    `// Nguồn: scripts/data/mega-stones.csv (dữ liệu đá Mega của các mod Cobblemon); ô mod để trống lấp từ PokeAPI\n` +
    `// (scripts/data/pokeapi-cache.json), xem typesSource / statsSource / abilitySource. Ngày tạo: ${new Date().toISOString().slice(0, 10)}\n` +
    `const MEGA_STONE_MODS = [\n${MODS.map((m) => "  " + JSON.stringify(m)).join(",\n")}\n];\n` +
    `const MEGA_STONE_DATA = [\n${stones.map((s) => "  " + JSON.stringify(s)).join(",\n")}\n];\n`;
  fs.writeFileSync(OUTPUT, content, "utf8");

  console.log(`Đã ghi ${OUTPUT}: ${stones.length} viên đá`);
  for (const m of MODS) console.log(`  ${m.name.padEnd(14)} ${stones.filter((s) => s.mod === m.key).length}`);
  const missing = [...new Set(stones.filter((s) => !s.pokemonId).map((s) => s.pokemon))];
  if (missing.length) console.log(`  Pokémon không có trong app (chỉ hiện biểu tượng đá): ${missing.join(", ")}`);
  const filled = (f) => stones.filter((s) => s[f] === "pokeapi").length;
  console.log(`  Lấp từ PokeAPI: hệ ${filled("typesSource")}, chỉ số ${filled("statsSource")}, ability ${filled("abilitySource")}`
    + ` (tải mới ${apiStats.fetched} mục, còn lại từ cache)`);
  const named = (src) => stones.filter((s) => s.abilityNameSource === src);
  const distinct = (list) => new Set(list.map((s) => `${s.mod}:${s.ability.toLowerCase()}`)).size;
  console.log(`  Tên ability: từ mod ${named("mod").length} viên (${distinct(named("mod"))} ability), từ PokeAPI ${named("pokeapi").length}`
    + ` (${distinct(named("pokeapi"))}), giữ id ${named("id").length} (${distinct(named("id"))})`
    + (named("id").length ? `: ${[...new Set(named("id").map((s) => s.ability))].join(", ")}` : ""));
  if (stillMissing.length) console.log(`  Vẫn thiếu (${stillMissing.length}):\n    ${stillMissing.join("\n    ")}`);
  if (conflicts.length) console.log(`  Mod khác PokeAPI (giữ dữ liệu mod, ${conflicts.length}):\n    ${conflicts.join("\n    ")}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("\nThất bại:", err.message);
    console.error("megastones.js chưa được ghi.");
    process.exit(1);
  });
}
module.exports = { readCsvRows, fillFromApi, STAT_COLUMNS };
