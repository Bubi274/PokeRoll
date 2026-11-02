// Tiện ích DOM dùng chung và trạng thái chính của app (state).
"use strict";

// =====================================================================
// GIAO DIỆN
// =====================================================================

const $ = (id) => document.getElementById(id);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chống chèn mã HTML từ dữ liệu bên ngoài (spawns.js lấy từ trang wiki).
const escHtml = (str) => String(str ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = {
  pokemon: [],          // toàn bộ Pokémon, gồm cả Special (đã gắn sẵn độ hiếm)
  dex: [],              // chỉ Pokédex chính #1–#1025 (để tính tiến độ X/1025)
  byId: new Map(),      // tra Pokémon theo id (số Pokédex, hoặc id chữ của Special)
  selectedGens: new Set(),
  groups: groupByRarity([]), // Pokémon trong hòm hiện tại, chia theo độ hiếm
  spinning: false,
  collection: {},       // bộ sưu tập: { [id]: { count, shiny, first } }
  history: [],          // lịch sử quay, mới nhất trước
  saveFailed: false,    // true nếu không lưu được vào localStorage
  view: "case",         // trang đang xem: "case", "collection" hoặc "custom"
  resultAgain: null,    // nút "Open again" trong popup kết quả sẽ chạy hàm này
};

// Độ lệch điểm dừng của lần quay gần nhất, nhớ riêng cho từng dải thẻ.
const reelOffsets = new WeakMap();
// Dải thẻ đang quay → hàm tính lại điểm dừng theo cỡ mới (realignReel gọi khi đổi cỡ cửa sổ giữa lượt quay).
const reelSpins = new WeakMap();

const pad4 = (id) => String(id).padStart(4, "0");

