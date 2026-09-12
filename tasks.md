# tasks.md — Backlog composite, chi tiết theo lát cắt thay vì 226 task nhỏ

> **Bộ tài liệu:** `HX-V2-DOCSET-4.2`  
> **Giao thức đồng bộ:** `SYNC-4.2`  
> **Mục tiêu:** mỗi task tạo một đầu ra có ý nghĩa, giảm context-switch; acceptance tách riêng.

# TASK-000 — Cách dùng

Không đọc toàn file. Đọc:
1. TASK-010;
2. index của phase;
3. đúng task đang làm;
4. context pack tương ứng trong plan.md.

Mỗi task có **đầu ra, bước làm, ranh giới, risk tag**. Không có DoD lặp từng task.

Risk tag ánh xạ sang PLAN-050. Checks được gom cuối batch khi có thể.


# TASK-005 — Gate nhẹ sau khi session đã khóa tài liệu

Đầu session mới phải hoàn tất `PLAN-LOCK-001`.

Sau đó mỗi task không đọc lại SPEC-DOC-001..010. Chỉ kiểm:

```text
DOC_LOCK=VALID
+
CTX_PACK_VALID
+
TASK_SCOPE_READ
+
SOURCE_SCOPE_RESOLVED
+
DEPENDENCIES_READY
```

Không đạt → không sửa source và ghi blocker đúng loại.

`Đầu ra`, `Làm`, `Không làm`, `Risk/check` là ranh giới bắt buộc. Không tự thêm refactor/future-proof/best-practice work.

Conformance đầy đủ được gom cuối batch theo `PLAN-LOCK-003`, không tạo log conformance lặp cho từng task nếu không có deviation.

# TASK-010 — Trạng thái hiện tại

```yaml
CURRENT_PHASE: R6
CURRENT_BATCH: NONE
CURRENT_TASK: NONE
NEXT_PHASE: R7
EXECUTION_STATUS: PHASE_IMPLEMENTED
AUTHORIZATION_SCOPE: GOAL_R0_TO_R12_BUILD_ONLY
DOC_LOCK: VALID
DOCSET_FINGERPRINT: GIT_TREE:cbe9de71d8dc3ea607f77d50e6f0d092afc52696
ACTIVE_CONTEXT_PACK: PLAN-CTX-BASE + PLAN-CTX-R6
DOC_CONFORMANCE: PASS_WITH_OWNER_OVERRIDE
WORK_MODE: BUILD_ONLY
ACCEPTANCE_STATUS: NOT_REQUESTED
ACCEPTANCE_SCOPE: NONE
DOCSET_REQUIRED: HX-V2-DOCSET-4.2
```

# TASK-020 — Trạng thái task

`LOCKED / TODO / IN_PROGRESS / IMPLEMENTED_LOCAL / IMPLEMENTED / BLOCKED`

`PHASE_IMPLEMENTED` chỉ dùng ở checkpoint phase. `ACCEPTED` thuộc nghiệm thu, không thay trạng thái code.

# TASK-030 — Index

| Phase | Task |
|---|---|

| R0 | R0-01, R0-02, R0-03, R0-04, R0-05, R0-06 |
| R1 | R1-01, R1-02, R1-03, R1-04, R1-05, R1-06, R1-07, R1-08 |
| R2 | R2-01, R2-02, R2-03, R2-04, R2-05, R2-06 |
| R3 | R3-01, R3-02, R3-03, R3-04, R3-05, R3-06, R3-07 |
| R4 | R4-01, R4-02, R4-03, R4-04, R4-05, R4-06 |
| R5 | R5-01, R5-02, R5-03, R5-04, R5-05 |
| R6 | R6-01, R6-02, R6-03, R6-04, R6-05, R6-06, R6-07, R6-08 |
| R7 | R7-01, R7-02, R7-03, R7-04, R7-05, R7-06, R7-07, R7-08 |
| R8 | R8-01, R8-02, R8-03, R8-04, R8-05, R8-06, R8-07 |
| R9 | R9-01, R9-02, R9-03, R9-04, R9-05, R9-06 |
| R10 | R10-01, R10-02, R10-03, R10-04, R10-05, R10-06 |
| R11 | R11-01, R11-02, R11-03, R11-04, R11-05, R11-06 |
| R12 | R12-01, R12-02, R12-03, R12-04, R12-05, R12-06, R12-07, R12-08 |

---

# TASK-PHASE-R0

**Context:** PLAN-CTX-R0.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R0-A | TASK-R0-01 |
| B-R0-B | TASK-R0-02, TASK-R0-03, TASK-R0-05 |
| B-R0-C | TASK-R0-04, TASK-R0-06 |

## TASK-R0-01 — Audit repository, chỉ dẫn và guard triển khai

**CTX:** PLAN-CTX-R0 · **Batch:** B-R0-A · **Cần:** USER_OPEN_R0

**Đầu ra:** Xác minh repo/branch/working tree, archive refs, chỉ dẫn agent và cơ chế push/deploy trước mọi checkpoint.

**Làm:**
1. Đọc branch/HEAD/working tree và refs archive/tag; không reset/checkout phá việc.
2. Đọc chỉ dẫn root/lồng áp dụng cho repo; ghi conflict với bộ tài liệu nếu có.
3. Xác minh push/CI có thể chạm Production hay không; chưa rõ thì khóa push.

**Không làm:** Không sửa source/hosting/DB; không in secret.

**Risk/check:** DOC.

## TASK-R0-02 — Inventory schema, quyền và Storage read-only

**CTX:** PLAN-CTX-R0 · **Batch:** B-R0-B · **Cần:** TASK-R0-01

**Đầu ra:** Bản đồ schema/migration/RLS/grants/views/functions/bucket hiện có với nguồn và giới hạn.

**Làm:**
1. Xác minh đúng project/host và quyền audit chỉ đọc.
2. Liệt kê schema/table/view/function/trigger/index/constraint/migration state.
3. Rà RLS/grants/function owner/direct API/Storage exposure theo actor.

**Không làm:** Không DDL/DML, không penetration test ngoài quyền.

**Risk/check:** DOC,SEC.

## TASK-R0-03 — Audit dữ liệu nghiệp vụ và invariant

**CTX:** PLAN-CTX-R0 · **Batch:** B-R0-B · **Cần:** TASK-R0-02

**Đầu ra:** Counts, active/history, số dư và sai lệch chính của customer/material/order/inventory/delivery/finance/workforce.

**Làm:**
1. Lấy thống kê/tổng hợp có giới hạn; không dump dữ liệu.
2. So liên kết/orphan/duplicate/state và các ledger/position có thể đối chiếu.
3. Phân biệt dữ liệu thật/demo và ghi mẫu ID đã che khi cần.

**Không làm:** Không sửa số dư/gộp khách/tái tính lịch sử.

**Risk/check:** DOC.

## TASK-R0-04 — Migration map và canonical writer

**CTX:** PLAN-CTX-R0 · **Batch:** B-R0-C · **Cần:** TASK-R0-03

**Đầu ra:** Mapping KEEP/TRANSFORM/RECALCULATE/ARCHIVE/DROP/MANUAL và nguồn ghi duy nhất.

**Làm:**
1. Gán classification từng dataset.
2. Xác định ID mapping, phép reconcile và legacy/V2 writer ở từng giai đoạn.
3. Ghi unknown/policy cần Owner quyết định.

**Không làm:** Không tạo schema/migration V2 thật.

**Risk/check:** DOC,MIG.

## TASK-R0-05 — Baseline hiệu năng read-only

**CTX:** PLAN-CTX-R0 · **Batch:** B-R0-B · **Cần:** TASK-R0-02,TASK-R0-03

**Đầu ra:** Một số read đại diện có điều kiện đo/giới hạn rõ; không ngoại suy p95.

**Làm:**
1. Chọn query an toàn đại diện cho list/tổng hợp hiện hữu.
2. Đo nhẹ hoặc lấy plan/statistics không gây tải.
3. Ghi dataset, thời điểm, hạn chế và query cần chú ý.

**Không làm:** Không load test Production.

**Risk/check:** DOC,PERF.

## TASK-R0-06 — Chốt workflow evidence và bàn giao R0

**CTX:** PLAN-CTX-R0 · **Batch:** B-R0-C · **Cần:** TASK-R0-01..05

**Đầu ra:** Readiness phân biệt DESIGN/SCHEMA, blocker rõ, implementation cập nhật và checkpoint an toàn.

**Làm:**
1. Tổng hợp bằng chứng đã có từ R0-01..05; không chạy lại repo/schema/data/performance queries nếu evidence còn VALID.
2. Map findings đã có tới readiness DESIGN/SCHEMA và core journey; chỉ lookup thêm khi thiếu một căn cứ quyết định thật.
3. Cập nhật tasks/implementation; commit/push chỉ khi guard đã rõ.

**Không làm:** Không mở R1, không gọi R0 ACCEPTED.

**Risk/check:** GATE,DOC.

---

# TASK-PHASE-R1

**Context:** PLAN-CTX-R1.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R1-A | TASK-R1-01, TASK-R1-02 |
| B-R1-B | TASK-R1-03, TASK-R1-04 |
| B-R1-C | TASK-R1-05, TASK-R1-06 |
| B-R1-D | TASK-R1-07, TASK-R1-08 |

## TASK-R1-01 — Bootstrap runtime, local DB guard và command map

**CTX:** PLAN-CTX-R1 · **Batch:** B-R1-A · **Cần:** TASK-R0-06

**Đầu ra:** Runtime/lockfile/lệnh dev-build-test cục bộ hoạt động, tuyệt đối không dùng Production secrets.

**Làm:**
1. Đọc package/config theo version thực; chọn một package manager.
2. Dựng local DB/test guard và command map tối thiểu.
3. Chỉ cài dependency được dùng ngay ở R1.

**Không làm:** Không scaffold toàn domain hoặc CI platform phức tạp.

**Risk/check:** BUILD,DB.

## TASK-R1-02 — Chốt cấu trúc mã nguyên khối theo mô-đun

**CTX:** PLAN-CTX-R1 · **Batch:** B-R1-A · **Cần:** TASK-R1-01

**Đầu ra:** Path registry cho module/shared/access/db; không layer ceremony.

**Làm:**
1. Tạo cấu trúc tối thiểu theo SPEC-ARCH-001/002.
2. Đăng ký vị trí command/query/test hiện tại trong implementation.
3. Giữ UI gần route/module nếu chưa có reuse thật.

**Không làm:** Không BaseService/IRepository/DI container/event bus.

**Risk/check:** DOC.

## TASK-R1-03 — Shell + token + component tối thiểu

**CTX:** PLAN-CTX-R1 · **Batch:** B-R1-B · **Cần:** TASK-R1-02

**Đầu ra:** Ba surface có shell đúng vai trò và primitive đủ cho prototype, không design system khổng lồ.

**Làm:**
1. Áp token/chữ/spacing/focus/error/disabled.
2. Tạo button/form/table/drawer/sheet chỉ khi prototype dùng.
3. Trang đích theo vai trò và menu theo UX-910.

**Không làm:** Không dark mode/theme builder/50 component dự phòng.

**Risk/check:** UI.

## TASK-R1-04 — Prototype các hành trình vận hành

**CTX:** PLAN-CTX-R1 · **Batch:** B-R1-B · **Cần:** TASK-R1-03

**Đầu ra:** Prototype dữ liệu giả có thể đi qua sales→sourcing→delivery→debt cùng các điểm nối worker/customer.

**Làm:**
1. Dùng fixture nhất quán và gắn nhãn MOCK.
2. Bảo toàn context, next action, lỗi/empty/loading/mobile.
3. Không nối database Production hoặc triển khai backend domain chỉ để demo.

**Không làm:** Không tự gọi prototype đã được user nghiệm thu.

**Risk/check:** UI,UNIT.

## TASK-R1-05 — Exact money, quantity, validation và error contract

**CTX:** PLAN-CTX-R1 · **Batch:** B-R1-C · **Cần:** TASK-R1-01

**Đầu ra:** Primitive chính xác nhỏ, serializable và dùng được cho phase sau.

**Làm:**
1. Money VND exact; decimal quantity/UOM conversion/rounding.
2. Validation/DTO exact; error code/trace id.
3. Unit case biên theo examples trong Spec.

**Không làm:** Không tạo numeric framework tổng quát cho mọi loại số.

**Risk/check:** UNIT.

## TASK-R1-06 — Transaction, idempotency và audit tối thiểu

**CTX:** PLAN-CTX-R1 · **Batch:** B-R1-C · **Cần:** TASK-R1-05,TASK-R1-02

**Đầu ra:** Helper nhỏ cho transaction và critical commands; audit nhạy cảm có actor/source.

**Làm:**
1. Một transaction wrapper theo DB thật.
2. Idempotency primitive chỉ cho command cần retry; same-key/different-payload conflict.
3. Audit helper không serialize nguyên entity/PII.

**Không làm:** Không operation framework cho mọi CRUD; không outbox/job runner.

**Risk/check:** DB,IDEM.

## TASK-R1-07 — Logging, CI/checkpoint tối thiểu

**CTX:** PLAN-CTX-R1 · **Batch:** B-R1-D · **Cần:** TASK-R1-01,TASK-R1-05,TASK-R1-06

**Đầu ra:** Typecheck/lint/test command thật và logging cần thiết; phase có thể bàn giao kỹ thuật.

**Làm:**
1. Log request/duration/error an toàn, không PII nhạy cảm.
2. CI/check scripts đơn giản theo repo; không matrix lớn.
3. Tổng hợp check invalidated, cập nhật implementation.

**Không làm:** Không full benchmark/load/UAT trong BUILD_ONLY.

**Risk/check:** BUILD,DOC.

## TASK-R1-08 — Bàn giao R1

**CTX:** PLAN-CTX-R1 · **Batch:** B-R1-D · **Cần:** TASK-R1-03,TASK-R1-04,TASK-R1-07

**Đầu ra:** R1 PHASE_IMPLEMENTED hoặc BLOCKED; UX acceptance vẫn riêng.

**Làm:**
1. Kiểm source path/doc sync và checks tối thiểu còn hiệu lực.
2. Ghi phần mock/chưa nghiệm thu rõ.
3. Checkpoint/push theo PLAN-090 và STOP.

**Không làm:** Không mở R2, không ACCEPT UX thay Owner.

**Risk/check:** GATE.

---

# TASK-PHASE-R2

**Context:** PLAN-CTX-R2.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R2-A | TASK-R2-01, TASK-R2-02 |
| B-R2-B | TASK-R2-03 |
| B-R2-C | TASK-R2-04, TASK-R2-05, TASK-R2-06 |

## TASK-R2-01 — Identity nền: employee, branch, customer identity

**CTX:** PLAN-CTX-R2 · **Batch:** B-R2-A · **Cần:** TASK-R1-08

**Đầu ra:** Các identity/FK tối thiểu cho internal và customer membership.

**Làm:**
1. Tạo Employee/Branch/access và Customer identity ổn định.
2. Liên kết auth identity, giữ actor lịch sử khi inactive.
3. Không thêm profile fields CRM của R3 ngoài tối thiểu cần FK.

**Không làm:** Không user table thứ hai cạnh auth provider.

**Risk/check:** DB,SEC.

## TASK-R2-02 — Role, permission và membership

**CTX:** PLAN-CTX-R2 · **Batch:** B-R2-A · **Cần:** TASK-R2-01

**Đầu ra:** Một active role/branch, permission action rõ, customer membership/receiver scope.

**Làm:**
1. Tạo Role/Permission/RolePermission và assignment branch.
2. Tạo customer membership roles giới hạn.
3. Unique/check ngăn cấu hình mâu thuẫn.

**Không làm:** Không role inheritance/ABAC expression engine.

**Risk/check:** DB,SEC.

## TASK-R2-03 — AccessContext + server/database enforcement

**CTX:** PLAN-CTX-R2 · **Batch:** B-R2-B · **Cần:** TASK-R2-02

**Đầu ra:** Mọi read/write nhạy cảm lấy actor/scope từ session+DB, không body.

**Làm:**
1. Resolve AccessContext active user/branch/role.
2. Guard server boundary; DB grants/RLS/safe functions theo đường access đã chọn.
3. Kiểm field-sensitive data không fetch nếu thiếu quyền.

**Không làm:** Không dùng privileged connection rồi giả RLS đã bảo vệ.

**Risk/check:** DB,SEC.

## TASK-R2-04 — Auth UX: login/invite/recovery/logout

**CTX:** PLAN-CTX-R2 · **Batch:** B-R2-C · **Cần:** TASK-R2-03

**Đầu ra:** Ba cổng dùng cùng identity backend, redirect/sessions an toàn.

**Làm:**
1. Login/logout/invite/recovery theo provider hỗ trợ thật.
2. Branch selection chỉ khi cần; shared device logout xóa cache nhạy cảm.
3. Revoked account bị chặn ở lần access nhạy cảm tiếp theo.

**Không làm:** Không tự viết OTP/auth protocol mới.

**Risk/check:** UI,SEC.

## TASK-R2-05 — UI quản trị quyền tối thiểu

**CTX:** PLAN-CTX-R2 · **Batch:** B-R2-C · **Cần:** TASK-R2-02,TASK-R2-03

**Đầu ra:** Owner quản nhân viên/branch/role mà không hiểu bảng kỹ thuật.

**Làm:**
1. Danh sách/detail đơn giản, action nguy hiểm rõ.
2. Không expose permission mà actor không được quản.
3. Audit thay đổi role/permission.

**Không làm:** Không permission builder kéo-thả.

**Risk/check:** UI,SEC.

## TASK-R2-06 — Negative access regression và checkpoint

**CTX:** PLAN-CTX-R2 · **Batch:** B-R2-C · **Cần:** TASK-R2-01..05

**Đầu ra:** Allow/deny/cross-scope/direct API/file/cache được kiểm ở boundary thật.

**Làm:**
1. Kiểm internal branch isolation và customer isolation.
2. Kiểm direct URL/API/function/Storage của phần đã có.
3. Cập nhật evidence và checkpoint.

**Không làm:** Không chỉ kiểm ẩn nút UI.

**Risk/check:** SEC,GATE.

---

# TASK-PHASE-R3

**Context:** PLAN-CTX-R3.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R3-A | TASK-R3-01, TASK-R3-02 |
| B-R3-B | TASK-R3-03, TASK-R3-04 |
| B-R3-C | TASK-R3-05, TASK-R3-06, TASK-R3-07 |

## TASK-R3-01 — Material, UOM và resource vận hành

**CTX:** PLAN-CTX-R3 · **Batch:** B-R3-A · **Cần:** TASK-R2-06

**Đầu ra:** Material/group/UOM/conversion + warehouse/vehicle/machine tối thiểu.

**Làm:**
1. Schema FK/check cho material/UOM và conversion theo material.
2. Warehouse/vehicle/machine chỉ fields đang dùng cho sourcing/delivery.
3. Không coi vehicle load là conversion chính xác.

**Không làm:** Không asset management tổng quát.

**Risk/check:** DB,UNIT.

## TASK-R3-02 — Customer/Site/Supplier đầy đủ

**CTX:** PLAN-CTX-R3 · **Batch:** B-R3-A · **Cần:** TASK-R3-01

**Đầu ra:** Mở rộng Customer identity, Site và Supplier/contact theo luồng bán/mua.

**Làm:**
1. Customer fields/owner/terms; Site address/receiver/constraints.
2. Supplier/contact tối thiểu.
3. Snapshot contract chuẩn bị cho transaction sau.

**Không làm:** Không CRM pipeline/marketing automation.

**Risk/check:** DB,SEC.

## TASK-R3-03 — Pricing theo khách/material/UOM

**CTX:** PLAN-CTX-R3 · **Batch:** B-R3-B · **Cần:** TASK-R3-01,TASK-R3-02

**Đầu ra:** Rule precedence/version/override và manual approved price.

**Làm:**
1. Schema rule theo effective period và source.
2. Resolve price deterministic theo precedence.
3. Snapshot helper giữ unit/conversion/price source.

**Không làm:** Không formula/rules DSL.

**Risk/check:** DB,UNIT.

## TASK-R3-04 — Obligation core tối thiểu + credit commitment

**CTX:** PLAN-CTX-R3 · **Batch:** B-R3-B · **Cần:** TASK-R3-02,TASK-R3-03

**Đầu ra:** Primitive receivable/payable entry và credit exposure đủ cho Sales/Delivery sau; chưa Payment.

**Làm:**
1. Tạo AR/AP obligation structures append-only tối thiểu với explicit source FKs/placeholder source seam an toàn.
2. Credit commitment theo customer; exposure query không double count.
3. Opening fixture/source riêng cho local tests.

**Không làm:** Không Payment/Allocation/Advance/Reversal, không general ledger.

**Risk/check:** DB,UNIT,RACE.

## TASK-R3-05 — Customer/Supplier operational UI

**CTX:** PLAN-CTX-R3 · **Batch:** B-R3-C · **Cần:** TASK-R3-02,TASK-R3-03

**Đầu ra:** Profile kiểu Sapo: site, price, transactions context; quick-create quay về form.

**Làm:**
1. Customer 360 read composition không shadow ledger.
2. CTA tạo đơn/báo giá/thu tiền chỉ hiện khi module/permission tương ứng sẵn.
3. Supplier detail liên kết PO/payable khi nguồn tồn tại.

**Không làm:** Không dashboard CRM riêng.

**Risk/check:** UI,SEC.

## TASK-R3-06 — Integrity/concurrency của pricing-credit

**CTX:** PLAN-CTX-R3 · **Batch:** B-R3-C · **Cần:** TASK-R3-03,TASK-R3-04

**Đầu ra:** Local DB chứng minh conversion/price snapshot/credit race không sai.

**Làm:**
1. Chạy DB checks với two-session cho credit commitment.
2. Test price rule version và old snapshot.
3. Không giả source Sales chưa tồn tại đã chạy end-to-end.

**Không làm:** Không mở Sales command sớm.

**Risk/check:** DB,RACE.

## TASK-R3-07 — Bàn giao R3

**CTX:** PLAN-CTX-R3 · **Batch:** B-R3-C · **Cần:** TASK-R3-01..06

**Đầu ra:** Master data + pricing + credit substrate sẵn cho Sales.

**Làm:**
1. Gom check invalidated.
2. Ghi limitation/payment chưa có.
3. Checkpoint và STOP.

**Không làm:** Không mở R4 tự động.

**Risk/check:** GATE.

---

# TASK-PHASE-R4

**Context:** PLAN-CTX-R4.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R4-A | TASK-R4-01, TASK-R4-02 |
| B-R4-B | TASK-R4-03, TASK-R4-04 |
| B-R4-C | TASK-R4-05, TASK-R4-06 |

## TASK-R4-01 — Quotation, revision và PDF

**CTX:** PLAN-CTX-R4 · **Batch:** B-R4-A · **Cần:** TASK-R3-07

**Đầu ra:** Quote draft/revision immutable sau send, PDF gắn đúng revision.

**Làm:**
1. Schema quote/revision/lines/snapshot.
2. Send/supersede/expire transitions; PDF artifact link.
3. Không edit SENT; new revision copy có trace.

**Không làm:** Không document engine tổng quát.

**Risk/check:** DB,IDEM.

## TASK-R4-02 — Accept quote qua portal hoặc ghi nhận ngoài hệ thống

**CTX:** PLAN-CTX-R4 · **Batch:** B-R4-A · **Cần:** TASK-R4-01

**Đầu ra:** Acceptance exact revision, audit kênh/người/thời gian, không tự confirm SO.

**Làm:**
1. Command accept idempotent và kiểm revision hiệu lực.
2. Portal path và internal record path dùng cùng domain command.
3. Evidence optional theo policy, không giả chữ ký điện tử.

**Không làm:** Không bắt khách có tài khoản.

**Risk/check:** DB,SEC,IDEM.

## TASK-R4-03 — Sales Order direct/from quote + state derived

**CTX:** PLAN-CTX-R4 · **Batch:** B-R4-B · **Cần:** TASK-R4-02

**Đầu ra:** SO snapshots, direct create và from-quote; fulfillment/payment derived.

**Làm:**
1. Tạo SO lines/snapshot.
2. From quote giữ exact revision; direct path reuse pricing/context.
3. Không tạo AR khi create/confirm.

**Không làm:** Không duplicate state table cho fulfillment/payment.

**Risk/check:** DB,UNIT.

## TASK-R4-04 — Confirm SO + credit race

**CTX:** PLAN-CTX-R4 · **Batch:** B-R4-B · **Cần:** TASK-R4-03,TASK-R3-04

**Đầu ra:** Confirm giữ credit commitment atomic; hai đơn không vượt limit.

**Làm:**
1. Validate customer/site/lines/snapshot/policy.
2. Lock customer credit position, create/reuse commitment.
3. Idempotent confirm và cancel release remaining commitment.

**Không làm:** Không khóa toàn bảng/customer khác.

**Risk/check:** DB,RACE,IDEM,SEC.

## TASK-R4-05 — Sales UI kiểu Sapo

**CTX:** PLAN-CTX-R4 · **Batch:** B-R4-C · **Cần:** TASK-R4-03,TASK-R4-04

**Đầu ra:** Một form nhận đơn, quote là nhánh, next action rõ.

**Làm:**
1. Implement list/create/detail và quick customer/site.
2. Carry context/price/UOM, giữ draft khi lỗi.
3. Detail action theo state, không module hopping.

**Không làm:** Không wizard dài cho đơn đơn giản.

**Risk/check:** UI,SEC.

## TASK-R4-06 — Bàn giao R4

**CTX:** PLAN-CTX-R4 · **Batch:** B-R4-C · **Cần:** TASK-R4-01..05

**Đầu ra:** Sales sẵn cho sourcing; acceptance end-to-end để QA riêng.

**Làm:**
1. Gom DB/IDEM/RACE/UI checks.
2. Ghi QA Sales NOT_REQUESTED.
3. Checkpoint và STOP.

**Không làm:** Không chạy full E2E nếu chưa được yêu cầu.

**Risk/check:** GATE.

---

# TASK-PHASE-R5

**Context:** PLAN-CTX-R5.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R5-A | TASK-R5-01 |
| B-R5-B | TASK-R5-02, TASK-R5-03 |
| B-R5-C | TASK-R5-04, TASK-R5-05 |

## TASK-R5-01 — Purchase Order và giá mua

**CTX:** PLAN-CTX-R5 · **Batch:** B-R5-A · **Cần:** TASK-R4-06

**Đầu ra:** PO/lines/price snapshot/destination tối thiểu.

**Làm:**
1. Schema PO/lines/supplier/address/dates/state.
2. Purchase price snapshot/version.
3. Confirm PO không tạo AP.

**Không làm:** Không procurement suite/approval engine tổng quát.

**Risk/check:** DB,UNIT.

## TASK-R5-02 — Supply allocation ba mode

**CTX:** PLAN-CTX-R5 · **Batch:** B-R5-B · **Cần:** TASK-R5-01

**Đầu ra:** Sales line có allocations WAREHOUSE/DIRECT/TO_WAREHOUSE, split không vượt need.

**Làm:**
1. Explicit FK tới SO line/PO line/warehouse.
2. Validate base quantity cùng UOM snapshot.
3. Version conflict khi chỉnh allocation.

**Không làm:** Không generic source registry.

**Risk/check:** DB,RACE.

## TASK-R5-03 — Supplier-direct linked drafts

**CTX:** PLAN-CTX-R5 · **Batch:** B-R5-B · **Cần:** TASK-R5-01,TASK-R5-02

**Đầu ra:** Từ SO tạo PO direct; từ PO có thể tạo linked SO draft mà không duplicate sale price.

**Làm:**
1. Điểm vào A reuse customer/site/line.
2. Điểm vào B tạo hai draft linked trong một use-case.
3. Retry không tạo PO/SO thứ hai.

**Không làm:** Không auto-confirm cả hai phía.

**Risk/check:** DB,IDEM.

## TASK-R5-04 — Purchase/Supplier UI hai điểm vào

**CTX:** PLAN-CTX-R5 · **Batch:** B-R5-C · **Cần:** TASK-R5-01..03

**Đầu ra:** Mua hàng thao tác không nhập lại dữ liệu đã biết.

**Làm:**
1. List/create/detail PO.
2. Direct destination mở customer/site/link SO context.
3. Supplier quick create quay lại form.

**Không làm:** Không copy toàn bộ sales form vào purchase.

**Risk/check:** UI,SEC.

## TASK-R5-05 — Bàn giao R5

**CTX:** PLAN-CTX-R5 · **Batch:** B-R5-C · **Cần:** TASK-R5-01..04

**Đầu ra:** Sourcing sẵn cho inventory/delivery.

**Làm:**
1. Gom DB/race/idempotency/UI checks.
2. Ghi phần receive/AP chưa thực hiện đến R6.
3. Checkpoint và STOP.

**Không làm:** Không mở R6 tự động.

**Risk/check:** GATE.

---

# TASK-PHASE-R6

**Context:** PLAN-CTX-R6.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R6-A | TASK-R6-01, TASK-R6-02 |
| B-R6-B | TASK-R6-03, TASK-R6-04 |
| B-R6-C | TASK-R6-05, TASK-R6-06, TASK-R6-07 |
| B-R6-D | TASK-R6-08 |

## TASK-R6-01 — Inventory movement, position và reservation

**CTX:** PLAN-CTX-R6 · **Batch:** B-R6-A · **Cần:** TASK-R5-05

**Đầu ra:** Ledger movement + position query + reservation/available đúng.

**Làm:**
1. Movement append-only với explicit source FK.
2. Position từ movement/custody, reservation tách on-hand.
3. Reserve/release/consume commands idempotent.

**Không làm:** Không editable balance hoặc event-store toàn app.

**Risk/check:** DB,IDEM,RACE.

## TASK-R6-02 — Stock count, adjustment và concurrency

**CTX:** PLAN-CTX-R6 · **Batch:** B-R6-A · **Cần:** TASK-R6-01

**Đầu ra:** Count cutoff/variance/approval/adjustment; race không oversubscribe.

**Làm:**
1. Count session và counted lines.
2. Adjustment tạo movement mới với reason/evidence.
3. Two-session reservation và count-vs-movement case.

**Không làm:** Không update on_hand trực tiếp.

**Risk/check:** DB,RACE,SEC.

## TASK-R6-03 — Costing + supplier receive to warehouse

**CTX:** PLAN-CTX-R6 · **Batch:** B-R6-B · **Cần:** TASK-R6-01,TASK-R5-01

**Đầu ra:** Nhận NCC vào kho tăng stock/cost basis và AP đúng một lần.

**Làm:**
1. Moving weighted average theo policy approved/fixture.
2. Receive command kiểm PO/quantity/UOM và tạo movement.
3. Tạo payable entry qua explicit receipt FK cùng transaction.

**Không làm:** Không coi PO confirm/invoice file là AP.

**Risk/check:** DB,IDEM.

## TASK-R6-04 — Delivery, assignment và private proof

**CTX:** PLAN-CTX-R6 · **Batch:** B-R6-B · **Cần:** TASK-R6-01,TASK-R5-02

**Đầu ra:** Delivery/lines/assignment version/proof link và state thực thi.

**Làm:**
1. Tạo Delivery từ sourced SO lines.
2. Assignment/replace có version và permission.
3. Evidence upload/finalize private; link object đã hợp lệ.

**Không làm:** Không WorkItem engine ở phase này.

**Risk/check:** DB,SEC.

## TASK-R6-05 — Handoff to transit + verify customer delivery

**CTX:** PLAN-CTX-R6 · **Batch:** B-R6-C · **Cần:** TASK-R6-03,TASK-R6-04

**Đầu ra:** Kho→đang giao→customer verify tạo AR/revenue/cost đúng một lần.

**Làm:**
1. Handoff giảm warehouse position, tăng transit, consume reservation.
2. Submit result tách verify.
3. verifyDelivery orchestration: delivery+inventory+AR/revenue/cost trong one transaction.

**Không làm:** Không trừ kho lần hai; không event bus giữa effects.

**Risk/check:** DB,IDEM,RACE,SEC.

## TASK-R6-06 — Supplier-direct verify độc lập hai phía

**CTX:** PLAN-CTX-R6 · **Batch:** B-R6-C · **Cần:** TASK-R5-03,TASK-R6-04

**Đầu ra:** Supplier verified quantity tạo AP; customer verified quantity tạo AR, không fake stock.

**Làm:**
1. Supplier fulfillment source + evidence/price/quantity.
2. Customer delivery result/verify riêng.
3. Sai khác giữ cả hai số và reconciliation case.

**Không làm:** Không ép supplier qty = customer billable qty.

**Risk/check:** DB,IDEM.

## TASK-R6-07 — Return, remainder, loss + operational UI

**CTX:** PLAN-CTX-R6 · **Batch:** B-R6-C · **Cần:** TASK-R6-05,TASK-R6-06

**Đầu ra:** Ngoại lệ xử lý bằng source-linked actions, UI không cho sửa ledger tổng.

**Làm:**
1. ReturnCase/remainder cancel/loss movement/AR delta theo quyền.
2. Inventory/delivery/dispatch screens + next actions.
3. Low-stock warning chỉ tạo link/draft gợi ý, không auto PO.

**Không làm:** Không workflow engine cho exception.

**Risk/check:** DB,UI,SEC.

## TASK-R6-08 — Golden flow và bàn giao R6

**CTX:** PLAN-CTX-R6 · **Batch:** B-R6-D · **Cần:** TASK-R6-01..07

**Đầu ra:** Hai luồng warehouse/direct đối chiếu đúng inventory/AR/AP/cost.

**Làm:**
1. Chạy examples relevant trên command/schema thật cục bộ.
2. Gom race/idempotency/security checks.
3. Checkpoint và ghi QA broader NOT_REQUESTED.

**Không làm:** Không benchmark/full UAT mặc định.

**Risk/check:** GATE,DB.

---

# TASK-PHASE-R7

**Context:** PLAN-CTX-R7.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R7-A | TASK-R7-01, TASK-R7-02 |
| B-R7-B | TASK-R7-03, TASK-R7-04 |
| B-R7-C | TASK-R7-05, TASK-R7-06 |
| B-R7-D | TASK-R7-07, TASK-R7-08 |

## TASK-R7-01 — Payment, allocation, advance và reversal

**CTX:** PLAN-CTX-R7 · **Batch:** B-R7-A · **Cần:** TASK-R6-08

**Đầu ra:** Finance write core hoàn chỉnh trên obligations đã có.

**Làm:**
1. Payment POSTED append-only.
2. Allocation many-to-many lock payment+target; advance/unallocated riêng.
3. Reversal tạo inverse effects, không delete history.

**Không làm:** Không general ledger pháp định.

**Risk/check:** DB,IDEM,RACE,SEC.

## TASK-R7-02 — AR/AP list, detail và source drill-down

**CTX:** PLAN-CTX-R7 · **Batch:** B-R7-A · **Cần:** TASK-R7-01

**Đầu ra:** Receivable/payable UI đọc cùng source/cutoff, action payment mang context.

**Làm:**
1. Queries current/as-of phù hợp.
2. List/detail/drawer exact source.
3. Không gọi AP là expense hoặc AR là revenue cash.

**Không làm:** Không shadow balance editable.

**Risk/check:** UI,DB,SEC.

## TASK-R7-03 — Expense, cash/bank và reconciliation

**CTX:** PLAN-CTX-R7 · **Batch:** B-R7-B · **Cần:** TASK-R7-01

**Đầu ra:** Operational expense + cash position + reconcile không post tiền lần hai.

**Làm:**
1. Expense source/category/approval.
2. Cash/bank read from posted transactions.
3. Reconcile states/matching/difference.

**Không làm:** Không full accounting chart-of-accounts engine.

**Risk/check:** DB,UI.

## TASK-R7-04 — Profitability query từ canonical sources

**CTX:** PLAN-CTX-R7 · **Batch:** B-R7-B · **Cần:** TASK-R6-08,TASK-R7-03

**Đầu ra:** Revenue/direct cost/Opex/profit không double count; incomplete rõ.

**Làm:**
1. Aggregate source grain trước join.
2. Use inventory issue/direct supplier/service/earning source costs.
3. Chỉ thêm normalized cost projection nếu query đo chứng minh cần.

**Không làm:** Không cost_fact ledger thứ hai mặc định.

**Risk/check:** DB,UNIT.

## TASK-R7-05 — Dashboard snapshot, filters và historical cutoff

**CTX:** PLAN-CTX-R7 · **Batch:** B-R7-C · **Cần:** TASK-R7-02,TASK-R7-04

**Đầu ra:** KPI/balances/top lists đúng period/as-of/quality/permission.

**Làm:**
1. Primary summary query + lazy top/detail.
2. Filter applicability/knowledge cutoff.
3. Field permission không leak qua derived values.

**Không làm:** Không một RPC khổng lồ nếu error isolation/benchmark không phù hợp.

**Risk/check:** DB,SEC,PERF.

## TASK-R7-06 — Finance UX: multi-order payment và exceptions

**CTX:** PLAN-CTX-R7 · **Batch:** B-R7-C · **Cần:** TASK-R7-01..05

**Đầu ra:** Luồng debt→payment→allocation và adjustments dễ dùng, giữ context.

**Làm:**
1. Payment form hiển thị nhận/phân bổ/dư.
2. Adjustment reason/evidence/delta.
3. Dashboard/customer/supplier drawers back/filter đúng.

**Không làm:** Không auto-allocation khi policy chưa duyệt.

**Risk/check:** UI,SEC.

## TASK-R7-07 — Measured query tuning

**CTX:** PLAN-CTX-R7 · **Batch:** B-R7-D · **Cần:** TASK-R7-05,TASK-R7-06

**Đầu ra:** Chỉ index/query optimization dựa trên số đo của hot paths.

**Làm:**
1. Đo duration/rows/payload/plan.
2. Fix N+1/index/query shape trước cache/projection.
3. Ghi p95 rộng NOT_RUN nếu chưa QA.

**Không làm:** Không cache framework/materialized view khi chưa cần.

**Risk/check:** PERF,DB.

## TASK-R7-08 — Bàn giao R7

**CTX:** PLAN-CTX-R7 · **Batch:** B-R7-D · **Cần:** TASK-R7-01..07

**Đầu ra:** Finance/dashboard PHASE_IMPLEMENTED; broader performance/UAT riêng.

**Làm:**
1. Gom critical DB/SEC/RACE checks.
2. Ghi salary/commission chưa nối R8 là INCOMPLETE.
3. Checkpoint và STOP.

**Không làm:** Không ACCEPT dashboard thay Owner.

**Risk/check:** GATE.

---

# TASK-PHASE-R8

**Context:** PLAN-CTX-R8.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R8-A | TASK-R8-01, TASK-R8-02 |
| B-R8-B | TASK-R8-03 |
| B-R8-C | TASK-R8-04, TASK-R8-05, TASK-R8-06, TASK-R8-07 |

## TASK-R8-01 — WorkItem assignment/claim nhỏ

**CTX:** PLAN-CTX-R8 · **Batch:** B-R8-A · **Cần:** TASK-R7-08

**Đầu ra:** WorkItem orchestration đủ direct/pool; source Delivery/ServiceJob vẫn authoritative.

**Làm:**
1. WorkItem readiness/source FK.
2. Direct assign và pool claim atomic/versioned.
3. Resource collision worker/vehicle theo scope thật.

**Không làm:** Không BPM/workflow engine.

**Risk/check:** DB,RACE,SEC.

## TASK-R8-02 — Worker result và verification

**CTX:** PLAN-CTX-R8 · **Batch:** B-R8-A · **Cần:** TASK-R8-01

**Đầu ra:** DONE/result không tự verify business source; offline stale version conflict.

**Làm:**
1. Submit actual/note/proof/receiver.
2. Verification command riêng theo source.
3. Lease/heartbeat chỉ monitoring, không tự phạt/hủy active work.

**Không làm:** Không suy GPS/heartbeat thành completion.

**Risk/check:** DB,IDEM.

## TASK-R8-03 — ServiceJob + WorkLog + billing verification

**CTX:** PLAN-CTX-R8 · **Batch:** B-R8-B · **Cần:** TASK-R8-01,TASK-R7-01

**Đầu ra:** Service flow tách actual/billable/compensable và tạo AR đúng source.

**Làm:**
1. ServiceJob schedule/resource.
2. WorkLog actual basis.
3. Verify service → billable amount/AR; material consumption nếu có qua inventory command.

**Không làm:** Không duplicate Delivery cho service không giao hàng.

**Risk/check:** DB,IDEM.

## TASK-R8-04 — Compensation calculators explicit

**CTX:** PLAN-CTX-R8 · **Batch:** B-R8-C · **Cần:** TASK-R8-02,TASK-R8-03

**Đầu ra:** Các basis đang dùng tính earning bằng calculator tường minh/versioned.

**Làm:**
1. Implement only basis hiện scope: monthly/job/trip/hour/day/quantity/bonus/adjustment/commission theo nhu cầu thật.
2. Rule effective/version/employee scope.
3. Không dynamic expression/JSON formula interpreter.

**Không làm:** Không rules DSL.

**Risk/check:** UNIT,DB.

## TASK-R8-05 — Earning, payable và finance integration

**CTX:** PLAN-CTX-R8 · **Batch:** B-R8-C · **Cần:** TASK-R8-04,TASK-R7-03

**Đầu ra:** Verified basis → EarningEvent → approval → payable; payment chỉ tất toán.

**Làm:**
1. Unique source earning.
2. Direct labor/Opex/commission classification một lần.
3. Dashboard salary/commission reads approved outstanding.

**Không làm:** Không tính lại earning đã paid bằng UPDATE.

**Risk/check:** DB,IDEM.

## TASK-R8-06 — Workforce/Service/Compensation UI

**CTX:** PLAN-CTX-R8 · **Batch:** B-R8-C · **Cần:** TASK-R8-01..05

**Đầu ra:** Office UI theo source, worker-specific views chuẩn bị cho portal.

**Làm:**
1. Lists/detail/approval actions.
2. ServiceJob shows actual/billable/compensable separately.
3. Compensation detail trace source/rule/payment.

**Không làm:** Không expose payroll theo role không phù hợp.

**Risk/check:** UI,SEC.

## TASK-R8-07 — Bàn giao R8

**CTX:** PLAN-CTX-R8 · **Batch:** B-R8-C · **Cần:** TASK-R8-01..06

**Đầu ra:** Work/service/earning PHASE_IMPLEMENTED.

**Làm:**
1. Gom DB/race/security checks.
2. Ghi policy payroll/commission chưa approved nếu còn.
3. Checkpoint và STOP.

**Không làm:** Không mở portal tự động.

**Risk/check:** GATE.

---

# TASK-PHASE-R9

**Context:** PLAN-CTX-R9.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R9-A | TASK-R9-01, TASK-R9-02 |
| B-R9-B | TASK-R9-03, TASK-R9-04 |
| B-R9-C | TASK-R9-05, TASK-R9-06 |

## TASK-R9-01 — Worker portal: my work và job detail

**CTX:** PLAN-CTX-R9 · **Batch:** B-R9-A · **Cần:** TASK-R8-07

**Đầu ra:** Mobile worker sees current/next/pool and safe actions.

**Làm:**
1. Shell/login context.
2. My work/pool/job detail with address/receiver/quantity.
3. Large touch targets, no driving interaction requirement.

**Không làm:** Không desktop ERP thu nhỏ.

**Risk/check:** UI,SEC.

## TASK-R9-02 — Worker result, proof và weak-network recovery

**CTX:** PLAN-CTX-R9 · **Batch:** B-R9-A · **Cần:** TASK-R9-01,TASK-R8-02

**Đầu ra:** Draft/result survives network issues without duplicate command.

**Làm:**
1. Local unsent draft only non-sensitive fields.
2. Upload retry separate from committed command.
3. operation unknown/reconnect uses same key/version.

**Không làm:** Không offline post money/stock/credentials.

**Risk/check:** UI,IDEM,SEC.

## TASK-R9-03 — Customer portal quote/order/delivery

**CTX:** PLAN-CTX-R9 · **Batch:** B-R9-B · **Cần:** TASK-R4-06,TASK-R6-08,TASK-R2-06

**Đầu ra:** Customer membership sees only own quote/order/delivery and can respond safely.

**Làm:**
1. Quote exact revision accept/request change.
2. Order/delivery timeline customer-safe.
3. Receiver role limited to delivery context.

**Không làm:** Không expose internal cost/supplier/payroll.

**Risk/check:** UI,SEC.

## TASK-R9-04 — Customer debt, PaymentNotice và documents

**CTX:** PLAN-CTX-R9 · **Batch:** B-R9-B · **Cần:** TASK-R7-08,TASK-R9-03

**Đầu ra:** Customer sees recorded debt and may submit evidence without reducing debt.

**Làm:**
1. Debt/due items from finance read.
2. PaymentNotice with evidence/status review.
3. Private document signed access and audience.

**Không làm:** Không gọi notice là Payment POSTED.

**Risk/check:** UI,DB,SEC,IDEM.

## TASK-R9-05 — Isolation, revoke và shared-device

**CTX:** PLAN-CTX-R9 · **Batch:** B-R9-C · **Cần:** TASK-R9-01..04

**Đầu ra:** Revoked worker/customer loses new access; cache/session safe.

**Làm:**
1. Direct URL/API/file cross-scope negative tests.
2. Logout clears sensitive client cache.
3. Stale membership/assignment responses conflict.

**Không làm:** Không dựa vào JWT stale hoặc CSS hide.

**Risk/check:** SEC,DB.

## TASK-R9-06 — Bàn giao R9

**CTX:** PLAN-CTX-R9 · **Batch:** B-R9-C · **Cần:** TASK-R9-01..05

**Đầu ra:** Portals PHASE_IMPLEMENTED; human usability QA separate.

**Làm:**
1. Gom UI/SEC/IDEM checks.
2. Ghi user review NOT_REQUESTED.
3. Checkpoint và STOP.

**Không làm:** Không tự ACCEPT portals.

**Risk/check:** GATE.

---

# TASK-PHASE-R10

**Context:** PLAN-CTX-R10.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R10-A | TASK-R10-01, TASK-R10-02 |
| B-R10-B | TASK-R10-03 |
| B-R10-C | TASK-R10-04, TASK-R10-06 |
| B-R10-A/B/C | TASK-R10-05 |

## TASK-R10-01 — Route provider + manual fallback

**CTX:** PLAN-CTX-R10 · **Batch:** B-R10-A · **Cần:** TASK-R9-06

**Đầu ra:** Một provider khoảng cách/route hẹp, fallback thủ công khi lỗi.

**Làm:**
1. Adapter một provider được chọn khi task chạy.
2. RoutePlan input departure/time window/capacity/service time.
3. Provider timeout/unavailable returns actionable fallback.

**Không làm:** Không multi-provider abstraction/optimizer framework.

**Risk/check:** UNIT,EXT.

## TASK-R10-02 — Route apply và stale assignment protection

**CTX:** PLAN-CTX-R10 · **Batch:** B-R10-A · **Cần:** TASK-R10-01,TASK-R6-04

**Đầu ra:** Route recommendation không mutate assignment tới Apply; stale version conflict.

**Làm:**
1. Persist plan/stops/version.
2. Apply rechecks delivery readiness/assignment under lock.
3. Manual reordering uses same command.

**Không làm:** Không tự claim WorkItem.

**Risk/check:** DB,RACE,IDEM.

## TASK-R10-03 — GPS foreground current/history

**CTX:** PLAN-CTX-R10 · **Batch:** B-R10-B · **Cần:** TASK-R9-01,TASK-R6-04

**Đầu ra:** Tracking only active assignment + consent foreground; old packet not overwrite.

**Làm:**
1. Session/version/sequence/freshness.
2. Current position query + bounded history/retention.
3. Revoke stops new accepted telemetry.

**Không làm:** Không background 24/7 tracking.

**Risk/check:** DB,SEC.

## TASK-R10-04 — Messaging DB source + realtime signal

**CTX:** PLAN-CTX-R10 · **Batch:** B-R10-C · **Cần:** TASK-R9-05

**Đầu ra:** Conversation/message/unread in DB; realtime only refresh signal.

**Làm:**
1. Audience internal/customer explicit.
2. Message send idempotent when retryable.
3. Reconnect reads DB, unread projection simple.

**Không làm:** Không chat-driven business commands.

**Risk/check:** DB,IDEM,SEC.

## TASK-R10-05 — Routing/tracking/chat UI

**CTX:** PLAN-CTX-R10 · **Batch:** B-R10-A/B/C · **Cần:** TASK-R10-01..04

**Đầu ra:** Dispatch can plan/apply/track; messages context-aware without extra workflow.

**Làm:**
1. Route screen warnings/manual order/apply.
2. Tracking stale/freshness labels.
3. Conversation list/detail with audience.

**Không làm:** Không custom map platform.

**Risk/check:** UI,SEC.

## TASK-R10-06 — Bàn giao R10

**CTX:** PLAN-CTX-R10 · **Batch:** B-R10-C · **Cần:** TASK-R10-01..05

**Đầu ra:** Route/GPS/chat PHASE_IMPLEMENTED; provider/perf QA separate.

**Làm:**
1. Gom affected DB/SEC/provider checks.
2. Không tạo job runner nếu chưa cần.
3. Checkpoint và STOP.

**Không làm:** Không benchmark rộng mặc định.

**Risk/check:** GATE.

---

# TASK-PHASE-R11

**Context:** PLAN-CTX-R11.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R11-A | TASK-R11-01, TASK-R11-02 |
| B-R11-B | TASK-R11-03, TASK-R11-04 |
| B-R11-C | TASK-R11-05, TASK-R11-06 |

## TASK-R11-01 — Chốt policy/provider hóa đơn

**CTX:** PLAN-CTX-R11 · **Batch:** B-R11-A · **Cần:** TASK-R10-06

**Đầu ra:** Provider/type/timing/signing xác nhận hoặc task bị HUMAN_ACTION_REQUIRED.

**Làm:**
1. Ghi quyết định Owner/người phụ trách và capability provider.
2. Phân biệt sandbox/Production credentials.
3. Không hardcode luật thuế từ V1.

**Không làm:** Không gọi provider thật khi chưa được duyệt.

**Risk/check:** DOC.

## TASK-R11-02 — Invoice domain, coverage, draft và approval

**CTX:** PLAN-CTX-R11 · **Batch:** B-R11-A · **Cần:** TASK-R11-01,TASK-R7-08

**Đầu ra:** Invoice intent/coverage/status tách AR; draft/approval exact source.

**Làm:**
1. Schema invoice/lines/coverage/status.
2. Eligibility from billable sources.
3. Approval specific issue attempt.

**Không làm:** Không tạo AR/revenue lần hai.

**Risk/check:** DB,SEC.

## TASK-R11-03 — Durable job mechanism đầu tiên

**CTX:** PLAN-CTX-R11 · **Batch:** B-R11-B · **Cần:** TASK-R11-02

**Đầu ra:** Một job/outbox runner tối thiểu cho issue/reconcile, reuse về sau.

**Làm:**
1. Job table + lease/attempt/backoff/dedupe.
2. Intent transaction then runner external call.
3. Crash/reclaim semantics.

**Không làm:** Không queue platform/plugin system.

**Risk/check:** DB,IDEM,RACE.

## TASK-R11-04 — Provider adapter issue/reconcile

**CTX:** PLAN-CTX-R11 · **Batch:** B-R11-B · **Cần:** TASK-R11-01..03

**Đầu ra:** Issue idempotent, timeout UNKNOWN, callback/reconcile không duplicate.

**Làm:**
1. Adapter one provider.
2. Persist provider ref/status safely.
3. Timeout/query/retry same intent; duplicate callback safe.

**Không làm:** Không external call trong DB transaction.

**Risk/check:** EXT,IDEM,RACE,SEC.

## TASK-R11-05 — Invoice documents, adjustment, purchase registry và UI

**CTX:** PLAN-CTX-R11 · **Batch:** B-R11-C · **Cần:** TASK-R11-04

**Đầu ra:** Legal documents stored/accessed safely; correction history; UI prevents double issue.

**Làm:**
1. Document private storage/access.
2. Adjustment/replacement link old/new.
3. Purchase invoice registry links PO/AP without creating second AP; admin UI.

**Không làm:** Không tax filing automation.

**Risk/check:** DB,UI,SEC.

## TASK-R11-06 — Bàn giao R11

**CTX:** PLAN-CTX-R11 · **Batch:** B-R11-C · **Cần:** TASK-R11-01..05

**Đầu ra:** Invoice PHASE_IMPLEMENTED trong capability thật/sandbox đã có.

**Làm:**
1. Gom provider/idempotency/security checks.
2. Nếu provider chưa có, ghi partial/blocker rõ.
3. Checkpoint và STOP.

**Không làm:** Không gọi mock là integration accepted.

**Risk/check:** GATE.

---

# TASK-PHASE-R12

**Context:** PLAN-CTX-R12.  **Mặc định:** LOCKED.

| Batch | Task |
|---|---|
| B-R12-A | TASK-R12-01, TASK-R12-02 |
| B-R12-B | TASK-R12-03 |
| B-R12-C | TASK-R12-04, TASK-R12-05 |
| B-R12-D | TASK-R12-06, TASK-R12-07, TASK-R12-08 |

## TASK-R12-01 — Migration scripts từ mapping R0

**CTX:** PLAN-CTX-R12 · **Batch:** B-R12-A · **Cần:** TASK-R11-06

**Đầu ra:** Scripts deterministic, id mapping, transformations không rewrite history.

**Làm:**
1. Implement datasets theo classification.
2. Preserve snapshot/source IDs/audit mapping.
3. No direct Production execution.

**Không làm:** Không sửa legacy history mù.

**Risk/check:** MIG,DB.

## TASK-R12-02 — Rehearsal + reconciliation

**CTX:** PLAN-CTX-R12 · **Batch:** B-R12-A · **Cần:** TASK-R12-01

**Đầu ra:** Local anonymized copy migration và reconcile counts/quantities/open balances.

**Làm:**
1. Dry run clean copy.
2. Compare customer/material/inventory/AR/AP/payment/active docs/earnings.
3. Log mismatches and fix scripts, not source data silently.

**Không làm:** Không upload PII backup vào Git.

**Risk/check:** MIG,DB.

## TASK-R12-03 — Release-candidate QA

**CTX:** PLAN-CTX-R12 · **Batch:** B-R12-B · **Cần:** TASK-R12-02

**Đầu ra:** Đúng build được kiểm security/accessibility/performance/UAT theo acceptance.

**Làm:**
1. Freeze candidate tree.
2. Run acceptance scope required for release.
3. Classify PASS/PARTIAL/FAIL/BLOCKED with evidence.

**Không làm:** Không biến vài happy paths thành smoke PASS.

**Risk/check:** QA,SEC,PERF.

## TASK-R12-04 — Backup, recovery và write fence

**CTX:** PLAN-CTX-R12 · **Batch:** B-R12-C · **Cần:** TASK-R12-02

**Đầu ra:** Runbook backup/forward-fix/compensation và cutover write fence rõ.

**Làm:**
1. Verify backup/export usable.
2. Define writer switch and rollback limits by effect.
3. Check deploy/config secrets without exposing values.

**Không làm:** Không hứa rollback external invoice/payment bằng app rollback.

**Risk/check:** MIG,SEC.

## TASK-R12-05 — Owner approval exact candidate

**CTX:** PLAN-CTX-R12 · **Batch:** B-R12-C · **Cần:** TASK-R12-03,TASK-R12-04

**Đầu ra:** Owner approves exact SHA, migration list, data scope và cutover window.

**Làm:**
1. Present unresolved issues/limitations.
2. Record explicit authorization.
3. Production mutation remains locked until approval.

**Không làm:** Không self-approve.

**Risk/check:** DOC.

## TASK-R12-06 — Cutover được duyệt

**CTX:** PLAN-CTX-R12 · **Batch:** B-R12-D · **Cần:** TASK-R12-05

**Đầu ra:** Apply exact approved migration/data plan and deploy candidate.

**Làm:**
1. Recheck exact SHA/config/write fence.
2. Execute only approved operations in order.
3. Capture deployment/migration IDs and errors.

**Không làm:** Không improvise Production fix ngoài runbook.

**Risk/check:** MIG,GATE.

## TASK-R12-07 — Post-cutover reconcile

**CTX:** PLAN-CTX-R12 · **Batch:** B-R12-D · **Cần:** TASK-R12-06

**Đầu ra:** Verify critical reads/rights/balances and reconcile final delta without smoke suite.

**Làm:**
1. Use existing acceptance cases safe for Production/read-only or Owner-approved writes.
2. Reconcile counts/open balances/inventory/source links.
3. If mismatch, stop writer/forward-fix per runbook.

**Không làm:** Không tạo fake customer/order/payment just to test.

**Risk/check:** MIG,SEC.

## TASK-R12-08 — Legacy read-only và closure

**CTX:** PLAN-CTX-R12 · **Batch:** B-R12-D · **Cần:** TASK-R12-07

**Đầu ra:** V1 writer off, V1 retained read-only, final evidence complete.

**Làm:**
1. Confirm canonical writer V2.
2. Preserve archive/legacy references.
3. Update implementation/release record; close only accepted scope.

**Không làm:** Không drop legacy as part of closure.

**Risk/check:** GATE,DOC.

---


# TASK-890 — Không lặp audit/reasoning giữa các task

Không tự kích hoạt lại:
- R0 repository/schema/data/security/performance audit;
- architecture audit;
- UX reference research;
- full permission audit;
- full test suite;
- full repo scan.

Chỉ re-run khi có invalidation trigger ở PLAN-015 hoặc task ghi rõ cần bằng chứng mới.

Nếu task cần thông tin đã có:
1. đọc registry/evidence ref;
2. xác nhận còn VALID;
3. reuse;
4. chỉ query lại phần thiếu.

Không biến “verify” thành “audit lại từ đầu”.


# TASK-900 — Policy/human gates

Các policy ở SPEC-PRODUCT-005 mặc định `PENDING_OWNER_REVIEW`. Task được code với fixture đề xuất khi không tạo hậu quả thật; command/Production behavior chịu policy đó giữ khóa đến khi được duyệt.

Provider/credential/user-review cũng là external gate, không task tự hoàn tất.

# TASK-910 — Nghiệm thu

BUILD_ONLY không đọc acceptance.md. Khi Owner yêu cầu QA, cập nhật:
- `WORK_MODE: QA_ONLY`
- `ACCEPTANCE_STATUS`
- `ACCEPTANCE_SCOPE`

Không tạo task lập trình mới cho mỗi acceptance case.

# KẾT THÚC tasks.md
