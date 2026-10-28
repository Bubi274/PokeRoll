// Phát hành bản mới:  npm run release -- patch | minor | major
// Tăng version trong package.json (và package-lock.json), commit, tạo tag vX.Y.Z rồi push lên GitHub.
// Push tag sẽ chạy workflow .github/workflows/release.yml: chạy test, build Windows + Linux, đăng GitHub Release.
//
// Trước khi làm, kiểm tra: thư mục làm việc sạch, đang ở main và đã khớp origin/main,
// version mới lớn hơn mọi tag v* đã có (cả local lẫn trên GitHub) — version luôn tăng, không trùng bản cũ.

const { execFileSync } = require("child_process");
const path = require("path");

const KINDS = ["patch", "minor", "major"];

// "1.2.3" → [1, 2, 3]; không đúng dạng X.Y.Z thì null
function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  return m ? m.slice(1).map(Number) : null;
}

// < 0 nếu a < b, 0 nếu bằng, > 0 nếu a > b
function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// Version kế tiếp theo kiểu tăng (giống npm version)
function bumpVersion(v, kind) {
  const [major, minor, patch] = parseVersion(v);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Lỗi nếu next không lớn hơn version hiện tại và mọi tag đã phát hành (tags: ["v1.1.0", ...], bỏ qua tag lạ)
function checkNextVersion(current, next, tags) {
  if (compareVersions(next, current) <= 0) return `New version ${next} is not higher than package.json (${current}).`;
  const released = tags.filter((t) => parseVersion(t));
  const newest = released.sort(compareVersions).at(-1);
  if (newest && compareVersions(next, newest) <= 0) return `New version ${next} is not higher than the latest tag ${newest}.`;
  return null;
}

function main() {
  const root = path.join(__dirname, "..");
  const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", ...opts }).trim();
  const git = (...args) => run("git", args);
  const fail = (msg) => {
    console.error(`release: ${msg}`);
    process.exit(1);
  };

  const kind = process.argv[2];
  if (!KINDS.includes(kind)) fail("usage: npm run release -- patch|minor|major");

  if (git("status", "--porcelain")) fail("working tree has uncommitted changes. Commit or stash them first.");
  if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") fail("releases are made from the main branch.");
  git("fetch", "--quiet", "--tags", "origin", "main");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) fail("main is not in sync with origin/main. Pull or push first.");

  const current = require(path.join(root, "package.json")).version;
  const next = bumpVersion(current, kind);
  const tags = [
    ...git("tag", "--list", "v*").split("\n"),
    ...git("ls-remote", "--tags", "--refs", "origin").split("\n").map((l) => l.replace(/^.*refs\/tags\//, "")),
  ].filter(Boolean);
  const problem = checkNextVersion(current, next, tags);
  if (problem) fail(problem);

  console.log(`Releasing v${next} (was ${current})…`);
  // Sửa package.json + package-lock.json, commit "Release vX.Y.Z" và tạo tag vX.Y.Z
  const win = process.platform === "win32";
  execFileSync(win ? "npm.cmd" : "npm", ["version", kind, "-m", "Release v%s"], { cwd: root, stdio: "inherit", shell: win });
  git("push", "--atomic", "origin", "main", `v${next}`);
  console.log(`Pushed v${next}. GitHub Actions is now testing, building and publishing the release:`);
  console.log("  https://github.com/Bubi274/PokeRoll/actions");
}

if (require.main === module) main();
module.exports = { parseVersion, compareVersions, bumpVersion, checkNextVersion };
