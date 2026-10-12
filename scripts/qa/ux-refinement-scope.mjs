import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const base = "e2a639324815f1c147c5b0744ec08d5d3e0dd885";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const allowed = new Set([
  "src/app/admin/page.tsx", "src/app/admin/cashbook/page.tsx", "src/app/admin/deliveries/[id]/page.tsx",
  "src/app/globals.css", "src/app/work/jobs/[id]/page.tsx", "src/components/portal/portal.module.css",
  "src/components/portal/work-result-draft-form.tsx", "src/components/portal/work-result-draft-form.test.tsx",
  "src/components/ui/metric-number.tsx",
]);
const changed = [...new Set([...git("diff", "--name-only", base, "--", "src", "supabase", "package.json", "pnpm-lock.yaml", "next.config.ts").split("\n"), ...git("ls-files", "--others", "--exclude-standard", "--", "src", "supabase").split("\n")])].filter(Boolean).sort();
assert.deepEqual(changed.filter(file => !allowed.has(file)), []);
const before = JSON.parse(await readFile("reports/ux-ui-refinement/BEFORE.json", "utf8"));
const after = JSON.parse(await readFile("reports/ux-ui-refinement/AFTER.json", "utf8"));
assert.equal(before.status, "PASS_CAPTURE_READONLY"); assert.equal(after.status, "PASS_CAPTURE_READONLY");
assert.equal(before.sourceCommit, base); assert.equal(before.workingTree, ""); assert.equal(after.screens.length, 24);
assert.deepEqual(before.businessBefore, after.businessBefore); assert.deepEqual(before.schema, after.schema);
const comparisons = [];
for (const a of after.screens) {
  const b = before.screens.find(s => s.name === a.name && s.size === a.size); assert.ok(b);
  assert.deepEqual(a.tableColumns, b.tableColumns); assert.deepEqual(a.viewport, b.viewport);
  assert.equal(a.bodyFont, b.bodyFont); assert.equal(a.primary, b.primary);
  assert.equal(a.documentWidth <= a.viewportWidth + 1, true); assert.equal(a.clippedMetrics.length, 0); assert.equal(a.unlabelledInputs.length, 0);
  const actions = controls => controls.map(({ tag, name, href, text }) => ({ tag, name, href, text: tag === "BUTTON" || tag === "A" ? text : "" }));
  assert.deepEqual(actions(a.visibleControls), actions(b.visibleControls));
  comparisons.push({ screen: a.name, role: a.role, size: a.size, tableColumnsUnchanged: true, actionsAndFieldNamesUnchanged: true, fontAndColorUnchanged: true, documentOverflow: false, beforeClipped: b.clippedMetrics.length, afterClipped: 0, beforeUnlabelled: b.unlabelledInputs.length, afterUnlabelled: 0 });
}
const files = git("ls-files", "--cached", "--others", "--exclude-standard", "--", "src", "supabase/migrations", "package.json", "pnpm-lock.yaml", "next.config.ts").split("\n").filter(file => file && !/\.(test|spec)\./.test(file)).sort();
const h = createHash("sha256"); for (const file of files) h.update(file + "\0").update(await readFile(file));
const deployment = JSON.parse(await readFile("vercel.json", "utf8")); assert.equal(deployment.git.deploymentEnabled["codex/ux-ui-refinement"], false);
const result = { status: "PASS_PRESENTATION_SCOPE_AND24_PAIRS", checkedAt: new Date().toISOString(), candidateBase: base, runtimeSourceSha256: h.digest("hex"), changedSourceFiles: changed, noBackendOrSchemaOrDependencyChanges: true, operationsOnlyChange: "Disable automatic deployment of this UX review branch; local preview uses owned QA", browserComparisons: comparisons, beforeClipped: comparisons.reduce((n, s) => n + s.beforeClipped, 0), afterClipped: 0, unchangedSourceContracts: ["API/RPC", "permission/RLS", "money/quantity calculations", "transactions/idempotency", "new-operation no-opening rule"], excludedAdvanceRaceModes: ["different-intents", "same-intent"] };
await writeFile("reports/ux-ui-refinement/COMPARISON.json", JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify({ status: result.status, screens: comparisons.length, beforeClipped: result.beforeClipped, afterClipped: 0 }));
