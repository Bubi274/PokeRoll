// Danh sách file nguồn của app, đọc từ chính index.html để test luôn nạp đúng file và đúng thứ tự như trang.
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appFiles = [...html.matchAll(/<script src="(src\/js\/[^"]+)"/g)].map((m) => m[1]);
const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="(src\/css\/[^"]+)"/g)].map((m) => m[1]);

// Toàn bộ code app nối lại theo thứ tự nạp
const appSource = () => appFiles.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");

module.exports = { appFiles, cssFiles, appSource };
