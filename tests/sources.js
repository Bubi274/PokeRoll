// Danh sách file nguồn của app, đọc từ chính index.html để test luôn nạp đúng file và đúng thứ tự như trang.
const fs = require("fs"), path = require("path"), vm = require("vm");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appFiles = [...html.matchAll(/<script src="(src\/js\/[^"]+)"/g)].map((m) => m[1]);
const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="(src\/css\/[^"]+)"/g)].map((m) => m[1]);

// Toàn bộ code app nối lại theo thứ tự nạp
const appSource = () => appFiles.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");

// Nạp dữ liệu và toàn bộ code app (theo thứ tự trong index.html) vào một môi trường riêng để test gọi thẳng các hàm app.
// data: file dữ liệu nạp trước code app; extra: code chạy thêm sau cùng (vd. đưa SPAWN_DATA ra ngoài).
// Trả về { A: các hàm app xuất cho Node (cuối boot/init.js), ALL: mọi Pokémon (gồm Special) đã gắn độ hiếm, ctx }.
function loadApp({ data = ["data/data.js", "data/special.js"], extra = "" } = {}) {
  const ctx = { console, Math, module: {} };
  vm.createContext(ctx);
  vm.runInContext([...data, ...appFiles].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n")
    + "\n;globalThis.__all=[...POKEMON_DATA,...SPECIAL_DATA].map(p=>({...p,rarity:getRarity(p)}));" + extra, ctx);
  return { A: ctx.module.exports, ALL: ctx.__all, ctx };
}

module.exports = { appFiles, cssFiles, appSource, loadApp };
