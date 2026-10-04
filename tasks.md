# tasks.md — Current Tasks After GitHub Audit

> **DOCSET:** `HX-V2-DOCSET-4.4`
> **SYNC:** `SYNC-4.4`

# TASK-010 — Current State

```yaml
CURRENT_PHASE: R12
CURRENT_BATCH: RESOLVE_PO_NULL_ADDRESS_AND_REPORT_RUNTIME_PREREQUISITES_20261004
CURRENT_TASK: FIX_RULES_01_05
EXECUTION_STATUS: BLOCKED
AUTHORIZATION_SCOPE: REPAIR_AND_TARGETED_QA
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
