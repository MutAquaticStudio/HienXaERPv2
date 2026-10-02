# Hiền Xa ERP V2 - Release approval package (not approvable)

Date: 2026-09-22. Canonical set: HX-V2-DOCSET-4.4 / SYNC-4.4.
Scope: local workspace, approved QA project `ffrwiglcrlumfvhubaxg`, and authorized read-only Production inventory `nbwynrwkdbtfsitafsxa`.
Owner conditionally authorized Production deployment/cutover after required gates pass. Production was inspected read-only, not migrated or deployed. This package is not exact-candidate acceptance.

## Current gate delta - IMP-187 (supersedes historical status below)

### Cutover preflight - IMP-190: BLOCKED_ENV_TARGET_MISMATCH

Owner requested immediate cutover. Record this as an override request, never as fabricated check PASS. Vercel CLI authenticated as mutaquaticstudio and confirmed project prj_7cpdvLr47L26ICquB2ah4n7ceB6n in team_vsD8hUJEjtJfZm8zthHCcPS4. Browser shows the current Ready deployment hien-xa-erp-v2-fasz2zgy3-noxelis.vercel.app from commit 2a81dc87e2ad0de3ff3349fb0e894115e333c142, with the ERP domain and www.hienxavlxd.com attached.

The pulled Production configuration resolves NEXT_PUBLIC_SUPABASE_URL to https://vknnzzecimfpnrsqbnuu.supabase.co, NOT the inspected target https://nbwynrwkdbtfsitafsxa.supabase.co. No inventory, backup or migration-readiness claim applies to vknnzzecimfpnrsqbnuu. Stop before switching the database, applying migrations or promoting domains until Owner identifies the intended target. HX_CLOUD_RUNTIME_APPROVED is also absent from the Production environment; the current source requires explicit cloud approval.

Vercel secret-type values are not downloadable: CLI supplied placeholders for six values, including SUPABASE_DB_URL and SUPABASE_SECRET_KEY. Do not use those placeholders, substitute QA credentials, or change passwords. The Supabase CLI has no management access token. The team dashboard also displays an overdue-payment warning; no payment/upgrade was made and no claim is made that this alone blocks all deployment APIs. Connector errors were bypassed with the existing CLI account for read-only preflight only. No Production application, schema, configuration or domain change occurred.

### Latest Owner decision and Production evidence - IMP-189

- Physical-device UAT: OWNER_DEFERRED by explicit Owner instruction on 2026-09-22; Owner will independently check. It is not a PASS and no longer blocks the agent's technical scope. Exact-candidate acceptance and other technical gates are not implicitly waived.
- Production baseline comparison: seven structural groups match exact ordered catalog fingerprints: columns, constraints, indexes, views, policies, RLS/options and ordinary triggers. Of 111 application functions, 104 definitions match exactly; seven access-management definitions match after whitespace removal and also preserve all quoted string literals exactly. This is scoped structural/definition evidence, not a complete privilege/configuration audit or formal SQL semantic-equivalence proof.
- The extra public.rls_auto_enable event-trigger function is attached to enabled ensure_rls on ddl_command_end for CREATE TABLE, CREATE TABLE AS and SELECT INTO. It was not executed, disabled or removed. Supabase documents this auto-RLS pattern at https://supabase.com/docs/guides/database/postgres/event-triggers .
- The Production Scheduled backups page explicitly states that Free Plan does not include project backups and offers an upgrade. No paid upgrade was selected. Managed recovery remains blocked by the available environment; prior logical QA recovery is not relabelled as managed recovery.
- Expanded-load capacity and immutable release commit/remote verification remain incomplete. The prior local manifest is a historical content snapshot and predates this documentation delta, not a newly approved release candidate.

- R12-01: named Production project inventory PASS. All 82 public tables were counted in a read-only transaction with a statement timeout. Seven contain bootstrap/access/audit data; the remaining 75 are empty. Auth has one user and one identity; Storage has three buckets and zero objects. Business-data classification: `NO_LEGACY_DATA_TO_MIGRATE` within this project, not a claim about external archives. Preserve existing identity/access, branch, audit, buckets and migration history as `KEEP_DATA`.
- Production migration ledger: nine versions, matching the first nine local files through `20260914060713`. Forty later local migrations are pending there. No Production migration was applied; migration history equality does not prove absence of schema drift.
- QA migration ledger: a new read-only check found 47/49 versions. The two portal-security migrations already existed semantically in live policies/functions/grants. Official QA-only `migration repair --status applied` recorded versions `20260922000600` and `20260922000700`; a fresh exact version-set comparison passed 49/49. No application schema or permission change was made by this repair.
- R12-02: IMP-188 freshly ran all 49 migrations in an isolated QA database and a separate source-baseline nine-to-49 upgrade. Catalogs matched and synthetic Owner bootstrap/access/audit data survived, with all 62 prior permissions and roles.manage retained. Both temporary databases were removed. This closes the current application-schema rehearsal boundary, not actual Production schema-drift comparison or managed Auth/Storage service recovery.
- R12-03: reuse IMP-169..185 only for their documented, unchanged inputs. Portal field audit, technical role UAT, Storage and sampled list/report performance are scoped evidence, not full expanded-scale, real-device or human acceptance. Full required scale, cross-domain coverage and exact immutable candidate evidence remain incomplete.
- R12-04: prior QA logical data/object restore evidence remains scoped and reusable. Production overview displayed `No backups`; the managed backup detail view could not be inspected reliably through the browser accessibility surface. Do not infer all backup methods are absent. Managed recovery/PITR and operating-service restore remain unproved.
- R12-05: NOT_APPROVABLE. No immutable release commit/remote match or Owner acceptance of that exact candidate is recorded. Historical fingerprints below do not identify the current candidate.
- R12-06: AUTHORIZED_CONDITIONALLY, BLOCKED_BY_GATES. Do not deploy/cutover, reset credentials, wipe data, issue real invoices or send customer messages based on this package.
- Immediate technical work remaining: complete required expanded-scale/reconciliation/security checks on a suitable isolated environment, including any privilege/configuration boundaries not covered by structural comparison; demonstrate managed/service recovery; then verify an immutable release commit and remote match. The local content manifest is not a release commit or evidence of tests against a deployed build. Physical-device UAT is OWNER_DEFERRED; provider decisions and exact-candidate acceptance remain explicit gates, not automated PASS results.

### IMP-188 scale and recovery constraints

QA remains guarded at 400 MiB. A read-only inventory found 20,102 SO, 100,502 SO lines, 30,150 deliveries, 20,100 expenses, 200 payments, 200 earnings and zero messages. Required expanded coverage is defined only in Spec.md. Linear extrapolation of current relation sizes for SO, SO lines, deliveries and expenses alone, retaining the current remaining database size, exceeds the QA guard before the other required datasets are expanded. This is a capacity estimate, not a measured full-scale result or proof of the minimum necessary capacity. Do not disable the guard or silently claim the current sample satisfies the expanded gate.

Managed recovery and exact-candidate acceptance remain NOT_RUN. Physical-device UAT is OWNER_DEFERRED, not an agent blocker or PASS. No paid plan upgrade, new provider selection, Production mutation or Owner sign-off has been inferred.

## Historical evidence below

The original package and historical measurements are retained below for traceability. Its statements that Production was uninspected or unauthorized are superseded by the current delta, not by a claim of release readiness.

## Candidate identity

- Historical pre-IMP-145 workspace source/document fingerprint SHA-256: `3fb3b9b44643211265a695f065d4d635efb0a5a6213044d3134f04a03ffd6378`. This is superseded by the R12-04 evidence delta; no current immutable candidate is claimed.
- Input set: sorted per-file SHA-256 lines for `src`, `supabase/migrations`, `scripts/qa`, `Spec.md`, `UXUI.md`, `plan.md`, `tasks.md`, `implementation.md`, `package.json`, `pnpm-lock.yaml`, and `next.config.ts`, then SHA-256 of that stream. Secrets, generated output and this package are excluded.
- Historical pre-IMP-145 canonical document hashes: Spec `ba80e00b03a86884293cd7e669b9362a2d44607d5edc1678f1d4c45e95abf1a6`; UXUI `5bb949c589d030cc9b22a95131529b0bc83a0258d4c04c306a438ad5e5a4ee6b`; plan `5639e07208b9b04f68da60051fa2d101241c069c79921c81c8cc4949f3090e82`; tasks `0ec938c048f554919de2cc1e94d1e34f221b10a7c70a171f7b0c0cccc840ab1c`; implementation `2f4f51c6729e85865c803a9f41393ac43ef32e5ead0c4ed9e358cafd92762fb3`. Recompute tasks/implementation hashes when freezing a new candidate.
- Git checkpoint SHA: NOT_VERIFIED. Remote match: NOT_VERIFIED / NOT_PUSHED in this work session. A workspace fingerprint is not an immutable release commit.

## Gate evidence

| Gate | Evidence | State |
|---|---|---|
| GA/GC | Existing targeted evidence IMP-100..133, GC-25 build gate | REUSED; no full re-audit |
| R10 | IMP-134..138 route/GPS/messaging QA and local provider stub | IMPLEMENTED; live sandbox/device NOT_RUN |
| R11 | IMP-139..146 provider-neutral domain, QA rollback adjustment replay/duplicate rejection, populated Owner invoice list and one-page QA review PDF, invalid-ID 400/absent 404, focused PDF test 4/4, typecheck | IMPLEMENTED to available boundary; provider HUMAN_GATE, real issue NOT_RUN |
| Migration | A separate QA PostgreSQL database applied all 41 migrations from zero with minimal Auth shim; application catalog matched primary QA after idempotency fix; official QA-only migration repair reconciled 19 versions | PASS at application-schema boundary: 41/41 QA ledger; full managed-service rehearsal NOT_RUN |
| Reconciliation | QA aggregate AR 100.1m VND after a synthetic 0.1m service verification, AP 50m VND; invoice source, line total and active coverage all 0.1m VND | PARTIAL; prior branch-A figures predate the new QA fixture; legacy Production unverified |
| Security | Six-role route-content matrix 30/30; worker invoice-source RPC denied 42501; review PDF Owner 200, worker/customer JSON 403 without PDF; QA write fence denied UPDATE 25006 | PARTIAL; denied Server Component pages still stream HTTP 200; full-system SEC not signed off |
| Performance | Local optimized HTTP list, QA remote DB ap-northeast-2, arm64 Node 24, 100 warm samples at concurrency 5 each: invoice p95/p99 733/866ms; purchase 677/754ms; zero errors | PARTIAL; small dataset, cold invoice 1169ms, not click-to-useful or expanded scale |
| Accessibility | Login/admin/work/customer targeted axe-core 4.13.0 scans: NEW_GAP-05 admin logo contrast 1.7:1 fixed; six affected admin role/viewport cases rerun with zero automated violations. Sampled Owner orders and worker work Tab sequences visited eight visible controls each with 3px focus outlines. | PARTIAL; automated sample is not full WCAG, AT, 200% zoom, touch or representative-human action UAT |
| Backup/recovery | QA four-schema database restore matched Auth users/identities, Storage buckets/object metadata and application sample row hashes; 4/4 private Storage object bytes restored with SHA-256 match | PASS at QA data boundary; managed Supabase backup/PITR and running-service recovery NOT_RUN |
| Production | No deploy, migration, DML, config mutation or cutover | LOCKED |

## Unresolved decisions and defects

1. `NEW_GAP-02` is FIXED on QA: clean application catalog matched, the idempotent message-scope migration was corrected, and the QA ledger now records 41/41 versions. Managed Auth/Storage environment rehearsal still needs its own evidence.
2. `NEW_GAP-03` P1 is FIXED: malformed review-PDF ID returns 400 and valid absent ID returns 404. A populated QA review-PDF artifact was inspected as one page with source, amount and non-legal disclaimer. `NEW_GAP-04` is FIXED: unauthorized worker/customer requests now return JSON 403 instead of 500.
3. Confirm actual legacy Production dataset existence with a separately authorized read-only inventory; if absent, explicitly classify `NO_LEGACY_DATA_TO_MIGRATE`, otherwise map/classify/reconcile all required datasets. No inference from QA fixtures.
4. Application-data backup/restore was rehearsed with archive SHA-256 `df99207b9f9e963d72fde980afe2b88d0422974e13fd32c5f51db83c77ec802a`; 97 tables and pre-fixture financial totals matched. A later QA four-schema restore and 4/4 Storage byte restore also passed. Complete separate managed Supabase backup/PITR and running-service recovery before release acceptance.
5. Complete representative/expanded performance, multi-role accessibility/UAT, live route-provider/device GPS and any required external sandbox checks on the exact immutable candidate.
6. Owner/provider must select legal invoice form, tax/signing policy and provider/API before real issue integration. Real issuance and customer messaging remain disabled without separate authorization.

## Owner approval boundary

Status: **NOT_APPROVABLE**. No signature or release acceptance is recorded.
Before a future cutover: close the blockers above; freeze an immutable Git candidate; verify QA build, migration ledger and remote match; repeat only invalidated checks; obtain separate explicit Owner authorization for any Production action. R12-06 remains LOCKED and R12-07 NOT_RUN.

## QA evidence delta - 2026-09-21

- R12-04 Storage object rehearsal: backed up all 4 objects (470,183 bytes) from the private `portal-evidence` bucket to restricted temporary files, restored them to a unique temporary QA bucket, and matched SHA-256 for all 4 downloaded objects. Temporary bucket and files were removed. This is QA object-byte recovery evidence, not a managed Supabase backup/PITR rehearsal.
- QA inventory: 6 Auth users, 3 Storage buckets, 4 Storage objects. The QA project dashboard reports `LAST BACKUP: No backups`. Managed Auth/Storage recovery and PITR remain NOT_RUN.
- QA Security Advisor flags six `SECURITY DEFINER` read views. All six are granted to `authenticated`, not `anon`, include explicit branch permission guards, and returned zero rows as `authenticated` without a JWT. A three-user sample returned PO rows only for the authorized multi-branch user. This focused check is not an exhaustive security sign-off; do not change these views to `security_invoker` without confirming underlying grants/RLS, because some base tables intentionally lack direct `SELECT` grants.
- The Supabase organization lists both `HienXaERPv2` and `HienXaERPv2-QA`. Project existence does not establish whether the Production legacy dataset is empty. No Production data or configuration was accessed or changed.
- R12-03 expanded-scale performance, full assistive-technology/browser-zoom accessibility and representative multi-role UAT remain NOT_RUN. Targeted QA Owner/Worker reflow and touch checks are recorded in IMP-149, but do not promote the small-dataset performance or overall R12-03 gate to PASS.

## Current decision delta: IMP-191 (2026-09-22)

Owner explicitly selected nbwynrwkdbtfsitafsxa for the Vercel switch and requested
cutover by override. This supersedes IMP-190's unresolved target question, not its
observation of the old live environment. Do not ask Owner to select the target again.
Keep vknnzzecimfpnrsqbnuu and the existing deployment intact for rollback.
Physical-device UAT is OWNER_DEFERRED; unrun checks are not PASS.

Operational readiness is still incomplete: target secret credentials, current backup,
40 pending migrations, exact candidate, staged deployment, domain promotion and
post-cutover reconciliation. NEXT_PUBLIC_APP_URL must use the approved public origin;
APP_BASE_URL is not the application's recovery redirect input. No password reset.

Vercel upload dry-run found internal QA/document artifacts in the original package.
A .vercelignore now excludes their contents, but its unanchored qa/ pattern also
excludes src/app/api/qa/environment. Packaging remains PARTIAL until that unintended
source exclusion is corrected and the affected check passes. No files were uploaded.
No Production mutation or full-release approval is claimed by this delta.

## Packaging correction: IMP-192 (2026-09-22)

The IMP-191 upload-scope blocker is FIXED. Directory exclusions are now rooted;
Vercel CLI dry-run and focused assertions passed with all 195 source entries retained
and zero src paths excluded. Credentials, internal documents and QA evidence remain
excluded. No upload, deployment or Production mutation occurred.

This supersedes only IMP-191's packaging PARTIAL status. Target operational readiness,
exact-candidate deployment and post-cutover reconciliation remain incomplete; no full
release PASS or completed cutover is claimed.

## Staged candidate: IMP-193 (2026-09-22)

Deployment dpl_5SdLVt665z2A1kg1zaa8xZe2dsbf is READY at
https://hien-xa-erp-v2-qoklueiyg-noxelis.vercel.app, created with --prod --skip-domain
and deployment-scoped configuration for nbwynrwkdbtfsitafsxa. Existing target API keys
were retrieved without rotation and Auth Admin read succeeded. Compilation, TypeScript,
page generation and scoped health/QA-disabled/unauthenticated-context checks passed.
The candidate is SSO-protected. These results are not authenticated business acceptance.

Inspection of www.hienxavlxd.com still resolves the old deployment
(dpl_aT6fdZ6VHqpzf6thNqZiHhDKccco). No database mutation or custom-domain promotion.
Current backup, pending incremental schema upgrade, persistent hosting environment,
authenticated candidate checks, promotion and post-cutover reconciliation remain open.
The prior no-deployment statements are historical; a staged candidate now exists.
Full-release PASS and completed cutover are not claimed.

## Pre-upgrade data preservation: IMP-194 (2026-09-22)

A private, validated data snapshot of nbwynrwkdbtfsitafsxa now exists outside the
repository. It covers 118 tables, including all 82 public tables, Auth, Storage metadata
and migration history, plus 112 application functions and selected security metadata.
No table reached the read cap. Owner bootstrap remains present; Storage objects are
empty; migration history is still the first nine versions, with 40 pending.

The snapshot is not a complete pg_dump schema archive and has not been used to prove
managed-service recovery. Keep that limitation explicit before applying migrations.
No database mutation or custom-domain promotion occurred. IMP-193 candidate evidence
is reused without an unrelated rebuild.

## Atomic upgrade preparation: IMP-195 (2026-09-22)

The additional isolated-QA atomic-upgrade rehearsal failed in its newly written
helper's deliberate-failure SQL construction (dollar delimiter escaping). Its temporary
database was removed. No atomic-bundle PASS or approved generated upgrade bundle exists
from this invocation. Correct the helper and rerun the focused rehearsal before use.
Earlier per-migration rehearsal evidence remains valid only within its original scope.
Production database and custom-domain routing were not changed.

## Atomic upgrade rehearsal passed: IMP-196 (2026-09-22)

Owner confirmed the helper correction. The focused isolated-QA run now passes deliberate
pre-commit rollback, atomic 9-to-49 upgrade with data preservation, and replay rejection.
The temporary QA database was removed. This supersedes IMP-195's helper failure.

Generated bundle SHA-256:
f0c8e20717b150bdf9556a5ea8a3bb3c4d1a079348900c5b3a6c88c6898dbba7

The bundle has not run on Production. Synthetic QA evidence does not prove recovery of
actual Production identities or managed Auth/Storage services. Production execution,
configuration, authenticated candidate checks and cutover remain pending.

## Browser execution and Auth configuration preflight: IMP-197 (2026-09-22)

The approved upgrade bundle checksum remains unchanged, but the bundle has NOT_RUN on
Production. Browser activity interrupted preparation; the dedicated Supabase window
closed before SQL was pasted or executed. Confirm the target again before any mutation.

Additional configuration gap: nbwynrwkdbtfsitafsxa Auth Site URL still points to
https://hienxa-erp-v2.vercel.app with no redirect URLs, while the candidate uses
https://www.hienxavlxd.com. This requires alignment before redirect-dependent journeys.
No recovery email, password reset, migration or domain promotion was performed.

## Production schema upgrade: IMP-198 (2026-09-22)

Selected database nbwynrwkdbtfsitafsxa committed the exact rehearsed atomic 9-to-49
upgrade. SQL Editor returned HX_ATOMIC_UPGRADE_COMMITTED / 49. A separate read-only
query confirmed 49 migrations, retained Owner identity and active access, three buckets
and no objects, zero public tables without RLS, zero anonymous table SELECT grants,
and Owner roles.manage=true.

The old database vknnzzecimfpnrsqbnuu is untouched. No custom-domain promotion. Candidate
remains dpl_5SdLVt665z2A1kg1zaa8xZe2dsbf. Auth redirect alignment, persistent hosting
configuration, authenticated candidate checks and post-cutover reconciliation remain
open. Snapshot/managed-recovery limitations are unchanged; no full-release PASS is
inferred from successful schema migration.

## 2026-09-22 operational update — app subdomain live

Owner-requested ERP URL `https://app.hienxavlxd.com` is live on Vercel deployment `dpl_C3uDMCYN3jyeHHaQiybNR6UJpovu`, project `hien-xa-erp-v2`, Supabase project `nbwynrwkdbtfsitafsxa`. Vercel verified the Wix-managed `app` CNAME. Direct HTTPS login as Owner, dashboard, Purchase Orders list, and candidate health passed. `www.hienxavlxd.com` remains the separate Wix marketing website. Supabase Auth Site URL and exact recovery callback now use `app.hienxavlxd.com`; the Vercel app callback remains allowed as a fallback.

This operational cutover does not equal Owner UAT acceptance or full R12 release-gate PASS. Managed backup/PITR is unavailable on the free Supabase plan, physical-device UAT is deferred to Owner, and full-system/performance verification is not asserted. Keep real invoice issuing and real customer messaging disabled until their separate human/provider gates are satisfied. Earlier pending-domain/candidate-only notes are superseded by this dated operational record, not retroactively marked PASS.
