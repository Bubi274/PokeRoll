// Hoạt ảnh xoay bánh xe và đánh dấu ô trúng.
"use strict";

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
