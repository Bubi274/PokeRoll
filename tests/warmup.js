// Khởi động Electron một lần trước bộ test giao diện đầu tiên (tests/run.js gọi). Không phải bộ test, không kiểm tra gì.
// Trên máy CI mới tinh, lần mở Electron đầu tiên có thể chưa sẵn sàng chụp màn hình: capturePage báo "UnknownVizError"
// và bộ test đầu tiên của nhóm bị lỗi dù app đúng. Ở đây mở app trong cửa sổ ẩn và thử chụp tới khi được (tối đa vài lần).
// Luôn thoát 0: thất bại ở đây chỉ được ghi ra, bộ test thật vẫn chạy và tự báo lỗi nếu có.
const { app, BrowserWindow } = require("electron");
const path = require("path");
app.setPath("userData", path.join(require("os").tmpdir(), "pokeroll-tests", "userdata-warmup"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const t0 = Date.now();
  try {
    const win = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { offscreen: true } });
    await win.loadFile(path.join(__dirname, "..", "index.html"), { query: { nomotion: "1" } });
    for (let i = 1; i <= 10; i++) {
      try {
        const img = await win.webContents.capturePage();
        if (!img.isEmpty()) {
          console.log(`Electron warm-up: screenshot ready after ${i} tr${i > 1 ? "ies" : "y"} (${Date.now() - t0} ms)`);
          break;
        }
      } catch (e) {
        console.log(`Electron warm-up: try ${i}: ${e.message}`);
      }
      await sleep(500);
    }
  } catch (e) {
    console.log(`Electron warm-up failed: ${e.message}`);
  }
  app.exit(0);
});
