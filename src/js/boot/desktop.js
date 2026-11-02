// Bản desktop: số phiên bản ở footer và nút kiểm tra cập nhật.
"use strict";

// Bản desktop (preload.js đưa vào window.pokeroll): số phiên bản ở footer, và nút "Check for updates" trong bản
// đã đóng gói. Bản web không có window.pokeroll nên footer giữ như cũ.
function renderAppVersion() {
  const desktop = window.pokeroll;
  if (!desktop || !desktop.version) return;
  $("app-version-number").textContent = `PokéRoll v${desktop.version}${desktop.packaged ? "" : " (dev)"}`;
  $("app-update").hidden = !desktop.packaged;
  $("app-version").hidden = false;
  const btn = $("btn-update");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Checking…";
    try {
      await desktop.checkForUpdates(); // main.js tự hiện hộp thoại kết quả
    } finally {
      btn.disabled = false;
      btn.textContent = "Check for updates";
    }
  });
}

