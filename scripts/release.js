// Phát hành bản mới:  npm run release -- patch | minor | major
// Tăng version trong package.json (và package-lock.json), commit, tạo tag vX.Y.Z rồi push lên GitHub.
// Push tag sẽ chạy workflow .github/workflows/release.yml: chạy test, build Windows + Linux, đăng GitHub Release.
//
// Trước khi làm, kiểm tra: thư mục làm việc sạch, đang ở main và đã khớp origin/main,
// CI (.github/workflows/ci.yml) trên đúng commit main hiện tại đã chạy xong và thành công,
// version mới lớn hơn mọi tag v* đã có (cả local lẫn trên GitHub) — version luôn tăng, không trùng bản cũ.
// Trạng thái CI đọc qua API công khai của GitHub (repo public), không cần đăng nhập.

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

// Kết luận từ các lần chạy CI trên một commit (runs: workflow_runs của API GitHub, mới hay cũ đều được):
// lấy lần chạy mới nhất. → { state: "none" | "running" | "failed" | "passed", run }
function ciVerdict(runs) {
  const run = [...runs].sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt)[0];
  if (!run) return { state: "none", run: null };
  if (run.status !== "completed") return { state: "running", run };
  return { state: run.conclusion === "success" ? "passed" : "failed", run };
}

// Lỗi nếu next không lớn hơn version hiện tại và mọi tag đã phát hành (tags: ["v1.1.0", ...], bỏ qua tag lạ)
function checkNextVersion(current, next, tags) {
  if (compareVersions(next, current) <= 0) return `New version ${next} is not higher than package.json (${current}).`;
  const released = tags.filter((t) => parseVersion(t));
  const newest = released.sort(compareVersions).at(-1);
  if (newest && compareVersions(next, newest) <= 0) return `New version ${next} is not higher than the latest tag ${newest}.`;
  return null;
}

async function main() {
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

  // CI trên đúng commit này phải đã qua
  const pkg = require(path.join(root, "package.json"));
  const { owner, repo } = pkg.build.publish[0];
  const sha = git("rev-parse", "HEAD"), short = sha.slice(0, 7);
  const actions = `https://github.com/${owner}/${repo}/actions/workflows/ci.yml`;
  let runs;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&event=push&per_page=20`,
      { headers: { Accept: "application/vnd.github+json", "User-Agent": "pokeroll-release" } });
    if (res.status === 404) fail(`the CI workflow (.github/workflows/ci.yml) isn't on GitHub yet. Push it to main and let it pass first.`);
    if (res.status === 403 || res.status === 429) fail(`GitHub API rate limit reached (${res.status}); couldn't check CI. Try again later.`);
    if (!res.ok) fail(`couldn't check CI status (GitHub API ${res.status}).`);
    runs = (await res.json()).workflow_runs || [];
  } catch (e) {
    fail(`couldn't check CI status: ${e.message}`);
  }
  const ci = ciVerdict(runs);
  if (ci.state === "none") fail(`CI hasn't run for ${short} yet. Wait for it to start and pass, then run the release again:\n  ${actions}`);
  if (ci.state === "running") fail(`CI is still running for ${short}. Wait for it to pass, then run the release again:\n  ${ci.run.html_url}`);
  if (ci.state === "failed") fail(`CI ${ci.run.conclusion} for ${short}. Fix it before releasing (no tag was created):\n  ${ci.run.html_url}`);
  console.log(`CI passed for ${short}: ${ci.run.html_url}`);

  const current = pkg.version;
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
module.exports = { parseVersion, compareVersions, bumpVersion, checkNextVersion, ciVerdict };
