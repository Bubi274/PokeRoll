// Chờ chuyển động transform chạy xong, có đồng hồ dự phòng (dùng chung cho dải thẻ và bánh xe).
"use strict";

// Chuyển động transform của el kết thúc khi trình duyệt báo transitionend. Phòng khi không báo (vd. tab bị ẩn) có
// đồng hồ dự phòng ms() + 500, tính từ lúc el thực sự bắt đầu chạy (transitionstart): máy chậm có thể bắt đầu trễ,
// tính từ lúc bấm thì kết quả hiện khi el còn đang chạy. Không nhận được cả transitionstart thì vẫn kết thúc,
// chậm hơn TRANSITION_START_WAIT_MS.
//   ms()           thời gian của chuyển động đang chạy (đọc lại mỗi lần đặt đồng hồ)
//   onStart()      chạy khi el thực sự bắt đầu chạy                                     — tuỳ chọn
//   onFinish(snap) chạy đúng một lần khi kết thúc; snap = true nếu kết thúc nhờ đồng hồ dự phòng (hoặc finish(true)):
//                  khi đó el chưa chạy tới đích, nên đặt ngay về vị trí dừng
// Trả về finish(snap) để kết thúc ngay (vd. dải bị huỷ giữa lượt quay vì trang bị ẩn).
function watchTransform(el, { ms, onStart = () => {}, onFinish }) {
  let finished = false;
  let fallback = null;
  const finish = (snap = false) => {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    el.removeEventListener("transitionstart", start);
    el.removeEventListener("transitionend", end);
    onFinish(snap);
  };
  const start = (e) => {
    if (e.target !== el || e.propertyName !== "transform") return;
    onStart();
    clearTimeout(fallback);
    fallback = setTimeout(() => finish(true), ms() + 500);
  };
  const end = (e) => { if (e.target === el) finish(); };
  el.addEventListener("transitionstart", start);
  el.addEventListener("transitionend", end);
  fallback = setTimeout(() => finish(true), ms() + 500 + TRANSITION_START_WAIT_MS);
  return finish;
}
