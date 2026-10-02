# Hien Xa: credit override and QA/Production payment-state delta

Date: 2026-10-02 (Asia/Ho_Chi_Minh).
Verdict: QA VERIFIED; SCOPED PRODUCTION SYNC AND DEPLOY COMPLETE.
This is a focused delta, not full-system acceptance or Owner sign-off.

## Fixed candidate

- Baseline: exact prior Production source snapshot `/private/tmp/hx-role-flow-release-20261001-P09l5m`.
- Candidate: `/private/tmp/hx-credit-release-20261002-QoZqWS`.
- Source fingerprint: `d066659fd4255c86238f637023e8a35109ebc27c99e7816f95335dba8176f1c1` (317 input files, manifest in candidate.json).
- QA build includes TypeScript and 71 routes. Tested URL: `http://127.0.0.1:4040`.
- QA Supabase: `ffrwiglcrlumfvhubaxg`; migration head `20261001182059`.
- Production Supabase: `nbwynrwkdbtfsitafsxa`; head advanced from `20260930101520` to `20261001182059` after explicit Owner authorization for all three named migrations.
- Production app: `dpl_4TebnWLh4v8aaLD8uLU66V4dxCnv`, READY, primary `https://hien-xa-erp-v2-nu.vercel.app` directly inspected and MATCHED after promotion.
- Unique deployment: `https://hien-xa-erp-v2-ewl6wo56p-hienxa.vercel.app`; Vercel account `thunderekt-6020`, scope `hienxa`, project `prj_o6ya9YI1b3fTFC8nxiOtjHiwaS3W`.
- No Git commands, commits, pushes or PRs performed. The immutable source manifest, not an unverified commit SHA, identifies this candidate.
- Existing unrelated workspace changes were preserved. Spec.md, UXUI.md and plan.md were not edited.

## RF08: per-confirmation credit exception

Contract: SPEC-CRE-002/003; ordinary confirmation must retain credit/overdue blocks.

Implementation:

- New `sales_order_credit_overrides` table: one immutable decision per SO, actor, reason, operation, commitment, timestamp, limit/exposure/overdue snapshots.
- New `preview_sales_order_credit_override` and `confirm_sales_order_with_credit_override` RPCs.
- Server requires both `orders.confirm` and `finance.ar.adjust`; no role grants or permanent exemptions added.
- Existing normal confirmation API is unchanged.
- Confirm locks the order and customer, recomputes the snapshot after locking, rejects stale approvals, and posts commitment/confirmation/decision/audit atomically.
- Replay uses the same actor, reason, snapshot and operation; changed intent conflicts. A different order requires a new decision.
- Confirmation does not post AR, AP, payments, inventory movements or inventory reservations.
- Decision table denies authenticated writes and rejects privileged update/delete through its append-only trigger.
- UI has snapshot review, mandatory reason and a dedicated approval action. Confirmed SO shows the saved immutable decision.

Changed source:

- `src/app/admin/orders/[id]/page.tsx`
- `src/components/sales/credit-override.tsx`
- `src/modules/sales/credit-override-actions.ts`
- `src/modules/sales/credit-override-actions.test.ts`
- `supabase/migrations/20261001182059_sales_order_confirmation_credit_override.sql`

## Evidence matrix

| Scope | Result | Evidence / actual check |
| --- | --- | --- |
| Server action authority/input/branch/success/error | PASS | 5 new unit cases; no write on invalid reason, missing financial authority or wrong active branch |
| Canonical payment-state regressions | PASS | 7 existing tests rerun because payment-state sync is directly in scope |
| Real QA RPC authority/RLS | PASS | Owner allowed; sales, worker, finance-contact customer, receiver and other customer denied preview/override with 42501; sensitive decision reads filtered |
| Ordinary overdue/exceeded/unapproved-limit confirmation | PASS | Normal RPC remains blocked with 23514 |
| Reason/stale intent/reconfirmation | PASS | 22023 input rejection, 40001 stale snapshot, 23505 changed operation payload, 23514 confirmed-order reapproval |
| Real DB retry | PASS | Same operation twice: exactly one commitment and decision |
| Captured money | PASS | Independent SO35 expected 2*120000+3*150000=690000; exposure 9341000+690000=10031000; approved limit 100000000; overdue 9250000 |
| No AR/AP or stock/payment posting | PASS | Counts unchanged inside rollback tests; movements 58, reservations 12, payments 243 before/after |
| Snapshot immutability | PASS | Authenticated update denied 42501; privileged update/delete denied 55000 |
| Exception scope | PASS | Another SO of the same overdue customer still blocked by normal confirmation |
| Real two-connection lock contention | PASS | Two different draft SOs of same customer serialized; observed wait_event_type=Lock; both transactions rolled back |
| Actual draft/limit change | PASS | Changing draft_version or approved limit inside rollback invalidates the previously valid hash with 40001 |
| QA UI missing reason | PASS | Browser required-field validation prevents submission |
| QA UI approval/reload/persistence | PASS | SO35 approved via UI, double click attempted, reload shows CONFIRMED and saved decision; backend has one commitment, decision and audit |
| QA known payment states | PASS | SO37 PAID; SO38 UNPAID; newly confirmed SO35 NOT_DUE because confirmation creates no AR |
| QA focused lint/build | PASS | eslint exit 0; Next webpack build + TypeScript exit 0 |
| QA advisors, affected new objects | PASS | No advisor finding references the new credit override objects; unrelated findings retained separately |
| Production pre-change inspection | PASS | Read-only view definitions, columns, ACL, security_invoker and migration history captured through logged-in Supabase browser |
| Production migration execution | PASS | Owner explicitly authorized the three named migrations; guarded single transaction committed; migration head 20261001182059; ACL/RLS, totals/fulfillment and business row counts unchanged |
| Production new application deployment | PASS | Candidate manifest unchanged (317 inputs); correct new account/project; deploy and promote exit 0; remote build/TypeScript PASS; primary domain inspection matches READY deployment |
| Production affected read paths | PASS | Health GET HTTP 200; Owner SO list has the same four drafts; SO4 detail shows the new snapshot/reason/override form and NOT_DUE; approval not submitted |
| Production focused security metadata | PASS | Two view hashes match QA exactly; security_invoker preserved; decision RLS enabled; anon cannot execute either RPC; authenticated lacks direct insert/update/delete |
| Production real financial approval/payment flow | NOT_RUN | No fake or real Production transactions performed |

Totals: 12 unit cases and 33 transactional QA DB cases PASS. The race checks prove customer-lock serialization with rollback, not a complete concurrency/failure-injection suite.

## RF42: QA/Production financial-read drift

Before synchronization, Production used DUE/NOT_DUE for SO payment state, and its credit exposure/overdue helper used gross obligations without signed payment allocations. This confirmed implementation/version drift was resolved by the explicitly authorized canonical migrations, not by changing the business requirement.

Fresh normalized Production fingerprints (search_path=''):

- customer_credit_exposure: `85d1414b132ec56d0d95ac1e5207a129`.
- sales_order_read: `a6e3937071ba7411d6224011e2caa9a7`.
- receivable_read: `39845a67c0682e85ac232633c8d82a2a`.

All three required migrations were absent from Production history. The prepared bundle applies these exact canonical inputs, not an all-migrations push:

- `20260930000100_credit_exposure_net_allocations.sql`, SHA256 `4dafa52a09cddcb38d766d588f1072e5a091d61472e9381a4174b36f9a37d7b2`.
- `20261001084145_fix_sales_order_payment_state.sql`, SHA256 `ec97ab4130b97e137e01e9a8a9399ca6a572ba812d2124e9c65204012676553f`.
- `20261001182059_sales_order_confirmation_credit_override.sql`, SHA256 `a90a4f308845f56a6b48026033bdf7af070024839a996ed42494f11d07794e9d`.

Bundle safeguards: fresh migration-head/view-hash guards; single transaction; lock/statement timeouts; unchanged view ACL/security_invoker; unchanged order totals/fulfillment; unchanged financial/inventory/payment/commitment row counts; no Production override data; exact QA post-migration view fingerprints.

Post-migration fingerprints match QA: customer_credit_exposure `3ff94241b3c6bd1a2997834a036b3ffe`; sales_order_read `3f0aef6bd0493ee2eae5af8afd5c2043`. View ACL and security_invoker were preserved.

Observed Production contains 4 SOs, 0 AR obligations, 0 allocations and 0 override decisions after synchronization. Meaningful paid/partial and submitted-override examples remain QA evidence, not evidence of a Production financial transaction. No business DML or new role assignment was performed.

## Retained diagnostics and limits

- Initial direct authenticated inventory-table observation failed 42501. The harness was corrected to privileged read-only ledger observation within the same rollback transaction; no application grants changed.
- Browser wait expected select-branch without surface query; actual URL had ?surface=admin. This was a harness URL expectation, not login failure.
- Native SQL editor setValue inserted into the old query on a later read-only query, producing 42601 andbegin. Corrected using select-all/paste; no DB change occurred.
- Browser DOM table extraction was unavailable; metadata was saved from the visible AX result cell.
- Advisors returned existing security_definer_view flags for purchasing/inventory read views and multiple_permissive_policies warnings. These are NOT validated new cross-role data leaks, not introduced by this patch, and remain outside this focused fix. They require policy-aware review before a whole-system security PASS.
- QA technical verification does not replace device UAT, Owner acceptance, provider sandbox, managed recovery or representative cloud performance measurements.
- Production Run was initially denied by auto-review. The Owner then explicitly authorized all three named migrations and Production deployment; execution continued through the same browser channel without bypassing the rejection.
- Production Security Advisor was rerun: 6 ERROR flags concern the existing purchasing/inventory definer views, not the new override objects. It also reports 126 warnings; the full warning set was not triaged in this focused deployment. Dedicated new-object metadata checks passed, but this is not a whole-system security PASS.

## Artifacts

Evidence directory: `/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-credit-payment-20261002`.

- qa-migration.json
- qa-db-checks.json
- qa-db-race-immutable.json
- qa-actual-stale-snapshot.json
- qa-ui-reconciliation.json
- qa-advisors.json / qa-advisors.stderr.txt
- qa-credit-override-confirmed.png
- production-before.json
- production-migration-inputs.json
- production-scoped-migrations.sql (EXECUTED after explicit Owner authorization; PASS)
- production-migration-result.json / production-migration-pass.png
- production-after.json
- production-deployment.json / production-health.json
- production-credit-form.ax.txt / production-credit-form.png
- production-advisors-errors.ax.txt / production-advisors-warnings.ax.txt
- QA build log: `/private/tmp/hx-credit-payment-20261002/qa-build.log`.

## Release boundary

RF08 is implemented, verified on QA and deployed to Production. RF42 schema/read-state drift is resolved with exact QA/Production view parity. Production read paths were checked; real approval/payment writes were intentionally not tested. Unrelated acceptance/security/external/device gates are unchanged; no full-system acceptance or Owner sign-off is implied.
