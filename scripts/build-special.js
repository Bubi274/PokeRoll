// Sinh file special.js (nhóm "Special" — Pokémon custom từ addon Cobblemon) từ file mod đã tải về special-src/,
// và tải ảnh GIF của từng con vào images/special/ (bỏ qua ảnh đã có).
// Chạy (cần Node.js 18 trở lên):  node scripts/build-special.js
//
// Muốn thêm một nhóm custom mới: thêm một mục vào GROUPS bên dưới (file mod, danh sách Pokémon, link ảnh)
// rồi chạy lại script. App tự hiện thêm một ô "Special" cho nhóm đó.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const SRC_DIR = path.join(ROOT, "special-src");
const IMAGE_DIR = path.join(ROOT, "images", "special");
const OUTPUT = path.join(ROOT, "special.js");

const GROUPS = [
  {
    key: "kazeran",
    name: "Kazeran",
    title: "Kazeran Eeveelutions",
    url: "https://modrinth.com/datapack/kazeran-eeveelutions",
    license: "CC-BY-NC-4.0",
    zip: /^Kazeran_Eeveelutions_v([\d.]+)\.zip$/, // file mod trong special-src/ (bắt phiên bản)
    form: "Kazeran",                               // tên dạng trong species_additions
    evolvesFrom: "eevee",                          // các cách tiến hóa nằm trong species_additions/eevee.json
    // Thứ tự = thứ tự số Pokédex của dạng gốc. Ảnh GIF lấy từ trang Modrinth của mod.
    pokemon: [
      ["vaporeon", "https://cdn.modrinth.com/data/cached_images/9f8f2973a96f0ddad9cad19758c5217f63c0dbb4.gif"],
      ["jolteon", "https://cdn.modrinth.com/data/cached_images/1f05f02d1ba85ef8d603e6fd42f3810104150747.gif"],
      ["flareon", "https://cdn.modrinth.com/data/cached_images/a8fc2231a2495d1a8c13f6f0ed19009708ba7fe0.gif"],
      ["espeon", "https://cdn.modrinth.com/data/cached_images/f9cd412434e208f4dc1557036a54a6c4001d9005.gif"],
      ["umbreon", "https://cdn.modrinth.com/data/cached_images/0760b98d14d3aa38c75314057f8ba82c2e37db50.gif"],
      ["leafeon", "https://cdn.modrinth.com/data/cached_images/a642bc747d2d6563f9e2960b65faa84249686788.gif"],
      ["glaceon", "https://cdn.modrinth.com/data/cached_images/5bbf51bb26ddfd91ea7c1fb2b1423dab768cb8da.gif"],
      ["sylveon", "https://cdn.modrinth.com/data/cached_images/35f5920f56e2fc42b25140070b1501a383dd288f.gif"],
    ],
  },
];

// Tag biome của Minecraft → mô tả dễ hiểu. Gặp tag lạ thì script dừng để thêm vào đây.
const BIOME_TAGS = {
  "#minecraft:is_nether": "In the Nether",
  "#minecraft:has_structure/desert_pyramid": "In a Desert biome (where Desert Pyramids generate)",
  "#minecraft:has_structure/woodland_mansion": "In a Dark Forest biome (where Woodland Mansions generate)",
};

// ----- Đọc file .zip (chỉ dùng thư viện có sẵn của Node) -----

function readZip(file) {
  const buf = fs.readFileSync(file);
  // Tìm "End of central directory" ở cuối file
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`${file} không phải file zip hợp lệ`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Central directory hỏng");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.set(name, { method, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: () => [...entries.keys()],
    text(name) {
      const e = entries.get(name);
      if (!e) throw new Error(`Không thấy ${name} trong ${path.basename(file)}`);
      const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      const data = buf.subarray(start, start + e.size);
      if (e.method === 0) return data.toString("utf8");
      if (e.method === 8) return zlib.inflateRawSync(data).toString("utf8");
      throw new Error(`Kiểu nén ${e.method} chưa hỗ trợ (${name})`);
    },
  };
}

// ----- Chuyển dữ liệu mod sang dữ liệu app -----

const titleCase = (s) => s.replace(/(^|[_\s-])(\w)/g, (_, sep, c) => (sep ? " " : "") + c.toUpperCase());
// "cobblemon:water_gem" → "Water Gem"
const itemName = (id) => titleCase(id.split(":").pop());
const withArticle = (s) => (/^[aeiou]/i.test(s) ? "an " : "a ") + s;

// Một điều kiện tiến hóa → câu mô tả ngắn (tiếng Anh, giống giao diện app).
function describeRequirement(r) {
  switch (r.variant) {
    case "held_item": return `While Eevee holds ${withArticle(itemName(r.itemCondition))}`;
    case "friendship": return `${r.amount}+ friendship`;
    case "time_range": return { day: "During the day", night: "At night" }[r.range] || `Time: ${r.range}`;
    case "has_move_type": return `Eevee knows ${withArticle(titleCase(r.type))}-type move`;
    case "biome":
      if (!BIOME_TAGS[r.biomeCondition]) throw new Error(`Chưa có mô tả cho biome ${r.biomeCondition} (thêm vào BIOME_TAGS)`);
      return BIOME_TAGS[r.biomeCondition];
    default:
      throw new Error(`Chưa hỗ trợ điều kiện tiến hóa "${r.variant}"`);
  }
}

function describeEvolution(evo, fromName) {
  if (evo.variant !== "item_interact") throw new Error(`Chưa hỗ trợ kiểu tiến hóa "${evo.variant}"`);
  return {
    how: `Use ${withArticle(itemName(evo.requiredContext))} on ${fromName}`,
    conditions: evo.requirements.map(describeRequirement),
  };
}

// Tên và số Pokédex của dạng gốc lấy từ data.js (không sửa data.js).
function loadBaseDex() {
  const ctx = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "data.js"), "utf8") + "\nthis.list = POKEMON_DATA;", ctx);
  return new Map(ctx.list.map((p) => [p.name.toLowerCase(), p]));
}

function buildGroup(group, baseDex) {
  const zipName = fs.readdirSync(SRC_DIR).find((f) => group.zip.test(f));
  if (!zipName) throw new Error(`Không thấy file mod của nhóm ${group.name} trong special-src/`);
  const version = zipName.match(group.zip)[1];
  const zip = readZip(path.join(SRC_DIR, zipName));
  const additions = (name) => JSON.parse(zip.text(
    zip.names().find((n) => n.endsWith(`/species_additions/${name}.json`))));

  // Tác giả: lấy từ pack.mcmeta ("... by §bKazerio"), bỏ mã màu §x của Minecraft.
  const description = JSON.parse(zip.text("pack.mcmeta")).pack.description.replace(/§./g, "");
  const author = (description.match(/\bby\s+(.+)$/) || [])[1];
  if (!author) throw new Error(`Không đọc được tên tác giả trong pack.mcmeta: "${description}"`);

  const fromDex = baseDex.get(group.evolvesFrom);
  const evolutions = additions(group.evolvesFrom).evolutions;

  const pokemon = group.pokemon.map(([species]) => {
    const base = baseDex.get(species);
    const form = additions(species).forms.find((f) => f.name === group.form);
    if (!form) throw new Error(`${species}.json không có dạng ${group.form}`);
    if (!form.baseStats) throw new Error(`${species} ${group.form} không có base stats riêng`);
    const evo = evolutions.find((e) => e.result === `${species} ${group.form.toLowerCase()}`);
    if (!evo) throw new Error(`Không thấy cách tiến hóa ra ${species} ${group.form}`);
    const slug = `${group.key}-${species}`;
    return {
      id: slug,
      name: `${group.form} ${base.name}`,
      gen: group.key, // khóa nhóm: dùng để chọn nhóm vào hòm (như số gen của Pokémon thường)
      group: group.key,
      baseId: base.id,
      baseName: base.name,
      types: [form.primaryType, form.secondaryType].filter(Boolean),
      bst: Object.values(form.baseStats).reduce((sum, v) => sum + v, 0),
      isLegendary: false,
      isMythical: false,
      image: `images/special/${slug}.gif`,
      evolution: describeEvolution(evo, fromDex.name),
    };
  });

  return {
    info: { key: group.key, name: group.name, title: group.title, author, version, url: group.url, license: group.license },
    pokemon,
  };
}

async function downloadImages(group) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  for (const [species, url] of group.pokemon) {
    const file = path.join(IMAGE_DIR, `${group.key}-${species}.gif`);
    if (fs.existsSync(file)) continue;
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ${url}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`  Đã tải ${path.relative(ROOT, file)}`);
  }
}

async function main() {
  const baseDex = loadBaseDex();
  const built = GROUPS.map((g) => buildGroup(g, baseDex));
  for (const g of GROUPS) await downloadImages(g);

  const groups = built.map((b) => "  " + JSON.stringify(b.info));
  const lines = built.flatMap((b) => b.pokemon).map((p) => "  " + JSON.stringify(p));
  const content =
    `// File này được sinh tự động bởi scripts/build-special.js — đừng sửa tay.\n` +
    `// Nguồn: file mod trong special-src/. Ngày tạo: ${new Date().toISOString().slice(0, 10)}\n` +
    `const SPECIAL_GROUPS = [\n${groups.join(",\n")}\n];\n` +
    `const SPECIAL_DATA = [\n${lines.join(",\n")}\n];\n`;
  fs.writeFileSync(OUTPUT, content, "utf8");

  console.log(`Đã ghi ${OUTPUT}`);
  for (const b of built) {
    console.log(`  ${b.info.title} v${b.info.version} by ${b.info.author} (${b.info.license}): ${b.pokemon.length} con`);
    for (const p of b.pokemon) console.log(`    ${p.name.padEnd(18)} ${p.types.join("/").padEnd(16)} BST ${p.bst}`);
  }
}

main().catch((err) => {
  console.error("\nThất bại:", err.message);
  console.error("special.js chưa được ghi.");
  process.exit(1);
});
