// Chuyển giữa các trang Case, Collection và Custom.
"use strict";

const VIEWS = ["case", "collection", "custom"];

function showView(view) {
  state.view = view;
  for (const v of VIEWS) $(`view-${v}`).hidden = view !== v;
  for (const tab of document.querySelectorAll(".tab")) {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  if (view === "collection") renderCollection();
  if (view === "custom") showCustomMode(); // trang vừa hiện ra mới đo được kích thước để căn dải quay
  window.scrollTo(0, 0);
}

