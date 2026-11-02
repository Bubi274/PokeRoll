// Âm thanh tự tạo bằng Web Audio và nút bật tắt tiếng.
"use strict";

// ----- Âm thanh (Web Audio API: tự tạo tiếng, không cần file âm thanh) -----

const sound = {
  ctx: null,
  out: null,      // đầu ra chung (qua bộ nén để không bị rè khi nhiều tiếng cùng lúc)
  muted: loadJson(STORAGE_KEY_MUTED, false, (v) => typeof v === "boolean"),
  lastTick: 0,
};

// Trả về AudioContext (tạo lần đầu khi cần), hoặc null nếu đang tắt tiếng / không hỗ trợ.
function audio() {
  if (sound.muted) return null;
  if (!sound.ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    sound.ctx = new Ctx();
    sound.out = sound.ctx.createDynamicsCompressor();
    sound.out.connect(sound.ctx.destination);
  }
  if (sound.ctx.state === "suspended") sound.ctx.resume();
  return sound.ctx;
}

// Phát một nốt: tần số freq (Hz), bắt đầu sau start giây, kéo dài dur giây.
function tone(ctx, { freq, endFreq, start = 0, dur = 0.2, type = "sine", vol = 0.2 }) {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(sound.out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function playTick() {
  const now = performance.now();
  if (now - sound.lastTick < 30) return; // lúc đầu thẻ chạy rất nhanh → bỏ bớt cho đỡ rè
  sound.lastTick = now;
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, { freq: 1500 + Math.random() * 300, endFreq: 700, dur: 0.035, type: "triangle", vol: 0.12 });
}

function playReveal(rarity, shiny) {
  const ctx = audio();
  if (!ctx) return;
  const notes = REVEAL_NOTES[rarity] || REVEAL_NOTES.blue;
  const epic = rarity === "red" || rarity === "gold";
  const gap = epic ? 0.09 : 0.07;
  notes.forEach((freq, i) => {
    tone(ctx, { freq, start: i * gap, dur: epic ? 0.5 : 0.3, type: "triangle", vol: 0.16 });
  });
  if (epic) {
    // Hợp âm vang dài ở cuối + một lớp cao hơn một quãng tám cho "lấp lánh"
    const end = notes.length * gap;
    notes.slice(-3).forEach((freq) => {
      tone(ctx, { freq, start: end, dur: 1.6, type: "triangle", vol: 0.12 });
      tone(ctx, { freq: freq * 2, start: end, dur: 1.2, type: "sine", vol: 0.05 });
    });
  }
  if (shiny) {
    const end = notes.length * gap + 0.1;
    [2093, 2637, 3136, 2637, 3520].forEach((freq, i) => {
      tone(ctx, { freq, start: end + i * 0.06, dur: 0.18, type: "sine", vol: 0.07 });
    });
  }
}

const ICON_SOUND_ON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6M17 9l6 6"/></svg>`;

// Nút Sound có ở cả trang Case và trang Custom (class .btn-sound).
function renderSoundButton() {
  for (const btn of document.querySelectorAll(".btn-sound")) {
    btn.innerHTML = sound.muted ? `${ICON_SOUND_OFF} Muted` : `${ICON_SOUND_ON} Sound`;
    btn.setAttribute("aria-pressed", String(!sound.muted));
    btn.title = sound.muted ? "Turn sound on" : "Mute";
  }
}

function toggleSound() {
  sound.muted = !sound.muted;
  saveJson(STORAGE_KEY_MUTED, sound.muted);
  renderSoundButton();
  if (!sound.muted) playTick(); // nghe thử một tiếng
}

