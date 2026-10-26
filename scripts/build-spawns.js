// Sinh file spawns.js (nơi xuất hiện của Pokémon trong modpack Cobbleverse)
// từ trang Cobbleverse Wiki: https://thenolan1234.github.io/cobbleverse-wiki/spawns.html
// Chạy (cần Node.js 18 trở lên):  node scripts/build-spawns.js

const fs = require("fs");
const path = require("path");

const SOURCE_URL = "https://thenolan1234.github.io/cobbleverse-wiki/spawns.html";
const OUTPUT = path.join(__dirname, "..", "spawns.js");
const MAX_RETRIES = 5;

const BUCKET_ORDER = ["common", "uncommon", "rare", "ultra-rare"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      const wait = 1000 * 2 ** (attempt - 1);
      console.warn(`  ! Lỗi (${err.message}), thử lại lần ${attempt} sau ${wait}ms`);
      await sleep(wait);
    }
  }
}

// Trang wiki nhúng dữ liệu dạng `const DATA={...};` — cắt đúng khối {...} rồi đọc như JSON.
function extractData(html) {
  const marker = "const DATA=";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("Không tìm thấy 'const DATA=' — có thể trang wiki đã đổi cấu trúc.");
  let i = start + marker.length;
  let depth = 0;
  let inString = false;
  for (let j = i; j < html.length; j++) {
    const ch = html[j];
    if (inString) {
      if (ch === "\\") j++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(html.slice(i, j + 1));
  }
  throw new Error("Khối DATA không đóng ngoặc đúng.");
}

// "#cobblemon:is_jungle" → "Jungle", "cobbleverse:custom_spawn/sky_pillar" → "Sky Pillar"
function prettyBiome(ref) {
  return ref.replace(/^#/, "").split(":").pop().split("/").pop()
    .replace(/^is_/, "").replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cap(s) {
  return s.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Gộp danh sách dạng (aspects) thành chữ dễ đọc:
// ["character=a", "character=b"] → "Character: A, B";  ["alolan"] → "Alolan";  [""] → "" (dạng thường)
function prettyForms(aspectList) {
  const groups = new Map(); // khóa → tập giá trị ("" = tên dạng không có khóa)
  for (const aspect of aspectList) {
    const tokens = aspect ? aspect.split(/\s+/) : ["normal"];
    for (const t of tokens) {
      const [k, v] = t.includes("=") ? t.split("=") : ["", t];
      if (!groups.has(k)) groups.set(k, new Set());
      groups.get(k).add(v);
    }
  }
  if (groups.size === 1 && groups.has("") && [...groups.get("")].join() === "normal") return "";
  return [...groups].map(([k, vals]) => {
    const list = [...vals].map(cap).join(", ");
    return k ? `${cap(k)}: ${list}` : list;
  }).join(" · ");
}

function uniq(list) {
  return [...new Set(list)];
}

// Gọn dữ liệu mỗi lần xuất hiện, bỏ các trường rỗng để file nhỏ (chưa gồm dạng/form).
function compactEntry(e) {
  const out = { b: e.bucket, l: e.level };
  if (e.ctx && e.ctx !== "grounded") out.c = e.ctx;
  out.in = uniq(e.biomes.map(prettyBiome));
  const anti = uniq(e.anti.map(prettyBiome));
  if (anti.length) out.ex = anti;
  if (e.cond) out.cond = e.cond;
  if (e.wmult) out.w = e.wmult;
  return out;
}

// Gộp các mục giống hệt nhau chỉ khác dạng (vd. Unown có 28 chữ cái cùng một nơi).
function mergeEntries(entries) {
  const merged = new Map();
  for (const e of entries) {
    const entry = compactEntry(e);
    const key = JSON.stringify(entry);
    if (!merged.has(key)) merged.set(key, { entry, aspects: [] });
    merged.get(key).aspects.push(e.aspects);
  }
  return [...merged.values()].map(({ entry, aspects }) => {
    const form = prettyForms(aspects);
    // Đặt dạng (f) ngay sau cấp độ cho dễ đọc
    return form ? { b: entry.b, l: entry.l, f: form, ...entry } : entry;
  });
}

async function main() {
  if (typeof fetch !== "function") {
    console.error("Cần Node.js 18 trở lên (để có sẵn hàm fetch). Kiểm tra bằng: node --version");
    process.exit(1);
  }

  console.log(`Đang tải ${SOURCE_URL} ...`);
  const data = extractData(await fetchText(SOURCE_URL));

  const byDex = {};
  let entryCount = 0;
  for (const [speciesId, entries] of Object.entries(data.spawnsBy)) {
    const species = data.species[speciesId];
    if (!species || !species.dex || species.dex > 1025) continue;
    // Bỏ các mục đánh dấu "không xuất hiện tự nhiên".
    const real = entries.filter((e) => !e.biomes.every((b) => b === "cobbleverse:not_spawn"));
    if (!real.length) continue;
    real.sort((a, b) =>
      BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) || b.weight - a.weight);
    const merged = mergeEntries(real);
    byDex[species.dex] = { id: speciesId, entries: merged };
    entryCount += merged.length;
  }

  const lines = Object.keys(byDex)
    .sort((a, b) => a - b)
    .map((dex) => `  ${dex}: ${JSON.stringify(byDex[dex])}`);
  const content =
    `// File này được sinh tự động bởi scripts/build-spawns.js — đừng sửa tay.\n` +
    `// Nguồn: Cobbleverse Wiki (${SOURCE_URL}). Ngày tạo: ${new Date().toISOString().slice(0, 10)}\n` +
    `const SPAWN_DATA = {\n${lines.join(",\n")}\n};\n`;
  fs.writeFileSync(OUTPUT, content, "utf8");

  const missing = [];
  for (let dex = 1; dex <= 1025; dex++) if (!byDex[dex]) missing.push(dex);
  console.log(`Xong. ${Object.keys(byDex).length} Pokémon có nơi xuất hiện (${entryCount} mục). Đã ghi ${OUTPUT}`);
  console.log(`  Không có nơi xuất hiện tự nhiên (${missing.length}): #${missing.join(", #")}`);
}

main().catch((err) => {
  console.error("\nThất bại:", err.message);
  console.error("spawns.js chưa được ghi.");
  process.exit(1);
});
