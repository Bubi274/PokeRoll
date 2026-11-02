// Dải thẻ quay: dựng thẻ, căn vị trí, chạy và dừng dải.
"use strict";

// ----- Dải thẻ quay -----

function createCard(item) {
  const card = document.createElement("div");
  const p = item.pokemon;
  card.className = `card r-${item.rarity}${item.shiny ? " is-shiny" : ""}${isSpecial(p) ? " is-special" : ""}`;
  if (isSpecial(p)) card.title = `${sourceLabel(p)} — base form #${p.baseId} ${p.baseName}`;
  card.innerHTML = `
    <span class="card-top">
      <span class="card-id">${dexLabel(p)}</span>
      <span class="card-type" style="--t:${TYPE_COLORS[p.types[0]] || "#777"}">${p.types.join("/")}</span>
    </span>
    <img class="card-img" alt="" draggable="false">
    <span class="card-name">${p.name}</span>
    <span class="card-meta">BST ${p.bst}<span class="card-tier"> · ${rarityInfo(item.rarity).name}</span></span>
    ${item.shiny ? `<span class="card-shiny" title="Shiny">★</span>` : ""}`;
  setPokemonImage(card.querySelector("img"), p, item.shiny);
  return card;
}

// Mọi hàm dải thẻ nhận reel = khung .reel (mặc định là dải thẻ của trang Case);
// thanh thẻ bên trong là phần tử .reel-strip của khung đó.
const stripOf = (reel) => reel.querySelector(".reel-strip");

// Vẽ lại dải thẻ và đưa về vị trí đầu (không có hiệu ứng).
function renderReel(items, reel = $("reel")) {
  const strip = stripOf(reel);
  strip.style.transition = "none";
  strip.style.transform = "translateX(0)";
  strip.replaceChildren(...items.map(createCard));
  reel.classList.toggle("is-empty", items.length === 0);
}

// Dải thẻ lúc chưa quay: vài thẻ ngẫu nhiên trong hòm (groups).
function renderIdleReel(groups = state.groups, reel = $("reel")) {
  const idle = [];
  for (let i = 0; i < IDLE_REEL_SIZE && groupsSize(groups) > 0; i++) idle.push(rollOnce(groups));
  renderReel(idle, reel);
}

// Vị trí translateX để vạch chỉ nằm trên thẻ thắng, lệch ngẫu nhiên trong phạm vi thẻ
// (tối đa 40% bề rộng thẻ mỗi bên) để không lúc nào cũng dừng đúng tâm.
// offsetFrac: độ lệch từ -1 đến 1 (nhớ lại để căn lại đúng chỗ khi đổi cỡ cửa sổ).
function reelTarget(winIndex, offsetFrac = Math.random() * 2 - 1, reel = $("reel")) {
  reelOffsets.set(reel, offsetFrac);
  const card = stripOf(reel).children[winIndex];
  const offset = offsetFrac * card.offsetWidth * 0.4;
  return reel.clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2 + offset);
}

// Đặt ngay dải thẻ ở thẻ thắng, không có hiệu ứng (dùng cho "Quick open" và khi đổi cỡ cửa sổ).
function jumpReel(winIndex, offsetFrac, reel = $("reel")) {
  const strip = stripOf(reel);
  strip.style.transition = "none";
  strip.style.transform = `translateX(${reelTarget(winIndex, offsetFrac, reel)}px)`;
}

// Đổi cỡ cửa sổ / xoay điện thoại: căn lại để vạch chỉ vẫn nằm trên thẻ thắng.
// Dải đang quay thì chạy tiếp tới điểm dừng tính theo cỡ mới.
function realignReel(reel = $("reel")) {
  const retarget = reelSpins.get(reel);
  if (retarget) return retarget();
  const strip = stripOf(reel);
  const winner = strip.querySelector(".is-winner");
  if (winner) jumpReel([...strip.children].indexOf(winner), reelOffsets.get(reel), reel);
}

// Theo dõi dải thẻ trong lúc chạy: mỗi khi một thẻ mới đi qua vạch chỉ thì phát tiếng "tick".
// Trả về hàm để dừng theo dõi.
function trackTicks(reel = $("reel")) {
  const strip = stripOf(reel);
  const first = strip.children[0];
  let last = null;
  let running = true;
  const loop = () => {
    if (!running) return;
    // Đo lại mỗi khung hình: cỡ dải có thể đổi giữa lượt quay (đổi cỡ cửa sổ)
    const step = strip.children[1].offsetLeft - first.offsetLeft;
    const t = getComputedStyle(strip).transform;
    const x = (t && t !== "none" ? new DOMMatrixReadOnly(t).m41 : 0) + (parseFloat(strip.style.translate) || 0);
    if (step > 0) { // dải đang ẩn (ở trang khác): không đo được vị trí, không phát tiếng tick
      const index = Math.floor((reel.clientWidth / 2 - x - first.offsetLeft) / step);
      if (last !== null && index !== last) playTick();
      last = index;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return () => { running = false; };
}

// Chạy dải thẻ tới thẻ thắng trong ms mili giây (mặc định SPIN_MS như trang Case). Trả về Promise xong khi dải dừng.
function animateReel(winIndex, reel = $("reel"), ms = SPIN_MS) {
  const strip = stripOf(reel);
  const ease = "cubic-bezier(0.08, 0.6, 0, 1)";
  let target = reelTarget(winIndex, undefined, reel); // điểm dừng = đích của transform + shift
  const offsetFrac = reelOffsets.get(reel);
  let shift = 0;                       // dời thêm vì đổi cỡ giữa lượt quay (thuộc tính translate, không có hiệu ứng)
  let duration = ms;                   // thời gian của chuyển động đang chạy
  let started = false;                 // dải đã thực sự bắt đầu chạy (transitionstart)
  let endsAt = performance.now() + ms; // lúc dải dừng; tính lại khi dải thực sự bắt đầu chạy

  void strip.offsetWidth; // ép trình duyệt áp vị trí đầu trước khi bắt đầu chạy
  strip.style.transition = `transform ${ms}ms ${ease}`;
  strip.style.transform = `translateX(${target}px)`;
  reel.classList.add("is-spinning");
  const stopTicks = trackTicks(reel);

  // Dải dừng khi trình duyệt báo transitionend. Phòng khi không báo (vd. tab bị ẩn) có đồng hồ dự phòng ms + 500,
  // tính từ lúc dải thực sự bắt đầu chạy (transitionstart): máy chậm có thể bắt đầu trễ, tính từ lúc bấm thì popup
  // hiện khi dải còn đang trượt. Không nhận được cả transitionstart thì vẫn kết thúc, chậm hơn REEL_START_WAIT_MS.
  // Kết thúc nhờ đồng hồ dự phòng (snap) thì dải nhảy ngay tới vị trí dừng ở thẻ thắng (bỏ phần chuyển động còn lại),
  // để popup không bao giờ hiện khi dải chưa chạy / chưa dừng. Trường hợp bình thường (transitionend) không đổi gì.
  return new Promise((resolve) => {
    let finished = false;
    let fallback = null;
    const finish = (snap = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(fallback);
      reelSpins.delete(reel);
      if (snap || shift) {
        strip.style.transition = "none"; // huỷ chuyển động đang chờ / đang chạy, giá trị nhảy tới đích
        strip.style.transform = `translateX(${target}px)`; // gộp phần dời vào transform: vị trí trên màn hình không đổi
        strip.style.translate = "";
      }
      stopTicks();
      reel.classList.remove("is-spinning");
      strip.removeEventListener("transitionstart", onStart);
      strip.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onStart = (e) => {
      if (e.target !== strip || e.propertyName !== "transform") return;
      started = true;
      endsAt = performance.now() + duration;
      clearTimeout(fallback);
      fallback = setTimeout(() => finish(true), duration + 500);
    };
    const onEnd = (e) => { if (e.target === strip) finish(); };
    strip.addEventListener("transitionstart", onStart);
    strip.addEventListener("transitionend", onEnd);
    fallback = setTimeout(() => finish(true), ms + 500 + REEL_START_WAIT_MS);
    // Cỡ dải đổi giữa lượt quay: tính lại điểm dừng (cùng độ lệch).
    reelSpins.set(reel, () => {
      const next = reelTarget(winIndex, offsetFrac, reel);
      if (strip.getAnimations().length) {
        // Dải đang chạy: dời cả dải đúng bằng độ lệch của điểm dừng, ngay lúc đổi cỡ (lúc mọi thẻ cũng vừa đổi chỗ).
        // Chuyển động đang chạy giữ nguyên tốc độ và lúc dừng. Cỡ không đổi thì không có gì thay đổi.
        shift += next - target;
        target = next;
        strip.style.translate = shift ? `${shift}px` : "";
        return;
      }
      target = next;
      shift = 0;
      strip.style.translate = "";
      // Đã chạy rồi bị huỷ (trang bị ẩn giữa lượt quay): dải đã nhảy tới cuối, dừng luôn ở thẻ thắng.
      if (started) return finish(true);
      // Chưa từng chạy (bắt đầu quay lúc còn ẩn ở trang khác): chạy tới điểm dừng trong thời gian còn lại.
      duration = Math.max(0, endsAt - performance.now());
      if (duration === 0) return finish(true);
      strip.style.transition = `transform ${duration}ms ${ease}`;
      strip.style.transform = `translateX(${target}px)`;
    });
  });
}

