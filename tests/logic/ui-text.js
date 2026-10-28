// Giao diện app là tiếng Anh: không có chữ tiếng Việt trong chuỗi của app.js / main.js / special.js
// (comment thì được) và trong index.html / style.css ngoài phần comment.
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "..");
const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const NAMES = /Pok(é|<span>é<\/span>)(mon|dex|Roll)|Flabébé/g; // tên riêng có chữ é
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

function scanJs(file) {
  const s = fs.readFileSync(file, "utf8"); const hits = [];
  let i = 0, line = 1, lastSig = "";
  const push = (start, end, l) => { const t = s.slice(start, end); if (VI.test(t.replace(NAMES, ""))) hits.push(`${file}:${l}: ${t.replace(/\s+/g, " ").slice(0, 120)}`); };
  function str(q) { const st = i, l = line; i++; while (i < s.length && s[i] !== q) { if (s[i] === "\\") i++; if (s[i] === "\n") line++; i++; } i++; push(st, i, l); }
  function tpl() { const l = line; let st = i; i++; while (i < s.length && s[i] !== "`") {
      if (s[i] === "\\") { i += 2; continue; }
      if (s[i] === "\n") line++;
      if (s[i] === "$" && s[i + 1] === "{") { push(st, i, l); i += 2; code("}"); st = i; continue; }
      i++; } i++; push(st, i, l); }
  function code(end) { let depth = 0;
    while (i < s.length) { const c = s[i];
      if (end && c === "}" && depth === 0) { i++; return; }
      if (c === "{") depth++; else if (c === "}") depth--;
      if (c === "\n") { line++; i++; continue; }
      if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; continue; }
      if (c === "/" && s[i + 1] === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) { if (s[i] === "\n") line++; i++; } i += 2; continue; }
      if (c === '"' || c === "'") { str(c); lastSig = "s"; continue; }
      if (c === "`") { tpl(); lastSig = "s"; continue; }
      if (c === "/" && /[(,=:[!&|?{};+\-*%<>~^]$|^$|return$/.test(lastSig)) { // regex
        i++; let cls = false; while (i < s.length && (s[i] !== "/" || cls)) { if (s[i] === "\\") i++; else if (s[i] === "[") cls = true; else if (s[i] === "]") cls = false; i++; } i++;
        while (/[a-z]/i.test(s[i])) i++; lastSig = "r"; continue; }
      if (!/\s/.test(c)) lastSig = /[\w$]/.test(c) ? (lastSig.match(/[\w$]+$/) ? lastSig + c : c) : c;
      i++; } }
  code(null); return hits;
}
function scanHtml(file) { const s = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  return s.split("\n").map((t, k) => VI.test(t.replace(NAMES, "")) ? `${file}:${k + 1}: ${t.trim().slice(0, 120)}` : null).filter(Boolean); }
function scanCss(file) { const s = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return s.split("\n").map((t, k) => VI.test(t.replace(NAMES, "")) ? `${file}:${k + 1}: ${t.trim().slice(0, 120)}` : null).filter(Boolean); }
for (const f of ["app.js", "main.js", "special.js", "index.html", "style.css"]) {
  const file = path.join(dir, f);
  const hits = (f.endsWith(".html") ? scanHtml(file) : f.endsWith(".css") ? scanCss(file) : scanJs(file)).map((h) => h.replace(dir + path.sep, ""));
  check(`${f}: no Vietnamese text in the UI`, hits.length === 0, hits.slice(0, 3).join(" | "));
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
