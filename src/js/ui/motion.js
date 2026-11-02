// Hiệu ứng chuyển động: số đếm dần, thanh tỉ lệ chạy tới giá trị mới.
"use strict";

// ----- Hiệu ứng chuyển động (chỉ để hiển thị) -----
// Tắt khi hệ điều hành bật "giảm chuyển động", hoặc khi trang mở với ?nomotion (để test đọc số ngay):
// lúc đó mọi giá trị hiện ngay giá trị cuối. Phần CSS cũng chỉ bật khi <html> không có class no-motion.
const MOTION_MS = 550;      // thanh tỉ lệ và số chạy tới giá trị mới trong bấy nhiêu ms
const MOTION_STAGGER = 40;  // mỗi hàng bảng tỉ lệ bắt đầu trễ hơn hàng trên bấy nhiêu ms
const motionOff = () => document.documentElement.classList.contains("no-motion")
  || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOutCubic = (t) => 1 - (1 - t) ** 3; // khớp cubic-bezier(0.33, 1, 0.68, 1) của thanh bên CSS
const countFrames = new WeakMap();             // phần tử → requestAnimationFrame đang chạy

// Số trong el chạy dần từ giá trị đang hiển thị tới to, cùng nhịp với thanh tỉ lệ.
// format(x, final): chữ hiển thị. Gọi lại khi đang chạy: chạy tiếp từ giá trị đang hiện, không về 0.
function countTo(el, to, format, delay = 0) {
  cancelAnimationFrame(countFrames.get(el));
  const from = Number(el.dataset.value) || 0;
  const show = (x, final) => {
    el.dataset.value = x;
    el.textContent = format(x, final);
  };
  if (motionOff() || from === to) {
    show(to, true);
    return;
  }
  let start = null; // tính từ khung hình đầu tiên — cùng lúc thanh (CSS transition) bắt đầu chạy
  const step = (now) => {
    if (start === null) start = now + delay;
    const t = Math.min(Math.max((now - start) / MOTION_MS, 0), 1);
    show(t < 1 ? from + (to - from) * easeOutCubic(t) : to, t === 1);
    if (t < 1) countFrames.set(el, requestAnimationFrame(step));
    else countFrames.delete(el);
  };
  countFrames.set(el, requestAnimationFrame(step));
}

// Ô số của hòm rỗng: hiện "—", còn giá trị bên trong vẫn chạy về 0 cùng nhịp với thanh,
// để chọn lại gen giữa chừng thì số và thanh cùng chạy tiếp từ một chỗ.
function clearCount(el, delay = 0) {
  countTo(el, 0, () => "—", delay);
}

const fmtCount = (x, final) => String(final ? x : Math.round(x));

// % của một hàng bảng tỉ lệ chạy theo đúng thanh của hàng đó: mỗi khung hình đọc --p đang hiển thị
// (thanh chạy bằng CSS transition), luôn 2 chữ số thập phân; thanh dừng thì hiện đúng giá trị thật.
// Đọc từ thanh nên số và thanh không thể lệch nhau, kể cả khi đổi gen liên tục giữa chừng.
function followBar(li, el, target) {
  cancelAnimationFrame(countFrames.get(el));
  const done = () => {
    countFrames.delete(el);
    el.textContent = pct2(target);
  };
  if (motionOff()) {
    done();
    return;
  }
  const step = () => {
    // getAnimations() cập nhật style trước, nên thấy được transition vừa tạo ở khung hình này
    if (!li.getAnimations().some((a) => a.transitionProperty === "--p")) {
      done();
      return;
    }
    el.textContent = `${parseFloat(getComputedStyle(li).getPropertyValue("--p")).toFixed(2)}%`;
    countFrames.set(el, requestAnimationFrame(step));
  };
  countFrames.set(el, requestAnimationFrame(step));
}

