// Bánh xe dùng chung (trang Custom và tab Challenge): khung HTML, vẽ ô, quay tới một ô, hoạt ảnh và đánh dấu ô trúng.
// Mọi hàm nhận w = mô tả bánh xe: { wheel, disc, hub (id khung, phần quay, tâm), state: { types, rotation },
// color(k), label(k), upright?, wheelClass? }. Bỏ trống w = bánh xe Type Roulette.
"use strict";

// Khung HTML của một bánh xe (phần quay, tâm, kim chỉ).
function wheelMarkup(w) {
  return `
    <div class="wheel${w.wheelClass ? ` ${w.wheelClass}` : ""}" id="${w.wheel}">
      <div class="wheel-disc" id="${w.disc}"></div>
      <div class="wheel-hub"><span class="wheel-hub-type" id="${w.hub}"></span></div>
      <div class="wheel-pointer" aria-hidden="true"></div>
    </div>`;
}

// Vẽ các ô keys lên bánh xe w (giữ góc xoay hiện tại), chưa có ô trúng: tâm hiện "?" (bánh xe trống: không có gì).
function drawWheel(w, keys) {
  w.state.types = keys;
  setWheelRotation(w.state.rotation % 360, w);
  setWheelDisc($(w.disc), keys, keys.length ? wheelSvg(keys, w) : "");
  $(w.wheel).classList.toggle("is-empty", keys.length === 0);
  clearWheelWinner(w);
  $(w.hub).textContent = keys.length ? "?" : "";
}

// Bỏ đánh dấu ô trúng (trước khi quay lại).
function clearWheelWinner(w) {
  $(w.wheel).classList.remove("has-winner");
  $(w.hub).textContent = "?";
  $(w.hub).style.removeProperty("--t");
}

// Quay bánh xe w tới ô key (phải có trên bánh xe). quick: nhảy ngay tới góc dừng, không có hiệu ứng.
// Xong thì đánh dấu ô trúng (tên ô hiện ở tâm). Trả về Promise xong khi bánh xe dừng.
async function spinWheelTo(w, key, { quick = false } = {}) {
  const st = w.state, keys = st.types;
  const target = wheelTarget(st.rotation % 360, keys.indexOf(key), keys.length);
  clearWheelWinner(w);
  if (quick) {
    setWheelRotation(target, w);
  } else {
    setWheelRotation(st.rotation % 360, w); // thu góc về 0–360° (nhìn không đổi) để số không lớn dần
    await animateWheel(target, w);
    // Bánh xe đang ẩn (ở tab khác) thì không đọc được góc trên màn hình
    const landed = $(w.disc).getClientRects().length ? keys[wheelSliceOnScreen(w)] : key;
    if (landed !== key) console.error(`${w.text ? w.text.stopped : "Wheel"} stopped on ${landed}, expected ${key}`);
  }
  markWheelWinner(key, w);
}

// Đặt ngay góc xoay của bánh xe, không có hiệu ứng.
function setWheelRotation(deg, w = TYPE_WHEEL) {
  const disc = $(w.disc);
  disc.style.transition = "none";
  disc.style.transform = `rotate(${deg}deg)`;
  w.state.rotation = deg;
}

// Làm sáng ô trúng, các ô khác mờ đi; tên ô hiện ở giữa bánh xe.
function markWheelWinner(type, w = TYPE_WHEEL) {
  const svg = $(w.disc).querySelector("svg");
  const slice = svg.querySelector(`.wheel-slice[data-type="${type}"]`);
  for (const g of svg.querySelectorAll(".wheel-slice")) g.classList.toggle("is-winner", g === slice);
  svg.appendChild(slice); // vẽ sau cùng để viền sáng không bị ô bên cạnh che
  $(w.wheel).classList.add("has-winner");
  $(w.hub).textContent = w.label(type);
  $(w.hub).style.setProperty("--t", w.color(type));
}

// Ô đang nằm dưới kim chỉ, đọc từ góc xoay thật trên màn hình (để kiểm tra và phát tiếng tick).
function wheelSliceOnScreen(w = TYPE_WHEEL) {
  const t = getComputedStyle($(w.disc)).transform;
  const m = t && t !== "none" ? new DOMMatrixReadOnly(t) : new DOMMatrixReadOnly();
  const deg = Math.atan2(m.b, m.a) * 180 / Math.PI;
  return wheelSliceAt(deg, w.state.types.length);
}

// Quay bánh xe tới góc target. Trả về Promise xong khi bánh xe dừng hẳn.
function animateWheel(target, w = TYPE_WHEEL) {
  const disc = $(w.disc);
  void disc.offsetWidth; // áp vị trí đầu trước khi bắt đầu quay
  disc.style.transition = `transform ${WHEEL_SPIN_MS}ms cubic-bezier(0.15, 0.75, 0.12, 1)`;
  disc.style.transform = `rotate(${target}deg)`;
  w.state.rotation = target;
  $(w.wheel).classList.add("is-spinning");

  let running = true;
  let last = null;
  const loop = () => {
    if (!running) return;
    const index = wheelSliceOnScreen(w);
    if (last !== null && index !== last) playTick();
    last = index;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Bánh xe dừng khi trình duyệt báo transitionend, hoặc nhờ đồng hồ dự phòng như dải thẻ (watchTransform).
  // Kết thúc nhờ đồng hồ dự phòng (snap) thì bánh xe nhảy ngay tới góc dừng của ô trúng, bỏ phần chuyển động còn lại.
  // Trường hợp bình thường (transitionend) không đổi gì.
  return new Promise((resolve) => {
    watchTransform(disc, {
      ms: () => WHEEL_SPIN_MS,
      onFinish: (snap) => {
        running = false;
        if (snap) setWheelRotation(target, w);
        $(w.wheel).classList.remove("is-spinning");
        resolve();
      },
    });
  });
}
