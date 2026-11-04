// Workflow Release (.github/workflows/release.yml): chỉ build khi lượt CI (ci.yml, push lên main) trên đúng commit của tag
// đã thành công. Thay cho việc chạy lại toàn bộ test trong workflow Release.
// Chạy:  node scripts/wait-for-ci.js <commit sha>     (cần GITHUB_TOKEN và GITHUB_REPOSITORY, Actions có sẵn)
//
// npm run release push commit "Release vX.Y.Z" và tag cùng lúc, nên CI của commit đó thường vừa mới bắt đầu khi workflow
// Release chạy. Vì vậy script CHỜ lượt CI đó chạy xong:
//   - CI thành công → thoát 0 (build tiếp).
//   - CI lỗi / bị huỷ / hết giờ → thoát 1 (không build).
//   - Sau APPEAR_MS vẫn không thấy lượt CI nào, hoặc chờ quá MAX_MS → thoát 1 (không build).
// Lượt mới nhất (kể cả chạy lại) quyết định — cùng cách tính với scripts/release.js (ciVerdict).
"use strict";

const { ciVerdict } = require("./release");

const POLL_MS = 30 * 1000;
const APPEAR_MS = Number(process.env.CI_APPEAR_SECONDS || 5 * 60) * 1000; // chờ lượt CI xuất hiện tối đa bấy nhiêu
const MAX_MS = 40 * 60 * 1000; // chờ CI chạy xong tối đa bấy nhiêu (job Release có timeout riêng)

// Việc tiếp theo theo kết luận CI và thời gian đã chờ: "pass" | "fail" | "wait", kèm lý do khi dừng.
function nextStep(verdict, elapsedMs, { appearMs = APPEAR_MS, maxMs = MAX_MS } = {}) {
  if (verdict.state === "passed") return { step: "pass" };
  if (verdict.state === "failed") return { step: "fail", reason: `CI ${verdict.run.conclusion}` };
  if (verdict.state === "none" && elapsedMs >= appearMs) return { step: "fail", reason: `no CI run found after ${Math.round(appearMs / 60000)} min` };
  if (elapsedMs >= maxMs) return { step: "fail", reason: `CI still not finished after ${Math.round(maxMs / 60000)} min` };
  return { step: "wait" };
}

async function fetchRuns(repo, sha, token) {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&event=push&per_page=20`;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "pokeroll-release", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
  return (await res.json()).workflow_runs || [];
}

async function main() {
  const sha = process.argv[2], repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
  if (!/^[0-9a-f]{40}$/.test(sha || "") || !repo) {
    console.error("usage: GITHUB_REPOSITORY=owner/repo [GITHUB_TOKEN=…] node scripts/wait-for-ci.js <40-char commit sha>");
    process.exit(1);
  }
  const start = Date.now();
  for (;;) {
    let verdict;
    try {
      verdict = ciVerdict(await fetchRuns(repo, sha, token));
    } catch (e) {
      console.error(`::error::Couldn't read CI status: ${e.message}`);
      process.exit(1);
    }
    const elapsed = Date.now() - start;
    const { step, reason } = nextStep(verdict, elapsed);
    const where = verdict.run ? ` ${verdict.run.html_url}` : "";
    if (step === "pass") {
      console.log(`CI passed for ${sha.slice(0, 7)}:${where}`);
      return;
    }
    if (step === "fail") {
      console.error(`::error::Not building: ${reason} for ${sha.slice(0, 7)}.${where}`);
      process.exit(1);
    }
    console.log(`[${Math.round(elapsed / 1000)}s] CI ${verdict.state === "none" ? "hasn't started yet" : verdict.run.status} for ${sha.slice(0, 7)}, waiting…${where}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

if (require.main === module) main();
module.exports = { nextStep };
