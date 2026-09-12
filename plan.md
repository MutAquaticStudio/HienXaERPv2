# plan.md — HIỀN XA ERP V2

> **Bộ tài liệu:** `HX-V2-DOCSET-2.0`  
> **Giao thức đồng bộ:** `SYNC-2.0`  
> **File sở hữu:** Roadmap, dependency, chiến lược triển khai, check strategy và giao thức đồng bộ tài liệu  
> **Mục đích:** Chỉ cho Codex cách thực thi Spec theo từng phase với context và kiểm tra tối thiểu nhưng đủ.

---


# PLAN-000 — Luật đọc context

## PLAN-CTX-001 — Entry point

Mỗi task:

```text
tasks.md
→ xác định CURRENT_TASK

Spec.md
→ đọc ID requirement được task tham chiếu

UXUI.md
→ chỉ đọc ID UX được task tham chiếu nếu chạm UI

plan.md
→ đọc current phase + check rule liên quan

implementation.md
→ đọc module/route/schema thực tế liên quan

source/database
→ đúng phạm vi cần sửa
```

Không đọc cả 5 file nếu task đã có `READ:` rõ.

## PLAN-CTX-002 — Không scan repo mù

Chỉ scan rộng khi:
- task là audit;
- chưa biết implementation location;
- shared contract đổi;
- migration/security review;
- phase gate.

## PLAN-CTX-003 — Output token

Khi PASS:
```text
PASS — <check>: <summary>
```

Khi FAIL:
```text
command
exit code
first useful error
root cause
```

Không dump full logs.

---

# PLAN-010 — Ownership & Sync Contract

| Loại thông tin | File sở hữu |
|---|---|
| Requirement/invariant/security/performance | `Spec.md` |
| UX/layout/component behavior | `UXUI.md` |
| Roadmap/dependency/check strategy | `plan.md` |
| Current phase/task/status | `tasks.md` |
| SHA/schema/code/benchmark/deployment thực tế | `implementation.md` |

## PLAN-SYNC-001 — Khi User đổi requirement

Cập nhật:
- `Spec.md`;
- `UXUI.md` nếu UI bị ảnh hưởng;
- `tasks.md` tạo/sửa task;
- `plan.md` chỉ khi roadmap/dependency đổi.

Không cập nhật `implementation.md` cho đến khi code thật thay đổi.

## PLAN-SYNC-002 — Khi code được implement

Cập nhật:
- `tasks.md`;
- `implementation.md`.

Không sửa Spec/UXUI nếu requirement không đổi.

## PLAN-SYNC-003 — Khi phát hiện Spec thiếu

Không tự thay Spec im lặng.

Task:
- đánh dấu ambiguity/blocker nếu ảnh hưởng quyết định nghiệp vụ;
- nếu có thể chọn default an toàn không ảnh hưởng data contract, ghi assumption rõ trong task/implementation;
- User decision mới mới được canonical hóa vào Spec.

## PLAN-SYNC-004 — Sync impact block

Trước khi kết thúc task:

```text
SYNC_IMPACT
Spec.md:            UPDATE / NO_CHANGE
UXUI.md:            UPDATE / NO_CHANGE
plan.md:            UPDATE / NO_CHANGE
tasks.md:           UPDATE / NO_CHANGE
implementation.md: UPDATE / NO_CHANGE
```

---

# PLAN-020 — Kiến trúc triển khai

## PLAN-ARCH-001

Kiến trúc đích:

```text
MODULAR MONOLITH
```

## PLAN-ARCH-002 — Module boundary

Mỗi module nên có:
- domain types/entities;
- commands;
- read services;
- persistence adapter;
- validation;
- tests;
- UI integration khi cần.

Không bắt buộc mọi module cùng một folder template nếu không mang giá trị.

## PLAN-ARCH-003 — Dependency direction

Ưu tiên:
- module không import UI của module khác;
- domain không phụ thuộc framework UI;
- shared primitives rất nhỏ;
- cross-module flow qua explicit service/command contract.

Tránh `utils/` trở thành nơi chứa mọi thứ.

## PLAN-ARCH-004 — Database

Database là shared transaction boundary.

Không chia database theo service.

## PLAN-ARCH-005 — Read/write

Đường đọc và ghi được tối ưu riêng nhưng cùng source-of-truth.

---

# PLAN-030 — Roadmap

```text
R0  Production/Data Audit
R1  Foundation + Design System + Dashboard Prototype + Performance Foundation
R2  Identity + Access
R3  Catalog + Customer
R4  Sales + Quotation
R5  Purchasing + Sourcing
R6  Inventory + Delivery
R7  Finance + Profitability + Dashboard Financial Data
R8  Workforce + Service + Compensation
R9  Worker Portal + Customer Portal
R10 Route + GPS + Chat
R11 Electronic Invoice
R12 Migration + UAT + Performance + Cutover
```

Không tự sang phase.

---

# PLAN-R0 — Production/Data Audit

## Mục tiêu

Hiểu trạng thái Production trước khi thiết kế/migrate schema V2.

## Inputs

- current repository state;
- preserved migration history;
- Production database read-only access;
- storage/auth metadata read-only nếu có quyền.

## Công việc

1. Verify current Git state.
2. Inventory schema/table/view/function/index/constraint.
3. RLS/policy/grant inventory.
4. Row counts/data sizes.
5. Customer/site data audit.
6. Sales/quotation/order audit.
7. Supplier/purchase/sourcing audit.
8. Inventory ledger/reservation/count audit.
9. Delivery/vehicle/proof audit.
10. AR/AP/payment/allocation audit.
11. Workforce/service/earning audit.
12. Legacy access model audit.
13. Portal/chat/route/GPS data value.
14. Storage metadata.
15. Migration history.
16. Data quality.
17. Migration classification.
18. Lightweight safe performance baseline.

## Không được làm

- write Production;
- apply migration;
- alter policy;
- load test gây tải;
- implement business feature.

## Exit

- migration map đủ;
- data defects ghi rõ;
- không còn unknown lớn chặn schema V2.

---

# PLAN-R1 — Foundation

## Mục tiêu

Tạo codebase có thể phát triển dài hạn mà không kéo kiến trúc V1 trở lại.

## Công việc

1. Runtime/app structure.
2. Error model.
3. Exact money primitive.
4. Exact quantity primitive.
5. Validation conventions.
6. Access context skeleton.
7. Database access conventions.
8. Read service convention.
9. Command/idempotency convention.
10. Audit convention.
11. Design tokens.
12. UI primitives.
13. `/admin` shell.
14. Dashboard prototype bằng data mock/fixture rõ.
15. Loading/error/empty patterns.
16. Test infrastructure.
17. CI baseline.
18. Observability baseline.
19. Performance harness.

## Exit

- build pass;
- design shell approved;
- primitives stable;
- test/check flow usable;
- không business domain sâu chưa cần.

---

# PLAN-R2 — Identity + Access

## Dependencies

R1.

## Công việc

1. Employee.
2. Branch.
3. EmployeeBranchAccess.
4. Role.
5. Permission.
6. RolePermission.
7. CustomerPortalMembership.
8. AccessContext resolution.
9. server authorization.
10. DB policies.
11. role admin UI.
12. security tests.

## Exit

- allowed/denied/cross-scope pass;
- field-sensitive permissions support;
- không legacy generic scope engine.

---

# PLAN-R3 — Catalog + Customer

## Dependencies

R2.

## Công việc

1. Material/group.
2. UOM.
3. Conversion.
4. Supplier base profile.
5. Customer.
6. Site.
7. Pricing.
8. Credit.
9. Customer list/create/detail.
10. Supplier base list/detail nếu cần.
11. tests.

## Exit

- exact conversion;
- pricing precedence;
- snapshot;
- credit policy;
- customer/site access.

---

# PLAN-R4 — Sales + Quotation

## Dependencies

R3.

## Công việc

1. Quotation entity.
2. Revision.
3. send command.
4. accept command.
5. SalesOrder.
6. state dimensions.
7. create from quote.
8. direct create.
9. credit check.
10. list/create/detail UI.
11. critical E2E.

## Exit

- immutable sent revision;
- exact acceptance;
- SO confirm idempotent;
- no AR at confirm.

---

# PLAN-R5 — Purchasing + Sourcing

## Dependencies

R3, R4 line/material context.

## Công việc

1. PO.
2. PO lines.
3. supplier cost snapshot.
4. SupplyAllocation.
5. warehouse mode.
6. supplier direct.
7. supplier to warehouse.
8. split allocation.
9. UI.
10. tests.

## Exit

- dropship no fake stock;
- quantity semantics separate;
- PO confirm no AP.

---

# PLAN-R6 — Inventory + Delivery

## Dependencies

R3, R4, R5.

## Công việc

1. InventoryMovement.
2. position projection.
3. Reservation.
4. release/consume.
5. StockCount.
6. Adjustment.
7. costing.
8. Delivery.
9. delivery lines.
10. assignment.
11. proof.
12. confirm.
13. concurrency.
14. UI.

## Exit

- no oversubscribe;
- no balance edit;
- delivery effects exactly once;
- supplier-direct path correct.

---

# PLAN-R7 — Finance + Profitability + Dashboard Data

## Dependencies

R4-R6.

## Công việc

1. AR.
2. AP.
3. Payment.
4. Allocation.
5. Advance.
6. Expense.
7. cash/bank projection.
8. Reconciliation.
9. Revenue/direct cost facts.
10. profitability query.
11. salary/commission placeholder integration if R8 chưa xong phải explicit.
12. Dashboard snapshot read.
13. debt/payable drawer reads.
14. indexes.
15. performance benchmark.
16. UI.

## Exit

- AR/AP semantics;
- no double counting;
- allocation concurrency;
- dashboard exact drill-down;
- performance budget.

---

# PLAN-R8 — Workforce + Service + Compensation

## Dependencies

R2, R6/R7 where integration needed.

## Công việc

1. WorkItem.
2. direct assignment.
3. pool claim.
4. claim lease policy.
5. result/proof.
6. ServiceJob.
7. WorkLog.
8. verification.
9. EarningEvent.
10. compensation rules.
11. salary payable.
12. sales commission.
13. UI.
14. concurrency.

## Exit

- one winner;
- earning/payment separation;
- salary/commission dashboard source complete.

---

# PLAN-R9 — Portals

## Dependencies

R2-R8.

## Công việc

1. `/work` shell.
2. worker home.
3. job detail.
4. proof/result.
5. earnings.
6. `/customer` shell.
7. quote.
8. orders.
9. deliveries.
10. debt.
11. PaymentNotice.
12. documents.
13. access isolation.

## Exit

- mobile acceptance;
- customer isolation;
- critical portal E2E.

---

# PLAN-R10 — Route + GPS + Chat

## Dependencies

R6, R9.

## Công việc

1. distance provider interface.
2. route plan.
3. capacity/time warnings.
4. apply.
5. manual fallback.
6. GPS current position.
7. history/retention.
8. ETA.
9. Conversation.
10. Message.
11. unread summary.
12. realtime transport.
13. performance.

## Exit

- no silent assignment;
- stale telemetry semantics;
- chat non-authoritative.

---

# PLAN-R11 — Electronic Invoice

## Dependencies

R7, R9 documents if relevant.

## Công việc

1. provider-neutral model.
2. eligibility.
3. draft/review.
4. approval.
5. issue intent.
6. external adapter.
7. status reconciliation.
8. document.
9. adjustment/replacement.
10. idempotency/concurrency.
11. UI.

## Exit

- duplicate safe;
- timeout unknown;
- no duplicate AR.

---

# PLAN-R12 — Migration/UAT/Cutover

## Dependencies

R0-R11.

## Công việc

1. migration scripts.
2. dry run.
3. data reconciliation.
4. UAT.
5. security review.
6. accessibility review.
7. performance/load.
8. backup/export.
9. rollback plan.
10. freeze/delta.
11. exact release SHA.
12. Owner authorization.
13. cutover.
14. post-cutover reconciliation.
15. legacy read-only.

## Exit

Production ready only after explicit approval.

---

# PLAN-100 — Check Strategy

## PLAN-CHECK-001 — Triết lý

```text
MINIMUM SUFFICIENT VERIFICATION
```

Không phải maximum possible verification.

## PLAN-CHECK-002 — Level

```text
L1 TASK
L2 MODULE
L3 PHASE
L4 RELEASE
```

## PLAN-CHECK-003 — L1

Chỉ affected checks.

## PLAN-CHECK-004 — L2

Mở rộng khi shared contract/module dependency đổi.

## PLAN-CHECK-005 — L3

Cuối phase:
- lint;
- full typecheck;
- phase unit/integration;
- security nếu liên quan;
- targeted critical E2E;
- performance nếu liên quan;
- build.

## PLAN-CHECK-006 — L4

Release:
- full lint;
- full typecheck;
- full unit;
- full integration;
- critical E2E;
- security/RLS;
- concurrency;
- performance;
- build;
- migration validation.

Không có smoke test riêng.

---

# PLAN-110 — Change-to-check matrix

| Thay đổi | Check |
|---|---|
| UI thuần | targeted typecheck + component/route check |
| Pure domain | unit + invariant |
| DB schema | migration validation + integration |
| Permission/RLS | security allowed/denied/cross-scope |
| Transaction | integration + idempotency |
| Competing write | concurrency |
| Money/quantity | exact arithmetic |
| Dashboard/list query | integration/query + performance |
| Index | query plan + performance |
| External adapter | contract + timeout/idempotency |
| Shared primitive | unit + affected module regression |
| Config/dependency | build |
| Cross-module flow | targeted E2E |

---

# PLAN-120 — Check invalidation

Nếu một check PASS và không có dependency liên quan đổi:

```text
DO NOT RUN AGAIN
```

`tasks.md` ghi check state.

Invalidation khi:
- file dependency đổi;
- interface đổi;
- schema đổi;
- shared primitive đổi;
- environment/config đổi.

---

# PLAN-130 — Security escalation

Thay đổi bất kỳ:
- access context;
- role;
- permission;
- query sensitive;
- customer membership;
- RLS;

→ bắt buộc security check.

Minimum:
```text
ALLOW expected
DENY forbidden
DENY cross-scope
```

---

# PLAN-140 — Concurrency escalation

Chỉ khi có competing writes.

Phải dùng test có hai transaction/session thực nếu invariant phụ thuộc lock/constraint.

Không giả concurrency bằng gọi tuần tự.

---

# PLAN-150 — Performance escalation

Chỉ benchmark hot path.

Task-level:
- query duration;
- rows;
- plan nếu cần.

Phase-level:
- representative dataset;
- p50/p95;
- errors;
- connection/lock metrics.

Không load test Production.

---

# PLAN-160 — Commit Strategy

Một task logic hoàn chỉnh có thể một commit nếu:
- required checks pass;
- docs synced;
- không chứa unrelated refactor.

Commit message nên phản ánh domain/action.

Không commit log/generated junk.

---

# PLAN-170 — Task completion

Một task chỉ DONE khi:

1. code/data change hoàn tất;
2. acceptance của task đạt;
3. required checks pass;
4. `tasks.md` cập nhật;
5. `implementation.md` cập nhật nếu trạng thái kỹ thuật thay đổi;
6. sync impact resolved;
7. không blocker chưa ghi.

Sau đó STOP nếu prompt không mở task tiếp.

---

# PLAN-180 — Blocker handling

Statuses:

```text
BLOCKED
HUMAN_ACTION_REQUIRED
DEPENDENCY_LOCKED
```

Không tự phá safety rule để unblock.

---

# PLAN-190 — Token optimization

1. Task phải có `READ`.
2. Chỉ đọc requirement IDs được tham chiếu.
3. Không quote lại Spec vào output.
4. Không paste full logs.
5. Không scan repo toàn bộ nếu file scope rõ.
6. Không full test L4 ở L1.
7. Ghi delta vào implementation, không kể lại history.
8. Dùng grep/search trước khi mở file lớn.
9. Với file >500 dòng, tìm symbol/heading trước.
10. Khi lỗi, đọc vùng lỗi ± context nhỏ trước.

---

# PLAN-200 — Phase unlock

Chỉ User mới mở phase bằng chỉ thị rõ.

Ví dụ:

```text
BẮT ĐẦU R0
BẮT ĐẦU R1
```

Không suy diễn `ok`, `tiếp` thành mở phase mới nếu chưa rõ.

---

# PLAN-210 — Production rule

```text
CHECKPOINT
!=
PRODUCTION
```

Không tự deploy/cutover.

# KẾT THÚC plan.md
