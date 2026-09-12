# plan.md — Kế hoạch triển khai chi tiết nhưng gọn ngữ cảnh

> **Bộ tài liệu:** `HX-V2-DOCSET-4.2`  
> **Giao thức đồng bộ:** `SYNC-4.2`  
> **Mục tiêu:** Spec → plan → task → code → implementation; chi tiết đủ để Codex không phải tự thiết kế lại, nhưng không dựng hạ tầng trước nhu cầu thật.

# PLAN-000 — Chuỗi thực thi duy nhất

```text
Spec.md
→ plan.md
→ tasks.md
→ source/database liên quan
→ implement
→ implementation.md
```

`UXUI.md` chỉ nạp khi task chạm UI/luồng. `acceptance.md` chỉ nạp khi có lệnh nghiệm thu/QA.

Không tự mở phase tiếp theo. Không Production mutation nếu chưa có chỉ thị riêng.


# PLAN-005 — Document Lock: khóa một lần, không đọc lại mỗi task

## PLAN-LOCK-001 — Bootstrap lock

Chỉ ở đầu session mới hoặc khi DOCSET thay đổi:

1. Xác nhận `HX-V2-DOCSET-4.2 / SYNC-4.2`.
2. Đọc `SPEC-DOC-001..010`.
3. Đọc `PLAN-000..090`.
4. Đọc `TASK-010`.
5. Tính/ghi một `DOCSET_FINGERPRINT` từ sáu file Markdown hoặc dùng exact Git tree/hash chứng minh nội dung.
6. Ghi `DOC_LOCK=VALID`.

Sau khi `DOC_LOCK=VALID`, không đọc lại SPEC-DOC/PLAN toàn cục khi đổi task trong cùng DOCSET, trừ trigger ở SPEC-DOC-009.

## PLAN-LOCK-002 — Gate task nhẹ

Trước mỗi task chỉ cần:

```text
DOC_LOCK=VALID
+
CTX_PACK phase đã nạp và chưa invalid
+
TASK_SCOPE_READ
+
SOURCE_SCOPE_RESOLVED
+
DEPENDENCIES_READY
=
CAN_IMPLEMENT
```

Không re-audit document set. Không tự kiểm lại kiến trúc toàn cục.

Nếu task chạm UI, nạp đúng UX section chưa có trong active context; đã nạp và DOCSET không đổi thì reuse.

## PLAN-LOCK-003 — Conformance check theo batch

Trong task chỉ chặn ngay khi phát hiện deviation rõ. Cuối batch mới chạy conformance delta:

1. changed paths có trace về task không?
2. có behavior/schema/abstraction ngoài contract không?
3. có observable flow bị đổi không?
4. có assumption nhạy cảm chưa được duyệt không?

PASS → ghi một dòng cho batch, không một record cho từng task nếu cùng contract.
Có conflict → `DOC_CONFLICT`, block đúng phần.

# PLAN-010 — Nguyên tắc chống over-engineering

1. Dùng giải pháp nhỏ nhất đáp ứng Spec và invariant.
2. Hàm/module trước; class/interface/framework sau khi có nhu cầu thật.
3. Một DB transaction cho effects nội bộ; không event bus/saga giữa module cùng DB.
4. Không event sourcing/CQRS toàn hệ thống.
5. Không generic repository/service base classes.
6. Không rules/workflow engine; policy có kiểu.
7. Không tenant/plugin/theme/provider abstraction dự phòng.
8. Không persisted projection/cache trước khi query/index đơn giản được đo và thất bại ngân sách.
9. Không job/outbox trước ranh giới async thật; khi cần chỉ một cơ chế.
10. Không migration cho mỗi task nhỏ; migration theo lát cắt coherent.
11. Không test framework/orchestrator riêng để chọn test thông minh.
12. Không smoke test.

Nếu Codex muốn thêm abstraction ngoài danh sách hiện có, phải chỉ ra **hai nơi dùng thật hoặc một invariant/provider seam thật**. Nếu không có, không thêm.


# PLAN-015 — NO_REAUDIT: bằng chứng dùng lại cho tới khi có trigger

| Bằng chứng/quyết định | Tạo khi | Chỉ invalid khi |
|---|---|---|
| Document lock | đầu session/DOCSET | contract file đổi |
| Instruction audit | R0/bootstrap | AGENTS/CLAUDE/instruction đổi |
| Repo/archive identity | R0 | refs cần dùng đổi |
| Deploy guard | R0 | hosting/Git/CI/deploy config đổi |
| Schema snapshot | R0 | migration/schema DDL đổi |
| Security snapshot | R0/R2 | RLS/grant/view/function/storage policy đổi |
| Data baseline | R0 | migration/reconcile hoặc dữ liệu đó thành input quyết định mới |
| Architecture decisions | DOCSET | Owner/Spec đổi hoặc DOC_CONFLICT có bằng chứng |
| Path registry | khi module xuất hiện | path move/delete |
| Command map | R1 | scripts/tooling/config đổi |
| PASS check | khi chạy | source/test/schema/config/dependency liên quan đổi |
| UX flow contract | DOCSET | UXUI/Spec đổi |
| Acceptance result | QA | build/tree/requirement liên quan đổi |

Quy tắc:
- chuyển phase không tự invalid R0 audit;
- commit mới không tự invalid mọi check;
- không re-query Production schema ở phase sau nếu không có schema/Production mutation;
- không re-audit toàn RLS sau mỗi permission task, chỉ kiểm delta boundary vừa đổi;
- không re-run architecture audit sau mỗi batch;
- không đọc lại tài liệu tham chiếu Sapo/Design Thinking nếu UX contract không đổi;
- không tìm lại source path nếu registry vẫn tồn tại;
- evidence thiếu scope thì mở rộng đúng scope thiếu, không audit lại từ đầu.

# PLAN-016 — FAST_PATH: giảm reasoning khi contract đã đủ

Mặc định:

```text
TASK
→ active context pack
→ registered source paths
→ implement
→ risk-tag checks
→ implementation delta
```

Không tự thêm:
- nghiên cứu lại kiến trúc;
- so sánh framework/thư viện khi lựa chọn đã khóa;
- proposal/ADR/plan mới;
- brainstorm alternatives;
- audit toàn repo/schema/UX;
- đọc full file.

Chỉ suy xét thêm khi:
1. source thực khác contract;
2. API/version thực làm cách đã khóa không khả thi;
3. có hai lựa chọn ảnh hưởng observable behavior;
4. rủi ro tiền/kho/quyền/migration chưa được quyết định;
5. check fail và root cause chưa rõ.

Khi đó chỉ phân tích vấn đề hẹp đang block.

# PLAN-020 — Context pack để giảm token

## PLAN-CTX-BASE — Nạp một lần khi bắt đầu phase/session

Đọc:
- `Spec.md`: SPEC-000, SPEC-040, SPEC-050, SPEC-510, SPEC-520, SPEC-530.
- `plan.md`: PLAN-000 đến PLAN-090.
- `tasks.md`: TASK-010 + phase/task đang mở.
- `implementation.md`: chỉ registry/path/evidence liên quan.

Không đọc lại CTX-BASE sau mỗi task nếu tài liệu không đổi.

## PLAN-CTX-R0
SPEC-PRODUCT-004/005; SPEC-400; SPEC-470; SPEC-490; SPEC-DATA-003.

## PLAN-CTX-R1
SPEC-320; SPEC-330; SPEC-360; SPEC-370; SPEC-410; SPEC-ARCH-*; UX-010; UX-030 đến UX-220; UX-800 đến UX-920.

## PLAN-CTX-R2
SPEC-310; SPEC-470; UX-AUTH-001; UX-820.

## PLAN-CTX-R3
SPEC-100; SPEC-110; SPEC-120; SPEC-130; SPEC-FIN-002/003; SPEC-DATA-001/002; SPEC-CONFIG-001/002; UX-330; UX-340.

## PLAN-CTX-R4
SPEC-140; SPEC-150; SPEC-120; SPEC-130; SPEC-JOURNEY-001..004; UX-300; UX-310; UX-FLOW-002; UX-FLOW-008/009.

## PLAN-CTX-R5
SPEC-160; SPEC-JOURNEY-002..004; SPEC-CONFIG-002; UX-320; UX-330; UX-FLOW-003/009.

## PLAN-CTX-R6
SPEC-170; SPEC-180; SPEC-FIN-002/003; SPEC-440; SPEC-DATA-001; UX-360..390; UX-FLOW-006/007/011.

## PLAN-CTX-R7
SPEC-190; SPEC-200; SPEC-210; SPEC-460; SPEC-BE-004..006; UX-230; UX-420..440; UX-850/860; UX-FLOW-005.

## PLAN-CTX-R8
SPEC-220; SPEC-230; SPEC-240; SPEC-REPORT-003; SPEC-OPS-004; UX-410; UX-450/460; UX-FLOW-012/013.

## PLAN-CTX-R9
SPEC-250; SPEC-260; SPEC-470; SPEC-DATA-005; UX-600; UX-700; UX-AUTH-001.

## PLAN-CTX-R10
SPEC-270; SPEC-280; SPEC-290; SPEC-DATA-004; UX-400; UX-480.

## PLAN-CTX-R11
SPEC-300; SPEC-SEC-004; SPEC-470; UX-470; UX-FLOW-014.

## PLAN-CTX-R12
SPEC-400; SPEC-430; SPEC-370; SPEC-410; acceptance.md đúng scope release.

### Cách dùng

- Task chỉ ghi `CTX: PLAN-CTX-Rn`; không lặp 4–8 requirement ID.
- Nếu task cần thêm một ID ngoài pack, ghi `+SPEC-...`.
- Khi chuyển task cùng phase, chỉ mở source/caller/callee mới.
- Nếu Spec/UX/plan của pack thay đổi, invalid context pack; nếu không, reuse.
- Trong session mới, nạp `PLAN-CTX-BASE` một lần + pack phase hiện tại + task đang mở. Chuyển task cùng phase không nạp lại pack. Chuyển phase chỉ nạp pack phase mới; BASE reuse nếu DOC_LOCK còn VALID.

# PLAN-030 — Cấu trúc backend mặc định

Kiến trúc: nguyên khối theo mô-đun.

Mỗi domain bắt đầu với số file ít nhất cần thiết, ví dụ:

```text
module/
  commands.ts hoặc commands/
  queries.ts hoặc queries/
  validation.ts khi thật sự cần
  types.ts khi có kiểu dùng lại
```

Không bắt buộc đủ bốn file. UI route/component giữ gần route nếu chỉ dùng ở đó; chỉ đưa vào component chung khi lặp thật.

Không tạo `repository/`, `service/`, `domain/`, `application/`, `infrastructure/` đủ tầng cho mỗi module theo khuôn nếu không có trách nhiệm tách biệt thật.

Cross-module write dùng use-case/orchestrator mỏng và transaction chung theo SPEC-ARCH-011.

# PLAN-040 — Quyền sở hữu schema và migration

- Bảng core thuộc đúng module ở SPEC-520.
- FK tường minh cho nguồn authoritative; không polymorphic FK registry.
- Draft/master data mutable; posted ledgers append-only.
- Index chỉ thêm theo constraint, FK/hot query đã biết hoặc sau đo.
- Migrations local theo batch/lát cắt; không replay V1 mù.
- JSON không thay schema core.

# PLAN-050 — Risk tag và kiểm kỹ thuật

Task dùng một hoặc nhiều tag:

| Tag | Kiểm tối thiểu khi BUILD_ONLY |
|---|---|
| DOC | review diff/ref/dependency đúng phần |
| UI | typecheck + render/interaction của màn bị đổi khi có công cụ |
| UNIT | hàm/rule mới đổi + case biên trực tiếp |
| DB | migration/query/command thật trên DB local cô lập |
| SEC | allowed/forbidden/cross-scope tại boundary vừa đổi |
| IDEM | retry same key/source và payload conflict khi áp dụng |
| RACE | hai session thật cho invariant tranh chấp vừa đổi |
| EXT | timeout/unknown/reconcile contract của provider |
| PERF | chỉ hot query đang đổi; p95 rộng ở QA/release |
| MIG | rehearsal/reconcile theo scope migration |
| GATE | tổng hợp evidence + checkpoint an toàn |

### Gom kiểm theo batch

Không chạy lại DB/typecheck/build sau từng sub-step nếu cùng batch và code chưa cần feedback đó. Không chạy lại audit/check chỉ để “chắc lại” nếu verification registry nói còn VALID.

- Trong task: chạy kiểm rẻ cần để tránh tiếp tục trên lỗi.
- Cuối batch: chạy hợp các tag của task trong batch một lần.
- Cuối phase: chỉ chạy phần invalidated + typecheck/build nếu phase có code ứng dụng.
- QA/release: dùng acceptance.md, không tự tạo suite smoke.

Tiền/kho/quyền/idempotency/race không được hoãn nếu task đang tạo primitive mà task sau phụ thuộc.

# PLAN-060 — Trạng thái

Triển khai:
`LOCKED → TODO → IN_PROGRESS → IMPLEMENTED_LOCAL → IMPLEMENTED`
hoặc `BLOCKED`.

Cuối phase kỹ thuật:
`PHASE_IMPLEMENTED`.

Nghiệm thu:
`NOT_REQUESTED / REQUESTED / IN_PROGRESS / ACCEPTED / REJECTED / OUTDATED`.

`IMPLEMENTED` không đồng nghĩa `ACCEPTED`.

# PLAN-070 — Log và implementation

Sau một task/batch chỉ ghi delta:

```text
task/batch
paths/schema thực
risk checks + result
known limitation/blocker
sync impact
```

Không copy requirement vào implementation. Không lưu chain-of-thought.

Output chat mặc định:

```text
LOG
scope=...
implementation=...
doc_conformance=<PASS/BLOCKED>
contract_refs=<TASK + context pack + requirement IDs chính>
changed=...
checks=<NEW/RERUN/REUSED + result>
reused_evidence=<IDs hoặc NONE>
blocker=...
production=NOT_TOUCHED

DoD
triển khai=...
kiểm_tối_thiểu=...
nghiệm_thu=NOT_REQUESTED
next=LOCKED
```

# PLAN-080 — Nghiệm thu tách riêng

BUILD_ONLY không nạp `acceptance.md`.

Khi có:
- `NGHIỆM THU Rn`
- `CHẠY QA <phạm vi>`
- `TÔI TỰ NGHIỆM THU ...`

thì chuyển QA_ONLY đúng phạm vi, đọc acceptance map, không code thêm feature. Phát hiện lỗi → log → chờ lệnh sửa → retest phần invalidated.

# PLAN-090 — Git và Production safety

- Không force-push/reset/archive mutation.
- Push chỉ khi đã xác minh không gây deploy/migration trái phép.
- Không tự apply Production migration/data fix/cutover.
- Không test tiền/kho/hóa đơn thật trên Production chỉ để tạo PASS.
- R0 audit Production chỉ read-only theo quyền được cấp.

---

# PLAN-R0 — Audit nguồn và dữ liệu

**Pack:** PLAN-CTX-R0  
**Mục tiêu:** biết chính xác hiện trạng trước khi thiết kế schema/migration.

Batches:
- `B-R0-A`: repository/instructions/deploy guard.
- `B-R0-B`: schema/security/data/invariant audit read-only.
- `B-R0-C`: migration map, workflow evidence, readiness/checkpoint.

Không code ứng dụng.

# PLAN-R1 — Foundation + prototype

**Pack:** PLAN-CTX-R1  
**Mục tiêu:** có prototype luồng đúng và nền kỹ thuật nhỏ đủ cho phase sau.

Batches:
- `B-R1-A`: runtime/local DB guard/test commands/code layout.
- `B-R1-B`: shell + component tối thiểu + prototype luồng.
- `B-R1-C`: exact money/quantity/error/validation/transaction/idempotency/audit.
- `B-R1-D`: logging/CI/checkpoint.

Không outbox runner, không generic repository/service framework, không domain schema sâu.

# PLAN-R2 — Identity & Access

**Pack:** PLAN-CTX-R2  
Batches:
- `B-R2-A`: employee/branch/customer identity + role/permission/membership.
- `B-R2-B`: AccessContext + server/DB/file enforcement.
- `B-R2-C`: login/admin UI + negative checks/checkpoint.

# PLAN-R3 — Catalog, CRM, pricing, credit substrate

**Pack:** PLAN-CTX-R3  
Batches:
- `B-R3-A`: material/UOM/resources/customer/site/supplier.
- `B-R3-B`: pricing + obligation core tối thiểu + credit commitment.
- `B-R3-C`: customer/supplier UI + local integrity/checkpoint.

R3 **không** implement Payment/Allocation/Advance/Reversal đầy đủ; chúng thuộc R7. Không cost-fact engine.

# PLAN-R4 — Sales

**Pack:** PLAN-CTX-R4  
Batches:
- `B-R4-A`: quotation/revision/send/accept/PDF.
- `B-R4-B`: SO direct/from quote + confirm credit.
- `B-R4-C`: sales UI/journey + checkpoint.

# PLAN-R5 — Purchasing & Sourcing

**Pack:** PLAN-CTX-R5  
Batches:
- `B-R5-A`: PO/purchase lines/price snapshot.
- `B-R5-B`: supply allocation 3 modes + supplier-direct linked drafts.
- `B-R5-C`: purchase UI + checkpoint.

# PLAN-R6 — Inventory & Delivery

**Pack:** PLAN-CTX-R6  
Batches:
- `B-R6-A`: movement/position/reservation/count/costing.
- `B-R6-B`: supplier receive + AP; delivery/assignment/proof/transit.
- `B-R6-C`: customer verify + AR/revenue/cost; supplier-direct verify; return/exception.
- `B-R6-D`: inventory/delivery UI + golden flow/checkpoint.

# PLAN-R7 — Finance & Dashboard

**Pack:** PLAN-CTX-R7  
Batches:
- `B-R7-A`: Payment/Allocation/Advance/Reversal + AR/AP UI.
- `B-R7-B`: expense/cash/reconciliation + profitability query.
- `B-R7-C`: Dashboard snapshot/filter/drawers.
- `B-R7-D`: measured query tuning + checkpoint.

# PLAN-R8 — Workforce, Service, Compensation

**Pack:** PLAN-CTX-R8  
Batches:
- `B-R8-A`: WorkItem/assignment/claim/result.
- `B-R8-B`: ServiceJob/WorkLog/verification → AR.
- `B-R8-C`: explicit compensation calculators/Earning/payable + UI/checkpoint.

Không rule DSL.

# PLAN-R9 — Worker & Customer Portals

**Pack:** PLAN-CTX-R9  
Batches:
- `B-R9-A`: worker shell/my work/result/offline recovery.
- `B-R9-B`: customer quote/order/delivery/debt/payment notice/docs.
- `B-R9-C`: isolation/revocation/shared-device/checkpoint.

# PLAN-R10 — Routing, GPS, Messaging

**Pack:** PLAN-CTX-R10  
Batches:
- `B-R10-A`: one map provider + route/manual fallback/apply.
- `B-R10-B`: foreground GPS current/history/retention.
- `B-R10-C`: conversation/message/unread/realtime + UI/checkpoint.

Không job runner chung chỉ vì R10 tồn tại.

# PLAN-R11 — Electronic Invoice

**Pack:** PLAN-CTX-R11  
Batches:
- `B-R11-A`: policy/provider confirmation + invoice domain/eligibility/draft.
- `B-R11-B`: first durable job mechanism + provider adapter/issue/reconcile.
- `B-R11-C`: document/adjustment/purchase registry/UI/checkpoint.

Đây là nơi mặc định đầu tiên được phép triển khai job/outbox nếu provider thực sự cần.

# PLAN-R12 — Migration, QA, Cutover

**Pack:** PLAN-CTX-R12  
Batches:
- `B-R12-A`: migration scripts/rehearsal/reconciliation.
- `B-R12-B`: release candidate security/accessibility/performance/UAT.
- `B-R12-C`: backup/recovery/write fence/approval.
- `B-R12-D`: cutover/post-reconcile/legacy read-only/closure.

Production mutation cần quyền riêng ngoài việc mở R12.

# KẾT THÚC plan.md
