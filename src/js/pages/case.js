// Trang Case: một lượt quay từ lúc bấm nút tới popup kết quả.
"use strict";

// ----- Quay -----

// quick = true: "Quick open" — bỏ qua hiệu ứng dải thẻ, ra kết quả ngay.
async function spin({ quick = false } = {}) {
  if (state.spinning) return;
  const groups = state.groups; // hòm lúc quay
  const result = rollOnce(groups);
  if (!result) return;

  // Ghi vào bộ sưu tập ngay (không mất kết quả nếu lỡ đóng app giữa chừng),
  // nhưng chỉ hiện ra sau khi dải thẻ dừng.
  const isNew = !state.collection[result.pokemon.id];
  const entry = recordDrop(state.collection, state.history, result);
  saveProgress();

  state.spinning = true;
  const items = buildReelItems(result, state.groups);

  if (quick) {
    renderReel(items);
    jumpReel(WIN_INDEX);
  } else {
    updateSpinButton("Loading…");
    audio(); // mở âm thanh ngay trong lúc bấm (trình duyệt chỉ cho phát tiếng sau thao tác của người dùng)
    // Chỉ chờ các thẻ thấy được lúc bắt đầu và lúc dừng; thẻ ở giữa tải trong lúc dải đang chạy.
    const visible = items.filter((_, i) => i < IDLE_REEL_SIZE || Math.abs(i - WIN_INDEX) <= 6);
    const urls = [...new Set(visible.map((it) => imageUrl(it.pokemon, it.shiny)))];
    await preloadImages(urls, PRELOAD_TIMEOUT_MS);

    renderReel(items);
    updateSpinButton("Opening…");
    await animateReel(WIN_INDEX);
  }

  $("reel-strip").children[WIN_INDEX].classList.add("is-winner");
  state.spinning = false;
  updateSpinButton();
  renderRecent();
  updateCollectionTab();
  if (state.view === "collection") renderCollection();
  showResultModal(result, { isNew, count: entry.count, groups });
}

