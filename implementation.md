# implementation.md — Sổ trạng thái và bằng chứng thực tế

> **Bộ tài liệu:** `HX-V2-DOCSET-4.2`  
> **Giao thức đồng bộ:** `SYNC-4.2`  
> **Nguyên tắc:** chỉ ghi điều đã quan sát/chạy thật; không copy Spec hoặc backlog.

# IMP-000 — Evidence kind

- `REPOSITORY_OBSERVED`: đã đọc source/ref cụ thể.
- `EXECUTED_LOCAL`: đã chạy command/test cục bộ.
- `PRODUCTION_OBSERVED`: đã đọc Production bằng quyền phù hợp.
- `USER_REPORTED`: người dùng cung cấp.
- `NOT_VERIFIED`: chưa đủ bằng chứng.

Chưa chạy = `NOT_RUN`, không PASS.


# IMP-005 — Document conformance record

Mỗi batch/task có thay đổi source chỉ cần một dòng khi đáng ghi:

```text
DOC_CONFORMANCE:
scope=<task/batch>
docset=<version>
contract_refs=<task + context pack + requirement IDs chính>
result=<PASS/BLOCKED>
deviation=<NONE hoặc DOC_CONFLICT-ID>
```

Không cần copy requirement text vào đây.

`PASS` chỉ có nghĩa thay đổi bám đúng contract của scope đó; không đồng nghĩa acceptance/QA đã PASS.


# IMP-007 — Execution cache và invalidation

Đây là cache tham chiếu bằng chứng, không phải hệ thống phần mềm mới.

```yaml
DOC_LOCK: VALID
DOCSET_FINGERPRINT: GIT_TREE:cbe9de71d8dc3ea607f77d50e6f0d092afc52696
ACTIVE_CONTEXT_PACK: PLAN-CTX-BASE+PLAN-CTX-R5
INSTRUCTION_AUDIT_REF: R0-I-001 VALID
DEPLOY_GUARD_REF: R0-D-001 VALID
SCHEMA_SNAPSHOT_REF: R3-S-001 VALID_ISOLATED
SECURITY_SNAPSHOT_REF: R2-SEC-001 VALID_ISOLATED
DATA_BASELINE_REF: R0-DATA-001 VALID_EMPTY_OWNER_REPORTED
COMMAND_MAP_REF: NONE
```

Mỗi ref chỉ cần trạng thái:
`VALID / INVALIDATED / STALE_FOR_SCOPE / NOT_RUN`.

Không tạo daemon/service/hash framework. Có thể dùng Git hash/file hash đơn giản hoặc exact commit/tree.

Nếu ref VALID và không có trigger PLAN-015:
- không gọi lại tool/API/query;
- không đọc lại raw output;
- dùng kết luận đã ghi;
- chỉ mở raw evidence khi task cần chi tiết chưa được tóm tắt.

Nếu invalid:
- re-run phần bị invalid, không toàn audit.

# IMP-010 — Baseline lịch sử gần nhất

Repository và archive baseline trước DOCSET-4.0 đã từng được kiểm/ghi trong các bộ tài liệu trước. Trước khi R0 chạy phải xác minh lại branch/HEAD/archive/working tree và cơ chế deploy; không coi SHA cũ là current fact.

Theo báo cáo người dùng, cleanup không sửa dữ liệu/Storage và chưa deploy; mức `USER_REPORTED` cho đến R0.

# IMP-020 — Current execution

```yaml
DOCSET: HX-V2-DOCSET-4.2
CURRENT_PHASE: see tasks.md
APPLICATION_V2_DOMAIN_CODE: R5_PURCHASING_SOURCING_IMPLEMENTED
PRODUCTION_AUDIT: EMPTY_BASELINE_OWNER_REPORTED
ACCEPTANCE: NOT_REQUESTED
```

## R5_IMPLEMENTATION_EVIDENCE

```yaml
STATUS: IMPLEMENTED
SCOPE: PURCHASING_AND_SOURCING
CONTRACT_REFS: SPEC-160,SPEC-PUR-001,SPEC-PUR-002,SPEC-SRC-001,SPEC-SRC-002,SPEC-SRC-003,SPEC-JOURNEY-002,SPEC-JOURNEY-003,SPEC-JOURNEY-004,CONFIG-002,UX-320,UX-330,UX-FLOW-003,UX-FLOW-009
RECEIVING_AND_AP: DEFERRED_TO_R6
TRUE_MULTI_SESSION_ALLOCATION_RACE: NOT_RUN_NO_CONTAINER
ACCEPTANCE: NOT_RUN_NOT_REQUESTED
PRODUCTION: NOT_TOUCHED
```

- Purchase order drafts persist supplier, destination, dates, line conversion, and immutable purchase-price snapshots.
- Confirm and cancel commands are idempotent; PO confirmation does not create accounts payable.
- `WAREHOUSE`, `SUPPLIER_DIRECT`, and `SUPPLIER_TO_WAREHOUSE` allocations use explicit sales-line, purchase-line, and warehouse links.
- Allocation capacity and optimistic versions prevent over-allocation and stale updates.
- Both direct-entry paths create linked drafts atomically without auto-confirming either side; sales price remains owned by the sales order.
- Purchase-cost reads are permission-aware and line reads enforce branch purchasing access.
- Internal purchase list/create/detail, sales sourcing status, supplier purchase history, and supplier quick-create are implemented.

### R5 module registry delta

| Module | State | Contract |
|---|---|---|
| Purchasing and sourcing | IMPLEMENTED | SPEC-PUR-001..002; SPEC-SRC-001..003 |

### R5 phase gate

| Check | Result |
|---|---|
| Typecheck | PASS |
| Lint | PASS |
| Unit tests | PASS: 16 |
| Isolated PostgreSQL | PASS: R2-R5 invariants |
| Production build | PASS |
| True multi-session allocation race | NOT_RUN_NO_CONTAINER |
| Acceptance | NOT_RUN_NOT_REQUESTED |
| Production | NOT_TOUCHED |

### R5 conformance

- Purchase prices are server-resolved or require an authorized manual override with a reason.
- Direct sourcing creates no fake warehouse receipt or issue.
- Split allocations cannot exceed the sales-line requirement.
- No automatic confirmation occurs in either direct-entry path.
- Performance thresholds remain referenced only from `Spec.md`.
- Checks followed targeted task coverage and the R5 phase gate; there is no standalone smoke-test layer.

# IMP-030 — Path & command registry

Chỉ điền khi R0/R1 xác minh thật:

| Key | Actual value | Evidence | Last verified |
|---|---|---|---|
| repo_root | `/Users/nox/Downloads/HienXaERP` | REPOSITORY_OBSERVED R0-I-001 | 2026-09-12 |
| package_manager | `pnpm@11.24.0` | R1-GATE-001 | 2026-09-12 |
| app_routes | `src/app` | R1-GATE-001 | 2026-09-12 |
| module_root | `src/modules` | R1-GATE-001 | 2026-09-12 |
| db_migration_path | `supabase/migrations` | R4-GATE-001 | 2026-09-12 |
| unit_command | `pnpm test` | R4-GATE-001 | 2026-09-12 |
| db_test_command | `pnpm db:test:isolated` | R4-DB-001 | 2026-09-12 |
| typecheck_command | `pnpm typecheck` | R4-GATE-001 | 2026-09-12 |
| build_command | `pnpm build` | R4-GATE-001 | 2026-09-12 |

## R0 evidence

- `R0-I-001` (`REPOSITORY_OBSERVED`): repository `MutAquaticStudio/HienXaERPv2`, branch `main`, clean baseline at `1d5338a`; no applicable `AGENTS.md` or `CLAUDE.md` existed before DOCSET import.
- `R0-D-001` (`REPOSITORY_OBSERVED`): remote repository is private; remote `main` was the only ref; current source contains no CI workflow. The connected Vercel team exposes only `nox-os` linked to `MutAquaticStudio/NOXOS`, so the Hiền Xa repository has no observed auto-deploy target in that scope.
- `R0-S-001`, `R0-SEC-001`, `R0-DATA-001` (`USER_REPORTED`): Owner deleted Supabase project `hien-xa-erp-production` (`vknnzzecimfpnrsqbnuu`) before DOCSET-4.2 execution. No Production schema, Auth, Storage, business data, or performance baseline remains available to audit.
- Migration classification: no legacy dataset is available; V2 local schema is the only writer during BUILD_ONLY. Any future Cloud Production project, credentials, migration, or deploy remains a human gate.

## R1 evidence

- `R1-GATE-001` (`COMMAND_OUTPUT`): `pnpm lint`, `pnpm typecheck`, 6 targeted unit checks, and `pnpm build` passed on Node 24 / Next.js 16.3.4; build emitted 14 routes across `/admin`, `/work`, `/customer`, and `/api/health`.
- `R1-DB-GUARD-001` (`COMMAND_OUTPUT`): local PostgreSQL URL was accepted and a non-local Supabase-shaped host was rejected. No connection or write was attempted.
- `R1-PROTOTYPE-001` (`SOURCE_OBSERVED`): all prototype records are marked `MOCK` and preserve one linked sales → sourcing → delivery → debt example; VND uses bigint/string serialization and quantity conversion uses decimal arithmetic.
- Production: `NOT_TOUCHED`; no Cloud Supabase project or deployment target was created.

## R2 evidence

- `R2-S-001` (`COMMAND_OUTPUT`): CLI-generated migration `20260912101030_identity_access.sql` ran on isolated PostgreSQL (PGlite 0.5.8) with nine tables, FK/check/partial-unique constraints, explicit grants, and RLS enabled on every R2 table.
- `R2-SEC-001` (`COMMAND_OUTPUT`): branch isolation, customer isolation, receiver-vs-finance role separation, missing-permission denial, and direct `assign_employee_role` denial passed. The definer command has fixed `search_path`, derives actor from `auth.uid()`, revokes `PUBLIC`/`anon`, validates permission in DB, and appends audit.
- `R2-AUTH-001` (`SOURCE_OBSERVED`): one Supabase Auth provider is shared by `/login`, `/work/login`, and `/customer/login`; recovery, logout cache clearing, branch revalidation, revoked-account checks, permission-filtered navigation, and server page/API guards are implemented.
- `R2-GATE-001` (`COMMAND_OUTPUT`): lint, typecheck, 9 unit checks, isolated DB checks, and production build passed; 23 routes emitted. Local DB URL passed and cloud-shaped URL was rejected.
- Residual verification: `supabase test db` / pgTAP was authored but not executed because Docker and Podman are absent. This is not recorded as a pgTAP PASS; equivalent migration and RLS paths ran in isolated PostgreSQL.
- Production: `NOT_TOUCHED`; runtime config rejects Cloud Supabase unless `HX_CLOUD_RUNTIME_APPROVED=true` is supplied by a later human gate.

## R3 evidence

- `R3-S-001` (`COMMAND_OUTPUT`): the CLI-generated catalog/CRM/pricing/credit migration ran after R2 on isolated PostgreSQL. Material/UOM rational conversion, branch resources, Customer/Site, Supplier/contact, pricing versions, opening-source obligations, immutable adjustment ledgers, and credit commitments were created with FK/check/unique/RLS controls.
- `R3-PRICE-001` (`UNIT`): deterministic precedence, effective-window filtering, latest version selection, manual-approved metadata, and immutable old price snapshots passed targeted tests.
- `R3-CREDIT-001` (`DB+UNIT`): credit exposure formula, missing-limit/overflow denial, same-source idempotent replay, over-limit reservation rejection under customer-row lock, and append-only obligation rejection passed. Payment/Allocation/Advance/Reversal are intentionally absent until R7.
- `R3-UI-001` (`SOURCE_OBSERVED`): `/admin/customers/[id]` is a permission-aware read composition over profile/sites/pricing/AR; `/admin/suppliers` and `/admin/products` use minimal DTOs. Sensitive finance, pricing, and internal-note fields are not requested without their permission.
- `R3-GATE-001` (`COMMAND_OUTPUT`): lint, typecheck, 16 unit checks, isolated DB checks, and production build passed; 25 routes emitted.
- Residual verification: true two-session credit contention and Supabase pgTAP remain `NOT_RUN_NO_CONTAINER`; no race PASS is claimed. The DB helper uses `SELECT ... FOR UPDATE` on the shared customer row and was checked sequentially for source replay/overflow only.
- Production: `NOT_TOUCHED`; all schema/data execution used an in-memory isolated PostgreSQL runtime.
- Owner override: the deletion supersedes the preservation assumptions in `SPEC-PRODUCT-004` and `SPEC-MIG-001` for the removed baseline. No Spec file was silently rewritten.

## R4 evidence

- `R4-DB-001` (`COMMAND_OUTPUT`): CLI migration `20260912105455_sales_quotes_orders.sql` ran after R2/R3 on isolated PostgreSQL. Quote/revision/acceptance, SO/lines, command receipts, credit linkage, RLS/grants, immutable sent revision guards, and security-definer commands are present.
- `R4-IDEM-001` (`DB`): same-key replay and changed-payload conflict passed for document creation; exact revision send/accept/new revision/from-quote, no automatic SO on acceptance, no AR on SO confirm, and cancellation credit release passed.
- `R4-SEC-001` (`DB+SOURCE_OBSERVED`): price/UOM snapshots are recomputed and checked server-side; all pricing scopes are validated in the DB command; Finance Contact portal acceptance uses the same exact-revision command while Receiver remains view-only.
- `R4-UI-001` (`SOURCE_OBSERVED`): live list/create/detail screens replace Sales MOCK pages; quotation actions are state-aware, three SO state axes are shown separately, and action feedback preserves the next operational context.
- `R4-PDF-001` (`COMMAND_OUTPUT`): Noto Sans Vietnamese WOFF2 embedded successfully in a generated PDF. The API route generates the requested revision directly and does not claim a Storage artifact upload.
- `R4-GATE-001` (`COMMAND_OUTPUT`): lint, typecheck, 16 unit regression checks, isolated DB checks, and production build passed; the route table includes internal quote/order, customer quotation, and revision PDF routes.
- Residual verification: true two-session credit contention and Supabase pgTAP remain `NOT_RUN_NO_CONTAINER`; no RACE PASS is claimed. Sales usability/acceptance QA is `NOT_REQUESTED`.
- Production: `NOT_TOUCHED`; all DB execution remained in-memory and no Cloud Supabase project or deployment was created.

DOC_CONFORMANCE:
scope=R0
docset=HX-V2-DOCSET-4.2
contract_refs=TASK-R0-01..06+PLAN-CTX-R0
result=PASS
deviation=OWNER_OVERRIDE_SPEC-PRODUCT-004_SPEC-MIG-001

DOC_CONFORMANCE:
scope=R4
docset=HX-V2-DOCSET-4.2
contract_refs=TASK-R4-01..06+PLAN-CTX-R4
result=PASS
deviation=NONE

# IMP-040 — Module registry

Chỉ thêm module khi source thật tồn tại:

| Module | Paths | DB objects | Public commands/queries | State | Evidence |
|---|---|---|---|---|---|
| Sales | `src/modules/sales`, `src/app/admin/orders`, `src/app/admin/quotations`, `src/app/customer/quotations` | quotation/revision/acceptance, sales_order/lines, command_receipts | create/send/accept/revise/confirm/cancel/from-quote; list/detail/PDF | IMPLEMENTED_LOCAL | R4-DB-001,R4-UI-001 |

# IMP-050 — Verification registry

Một row cho một lần kiểm có giá trị tái dùng:

| ID | Scope | Tree/diff | Command/environment | Result | Log/artifact |
|---|---|---|---|---|---|
| R4-GATE-001 | R4 Sales | local working tree | lint + typecheck + 16 unit + isolated PostgreSQL + build | PASS_WITH_LIMITATION | true multi-session race NOT_RUN_NO_CONTAINER |

Không tạo verification framework riêng; bảng này chỉ là sổ tham chiếu.

# IMP-060 — Policy & external gates

| Gate | State | Evidence |
|---|---|---|
| POLICY-CREDIT | PENDING_OWNER_REVIEW | Spec proposal only |
| POLICY-CUSTODY | PENDING_OWNER_REVIEW | Spec proposal only |
| POLICY-BILLING | PENDING_OWNER_REVIEW | Spec proposal only |
| POLICY-COST | PENDING_OWNER_REVIEW | Spec proposal only |
| POLICY-PAYROLL | PENDING_OWNER_REVIEW | Spec proposal only |
| POLICY-COMMISSION | PENDING_OWNER_REVIEW | Spec proposal only |
| POLICY-INVOICE | PENDING_OWNER_REVIEW | Spec proposal only |
| USER_REVIEW_UX | NOT_REQUESTED | — |
| PROVIDER_INVOICE | NOT_SELECTED/NOT_VERIFIED | — |

# IMP-070 — Architecture audit DOCSET-4.0

**Phạm vi:** audit tài liệu trước implementation bằng khung tư duy thiết kế, audit Product Design trên tài liệu và review kiến trúc/rủi ro. Không có screenshot UI chạy thật, không có test ứng dụng/DB Production trong lượt này.

Các sửa quan trọng:

1. Backlog 3.4 có 226 task/~4.094 dòng; đổi sang task composite theo lát cắt để giảm context-switch.
2. `source_type/source_id` đa hình authoritative bị loại; nguồn core dùng FK tường minh.
3. R1 không còn job/outbox runner hoặc framework async dự phòng.
4. Payment/Allocation/Advance/Reversal đầy đủ được dời về R7; R3 chỉ giữ obligation/credit substrate tối thiểu.
5. `cost_fact` tổng quát không còn là mặc định; R7 trước hết tổng hợp canonical source.
6. Job/outbox chỉ xuất hiện khi ranh giới external/long-running thật cần, mặc định lần đầu ở R11.
7. Kiến trúc function-first; cấm base service/repository, internal HTTP, event bus/saga, generic workflow/rules engine nếu chưa có bằng chứng.
8. Read model/query/cache/projection áp theo số đo; không materialize mặc định.
9. UX bổ sung role landing và secondary flows nhận hàng, service, compensation, invoice để Codex không tự thiết kế các phase sau.
10. Context pack theo phase thay hàng trăm READ refs lặp.
11. DOCSET-4.2 bổ sung NO_REAUDIT, evidence invalidation và FAST_PATH để không re-plan/re-audit khi contract/evidence chưa đổi.

**Kết luận tài liệu:** `CONTRACT_REVIEWED`.  
**UI_TESTED:** `NOT_RUN`.  
**APPLICATION_TESTED:** `NOT_RUN`.  
**PRODUCTION_OBSERVED_FOR_4_0:** `NOT_RUN`.

# IMP-080 — Handoff log format

Sau task/batch append ngắn:

```text
date:
scope:
evidence_kind:
changed:
checks:
result:
blocker:
sync_impact:
production_impact:
```

Không ghi chain-of-thought.

# IMP-ACCEPT-001 — Acceptance runs

Chỉ append khi acceptance.md được mở:

| Run | Scope | Build/tree | Manual/technical evidence | Result | Open defects |
|---|---|---|---|---|---|
| — | — | — | — | NOT_REQUESTED | — |

# KẾT THÚC implementation.md
