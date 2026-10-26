// Sinh file data.js từ PokeAPI cho Pokémon #1–#1025.
// Chạy (cần Node.js 18 trở lên):  node scripts/build-data.js

const fs = require("fs");
const path = require("path");

const API = "https://pokeapi.co/api/v2";
const TOTAL = 1025;
const CONCURRENCY = 10; // số request chạy cùng lúc
const MAX_RETRIES = 5;
const TIMEOUT_MS = 20000;
const OUTPUT = path.join(__dirname, "..", "data.js");

// Gen theo khoảng ID: [gen, idĐầu, idCuối]
const GEN_RANGES = [
  [1, 1, 151],
  [2, 152, 251],
  [3, 252, 386],
  [4, 387, 493],
  [5, 494, 649],
  [6, 650, 721],
  [7, 722, 809],
  [8, 810, 905],
  [9, 906, 1025],
];

function genOf(id) {
  const range = GEN_RANGES.find(([, from, to]) => id >= from && id <= to);
  return range[0];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Gọi API, tự thử lại khi lỗi mạng / lỗi server / bị giới hạn tốc độ.
async function fetchJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return await res.json();
      // Lỗi 4xx (trừ 429) là lỗi thật, thử lại cũng vô ích.
      if (res.status !== 429 && res.status < 500) {
        throw Object.assign(new Error(`HTTP ${res.status} tại ${url}`), { fatal: true });
      }
      throw new Error(`HTTP ${res.status} tại ${url}`);
    } catch (err) {
      if (err.fatal || attempt >= MAX_RETRIES) throw err;
      const wait = 500 * 2 ** (attempt - 1); // 0.5s, 1s, 2s, 4s...
      console.warn(`  ! Lỗi (${err.message}), thử lại lần ${attempt} sau ${wait}ms`);
      await sleep(wait);
    }
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function fetchPokemon(id) {
  // Gọi tuần tự 2 endpoint để mỗi "worker" chỉ chiếm 1 request tại một thời điểm.
  const pokemon = await fetchJson(`${API}/pokemon/${id}`);
  const species = await fetchJson(`${API}/pokemon-species/${id}`);

  // Dùng tên tiếng Anh của loài (vd "Mr. Mime", "Deoxys") thay vì tên kỹ thuật ("mr-mime", "deoxys-normal").
  const enName = species.names.find((n) => n.language.name === "en");

  return {
    id,
    name: enName ? enName.name : capitalize(species.name),
    gen: genOf(id),
    types: pokemon.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    bst: pokemon.stats.reduce((sum, s) => sum + s.base_stat, 0),
    isLegendary: species.is_legendary,
    isMythical: species.is_mythical,
  };
}

// Chạy danh sách việc với tối đa `limit` việc cùng lúc.
async function runPool(ids, limit, task) {
  const results = new Array(ids.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < ids.length) {
      const i = next++;
      results[i] = await task(ids[i]);
      done++;
      if (done % 50 === 0 || done === ids.length) {
        console.log(`  Đã tải ${done}/${ids.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  if (typeof fetch !== "function") {
    console.error("Cần Node.js 18 trở lên (để có sẵn hàm fetch). Kiểm tra bằng: node --version");
    process.exit(1);
  }

  console.log(`Đang tải ${TOTAL} Pokémon từ PokeAPI (${CONCURRENCY} request cùng lúc)...`);
  const started = Date.now();
  const ids = Array.from({ length: TOTAL }, (_, i) => i + 1);
  const list = await runPool(ids, CONCURRENCY, fetchPokemon);

  const lines = list.map((p) => "  " + JSON.stringify(p));
  const content =
    `// File này được sinh tự động bởi scripts/build-data.js — đừng sửa tay.\n` +
    `// Nguồn: PokeAPI (https://pokeapi.co). Ngày tạo: ${new Date().toISOString().slice(0, 10)}\n` +
    `const POKEMON_DATA = [\n${lines.join(",\n")}\n];\n`;
  fs.writeFileSync(OUTPUT, content, "utf8");

  // Thống kê nhanh để kiểm tra
  console.log(`\nXong sau ${((Date.now() - started) / 1000).toFixed(1)} giây. Đã ghi ${OUTPUT}`);
  for (const [gen] of GEN_RANGES) {
    console.log(`  Gen ${gen}: ${list.filter((p) => p.gen === gen).length} con`);
  }
  const legend = list.filter((p) => p.isLegendary).length;
  const mythic = list.filter((p) => p.isMythical).length;
  console.log(`  Huyền thoại: ${legend}, Thần thoại: ${mythic}`);
}

main().catch((err) => {
  console.error("\nThất bại:", err.message);
  console.error("data.js chưa được ghi. Kiểm tra kết nối mạng rồi chạy lại.");
  process.exit(1);
});
