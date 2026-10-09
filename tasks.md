# tasks.md — Current Tasks After GitHub Audit

> **DOCSET:** `HX-V2-DOCSET-4.4`
> **SYNC:** `SYNC-4.4`

# TASK-010 — Current State

```yaml
CURRENT_PHASE: R12
CURRENT_BATCH: MILESTONE_B_CLOSURE_20261005
CURRENT_TASK: MB_02_READER_REVOKE_AND_EXACT_QA_AUTHORIZATION_GATE
EXECUTION_STATUS: PARTIAL_NATIVE_REPAIRS_LOCAL_READER_AND_EXTERNAL_RUNTIME_GATES
AUTHORIZATION_SCOPE: REPAIR_INTEGRATE_BUSINESS_QA_AND_RELEASE_PREPARATION
LOCAL_IMPLEMENTATION: PO_COMPLETE_READER_SCOPE_PATCH_PENDING_RETEST
NATIVE_BUSINESS_VERIFICATION: PASS_REUSED_PO_DELIVERY_SCOPE_FINANCE_RACE_BLOCKED_SETUP
RUNTIME_ACCEPTANCE: PARTIAL_HTTP_MANUAL_OWNER_UAT_NOT_RUN
OWNER_ACCEPTANCE: PENDING_OWNER
QA_PROJECT_REF: ffrwiglcrlumfvhubaxg
QA_DATA_CLASSIFICATION: TEST_DATA_ONLY
QA_CLASSIFICATION_SOURCE: OWNER_CONFIRMED
QA_FIXTURE_WRITE_AUTHORIZATION: GRANTED_SCOPED_B1_B8
QA_SCHEMA_MUTATION: PO_PATCH_ALREADY_APPLIED_NEW_PATCHES_NOT_AUTHORIZED
QA_APPROVED_PATCH_SHA256: 9e74a7976728bb33b4401d642b79329e5d5ece9ac016e8509c06bbf238bf2f7d
QA_SCHEMA_APPLY: APPLIED
PRODUCTION_MUTATION: FORBIDDEN_WITHOUT_OWNER
```

Historical R0–R9 tasks are not repeated here. Their source/evidence lives in implementation.md.

# GA — Mandatory Read-only Audit

## GA-01 — Reality/document state
Verify exact HEAD/tree, latest commits, `tasks.md`/`implementation.md` drift.
Output: state map.
No writes.

## GA-02 — Master/commercial audit
Reconfirm:
GAP-02..07.
Read Customer/Site/Supplier/Material/UOM settings, Sales/Quote/PO forms/actions/schema.
No writes.

## GA-03 — Fulfillment/finance/portal audit
Reconfirm:
GAP-08..15.
Read Delivery, Customer360, core lists, Dashboard, shell, PaymentNotice, customer order, access admin.
No writes.

## GA-04 — System-feature audit
Reconfirm:
GAP-16..20.
Settings, Reports, Audit, low-stock alerts, print/export.
No writes.

## GA-05 — Remaining phase audit
Reconfirm:
GAP-21..23 for R10/R11/R12.
No writes.

## GA-06 — Final GAP_REGISTER
Every GAP-01..23 must be CONFIRMED/PARTIAL/DISPROVED/BLOCKED with contract + source evidence.
Add NEW_GAP-* if found.
No source writes.
Gate: no UNKNOWN.

# GC — Gap Closure

## GC-01 — Sync document execution state
Update tasks/implementation to current audited reality.

## GC-02 — Real admin identity + navigation
Remove sample actor/branch/org context. Add discoverability for already-implemented pending queues/features.

## GC-03 — Customer/Site CRUD
Authorized create/edit/deactivate; quick-ready API/actions.
State: PASS (local typecheck, migration replay, and targeted Supabase QA create/edit/deactivate, permission, stale-record, audit checks).

## GC-04 — Supplier CRUD
Full create/edit/deactivate while reusing existing quick-create.
State: PASS (local typecheck, migration replay, and targeted Supabase QA CRUD, permission, stale-record, duplicate quick-create, idempotency, audit checks).

## GC-05 — Material/UOM/Conversion CRUD
Forms + validation + historical snapshot safety.
State: PASS (typecheck, targeted Supabase QA DB/permission/immutability/audit, and affected catalog UI checks).

## GC-06 — Warehouse/Vehicle/Machine/Branch config
Minimal operational CRUD; no asset-management platform.
State: PASS (typecheck, migration replay, targeted Supabase QA CRUD/branch/role/stale/audit, and affected catalog UI checks).

## GC-07 — Settings hub
Permission-aware entry points to GC-03..06 + pricing/config.
State: PASS (permission-filtered Settings/catalog/price UI, Supabase QA price create/version/deactivate/permission/audit checks, and mobile UI check).

## GC-08 — Sales/Quote multi-line editor
Multiple lines, add/remove, exact totals.
State: PASS (QA-browser add/remove and two-line Quote/SO creation; SQL line/document totals exact; price-before-save remains GC-09).

## GC-09 — Sales price preview/manual override
Resolved price/source before Save; MANUAL_APPROVED by permission + reason.
State: PASS (QA-browser price/source/line-total preview, no-zero missing price, permission-gated manual override, stale-preview denial, and SQL MANUAL_APPROVED snapshot checks).

## GC-10 — Quick Customer/Site in Sales
Create inline, preserve draft, auto-select.
State: PASS (QA-browser inline Customer/Site creation, same-draft line/terms preservation, auto-selection and preview; Sales without customers.manage sees no quick-create controls).

## GC-11 — Quote/SO DRAFT edit
Editable draft; immutable sent/confirmed behavior preserved.
State: PASS (QA migration replay/typecheck; in-place Quote/SO edit, stale/idempotency, SENT denial, transactional CONFIRMED SO denial with rollback, Sales manual-price preservation and tamper denial, affected Owner/Sales UI saves).

## GC-12 — PO multi-line + DRAFT edit
Multiple lines, purchase-cost snapshots, confirmed immutability.
State: PASS (typecheck, QA migration replay/apply, direct multi-line DB/SEC/IDEM, Owner create/edit UI and non-pricing Sales DRAFT edit UI PASS; stale/confirmed boundaries and approved-cost preservation checked. NEW_GAP-02 and NEW_GAP-03 closed.)

## GC-13 — PO receive/direct fulfillment multi-line
No `firstLine`; per-line quantities/source/AP idempotency.
State: PASS (typecheck; QA view SEC; warehouse and direct two-line UI; rollback DB/AP/source/idempotency checks).

## GC-14 — Delivery multi-line result/verify/return
No hidden line[0] contract; per-line actual/accepted/billable/return.
State: PASS (per-line transit balance and unambiguous line labels; QA rollback and typecheck PASS).

## GC-15 — Customer 360
Contextual CTA + sites/prices/quotes/orders/deliveries/AR/payments/docs.
State: PASS (nine permission-aware bounded contexts, contextual CTA and site-prefilled order entry; QA query/typecheck PASS).

## GC-16 — Supplier 360
PO/receipts/direct/AP/payments + create PO action.
State: PASS (permission-aware bounded PO/receipts/direct/AP/payments contexts and supplier-prefilled PO entry; QA query/typecheck PASS).

## GC-17 — Access management
Role/branch change, revoke/reactivate, explicit permission management + audit.
State: PASS (role/branch assignment, revoke/reactivate, additive explicit permissions and audited reason; QA rollback/typecheck PASS).

## GC-18 — Customer order portal completeness
Debt/payment state + documents customer-safe.
State: PASS (customer-safe state/timeline/finance/documents payload with role boundary; QA rollback/typecheck PASS).

## GC-19 — Core list bounded query
Orders/Quotes/PO/Customers/Suppliers/Deliveries/AR/AP/ServiceJob search/filter/server pagination.
State: PASS (nine lists use server search/filter, 25-row pagination, URL state and deterministic sort; QA/typecheck PASS).

## GC-20 — Dashboard completion
Expense breakdown, commission detail, contextual AR/AP drill-down preserving filters.
State: PASS.

## GC-21 — Low-stock + in-app alerts
Threshold/material/warehouse, dedupe, inventory link, draft PO link; no auto-order.
State: PASS.

## GC-22 — Print/export
Delivery note, receipt/payment voucher, debt reconciliation statement.
State: PASS.

## GC-23 — Reports
Minimal selector/shared filters/summary/table/chart/export where required. No report builder.
State: PASS.

## GC-24 — Audit Log UI
Actor/entity/action/time filters; readable summary; raw detail on demand.
State: PASS.

## GC-25 — Gap Closure Gate
Recheck only invalidated GAP records.
Must: open P0=0; critical P1 fixed/deferred; docs synced; build/typecheck + targeted checks pass.
State: PASS. GC_COMPLETE: TRUE. Open P0: 0. Open critical P1 in GC scope: 0.

# R10 — Route/GPS/Messaging

## R10-01 — Route provider + manual fallback
State: PASS.
## R10-02 — RoutePlan/apply + stale protection
State: PASS.
## R10-03 — Foreground GPS current/history/retention
State: PASS.
## R10-04 — Messaging DB/realtime/audience
State: PASS.
## R10-05 — Routing/tracking/message UI/navigation
State: PASS at implementation boundary (provider sandbox and active-worker geolocation not claimed as verified).
## R10-06 — R10 gate
State: PASS at available boundary. R10_PHASE_IMPLEMENTED: TRUE; external provider sandbox and device GPS UAT remain NOT_RUN.

# R11 — Electronic Invoice

## R11-01 — Provider/policy human gate
State: HUMAN_GATE (provider, legal form, tax policy, signing and API not selected; independent work continues).
## R11-02 — Provider-neutral invoice domain/coverage/draft/approval
State: PASS (delivery multi-line and service source coverage, approval, AR-neutral QA rollback).
## R11-03 — Durable job mechanism if external async requires
State: NOT_REQUIRED until provider external async is selected; no speculative runner.
## R11-04 — One provider adapter + UNKNOWN reconcile
State: HUMAN_GATE (provider/API/policy unselected; no real issue attempted).
## R11-05 — Invoice documents/adjustment/purchase registry/UI
State: IMPLEMENTED_TO_AVAILABLE_BOUNDARY. QA rollback adjustment replay/unique and purchase registry PASS; invoice list/purchase list browser PASS. NEW_GAP-03 FIXED (400/404 QA); populated review PDF generator and live QA route PASS. NEW_GAP-04 FIXED: worker/customer PDF requests now return 403 instead of 500. Legal/provider acceptance NOT_RUN.
## R11-06 — R11 gate
State: PASS at provider-neutral implementation boundary; four focused review-PDF cases and populated QA PDF route PASS, real issuance NOT_RUN. R11_IMPLEMENTED_TO_AVAILABLE_BOUNDARY: TRUE. R11-01/R11-04 remain HUMAN_GATE and R11-03 NOT_REQUIRED until external async exists.

# R12 — Release/Migration/QA

## R12-01 — Determine actual migration case
State: PASS for the named Production project inventory at 2026-09-22. Read-only catalog and exact counts covered 82 public tables, Auth users/identities, Storage buckets/objects and migration ledger. NO_LEGACY_DATA_TO_MIGRATE applies to business records in this project only: 75 public business tables and Storage objects are empty. KEEP_DATA applies to existing identity/access, branch, audit and bucket configuration. Production has the first nine local migration versions; upgrade incrementally, never reset/replay the baseline. Recheck affected counts before cutover; this is not proof about external archives or other projects. Evidence: IMP-187.
## R12-02 — Clean isolated schema/release rehearsal
State: PASS at current 49-migration application-schema boundary (IMP-188). Isolated QA clean install and source-baseline nine-to-49 upgrade both passed; catalogs matched across columns, constraints, indexes, views, policies, functions, relation grants/RLS and triggers. Synthetic Owner bootstrap data and all 62 prior permissions survived, including roles.manage. Temporary databases were removed. QA ledger is 49/49. This is not a clone of Production schema drift or a full managed Auth/Storage service rehearsal; those boundaries remain unverified.
## R12-03 — Reconciliation + release candidate targeted QA
Owner decision (2026-09-22, IMP-189): physical-device UAT is OWNER_DEFERRED and assigned to Owner for independent checking. It is not PASS and no longer blocks the agent's technical scope. This does not waive expanded-scale, security, recovery or exact-candidate release gates.
State: PARTIAL. QA AR/AP/count/orphan checks, 30/30 six-role route-content checks, focused invoice PDF permission test 4/4, live populated one-page QA PDF with 100,000 VND source snapshot, Owner 200 and worker/customer 403, typecheck/build and 100-request list timings completed. A synthetic QA service verification/draft increased QA aggregate AR to 100,100,000 VND; no provider issue. Targeted axe-core 4.13.0 scan covered three login surfaces and seven role-scoped screens; NEW_GAP-05 admin brand contrast was fixed and six affected admin viewport/role cases rechecked with zero automated violations. Sampled admin/work keyboard focus has visible 3px outlines. QA scale evidence now includes 10,013 customers, 20,523 sites, 20,102 orders, 100,500 order lines, 30,000 added Deliveries, 10,000 added AR/AP each, 10,000 added ServiceJobs, 10,000 added POs with 50,000 lines, 10,000 added suppliers, and 10,000 added quotations with 50,000 lines. Targeted 100-sample customer/site lookup and Customer/Order/Delivery/AR/AP/ServiceJob/PO/Supplier/Quotation list timings are recorded in implementation.md. Order, Quote and ServiceJob reflow at 320/640 px and targeted mobile Order actions passed. Complete cross-domain expanded performance, assistive-technology/human UAT and full-system verification remain incomplete.
## R12-04 — Backup/recovery/write fence
State: PARTIAL overall. QA read-only transaction rejected UPDATE with 25006 and issue flag disabled. Direct TLS pg_dump/pg_restore of public/private data reconciled all 97 application tables and AR/AP/payment totals. A later isolated QA restore included public/private/auth/storage; `auth.users` 6/6, `auth.identities` 6/6, Storage buckets 3/3, objects 4/4, and customers 13/13 matched by count and content hash. All 4 private Storage object bytes (470,183 bytes) were restored to a temporary QA bucket with matching SHA-256. Temporary databases, buckets, files and archives were removed. Managed Supabase backup/PITR and running Auth/Storage service recovery remain NOT_RUN.
## R12-05 — Exact candidate approval package
State: PREPARED_NOT_APPROVABLE. Workspace fingerprint and outstanding human/technical gates recorded in RELEASE_APPROVAL.md; no Git checkpoint/remote or Production authorization claim.
## R12-06 — Production cutover authorized pending prerequisite gates
Current evidence (IMP-198): selected Production database nbwynrwkdbtfsitafsxa committed the exact rehearsed atomic 9-to-49 upgrade. Independent read-only checks confirmed ledger 49, retained Owner identity/active access, 3 buckets, 0 objects, 0 public tables missing RLS, 0 anon table SELECT grants and Owner roles.manage=true. Old database and custom-domain routing have not been changed. Auth redirect alignment, persistent hosting configuration and authenticated candidate checks remain pending.
Historical pre-upgrade observations below are superseded by IMP-198 as to database migration status:
Cutover target decision (IMP-191, progressed by IMP-193): Owner explicitly selected switching Vercel to nbwynrwkdbtfsitafsxa. Target ambiguity is RESOLVED. Existing target API keys retrieved without rotation; Auth Admin read returned 200. Candidate dpl_5SdLVt665z2A1kg1zaa8xZe2dsbf is READY with deployment-scoped target configuration and --skip-domain. Custom live domain still resolves to the old deployment. Preserve vknnzzecimfpnrsqbnuu for rollback. Current backup, incremental migration, persistent hosting configuration, authenticated candidate checks and domain promotion remain pending. Cutover is authorized by Owner override, not fabricated PASS evidence.
Latest evidence (IMP-189): Production's inspected structural catalog matches the nine-migration source baseline; 104 function definitions match exactly and seven match after whitespace normalization with exact literal preservation. The additional ensure_rls event trigger is retained. Grants/default privileges and managed-service configuration are outside this structural comparison. Physical-device UAT is OWNER_DEFERRED; remaining technical release gates still apply.
State: IN_PROGRESS_MIGRATED_CANDIDATE. Production-target candidate is staged and the selected database is upgraded to 49 migrations. No custom-domain cutover performed. Do not switch traffic before Auth/hosting configuration and authenticated candidate checks are ready. Owner override is not technical PASS; physical-device UAT remains OWNER_DEFERRED. No password reset, paid upgrade, real invoice or customer messaging authorized by this override.
## R12-07 — Post-cutover reconcile if authorized
State: NOT_RUN; Owner cutover override and exact target are recorded, but operational readiness is incomplete and no cutover has occurred.
## R12-08 — Closure
State: BLOCKED. NEW_GAP-02/03/04/05 FIXED; application schema and QA data recovery rehearsed, populated review PDF PASS. Named Production inventory is complete (IMP-187); physical-device UAT is OWNER_DEFERRED, not an agent blocker. Full expanded-scale verification and managed-service recovery remain unproven; provider/legal integration remains HUMAN_GATE outside the provider-neutral boundary. Exact target is selected, candidate staged and database upgraded (IMP-198); Auth/hosting configuration, authenticated candidate checks, custom-domain promotion and post-cutover reconciliation remain incomplete. Do not represent Owner risk acceptance as technical PASS.

# TASK-900 — Stop Rules

Stop only for:
- DOC_CONFLICT affecting observable contract;
- human/provider/credential gate blocking all independent work;
- Production authorization.

Otherwise continue authorized independent work.


### QA reconciliation checkpoint - 2026-10-03
CURRENT_SCOPE: COMPLETE_QA_RECONCILIATION_PATCH
CURRENT_TASK: NATIVE_TWO_PATH_VERIFICATION
STATUS: BLOCKED_LOCAL_NATIVE_ENV
- Canonical forward patch prepared; stock count finite guards retained under SPEC-INVTRY-005, direct PO RPC restored to the existing five-argument caller.
- Managed read-only preflight captured five pending real migrations; CLI dry-run rejects the preserved external history entry.
- Pure preflight checks: 9/9 PASS. Native two paths and affected race checks: NOT_RUN, local PostgreSQL unavailable.
- PGlite two-path harness stopped at setup; adapter correction awaits the requested decision. Raw view deparse differs between PostgreSQL 17/18; same-engine query normalization proved equivalent, not an application defect.
- No managed QA apply, original-history repair, Production mutation, provider/performance/recovery rerun or historical value adjustment authorized/executed.

### 2026-10-04 - VERIFY_EXISTING_RECONCILIATION_PATCH_LOCALLY delta

- Local harness/comparator: VERIFIED_ISOLATED_PGLITE, not native.
- Candidate-manifest CLEAN/DIVERGED reconstruction: 21/21 targeted checks.
- Comparator: 5/5; preflight: 9/9; local target rejection: 3/3.
- Remaining task: provision explicitly owned local PostgreSQL 17 runtime, then native two-path and actual local CLI deployment checks.
- State: BLOCKED_ENV; managed apply NOT_ELIGIBLE_FOR_APPROVAL / NOT_AUTHORIZED.
- Managed QA and Production: NOT_TOUCHED. No application/migration/contract edits.

## Milestone B scoped execution delta - QA-B-20261004T140821Z

Owner authorizes B1-B8 fixtures only on `ffrwiglcrlumfvhubaxg` (`TEST_DATA_ONLY_OWNER_CONFIRMED`). No new managed migration, role upgrade, cleanup, push, deploy or historical repair is authorized.

| Task | Actual state | Remaining gate |
| --- | --- | --- |
| BIZ-01 Master/Sales | PARTIAL; authenticated master/quote/revision/SO and negative checks passed | Visual quick-create UAT; Sales test actor lacks quotation.create |
| BIZ-02 Purchasing | PARTIAL; reuse NV-01..08 technical PASS | Six PO visual cases; complete linked sourcing scope |
| BIZ-03 Inventory/Delivery | BLOCKED_MANAGED_DEPENDENCY; native business/race evidence reused | Exact managed delivery/WorkerResult patches need approval; employee daily roles |
| BIZ-04 Supplier direct | PARTIAL; source-separated AP/AR native evidence reused | Managed customer verification dependency; visual UAT |
| BIZ-05 Finance | PARTIAL; payment split/readback passed | Harness assertion/RPC argument repairs; advance/reversal and new finance race |
| BIZ-06 Exceptions | PARTIAL; native short delivery/return/follow-up evidence reused | Managed dependency; remaining loss/return/close and UI evidence |
| BIZ-07 KPI/Reports/Documents | PARTIAL; filtered canonical KPI/readback passed | As-of harness repair; PDF runtime and earning facts not exercised |
| BIZ-08 Daily roles/security | PARTIAL; six Auth sessions and direct permission/isolation denials passed | Purchasing/Dispatch/Finance employee actors; revocation/private Storage/shared-device runtime |

Release support: real local dump/restore reconciliation PASS for current base fixture scope. Representative local order-filter measurement reproduced PERF-B-01; local reader-scope migration and harness are pending successful setup/retest, NOT a verified fix. Storage recovery is not proven. QA-to-live plan and manual UAT are prepared, not executed. Opening balances and release authorization remain Owner decisions. MILESTONE_B=NOT_READY.


### Milestone B closure delta - 2026-10-05

| Scope | Actual state | Evidence / next gate |
|---|---|---|
| MB-01 harness | PARTIAL_6_OF_7 | Finance caller/race, role prerequisite and async metadata checks closed; reader revoke retest blocked by introduced bootstrap delimiter |
| MB-02 reader / PERF-B-01 | NATIVE_FILTER_PERF_PASS_SECURITY_PARTIAL | Positive rows and 100-sample c1/c5 measurements PASS; revoke matrix pending; no cloud apply |
| BIZ-05 / BIZ-07 as-of | TARGETED_NATIVE_HTTP_PASS_NOT_UI_ACCEPTED | Two real allocation races; six HTTP/DB checks; existing payment reused, reversal/advance appended |
| BIZ-08 purchase cost | FIXED_VERIFIED_NATIVE_CLOUD_PENDING | MB-COST-01 CLEAN/DIVERGED 10/10 each; exact forward patch approval required |
| Recovery | PASS_LOCAL_CURRENT_READER_AND_COST_SCOPE | Real isolated pg_dump/restore and selected facts/security reconciliation; Storage recovery NOT_RUN |
| QA dependencies/personas | PENDING_EXACT_OWNER_APPROVAL | Narrow package includes three existing migrations plus cost patch; reader HELD; no role/schema changes made |
| Manual UI UAT | MANUAL_OWNER_UAT_NOT_RUN | Updated actual finance balances and source IDs; six PO visual cases still pending |
| Live transition/release | NOT_AUTHORIZED_NOT_READY | No assumed opening zero, no cleanup, no push/deploy; Owner acceptance pending |

LOCAL_IMPLEMENTATION, NATIVE_BUSINESS_VERIFICATION, RUNTIME_ACCEPTANCE and OWNER_ACCEPTANCE remain distinct. PO LOCAL_PATCH_COMPLETE and technical NV-01..08 PASS unchanged; no PO re-audit.
Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-CLOSURE-20261005T023000Z/exact-qa-schema-and-personas-request.json

### 2026-10-05 - Reader security and final QA package preparation

- Reader bootstrap delimiter and membership revoke timestamp repaired; CLEAN 38 / reconstructed DIVERGED 13 cases PASS before/after. Positive expected IDs, inactive/revoke/regrant, customer isolation, same-PID A-B-A and view/detail/count/export verified. Reader SQL unchanged; native performance reused, not HTTP/browser PASS.
- Exact allowlist entrypoint added. Seven loader/driver-failure checks PASS. New column-ACL capture helper raises 22023 on an empty ACL array; narrow guard repair question sent. Native transaction/history/rollback and scoped restore rehearsal NOT_RUN, not PASS.
- Fresh QA metadata: selected five migration histories absent; nine stock count lines, zero finite violations; obsolete six-argument direct PO overload has zero dependents. Five-argument replacement currently absent, created by the reconciliation patch. No history repair or managed mutation.
- Sales individual branch grants and minimum Purchasing/Warehouse-Dispatch/Finance employee packages prepared, not applied. Private portal-evidence request uses actual create_portal_evidence/finalize_portal_evidence/get_portal_evidence_for_signing; no upload/revoke/policy write.
- Candidate provenance and evidence in /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-FINAL-PREP-20261005034758Z. Final schema approval request withheld until native selector and scoped recovery PASS. NOT_READY_TO_FREEZE; manual UAT NOT_RUN; B_TECHNICALLY_READY=NO; B_OPERATIONAL_READY=NO; OWNER_ACCEPTANCE=PENDING_OWNER.
- No commit/push/deploy. Managed QA changes NONE this turn; Production NOT_TOUCHED. Previous PO/native business evidence remains scoped and unchanged.

### MB exact-catalog ACL and scoped preapply delta (2026-10-05)
- LOCAL_IMPLEMENTATION: column ACL capture fixed; NULL and empty ACL are NO_EXPLICIT_COLUMN_ACL, not acldefault privileges.
- TARGETED_VERIFICATION: ACL cases 6/6 PASS; CLEAN/DIVERGED scoped schema/security reconstruction PASS; explicit column grant reconstruction PASS.
- EXACT_ENTRYPOINT: both local clones applied the exact five-file allowlist atomically and verified already-applied/readback/history; managed QA remained read-only.
- OPEN_HARNESS: QA-EXACT-REHEARSAL-FAULT-INJECTION did not match transactionBody after comments/wrapper stripping; fault/rollback transport cases are NOT VERIFIED. Original failed evidence retained.
- FINAL_SCHEMA_APPROVAL: NOT_READY pending this narrow harness correction/retest; reader/security/performance/cost gates reused unchanged.
- PERSONAS/STORAGE: existing READY_FOR_OWNER request packages reused; no users, grants, Storage objects, deploy, push or managed DDL executed.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-ACL-CLOSURE-20261005041552Z
- RUNTIME_ACCEPTANCE/OWNER_ACCEPTANCE: unchanged; manual UAT not ready; candidate not frozen.

### MB exact failure-path delta (2026-10-05)
- Harness SQL fault hook now uses manifest version/history-insert boundary, not migration body matching; enabled only by explicit local rehearsal flag on an owned loopback target.
- Native fault after versions 1, 3 and 5: actual SQLSTATE 22012 reached; all object/ACL/history changes rolled back. Each readback used a new connection with a different backend PID.
- Selector missing gates reduced to one: 11/12 evidenced. Prior success/already-applied/capture/recovery/reader/performance/persona/Storage evidence reused unchanged.
- OPEN introduced transport hook defect: subclass buffer name pending conflicts with the readonly net.Socket getter. No transport case ran; unknown-commit handling is NOT VERIFIED. Narrow correction request pending.
- Initial connection-refused setup attempt retained; owned cluster binding corrected from 5432 to approved 54757 before successful rollback tests.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-ACL-CLOSURE-20261005041552Z/failure-paths-20261005T060837Z
- No managed schema/account/Storage mutation, push, deploy, UAT or Production action.

### MB final transport harness delta (2026-10-05)
- LOCAL_IMPLEMENTATION: Socket test state moved to lexical WeakMap; no pending assignment, no global Node prototype changes; syntax PASS, targeted lint 0 errors / 2 unused-variable warnings.
- Existing socket factory returns an unconnected net.Socket. postgres.js 3.4.9 invokes connected() directly for options.socket and requires the factory to supply a connected socket.
- Native attempt stopped at startup with ERR_SOCKET_CLOSED before apply BEGIN; no COMMIT-window case, classification or blind-retry proof is claimed.
- The structural SQL fault/rollback cases and prior eleven selector checks remain reused PASS. Selector remains 11/12; final schema package remains NOT_READY.
- Narrow existing factory correction requested; no extra PO/reader/performance/Finance/rollback tests rerun.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-ACL-CLOSURE-20261005041552Z/transport-final-20261005T063555Z
- No managed QA, Storage, deploy, push, cleanup or Production changes.

### MB connected transport/readback closure (2026-10-05)
- LOCAL_IMPLEMENTATION: postgres.js 3.4.9 factory awaits owned loopback TCP connect with finite timeout and listener/socket cleanup. WeakMap state and lexical owned-socket hooks only; no migration/application/production runner changes.
- Connected-factory control PASS (SELECT 1, BEGIN, trivial rollback), PID 36569. Node Socket.connect shadowed the subclass write hook; uninjected commit readback through PID 37320 was retained as failed evidence, with no retry. Owner approved hook preservation and phase correction.
- NATIVE_TRANSPORT: before-COMMIT socket loss 38033 -> new PID 38083: ROLLBACK_CONFIRMED, 0/5 history rows, full affected object/ACL/security pre-state equivalence. Post-server-COMMIT/pre-driver-ack socket loss 38084 -> new PID 38087: COMMIT_CONFIRMED, 5/5 exact history rows and full expected post-state fingerprint.
- Actual exact-manifest classifier verified; execute counts COMMIT/ROLLBACK/INCONSISTENT=1/1/0, no blind retry. All required factory/BEGIN/migration/COMMIT/fault/close/readback phases captured.
- Selector now 12/12, eleven checks reused. Five hashes, reader/security/performance/cost and scoped recovery evidence unchanged. Existing final schema package READY_FOR_OWNER; managed schema/personas/Storage execution remains pending exact Owner authorization.
- Fresh owned clone setup reused the proven reconstruction method, not a new recovery gate. No prior SQL-fault/reader/performance/Finance/PO tests rerun. Harness syntax/lint PASS; sockets and scoped hooks cleaned up.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-ACL-CLOSURE-20261005041552Z/connected-transport-final-20261005T074950Z/connected-hook-retest-20261005T075646Z/final-transport-evidence.json; /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-ACL-CLOSURE-20261005041552Z/connected-transport-final-20261005T074950Z/connected-hook-retest-20261005T075646Z/transport-closure-delta.json
- Managed QA/Storage/Production untouched. No UAT, commit, push or deploy. B_TECHNICALLY_READY=NO; B_OPERATIONAL_READY=NO.


### MB exact managed QA execution delta (2026-10-05)
- OWNER_AUTHORITY: exact final package SHA bb0c6ab7ef6006b2e443514f3c8b5d6bcd9d4cade148e0dbeb9c862aed59a925; target ffrwiglcrlumfvhubaxg, TEST_DATA_ONLY_OWNER_CONFIRMED. Exact five schema changes, Sales individual grants, three persona package and private Storage fixture scope authorized; no Production/go-live/UAT/push authority.
- MANAGED_SCHEMA: five byte-exact migrations applied by unchanged exact selector in ONE_TRANSACTION_ALL_FIVE. New physical readback PID 537552: COMMIT_CONFIRMED; five history versions once, unrelated history unchanged; expected affected schema/security fingerprint 60e2e9dcd8a473beb43d327629f59469519e67ef9663f7b7c8a2ca9de326f45c. Pre-capture matched; obsolete Direct-PO overload dependent count zero and removed. PostgREST cache notification sent.
- HTTP_PARTIAL: ordinary Sales/Owner reader each returned 25 exact independently expected IDs. Targeted HTTP client wallclock 25 samples/0 errors, p95 332.904ms on QA 20146 orders/100576 lines; not server-duration/browser evidence and not local SQL benchmark. Ordinary Owner raw PO cost columns denied 42501; remaining permission surfaces/security matrix not run.
- INTERNAL_HARNESS_OPEN: persona state assertion counted four revoked history access rows along with one approved active row; no Sales grant/persona creation occurred. Metadata diagnostic output environment missing. Stock material code contained lowercase UUID against uppercase code constraint; entire new master transaction rolled back, persisted fixture rows zero. Correction requests sent; failures preserved, not business PASS.
- Optional Direct-PO pre-state diagnostic incorrectly required the five-argument RPC before the verified migration creates it. Failed diagnostic retained; unchanged approved exact runner preflight/poststate independently passed. No migration rerun.
- RUNTIME_ACCEPTANCE: persona provisioning, affected business/security HTTP checks and private Storage lifecycle/recovery remain incomplete. Current credentials exist; do not mislabel these internal harness failures as missing cloud/fixture authorization or missing secure credentials. No manual UAT, release freeze, commit/push/deploy, historical repair or other target mutation.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/managed-execution-delta.json
- MANAGED_QA_CORE_READY_FOR_UAT=NO; candidate_ready_to_freeze=NO; OWNER_ACCEPTANCE=PENDING_OWNER; B_TECHNICALLY_READY=NO; B_OPERATIONAL_READY=NO; Production NOT_TOUCHED.


## Managed runtime delta - 2026-10-05T11:35:57.211Z
- LOCAL_IMPLEMENTATION: no application/migration changes. Schema phase remains CLOSED: five exact versions and poststate/history PASS reused; no reapply or preapply rehearsal.
- QA setup: persona history assertion and metadata output path PASS. Stock material code corrected to deterministic uppercase; stock setup not executed because a newly introduced zero assertion needs correction.
- MANAGED_TECHNICAL_RUNTIME: Sales individual branch grants EXACT (+quotation.create, +customers.manage); three ordinary employee personas authenticated and branch/permission isolation verified. Existing Sales history preserved and shared roles unchanged.
- Reader managed security 15/15 PASS, temporary QA state restored. Purchase-cost managed HTTP 13 controls PASS, positive costs 60000/200000 and total 1000000 independently reconciled; existing source fixture read only.
- Targeted HTTP performance: seven read paths have positive IDs and 10 samples each; dashboard adds 10 samples with independent canonical revenue 4802000. HTTP client wallclock is not SQL/server/browser time.
- OPEN_LOCAL_HARNESS: stock zero assertion escape; customer setup must use save_customer_site_profile instead of denied raw INSERT; negative helper must preserve an existing operation ID. Correction questions already sent; no reply received. First new business fixture action failed without a committed master/business operation.
- RUNTIME_ACCEPTANCE: Direct PO, stock, delivery/worker/Owner and private Storage lifecycle/recovery still NOT_RUN; UI/manual UAT NOT_RUN. Missing execution is not application FAIL or owner policy gate.
- MANAGED_QA_CORE_READY_FOR_UAT=NO; candidate_ready_to_freeze=NO. OWNER_ACCEPTANCE=PENDING_OWNER; no freeze/commit/push/deploy/Production.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/runtime-execution-delta.json


### 2026-10-05: managed core runtime closure delta

- [x] LOCAL_HARNESS: stock numeric-zero assertion and valid uppercase material fixture; managed HTTP stock count 16 controls PASS.
- [x] LOCAL_HARNESS: Customer/Site use canonical profile RPC; complete expected/base payload fixes the introduced credit-limit caller. Customer/Site records are reused, not recreated.
- [x] TECHNICAL_HTTP: Sales Customer/Site -> two-line Quote -> revision -> linked SO PASS; price replacement preserves document snapshots; SO confirmation creates no AR.
- [x] HARNESS_UNIT: negative-operation helper preserves an explicitly supplied operation ID (3/3); direct-PO HTTP same-key check is not yet executed.
- [x] PERFORMANCE: classify existing positive-control measurements against SPEC-PERF-002/004 without rerunning samples; HTTP-client elapsed upper-bound evidence is not browser wait evidence.
- [ ] Introduced purchase-price fixture caller used an unsupported authenticated INSERT (42501). Scoped SQL setup for exactly two owned configuration fixtures awaits the separately submitted response; no grants/schema relaxation.
- [ ] Introduced authorization fetch-wrapper syntax error is caught before any request; narrow repair awaits the separately submitted response.
- [ ] Direct PO/supplier-direct, Delivery/Worker/Owner and private Storage lifecycle/recovery remain NOT_EXECUTED in this continuation; prepared scripts do not constitute PASS.
- RUNTIME_ACCEPTANCE: PARTIAL; MANAGED_QA_CORE_READY_FOR_UAT=NO; OWNER_ACCEPTANCE=PENDING_OWNER; no freeze, commit, push or deployment.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/runtime-closure-delta.json


### 2026-10-05: final managed runtime gates, narrow continuation

- [x] Owner authorizes exactly two purchase-price facts via controlled QA SETUP_ONLY, with no schema/RLS/grant/role change. Prepared continuation is syntax-valid; actual fixture INSERT was not reached.
- [x] Authorization fetch wrapper delimiter repaired; syntax PASS and real Customer HTTP controls reached. No global fetch/Node monkey patch installed.
- [x] HTTP shared client/identity and restricted-admin boundary: 10 controls PASS (Sales positive, logout/protected read denial, same client switched to Customer, seven ordinary personas denied permission administration). Browser/shared-device UI remains PENDING_OWNER.
- [x] Current Sales fixture provenance saved separately: 1800000 + 1200000 = 3000000 VND; old fixture evidence remains separate.
- [x] Storage exact package hash matches; Storage object writes not reached.
- [x] Existing positive HTTP performance samples classified against SPEC-PERF-002/004, no samples rerun or dropped. API budget proven by conservative complete HTTP elapsed upper bound; browser/admin-shell timings NOT_COMPARABLE.
- [ ] New introduced SO preflight used nonexistent state/total_vnd columns. Actual header uses commercial_state and totals must be independently reconciled from lines. No purchase-price fact committed. Narrow correction awaits the separately submitted response.
- [ ] New introduced Worker negative setup assumes a foreign active assignment; actual count is zero. Preserve this case, construct canonical scoped fixture without bypassing auth or deleting history. Correction awaits the separately submitted response.
- [ ] Direct PO/supplier direct/operation-ID real HTTP/Storage/Delivery-Worker-Owner remain NOT_EXECUTED because upstream fixture preconditions failed.
- Reuse five applied migrations, reader 15, cost 13, Stock 16, Sales canonical workflow, personas/grants and Finance. No schema reapply, role mutation, cleanup, freeze, commit, push, deploy or manual UAT.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/final-managed-runtime-gates-delta.json

### 2026-10-05 - Final dependent managed runtime delta (QA-MB-OPS-20261005T131835531Z)
- COMPLETE: corrected SO preflight to commercial_state plus canonical two-line total; exactly two purchase-price fixtures were added as SETUP_ONLY. No schema/role/grant expansion.
- COMPLETE: ordinary Purchasing Direct PO and supplier-direct HTTP; supplier AP 3,900,000 VND and customer AR 5,700,000 VND are separate sources; no fake inventory/double cost. Actual operation-ID retry/conflict controls passed.
- COMPLETE: canonical own/foreign Work assignment; same Worker own read succeeds and foreign active assignment is denied. Authorization evidence totals 14 scoped HTTP controls, with 12 reused and 2 new.
- COMPLETE_SCOPED: two private 68-byte PNG evidence objects; upload/finalize, Owner/Worker/signed reads, outsider denial, source metadata and isolated fixture byte/hash restore. All temporary Worker access revocations were restored.
- OPEN P1 STORAGE-REVOKE-CACHE-01: warmed previously authorized Worker session downloads cached bytes after branch revoke. New signer and fresh sessions are denied. cacheControl=0 does not solve the warmed-session path. Do not mark the Storage revoke gate PASS.
- OPEN QA-DELIVERY-READ-RPC-OPERATION-ID: introduced negative helper adds operation_id to read-only worker_portal_job and returns PGRST202. Handoff/start are committed; preserve IDs and resume only after caller repair. No Worker result or Owner verification is recorded yet.
- MANAGED_QA_CORE_READY_FOR_UAT=NO; candidate_ready_to_freeze=NO. No Manual UAT, commit, push, deployment or Production operation.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/final-dependent-runtime-evidence.json


### 2026-10-05T16:40:46.936Z - Delivery readonly caller and Storage network classification
- COMPLETE_HARNESS: worker_portal_job receives target_work_item_id only; authenticated assigned Worker returned the existing Work/Delivery with both lines, outsider returned 42501. No operation_id is sent to this readonly RPC. Two real HTTP controls PASS.
- DELIVERY_PENDING: existing Delivery 5a37db40-efc9-45b6-8530-c94121a9eb39 is DISPATCHED; Work 80631b03-7f5c-4bf0-84ef-82925ba9da7e is IN_PROGRESS. The resume harness introduced an IN_TRANSIT readiness assertion and stopped before new business writes. Narrow correction question pending; prior handoff/start were imported, not re-executed. Worker-result/Owner-verification/reconciliation are NOT_VERIFIED in this continuation.
- STORAGE_CLASSIFIED P1_CONFIRMED: two fresh TLS authenticated downloads after scoped access revoke returned the exact private 68-byte fixture from CDN HIT, with no client cache or signed URL. Cache-nonce origin controls denied; incorrect origin/database authorization is NOT_PROVEN. User MODE_A new-network deny gate is not satisfied.
- Separate OLD_SIGNED_TOKEN finding: pre-revoke signed access remained within its original 60-second TTL; expected non-retroactive behavior, not the basis for P1. Beyond-expiry behavior was not tested. New signing authorization denied; fresh-session denial and byte/hash restore evidence reused.
- Original Worker access/role/individual grants restored; Storage policies unchanged. No new object, migration, role/grant expansion, UI/manual UAT, freeze, commit, push, deploy or Production action.
- MANAGED_QA_CORE_READY_FOR_UAT=NO; candidate_ready_to_freeze=NO. Existing Sales/Stock/Reader/Cost/Finance/Direct/Supplier/performance and 14 authorization controls reused within their actual scopes.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/bridge-classification-20261005T161901Z/delivery-readonly-caller-http-control.json; /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/bridge-classification-20261005T161901Z/storage-revoke-security-classification.json; /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/bridge-classification-20261005T161901Z/delivery-worker-owner-runtime-evidence.json


### 2026-10-05T17:20:53.728Z - Delivery closed; application evidence forward-fix verified
- COMPLETE: SPEC-DEL-002 Delivery DISPATCHED is distinct from IN_TRANSIT custody. Corrected resume assertion only; verified 10 bags/600000 VND plus 2 m3/400000 VND in transit and symmetric handoff source movements. Existing handoff/start not re-executed.
- COMPLETE_MANAGED_HTTP: two Worker all-line submissions, receiver/note/proof source, Owner read-and-verify existing results, permission denials, audited quantity adjustment and same-operation retries. Warehouse final zero, reservation zero, transit retains 1 bag/60000 VND. Delivery AR/revenue 2910000 and COGS 1940000 VND; no automated loss/return/history rewrite.
- COMPLETE_LOCAL_FORWARD_FIX: /api/evidence/[id]/download checks real session plus canonical business RPC on every request, then server-only Storage read; streams bytes with private/no-store/CDN disabling headers. Old /signed URL is a non-redirect compatibility alias. Owner/customer links now use /download. Portal upload uses canonical current-user create/finalize RPCs plus trusted server-only upsert so removing ordinary SELECT does not break application upload.
- HTTP_BOUNDARY_PASS: same unchanged QA Worker cookie across two fresh HTTP connections after revoke returns 404/no bytes/no source metadata. Owner/Worker before and Worker after restore return exact 68-byte hash. Outsider=404; unauthenticated=401; new signing=42501. Original access/grants restored.
- OPEN_P1 STORAGE-REVOKE-CACHE-01: direct authenticated Storage request after revoke still returns 200/exact private bytes over fresh TLS from CDN HIT. Proxy alone is NOT sufficient. No managed policy changed. Exact forward policy package prepared, NOT APPLIED; post-policy warmed/CDN denial remains mandatory.
- LOCAL_CHECKS: targeted lint/typecheck PASS; 13 unit/component tests PASS; one build PASS with nonblocking runtime-reexport warning on legacy alias (default Node runtime used). Exact policy SQL/recovery has PGlite 8/8 semantic controls, NOT native/managed Storage or CDN verification.
- SUPPLEMENTARY_HARNESS: new optional read-only count diagnostic wrongly assumed two AR obligations. Actual count one; original exact monetary/source/idempotency checks remain PASS. Correction disclosed in one pending asynchronous question; no new transaction, no application defect inferred, no expectation silently changed.
- Existing Sales/Stock/Reader/Cost/Finance/Direct/Supplier/performance gates reused. Local test server stopped by owned finite timeout; no local cluster started. No UAT, freeze, commit/push/deploy/Production.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/evidence-forward-fix-20261005T165518Z; MANAGED_QA_CORE_READY_FOR_UAT=NO; candidate_ready_to_freeze=NO.


### 2026-10-05T17:58:12.699Z - Scoped Storage approval: readonly progress, no policy execution
- Exact policy SQL hash matches 61efafbe9c99254336faeb9211ecdd5e1ff3bf0b16ab023067f8ce77c5e944ea; forward package hash 8bd77550a39aa94f306eb82a1945723ce572c92aa6aa2033f3dfe71a086a4336. Ten approved app path hashes unchanged; existing build VVErQkbtzJ3QHJ7qX0NhM reused, not rebuilt.
- COMPLETE_READONLY: supplementary AR count repaired according to canonical verify_delivery: one header AR/revenue/cost row per verification, exact totals AR/revenue 2910000 VND and COGS 1940000 VND; original HTTP retry/source evidence reused, no Delivery/business command re-executed.
- COMPLETE_READONLY: residual 1 bag/60000 VND is EXPECTED_LINKED_REMAINDER tied to Delivery e136fd7b-290a-4b8d-9657-ac974a833fe9, line e15df66e-46b8-4eea-a68a-447cae240c46, handoff 5048d48d-a4a1-443a-a570-20c10b5ab06f, verification line d231e216-e39c-4797-a8e9-4d463435d73e and allocation 08fc2900-b211-4e16-adee-a670b3cbd512. No return case or orphan; resolution remains explicit, not automatic return/loss.
- INTRODUCED_CAPTURE_HARNESS_FAILURE: readonly proof-link query used evidence_object_id; actual catalog column is evidence_id. SQLSTATE 42703; no full pre-apply capture artifact/PASS was produced. Narrow caller repair was disclosed via asynchronous question; response pending. No policy/Storage object/access/history mutation occurred.
- Local server started from existing build at 127.0.0.1:4057; default sandbox denied the independent HTTP identity request with EPERM. No browser/app identity PASS inferred. Owned server stopped at handoff; no local DB cluster started.
- STORAGE-REVOKE-CACHE-01 remains OPEN_P1 until exact apply plus NEW post-policy fixture/runtime checks. Freeze and final Owner UAT artifact NOT_CREATED; UI/Owner acceptance remains pending. Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/evidence-forward-fix-20261005T165518Z/security-closure-20261005T175004Z/delivery-residual-ar-reconciliation.json. Remote not pushed; Production untouched.


### 2026-10-05T20:16:19.717Z - Exact Storage forward fix executed; current UAT identity frozen
- COMPLETE_CAPTURE: actual public.work_result_portal_evidence relation inspected; caller corrected to evidence_id, syntax PASS; full deterministic pre-state b5d179ee69cf0c5ed8e06de95f4bcb72e0498afe7787952b992b1a4e6d13c054.
- COMPLETE_EXACT_QA_POLICY: approved SQL SHA 61efafbe9c99254336faeb9211ecdd5e1ff3bf0b16ab023067f8ce77c5e944ea applied once with own BEGIN/COMMIT and finite lock/statement/overall timeout. Removed only r9_portal_evidence_select; added r9_portal_evidence_server_read_only (RESTRICTIVE SELECT authenticated; bucket_id <> portal-evidence). Post-state 79d1c66716b97797b9f57914adf27f2fbc147c731df6f5f088ae1a0a8f580edd equals approved target. Existing bucket privacy, unrelated policies, table/column ACLs, canonical helpers, proof-result links and entire migration history unchanged. No fake migration version; five existing core migrations not re-applied.
- COMPLETE_NEW_OBJECT_PRIMARY: 4a6095fe-27fa-4391-97e0-59d4eb6ec6b7 is a new post-policy synthetic PDF, 639 bytes, SHA 6f93950040195d35e8fd52391186b80273be91c9780475446074b2df3fb8c465. Owner/Worker/Receiver/outsider ordinary-JWT raw Storage reads deny. Worker/Owner app reads return exact bytes with private/no-store headers. Two fresh HTTP connections using unchanged Worker cookie deny immediately after scoped revoke; fresh login and canonical new signing also deny. Exact original access/role/individual grants restored; audit retained.
- COMPLETE_TARGETED_WRITES_RECOVERY: application upload/create/finalize/source link and same-operation retry pass; outsider upload/finalize denied. Isolated restore 3004a4b8-68b8-45d2-a681-ecfcd3c7f091 has identical size/hash and Work source. Two new objects only; no deletes/public bucket/global policy or provider changes.
- LEGACY: old synthetic proof remains linked to committed WorkResult and works through supported application stream. Historical pre-policy CDN evidence is retained separately; raw cached object not used as primary verdict, not purged/deleted.
- STORAGE-REVOKE-CACHE-01=CLOSED for the approved post-policy architecture, not waiver. Confirmed core P0/P1=0; unchanged Sales/Stock/Reader/Cost/Finance/Direct/Supplier/Delivery/API performance gates reused. Delivery residual classification and corrected header AR assertion reused; no business replay.
- CORE_BUSINESS_TECHNICAL_RUNTIME_READY=YES; MANAGED_QA_CORE_READY_FOR_UAT=YES. Exact local source/build/policy UAT snapshot frozen (no commit/push/deploy). APPLICATION_RELEASE_INPUT vs QA_HARNESS vs DOCUMENTATION explicitly classified. B_TECHNICALLY_READY remains NO pending canonical BIZ01..08 UI/manual acceptance; full milestone readiness is not inferred from core HTTP PASS. Owner/go-live acceptance pending; B_OPERATIONAL_READY=NO.
- FINAL_OWNER_UAT_HANDOFF=/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/evidence-forward-fix-20261005T165518Z/policy-execution-20261005T195547Z/FINAL_OWNER_UAT_HANDOFF.json; source/build freeze=/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/evidence-forward-fix-20261005T165518Z/policy-execution-20261005T195547Z/frozen-owner-uat-candidate.json. Owner UAT not executed; own local server stopped after evidence. QA only; Production untouched.

### HTTPS Preview packaging/runtime delta (2026-10-06)
- COMPLETE: directory/file-aware upload manifest; 219 application inputs plus 5 required build/deploy files, no forbidden paths. `.vercelignore` excludes QA, reports, migrations and test-only files from hosting uploads.
- COMPLETE: PREVIEW-NEXT-RUNTIME-01 fixed by a literal nodejs runtime export in the signed compatibility route; GET/auth/private evidence behavior unchanged. Targeted lint/typecheck and evidence route tests 7/7 PASS.
- VERIFIED_BUILD: repaired-source Preview dpl_CB8H927YLyjp4LCe75FyEueQxApz READY (47s); application fingerprint 85d35e9593115511222e775e9c763856bb74b6ffb85b835c16de81da538f331e. Failed predecessor retained; no blind deployment retry.
- BLOCKED_RUNTIME: official browser goto of the new Preview identity endpoint returns net::ERR_BLOCKED_BY_CLIENT; no exposed URL-approval API. BIZ-01..08 browser cases NOT_RUN, not FAIL/PASS. No hostname/proxy/browser substitution.
- OPEN_LOCAL_REPORT_WRAPPER: introduced output-path NaN error; narrow repair question pending. Provider build cause/status captured independently in the official browser.
- NOT_RUN: release commit/push/PR/merge/Production; automated 8/8 gate not met. No managed DB/schema/fixture writes in this delta.

### 2026-10-06: latest source release preparation; Production gate held
- [x] SOURCE: preserve PREVIEW-NEXT-RUNTIME-01 and canonical per-request private evidence authorization; application fingerprint 85d35e9593115511222e775e9c763856bb74b6ffb85b835c16de81da538f331e.
- [x] FINAL_CHECKS: typecheck PASS; lint 0 errors / 10 warnings; affected evidence/Owner-result tests 13/13 PASS; Next 16.3.4 webpack Production build PASS. Worktree-only Turbopack dependency symlink failure retained, not an application failure.
- [x] PRODUCTION_IDENTITY_READONLY: Vercel hien-xa-erp-v2 / main; current production dpl_FXFWUv3rfNRGcPhEVsd4hL6LexeD; verified project domain hien-xa-erp-v2-nu.vercel.app; Supabase nbwynrwkdbtfsitafsxa, distinct from QA.
- [ ] PRODUCTION_GATE: connector rejects both Production metadata and read-only SQL with permission error; effective schema/security compatibility cannot yet be proven. Production SUPABASE_SECRET_KEY is absent. Do not merge auto-deploying main or deploy with these unresolved prerequisites.
- [ ] LIVE_UAT: NOT_RUN; no Preview/local/HTTP evidence substituted. No Production data classification or business writes. Opening data/transition and operational activation pending Owner.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-release-20261006T080823Z; checks in sibling release-final-checks-20261006T080900Z. GitHub checkpoint/PR may proceed independently; no merge/deploy until Production safety verification succeeds.

### PR15 delivery-verifier evidence P1 (2026-10-07)
- [x] Reproduce canonical verifier without evidence.manage; minimal linked-delivery authorization forward fix; native 27/27 and managed QA/ordinary HTTP 11/11; all temporary QA access restored.
- [ ] Include exact 20261007022921 forward fix after original five-file Production transaction; merge/deploy/pin and Codex Browser live evidence acceptance.
- Closure evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-po-rpc-closure-20261006T153240Z/p1-closure-evidence.json. UI/live/operational readiness is not implied.

### PROD-RETURN-COST-01 forward closure (2026-10-07)
- [x] Approved original proposal hash verified; new monotonic version 20261007022922; native guard 4/4; managed QA exact history/security apply; ordinary return HTTP/reconciliation 8/8; PT409 preserved.
- [ ] Merge narrow migration-only follow-up; combined pending seven-file Production rehearsal/atomic apply; private Storage cutover; Codex Browser live BIZ-06/BIZ-08 and remaining BIZ acceptance.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-po-rpc-closure-20261006T153240Z/return-forward-qa-fixture-journal.json. Production/operational readiness not inferred from QA PASS.

### PR16 source-identity guard
- [x] Reproduce mutable-source P1; Owner selects non-CANCELLED Delivery source freeze; separate 20261007022923 exact forward; native/security and managed QA/HTTP planning regression PASS; no backfill.
- [ ] Complete PR16 review/CI/merge, pending eight-file Production rehearsal/apply and live browser acceptance.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-po-rpc-closure-20261006T153240Z/allocation-source-guard-qa-http-evidence.json.

## LIVE-BIZ03-01 employee reader closure (2026-10-07)

- Root cause B_RLS_WRONG_IDENTIFIER_JOIN: employees_workforce_read compared a.employee_id with a.id, not employees.id. Production identity/branch/role mappings are valid.
- Forward 20261007111747_employee_workforce_reader_correlation.sql, SHA256 23d64c001a3665e223658faa99eac2cf8944126a8ecd3297f417623af1e52bed. One existing SELECT predicate only; no new grant, shared role change, or business DML.
- Assignment options now follow employee_branch_access FKs, current trusted branch, active employee/access/role; deduplicate actual employee IDs. No privileged client or payroll payload.
- PASS: native scoped reader 17 checks/reconstruction; ordinary QA HTTP 13 controls; parser 6 tests; assignment helper 4 tests; targeted lint/typecheck and local webpack build. QA migration committed exactly once; post-commit transport loss read back confirmed, no SQL replay; temporary QA access states restored.
- Production apply/browser reload closure and remaining BIZ UAT are pending. Storage, PO/Finance completed subflows and BIZ-01 remain reused within their unchanged inputs. No full automated/live/operational readiness claim.

## LIVE-BIZ03-TIME-01 (2026-10-07)
- Reproduced: Delivery list and Worker job showed 09:00 while detail showed 16:00 for the same 2026-10-07T09:00:00Z instant.
- Minimal fix: both affected displays use the existing Asia/Ho_Chi_Minh business formatter. No stored timestamps, permissions or schema changed.
- Targeted eslint/typecheck PASS; business-time 14/14 PASS across UTC/Los_Angeles/Vietnam; webpack production build PASS. Production browser retest pending deployment.

## Production UAT delta (2026-10-07)
- LIVE-BIZ03-01 employee reader CLOSED: forward 20261007111747 / SHA256 23d64c001a3665e223658faa99eac2cf8944126a8ecd3297f417623af1e52bed; native 17, QA 13, exact Production apply once, Worker visible after reload/navigation. PR18 merged e4ed63969529b9e72d19af54123f765024c2bce6.
- LIVE-BIZ03-TIME-01 CLOSED on Production via PR19 / 690ba21c9e1c523193723111db814349e447b287: same original Worker job and Delivery list show 16:00 Vietnam, not 09:00 UTC.
- Actual Codex Browser Warehouse -> Worker -> Owner result bridge PASS without re-entering quantities; proof file selection remains browser-platform blocked. Short/return/follow-up subflow PASS: A20 -> A18 -> return2 -> follow-up2, B4; AR/revenue3m, cost1m, final custody0.
- New LIVE-BIZ02-TIME-01 and LIVE-BIZ04-TERMS-01 reproduced on PO8. Local hotfix uses existing business formatter and existing versioned Direct Draft updater, preserving created line/allocation identities. Two commands are explicit; completion uncertainty yields a linked existing Draft and blocks duplicate creation, not false success.
- Focused 38 tests, typecheck and webpack build PASS; lint 0 errors / 2 mock-test warnings. CI and fresh ordinary-browser terms persistence retest pending. No new schema, role or grant change.

## LIVE-BIZ07-TIME-01 (2026-10-07)
- Reproduced: Customer Dashboard past cutoff returned correct zero facts but caption showed current knowledge time; drill-down displayed UTC calendar day and passed an unclamped future period end.
- Minimal app-only fix: shared business-date effective cutoff=min(period end, server knowledge cutoff), default instant now, explicit invalid-date rejection; Main caption/secondary AR/AP readers and drill-down share that cutoff. No RPC/schema/security/KPI-money rewrite.
- Targeted 20 tests/lint/typecheck/webpack build PASS. CI and Production UI retest pending.
- New P1 LIVE-BIZ06-CLOSE-01 held separately: no UI remaining-close after verified Delivery, and existing sales_order_delivery_cancellation_guard rejects cancellation whenever Delivery history exists, including resolved history. This preserves safety but provides no dedicated close-remaining command. Native cancellation returned 23514 and fixture rollback PASS; the separate close RPC proposal remains LOCAL_ONLY pending targeted verification and exact approval.
- BIZ05 ordinary Finance UI AR multi2m+0.5m, advance100k, matching, inverse reversals and preserved baseline/source reconciliation PASS. New controlled AR/revenue5.28m unchanged by payment.

## LIVE-BIZ07-EXPENSE-TIME-01 (2026-10-08)
- Ordinary LIVE-UAT Finance created exactly one isolated expense Draft6904dee0-87da-4e66-8cf0-e4fa45c2dae3 for1,000 VND through Codex Browser. The historical Draft remains untouched; no external transfer.
- Backend effective_at2026-10-07T18:19Z is business date8/10. List/reload incorrectly displayed7/10 because its formatter used server timezone.
- Minimal app-only correction uses existing formatBusinessDate for this column. No RPC/schema/permission/money change. Targeted checks, CI and same-record Production retest are required before closure.
- The AP row generated from that approved LIVE-UAT expense independently reproduced the same wrong server-day display for recorded_at. Apply the same existing business-date formatter to AP's recorded timestamp only; due-date semantics and payment/expense/AP queries remain unchanged.

## Approved BIZ06/07/08 continuation (2026-10-08)
- Owner approved exact close forward20261007183000 SHA754145dce77986e3b7980cbc5d73ecafdea3f76860875cfc7967867533ebff2d. Native21/21 and scoped recovery reused; QA SQL transaction committed once and semantic postcheck/history matched. New expected-grants fingerprint harness ordering mismatch blocks final readback classification; no reapply or Production apply.
- Minimal SO close form/caller use existing orders.cancel and approved RPC; existing cancellation trigger/action untouched. Focused12 tests/lint/typecheck PASS; no complete UI or Production PASS claimed.
- Milestone-B controlled UAT compensation fixture policy only: effective2026-10-07T00:00+07, Worker50,000 per Owner-verified result, Sales1% of eligible AR payment allocations. Not the real HR policy.
- Existing calculator supports verified-work basis but Sales commissions currently use SO profit, not Payment Allocation. Never force an allocation result through profit/manual basis. Reference payment700,000 was supplier AP disbursement; eligible Sales allocation0, expected reference commission0.

## Verified-work earning UI seam (2026-10-08)
- Existing canonical WORK_ITEM_VERIFICATION calculator is available but Compensation UI only exposed manual bases. Add a compensation.manage-gated, branch-scoped VERIFIED work source picker and applicable PER_JOB/PER_TRIP rule versions.
- UAT-only Worker rule LIVE_UAT_WK_VERIFY_50K v1 targets employee13de4b1a-27ac-4254-8a57-d60f4cd72d4c,50,000 VND from2026-10-07. Not real HR policy. Calculation and earning approval remain explicit canonical steps, not an invented automatic trigger.
- Targeted6 eligibility tests/lint/typecheck PASS; ordinary Owner source-query positive control pending/recorded independently. Production UI earning PASS is not yet claimed. Allocation-based Sales commission remains a separate unsupported schema/API source, not profit-basis PASS.

## Managed execution and private proof checkpoint (2026-10-08T05:55Z)
- The earlier pending classification notes above are historical checkpoints, superseded by independent new-backend readback. Exact close SHA754145dce77986e3b7980cbc5d73ecafdea3f76860875cfc7967867533ebff2d is committed once in QA and once in Production, with one history row per target and exact native definition/owner/ACL/search_path. No SQL retry or historical rewrite. The original fingerprint wrapper's JSON key-order defect remains recorded, not concealed.
- QA ordinary Owner close/reload/retry/blocked fulfillment contract PASS4, posted money and inventory hashes UNCHANGED. Production browser close is pending the exact integrated application deployment and live UI execution, not inferred from SQL.
- Worker UAT rule and canonical explicit calculate/approve UI produced exactly one earning50,000 and one employee AP50,000 for WORK_ITEM_VERIFICATION:aed035dc-1343-453b-beec-32c966391db7. Worker own earnings UI/reload shows50,000. A new-operation repeat is rejected23505 with no duplicate; the raw unique-constraint message is an open P2 presentation issue. Automatic recognition at verification was not claimed or exercised.
- PR25 adds ordinary-session READY Work-task metadata and a current-auth application evidence link. Managed ordinary Worker query and7 focused tests/lint/typecheck/CI PASS. Production Worker click/download/reload/reopen returned68 bytes with SHA b8091b0d22a149c9b0e359e5011bdd0d25ee31e57244f9c45865e0c28a971753. No raw Storage exposure or policy change. Physical browser upload remains an explicit tool limitation. Other-Worker/foreign-branch READY proof byte fixtures are not yet evidenced.
- Sales1% payment-allocation policy is approved UAT-only, but the current canonical compensation source remains Sales Order profit; allocation/reversal provenance needs a separate scoped implementation/forward verification. Never substitute profit or manual basis. Opening balances and transition remain pending.

### 2026-10-08 final commission / proof closure delta
- PR26 return/remainder history labels merged and Production browser verified; PR27 service-detail Vietnam timezone merged, CI PASS, Production browser verified. Neither changes ledger/schema.
- Foreign proof isolation: scoped existing QA identity bound to Worker role in one synthetic branch; own proof browser download/reload/hash PASS, original Worker foreign job denied, 13 ordinary-auth HTTP/raw-Storage controls PASS. Temporary mappings revoked with audit/history preserved; shared roles and original access unchanged. No finance/inventory effects in control branch.
- Commission/automatic Worker recognition remains OPEN. Forward20261008091836 is LOCAL DRAFT ONLY; helper tests9/typecheck/lint/build PASS do not close business acceptance. Native0/13 blocked by local fixture permissions; AP caller and incorrectly scoped retry-message edit also need correction. No QA/Production apply, no commission source PR.
- Upload editor handoff staged on unverified work7d53607a-a1c3-4d25-8a33-7ac04fcc976b; no result submitted/Owner verification. Browser file picker and precise timing remain tooling limitations, not PASS.
- UAT compensation fixture only; real HR policy/opening/data transition remain Owner decisions. B technical/operational readiness NOT achieved.

### 2026-10-08 compensation targeted repair checkpoint
- Approved fixture permissions/AP caller/action-mapping repaired. Native compensation13/13 PASS, action/report unit14 PASS, targeted lint/typecheck/build PASS.
- Exact forward20261008091836 applied QA once with SHA256 f959b49873f6c0117c6ab428107e4c432fcaa7eaa9a0cc601d38f2a6c7511c50; effective schema/security/triggers/history verified. Production not applied yet.
- QA HTTP AR2000000 -> commission+20000; retry same payment unchanged; full reversal appended-20000. Harness incorrectly included derived outstanding in original-history equality; physical readback preserves original+20000 and negative source FK. Assertion repair pending acknowledgement, no payment recreation.
- Independent QA Worker6/6 automatic verification/retry/source/permission PASS; independent AP/advance/date controls3/3 PASS. No managed permission broadening; compensation standing approval uses Owner manage+approve.
- Completed BIZ01/02/04/05/06/08 and Storage evidence reused. No operational HR-policy claim; mandatory file/timing tooling signoff remains.

## 2026-10-08 - PR28 compensation live acceptance closure

- [x] Repair only derived-outstanding assertion; helper regression 8/8 and QA aggregate readback 12/12 PASS without replaying QA business commands. Native 13/13, Worker 6/6, Finance controls 3/3 reused.
- [x] PR28 reviewed, ready, CI PASS and merged as c94ccabb64063c645f76a8a9de5b769ccccb43b8; exact Production deployment dpl_H85ousZ5PXArgb6iBEEo8iSDcXS4 READY and composite live pin PASS.
- [x] Exact compensation forward 20261008091836 applied once in Production, SHA256 f959b49873f6c0117c6ab428107e4c432fcaa7eaa9a0cc601d38f2a6c7511c50; unrelated migration history preserved.
- [x] Codex Browser live AR allocation 2,000,000 -> +20,000 commission; reversal -> -20,000, net 0, original physical earning unchanged. AP 700,000 control -> 0 commission.
- [x] Fresh Worker result: before Owner verification 0; automatic recognition on verification +50,000 and one AP. Reload and UI canonical retry retain the same earning; no raw database error.
- [x] Worker and Sales report source traceability PASS; BIZ01/02/04/05/06/08 reused PASS. BIZ07 functional scope PASS.
- [ ] Mandatory browser file selection and precise browser timing remain Owner tooling handoffs, not application P1s. BIZ03 BLOCKED_BROWSER_FILE_UPLOAD_ONLY; BIZ07 PASS_FUNCTIONAL_BLOCKED_TIMING_TOOL_ONLY.
- [ ] B_TECHNICALLY_READY=NO_OWNER_TOOLING_SIGNOFF_ONLY; technical_application_ready=YES; confirmed core P0/P1=0. B_OPERATIONAL_READY=NO: opening balances PENDING_OWNER, data transition NOT_EXECUTED, operational HR policy not approved.
- Evidence: compensation-final-release-acceptance.json, compensation-live-closure.json, compensation-live-source-graph.json and updated live-uat-record-manifest.json in the existing production-po-rpc-closure-20261006T153240Z run. Compensation settings are controlled UAT_ONLY, not actual HR policy.

## 2026-10-09 - Final Seoul locality and browser timing closure

- Owner-selected database locality: Production Supabase `nbwynrwkdbtfsitafsxa`, authoritative region `ap-northeast-2` (Seoul). PR #30 corrected the unshipped `hnd1` proposal to `icn1`; no Tokyo Production deployment is claimed.
- PR #30 release head: `02b0e3514367434e543b4ba6a0b1e4e28d1fdf3b`; merged main: `69805e887a047c352458a0bc61813c7c14a82a06`.
- Production: `https://hien-xa-erp-v2-nu.vercel.app/`, deployment `dpl_Ey8F9EgnTNw7DL1Uv8pfHgddFkAe`, READY, effective region `icn1`; composite live identity pin PASS.
- Application release fingerprint (including provider configuration): `d2ec349f2752cb813ddcaa5834c700eb8e85776444cf81754a6f5393be93a3e5`. Runtime-only fingerprint unchanged: `6397c36e37d8914339fec494e06acdf5d5a60fb9b31963c0b0a54485227efe93`.
- ADMIN_SHELL_BROWSER: reused valid 100-sample p95 `227.80504150390624 ms`, PASS against `<300 ms`.
- DASHBOARD_BROWSER_CONTENT: original p95 `3993.264660644531 ms`; independent post-icn1 run, 100 native UI refresh samples, concurrency 1, p50 `372.25 ms`, p95 `576.6798950195313 ms`, p99 `964.8831445312528 ms`, first sample `572.199951171875 ms`, errors 0, over-budget 0/100, PASS against `<2000 ms`.
- Observed p95 difference: `3416.584765625 ms` (`85.55868583660437%`). This is an observed comparison, not a controlled causal estimate: baseline DPR 2 versus retest DPR 1 is disclosed; CSS viewport 476x708, browser engine, filters and readiness criterion were retained. No certified cold-cache claim.
- The prior 28-record post-icn1 run interrupted by authentication rate-limit/redirect remains separate, failed/incomplete evidence. It is not silently discarded or included as successful samples in the independent 100-sample run. No Auth settings were changed.
- LIVE-PERF-DASHBOARD: CLOSED_PRODUCTION_VERIFIED. BIZ-01..08: PASS with prior unchanged business evidence reused and BIZ-07 timing closed; confirmed core P0=0, P1=0. LIVE_APPLICATION_VALIDATED=YES; B_TECHNICALLY_READY=YES.
- Opening balances=PENDING_OWNER; data transition=NOT_EXECUTED; B_OPERATIONAL_READY=NO. Controlled UAT compensation values are not real HR policy. No business UAT replay, schema, Storage, role, compensation or opening-data changes in this region/timing closure.
- Evidence directory: `/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-po-rpc-closure-20261006T153240Z`.
- Authoritative artifacts: `final-seoul-performance-closure.json`, `final-icn1-live-pin.json`, `final-icn1-source-manifest.json`, `final-browser-timing-post-icn1-raw.json`, `post-icn1-auth-interrupted-raw.json`, `final-browser-timing-icn1-verdict.png`.
- This acceptance status append is local documentation only; it does not change the pinned application release or introduce another release/deployment.

## 2026-10-09 - Operational transition entry state

- Final current technical state supersedes the historical pending tooling checkpoints above: BIZ-01..08=PASS, automated UI 8/8, confirmed core P0=0/P1=0, Storage cutover and revoke/recovery=PASS, compensation recognition/idempotency/reversal=PASS, actual browser upload=PASS, final browser timing=PASS, Seoul/icn1 correction complete, B_TECHNICALLY_READY=YES.
- Operational gates: real opening balances PENDING_OWNER; data transition NOT_EXECUTED; cutover timestamp PENDING_OWNER; real compensation policy PENDING_OWNER; Owner operational activation PENDING. B_OPERATIONAL_READY=NO.
- Begin read-only operational baseline and LIVE-UAT exclusion inventory. Preserve posted synthetic history and obtain authoritative real inputs before imports. No additional technical QA is required absent an actual transition defect.

## 2026-10-09 - Operational importer acceptance continuation

- Existing technical milestone and BIZ evidence remain closed/reused. No Production connection or write; no real opening import, activation or compensation policy enabled.
- Local roles fixture repaired using existing role codes with new isolated IDs; uppercase/noncanonical role rejection preserved. Schema role constraint and taxonomy unchanged.
- New operational parser/importer plus forward `20261008224033_operational_opening_sources.sql` are UNRELEASED. SHA256 `5ea93da878981186fe6273ef887adcc052f04c35530cfa924ec9d144cebd9994`.
- Isolated PGlite run `OPTRANS-SYNTHETIC-20261009T014947650Z`: 22 checks PASS for 25 A-L rows and O custody-only, including same-operation idempotency, source conflict, real-fault rollback, reader reconciliation and no fake economic events. On-hand 171025; separate transit 75013; AR 750000; supplier AP 350000; cash 2000000; employee AP 80000 VND.
- Full 32-row operational import is NOT PASS. M/N: NOT_SUPPORTED_AT_CUTOVER because canonical continuation lacks pre-cutover fulfilled/received baselines; supplier-direct linkage is also absent. O: OWNER_DECISION_REQUIRED (finish old process versus new post-cutover job); a custody source is not a resumable Work/Delivery.
- PostgreSQL 17.6 QA rehearsal `OPTRANS-SYNTHETIC-QA-20261009T015745449Z` stopped on introduced driver JSONB double-encoding (P0002). Entire transaction rolled back: no migration history, new schema, Auth or fixture rows persisted. Pooler reused backend PID on readback; no independent-backend claim.
- Pending local adapter/readback repair; same-source new-operation, managed reporting and populated XLSX acceptance remain unverified. No operational-transition PR/merge because acceptance is incomplete. Thirteen master records remain Owner decisions; no real values requested yet.


## Operational importer wrapper repair checkpoint (2026-10-09)

- QA run OPTRANS-SYNTHETIC-QA-20261009T035303885Z: 13 acceptance checks PASS, 1 FAIL. JSONB wrapper unit checks 13/13 and real PostgreSQL JSONB 7/7 PASS; targeted lint PASS.
- Pooler readback is validated by ended writer transaction, closed client, new logical client and new read-only transaction. Both backend PIDs were 939214, informational only. Rollback prestate/history/auth/fixture preservation PASS.
- Exact opening migration SHA remains 5ea93da878981186fe6273ef887adcc052f04c35530cfa924ec9d144cebd9994. Rehearsed only; no schema/history persisted. Supported 25 rows reached real writers; 6 M/N held, 1 O custody/Owner boundary. Totals: inventory 171025, transit 75013, AR 750000, supplier AP 350000, cash 2000000, employee payable 80000. All rolled back.
- New importer defect OPTRANS_MASTER_TIMESTAMP_COMPARE_01: new-operation retry incorrectly conflicts at employees.deactivated_at (Date versus ISO string comparison). Requested narrowly scoped repair; no migration/business-contract changes.
- Committed independent readback and final 11-control classification remain pending. No operational PR/CI/merge or real-data request. Production connection NONE, writes 0; B_TECHNICALLY_READY YES_REUSED; B_OPERATIONAL_READY NO.
- Evidence: /Users/nox/Downloads/HienXaERP/outputs/synthetic-dry-run/importer-acceptance/wrapper-repair-checkpoint.json and /Users/nox/Downloads/HienXaERP/outputs/synthetic-dry-run/importer-acceptance/OPTRANS-SYNTHETIC-QA-20261009T035303885Z.json.


## Operational importer supported-scope QA acceptance (2026-10-09)

This result supersedes the earlier wrapper/timestamp checkpoints above. B_TECHNICALLY_READY remains YES_REUSED; no technical ERP/BIZ rerun.

- OPTRANS_MASTER_TIMESTAMP_COMPARE_01 CLOSED: inspect actual pg_catalog type, preserve timestamptz microseconds through text readback, compare absolute instants; zone-less timestamp remains wall-clock and date remains date-only. Invalid temporals fail explicitly. Approved numeric-scale follow-up compares numeric columns using exact Decimal; text fields remain strict. No migration-byte change.
- Temporal tests 10/10 and numeric tests 7/7 PASS. Existing wrapper unit 13/13 and real PostgreSQL JSONB 7/7 PASS reused. Driver Result array assertion corrected in QA harness; resumption restores the exact original package serialization before receipt-hash validation.
- QA run OPTRANS-QA-SYNTHETIC-20261009T040353681Z: exact migration 20261008224033 applied once, SHA256 5ea93da878981186fe6273ef887adcc052f04c35530cfa924ec9d144cebd9994. Operation A committed; operation B with identical source identities committed only a new receipt, not duplicate masters, balances or audit events. Five negative attempts left no receipts/economic effects. Resume gates 13/13 PASS. No migration/A replay.
- Independent committed readback after writer close uses a new logical client and read-only transaction. PID is informational only. Inventory 171025; separate transit 75013; AR 750000; supplier AP 350000; cash/bank 2000000; employee payable 80000 VND. Quantity reconciliation: 100 syn_kg SYN_CEMENT and 3 syn_bag SYN_PACK, never summed across UOM. Original historical debt amounts and zero-outstanding sources retained.
- Read models reconcile all six balances. No fake SO/PO/receipt/Delivery/revenue/payment/COGS/earning; source conflict, true temporal/master conflict, invalid UOM and duplicate source rollback PASS. Prior invalid-material/customer/supplier rollback reused. Dashboard current-period revenue/cost/compensation remain zero; canonical future 2026-10-15 cutover is not incorrectly counted in today's as-of AR/AP. Earlier synthetic post-cutover dashboard proof remains valid.
- Supported scope: 32 parsed rows, 25 A-L imported, 6 M/N held, 1 O custody-only/Owner decision. M/N NOT_SUPPORTED_AT_CUTOVER; O OWNER_DECISION_REQUIRED. This is canonical CSV supported-scope importer acceptance, not a claim that all 32 rows are imported or a real workbook/cutover approval. Populated real XLSX must still pass real-package dry-run.
- Synthetic QA branch IDs f2d43b4b-ed9b-4400-8c40-6f6b8c87fd96 and 9a6b3767-284c-43da-9194-fd56a456621d and all posted source IDs are recorded in the run fixture manifest, excluded from real cutover, retained without ad-hoc deletion. Imported operational employee bindings remain inactive; temporary QA read control has no password/login provisioning.
- Production connection NONE; Production economic/opening writes 0. No Production migration/import authorization is inferred from merging inert operator scripts. Thirteen Master_review decisions, real cutover data and operational compensation remain Owner inputs. B_OPERATIONAL_READY=NO.
- Local evidence: outputs/synthetic-dry-run/importer-acceptance/OPTRANS-QA-SYNTHETIC-20261009T040353681Z-resume.json and OPTRANS-QA-SYNTHETIC-20261009T040353681Z-fixture-manifest.json. Local-only harnesses/evidence/credentials are excluded from source control.


## Safe operational enhancements (2026-10-09)

- Cleanup prerequisite: PASS, independent 405-FK check, 8 Storage objects absent, 9 test identities disabled, Owner/HX retained. Original DB execution count remains 1.
- PR00 module-owned catalog CRUD/legacy redirects: IN_PROGRESS.
- PR01 material detail: PENDING.
- PR02 automatic price resolution: PENDING.
- PR03 warehouse visibility/integration: PENDING.
- PR04 safe draft cancellation: PENDING.
- PR05 optional final Sales unit price/audit: PENDING.
- Real operational activation/openings: NOT_AUTHORIZED_IN_THIS_FEATURE_RUN.

PR00 local checks PASS (55 tests/typecheck/lint/isolated Turbopack build). Hosted UI QA and GitHub CI PENDING; localhost browser block is TOOLING_LIMITATION, not an application P1. PR00 is not merged or live accepted.

PR00 COMPLETE: PR33 merged 3622d1ed17f75537b83a28dc2174b8a3c916e2f5; 55 targeted tests, typecheck/lint/build, GitHub CI and 14 actual Codex Browser QA cases PASS. One SYN warehouse created/edited/deactivated only on QA, two audit events, no inventory movement. Classic branch protection/rulesets absent; no protection bypass.
PR01 IN_PROGRESS: permission-filtered read-only material detail; no schema, price store or inventory write.

PR01 COMPLETE: PR34 merged bda051e56ead6affed6c69fab742884d670a1577; 33 tests/typecheck/lint/build/CI and actual Owner/Sales detail/cost/reload/branch-isolation UI PASS. PR02 IN_PROGRESS: debounced existing-engine preview only, no passive old-draft repricing or auto-save.


## PR03 warehouse availability
Permission-gated branch/material warehouse quantities composed from warehouse_inventory_read; exact base-UOM shortage hint does not block draft, infer conversions, expose cost, or reserve stock. Existing allocation/create-delivery RPCs remain the only source/reservation commands. No schema or Production business writes.


## PR04 safe draft cancellation
SO/PO draft removal uses existing permission-checked cancel RPCs with reason/confirmation and preserved audit/history. Default lists exclude CANCELLED, explicit filters retain all/history. Posted execution guards unchanged. Quotation has no canonical cancellation RPC and is not hard-deleted or given an invented workflow. No schema or Production economic writes. PR03 PR36 merged379ab17 with31 tests, CI/build and Owner stock/Sales-denial UI PASS.
