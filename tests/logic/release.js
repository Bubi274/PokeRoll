// Kiểm tra phần tính version và cổng CI của scripts/release.js: version luôn tăng, chỉ phát hành khi CI đã qua.
const { parseVersion, compareVersions, bumpVersion, checkNextVersion, ciVerdict } = require("../../scripts/release.js");
let fails = 0;
const check = (name, ok, info = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };

check("parseVersion: X.Y.Z and vX.Y.Z; anything else is null",
  JSON.stringify(parseVersion("1.2.3")) === "[1,2,3]" && JSON.stringify(parseVersion("v10.0.7")) === "[10,0,7]"
  && parseVersion("1.2") === null && parseVersion("v1.2.3-beta") === null && parseVersion("latest") === null);
check("compareVersions compares numerically, not as text", compareVersions("1.10.0", "1.9.9") > 0 && compareVersions("v2.0.0", "1.99.99") > 0
  && compareVersions("1.2.3", "v1.2.3") === 0 && compareVersions("1.2.3", "1.2.4") < 0);
check("bumpVersion: patch / minor / major like npm version",
  bumpVersion("1.0.0", "patch") === "1.0.1" && bumpVersion("1.0.5", "minor") === "1.1.0" && bumpVersion("1.4.2", "major") === "2.0.0");
check("First release: 1.0.0 → minor = 1.1.0, no tags yet → allowed", bumpVersion("1.0.0", "minor") === "1.1.0" && checkNextVersion("1.0.0", "1.1.0", []) === null);
check("Next version must be higher than package.json", /not higher than package.json/.test(checkNextVersion("1.1.0", "1.1.0", [])) && /not higher/.test(checkNextVersion("1.1.0", "1.0.9", [])));
check("Next version must be higher than every tag (e.g. a tag pushed from another machine)",
  /latest tag v1\.2\.0/.test(checkNextVersion("1.1.0", "1.2.0", ["v1.1.0", "v1.2.0"]))
  && /latest tag v1\.2\.0/.test(checkNextVersion("1.1.0", "1.1.1", ["v1.1.0", "v1.2.0"]))
  && checkNextVersion("1.1.0", "2.0.0", ["v1.1.0", "v1.2.0"]) === null);
check("Tags are compared numerically (v1.10.0 is newer than v1.9.0)", /latest tag v1\.10\.0/.test(checkNextVersion("1.9.0", "1.10.0", ["v1.9.0", "v1.10.0"])));
check("Unrelated tags are ignored", checkNextVersion("1.0.0", "1.1.0", ["test", "v2-beta", "nightly"]) === null);

// Cổng CI: chỉ phát hành khi lần chạy CI mới nhất trên đúng commit đã xong và thành công
const run = (n, status, conclusion, attempt = 1) => ({ run_number: n, run_attempt: attempt, status, conclusion, html_url: `https://x/${n}/${attempt}` });
check("CI gate: no run yet → none (wait)", ciVerdict([]).state === "none");
check("CI gate: queued / in progress → running (wait)", ciVerdict([run(3, "queued", null)]).state === "running" && ciVerdict([run(3, "in_progress", null)]).state === "running");
check("CI gate: success → passed", ciVerdict([run(3, "completed", "success")]).state === "passed");
check("CI gate: failure / cancelled / timed out → failed", ["failure", "cancelled", "timed_out", "startup_failure"].every((c) => ciVerdict([run(3, "completed", c)]).state === "failed"));
check("CI gate: the newest run decides (old failure, new success → passed; old success, new failure → failed)",
  ciVerdict([run(2, "completed", "failure"), run(3, "completed", "success")]).state === "passed"
  && ciVerdict([run(3, "completed", "failure"), run(2, "completed", "success")]).state === "failed");
check("CI gate: a re-run (newer attempt) decides over the first attempt",
  ciVerdict([run(3, "completed", "failure", 1), run(3, "completed", "success", 2)]).state === "passed"
  && ciVerdict([run(3, "completed", "success", 1), run(3, "in_progress", null, 2)]).state === "running");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
