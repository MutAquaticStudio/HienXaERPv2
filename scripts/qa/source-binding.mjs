import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

export async function readSourceBinding(root = process.cwd()) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const files = git("ls-files", "--cached", "--others", "--exclude-standard", "--",
    "src", "package.json", "pnpm-lock.yaml", "supabase/migrations",
    "scripts/qa/ux-refinement-browser.mjs", "scripts/qa/source-binding.mjs").split("\n").filter(Boolean).sort();
  const digest = createHash("sha256");
  for (const file of files) digest.update(file + "\0").update(await readFile(path.join(root, file)));
  return { sourceCommit: git("rev-parse", "HEAD"), sourceSha256: digest.digest("hex") };
}

export function assertResumeSource(report, current) {
  if (report == null) return;
  assert.equal(report.sourceCommit, current.sourceCommit,
    "QA source commit changed; preserve the incomplete report and do not reuse its passed checks");
  assert.equal(report.sourceSha256, current.sourceSha256,
    "QA source content changed; preserve the incomplete report and do not reuse its passed checks");
}
