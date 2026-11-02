// Gắn ảnh Pokémon (local, CDN, ảnh dự phòng) và tải trước ảnh.
"use strict";

// ----- Ảnh -----

// Gắn ảnh Pokémon cho thẻ <img>: ảnh local → ảnh CDN → (shiny) ảnh thường trên CDN → ảnh dự phòng.
// Pokémon Special: ảnh GIF trong assets/images/special/ (shiny dùng chung ảnh thường) → ảnh dự phòng.
function setPokemonImage(img, p, shiny) {
  if (isSpecial(p)) {
    img.onerror = () => { img.onerror = null; img.src = FALLBACK_IMG; };
    img.src = p.image;
    return;
  }
  const id = p.id;
  img.onerror = () => {
    if (!img.dataset.step) {
      img.dataset.step = "cdn";
      img.src = artworkCdnUrl(id, shiny);
    } else if (shiny && img.dataset.step !== "normal") {
      img.dataset.step = "normal";
      img.src = artworkCdnUrl(id, false);
    } else {
      img.onerror = null;
      img.src = FALLBACK_IMG;
    }
  };
  img.src = artworkUrl(id, shiny);
}

// Tải trước ảnh để lúc quay không bị trống; quá thời gian chờ thì bỏ qua.
function preloadImages(urls, timeoutMs) {
  const loads = urls.map((url) => new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = url;
  }));
  return Promise.race([Promise.all(loads), sleep(timeoutMs)]);
}

