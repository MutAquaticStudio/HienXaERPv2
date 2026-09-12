# implementation.md — HIỀN XA ERP V2

> **Bộ tài liệu:** `HX-V2-DOCSET-2.0`  
> **Giao thức đồng bộ:** `SYNC-2.0`  
> **File sở hữu:** Trạng thái kỹ thuật thực tế: Git, runtime, schema, module, route, test, benchmark, deployment  
> **Mục đích:** Giúp Codex biết hệ thống thực tế đang có gì mà không phải scan lại toàn repository.

---


# IMP-000 — Luật sử dụng

`implementation.md` không phải requirement.

Nguồn trạng thái kỹ thuật:

```text
SOURCE CODE / DATABASE / REMOTE
→ implementation.md ghi lại
```

Nếu khác:
```text
CẬP NHẬT implementation.md
```

Không sửa code chỉ để khớp log cũ.

Không ghi CURRENT_TASK/CURRENT_PHASE; xem `tasks.md`.

---

# IMP-010 — Repository State

```text
repository:
MutAquaticStudio/HienXaERPv2

legacy branch:
archive/v1-final

legacy tag:
v1-final

legacy SHA:
6b59b79a8adf47beb258c39fb8fe52cf8ad09810

archive verified:
YES

main cleanup SHA:
63698deacb54fdb2fe3e205b883de75df4768c5b

remote main matched at cleanup:
YES
```

Khi main thay đổi, cập nhật section này với:
- current main SHA;
- last verified remote SHA;
- verification timestamp nếu cần.

---

# IMP-020 — Production State

Tại baseline cleanup:

```text
Production database modified:
NO

Production storage modified:
NO

Production deployed:
NO
```

Mọi thay đổi Production sau này phải ghi:
- exact action;
- exact migration/release;
- actor/approval;
- timestamp;
- rollback reference.

---

# IMP-030 — Current root baseline

Baseline đã giữ/tạo:

```text
README.md
AGENTS.md
CLAUDE.md
.gitignore
package.json
tsconfig.json
next.config.ts
next-env.d.ts
supabase/migrations/
src/app/page.tsx
src/app/layout.tsx
src/app/globals.css
```

Nếu cấu trúc root thay đổi, cập nhật bằng delta.

Không copy toàn tree vào đây.

---

# IMP-040 — Dependency Registry

Format chuẩn:

```text
Package:
Version:
Purpose:
Introduced by task:
Reason:
```

Chỉ ghi dependency quan trọng/kiến trúc.

Không cần liệt kê dependency transitive.

Current:
```text
TO_BE_VERIFIED
```

---

# IMP-050 — Runtime/Environment

Ghi khi xác minh:

```text
Node/runtime:
Hosting runtime:
Database connection mode:
Database region:
App region:
Auth provider:
Storage:
Realtime:
```

Không ghi secret/value nhạy cảm.

Current:
```text
NOT_AUDITED
```

---

# IMP-060 — Database Baseline

`supabase/migrations/` hiện được bảo toàn như legacy history.

Không được coi là V2 canonical schema cho đến R0/R1 decision.

R0 sẽ cập nhật:

```text
PostgreSQL version:
schemas:
table count:
view count:
function count:
RLS summary:
migration state:
data volume:
known integrity issues:
```

Current:
```text
NOT_AUDITED
```

---

# IMP-070 — Canonical V2 Schema Registry

Sau khi V2 schema được tạo, mỗi table/entity ghi:

```text
Entity:
Table/View:
Primary key:
Important FKs:
RLS:
Source of truth:
Created by task:
Migration:
Notes:
```

Current:
```text
NO_V2_BUSINESS_SCHEMA
```

---

# IMP-080 — Module Registry

| Module | Status | Main paths | DB objects | Tests | Notes |
|---|---|---|---|---|---|
| identity | NOT_IMPLEMENTED | — | — | — | — |
| catalog | NOT_IMPLEMENTED | — | — | — | — |
| customers | NOT_IMPLEMENTED | — | — | — | — |
| sales | NOT_IMPLEMENTED | — | — | — | — |
| purchasing | NOT_IMPLEMENTED | — | — | — | — |
| inventory | NOT_IMPLEMENTED | — | — | — | — |
| fulfillment | NOT_IMPLEMENTED | — | — | — | — |
| finance | NOT_IMPLEMENTED | — | — | — | — |
| profitability | NOT_IMPLEMENTED | — | — | — | — |
| workforce | NOT_IMPLEMENTED | — | — | — | — |
| services | NOT_IMPLEMENTED | — | — | — | — |
| routing | NOT_IMPLEMENTED | — | — | — | — |
| messaging | NOT_IMPLEMENTED | — | — | — | — |
| invoicing | NOT_IMPLEMENTED | — | — | — | — |
| reporting | NOT_IMPLEMENTED | — | — | — | — |

Status allowed:

```text
NOT_IMPLEMENTED
PARTIAL
IMPLEMENTED
DEPRECATED
BLOCKED
```

---

# IMP-090 — Route Registry

| Route | Status | Server/Client notes | Data source | Permission | Task |
|---|---|---|---|---|---|
| `/admin` | NOT_IMPLEMENTED | — | — | — | — |
| `/work` | NOT_IMPLEMENTED | — | — | — | — |
| `/customer` | NOT_IMPLEMENTED | — | — | — | — |

Khi route con được tạo, thêm row.

Không cần ghi mọi static asset route.

---

# IMP-100 — Read Contract Registry

Format:

```text
Read name:
Purpose:
Input filters:
Access scope:
DB objects:
Return DTO:
Pagination:
Cache:
Measured p50/p95:
Task:
```

Current:
```text
NONE
```

Dashboard sau này phải ghi `get_admin_dashboard_snapshot` hoặc tên thực tế tương đương.

---

# IMP-110 — Command Registry

Format:

```text
Command:
Purpose:
Permission:
Input:
Idempotency:
Transaction boundary:
Locks:
Effects:
Audit:
External call:
Tests:
Task:
```

Current:
```text
NONE
```

---

# IMP-120 — Invariant Coverage Registry

Mỗi invariant critical sau khi implement:

```text
SPEC-ID:
Implementation path:
DB constraint if any:
Unit/integration/concurrency test:
Status:
```

Current:
```text
NO_V2_INVARIANT_TESTS_YET
```

---

# IMP-130 — Access Registry

Sau R2:

```text
AccessContext implementation:
Role tables:
Permission tables:
Branch access:
Customer membership:
RLS policies:
Sensitive field handling:
Security test paths:
```

Current:
```text
NOT_IMPLEMENTED
```

---

# IMP-140 — Money/Quantity Implementation

Ghi sau R1:

```text
Money representation:
Quantity representation:
Rounding:
DB numeric types:
Serialization:
Test paths:
```

Current:
```text
NOT_IMPLEMENTED
```

---

# IMP-150 — Dashboard Implementation

Ghi:
- route;
- snapshot read;
- KPI source;
- balance source;
- filter mapping;
- drawer reads;
- cache;
- permissions;
- benchmark.

Current:
```text
NOT_IMPLEMENTED
```

---

# IMP-160 — Finance Implementation

Ghi khi có:
- AR source event;
- AP source event;
- Payment states;
- allocation algorithm;
- reversal;
- advance;
- reconciliation;
- exact money;
- constraints;
- concurrency tests.

Current:
```text
NOT_IMPLEMENTED
```

---

# IMP-170 — Inventory Implementation

Ghi:
- ledger;
- position;
- reservation;
- stock count;
- costing;
- lock strategy;
- concurrency tests.

Current:
```text
NOT_IMPLEMENTED
```

---

# IMP-180 — Workforce/Compensation

Ghi:
- WorkItem;
- claim;
- lease;
- result;
- ServiceJob;
- EarningEvent;
- salary/commission;
- tests.

Current:
```text
NOT_IMPLEMENTED
```

---

# IMP-190 — Portals

```text
/work:
NOT_IMPLEMENTED

/customer:
NOT_IMPLEMENTED
```

Sau implement ghi:
- routes;
- auth scope;
- key reads/commands;
- mobile/E2E coverage.

---

# IMP-200 — Routing/GPS/Messaging

Current:
```text
Route: NOT_IMPLEMENTED
GPS: NOT_IMPLEMENTED
Messaging: NOT_IMPLEMENTED
```

Sau implement ghi provider/fallback/retention/realtime actual state.

---

# IMP-210 — Electronic Invoice

Current:
```text
NOT_IMPLEMENTED
Provider:
NOT_SELECTED
```

Sau implement ghi:
- adapter;
- issue flow;
- reconcile;
- idempotency;
- document storage;
- status mapping.

---

# IMP-220 — Test Infrastructure

Smoke test:
```text
REMOVED
```

Current test infrastructure:
```text
TO_BE_DEFINED_IN_R1
```

Registry sau R1:

```text
Lint:
Typecheck:
Unit runner:
Integration DB:
Security/RLS:
E2E:
Concurrency:
Performance:
CI:
```

---

# IMP-230 — Performance Registry

Không ghi target ở đây; target thuộc `Spec.md`.

Chỉ ghi measured values.

Format:

```text
Scenario:
Dataset:
Environment:
Commit:
p50:
p95:
p99:
Error rate:
DB/query:
Payload:
Notes:
```

Current:
```text
NO_V2_BENCHMARK
```

---

# IMP-240 — Migration Registry

Sau R0/R12:

```text
Dataset:
Legacy source:
V2 target:
Classification:
Transform:
Reconciliation:
Script/migration:
Status:
```

Current:
```text
NOT_DEFINED
```

---

# IMP-250 — Known Technical Risks

Baseline:

1. Production schema chưa audit cho V2.
2. Legacy migrations chưa được phân loại thành V2 mapping.
3. V2 access chưa implement.
4. V2 exact money/quantity chưa implement.
5. V2 test infrastructure chưa dựng.
6. V2 performance chưa đo.
7. Migration/reconciliation chưa có.

Mỗi risk khi đóng:
- xóa khỏi active list;
- ghi task/commit giải quyết nếu cần.

---

# IMP-260 — Decision Record Lite

Không tạo file ADR riêng.

Các quyết định implementation đáng nhớ có thể ghi ngắn:

```text
IMP-DEC-<n>
Date:
Decision:
Reason:
Affected:
Task:
```

Chỉ ghi quyết định kỹ thuật thực tế, không thay Spec.

---

# IMP-270 — Change Log Lite

Sau mỗi task lớn:

```text
Date:
Task:
Commit:
Changed:
Validated:
Known limitation:
```

Không kể lại toàn bộ diff.

---

# IMP-280 — Verification freshness

Mọi trạng thái nhạy thời gian như:
- SHA;
- deployment;
- DB region;
- package version;
- benchmark;

phải ghi `last verified` khi giá trị có thể thay đổi.

Không dùng giá trị cũ như current fact nếu chưa re-check.

---

# IMP-290 — Update checklist

Sau task:

1. module registry đổi?
2. route registry đổi?
3. DB registry đổi?
4. read/command registry đổi?
5. invariant coverage đổi?
6. test infrastructure đổi?
7. benchmark mới?
8. deployment/Git state đổi?
9. risk mới/đóng?
10. change log cần row?

Chỉ cập nhật section bị ảnh hưởng.

# KẾT THÚC implementation.md
