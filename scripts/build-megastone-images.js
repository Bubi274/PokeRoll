// Chép ảnh item (PNG 16×16 gốc, không chỉnh sửa) của từng viên đá Mega trong data/megastones.js từ file mod trong
// megastone-src/ vào assets/images/megastones/<stone_id>.png.
// Chạy (cần Node.js 18 trở lên):  node scripts/build-megastone-images.js
//
// Cần 3 file mod (.jar, tải từ trang của mod) trong megastone-src/ — thư mục này không được commit.
// Tìm ảnh theo dữ liệu của mod, không đoán tên ảnh từ stone_id:
//   1. Định nghĩa Mega của mod có "showdown_id" = stone_id. Theo quy ước của Mega Showdown (Mushiromega, ZA Mega dùng
//      lại), tên file định nghĩa data/<ns>/mega_showdown/mega/<item>.json là item id của viên đá (vd. charizardite_x)
//   2. assets/<ns>/models/item/<item>.json → textures.layer0 (theo "parent" nếu model kế thừa model khác của mod)
//   3. "<ns2>:item/<tên>" → assets/<ns2>/textures/item/<tên>.png  (vd. Mushiromega: azumarillite → azumarillmega.png)
// Thiếu ảnh của viên nào, hoặc ảnh không phải PNG 16×16, thì dừng và không ghi gì.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { readZip } = require("./zip");

const ROOT = path.join(__dirname, "..");
const SRC_DIR = path.join(ROOT, "megastone-src");
const OUT_DIR = path.join(ROOT, "assets", "images", "megastones");

// File mod của từng mod trong data/megastones.js (key của MEGA_STONE_MODS)
const MOD_JARS = {
  "mega-showdown": /^mega_showdown-.*\.jar$/,
  "za-mega": /^zamega-.*\.jar$/,
  "mushiromega": /^mushiromega-.*\.jar$/,
};
const SIZE = 16;

function loadStones() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "data", "megastones.js"), "utf8") + ";globalThis.__s = MEGA_STONE_DATA;", ctx);
  return ctx.__s;
}

// "ns:item/abc" → ["ns", "item/abc"]; không có ns thì là "minecraft"
const splitId = (id) => (id.includes(":") ? id.split(":") : ["minecraft", id]);

// JSON trong file mod (bỏ BOM); lỗi thì báo kèm tên file trong jar.
function readJson(zip, name) {
  try {
    return JSON.parse(zip.text(name).replace(/^\uFEFF/, ""));
  } catch (err) {
    throw new Error(`${name}: JSON không đọc được (${err.message})`);
  }
}

// Mỗi mod: showdown_id → { ns, item } đọc từ các file định nghĩa Mega của mod.
function megaDefinitions(zip) {
  const defs = new Map();
  for (const name of zip.names()) {
    const m = name.match(/^data\/([^/]+)\/mega_showdown\/mega\/([^/]+)\.json$/);
    if (!m) continue;
    const id = readJson(zip, name).showdown_id;
    if (!id) continue;
    if (defs.has(id)) throw new Error(`showdown_id "${id}" có hai định nghĩa: ${defs.get(id).file} và ${name}`);
    defs.set(id, { ns: m[1], item: m[2], file: name });
  }
  return defs;
}

// Texture layer0 của model item, theo chuỗi "parent" trong cùng file mod (tối đa vài bậc).
function itemTexture(zip, ns, item) {
  let model = `assets/${ns}/models/item/${item}.json`;
  for (let depth = 0; depth < 5; depth++) {
    if (!zip.has(model)) return { error: `không có ${model}` };
    const json = readJson(zip, model);
    if (json.textures && json.textures.layer0) {
      const [tns, tpath] = splitId(json.textures.layer0);
      return { model, png: `assets/${tns}/textures/${tpath}.png` };
    }
    if (!json.parent) return { error: `${model} không có textures.layer0` };
    const [pns, ppath] = splitId(json.parent);
    model = `assets/${pns}/models/${ppath}.json`;
  }
  return { error: `chuỗi parent quá dài (${model})` };
}

// Kích thước từ khối IHDR; null nếu không phải PNG.
function pngSize(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig) || buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function main() {
  if (!fs.existsSync(SRC_DIR)) throw new Error("Không có thư mục megastone-src/ — đặt 3 file mod .jar vào đó");
  const files = fs.readdirSync(SRC_DIR);
  const mods = {};
  for (const [mod, pattern] of Object.entries(MOD_JARS)) {
    const jar = files.filter((f) => pattern.test(f));
    if (jar.length !== 1) throw new Error(`Cần đúng 1 file mod cho ${mod} trong megastone-src/ (khớp ${pattern}), thấy ${jar.length}`);
    const zip = readZip(path.join(SRC_DIR, jar[0]));
    mods[mod] = { jar: jar[0], zip, defs: megaDefinitions(zip) };
  }

  const stones = loadStones();
  const found = [], problems = [];
  for (const s of stones) {
    const mod = mods[s.mod];
    if (!mod) { problems.push(`${s.id}: mod lạ "${s.mod}"`); continue; }
    const def = mod.defs.get(s.id);
    if (!def) { problems.push(`${s.id}: ${mod.jar} không có định nghĩa Mega với showdown_id "${s.id}"`); continue; }
    const tex = itemTexture(mod.zip, def.ns, def.item);
    if (tex.error) { problems.push(`${s.id}: ${tex.error}`); continue; }
    if (!mod.zip.has(tex.png)) { problems.push(`${s.id}: ${tex.model} trỏ tới ${tex.png} nhưng file không có`); continue; }
    const png = mod.zip.bytes(tex.png);
    const size = pngSize(png);
    if (!size) { problems.push(`${s.id}: ${tex.png} không phải PNG`); continue; }
    if (size.width !== SIZE || size.height !== SIZE) { problems.push(`${s.id}: ${tex.png} là ${size.width}×${size.height}, cần ${SIZE}×${SIZE}`); continue; }
    found.push({ s, png, from: `${mod.jar}: ${tex.png}`, item: def.item });
  }

  if (problems.length) {
    console.error(`Không tìm được ảnh cho ${problems.length}/${stones.length} viên:`);
    for (const p of problems) console.error(`  ${p}`);
    throw new Error("chưa ghi ảnh nào");
  }

  // Ghi lại toàn bộ thư mục: bỏ ảnh cũ của viên không còn trong dữ liệu
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const keep = new Set(found.map((f) => `${f.s.id}.png`));
  for (const f of fs.readdirSync(OUT_DIR)) if (f.endsWith(".png") && !keep.has(f)) fs.rmSync(path.join(OUT_DIR, f));
  for (const f of found) fs.writeFileSync(path.join(OUT_DIR, `${f.s.id}.png`), f.png);

  console.log(`Đã chép ${found.length}/${stones.length} ảnh vào ${path.relative(ROOT, OUT_DIR)}/`);
  for (const [mod, m] of Object.entries(mods)) console.log(`  ${m.jar.padEnd(44)} ${found.filter((f) => f.s.mod === mod).length}`);
  const renamed = found.filter((f) => path.basename(f.from, ".png") !== f.s.id);
  if (renamed.length) {
    console.log(`  Ảnh có tên khác stone_id (tìm qua định nghĩa Mega + model item): ${renamed.length}`);
    for (const f of renamed) console.log(`    ${f.s.id.padEnd(16)} ← ${f.from}`);
  }
}

try {
  main();
} catch (err) {
  console.error("\nThất bại:", err.message);
  process.exit(1);
}
