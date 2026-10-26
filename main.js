// Điểm khởi động của app desktop (Electron): mở index.html trong một cửa sổ riêng.
// Chạy thử:  npm start      Đóng gói file .exe cho Windows:  npm run dist

const { app, BrowserWindow, Menu, shell } = require("electron");
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
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
