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
DOC_LOCK: NOT_ESTABLISHED
DOCSET_FINGERPRINT: NONE
ACTIVE_CONTEXT_PACK: NONE
INSTRUCTION_AUDIT_REF: NONE
DEPLOY_GUARD_REF: NONE
SCHEMA_SNAPSHOT_REF: NONE
SECURITY_SNAPSHOT_REF: NONE
DATA_BASELINE_REF: NONE
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
APPLICATION_V2_DOMAIN_CODE: NOT_VERIFIED / expected clean baseline before R0
PRODUCTION_AUDIT: NOT_RUN_FOR_4_0
ACCEPTANCE: NOT_REQUESTED
```

# IMP-030 — Path & command registry

Chỉ điền khi R0/R1 xác minh thật:

| Key | Actual value | Evidence | Last verified |
|---|---|---|---|
| repo_root | — | NOT_VERIFIED | — |
| package_manager | — | NOT_VERIFIED | — |
| app_routes | — | NOT_VERIFIED | — |
| module_root | — | NOT_VERIFIED | — |
| db_migration_path | — | NOT_VERIFIED | — |
| unit_command | — | NOT_VERIFIED | — |
| db_test_command | — | NOT_VERIFIED | — |
| typecheck_command | — | NOT_VERIFIED | — |
| build_command | — | NOT_VERIFIED | — |

# IMP-040 — Module registry

Chỉ thêm module khi source thật tồn tại:

| Module | Paths | DB objects | Public commands/queries | State | Evidence |
|---|---|---|---|---|---|
| — | — | — | — | NOT_IMPLEMENTED | — |

# IMP-050 — Verification registry

Một row cho một lần kiểm có giá trị tái dùng:

| ID | Scope | Tree/diff | Command/environment | Result | Log/artifact |
|---|---|---|---|---|---|
| — | — | — | — | NOT_RUN | — |

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
