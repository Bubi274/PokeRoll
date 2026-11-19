// Mã Challenge (TW1) và mã reroll (TWR1), dùng chung với mod Trainer's Workshop 3.0. Định dạng: docs/challenge-code.md.
// Hàm thuần, không đụng giao diện. base64url và UTF-8 tự viết (không cần btoa / TextEncoder) để chạy được cả trong test Node.
"use strict";

const CHALLENGE_PREFIX = "TW1.";
const REROLL_PREFIX = "TWR1.";
const CHALLENGE_VERSION = 1;
const CHALLENGE_TEAM_SIZE = 6;
const CHALLENGE_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CHALLENGE_RULES = ["evo", "exact"];
const CHALLENGE_TIERS = ["blue", "purple", "pink", "red", "gold", "minigame"];
const CHALLENGE_MODES = ["case", "type", "biome", "letter", "minigame"];

// Lỗi khi đọc mã: message là câu tiếng Anh hiện cho người chơi, code là loại lỗi (để test và giao diện phân biệt).
class ChallengeCodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ChallengeCodeError";
    this.code = code;
  }
}

const codeError = (code, message) => new ChallengeCodeError(code, message);

// ----- CRC32 (IEEE, giống java.util.zip.CRC32 và zlib) -----

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

// CRC32 của một chuỗi ASCII (phần base64url), ra 8 ký tự hex chữ thường.
function crc32Hex(ascii) {
  let crc = 0xffffffff;
  for (let i = 0; i < ascii.length; i++) crc = CRC32_TABLE[(crc ^ ascii.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

// ----- UTF-8 (tên như "Nidoran♀", "Flabébé" không phải ASCII) -----

function utf8Bytes(str) {
  const escaped = encodeURIComponent(str); // ký tự ngoài ASCII → %XX theo từng byte UTF-8
  const bytes = [];
  for (let i = 0; i < escaped.length; i++) {
    if (escaped[i] === "%") {
      bytes.push(parseInt(escaped.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(escaped.charCodeAt(i));
    }
  }
  return bytes;
}

// Byte UTF-8 sai thì decodeURIComponent báo lỗi (URIError).
function utf8Text(bytes) {
  return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, "0")}`).join(""));
}

// ----- base64url -----

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Mã hoá luôn không có "=" ở cuối.
function base64urlEncode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    const chars = bytes.length - i >= 3 ? 4 : bytes.length - i + 1;
    for (let k = 0; k < chars; k++) out += B64URL[(n >>> (18 - 6 * k)) & 63];
  }
  return out;
}

// text: phần base64url đã bỏ "=" ở cuối. Ký tự lạ hoặc độ dài không thể có → null.
function base64urlDecode(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const bytes = [];
  let bits = 0, value = 0;
  for (const ch of text) {
    value = ((value << 6) | B64URL.indexOf(ch)) & 0xffff; // chỉ cần giữ vài bit cuối
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return bytes;
}

// ----- Khung chung: PREFIX + base64url(JSON) + "." + CRC32 -----

function wrapCode(prefix, payload) {
  const body = base64urlEncode(utf8Bytes(JSON.stringify(payload)));
  return `${prefix}${body}.${crc32Hex(body)}`;
}

// Đọc khung chung → đối tượng JSON. Bỏ khoảng trắng hai đầu; chấp nhận "=" ở cuối phần base64url và CRC chữ hoa.
// CRC luôn tính trên phần base64url đã bỏ "=".
function unwrapCode(text, prefix, what) {
  const code = String(text ?? "").trim();
  if (!code) throw codeError("empty", `Paste a ${what} first.`);
  if (!code.startsWith(prefix)) throw codeError("prefix", `This is not a ${what}: it must start with "${prefix}".`);
  const rest = code.slice(prefix.length);
  const dot = rest.lastIndexOf(".");
  if (dot < 0) throw codeError("format", `This ${what} is incomplete: the checksum after the last "." is missing.`);
  const body = rest.slice(0, dot).replace(/={1,2}$/, "");
  const crc = rest.slice(dot + 1);
  const bytes = base64urlDecode(body);
  if (!body || !bytes) throw codeError("base64", `This ${what} is damaged: part of it is missing or has characters that can't be in a code.`);
  if (!/^[0-9a-f]{8}$/i.test(crc)) throw codeError("format", `This ${what} is damaged: the checksum must be 8 letters or digits (0-9, a-f).`);
  if (crc.toLowerCase() !== crc32Hex(body)) throw codeError("crc", `This ${what} has a typo: its checksum doesn't match. Copy it again.`);
  let data;
  try {
    data = JSON.parse(utf8Text(bytes));
  } catch (e) {
    throw codeError("json", `This ${what} is damaged: its contents can't be read.`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw codeError("json", `This ${what} is damaged: its contents can't be read.`);
  if (data.v !== CHALLENGE_VERSION) {
    const v = data.v === undefined ? "no version" : `version ${JSON.stringify(data.v)}`;
    throw codeError("version", `This ${what} has ${v}; this app reads version ${CHALLENGE_VERSION} codes.`);
  }
  return data;
}

// ----- Mã Challenge (TW1) -----

const isChallengeId = (v) => typeof v === "string" && /^[A-Z0-9]{8}$/.test(v);

// Id ngẫu nhiên 8 ký tự A-Z0-9. randomBytes(n) → n byte ngẫu nhiên (truyền hàm khác vào để test).
// Byte ≥ 252 bị bỏ (252 = 7 × 36) để mỗi ký tự có cơ hội như nhau.
function newChallengeId(randomBytes = cryptoRandomBytes) {
  let id = "";
  while (id.length < 8) {
    for (const b of randomBytes(16)) {
      if (b < 252 && id.length < 8) id += CHALLENGE_ID_CHARS[b % 36];
    }
  }
  return id;
}

function cryptoRandomBytes(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

// Lỗi của một ô trong đội (index 0–5), "" nếu hợp lệ.
function challengeSlotProblem(s, i) {
  const at = `Team slot ${i + 1}`;
  if (!s || typeof s !== "object" || Array.isArray(s)) return `${at} is not a Pokémon.`;
  if (!Number.isInteger(s.dex) || s.dex < 1) return `${at} has no valid Pokédex number.`;
  if (typeof s.name !== "string" || !s.name) return `${at} has no name.`;
  if (!(s.special === null || (typeof s.special === "string" && s.special))) return `${at} has an invalid Special id.`;
  if (!CHALLENGE_RULES.includes(s.rule)) return `${at} has an unknown rule ${JSON.stringify(s.rule)}.`;
  if (typeof s.shiny !== "boolean") return `${at} has no Shiny flag.`;
  if (!CHALLENGE_TIERS.includes(s.tier)) return `${at} has an unknown tier ${JSON.stringify(s.tier)}.`;
  if (!CHALLENGE_MODES.includes(s.mode)) return `${at} has an unknown mode ${JSON.stringify(s.mode)}.`;
  return "";
}

// Chỉ giữ các trường đã biết, đúng thứ tự trong docs/challenge-code.md (trường lạ bị bỏ, để sau này mở rộng).
function normalizeChallenge(d) {
  return {
    v: CHALLENGE_VERSION,
    id: d.id,
    ts: d.ts,
    app: d.app,
    team: d.team.map((s) => ({
      dex: s.dex, name: s.name, special: s.special, rule: s.rule, shiny: s.shiny, tier: s.tier, mode: s.mode,
    })),
    parent: d.parent,
    rerolled: [...d.rerolled],
  };
}

// Lỗi đầu tiên của một Challenge (đã có v = 1), "" nếu hợp lệ.
function challengeProblem(d) {
  if (!Array.isArray(d.team) || d.team.length !== CHALLENGE_TEAM_SIZE) {
    return `The team must have ${CHALLENGE_TEAM_SIZE} Pokémon, this code has ${Array.isArray(d.team) ? d.team.length : "none"}.`;
  }
  if (!isChallengeId(d.id)) return "The code id must be 8 letters A-Z or digits.";
  if (!Number.isInteger(d.ts) || d.ts < 0) return "The code has no valid time.";
  if (typeof d.app !== "string") return "The code doesn't say which app made it.";
  for (let i = 0; i < d.team.length; i++) {
    const problem = challengeSlotProblem(d.team[i], i);
    if (problem) return problem;
  }
  if (!(d.parent === null || isChallengeId(d.parent))) return "The code has an invalid parent id.";
  if (!Array.isArray(d.rerolled) || !d.rerolled.every((n) => Number.isInteger(n) && n >= 0 && n < CHALLENGE_TEAM_SIZE)
    || new Set(d.rerolled).size !== d.rerolled.length) return "The code has an invalid list of rerolled slots.";
  return "";
}

// Challenge → mã TW1. Sai dữ liệu thì báo lỗi (không bao giờ tạo ra mã mà mod không đọc được).
function encodeChallengeCode(challenge) {
  const d = { ...challenge, v: CHALLENGE_VERSION };
  const problem = challengeProblem(d);
  if (problem) throw codeError("invalid", problem);
  return wrapCode(CHALLENGE_PREFIX, normalizeChallenge(d));
}

// Mã TW1 → Challenge (chỉ các trường đã biết). Sai thì báo ChallengeCodeError với câu dễ hiểu.
function decodeChallengeCode(text) {
  const d = unwrapCode(text, CHALLENGE_PREFIX, "Challenge code");
  if (!Array.isArray(d.team) || d.team.length !== CHALLENGE_TEAM_SIZE) {
    throw codeError("team", `This Challenge code has ${Array.isArray(d.team) ? d.team.length : "no"} Pokémon; a team has ${CHALLENGE_TEAM_SIZE}.`);
  }
  const problem = challengeProblem(d);
  if (problem) throw codeError("invalid", `This Challenge code is damaged: ${lowerFirstChar(problem)}`);
  return normalizeChallenge(d);
}

const lowerFirstChar = (str) => str.charAt(0).toLowerCase() + str.slice(1);

// ----- Mã reroll (TWR1, do mod tạo sau khi thua) -----

// Mã reroll: chứa nguyên mã TW1 đang dùng và số ô được quay lại. App chỉ đọc; hàm tạo dùng cho test và ví dụ trong docs.
function encodeRerollCode(code, allow = 1) {
  return wrapCode(REROLL_PREFIX, { v: CHALLENGE_VERSION, code, allow });
}

// Mã TWR1 → { code (mã TW1 bên trong, đã bỏ khoảng trắng), allow, challenge (Challenge đã đọc từ mã đó) }.
function decodeRerollCode(text) {
  const d = unwrapCode(text, REROLL_PREFIX, "reroll code");
  if (typeof d.code !== "string") throw codeError("invalid", "This reroll code is damaged: it has no Challenge code inside.");
  if (!Number.isInteger(d.allow) || d.allow < 1 || d.allow > CHALLENGE_TEAM_SIZE) {
    throw codeError("invalid", `This reroll code is damaged: it must allow 1 to ${CHALLENGE_TEAM_SIZE} rerolls.`);
  }
  let challenge;
  try {
    challenge = decodeChallengeCode(d.code);
  } catch (e) {
    throw codeError(e.code || "invalid", `The Challenge code inside this reroll code is damaged. ${e.message}`);
  }
  return { code: d.code.trim(), allow: d.allow, challenge };
}

// ----- Dựng đội -----

// Một ô trong đội từ một lượt quay. mode: "case" | "type" | "biome" | "letter" | "minigame" (Minigame Pokémon Case).
// Pokémon Special (Kazeran): dex = số Pokédex của dạng gốc, special = id trong data/special.js.
// Minigame: rule "exact", tier "minigame", không Shiny.
function challengeSlot(p, { rarity, shiny, mode }) {
  const minigameSlot = mode === "minigame";
  return {
    dex: isSpecial(p) ? p.baseId : p.id,
    name: p.name,
    special: isSpecial(p) ? p.id : null,
    rule: minigameSlot ? "exact" : "evo",
    shiny: minigameSlot ? false : Boolean(shiny),
    tier: minigameSlot ? "minigame" : rarity,
    mode,
  };
}

// Challenge mới sau khi quay lại một số ô. changes: { [index]: ô mới }. Các ô khác giữ nguyên.
// meta: { id, ts, app } của mã mới. parent = id cũ, rerolled = các ô đã đổi (tăng dần).
function rerolledChallenge(old, changes, { id, ts, app }) {
  const rerolled = Object.keys(changes).map(Number).sort((a, b) => a - b);
  return {
    v: CHALLENGE_VERSION, id, ts, app,
    team: old.team.map((s, i) => (i in changes ? changes[i] : s)),
    parent: old.id,
    rerolled,
  };
}
