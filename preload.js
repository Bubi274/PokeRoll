// Cầu nối giữa app desktop (main.js) và trang: chỉ đưa ra số phiên bản và nút kiểm tra cập nhật.
// Trang chạy trên web (GitHub Pages, mở index.html) không có window.pokeroll, nên footer không hiện gì thêm.

const { contextBridge, ipcRenderer } = require("electron");

// main.js truyền vào qua additionalArguments: --pokeroll-version=1.1.0 --pokeroll-packaged=1
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--pokeroll-${name}=`));
  return hit ? hit.slice(name.length + 12) : "";
};

contextBridge.exposeInMainWorld("pokeroll", {
  version: arg("version"),
  packaged: arg("packaged") === "1", // false khi chạy bằng npm start: không kiểm tra cập nhật
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
});
