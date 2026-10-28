// Điểm khởi động của app desktop (Electron): mở index.html trong một cửa sổ riêng.
// Chạy thử:  npm start      Đóng gói installer Windows:  npm run dist      Phát hành:  npm run release -- minor

const { app, BrowserWindow, Menu, shell, session, dialog, ipcMain } = require("electron");
const path = require("path");

// Chỉ cho mở một cửa sổ PokéRoll; mở lần nữa thì đưa cửa sổ cũ lên trước.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function openExternal(url) {
  if (url.startsWith("https://")) shell.openExternal(url);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 380,
    minHeight: 600,
    title: "PokéRoll",
    backgroundColor: "#121418", // tránh nháy trắng lúc mở
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // preload.js đưa số phiên bản và nút "Check for updates" cho footer
      preload: path.join(__dirname, "preload.js"),
      additionalArguments: [`--pokeroll-version=${app.getVersion()}`, `--pokeroll-packaged=${app.isPackaged ? 1 : 0}`],
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));

  // Link ra ngoài (vd. Cobbleverse Wiki) mở bằng trình duyệt mặc định, không mở trong app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
      openExternal(url);
    }
  });
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

Menu.setApplicationMenu(null); // ẩn thanh menu File/Edit/View
// Ảnh Pokémon tải từ CDN (khi thiếu ảnh có sẵn) được giữ trong cache 1 năm → lần sau không cần tải lại.
function cacheCdnImages() {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["https://cdn.jsdelivr.net/gh/PokeAPI/*"] },
    ({ responseHeaders }, callback) => {
      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase() === "cache-control") delete responseHeaders[key];
      }
      responseHeaders["Cache-Control"] = ["public, max-age=31536000, immutable"];
      callback({ responseHeaders });
    }
  );
}

// ----- Tự cập nhật -----
// Nguồn: GitHub Releases của Bubi274/PokeRoll (build.publish trong package.json). Chỉ chạy trong bản đã đóng gói,
// không chạy khi npm start. Dữ liệu người dùng (localStorage trong thư mục userData) không bị đụng tới khi cập nhật.
const UPDATE_CHECK_DELAY_MS = 5000; // mở app xong mới kiểm tra, để không làm chậm lúc khởi động
let updater = null;                 // autoUpdater của electron-updater, chỉ nạp trong bản đã đóng gói
let updateBusy = false;             // đang kiểm tra / hỏi / tải: không chạy chồng lần nữa

function initUpdater() {
  if (!app.isPackaged) return;
  ({ autoUpdater: updater } = require("electron-updater"));
  updater.autoDownload = false;        // hỏi người dùng trước khi tải
  updater.autoInstallOnAppQuit = true; // tải xong mà chọn "Later" thì cài khi tắt app
  updater.logger = null;
  updater.on("error", () => {});       // không có mạng / lỗi: im lặng, app vẫn chạy bình thường
  setTimeout(() => checkForUpdates(false), UPDATE_CHECK_DELAY_MS);
}

// Hộp thoại hỏi: true nếu bấm nút đầu tiên. Chỉ một nút thì chỉ để báo.
async function ask(message, buttons = ["OK"]) {
  const options = { type: "info", title: "PokéRoll", message, buttons, defaultId: 0, cancelId: buttons.length - 1, noLink: true };
  const { response } = win && !win.isDestroyed() ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
  return response === 0;
}

// Kiểm tra bản mới; có thì hỏi tải, tải xong hỏi khởi động lại để cài.
// manual: người dùng bấm "Check for updates" → báo cả khi không có bản mới hoặc khi lỗi; tự kiểm tra lúc mở app thì im lặng.
async function checkForUpdates(manual) {
  if (!updater) return "unavailable";
  if (updateBusy) return "busy";
  updateBusy = true;
  try {
    const result = await updater.checkForUpdates();
    if (!result || !result.isUpdateAvailable) {
      if (manual) await ask(`You're up to date. PokéRoll ${app.getVersion()} is the latest version.`);
      return "latest";
    }
    const { version } = result.updateInfo;
    if (!(await ask(`PokéRoll ${version} is available. Download and install now?`, ["Install", "Later"]))) return "later";
    await updater.downloadUpdate();
    if (await ask(`PokéRoll ${version} has been downloaded. Restart now?`, ["Restart now", "Later"])) {
      setImmediate(() => updater.quitAndInstall(true, true)); // cài không hiện trình cài đặt, xong thì mở lại app
    }
    return "downloaded";
  } catch {
    if (manual) await ask("Couldn't check for updates. Check your internet connection and try again.");
    return "error";
  } finally {
    updateBusy = false;
  }
}

ipcMain.handle("check-for-updates", () => checkForUpdates(true));

app.whenReady().then(() => {
  cacheCdnImages();
  createWindow();
  initUpdater();
});
app.on("window-all-closed", () => app.quit());
