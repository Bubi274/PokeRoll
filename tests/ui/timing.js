// Thời gian chờ tối đa trong test giao diện, tính từ chính các hằng số thời gian trong app.js cho trường hợp xấu nhất
// (máy chậm như GitHub Actions): chờ tải ảnh hết hạn, dải bắt đầu trễ, đồng hồ dự phòng, cộng thêm phần dư.
// Đổi thời gian quay trong app.js thì test tự theo, không phải sửa con số ở từng file test.
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
function constant(name) {
  const m = src.match(new RegExp(`^const ${name} = (\\d+);`, "m"));
  if (!m) throw new Error(`${name} not found in app.js`);
  return Number(m[1]);
}

const SLACK_MS = 3000; // dư cho máy chậm
// Bấm mở hòm → popup: tải ảnh (tối đa PRELOAD_TIMEOUT_MS) + dải chạy + đồng hồ dự phòng (ms + 500, chờ thêm nếu dải chưa báo bắt đầu)
const reelPopup = (reelMs) => constant("PRELOAD_TIMEOUT_MS") + reelMs + 500 + constant("REEL_START_WAIT_MS") + SLACK_MS;

module.exports = {
  CASE_POPUP_MS: reelPopup(constant("SPIN_MS")),               // Open case ở trang Case → popup kết quả
  ROULETTE_POPUP_MS: reelPopup(constant("ROULETTE_REEL_MS")),  // Open <hệ / biome> case ở trang Custom → popup kết quả
  WHEEL_MS: constant("WHEEL_SPIN_MS") + 500 + SLACK_MS,        // quay bánh xe (Type / Biome Roulette) → dừng
  // Popup đã mở → dải dừng hẳn. Trình duyệt không báo dải bắt đầu chạy (máy chậm) thì popup mở nhờ đồng hồ dự phòng
  // lúc dải có thể còn chưa chạy, nên dải cần thêm trọn một lượt chạy nữa.
  CASE_SETTLE_MS: constant("SPIN_MS") + SLACK_MS,
  ROULETTE_SETTLE_MS: constant("ROULETTE_REEL_MS") + SLACK_MS,
};
