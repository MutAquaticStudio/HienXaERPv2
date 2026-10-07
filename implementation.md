# implementation.md — Audited GitHub Reality

> **DOCSET:** `HX-V2-DOCSET-4.4`
> **SYNC:** `SYNC-4.4`
> **Repository:** `MutAquaticStudio/HienXaERPv2`

# IMP-000 — Fresh Audit Baseline

```yaml
DEFAULT_BRANCH: main
HEAD: 2a81dc87e2ad0de3ff3349fb0e894115e333c142
HEAD_DATE: 2026-09-14
HEAD_MESSAGE: Document deployment readiness and fix Purchase Order access (#4)
R9_COMMIT: 26c0643327a136818b43b8dc02e1b0e705ded809
AUDIT_DATE: 2026-09-15
AUDIT_MODE: SOURCE_ROUTE_CONTRACT_READ_ONLY
UI_BROWSER_AUDIT: NOT_RUN
PRODUCTION_MUTATION: NO
```

Latest commit check on 2026-09-15 found no newer commit than HEAD above.

# IMP-010 — Audit Verdict

The previous gap hypothesis materially matches current source.

Legend:
- CONFIRMED = direct source/tree evidence.
- PARTIAL = feature exists in part, contract remains incomplete.
- DISPROVED = prior suspicion not a real gap.

| Gap | Verdict | Severity | Evidence summary |
|---|---|---:|---|
| GAP-01 execution state drift | CONFIRMED | P0 | repo has R9 commit; current task state previously remained R8 |
| GAP-02 master-data CRUD | PARTIAL | P0 | Customer/Material lists read-only; Supplier quick-create and employee invite exist, but complete CRUD/config absent |
| GAP-03 Quote/SO multi-line create | CONFIRMED | P0 | commercial form accepts one material/UOM/qty; server sends `[line]` |
| GAP-04 DRAFT edit | CONFIRMED | P0 | Quote/SO detail offers send/confirm/cancel/revision, no complete draft line editor |
| GAP-05 quick Customer/Site | CONFIRMED | P0 | Sales form has selectors only |
| GAP-06 price preview/manual sales override | CONFIRMED | P0 | price resolves server-side; no pre-save price/total/manual override input |
| GAP-07 PO multi-line operation | CONFIRMED | P0 | form one-line; PO detail uses `firstLine` for receive/direct verification |
| GAP-08 Delivery multi-line operation | CONFIRMED | P0 | delivery detail loads lines but key operations derive `line = lines[0]` |
| GAP-09 Customer 360 | PARTIAL | P1 | profile/sites/pricing/AR exist; transaction CTAs/history remain incomplete/stale |
| GAP-10 core list scale | CONFIRMED | P1 | Orders/Quotes/Customers and other lists use unbounded branch selects; missing server pagination/search contract |
| GAP-11 Dashboard completion | PARTIAL | P1 | core KPI/AR/AP exist; expense breakdown/commission detail/context drill-down incomplete |
| GAP-12 real admin identity context | CONFIRMED | P1 | admin AppShell hard-codes sample user/branch/company |
| GAP-13 PaymentNotice discoverability | CONFIRMED | P1 | review route exists; admin nav has no entry |
| GAP-14 customer order debt/docs | CONFIRMED | P1 | customer order detail shows delivery timeline but not contract debt/payment/documents |
| GAP-15 access management | PARTIAL | P1 | list + invite exist; role/branch change/revoke/reactivate/permission management UI incomplete |
| GAP-16 Settings surface | CONFIRMED | P1 | no settings route/feature found |
| GAP-17 Reports | CONFIRMED | P1 | no reports route/feature found |
| GAP-18 Audit log UI | CONFIRMED | P1 | no admin audit surface found |
| GAP-19 low-stock alerts | CONFIRMED | P1 | no threshold/reorder/low-stock implementation found |
| GAP-20 print/export templates | PARTIAL | P1 | quote PDF exists; delivery note/payment voucher/debt statement not found |
| GAP-21 R10 | CONFIRMED | P1 | no routing/GPS/messaging module/migration/UI observed |
| GAP-22 R11 | CONFIRMED | P1/HUMAN_GATE | no electronic-invoice implementation observed |
| GAP-23 R12 | PARTIAL | P1 | deployment documentation exists, but release/migration/QA/cutover phase not complete |

# IMP-020 — False Positives Removed

## NOT-GAP-A — Worker/customer portal navigation
`/work` and `/customer` use `PortalShell`, not the unused work/customer arrays in `AppShell`.
Worker portal has current work, pool, earnings, profile navigation.
Customer portal has home, quotations, orders, debt, profile.

Verdict: DISPROVED as user-facing navigation gap.

## NOT-GAP-B — Stock Count discoverability
Inventory page links to `/admin/stock-counts`.

Verdict: DISPROVED as missing-entry gap.

# IMP-030 — Key Source Evidence

Observed paths include:
```text
src/components/app-shell.tsx
src/components/portal/portal-shell.tsx
src/components/sales/commercial-document-form.tsx
src/components/purchasing/purchase-order-form.tsx
src/modules/sales/actions.ts
src/app/admin/customers/page.tsx
src/app/admin/customers/[id]/page.tsx
src/app/admin/products/page.tsx
src/app/admin/orders/[id]/page.tsx
src/app/admin/purchase-orders/[id]/page.tsx
src/app/admin/deliveries/[id]/page.tsx
src/app/admin/page.tsx
src/app/admin/payment-notices/page.tsx
src/app/admin/access/page.tsx
src/app/customer/orders/[id]/page.tsx
supabase/migrations/
```

# IMP-040 — Positive Existing Foundation

Do not rebuild:
- identity/access/RLS direction;
- exact money/quantity primitives;
- quote revisions;
- sales/purchasing/inventory/delivery domain;
- AR/AP/payment separation;
- PaymentNotice != Payment;
- workforce/service/compensation;
- worker/customer portal isolation.

Recovery extends current implementation.

# IMP-050 — Current Execution

```yaml
CURRENT_PHASE: GC
CURRENT_TASK: GC-07
GAP_AUDIT: COMPLETE_FOR_CURRENT_CHECKOUT
GAP_CLOSURE: IN_PROGRESS
R10: LOCKED_UNTIL_GC_25
R11: LOCKED_UNTIL_R10_GATE_OR_INDEPENDENT_PROVIDER_NEUTRAL_SCOPE
R12: LOCKED_UNTIL_PRIOR_GATE
PRODUCTION: DO_NOT_TOUCH_WITHOUT_OWNER
```

# IMP-060 — Evidence Lifecycle

GA source evidence remains VALID until affected files/schema/contract change.
GC invalidates only its related gaps.
No full re-audit after every fix.

# IMP-070 — Gap Record Format

```text
gap_id:
status=OPEN/IN_PROGRESS/FIXED/DISPROVED/HUMAN_GATE
contract_refs:
source_evidence:
changed_paths:
checks:
remaining:
```

# IMP-080 — Check Result

This audit did not run local build/tests or browser interaction.
It establishes source/route/contract gaps, not usability acceptance.

Before marking money/inventory/access fixes complete, run relevant DB/SEC/IDEM/RACE checks according to plan.

# IMP-090 — GA-01..GA-06 current checkout audit (2026-09-19)

Document lock: `HX-V2-DOCSET-4.4 / SYNC-4.4`. The five Owner-supplied 4.4 files were copied verbatim from the `(1).md` counterparts into canonical paths during bootstrap. The prior 4.2 files are preserved outside the repo at `/Users/nox/Downloads/HienXaERP-docset-4.2-backup-2026-09-19`.

Exact 4.4 document SHA-256 fingerprints: Spec `ba80e00b03a86884293cd7e669b9362a2d44607d5edc1678f1d4c45e95abf1a6`; UXUI `5bb949c589d030cc9b22a95131529b0bc83a0258d4c04c306a438ad5e5a4ee6b`; plan `5639e07208b9b04f68da60051fa2d101241c069c79921c81c8cc4949f3090e82`; tasks baseline `7c265e63f690fccd45cd0a68746f8c4419de8d959a62c9637143b2c597ca2fb6`; implementation baseline `dfaa293bcb1419e1823b832fe88a73503cce35e925cc87a233356ad629b7cfe1`. These are baseline fingerprints before GC-01 state updates.

GA-01 state: remote `origin` is `MutAquaticStudio/HienXaERPv2`; local branch `codex/deployment-readiness`, HEAD `424cc89e38ffa1a9650c8453fd6a4e4b62f82a5e`, tree `a38ef3e0ef5694a3a0293aa8000e321e6b8d97c4`. Existing 4.4 baseline described `main` at `2a81dc8`, which is not a local revision; source conclusions from it are not silently treated as current. Working tree contains prior QA, catalog, access and preview work. The Vercel QA preview `dpl_D15SjQJxkaLk6W8AbNawTViNHBCe` was READY on 2026-09-14; behavioral acceptance on that candidate remains NOT_RUN. Production was not mutated by this audit.

GAP_REGISTER for this checkout (source/route audit only; no new runtime test):

| gap_id | verdict | severity | contract_refs | source_evidence | user_impact | fix_task |
|---|---|---|---|---|---|---|
| GAP-01 | CONFIRMED | P0 | SPEC-GAP-001/002 | tasks.md baseline and this HEAD differ; prior implementation.md describes `2a81dc8` | execution state could authorize wrong phase | GC-01 |
| GAP-02 | PARTIAL | P0 | SPEC-REC-001; UX-REC-004 | src/app/admin/catalog/page.tsx and src/modules/catalog/fields.ts cover seven kinds; no Warehouse/Vehicle/Machine/Branch CRUD | master data cannot be fully operated | GC-03..07 |
| GAP-03 | CONFIRMED | P0 | SPEC-REC-002; UX-REC-002 | src/modules/sales/actions.ts `createDocument` sends `order_lines: [line]` / `quote_lines: [line]` | multi-item quote/order unavailable | GC-08 |
| GAP-04 | CONFIRMED | P0 | SPEC-REC-003; UX-REC-003 | src/app/admin/quotations/[id]/page.tsx and orders/[id]/page.tsx have no DRAFT line edit path; PO same | draft corrections require workaround | GC-11..12 |
| GAP-05 | CONFIRMED | P0 | SPEC-REC-005; UX-REC-002 | src/components/sales/commercial-document-form.tsx only selects existing Customer/Site | interrupts Sales draft | GC-10 |
| GAP-06 | CONFIRMED | P0 | SPEC-REC-004; UX-REC-002 | src/modules/sales/actions.ts resolves price at Save; Sales form lacks manual price/source/total preview | user cannot verify price before Save | GC-09 |
| GAP-07 | CONFIRMED | P0 | SPEC-REC-002; SPEC-GAP-002/7 | src/modules/purchasing/actions.ts sends `purchase_lines: [line]`; purchase-orders/[id]/page.tsx uses `firstLine` for receive/direct | wrong/incomplete line operation | GC-12..13 |
| GAP-08 | CONFIRMED | P0 | SPEC-GAP-002/8 | src/app/admin/deliveries/[id]/page.tsx uses `lines[0]` for quantities/commands | multi-line result/verification unsafe | GC-14 |
| GAP-09 | PARTIAL | P1 | SPEC-REC-007; UX-REC-005 | src/app/admin/customers/[id]/page.tsx has profile/site/price/AR but transaction sections are placeholder text | customer context fragmented | GC-15 |
| GAP-10 | CONFIRMED | P1 | SPEC-REC-006; UX-REC-007 | nine core admin list pages use `.order()` without `.limit()`/`.range()` | lists fetch entire branch | GC-19 |
| GAP-11 | PARTIAL | P1 | UX-REC-008 | src/app/admin/page.tsx has KPI and AR/AP links; no complete expense breakdown or commission drill-down | financial context incomplete | GC-20 |
| GAP-12 | CONFIRMED | P1 | UX-REC-009 | src/components/app-shell.tsx hard-codes user and branch/company demo labels | wrong identity shown to users | GC-02 |
| GAP-13 | CONFIRMED | P1 | UX-REC-010 | src/app/admin/payment-notices/page.tsx exists; src/components/app-shell.tsx has no entry | pending notice hard to find | GC-02 |
| GAP-14 | CONFIRMED | P1 | UX-REC-011 | src/app/customer/orders/[id]/page.tsx shows delivery timeline only | customer lacks debt/payment/documents | GC-18 |
| GAP-15 | PARTIAL | P1 | UX-REC-012 | src/app/admin/access/page.tsx and src/lib/auth/actions.ts now assign/change/revoke; no reactivate or explicit permission editor | access lifecycle incomplete | GC-17 |
| GAP-16 | CONFIRMED | P1 | SPEC-REC-008; UX-REC-013 | no settings route in src/app/admin | operational settings not discoverable | GC-07 |
| GAP-17 | CONFIRMED | P1 | SPEC-REC-008; UX-REC-013 | no reports route in src/app/admin | required reporting absent | GC-23 |
| GAP-18 | CONFIRMED | P1 | SPEC-REC-008; UX-REC-013 | no audit UI route in src/app/admin | actors cannot inspect action history | GC-24 |
| GAP-19 | CONFIRMED | P1 | UX-REC-014 | no threshold/low-stock schema or admin route in scoped source | stock warning absent | GC-21 |
| GAP-20 | PARTIAL | P1 | SPEC-REC-009; UX-REC-015 | quotation PDF route exists; no delivery note/voucher/debt statement route | required documents unavailable | GC-22 |
| GAP-21 | CONFIRMED | P1 | PLAN-045; SPEC-GAP-002/21 | no routing/GPS/messaging routes/modules in scoped source | R10 not implemented | R10-01..06 |
| GAP-22 | CONFIRMED | P1 | PLAN-050; SPEC-GAP-002/22 | no invoice domain/routes; provider selection still HUMAN_GATE | R11 incomplete | R11-01..06 |
| GAP-23 | PARTIAL | P1 | PLAN-055; SPEC-GAP-002/23 | qa scripts, QA migration and Vercel preview exist; full release/migration/recovery evidence absent | release readiness unproven | R12-01..08 |

`NEW_GAP-01`: Worker portal assigned-job UI remains unverified on the latest source; prior QA technical run failed the visible-title check before the SQL payload mapping fix. Source: `scripts/qa/uat.mjs`, `supabase/migrations/20260914100407_admin_catalog_worker_completion.sql`, prior QA artifact `2026-09-14T09-57-20-480Z-uat-technical`. Severity P1. Fix/check in GC-25 affected R9 regression; no acceptance PASS claim.

GA_COMPLETE: TRUE for the current source checkout; all 23 seed gaps have a verdict. This is a read-only source audit. `GC-01` is open for state synchronization and targeted follow-up. Checks: DOC NEW PASS; UI/DB/SEC/IDEM/RACE/PERF NOT_RUN in GA; historical build evidence is candidate-specific, not fresh GA execution.

# IMP-100 — GC-A checkpoint (2026-09-19)

Scope: GC-01 document execution-state sync and GC-02 authenticated admin identity plus PaymentNotice discoverability.
Gap delta: GAP-01 FIXED for current local checkout; GAP-12 source fix applied, runtime UI NOT_RUN; GAP-13 finance navigation entry added, runtime UI NOT_RUN. Do not call GAP-12/13 acceptance PASS before affected UI check.
Changed paths: Spec.md, UXUI.md, plan.md, tasks.md, implementation.md (Owner-supplied 4.4 sync); src/app/admin/layout.tsx; src/components/app-shell.tsx.
New evidence: local `pnpm typecheck` PASS after GC-02. Reused evidence: GAP-02..23 source audit above; QA Preview build READY from 2026-09-14, not a check of GC-02.
Checks: DOC NEW PASS; typecheck NEW PASS; UI/DB/SEC NOT_RUN for GC-02. Result: GC-01 COMPLETE; GC-02 IMPLEMENTED_LOCAL, UI verification pending at GC-25. Blocker: NONE for GC-03. Production impact: NOT_TOUCHED.

# IMP-101 — GC-03 Customer/Site checkpoint (2026-09-20)

Scope: Customer/Site create, edit, deactivate, profile fields, branch-scoped sales owner, credit limit, and quick-create actions. GAP-02 remains PARTIAL until GC-04..07; GC-03 is COMPLETE.
Changed paths: src/modules/catalog/{fields,actions,editor}.ts(x); src/app/admin/catalog/page.tsx; src/modules/customers/actions.ts; supabase/migrations/20260920064133_customer_site_profile.sql, 20260920070000_customer_site_stale_conflict.sql, 20260920080000_customer_site_owner_credit.sql. Credit-limit changes require customers.manage and finance.ar.adjust; unauthorised fields are excluded from the catalog row projection.
New evidence: local typecheck PASS; QA migration replay/seed 4/4 PASS; all three Customer/Site migrations applied only to Supabase QA. Targeted QA RPC checks PASS for Customer/Site create/edit/deactivate, branch employee options, denied worker access, invalid owner rejection, stale credit PT409, persisted values, and profile audit. Synthetic QA records were deactivated. Reused evidence: GA snapshot-source audit for SPEC-CUS-003; GC-02 shell check remains pending UI verification.
Result: GC-03 PASS; blocker NONE for GC-04. Production impact: NOT_TOUCHED.

# IMP-102 — GC-04 Supplier checkpoint (2026-09-20)

Scope: Supplier create/edit/deactivate through the existing catalog form and PO quick-create. GAP-02 remains PARTIAL pending GC-05..07; GC-04 is COMPLETE.
Changed paths: src/modules/catalog/actions.ts; src/modules/purchasing/actions.ts; supabase/migrations/20260920090000_supplier_catalog_guard.sql. Existing quick-create no longer updates a Supplier that shares its code; a duplicate requires selecting the existing Supplier or another code. Generic catalog stale conflicts now return PT409 rather than a retry timeout.
New evidence: local typecheck PASS; QA migration replay/seed 4/4 PASS; migration applied only to Supabase QA. Targeted QA RPC checks PASS for Supplier create/edit/deactivate, stale conflict, role/branch denial, duplicate quick-create without overwrite, idempotent quick-create retry, and audit. Synthetic QA suppliers were deactivated. Reused evidence: GC-03 catalog form and permission-aware projection; GA Supplier snapshot/source audit.
Result: GC-04 PASS; blocker NONE for GC-05. Production impact: NOT_TOUCHED.

# IMP-103 — GC-05 Material/UOM/Conversion checkpoint (2026-09-20)

Scope: Material, group, UOM and conversion catalog forms with targeted validation, including positive exact ratios, source note for estimated/measured conversions, VEHICLE_LOAD non-settlement and six-digit maximum rounding scale. Existing inactive references remain visible only to the record currently using them; new assignments remain disabled.
Changed paths: src/modules/catalog/actions.ts; src/app/admin/catalog/page.tsx. No schema or migration change. New evidence: local typecheck PASS; targeted Supabase QA RPC checks PASS for group/UOM/material/conversion create, material edit, immutable base UOM, conversion-version guard, stale conflict, permission boundary and audit. Synthetic records were deactivated. Reused checks: QA migration replay/seed 4/4 from GC-04 (schema unchanged). Reused evidence: GA source audit of transaction snapshots and existing conversion schema constraints.
Result: GC-05 IMPLEMENTED; affected UI check pending GC-B batch gate. Blocker: NONE for GC-06. Production impact: NOT_TOUCHED.

# IMP-104 — GC-06 operational config checkpoint (2026-09-20)

Scope: Minimal Warehouse, Vehicle, Machine and Branch create/edit/deactivate through the existing catalog, without an asset-management platform. Roles with roles.manage can configure their branch; creating a branch copies an eligible admin role to give the creator initial access. Cross-branch edits and deactivating the creator's last accessible active branch are blocked.
Changed paths: src/modules/catalog/{fields,actions}.ts; src/app/admin/catalog/page.tsx; supabase/migrations/20260920100000_operational_master_config.sql. New evidence: local typecheck PASS; QA migration replay/seed 4/4 PASS; migration applied only to Supabase QA. Targeted QA RPC checks PASS for Warehouse/Vehicle/Machine create/edit/deactivate, branch/role denial, Branch create/edit/deactivate, creator access, stale conflict and audit. Synthetic QA records were deactivated. Reused evidence: GC-03..05 catalog form and permissions checks.
Result: GC-06 IMPLEMENTED; affected UI check pending GC-B batch gate. Blocker: NONE for GC-07. Production impact: NOT_TOUCHED.

# IMP-105 — GC-07 Settings/pricing implementation (2026-09-20)

Scope: Permission-aware Settings hub for GC-03..06 and branch pricing configuration. Pricing changes create a new version or deactivate a rule; prior document snapshots are not rewritten.
Changed paths: src/components/app-shell.tsx; src/app/admin/settings/{page,pricing/page}.tsx; src/modules/pricing/{actions,editor}.tsx; supabase/migrations/20260920110000_pricing_rule_config.sql; tasks.md; implementation.md.
Gap delta: GAP-02 pricing/config implementation added; GAP-16 Settings route/entry implementation added. Both remain pending affected UI/DB/SEC checks before acceptance.
New evidence: NOT_RUN. Reused evidence: GC-03..06 catalog CRUD and permission checks. Checks: typecheck/UI/DB/SEC NOT_RUN at this implementation checkpoint. Result: IMPLEMENTED_LOCAL, GC-B gate pending. Blocker: NONE. Production impact: NOT_TOUCHED.

# IMP-106 — GC-B gate and GC-07 verification (2026-09-20)

Scope: GC-03..07 master data/settings batch. GAP-02 and GAP-16 are FIXED at the QA-checked boundary; no Owner acceptance or Production assertion. Pricing rule edits create a new version, including a same-day replacement, while a stale predecessor is rejected.
Gap IDs: GAP-02, GAP-16. Changed paths: supabase/migrations/20260920113000_pricing_version_boundary.sql; tasks.md; implementation.md. The GC-07 source paths are recorded in IMP-105.
New evidence: local typecheck PASS; QA migration replay/seed 4/4 PASS; both pricing migrations applied only to Supabase QA `ffrwiglcrlumfvhubaxg`. Targeted QA RPC checks PASS for options, create, duplicate prevention, worker/cross-branch denial, stale version, replacement, same-day replacement, predecessor denial, deactivation, audit, and inactive synthetic cleanup. A QA-browser UI check PASS for all 11 catalog entry kinds, Settings/pricing links, pricing scope editor, 390px mobile width, and hidden privileged links/editor for Worker. Reused evidence: IMP-101..104 DB/permission/audit checks; GC-02 shell typecheck.
Checks: typecheck NEW PASS; DB/SEC NEW PASS (QA only); UI NEW PASS (affected routes); QA replay NEW PASS; unrelated regression REUSED/NOT_RUN. Result: GC-B PASS, GC-07 PASS. Blocker: NONE for GC-08. Production impact: NOT_TOUCHED.

# IMP-107 — GC-08 multi-line Sales/Quote implementation (2026-09-20)

Scope: Add/remove up to 50 independent Sales/Quote lines, preserve form state per line, validate aligned line payloads, batch-load material/conversion/pricing inputs, and submit the full line array to existing draft RPCs. Detail pages and SQL already display/compute exact authoritative line/document totals. Price-before-save UX remains GC-09.
Gap IDs: GAP-03 implementation added. Changed paths: src/components/sales/commercial-document-form.tsx; src/modules/sales/actions.ts; src/app/admin/{orders,quotations}/new/page.tsx; src/app/globals.css; tasks.md; implementation.md. New evidence: NOT_RUN. Reused evidence: existing multi-line draft RPC and detail-page SQL/source audit. Checks: typecheck/UI/DB NOT_RUN at implementation checkpoint. Result: IMPLEMENTED_LOCAL; focused checks pending. Blocker: NONE. Production impact: NOT_TOUCHED.

# IMP-108 — GC-08 focused verification (2026-09-20)

Scope: GC-08 Quote/SO multi-line create. GAP-03 FIXED at QA-checked boundary; GC-09 price preview remains open. Changed paths: src/modules/sales/actions.ts (type-narrowing correction); tasks.md; implementation.md. New evidence: typecheck initial FAIL on nullable customer narrowing, then targeted correction and RERUN PASS. QA-browser check PASS for add/remove preserving another line and two-line Quote/SO DRAFT submission. QA DB returned exact per-line totals 61,729 and 154,321 VND and document total 216,050 VND for both documents. QA price rule used for the check was deactivated afterward. Reused evidence: existing draft RPC multi-line contract and detail-page total rendering; QA migration replay from IMP-106 (schema unchanged). Checks: UI NEW PASS; DB NEW PASS; typecheck RERUN PASS; broader regression NOT_RUN. Result: GC-08 PASS; blocker NONE for GC-09. Production impact: NOT_TOUCHED.

QA fixture note: DRAFT quotation `1e2ce3af-01a1-42a6-a0ca-1ef9d60d392a` and DRAFT sales order `d66b258b-71b4-4ae0-b8db-e8acf52ec1da` remain only in QA. A cleanup transaction rolled back because the quotation revision immutability trigger rejected deletion; no partial deletion occurred. Do not bypass the trigger merely to remove test fixtures.

# IMP-109 — GC-09 Sales price preview implementation (2026-09-20)

Scope: Reuse the authoritative Sales resolver for read-only per-line price/source/total preview, require preview before Save, compare the saved price snapshot with a fresh resolution, and support per-line MANUAL_APPROVED price only with pricing.manage and a reason. No cost data is returned to the form.
Gap IDs: GAP-06 implementation added. Changed paths: src/modules/sales/actions.ts; src/components/sales/commercial-document-form.tsx; src/app/admin/{orders,quotations}/new/page.tsx; src/app/globals.css; tasks.md; implementation.md. New evidence: NOT_RUN. Reused evidence: GC-08 multi-line QA total checks and existing `private.assert_commercial_line` permission/snapshot contract. Checks: typecheck/UI/SEC/DB NOT_RUN at implementation checkpoint. Result: IMPLEMENTED_LOCAL; focused checks pending. Production impact: NOT_TOUCHED.

# IMP-110 — GC-09 focused verification (2026-09-20)

Scope: Sales/Quote price preview and manual override. GAP-06 FIXED at QA-checked boundary. Changed paths: tasks.md; implementation.md. New evidence: local typecheck PASS. QA-browser Owner check PASS for missing rule without default zero, MANUAL_APPROVED preview/line total, quantity change invalidating preview, and Quote DRAFT save. QA SQL confirmed unit price 123,457 VND, line/document total 61,729 VND, source MANUAL_APPROVED, override actor and reason. QA-browser Sales check PASS for hidden manual controls, LIST price preview, 390px width, stale-preview Save denial after rule replacement, and updated preview. Temporary QA pricing rules were deactivated. Reused evidence: IMP-108 multi-line creation and SQL totals; existing SQL permission/snapshot guard. Checks: typecheck NEW PASS; UI/DB/SEC NEW PASS (QA only); unrelated regression REUSED/NOT_RUN. Result: GC-09 PASS; blocker NONE for GC-10. Production impact: NOT_TOUCHED.

QA fixture note: DRAFT quotation `c2b47e8c-100c-41db-8e54-cfba82ae50c8` remains in QA from the manual-override check. No customer message was sent and no order was confirmed.

# IMP-111 — GC-10 quick Customer/Site implementation (2026-09-20)

Scope: Permission-aware quick Customer and Site forms in the Sales/Quotation create flow. Parent document lines remain mounted; newly created Customer is selected and opens Site creation, and the new Site is auto-selected in the same draft.
Gap IDs: GAP-05 implementation added. Changed paths: src/components/sales/commercial-document-form.tsx; src/modules/customers/actions.ts; src/app/admin/{orders,quotations}/new/page.tsx; src/app/globals.css; tasks.md; implementation.md. New evidence: NOT_RUN. Reused evidence: GC-03 quick Customer/Site RPC and permission checks, GC-08/09 Sales form checks. Checks: typecheck/UI/DB/SEC NOT_RUN at implementation checkpoint. Result: IMPLEMENTED_LOCAL; focused checks pending. Production impact: NOT_TOUCHED.

# IMP-112 — GC-10 focused verification (2026-09-20)

Scope: Inline Customer/Site creation from Sales/Quotation without losing the document draft. GAP-05 FIXED at QA-checked boundary. Changed paths: tasks.md; implementation.md. New evidence: local typecheck PASS. QA-browser Owner check PASS for create Customer then Site, auto-select both IDs, preservation of two line quantities and terms, same-draft manual price preview, and 390px layout. QA DB confirmed branch/customer/site linkage. QA-browser Sales without customers.manage had neither quick-create control. Synthetic QA Customer and Site were deactivated; Site cleanup used an exact-ID QA SQL update after a cleanup-only RPC omitted its required customer_id and returned 42501. Reused evidence: GC-03 quick-create DB/permission/audit checks, IMP-108/110 Sales and preview checks. Checks: typecheck NEW PASS; UI/DB/SEC NEW PASS (QA only); unrelated regression REUSED/NOT_RUN. Result: GC-10 PASS; blocker NONE for GC-11. Production impact: NOT_TOUCHED.

# IMP-113 — GC-11 Quote/SO DRAFT edit (2026-09-20)

Scope: In-place DRAFT edit for Sales Order and current Quotation revision, with line add/remove/quantity/UOM, terms/date, authorized manual price, fresh pre-save preview, draft-version conflict protection, idempotent RPC and audit. Existing customer/site stay fixed; SENT Quote and non-DRAFT Order are rejected in RPC. GAP-04 is PARTIAL until PO DRAFT edit in GC-12.
Changed paths: supabase/migrations/20260920150000_commercial_draft_edit.sql; src/modules/sales/actions.ts; src/components/sales/commercial-document-form.tsx; src/app/admin/orders/[id]/{page.tsx,edit/page.tsx}; src/app/admin/quotations/[id]/{page.tsx,edit/page.tsx}; tasks.md; implementation.md.
New evidence: local typecheck PASS and QA migration replay/seed 4/4 PASS. Migration applied only to QA `ffrwiglcrlumfvhubaxg`. QA RPC checks PASS for in-place Order line removal and Quote line addition, exact totals, version increment, same-operation replay, stale-version rejection and SENT Quote edit rejection. QA-browser Owner checks PASS for Order/Quote edit preloading and both preview/save flows returning to the same document. QA Sales RPC mutation was denied `forbidden`; this did not isolate the manual-price permission rule. A direct CONFIRMED Order negative check was NOT_RUN because no matching QA fixture existed; the common SQL state guard covers every non-DRAFT state. Existing MANUAL_APPROVED drafts require pricing.manage for editing to avoid unprivileged silent repricing.
Reused evidence: IMP-108 multi-line editor and totals; IMP-110 price preview/manual override; existing immutable Quote line/revision triggers. Checks: DOC NEW PASS; typecheck NEW PASS; DB/IDEM/SEC NEW PASS at stated QA boundary; UI NEW PASS; full regression NOT_RUN. Result: GC-11 PASS at available QA boundary; blocker NONE for GC-12. Production impact: NOT_TOUCHED.

# IMP-114 — GC-12 warehouse PO multi-line and DRAFT edit checkpoint (2026-09-20)

Scope: Warehouse PO add/remove up to 50 lines, batched cost resolution, permission-gated cost/source/total preview, in-place DRAFT edit with version/idempotency/audit, and per-line receive/fulfillment controls in PO detail instead of implicit firstLine. Source-linked direct PO create/edit remains outside this completed slice because replacing linked lines would invalidate Sales allocations. GAP-04 and GAP-07 remain PARTIAL; GC-12 remains IN_PROGRESS.
Changed paths: supabase/migrations/20260920160000_purchase_draft_multiline.sql; src/modules/purchasing/actions.ts; src/components/purchasing/purchase-order-form.tsx; src/app/admin/purchase-orders/{new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx}; tasks.md; implementation.md.
New evidence: local typecheck PASS; QA migration replay/seed 4/4 PASS; migration applied only to QA `ffrwiglcrlumfvhubaxg`. QA RPC created a two-line warehouse PO with exact total 228360 VND, updated the same PO to three lines with total 211109 VND, accepted same-operation replay once, and rejected stale version. QA browser created another two-line PO through preview/save and edited a three-line DRAFT down to two lines. That synthetic PO was then CONFIRMED in QA; edit RPC rejected it. UI per-line receipt controls received typecheck only, not a receipt/AP behavioral check. Synthetic active QA warehouse `dd9c098c-ef5c-43c9-8740-1dcdf16f810a`, DRAFT PO `3703e28b-0998-46c7-a8b6-bf08d3543c46`, and CONFIRMED PO `53cd3c7f-04e4-47d2-862d-12e38bd146fd` remain in QA.
Reused evidence: existing `private.assert_purchase_line` cost/permission validation and confirmed PO mutation guards; GC-11 DRAFT version/idempotency pattern. Checks: typecheck NEW PASS; QA replay NEW PASS; DB/IDEM/SEC NEW PASS at stated boundary; UI NEW PASS for warehouse create/edit; source-linked direct and receipt/AP regression NOT_RUN. Result: GC-12 PARTIAL. Production impact: NOT_TOUCHED.

NEW_GAP-02 (P2): `src/modules/purchasing/actions.ts` maps `draft_version_conflict` through its earlier generic `version_conflict` branch, so a stale PO DRAFT displays an allocation-specific message. RPC correctly rejects the stale write. Fix within GC-12 before PASS; not silently marked fixed.

# IMP-115 — GC-11 completion before further GC-12 work (2026-09-20)

Scope: Close the remaining Quote/SO DRAFT edit role and immutable-state evidence without advancing GC-12. Existing MANUAL_APPROVED line price/source/reason/conversion must match a line ID from the same DRAFT for an actor without pricing.manage; only quantity and other authorized draft fields may change, and the original override actor remains attached. Owner with pricing.manage retains the explicit override path.
Changed paths: supabase/migrations/20260920170000_preserve_draft_manual_price.sql; src/modules/sales/actions.ts; src/components/sales/commercial-document-form.tsx; src/app/admin/orders/[id]/{page.tsx,edit/page.tsx}; src/app/admin/quotations/[id]/{page.tsx,edit/page.tsx}; tasks.md; implementation.md.
New evidence: local typecheck PASS; QA migration replay/seed 4/4 PASS; migration applied only to QA `ffrwiglcrlumfvhubaxg`. A QA transaction changed a DRAFT SO to CONFIRMED and proved `update_sales_order_draft` denies the edit, then rolled back the fixture state. QA Sales on Branch A edited quantity of an Owner-approved manual-price SO, retained exact unit price and original override actor, replayed the same operation idempotently, and was denied a forged price change. QA-browser Sales edit/preview/save PASS with 30003 VND total and original approval preserved. Quote update with quotation.create temporarily added to the QA Sales role inside one transaction preserved total/override actor; both role and edit mutation were rolled back. QA-browser Owner Quote edit/preview/save regression PASS.
Reused evidence: IMP-113 in-place multi-line Quote/SO edit, stale-version and SENT denial. Checks: typecheck NEW PASS; QA replay NEW PASS; DB/SEC/IDEM NEW PASS at stated QA boundary; affected UI NEW PASS; unrelated full suite NOT_RUN. Result: GC-11 PASS. GC-12 remains PARTIAL from IMP-114 and was not advanced in this checkpoint. Production impact: NOT_TOUCHED.

# IMP-116 — GC-12 direct multi-line implementation attempt (2026-09-20)

Scope: Add multi-line PO/SO direct creation, existing-SO per-line PO creation, source-linked PO DRAFT edit with stable line/allocation IDs, preserve approved manual purchase price for non-pricing editors, and correct stale-DRAFT error mapping. No GC-13 work started.
Changed paths: supabase/migrations/20260920180000_gc12_direct_multiline_edit.sql; src/modules/purchasing/{actions.ts,form-options.ts}; src/components/purchasing/purchase-order-form.tsx; src/app/admin/purchase-orders/{new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx}; tasks.md; implementation.md.
New evidence: focused local `pnpm typecheck` FAIL at `src/modules/purchasing/actions.ts:253:77` (`customerResult.data` possibly null). Migration CLI unavailable (`supabase: command not found`); migration added as SQL file only. DB/UI/SEC/IDEM and QA migration checks NOT_RUN. NEW_GAP-02 mapping changed in source but NOT_VERIFIED. Result: GC-12 PARTIAL, gate BLOCKED by typecheck and pending QA checks. Reused evidence: IMP-114 warehouse PO multi-line checks. Production impact: NOT_TOUCHED.

# IMP-117 — GC-12 targeted QA evidence and new role UI blocker (2026-09-21)

Scope: Fix the nullable customer tier typing error and exercise GC-12 direct multi-line, source-linked DRAFT edit, stale/immutable boundaries, manual-cost role boundary and affected UI. Changed path: src/modules/purchasing/actions.ts; tasks.md; implementation.md.
New evidence: `pnpm typecheck` PASS; `pnpm qa:test` 4/4 PASS; QA-only migration `20260920180000_gc12_direct_multiline_edit.sql` applied. QA rollback transaction: two-line PO from existing SO, same-operation replay, stable PO line/allocation IDs after DRAFT edit, stale-version denial, CONFIRMED edit denial, and two-line linked PO/SO creation PASS. QA Sales with transaction-only purchasing.create/price.read grant: manual cost and approver preserved on quantity edit, replay PASS, forged cost denied; transaction rolled back. QA-browser Owner: two-line direct PO cost preview/create/edit PASS; PO cancelled to release allocations. QA-browser Sales: fixed approved prices rendered, but cost-preview button remained disabled and edit could not be saved. Test cleanup `finally` executed cancellation/revocation without a cleanup exception; no independent post-cleanup read was run. Unrelated full suite NOT_RUN. Result: GC-12 PARTIAL; GC-13 NOT_OPENED. Production impact: NOT_TOUCHED.
NEW_GAP-03 (P1): On a manual-price source-linked PO DRAFT, QA Sales with temporary purchasing.create/read/price.read but not purchasing.price.manage sees both approved costs as fixed, yet `Tính giá mua và xem trước` is disabled after a quantity edit. Affected path: src/components/purchasing/purchase-order-form.tsx and its options loading. User impact: authorized non-pricing editor cannot complete DRAFT edit in UI. Fix within GC-12 before PASS; do not infer cause without a focused check.

# IMP-118 — GC-12 gate close and GC-13 handoff (2026-09-21)

Scope: Close NEW_GAP-03 without broadening Supplier read access; source-linked DRAFT edit uses the authorized PO supplier snapshot when the actor cannot list Supplier master data, and purchase-line rebuilding accepts the already validated DRAFT supplier. Changed paths: src/modules/purchasing/actions.ts; src/app/admin/purchase-orders/[id]/edit/page.tsx; tasks.md; implementation.md.
New evidence: QA Sales can read material and SO lines but Supplier list is empty; this caused the edit form's supplier-options guard to disable cost preview. Focused `pnpm typecheck` PASS. QA app preflight PASS. QA-browser Sales with temporary purchasing.create/read/price.read and without purchasing.price.manage: two approved prices rendered fixed, supplier snapshot option present, preview enabled, two-line quantity edit saved, unit costs 211/212 VND and per-line allocations retained. Test PO cancelled and transaction-scoped test role grants revoked in cleanup. Reused evidence: IMP-114 warehouse multi-line, IMP-117 QA migration/replay, direct PO/SO multi-line DB/SEC/IDEM, Owner UI, stale and CONFIRMED denial. Unrelated full suite NOT_RUN. Result: GC-12 PASS; NEW_GAP-02/03 CLOSED; GC-13 opened. Production impact: NOT_TOUCHED.

## IMP-119 — GC-13 PO receiving and direct fulfillment, multi-line

- scope: GC-13; one operation carries selected positive quantities for multiple PO lines, with per-line remaining quantities in the PO UI.
- gap_ids: GC-13.
- changed_paths: src/modules/inventory/actions.ts; src/app/admin/purchase-orders/[id]/page.tsx; supabase/migrations/20260921120000_gc13_purchase_order_line_progress.sql; tasks.md; implementation.md.
- new_evidence: V-GC13-01 typecheck PASS; V-GC13-02 QA view access PASS (anon denied, Owner sees 2 lines, out-of-scope account sees 0); V-GC13-03 QA warehouse rollback PASS (2 receipt lines, 1 AP, same receipt on replay); V-GC13-04 QA warehouse UI PASS (one form, 2 line inputs with remaining quantity); V-GC13-05 QA direct rollback PASS (2 fulfillment lines, 1 AP, 1 direct cost linked to source SO, same fulfillment on replay); V-GC13-06 QA direct UI PASS (one form, 2 remaining quantities).
- reused_evidence: IMP-118 / GC-12 two-line PO creation/editing and source-line allocations.
- checks: TYPECHECK:NEW PASS; DB:NEW PASS; SEC:NEW PASS; IDEM:NEW PASS; UI:NEW PASS. No full suite.
- result: PASS. QA direct PO fixture ea3bbc82-345d-42c5-9dee-8ce5b39b97ba cancelled after rollback checks; no retained fulfillment or AP.
- blocker: NONE. QA view was applied directly for the focused check; the migration file remains the release source of truth.
- production_impact: NOT_TOUCHED.

## IMP-120 — GC-14 delivery multi-line, partial

- scope: GC-14; create one delivery from selected allocations of the same SO, submit result and verify all delivery lines, select a verification line explicitly for return.
- gap_ids: NEW_GAP-04, NEW_GAP-05.
- changed_paths: src/modules/delivery/actions.ts; src/app/admin/orders/[id]/page.tsx; src/app/admin/deliveries/[id]/page.tsx; supabase/migrations/20260921130000_gc14_delivery_multiline.sql; tasks.md; implementation.md.
- new_evidence: V-GC14-01 typecheck PASS; V-GC14-02 QA migration/grants PASS (anon cannot execute, authenticated can); V-GC14-03 QA rollback: one delivery with 2 lines and idempotent replay, 2 result lines, 2 verification lines, 1 AR, 1 revenue, second-line customer return resolved; V-GC14-04 QA rollback: transit remainder incorrectly accepted on fully accepted first line when second line of same material retained 0.5 base.
- reused_evidence: IMP-119 GC-13 two-line PO/receipt source and QA Owner context.
- checks: TYPECHECK:NEW PASS; DB:NEW PARTIAL; SEC:NEW PASS for new RPC grant; IDEM:NEW PASS for create replay; UI:NOT_RUN for multi-line delivery because fixture was transaction-only. No full suite.
- result: PARTIAL. QA synthetic SO/credit/allocation/receipt/delivery/return fixture fully rolled back. QA migration was applied directly for focused testing; migration file remains release source of truth.
- blocker: NEW_GAP-04 (P0) and NEW_GAP-05 (P1). GC-15 not opened.
- production_impact: NOT_TOUCHED.

### NEW_GAP-04 — Return transit balance is not line-scoped

- verdict: CONFIRMED; severity: P0; contract_refs: tasks.md GC-14 and Owner instruction 16 (return per-line).
- source_evidence: public.open_return_case in supabase/migrations/20260912114625_inventory_delivery.sql sums IN_TRANSIT movements by delivery_id + material_id, while the return case is attached to a delivery_line_id. V-GC14-04 accepted 0.5 TRANSIT_REMAINDER on a line with zero own remainder using 0.5 from another line of the same material.
- user_impact: wrong-line return/loss can be opened and later misattribute inventory and cost.
- fix_task: GC-14; compute available transit quantity from the selected delivery line's handoff, accepted quantity, and resolved/open return cases; reject direct-source transit cases without stock movement.

### NEW_GAP-05 — Return selector labels duplicate-material lines ambiguously

- verdict: CONFIRMED from current UI; severity: P1; contract_refs: tasks.md GC-14 (per-line return).
- source_evidence: src/app/admin/deliveries/[id]/page.tsx return select labels use material name + accepted quantity, but omit a stable line number. Two lines with the same material and accepted quantity have identical labels although their values are different verification-line IDs.
- user_impact: operator cannot reliably choose the intended line for a return case.
- fix_task: GC-14; include stable line ordinal/source context in the option label without exposing restricted cost.

## IMP-121 — GC-13 DoD and GC-14 closure (2026-09-21)
- Scope: close GC-13 privilege hygiene; close GC-14 per-line return guard and duplicate-line labeling.
- Gap IDs: NEW_GAP-04 FIXED; NEW_GAP-05 FIXED.
- Changed paths: supabase/migrations/20260921120000_gc13_purchase_order_line_progress.sql; supabase/migrations/20260921140000_gc14_return_line_guard.sql; src/app/admin/deliveries/[id]/page.tsx; tasks.md; implementation.md.
- New evidence: QA project ffrwiglcrlumfvhubaxg applied GC-14 return guard and GC-13 view grants. QA privileges: anon SELECT/EXECUTE denied, authenticated view SELECT and return EXECUTE allowed, view TRIGGER/TRUNCATE/REFERENCES denied. Focused QA transaction rolled back: 2 delivery lines, 2 result lines, 2 verification lines, 2 return cases; same-intent create replay; fully accepted first line and second-line overdraw both rejected with return_quantity_exceeds_source; valid second-line transit and customer returns resolved. UI line ordinal added to detail table and return selector.
- Reused evidence: IMP-119 GC-13 two-line warehouse/direct receipt and supplier fulfillment; IMP-120 GC-14 multi-line creation/result/verification and UI form evidence.
- Checks: QA DB/SEC/IDEM NEW PASS; typecheck NEW PASS; no full suite.
- Result: GC-13 PASS; GC-14 PASS; GC-15 opened. Blocker: NONE for GC-14. Production impact: NOT_TOUCHED. QA direct DDL is not migration-history recorded; migration files remain release source.
## IMP-122 — GC-15 Customer 360 (2026-09-21)
- Scope: Customer detail with Profile, Sites, Pricing, Quotes, Orders, Deliveries, Receivables, Payments and traceable Documents contexts; contextual create actions and customer/site prefill.
- Gap IDs: GC-15 FIXED.
- Changed paths: src/app/admin/customers/[id]/page.tsx; src/components/sales/commercial-document-form.tsx; src/app/admin/orders/new/page.tsx; src/app/admin/quotations/new/page.tsx; tasks.md; implementation.md.
- New evidence: all Customer 360 datasets are branch/customer scoped and bounded; permission checks suppress restricted finance/pricing/sales contexts; site CTA prefills only a customer/site pair present in server-loaded options; document links resolve to canonical business sources and do not claim an unissued PDF. Focused QA authenticated query returned bounded sites/prices/quotes/orders/deliveries/receivables/payments for one branch customer.
- Reused evidence: IMP-116 sales multi-line/price preview and IMP-118 quick-create draft preservation.
- Checks: UI/DOC source check NEW PASS; QA DB/SEC NEW PASS; typecheck NEW PASS; no full suite.
- Result: GC-15 PASS; GC-16 opened. Blocker: NONE. Production impact: NOT_TOUCHED.

## IMP-123 — GC-16 Supplier 360 (2026-09-21)
- Scope: Supplier Profile, PO, Receipts, Direct Fulfillments, AP and Payments contexts with create-PO/payment actions and supplier prefill.
- Gap IDs: GC-16 FIXED.
- Changed paths: src/app/admin/suppliers/[id]/page.tsx; src/components/purchasing/purchase-order-form.tsx; src/app/admin/purchase-orders/new/page.tsx; tasks.md; implementation.md.
- New evidence: all Supplier 360 datasets are branch/supplier scoped and bounded; purchase cost and finance contexts are permission-gated; supplier query prefill resolves only against server-loaded active branch options. Focused QA authenticated query validated purchase_order_read, purchase_receipt_read, supplier_fulfillment_read, payable_read and payment_read access and filters.
- Reused evidence: IMP-119 two-line warehouse receipt/direct fulfillment and one AP per source; IMP-113 payment/AP canonical source checks.
- Checks: UI/DOC source check NEW PASS; QA DB/SEC NEW PASS; typecheck NEW PASS; no full suite.
- Result: GC-16 PASS; GC-17 opened. Blocker: NONE. Production impact: NOT_TOUCHED.

## IMP-124 — GC-17 Access management partial (2026-09-21)
- Scope: additive explicit permission grants, effective access resolution, revoke/reactivate, permission-aware administration UI and audit reasons.
- Gap IDs: GC-17 PARTIAL; NEW_GAP-06 confirmed in new set_employee_explicit_permissions RPC.
- Changed paths: supabase/migrations/20260921150000_gc17_access_management.sql; src/lib/access/context.ts; src/lib/auth/actions.ts; src/components/access/manage-access-form.tsx; src/app/admin/access/page.tsx; tasks.md; implementation.md.
- New evidence: typecheck PASS. QA migration applied; table/RPC privilege check PASS (anon denied, authenticated subject to RLS/RPC). Focused rollback failed before mutation because PL/pgSQL identifier code is ambiguous in the permission validation query; transaction rolled back.
- Reused evidence: existing assign_employee_role/revoke access boundary and audit implementation.
- Checks: typecheck NEW PASS; QA DB/SEC NEW PASS; QA DB functional NEW FAIL (42702 ambiguous code). No full suite.
- Result: GC-17 PARTIAL/BLOCKED; GC-18 NOT_OPENED. Blocker: qualify the unnest alias in set_employee_explicit_permissions, replace the QA function, then rerun grant/self/revoke/reactivate/audit rollback. Production impact: NOT_TOUCHED.

## IMP-125 — GC-17 Access management closure (2026-09-21)
- Scope: close NEW_GAP-06 and validate role/access/explicit permission administration.
- Gap IDs: NEW_GAP-06 FIXED; GC-17 FIXED.
- Changed paths: supabase/migrations/20260921150000_gc17_access_management.sql; tasks.md; implementation.md.
- New evidence: qualified all unnest aliases in set_employee_explicit_permissions. QA function replaced. Focused authenticated transaction rolled back: additive catalog.manage became effective for target, self-change rejected as forbidden, revoke removed active access and explicit grant, revoked permission became false, reactivate and same-state replay returned stable access id, and permission/revoke/reactivate each emitted one audit event.
- Reused evidence: IMP-124 privilege boundary/typecheck and GC-17 UI/source evidence.
- Checks: DB/SEC/IDEM/AUDIT RERUN PASS; typecheck REUSED IMP-124; no full suite.
- Result: GC-17 PASS; GC-18 opened. Blocker: NONE. Production impact: NOT_TOUCHED.

## IMP-126 — GC-18 Customer portal order completeness (2026-09-21)
- Scope: customer-safe order state, delivery timeline, role-scoped debt/payment state and relevant documents.
- Gap IDs: GC-18 FIXED.
- Changed paths: supabase/migrations/20260921160000_gc18_customer_order_portal.sql; src/modules/portal/types.ts; src/app/customer/orders/[id]/page.tsx; tasks.md; implementation.md.
- New evidence: current-schema order/delivery payloads replace legacy fallback fields. QA role-bound transaction rolled back: Owner received commercial/fulfillment/payment state and finance/documents containers; Receiver received no debt, payment state or payment documents; outsider received forbidden_or_order_not_found. Serialized payload contained no supplier/cost/margin/payroll/internal-note/terms fields.
- Reused evidence: customer membership and private evidence signing boundaries from portal implementation.
- Checks: UI/SEC/DB NEW PASS; typecheck NEW PASS; no full suite.
- Result: GC-18 PASS; GC-19 opened. Blocker: NONE. Production impact: NOT_TOUCHED.

## IMP-127 — GC-19 bounded core lists (2026-09-21)
- Scope: Orders, Quotations, PO, Customers, Suppliers, Deliveries, AR, AP and ServiceJob server-side search/filter/pagination.
- Gap IDs: GC-19 FIXED.
- Changed paths: src/lib/core-list.ts; src/components/ui/list-pager.tsx; nine core list pages; tasks.md; implementation.md.
- New evidence: every core list uses server predicates, count, range of 25, deterministic primary sort plus id tie-break and GET URL state. AR/AP party context uses a separate bounded 100-obligation allocation query. Delivery resolves only vehicle IDs in the current page. QA authenticated queries for all nine sources returned at most 25 unique IDs; large Orders/Deliveries/AR/AP sources returned exactly 25.
- Reused evidence: branch/RLS source views and list permission contracts.
- Checks: UI/DB/PERF NEW PASS; typecheck NEW PASS; no full suite.
- Result: GC-19 PASS; GC-20 opened. Blocker: NONE. Production impact: NOT_TOUCHED.


## IMP-128 — GC-20 Dashboard completion

- scope: Expense breakdown, commission summary/detail, and contextual AR/AP snapshot drill-down with preserved filters.
- gap_ids: SPEC-GAP-002 dashboard completion slice.
- changed_paths: `supabase/migrations/20260921170000_gc20_dashboard_detail.sql`, `src/app/admin/page.tsx`, `src/components/dashboard/dashboard-details.tsx`, `src/app/admin/dashboard/obligations/page.tsx`.
- new_evidence: QA RPC contract proves detail totals equal canonical KPI totals when quality is READY; activity mismatch returns NOT_APPLICABLE; anon execute denied and authenticated execute allowed. TypeScript check passes.
- reused_evidence: Existing finance snapshot semantic/cutoff checks and GC-19 bounded core-list evidence remain valid.
- checks: DB:NEW PASS; SEC:NEW PASS; UI:NEW PASS; TYPECHECK:NEW PASS.
- result: PASS.
- blocker: NONE.
- production_impact: NOT_TOUCHED.


## IMP-129 — GC-21 Low-stock alerts

- scope: Material/warehouse thresholds, deduplicated in-app low-stock warning, inventory context link, and prefilled draft-PO action without automatic ordering.
- gap_ids: SPEC-GAP-002 low-stock alert slice.
- changed_paths: `supabase/migrations/20260921180000_gc21_low_stock_alerts.sql`, `src/app/admin/inventory/actions.ts`, `src/app/admin/inventory/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/purchase-orders/new/page.tsx`, `src/components/purchasing/purchase-order-form.tsx`.
- new_evidence: QA rollback proves one alert per branch/warehouse/material, update version progression, direct-write denial, function ACL, and zero purchase-order side effects. TypeScript passes.
- reused_evidence: Inventory ledger/reservation evidence and GC-11/GC-13 PO draft behavior remain valid.
- checks: DB:NEW PASS; SEC:NEW PASS; IDEM:NEW PASS; UI:NEW PASS; TYPECHECK:NEW PASS.
- result: PASS.
- blocker: NONE.
- production_impact: NOT_TOUCHED.


## IMP-130 — GC-22 Print/export

- scope: Delivery note, receipt/payment voucher, and customer debt reconciliation PDFs with source-page actions; quotation PDF font corrected.
- gap_ids: SPEC-REC-009 / UX-REC-015.
- changed_paths: `public/fonts/NotoSansVietnamese-Regular.ttf`, `src/lib/pdf/standard-document.ts`, `src/app/api/deliveries/[id]/note/pdf/route.ts`, `src/app/api/payments/[id]/voucher/pdf/route.ts`, `src/app/api/customers/[id]/debt-statement/pdf/route.ts`, `src/app/api/quotation-revisions/[id]/pdf/route.ts`, and source-page CTA files.
- new_evidence: Three A4 QA artifacts rendered with Poppler error count 0; Vietnamese glyphs, multipage table headers, footers, totals, and trace labels visually inspected. QA source-shape check and TypeScript pass.
- reused_evidence: Quotation revision immutability, delivery verification, payment ledger, and finance obligation snapshot evidence remain valid.
- checks: UI:NEW PASS; DOC:NEW PASS; DB:NEW PASS; TYPECHECK:NEW PASS.
- result: PASS.
- blocker: NONE.
- production_impact: NOT_TOUCHED.


## IMP-131 — GC-23 fixed reports (2026-09-21)

- scope: Fixed Reports surface for receivables, payables, and operating expenses.
- gap_ids: GC-23 FIXED.
- changed_paths: `src/modules/reports/server.ts`, `src/app/admin/reports/page.tsx`, `src/app/admin/reports/loading.tsx`, `src/app/api/reports/export/route.ts`, `src/components/app-shell.tsx`, `tasks.md`, `implementation.md`.
- new_evidence: Permission-aware fixed selector; URL-backed shared filters; canonical finance snapshot/detail/obligation sources; bounded deterministic tables; summary, chart, CSV export, and loading state. QA totals matched snapshot semantics: AR 45000000, AP 22500000, operating expense 0, all READY.
- reused_evidence: GC-20 canonical dashboard semantics and authorization boundary.
- checks: UI:NEW PASS; DOC:NEW PASS; DB:NEW PASS; TYPECHECK:NEW PASS; SEC:REUSED GC-20.
- result: GC-23 PASS; GC-24 opened.
- blocker: NONE.
- production_impact: NOT_TOUCHED.


## IMP-132 — GC-24 Audit Log UI (2026-09-21)

- scope: Branch-scoped Audit Log UI with actor, entity, action, and time filters; human-readable event summary; technical detail on demand.
- gap_ids: GC-24 FIXED.
- changed_paths: `src/modules/audit/server.ts`, `src/app/admin/audit/page.tsx`, `src/app/admin/audit/loading.tsx`, `src/components/app-shell.tsx`, `tasks.md`, `implementation.md`.
- new_evidence: Server-side combined filters, count, 25-row pagination, deterministic occurred_at/id ordering, role-aware navigation, actor-name resolution, readable summaries before collapsed raw identifiers. QA Owner read 15 branch events and the combined filter retained the sampled event; an authenticated outsider read zero rows.
- reused_evidence: GC-17 `roles.manage` access-management boundary and immutable audit ledger RLS.
- checks: UI:NEW PASS; DB:NEW PASS; SEC:NEW PASS; TYPECHECK:NEW PASS.
- result: GC-24 PASS; GC-25 opened.
- blocker: NONE.
- production_impact: NOT_TOUCHED.


## IMP-133 — GC-25 Gap Closure gate (2026-09-21)

- scope: Recheck invalidated GC evidence, close the remaining worker-portal verification gap, and execute the GC phase gate.
- gap_ids: NEW_GAP-01 FIXED; GC-25 PASS.
- changed_paths: `tasks.md`, `implementation.md`.
- new_evidence: QA worker RPC returned the assigned work item and exact title; targeted browser flow rendered `HXQA assigned work` on `/work` with access context 200. Optimized Next build compiled successfully and generated all 59 routes, including Reports, Audit and required document routes.
- reused_evidence: GC-01 through GC-24 focused DOC/UI/UNIT/DB/SEC/IDEM/PERF evidence; latest typecheck from GC-24; unaffected checks were not rerun.
- checks: UI:NEW PASS; DB:NEW PASS; GATE:NEW PASS; BUILD:NEW PASS; TYPECHECK:REUSED GC-24.
- result: GC_COMPLETE TRUE; OPEN_P0 0; OPEN_CRITICAL_P1_IN_GC 0; R10-01 opened.
- blocker: NONE.
- production_impact: NOT_TOUCHED.


## IMP-134 — R10-01/02 routing core (2026-09-21)

- scope: Single OSRM recommendation adapter with explicit manual fallback, immutable RoutePlan proposal, and transactional Apply through the existing delivery assignment command.
- gap_ids: GAP-21 routing slice FIXED; R10-01 PASS; R10-02 PASS.
- changed_paths: `supabase/migrations/20260921200000_r10_routing.sql`, `supabase/migrations/20260921200500_r10_routing_apply_fix.sql`, `src/modules/routing/provider.ts`, `src/modules/routing/actions.ts`, `src/modules/routing/server.ts`, `tasks.md`, `implementation.md`.
- new_evidence: Missing/failed provider preserves explicit manual order. QA rollback with two deliveries proved plan creation leaves assignments unchanged, Apply changes both assignments through `assign_delivery`, same-intent replay is stable, and an assignment change makes the later plan stale with no partial apply. Runtime ambiguity found by the focused check was qualified in source and QA replacement migration.
- reused_evidence: Delivery assignment authorization/version invariant and command receipt idempotency.
- checks: DB:NEW PASS; SEC:NEW PASS; IDEM:NEW PASS; RACE:NEW PASS; EXT:NEW PASS fallback boundary; TYPECHECK:NEW PASS.
- result: R10-01 PASS; R10-02 PASS; R10-03 opened.
- blocker: NONE.
- production_impact: NOT_TOUCHED.


## IMP-135 — R10-03 foreground GPS (2026-09-21)

- scope: Foreground-only assignment-bound GPS sessions, ordered telemetry, current fleet snapshot, bounded history, configurable staleness/retention, and browser API/control boundary.
- gap_ids: GAP-21 GPS slice FIXED; R10-03 PASS.
- changed_paths: `supabase/migrations/20260921210000_r10_foreground_gps.sql`, `src/app/api/gps/session/start/route.ts`, `src/app/api/gps/session/ping/route.ts`, `src/app/api/gps/session/stop/route.ts`, `src/components/routing/foreground-gps-control.tsx`, `src/modules/routing/server.ts`, `tasks.md`, `implementation.md`.
- new_evidence: QA rollback proved assigned-worker start, serialized ping replay, rejection of older captured points, latest-only fleet position, bounded history, retention cleanup, immediate denial after assignment supersession, idempotent stop, and zero outsider raw-coordinate rows. Browser control stops on hidden/unmount and does not run background tracking.
- reused_evidence: Delivery assignment identity/version boundary and R10-02 Apply behavior.
- checks: DB:NEW PASS; SEC:NEW PASS; IDEM:NEW PASS; RACE:NEW PASS; PERF:NEW PASS bounded history/current projection; TYPECHECK:NEW PASS.
- result: R10-03 PASS; R10-04 opened.
- blocker: NONE.
- production_impact: NOT_TOUCHED.


## IMP-136 — R10-04 messaging core (2026-09-21)

- scope: Database-authoritative conversations, participants, messages, scoped audiences, retry idempotency and materialized list fields.
- gap_ids: GAP-21 messaging backend FIXED; R10-04 PASS.
- changed_paths: `supabase/migrations/20260921220000_r10_messaging.sql`, `supabase/migrations/20260921220500_r10_messaging_customer_name_fix.sql`, `tasks.md`, `implementation.md`.
- new_evidence: QA rollback proved INTERNAL/CUSTOMER isolation, participant permission denial, create/send replay, last-message/unread projection, bounded list/page and read reset. Customer label schema mismatch was corrected before the successful check.
- reused_evidence: Existing employee branch membership and customer portal membership identity boundary.
- checks: DB:NEW PASS; SEC:NEW PASS; IDEM:NEW PASS; PERF:NEW PASS bounded projection queries.
- result: R10-04 PASS; R10-05 opened.
- blocker: NONE.
- production_impact: NOT_TOUCHED.


## IMP-137 — R10-05 UI/navigation (2026-09-21)

- scope: Admin RoutePlan/manual stop ordering/Apply/fleet-current screen; admin, worker and customer messaging with bounded history and realtime refresh signal; assignment-scoped foreground GPS button in work-job detail.
- gap_ids: GAP-21 UI slice FIXED; R10-05 PASS at available boundary.
- changed_paths: `supabase/migrations/20260921211000_r10_worker_gps_assignment.sql`, `supabase/migrations/20260921211500_r10_worker_tracking_list.sql`, `supabase/migrations/20260921221000_r10_message_scope.sql`, `supabase/migrations/20260921220000_r10_messaging.sql`, `src/modules/messaging/server.ts`, `src/modules/messaging/actions.ts`, `src/components/messaging/messaging-controls.tsx`, `src/components/messaging/messaging-workspace.tsx`, `src/app/admin/messages/page.tsx`, `src/app/work/messages/page.tsx`, `src/app/customer/messages/page.tsx`, `src/components/routing/route-plan-controls.tsx`, `src/app/admin/routes/page.tsx`, `src/app/work/jobs/[id]/page.tsx`, `src/app/work/tracking/page.tsx`, `src/components/app-shell.tsx`, `src/components/portal/portal-shell.tsx`, `src/modules/routing/server.ts`, `src/modules/routing/provider.ts`, `src/modules/routing/actions.ts`.
- new_evidence: QA browser Owner Routes/Messages, Worker Messages, Customer Messages render 200 with expected headings; two-stop manual reorder changes hidden order without DB write. Worker service job has no GPS control. Scoped list uses branch/customer and cursor; dedicated worker tracking page lists only active assignments, independent of WorkItem. QA rollback proved own assignment visible and outsider denied. Provider missing distance/duration falls back rather than converting missing values to zero; unavailable capacity/window validation is visibly flagged.
- reused_evidence: R10-01/02 DB/IDEM/RACE, R10-03 telemetry authorization, R10-04 audience/projection validation.
- checks: UI:NEW PASS; SEC:NEW PASS scoped RPC; TYPECHECK:NEW PASS before provider-warning tightening; phase typecheck/build pending R10-06.
- result: R10-05 PASS at available boundary; R10-06 opened. Live provider sandbox and browser geolocation on an active worker delivery remain unverified, not a PASS claim.
- blocker: NONE for independent R11/R12 work.
- production_impact: NOT_TOUCHED.


## IMP-138 — R10-06 phase implementation gate (2026-09-21)

- scope: Phase gate for route provider, RoutePlan/apply, foreground GPS, messaging and role-scoped UI.
- gap_ids: GAP-21 R10_PHASE_IMPLEMENTED; R10-06 PASS at available boundary.
- changed_paths: `tasks.md`, `implementation.md`.
- new_evidence: Optimized build generated 67 routes; TypeScript PASS. Local provider stub proved success ordering, missing-config fallback, invalid-payload fallback and timeout fallback. QA worker assignment RPC shows an assigned delivery even without WorkItem, outsider receives 42501.
- reused_evidence: IMP-134 through IMP-137 targeted DB/SEC/IDEM/RACE/UI results; no full suite.
- checks: DOC:NEW PASS; TYPECHECK:NEW PASS; BUILD:NEW PASS; EXT:NEW PASS local stub; DB/SEC/IDEM/RACE:REUSED. Live provider sandbox: NOT_RUN; actual-device foreground geolocation UAT: NOT_RUN.
- result: R10_PHASE_IMPLEMENTED; R11-01 opened. External and device evidence is not accepted or called production-ready.
- blocker: NONE for provider-neutral R11/R12 work.
- production_impact: NOT_TOUCHED.


## IMP-139 — R11-01 provider/policy decision (2026-09-21)

- scope: Determine whether real invoice provider, legal form, tax policy, signing and API are selected.
- gap_ids: GAP-22 provider integration HUMAN_GATE.
- changed_paths: `tasks.md`, `implementation.md`.
- new_evidence: Canonical SPEC-EINV-002 explicitly states provider and household-business issuing profile remain unselected. No provider configuration or enabled issue adapter was found in the R11 scope.
- reused_evidence: R11 production lock and provider-neutral permission boundary.
- checks: DOC:NEW PASS; EXT:NOT_RUN.
- result: R11-01 HUMAN_GATE; R11-02 opened for independent provider-neutral work.
- blocker: Provider-dependent issuing and legal policy cannot be completed without an Owner/provider decision.
- production_impact: NOT_TOUCHED.


## IMP-140 — R11-02 provider-neutral invoice source/coverage (2026-09-21)

- scope: Verification-based invoice business drafts and source coverage without legal issuance or new AR.
- gap_ids: GAP-22 provider-neutral domain FIXED; R11-02 PASS.
- changed_paths: `supabase/migrations/20260921230000_r11_invoice_neutral.sql`, `tasks.md`, `implementation.md`.
- new_evidence: QA rollback service source: draft/create replay, unique coverage, cancel and re-create, business approval/replay, stale denial, AR unchanged and legal/provider fields empty. Separate QA rollback two-line delivery source: two invoice lines and exact source amount total. `invoice_due_at` remains NULL pending policy while `billing_verified_at` snapshots verification time.
- reused_evidence: Delivery/service verification and AR source-of-truth invariants; no revalidation of unrelated finance flows.
- checks: DB:NEW PASS; SEC:NEW PASS; IDEM:NEW PASS; RACE:NEW PASS; DOC:NEW PASS.
- result: R11-02 PASS; R11-03 NOT_REQUIRED until external async exists; R11-04 HUMAN_GATE; R11-05 opened.
- blocker: Provider selection/policy only for issuing and legal document status.
- production_impact: NOT_TOUCHED.

## IMP-141 — R11-05/06 provider-neutral implementation gate (2026-09-21)

- scope: Invoice adjustment drafts, purchase-source registry, business review UI and explicitly non-legal review PDF; close the provider-neutral R11 gate.
- gap_ids: GAP-22 provider-neutral surfaces IMPLEMENTED; actual issue/legal documents HUMAN_GATE.
- changed_paths: `supabase/migrations/20260921231000_r11_invoice_adjustment_registry.sql`, `supabase/migrations/20260921231500_r11_direct_fulfillment_evidence.sql`, `supabase/migrations/20260921232000_r11_purchase_registry_eligibility.sql`, `src/modules/invoicing/actions.ts`, `src/components/invoicing/invoice-command.tsx`, `src/app/admin/invoices/`, `src/app/api/invoices/[id]/review/pdf/route.ts`, `src/lib/pdf/standard-document.ts`, `src/components/app-shell.tsx`, `src/modules/routing/actions.ts`, `src/components/routing/route-plan-controls.tsx`, `src/modules/messaging/actions.ts`, `src/components/messaging/messaging-controls.tsx`, `tasks.md`, `implementation.md`.
- new_evidence: QA rollback purchase registry source unique/replay and evidence boundary; service-source adjustment draft/replay/same-source duplicate denial, all rolled back. QA browser Owner invoice and purchase pages return 200. QA invoice/purchase rows are empty, so populated detail and review PDF runtime remain NOT_RUN. Typecheck PASS and optimized build PASS with 69 routes. Messaging/routing form operation IDs now persist across retry for the same intent.
- reused_evidence: IMP-140 verified-source coverage, approval and no-new-AR checks; IMP-134/136 routing and messaging DB idempotency. No live provider, legal policy, signing or tax acceptance claimed.
- checks: DB:NEW PASS; IDEM:NEW PASS; UI:NEW PASS lists only; TYPECHECK:NEW PASS; BUILD:NEW PASS; PDF runtime:NOT_RUN; EXT:NOT_RUN.
- result: R11-05 IMPLEMENTED_TO_AVAILABLE_BOUNDARY; R11-06 provider-neutral implementation gate PASS; R12-01 opened.
- blocker: Provider/legal/tax/signing/API human decision for real issue, and populated PDF QA evidence before release acceptance.
- production_impact: NOT_TOUCHED.

## IMP-142 — R12 release-candidate evidence and blockers (2026-09-21)

- scope: R12-01..08 available non-Production boundary; targeted candidate reconciliation/security/performance, QA isolation/write fence, migration-history check and approval package. R11 gate invalidated only for the review PDF input path.
- gap_ids: GAP-23 PARTIAL; NEW_GAP-02 CONFIRMED P0 release blocker: 19 local migrations from 20260921 are absent from QA `supabase_migrations.schema_migrations` despite corresponding R10/R11 schema objects existing. NEW_GAP-03 CONFIRMED P1: `/api/invoices/not-a-uuid/review/pdf` returns HTTP 500 (SQL 22P02) instead of rejecting malformed input; populated PDF route NOT_RUN.
- changed_paths: `tasks.md`, `implementation.md`, `RELEASE_APPROVAL.md`. No application/source/schema repair in this batch.
- new_evidence: QA guard ref `ffrwiglcrlumfvhubaxg`; 41 local migration files vs 22 recorded QA versions, 19 missing. No Docker/PostgreSQL binaries available for clean isolated schema. QA branch-A AR 50/50m, AP 50/25m, payment allocations AR 10m/AP 5m, inventory movements 0; SO/PO/AR/AP parent orphan counts zero; QA dataset 13 customers, 4 suppliers, 2 materials, 102 SO, 6 PO, 150 deliveries, 200 payments and 200 earning events. Worker `invoice_eligible_sources` denied 42501; admin RSC permission error streams generic page at HTTP 200 with no invoice headings. QA transaction read-only UPDATE denied 25006; application QA project ref matched with e-invoice disabled. Optimized build/typecheck PASS, 69 routes. Invoice list HTTP 100 samples at concurrency 5: p50 645ms, p95 733ms, p99 866ms, cold 1169ms; purchase list p50 641ms, p95 677ms, p99 754ms, cold 641ms; zero errors, local arm64 Node 24, QA DB region ap-northeast-2, warm HTTP server response, not click-to-useful, dataset below expanded scale. Owner UI has one h1/main, labelled fields and named links on both list pages.
- reused_evidence: IMP-134..141 focused domain checks. No full suite rerun and no live provider/device results invented.
- checks: DOC:NEW PASS scope mapping; DB:NEW PASS QA read-only reconciliation; SEC:NEW PASS worker RPC and QA write fence, HTTP status semantics PARTIAL; UI:NEW PASS lists, PDF invalid input FAIL; PERF:NEW PARTIAL representative tiny dataset; TYPECHECK/BUILD:REUSED IMP-141; MIG:BLOCKED clean rehearsal and ledger drift; BACKUP/RESTORE:NOT_RUN; EXT:NOT_RUN.
- result: R11-05/06 downgraded to PARTIAL by NEW_GAP-03. R12-01 PARTIAL, R12-02 BLOCKED, R12-03/04 PARTIAL, R12-05 prepared but not approvable, R12-06 LOCKED, R12-07 NOT_RUN, R12-08 BLOCKED. Do not label R12/goal complete or accept release.
- blocker: Legacy Production dataset unverified; clean local runtime absent; QA migration ledger drift; populated invoice review/PDF and input handling; full backup/restore, expanded perf, external provider/legal/device and separate Owner Production approval.
- production_impact: NOT_TOUCHED.

## IMP-143 — Targeted partial closure (2026-09-21)

- scope: Correct malformed invoice-review PDF input handling and rerun the focused route gate; rehearse the full migration sequence in a separate QA PostgreSQL database without changing the primary QA schema.
- gap_ids: NEW_GAP-03 FIXED (invalid UUID now 400; valid absent UUID 404). NEW_GAP-02 remains OPEN: primary QA ledger is missing 19 versions and was not blindly repaired.
- changed_paths: `src/app/api/invoices/[id]/review/pdf/route.ts`, `tasks.md`, `implementation.md`, `RELEASE_APPROVAL.md`.
- new_evidence: QA guard PASS. Owner QA requests returned 400 for `not-a-uuid` and 404 for a syntactically valid absent UUID; no SQL 22P02. Typecheck and optimized build PASS, 69 routes. A separate temporary database within the QA project, bootstrapped with minimal `auth.users`/`auth.uid()` stubs, applied all 41 migrations from zero and was dropped. This is PostgreSQL schema-order evidence, not a complete Supabase Auth/Storage environment. Two synthetic database-clone attempts were denied with 55006 because of pooler sessions; both temporary databases were dropped, and no full backup/restore PASS is claimed.
- reused_evidence: IMP-140/141 invoice domain/adjustment, IMP-142 QA reconciliation/permission/performance/write-fence results. No unrelated checks rerun.
- checks: DOC:NEW PASS scope mapping; UI/SEC:NEW PASS negative PDF route; TYPECHECK:NEW PASS; BUILD:NEW PASS; MIG:NEW PASS 41-file isolated SQL sequence, QA ledger still BLOCKED; BACKUP/RESTORE:NOT_RUN full system, synthetic clone FAIL; EXT:NOT_RUN.
- result: R11-05 and R11-06 implemented/gated to available provider-neutral boundary. R12-02 improved from BLOCKED to PARTIAL; R12-04 remains PARTIAL; R12-08 remains BLOCKED. Production release is not authorized.
- blocker: QA migration-ledger reconciliation, full Supabase rehearsal/backup-restore, actual legacy dataset inventory, populated invoice PDF acceptance, provider/legal/device decisions and explicit Production approval.
- production_impact: NOT_TOUCHED.

## IMP-144 — QA schema reconciliation and application recovery (2026-09-21)

- scope: Resolve the QA migration-history drift without replaying DDL; rehearse application schema/data backup and restore; exercise the populated invoice review-PDF generator without committing immutable financial fixtures.
- gap_ids: NEW_GAP-02 FIXED on QA. NEW_GAP-03 remains FIXED. R12-02 and R12-04 PASS only at their application-schema/data boundaries; human and managed-service gates remain explicit.
- changed_paths: `supabase/migrations/20260921221000_r10_message_scope.sql`, `src/modules/invoicing/invoice-review-pdf.test.ts`, `tasks.md`, `implementation.md`, `RELEASE_APPROVAL.md`.
- new_evidence: Direct TLS QA comparison against isolated 41-migration database: 1,448 columns, 905 constraints, 266 indexes, 27 views, 102 policies, 39 triggers and 97 RLS flags matched; 155 application functions matched after guarding the message-scope migration against duplicate `customers.read`. Clean schema and a synthetic customer/supplier snapshot cloned/restored successfully via direct connection. Official `supabase migration repair --status applied --db-url <guarded QA>` recorded the 19 previously manual versions; 41/41 local versions are now present in QA history. PostgreSQL 18 `pg_dump` via direct TLS produced an application archive (1,138,942 bytes; SHA-256 `df99207b9f9e963d72fde980afe2b88d0422974e13fd32c5f51db83c77ec802a`); `pg_restore` into an isolated QA database reconciled all 97 public tables by row count and AR 100,000,000 VND, AP 50,000,000 VND, payment 15,000,000 VND totals. The restore DB, archive and temporary tools were removed. QA PDF fixture preflight rolled back when immutable AR prevented deletion, so no synthetic finance row was committed. Focused route test created a real one-page PDF from mocked populated source data and passed malformed/absent ID cases (3/3); typecheck and optimized build PASS, 69 routes.
- reused_evidence: IMP-140/141 invoice business invariants; IMP-142 QA reconciliation, worker permission, 100-request list timings and write-fence check; unrelated suites were not rerun.
- checks: MIG:NEW PASS application schema and QA ledger; BACKUP/RESTORE:NEW PASS public/private application data, managed Auth/Storage/PITR NOT_RUN; DB:NEW PASS 97 table counts and financial totals; UNIT:NEW PASS 3/3 PDF cases; TYPECHECK/BUILD:NEW PASS; EXT/live-device:NOT_RUN.
- result: R11 provider-neutral implementation remains PASS at available boundary. R12-02/04 now PASS at application boundaries. R12-08 remains BLOCKED because full release approval requires independent human, managed-service and Production gates.
- blocker: Actual legacy Production inventory, provider/legal/tax/signing decision, live GPS/provider and expanded-scale UAT, managed Auth/Storage recovery and explicit Production authorization.
- production_impact: NOT_TOUCHED.

## IMP-145 — QA Auth/Storage data recovery extension (2026-09-21)

- scope: Extend R12-04 QA backup/restore rehearsal to Auth and Storage PostgreSQL schemas and private Storage object bytes; assess six Security Advisor read-view warnings without changing schema.
- gap_ids: GAP-23 PARTIAL. R12-04 remains PARTIAL overall pending managed-service/PITR recovery.
- changed_paths: `tasks.md`, `implementation.md`, `RELEASE_APPROVAL.md`. No application source or migration change.
- new_evidence: A first serial QA restore hit a 120-second client timeout and was discarded. A new 1,364,654-byte four-schema archive restored successfully with parallel workers into an isolated QA database. Counts and row-content hashes matched for `auth.users` 6, `auth.identities` 6, `storage.buckets` 3, `storage.objects` 4 and `public.customers` 13. Separately, all 4 private Storage objects (470,183 bytes) were backed up to restricted temporary files, restored into a unique QA bucket, and matched by SHA-256. Temporary database, bucket, archive, files and PostgreSQL tools were removed. Six Security Advisor `SECURITY DEFINER` read views have explicit branch-permission guards and no anon SELECT grant; all returned zero rows to authenticated role without a JWT, while a three-user sample saw PO rows only for an authorized multi-branch user. The QA dashboard reports no managed backups.
- reused_evidence: IMP-144 public/private 97-table reconciliation and QA migration ledger 41/41; IMP-142 representative small-dataset performance. No unrelated checks rerun.
- checks: BACKUP/RESTORE:NEW PASS QA PostgreSQL row data and Storage bytes; SEC:NEW PASS focused no-JWT/role sample, not exhaustive sign-off; managed Supabase backup/PITR and service-runtime recovery:NOT_RUN; R12-03 expanded-scale/per-role/accessibility:NOT_RUN.
- result: R12-04 QA data-recovery boundary advanced; R12-04 overall PARTIAL and R12-08 BLOCKED. No Production release acceptance.
- blocker: Managed platform backup/PITR/runtime rehearsal, legacy Production inventory, provider/legal decision, expanded-scale UAT and Owner release authorization.
- production_impact: NOT_TOUCHED.

## IMP-146 — Populated QA invoice PDF and role boundary (2026-09-21)

- scope: Close the populated review-PDF QA evidence gap and correct unauthorized PDF HTTP semantics; advance R12-03 multi-role route checks without claiming full UAT.
- gap_ids: NEW_GAP-04 CONFIRMED then FIXED: worker/customer PDF access returned 500 from an uncaught `AppError(FORBIDDEN)`; it now returns JSON 403 without PDF bytes. GAP-23 remains PARTIAL.
- changed_paths: `src/app/api/invoices/[id]/review/pdf/route.ts`, `src/modules/invoicing/invoice-review-pdf.test.ts`, `tasks.md`, `implementation.md`, `RELEASE_APPROVAL.md`.
- new_evidence: QA synthetic owner/sales/worker and customer OWNER/FINANCE_CONTACT/RECEIVER sessions produced 30/30 expected route-content visibility outcomes; denied Server Component pages still stream HTTP 200 and were not counted as HTTP 403. The existing `HXQA-SERVICE`/`HXQA-WORK` fixture passed a rollback preflight of start, submit, verify and draft creation with one 100,000 VND line. The same standard command chain was then committed on QA only, creating one service verification, one 100,000 VND AR obligation, and one DRAFT invoice with matching line total and active coverage. QA aggregate AR is now 100,100,000 VND, AP remains 50,000,000 VND; no provider issue was attempted. The Owner list contains the draft. The live PDF route returned 200 `application/pdf`, 304,155 bytes, one extracted page with QA customer, service source, quantity 10, 100,000 VND and explicit non-tax/non-e-invoice disclaimer; SHA-256 `6317ee35f7925b23cc156554d737f928a4656844907b3cb99d706d75b7e791ad`. After the route fix, Owner remained 200 PDF and worker/customer both returned JSON 403 `FORBIDDEN` with zero PDF bytes.
- reused_evidence: IMP-140/141 invoice source/coverage domain invariants; IMP-144 migration ledger and public/private recovery; IMP-145 QA Auth/Storage data restore. No unrelated suite rerun.
- checks: DB:NEW PASS rollback preflight and QA source/line/coverage reconciliation; UI:NEW PASS 30/30 route-content matrix and populated Owner invoice list; PDF:NEW PASS live one-page artifact; SEC:NEW PASS Owner 200 versus worker/customer 403; UNIT:NEW PASS 4/4 focused PDF cases; TYPECHECK:NEW PASS. Full accessibility, expanded-scale performance, immutable candidate and provider sandbox:NOT_RUN.
- result: Populated QA review-PDF and NEW_GAP-04 FIXED. R11 remains implemented to provider-neutral boundary. R12-03 PARTIAL and R12-08 BLOCKED.
- blocker: Expanded-scale and full-system UAT, managed Supabase backup/PITR, separately authorized Production legacy inventory, provider/legal decision and Owner release authorization.
- production_impact: NOT_TOUCHED.

## IMP-147 — Targeted QA accessibility and shared brand contrast (2026-09-21)

- scope: Advance R12-03 accessibility evidence for login, admin, work and customer screens; fix a shared admin-shell contrast defect without changing navigation or business flow.
- gap_ids: NEW_GAP-05 CONFIRMED then FIXED: `.brand span` overrode `.brand-mark`, producing #b9c8db text on white at 1.7:1 in five sampled admin role/route cases. GAP-23 remains PARTIAL.
- changed_paths: `src/app/globals.css`, `tasks.md`, `implementation.md`, `RELEASE_APPROVAL.md`.
- new_evidence: axe-core 4.13.0 was installed only in a temporary directory. Initial WCAG A/AA-tag scan covered admin/work/customer login (desktop/mobile) and seven authenticated surfaces (Owner dashboard/orders/invoices/access, Sales orders, worker work and customer orders). The five admin cases shared one serious `.brand-mark` contrast violation; the other five sampled surfaces had zero automated violations. CSS was narrowed to `.brand > div > span` so the subtitle retains its light color while `HX` uses #172c49 on white. Owner four admin desktop routes plus mobile dashboard and Sales orders were rerun: zero automated violations. Keyboard Tab samples on Owner orders and worker work visited eight visible controls each with solid 3px focus outlines. No screen-reader, 200% zoom, complete action-flow or representative-human UAT was claimed.
- reused_evidence: IMP-146 six-role DOM visibility matrix and populated invoice/PDF checks; unchanged login/work/customer automated scans were not rerun after the admin-only selector change.
- checks: UI/A11Y:NEW PASS for the sampled pages and affected contrast regression; DOC:NEW PASS scope mapping. Full WCAG/AT/zoom/touch/action UAT:NOT_RUN; PERF expanded scale:NOT_RUN.
- result: NEW_GAP-05 FIXED. R12-03 remains PARTIAL and R12-08 remains BLOCKED.
- blocker: Full accessibility/UAT, expanded-scale performance, managed platform backup/PITR, authorized legacy Production inventory, provider/legal decision and Owner release approval.
- production_impact: NOT_TOUCHED.

## IMP-148 — Bounded Orders list query plan (2026-09-21)

- scope: Advance R12-03 performance readiness by removing the unconditional all-orders line aggregate from `sales_order_read`; preserve its existing columns and derived-state behavior.
- gap_ids: GAP-23 PARTIAL; confirmed Orders list query-plan defect FIXED at QA schema boundary. Expanded-scale performance gate remains OPEN.
- changed_paths: `supabase/migrations/20260921233000_r12_order_list_perf.sql`, `implementation.md`.
- new_evidence: Guarded QA dry run listed exactly one pending migration; QA push applied it and recorded version `20260921233000`. The 102-row view retained the same ordered MD5 over order ID, fulfillment/payment states and total: `4c0c9766cf8b1cc841e8eeddfd93bf2b`. Before the change, `EXPLAIN ANALYZE` for a branch's first 25 Orders rows showed a whole-table `sales_order_lines` scan and aggregate before top-N sorting (3.987 ms on this small fixture). After the change it used `sales_orders_branch_created_id_idx` for the first 25 rows and per-order indexed line aggregates, without an all-lines scan (2.233 ms single sample). These single DB timings are plan evidence, not p95 or click-to-useful evidence.
- reused_evidence: IMP-142 small-data 100-request HTTP sample and IMP-146 role boundary; no unrelated regression rerun.
- checks: MIG:NEW PASS QA migration ledger and apply; DB:NEW PASS 102-row derived-state/total equivalence; PERF:NEW PASS bounded query-plan shape, expanded dataset/p95/p99 NOT_RUN.
- result: Orders list query-plan defect fixed on QA. R12-03 remains PARTIAL; R12-08 remains BLOCKED and release approval remains NOT_APPROVABLE.
- blocker: Expanded-scale performance and full-system UAT, managed backup/PITR, separately authorized legacy Production inventory, provider/legal/device decisions and Owner release authorization.
- production_impact: NOT_TOUCHED.

## IMP-149 — Targeted QA reflow and touch UAT (2026-09-21)

- scope: Advance R12-03 operational accessibility on real QA sessions without posting business commands.
- gap_ids: GAP-23 PARTIAL; no new defect confirmed in the sampled reflow/touch paths.
- changed_paths: `implementation.md`, `RELEASE_APPROVAL.md`.
- new_evidence: QA environment preflight matched project `ffrwiglcrlumfvhubaxg` with e-invoice disabled. Owner selected HXQA Branch A, then rendered Orders list, new Order, Invoices and Access at 640px and 320px CSS viewports (eight route/viewport combinations): each returned 200 with its actual page heading, had interactive controls, and had no document-level horizontal overflow. These widths approximate 200% and 400% reflow from a 1280px viewport; browser/text-only zoom and screen-reader behavior were not tested. At 390px with touch enabled, Owner new Order had no document overflow or interactive control outside the viewport; touch added a second line, removed it, and opened the inline Customer dialog while preserving `/admin/orders/new`. Worker `/work` and `/work/tracking` loaded their actual headings at 390px with no document overflow or interactive control outside the viewport. No business record was saved by this UAT.
- reused_evidence: IMP-146 six-role content-visibility matrix, IMP-147 automated contrast/keyboard samples, IMP-148 bounded Orders query plan. No unrelated suite rerun.
- checks: UI/A11Y:NEW PASS sampled reflow and touch interactions; full AT/browser zoom/representative action UAT:NOT_RUN; PERF expanded-scale:NOT_RUN.
- result: R12-03 remains PARTIAL. The sampled Owner/Worker surfaces improved release evidence but do not satisfy full accessibility or acceptance gates.
- blocker: Expanded-scale performance, full assistive-technology and representative-human UAT, managed backup/PITR, authorized legacy Production inventory, provider/legal/device decisions and Owner release approval.
- production_impact: NOT_TOUCHED.

## IMP-150 — Foreground GPS failure-state correction (2026-09-21)

- scope: Close confirmed client-side failure-state defects in R10 foreground GPS without changing GPS RPCs, assignment policy or production data.
- gap_ids: NEW_GAP-06 CONFIRMED then FIXED in source: permission denial message was overwritten by generic stop text; a failed stop was reported as successful and discarded the session ID; a failed start request could strand the start button in a disabled state. R10 live-device evidence remains PARTIAL.
- changed_paths: `src/components/routing/foreground-gps-control.tsx`, `src/components/routing/foreground-gps-control.test.tsx`, `implementation.md`.
- new_evidence: QA has zero active `delivery_assignments`, `gps_positions` and `gps_tracking_sessions`, so no real assignment/browser geolocation run was claimed. PostgreSQL `stop_gps_tracking` marks a session stopped only after its RPC succeeds; the client now retains the session ID and offers `Thử dừng GPS` when the stop HTTP request fails, while halting local `watchPosition`. Permission-denied text remains visible after a successful stop. Start/ping network failures lead to explicit recoverable states instead of an unhandled promise or permanently disabled start button. Focused JSDOM tests passed 3/3 for permission denial, stop failure/retry and start network failure; TypeScript typecheck passed. The first test run failed 2/3 because the new test file lacked explicit component cleanup; the harness was corrected and the rerun passed 3/3.
- reused_evidence: IMP-134/137 GPS authorization and role-scoped assignment SQL checks; no DB/GPS regression suite rerun.
- checks: UNIT:NEW PASS 3/3 after harness fix; TYPECHECK:NEW PASS; DB:REUSED for unchanged RPCs; real-device/browser GPS and provider sandbox:NOT_RUN.
- result: NEW_GAP-06 FIXED at client failure-state boundary. R10 remains implemented to available boundary, not live-device accepted; R12-03 and release gate remain PARTIAL/BLOCKED respectively.
- blocker: Active QA delivery assignment and physical-device foreground GPS UAT, provider sandbox, expanded-scale performance, managed recovery, Owner/provider/legal decisions and Production authorization.
- production_impact: NOT_TOUCHED.

## IMP-151 — QA browser GPS end-to-end fixture (2026-09-21)

- scope: Exercise R10 foreground GPS through real QA app/API/RPC and a synthetic delivery assignment, then verify that both explicit Stop and leaving the page stop the server session.
- gap_ids: R10-03 browser-emulated GPS evidence advanced; physical-device acceptance remains OPEN. No new application defect confirmed by the navigation-response timeout.
- changed_paths: `implementation.md` only. QA data changed through standard `save_catalog_record` and `assign_delivery` RPCs: vehicle `HXQA-GPS-UAT-01` and delivery `HXQA-DEL-HXQA-O8-9-1` assigned to `HXQA-WORKER`; two GPS sessions/positions were created and stopped. No direct SQL write or Production mutation.
- new_evidence: Before the fixture, QA had 75 synthetic PLANNED deliveries accessible to Worker but no active vehicle in that branch. Owner created a separate QA vehicle via the catalog RPC and assigned one synthetic delivery at version 1 via the delivery RPC. The Worker tracking page then displayed one active assignment. Chromium with an explicitly simulated QA location invoked `/api/gps/session/start`, `/ping` and `/stop`, all HTTP 200; PostgreSQL recorded one position and `STOPPED` status for the first session. A second start/ping followed by navigation away also ended in `STOPPED` with one position. Playwright did not observe the keepalive stop response after navigation, but direct QA session state confirmed server-side completion. No real location, customer message or provider call was sent.
- reused_evidence: IMP-134/137 GPS permission and assignment checks; IMP-150 client error-state unit 3/3 and typecheck. No unrelated suite rerun.
- checks: UI/API/DB:NEW PASS browser-emulated start/ping/explicit stop and navigation-stop state; SEC:REUSED Worker assignment scope; TYPECHECK:REUSED IMP-150; BUILD:NEW PASS optimized QA-configured build with 69 routes; real-device geolocation and route-provider sandbox:NOT_RUN.
- result: R10 browser GPS path has end-to-end QA evidence; R10 live-device/provider acceptance and R12-03 remain PARTIAL. Release is still NOT_APPROVABLE.
- blocker: Physical-device foreground/background UAT, live route-provider sandbox, expanded-scale performance, managed recovery, Owner/provider/legal decisions and Production authorization.
- production_impact: NOT_TOUCHED.

## IMP-152 — Bounded Purchase Orders list query plan (2026-09-21)

- scope: Advance R12-03 expanded-scale readiness by moving `purchase_order_read` total-cost derivation from a whole-table line aggregate to a per-selected-PO aggregate, without changing price visibility or view columns.
- gap_ids: GAP-23 PARTIAL; confirmed Purchase Orders list query-plan defect FIXED at QA schema boundary. Expanded-scale p95/p99 gate remains OPEN.
- changed_paths: `supabase/migrations/20260921234000_r12_purchase_list_perf.sql`, `implementation.md`.
- new_evidence: Guarded QA dry run listed only this migration, and QA push applied version `20260921234000`. The view retained `security_invoker=true`. Before and after, authenticated Owner saw 6/6 priced POs with identical ordered SHA-256 over `id,total_cost_vnd`: `187ee3f8e089703854a757a3de8a0e6a4019cdd57b46b4cbfa17517eac0a63bf`. The original plan scanned and aggregated all 12 `purchase_order_lines` before sorting the selected branch. After migration, `EXPLAIN ANALYZE` under a real Owner JWT with `purchasing.price.read=true` used `purchase_orders_branch_created_idx` and two per-PO indexed line aggregates for the two selected rows. A no-JWT SQL plan did not execute cost aggregates at all. Single-plan timings on six QA POs are not p95/p99 evidence.
- reused_evidence: IMP-142 small-dataset PO HTTP sample and IMP-148 analogous Orders list plan correction; no unrelated regression rerun.
- checks: MIG:NEW PASS QA migration/ledger; DB:NEW PASS Owner price equivalence; SEC:NEW PASS view invoker option and Owner permission-bound result; PERF:NEW PASS bounded plan shape, expanded-scale p95/p99 NOT_RUN.
- result: Purchase Orders list query-plan defect fixed on QA. R12-03 remains PARTIAL; release approval remains NOT_APPROVABLE.
- blocker: Representative expanded dataset/network/client measurements, full multi-role UAT, managed recovery, separately authorized legacy Production inventory, provider/legal/device decisions and Owner release authorization.
- production_impact: NOT_TOUCHED.

## IMP-153 — Bounded AR/AP balances and page navigation (2026-09-21)

- scope: Remove cross-branch whole-table balance aggregates and exact-count work from the AR/AP core lists while preserving canonical financial row values, role security and filter/URL behavior.
- gap_ids: NEW_GAP-07 CONFIRMED then FIXED at QA/source boundary: `receivable_read` and `payable_read` aggregated all adjustments/allocations before branch paging, and both pages requested an exact count of derived outstanding balances on every visit. GAP-23 expanded-scale release gate remains PARTIAL.
- changed_paths: `supabase/migrations/20260921235000_r12_finance_list_perf.sql`, `src/app/admin/receivables/page.tsx`, `src/app/admin/payables/page.tsx`, `src/components/ui/list-pager.tsx`, `src/components/ui/list-pager.test.tsx`, `implementation.md`.
- new_evidence: Guarded QA dry run listed only version `20260921235000`, then QA push applied it. Authenticated Owner full-row SHA-256 remained identical before/after for all 101 receivables (`1e0a0d95493fef42ec685f2ca94656b6d8393c87923ec0dd39a53051b71318f8`) and 100 payables (`eeedbb9275d7a5d5247bb403599eec6e0b79028c96c98caed0cfc9aebfef25c3`); both views retained `security_invoker=true`. Owner-JWT `EXPLAIN ANALYZE` showed branch/due index scans and exactly 25 per-obligation balance aggregates for each first-page query, instead of whole-table adjustment/allocation aggregates. The exact-count query still computed all 51/50 branch obligations, so the UI now requests 26 rows without count and renders 25, using the extra row only for `hasNext`; it does not claim a total. QA browser Owner pagination reconciled AR `25+25+1=51` and AP `25+25=50` against DB outstanding counts, with correct last-page navigation and no payment write. Pager URL/filter tests passed 2/2, typecheck passed, and QA-configured optimized build passed with 69 routes.
- reused_evidence: IMP-142 QA write fence and small-data HTTP timing, IMP-144 financial restore/reconciliation, IMP-152 PO plan; no unrelated full regression rerun.
- checks: MIG:NEW PASS; DB:NEW PASS full-row financial equivalence; SEC:NEW PASS retained invoker option and Owner-JWT view evaluation; UI:NEW PASS AR/AP page navigation; UNIT:NEW PASS 2/2 pager cases; TYPECHECK:NEW PASS; BUILD:NEW PASS 69 routes; PERF:NEW PASS bounded plan shape only, expanded-scale p95/p99 NOT_RUN.
- result: NEW_GAP-07 FIXED at QA/source boundary. R12-03 remains PARTIAL and release remains NOT_APPROVABLE.
- blocker: Representative 200k AR/AP and full expanded dataset performance under recorded client/network conditions, full multi-role/assistive-technology UAT, managed recovery, authorized legacy Production inventory, provider/legal/device decisions and Owner release authorization.
- production_impact: NOT_TOUCHED.

## IMP-154 — Indexed Deliveries list paths (2026-09-21)

- scope: Advance R12-03 delivery-list scale readiness for the specified 150k-delivery dataset without altering delivery behavior or navigation.
- gap_ids: NEW_GAP-08 CONFIRMED then FIXED at QA schema boundary: the branch-scoped Deliveries list sorted by `created_at DESC, id DESC` but had no matching index, and its optional execution-state filter had no matching sorted index. GAP-23 expanded-scale release gate remains PARTIAL.
- changed_paths: `supabase/migrations/20260921235500_r12_delivery_list_indexes.sql`, `implementation.md`.
- new_evidence: Guarded QA dry run listed only version `20260921235500`; QA push applied it. The existing active-assignment partial unique index was reused and no view/UI code changed. Authenticated Owner ordered SHA-256 over all 150 delivery IDs, execution states, vehicle IDs and created times remained `6be86294d696cc6bf0eaf0183e75be196993c1ae35f82b574ac7efdc75b71500`. Before the migration, the list plan scanned 75 branch deliveries and sorted to get 25. After it, unfiltered and `PLANNED` filtered plans each used their respective branch/sort index and read 25 delivery rows without an explicit sort. Single small-fixture plan timings are not expanded-scale p95/p99 evidence.
- reused_evidence: IMP-137/151 scoped worker assignment and GPS checks; IMP-142 small-data QA timing. No unrelated regression rerun.
- checks: MIG:NEW PASS QA migration/ledger; DB:NEW PASS 150-row view equivalence; PERF:NEW PASS indexed bounded plan shape, expanded 150k-delivery p95/p99 NOT_RUN.
- result: NEW_GAP-08 FIXED at QA/schema boundary. R12-03 remains PARTIAL and release remains NOT_APPROVABLE.
- blocker: Expanded dataset and recorded client/network p95/p99, full UAT, managed recovery, authorized legacy Production inventory, provider/legal/device decisions and Owner release authorization.
- production_impact: NOT_TOUCHED.

## IMP-155 — Bounded Expenses list with deep-link focus (2026-09-21)

- scope: Remove the unbounded Operating Expenses fetch before R12-03's required 100k-expense scale, while keeping create/approve commands and the existing focus highlight usable.
- gap_ids: NEW_GAP-09 CONFIRMED then FIXED at QA/source boundary: `/admin/expenses` fetched every `expense_read` row in a branch without a limit, cursor/page or deterministic secondary sort. GAP-23 expanded-scale release gate remains PARTIAL.
- changed_paths: `src/app/admin/expenses/page.tsx`, `supabase/migrations/20260921235900_r12_expense_list_indexes.sql`, `implementation.md`.
- new_evidence: Expense list now performs server-side search on number/category/supplier/description, approval-state filtering, deterministic `effective_at DESC, id DESC` ordering, and a 26-row sentinel request rendering 25 rows with URL-state pagination. A valid `focus` ID outside the page uses one additional bounded lookup and is visibly pinned rather than silently lost; management option queries no longer run for read-only users. Guarded QA dry run listed only migration `20260921235900`, and QA push applied both branch/sort indexes. `EXPLAIN ANALYZE` for unfiltered and DRAFT-filtered pages used the matching indexes and read 25 expense rows. QA Owner browser showed 25+25=50 branch expenses, one result for exact-number search, zero APPROVED results, and one pinned focused row outside page 1. No expense or AP command ran. Typecheck passed and QA-configured optimized build passed with 69 routes.
- reused_evidence: IMP-153 sentinel pager behavior and URL tests; existing expense approval/AP domain checks. No unrelated full suite rerun.
- checks: MIG:NEW PASS; UI:NEW PASS QA pagination/search/filter/focus; TYPECHECK:NEW PASS; BUILD:NEW PASS 69 routes; PERF:NEW PASS bounded plan shape, 100k-expense p95/p99 NOT_RUN.
- result: NEW_GAP-09 FIXED at QA/source boundary. R12-03 remains PARTIAL; release remains NOT_APPROVABLE.
- blocker: Expanded 100k-expense measurement and form-option scale, full multi-role UAT, managed recovery, authorized legacy Production inventory, provider/legal/device decisions and Owner release authorization.
- production_impact: NOT_TOUCHED.

### IMP-156 — R12 bounded commercial/service location lookup (2026-09-21)

- scope: R12-03 representative-data usability and bounded form lookup; no Production release.
- gap_ids: NEW_GAP-10 (Sales form loaded all customers/sites and could truncate at scale) FIXED; NEW_GAP-11 (ServiceJob creation capped customers at 200 and all branch sites at 300) FIXED for customer/site selectors.
- changed_paths: `src/modules/sales/form-options.ts`, `src/modules/sales/form-lookup-actions.ts`, `src/components/sales/commercial-document-form.tsx`, `src/app/admin/orders/new/page.tsx`, `src/app/admin/quotations/new/page.tsx`, `src/app/admin/orders/[id]/edit/page.tsx`, `src/app/admin/quotations/[id]/edit/page.tsx`, `supabase/migrations/20260922000500_r12_sales_lookup_indexes.sql`, `src/app/admin/service-jobs/page.tsx`, `src/modules/workforce/form-lookup-actions.ts`, `src/components/workforce/service-job-location-fields.tsx`.
- new_evidence: QA-only sales lookup migration applied and indexed; Owner Order URL prefill selected both customer/site (6 customer and 3 site options); Owner Quote customer/site search PASS (3/3 bounded options); Sales Order own-branch lookup PASS and cross-branch customer absent; Owner ServiceJob customer/site search, selection preservation, and cross-branch absence PASS. ServiceJob initial customer lookup is 25, site lookup is per selected customer and 25. No ServiceJob was created by these checks.
- reused_evidence: IMP-148 through IMP-155 QA list-query and targeted performance evidence remains valid for unaffected inputs.
- checks: `UNIT/TYPECHECK:NEW PASS` (`npm run typecheck`); `UI:NEW PASS` (targeted QA Playwright Order, Quote, ServiceJob); `SEC:NEW PASS` (Sales and ServiceJob cross-branch lookup); `BUILD:NEW PASS` (`npm run build`); `PERF:NOT_RUN` for expanded-data lookup p95/p99; `GATE:BLOCKED` for full R12.
- result: Sales and ServiceJob customer/site lookup defects fixed; R12-03 remains PARTIAL and R12-08 remains BLOCKED. Employee/vehicle/machine selectors in ServiceJob still have a 200-option cap and need separate scale disposition; no claim of full R12 completion.
- blocker: representative full UAT/AT, expanded-dataset p95/p99, managed backup/PITR evidence, physical-device GPS/provider sandbox, R11 legal/provider decision, immutable release candidate, and Owner-gated Production steps remain open under their existing gates.
- production_impact: NOT_TOUCHED; QA schema migration only, no Production deployment, DML, cutover, invoice issue, or customer messaging.

### IMP-157 — ServiceJob resource lookup completion (2026-09-21)

- scope: close the remaining 200-option cap on optional employee, vehicle, and machine selectors in ServiceJob creation.
- gap_ids: NEW_GAP-11 implementation closure extended to all five ServiceJob selectors; QA evidence for populated machine lookup remains partial because the QA branch has no active machine fixture.
- changed_paths: `src/modules/workforce/form-lookup-actions.ts`, `src/components/workforce/service-job-resource-field.tsx`, `src/app/admin/service-jobs/page.tsx`.
- new_evidence: employee/vehicle/machine initial options are branch-scoped and bounded to 25; each has server-side search bounded to 25 and preserves the selected option. Owner QA browser found and selected an employee and vehicle. No active machine fixture exists in the tested QA branch; no machine result was fabricated.
- reused_evidence: IMP-156 customer/site lookup and cross-branch checks remain valid; no related contract/schema input changed.
- checks: `UNIT/TYPECHECK:NEW PASS`; `UI:NEW PASS` for populated employee and vehicle; `UI:BLOCKED` for populated machine fixture; `BUILD:NEW PASS`; `PERF:NOT_RUN` for expanded-data lookup p95/p99.
- result: 200-option resource cap removed in source; R12-03 remains PARTIAL and full R12 gate remains BLOCKED. IMP-156's note about the still-present 200-option cap is superseded by this entry.
- blocker: representative machine fixture and external R12 gates recorded in IMP-156; Production permission and Owner approval are not implied.
- production_impact: NOT_TOUCHED.

### IMP-158 — R12 expanded QA lookup and Customer list evidence (2026-09-21)

- scope: targeted R12-03 expanded-data checks for the newly bounded Sales/ServiceJob selectors and Customer list; this is not the full-system performance gate.
- gap_ids: NEW_GAP-10 and NEW_GAP-11 QA scale evidence strengthened; IMP-157 populated-machine UI evidence gap closed.
- changed_paths: no application/source change in this batch; QA-only deterministic synthetic rows added using guarded database connection. Added 10,000 `HXQA-SC*` customers split across branches, 20,000 `HXQA-SS*` sites, 500 `HXQA-WIDE*` sites for one Branch B customer, and one active `HXQA-SCALE-MACHINE` in Branch A. QA size was 22 MB before the scale insert and 31 MB after the first 30,000 rows; subsequent 501 rows remain within the configured QA capacity guard. Existing business rows were not edited.
- new_evidence: local production-mode Next build bound to QA; 100 browser action samples, Sales customer search among 10,013 total customers: 0 errors, p50 1339 ms, p95 1348 ms, p99 1351 ms; initial Order form had 26 customer options including placeholder. 100 browser action samples, Sales site search for a customer with 502 sites: 0 errors, p50 828 ms, p95 841 ms, p99 1346 ms; initial site options 26 including placeholder. 100 full browser navigation samples, Customer list with 10,013 customers: 0 errors, 25 rows/page, p50 939 ms, p95 1074 ms, p99 1312 ms. ServiceJob QA UI found a customer outside the initial set and a site beyond the first 25. Active machine QA fixture could be found/selected in Branch A and was absent under Branch B context. The initial mixed-branch performance attempt stopped on Branch B customers under Branch A context; targeted inspection showed correct branch isolation, so those samples were excluded and the 100-sample same-branch run was performed instead.
- reused_evidence: IMP-156/157 typecheck, build, Sales and ServiceJob functional/branch checks remain valid; no related source changed in this batch.
- checks: `PERF:NEW PASS` only for the three stated QA browser scenarios; `UI:NEW PASS` for wide-site ServiceJob lookup and populated machine; `SEC:NEW PASS` for Branch A machine hidden from Branch B; `FULL_R12_GATE:NOT_RUN`.
- result: targeted lookup-scale and Customer list evidence advanced R12-03, which remains PARTIAL. Measurements are single-user local-browser/QA-region warm-path observations; no concurrency, cold-cache reset, complete operational lifecycle, full representative dataset across every module, human task-duration UAT, or assistive-technology signoff is implied.
- blocker: remaining R12 external/human gates and unmeasured workflows remain as recorded previously. Managed backup/PITR and Production legacy inventory still require their separate boundaries; R12-08 remains BLOCKED.
- production_impact: NOT_TOUCHED; QA fixture DML only, no Production deployment, migration, DML, or cutover.

### IMP-159 — ServiceJob form label association (2026-09-21)

- scope: R12-03 targeted accessibility regression on the recently changed Order, Quote, and ServiceJob forms.
- gap_ids: NEW_GAP-12 (six visible ServiceJob creation labels lacked programmatic association with their inputs) CONFIRMED and FIXED.
- changed_paths: `src/app/admin/service-jobs/page.tsx`.
- new_evidence: QA production-mode browser check found no unnamed visible controls in Order/Quote creation; ServiceJob initially had six unnamed controls (`serviceType`, `description`, `scheduledStart`, `scheduledEnd`, `plannedQuantity`, `unitLabel`). Each now has a unique `id` and associated `htmlFor`; targeted browser recheck found exactly one label for all six. After async site loading completed, keyboard focus traversed customer search input, search button, customer select, then site search input in DOM order. The earlier focus-order mismatch during loading was caused by temporarily disabled search buttons, not a keyboard trap.
- reused_evidence: IMP-158 QA scale/branch/performance observations remain valid; labels did not alter query or permission inputs.
- checks: `BUILD:NEW PASS`; `UI/ACCESSIBILITY:NEW PASS` for targeted label and keyboard checks; `AT:NOT_RUN` (no screen-reader or human assistive-technology signoff); full R12 accessibility sweep not claimed.
- result: named ServiceJob controls fixed; R12-03 remains PARTIAL and R12-08 remains BLOCKED.
- blocker: representative assistive-technology/human UAT and other R12 gates remain open.
- production_impact: NOT_TOUCHED.

### IMP-160 — R12 Order-scale and narrow-viewport action evidence (2026-09-21)

- scope: R12-03 expanded-data performance and targeted reflow/action coverage; no Production change.
- gap_ids: R12-03 PARTIAL evidence strengthened; no new application defect confirmed in this batch.
- changed_paths: `tasks.md`, `implementation.md`; QA-only synthetic fixtures added, no application/source edit.
- new_evidence: guarded QA insert added 20,000 deterministic `HXQA-SCALE-O*` DRAFT sales orders and 100,000 five-line rows, split across Branch A/B and linked to the previously added scale customers/sites. QA database was about 73 MB after insertion, below the configured capacity guard; `ANALYZE` refreshed QA planner statistics. Combined QA dataset: 10,013 customers, 20,523 sites, 20,102 sales orders, 100,500 sales-order lines. Local production-mode Next build bound to QA: Order list 100 full browser navigations, 0 errors, 25 rows/page, p50 1288 ms, p95 1433 ms, p99 1566 ms; five-line Order detail near end of the scale set, 100 navigations, 0 errors, p50 844 ms, p95 908 ms, p99 1232 ms. Success required HTTP 200 plus actual row/document content, not a shell-only response. At 320 px and 640 px, Order, Quote and ServiceJob creation pages had no document-level or search-row horizontal overflow. At 320 px, Order add/remove line changed material selector count 1→2→1, retained quantity `17` while quick-create customer dialog opened, and remained on the same route; no document was saved by this check.
- reused_evidence: IMP-158 Sales lookup and Customer list scale timings; IMP-159 ServiceJob label/keyboard fix; unaffected QA role and branch evidence from IMP-156/157.
- checks: `PERF:NEW PASS` for the two stated Order QA scenarios; `UI/REFLOW:NEW PASS` for the three stated pages at 320/640 px; `UI/ACTION:NEW PASS` for narrow Order line/quick-create no-save flow; `FULL_R12_GATE:NOT_RUN`.
- result: targeted expanded-data performance and mobile action coverage advanced, but R12-03 remains PARTIAL. These are single-user QA/local-browser warm-path measurements, not cold-cache/concurrent/full-system proof; no human assistive-technology or complete cross-module UAT is implied.
- blocker: remaining R12 external/human gates and unmeasured cross-domain scenarios unchanged; R12-08 remains BLOCKED.
- production_impact: NOT_TOUCHED; QA synthetic DML and QA planner statistics only.

### IMP-161 — R12 Delivery list exact-count bottleneck (2026-09-21)

- scope: R12-03 expanded-data Delivery list performance and pagination correctness; no Production change.
- gap_ids: NEW_GAP-13 (Delivery list exact count on `delivery_read` under RLS caused an avoidable slow everyday list request) CONFIRMED and FIXED.
- changed_paths: `src/app/admin/deliveries/page.tsx`, `implementation.md`; QA-only deterministic delivery fixtures added, no schema migration.
- new_evidence: guarded QA insertion added 30,000 synthetic Delivery headers linked to the 20,000 scale Sales Orders; QA database reached about 89 MB and `ANALYZE public.deliveries` refreshed planner statistics. These rows are list-scale fixtures, not completed delivery lifecycle facts. Before fix, 100 full QA browser navigations to Delivery page returned 25 rows with 0 errors but p50 1743 ms, p95 2588 ms, p99 3602 ms. Direct QA SQL plan for branch-scoped page used `deliveries_branch_created_id_idx` and executed in about 0.3 ms; direct count about 6.6 ms. Owner-authenticated Supabase/RLS 20-sample comparison isolated the cost: Delivery page query without exact count p95 176 ms, with exact count p95 1337 ms (Order view comparators p95 147/916 ms). The page now fetches one extra row, displays only the page-local row count, and uses `hasNext` without claiming an exact total. After fix, 100 full QA browser navigations returned 25 rows with 0 errors: p50 707 ms, p95 743 ms, p99 876 ms. Filtered `PLANNED` page 2 navigation preserved `state=PLANNED&page=2` and showed 25 rows. An initial test asserted URL immediately after a client-side click and was invalid; the focused retry waited for navigation and passed. Build including TypeScript passed.
- reused_evidence: IMP-154 Delivery index and branch/sort evidence; IMP-160 Order-scale QA data and performance evidence remain valid.
- checks: `BUILD:NEW PASS`; `PERF:NEW PASS` for the stated 100-sample Delivery QA list scenario; `UI:NEW PASS` for bounded rows and filtered pagination; no full-system performance claim.
- result: confirmed Delivery list bottleneck fixed on QA. R12-03 remains PARTIAL because representative cross-domain lifecycle, concurrency, human AT/UAT and full-system gates are not complete; R12-08 remains BLOCKED.
- blocker: external R12 gates unchanged; synthetic Delivery headers do not prove actual/accepted/billable correctness.
- production_impact: NOT_TOUCHED; QA fixture DML only, no Production deployment, schema mutation or cutover.

### IMP-162 — R12 expanded AR/AP list and fixture reconciliation (2026-09-21)

- scope: R12-03 representative finance-list performance and synthetic opening-balance integrity on QA; no Production change.
- gap_ids: R12-03 PARTIAL evidence strengthened; no new application defect confirmed in this batch.
- changed_paths: `implementation.md`; QA-only deterministic opening-balance sources and obligations added, no application/schema edit.
- new_evidence: guarded QA insertion added 10,000 receivable and 10,000 payable opening-balance sources plus matching obligations, split across Branch A/B and linked to existing QA scale customers/sites/suppliers. No payment, allocation, invoice issue or revenue was created. QA database was about 102 MB after insertion and planner statistics were refreshed. Owner-authenticated local production-mode QA browser: Receivables list 100 navigations, 0 errors, 25 rows/page, p50 701 ms, p95 763 ms, p99 939 ms; Payables list 100 navigations, 0 errors, 25 rows/page, p50 697 ms, p95 720 ms, p99 728 ms. Focused QA reconciliation of the new fixtures: AR 10,000 obligations, original and outstanding 10,000,000,000 VND, 0 source/customer/site orphans; AP 10,000 obligations, original and outstanding 5,000,000,000 VND, 0 source/supplier orphans.
- reused_evidence: IMP-153 bounded AR/AP query implementation and earlier QA role/security checks; IMP-160/161 customer, Order and Delivery scale observations remain valid for unaffected inputs.
- checks: `PERF:NEW PASS` only for the two stated AR/AP QA list scenarios; `DB:NEW PASS` for the stated fixture count/sum/orphan reconciliation; `FULL_R12_GATE:NOT_RUN`.
- result: finance-list scale evidence advanced R12-03, which remains PARTIAL. These are synthetic opening balances and single-user warm-path browser observations, not full operational lifecycle, concurrency, real-provider, human UAT or Production evidence.
- blocker: remaining R12 external/human gates and unmeasured modules unchanged; R12-08 remains BLOCKED.
- production_impact: NOT_TOUCHED; QA fixture DML and QA planner statistics only.

### IMP-163 — R12 ServiceJob list scale and invalid state filter (2026-09-21)

- scope: R12-03 expanded-data ServiceJob list performance and state-filter correctness; no Production change.
- gap_ids: NEW_GAP-14 (ServiceJob filter exposed `PLANNED`/`CLAIMED`, which are invalid for `service_jobs.execution_state`) CONFIRMED and FIXED; NEW_GAP-15 (default ServiceJob list joined and counted the full branch before pagination) CONFIRMED and FIXED for the default/state-filtered path.
- changed_paths: `src/app/admin/service-jobs/page.tsx`, `tasks.md`, `implementation.md`; QA-only synthetic ServiceJob fixtures added, no schema migration.
- new_evidence: guarded QA insert added 10,000 `SCHEDULED` ServiceJob headers linked to the scale customers/sites across Branch A/B; no WorkLog, verification, billable or earning facts were fabricated. QA database was about 105 MB and planner statistics refreshed. Before fix, 100 full Owner browser navigations yielded 25 rows with 0 errors but p50 3010 ms, p95 3562 ms, p99 4561 ms. Owner-authenticated Supabase/RLS samples showed full `service_job_read` p95 1475 ms without exact count and 2625 ms with exact count; option lookups were only about 139–194 ms p95 each. Direct SQL plan for the view paged after joining about 5,001 branch jobs to 10,013 customers and 20,523 sites. A QA-only trial selecting 26 base IDs then reading display details for 25 IDs had combined p95 607 ms. The implemented default/state path now uses that bounded two-step read; search retains the original field coverage without exact count, and both paths use a 26-row sentinel. Database constraint/default confirmed allowed states `SCHEDULED`, `IN_PROGRESS`, `RESULT_SUBMITTED`, `VERIFIED`, `CANCELLED`; the UI filter now uses exactly those states and human-readable labels. Targeted QA UI showed 25 rows, filtered `SCHEDULED` page 2 preserving URL state, one search result for a scale customer, and the correct displayed status label. After fix, 100 full Owner browser navigations to the default list had 0 errors, p50 1095 ms, p95 1220 ms, p99 1376 ms; 100 customer-name search navigations had 0 errors, p50 1860 ms, p95 1978 ms, p99 2352 ms.
- reused_evidence: IMP-156/157 ServiceJob bounded form lookup and branch checks; IMP-160–162 QA scale, finance and Delivery observations remain valid for unaffected inputs.
- checks: `BUILD:NEW PASS`; `UI:NEW PASS` for default/filter/page-2/search/state label; `PERF:NEW PASS` only for the two stated ServiceJob QA scenarios; `FULL_R12_GATE:NOT_RUN`.
- result: confirmed ServiceJob default-list bottleneck and invalid filter fixed on QA. Customer-name search p95 is close to the ordinary-interaction target and p99 remains above it; no broad performance claim is made. R12-03 remains PARTIAL and R12-08 remains BLOCKED.
- blocker: representative WorkItem/verification lifecycle, concurrency, assistive-technology/human UAT and external R12 gates remain open.
- production_impact: NOT_TOUCHED; QA fixture DML and planner statistics only.

### IMP-164 — ServiceJob denied-role content after list query change (2026-09-21)

- scope: targeted invalidated multi-role security/UX check for R12-03 ServiceJob list; no Production change.
- gap_ids: NEW_GAP-16 (a Worker without `service.read` saw the generic app error boundary rather than an explicit denial) CONFIRMED and FIXED locally for the ServiceJob page.
- changed_paths: `src/app/admin/service-jobs/page.tsx`, `implementation.md`.
- new_evidence: Owner Branch A search returned only Branch A job `HXQA-SCALE-J9998` and not Branch B job `HXQA-SCALE-J9999`; after selecting Branch B the inverse held. Worker had no ServiceJob rows, but before fix the page displayed generic “Đã có lỗi xảy ra”. The page now catches only `AppError(FORBIDDEN)` from `requireInternalPermission("service.read")` and renders an explicit accessible denial; other errors still propagate. Targeted QA browser recheck: Owner 25 rows, Worker denial text present and 0 rows. The HTML page response remains 200; this check proves role-safe content and clear denial, not an HTTP 403 status. The first post-edit build exposed a nullable-context TypeScript error, fixed by capturing the validated `branchId`; the subsequent optimized build passed. One Playwright selector initially matched Next's route announcer as well as the denial section; the focused selector retry passed.
- reused_evidence: IMP-163 ServiceJob list/search/performance and filter evidence remains valid; the permission guard itself and RLS were not weakened.
- checks: `BUILD:NEW PASS`; `SEC/UI:NEW PASS` for Owner A/B isolation and Worker denied content; `HTTP_403:NOT_CLAIMED`; full multi-role UAT not rerun.
- result: local ServiceJob authorization UX defect fixed; R12-03 remains PARTIAL and R12-08 remains BLOCKED.
- blocker: complete multi-role human UAT, assistive-technology signoff, remaining module-scale profiles and external R12 gates are still open.
- production_impact: NOT_TOUCHED.

### IMP-165 — R12 Purchase Order scale and CLOSED filter (2026-09-21)

- scope: R12-03 Purchase Order list scale, multi-line aggregate display and state-filter coverage; no Production change.
- gap_ids: NEW_GAP-17 (PO filter omitted valid `CLOSED` state) CONFIRMED and FIXED.
- changed_paths: `src/app/admin/purchase-orders/page.tsx`, `tasks.md`, `implementation.md`; QA-only synthetic PO/line fixtures added, no schema migration.
- new_evidence: guarded QA insert added 10,000 DRAFT `CUSTOMER_SITE` Purchase Orders with 50,000 lines, correct branch-specific supplier/customer/site links and five 500,000 VND lines per PO. QA database was about 127 MB and planner statistics refreshed. This fixture did not create receipt, supplier fulfillment or AP. Owner-authenticated local production-mode QA browser measured 100 full PO list navigations with 0 errors, 25 rows/page, p50 1211 ms, p95 1509 ms, p99 1701 ms; a five-line PO displayed 2,500,000 VND. Database schema and `purchaseStateLabel` support `CLOSED` with label “Đã hoàn tất”, but the UI filter omitted it. After adding the option, QA browser showed the correct option and selected URL state; the `CLOSED` query displayed the empty state because QA contains no CLOSED PO, while DRAFT search by a scale PO code returned exactly one row and its 2,500,000 VND total. No CLOSED PO was fabricated solely to make the filter pass. Optimized build including TypeScript passed.
- reused_evidence: IMP-152 per-PO total/index QA evidence remains valid; earlier role/price-redaction checks remain valid because the selected fields and permission branch were not changed.
- checks: `BUILD:NEW PASS`; `PERF:NEW PASS` for the stated Owner PO list scenario; `UI:NEW PASS` for filter option/empty state and multi-line total; populated CLOSED-result UAT remains NOT_RUN.
- result: PO list scale and missing state option addressed on QA; R12-03 remains PARTIAL and R12-08 remains BLOCKED.
- blocker: full PO fulfillment lifecycle, populated CLOSED-state UAT, cross-domain concurrency, human AT/UAT and external R12 gates remain open.
- production_impact: NOT_TOUCHED; QA fixture DML and planner statistics only.

### IMP-166 — R12 Supplier and Quotation list scale (2026-09-21)

- scope: R12-03 expanded-data Supplier/Quotation list performance, search/pagination and quotation state-filter coverage; no Production change.
- gap_ids: NEW_GAP-18 (Quotation exact count under RLS used most of the available list latency) CONFIRMED and FIXED with a 26-row sentinel; NEW_GAP-19 (Quotation filter omitted valid `EXPIRED` revision state) CONFIRMED and FIXED. No new Supplier defect confirmed.
- changed_paths: `src/app/admin/quotations/page.tsx`, `tasks.md`, `implementation.md`; QA-only deterministic Supplier and Quotation fixtures added, no schema migration.
- new_evidence: guarded QA insert added 10,000 branch-scoped suppliers; QA database reached about 130 MB. Owner browser Supplier list: 100 full navigations, 0 errors, 25 rows/page, p50 1229 ms, p95 1332 ms, p99 1534 ms; search by a supplier near the end of the fixture returned exactly one row and active-filter pagination linked to `state=ACTIVE&page=2`. A second guarded QA transaction added 10,000 DRAFT quotations, 10,000 current revisions and 50,000 lines, with five 1,000,000 VND lines and a matching 5,000,000 VND revision total per quotation; QA database reached about 153 MB and planner statistics were refreshed. No quote was sent or accepted. Before fix, Quotation list 100 full Owner browser navigations had 0 errors, 25 rows/page, p50 1840 ms, p95 1947 ms, p99 2400 ms; search by a scale quotation returned one row with the 5,000,000 VND total. Owner-authenticated Supabase/RLS comparison (20 samples each) showed Quotation page query p95 873 ms without exact count versus 2369 ms with exact count. The page now fetches one extra row, shows only page-local count, and uses `hasNext`; filter includes schema-valid `EXPIRED`. Targeted QA UI retained DRAFT page-2 filter, 25 rows/page, exact scale quote search/total, and EXPIRED option/URL state. No EXPIRED quotation was fabricated solely to exercise a populated result. After fix, 100 full Owner browser navigations had 0 errors, 25 rows/page, p50 1255 ms, p95 1453 ms, p99 1611 ms. Optimized build including TypeScript passed.
- reused_evidence: earlier branch and quotation multi-line source checks remain valid; this batch changed list query/pagination and state option only.
- checks: `BUILD:NEW PASS`; `PERF:NEW PASS` for the stated Supplier and Quotation QA list scenarios; `UI:NEW PASS` for search/pagination/visible totals and EXPIRED option; populated EXPIRED-result UAT remains NOT_RUN; `FULL_R12_GATE:NOT_RUN`.
- result: Supplier scale evidence and Quotation list bottleneck/filter closure advanced R12-03, which remains PARTIAL; R12-08 remains BLOCKED. Synthetic DRAFT revisions do not prove quotation send/accept lifecycle.
- blocker: complete cross-domain performance/concurrency, populated EXPIRED-state UAT, human AT/UAT and external R12 gates remain open.
- production_impact: NOT_TOUCHED; QA fixture DML and planner statistics only.
## IMP-167 — R12-03 QA Expense scale/list evidence (2026-09-21)

- scope: Expense bounded-list and server-side search at representative synthetic QA scale; no Production access.
- gap_ids: R12-03 performance/operational UX evidence only; R12-03 remains PARTIAL.
- changed_paths: `implementation.md`; QA-only synthetic `public.expenses` rows (20,000 DRAFT rows, deterministic `HXQA-SCALE-E*` numbers, total draft amount 200,000,000 VND).
- new_evidence: QA ref `ffrwiglcrlumfvhubaxg`; database grew from 153 MB to 163 MB; local optimized Next server, Owner browser, 100 list navigations at `/admin/expenses?page=1`: p95 1,230 ms, p99 1,270 ms, 0 non-200 responses; 30 search navigations with `q=HXQA-SCALE-E`: p95 1,815 ms, p99 1,872 ms, 0 non-200 responses. Visible rows used `src/app/admin/expenses/page.tsx` and contained the synthetic expense code.
- reused_evidence: IMP-155 bounded Expense list/search implementation.
- checks: PERF:NEW PASS for these sampled single-user QA paths; no concurrency or full-system claim.
- result: Expense list and search meet the measured representative interaction target; R12-03 gate remains PARTIAL.
- blocker: Remaining cross-domain UAT/AT, concurrency and full-system release evidence; external human/provider/Production gates unchanged.
- production_impact: NOT_TOUCHED.

## IMP-168 — R12-03 Reports/CSV permission and scale evidence (2026-09-21)

- scope: Three fixed Reports on QA synthetic finance scale; CSV export authorization defect. No Production access.
- gap_ids: `NEW_GAP-20260921-01` FIXED (P1, Reports CSV permission response); R12-03 remains PARTIAL.
- contract_refs: R12-03 security/acceptance gate and Reports permission/export contract.
- source_evidence: `src/app/api/reports/export/route.ts` called `requireInternalPermission` without mapping `AppError`, causing Worker-denied export to return HTTP 500 rather than 403; the route now returns the structured AppError body/status.
- user_impact: Denied users received an apparent server failure instead of an accurate forbidden response; no unauthorized CSV data was returned.
- changed_paths: `src/app/api/reports/export/route.ts`, `implementation.md`.
- new_evidence: local optimized Next build and TypeScript PASS; Owner QA export HTTP 200, 100 receivable rows; Worker QA export HTTP 403 with `FORBIDDEN` after fix. Before fix Worker received HTTP 500 for all three report exports. Owner exports were HTTP 200 with 100 AR rows, 100 AP rows, and 0 approved Expense rows; totals matched on-screen values. Ten Owner browser navigations per report at QA scale: AR p95 2,382 ms, AP p95 944 ms, Expense p95 979 ms; each reported quality READY. Synthetic Expense fixtures are DRAFT and did not enter the approved expense total.
- reused_evidence: IMP-167 QA scale fixture and prior branch-scoped finance data.
- checks: BUILD:NEW PASS; SEC:NEW PASS for Owner/Worker AR export boundary; PERF:NEW PASS for the ten-sample report paths, not a concurrency or full-system claim.
- result: `NEW_GAP-20260921-01` fixed; R12-03 remains PARTIAL.
- blocker: Cross-domain UAT/AT, concurrency/full-system checks, external human/provider and Production-specific gates unchanged.
- production_impact: NOT_TOUCHED.

## IMP-169 — R12-03 concurrent Orders list fix (2026-09-21)

- scope: Four concurrent read-only Owner QA paths on the optimized local build: Orders, Quotations, Expenses, AR Report; 30 navigations per path.
- gap_ids: `NEW_GAP-20260921-02` FIXED (P1, Orders list performance/reliability under concurrent reads); R12-03 remains PARTIAL.
- contract_refs: Core-list bounded-query contract and R12-03 representative performance/security gate.
- source_evidence: `src/app/admin/orders/page.tsx` previously used exact count on `sales_order_read`; `supabase/migrations/20260921233000_r12_order_list_perf.sql` shows row-level derived fulfillment/payment/total subqueries. Under four readers, the old path had p95 7,377 ms and one failed request (>20,000 ms), with an Orders query error in the server log. The page now selects at most 26 branch-scoped IDs from indexed `sales_orders`, then hydrates only 25 visible IDs through `sales_order_read`, preserving deterministic order and filters.
- user_impact: Orders could exceed the UX ceiling or fail under moderate concurrent reading.
- changed_paths: `src/app/admin/orders/page.tsx`, `implementation.md`.
- new_evidence: optimized Next build and TypeScript PASS. Page 1 and page 2 each display 25 rows with expected next/previous navigation; exact-order-code search returns the matching row. After the two-stage query, four concurrent readers (30 navigations each) reported Orders p95 1,198 ms/p99 1,760 ms, Quotations p95 2,029 ms/p99 2,385 ms, Expenses p95 1,756 ms/p99 1,941 ms, and AR Report p95 1,262 ms/p99 1,702 ms; 0 failed/non-200 navigations.
- reused_evidence: IMP-167 and IMP-168 QA scale/report baselines; previously applied branch/sort indexes.
- checks: BUILD:NEW PASS; UI:NEW PASS for Orders pagination/search; PERF:NEW PASS for these four-reader QA paths. This is not full-system load certification.
- result: `NEW_GAP-20260921-02` fixed; R12-03 remains PARTIAL.
- blocker: Remaining cross-domain operational UAT/AT and full-system release/security evidence; human/provider/Production gates unchanged.
- production_impact: NOT_TOUCHED.

## IMP-170 — R12-03 Reports customer filter at QA scale (2026-09-21)

- scope: Reports customer filter on QA branches with 5,005 active customers each; no Production access.
- gap_ids: `NEW_GAP-20260921-03` FIXED (P1, Reports customer discoverability beyond the first 200); R12-03 remains PARTIAL.
- contract_refs: Reports shared-filter contract and R12-03 operational UX/performance gate.
- source_evidence: `src/app/admin/reports/page.tsx` previously loaded the first 200 customer options only, making later customers unselectable. It now performs branch-scoped server-side name search with a 25-option limit, fetches the currently selected customer separately, and clears an inaccessible cross-branch selection before report/export filters are formed.
- user_impact: Finance users could not filter reports to most customers in a large branch.
- changed_paths: `src/app/admin/reports/page.tsx`, `implementation.md`.
- new_evidence: optimized Next build/TypeScript PASS. QA Owner found the branch's 500th alphabetical customer (`HXQA Scale Customer 00988`) among 6 options for a specific name search, selected it, retained that UUID in the report and CSV link, and saw an out-of-branch customer UUID cleared from both selector and export link. Thirty browser navigations of the searched AR report: p95 3,248 ms, p99 6,366 ms, 0 non-200 responses.
- reused_evidence: IMP-168 Reports source/CSV checks and IMP-169 QA scale/concurrency baseline.
- checks: BUILD:NEW PASS; UI:NEW PASS for lookup/selection persistence; SEC:NEW PASS for cross-branch selection exclusion; PERF:NEW PARTIAL because p99 of this combined search-plus-AR-report path exceeds 5 seconds, though no sample reached the 10-second absolute ceiling.
- result: Customer discoverability gap fixed; R12-03 performance/full-system gate remains PARTIAL.
- blocker: Remaining representative cross-domain UAT/AT and performance/full-system release evidence; human/provider/Production gates unchanged.
- production_impact: NOT_TOUCHED.

## IMP-171 — R12-03 customer portal Data API column boundary (2026-09-21)

- scope: Customer portal access to `customers` through Supabase Data API; QA only. No Production access or deployment.
- gap_ids: `NEW_GAP-20260921-04` CONFIRMED then FIXED_IN_SOURCE_AND_QA (P0, internal customer note disclosure); R12-03 remains PARTIAL.
- contract_refs: Customer portal customer-safe data boundary, backend RLS/permission contract, R12-03 SEC gate.
- source_evidence: `customers_select` in `supabase/migrations/20260912101030_identity_access.sql` allowed any active portal membership to select the full base row, including `internal_note`. Before the fix, QA Finance, Receiver, and other-customer accounts could directly select their own row and receive the `HXQA-INTERNAL-SECRET` sentinel. Cross-customer rows were denied. `supabase/migrations/20260922000600_r12_customer_portal_customer_boundary.sql` removes the membership arm of that base-table policy and adds an explicit membership-checked, name-only RPC. `src/lib/access/context.ts` now uses that RPC for the real name required by quotation acceptance.
- user_impact: A customer portal account could read its customer's internal notes through PostgREST even though the UI and snapshot RPC did not show them.
- changed_paths: `supabase/migrations/20260922000600_r12_customer_portal_customer_boundary.sql`, `src/lib/access/context.ts`, `scripts/qa/uat.mjs`, `implementation.md`.
- new_evidence: The migration DDL was applied transactionally to QA ref `ffrwiglcrlumfvhubaxg`. Afterward, the three portal roles saw 0 direct `customers` rows; each received only its own name from `customer_portal_display_name` and null for the other customer. Owner and Sales retained their internal table reads. Optimized Next build/TypeScript PASS. Finance, Receiver, and other-customer portal home/profile/quotation list/detail/orders/debts routes rendered without the internal sentinel; cross-customer quotation HTML did not contain the other customer's quote number or name, although Next returned HTTP 200 HTML for the denied route. A persistent UAT regression assertion was added but the full `uat.mjs` script was not run because its artifact path invokes git.
- reused_evidence: Prior portal RPC snapshot/role checks; QA baseline customer sentinel as positive control.
- additional_evidence: QA direct `customer_sites` reads returned a row to Owner/Sales and 0 rows to Finance, Receiver, and other-customer after the policy change. Six authenticated-readable `security_barrier` views without `security_invoker` were inspected in current QA: each definition explicitly gates branch rows by `private.has_permission` and masks cost columns by the corresponding price/cost permission. Owner had a nonzero PO-line cost positive control; Sales and three portal roles got 0 rows from the sampled PO-line cost view. `customer_portal_display_name(uuid)` has `EXECUTE` for `authenticated` and not for `anon`.
- checks: SEC:NEW PASS for direct Data API and name-only RPC boundary; UI:NEW PASS for the sampled portal routes; BUILD:NEW PASS; UAT regression check: ADDED, NOT_RUN as a suite.
- result: P0 source and QA boundary fixed. Production remains unmodified and must not be claimed remediated there.
- blocker: Owner-authorized Production deployment/migration, remaining human UAT and full-system release evidence.
- production_impact: NOT_TOUCHED.

## IMP-172 — R12-03 technical multi-role UAT rerun (2026-09-21)

- scope: Existing `scripts/qa/uat.mjs` against QA ref `ffrwiglcrlumfvhubaxg` and local optimized Next server; no Production access.
- gap_ids: R12-03 technical UAT evidence improved; human UAT/full field-level audit remain PARTIAL.
- changed_paths: `scripts/qa/uat.mjs`, `implementation.md`; QA-only synthetic `work_items` and `work_item_assignments` rows for `HXQA-UAT-WORK-CURRENT-20260921`.
- new_evidence: Added an explicit QA guard and `HX_QA_NO_ARTIFACT=1` mode so this technical suite can run without invoking git. First run: 11/12 checks PASS, `worker-portal-assigned-job` FAIL because the original `HXQA assigned work` fixture had already reached `VERIFIED` and the worker snapshot correctly returned no current job. Created a separate QA `CLAIMED` work item and active assignment on an unlinked scheduled Service Job, preserving the verified record. Targeted Worker portal displayed the new title and RPC returned its ID. Second suite run: 12/12 checks PASS, including the customer internal-note Data API regression, role scope, finance denial, worker portal, revoke, and shared-device logout.
- reused_evidence: IMP-171 Data API/security boundary and existing QA persona credentials.
- checks: UAT-TECHNICAL:NEW PASS (12/12 on current QA); SEC:NEW PASS; UI:NEW PASS. `humanUat=NOT_RUN`; recovery email delivery, broad field-level payload audit, and full human journeys are not proven. The suite's current `uncovered` array omits broad field-level audit prematurely and must not be treated as a complete gap inventory.
- result: R12-03 remains PARTIAL despite all technical suite checks passing.
- blocker: Human UAT, recovery-email delivery, full-system/field-level gate; new Worker fixture currently lives only in QA and is not yet part of reproducible fixture source.
- production_impact: NOT_TOUCHED.

## IMP-173 — R12-03 portal price-override metadata boundary (2026-09-21)

- scope: QA Data API access to quotation/Sales Order line metadata, customer quotation page/PDF, and customer order detail; no Production access.
- gap_ids: `NEW_GAP-20260921-05` CONFIRMED then FIXED_IN_SOURCE_AND_QA (P0, internal price-override metadata disclosure); R12-03 remains PARTIAL.
- contract_refs: Customer portal customer-safe payload, manual price reason/internal metadata boundary, R12-03 SEC and operational UAT gate.
- source_evidence: A metadata-driven QA probe of 47 sensitive-named public fields found portal Finance, Receiver, and other-customer roles could read non-null `override_reason` from both `quotation_lines` and `sales_order_lines`. Those rows also carried `override_by` and pricing rule metadata. `supabase/migrations/20260922000700_r12_portal_line_projection.sql` now limits base-line SELECT to internal `quotation.read`/`orders.read` permission and grants a membership-checked `customer_safe_quotation_lines` RPC returning only six customer-safe fields. `src/app/customer/quotations/[id]/page.tsx` and `src/app/api/quotation-revisions/[id]/pdf/route.ts` use that projection instead of the base table.
- user_impact: A portal user could query internal manual-price reasoning and related pricing metadata for its own commercial documents through PostgREST.
- changed_paths: `supabase/migrations/20260922000700_r12_portal_line_projection.sql`, `src/app/customer/quotations/[id]/page.tsx`, `src/app/api/quotation-revisions/[id]/pdf/route.ts`, `scripts/qa/uat.mjs`, `implementation.md`.
- new_evidence: DDL applied transactionally to QA ref `ffrwiglcrlumfvhubaxg`. Owner retained non-null override positive controls in both line tables; all three portal roles then received 0 direct rows, an own-customer RPC array with only `id`, material, quantity, UOM, unit price, and total, and 42501 for cross-customer RPC. `anon` has no RPC execute grant. Optimized build/TypeScript PASS. Owner and three portal roles rendered their own quotation detail with a line and downloaded valid `%PDF-` files; portal cross-customer PDFs returned 404. Finance, Receiver, and other-customer order-detail HTML showed their own order and did not contain an actual override reason; cross-customer HTML showed neither the other order number nor its reason. Existing technical UAT ran 13/13 PASS, including the new regression check; human UAT remains NOT_RUN.
- reused_evidence: IMP-171/172 portal role and Data API boundary; unaffected fields from the 47-field QA probe were not rerun individually after only the two line policies changed.
- checks: SEC:NEW PASS for direct line denial/safe RPC/cross-customer/anon grant; UI:NEW PASS for quote/order detail; PDF:NEW PASS; BUILD:NEW PASS; UAT-TECHNICAL:NEW PASS (13/13). This named-field scan is not a semantic audit of every payload field.
- result: P0 source and QA boundary fixed; R12-03/full release gate remains PARTIAL.
- blocker: Production remains unmodified; human UAT, recovery-email delivery, complete semantic payload review and release evidence remain.
- production_impact: NOT_TOUCHED.

## IMP-174 — R12-03 customer portal RPC semantic payload sample (2026-09-21)

- scope: QA-only `customer_portal_snapshot` and `customer_portal_order` response shape for Finance, Receiver, and other-customer personas.
- gap_ids: R12-03 customer-safe payload evidence improved; full field-level audit remains PARTIAL.
- changed_paths: `implementation.md` only.
- new_evidence: Each persona received its own snapshot and order, while the other customer's order RPC returned 42501. Recursive response-key inspection found no `internal`, `cost`, `margin`, `payroll`, `supplier`, `override`, pricing-rule/source, salary, wage, or commission keys; the QA internal sentinel was absent. Receiver had `can_view_debt=false` and `can_view_finance=false`; Finance and other-customer finance contacts retained their permitted financial context.
- reused_evidence: IMP-171 base customer boundary, IMP-173 line projection, and existing QA portal persona fixtures.
- checks: SEC:NEW PASS for these two RPCs and three personas; no all-endpoint or Production claim.
- result: Sampled customer portal RPC semantic boundary passes; R12-03 remains PARTIAL.
- blocker: Remaining portal/API payload surfaces, human UAT, recovery-email delivery, release/Production gates.
- production_impact: NOT_TOUCHED.

## IMP-175 — R12-03 QA Storage evidence upload/signing (2026-09-21)

- scope: QA-only private `portal-evidence` bucket, Worker `WORK_RESULT` and Finance Contact `PAYMENT_NOTICE` evidence; no Production access or real customer file.
- gap_ids: R12-03 Storage upload/signing evidence improved; signed-URL expiry and human offline retry remain PARTIAL/NOT_RUN.
- changed_paths: `scripts/qa/storage.mjs`, `implementation.md`; QA-only synthetic `portal_evidence_objects` and Storage objects.
- new_evidence: A 68-byte synthetic PNG uploaded/finalized for Worker and Finance Contact. Worker retry with the same operation ID returned the same evidence ID; signed endpoint returned 307, downloaded bytes matched SHA-256, and Finance could not sign Worker evidence (403). Finance Contact could sign its own Payment Notice evidence; Receiver and other-customer upload attempts were rejected (400) and signing was denied (403). Both evidence metadata rows were `READY`, declared/final sizes matched, checksum format was valid, and private Storage objects existed. The existing targeted `scripts/qa/storage.mjs` gained an explicit QA guard, no-git report mode, current Worker fixture, and a bounded mode that records expiry as NOT_RUN rather than waiting 70 seconds. That suite then reported PASS for PNG/JPEG/PDF upload and idempotent retry, private signed read, public-read denial, membership revoke, Worker evidence boundary, and rejection of SVG, forged JPEG, and oversized PNG; overall status correctly remained PARTIAL.
- reused_evidence: IMP-172 current QA Worker assignment and IMP-171 portal membership/security boundary.
- checks: EXT:NEW PARTIAL (signed URL creation/download PASS; 60-second expiry NOT_RUN); IDEM:NEW PASS; SEC:NEW PASS for tested role/public/revoke boundaries; MIME/SIZE:NEW PASS; human offline retry: NOT_RUN.
- result: QA Storage upload/signing available-boundary checks pass, but R12-03 remains PARTIAL.
- blocker: Signed URL expiry wait and device/network offline retry not executed; human UAT, recovery email, full-system/Production gates remain.
- production_impact: NOT_TOUCHED.

## IMP-176 — R12-03 short-TTL signed URL expiry probe (2026-09-21)

- scope: QA-only Supabase Storage signed URL for existing Finance Contact Payment Notice evidence.
- gap_ids: R12-03 signed-URL expiry evidence improved; application endpoint 60-second expiry and device offline retry remain PARTIAL/NOT_RUN.
- changed_paths: `implementation.md` only; no QA data mutation.
- new_evidence: A signed URL issued directly by the QA Storage client with TTL 3 seconds returned HTTP 200 immediately and HTTP 400 after a 5-second bounded wait. The URL/token was not printed or stored.
- reused_evidence: IMP-175 evidence object integrity, role boundary, and application signed endpoint checks.
- checks: EXT:NEW PASS for QA Storage provider short-TTL expiry; application 60-second URL expiry: NOT_RUN; device offline retry: NOT_RUN.
- result: Provider expiry behavior demonstrated without a long wait; R12-03 remains PARTIAL.
- blocker: Human offline/device UAT, endpoint-specific 60-second expiry rehearsal, recovery email and release gates.
- production_impact: NOT_TOUCHED.

## IMP-177 — R12-03 browser-simulated offline upload/retry (2026-09-21)

- scope: QA Worker proof upload and Finance Contact Payment Notice forms under Playwright browser offline/online transitions; no Production access or real payment.
- gap_ids: `NEW_GAP-20260921-06` FIXED (P2, raw English network error in portal offline UX); R12-03 human field-device UAT remains PARTIAL.
- contract_refs: Portal safe-draft/offline retry UX, Payment Notice does not post AR, R12-03 operational UAT gate.
- source_evidence: `src/components/portal/work-result-draft-form.tsx` and `src/components/portal/payment-notice-form.tsx` previously displayed the browser's raw `Failed to fetch` message. Both now show Vietnamese retry guidance on network failure without changing operation-ID handling or local draft contents.
- changed_paths: `src/components/portal/work-result-draft-form.tsx`, `src/components/portal/payment-notice-form.tsx`, `implementation.md`; QA-only Worker fixture transitioned from CLAIMED to IN_PROGRESS and synthetic evidence/Payment Notice rows were added.
- new_evidence: On QA, Worker browser offline upload failed while preserving the serialized work draft/operation ID and selected file; online retry created exactly one additional `READY` evidence object, with the work item still IN_PROGRESS and no result submitted. After the UI text change, Worker and Finance browser offline submissions showed Vietnamese connection/retry guidance; Worker draft remained identical, and Finance amount/file remained in the form. Finance online retry created exactly one synthetic `SUBMITTED` Payment Notice (`HXQA-OFFLINE-26909aaf`); customer portal outstanding debt before/after was identical. Optimized Next build and TypeScript PASS.
- reused_evidence: IMP-175 Storage integrity/idempotency and IMP-176 short-TTL provider expiry.
- checks: UI:NEW PASS for browser-simulated offline message and retry; IDEM:NEW PASS for the observed single evidence/notice outcome; FIN:NEW PASS for unchanged AR; BUILD:NEW PASS. Human offline retry on a physical device: NOT_RUN.
- result: QA browser offline/retry path and localized error UX pass; R12-03 remains PARTIAL.
- blocker: Physical-device/human field UAT, endpoint-specific 60-second expiry, recovery email, and release gates.
- production_impact: NOT_TOUCHED.

### IMP-178 — QA recovery-email delivery boundary
- scope: R12-03 recovery-email delivery evidence.
- gap_ids: R12-03.
- changed_paths: implementation.md only.
- new_evidence: QA guard passed; owner, sales, worker, finance, receiver, and other_customer QA identities all use the reserved `example.test` domain. No recovery email was requested or sent. These identities cannot establish delivery to an Owner-controlled inbox.
- reused_evidence: IMP-177 technical UAT and QA offline/retry evidence; no related input changed.
- checks: DOC:NEW PASS (recipient-domain inspection only); EXT:BLOCKED (real inbox delivery not exercised).
- result: PARTIAL. Recovery-email delivery remains a human/external gate, not a passing QA check.
- blocker: an explicitly controlled non-Production recipient and observable mail delivery are required. Do not substitute an API acceptance response for delivered-mail evidence.
- production_impact: NOT_TOUCHED.

### IMP-179 — QA recovery-email delivery observed
- scope: R12-03 recovery-email delivery evidence, superseding the delivery blocker in IMP-178.
- gap_ids: R12-03.
- changed_paths: implementation.md only; one QA Auth fixture was created.
- new_evidence: QA guard passed; a new confirmed QA Auth user with a unique plus-address alias of the connected Owner-controlled Gmail inbox was created. Supabase Auth accepted one password-recovery request for that exact alias. The connected Gmail inbox then returned message `1a0c3f5f17d574b0` addressed to the alias, from `noreply@mail.app.supabase.io`, subject `Reset your password`, timestamp 2026-09-21T12:34:29Z. No recovery link was opened, no password was changed, and no customer address was used.
- reused_evidence: IMP-177 technical UAT and QA offline/retry evidence; no related source input changed.
- checks: EXT:NEW PASS (QA recovery email observed in recipient inbox); recovery-link redemption: NOT_RUN; full human journey: NOT_RUN.
- result: PARTIAL. Email delivery gate is satisfied on QA, but R12-03 still requires the remaining human/device and release-readiness evidence.
- blocker: physical-device human UAT and separately authorized release gates remain.
- production_impact: NOT_TOUCHED.

### IMP-180 — QA recovery link redeemed end to end
- scope: R12-03 password-recovery technical journey for the QA-only Auth fixture from IMP-179.
- gap_ids: R12-03.
- changed_paths: implementation.md only; QA Auth fixture password changed to a generated one-time random value.
- new_evidence: the delivered message's recovery link targeted `ffrwiglcrlumfvhubaxg.supabase.co/auth/v1/verify` with `type=recovery` and redirect `http://localhost:3000`. QA Auth returned HTTP 303 to localhost with a recovery session; `setSession` succeeded, `updateUser` changed the fixture password, and sign-in with the new password succeeded. The token and password were not logged. An initial local stdin attempt failed before any QA Auth request; the successful no-echo retry consumed the link once.
- reused_evidence: IMP-179 recipient-inbox delivery evidence.
- checks: EXT:NEW PASS (mailbox delivery, recovery link, password update, subsequent login); physical-device human UAT: NOT_RUN.
- result: PARTIAL. The QA recovery journey is technically complete, but R12-03 and later release gates still require independent human/device evidence and authorization.
- blocker: physical-device human UAT and separately authorized release gates remain.
- production_impact: NOT_TOUCHED.

### IMP-181 — QA recovery request UI observed
- scope: R12-03 local QA recovery-request screen.
- gap_ids: R12-03.
- changed_paths: implementation.md only.
- new_evidence: QA-guarded local Next server opened `/login`, whose `Quên mật khẩu?` link navigated to `/recovery?surface=admin`. Submitting the synthetic `hxqa-other_customer@example.test` fixture displayed the neutral Vietnamese confirmation `Nếu tài khoản hợp lệ, hướng dẫn khôi phục sẽ được gửi.` The browser tab was closed and the local QA server stopped. This UI check did not use or transmit an Owner/customer real email address or open a recovery token in the browser.
- reused_evidence: IMP-179 mailbox delivery and IMP-180 QA Auth token redemption/password-update evidence.
- checks: UI:NEW PASS (request-form navigation and neutral response); UI link-redemption journey: NOT_RUN; physical-device human UAT: NOT_RUN.
- result: PARTIAL. The request screen works for a synthetic QA fixture; remaining UI/device and release gates are not inferred from this check.
- blocker: physical-device human UAT and separately authorized release gates remain.
- production_impact: NOT_TOUCHED.

### IMP-182 — QA Storage signed-URL endpoint expiry
- scope: R12-03 Storage upload/signing targeted check at the endpoint's full expiry interval.
- gap_ids: R12-03.
- changed_paths: implementation.md only; QA Storage evidence fixtures created by the existing guarded check.
- new_evidence: `HX_QA_NO_ARTIFACT=1 node --env-file=.env.qa.local scripts/qa/storage.mjs` returned `status: PASS` and `signedUrlExpiry: PASS` against the guarded local QA app. PNG, JPEG, PDF and Worker evidence uploads passed; SVG, forged JPEG and oversized PNG were rejected as expected. The first invocation failed with `fetch failed` because the local app server was stopped; after starting the guarded QA server, the rerun passed. The server was stopped afterward.
- reused_evidence: IMP-175 upload/signing checks, IMP-176 short-TTL provider check, IMP-177 browser offline/retry simulation; no relevant source input changed.
- checks: EXT:NEW PASS (endpoint signed-URL expiry after full TTL); Storage upload/signing: RERUN PASS; humanOfflineRetry: NOT_RUN.
- result: PARTIAL. Storage technical checks now include exact endpoint expiry, but physical-device human offline/retry remains outside this check.
- blocker: physical-device human UAT and separately authorized release gates remain.
- production_impact: NOT_TOUCHED.

### IMP-183 - UAT coverage declaration corrected
- scope: R12-03 technical UAT reporting; no application behavior changed.
- gap_ids: R12-03.
- changed_paths: scripts/qa/uat.mjs, implementation.md.
- new_evidence: QA read-only catalog inspection confirmed the Worker UAT ID is a `work_items` row linked to a scale `service_jobs` row and `work_item_assignments`; this fixture is not reproducibly seeded by the current UAT script. The UAT report now explicitly lists `field-level-payload-audit` and `worker-fixture-seeding` as uncovered, alongside recovery-email delivery and full human journeys. The recovery-email delivery and redemption were demonstrated separately in IMP-179/IMP-180, not by this UAT script.
- reused_evidence: IMP-174 limited portal payload/field audit, IMP-180 QA recovery, IMP-182 Storage expiry; these do not prove the new uncovered items.
- checks: DB:NEW PASS (read-only fixture/schema inspection); UAT rerun: NOT_RUN; broad field-level audit: NOT_RUN.
- result: PARTIAL. Coverage is reported honestly; no new audit or fixture seed is claimed.
- blocker: clean-rehearsal fixture setup, broad field-level payload audit, and physical-device human UAT remain.
- production_impact: NOT_TOUCHED.

### IMP-184 - QA portal field audit and Worker fixture implementation
- scope: R12-03 customer-portal field audit and reproducible Worker UAT fixture.
- gap_ids: R12-03.
- changed_paths: scripts/qa/portal-field-audit.mjs, scripts/qa/ensure-worker-uat.mjs, scripts/qa/uat.mjs, implementation.md.
- new_evidence: QA pre-edit read-only audit probed 52 named restricted columns across three portal personas (156 Data API probes). No restricted column returned a row; 5 expense/expense_read statement timeouts were rechecked against a real QA expense ID and returned 0 rows. Own customer snapshot/order/quotation-line RPCs showed no forbidden keys; quotation lines contained only six customer-safe fields; cross-customer order and quotation-line RPCs returned 42501. A QA-only fixture helper now reuses an active assigned Work Item or creates a new Service Job, Work Item, and append-only assignment from the Worker's active branch and an active Customer/Site.
- reused_evidence: IMP-173 and IMP-174 portal boundary checks, IMP-179/IMP-180 recovery evidence, IMP-182 Storage expiry.
- checks: SEC:NEW PASS (bounded QA sample and RPC observations before edit); UAT seed after edit: NOT_RUN; standalone audit script after edit: NOT_RUN; full human UAT: NOT_RUN.
- result: PARTIAL. The new scripts are implemented but not yet behavior-validated; the security result covers named fields and sampled QA data, not every future value or endpoint.
- blocker: focused execution of new QA scripts and physical-device human UAT remain; provider/release human gates are unchanged.
- production_impact: NOT_TOUCHED.

### IMP-185 - QA scripts validated and Reports customer-search latency fixed
- scope: R12-03 technical closure for IMP-184 and Reports customer-search performance.
- gap_ids: R12-03; Reports customer-search performance observation from IMP-170.
- changed_paths: src/app/api/reports/customers/route.ts, src/components/report-customer-filter.tsx, src/app/admin/reports/page.tsx, scripts/qa/portal-field-audit.mjs, implementation.md.
- implementation: Report customer search now calls a permission-checked, branch-scoped endpoint returning at most 25 active customers in deterministic name/ID order. Searching preserves the selected customer and date filters without rerunning the report. Late responses from older search terms are ignored. The field-audit runner explicitly records primary-key sample fallback for known statement-timeout cases, including sales_order_lines.
- new_evidence: Worker fixture helper returned the same fixture ID across two calls and worker_portal_snapshot selected that fixture. Technical UAT passed 13/13. Standalone portal audit passed its declared QA sample scope: 52 named columns, 156 role/column probes, 138 no-row responses, 18 denied responses, 9 primary-key fallbacks, no exposure or unresolved result; own/cross-customer RPC checks passed. Wide-query timeouts are not represented as successful full-table scans.
- performance_evidence: 40 QA customer-search endpoint samples measured p95 1023 ms and p99 1176 ms. Thirty QA receivables report navigations on the final optimized build measured p95 881 ms and p99 1045 ms. These are observations, not a duplicated performance contract or whole-system release certification; Spec.md remains the budget authority.
- ui_evidence: customer beyond the first 200 was found; searching made no report-page request; an empty subsequent search preserved the selected customer; late old response was ignored; running the report and CSV export preserved the customer/date filters. Portal lookup was denied with HTTP 403; payables lookup was denied with HTTP 403.
- checks: BUILD/TypeScript:NEW PASS; targeted ESLint:NEW PASS; UAT:RERUN 13/13 PASS; SEC:NEW PASS in declared QA sample scope; PERF:NEW measurements above; UI:NEW PASS; Storage upload/signing:RERUN PASS, invalid files rejected as expected.
- reused_evidence: IMP-182 signed-URL expiry; IMP-177 offline/retry browser simulation. Recovery was not exercised in this batch, per Owner instruction.
- result: the new QA scripts are now executed and the measured Reports search regression is fixed. R12-03 overall remains PARTIAL for physical-device human UAT and the remaining release evidence. R11 provider decisions and Production authorization are not inferred from these results.
- blocker: physical-device human UAT, provider decisions/sandbox access, managed recovery and release/Owner gates remain as previously recorded.
- production_impact: NOT_TOUCHED; no deployment, reset-password action, commit, or push in this batch.

### IMP-186 - Conditional Production authorization and read-only inventory attempt (2026-09-22)
- scope: R12-01/R12-06 authorization delta and browser-only Production inspection.
- gap_ids: R12-01, R12-04, R12-05, R12-06.
- changed_paths: tasks.md; implementation.md.
- new evidence: Owner explicitly confirmed both Production read-only inventory and Production deployment/cutover after required gates pass. Supabase browser showed HienXaERPv2, project nbwynrwkdbtfsitafsxa, main PRODUCTION, organization FREE; overview displayed Unhealthy and No backups. These are dashboard observations, not a verified database-health diagnosis or proof that all backup methods are absent.
- checks: Production inventory INCOMPLETE. Prepared catalog-only SELECT within BEGIN READ ONLY, local 8-second statement timeout, ROLLBACK. Run was attempted but browser control was interrupted by concurrent user activity; execution/result not confirmed. Do not infer empty schema or NO_LEGACY_DATA_TO_MIGRATE from transient Table Editor state.
- reused evidence: IMP-185 QA evidence retained without rerun; no related application/schema inputs changed.
- result: conditional authorization recorded; R12-06 remains BLOCKED_BY_GATES and R12-08 remains BLOCKED. Exact candidate approval and human/device/managed-recovery gates are not waived.
- blocker: Production catalog result unavailable during browser interruption; remaining release gates unchanged. Historical statements that Production authorization was absent are superseded only as to conditional authorization, not readiness or acceptance.
- production impact: READ_ONLY_INSPECTION_ATTEMPTED; no application DML, DDL, migration, deployment, cutover, credential reset or customer messaging. SQL editor query draft created by dashboard; no explicit save performed.

### IMP-187 - Production inventory and QA ledger gap closure (2026-09-22)
- scope: R12-01 Production read-only classification; R12-02 QA migration ledger; release-package synchronization.
- gap_ids: NEW_GAP-20260922-01 FIXED (P1, QA migration ledger missing two already-applied portal-security versions); remaining release gates unchanged.
- contract_refs: SPEC-MIG-001..005; PLAN-055; R12-01..06.
- changed_paths: tasks.md; implementation.md; RELEASE_APPROVAL.md. QA-only schema_migrations metadata repaired through the official CLI; no application code/schema edits.
- new evidence: Production browser project nbwynrwkdbtfsitafsxa/main PRODUCTION, successful catalog query with transaction_read_only=on. Catalog has public 82 tables/25 views, private 0 tables/0 views. Exact count query returned 87 rows covering all public tables, Auth users/identities, Storage buckets/objects and migration ledger, sorted by count descending. Nonzero counts: permissions 62; role_permissions 62; schema_migrations 9; buckets 3; identities 1; users 1; audit_events 1; branches 1; employee_branch_access 1; employees 1; roles 1. Following rows start at zero; counts cannot be negative. Therefore 75 public tables and Storage objects are empty. No PII or business-record contents were retrieved.
- classification: NO_LEGACY_DATA_TO_MIGRATE for business data in the named project at inspection time. KEEP_DATA for identity/access, branch, audit, Storage bucket configuration and migration history. No claim about external archives or other projects. Preserve these datasets and use an incremental upgrade; do not reset the baseline.
- migration evidence: Production ledger versions match the first nine local migrations through 20260914060713. Local source has 49 versions. QA initially had 47; live customers_select/quotation_lines_select/sales_order_lines_select policies and both portal-safe functions/grants were inspected and matched the semantics of the missing migrations. Official CLI repair for 20260922000600 and 20260922000700 exited 0. Fresh exact-set assertion returned QA_MIGRATION_LEDGER PASS, 49 versions.
- checks: DB:NEW PASS read-only inventory and QA ledger assertion. Clean/upgrade rehearsal of all current 49 migrations NOT_RUN; historical 41-migration clean rehearsal is not a current full-candidate PASS. No full regression rerun for metadata-only repair.
- reused evidence: IMP-185 scoped security/UAT/Storage/performance results retained; application/schema behavior was not modified by ledger repair.
- result: R12-01 scoped inventory PASS; QA ledger defect FIXED. R12-02 full candidate, R12-03 full expanded verification, R12-04 managed recovery, R12-05 exact immutable candidate/acceptance and R12-06 gate remain incomplete. No full-release PASS.
- blocker: managed backup detail UI could not be read reliably; observed No backups remains only a dashboard observation. Required physical-device/human UAT, provider decisions, full-scale/candidate verification and operational recovery evidence cannot be inferred from permissions or scoped checks.
- production impact: READ_ONLY_INSPECTED; no Production application/schema/config mutation, deployment, cutover, reset, real invoice or messaging. SQL editor draft changes are not application DML and were not explicitly saved. The successful inventory supersedes IMP-186's unavailable query result, not the remaining release gates.

### IMP-188 - Current migration clean/upgrade rehearsal and scale capacity (2026-09-22)
- scope: R12-02 clean/current migration sequence and nine-to-49 source-baseline upgrade; R12-03 QA scale capacity; local candidate evidence.
- gap_ids: current 49-migration application rehearsal evidence gap CLOSED; full managed/release boundaries remain open.
- changed_paths: scripts/qa/release-rehearsal.mjs; tasks.md; implementation.md; RELEASE_APPROVAL.md; artifacts/qa/r12-20260922/.
- new evidence: guarded QA script created two uniquely named isolated databases, used minimal Auth/Storage SQL fixtures, applied the exact current migration files, and removed both databases. CLEAN_49 PASS; UPGRADE_9_TO_49 PASS; BOOTSTRAP_PRESERVED PASS. Synthetic Owner identity, branch, employee, role, active access, audit and bucket configuration matched before/after; all 62 prior role permissions remained and roles.manage returned true.
- catalog evidence: clean and upgrade catalogs matched: 1,448 columns, 905 constraints, 280 indexes, 27 views, 107 policies (including fixture Storage policies), 157 non-extension application functions, 135 relations with grants/RLS/options and 39 triggers. Catalog fingerprint ff58dba074bf19b9d1c340a14b9b4ffe66d0311c17a796ba6d6f53340be0e82f. Ordered migration contents fingerprint 5355cde9dca41bffb2bb3633134f8a846793eb9099b3343bab80fb4bce42b4dc.
- checks: MIG:NEW PASS, script exit 0; QA_SCALE_INVENTORY:NEW PASS read-only counts, not performance certification. QA database 171,076,755 bytes; protected maximum 400 MiB. Observed SO 20,102; lines 100,502; deliveries 30,150; expenses 20,100; payments 200; earnings 200; messages 0. Expanded-load coverage remains NOT_RUN; do not increase the guard without an appropriate environment decision.
- reused evidence: IMP-187 QA ledger 49/49 and Production read-only inventory; IMP-185 scoped application/security/UAT/Storage/performance checks. Application source was not changed by this batch.
- result: R12-02 current application-schema rehearsal PASS. This does not prove Production catalog parity, managed Auth/Storage runtime recovery, full expanded performance, human UAT, immutable Git candidate or Owner release acceptance. R12-06 remains BLOCKED_BY_GATES.
- blocker: current guarded QA capacity is unsuitable for blindly loading the full expanded dataset; managed recovery environment and physical-device/human/provider evidence remain unavailable. Exact immutable release commit/remote and candidate acceptance are not recorded.
- production impact: NOT_MUTATED. No credential reset, deployment, cutover, real invoice issue or customer messaging.

### IMP-189 - Production baseline comparison and Owner device-UAT deferral (2026-09-22)
- scope: targeted R12 Production structural baseline verification; managed-backup availability; latest Owner instruction.
- gap_ids: Production baseline structural uncertainty narrowed; no confirmed application logic defect from the function checksum differences. Device-UAT ownership updated, not falsely passed.
- changed_paths: tasks.md; implementation.md; RELEASE_APPROVAL.md; artifacts/qa/r12-20260922/baseline-nine-schema.json; artifacts/qa/r12-20260922/baseline-functions.json; artifacts/qa/r12-20260922/schema-fingerprint.sql; artifacts/qa/r12-20260922/production-comparison.json.
- new evidence: isolated QA baseline of the first nine migrations was built for the comparison and removed. Browser-only Production queries used BEGIN READ ONLY, local statement timeout and ROLLBACK. Exact ordered catalog fingerprints match for 1,248 columns, 763 constraints, 214 indexes, 87 policies, 107 RLS/relation-option entries, 39 ordinary triggers and 25 views.
- function evidence: initial aggregate count was 112 versus baseline 111. The additional public.rls_auto_enable() returns event_trigger; enabled ensure_rls uses ddl_command_end with CREATE TABLE/CREATE TABLE AS/SELECT INTO tags. Supabase's official event-trigger documentation describes this auto-RLS pattern. No trigger mutation. Of the remaining 111 application function definitions, 104 exact MD5 values matched. The seven differences were private.current_employee_id, private.has_any_permission, private.has_branch_access, private.has_customer_membership, private.has_permission, public.assign_employee_role and public.register_invited_employee. All seven passed whitespace-normalized definition comparison and independent exact quoted-literal sequence comparison. No logic difference was demonstrated; this normalization is not a formal semantic-equivalence proof.
- checks: DB:NEW PASS for the stated structural/normalized-definition comparison; grants, default privileges, Auth/Storage managed schema and configuration are not covered. Temporary baseline databases removed. UI:NEW CONFIRMED Production Scheduled backups explicitly reports Free Plan does not include project backups. No paid plan or config change.
- Owner decision: physical-device UAT OWNER_DEFERRED, assigned to Owner's own checking, no longer an agent technical blocker. Do not call it PASS or infer exact-candidate release acceptance.
- reused evidence: IMP-188 49-migration clean and nine-to-49 upgrade rehearsal; IMP-187 49/49 QA ledger and Production data inventory; IMP-185 scoped checks remain valid because application/schema inputs did not change.
- result: structural baseline evidence advanced; R12-06 remains BLOCKED_BY_GATES for outstanding technical/full-scale/recovery/candidate boundaries, not physical-device UAT. Historical claims that device UAT blocks the agent scope are superseded.
- blocker: available QA safety capacity versus required expanded dataset; Free-plan managed backup capability; immutable release commit/remote verification and exact-candidate acceptance not recorded. No waiver of these boundaries inferred.
- production impact: READ_ONLY_INSPECTED, NOT_MUTATED; no deployment, migration, DML, credential reset, cutover, invoice issuance or customer message.

### IMP-190 - Owner cutover override request and mismatched database target (2026-09-22)
- scope: read-only immediate-cutover preflight after explicit Owner instruction. No false PASS recorded for waived/unrun checks.
- gap_ids: NEW_GAP-20260922-02 CONFIRMED, release-blocking environment target mismatch; Production runtime approval flag also missing for current source.
- changed_paths: tasks.md; implementation.md; RELEASE_APPROVAL.md. No application code or remote configuration changed.
- source_evidence: .vercel/project.json identifies hien-xa-erp-v2/prj_7cpdvLr47L26ICquB2ah4n7ceB6n/team_vsD8hUJEjtJfZm8zthHCcPS4. Vercel CLI 59.25.0 whoami and project inspect succeeded as mutaquaticstudio. Production environment pull stored in restricted /tmp/hienxa-cutover-20260922/production.env, outside repository; secret values unavailable and represented by placeholders. Only URL origin and variable presence were reported, never credentials.
- new evidence: actual Production NEXT_PUBLIC_SUPABASE_URL origin is https://vknnzzecimfpnrsqbnuu.supabase.co, different from the authorized/read-only inspected nbwynrwkdbtfsitafsxa target. HX_CLOUD_RUNTIME_APPROVED is absent. src/lib/supabase/config.ts rejects cloud runtime without that flag. Vercel current Ready deployment is hien-xa-erp-v2-fasz2zgy3-noxelis.vercel.app, commit 2a81dc87e2ad0de3ff3349fb0e894115e333c142. Dashboard attached domains include hien-xa-erp-v2.vercel.app and www.hienxavlxd.com.
- tooling evidence: connector get_project schema mismatch and list_deployments 403; existing CLI session read access succeeded. Supabase CLI projects list reports missing management access token. Vercel dashboard shows team Overdue/payment-failed notice; no payment, new subscription or paid feature enabled. CLI command help was read, but deploy/promote was not invoked.
- checks: ENV_TARGET:NEW FAIL; VERCEL_PROJECT_IDENTITY:NEW PASS; cloud-runtime flag/configuration gate BLOCKED. No build, migration, deployment or post-cutover verification claimed.
- result: R12-06 BLOCKED_ENV_TARGET_MISMATCH. Owner's request to cut over does not resolve which database is intended. Production source/schema at vknnzzecimfpnrsqbnuu has not been inventoried; nbwynrwkdbtfsitafsxa evidence cannot be transferred to it.
- reused evidence: IMP-187..189 only for their named Supabase targets; no invalidation of unrelated QA application evidence.
- blocker: intended Production database needs explicit identification. Do not silently rewire Vercel, replay migrations on another project, use QA secrets, reset credentials or assign domains while this mismatch is unresolved.
- production impact: READ_ONLY_PREFLIGHT_ONLY; no mutation, invoice, customer message or cutover. Owner device UAT remains OWNER_DEFERRED, not PASS.

### IMP-191 - Owner target decision, release-state sync and upload-scope check (2026-09-22)
- scope: R12-05/R12-06 operational readiness; no application logic or database change.
- gap_ids: NEW_GAP-20260922-02 target ambiguity RESOLVED, actual hosting mismatch OPEN; NEW_GAP-20260922-03 PARTIAL (deployment upload scope).
- changed_paths: .vercelignore; tasks.md; implementation.md; RELEASE_APPROVAL.md.
- Owner decision: explicit switch to nbwynrwkdbtfsitafsxa after immediate-cutover override; retain old vknnzzecimfpnrsqbnuu and deployment for rollback. Physical-device UAT remains OWNER_DEFERRED. No password reset, paid upgrade or fabricated check PASS.
- new evidence: Vercel CLI dry-run succeeded before and after upload exclusions, with no upload/deployment. Original package: 324 entries / 3,727,273 bytes, including internal documents, QA artifacts and incremental compiler state. Revised package: 273 entries / 2,368,447 bytes; ignored list includes environment files, internal Markdown, artifacts/qa and QA scripts. Zero-byte directory entries remain and are not evidence of leaked file content.
- checks: DOC state corrected for explicit target and override; VERCEL_DRY_RUN:NEW exit 0; strict root-name assertion:FAIL because empty directory entries remain. Failure inspection also found the unanchored qa/ exclusion matches src/app/api/qa/environment, an unintended source-path exclusion. Upload configuration is therefore NOT_VALIDATED_FOR_RELEASE; scope the exclusions to root directories before declaring packaging complete. No build or full regression rerun.
- configuration evidence: src/lib/auth/actions.ts uses NEXT_PUBLIC_APP_URL, not APP_BASE_URL, for recovery redirects. The inspected Production env list lacks NEXT_PUBLIC_APP_URL. Configure the approved public origin before release; no recovery email or password action was attempted.
- browser evidence: recovered the correct Chrome window through the Window menu and observed existing API-key controls for nbwynrwkdbtfsitafsxa. Secret-key retrieval was interrupted by concurrent browser activity; no key rotation or remote write occurred. Browser availability remains intermittent, not proof of a Supabase outage.
- reused evidence: IMP-185 application checks; IMP-187 target inventory; IMP-188 current migration rehearsal; IMP-189 structural comparison. None proves a completed Production migration or cutover.
- result: PARTIAL. Documentation decision drift resolved; upload-scope correction requires another change. Exact candidate, credentials, current backup, 40 pending target migrations, staged deployment, promotion and post-cutover reconciliation remain incomplete.
- production impact: NOT_MUTATED; no deployment, migration, DML, configuration write, domain change, real invoice, customer message, credential reset, commit or push.

### IMP-192 - Root-scoped deployment exclusions corrected (2026-09-22)
- scope: authorized correction of IMP-191 upload configuration; R12-05 packaging only.
- gap_ids: NEW_GAP-20260922-03 FIXED at the CLI upload-selection boundary.
- changed_paths: .vercelignore; implementation.md; RELEASE_APPROVAL.md.
- implementation: anchored directory exclusions at the repository root, including /qa/ and /scripts/qa/, so they do not match nested application routes. Environment-file exclusions remain in place.
- new evidence: Vercel CLI 59.25.0 deploy --dry --json exited 0. Focused assertion exited 0: 273 entries / 2,369,019 bytes; all 195 source entries retained; no src path in the ignored list; required runtime/build inputs present; environment files, internal Markdown, compiler state and QA evidence excluded. Remaining artifacts/qa/tmp directory entries contain zero bytes and are not uploaded file contents.
- checks: VERCEL_UPLOAD_SCOPE:RERUN PASS; upload/deploy NOT_RUN; application build/full regression NOT_RUN for this packaging-only correction.
- reused evidence: IMP-191 target/authorization decisions and configuration findings; IMP-185 application checks; IMP-187..189 scoped inventory/rehearsal/comparison. Packaging evidence is not a Production readiness or acceptance result.
- result: unintended source-path exclusion and packaging gap closed. The operational release blockers recorded in IMP-191 remain open.
- blocker: target secret credentials/current backup, pending incremental migrations, exact candidate deployment, promotion and post-cutover reconciliation are not completed by this check.
- production impact: NOT_MUTATED; no remote configuration change, deployment, migration, DML, domain change, credential reset, real invoice or customer message.

### IMP-193 - Target credentials recovered and staged Vercel candidate READY (2026-09-22)
- scope: R12-05/R12-06 candidate preparation after Owner target selection and cutover override.
- gap_ids: NEW_GAP-20260922-02 PARTIAL: candidate uses selected target; existing live deployment/persistent project environment are not switched.
- changed_paths: tasks.md; implementation.md; RELEASE_APPROVAL.md. Protected local target.env outside repository; no application-source edit.
- credentials: existing publishable and secret API keys retrieved through authenticated Supabase browser for nbwynrwkdbtfsitafsxa; no connector, reset or rotation. Restricted temporary directory mode 700 and credentials file mode 600. Auth settings returned 200; Auth Admin users read returned 200 without logging user data. An initial service-key branches check returned 403/42501 permission denied for table branches. This is not invalid credentials or a demonstrated application defect: service key is used for Auth Admin invitation, not application branch reads. No grants were expanded.
- candidate: Vercel CLI 59.25.0 deploy --prod --skip-domain completed exit 0. Deployment dpl_5SdLVt665z2A1kg1zaa8xZe2dsbf, URL https://hien-xa-erp-v2-qoklueiyg-noxelis.vercel.app, READY. Runtime/build overrides set exact target URL/keys, HX_CLOUD_RUNTIME_APPROVED=true, HX_EINVOICE_ENABLED=false and NEXT_PUBLIC_APP_URL=https://www.hienxavlxd.com. Persistent project environment was not rewritten. Vercel CLI reports a generated project alias; no custom domain promoted.
- checks: remote Next compilation PASS, TypeScript PASS, 70 static-page generation PASS. Candidate public requests encountered Vercel SSO (302), not application test results. Authenticated Vercel CLI requests then returned health 200/status ok, QA environment 404, access context 401/UNAUTHENTICATED. These are scoped unauthenticated application-boundary checks, not database-backed business acceptance.
- live boundary: inspecting www.hienxavlxd.com resolved old deployment dpl_aT6fdZ6VHqpzf6thNqZiHhDKccco (hien-xa-erp-v2-fasz2zgy3-noxelis.vercel.app), READY. Old database unchanged. Target database still requires its pending incremental upgrade before authenticated candidate verification/promotion.
- reused evidence: IMP-192 upload scope; IMP-185 QA application checks; IMP-187..189 named-target inventory and schema rehearsal. No claim that historical scoped checks cover the new hosted candidate end-to-end.
- result: PARTIAL. Credential acquisition and staged build blockers cleared; current backup, target migration, persistent hosting configuration, authenticated candidate verification, custom-domain promotion and post-cutover reconciliation remain.
- production impact: CANDIDATE_DEPLOYED_WITHOUT_CUSTOM_DOMAIN_PROMOTION. No database DDL/DML, reset, invoice issue or customer message. No paid upgrade enabled; Vercel reports standard build-resource usage, not zero hosting cost. No commit or push.

### IMP-194 - Pre-upgrade Production data snapshot exported and validated (2026-09-22)
- scope: R12-04/R12-06 preservation evidence for nbwynrwkdbtfsitafsxa, before incremental upgrade.
- changed_paths: implementation.md; RELEASE_APPROVAL.md; private backup files outside repository at /Users/nox/.codex/backups/hienxa/20260922/.
- new evidence: browser SQL Editor executed one REPEATABLE READ, READ ONLY transaction with a 20-second statement timeout, ending in ROLLBACK. Snapshot export contains 234 records: data for 118 public/private/auth/storage/ledger tables, 112 non-extension application function definitions/ACL/owner entries, and four metadata records for relations/RLS/ACL, policies, default ACL and snapshot context. Per-table reads capped at 1001 rows; parser asserts every exported table has at most 1000, so no data table hit the cap.
- preservation evidence: snapshot time 2026-09-22T06:32:15.679806+00:00. All 82 public tables present; 75 are empty. auth.users, auth.identities, branches, employees, roles and employee_branch_access each contain one row. Storage objects empty. Migration ledger exactly matches the first nine of the 49 captured source migration files; 40 remain pending. No record contents, credential values or password hashes logged.
- artifact: production-before-upgrade.csv stored with mode 600 under private backup directory; downloaded copy moved out of Downloads. Source migration copies are also retained privately. SHA-256 of exported UTF-8 CSV content: 98fd4eebcf99db2b95c1d020fb4dbef9aac51fdfeca123c64cc0c7f391f1e4bd. snapshot-validation.json records checks and limitations.
- checks: DATA_SNAPSHOT:NEW PASS, local parser/assertion exit 0; zero truncated tables; READ_ONLY confirmed from transaction metadata. This does not claim a full pg_dump schema archive, managed Auth/Storage runtime recovery or a tested restore of the current Production snapshot.
- reused evidence: IMP-188 current source clean/upgrade rehearsal; IMP-189 structural baseline comparison; IMP-193 staged candidate build and scoped HTTP checks. No application source, schema or credentials changed.
- result: pre-upgrade data preservation artifact obtained. Complete recovery assurance and safe incremental application/ledger update remain pending; no migration or cutover yet.
- production impact: READ_ONLY_DATA_SNAPSHOT; existing staged deployment unchanged; no database DDL/DML, domain promotion, reset-password action, invoice issuance or customer messaging.

### IMP-195 - Atomic cutover rehearsal helper failed before approval (2026-09-22)
- scope: additional R12-06 atomic upgrade/failure-recovery rehearsal, isolated QA only.
- changed_paths: scripts/qa/cutover-rehearsal.mjs; implementation.md; RELEASE_APPROVAL.md.
- source evidence: current 49 migration files still have fingerprint 5355cde9dca41bffb2bb3633134f8a846793eb9099b3343bab80fb4bce42b4dc. No transaction-control statements found in the 40 pending files by the scoped preparation check.
- implementation: helper prepares a single-transaction bundle with exact ledger guards, baseline data-count checks, bootstrap preservation comparisons, RLS/anon-read assertions and migration ledger writes. It connects only through the QA guard to a uniquely named isolated database; it does not connect to Production.
- checks: ATOMIC_REHEARSAL:NEW FAIL, exit 1, syntax error at or near dollar sign; no named rehearsal check passed. Helper cleanup reported REMOVED. The helper's deliberate-failure SQL uses a JavaScript replacement string containing double-dollar delimiters; replacement-string dollar escaping changes the intended PostgreSQL delimiter. This helper defect must be corrected before the generated bundle can be considered valid.
- result: helper implemented but NOT_VALIDATED. No approved upgrade bundle was produced by this failed invocation. IMP-188's earlier per-migration rehearsal remains scoped valid; it does not establish atomic-bundle correctness.
- blocker: correct the newly introduced deliberate-failure probe construction and rerun the focused isolated rehearsal before using the bundle.
- production impact: NOT_TOUCHED in this batch; existing staged candidate remains unpromoted, target database unchanged. No password reset, real invoice, customer message, commit or push.

### IMP-196 - Atomic cutover rehearsal corrected and passed (2026-09-22)
- scope: Owner-confirmed correction of IMP-195 helper and focused isolated-QA rerun.
- changed_paths: scripts/qa/cutover-rehearsal.mjs; implementation.md; RELEASE_APPROVAL.md.
- implementation: the deliberate-failure probe now uses a replacement callback, preserving PostgreSQL double-dollar delimiters instead of interpreting them as JavaScript replacement-string escapes.
- checks: node --env-file=.env.qa.local scripts/qa/cutover-rehearsal.mjs exited 0. FAILURE_BEFORE_COMMIT_ROLLS_BACK PASS; ATOMIC_UPGRADE_AND_PRESERVATION PASS; REPLAY_REJECTED PASS. Temporary isolated QA database cleanup REMOVED.
- evidence: source migration fingerprint 5355cde9dca41bffb2bb3633134f8a846793eb9099b3343bab80fb4bce42b4dc unchanged. Generated /tmp/hienxa-cutover-20260922/production-upgrade-9-to-49.sql is 521115 bytes, SHA-256 f0c8e20717b150bdf9556a5ea8a3bb3c4d1a079348900c5b3a6c88c6898dbba7. The bundle checks exact baseline ledger and inventory, preserves bootstrap/access/audit/bucket data, retains prior permission records, checks RLS/anonymous read boundaries, and commits schema and ledger together.
- reused evidence: IMP-194 private Production data snapshot; IMP-193 staged candidate; IMP-192 upload scope. No application-source change or unrelated regression rerun.
- result: IMP-195 helper defect FIXED; atomic bundle validated at synthetic isolated-QA boundary. This is not a restore test of actual Production identities or managed Auth/Storage runtime recovery, and does not mean the bundle has run on Production.
- remaining: Production execution/reconciliation, persistent hosting configuration, authenticated candidate checks and custom-domain promotion remain incomplete.
- production impact: NOT_TOUCHED in this batch; no Production migration, DML, domain promotion, password reset, invoice issue or customer messaging.

### IMP-197 - Upgrade bundle identity and Auth redirect preflight (2026-09-22)
- scope: R12-06 preparation to execute the approved atomic upgrade through the logged-in Supabase browser.
- changed_paths: implementation.md; RELEASE_APPROVAL.md. A plaintext copy of the validated SQL was prepared outside the repository for native UI transfer; no SQL source changed.
- evidence: SHA-256 of production-upgrade-9-to-49.sql still equals f0c8e20717b150bdf9556a5ea8a3bb3c4d1a079348900c5b3a6c88c6898dbba7. Existing IMP-196 rehearsal evidence remains applicable to that exact bundle.
- new gap: NEW_GAP-20260922-04 CONFIRMED, release configuration mismatch. Browser URL Configuration for nbwynrwkdbtfsitafsxa showed Site URL https://hienxa-erp-v2.vercel.app and No Redirect URLs. The candidate's NEXT_PUBLIC_APP_URL is https://www.hienxavlxd.com. Align Auth redirect configuration before invitation/recovery journeys or cutover; no email or password action was attempted.
- execution evidence: Chrome interactions were interrupted by user activity before the upgrade was pasted/run. The dedicated Supabase window later disappeared from the native Window menu. The validated SQL file was opened in TextEdit and copied, but no SQL Editor Run action was issued for this bundle. Do not infer migration execution from prepared clipboard content.
- checks: BUNDLE_IDENTITY:NEW PASS; AUTH_REDIRECT_PREFLIGHT:NEW mismatch observed; PRODUCTION_UPGRADE:NOT_RUN.
- reused evidence: IMP-196 atomic QA rehearsal; IMP-194 snapshot; IMP-193 staged candidate. No unrelated reruns.
- result: operational work incomplete. Resume against a verified Supabase SQL Editor target before sending any mutation; then reconcile database and candidate before domain promotion.
- production impact: READ_ONLY_UI_INSPECTION; no database DDL/DML, hosting config write, domain promotion, credential reset, invoice issuance or customer messaging in this batch.

### IMP-198 - Production atomic schema upgrade committed and reconciled (2026-09-22)
- scope: authorized R12-06 incremental upgrade of nbwynrwkdbtfsitafsxa only, through logged-in Supabase browser.
- changed_paths: tasks.md; implementation.md; RELEASE_APPROVAL.md. Selected Production schema and migration ledger changed; old vknnzzecimfpnrsqbnuu untouched.
- execution: SQL Editor URL/project matched the selected target. Exact IMP-196 bundle SHA-256 f0c8e20717b150bdf9556a5ea8a3bb3c4d1a079348900c5b3a6c88c6898dbba7 was copied through native TextEdit/clipboard. Editor beginning showed target/source fingerprint/BEGIN and ending showed commit marker/final query. Run submitted once; generic destructive-operation warning acknowledged for the authorized migration. Result: HX_ATOMIC_UPGRADE_COMMITTED, migration_count 49.
- guarantees exercised: exact first-nine ledger and baseline inventory checked before changes. All 40 pending migration bodies and ledger entries ran in one transaction. Complete preserved Owner/access/audit/Auth identity/bucket rows compared before commit; prior permission rows retained; public RLS and anonymous-read guards passed. These checks would have aborted the transaction on failure.
- checks: separate BEGIN READ ONLY query after commit returned migrations 49; Auth users 1; Auth identities 1; active employees 1; active branch access 1; Storage buckets 3; Storage objects 0; public tables missing RLS 0; anon table SELECT grants 0; owner roles.manage true. Query ended ROLLBACK. No record contents or passwords logged.
- reused evidence: IMP-196 isolated-QA atomic rollback/upgrade/replay checks; IMP-194 private snapshot; IMP-193 staged candidate. No unrelated rebuild or full regression.
- result: database upgrade COMPLETE at the declared schema/preservation boundary. This does not prove authenticated hosted business journeys, managed-service recovery, full-scale performance or completed cutover.
- remaining: NEW_GAP-20260922-04 Auth redirect alignment; persistent Vercel environment; authenticated candidate checks; custom-domain promotion and post-cutover reconciliation.
- production impact: SELECTED_DATABASE_SCHEMA_AND_LEDGER_UPGRADED. Existing Owner/access/Auth/bucket data preserved. No business fixture seeded, credential reset, real invoice, customer message or custom-domain promotion. Old database/deployment retained. The Supabase page reported unavailable in IMP-197 was subsequently found as a tab in the main Chrome window; this execution is now confirmed.

## IMP-199 — 2026-09-22 — R12-06 app subdomain production cutover delta

- scope: Owner-authorized ERP hostname cutover to `https://app.hienxavlxd.com`; Wix marketing site at `www.hienxavlxd.com` unchanged.
- changed_paths: none in application source or schema; external Wix DNS, Vercel project/Production environment/deployment, Supabase Auth URL configuration.
- DNS: Wix CNAME `app` -> `1d0f6bd4a661165a.vercel-dns-017.com`; Vercel domain verification `configured_correctly` for `hien-xa-erp-v2`.
- Auth: Production Supabase `nbwynrwkdbtfsitafsxa` Site URL `https://app.hienxavlxd.com`; exact recovery callback `https://app.hienxavlxd.com/recovery/confirm` allowed. Existing `https://hien-xa-erp-v2.vercel.app/recovery/confirm` retained as rollback callback; Wix `www` callback removed.
- runtime: Vercel Production `NEXT_PUBLIC_APP_URL` and `APP_BASE_URL` set to `https://app.hienxavlxd.com`; Supabase target remains `nbwynrwkdbtfsitafsxa`; synthetic auth disabled; unused old `SUPABASE_DB_URL` removed. New immutable deployment `dpl_C3uDMCYN3jyeHHaQiybNR6UJpovu` promoted to Production.
- new evidence: Vercel build/TypeScript/70 static pages PASS; `/api/health` 200 on candidate; live HTTPS login, Owner AccessContext/dashboard, and Purchase Orders list PASS at `app.hienxavlxd.com`; Vercel inspect maps `app` to the promoted deployment; `www` still serves Wix.
- reused evidence: IMP-198 target schema migration ledger 49, RLS/anon grants and Owner role reconciliation; previous candidate business-route checks.
- checks: DNS NEW PASS; Vercel deploy NEW PASS; Auth/UI NEW PASS; Production full-system/UAT/PERF NOT RUN.
- result: app subdomain LIVE; no real invoice issue, customer messaging, password reset, or Production DML performed by this cutover.
- blocker: managed point-in-time backup unavailable on current free plan; physical-device UAT remains Owner-deferred; full release acceptance remains Owner-owned. Previous deployment remains available, but rollback requires explicit data/URL reconciliation after any new Production writes.
- production impact: Vercel deployment and domain routing, Wix `app` DNS, Supabase Auth redirect settings only.

## IMP-200 — 2026-09-22 — QA synthetic commercial smoke delta

- scope: targeted QA-only synthetic data and business-command check; no Production write.
- gap_ids: none closed by this check alone.
- changed_paths: `implementation.md` only; QA fixture records tagged `HXQA-SMK-MUCEH19L` in Supabase project `ffrwiglcrlumfvhubaxg`.
- new evidence: QA guard and capacity PASS (163 MB below 400 MB ceiling); six-role QA seed exists; QA Owner login PASS. Created one synthetic customer, site and two-line draft order. Owner and same-branch Sales read PASS; unrelated customer read denied.
- command evidence: `create_sales_order_draft` via authenticated QA Owner created a separate two-line draft totaling 990,000 VND; same-operation retry returned the same order ID, changed-payload retry failed, Sales read PASS, unrelated customer denied. Order ID `a5064bf9-1003-463b-ab2e-68b7940da9a7`.
- checks: DB/API/SEC/IDEM targeted NEW PASS; current-build browser journey, complete multi-role UAT, Production write journeys, full PERF, and full-system release gate NOT RUN.
- result: targeted QA synthetic smoke PASS; document-wide completion remains NOT ASSERTED.
- blocker: QA Preview available at this checkpoint is an older build and was not treated as evidence for the current UI. Owner physical-device UAT and managed backup/recovery limitations remain as previously recorded.
- production impact: NOT_TOUCHED.

## IMP-201 — 2026-09-27 — Post-acceptance finance, portal and performance defect fixes

- scope: Confirmed defects found during scoped acceptance/audit; source changes and QA schema checks only. No Production deployment or data mutation.
- gap_ids: NEW_GAP-20260927-01 cashbook totals from first 100 payments FIXED; NEW_GAP-20260927-02 AR/AP report and CSV first-100 truncation FIXED; NEW_GAP-20260927-03 payment allocation selector first-100 cap FIXED; NEW_GAP-20260927-04 Receiver debt navigation FIXED; NEW_GAP-20260927-05 Dashboard/Dispatch latency on QA-scale data FIXED at local optimized-build boundary; NEW_GAP-20260927-06 stale UAT checks FIXED.
- changed_paths: `src/app/admin/cashbook/page.tsx`; `src/app/admin/reports/page.tsx`; `src/modules/reports/server.ts`; `src/app/api/reports/export/route.ts`; `src/components/report-export-button.tsx`; `src/app/api/finance/obligations/route.ts`; `src/modules/finance/payment-form.tsx`; `src/app/admin/receivables/page.tsx`; `src/app/admin/payables/page.tsx`; `src/app/admin/page.tsx`; `src/app/admin/dispatch/page.tsx`; `src/app/customer/layout.tsx`; `src/components/portal/portal-shell.tsx`; `scripts/qa/uat.mjs`; QA migrations `20260927000100` through `20260927000600`; `acceptance.md`; `implementation.md`.
- QA schema evidence: All six new migrations applied to `ffrwiglcrlumfvhubaxg`; no migration sent to Production. Cashbook summary on branch A matched an independent full-scope query across 111 payments: net 2,700,000 VND and unmatched count 109. Sales direct-RPC access now fails with 42501. First and second cashbook/report pages each displayed 25 distinct rows.
- report evidence: AR export completed with 5,058 distinct rows; sum 5,046,476,000 VND matched the finance dashboard snapshot at the same knowledge cutoff. AP export completed with 5,068 distinct rows; sum 2,524,435,924 VND also matched its snapshot. Small customer-filtered AR export returned CSV directly with 15 rows. Large exports returned a durable job ID/status; a job paused after 1,000 rows continued under a new Owner session to 5,068 rows with the same dedupe ID. UI interruption/reload resumed and downloaded 5,058 rows; failed-network text is user-safe Vietnamese. Sales could not read an Owner job or start an AR export.
- allocation and portal evidence: QA AP supplier with 5,050 open obligations loaded pages 1 and 2; two allocations on different pages remained distinct in one payment draft without posting money. Sales received 403 from the new obligation selector. Receiver showed no debt navigation; Finance contact retained it. Dispatch RPC results matched the prior view for all four buckets; Sales received 42501 for dispatch access.
- server validation evidence: QA `post_payment` and `private.allocate_payment_lines` function definitions confirm permission, active branch/party/account, duplicate obligation ID, per-obligation branch/party, locked outstanding balance and payment-available checks. No real or synthetic payment was posted during this recheck.
- checks: changed-path ESLint PASS; TypeScript PASS; optimized Next build PASS; technical six-role UAT 13/13 PASS on local optimized build bound to QA, overall UAT PARTIAL because human journeys remain NOT_RUN. Representative local optimized-build browser navigation, 100 samples per route/concurrency: Dashboard p95 2.08s at c1, 2.40s at c5, 4.70s at c10; Dispatch p95 0.76s at c1, 0.82s at c5, 1.25s at c10. Dashboard c10 p99 5.12s; Dispatch c10 p99 1.45s. This is not a hosted-cloud benchmark or Owner device UAT.
- result: Scoped confirmed source defects corrected and QA-verified. ACC-CASE-28 cloud evidence, Owner physical-device UAT, provider gates and full release acceptance remain separate; do not infer their PASS from this batch. Current source is not deployed to Production by this batch.
- production impact: NOT_TOUCHED. QA only contains migration changes and synthetic export-job evidence rows; no QA payment was posted by these checks.

## Production UAT repair closure - 2026-09-28

- Scope: five reported Production UAT defect groups (UAT-REPAIR-01 through UAT-REPAIR-05); technical regression PASS.
- Production deployment: dpl_4jRfL6XsxcrwMpV98AeigTfFJ8hS; https://hien-xa-erp-v2-nu.vercel.app. Production migration head: 20260927205002; ten missing/new migrations applied in one guarded transaction.
- Changed paths: purchasing form/actions/new page; pricing editor; compensation, audit, orders and quotation pages; quotation PDF route; core business-time/quantity helpers; earning read-boundary migration; focused regression tests and isolated DB portal expectation.
- Repairs: restored affected P0 routes; guarded earnings helper with explicit error handling; retained failed PO form input; linked-SO sales preview/manual override with save-time price validation; explicit business timezone; reusable pricing form; readable audit labels and exact quantity formatting.
- NEW checks PASS: 38 unique unit tests across batch, typecheck, full lint, local/Preview/Production builds, isolated R2-R9 DB checks, QA earning visibility and deny checks, targeted Production UI regression.
- New evidence: artifacts/qa/uat-repairs-20260928/manifest.json. Reused batch evidence: artifacts/qa/2026-09-27T20-58-00-637Z-uat-repair-db/manifest.json. No unrelated historic checks promoted to PASS.
- Production UAT evidence: PO-2026-000003 and SO-2026-000003 remain DRAFT (260000/410000 VND); two UAT-only customer price rules created consecutively. Actual downloaded quotation PDF matches detail time and quantity display.
- Result: reported repair scope COMPLETE. Blocker: NONE for these five groups. Production impact: authorized migration/deployment and synthetic UAT drafts/rules; no money/inventory movement, real invoice issue or messaging.
- Owner acceptance, real-device UAT and unrelated release gates are unchanged.

## IMP-202 - 2026-09-30 - Net AR credit exposure repair

- scope: P1 false credit-limit block from counting settled receivables; SPEC-CRE-001 and SPEC-CRE-002.
- gap_ids: Owner UAT report-160 credit exposure FIXED at QA boundary; unrelated warehouse fulfillment, return, and draft-terms gaps remain OPEN.
- changed_paths: `supabase/migrations/20260930000100_credit_exposure_net_allocations.sql`; `implementation.md`; `artifacts/qa/owner-uat-20260928/report-187-credit-exposure-fix.md`.
- implementation: `customer_credit_exposure` now nets payment allocations per AR obligation before summing unpaid AR. Sales-order and local-fixture reservation overdue checks use `private.current_receivable_outstanding` rather than original AR plus adjustments.
- new evidence: QA guard selected `ffrwiglcrlumfvhubaxg`; migration list showed only `20260930000100` pending and `qa:migrate` applied only that migration. On the existing QA customer, receivable changed from 470000 to 350000 VND, exposure from 983000 to 863000 VND, and available from 17000 to 137000 VND; the settled 120000 VND AR no longer counts. Owner UI created SO-2026-000032 for 100000 VND, confirmed it within the corrected available limit, then cancelled it. DB confirmed the 100000 VND commitment fully released and exposure returned to 863000 VND.
- reused evidence: report-160 settled-AR false block; no unrelated full-system UAT rerun.
- checks: QA guard NEW PASS; QA migration NEW PASS; targeted QA DB before/after NEW PASS; Owner create/confirm/cancel and commitment-release NEW PASS. Overdue paid-AR edge and Production build/deployment NOT_RUN.
- result: credit-exposure defect FIXED and targeted QA retest PASS. Do not infer Production fix or full release acceptance.
- blocker: Production migration/deployment remain separate authorized work; other P1 gaps remain open.
- production impact: NOT_TOUCHED.

## IMP-203 - 2026-09-30 - Commercial DRAFT terms form stabilization

- scope: Owner UAT report-186 intermittent terms concatenation on Sales DRAFT edit; shared Sales/Quote form.
- gap_ids: report-186 targeted local-QA retest PASS; warehouse fulfillment and return remain OPEN.
- changed_paths: `src/components/sales/commercial-document-form.tsx`; `implementation.md`; `artifacts/qa/owner-uat-20260928/report-188-draft-terms-retest.md`.
- implementation: terms textarea now uses component state and `onChange` instead of uncontrolled `defaultValue`, preserving the intended replace value through preview/form re-renders. RPC already used replacement assignment and was not changed.
- evidence: before change, one Owner edit had persisted new+old terms; a later hydrated-form diagnostic submitted and stored only the new value, so hydration/rerender timing was suspected but not definitively isolated. After change, three immediate SO-2026-000031 edit/preview/save cycles persisted exactly the last value in QA DB with draft_version 6, no concatenation. A DRAFT quote edit on QT-2026-000004 displayed the exact replacement terms after save without altering its 1100000 VND total.
- checks: focused UI/DB Owner Sales DRAFT NEW PASS; focused UI Quote DRAFT NEW PASS; ESLint changed component NEW PASS. Full system UAT and Production deployment NOT_RUN.
- result: targeted local-QA behavior PASS; intermittent pre-change root mechanism remains an inference, and Production remains on its current deployment.
- production impact: NOT_TOUCHED.

## IMP-204 - 2026-09-30 - Owner warehouse-source entry point

- scope: P1 Owner UAT report-184 warehouse fulfillment entry point for a CONFIRMED multi-line SO; SPEC-SRC-001/002 and SPEC-OPS-001/003/004.
- gap_ids: report-184 entry point FIXED at local QA; NEW_GAP-20260930-01 planned-delivery cancellation/reservation release OPEN; warehouse-source quantity input formatting P2 OPEN.
- changed_paths: `src/app/admin/orders/[id]/page.tsx`; `src/modules/delivery/actions.ts`; `implementation.md`; `artifacts/qa/owner-uat-20260928/report-189-warehouse-source-retest.md`.
- implementation: confirmed SO detail now exposes per-line active-warehouse selection and remaining base quantity. Server Action validates order/line scope and calls existing idempotent `upsert_supply_allocation` as WAREHOUSE. Existing multi-line delivery command reserves inventory atomically; no separate reservation call was added.
- new evidence: Owner selected Kho nghiệm thu QA for SO-2026-000030 lines at 1 and 10 base. QA DB showed two WAREHOUSE allocations and zero reservations before delivery. Owner created DL-2026-000011 from both allocations; QA DB showed two PLANNED lines and ACTIVE reservations totaling 11 base, on-hand 125, available 114, inventory movement count 0 and related AR count 0.
- checks: changed-file ESLint NEW PASS; TypeScript NEW PASS; Owner UI allocation and multi-line delivery NEW PASS; targeted QA DB source/reservation/ledger/AR checks NEW PASS. Full Delivery handoff/result/return, Production deployment and full-system UAT NOT_RUN.
- remaining: DL-2026-000011 persists as a synthetic PLANNED QA fixture. No public cancel-delivery command or UI was found; existing release-reservation command excludes delivery-linked reservations, and the Sales Order trigger blocks cancellation once any delivery exists. Do not delete ledger/fixture rows directly to clean QA. The new quantity input renders trailing decimal zeros, which needs a separate UX correction.
- production impact: NOT_TOUCHED.

### IMP-205 — Supplier-direct customer return cost basis (2026-09-30)
- Scope/gap: P1 ReturnCase to warehouse for `SUPPLIER_DIRECT`; case `9269ba5d-5901-46fa-a636-e533a11e9fb7`.
- Changed path: `supabase/migrations/20260930023428_return_case_supplier_direct_cost.sql`.
- Evidence: `artifacts/qa/owner-uat-20260928/report-190-direct-return-cost-retest.md`; source cost is supplier fulfillment line 220000 VND / 2 base, not fulfillment total 320000 VND / 2.
- Checks: QA guard PASS; QA migration PASS; Owner UI resolution PASS; QA DB movement `+1/+110000`, cost reversal `-110000`, one resolve receipt PASS. Existing permission and idempotency paths unchanged, not rerun here.
- Result: targeted QA PASS; Production NOT_TOUCHED. Other P1 planned-delivery cancellation remains OPEN.

### IMP-206 — Planned delivery cancellation and reservation release (2026-09-30)
- Scope/gap: NEW_GAP-20260930-01, PLANNED delivery with linked ACTIVE stock holds had no safe cancellation path.
- Changed paths: `supabase/migrations/20260930024101_cancel_planned_delivery_release_reservations.sql`, `src/modules/delivery/cancel-planned-action.ts`, `src/app/admin/deliveries/[id]/cancel/page.tsx`, `src/app/admin/deliveries/page.tsx`.
- Evidence: `artifacts/qa/owner-uat-20260928/report-191-planned-delivery-cancel-retest.md`. Owner UI canceled DL-2026-000011; created DL-2026-000012 from the same allocations and canceled it; both histories retained, four holds RELEASED, stock on-hand 126/reserved 0.
- Checks: QA guard/migration PASS; focused ESLint PASS; tsc PASS; Owner UI + QA DB PASS; anon EXECUTE false. Stale-version and denied-role invocations not run.
- Result: targeted QA PASS; Production NOT_TOUCHED. Existing SO cancellation guard was not changed.

### IMP-207 — Finance redirect preserves supplier context (2026-09-30)
- Scope/gap: P2 payables `?supplier=<id>?notice=...` malformed redirect after payment.
- Changed path: `src/modules/finance/actions.ts`.
- Evidence: `artifacts/qa/owner-uat-20260928/report-192-payables-redirect-retest.md`.
- Checks: focused ESLint PASS; tsc PASS; invalid-payment redirect kept supplier PASS; 1 VND QA disbursement success redirect kept supplier/notice/payment PASS; reversal via UI PASS; supplier AP outstanding returned to 2,877,269 VND.
- Result: targeted QA PASS; Production NOT_TOUCHED.

### IMP-208 — Audit notice/quotation transitions (2026-09-30)
- Scope/gap: P2 missing audit events for payment notice rejection and quotation send/accept; Audit Log full entity filters stripped `_`.
- Changed paths: `supabase/migrations/20260930025839_audit_notice_quote_transitions.sql`, `src/app/admin/audit/page.tsx`, `src/modules/audit/server.ts`.
- Evidence: `artifacts/qa/owner-uat-20260928/report-193-notice-quote-audit-retest.md`.
- Checks: QA guard/migration PASS; focused ESLint PASS; tsc PASS; Owner UI + QA DB send/accept and notice review/rejection PASS; Audit Log UI full entity filters and Vietnamese summaries PASS.
- Result: targeted QA PASS for new events; old events not backfilled; Production NOT_TOUCHED.

### IMP-209 — QA PDF appearance and long-terms boundary (2026-09-30)

- Scope: targeted QA retest of Delivery Note, Quotation PDF, Receipt/Payment Voucher, Debt Statement, and Customer 360 debt-statement link after localization/print changes.
- Changed paths in this batch: `src/app/api/deliveries/[id]/note/pdf/route.ts`, `src/app/api/quotation-revisions/[id]/pdf/route.ts`, `src/app/api/payments/[id]/voucher/pdf/route.ts`, `src/app/api/customers/[id]/debt-statement/pdf/route.ts`, `src/app/admin/customers/[id]/page.tsx`, `artifacts/qa/owner-uat-20260928/report-194-pdf-visual-retest.md`.
- New evidence: five representative PDFs render in Vietnamese without visible clipping; Customer 360 link returns a valid PDF. Long-terms QA draft `QT-2026-000014` proves 2119 UI characters become 1000 stored `commercial_terms`, then PDF omits part of the stored terms. See `report-194-pdf-visual-retest.md`.
- Reused evidence: prior focused ESLint and TypeScript PASS for the five application files; prior ordinary-document PDF render samples.
- Checks/result: targeted HTTP/PDF/render/link PASS for representative documents; long-terms completeness FAIL. No full-suite check. No claim of Production verification.
- Blocker: intended commercial-terms length contract needs Owner decision before a further code change. Production impact: NOT_TOUCHED.

### IMP-210 — targeted QA Storage retest (2026-09-30)

- Scope: QA Storage upload/type/size, worker evidence and signed URL expiry; no application or schema edits in this batch.
- Changed paths: `artifacts/qa/2026-09-30T03-26-12-205Z-storage/manifest.json`, `artifacts/qa/2026-09-30T03-26-12-205Z-storage/sha256.txt`, `artifacts/qa/owner-uat-20260928/report-195-storage-targeted-retest.md`.
- New evidence: `qa:guard` PASS for QA ref `ffrwiglcrlumfvhubaxg`; `qa:storage` manifest PASS for allowed PNG/JPG/PDF, expected rejection of SVG/fake JPG/oversized PNG, worker evidence and signed URL expiry. See `report-195-storage-targeted-retest.md`.
- Reused evidence: none for this run; generated manifest is the source of check details.
- Checks/result: technical Storage PASS; human offline retry NOT_RUN, Production NOT_TOUCHED. No full suite and no claim of physical-device UAT.
- Blocker: human offline/device retry remains outside this automated retest; local application build is `local-unpinned`.

### IMP-211 — QA Worker finance-PDF denial and cancel negative checks (2026-09-30)

- Scope: targeted QA security/optimistic-lock checks; no application or schema edits.
- Changed path: `artifacts/qa/owner-uat-20260928/report-196-pdf-worker-and-cancel-boundaries.md`.
- New evidence: authenticated QA Worker receives 404 for an existing Customer debt-statement PDF which Owner receives as HTTP 200/PDF; Worker `cancel_planned_delivery` call rejects with `42501 forbidden`; Owner stale-version call rejects with `40001 delivery_cancel_version_conflict`. The QA delivery remains `PLANNED` version 1. See report-196.
- Reused evidence: IMP-206 positive Owner cancellation/release and report-191; IMP-209 Customer 360 Owner PDF link and report-194.
- Checks/result: focused SEC/IDEM boundary checks PASS on QA; role-matrix and Production checks NOT_RUN. No full suite.
- Blocker: none for these narrow checks. Production impact: NOT_TOUCHED.

### IMP-212 — Service Job cancellation gap confirmed (2026-09-30)

- Scope: read-only QA route and DB-catalog investigation of Service Job cancellation.
- Changed path: `artifacts/qa/owner-uat-20260928/report-197-service-cancel-gap.md`; no application, schema or QA data change.
- New evidence: QA `SCHEDULED` unpublished service fixture has no cancel CTA; list offers `Đã hủy` filter; no public cancel Service Job/WorkItem RPC exists. See report-197.
- Reused evidence: existing synthetic fixture and QA authenticated Owner browser session.
- Checks/result: targeted UI/catalog audit PARTIAL; no mutation or full regression.
- Blocker: cancellation semantics for published/active/verified jobs need contract confirmation before backend/UI work. Production impact: NOT_TOUCHED.

### IMP-213 — purchase evidence gap confirmed (2026-09-30)

- Scope: read-only QA audit of PO, source-linked receipt/direct fulfillment, purchase invoice registry and AP detail.
- Changed path: `artifacts/qa/owner-uat-20260928/report-198-purchase-evidence-gap.md`; no application, schema or QA data change.
- New evidence: inspected PO/AP source links work; 10 QA purchase registry rows are all `PENDING_DOCUMENT` with no evidence; zero receipt/fulfillment rows carry evidence. PO forms observed lack evidence control although receipt and fulfillment RPCs accept `target_evidence_id`. See report-198.
- Reused evidence: QA Storage automated PASS in report-195 establishes the upload primitive, not purchase-document linkage or legal validity.
- Checks/result: targeted UI and DB-catalog audit; purchase evidence workflow PARTIAL; real supplier-document gate BLOCKED. No full regression.
- Blocker: no real legal supplier documents in synthetic QA data; post-hoc attachment transition needs contract before implementation. Production impact: NOT_TOUCHED.

### IMP-214 — purchase source-time evidence upload (2026-09-30)

- Scope: warehouse PO receipt and supplier-direct fulfillment evidence upload/link/read at the existing backend seam; no schema or business amount change.
- Changed paths: `src/app/admin/purchase-orders/[id]/page.tsx`, `src/modules/inventory/actions.ts`, `src/components/purchasing/purchase-evidence-upload.tsx`, `src/app/api/purchasing/evidence/upload/route.ts`, `src/app/api/purchasing/evidence/[id]/signed/route.ts`, `artifacts/qa/owner-uat-20260928/report-199-purchase-evidence-qa-retest.md`.
- New evidence: UI-created QA direct fulfillment and warehouse receipt each link VERIFIED inventory evidence and create exactly one AP obligation; warehouse flow has one stock movement. Owner can use signed links; Worker denied; invalid file denied; same-operation retry yields one row/object. See report-199.
- Reused evidence: IMP-213 gap analysis; existing RPC validation of branch and VERIFIED evidence; QA guard for ref `ffrwiglcrlumfvhubaxg`.
- Checks/result: focused ESLint/TypeScript PASS, direct and warehouse QA technical flows PASS, targeted SEC/IDEM checks PASS. No full regression.
- Open blocker: route/UI currently advertise 10 MB although Vercel Function body limit is 4.5 MB; Owner decision requested for direct Supabase upload versus 4 MB cap. Real supplier legal documents unavailable. Production impact: NOT_TOUCHED.

### IMP-215 — scheduled unpublished Service Job cancellation (2026-09-30)

- Scope: versioned, reason-audited cancellation limited to `SCHEDULED` jobs with no WorkItem/verification; no retroactive editing of performed service.
- Changed paths: `supabase/migrations/20260930050137_cancel_scheduled_service_job.sql`, `src/modules/workforce/actions.ts`, `src/app/admin/service-jobs/[id]/page.tsx`, `artifacts/qa/owner-uat-20260928/report-200-service-cancel-qa-retest.md`.
- New evidence: Owner QA UI transitioned synthetic job v1 to CANCELLED v2 with command receipt and audit reason; Worker, stale-version and published-job calls rejected; same-operation replay returned original ID; list filter finds cancellation. See report-200.
- Reused evidence: report-197 confirmed missing cancellation path; existing service state check includes CANCELLED and publish command locks SCHEDULED source.
- Checks/result: QA guard/migration PASS, focused ESLint/TypeScript PASS, targeted UI/SEC/IDEM checks PASS. No full suite.
- Blocker: detail badge and audit sentence retain English `CANCELLED`/`cancel`; localization decision requested. Later-state cancellation remains outside this bounded command. Production impact: NOT_TOUCHED.

## IMP-216 | QA targeted follow-up | 2026-09-30

- scope: purchase evidence offline retry; hosted candidate fingerprint; QA backup capability; QA rollback/CPU investigation.
- gap_ids: purchase upload hosted size mismatch OPEN; `NEW_GAP-QA-CPU-01` INVESTIGATING.
- changed_paths: `artifacts/qa/owner-uat-20260928/report-202-storage-offline-retry.md`; `report-203-hosted-candidate-fingerprint.md`; `report-204-qa-backup-capability.md`; `report-205-qa-rollback-flood.md`. No application source or schema change in this batch.
- new_evidence: QA local Owner browser offline upload failed visibly, retry returned 200; one VERIFIED evidence row and one Storage object. Two visible Vercel Hiền Xa projects' latest deployments were 2026-09-23 commit `25fb537`, not the local-unpinned QA fixes. Supabase QA Free has no project backups. QA dashboard reported high CPU; sampled 947-1427 rollbacks/sec; PostgreSQL logs repeated `approve_stock_count` SQLSTATE 40001. Available Gateway pathname filter did not show that RPC; stock-count UI code had only manual forms, and no obvious local QA stock-count script was running.
- reused_evidence: IMP-210 Storage automated checks; IMP-214 purchase evidence small-file source-time linkage; IMP-215 Service Job cancellation.
- checks: `UI:NEW PASS` offline retry on QA local; `DB:NEW PASS` one VERIFIED evidence/object; `PERF:NOT_RUN` hosted candidate mismatch and QA load; `MIG:BLOCKED` managed backup unavailable on QA Free. No full regression run.
- result: PARTIAL. Offline retry closed for the local QA path only. Hosted 10 MB upload, representative p95/p99, managed restore, and source attribution for QA rollback flood remain open.
- blocker: decisions on quotation terms, hosted upload strategy, Service Job wording; external QA load source; hosted candidate; managed recovery capability; provider/Owner gates as previously recorded.
- production_impact: NOT_TOUCHED.

## IMP-217 | Independent audit remediation | 2026-09-30

- scope: five findings from the independent acceptance audit; application, QA harness, migration-history recording and acceptance coverage only.
- gap_ids: delivery-business-time; qa-migration-ledger-drift; dashboard-customer-option-cap; uat-stale-grant-and-browser-cleanup; acceptance-docset-drift.
- changed_paths: src/lib/core/business-time.ts; src/lib/core/business-time.test.ts; src/modules/delivery/actions.ts; src/app/admin/deliveries/[id]/page.tsx; src/app/admin/page.tsx; scripts/qa/uat.mjs; supabase/migrations/20260930101520_custom_rpc_conflicts.sql; acceptance.md; implementation.md.
- new_evidence: implementation changes only, NOT execution evidence. Delivery normalizes Vietnam datetime-local inputs to UTC and displays timestamps in the business timezone; invalid calendar/time inputs are rejected and regression assertions were added. Dashboard customer search is server-side, bounded, deterministically sorted, preserves the selected customer independently of the option limit and stores search/filter state in the URL. QA revoke resolves the current active grant by persona/branch, conditionally restores that same grant without overwriting concurrent access changes, and closes its browser even if restoration fails.
- migration_delta: added the exact version/name and recorded SQL for 20260930101520_custom_rpc_conflicts from the audit's QA ledger evidence. Existing migrations were not rewritten. No SQL was executed and no managed migration ledger was repaired. Clean-schema replay and a fresh read-only ledger comparison remain NOT_RUN.
- doc_delta: acceptance metadata now references HX-V2-DOCSET-4.4/SYNC-4.4; ACC-085 maps all 23 SPEC-GAP-002 entries and recovery requirements onto the existing 30 case groups, with explicit delta checks. ACC-CASE-29 distinguishes actual legacy migration from NO_LEGACY_DATA_TO_MIGRATE. Spec.md, UXUI.md and plan.md are unchanged; no performance budget was copied.
- reused_evidence: NGHIEM_THU_HIEN_XA.md and /Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/qa-extra-migration.json are reused only to identify the prior defects and recorded QA SQL, not to prove the changed candidate passes. Checks touching the changed time handling, Dashboard filter, revoke harness, migration set or acceptance mapping require new evidence; unrelated evidence is not globally invalidated.
- checks: UNIT/UI/DOC/DB/SEC/MIG/build/typecheck = NOT_RUN after this patch. No smoke-test layer, full regression, QA data mutation or cleanup was run.
- result: IMPLEMENTED_UNVERIFIED; all five findings have a proposed remediation in the working tree, but are not closed as PASS without focused verification.
- blocker: focused verification and isolated schema rehearsal are pending separate authorization; external/provider/managed-recovery/real-device gates remain separate and are not upgraded by this patch.
- production_impact: NOT_TOUCHED. No Production data/config mutation, migration, deploy, commit, push or merge.

## IMP-218 | Focused verification of five remediation changes | 2026-09-30

- scope: IMP-217 application-time, Dashboard customer options, QA grant revoke/cleanup, migration recording and acceptance references; isolated source snapshot, localhost production-mode build, Supabase QA ffrwiglcrlumfvhubaxg.
- candidate: source fingerprint 8473bf027ebe6512f2ccef1678a16dde2a03852809872e75bc4eac1751660dca; build 19hvlMR6neCqCrwIOKGZb. Baseline commit is only prior-audit metadata, not a fresh Git/remote assertion.
- checks: UNIT:NEW PASS 13 cases in UTC and 13 in business timezone; QA harness:NEW PASS 4 cases with fresh schema/seed replay; focused lint/typecheck/build:NEW PASS; MIG ledger:NEW PASS 66/66 and exact recorded SQL checksum; UI Dashboard:NEW PASS customer rank 3118, selected/search retention and bounded options; UI Delivery:NEW PASS 08:30 VN -> 01:30Z -> reload 08:30, two lines, PLANNED; SEC/UAT revoke:NEW PASS real next-request denial plus exact restore and 3 cleanup/precondition fault cases.
- DOC:NEW FAIL missing PLAN-R0 and PLAN-180 in acceptance.md against plan.md 4.4. Metadata/case/gap-row coverage passed separately; acceptance result remains PARTIAL.
- new_gap: adjacent P2 SO requested-delivery display uses server timezone at src/app/admin/orders/[id]/page.tsx:47. QA DB 2026-11-03T05:00Z displayed 05:00 on UTC rather than business 12:00. Not repaired in this verification-only run.
- preserved_failures: pnpm snapshot dependency hook/unsafe modules rejection; build env-file worker flag; Owner context probes before protected page readiness; consumed/DRAFT fixture failures. These remain in raw logs and are not converted to PASS.
- evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-targeted-20260930-8473bf02; NGHIEM_THU_HIEN_XA.md follow-up section. Prior old audit results only provide baseline/root-cause evidence, not validation of this candidate.
- result: four original findings verified PASS; acceptance PARTIAL with reference check FAIL; additional SO display finding OPEN. Full-system/release gate not assessed.
- QA mutations: synthetic SO-2026-000028 confirmed through UI; DL-2026-000016 created through UI and left PLANNED, no dispatch/verify/payment/invoice/message. Sales grant restored exactly; owned browser/server closed; no cleanup/seed reset.
- blocker: repair two acceptance references and adjacent SO rendering; full human/external/performance/recovery gates remain separate.
- production_impact: NOT_TOUCHED. No managed schema change, git mutation, deploy, cutover or Owner acceptance.


## IMP-219 — Remaining reference and SO date display fixes | 2026-10-01

- scope: ACC-CASE-01/30 source references and Sales Order requested delivery date rendering.
- gap_ids: dangling PLAN-R0/PLAN-180 references; observed SO detail timezone defect (P2).
- changed_paths: acceptance.md; src/app/admin/orders/[id]/page.tsx; implementation.md; NGHIEM_THU_HIEN_XA.md.
- delta: ACC-CASE-01 retains canonical Spec requirements and references PLAN-040 for its check strategy; no equivalent R0 phase rule is invented. ACC-CASE-30 references PLAN-055 for R12 authorization boundaries and PLAN-070 for completion/human gates. SO detail uses existing formatBusinessDateTime (Asia/Ho_Chi_Minh), leaving stored UTC and business rules unchanged.
- new_evidence: implementation changes only; no new execution evidence.
- reused_evidence: prior targeted run 8473bf027ebe6512f2ccef1678a16dde2a03852809872e75bc4eac1751660dca establishes the two missing IDs and UTC SO display defect; it does not validate the changed candidate.
- checks: DOC:NOT_RUN; UI:NOT_RUN; lint/typecheck/build:NOT_RUN. No automatic promotion of prior REFERENCE_CHECK=FAIL or acceptance PARTIAL to PASS.
- result: fixes implemented; verification pending.
- blocker: fresh targeted verification is not authorized in this turn.
- production_impact: NOT_TOUCHED; no schema, migration, DB, commit, push or deployment operation.


## IMP-220 — Reference and SO workflow verification | 2026-10-01

- scope: corrected plan refs, complete acceptance ID/log-anchor check, SO timezone/read navigation/list interactions and one synthetic draft create/edit workflow.
- candidate: a95d8eb850aa07b55e769935b7c211b6855b2410dc9afe21fbf8b855db93adc6; build MtxgAPy1CsjrNPuY345oH; local app http://127.0.0.1:4024; separate Supabase QA ffrwiglcrlumfvhubaxg; server UTC / browser Asia/Saigon.
- changed_paths: NGHIEM_THU_HIEN_XA.md; implementation.md (verification deltas only); evidence /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-ref-20261001-a95d8eb8. No application source/test/config edits.
- new_evidence: DOC plan refs PASS; full 141-ID reference check FAIL (missing implementation log section); implementation-heading check FAIL; 14/15 focused UI PASS with mobile overflow FAIL; QA persisted edited-draft DB PASS; guard/build/affected lint NEW PASS.
- reused_evidence: unchanged formatter UNIT UTC/VN and unrelated schema/security checks from prior targeted candidate 8473bf02; no new full-suite or release claim.
- findings: DOC-LOG-ANCHOR-01 P2 CONFIRMED_PREEXISTING (acceptance references a missing canonical log section); SO-MOBILE-OVERFLOW-01 P2 CONFIRMED (SO detail page line 48, viewport 390/document 798, UX-800.1). Neither fixed in this verification-only turn.
- runner_failures: invalid total_vnd base-table query, ambiguous subtotal/total selector, and wrong parent selector retained as runner/setup failures, not application defects; all before draft Save. Final scoped draft checks PASS.
- qa_delta: UI-created and UI-edited SO-2026-000033 / 644cf877-d971-463a-aa45-dfad12aeae54; final DRAFT/NOT_STARTED/NOT_DUE, 22000, 2026-11-07T03:15Z; double-click created one draft. No confirmation/payment/dispatch/invoice/message.
- result: original fixes VERIFIED; focused scope NOT_ACCEPTED because of two remaining findings. Global ERP, Production, real-device UAT and release gate remain outside this run.
- blocker: remaining mobile and documentation defects need separately authorized remediation. Production/hosted and other workflows NOT_RUN.
- production_impact: NOT_TOUCHED; no schema/migration/grant/role change, Git, PR, push or deploy. Owned server 4024 and browser/DB resources closed.



## IMP-ACCEPT-001 — Acceptance evidence index

This section is the stable log destination referenced by acceptance.md. Executed results remain tied to their recorded candidate and environment; this index does not approve release or substitute for Owner UAT.

| Run | Scope | Candidate | Executed result | Evidence |
|---|---|---|---|---|
| IMP-220 | References and focused SO workflows | a95d8eb850aa07b55e769935b7c211b6855b2410dc9afe21fbf8b855db93adc6 | 14/15 focused UI PASS; mobile overflow FAIL; full DOC references FAIL on the missing log section in that snapshot | [Run manifest](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-ref-20261001-a95d8eb8/verification-summary.json) |

- Latest executed run: IMP-220, local QA build with Supabase QA ffrwiglcrlumfvhubaxg.
- Original artifacts and failed runner attempts are preserved in the linked run; no result is retrospectively changed to PASS.
- Remediation checkpoint: IMP-221 below. Post-fix DOC/UI checks are NOT_RUN; the former run cannot verify the changed SO layout.
- Production and hosted Preview verification, real-device UAT and release approval are not established by this index.

### Latest executed verification update | 2026-10-01

The historical IMP-220 entry above is retained. Its latest-run note is superseded by IMP-222: DOC references/headings PASS (141/141), SO responsive/read-only UI PASS (13 scoped cases after preserving and classifying two runner false positives), fingerprint `28ff806cfecd593c7cc885885e6580b13e507f2bfb804840619dc53f0f839c89`.

Evidence: [IMP-222 verification manifest](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-responsive-20261001-28ff806c/verification-summary.json). Production and Owner acceptance are not covered by this scoped result.

## IMP-221 — Acceptance log anchor and SO mobile remediation | 2026-10-01

- scope: DOC-LOG-ANCHOR-01 and SO-MOBILE-OVERFLOW-01 from IMP-220.
- gap_ids: DOC-LOG-ANCHOR-01 (P2); SO-MOBILE-OVERFLOW-01 (P2).
- changed_paths: src/app/admin/orders/[id]/page.tsx; src/app/admin/orders/[id]/order-detail.module.css; implementation.md; NGHIEM_THU_HIEN_XA.md.
- delta: provides a real IMP-ACCEPT-001 evidence index without changing acceptance requirements or historical verdicts. SO uses a local CSS Module to constrain grid-child minimum widths and turn the existing line table into labeled cards below the established mobile breakpoint. Explicit table/row/cell semantics and column headers are retained; supply actions are not duplicated or removed.
- new_evidence: implementation changes only; no new executable verification.
- reused_evidence: IMP-220 reproductions identify the actual missing section and 390px/798px overflow. Unchanged business-time, financial calculation, form/RPC and permission inputs remain available for scoped evidence reuse; prior SO layout/UI evidence does not validate the new layout.
- checks: DOC:NOT_RUN; UI:NOT_RUN; lint/typecheck/build:NOT_RUN. No full-suite run or automatic PASS.
- result: both fixes implemented; post-fix verification pending.
- blocker: fresh targeted DOC and SO mobile/desktop checks require authorization.
- production_impact: NOT_TOUCHED; no business requirement, schema, migration, DB, role/grant, commit, push or deployment change.

## IMP-222 - DOC and SO responsive verification | 2026-10-01

- scope: acceptance ID/heading/metadata validation; isolated QA SO DRAFT + CONFIRMED responsive detail, read-only navigation, datetime/line totals/reload.
- gap_ids: missing IMP-ACCEPT-001 and UX-800.1 SO 390px overflow FIX_VERIFIED. OBS-SO-001 non-blocking raw decimal display; not a confirmed business-contract defect.
- tested_fingerprint: `28ff806cfecd593c7cc885885e6580b13e507f2bfb804840619dc53f0f839c89`; 322 input files; build `k9s8pRgGHa4wWbtigzhR-`. Baseline commit metadata reused, not a fresh Git/remote assertion.
- changed_paths: implementation.md and NGHIEM_THU_HIEN_XA.md evidence deltas only; no application/schema/config/test-source change.
- new_evidence: [verification-summary.json](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-responsive-20261001-28ff806c/verification-summary.json), [detailed report](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-responsive-20261001-28ff806c/NGHIEM_THU_DOC_SO.md), screenshots/command logs in that evidence bundle.
- reused_evidence: IMP-220 only for unchanged DRAFT-create/edit, list and anonymous-boundary inputs; its prior DOC/mobile failures are preserved.
- checks: DOC NEW PASS 141/141 with actual PLAN/IMP headings and docset markers; UI NEW PASS 13 scoped cases; focused ESLint/typecheck/build NEW PASS exit 0.
- check_history: initial UI command exit 1 (11 PASS, 2 CTA-bound false positives); diagnostic had duplicate-link-name selector failures; focused per-line access/reload PASS 2/2. Original failures retained in artifacts, not hidden or fixed by source mutation.
- result: PASS_TARGETED_SCOPE; both just-remediated findings verified. Not full ERP/Owner acceptance or Production release gate.
- blocker: NONE for this scope. Hosted Production, real-device, full financial/security/provider/recovery gates NOT_RUN this turn.
- production_impact: NOT_TOUCHED; business writes=0; owned local server/browser/DB session closed.


## IMP-223 - Authorized Production deployment | 2026-10-01

- scope: latest Owner instruction "ok deploy production nhé"; deploy previously checked candidate source to existing hienxa/hien-xa-erp-v2.
- source_reference: IMP-222 QA input fingerprint `28ff806cfecd593c7cc885885e6580b13e507f2bfb804840619dc53f0f839c89`, stamped as deployment metadata `hxSourceFingerprint`. This is snapshot identity, not a Git commit or full Production acceptance.
- deployment: `dpl_FN2DioAPhpj3SLkdWsv53J3RSDAz`; target Production; READY; CLI exit 0; Vercel cloud build completed in 34s.
- production_url: https://hien-xa-erp-v2-nu.vercel.app
- immutable_deployment_url: https://hien-xa-erp-v2-kk3khw1yc-hienxa.vercel.app
- prior_ready_production: https://hien-xa-erp-v2-2rnzgsn67-hienxa.vercel.app (captured rollback reference; no rollback performed).
- environment: existing Vercel Production variables; Supabase nbwynrwkdbtfsitafsxa; QA runtime disabled; QA env keys absent. Private downloaded environment file removed; not uploaded or archived.
- changed_paths: implementation.md / NGHIEM_THU_HIEN_XA.md log deltas only in workspace; previously checked source shipped through isolated deployment copy.
- new_evidence: [deployment record](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-production-20261001-FN2DioAP/deployment-record.json), [deployment output](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-production-20261001-FN2DioAP/deploy.stdout), [build/deploy log](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-production-20261001-FN2DioAP/deploy.log).
- reused_evidence: IMP-222 DOC/SO targeted QA result only; not reclassified as Production functional PASS.
- checks: remote build/deploy NEW READY, exit 0. Post-deployment app/login/SO/business/RLS checks NOT_RUN; Owner UAT and release gate not inferred.
- configuration: no Vercel environment/domain/protection mutation beyond normal Production alias assignment; output still reports vercel_authentication protection; public Production-alias accessibility NOT_TESTED.
- result: DEPLOYMENT_COMPLETE; GitHub NOT_PUSHED / no PR / no commit requested in this turn.
- blocker: NONE for requested deployment.
- production_impact: application deployment and standard Production alias promotion authorized/completed; database/schema/migration/seed/business DML NOT_TOUCHED.

## IMP-224 - Production Owner login and SO read-only verification | 2026-10-01

- scope: Owner-approved post-deploy verification of login and SO read flows on Production; no business submit/source fix.
- target: https://hien-xa-erp-v2-nu.vercel.app; Vercel alias resolves to `dpl_FN2DioAPhpj3SLkdWsv53J3RSDAz`, Production READY.
- source_reference: IMP-222 QA input fingerprint `28ff806cfecd593c7cc885885e6580b13e507f2bfb804840619dc53f0f839c89`; deployment IMP-223. Not a refreshed Git/remote assertion.
- changed_paths: implementation.md and NGHIEM_THU_HIEN_XA.md evidence deltas only; application/schema/config/test source unchanged.
- new_evidence: [Production report](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-production-so-20261001-FN2DioAP/NGHIEM_THU_PRODUCTION_SO.md), [UI matrix](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-production-so-20261001-FN2DioAP/production-ui.json), [summary](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-production-so-20261001-FN2DioAP/verification-summary.json), screenshots in same artifact bundle.
- checks: UI NEW PASS for 15 focused checks; one initial SO3 selector timeout raw FAIL retained, exact page subsequently rendered without retry/navigation; root cause NOT_ESTABLISHED, warning preserved. Console zero captured error/warn. Public login and health NEW HTTP 200; Vercel alias NEW MATCH.
- operational_ux: 390px overflow fix VERIFIED on Production SO4, native table at 1440px; line totals/list/detail/reload/edit-prefill/Back/GET filters/empty state correct on four existing UAT DRAFTs.
- gap_delta: no new persistent functional defect reproduced in scope; OBS-SO-001 raw-decimal display also observed on Production (P3, non-blocking presentation).
- limits: CONFIRMED/Delivery navigation, non-null scheduled time, representative pagination NOT_RUN (fixtures absent). Other roles/security/write/finance/inventory/provider/recovery/PERF/full ERP acceptance OUT_OF_SCOPE.
- result: PASS_SCOPED_FUNCTIONAL_WITH_WARNING; full SO/full ERP release acceptance remains unproven.
- production_impact: READ_ONLY_BUSINESS; no migration/seed/SQL DML/create/save/confirm/cancel. Necessary authorized Owner authentication only; no credential/JWT/browser storage state archived.
- cleanup: temporary viewport reset; Owner tab left open at SO list; no logout of other sessions.


### IMP-225 | SO notes: exact quantity display and focused QA evidence (2026-10-01)

scope=SO remaining-quantity display + readiness-timeout diagnosis + CONFIRMED SO/Delivery/time read coverage
gap_ids=OBS-SO-001; missing CONFIRMED/Delivery read fixtures in Production audit (closed on QA only); historical readiness warning (not declared fixed on Production)
changed_paths=src/app/admin/orders/[id]/page.tsx (prior local display-only patch), implementation.md, NGHIEM_THU_HIEN_XA.md
new_evidence=/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-notes-20261001-1b4f4572/verification-summary.json; qa-ui.json; fixture-before.json; fixture-after.json; confirmed-so-mobile.png; related-delivery.png
reused_evidence=IMP-222 unchanged canonical reference evidence and unaffected checks on frozen baseline; prior Production failure retained as warning
checks=NEW QA_GUARD:PASS; BUILD:PASS exit 0; UI:17 PASS / 0 functional FAIL; DB_READ_BEFORE_AFTER:PASS exit 0, unchanged fixture; deliberate absent-heading timeout control EXPECTED_TIMEOUT after 3052 ms despite timeoutMs=20000
result=shortage display VERIFIED_ON_QA_NOT_DEPLOYED; CONFIRMED/Delivery/VN time/reload/backlink coverage CLOSED_ON_QA; tool timeout-option discrepancy reproduced, no QA application timeout reproduced
blocker=exact historical Production timeout root remains NOT_ESTABLISHED; Production CONFIRMED/Delivery verification NOT_RUN; no full-system or release acceptance inferred
candidate=1b4f4572b2c17ebd67316fa2c12469ec32dc4a115f94fc15516f8ab06c45097f; build=1Ux4JwWkAQp-j5UghaF8R; scope is frozen IMP-222 snapshot plus exact current SO display patch, not the entire current worktree
production_impact=NOT_TOUCHED; business_submissions=0; deploy=NOT_RUN; no schema, Spec, UXUI or plan changes


### IMP-226 | Main auth integration and scoped release verification (2026-10-01)

scope=preserve main internal auth routing + retain local recovery surface; publish current validated audit/SO candidate
changed_paths=src/lib/auth/actions.ts; implementation.md; NGHIEM_THU_HIEN_XA.md
new_evidence=/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-auth-release-20261001-79390112/verification-summary.json; auth-focused.json; auth-ui.json; denial-server-evidence.json
reused_evidence=IMP-225 unchanged SO/Delivery/display/time/reload evidence; auth entry freshly tested
checks=NEW AUTH_HARNESS:23 PASS exit 0; ACCESS_POLICY:3 PASS exit 0 (initial snapshot config/alias failure exit 1 preserved); LINT:PASS exit 0; TYPECHECK:PASS exit 0; BUILD:PASS exit 0; UI:6 PASS / 0 FAIL; QA_GUARD:PASS; DB_READ_BEFORE_AFTER:PASS unchanged
result=integrated main / role-aware routing; recovery surface preserved; customer destination unchanged; Worker direct admin denied server-side
blocker=NONE for authorized PR/deployment; historical Production timeout/full-system acceptance remain outside this check
candidate=79390112fc6b5cb8b915e3d1572be5bbaf45a6eec94ea9c0d28db770ddab8694; build=YkF9hgVtlLlsBS3T9yggS
production_impact=NO_DATA_WRITES; no schema, migration, role/RLS, password or config mutation; Production deploy separately authorized and pending

## IMP-227 - PR and authorized Production deployment (2026-10-01)

scope=Publish the verified SO/auth integration and synchronize previously deployed audit repairs into Git
gap_ids=SO quantity display; permission-aware internal auth integration
changed_paths=Git branch codex/so-qa-notes-20261001; deployment metadata; this log and independent acceptance report
new_evidence=PR #12 https://github.com/MutAquaticStudio/HienXaERPv2/pull/12; commit f9b8167ccf307a151284773ceedd8c496fd09108; deployment dpl_DBNNwXzLAyX5vmyvE9suQwh2dB2C; /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-release-20261001-f9b8167/release-summary.json
reused_evidence=IMP-225 scoped SO/Delivery checks; IMP-226 integrated auth QA checks; no full-system acceptance inferred
checks=NEW Production build/deploy exit 0, READY; input comparison initially FAIL for generated next-env.d.ts, resolved by exact match with successful QA build declaration; GitHub Vercel integration statuses FAIL (two contexts; link to blocked-deployment guidance), not relabeled PASS; GitHub Actions result NOT_OBSERVED
result=PR CREATED and OPEN (not merged); authorized Production DEPLOYED at https://hien-xa-erp-v2-nu.vercel.app from the verified integrated candidate
blocker=GitHub Vercel integration checks not green; cause not established by this deployment. Historical browser-wait timeout cause remains NOT_ESTABLISHED.
production_impact=Application deployment only. No migration, SQL/DML, grant/RLS/password mutation, provider request or real messaging performed.
candidate_fingerprint=79390112fc6b5cb8b915e3d1572be5bbaf45a6eec94ea9c0d28db770ddab8694
rollback_candidate=dpl_FN2DioAPhpj3SLkdWsv53J3RSDAz (previous Production deployment; not executed)

## IMP-228 - Production redeploy using the new Vercel account (2026-10-01)

scope=Owner explicitly requested deployment using the new account
changed_paths=Deployment metadata; this implementation log; acceptance publication delta. No application source changes.
new_evidence=/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-new-account-deploy-20261001-EnXzoXs/deployment.json; CLI account thunderekt-6020 and team hienxa verified before deployment; deployment dpl_EnXzoXsCWZs38LGd73ADTknscDbT
reused_evidence=IMP-225 SO/Delivery scoped checks; IMP-226 integrated auth candidate 79390112fc6b5cb8b915e3d1572be5bbaf45a6eec94ea9c0d28db770ddab8694
checks=NEW Production build/deploy PASS, exit 0, READY; affected QA evidence REUSED. No new UAT or full regression performed.
result=Production READY at https://hien-xa-erp-v2-nu.vercel.app from commit f9b8167ccf307a151284773ceedd8c496fd09108
blocker=NONE for this deployment. No claim that historical GitHub blocked-account statuses were resolved.
production_impact=Application redeployment only. No migration, business DML, payment, paid-plan change, account switch, permission mutation or old-account/connector use.
rollback_candidate=dpl_DBNNwXzLAyX5vmyvE9suQwh2dB2C (not executed)


## IMP-UAT-ROLE-FLOWS-20261001 - Scoped UI acceptance, affected fixes and authorized application deployment

scope=Owner commercial/stock/AR/AP + Customer Finance/Receiver + Worker UI; rerun affected paths only
gap_ids=UAT-WORK-BRIDGE FIXED; UAT-DELIVERY-FEEDBACK FIXED; UAT-QUOTE-STATE FIXED; UAT-INVENTORY-CONTEXT FIXED; UAT-PORTAL-DATE FIXED; UAT-CREDIT-OVERRIDE OPEN P1
changed_paths=src/modules/workforce/delivery-actions.ts; src/components/delivery/work-item-bridge.tsx; src/app/admin/deliveries/[id]/page.tsx; src/modules/delivery/actions.ts; src/modules/portal/actions.ts; src/modules/portal/types.ts; src/app/customer/page.tsx; src/app/customer/orders/page.tsx; src/app/admin/inventory/page.tsx (previous prepared patch included); 3 focused test files; NGHIEM_THU_ROLE_FLOWS_20261001.md; implementation.md
new_evidence=/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-role-flows-20261001/acceptance-matrix.json; candidate.json; deployment.json; primary-alias.json; 21/24/26/28/29 JSON; 22/23/25/27 PNG
reused_evidence=unchanged normal Quote/SO/PO/receipt/handoff/verify/payment/portal boundaries collected in this turn on baseline fingerprint ec0a25e9fef4494d7647d6b1600b968fa6bad1203f765c52e94dce6f3f2f19ab; new/error/portal-state paths rerun
checks=NEW UNIT 13/13 PASS exit 0; LINT final PASS exit 0 (initial purity FAIL retained and repaired); QA BUILD/TypeScript PASS exit 0 (initial harness NODE_OPTIONS FAIL retained); UI/DB affected fixes PASS; SEC Worker publish/verify denied 42501; Vercel deploy/promote PASS exit 0 READY; primary alias MATCH; Production inventory GET PASS
result=SCOPED_QA_PASS_WITH_OPEN_P1; CHUA_DAT full-system acceptance; no false PASS for missing external/real-device/failure-path gates
blocker=per-confirmation credit override needs controlled backend/schema migration; prior Production payment-state view semantic/migration gate unresolved; no Production Delivery fixture for write retest
candidate=86ce2240419bd8f444bd98e0e18a05691232bd6d717cad8e8ee8b343b2fef05c; QA build=9BLsmlf6vdV-I_1kxrJx7; Production=dpl_6WDcPcapj8X9iB1S2kUoLzZBTKSb; primary=https://hien-xa-erp-v2-nu.vercel.app
production_impact=APPLICATION_DEPLOYMENT_ONLY; no business writes/migration/schema/RLS/grant/password/real messaging/invoice; QA business writes through UI only; Git/PR/push NOT_RUN

## IMP-CREDIT-PAYMENT-20261002

- scope: RF08 per-confirmation credit exception; RF42 QA/Production financial-read alignment.
- contracts: SPEC-CRE-002/003; canonical SO payment-state/AR signed allocations. Spec/UXUI/plan unchanged.
- changed_paths: src/app/admin/orders/[id]/page.tsx; src/components/sales/credit-override.tsx; src/modules/sales/credit-override-actions.ts; src/modules/sales/credit-override-actions.test.ts; supabase/migrations/20261001182059_sales_order_confirmation_credit_override.sql; NGHIEM_THU_CREDIT_PAYMENT_20261002.md.
- candidate: /private/tmp/hx-credit-release-20261002-QoZqWS; fingerprint=d066659fd4255c86238f637023e8a35109ebc27c99e7816f95335dba8176f1c1; base=exact previous Production snapshot; 317 inputs; no unrelated changes deployed.
- new_evidence: QA migration applied; 12 unit cases, 33 real DB rollback cases PASS; UI required reason/approval/double-click attempt/reload/reconciliation PASS. One SO35 commitment, immutable decision and audit. Normal credit blocks preserved; no standing override or role grants.
- checks: UNIT:NEW PASS (5); UNIT:RERUN PASS payment-state (7); DB/SEC/IDEM/RACE:NEW PASS; UI:NEW PASS; affected lint/build/typecheck PASS. Advisors: no new-object findings; existing purchasing/inventory definer-view flags and permissive-policy warnings retained, not a whole-system SEC PASS.
- reused_evidence: previous unaffected role/business flow evidence remains scoped to its original build; no blanket reacceptance.
- result: RF08 QA_VERIFIED, Production_NOT_DEPLOYED; RF42 drift CONFIRMED, scoped bundle PREPARED, Production_BLOCKED_AUTHORIZATION.
- blocker: auto-review denied Supabase Production Run because explicit authorization for migrations 20260930000100/20261001084145/20261001182059 was not established. Owner confirmation requested; no bypass attempted.
- production_impact: read-only metadata inspection and prepared SQL editor query only; no Production DDL/business DML/config mutation/deploy executed. Production head remains 20260930101520; app remains dpl_6WDcPcapj8X9iB1S2kUoLzZBTKSb.
- evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-credit-payment-20261002; detailed boundaries and initial harness failures retained in NGHIEM_THU_CREDIT_PAYMENT_20261002.md.
- no_git: no commit/PR/push. R12/full-system gate not advanced; physical UAT and external gates remain separate.

## IMP-CREDIT-PAYMENT-PRODUCTION-20261002

- scope: authorized Production sync/deploy for RF08/RF42, supersedes the authorization blocker in IMP-CREDIT-PAYMENT-20261002.
- owner_authorization: explicit confirmation for migrations 20260930000100, 20261001084145, 20261001182059 and Production deployment. No bypass of the earlier auto-review denial.
- schema: exact three-migration bundle executed through logged-in Supabase browser in one guarded transaction, PASS; Production nbwynrwkdbtfsitafsxa head=20261001182059.
- checks: DB:NEW PASS fresh guards/post-check; customer_credit_exposure=3ff94241b3c6bd1a2997834a036b3ffe, sales_order_read=3f0aef6bd0493ee2eae5af8afd5c2043, exact QA parity; ACL/security_invoker preserved; order totals/fulfillment and financial/inventory/payment/commitment counts unchanged.
- SEC:NEW PASS affected metadata (decision RLS enabled; anon RPC execution denied; authenticated direct insert/update/delete denied). Security Advisor rerun: 6 existing definer-view ERROR flags outside affected objects, 126 warnings not fully triaged; no blanket SEC PASS.
- reused_evidence: 12 scoped unit cases, 33 transactional QA DB cases and QA UI approval/reload proof from the unchanged d066659fd4255c86238f637023e8a35109ebc27c99e7816f95335dba8176f1c1 candidate. No full acceptance rerun.
- deployment: account=thunderekt-6020; scope=hienxa; project=prj_o6ya9YI1b3fTFC8nxiOtjHiwaS3W; immutable 317-input manifest PASS; remote Next/Turbopack build+TypeScript PASS; deploy/promote exit 0; dpl_4TebnWLh4v8aaLD8uLU66V4dxCnv READY.
- primary: https://hien-xa-erp-v2-nu.vercel.app directly inspected, MATCH; unique=https://hien-xa-erp-v2-ewl6wo56p-hienxa.vercel.app; inspector=https://vercel.com/hienxa/hien-xa-erp-v2/4TebnWLh4v8aaLD8uLU66V4dxCnv.
- UI:NEW PASS affected Production reads; health HTTP 200; same four draft SOs with NOT_DUE; Owner SO4 detail renders the new one-confirmation credit snapshot/reason form. Approval was not submitted.
- result: RF08 IMPLEMENTED_QA_VERIFIED_PRODUCTION_DEPLOYED; RF42 QA_PRODUCTION_SCHEMA_READ_PARITY_PASS. No open blocker for this scoped sync/deploy.
- production_impact: authorized DDL/application deploy only; business_DML=0; role_assignments=0; no fake financial transaction. AR=0, allocations=0, override_decisions=0 after synchronization. Actual submitted approval/payment flows remain QA evidence.
- changed_paths: documentation delta only in NGHIEM_THU_CREDIT_PAYMENT_20261002.md and implementation.md; application source unchanged from the previously checked candidate; no Git/commit/PR/push.
- evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-credit-payment-20261002/production-migration-result.json, production-after.json, production-deployment.json, production-health.json, production-credit-form.png and advisor snapshots.
- release_boundary: focused delta complete; whole-system acceptance, outstanding advisor review, physical UAT and other external gates not advanced or silently marked PASS.

## IMP-SYSTEM-VERIFICATION-20261002

- scope: independent whole-system readiness verification against HX-V2-DOCSET-4.4/SYNC-4.4; report `NGHIEM_THU_TONG_THE_20261002.md`.
- candidate: `d066659fd4255c86238f637023e8a35109ebc27c99e7816f95335dba8176f1c1`; deployment `dpl_4TebnWLh4v8aaLD8uLU66V4dxCnv` READY and primary-domain MATCH by fresh inspect.
- changed_paths: acceptance report and this evidence delta only; application/tests/config/schema/tasks unchanged.
- new evidence: candidate Vitest exit1 (74 PASS; PO suite import blocked); ESLint exit0; isolated PGlite exit1 at Dashboard fixed-period assertion; workspace QA harness exit0 (4/4); QA guard PASS; migration head20261001182059; 42 view read queries with30 denial PASS and Owner positive controls; source-based financial readback; QA SO37→DL19 UI; Production SO4 reload and health200.
- test defects: VT-01 server-only import via purchasing/form-options; VT-02 fixed September Dashboard expectation against facts recorded at execution time. No repairs or green-only reruns performed.
- audit probes: initial SQL42703 (derived column on wrong relation) and customer-vs-order expectation810000/690000 retained separately as audit errors; diagnostic read confirmed SO37 revenue690000 + SO38 revenue120000 = customer October810000, SO37 receipts690000/AR0/PAID.
- reused evidence: same-candidate build/typecheck; relevant unchanged role-flow evidence; credit/payment33DB checks and UI evidence from prior scoped release. RF08/RF42 superseded by approved Production sync, not still-open defects.
- result: NOT_FULL_PASS; technical suite gate not passed; no new financial/authorization application defect reproduced within executed scope. Full exception journeys, administration/PDF, external provider, representative cloud performance, recovery and Owner gates remain incomplete as detailed by30 acceptance groups.
- security: six existing definer-view advisor flags and126 warnings not blanket cleared; fresh permission predicates/masking and30 denied reads mitigate tested paths, not a full-system SEC PASS. Stopped deep scan not restarted.
- production impact: READ_ONLY, NOT_CHANGED; no deployment/migration/DML/grant/new transaction. R12-06 remains IN_PROGRESS; no Owner acceptance substituted.
- evidence_path: `/private/tmp/hx-system-verification-20261002/`.

## IMP-SYSTEM-VERIFICATION-UI-20261002 — independent verification delta

- scope: frozen candidate `d066659fd4255c86238f637023e8a35109ebc27c99e7816f95335dba8176f1c1`; QA local app4040 + Supabase `ffrwiglcrlumfvhubaxg`; Production read-only evidence reused in this verification run.
- gap_ids: `VT-01` purchasing test import blocked; `VT-02` DB test period/fixture mismatch; `F-03` confirmed UX-850 ReturnCase validation redirect loses entered draft. No source fix in this audit.
- changed_paths: `NGHIEM_THU_TONG_THE_20261002.md`, this verification delta only. Application/test/config/requirement/schema files not changed.
- new_evidence: `/private/tmp/hx-system-ui-20261002/`; ReturnCase received qty1 and receipt reversal390000 via QA UI, 8+8 DB assertions; own209 worker earnings and total2107035 matched independent rows; foreign earnings and customer-id tamper denied; Finance/Receiver/Worker UI read/navigation; five PDF samples and filtered CSV; Storage signing allow/deny; responsive Worker390x844; tsc noEmit exit0.
- reused_evidence: valid role-flow/credit checks at documented candidate/baseline boundaries; initial system-verification unit/lint/DB/RLS/Production evidence. Pre-return/reversal PAID/cost430000 snapshots are historical, not current: SO37 now PARTIAL, AR390000, cost344000; customerAE AR510000.
- checks: UNIT=NEW run FAIL suite (74 executed PASS, purchasing import blocked); DB=NEW run FAIL fixed-period assertion, downstream unexecuted; LINT=REUSED PASS candidate; QA_TOOL=NEW 4/4 PASS main tooling, candidate export missing test harness kept separately; TYPE=NEW PASS0; UI/SEC/IDEM=selected cases only; PERF/EXT/MIG recovery/GATE not upgraded to PASS.
- result: full-system acceptance NOT_PASS; confirmed application issue F-03/P2; verification blockers VT-01/VT-02; other missing scenarios explicit PARTIAL/BLOCKED/NOT_RUN in report. No unauthorized feature requirement inferred from Receiver quote-read behavior.
- blocker: failed suites, incomplete exception/concurrency/positive portal-money scenarios, cloud representative PERF, provider sandbox/recovery/Owner gates and dirty Git handoff checkpoint. R12-06 state not advanced.
- production_impact: NOT_TOUCHED in this audit; no migration/config/grant/DML/deploy/commit/push. QA-only synthetic ReturnCase and reversal retained; browser logged out; no qa:cleanup/reset.

### IMP-P1P2-REPAIR-20261002

scope=VT-01, VT-02, F-03 acceptance repair; positive-zero validation defect
result=COMPLETE_FOR_SCOPED_QA_CHECKS; whole-system acceptance gates unchanged
changed_paths=scripts/test-r2-database.mjs; src/modules/delivery/actions.ts; src/app/admin/deliveries/[id]/page.tsx; src/components/delivery/open-return-case-form.tsx; src/modules/delivery/return-case-actions.test.ts; src/components/delivery/open-return-case-form.test.tsx
VT-01=current Purchasing mock already present; 4/4 baseline and final PASS; old frozen candidate evidence superseded only for this test boundary
VT-02=fixture/fact period aligned in isolated DB test; unchanged monetary expectations; explicit out-of-period zero check PASS
F-03=inline safe validation state; controlled draft preserved on failure; explicit transition submit; positive quantity requires >0; success-only draft/intent reset
checks=UNIT:RERUN PASS 16/16 affected; UNIT:REUSED 72 unaffected; LINT:RERUN PASS targeted; TYPE:RERUN PASS; DB:NEW PASS R2-R9 then REUSED; BUILD:NEW PASS webpack isolated QA; UI:NEW PASS negative/corrected-save/reload; QA_DB:NEW PASS read-only persistence
new_evidence=/private/tmp/hx-p1p2-checks-20261002; NGHIEM_THU_TONG_THE_20261002.md repair follow-up
fingerprint=18220dd63f9a88b94ecb4f7b86d302d874e940cf22ac9d14baab13b31e04746f; 317 source/build inputs
qa=ffrwiglcrlumfvhubaxg; localhost:4041; QA Owner; synthetic OPEN ReturnCase a37c1125-8d78-4103-8b19-0ac964e15a40 quantity 0.25 on second verification line
failed_attempts=86/88 then 87/88 unit logs retained; owner-approved corrections; two isolated build/environment failures retained; initial backend measurement column mismatch retained and corrected against real schema
limits=default Turbopack copy build NOT_VERIFIED (dependency symlink boundary); mobile/device UAT NOT_RUN; UI intent-id comparisons inconclusive due redaction, passing unit evidence used instead; no new whole-system/cloud-performance/external-recovery assertion
blocker=NONE_FOR_SCOPED_REPAIR; pre-existing release/human gates remain separate
production_impact=NOT_TOUCHED; no migration, DML, deployment, commit or push

### IMP-P1P2-PRODUCTION-DEPLOY-20261002

scope=deploy tested P1/P2 candidate after explicit Owner authorization
result=PRODUCTION_DEPLOYMENT_READY
account=thunderekt-6020; scope=hienxa; project=hien-xa-erp-v2; project_id=prj_o6ya9YI1b3fTFC8nxiOtjHiwaS3W
source_fingerprint=18220dd63f9a88b94ecb4f7b86d302d874e940cf22ac9d14baab13b31e04746f
candidate=/private/tmp/hx-p1p2-release-20261002-gEY07M; source deployment, not QA prebuilt output
checks=QA evidence REUSED from IMP-P1P2-REPAIR-20261002; cloud build NEW PASS; deploy exit 0; Vercel READY/production; remote metadata fingerprint MATCH; production alias MATCH; GET /login 200; GET /api/health 200 with status ok
production_supabase=nbwynrwkdbtfsitafsxa; existing Production environment retained
previous_deployment=dpl_4TebnWLh4v8aaLD8uLU66V4dxCnv
new_deployment=dpl_HtohpbSF91faoJ5jkW5zxJkiNKGh
production_url=https://hien-xa-erp-v2-nu.vercel.app
deployment_url=https://hien-xa-erp-v2-o8a30fxqo-hienxa.vercel.app
evidence=/private/tmp/hx-p1p2-checks-20261002/production-deploy.stdout.log; production-deploy.stderr.log; production-deploy-exit.txt; deploy-preflight.json; production-release-result.json
changed_paths=implementation.md; NGHIEM_THU_TONG_THE_20261002.md; private candidate .vercel/project.json for existing project linkage only
production_impact=APPLICATION_DEPLOYED_BY_OWNER_AUTHORIZATION; no Production DML, migration, RLS/grant/environment mutation or synthetic business transaction
limitations=read-only Production checks prove deployment identity/reachability/liveness, not full authenticated business-flow acceptance; external/human/device gates unchanged
blocker=NONE_FOR_AUTHORIZED_DEPLOYMENT
git=no commit, push, merge or PR in this deployment-only request

## IMP-BUSINESS-SIDEBAR-20261002 — Business audit and grouped navigation

- scope: business negative probes; permission-filtered two-level admin sidebar; UTF-8 check. Contract unchanged (HX-V2-DOCSET-4.4 / SYNC-4.4).
- changed_paths: src/components/app-shell.tsx; src/app/globals.css; src/components/app-shell.test.tsx; AUDIT_NGHIEP_VU_20261002.md.
- new_evidence: /private/tmp/hx-business-sidebar-20261002; frozen QA /private/tmp/hx-business-sidebar-20261002-yVvmKw, port 4042; source/migration fingerprint bf1254ab73bf9d17420c73c6e8a0776b65cbadc6cc6c6890b3f77472d3c6d0cc.
- reused_evidence: quotation form/action inputs unchanged between frozen QA 4041 negative UI case and 4042 sidebar candidate; no reuse of 4041 to certify new navigation. Prior full release/UAT PASS not inferred.
- checks: UNIT NEW PASS 97/97; lint NEW PASS; typegen+types NEW PASS after initial missing-generated-PageProps failure (exit 2 retained); DB NEW PASS R2-R9 isolated; negative-probes NEW FAIL 3/4; non-finite-count DB probe NEW FAIL; UI grouped desktop/mobile NEW PARTIAL (Escape focus return fails); UTF-8 NEW PASS scoped 290 pre-change files + changed files, no confirmed encoding corruption.
- result: 7 admin navigation groups, old destinations retained, existing stock-count/purchase-document routes discoverable; no backend module merge, no permission/RLS change. Not a whole-system acceptance PASS.
- NEW_GAP-20261002-COUNT-NAN: CONFIRMED P1, SPEC-NUM-002/SPEC-INVTRY-005; inventory action accepts NaN, isolated SQL stores NaN count then approve fails 0A000; finite boundary + DB guard required, not fixed here.
- NEW_GAP-20261002-PAYMENT-DATE: CONFIRMED P1, SPEC-FIN-004/SPEC-DASH-005; finance action turns 2026-02-31T10:00 into 2026-03-03T03:00Z and calls post RPC; mocked command probe, no cloud wrong-date payment created; real calendar validation required.
- NEW_GAP-20261002-QTY-ZERO: CONFIRMED P2, SPEC-REC-002/004; receipt action calls RPC for 0, quote UI previews 0 and enables save then errors; no confirmed zero finalized ledger/quote; finite gt(0) validation required.
- NEW_GAP-20261002-DRAFT-DATE: CONFIRMED P2, UX-REC-002/003; failed quote save clears effectiveAt but keeps controlled quantity/manual fields; shared form date-state regression required.
- NEW_GAP-20261002-REPORT-GUARD: CONFIRMED source P2, UX-REC-013/SPEC-ACC-004; nav source-finance permissions differ from Reports page/export dashboard.read guard; finance-only browser NOT_RUN.
- NEW_GAP-20261002-MOBILE-FOCUS: CONFIRMED P2 introduced by this navigation patch; Close/Escape attempts opener focus while workspace still inert; browser focuses BODY; repair awaiting Owner response, not silently marked PASS.
- blocker: business defects listed; mobile focus repair awaiting user decision. Customer/Worker live UAT, real concurrent DB race, representative cloud PERF, provider/Storage and managed recovery not certified by this batch.
- production_impact: NOT_TOUCHED; no Production DML, migration, permission/config change, deployment, commit or push.

## IMP-PG-INDEX-20261002 - Isolated PostgreSQL lookup optimization

- scope: quotation paging and customer AR/credit lookup; bounded metadata-only storage inventory. No business/schema-shape/permission changes.
- gap_ids: targeted performance candidate, no new business requirement.
- changed_paths: supabase/migrations/20261002071813_index_quotation_and_customer_credit_lookups.sql; scripts/sql/postgres-storage-audit.sql; POSTGRES_OPTIMIZATION_20261002.md; implementation.md.
- new_evidence: isolated catalogue replayed 68 baseline migrations; three absent lookup indexes identified; synthetic 20,000-row relation baselines and seven warm EXPLAIN samples recorded. Candidate indexes added only in the isolated database. Affected view/policy/table-grant fingerprint unchanged. Metadata storage inventory ran only against synthetic data.
- reused_evidence: existing R2-R9 database harness reused as a check definition, not as an old PASS for the changed migration.
- checks: DB:NEW PASS, node scripts/test-r2-database.mjs exit 0; affected-boundary:NEW PASS; storage-inventory-SQL:NEW PASS isolated only. PERF after comparison exited 1 (Date objects versus persisted JSON timestamp strings); final result equivalence/after measurements/ungranted-actor/DDL replay NOT_CONFIRMED. Prior fixture-column failures and credit-view 42501 are retained in the report; no silent all-green claim.
- result: PARTIAL; index-only candidate implemented, comparator repair confirmation pending. Native PostgreSQL 17/cloud performance and real storage inventory NOT_RUN.
- blocker: Owner confirmation requested for temporary comparator normalization; real-data cleanup scope/target inventory not established.
- production_impact: NOT_TOUCHED. No cleanup, real DML, migration, grants/config mutation, deploy, commit or push.

## IMP-PG-VALIDATION-20261002 - Comparator closure and real storage inventory

- scope: finish the authorized after-index profiling stage and read-only real database storage inventory; supersedes the pending comparator state in IMP-PG-INDEX-20261002.
- gap_ids: targeted lookup optimization; no new business requirement and no storage cleanup justified by current measurements.
- changed_paths: POSTGRES_OPTIMIZATION_20261002.md; implementation.md; reports/postgres-20261002/*. Temporary comparator correction only in /private/tmp/hx-postgres-profile-20261002/profile.mjs; application source/migration unchanged in this follow-up.
- new_evidence: exact JSON-normalized rows and result SHA-256 hashes match all four baseline queries; manual expected credit totals preserved; ungranted actor sees no permitted business rows and direct internal credit-view read is denied; index DDL replay passes. Warm local execution medians before/after recorded in the report and full EXPLAIN JSON. Owner-approved real metadata inventory on HienXaERPv2/main project nbwynrwkdbtfsitafsxa reports PostgreSQL 17.6, 20,933,779 database bytes and 99 public tables totaling 4,079,616 relation bytes. No business row contents were read/exported from Production.
- reused_evidence: R2-R9 isolated DB regression exit 0 and unchanged affected view/RLS/grant fingerprint aa73a092fab2e9fa966b1527b9d2196dc32b198b583066d064c6af1dc206626e from IMP-PG-INDEX-20261002. Comparator-only edits do not invalidate those inputs.
- checks: PERF:NEW PASS local PostgreSQL 18.3/PGlite only; result-equivalence:NEW PASS; ungranted-actor:NEW PASS; DDL-replay:NEW PASS; DB:REUSED PASS; affected-boundary:REUSED PASS; real-storage-inventory:NEW PASS read-only. Native/cloud performance, representative p95/p99 and Production migration NOT_RUN.
- result: ISOLATED_INDEX_VALIDATED + REAL_STORAGE_INVENTORY_COMPLETE. Historical fixture and comparator failures retained; not silently omitted. NO_CLEANUP_NEEDED_ON_STORAGE_EVIDENCE; no table merging/deletion.
- blocker: NONE for these two authorized steps. Any later real-data cleanup or Production migration remains separately authorized work; active-webapp database binding was not reverified by this metadata-only inventory.
- production_impact: READ_ONLY_METADATA via existing authenticated dashboard. No migration/DDL/DML/grant/config mutation, cleanup, VACUUM, deploy, commit or push.

## 2026-10-03 - Isolated UX/UI usability release

- scope: UX01-UX06 reproduced in the 2026-10-02 QA audit; mobile Sales Order cards, quick-create focus containment, readable filters, visible Dashboard charts, Vietnamese fulfillment labels and accurate draft PO copy.
- contract_refs: UX-040.2, UX-060, UX-090, UX-140, UX-810, UX-800.1, UX-DASH-004, UX-FLOW-003, UX-REC-003.
- base: a336bdedfd31bd47a10a809a79497375d05d8ec8; isolated from the dirty development workspace.
- changed_paths: src/app/globals.css; src/app/admin/orders/page.tsx; src/app/admin/page.tsx; src/modules/sales/presentation.ts; src/components/sales/commercial-document-form.tsx; src/components/sales/quick-create-focus-guard.tsx; src/components/purchasing/purchase-order-form.tsx.
- checks: UNIT:NEW PASS 16/16 affected existing tests; LINT:NEW PASS; TYPE:NEW PASS; QA_GUARD:NEW PASS ffrwiglcrlumfvhubaxg; BUILD/UI/CI: PENDING at checkpoint creation.
- evidence: /private/tmp/hx-uxui-release-20261003; pre-fix /private/tmp/hx-uxui-20261002 establishes defects only, not post-fix PASS.
- result: UX-only candidate; no API, query, permission, schema or business-rule changes. The separate acceptance-repair batch and its QA-only migration 20261002114730 are NOT included in this release.
- production_impact: NOT_TOUCHED at checkpoint creation; release requires build, affected browser acceptance and CI success. No Production migration or DML authorized in this release.

### 2026-10-03 - UX02 focus restoration correction

- scope: Confirmed browser regression on 7ef3c709d8c4793d87be7a326885bbfdfcf8319b: Escape returned keyboard focus to BODY after closing quick Customer/Site creation.
- changed_paths: src/components/sales/quick-create-focus-guard.tsx.
- correction: Capture the focused opener on mount; after removing listeners and restoring background inert/scroll state, return focus without scrolling if that target remains connected and not inert.
- invariants: No draft, API, permission, money, schema or migration changes. A removed opener is not focused after navigation.
- reused_evidence: UX01/UX03/UX04/UX05/UX06, 97/97 existing unit suite and CI run 37087635061 for unchanged inputs; focused UX02 checks require fresh evidence.
- checks: Targeted lint/typecheck/build and Customer/Site Escape/Close/Tab/Shift-Tab/draft-retention browser regression PENDING at checkpoint creation.
- evidence: /private/tmp/hx-uxui-release-20261003; preceding failed focus observation retained in browser-evidence.json.
- production_impact: NOT_TOUCHED at checkpoint creation; merge/deploy remain gated on targeted verification and CI.

## 2026-10-03 - Confirmed rule-gap repair candidate

- scope: NEW_GAP-RULES-01..05 from the UI/DB acceptance evidence at /private/tmp/hx-rules-20261003/check-matrix.json; frozen base 5c884d24ce73630487f19b1cec05ca46ae3321d2. Dirty original workspace untouched. Spec/UXUI/plan unchanged.
- changed_paths: supabase/migrations/20261003063723_fix_verified_delivery_rules.sql; scripts/test-delivery-rules-database.mjs; src/modules/portal/{types,draft,work-result-input}.ts; src/modules/portal/{delivery-draft,work-result-input}.test.ts; src/components/portal/work-result-draft-form.tsx and its test; src/app/api/portal/work-results/route.ts; src/app/work/jobs/[id]/page.tsx; src/modules/delivery/receiver-actions.ts; src/app/admin/deliveries/[id]/page.tsx; src/components/delivery/work-item-bridge.tsx; src/modules/workforce/delivery-actions.ts; src/modules/sales/presentation.ts; src/app/customer/orders/[id]/page.tsx; tasks.md; implementation.md.
- candidate: consume accepted plus unresolved transit per allocation; retain historical delivery plans; bridge per-line Worker results to proposed Delivery results atomically without AR; enforce publish receiver readiness; auditable pre-publication receiver correction; last-unit custody value settlement; canonical per-line SO fulfillment. Delivery WorkItem scalar quantity is nullable rather than summing unlike UOMs; service scalar commands continue to reject null/non-finite inputs.
- checks: UNIT NEW PASS 24/24 across six affected files, direct installed Vitest exit 0. TYPE NEW PASS next typegen + tsc --noEmit exit 0. Scoped LINT NEW PASS exit 0. Initial pnpm exec exit 1 refused the shared node_modules symlink and attempted dependency auto-management; no dependency installation completed, direct installed runner used instead.
- DB NEW FAIL: new baseline and fixed runners both exit 1, 0/7 reached rule assertions because the new warehouse fixture omitted address_text and PO creation rejects a null destination_address_snapshot. These are fixture failures, not seven application findings and not valid red/green regression proof. Existing R2-R9 runner exit 1/42703: new worker payload references nonexistent ServiceJob work_description (actual description; unit_label must also be used rather than planned_unit). No silent rerun or changed expected values.
- new_evidence: /private/tmp/hx-rules-fix-20261003/{baseline.log,baseline.json,fixed.log,fixed.json,unit.log,unit-direct.log,r2-r9.log,status.json}. Baseline audit evidence establishes the original gaps only, not PASS for changed source.
- result: PARTIAL / NOT_RELEASE_READY. No gap closure claimed. Explicit correction confirmation requested for the authored fixture and ServiceJob field defects; separate approval requested to apply only this migration to QA after isolated checks pass.
- blocker: correction confirmations and QA migration authorization pending; browser rerun NOT_RUN. Existing closed historical transit dust is not rewritten by this candidate. Previous SO dropdown/zero-price-preview UX findings are outside this five-gap patch and remain open.
- production_impact: NOT_TOUCHED; no migration, DML, role/permission change, deploy, commit, push or PR. New migration exists as source and has only run inside PGlite.


### 2026-10-03 - IMP-ACCEPT-001 delta: document-wide technical verification

- scope: FIX_RULES_01_05 candidate plus all 30 ACC-CASE groups in HX-V2-DOCSET-4.4 / SYNC-4.4. No requirement changes.
- tested: base detached HEAD 5c884d24ce73630487f19b1cec05ca46ae3321d2 plus uncommitted candidate; isolated build snapshot fingerprint eca1273bf2965b7e556b046f2d49e0866ed0aeec62748315b05d5e133a9a5d97. Reporting-only documentation delta follows the tested snapshot. Original dirty workspace unchanged.
- changed_paths: earlier candidate migration/portal/delivery/sales presentation changes; this verification delta changes only tasks.md and implementation.md. No new application fix after the handoff test-harness failure.
- NEW PASS: full UNIT 110/110 in 28 files; QA harness 4/4; existing isolated DB R2-R9; full lint; typegen/typecheck on isolated copy; guarded QA Webpack build; exact numeric contract-heading DOC references; clean application schema with all 71 migrations; public-table RLS/no anonymous table SELECT; no direct authenticated/anonymous EXECUTE on the two new custody helpers.
- environment failures retained: worktree typegen EPERM (exit 1); first QA build worker rejected --env-file in NODE_OPTIONS (exit 9). Same candidate typecheck/build PASS after environment-only execution adjustments; no assertion, dependency or application changes to obtain green.
- targeted rule checks: baseline-r2 exit 1; fixed-r2 exit 1 with 2 PASS / 5 FAIL. Contact readiness and audited/idempotent contact repair PASS. Remaining cases fail in the newly authored fixture because handoff_delivery arguments place timestamp before expected_version. These failures are HARNESS, not valid closure evidence. Repair permission requested; no silent correction and no changed business expectations. First warehouse-fixture and service-payload failures remain retained.
- QA read-only evidence: ffrwiglcrlumfvhubaxg, 69 recorded migrations; new bridge RPC/link absent. Missing local versions on QA: 20260923162705, 20261002071813, 20261003063723; extra QA version: 20261002114730. Specific new-migration approval pending; no cloud DDL/DML applied.
- application binding: local QA server 127.0.0.1:4048 reports the expected QA project, disabled e-invoice and exact tested source fingerprint. Browser blocked both localhost:4048 and 127.0.0.1:4048; candidate UI NOT_RUN, no old-build substitution. Existing 4047 server untouched.
- reused evidence: only unchanged-form findings in /private/tmp/hx-rules-20261003/check-matrix.json, explicitly not a complete current-candidate UI acceptance. SO rejected-draft dropdown retention and zero-quantity Save affordance remain OPEN; raw enums only partially improved.
- remaining review risks/limits: Owner display of linked worker-upload evidence not browser-validated; migration has no historical transit-dust correction DML. Existing cloud release/cutover rehearsal scripts pin 49 migrations and are OUTDATED for current 71; they were not executed. Native two-session PostgreSQL tools unavailable. Managed Storage/signing, route/chat/job end-to-end, provider sandbox, representative cloud performance, physical-device UAT and managed recovery have no fresh completion evidence. No p95/p99 or global P0-zero claim.
- evidence: /private/tmp/hx-system-20261003/acceptance-matrix.json, candidate-manifest.json, doc-references.json, schema-catalog.json, qa-schema-readonly.json, qa-preflight.json and retained command logs; /private/tmp/hx-rules-fix-20261003/baseline-r2.json and fixed-r2.json.
- result: QA PARTIAL / CHUA_DU_BANG_CHUNG. Macro-case matrix: PASS 0, FAIL 1 (reused unchanged SO UX defect), BLOCKED 26, NOT_RUN 3. Technical assertions listed above PASS only in their executed scope; macro-cases require additional UI/external/race evidence. FIX_RULES_01_05 NOT_ACCEPTANCE_CLOSED; release NOT_READY / NOT_AUTHORIZED.
- blocker: harness repair permission, QA schema approval/drift resolution, candidate browser access and external/human test conditions.
- production impact: NOT_TOUCHED. No Production migration/DML/configuration, commit, push, PR, deploy, real messages or invoice issue. Owner acceptance not substituted.

## REPAIR_AND_VERIFY_CURRENT_CANDIDATE_20261003

- scope: FIX_RULES_01_05; candidate parity/rehearsal; handoff harness; worker/result/Owner verification; follow-up/SO state/transit costing; draft UX; available R10/job checks. No GA/rebuild/contract edits.
- base_commit: `5c884d24ce73630487f19b1cec05ca46ae3321d2`; application fingerprint `5bc2ac8c3ae885b64fd819aec719abf07ce9f82cd8709c4443235122154566a8`; contract fingerprint `06ddd154ada578145ad021f80310875d4318b3d1096c75dc621e69f1b6504001`. Source/config/test/migration identities are separate from status documents and secrets.
- changed_paths: `scripts/test-delivery-rules-database.mjs`; `scripts/qa/{migration-manifest,local-candidate-rehearsal,transit-value-repair,release-rehearsal,cutover-rehearsal,perf}.mjs`; `supabase/migrations/20261003074122_audit_worker_quantity_verification.sql`; SO form/quantity validation; portal presentation; Owner evidence component and verification action. Existing candidate fixes remain preserved.
- new_evidence: `/private/tmp/hx-repair-verify-20261003/rules-candidate-r8.json` and `.log`: **15/15 PASS** on exact isolated 72-migration schema. Covers publish/receiver correction, multiline worker linkage, unauthorized/stale/replay rejection, immutable worker quantities with separate Owner reason, forced transaction rollback, follow-up limits, independent SO/payment states, exact transit value, SO quantity atomic rejection, route stale assignment, GPS order/revocation, chat audiences/persisted pages, and report job dedupe/lease/completed retry.
- independent_expected_values: SO line A 20 x 120000 plus line B 3 x 80000 = AR 2640000 across exactly two verifications; accepted 18 then returned/redelivered 2; COGS 345927; material A warehouse quantity 149/value 2398352; settled custody quantity/value both zero. Retry creates no second effect.
- migration_parity: **PASS_ISOLATED**; manifest includes version/path/order/content checksum, no locked candidate count. Clean/upgrade/rollback/preservation and actual local restore/all-table reconciliation **PASS** (`rehearsal-business.log`). Native isolated migration ledger matches candidate; native business/race checks below are not passes.
- qa_cloud_main: **BLOCKED_ENV** (`cloud-qa-parity.json`): missing 20260923162705, 20261002071813, 20261003063723, 20261003074122; extra 20261002114730; 8 stored single-statement byte differences and 56 histories insufficient for checksum verification. Formatting differences are not asserted to be semantic defects. Main QA history/data not rewritten.
- ui_equivalent: SO draft/retry/invalid quantity + presentation + Owner evidence DOM/UNIT **28/28 PASS** (`ux-final-targeted.log`). Draft Customer/Site/lines/terms/date and operation intent survive failure. Real portal label rendering, recipient publish/correction and Owner opening a signed object remain browser/runtime checks, not UI PASS.
- checks_new: focused DB **15 PASS**; QA guard/fixture/manifest Node checks **7 PASS**; unit union **138 PASS**; typecheck **PASS**; guarded isolated QA build **PASS**. Source/UX lint and final harness lint **PASS**. Failed attempts remain in r2-r7/native logs; no assertions removed/skipped or expectations changed to accept application failure.
- checks_reused: application-only unit/typecheck/build evidence remains valid for the unchanged application fingerprint above. Unrelated status-document/performance-report wording changes do not invalidate those inputs. Old drifted DB evidence is not reused for candidate DB PASS.
- native_concurrency: **BLOCKED_SETUP / TEST_HARNESS_FAILURE**. Disposable QA database `hxqa_candidate_017e9dc7e19a` exists for this goal only; native run 1/20 PASS with 19 setup-dependent failures. Driver double-encodes JSON strings (`native-json-encoding.json`: raw string vs typed array); no race was exercised. Adapter repair/retest awaiting explicit approval; do not label this BUSINESS_FAILURE or RACE PASS.
- browser_candidate: **BLOCKED_BROWSER**, local 4048/4036 `net::ERR_BLOCKED_BY_CLIENT`; old browser/server candidates are not substituted. No browser protection disabled, tunnel opened, other session stopped, or Production navigation used as candidate evidence.
- storage_runtime: **BLOCKED_STORAGE_RUNTIME_ON_CANDIDATE**. Child DB Auth/Storage metadata and DOM signed-link tests do not prove managed upload/signing. Existing cloud runtime is not candidate-aligned. No signed URLs/tokens retained.
- route_gps_chat_job: **DB_PASS_SCOPED**; browser/realtime reconnect and provider integration not run. Provider sandbox **BLOCKED_PROVIDER**. Performance **NOT_RUN_REPRESENTATIVE**: candidate browser/runtime unavailable; small isolated fixture is not a representative profile. Threshold authority remains Spec only. Managed backup/recovery not run; local actual restore/reconciliation is a separate PASS.
- historical_repair: **DRY_RUN_PREPARED / APPLY_BLOCKED_POLICY**. Fixture (`historical-fixture-r2.tar`) reproduces 3 proven source-line residuals: handoff 32193 = accepted 16096 + returned 16096 + residual 1. Deterministic repeated dry-run and source reconciliation PASS; `--apply` intentionally exits 2 without ledger mutation (`historical-source-reconciliation.json`, `historical-apply-r2.json`). Full repair/idempotency is NOT tested because no adjustment is applied.
- DOC_CONFLICT_HISTORICAL_VALUE_ONLY: `SPEC-INVTRY-006` / `SPEC-OPS-001` require auditable, immutable history. Existing movement constraints require nonzero quantity/value with matching signs and a supported source; stock-count adjustment also requires nonzero quantity. No authorized zero-quantity value reclassification mechanism exists. Owner must decide the minimal contract-supported append-only mechanism; no ledger rewrite, fake quantity pair or new movement type is introduced.
- result: **PARTIAL / RELEASE_BLOCKED**; business PGlite and focused DOM fixes verified, native race and browser/runtime gates not claimed. Owner acceptance/device UAT remain separate.
- blocker: native JSON adapter authorization; candidate browser/managed runtime alignment; provider sandbox; representative performance/managed recovery; historical value-only adjustment policy.
- production_impact: **NOT_TOUCHED**; historical Production repair **NOT_AUTHORIZED**; no push/deploy/migration/DML/real invoice/message.

### Local DB coverage delta (same application/migration inputs)

- new_evidence: `rules-candidate-r9.json` / `.log`: **16/16 PASS**. Adds a complete two-line follow-up with different remaining quantities (1 and 2), two AR effects totaling 480000, per-line settled custody quantity/value zero, and a positive-control transaction rolled back before proving a persisted CLOSED remainder cannot create another delivery. The CLOSED state is a fixture/read-model/command-guard check, not acceptance of an Owner browser close workflow.
- checks: r9 harness lint **PASS**; `rehearsal-business-r9.log` actual local restore/all-table reconciliation **PASS**, now using the 16-case business snapshot. Application fingerprint remains unchanged; UNIT/typecheck/build evidence reused. No active configured commit hooks exist; no hook test is claimed.
- checkpoints: `d35443c` contains the coherent source/migration group; `8521e94` contains rehearsal/diagnostics and QA delta. Native JSON/race harness remains uncommitted pending authorized adapter repair; `node_modules` symlink remains unstaged. No push/deploy.
- result/blocker/production: unchanged **PARTIAL / RELEASE_BLOCKED / NOT_TOUCHED**. Native prior run remains setup-failed, not a race or business PASS. Private disposable native QA DB is retained only for the pending retest; ownership is recorded in `native-isolation-probe.json`.

### 2026-10-03 - UNBLOCK_NATIVE_QA delta

- scope: Authorized JSON adapter/callers, native setup/retest and true two-session checks only. Historical baseline `721135d9c8b43ba01eb1e925bf97fffde8376e27` preserved; no GA/R0, application/schema/contract change, cloud project creation or Production operation.
- candidate: Source/config/test fingerprint `706ad78b9c405ca6065dfedec40a9971493509d0d071db4b4711ffde5746f0e4`; application `5bc2ac8c3ae885b64fd819aec719abf07ce9f82cd8709c4443235122154566a8`; harness `2849168fd9715600afe51d7d894e62229f1552f889752e70ef1d52dd5807c8a4`. Contract and migration inputs unchanged. Status documents/secrets/user data excluded.
- changed_paths: `scripts/qa/native-rpc-parameters.mjs`; `scripts/qa/native-rpc-parameters.test.mjs`; `scripts/test-delivery-rules-database.mjs`; `tasks.md`; `implementation.md`.
- json_adapter: Reproduced postgres-js 3.4.9 inferring JSONB and serializing already encoded text again. RPC metadata selects one actual candidate signature and only declared JSON/JSONB inputs use decoded JSON text or structured values. Encode once, bind as typed text, cast explicitly to JSON/JSONB. PostgreSQL arrays/plain text remain unchanged; SQL NULL and JSON null stay distinct. Positional/named/race callers share this seam; no application function changed.
- retained_failure: First corrected native setup stopped because `sql.json(null)` becomes SQL NULL in this driver (`native-business-r1.json`, exit 1); no business PASS attributed to that attempt. Typed text plus explicit cast corrects this boundary without loosening assertions or changing business expectations.
- native_migration_parity: **PASS_NATIVE_APPLICATION_SCHEMA**, PostgreSQL 17.6, owned fixture-only database `hxqa_candidate_017e9dc7e19a`. Recreated only this documented disposable database; exact manifest versions/order/original-content checksums match fingerprint `4241b5fd16f15c03b9925098102e9a6a02f9ffb97cb515a5f0cf7d144ddb8d76`. Sole named `handoff_delivery` signature and 28 called RPC identities recorded. Auth/Storage metadata stubs do not prove managed Auth/Storage integration. Main QA history/data untouched.
- checks_new: adapter Node **4/4 PASS**, live JSON boundary **9/9 PASS**, scoped harness lint **PASS**, native business **16/16 PASS**, native race **5/5 PASS**, runner exit 0. All native cases previously blocked by setup now execute. Fresh evidence `/private/tmp/hx-unblock-native-20261003/native-business-r2.json`; prior native failures retained separately.
- verified_existing_fix_native: Worker multiline submit/source linkage/permissions/stale assignment/retry and forced atomic rollback; immutable worker quantities with separately reasoned Owner verification; singular/multiline remaining delivery including SO20 accepted18/returned2/redelivered2; per-line SO fulfillment independent from payment; exact settled transit quantity/value and revenue/COGS invariants; receiver readiness/correction; server invalid quantity rejection; route/GPS/chat/report-job DB contracts. Closed-remainder coverage is a fixture/read-model/command guard, not an Owner UI close workflow.
- true_two_session_evidence: Five pairs each have distinct backend PIDs, intentional barrier, finite SQL/barrier timeouts, overlapping transaction intervals and explicit COMMIT/ROLLBACK outcomes. Remaining allocation cannot be consumed twice; duplicate submit/verify return one result/AR; two half-returns settle exact carrying value; one version-changing assignment succeeds. Client/transaction cleanup executes on exit. No sequential/PGlite race substitution.
- checks_reused: `unit-final-union.log` 138 PASS, `ux-final-targeted.log` 28 scoped DOM/UNIT PASS, `typecheck.log`, `build.log`, `qa-harness-final.log` 7 PASS and `rehearsal-business-r9.log` actual PGlite restore/reconciliation, all under `/private/tmp/hx-repair-verify-20261003`. Their relevant application/manifest/guard inputs are unchanged. No redundant application build or old native setup evidence promoted to PASS.
- browser_candidate: Local 127.0.0.1:4036 HTTP 200 and Cua login page now reachable; prior connection block is not carried forward. Server cwd is the candidate worktree and `/api/qa/environment` returns approved QA ref with e-invoice disabled. Dev build metadata remains explicitly unpinned; source identity recorded separately. Orders redirect to login; retained tab 6 awaits QA Owner authentication. Portal labels, missing-recipient UI correction, Owner signed-object preview and SO UI regression **NOT_RUN_RUNTIME**, not replaced by native/DOM evidence.
- managed_runtime: **BLOCKED_ENV**. Existing managed QA remains outside exact candidate migration parity (`cloud-qa-parity.json`); child native metadata is not managed Auth/Storage. No drifted-QA business writes, real Storage upload/signing, browser/realtime reconnect or provider sandbox execution claimed. Provider sandbox **BLOCKED_PROVIDER**; representative user-wait performance and managed recovery **NOT_RUN**. Small native fixtures are not representative performance data; local restore PASS remains local only.
- historical_repair: Previous three synthetic source-line dry-runs/reconciliations reused; native candidate constraint/function inspection confirms no authorized zero-quantity value adjustment mechanism. **POLICY_DECISION_REQUIRED**: decide whether/how to represent append-only source-linked -1 VND IN_TRANSIT / +1 VND WAREHOUSE with zero physical quantity, reason/audit/idempotency. Per proven fixture, custody 0 qty/1 VND would become 0/0; warehouse 168 qty/2704182 VND would become 168/2704183; COGS 16096, AR/revenue/physical stock/total carrying value unchanged. No adjustment or posted-history rewrite performed; no Production incidence asserted. Details in `historical-policy-decision.json` and `native-costing-mechanisms.json`.
- result: **ADAPTER_FIXED / NATIVE_BUSINESS_RETEST_PASS / TRUE_TWO_SESSION_TESTS_PASS / RELEASE_BLOCKED** at remaining runtime/external/policy boundary. Owner acceptance remains PENDING_OWNER; no whole-system P0-free claim.
- production_impact: **NOT_TOUCHED**. Local checkpoint only; no push, deploy, migration/DML/configuration on Production, invoice issue, real messaging or historical repair apply.

### RUNTIME_AND_RELEASE_EVIDENCE_CLOSURE_20261003

- scope: Continue checkpoint `6f765ad7c3389be0ec43c3bec79ad10859d3da74`; close candidate identity and inspect available managed-runtime gates. No backend re-audit or business-logic changes.
- changed_paths: `src/app/qa/candidate/route.ts`, `src/app/qa/candidate/route.test.ts`, `tasks.md`, `implementation.md`. The QA-only HTML identity route retains the existing approved-project guard, requires valid commit/fingerprint, returns private no-store metadata and is absent outside approved QA. No secrets, application data or authorization bypass.
- candidate: code/config/test fingerprint `4b4c7d23e47c111fff91d883ae2b5501121a24b8fa3470cdc86f101e76aaa4e9`; application `e58683ad3e04b9a1e291d8496c31fe93510df5a7697762e553ef7d7f9496a858`; harness, contract and migrations unchanged. Status documents and secrets are excluded. New isolated build ID `EV8DBOJlXIvzguctIYBHe`.
- checks_new: metadata UNIT **6/6 PASS**, targeted lint **PASS**, isolated candidate typecheck/build **PASS**. Managed QA read-only parity and QA Owner Auth API were executed; browser identity observation is recorded separately in `/private/tmp/hx-runtime-release-20261003/final-runtime-release-evidence.json`, not inferred from HTTP or unit checks.
- managed_schema_parity: **BLOCKED_SCHEMA_PARITY**. Candidate has 72 migration versions; managed QA has 69. Missing `20260923162705`, `20261002071813`, `20261003063723`, `20261003074122`; extra `20261002114730`. Four exact stored-SQL byte matches, eight byte differences and 56 ledger entries with insufficient original content for checksum comparison; byte differences alone do not establish semantic defects. No managed DDL or migration-history rewrite.
- qa_owner_auth: **PASS_AUTH_API** with the configured QA Owner credential and active QA Owner branch access; the newly created API session was signed out. This is not browser-session or UI-defect PASS. No credential, token or secret is written to evidence.
- runtime_defects: portal Vietnamese labels, recipient publish UX, Owner evidence preview and Sales draft/zero-quantity browser behavior remain **BLOCKED_ENV / BLOCKED_SCHEMA_PARITY**. Do not run them against mismatched managed schema; runtime closure remains **0/4**, not substituted by existing DOM evidence.
- storage_runtime: **BLOCKED_MANAGED_RUNTIME** at schema-parity gate. Upload/finalize/signing, allowed/denied/revoked access and retry effects have not been verified in this turn.
- external_gates: representative performance **NOT_RUN** (managed parity blocked and representative dataset not verified); managed restore **NOT_RUN_MANAGED_RESTORE** (no named isolated managed target or restore authorization); provider sandbox **BLOCKED_PROVIDER** (no approved sandbox credential/configuration available in QA runtime). No small-fixture performance or mock-provider integration claim.
- checks_reused: `/private/tmp/hx-unblock-native-20261003/final-native-verification-evidence.json` for adapter PASS, native migration parity PASS, native business **16/16**, true two-session concurrency **5/5**, UNIT **138/138**, DOM **28/28** and prior local restore in their original scopes. `/private/tmp/hx-runtime-release-20261003/evidence-reuse-inputs.json` proves only the two metadata files changed; prior global build is superseded by the new isolated build. Native/PGlite/DOM/local restore are not relabeled managed, browser or Storage PASS.
- historical_repair: **APPLY_BLOCKED_POLICY** unchanged. Three synthetic one-VND records do not prove a Production defect; no new adjustment policy or historical ledger mutation.
- evidence: fresh parity, authentication, candidate manifests, build/test logs and final runtime record under `/private/tmp/hx-runtime-release-20261003/`; previous evidence is preserved.
- result: **RELEASE_BLOCKED** at managed schema/runtime/external/policy boundary; Owner acceptance **PENDING_OWNER**. Local checkpoint only; no push or automatic deployment.
- production_impact: **NOT_TOUCHED**. No Production database access, DML, migration, config mutation, deployment, real invoice, real messaging or historical repair apply.

### MANAGED_QA_RECONCILIATION_AND_RUNTIME_CLOSURE_20261003

- scope: Narrow investigation of extra `20261002114730`, the four missing managed QA migrations and reconciliation prerequisites. Application, native harness, canonical contracts and candidate migration source remain unchanged from `131260e97de1e98d28d1dcecb76adad1ee469c23`; code/config/test fingerprint remains `4b4c7d23e47c111fff91d883ae2b5501121a24b8fa3470cdc86f101e76aaa4e9`.
- authority: Managed QA READ_ONLY only. No current authorization for QA migration/DML/rebuild; **MANAGED_QA_MUTATION_APPROVAL_REQUIRED**. Production remains forbidden.
- migration_delta: Fresh exact QA ledger on PostgreSQL 17.6 confirms missing `20260923162705`, `20261002071813`, `20261003063723`, `20261003074122`; extra `20261002114730`. Table has 4 MATCH, 8 CONTENT_MISMATCH of stored SQL bytes versus source file, 56 UNKNOWN_CHECKSUM, 4 MISSING_IN_QA and 1 EXTRA_IN_QA. Byte differences are not automatically semantic defects; missing original SQL is not a checksum match. Checksums, dependency and safe-action columns are in `/private/tmp/hx-managed-reconcile-20261003/migration-delta.tsv`.
- extra_origin: Ledger name `acceptance_count_guard_and_direct_po_terms`, one complete stored SQL statement. No version path, name or unique `stock_count_lines_finite_count` content found in available Git refs/deleted-path history/reflog. Originating commit/branch is **NOT_ATTESTED**; unfetched/deleted remote history and an uncommitted deployment are not excluded.
- extra_effects: QA still has the finite-count guard/NOT VALID constraint and the six-argument direct PO RPC with a trailing NULL default and commercial-terms persistence. Candidate has the original five-argument RPC and does not contain those count effects. Later candidate migrations do not supersede them. **HISTORY_DIVERGED_SCHEMA_EQUIVALENT is NOT established**. The trailing default preserves five-argument SQL resolution only; no business/UI equivalence claim. Authenticated execute remains allowed and anon denied on the two inspected functions.
- local_verification: **PASS_LOCAL_DELTA_SIMULATION**, not native or managed PASS. Restored existing local snapshot has exact 72-version candidate manifest. The modeled QA delta matches actual inspected managed function/column/constraint/view/index definitions. Four checks passed: extra effects present; four-migration atomic rollback; applying the four real existing migrations alongside the extra while preserving old ledger and synthetic Auth fixture; extra still differs from canonical schema afterward. No native business/race/unit/DOM rerun.
- reconciliation: **BLOCKED_NEEDS_OWNER / BLOCKED_APPROVAL**. The four existing migrations have a locally verified partial forward plan. Full closure requires Owner disposition of extra-versus-canonical behavior and specific QA-only mutation authority. No extra ledger deletion/rename, empty compatibility migration, automatic rollback, application business change or unapproved removal of the finite-count guard/six-argument RPC. No new candidate migration patch is created before that decision.
- runtime: Browser Auth, the four runtime defects and real Storage checks remain **BLOCKED_SCHEMA_PARITY / BLOCKED_ENV**. No UI case is executed on the known-divergent managed schema. Prior Auth API PASS is not browser-session PASS; runtime defects closed remains **0/4**.
- dataset: READ_ONLY profile records customers 10032, materials 4, SO 20142, SO lines 100568, deliveries 30167, payments 249 and inventory movements 67; order dates 2026-09-14 to 2026-10-03. Dataset exists, but representativeness is not established for every hot path. Performance **BLOCKED_SCHEMA_PARITY**, not measured; no new seed or Production load test.
- external_boundaries: **MANAGED_RESTORE_BLOCKED_ENV** (no named isolated managed target/backup/restore authority established); provider **BLOCKED_PROVIDER**. Local restore remains local only.
- historical_repair: **APPLY_BLOCKED_POLICY**. Owner's proposed append-only carrying-value transfer from transit to warehouse, quantity/AR/revenue/COGS deltas zero and original ledger preserved, is recorded as **PROPOSAL_ONLY**; no policy selected, implemented or applied.
- checks_reused: Adapter PASS; native parity PASS; native business 16/16; true concurrency 5/5; UNIT 138/138; DOM 28/28; metadata 6/6; lint/typecheck/build; Auth API and prior browser source-fingerprint pin; local restore. Related source/config/test/migration inputs are unchanged; no evidence is relabeled managed Storage/browser business PASS.
- evidence: `/private/tmp/hx-managed-reconcile-20261003/reconciliation-plan.json`, `migration-delta.tsv`, `local-reconciliation-probe.json` and `final-managed-reconciliation-evidence.json`; previous evidence retained.
- result: **RELEASE_BLOCKED**. Owner must decide the extra contract disposition and authorize the exact managed QA reconciliation; only then may schema verification, browser Auth, the four runtime cases and Storage resume. Owner acceptance remains **PENDING_OWNER**.
- production_impact: **NOT_TOUCHED**. Local documentation checkpoint only; no push, deployment, managed QA DDL/DML, Production access, real invoices/messages or historical repair.


### Delta - COMPLETE_QA_RECONCILIATION_PATCH - 2026-10-03
- scope: one canonical forward migration, exact execution manifest, guarded preflight/execution tool and focused local harness. No application/UI or Spec/UXUI/plan changes.
- disposition: CANONICAL_FORWARD_WITH_INVARIANT_PRESERVATION; guard trace SPEC-INVTRY-005. Do not adopt the extra migration wholesale; retain canonical conflict code and five-argument PO RPC.
- changed_paths: supabase/migrations/20261003161428_reconcile_qa_count_guard_and_direct_po_contract.sql; scripts/qa/qa-reconciliation-plan.json; scripts/qa/reconcile-current-candidate.mjs; scripts/qa/test-reconciliation-preflight.mjs. Uncommitted experimental harness: scripts/qa/test-qa-reconciliation.mjs.
- new_evidence: /private/tmp/hx-complete-qa-patch-20261003/managed-preflight.json; preflight-unit.log (9/9 PASS); cli-dry-run-r2.json/log (73 real files checksum-matched; extra history rejected); native-two-paths.json (BLOCKED_LOCAL_NATIVE_ENV); isolated-two-paths.json (BLOCKED_SETUP, not business PASS); clean-canonical-sql.json (SQL executed, postcheck raw-view mismatch); view-engine-normalization.json (same query on PostgreSQL 18.3 PGlite).
- reused_evidence: unchanged application inputs retain UNIT 138/138, DOM 28/28, typecheck/build, adapter and unchanged Delivery native/race evidence. Prior 72-migration native PASS does not verify the new manifest; no PGlite result is relabeled native/browser/Storage PASS.
- result: BLOCKED_WITH_EXACT_CAUSE. Native PostgreSQL local not installed/running and no disposable native targets supplied; two-path native/race verification unavailable. Local PGlite harness correction is pending.
- history_provenance: 56 UNKNOWN_HISTORICAL_CHECKSUM remain unknown, 8 stored-text mismatches are not silently relabeled matching. Extra history remains intact.
- target: Owner-designated QA ffrwiglcrlumfvhubaxg; actual business-data provenance UNKNOWN, requires Owner attestation before apply.
- managed_schema_fingerprint: 0575c4276af39517d31c16b55dc5d025e4a1d1544faa7371c9ca9ab3bef79cb9 (affected-object/access scope, not whole schema).
- production_impact: NOT_TOUCHED; managed_qa: NOT_MODIFIED; historical_repair: APPLY_BLOCKED_POLICY.

### 2026-10-04 - Local reconciliation harness verification delta

scope=VERIFY_EXISTING_RECONCILIATION_PATCH_LOCALLY
base_commit=bd531c92f61ab764599209fb7ef5028f8d1af98d
candidate_source_fingerprint=5f5fc7128ae4267a84f260f38b81e863815335264921494adff2f413e71d3a90
changed_paths=scripts/qa/reconcile-current-candidate.mjs; scripts/qa/test-qa-reconciliation.mjs; scripts/qa/reconciliation-view-catalog.mjs; scripts/qa/test-reconciliation-view-catalog.mjs; scripts/qa/test-reconciliation-local-guard.mjs; tasks.md; implementation.md
new_evidence=/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/20261004-local-reconciliation/verification-evidence.json
checks_new=PGlite two-path 21/21; same-engine comparator 5/5; preflight 9/9; local guard 3/3; scoped lint exit 0 (4 existing unused-variable warnings)
result=PASS_ISOLATED_PGLITE_TWO_PATHS_NOT_NATIVE

- Static unparameterized SQL uses PGlite exec; bound SQL remains single-statement query. Bound multi-statement SQL is rejected.
- View comparison retains SELECT, dependencies, ordered column types/collation, owner, normalized ACL entries and security options; different engines/session or missing reference remain UNRESOLVED. Prior PG17/PG18 diagnostics retained.
- First attempts are preserved: constrained numeric rejects infinity with 22003 before CHECK; NaN/negative fail CHECK with 23514. No finite-input assertion removed.
- Archive fixtures exposed modern NULL worker results, an unrelated customer grant difference, and an applied-delta checksum mismatch. No archive/business/history data was rewritten to green. Final instances were newly constructed by executing candidate manifest SQL; a synthetic 1001 VND opening AR was preserved across apply/retry/rollback.
- DIVERGED is scope reconstruction with cached observed extra SQL, not a full managed QA clone or attestation of unknown historical source. Custom executor acceptance does not prove Supabase CLI deployment compatibility.
- Native evidence from the previous goal came from a Supabase QA child DB (PG17.6 Linux), not a recoverable local binary. Known local executable paths/PATH have no discovered usable native runtime. Process inspection was unavailable and does not prove no server exists.
- Native CLEAN/DIVERGED, successful authorized SQL command effects, affected native races and actual CLI dry-run/apply/second-preflight: NOT_RUN / BLOCKED_LOCAL_NATIVE_ENV.
- 73 source migration checksums recorded; five planned files match. Historical 56 unknown managed checksums and eight stored-text differences remain separate, not verified by this run.
- Application/migration/contract inputs unchanged. Reuse UNIT138/DOM28/typecheck/build only for unchanged application inputs; prior native16/race5 only unchanged delivery/worker/SO/transit, never current reconciliation parity or deployment path.
- Runtime installation request is recorded but NOT_EXECUTED; no new cloud project, managed query/mutation, public tunnel, system install, push or deployment.
blocker=LOCAL_NATIVE_RUNTIME_NOT_PROVISIONED; CLI extra-history compatibility remains independently unverified locally
managed_schema=NOT_VERIFIED_BY_THIS_RUN
qa_real_data=UNKNOWN_UNLESS_OWNER_CONFIRMED
historical_repair=APPLY_BLOCKED_POLICY
managed_apply=NOT_AUTHORIZED
cloud_apply_eligibility=NOT_ELIGIBLE
production_impact=NOT_TOUCHED
release=BLOCKED

### 2026-10-04 - Native workflows and reconciliation closure delta

- scope: UNBLOCK_NATIVE_VERIFY_WORKFLOWS_AND_COMPLETE_CURRENT_PATCH; REPAIR_AND_TARGETED_QA. Base e359bad0c7bbb018ab811282b3be098495b0ada8; code/config/test/migration fingerprint e5d7b9ea518d63f9f5680ec551e482f5cf741a8a66491b797c16a6233187f55b. Status documents and secrets are excluded from this fingerprint.
- changed_paths: scripts/qa/test-qa-reconciliation.mjs; scripts/qa/test-owned-native-workflows.mjs; tasks.md; implementation.md. Application, business migrations, Spec.md, UXUI.md and plan.md were not changed.
- new_evidence: hienxa-qa/20261004-native-workflows/verification-evidence.json in the task visualization artifact root. Final execution artifacts retain input checksums, 73 migration versions/content checks and earlier failed harness attempts.
- environment: official Postgres.app 2.9.6 runtime, PostgreSQL 17.11, privately extracted; new owned loopback-only cluster and two disposable databases. SQL Auth fixtures are not managed Auth or Storage verification. Owned cluster and candidate web server were stopped after checks; private runtime/cluster were retained.
- checks_new: native CLEAN/DIVERGED reconciliation 19/19 PASS; native scoped workflow union 22/22 PASS, including seven same-engine view comparator negative/positive cases and two actual two-session races with distinct backend PIDs and observed blocking. Scoped lint exit 0, zero errors and three existing unused-import warnings.
- cli_deployment: actual custom local reconciliation preflight/apply PASS, five planned migrations applied atomically on reconstructed DIVERGED fixture, second apply no-op. Supabase CLI dry-run CLEAN exit 0; DIVERGED exit 1 due to retained extra migration 20261002114730. Generic db push is not certified for the diverged history; no history-repair command was run.
- business: Quote/Sales snapshots and draft immutability, multi-line PO partial receipts, supplier-direct AP/AR/cost separation, receipt/disbursement multi-debt allocations/reversals and payment-notice non-settlement passed targeted native checks. Native RPC named argument/JSON contracts were checked, not HTTP PostgREST integration.
- reused_evidence: native delivery/worker/follow-up/SO-state/transit 16/16 and five real race pairs from hx-unblock-native-20261003; four relevant input hashes unchanged. Independent UNIT 138/138 and DOM 28/28 remain scoped evidence; metadata-inclusive application fingerprint e58683ad3e04b9a1e291d8496c31fe93510df5a7697762e553ef7d7f9496a858 matches prior successful metadata unit/typecheck/build evidence. No application rebuild or unrelated backend audit was repeated.
- NEW_OBSERVATION_PO_NULL_ADDRESS: P1 risk, native edge reproduced. A warehouse with NULL address causes create_purchase_order_draft SQLSTATE 23502 at destination_address_snapshot. A warehouse with an explicit address passes the standard workflow. Valid UI admission and the contract choice between requiring an address and allowing an absent snapshot remain unconfirmed; no business policy or application change was chosen to mask the edge.
- runtime: candidate HTTP metadata matched the application fingerprint; browser origin access was blocked by tool URL policy. QA Owner Auth API PASS and sign-out completed, not browser UAT. Four browser defects remain BLOCKED_ENV, not DOM/native PASS.
- managed_qa: read-only preflight found five missing and one extra migration; historical checksum/provenance limits retained. No managed DDL/DML/Storage upload/history mutation was performed. Candidate PostgREST, Storage runtime, provider sandbox, representative performance and managed restore remain unverified at their actual environment boundaries.
- historical_repair: APPLY_BLOCKED_POLICY; no new adjustment policy or posted-history rewrite. Tiny synthetic fixtures do not prove Production-scale performance or Production historical defects.
- result: local reconciliation and targeted native paths verified; release remains BLOCKED and Owner acceptance pending. No push, deploy or Production operation. Reconciliation provenance does not attest a full managed QA clone, extra migration origin or real-data absence.

### 2026-10-04 - PO address boundary and runtime prerequisite delta

- scope: RESOLVE_PO_NULL_ADDRESS_AND_REPORT_RUNTIME_PREREQUISITES; base 47a4b421fb22dd3a7c35a87b087d26f6dbfa1a32; candidate fingerprint bb298e5658369d40e30bc52b501ff51feb80aa7f1e16072991d8ffb75f815381. Only the owned native workflow harness and status documents changed. Application, RPC/migration, Spec/UXUI/plan, cloud and posted history remain unchanged.
- root_cause: CREATE_DRAFT / WAREHOUSE / public.purchase_orders.destination_address_snapshot (NOT NULL). create_purchase_order_draft inserts public.warehouses.address_text directly; warehouse address is nullable. No INSERT trigger supplies or drops the value; caller passes warehouse ID, not an address. Supplier contact and customer-site destination are separate snapshots.
- reachability: authorized save_catalog_record created active warehouses with NULL address in native PostgreSQL. Catalog UI marks warehouse address optional, saveCatalogAction normalizes empty/whitespace to NULL, purchase selector includes active warehouses without address filtering, and the PO action accepts warehouse ID. YES_SOURCE_AND_NATIVE_RPC; browser and PostgREST reachability remain untested.
- checks_new: PO-address-only native diagnostics 11 recorded checks PASS, scoped lint exit 0. NULL/missing/UI-normalized empty/whitespace reproduced SQLSTATE 23502 at exact schema/table/column; failed creates left zero partial PO/lines/AR/AP/inventory/command receipts. After supplying a real fixture warehouse address, same operation ID succeeds, retry does not duplicate, two-line total is 7200 VND, confirm creates no AR/AP/inventory, confirmed destination snapshot survives master edits. Valid two-line CUSTOMER_SITE PO uses the SO site snapshot, never the warehouse or supplier contact, and remains immutable after site/supplier edits.
- additional_observation: raw API empty and whitespace addresses are stored by save_catalog_record and accepted through PO create/confirm. This is a characterization of an unresolved address contract, not certification that blank destinations are valid business input.
- harness_failure_retained: first diagnostic attempt stopped at setup assertion query with wrong AR table name (42P01); corrected to public.receivable_obligations, then reran only this group. No assertion removed and no business function changed.
- contract_refs: SPEC-PUR-001, SPEC-REC-001, UX-FLOW-003, UX-REC-003/004. These require PO destination/source, operational master CRUD and draft UX but do not explicitly decide whether a WAREHOUSE PO DRAFT requires non-empty textual warehouse address. Current NOT NULL alone does not settle that business decision.
- resolution: BLOCKED_EXACT_POLICY. Single decision required: May a WAREHOUSE PO be saved as DRAFT when warehouse_id is valid but its textual warehouse address is absent? Minimum recommendation: require a real warehouse address before draft save, with explicit boundary error and preserved draft; no blank/fake fallback or NOT NULL removal. Alternative: allow absent address in DRAFT only after an explicit snapshot contract decision.
- runtime_prerequisites: four per-case matrices saved with browser_origin, candidate_identity, auth_session, api_target, schema_requirement, storage_requirement, missing_dependency and required_owner_action. Known candidate origin 127.0.0.1:4057 remains stopped and was last blocked by browser URL policy; retained 4036 tab reports old SHA, not a proven current browser candidate. Owner Auth API evidence is not a browser session. A/B/D require no Storage; B needs recipient/publish scope and QA writes; C needs result linkage plus actual private evidence/signing; D client-zero check is separate from correction/save DML permission. No already-qualified browser case was found; runtime closure remains 0/4.
- evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/20261004-po-address-and-runtime-prerequisites/po-address-native-r2.json; runtime-prerequisites.json; verification-evidence.json. Reused previous native adapter/parity/custom-local-entrypoint evidence only for unchanged inputs; no full business/race/unit/DOM suite, build, extra-history re-audit or new PostgreSQL download.
- boundaries: CUSTOM_LOCAL_ENTRYPOINT remains separately verified; SUPABASE_DB_PUSH_DIVERGED remains blocked by retained extra history. Managed QA business-data provenance UNKNOWN; managed_qa NOT_MODIFIED, production NOT_TOUCHED, remote NOT_PUSHED. Native cluster restarted after ownership/target checks and STOPPED after evidence capture; no other cluster/process was touched. Owner acceptance pending; release BLOCKED.


## APPROVE_PO_ADDRESS_POLICY_AND_CLOSE_DEFECT — 2026-10-04 delta

- scope: SPEC-PUR-001 / UX-REC-003; Owner selected WAREHOUSE_ADDRESS_REQUIRED_BEFORE_NEW_PO_DRAFT. Prior BLOCKED_EXACT_POLICY resolved; no DOCSET bump.
- changed_paths: Spec.md; UXUI.md; supabase/migrations/20261004052921_po_warehouse_address_policy.sql; src/modules/purchasing/{actions.ts,form-options.ts,warehouse-address.ts,warehouse-address.test.ts}; src/components/purchasing/purchase-order-form{.tsx,.test.tsx}; src/app/admin/purchase-orders/{new/page.tsx,[id]/edit/page.tsx}; scripts/qa/test-po-address-policy.mjs; tasks.md.
- implementation: FIXED_PENDING_RETEST. RPC creation validates current scoped warehouse address after permission/idempotent receipt check; explicit DRAFT warehouse/snapshot update uses version/reason/audit. Confirmation trigger rejects blank warehouse snapshot. No historical rows rewritten, NOT NULL retained.
- checks NEW: owned CLEAN migration 74 canonical contents matched, historical synthetic CONFIRMED blank snapshots preserved; native 5 recorded checks PASS, 4 groups failed (three setup failures: wrong AP table; direct fixture wrong linked-line field). NOT BUSINESS_PASS for blocked groups. DIVERGED not yet run after harness correction.
- checks NEW: focused Vitest R1: 2 files PASS / 5 unit tests; PO DOM failed transform (missing JSX brace), 0 component cases executed. Warehouse options mapper missing address also requires correction. R1 failures retained. No build/typecheck PASS claimed for this application patch.
- browser NEW: current worktree server http://127.0.0.1:4057 started; HTTP environment identity matched application eba7bc55717eca047e1008e3fab8e3472733e9c1997757a3190623bf8b4f8892. Browser opening metadata returned net::ERR_BLOCKED_BY_CLIENT, so browser pin/UI runtime BLOCKED_URL_POLICY; managed QA schema parity/write authorization also absent. No hostname/proxy/tunnel workaround. Four prior runtime cases remain 0/4.
- evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/20261004-po-address-policy-20261004052921/verification-evidence.json. Candidate base 0c80612b8af833e3d3311aef0a4f815cb47f29ec; code fingerprint 5338cc740b456f814aea5d275216ce6824b6ad04d266ac36a46d2af6d8090521. Tasks/implementation and secrets excluded from code identity.
- blocker: awaiting confirmation for corrections of newly introduced UI/mapper and harness errors; requested separately. PO policy is NOT blocked. No coherent new checkpoint while UI cannot compile.
- checks REUSED: previous native cluster ownership/root-cause evidence only; old empty-address acceptance diagnostics not closing new policy. Unrelated backend/race suites not rerun.
- production impact: NOT_TOUCHED; managed_qa=NOT_MODIFIED; remote=NOT_PUSHED.


## COMPLETE_PO_ADDRESS_PATCH_AND_BUSINESS_ACCEPTANCE — 2026-10-04 delta

- scope: complete existing PO address patch, SPEC-PUR-001 / UX-REC-003; Owner policy unchanged. Previous permission/setup blockers superseded by explicit REPAIR_AND_BUSINESS_QA authorization.
- changed_paths this turn: src/components/purchasing/purchase-order-form.tsx; src/components/purchasing/purchase-order-form.test.tsx; src/modules/purchasing/form-options.ts; scripts/qa/test-po-address-policy.mjs; tasks.md; implementation.md. Previous policy/RPC/actions/pages/helper changes retained for coherent patch checkpoint. No migration rewrite.
- fixes: JSX compile corrected; warehouse address_text DTO mapping complete; payable_obligations and linked_sales_order_line_id confirmed from actual native schema/function; native JWT actor assertion no longer invokes Auth schema directly. No GRANT, RLS, business policy or historical ledger change to make tests pass.
- checks NEW: native CLEAN 13/13 and reconstructed DIVERGED 13/13 recorded checks PASS; actual candidate migration manifest content checked, known extra 20261002114730 retained unchanged. This is affected local verification, NOT managed parity / SUPABASE_DB_PUSH_DIVERGED release authorization.
- checks NEW: business fixture A10bao×60000 + B2m³×200000 =1000000; PACKAGING50kg/bao synthetic conversion reused; receipts560000 then440000, AP total1000000, inventory A500kg/B2m³, AR delta0. Partial over-receive rollback and receipt retry no duplicates verified. Direct supplier verification AP1000000 with no warehouse receipt/movement or customer AR effect.
- checks NEW: blank source NULL/empty/ASCII+Unicode whitespace rejected; no partial command effects; same failed creation intent works after catalog repair; committed retry preserves PO/snapshot and rechecks current permission; payload conflict; legacy blank DRAFT guard; explicit snapshot/warehouse/version/reason/audit; confirmed snapshot immutable. Separate quantity/terms readback NV04 PASS on both DBs (12bao+2m³,1120000; frozen snapshot unchanged).
- checks NEW: focused Vitest17/17 (DOM12 + UNIT5), lint exit0 (0errors,6 nonblocking test unused-variable warnings), next typegen + tsc exit0, next build --webpack exit0, build ID W_zEjgKg0vNGzuSk6Kfg3. First native Auth assertion failure and patch-tool quoting failure preserved as harness/tool errors, not BUSINESS_PASS.
- browser/runtime: tested build served at http://127.0.0.1:4057; HTTP metadata/login200 with application identity 45126a1bc014dfe392b161e8ab25102ef39fad576cf21c60f3546f2b81a331ad. Browser URL policy net::ERR_BLOCKED_BY_CLIENT reused because permission unchanged; no repeated navigation or workaround. API target https://ffrwiglcrlumfvhubaxg.supabase.co remains managed QA (NOT owned native DB), schema/write gates absent. No Auth/RLS bypass, no managed writes.
- evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/20261004-po-business-acceptance/verification-evidence.json; business-cases.json separates native, DOM, HTTP, browser and Owner layers. Candidate base 0c80612b8af833e3d3311aef0a4f815cb47f29ec; verification fingerprint 9994d8d08a2688b097c70e2ea2027d0aec065066fbdc6a5f411685f5d1a287a1. Secrets/data/progress docs excluded; application and migration scopes separate.
- result: LOCAL_PATCH_COMPLETE=YES; NV01..08 native portions covered, required UI/HTTP layers unresolved, whole cases0/8PASS,0FAIL,8PARTIAL_ENV_BLOCKED. Four older runtime defects remain0/4. Owner acceptance PENDING_OWNER; release NOT_AUTHORIZED.
- reused_evidence: ownership and unchanged URL-policy blocker only; old blank-acceptance diagnostics and failed checks NOT reused as fixed behavior. Unrelated backend/race checks not rerun.
- boundaries: remote NOT_PUSHED, managed_qa NOT_MODIFIED, production NOT_TOUCHED; no provider/performance/managed restore/historical1VND work. Local cluster/server stopped after evidence.


## Delta 2026-10-04 — FINALIZE_LOCAL_PO_PATCH_AND_PREPARE_RUNTIME_ACCEPTANCE

- Code checkpoint: `6833e7fc13a4b739cc34b6a4b71c250c9418fe95`; application fingerprint `45126a1bc014dfe392b161e8ab25102ef39fad576cf21c60f3546f2b81a331ad`; build `W_zEjgKg0vNGzuSk6Kfg3`. HEAD matched baseline; only existing untracked `node_modules` was preserved. Contract and evidence input hashes matched: 0 mismatches. This handoff changes documentation only.
- LOCAL_IMPLEMENTATION=COMPLETE / LOCAL_PATCH_COMPLETE. NATIVE_BUSINESS_VERIFICATION=PASS_LOCAL_AFFECTED_SCOPE: REUSED CLEAN 13/13, reconstructed DIVERGED 13/13, DOM 12/12, UNIT 5/5, typecheck/build PASS, lint 0 errors/6 warnings. No new native/DOM/build runs; local divergence reconstruction is not managed parity or permission for Supabase db push.
- RUNTIME_ACCEPTANCE=PARTIAL_ENV_BLOCKED / WAITING_RUNTIME_PREREQUISITES; OWNER_ACCEPTANCE=PENDING_OWNER. No PO browser case newly verified; no application failure is inferred from missing runtime prerequisites. The four older runtime defects remain separate and unchanged.
- Last origin `http://127.0.0.1:4057`: server STOPPED; browser `net::ERR_BLOCKED_BY_CLIENT` / BLOCKED_URL_POLICY. Available tools expose no official URL-approval API; no blocked-origin retry, hostname/proxy/tunnel/tool workaround or Auth bypass was attempted. HTTP build metadata is not browser pinning.
- Actual configured API target `https://ffrwiglcrlumfvhubaxg.supabase.co` is managed, not the local PostgreSQL fixture. Current managed PO schema compatibility is NOT_PROVEN; no cloud call was made to refresh historical preflight results. Target data classification=UNKNOWN; managed fixture-write authorization=NOT_GRANTED; QA Owner session and runtime branch/permissions=NOT_VERIFIED. The QA credential already exists privately; no credential was read/exposed or requested in chat. Storage is not a prerequisite for these PO cases.
- Required Owner actions: official browser-origin approval; classify project `ffrwiglcrlumfvhubaxg` data and authorize exact synthetic writes; establish candidate-compatible API/schema (separate exact managed-patch approval if needed); establish QA Owner/test-role sessions and branch permissions using private credentials. No cloud mutation is authorized by this handoff.
- Managed schema approval package: DRAFT_INCOMPLETE_NOT_EXECUTABLE. Target known; data, current exact pending operations and approved backup/recovery are not confirmed. Reuse the existing reconciliation patch/candidate manifest and PO forward migration `20261004052921_po_warehouse_address_policy.sql`; obtain an approved scoped preflight before identifying any cloud delta. No migration-history rewrite, historical document/ledger repair or execution based on old migration counts. Postchecks must cover affected signatures/permissions/snapshots/idempotency/receipts and UI on approved fixtures, with checksum/provenance limitations disclosed.
- New handoff artifact: `/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/20261004-po-business-acceptance/local-handoff-20261004-6f634ec8.json`. Original evidence retained at `/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/20261004-po-business-acceptance/verification-evidence.json`. Owned cluster/server remain STOPPED per existing cleanup; no waiting goal, remote push, managed QA write or Production touch.

### Manual UAT handoff — NV-01..NV-08 (prepared, NOT_EXECUTED)

Only begin writes after target/schema/data classification and fixture-write authorization are confirmed. Start with the QA test identities/branch, not business accounts. Record CASE_ID, actor, candidate, environment, fixture/document IDs, actual actions, UI/readback, evidence and result. Reload after save. Owner results use USER_REPORTED_MANUAL_UAT, not automated browser PASS. No SQL may stand in for a UI action.

| Ca | Màn bắt đầu và thao tác | Kết quả / đối chiếu cần thấy | Bằng chứng cần lưu |
| --- | --- | --- | --- |
| NV-01 | `/admin/purchase-orders/new`: NCC + kho thử thiếu địa chỉ; A10 bao × 60.000đ, B2m³ × 200.000đ; lưu. Fixture riêng NULL/rỗng/trắng. | Lỗi tại Kho nhận; giữ toàn bộ form; không PO/lines/allocation/success receipt, không AP/AR/movement. | Ảnh trước/sau lỗi; readback đúng quyền. |
| NV-02 | Ngay form trên: Bổ sung địa chỉ kho; lưu master rồi tiếp tục draft. Kiểm actor thiếu quyền riêng. | Giữ kho/NCC/hai dòng/ngày/ghi chú; địa chỉ cập nhật; PO vẫn DRAFT; không sửa master trái phép hay lịch sử. | Ảnh trước/sau, mã PO, reload master/detail. |
| NV-03 | Tạo hai dòng, mở `/admin/purchase-orders/<id>`, tải lại và xác nhận. | A600.000đ + B400.000đ = 1.000.000đ; snapshot/terms đúng; DRAFT/CONFIRM chưa tăng tồn/AP/AR. | Detail trước/sau, mã PO, tồn/AP/AR trước/sau. |
| NV-04 | `/admin/purchase-orders/<id>/edit`: sửa quantity/terms; DRAFT lỗi fixture thử xác nhận, chủ động refresh có lý do/version; stale version; confirm rồi đổi master. | Quantity/terms không refresh ngầm; blank snapshot bị chặn; version/audit đúng; stale bị từ chối; CONFIRMED giữ snapshot. A12/B2 tổng 1.120.000đ. | Ảnh lỗi/refresh/confirm, version/audit; không dựng DRAFT lỗi trên cloud chưa được phép. |
| NV-05 | Form/detail: retry cùng operation ID sau sửa master, rồi retry đã commit và payload khác. | Một PO/hai lines; cùng key/payload trả PO cũ và giữ snapshot; khác payload conflict; vẫn kiểm quyền hiện tại. | Request đã che auth/PII, operation ID thử, mã PO/readback; HTTP_RPC ghi riêng. |
| NV-06 | Form + authenticated RPC hiện có với actor thử thiếu quyền/khác branch và payload snapshot giả. | Server từ chối địa chỉ NULL/rỗng/trắng, snapshot giả và sai quyền/branch; không leak/partial effects. | Request/error đã che secret và readback; endpoint lấy từ request thật, không đoán; không service role browser. |
| NV-07 | Detail PO: nhận/xác minh lần 1 A6/B1; lần 2 A4/B1; retry receipt và over-receive riêng. | 560.000đ + 440.000đ; AP cuối 1.000.000đ, AR Δ0; tồn từng vật tư đúng, không duplicate/vượt nhận. Chỉ A500kg nếu fixture có conversion 50kg/bao đã cấu hình; B2m³. | PO/receipt IDs, ảnh từng lần, conversion và tồn/AP/AR/movement trước/sau/reload. |
| NV-08 | `/admin/orders/<id>`: dùng luồng hiện có tạo PO giao thẳng, kiểm liên kết và xác minh NCC. | Snapshot công trình/SO, không NCC/kho; không cần địa chỉ kho; mua–bán liên kết; không movement giả; supplier AP không tự thành customer AR. | SO/PO/source-line IDs, ảnh snapshot, AP/AR/movement đọc lại; không suy customer verification đã đạt. |

Keep screenshots/logs free of password/token/auth headers, live signed URLs and PII. Use independent approved fixtures where cases would otherwise share state. Exact receiving/direct-flow URLs not previously observed are not invented; navigate through the existing detail action and record the actual path during manual UAT.


## Delta 2026-10-04 — SCOPED_QA_FIXTURES_AND_PO_RUNTIME_ACCEPTANCE

- Owner decision recorded: QA_PROJECT_REF=ffrwiglcrlumfvhubaxg; DATA_CLASSIFICATION=TEST_DATA_ONLY; CLASSIFICATION_SOURCE=OWNER_CONFIRMED; QA_FIXTURE_WRITE_AUTHORIZATION=GRANTED_SCOPED for NV-01..NV-08 only. This supersedes prior UNKNOWN/NOT_GRANTED statements; no repeated request for classification or fixture permission. Schema/history mutation, account privilege changes and Production remain unauthorized.
- Candidate HEAD=5e0c9be82e29a499c0d75a1cb2158984764dccc6; only pre-existing untracked node_modules preserved. Evidence input/contract hash comparison:0 mismatches. LOCAL_IMPLEMENTATION=COMPLETE; NATIVE_BUSINESS_VERIFICATION=PASS_LOCAL_AFFECTED_SCOPE. REUSED CLEAN13/13, reconstructed DIVERGED13/13, DOM12/12, UNIT5/5, typecheck/build PASS, lint0errors/6warnings; none rerun. This delta edits progress docs only.
- NEW read-only managed PO preflight, not whole-schema/history audit: create lacks warehouse_address_required/normalizer; private normalization helper absent; trigger function lacks blank snapshot confirmation guard; update_purchase_order_warehouse RPC absent. Affected managed PO writes locked (QA-SCHEMA-PO-ADDRESS/CONFIRM/REFRESH); this is environment deployment divergence, not a new reproduced local application defect. No managed migration applied.
- NEW direct RPC readback: six parameters with optional commercial_terms DEFAULT NULL. Its five-parameter caller is not rejected merely because of that optional parameter; body/default reviewed. Runtime effects NOT_VERIFIED. Existing 20261003161428 canonical reconciliation patch also modifies stock-count rules, so it is NOT silently bundled or made a new PO-address gate.
- Exact schema approval package: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-PO-20261004T102627Z/po-schema-approval-package.json. Required PO patch supabase/migrations/20261004052921_po_warehouse_address_policy.sql, SHA256=9e74a7976728bb33b4401d642b79329e5d5ece9ac016e8509c06bbf238bf2f7d; creates private normalizer and explicit DRAFT warehouse/snapshot RPC, replaces create command and PO mutation guard; no history/master/ledger row repair, business role grant or RLS/Storage change. Separate schema/entrypoint and backup/recovery approval remains required; current reconciliation executionOrder does not include this added PO migration.
- NEW existing QA Owner/Sales/Worker signInWithPassword succeeded through publishable-key HTTP Auth; actual configured QA role/branch permissions read without changes. Owner has purchasing.create/purchasing.confirm/inventory.receive/roles.manage; Sales/Worker are restricted actors. This is NOT browser-session acceptance; no service-role business action, new user or privilege elevation. Test credentials/tokens not printed or saved.
- NEW owned server4057 restarted from existing build W_zEjgKg0vNGzuSk6Kfg3. /api/qa/environment200 and /login200; application fingerprint45126a1bc014dfe392b161e8ab25102ef39fad576cf21c60f3546f2b81a331ad, exact source checkpoint metadata and API target https://ffrwiglcrlumfvhubaxg.supabase.co verified by HTTP. Browser remains BLOCKED_URL_POLICY (net::ERR_BLOCKED_BY_CLIENT); current browser inventory only has old4036 tab, not candidate proof; no official URL-approval API exposed, no denied-origin retry/bypass. Owned server stopped after evidence; native cluster not restarted.
- Run=QA-PO-20261004T102627Z; fixture manifest=/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-PO-20261004T102627Z/fixture-manifest.json. Records created=0 because mandatory runtime gates are not satisfied; no SQL substituted for UI, no off-run master/document mutated. No email/SMS/Zalo/invoice/payment or external provider action invoked.
- RUNTIME_ACCEPTANCE=BLOCKED_ENV: NV01..08 whole runtime cases0PASS/0FAIL/8BLOCKED; NV08 independently blocked by browser, not warehouse address/Storage. Manual guide already prepared remains reusable. Older four runtime defects unchanged/out of scope; OWNER_ACCEPTANCE=PENDING_OWNER.
- Evidence=/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-PO-20261004T102627Z/runtime-acceptance-delta.json; scoped-schema-auth-preflight.json; direct-po-contract-readback.json; http-candidate-identity.json; local-server.log. Connector read access denied; guarded existing QA TLS connection used only for catalog read-only transactions.
- Remaining owner actions ONLY: separate exact PO-schema forward-patch/entrypoint approval plus backup/recovery safeguard; official browser-origin approval. Data classification/fixture permission and QA credentials are no longer blockers. No fixture/schema/role changes; QA Auth sessions only, local sign-out after checks. Other targets NOT_TOUCHED, remote NOT_PUSHED, release NOT_AUTHORIZED.


## Delta 2026-10-04 — APPLY_APPROVED_PO_QA_PATCH_AND_RUN_BUSINESS_ACCEPTANCE

- Owner granted exact QA schema change for project ffrwiglcrlumfvhubaxg and migration20261004052921, SHA2569e74a7976728bb33b4401d642b79329e5d5ece9ac016e8509c06bbf238bf2f7d. TEST_DATA_ONLY_OWNER_CONFIRMED and GRANTED_SCOPED fixture permission retained; no other migration/history repair/account grant/Production authorization. This supersedes prior schema-authorization blocker.
- Candidate5e0c9be82e29a499c0d75a1cb2158984764dccc6 plus progress-doc deltas only; actual SQL bytes match approved checksum; native CLEAN/DIVERGED evidence refers to identical bytes, source/contract inputs0mismatches. REUSED native13/13+13/13, DOM12/12, UNIT5/5, typecheck/build and lint scope; no full rerun.
- NEW scoped preflight: existing affected function body fingerprints, required private helpers, draft_version/address_text types and enabled guard trigger matched before-backup expectations; no historic blank PO snapshots found in this scoped read. No additional migration selected. Metadata/history guard scoped to affected objects plus protected-history digest; no migration provenance audit.
- Before-change backup captured: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-PO-20261004T102627Z/approved-patch-2026-10-04T11-23-37-143Z/before-scope-backup.json and restore-affected-functions.sql include old definitions, owners, security/config, EXECUTE ACLs, trigger/constraint metadata and relevant history. No top-level business DML in approved SQL, so no claim that schema-only export backs up business data or roles.
- QA-HARNESS-BACKUP-COMPARE: new readback assertion stopped before native restore rehearsal or QA DDL because postgres.js Result array prototype differs from plain JSON array; not an application/business failure or corrupt-backup finding. Exact error retained in apply-result.json. Request to correct only assertion already sent; no second request for schema/fixture permission. backup_safeguard=BLOCKED_LOCAL_ASSERTION; qa_schema_apply=NOT_APPLIED, migration history unchanged by this runner, cache reload and business HTTP RPC NOT_RUN. No blind apply retry.
- Entrypoint planned: existing tested postgres.js sql.begin -> tx.unsafe(exact approved bytes).simple() -> one migration-history INSERT, guarded by lock/timeout and same-transaction NOTIFY. Actual executed wrapper command and scope preserved in commands-actually-executed.json; migration phase was not reached.
- NEW local candidate server at4057: same build W_zEjgKg0vNGzuSk6Kfg3 and application fingerprint45126a1bc014dfe392b161e8ab25102ef39fad576cf21c60f3546f2b81a331ad; HTTP identity PASS. Owner newly allowed origin, so browser attempted it once; still net::ERR_BLOCKED_BY_CLIENT, no approval API exposed and no proxy/hostname/tool/tunnel workaround. Browser candidate not pinned, no browser session/UAT.
- Owned server PID66862 stopped and parent exited0 (OWNED_SERVER_STOPPED). Native cluster never started because safeguard assertion failed earlier. Run QA-PO-20261004T102627Z reused, fixture records0 and existing manifest retained. Runtime cases0PASS/0FAIL/8PARTIAL_OR_BLOCKED; older runtime defects unchanged.
- Evidence directory=/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-PO-20261004T102627Z/approved-patch-2026-10-04T11-23-37-143Z; apply-result.json, exact-command-and-scope.json, before-scope-backup.json, restore-affected-functions.sql, browser-server-identity.json, browser-attempt-approved-origin.json, commands-actually-executed.json. managed_qa_changes=NONE; other targets NOT_TOUCHED; remote NOT_PUSHED; owner_acceptance=PENDING_OWNER; release=NOT_AUTHORIZED.


### 2026-10-04 - Approved PO QA patch applied; scoped HTTP acceptance setup delta

- Scope: FIX_BACKUP_HARNESS_APPLY_APPROVED_PATCH_AND_CONTINUE_PO_ACCEPTANCE; candidate 5e0c9be82e29a499c0d75a1cb2158984764dccc6, application fingerprint 45126a1bc014dfe392b161e8ab25102ef39fad576cf21c60f3546f2b81a331ad unchanged. No application/SQL source change.
- LOCAL_IMPLEMENTATION=COMPLETE; NATIVE_BUSINESS_VERIFICATION=REUSED_PASS_LOCAL_AFFECTED_SCOPE (CLEAN 13/13, reconstructed DIVERGED 13/13); DOM 12/12, UNIT 5/5, typecheck/build PASS, lint 0 errors/6 warnings reused on unchanged inputs. These are not managed HTTP/browser results.
- QA-HARNESS-BACKUP-COMPARE=FIXED_VERIFIED: postgres.js Result row collections extracted to plain semantic payload, nested JSON/Unicode/quotes/null regression PASS, ACL order normalized; all definition/owner/grant/security/history assertions retained. Temporary harness /private/tmp/hx-po-approved-qa-apply-20261004.mjs only.
- First local safeguard attempt failed ECONNREFUSED because start used default port; no cloud mutation. Explicitly restarted the owned existing cluster at 127.0.0.1:54757 with its declared socket; scoped restore of pre-patch definitions/owners/grants, semantic comparison, exact reapply and rollback PASS_SCOPED. Cluster stopped after the successful run.
- QA_SCHEMA_APPLY=APPLIED to Owner-approved TEST_DATA_ONLY project ffrwiglcrlumfvhubaxg. Exact 20261004052921_po_warehouse_address_policy.sql SHA256 9e74a7976728bb33b4401d642b79329e5d5ece9ac016e8509c06bbf238bf2f7d rechecked immediately before transaction; exact SQL + one history INSERT + NOTIFY pgrst committed atomically. Version 20261004052921 added once; old history and extra 20261002114730 unchanged. No other migration or business-data backfill.
- Backup safeguard PASS_SCOPED: before-scope-backup.json + restore-affected-functions.sql + safeguard-check.json; source/ownership/security/grants/history and unaffected guards compared. No full-data/managed-recovery claim. Schema metadata PASS_PO_AFFECTED_OBJECT_SCOPE; behavioral postchecks still pending fixture setup.
- HTTP Auth Owner/Sales/Worker PASS with existing accounts; new update_purchase_order_warehouse RPC reached through PostgREST (22023 purchase_order_missing on nonexistent PO), confirming cache visibility, not full business PASS. Sales/Worker create PO and edit warehouse denial: 4/4 HTTP 42501 forbidden subcases PASS, no success command receipts. No service role used for actor operations.
- Fixture run QA-PO-20261004T102627Z: setup transaction FAILED 23514 material_groups_code_check and rolled back; committed fixture records=0. New harness used lowercase in uppercase-only codes; UOM requires its distinct lowercase underscore-only format. QA-HARNESS-FIXTURE-CODE=REPRODUCED_SETUP_FAILURE. A separate new assertion also incorrectly requires zero receipts after a conflict on an already committed key; QA-HARNESS-RETRY-RECEIPT=INFERRED_HARNESS_DEFECT, not application failure. Async correction request issued; no silent correction, replay, assertion removal or business PASS.
- RUNTIME_ACCEPTANCE=BLOCKED_SETUP_AND_BROWSER; technical full cases 0/8 executed, NV-06 permission subcases 4/4 only. Missing browser did not invalidate independent HTTP checks. Browser blocker retained net::ERR_BLOCKED_BY_CLIENT for http://127.0.0.1:4057; no official approval API exposed, no repeated request or bypass. Server remains STOPPED.
- Manual UAT handoff READY in manual-owner-uat.json for remaining UI steps; unchanged eight approved scenarios, separate USER_REPORTED_MANUAL_UAT label, same candidate/run/readback and secret-redaction rules. Not Owner acceptance.
- Evidence directory: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-PO-20261004T102627Z/approved-patch-2026-10-04T12-01-35-239Z; goal-delta-evidence.json indexes actual apply/backup/rehearsal/Auth/HTTP/setup-failure artifacts. Failed attempts retained; fixture-manifest.json marks SETUP_ROLLED_BACK_NO_FIXTURES_COMMITTED with planned IDs only.
- Result: exact approved schema patch APPLIED, fixture acceptance NOT_COMPLETED; business defects NONE_REPRODUCED, not a no-defect claim. Remaining: correct newly authored fixture-code/retry assertions after pending response, execute HTTP/database NV-01..08, browser-origin access for UI evidence. OWNER_ACCEPTANCE=PENDING_OWNER; release NOT_AUTHORIZED.
- Managed QA changes=PO_SCHEMA_PATCH only; other targets/Production NOT_TOUCHED; remote NOT_PUSHED; checkpoint unchanged 5e0c9be82e29a499c0d75a1cb2158984764dccc6. Historical repair/provider/performance/restore/GPS/chat/invoice not reopened.


### 2026-10-04 - PO managed HTTP business acceptance 8/8; manual UI evidence pending

- Scope: FIX_BACKUP_HARNESS_APPLY_APPROVED_PATCH_AND_CONTINUE_PO_ACCEPTANCE. Candidate 5e0c9be82e29a499c0d75a1cb2158984764dccc6 + documentation delta; application fingerprint 45126a1bc014dfe392b161e8ab25102ef39fad576cf21c60f3546f2b81a331ad unchanged. No application, contract, migration, dependency or repository test edit. Temporary HTTP harness only.
- Owner continuation permits fixing the reported harness/setup errors. QA-HARNESS-FIXTURE-CODE=FIXED_VERIFIED: group/customer/material codes use actual uppercase pattern, UOM codes use lowercase/underscore pattern; DB constraints unchanged. QA-HARNESS-RETRY-RECEIPT=FIXED_VERIFIED: rejected request compares the exact pre/post plain receipt payload, preserving a prior successful receipt rather than demanding zero for an already committed key. Assertions retained.
- First corrected setup created 19 tagged master fixtures in QA-PO-20261004T102627Z; Owner commands were rejected because selected branch 45b9bab7-6274-4eaa-a956-3abd618c4a62 has branches.active=false. Earlier metadata mislabeled employee_branch_access.active as branch active. Actual employee/access/role remain active; has_permission correctly checks branch active. This is harness/environment setup, not a PO application defect. No PO/lines/AP/AR/movement/allocation were produced; all prior fixtures and failed evidence retained, no cleanup or role mutation.
- QA-HARNESS-ACTIVE-BRANCH-PREFLIGHT=FIXED_VERIFIED: new run QA-PO-20261004T124129Z uses active branch a29d9f95-516a-4752-a67e-af3f5611d7bf and cross-branch warehouse at active 990145a0-8fd8-4db7-a7ca-c67c0113184f. Preflight checks actual employee/access/branch/role active flags and required Owner permissions before setup. Owner/Sales/Worker authenticated via existing QA accounts; no added grants/accounts or service-role actor replacement. New UUIDs/codes; old run IDs not reused.
- Approved migration already applied: SHA256 remains 9e74a7976728bb33b4401d642b79329e5d5ece9ac016e8509c06bbf238bf2f7d. Managed history 20261004052921 verified exactly once with matching SQL statements. ALREADY_APPLIED_VERIFIED; no second DDL, history INSERT, pending migration or cache reload needed. New snapshot RPC successfully executed via PostgREST. BACKUP_SAFEGUARD=REUSED_PASS_SCOPED; earlier scoped local restore/reapply/rollback and semantic backup assertions valid, not managed full restore.
- SCHEMA_COMPATIBILITY=PASS_PO_AFFECTED_SCOPE; RPC_HTTP=PASS_PO_SCOPE. NV-01..NV-08: 8/8 HTTP_RPC + managed DB readback PASS on the same candidate/new fixture run. Owner positive paths and Sales/Worker denial use real Auth; SQL only fixture setup/readback, never labeled UI acceptance.
- NV-01: NULL/empty/tab-newline-only warehouse address returns 22023 warehouse_address_required; no successful receipt, PO/lines/allocation/AP/AR/movement partial effects. NV-02: address completed by authorized catalog RPC, same rejected creation operation succeeds once with two lines and DRAFT state; restricted Sales warehouse update rejected. Form retention/modal interaction remains DOM-only existing evidence until browser.
- NV-03: two lines A10 bags x 60000 = 600000 VND, B2 m3 x 200000 = 400000 VND; total 1000000 VND, correct persisted UOM/date/terms/snapshot. DRAFT and CONFIRM produce no early stock/AP/AR.
- NV-04: quantity/terms edit changes total to 1120000 VND but keeps original snapshot; explicit refresh checks version/reason/audit. Own tagged legacy-invalid DRAFT fixture is identified as SETUP_SQL, not a valid creation flow; CONFIRM rejects its empty snapshot. Refresh succeeds, stale version rejects, CONFIRMED snapshot remains fixed after fixture warehouse master changes and rejects further draft refresh.
- NV-05: failed creation operation succeeds after address completion; committed retry returns the same PO/snapshot even after master address becomes NULL; changed payload conflicts, current Worker permission checked before returning old result; exact successful receipt preserved, no duplicate lines/effects. NV-06: wrong warehouse branch, forged snapshot, unsupported snapshot RPC parameter, missing purchasing/catalog permission and restricted snapshot refresh rejected; Worker HTTP RLS read returns no PO row; no partial effects. Browser N/A for these executed HTTP technical contracts.
- NV-07: real receipt RPCs create first 560000 VND and second 440000 VND; warehouse AP total 1000000 VND; A500kg from configured fixture 50kg/bag, B2m3 separately; four movements. Both retries return original receipt IDs without duplicates. Over-receive after an earlier valid line rolls back receipt/line/movement/AP/success receipt; PO CLOSED and confirmed snapshot unchanged; customer AR remains zero.
- NV-08: direct PO uses Site/SO address and both linked sales lines, no warehouse address requirement/warehouse receipt/movement. Supplier fulfillment creates independent AP 1000000 VND and direct cost 1000000 VND; retry deduplicated, customer AR remains zero. No customer-verification PASS implied. Total own-run AP 2000000 VND comprises separate warehouse and supplier-direct sources, not duplicate AP.
- New fixture manifest: 19 masters; 4 POs/8 PO lines; 2 receipts/4 receipt lines; 3 AP obligations; 4 inventory movements; 2 supply allocations; 1 SO/2 SO lines; 1 supplier fulfillment/2 fulfillment lines; 1 direct cost entry. All generated IDs/source links captured; both runs retained. External-action preflight passed for exercised RPCs/enabled triggers; no email/SMS/Zalo/invoice/payment actions invoked.
- Technical cases 8/8 PASS. Full required runtime evidence complete for NV-05/NV-06 (2/8, browser N/A for their HTTP contracts). NV-01/NV-02/NV-03/NV-04/NV-07/NV-08 remain PARTIAL_BROWSER_EVIDENCE, not FAIL and not browser PASS. Existing DOM 12/12 reused only within local PO component scope; no DOM claim for receipt/direct UI. Browser origin http://127.0.0.1:4057 remains blocked net::ERR_BLOCKED_BY_CLIENT with no official approval API exposed; no repeated request/proxy/tunnel/tool bypass, server not restarted.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-PO-20261004T124129Z/runtime-acceptance/http-business-acceptance-2026-10-04T12-41-29-879Z.json, po-acceptance-closure.json, manual-owner-uat.json; fixture-manifest.json in the run parent contains generated records/counts/source links. Earlier failed attempt/branch diagnostics retained under the old run. No secrets, credentials, active signed URL or real-person data in artifacts.
- Checks: node /private/tmp/hx-po-http-business-20261004.mjs; corrected-code attempt recorded 6 setup assertion failures + 2 dependent blocked cases (exit 0 from case-catching runner is not PASS), classified by inactive branch; subsequent new-run execution 8/8 technical PASS, exit 0. Readback manifest enrichment only, no suite rerun. Native CLEAN 13/13, reconstructed DIVERGED 13/13, DOM 12/12, UNIT 5/5, typecheck/build PASS and lint 0 errors/6 warnings reused on unchanged repository inputs.
- LOCAL_IMPLEMENTATION=COMPLETE; NATIVE_BUSINESS_VERIFICATION=PASS_LOCAL_AFFECTED_SCOPE; RUNTIME_ACCEPTANCE=PARTIAL_BROWSER_EVIDENCE; READY_FOR_OWNER_ACCEPTANCE with six-step manual UI checklist, USER_REPORTED_MANUAL_UAT only after Owner supplies results. OWNER_ACCEPTANCE=PENDING_OWNER; release NOT_AUTHORIZED. No newly reproduced application defect in executed PO scope; remaining blocker is browser/UI evidence, not backend policy/schema/fixture permission.
- Managed QA goal changes=BOTH (exact schema patch in prior turn + scoped QA fixtures in current turn). Other targets/Production NOT_TOUCHED; remote NOT_PUSHED; no commit/deploy. Existing owned cluster and app server remain stopped; no new runtime process left running. Historical repair/provider/performance/managed restore/GPS/chat/invoice not reopened.

## Milestone B evidence delta - QA-B-20261004T140821Z

scope: B1-B8 core operations and release preparation, not a repeat audit. Base application `5e0c9be82e29a499c0d75a1cb2158984764dccc6`; application/build inputs matched the existing PO evidence. Owner confirms QA `ffrwiglcrlumfvhubaxg` is TEST_DATA_ONLY and authorizes scoped B1-B8 fixtures. Existing PO patch/API/NV-01..08 technical PASS remains valid; six PO visual cases remain PARTIAL_BROWSER_EVIDENCE.

changed_paths: `.gitignore` (ignore existing runtime symlink without removing it); `supabase/migrations/20261004150000_sales_order_reader_scope.sql`; `scripts/qa/test-sales-order-reader-scope.mjs`; `tasks.md`; `implementation.md`. No application UI/command business logic was changed. The new RLS performance patch is LOCAL_PENDING_RETEST and is not approved/applied on managed QA.

gap_ids: PERF-B-01 (P1, reproduced bounded Sales Order filter latency). Execution plan shows correlated authorization checks for each scanned order. Proposed private statement-scope reader helper delegates the existing permission/membership checks. New native checks stopped at harness revoked-employee fixture constraint, then independent migration check stopped because the owned native cluster lacks service_role. Both transactions rolled back. No security/behavior/performance PASS is claimed for this patch.

new_evidence: `QA-B-20261004T140821Z/business-http-evidence.json` records normal authenticated master CRUD, explicit fixture UOM conversion, multi-line quote/revision/SO, price snapshot/reason/permission and stale/retry/immutability denials. Quote revision total 1,060,000 VND; confirming SO created no AR. Current Sales actor cannot create quotes because its configured role lacks quotation.create; no grant was changed. Finance payment 2,500,000 VND allocated 2,000,000 and 500,000; readback showed outstanding 0 and 500,000 with no available payment. These AR sources are explicit opening-debt fixture setup, not proof of sales fulfillment. Filtered dashboard reads canonical zero revenue/direct cost and 500,000 receivable; customer-filtered Opex/operating profit are NOT_APPLICABLE, not fabricated zero. Six real Auth sessions and unauthorized private-field/cross-branch reads were tested; customer finance/receiver personas are NOT employee Finance roles.

new_checks: real pg_dump/pg_restore with schema/function-security and inventory/AR/AP/payment/order/source-link reconciliation PASS_LOCAL_FIXTURE_SCOPE (`local-restore-evidence.json`). Local representative list-cardinality dataset and all measurements retained (`local-performance-evidence.json`); this is native SQL/loopback, not user-facing or full ledger performance. Customer-search timing has no authorized positive-control actor and cannot be called a successful customer-search benchmark. Budget authority remains Spec.md only. New harness lint: 0 errors, 2 warnings; node syntax check PASS. Package-manager wrapper hit sandbox EPERM before its automatic install could proceed; direct installed ESLint was used, no dependencies installed.

harness_failures: BIZ-05 duplicate-target negative assertion expected a different constraint code, and remaining reversal caller argument needs correction; as-of caller used RECEIVABLE instead of AR; native finance race setup queried a max-one pool inside its own transaction and stalled before race execution. New reader-scope revocation setup omitted the constraint-required deactivation timestamp, and its migration assumes service_role exists in the local bootstrap. Additional diagnostic/Storage metadata callers used a nonexistent employee.state field and an unawaited async database factory. These are TEST_HARNESS/SETUP failures, not reproduced ledger or Storage defects. Corrections to newly introduced harness mistakes are awaiting the explicit repair responses; no failed setup was counted as business PASS.

reused_evidence: native delivery business 16/16 and true two-session 5/5 (`/private/tmp/hx-unblock-native-20261003/native-business-r2.json`) with four affected input hashes unchanged; native workflow/reconciliation scope from `20261004-native-workflows/verification-evidence.json`; PO CLEAN/DIVERGED 13/13, DOM 12/12, UNIT 5/5, typecheck/build with 294 unchanged inputs; managed PO NV-01..08 technical evidence in `QA-PO-20261004T124129Z/runtime-acceptance/po-acceptance-closure.json`. None is relabeled browser, Storage or managed recovery PASS. The new reader SELECT-policy change needs its own checks and is excluded from these reused passes.

blocker: managed create/publish/WorkerResult/verify/return dependencies differ or are missing. Exact existing local patches 20261003063723, 20261003074122 and 20261003161428 are in the approval request, NOT APPLIED; the last patch includes a deliberate obsolete six-argument direct-PO function drop. Additional reader-scope patch is not yet eligible for managed approval because native retest is incomplete. Missing employee test personas, pending Owner UI UAT, private Storage upload/recovery, full performance scope, PDF/earning scenarios and opening balances prevent go-live readiness. Browser URL policy is unchanged; no tunnel/proxy/Auth bypass was used. Manual UAT and dependency-aware test-data transition proposals are artifacts, not executed cleanup or Owner acceptance.

result: technical PARTIAL; business PARTIAL; operational BLOCKED; MILESTONE_B=NOT_READY. One confirmed P1 performance defect remains; zero new P0s confirmed in executed scope does not establish whole-system P0 absence. Production impact: NOT_TOUCHED. Managed QA impact: QA_FIXTURES_ONLY; no new schema/config/permission mutation, no deletion. Remote: NOT_PUSHED. Local checkpoint is a blocked handoff, NOT a release approval.


### 2026-10-05 - Milestone B scoped repair and evidence closure delta

Scope: MB-01/02, BIZ-05/07/08, current native backup/restore and QA handoff. Base commit: 937e19a45c262707189397f46a4fe44d6c5a7f99. This is not go-live acceptance.

- LOCAL_IMPLEMENTATION: finance caller/lifecycle/race fixes and purchase-cost boundary implemented. Reader revoke fixture timestamps implemented, but an introduced bootstrap delimiter defect still blocks its native runner. The pending narrow repair question is not a PO/business-policy gate.
- NATIVE_BUSINESS_VERIFICATION: true finance allocation races 2/2 PASS with distinct PIDs, overlapping transactions and final invariants. Purchase cost boundary CLEAN 10/10 and reconstructed DIVERGED 10/10 PASS, transactions rolled back. Reader active controls CLEAN 24 and DIVERGED 5 PASS; reader revoke coverage remains NOT_RUN, not full security PASS.
- RUNTIME_ACCEPTANCE: finance HTTP/DB 6/6 PASS using existing Owner session and original committed payment. No Purchasing, Warehouse/Dispatch or Finance employee personas yet. No browser UAT PASS. PO six visual cases remain PARTIAL_BROWSER_EVIDENCE, independent of technical PO PASS.
- OWNER_ACCEPTANCE: PENDING_OWNER; B_TECHNICALLY_READY=NO; B_OPERATIONAL_READY=NO; release NOT_AUTHORIZED.

Harness delta: 6/7 original setup blockers resolved or verified already correct. B5 checks exact 23505/duplicate_allocation_target and absence of partial effects; reverse_payment uses reversal_reason. B7 uses AR/AP with independent as-of expected amounts. Finance race uses transaction-scoped metadata and two actual connections. The service_role prerequisite is NOLOGIN/NOSUPERUSER/NOBYPASSRLS locally, never a business actor. Storage database factory and employees.active metadata diagnostic executed successfully; this is not Storage bytes/runtime evidence. QA-READER-REVOKE-HARNESS remains pending retest because the newly introduced role-bootstrap SQL contains a malformed dollar delimiter.

PERF-B-01: authenticated native ORDER_FILTER p95=23.033625ms (concurrency 1) and 29.718250ms (concurrency 5), 100 samples each, 100000 SO / 500000 lines. Expected IDs preserved; errors=0. Baseline diagnostic before patch ~3046/2997ms. CUSTOMER_SEARCH positive control returns 25 expected IDs; p95=317.504916/414.916417ms, 100 samples at concurrency 1/5. This is loopback SQL transaction/query duration, not HTTP/browser/user wait or full mixed lifecycle performance. Full reader security/cloud eligibility remains HELD pending revoke runner.

NEW_GAP MB-COST-01 | P1 | REPRODUCED and FIXED_VERIFIED_NATIVE, managed application pending exact approval.
Contract: SPEC-ACC-005, SPEC-SEC-002 and existing purchasing.price.read field boundary.
Evidence: authenticated actor with purchasing.read=true and purchasing.price.read=false read non-null raw purchase_order_lines.unit_cost_vnd/line_total_cost_vnd while purchase_order_line_read correctly returned NULL.
Fix: forward migration 20261005043000_purchase_cost_column_boundary.sql, SHA256 a81058d48368dc8527bb133e13b76cfb9f016879a4d63238723a871b152193ef. Revoke raw sensitive column access, retain operational quantity columns, preserve existing barrier views and security-invoker PO header contract through a narrow session-gated private total accessor. No business history rewrite, write-policy change or cloud DDL.
Checks: authorized control, raw-price denial 42501, quantity/progress preservation, same-connection revoke/regrant and identity switch, cross-branch and inactive employee/access/role/branch denial, helper ACL/security; CLEAN/DIVERGED 10/10 each.

Finance: no repost of the existing 2500000 payment. Added three QA fixture payment records via authenticated RPC: original reversal, 1000 advance and its reversal, with append-only inverse allocations/advance sources/audit. Historical cutoff A0/B500000; current after reversal A2000000/B1000000; payment/advance net cash zero; revenue remains zero. QA target ffrwiglcrlumfvhubaxg, TEST_DATA_ONLY_OWNER_CONFIRMED, prior GRANTED_SCOPED_B1_B8 authority. No account/role/schema mutation.

Recovery: current native benchmark schema including reader and cost boundary backed up with pg_dump, restored into a separate owned local DB and reconciled selected business facts, inventory quantity/value grains, open AR/AP, payments, source links, function/security/ACL, policies and config hashes. This does not claim managed recovery or Storage recovery; native history provenance is not rewritten. Original earlier restore evidence retained.

Reusable inputs: 298 baseline input hashes UNCHANGED. PO address/native checks, unchanged application UNIT/DOM/typecheck/build and unrelated delivery evidence reused only in their original scopes. Existing delivery race evidence is not used for finance races. New reader checks are not closed with old RLS evidence.

Evidence directory: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-CLOSURE-20261005T023000Z
New artifacts: finance-http-resume-evidence.json; finance-race-evidence.json; reader-scope-independent-evidence.json; purchase-cost-boundary-evidence.json; purchase-cost-patch-evidence.json; cost-current-restore/local-restore-evidence.json; reused-input-validity.json; exact-qa-schema-and-personas-request.json; manual-owner-uat-current.json; qa-live-transition-delta.json.

Cloud gate: three existing QA delivery/reconciliation patches and new cost boundary NOT_APPLIED, NOT_APPROVED in this instruction. Reader separately HELD_NOT_APPROVABLE. Package explicitly identifies DROP of the six-argument direct PO overload, history append only, affected preconditions, backup requirements and selector-local-verification gate; no db push or history repair allowed. Sales individual grants are empty: proposal quotation.create/customers.manage is branch/account-scoped, not executed. Missing internal personas must be approved/provided through a secure channel.

Remaining operational gates: reader revoke runner, exact QA schema/persona/Storage-object-write authorization and HTTP postchecks, correct candidate UI/manual UAT, representative mixed lifecycle performance, representative earnings/Opex/PDF coverage, Storage bytes restore, Owner live-target/config/master decisions, opening facts and exact transition/deployment approval. No assumed zero opening balances; no prefix-delete/reset/truncate; historical 1 VND APPLY_BLOCKED_POLICY unchanged and outside this batch.

Production impact: NOT_TOUCHED. Remote: NOT_PUSHED. Managed changes: QA_FIXTURES_ONLY (finance append-only test effects). No actual go-live package is approved or release candidate frozen.

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


## Post-apply managed runtime evidence - 2026-10-05T11:35:57.211Z
- Authorized target unchanged: ffrwiglcrlumfvhubaxg, TEST_DATA_ONLY_OWNER_CONFIRMED. This delta does not reopen the five-migration transaction; poststate 60e2e9dcd8a473beb43d327629f59469519e67ef9663f7b7c8a2ca9de326f45c and history integrity reused.
- Executed exact persona package SHA 53637dfe2a65395b767ae0b6027f7f3768a4c1f5b607b415d5e0bc6c7a9c6372. Added only Sales quotation.create/customers.manage. Created three ordinary QA Auth/employee personas with dedicated minimum branch roles (9/15/13 permissions); no Owner substitution, service-role business actor or shared-role broadening. No secure input missing.
- Harness history capture distinguishes one active assignment from four preserved revoked rows. Metadata evidence output derives from the current run directory.
- reader-managed-security-evidence.json: managed HTTP full matrix 15/15, including inactive/revoked permission paths and genuine Sales/Worker/Sales identity switching. All temporary actor/access/role/branch state restored. Same DB PID over HTTP is not claimed.
- purchase-cost-managed-http-evidence.json: 13 positive/negative controls, ordinary Purchasing versus Warehouse/Dispatch, raw cost denied even for priced actor while authorized reader returns expected fixture values. Existing PO 08435cfe-3559-48f7-aeaa-f5a758314334 read only.
- managed-core-read-performance.json: seven paths, 10 samples each, zero errors and independent expected IDs. managed-dashboard-read-performance.json: p95 801.233958ms, warm p95 231.599ms; independent sum of 11 revenue and 9 service facts = 4802000. Measurement layer includes client/network; not browser/server-only or a full performance closure.
- New local harness errors disclosed: extra escape in zero assertion; raw customer INSERT instead of save_customer_site_profile; negative helper replaces operation ID. Existing asynchronous correction requests have no reply. Stock is not executed; business run stopped at first denied raw INSERT, with no committed business operation. These are harness issues, not a new schema-policy request.
- Current managed delta: two Sales grants; three ordinary users/employees/dedicated roles/access rows and 37 role-permission mappings; restored temporary reader mutations. No new migration, Storage write or existing business-document rewrite. Direct PO/stock/delivery/Storage execution remains pending. UI/manual UAT and Owner acceptance remain separate.
- Readiness: MANAGED_QA_CORE_READY_FOR_UAT=NO; candidate_ready_to_freeze=NO; B_TECHNICALLY_READY=NO; B_OPERATIONAL_READY=NO; exact_go_live_authorization=NOT_GRANTED. No Production or remote mutation.
- Evidence directory: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z


### 2026-10-05: managed runtime continuation, no schema reapply

Candidate remains 1c022d68a9948124270d6d8935b8d781c02ebb78; application/migration inputs unchanged. Reuse the closed five-migration managed poststate/history, reader 15 managed security controls, cost-boundary 13 managed controls, three daily personas, exact Sales grants, Finance and native evidence. No migration, role or shared-permission mutation in this continuation.

New actual evidence:
- /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/stock-count-http-evidence.json: PASS_FULL_STOCK_COUNT_MANAGED_HTTP (16 controls), including finite/zero inputs, stale version, permission/branch denial, same-key conflict and retry. Owned stock count 0e1a7101-b19e-443c-b53e-ccf4fba15fde; exactly one STOCK_ADJUSTMENT for +3 base quantity/+30000 VND. Warehouse c0d5e73a-eee3-4e6f-aa14-25f3b1e06d2a and material ac584a21-f6cb-4133-ac90-370bfe1cd24c are synthetic fixtures.
- /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/sales-workflow-manifest.json: run QA-MB-OPS-20261005T131835531Z; 21 committed canonical HTTP operations. Sales creates Customer 7c148a04-798c-48b8-a0f2-c31b4c5cd526/Site 2becbe4e-808d-4cf1-a272-c198e2dc5b09, Quote 820bcdbd-d3e5-4c99-bbf9-51e5a5381f39, revision and linked SO 9337aab9-49d8-4939-8019-d7db050667a1. Two lines total 3000000 VND; Owner performs SEND/accept/confirm within existing permissions. Sales forbidden controls PASS. Replacing master sales price 90000 -> 95000 does not change quoted/SO snapshots; confirmation creates no AR. This is HTTP/data evidence, not UI draft-preservation acceptance.
- /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/negative-operation-id-helper-unit.json: 3/3 boundary-unit assertions; no HTTP label inferred.
- /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/performance-spec-classification.json: original measurements reused and assessed against SPEC-PERF-002/004. API elapsed is a conservative server-duration upper bound, not exact server timing or UI click-to-content timing.
- /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/runtime-closure-delta.json: current refs, source IDs, actual statuses and pending paths.

The introduced partial credit-limit payload produced 42601; the user explicitly authorized the full canonical-action payload correction and reuse of the two committed records. The corrected caller succeeds. Original failure artifacts remain preserved.

Two introduced local harness issues remain pending responses: unsupported Owner purchase_price_rules INSERT (42501; proposed exactly two fixture-only SQL configuration inserts, no business UAT claim), and missing authorization fetch-wrapper delimiter caught by syntax check before requests. Purchasing/direct continuation and Delivery/Storage scripts are prepared and syntax-checked but NOT_EXECUTED. No new application/schema defect is confirmed by these setup failures. No Storage write, manual Owner UAT, freeze, commit, push, cleanup, opening balance or Production action occurred. Managed delta is synthetic QA master/Quote/SO/stock-count fixture commands plus one inventory adjustment; previously applied schema remains unchanged.


### 2026-10-05: last runtime-gate attempt, actual failures and independent progress

Owner's CLOSE_LAST_MANAGED_QA_RUNTIME_GATES_BEFORE_UAT authorizes controlled SETUP_ONLY for exactly two own purchase-price rules (9444da60-bac1-449c-ada3-0aa82c526bee and 9f571d21-c194-4356-abbd-811b4287577d), then all business actions through ordinary QA Auth. No new schema/permission policy is requested. The original unsupported Owner HTTP INSERT is no longer the intended setup path.

The connected authorization wrapper is syntax-correct and preserves headers/errors; per-client wrappers do not alter global fetch. Its run passes Customer own-order and foreign-customer controls before a missing foreign-assignment fixture stops it. Separately, shared-auth-session-http-evidence.json proves 10 HTTP controls: protected Sales read; local client logout loses session and cannot read protected data; the same client authenticated as another Customer cannot reuse Sales scope; Sales/Purchasing/Warehouse-Dispatch/Finance-employee/Worker/Receiver/Other-Customer all fail permission administration with 42501. This is not browser logout or shared-device UI acceptance; old JWT instantaneous server invalidation is not claimed.

The purchasing continuation stops on SQLSTATE 42703 in a newly introduced read-only SO preflight. Narrow actual catalog reads establish commercial_state (not state/status) and no header total_vnd column. The exact two rule IDs still have zero rows. The negative Worker setup also fails because there are zero current assignments to another employee. Both are introduced harness/setup issues, not confirmed app/schema defects. A combined narrow repair question was submitted; no silent correction or PASS follows.

Current Sales provenance: QA-MB-OPS-20261005T131835531Z; Quote 820bcdbd-d3e5-4c99-bbf9-51e5a5381f39; revisions ed0b51dc-ddcd-4e32-8b04-148ac8bb96e9 and 9eb99491-1e40-483d-b3a1-b33f479fdec6; linked SO 9337aab9-49d8-4939-8019-d7db050667a1. Line snapshots: 20 x 90000 = 1800000; 4 x 300000 = 1200000; total 3000000. This does not replace historical 1000000-VND PO fixtures.

Storage package SHA256 rechecked as 465079852960cfeeb225dea4fdfe090a1d330091aa3a78379456035a697d0c35. No Storage upload, bucket/policy change or lifecycle/recovery execution occurred. final-runtime-performance-verdict.json records each original path/budget/layer/p95 and conservative API verdict, with full dashboard p95 801.233958 ms rather than replacing it by warm 231.599 ms. UI timing remains unverified.

Both new failed-run artifacts are copied intact before any future retry. Five managed migrations/poststate/history, reader 15, cost-boundary 13, Stock 16, personas, grants and Finance remain reused; none rerun. Current continuation adds no business mutation, role/grant change or Storage mutation. Direct/supplier/Worker/Owner runtime gates remain unverified; MANAGED_QA_CORE_READY_FOR_UAT=NO, candidate_ready_to_freeze=NO, Owner UAT not started.

### 2026-10-05 - Narrow managed runtime execution delta
- Candidate HEAD 1c022d68a9948124270d6d8935b8d781c02ebb78; application/migration inputs were not edited in this turn. Existing Sales/Stock/Reader/Cost/Finance and API performance evidence was reused; no unchanged suite was rerun.
- QA target ffrwiglcrlumfvhubaxg remains TEST_DATA_ONLY_OWNER_CONFIRMED. Run QA-MB-OPS-20261005T131835531Z used authorized fixture writes only, except the explicitly approved temporary Worker branch-access revoke/reactivate tests; shared roles/bucket policies were not modified.
- New committed sources: warehouse PO 582a566f-094f-4b40-9123-12d4ce6ef467; receipt dbbd0d4e-0512-4ea2-a475-c35ab4d15b20; Direct PO f0ad0e65-0f74-46bb-a3a5-d2e00c027bc4. Purchase rules 9444da60-bac1-449c-ada3-0aa82c526bee and 9f571d21-c194-4356-abbd-811b4287577d were SETUP_ONLY facts; business commands used ordinary personas.
- Own Work 80631b03-7f5c-4bf0-84ef-82925ba9da7e and foreign Work 261a7395-84ea-4da1-b47b-2088254fd387 were created canonically. The foreign assignee is another existing eligible employee; the negative actor is the ordinary Worker, not Owner.
- Original proof 18a422d3-70fe-42e1-a792-75d5e503aa30; restored proof 2669e303-7230-4158-8c66-4833ddf89c47. Both have 68 bytes, SHA256 bc5ab44378898573623820dc8154f19d71482c49dbb56cfb134da6d077a01fb3, and the same authorized Work source. Original objects were preserved.
- Storage defect reproduction: after canonical access revoke, signing RPC=42501/new signing denied while warmed-token download=HTTP 200 with exact fixture bytes and CDN HIT, repeatedly through 8.162 seconds. Non-warmed/fresh sessions and canonical authenticated downloads deny. This distinction is retained, not normalized into PASS. cacheControl=0 was tried only on the owned restore object and did not fix the warmed-session behavior.
- Worker access 3084cd57-2b4e-4b2d-a8fd-4d66e08e7ee2 was restored active with the original employee/branch/role and individual grants. Reactivation timestamps/audit were canonical and not rewritten.
- Delivery resumed using the READY restored proof. Only handoff and Worker start committed before a harness PGRST202 assertion; no automatic repost/recreation was attempted. Intended remaining business checks are still unexecuted.
- UI/manual evidence remains NOT_RUN; HTTP is not browser evidence. Full core/UAT/freeze readiness remains NO because Storage revoke and the remaining delivery bridge are open. Production and remote are untouched.
- Detailed artifacts and record manifest: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/final-dependent-runtime-evidence.json


### 2026-10-05T16:40:46.936Z - New-network Storage revoke classification and readonly Delivery control
- Target remains ffrwiglcrlumfvhubaxg, TEST_DATA_ONLY_OWNER_CONFIRMED. Application/migration source inputs unchanged. Five applied migration/history/poststate gates remain closed; no migration was executed.
- Canonical readonly worker_portal_job(uuid) control: ordinary Worker HTTP 200 returned Work 80631b03-7f5c-4bf0-84ef-82925ba9da7e, Delivery 5a37db40-efc9-45b6-8530-c94121a9eb39 and two lines; outsider HTTP 403/42501 returned no Work/Delivery. Both requests omit operation_id. This fixes QA-DELIVERY-READ-RPC-OPERATION-ID, not an application RPC change.
- The resume attempt reused committed handoff/start and stopped at a newly introduced assertion: actual execution_state=DISPATCHED versus expected IN_TRANSIT. No new Delivery/Work/worker-result/Owner-verification business command committed in this turn. Correction was disclosed through one asynchronous question, still awaiting reply. Do not confuse the Delivery execution enum with the IN_TRANSIT custody location.
- After revoke at 2026-10-05T16:30:45.329Z, actual new Node HTTPS agent:false/TLS connections on local ports 60426 and 60427, at 16:30:45.775Z and 16:30:45.904Z, returned HTTP 200/exact private fixture bytes from CDN HIT. Both ordinary-JWT authenticated paths were exercised with no-store request headers, without signed token or client/browser cache. Therefore MODE_A is violated; STORAGE-REVOKE-CACHE-01 is P1_CONFIRMED at the authenticated CDN network boundary.
- Distinct cacheNonce origin-control requests returned HTTP 400/BYPASS/no fixture bytes. This proves those controls deny, not that the cached response passed origin authorization. Incorrect origin/backend/database authorization is not inferred. New signing RPC=42501; new metadata read returned zero rows.
- Pre-issued signed URL created at 2026-10-05T16:30:44.746Z was replayed at 16:30:46.836Z inside its original 60-second expiry window. This Mode-C non-retroactive token behavior is separate from the authenticated endpoint defect. Actual issued/expiry/revoke timestamps are in the classification artifact; token/usable URL not persisted. Beyond-TTL behavior not claimed.
- Only managed delta: canonical revoke/reactivate of Worker access 3084cd57-2b4e-4b2d-a8fd-4d66e08e7ee2; operation IDs a1cfee34-c5a5-42d3-a520-47f408a26506 and 083f79f4-1724-443b-adc1-36a79c7c8571. Original employee/branch/role/active state and individual grants restored, audit history retained, Storage policy fingerprint unchanged. No objects uploaded/deleted/restored this turn.
- Existing 68-byte proof SHA bc5ab44378898573623820dc8154f19d71482c49dbb56cfb134da6d077a01fb3 and source-link restoration remain PASS_REUSED. Authorization 14, shared-auth HTTP 10 and other unaffected gates reused; none relabeled UI/manual PASS.
- Remaining gates are exact: readiness assertion correction before dependent Worker/Owner/reconciliation execution; remediation and runtime retest of authenticated CDN revoke behavior. No final UAT handoff/freeze readiness or core-ready claim while those gates remain open. No policy/RLS weakening or speculative fix applied.
- Evidence delta: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/bridge-classification-20261005T161901Z/delivery-storage-classification-delta.json


### 2026-10-05T17:20:53.728Z - Delivery bridge and portal-evidence application boundary
- Candidate HEAD 1c022d68a9948124270d6d8935b8d781c02ebb78; five managed migration versions remain unchanged/applied once. This turn changes local application evidence routes/callers only, plus authorized fixture Delivery/Work/verification commands and a scoped Worker revoke/reactivate test. Shared roles, Storage policies and migration history were not changed.
- Existing Delivery 5a37db40-efc9-45b6-8530-c94121a9eb39 resumed from DISPATCHED/Work IN_PROGRESS. Second fixture Delivery e136fd7b-290a-4b8d-9657-ac974a833fe9 and Work 5beb7bf5-e709-447a-b018-e60354125c4c exercise audited acceptance 9 of Worker 10. Verification sources f0fe55ec-294d-413a-bc05-cae091d677c1 and 20c6b4be-6449-4658-8d9a-04f8dc5e83b4 post independent AR/revenue 1500000/1410000 and cost 1000000/940000 VND once. Existing worker result quantities are used as Owner defaults, not re-entered. Both Work/Delivery finish VERIFIED.
- Authoritative serving path before repair: browser -> /api/evidence/{id}/signed -> authenticatedPortalClient/get_portal_evidence_for_signing -> ordinary Storage createSignedUrl -> 307 to Storage/CDN bearer URL. r9_portal_evidence_select permits can_read OR can_write on portal-evidence, exposing a direct authenticated object path as well.
- After local repair: browser -> /api/evidence/{id}/download (legacy signed alias also streams) -> auth.getUser + same canonical per-request current business RPC -> server-only Storage secret client -> no-shared-cache byte stream. No actor/branch/bucket/path is trusted from request; denied responses contain only a generic message. No signed URL or service key returned to browser. Upload current-user RPCs remain authoritative before privileged server-only upsert/finalize.
- Build VVErQkbtzJ3QHJ7qX0NhM served on owned 127.0.0.1:4057 process 47673 and /api/qa/environment confirmed QA ref/build SHA. This is real local application HTTP against managed Auth/RPC/Storage, NOT browser/manual UAT or deployed Production evidence. Local HTTP connections 60928 and 60929 after scoped revoke both returned 404; unchanged cookie hash proves no refreshed/replaced actor token was needed. Recovered access returned exact original bytes/hash.
- Actual raw Storage TLS request on port 60930 after revoke still returned HTTP 200/68 bytes/SHA bc5ab44378898573623820dc8154f19d71482c49dbb56cfb134da6d077a01fb3 with CF cache HIT, no signed URL and no client cache. P1 remains OPEN. Application headers/shorter token TTL are not claimed to close this bypass.
- Proposed, not applied: remove only r9_portal_evidence_select; add authenticated restrictive SELECT gate bucket_id <> portal-evidence; leave r6 unrelated buckets and r9 INSERT/UPDATE untouched. Existing private bucket/helpers/grants/data unchanged; supported application upload uses trusted server Storage after canonical Auth RPC. Rollback SQL restores captured SELECT definition but would reopen the known vulnerability and is Owner-controlled only.
- Policy preparation evidence is PGlite 8/8 with isolated allowed helper controls, not native/current-business-role/CDN proof. Managed raw authenticated endpoint and warmed cached URLs MUST deny after approved apply; existing cache invalidation is not assumed. No unverified cache-purge operation or global configuration mutation is included.
- Supplementary read-only assertion failure (1 actual AR obligation versus 2 guessed) is preserved separately; exact money/source/idempotency evidence is not overwritten. Pending correction is a harness issue, not an application financial defect and not a newly invented release gate.
- New actual artifacts, source/operation manifest and exact policy approval package: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/QA-MB-MANAGED-EXEC-20261005T084239Z/runtime-resume-20261005T101347Z/closure-20261005T131326Z/evidence-forward-fix-20261005T165518Z. App lint/typecheck/unit 13/build pass; server-only bytes/hash proof PASS; legacy alias runtime config warning recorded without extra rebuild. Application upload new trusted-client path has focused unit coverage; full managed upload lifecycle was reused, not rerun and not relabeled as new app-upload HTTP PASS.
- Core-ready/freeze remain NO pending exact managed Storage forward-fix authorization and direct/CDN denial verification. No Owner UAT, release authorization, cleanup, opening balances, commit/push/deploy or Production operation.


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

### HTTPS Preview repair and release gate (2026-10-06)
Owner authorized the exact Preview packaging fix and conditional continuation after automated BIZ-01..08 acceptance. Initial Vercel dry manifest incorrectly sent directory records qa, scripts/qa and supabase/.temp to readFileSync. The local harness now distinguishes entry types, checks paths/duplicates/symlink boundaries, and never reads a directory as file bytes. Official upload scope is 224 regular files: 219 application inputs plus .vercelignore, eslint.config.mjs, next-env.d.ts, pnpm-workspace.yaml and root proxy.ts. QA/reports/migration/test artifacts and credentials are excluded.
Initial deployment dpl_5ku8QyX7fvAL5S464gSeRwCcUeJY failed on the signed route runtime re-export. Actual Vercel browser build logs reproduced PREVIEW-NEXT-RUNTIME-01. The route now directly exports runtime="nodejs" and re-exports only GET; canonical authentication/authority/private-stream implementation and managed schema are unchanged. Targeted route lint, typecheck and 7/7 existing evidence tests PASS. A pnpm wrapper refused its shared modules directory; existing installed tools were used directly without installation/removal.
Intentional post-fix application fingerprint is 85d35e9593115511222e775e9c763856bb74b6ffb85b835c16de81da538f331e; only this route differs from the previous de8c3015813c116f4daf7e425e2db6457690fd8b8d0b23a753eef677aec8a6a8 application scope (218 other inputs unchanged). Repaired deployment dpl_CB8H927YLyjp4LCe75FyEueQxApz is READY, 47s build, Preview environment; origin https://hien-xa-erp-v2-frul55njw-hienxa.vercel.app. Existing QA config is for ffrwiglcrlumfvhubaxg. The approved server secret was applied only to this deployment through private temporary config outside upload, removed afterward. Shared Preview/Production env was not broadened. Branch-specific env add was rejected because the local branch is not on remote; the proposed broader persistent env change was blocked and not executed.
Official browser Vercel SSO succeeded through the existing GitHub session. Navigation to the repaired Preview /api/qa/environment was then blocked by net::ERR_BLOCKED_BY_CLIENT. Browser capabilities expose visibility/viewport, not URL approval; the blocked origin was not retried or bypassed. Source/provider build evidence is not application browser identity or BIZ acceptance. All eight automated UI cases remain BLOCKED_NOT_RUN; existing native/HTTP/DOM technical evidence is reused only in unchanged scope. No release commit/push/PR/merge/Production operation occurred.
An introduced read-only build-report path-concatenation error (NaN) remains awaiting the pending narrow repair answer; provider cause and READY status were obtained independently through official browser evidence. No application failure is inferred from that local report-writer error.

### 2026-10-06: newest approved source and Production release preflight
- AUTHORITY: Owner explicitly authorizes final checks, commit/push/PR/CI/merge/Production deploy and Codex Browser UAT. Preview UAT is no longer a release gate. Production data writes remain controlled by classification/isolation and canonical rules.
- SOURCE: active worktree uxui-usability-release/HienXaERP at 1c022d68a9948124270d6d8935b8d781c02ebb78; separate Downloads checkout changes preserved/excluded. Fifteen dirty source/harness/documentation paths classified; no env, browser profile, DB, token, signed URL or large evidence staged.
- FINAL_CHECKS: installed dependency entrypoints avoid pnpm automatic install; typecheck PASS, lint 0 errors/10 warnings, 13/13 affected tests PASS. Default Turbopack rejects this worktree's external node_modules symlink; supported webpack build of unchanged source PASS. Local build ID VhdDGa3GiYXu3klfZ6ZHB; compiled-output fingerprint dc79dafe2e0ccced413e494b963070640c1e29d085add5b1fb06addf922f9775. This is a local build fingerprint, not a claimed Vercel Production build.
- SOURCE_FREEZE: application fingerprint 85d35e9593115511222e775e9c763856bb74b6ffb85b835c16de81da538f331e recomputed, not assumed; complete runtime source plus metadata fingerprint 98a25a9660de01152a233d2425fc58b8a086a3b2f3e72c7f09734ccc8a4a3680; 76 migration byte hashes recorded without applying any migration.
- PRODUCTION_READONLY: provider confirms main auto-deployment binding, canonical verified project domain hien-xa-erp-v2-nu.vercel.app, current deployment dpl_FXFWUv3rfNRGcPhEVsd4hL6LexeD / source 5c884d24ce73630487f19b1cec05ca46ae3321d2. Production Supabase nbwynrwkdbtfsitafsxa is not QA. Existing cloud runtime approved and e-invoice disabled; private evidence server secret missing. Secure temporary environment export removed; no secret value retained in release artifacts.
- BLOCKER: Production project metadata and scoped read-only SQL both denied by Supabase connector (MCP -32600 permission error). No effective Production schema/policy PASS claimed; no DB credential available in current repository context. Need authorized Production read access and Production-scoped private Storage secret via secure configuration, never QA credentials or chat secrets. Hold main merge/deploy to avoid premature auto-release.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-release-20261006T080823Z/release-source-freeze.json; final checks /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/release-final-checks-20261006T080900Z. No Production/schema/Storage/business-data mutation; no UI or operational readiness inferred.

### 2026-10-07: PR15 delivery-verifier evidence P1 closure

- PR15-P1-EVIDENCE-VERIFIER (review discussion_r4193087932) reproduced and classified E_DATABASE_RLS_OR_GRANT_DEFECT. Canonical UX-FLOW-006 requires the authorized verifier to see existing Worker proof, not an Owner-only role or evidence.manage escalation.
- Minimal forward migration 20261007022921_evidence_delivery_verifier_scope.sql (SHA256 46f42b0d498c8053c95346bbb15c59b77d36b937c332ceead66f1b3bc22481e1) changes only private.portal_evidence_access: linked Work Result/Delivery proof requires both delivery.read and delivery.verify in the exact branch. Existing owner/assignee/payment-notice paths and helper owner/ACL/security/search_path remain intact; raw Storage remains denied.
- Native isolated regression: original failure reproduced; 27/27 relevant boundary controls PASS. Managed QA exact atomic apply/history/readback: COMMITTED_VERIFIED, unrelated history preserved. Ordinary authenticated managed/API + Next HTTP checks 11/11 PASS, including exact proof bytes/hash, outsider denial, revoke NEW request denial, restore and retry. Temporary individual QA delivery grants removed; original branch access restored; no shared-role broadening.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-po-rpc-closure-20261006T153240Z/p1-closure-evidence.json. Application source is unchanged. This is targeted technical QA, not Production browser acceptance.
- Production forward fix follows the original five-file transaction because delivery_results.source_work_item_result_id is a prerequisite. Production apply/merge/deploy/live UAT remain pending at this checkpoint; no persisted Production schema/business mutation occurred. No opening balances or operational readiness claimed.

### 2026-10-07: PROD-RETURN-COST-01 exact forward QA verification
- Owner authorizes one additional return-cost forward scope; approved proposal SHA256 3d8511e6ce2a8b37101a8158c30c679a0074feb83697222d89c8c6fd471d8b30 remains unchanged. Historical 20260930023428 is NOT replayed: its raw replay would regress the current PT409 conflict contract to 40001.
- New migration 20261007022922_preserve_return_case_supplier_direct_cost.sql; SHA256 3c80fc4dd0d24aa5a3b079e1918bdb3753afa0199dfb2f578175ca440d64da0c. Exact approved cost branch only; restricted known Production prestate hashes and exact already-equivalent QA body. Signature/return type/owner/ACL/SECURITY DEFINER/search_path preserved; no business-data DML.
- Owned native guard regression 4/4 PASS. Managed QA atomic exact apply/readback PASS, one new version/history row; already-equivalent function and unrelated security/history unchanged. Ordinary Owner/Sales return HTTP and source reconciliation 8/8 PASS. PT409 preserved; unauthorized actor denied without effects; retry no duplicate; warehouse return and transit remainder remain correct.
- Direct fixture: supplier AP 3900000, customer AR 5700000 unchanged; verified physical customer return of 1 at source cost 200000 reverses COGS once to 3700000. No direct PO purchase receipt or fake delivery inventory movement. Actual received CUSTOMER_RETURN stock is legitimate returned custody, not a supplier receipt. QA child run QA-RETURN-20261006T210237080Z; three append-only return IDs 1244646e-f77d-4348-ae59-3f0fdb7579d5, 32f108e3-2b8f-4480-b010-20ec0b2d0ed7, e38ca16a-ea21-4a3d-b143-27aa65d96dca.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-po-rpc-closure-20261006T153240Z/return-forward-qa-managed-evidence.json and /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-po-rpc-closure-20261006T153240Z/return-forward-qa-fixture-journal.json.
- Production remains on application merge 0674bea55ebc7847965a9cba0b64f2a9bf3d87c6 with PO patch committed; original five, evidence forward, new return forward and Storage transition pending. Final combined rehearsal/apply and Codex Browser live UAT remain required. No app source changed; no redundant local application rebuild.

### 2026-10-07: PR16 immutable return-source P1
- Review discussion_r4200485960 reproduced through canonical authenticated QA RPCs in rollback-only transaction: allocation SUPPLIER_DIRECT -> WAREHOUSE succeeded and return failed return_cost_basis_missing (23514). Original allocation restored; zero receipt/return rows persisted.
- Owner explicitly chose source-tuple freeze when allocation has a non-CANCELLED Delivery, with a new allocation for changed remaining plan and no backfill. New forward 20261007022923_freeze_delivered_allocation_source.sql; SHA256 48529aa6eb90564e5868860e0e0d59518e3466ddb4cbbfa0b59fcecbd606fac9. Only public.upsert_supply_allocation gains the source identity guard after its existing row lock/version check; source tuple is supply_mode/purchase_order_line_id/warehouse_id. Quantity policy, ACL/owner/security/config/PT409/locks/idempotency remain unchanged.
- Native exact definition/security/idempotent-state guard PASS; managed QA exact atomic version/readback PASS with unrelated history intact. Ordinary HTTP + rollback planning regression 6/6 PASS: original mutation denied, warehouse-only change denied, PT409 and unauthorized denial preserved; same-source quantity edit/new allocation/unbound edit remain allowed; original direct return cost stays 200000. All temporary planning/cost rows rolled back.
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-po-rpc-closure-20261006T153240Z/return-mutable-source-rollback-reproduction.json; /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-po-rpc-closure-20261006T153240Z/allocation-source-guard-qa-managed-evidence.json; /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-po-rpc-closure-20261006T153240Z/allocation-source-guard-qa-http-evidence.json. Migration 20261007022922 already applied on QA is unchanged. No Production schema/business mutation in this continuation. Final pending Production transaction now includes original five + evidence verifier + return forward + source guard; PO is excluded.

## LIVE-BIZ03-01 targeted employee reader forward (2026-10-07)

- Canonical identity: auth.users.id -> employees.auth_user_id; employee_branch_access.employee_id, delivery_assignments.employee_id and work_item_assignments.employee_id reference employees.id. No separate public profile table or identity-by-coincidence join.
- Production Warehouse auth 35cf4dbf-c871-4000-9c2a-a203f397be60 / employee 3104db80-72a2-4cd9-9e8a-cd31edd2def7 and Worker auth 55fb329f-0a23-40db-a0a4-b70be8724560 / employee 13de4b1a-27ac-4254-8a57-d60f4cd72d4c have active mappings in branch 1f048f09-d968-4266-8d4d-863ceecdce34. Browser before/reload reproduced Worker missing.
- Actual policy name is employees_workforce_read, not a distinct employees_workforce_read_so_a object. Fix qualifies the outer employees.id and retains requester workforce.read/compensation.read and active membership semantics. Existing Owner/self policy, RLS flags, owners, table/column ACLs, constraints and other policies remain unchanged.
- New forward version 20261007111747, SHA256 23d64c001a3665e223658faa99eac2cf8944126a8ecd3297f417623af1e52bed. QA native 17 checks plus HTTP 13 controls PASS, including exact positive IDs, Owner behavior, Worker self, Customer/outsider/anonymous and foreign-branch denial, inactive employee/mapping/role exclusion, restoration. Original QA commit preserved after EADDRNOTAVAIL; remaining controls resumed through verified transaction pooler with zero extra SQL execution.
- Local harness repairs: native uses existing valid role codes and bounded employee codes, never loosens constraints; Keychain parser extracts only secret after numeric status 0, rejects metadata-only/malformed/nonzero responses and preserves JSON-like secret characters. No credential values committed or recorded.
- Code checks: parser 6/6, helper 4/4, lint/typecheck/local Next webpack build PASS. Remaining: CI/PR merge, exact Production apply, browser before/reload/navigation closure, then unfinished UAT. Existing Storage cutover/security/recovery and completed BIZ subflows reused; opening balances/data transition remain Owner pending.
- Evidence directory: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-qa/production-po-rpc-closure-20261006T153240Z.
