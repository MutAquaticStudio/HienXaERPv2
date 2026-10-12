import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { assertResumeSource, readSourceBinding } from "./source-binding.mjs";

const source = { sourceCommit: "a".repeat(40), sourceSha256: "1".repeat(64) };
test("new QA run accepts no existing report", () => {
  assert.doesNotThrow(() => assertResumeSource(undefined, source));
});
test("unchanged incomplete run can resume without modifying previous evidence", () => {
  const report = { ...source, status: "FAIL", checks: [{ name: "saved", status: "PASS" }] };
  const before = structuredClone(report);
  assert.doesNotThrow(() => assertResumeSource(report, source)); assert.deepEqual(report, before);
});
test("changed commit rejects previous checks even when the content hash matches", () => {
  assert.throws(() => assertResumeSource(source, { ...source, sourceCommit: "b".repeat(40) }), /source commit changed/);
});
test("uncommitted source changes reject previous checks even at the same HEAD", () => {
  assert.throws(() => assertResumeSource(source, { ...source, sourceSha256: "2".repeat(64) }), /source content changed/);
});
test("legacy evidence without a content hash cannot silently become current proof", () => {
  assert.throws(() => assertResumeSource({ sourceCommit: source.sourceCommit }, source), /source content changed/);
});
test("source changed during execution cannot be finalized as PASS", () => {
  const report = { ...source, status: "RUNNING", checks: [{ name: "saved", status: "PASS" }] };
  assert.throws(() => assertResumeSource(report, { ...source, sourceSha256: "3".repeat(64) }), /source content changed/);
  assert.equal(report.status, "RUNNING");
});
test("the real source reader detects uncommitted app and QA harness edits", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hx-source-binding-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  try {
    git("init"); await mkdir(path.join(root, "src")); await mkdir(path.join(root, "scripts/qa"), { recursive: true });
    await writeFile(path.join(root, "src/page.tsx"), "original app");
    await writeFile(path.join(root, "scripts/qa/ux-refinement-browser.mjs"), "original harness");
    git("add", "."); git("-c", "user.name=QA", "-c", "user.email=qa@example.test", "commit", "-m", "source fixture");
    const before = await readSourceBinding(root);
    await writeFile(path.join(root, "src/page.tsx"), "edited app");
    const appEdit = await readSourceBinding(root);
    assert.equal(appEdit.sourceCommit, before.sourceCommit);
    assert.throws(() => assertResumeSource(before, appEdit), /source content changed/);
    await writeFile(path.join(root, "src/page.tsx"), "original app");
    await writeFile(path.join(root, "scripts/qa/ux-refinement-browser.mjs"), "edited harness");
    const harnessEdit = await readSourceBinding(root);
    assert.equal(harnessEdit.sourceCommit, before.sourceCommit);
    assert.throws(() => assertResumeSource(before, harnessEdit), /source content changed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
