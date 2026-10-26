// Tải sẵn ảnh Pokémon #1–#1025 vào thư mục images/ để app không phải tải ảnh qua mạng mỗi lần quay.
//   images/artwork[/shiny]/{id}.webp — ảnh artwork thu nhỏ còn 256px (WebP)
//   images/sprite[/shiny]/{id}.png   — ảnh nhỏ 96×96 giữ nguyên
// Chạy (cần Node.js 18 trở lên và đã `npm install`):  node scripts/build-images.js
// File đã có sẽ được bỏ qua, nên chạy lại chỉ tải phần còn thiếu.

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SOURCE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const TOTAL = 1025;
const CONCURRENCY = 10; // số request chạy cùng lúc
const MAX_RETRIES = 5;
const TIMEOUT_MS = 30000;
const ARTWORK_SIZE = 256;
const WEBP_QUALITY = 80;
const OUT_DIR = path.join(__dirname, "..", "images");

// Mỗi loại ảnh: nguồn tải và nơi lưu.
const KINDS = [
  { name: "artwork", src: (id) => `${SOURCE}/other/official-artwork/${id}.png`, out: (id) => `artwork/${id}.webp` },
  { name: "artwork shiny", src: (id) => `${SOURCE}/other/official-artwork/shiny/${id}.png`, out: (id) => `artwork/shiny/${id}.webp` },
  { name: "sprite", src: (id) => `${SOURCE}/${id}.png`, out: (id) => `sprite/${id}.png` },
  { name: "sprite shiny", src: (id) => `${SOURCE}/shiny/${id}.png`, out: (id) => `sprite/shiny/${id}.png` },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Tải file, tự thử lại khi lỗi mạng / lỗi server / bị giới hạn tốc độ.
async function fetchBuffer(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
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

async function saveImage(job) {
  const file = path.join(OUT_DIR, job.out);
  if (fs.existsSync(file)) return "skip";
  const buf = await fetchBuffer(job.src);
  const data = file.endsWith(".webp")
    ? await sharp(buf).resize(ARTWORK_SIZE, ARTWORK_SIZE, { fit: "inside" }).webp({ quality: WEBP_QUALITY }).toBuffer()
    : buf;
  fs.writeFileSync(file, data);
  return "ok";
}

// Chạy danh sách việc với tối đa `limit` việc cùng lúc.
async function runPool(jobs, limit, task) {
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      try {
        results[i] = await task(jobs[i]);
      } catch (err) {
        // Thiếu vài ảnh cũng không sao — app sẽ tự tải ảnh đó qua mạng.
        console.warn(`  ! Bỏ qua ${jobs[i].out}: ${err.message}`);
        results[i] = "fail";
      }
      done++;
      if (done % 200 === 0 || done === jobs.length) {
        console.log(`  Đã xử lý ${done}/${jobs.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function dirSize(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
    const p = path.join(dir, e.name);
    return sum + (e.isDirectory() ? dirSize(p) : fs.statSync(p).size);
  }, 0);
}

async function main() {
  if (typeof fetch !== "function") {
    console.error("Cần Node.js 18 trở lên (để có sẵn hàm fetch). Kiểm tra bằng: node --version");
    process.exit(1);
  }

  for (const sub of ["artwork/shiny", "sprite/shiny"]) {
    fs.mkdirSync(path.join(OUT_DIR, sub), { recursive: true });
  }

  const jobs = [];
  for (const kind of KINDS) {
    for (let id = 1; id <= TOTAL; id++) {
      jobs.push({ src: kind.src(id), out: kind.out(id) });
    }
  }

  console.log(`Đang tải ${jobs.length} ảnh (${CONCURRENCY} request cùng lúc)...`);
  const started = Date.now();
  const results = await runPool(jobs, CONCURRENCY, saveImage);

  const count = (r) => results.filter((x) => x === r).length;
  console.log(`\nXong sau ${((Date.now() - started) / 1000).toFixed(1)} giây.`);
  console.log(`  Tải mới: ${count("ok")}, đã có sẵn: ${count("skip")}, lỗi: ${count("fail")}`);
  console.log(`  Tổng dung lượng images/: ${(dirSize(OUT_DIR) / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error("\nThất bại:", err.message);
  process.exit(1);
});
