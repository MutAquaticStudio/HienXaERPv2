import { execFileSync } from "node:child_process";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  }).trim();
}

function assertClean(stage) {
  const changes = run("git", ["status", "--porcelain"]);
  if (changes) {
    throw new Error(
      `Release worktree must be clean ${stage}:\n${changes}`,
    );
  }
}

assertClean("before verification");

const localSha = run("git", ["rev-parse", "HEAD"]);
const remoteSha = run("git", ["ls-remote", "--exit-code", "origin", "refs/heads/main"])
  .split(/\s+/)[0];

if (localSha !== remoteSha) {
  throw new Error(
    `HEAD ${localSha} does not match origin/main ${remoteSha ?? "(missing)"}. Push the checkpoint before release preflight.`,
  );
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
execFileSync(pnpm, ["verify"], { cwd: process.cwd(), stdio: "inherit" });

assertClean("after verification");
console.log(`Release preflight passed for ${localSha}.`);
