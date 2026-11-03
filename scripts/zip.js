// Đọc file .zip / .jar chỉ bằng thư viện có sẵn của Node (dùng chung cho build-special.js và build-megastone-images.js).
// Hỗ trợ file lưu thẳng (method 0) và nén deflate (method 8) — đủ cho file mod Minecraft.
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

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
  // Nội dung gốc (chưa giải nén thì giải nén) của một file trong zip
  const bytes = (name) => {
    const e = entries.get(name);
    if (!e) throw new Error(`Không thấy ${name} trong ${path.basename(file)}`);
    const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    const data = buf.subarray(start, start + e.size);
    if (e.method === 0) return data;
    if (e.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`Kiểu nén ${e.method} chưa hỗ trợ (${name})`);
  };
  return {
    names: () => [...entries.keys()],
    has: (name) => entries.has(name),
    bytes,
    text: (name) => bytes(name).toString("utf8"),
  };
}

module.exports = { readZip };
