// Kiểm tra mã Challenge (TW1) và mã reroll (TWR1) bằng Node: bộ ví dụ cố định docs/challenge-vectors.json (mod Trainer's
// Workshop test cùng file này), so CRC32 / base64url / UTF-8 với zlib và Buffer của Node, mã hoá rồi đọc lại mọi Pokémon,
// id ngẫu nhiên, dựng ô đội hình và Challenge sau reroll, và các lỗi khi đọc mã.
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const { loadApp } = require("../sources");
const ROOT = path.join(__dirname, "..", "..");
const { A, ALL, ctx } = loadApp();
const V = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "challenge-vectors.json"), "utf8"));
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Lỗi mà fn báo ra (null nếu không lỗi)
const errorOf = (fn) => { try { fn(); return null; } catch (e) { return e; } };

// Bộ sinh số ngẫu nhiên cố định (mulberry32) để kết quả lặp lại được
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1. Bộ ví dụ cố định
for (const v of V.challenge) {
  check(`Vector "${v.name}": decodes to its JSON`, same(A.decodeChallengeCode(v.code), v.json));
  check(`Vector "${v.name}": encoding its JSON gives exactly the code`, A.encodeChallengeCode(v.json) === v.code);
}
for (const v of V.reroll) {
  const r = A.decodeRerollCode(v.code);
  check(`Reroll vector "${v.name}": inner code, allow and team`, r.code === v.json.code && r.allow === v.json.allow
    && same(r.challenge, A.decodeChallengeCode(v.json.code)));
  check(`Reroll vector "${v.name}": encoding gives exactly the code`, A.encodeRerollCode(v.json.code, v.json.allow) === v.code);
}
for (const v of V.accepted) {
  const e = errorOf(() => A.decodeChallengeCode(v.code));
  check(`Accepted vector "${v.name}"`, !e && same(A.decodeChallengeCode(v.code), A.decodeChallengeCode(v.same_as)), e ? e.message : "");
}
for (const v of V.rejected) {
  const e = errorOf(() => A.decodeChallengeCode(v.code));
  check(`Rejected vector "${v.name}" → ${v.error}`, e && e.code === v.error && e.name === "ChallengeCodeError" && e.message.length > 20,
    e ? `${e.code}: ${e.message}` : "decoded without an error");
}
check("Vectors cover every rejection the spec lists", ["prefix", "base64", "crc", "version", "team"].every((c) => V.rejected.some((v) => v.error === c)));

// 2. CRC32, base64url và UTF-8 khớp zlib / Buffer của Node
const r = rng(7);
let crcOk = true, b64Ok = true, backOk = true;
for (let n = 0; n < 300; n++) {
  const bytes = Array.from({ length: n % 64 }, () => Math.floor(r() * 256));
  const enc = A.base64urlEncode(bytes);
  if (enc !== Buffer.from(bytes).toString("base64url")) b64Ok = false;
  if (!same(A.base64urlDecode(enc), bytes)) backOk = false;
  if (A.crc32Hex(enc) !== zlib.crc32(enc).toString(16).padStart(8, "0")) crcOk = false;
}
check("crc32Hex matches zlib.crc32 (8 lowercase hex digits)", crcOk && A.crc32Hex("") === "00000000" && A.crc32Hex("123456789") === "cbf43926");
check("base64urlEncode matches Buffer base64url (no padding)", b64Ok);
check("base64urlDecode reads back every encoding", backOk);
check("base64urlDecode rejects other characters and impossible lengths",
  A.base64urlDecode("ab+c") === null && A.base64urlDecode("ab/c") === null && A.base64urlDecode("abcde") === null && A.base64urlDecode("ab=c") === null);
const names = ALL.map((p) => p.name);
check("utf8Bytes matches Buffer for every Pokémon name (♀, é, ’ …)", names.every((s) => same(A.utf8Bytes(s), [...Buffer.from(s, "utf8")])));
check("utf8Text reads every name back", names.every((s) => A.utf8Text(A.utf8Bytes(s)) === s));
check("utf8Text rejects broken UTF-8", errorOf(() => A.utf8Text([0xc3])) !== null && errorOf(() => A.utf8Text([0xff, 0x41])) !== null);

// 3. Mọi Pokémon (gồm Special) mã hoá rồi đọc lại đúng
const slot = (p, mode = "case", shiny = false) => A.challengeSlot(p, { rarity: p.rarity, shiny, mode });
const team = (list) => ({ v: 1, id: "ABCDEF12", ts: 1763539200, app: `pokeroll ${A.APP_VERSION}`, team: list, parent: null, rerolled: [] });
let roundOk = true, nodeOk = true;
const modes = ["case", "type", "biome", "letter", "minigame"];
for (let i = 0; i < ALL.length; i += 6) {
  const list = [0, 1, 2, 3, 4, 5].map((k) => slot(ALL[(i + k) % ALL.length], modes[(i + k) % modes.length], (i + k) % 7 === 0));
  const code = A.encodeChallengeCode(team(list));
  if (!same(A.decodeChallengeCode(code).team, list)) roundOk = false;
  const body = code.split(".")[1];
  if (!same(JSON.parse(Buffer.from(body, "base64url").toString("utf8")).team, list)) nodeOk = false;
}
check(`Every Pokémon (${ALL.length}) survives encode → decode`, roundOk);
check("Node (Buffer + JSON.parse) reads the same team from every code", nodeOk);

// 4. Ô đội hình từ một lượt quay
const pika = ALL.find((p) => p.id === 25), kaz = ALL.find((p) => p.id === "kazeran-vaporeon");
check("Case slot: evo, rolled tier, Shiny kept", same(A.challengeSlot(pika, { rarity: "blue", shiny: true, mode: "case" }),
  { dex: 25, name: "Pikachu", special: null, rule: "evo", shiny: true, tier: "blue", mode: "case" }));
check("Special slot: dex of the base form, special = its id", same(slot(kaz, "type"),
  { dex: 134, name: "Kazeran Vaporeon", special: "kazeran-vaporeon", rule: "evo", shiny: false, tier: kaz.rarity, mode: "type" }));
check("Minigame slot: exact, tier minigame, never Shiny", same(A.challengeSlot(pika, { rarity: "blue", shiny: true, mode: "minigame" }),
  { dex: 25, name: "Pikachu", special: null, rule: "exact", shiny: false, tier: "minigame", mode: "minigame" }));

// 5. Challenge sau reroll
const base = A.decodeChallengeCode(V.challenge[0].code);
const snorlax = slot(ALL.find((p) => p.id === 143));
const next = A.rerolledChallenge(base, { 5: slot(pika, "minigame"), 1: snorlax }, { id: "ZZZZ9999", ts: 1763600000, app: "pokeroll 9.9.9" });
check("Reroll: new id / ts / app, parent = old id, rerolled sorted", next.id === "ZZZZ9999" && next.ts === 1763600000
  && next.app === "pokeroll 9.9.9" && next.parent === base.id && same(next.rerolled, [1, 5]));
check("Reroll: changed slots replaced, other slots copied unchanged", same(next.team[1], snorlax)
  && [0, 2, 3, 4].every((i) => same(next.team[i], base.team[i])));
check("Reroll: old Challenge is not modified", same(base, A.decodeChallengeCode(V.challenge[0].code)));
check("Reroll vector 2 is vector 1 with slot 4 rerolled", same(A.rerolledChallenge(base, { 4: V.challenge[1].json.team[4] },
  { id: "EF56GH78", ts: 1763542800, app: "pokeroll 1.4.0" }), V.challenge[1].json));

// 6. Id ngẫu nhiên
const fixed = (bytes) => { let i = 0; return (n) => Array.from({ length: n }, () => bytes[i++ % bytes.length]); };
check("newChallengeId maps bytes to A-Z0-9 (byte % 36)", A.newChallengeId(fixed([0, 25, 26, 35, 36, 71, 72, 251])) === "AZ09A9A9");
check("newChallengeId skips bytes 252–255 (no bias)", A.newChallengeId(fixed([252, 253, 254, 255, 1, 2, 3, 4, 5, 6, 7, 8])) === "BCDEFGHI");
const byteRng = rng(99);
const seeded = (n) => Array.from({ length: n }, () => Math.floor(byteRng() * 256));
const counts = {};
for (let i = 0; i < 4500; i++) for (const ch of A.newChallengeId(seeded)) counts[ch] = (counts[ch] || 0) + 1;
const values = Object.values(counts);
check("newChallengeId: all 36 characters, each about as often (1000 ± 15%)", values.length === 36 && values.every((n) => n > 850 && n < 1150),
  `min ${Math.min(...values)}, max ${Math.max(...values)}`);
ctx.crypto = globalThis.crypto; // trình duyệt có sẵn crypto; môi trường test thì gắn vào
const ids = new Set(Array.from({ length: 200 }, () => A.newChallengeId()));
check("newChallengeId with crypto: 8 chars A-Z0-9, no repeats in 200", ids.size === 200 && [...ids].every((id) => /^[A-Z0-9]{8}$/.test(id)));

// 7. Lỗi
const good = V.challenge[0].json;
const encodeError = (d) => errorOf(() => A.encodeChallengeCode(d));
check("encode refuses a team of 5", encodeError({ ...good, team: good.team.slice(0, 5) }).code === "invalid");
check("encode refuses a bad id, tier, mode, rule, rerolled list", [
  { ...good, id: "abc" }, { ...good, parent: "short" }, { ...good, rerolled: [6] }, { ...good, rerolled: [1, 1] },
  { ...good, team: good.team.map((s, i) => (i === 2 ? { ...s, tier: "green" } : s)) },
  { ...good, team: good.team.map((s, i) => (i === 3 ? { ...s, mode: "type-roulette" } : s)) },
  { ...good, team: good.team.map((s, i) => (i === 0 ? { ...s, rule: "any" } : s)) },
  { ...good, team: good.team.map((s, i) => (i === 0 ? { ...s, dex: "29" } : s)) },
].every((d) => { const e = encodeError(d); return e && e.code === "invalid"; }));
const craft = (prefix, obj) => { const body = Buffer.from(JSON.stringify(obj), "utf8").toString("base64url"); return `${prefix}${body}.${zlib.crc32(body).toString(16).padStart(8, "0")}`; };
const badSlot = errorOf(() => A.decodeChallengeCode(craft("TW1.", { ...good, team: good.team.map((s, i) => (i === 4 ? { ...s, shiny: "no" } : s)) })));
check("decode names the broken slot", badSlot && badSlot.code === "invalid" && /slot 5/.test(badSlot.message), badSlot && badSlot.message);
check("decode: JSON that isn't an object → json", errorOf(() => A.decodeChallengeCode(craft("TW1.", [1, 2]))).code === "json");
check("decode: missing v → version", errorOf(() => A.decodeChallengeCode(craft("TW1.", { ...good, v: undefined }))).code === "version");
check("decode: empty input → empty", ["", "   ", null, undefined].every((t) => errorOf(() => A.decodeChallengeCode(t)).code === "empty"));
check("decode: no checksum → format", errorOf(() => A.decodeChallengeCode("TW1.abcd")).code === "format");
check("decode: checksum not 8 hex digits → format", errorOf(() => A.decodeChallengeCode("TW1.abcd.xyz")).code === "format");

const tw1 = V.challenge[0].code;
check("Reroll decode: a Challenge code is rejected (prefix)", errorOf(() => A.decodeRerollCode(tw1)).code === "prefix");
check("Reroll decode: allow 0 or 7 is rejected", [0, 7, 1.5, "1"].every((allow) => errorOf(() => A.decodeRerollCode(craft("TWR1.", { v: 1, code: tw1, allow }))).code === "invalid"));
check("Reroll decode: allow up to 6 is read", A.decodeRerollCode(craft("TWR1.", { v: 1, code: tw1, allow: 6 })).allow === 6);
const inner = errorOf(() => A.decodeRerollCode(craft("TWR1.", { v: 1, code: tw1.slice(0, -1) + "0", allow: 1 })));
check("Reroll decode: a damaged Challenge code inside is reported", inner && inner.code === "crc" && /inside this reroll code/.test(inner.message), inner && inner.message);
check("Reroll decode: missing inner code is rejected", errorOf(() => A.decodeRerollCode(craft("TWR1.", { v: 1, allow: 1 }))).code === "invalid");
check("Reroll decode: v = 2 is rejected", errorOf(() => A.decodeRerollCode(craft("TWR1.", { v: 2, code: tw1, allow: 1 }))).code === "version");
check("Reroll decode: spaces around the inner code are ignored", A.decodeRerollCode(craft("TWR1.", { v: 1, code: ` ${tw1}\n`, allow: 1 })).code === tw1);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
