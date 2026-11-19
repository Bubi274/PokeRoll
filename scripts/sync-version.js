// Chép version trong package.json vào APP_VERSION của src/js/core/config.js (trang chạy từ file:// không đọc được package.json).
// npm version tự chạy file này (script "version" trong package.json) sau khi tăng version và trước khi commit,
// nên commit "Release vX.Y.Z" có luôn config.js đã sửa.
const fs = require("fs");
const path = require("path");

const CONFIG = path.join(__dirname, "..", "src", "js", "core", "config.js");
const LINE = /^const APP_VERSION = "[^"]*";$/m;

// Mã nguồn config.js với APP_VERSION = version. Không thấy đúng một dòng APP_VERSION thì báo lỗi.
function setAppVersion(source, version) {
  const hits = source.match(new RegExp(LINE.source, "gm")) || [];
  if (hits.length !== 1) throw new Error(`expected one APP_VERSION line in config.js, found ${hits.length}`);
  return source.replace(LINE, `const APP_VERSION = "${version}";`);
}

// APP_VERSION đang ghi trong mã nguồn config.js (null nếu không có).
function readAppVersion(source) {
  const m = /^const APP_VERSION = "([^"]*)";$/m.exec(source);
  return m ? m[1] : null;
}

if (require.main === module) {
  const { version } = require(path.join(__dirname, "..", "package.json"));
  fs.writeFileSync(CONFIG, setAppVersion(fs.readFileSync(CONFIG, "utf8"), version));
  console.log(`APP_VERSION = ${version}`);
}

module.exports = { setAppVersion, readAppVersion, CONFIG };
