# tasks.md — HIỀN XA ERP V2

> **Bộ tài liệu:** `HX-V2-DOCSET-2.0`  
> **Giao thức đồng bộ:** `SYNC-2.0`  
> **File sở hữu:** Current phase/task, backlog có mã, trạng thái và check state  
> **Mục đích:** Cho Codex một entry point cực rõ để biết chính xác phải làm gì, đọc gì, sửa gì và không được đụng gì.

---


# TASK-000 — Luật sử dụng

`tasks.md` là file duy nhất sở hữu:

```text
CURRENT_PHASE
CURRENT_TASK
TASK STATUS
TODO
DONE
BLOCKED
CHECK STATE
```

Không sở hữu:
- requirement;
- UX rule;
- roadmap rationale;
- SHA/schema/module actual state.

Mỗi task phải có contract:

```text
ID
STATUS
GOAL
REQUIRES
READ
EXPECTED_SCOPE
DO_NOT
CHECKS
ACCEPTANCE
SYNC_IMPACT
```

---

# TASK-010 — Current execution state

```text
CURRENT_PHASE:
NONE

CURRENT_TASK:
NONE

NEXT_PHASE:
R0

STATUS:
LOCKED
```

Chỉ mở khi User nói rõ:

```text
BẮT ĐẦU R0
```

---

# TASK-020 — Trạng thái cleanup

```text
ARCHIVE_V1_AND_CLEAN_MAIN:
DONE
```

Chi tiết SHA/branch xem `implementation.md`.

---

# TASK-100 — R0 Backlog

## TASK-R0-001 — Verify repository baseline

```text
STATUS: LOCKED
GOAL: Xác minh branch/SHA/archive trước audit.
REQUIRES: User mở R0.
READ:
- plan.md → PLAN-R0
- implementation.md → Repository/Git sections
EXPECTED_SCOPE:
- read Git state
- update tasks/implementation nếu state đổi
DO_NOT:
- sửa application code
- force push
CHECKS:
- exact local/remote refs
ACCEPTANCE:
- current main và archive refs được ghi chính xác
```

## TASK-R0-002 — Inventory Production schema

```text
STATUS: LOCKED
GOAL: Lập inventory schema/table/view/function/index/constraint read-only.
READ:
- Spec.md → SPEC-400
- plan.md → PLAN-R0
EXPECTED_SCOPE:
- read-only database metadata
DO_NOT:
- DDL
- migration apply
CHECKS:
- evidence/result captured
ACCEPTANCE:
- đủ metadata để lập migration map
```

## TASK-R0-003 — Audit access/RLS

```text
STATUS: LOCKED
GOAL: Ghi trạng thái RLS/policy/grants hiện có.
READ:
- Spec.md → SPEC-310
- plan.md → PLAN-R0
DO_NOT:
- alter policy
ACCEPTANCE:
- legacy access risks được phân loại
```

## TASK-R0-004 — Audit business data

Phạm vi:
- customer/site;
- sales;
- supplier/purchase;
- inventory;
- delivery;
- finance;
- workforce/service;
- portal/chat/route/GPS.

```text
STATUS: LOCKED
GOAL: Xác định dữ liệu thật, active, historical, demo/test.
READ:
- Spec.md domain sections tương ứng
DO_NOT:
- mutate
ACCEPTANCE:
- mỗi dataset có classification
```

## TASK-R0-005 — Data quality

```text
STATUS: LOCKED
GOAL: Tìm orphan, duplicate, invalid state, mismatch ledger.
CHECKS:
- read-only queries
ACCEPTANCE:
- defects có count/sample/risk
```

## TASK-R0-006 — Migration classification

```text
STATUS: LOCKED
GOAL: Gán KEEP_DATA / TRANSFORM / RECALCULATE / ARCHIVE_ONLY / DROP_FROM_V2 / MANUAL_REVIEW.
READ:
- Spec.md → SPEC-400
ACCEPTANCE:
- mọi business dataset chính có quyết định tạm thời
```

## TASK-R0-007 — Performance baseline

```text
STATUS: LOCKED
GOAL: Đo nhẹ các query đại diện, không gây tải Production.
READ:
- Spec.md → SPEC-370, SPEC-390
DO_NOT:
- load test
- long blocking query
ACCEPTANCE:
- baseline có duration + caveat
```

## TASK-R0-008 — R0 handoff

```text
STATUS: LOCKED
GOAL: Tổng hợp kết quả và quyết định R1 readiness.
CHECKS:
- no Production mutation
- docs synced
ACCEPTANCE:
- R0 status rõ
- blockers rõ
- STOP
```

---

# TASK-200 — R1 Backlog

## TASK-R1-001 — Runtime baseline
## TASK-R1-002 — Folder/module conventions
## TASK-R1-003 — Error model
## TASK-R1-004 — Exact money primitive
## TASK-R1-005 — Exact quantity primitive
## TASK-R1-006 — Validation convention
## TASK-R1-007 — Database read convention
## TASK-R1-008 — Transaction command convention
## TASK-R1-009 — Idempotency primitive
## TASK-R1-010 — Audit primitive
## TASK-R1-011 — Observability
## TASK-R1-012 — Test infrastructure
## TASK-R1-013 — CI baseline
## TASK-R1-014 — Design tokens
## TASK-R1-015 — UI primitives
## TASK-R1-016 — `/admin` shell
## TASK-R1-017 — Dashboard prototype
## TASK-R1-018 — Responsive/error/loading states
## TASK-R1-019 — Performance harness
## TASK-R1-020 — R1 phase gate

Tất cả:
```text
STATUS: LOCKED
```

Khi R1 được mở, tạo contract chi tiết từng task trước khi implement.

---

# TASK-300 — R2 Backlog

- TASK-R2-001 Employee
- TASK-R2-002 Branch
- TASK-R2-003 EmployeeBranchAccess
- TASK-R2-004 Role
- TASK-R2-005 Permission
- TASK-R2-006 RolePermission
- TASK-R2-007 CustomerPortalMembership
- TASK-R2-008 AccessContext
- TASK-R2-009 Server authorization
- TASK-R2-010 Database policies
- TASK-R2-011 Role management UI
- TASK-R2-012 Security suite
- TASK-R2-013 R2 gate

Status tất cả: `LOCKED`.

---

# TASK-400 — R3 Backlog

- TASK-R3-001 Material/group
- TASK-R3-002 UOM
- TASK-R3-003 Conversion
- TASK-R3-004 Supplier base
- TASK-R3-005 Customer
- TASK-R3-006 Site
- TASK-R3-007 Pricing
- TASK-R3-008 Credit
- TASK-R3-009 Customer UI
- TASK-R3-010 Supplier base UI
- TASK-R3-011 R3 gate

Status: `LOCKED`.

---

# TASK-500 — R4 Backlog

- TASK-R4-001 Quotation
- TASK-R4-002 Revision
- TASK-R4-003 Send
- TASK-R4-004 Accept
- TASK-R4-005 SalesOrder
- TASK-R4-006 State dimensions
- TASK-R4-007 Quote→SO
- TASK-R4-008 Direct SO
- TASK-R4-009 Credit integration
- TASK-R4-010 Sales UI
- TASK-R4-011 Critical E2E
- TASK-R4-012 R4 gate

Status: `LOCKED`.

---

# TASK-600 — R5 Backlog

- TASK-R5-001 PO
- TASK-R5-002 PO lines
- TASK-R5-003 Cost snapshot
- TASK-R5-004 SupplyAllocation
- TASK-R5-005 Warehouse sourcing
- TASK-R5-006 Supplier Direct
- TASK-R5-007 Supplier→Warehouse
- TASK-R5-008 Split allocation
- TASK-R5-009 Purchase UI
- TASK-R5-010 R5 gate

Status: `LOCKED`.

---

# TASK-700 — R6 Backlog

- TASK-R6-001 InventoryMovement
- TASK-R6-002 Position projection
- TASK-R6-003 Reservation
- TASK-R6-004 Reservation concurrency
- TASK-R6-005 StockCount
- TASK-R6-006 Adjustment
- TASK-R6-007 Costing
- TASK-R6-008 Delivery
- TASK-R6-009 Delivery lines
- TASK-R6-010 Assignment
- TASK-R6-011 Proof
- TASK-R6-012 Delivery confirmation
- TASK-R6-013 Inventory/Delivery UI
- TASK-R6-014 R6 gate

Status: `LOCKED`.

---

# TASK-800 — R7 Backlog

- TASK-R7-001 AR
- TASK-R7-002 AP
- TASK-R7-003 Payment
- TASK-R7-004 PaymentAllocation
- TASK-R7-005 Allocation concurrency
- TASK-R7-006 Advance
- TASK-R7-007 Expense
- TASK-R7-008 Cash/Bank
- TASK-R7-009 Reconciliation
- TASK-R7-010 Revenue facts
- TASK-R7-011 Direct cost facts
- TASK-R7-012 Profitability projection
- TASK-R7-013 Dashboard snapshot
- TASK-R7-014 Customer debt drawer
- TASK-R7-015 Supplier payable drawer
- TASK-R7-016 Query/index tuning
- TASK-R7-017 Dashboard performance
- TASK-R7-018 Finance UI
- TASK-R7-019 R7 gate

Status: `LOCKED`.

---

# TASK-900 — R8 Backlog

- TASK-R8-001 WorkItem
- TASK-R8-002 Direct assignment
- TASK-R8-003 Pool claim
- TASK-R8-004 Claim concurrency
- TASK-R8-005 Worker result
- TASK-R8-006 ServiceJob
- TASK-R8-007 WorkLog
- TASK-R8-008 Verification
- TASK-R8-009 Compensation rules
- TASK-R8-010 EarningEvent
- TASK-R8-011 Salary payable
- TASK-R8-012 Sales commission
- TASK-R8-013 Workforce/Service UI
- TASK-R8-014 R8 gate

Status: `LOCKED`.

---

# TASK-1000 — R9 Backlog

- TASK-R9-001 `/work` shell
- TASK-R9-002 Worker home
- TASK-R9-003 Job detail
- TASK-R9-004 Proof/result
- TASK-R9-005 Earnings
- TASK-R9-006 `/customer` shell
- TASK-R9-007 Customer quote
- TASK-R9-008 Customer orders
- TASK-R9-009 Customer deliveries
- TASK-R9-010 Customer debt
- TASK-R9-011 PaymentNotice
- TASK-R9-012 Documents
- TASK-R9-013 Customer isolation
- TASK-R9-014 Portal E2E
- TASK-R9-015 R9 gate

Status: `LOCKED`.

---

# TASK-1100 — R10 Backlog

- TASK-R10-001 Distance provider
- TASK-R10-002 RoutePlan
- TASK-R10-003 Route warnings
- TASK-R10-004 Route apply
- TASK-R10-005 Manual fallback
- TASK-R10-006 GPS current position
- TASK-R10-007 GPS history/retention
- TASK-R10-008 ETA
- TASK-R10-009 Conversation
- TASK-R10-010 Message
- TASK-R10-011 Unread summary
- TASK-R10-012 Realtime
- TASK-R10-013 R10 performance
- TASK-R10-014 R10 gate

Status: `LOCKED`.

---

# TASK-1200 — R11 Backlog

- TASK-R11-001 Invoice domain
- TASK-R11-002 Eligibility
- TASK-R11-003 Draft/review
- TASK-R11-004 Approval
- TASK-R11-005 Issue intent
- TASK-R11-006 Provider adapter
- TASK-R11-007 Status reconciliation
- TASK-R11-008 Document
- TASK-R11-009 Adjustment/replacement
- TASK-R11-010 Issue idempotency/concurrency
- TASK-R11-011 Invoice UI
- TASK-R11-012 R11 gate

Status: `LOCKED`.

---

# TASK-1300 — R12 Backlog

- TASK-R12-001 Migration scripts
- TASK-R12-002 Dry run
- TASK-R12-003 Reconciliation
- TASK-R12-004 UAT
- TASK-R12-005 Security review
- TASK-R12-006 Accessibility review
- TASK-R12-007 Performance/load
- TASK-R12-008 Backup/export
- TASK-R12-009 Rollback runbook
- TASK-R12-010 Freeze/delta plan
- TASK-R12-011 Release SHA
- TASK-R12-012 Owner approval
- TASK-R12-013 Cutover
- TASK-R12-014 Post-cutover reconcile
- TASK-R12-015 Legacy read-only
- TASK-R12-016 R12 closure

Status: `LOCKED`.

---

# TASK-9000 — Task contract template

```text
## TASK-<ID> — <Tên>

STATUS:
LOCKED / TODO / IN_PROGRESS / BLOCKED / DONE

GOAL:
<1–3 câu>

REQUIRES:
- TASK-...
- ...

READ:
- Spec.md → SPEC-...
- UXUI.md → UX-... nếu cần
- plan.md → PLAN-...
- implementation.md → section ...

EXPECTED_SCOPE:
- file/module/table dự kiến

DO_NOT:
- ...

CHECKS:
[ ] targeted typecheck
[ ] unit
[-] integration — N/A
[-] security — N/A
[-] concurrency — N/A
[-] E2E — phase gate
[-] performance — N/A

ACCEPTANCE:
- ...
- ...

SYNC_IMPACT:
Spec.md:
UXUI.md:
plan.md:
tasks.md:
implementation.md:

RESULT:
<ghi sau khi DONE>
```

# KẾT THÚC tasks.md
