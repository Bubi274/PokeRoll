// Kiểm tra cổng CI của workflow Release (scripts/wait-for-ci.js): chỉ build khi lượt CI trên đúng commit của tag đã thành công,
// chờ khi CI đang chạy, dừng khi CI lỗi hoặc không có lượt CI nào. Và release.yml dùng cổng này thay cho việc chạy lại test.
const fs = require("fs"), path = require("path");
const { ciVerdict } = require("../../scripts/release.js");
const { nextStep } = require("../../scripts/wait-for-ci.js");
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

const run = (n, status, conclusion, attempt = 1) => ({ run_number: n, run_attempt: attempt, status, conclusion, html_url: `https://x/${n}` });
const step = (runs, elapsedMin) => nextStep(ciVerdict(runs), elapsedMin * 60000, { appearMs: 5 * 60000, maxMs: 40 * 60000 });

check("CI success → build", step([run(1, "completed", "success")], 0).step === "pass");
check("CI failure / cancelled / timed out → stop, don't build", ["failure", "cancelled", "timed_out"].every((c) => {
  const s = step([run(1, "completed", c)], 0); return s.step === "fail" && s.reason.includes(c); }));
check("CI queued / running → wait", step([run(1, "queued", null)], 1).step === "wait" && step([run(1, "in_progress", null)], 20).step === "wait");
check("No CI run yet → wait a few minutes for it to appear…", step([], 0).step === "wait" && step([], 4.9).step === "wait");
check("…then stop if there's still none", step([], 5).step === "fail" && /no CI run found/.test(step([], 5).reason));
check("CI running too long → stop", step([run(1, "in_progress", null)], 40).step === "fail" && /not finished/.test(step([run(1, "in_progress", null)], 40).reason));
check("A newer re-run decides: failed then re-run passed → build; re-run still running → wait",
  step([run(1, "completed", "failure", 1), run(1, "completed", "success", 2)], 0).step === "pass"
  && step([run(1, "completed", "success", 1), run(1, "in_progress", null, 2)], 0).step === "wait");

const yml = fs.readFileSync(path.join(__dirname, "../../.github/workflows/release.yml"), "utf8");
check("release.yml: no test job any more; build needs the tag check and the CI gate",
  !/uses:\s*\.\/\.github\/workflows\/test\.yml/.test(yml) && /needs:\s*\[version, ci\]/.test(yml) && /node scripts\/wait-for-ci\.js/.test(yml));
check("release.yml: the CI gate reads Actions with GITHUB_TOKEN (actions: read) and checks the tag's own commit",
  /actions:\s*read/.test(yml) && /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/.test(yml) && /\$GITHUB_SHA|\$\{\{\s*github\.sha\s*\}\}/.test(yml));
check("release.yml: the tag still has to match package.json", /Tag matches package\.json/.test(yml) && /does not match package\.json version/.test(yml));

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
