# NGHIỆM THU ĐỘC LẬP HIỀN XA

Ngày kiểm định: 30/09/2026. Đây là báo cáo kiểm tra, không phải biên bản nghiệm thu của Owner và không cấp quyền release.

## 1. Kết luận

**CHƯA ĐẠT để xác nhận toàn hệ thống sẵn sàng sử dụng chính thức.**

- Hai lỗi ứng dụng đã tái hiện: lịch giao phụ thuộc múi giờ máy chủ, bộ lọc khách hàng Dashboard bỏ sót khách ngoài tập đầu tiên.
- Các mẫu thu tiền, đảo phiếu, nhận hàng, AP và tồn kho được kiểm tra bên dưới cho kết quả đúng. Không phát hiện sai tiền, ghi nhận trùng hoặc vượt quyền trong những ca này; điều đó không xác nhận tất cả các trường hợp tiền/kho/quyền đã đạt.
- Bộ UAT kỹ thuật của repository vẫn exit 1 vì lỗi fixture thu hồi quyền. Kiểm tra độc lập bằng grant hiện hành đã chứng minh máy chủ từ chối phiên Sales bị thu hồi; không đánh đồng lỗi fixture với lỗi bảo mật ứng dụng.
- Ledger migration QA có một version ngoài ứng viên. Chưa chứng minh khả năng dựng lại đúng backend đã thử từ riêng repository.
- Các luồng trả hàng/hoàn tiền, race thực tế, nhiều biến thể nghiệp vụ, provider và khôi phục managed chưa có đủ bằng chứng mới. Không dùng kết quả cũ để biến chúng thành PASS.

Mức sẵn sàng: có thể tiếp tục thử nghiệm có kiểm soát trên QA; **chưa đủ cơ sở ký nghiệm thu toàn hệ thống hoặc chốt release Production**.

## 2. Phiên bản và môi trường

| Thuộc tính | Giá trị đã kiểm tra |
|---|---|
| Repository | `git@github.com:MutAquaticStudio/HienXaERPv2.git` |
| Checkout gốc | `/Users/nox/Downloads/HienXaERP` |
| Nhánh tại thời điểm khóa | `codex/uat-role-navigation-20260923` |
| HEAD | `79b0b918c7430bfd0e9d17e247ecba2be1fa0bf2` |
| Working tree tại thời điểm khóa | 89 mục modified/untracked; không phải HEAD sạch |
| Thời điểm snapshot | `2026-09-30T11:06:43.754Z` |
| Snapshot thực sự được build/test | `/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/source` |
| Fingerprint đầu vào | `cf6d8c0b68d3e27a09ad84a20b1282f093e7f36e13dd7bae62c316a6ec8ba8ac` |
| Phạm vi fingerprint | 330 file, 3.074.783 byte; source/docs/config được sao chép, gồm phần chưa commit |
| Next build ID | `C_2S3aaYqi4TQxYbwJjom` |
| Runtime A | `http://127.0.0.1:4012`, timezone máy Việt Nam |
| Runtime B | `http://127.0.0.1:4013`, cùng build, `TZ=UTC` |
| Backend được thao tác thử | Supabase QA `ffrwiglcrlumfvhubaxg` |
| Production | Không test nghiệp vụ, không DML, migration, cấu hình hay deploy |
| Hóa đơn bên ngoài | Endpoint môi trường xác nhận `einvoiceEnabled=false` |
| Migration ứng viên / QA | 65 / 66; version QA bổ sung `20260930101520` |

Endpoint `/api/qa/environment` trả đúng QA project và fingerprint được cấp cho runtime kiểm định. `HX_QA_BUILD_SHA` ở đây là fingerprint audit, **không phải chứng cứ về SHA một deployment Vercel**. Build ID cũng không phải checksum toàn bộ binary/dependencies.

Danh sách file/hash và trạng thái chưa commit: [manifest.json](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/manifest.json). Diff tracked: [changes.diff](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/changes.diff). File untracked được liệt kê/hash trong manifest; không nằm trong tracked diff.

Các thay đổi chưa commit đáng chú ý thuộc form Sales/PO, delivery/cancel, finance/payment, inventory, quyền/portal, Dashboard/reports/export/PDF, auth recovery, test QA, tài liệu và 14 migration untracked. Có tài liệu trùng tên dạng `(1).md`, `qa/` và `tmp/`; chúng không được dùng để ghi đè bộ canonical. Không coi riêng HEAD này là ứng viên đã kiểm tra.

Không giành quyền sửa checkout gốc hoặc dừng server của phiên khác. Snapshot cô lập source; Supabase QA vẫn là môi trường managed đang tồn tại, không phải database riêng mới tạo cho audit. Kết quả backend gắn với trạng thái QA đã quan sát, không bảo đảm một phiên khác không thay đổi QA về sau.

Dependencies có sẵn được clone bằng APFS vào snapshot sau khi wrapper pnpm từ chối symlink. Không tải/cài thêm dependency. File build/typegen phát sinh trong snapshot, không trong checkout gốc. Báo cáo này là file mới được thêm vào checkout gốc.

## 3. Contract và cách phân loại

Authority dùng cho kiểm định: yêu cầu audit mới nhất của Owner, [Spec.md](/Users/nox/Downloads/HienXaERP/Spec.md), [UXUI.md](/Users/nox/Downloads/HienXaERP/UXUI.md), [plan.md](/Users/nox/Downloads/HienXaERP/plan.md), [tasks.md](/Users/nox/Downloads/HienXaERP/tasks.md), [implementation.md](/Users/nox/Downloads/HienXaERP/implementation.md), rồi source/schema để xác minh thực thi.

Năm file canonical thuộc `HX-V2-DOCSET-4.4 / SYNC-4.4`. [acceptance.md](/Users/nox/Downloads/HienXaERP/acceptance.md) vẫn mang header `4.2`, nên không tự coi coverage của file đó là chứng nhận đồng bộ toàn bộ 4.4. Trạng thái task đọc được: R12, R12-06, IN_PROGRESS.

Các bất biến được dùng: DRAFT có thể sửa; xác nhận SO không tự tạo AR; xác nhận PO không tự tạo AP; reservation không phải giảm on-hand; NCC giao thẳng không tạo kho giả; actual/accepted/billable theo từng dòng; Worker hoàn thành không đồng nghĩa đã verify; payment notice không phải posted payment; thu tiền/hóa đơn không tự tạo thêm doanh thu; phân quyền máy chủ và customer-safe boundary; retry không nhân đôi tác động.

Không tự đặt hệ số quy đổi hoặc thêm yêu cầu giảm giá/thuế/phí vào form không có chức năng đó. Mẫu tiền dưới đây kiểm tra giá snapshot và làm tròn đang có; không thay cho kiểm tra thuế/provider hoặc phí dịch vụ riêng. Không xem thiếu report builder, chat-driven command hoặc background GPS 24/7 là lỗi.

`PASS` chỉ áp dụng ca và điều kiện được ghi rõ. `PARTIAL` nghĩa là có ca con PASS nhưng chưa đủ toàn bộ luồng. `FAIL` có quan sát cụ thể. `NOT_RUN` không có bằng chứng thực thi mới. `BLOCKED` có ranh giới an toàn/môi trường cụ thể. Không tạo lớp smoke test riêng.

## 4. Lỗi ứng dụng đã tái hiện

### HX-AUD-01 — P1 — Lịch giao lệch 7 giờ trên máy chủ UTC

Vai trò bị ảnh hưởng: người điều hành/phân giao và người nhận lịch giao. Đây là lỗi dữ liệu thời gian, không chỉ định dạng nhãn.

Vị trí: [form lịch giao](/Users/nox/Downloads/HienXaERP/src/app/admin/orders/[id]/page.tsx:60), [parse thời điểm](/Users/nox/Downloads/HienXaERP/src/modules/delivery/actions.ts:101), [chuyển ISO gửi RPC](/Users/nox/Downloads/HienXaERP/src/modules/delivery/actions.ts:103).

Yêu cầu/kỳ vọng: thời điểm người dùng nhập trong form giờ địa phương phải được lưu nhất quán với quy ước giờ Việt Nam của ứng dụng, không thay đổi theo timezone của máy chủ. Không bổ sung chức năng mới.

1. Đăng nhập Owner QA trên cùng build chạy `TZ=UTC`, mở SO-2026-000017.
2. Nhập 1 đơn vị cho mỗi allocation của hai dòng và lịch `2026-10-01T08:30`.
3. Tạo phiếu giao. Phiếu mới là DL-2026-000014, hai dòng đã lưu đúng.
4. Đối chiếu `deliveries.scheduled_at` và mở cùng phiếu trên runtime Việt Nam.

Kỳ vọng: `2026-10-01T01:30:00.000Z`, hiển thị 08:30 Việt Nam. Thực tế: DB lưu `2026-10-01T08:30:00.000Z`; runtime Việt Nam hiển thị **15:30**. Runtime UTC hiển thị 08:30, che khuất sai lệch. Vì vậy test trên máy Việt Nam đơn độc có thể bỏ lọt lỗi.

Bằng chứng: [UI → DB](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/delivery-ui-db.json), [phép tái hiện parser](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/delivery-timezone.json), [ảnh lịch giao](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/delivery-timezone-ui.jpg).

Hướng sửa tối thiểu: dùng quy ước parse business time thống nhất đã có tại [business-time.ts](/Users/nox/Downloads/HienXaERP/src/lib/core/business-time.ts), kiểm tra input và chuẩn hóa UTC trước RPC. Rerun ca trên cả UTC và Việt Nam; kiểm tra các datetime-local liên quan, không tự sửa giờ của dữ liệu thật.

### HX-AUD-02 — P2 — Dashboard không chọn được khách ngoài 200 bản ghi đầu

Vai trò bị ảnh hưởng: người có quyền xem Dashboard tại chi nhánh nhiều khách. Phạm vi: khả năng chọn bộ lọc qua UI, không phải khẳng định SQL tổng hợp sai toàn bộ.

Vị trí: [query khách giới hạn 200](/Users/nox/Downloads/HienXaERP/src/app/admin/page.tsx:68), [select bộ lọc](/Users/nox/Downloads/HienXaERP/src/app/admin/page.tsx:73). Contract liên quan: `SPEC-DASH-004`, UX bộ lọc/drill-down và recovery; bounded query không được biến thành tập khách không thể truy cập.

1. Mở Dashboard Owner QA ở branch A có hơn 5.000 khách.
2. Quan sát khách `HXQA Scale Customer 06210` ở ngữ cảnh công nợ.
3. Mở Customer filter: chỉ có 201 option, gồm “tất cả” và 200 khách; khách trên không có option và không có tìm kiếm từ xa trong picker này.

Kỳ vọng: chọn được khách hợp lệ thuộc phạm vi truy cập, vẫn truy vấn có giới hạn. Thực tế: không thể chọn khách trên bằng bộ lọc hiện có.

Bằng chứng: [dashboard-filter.json](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/dashboard-filter.json). Chưa chứng minh Site filter có cùng lỗi bằng một ca thao tác riêng; không nhân thành lỗi đã tái hiện.

Hướng sửa tối thiểu: picker tìm kiếm server-side có giới hạn, giữ option đang chọn và URL state. Không sửa bằng cách tải toàn bảng. Rerun khách nằm ngoài cap, khách đang chọn và drill-down giữ filter.

## 5. Lỗi kiểm thử, tài liệu và kiểm soát ứng viên

### HX-AUD-03 — P2 kiểm thử — Fixture revoke cũ, cleanup có thể bỏ sót đóng browser

Vị trí: [uat.mjs](/Users/nox/Downloads/HienXaERP/scripts/qa/uat.mjs:148), [restore/close](/Users/nox/Downloads/HienXaERP/scripts/qa/uat.mjs:152).

`qa:uat:technical` đạt 12 ca, thất bại `revoke-blocks-next-request`: thao tác với ID grant deterministic cũ, rồi kích hoạt lại grant đó trong finally, gặp `employee_branch_one_active_role`. Lỗi restore xảy ra trước đóng browser, nên có Chromium con còn sống và tiến trình test chưa thoát sau khi in kết quả.

Đây là lỗi harness có thật, **không chứng minh ứng dụng cho phép đọc sau revoke**. Kiểm tra độc lập dùng đúng grant đang active, trường `revoked_at` và chữ ký RPC hợp lệ: baseline thành công; request tiếp theo của cùng phiên sau revoke trả `42501 / forbidden`, data null; khôi phục đúng trạng thái cũ. [Bằng chứng độc lập](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/revoke-current-grant-v3.json), [log suite lỗi](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/uat-technical.log).

Hướng sửa tối thiểu: tìm grant QA hiện hành, lưu/khôi phục trạng thái ban đầu thay vì bật grant cũ; đảm bảo browser.close trong finally riêng kể cả restore lỗi. Không đổi đáp án expected. Trong audit chỉ Chromium con thuộc chính lần test này được dừng sau khi suite đã in FAIL; không dừng browser/server phiên khác.

### HX-AUD-04 — P2 tài liệu — Acceptance header chưa đồng bộ docset

Vị trí: [acceptance.md](/Users/nox/Downloads/HienXaERP/acceptance.md:1) so với [Spec.md](/Users/nox/Downloads/HienXaERP/Spec.md:1) và các file canonical 4.4.

Thực tế: acceptance header còn `HX-V2-DOCSET-4.2 / SYNC-4.2`. Chưa thể xác nhận chỉ đổi header là đủ; coverage các delta 4.4 vẫn cần đối chiếu.

Source of truth: yêu cầu Owner mới nhất và Spec/UXUI 4.4, không phải header acceptance cũ. Hướng xử lý: đồng bộ phiên bản và kiểm tra mapping ca cho delta 4.4, giữ các gate chưa chạy. Audit không tự sửa requirement hoặc đổi trạng thái cũ thành PASS.

### HX-AUD-05 — P1 kiểm soát môi trường — QA có migration ngoài ứng viên

Vị trí: `supabase_migrations.schema_migrations`, version `20260930101520`, tên `custom_rpc_conflicts`; không có file version tương ứng trong thư mục migration của snapshot.

65 version local đều có trên QA, nhưng QA có thêm version này. SQL của migration bổ sung thay custom error `40001` thành `PT409` ở nhóm RPC delivery/route/GPS/work/finance approval/count/return. Chưa chứng minh tương đương đầy đủ với migration local có liên quan. **Ledger không khớp không tự chứng minh mọi hàm khác có lỗi**, nhưng chặn kết luận backend tái lập từ đúng ứng viên.

Bằng chứng: [version comparison](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/migration-versions.json), [migration QA bổ sung](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/qa-extra-migration.json). Nhóm local liên quan có [migration xử lý serialization conflict](/Users/nox/Downloads/HienXaERP/supabase/migrations/20260930081621_replace_custom_serialization_errors.sql).

Hướng xử lý tối thiểu: xác minh equivalence/version và đưa lịch sử backend vào checkpoint được duyệt; rehearsal trên môi trường disposable được cấp phép trước khi ký release. Không tự rollback, áp migration mới hoặc đổi schema QA/Production trong audit này. Các ca đã PASS chỉ xác nhận backend QA đã quan sát.

## 6. Quan sát chưa đủ để coi là lỗi đã xác nhận

- Viewport 390×844 tại Delivery: document/body scrollWidth 820. Đã lưu [ảnh mobile](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/delivery-mobile.jpg). Đây là dấu hiệu cần kiểm tra overflow/table/menu; chưa cô lập nguyên nhân CSS, chưa test đủ thao tác cuộn và thiết bị thật. Không ghi mobile toàn hệ thống PASS hoặc nhân thành lỗi mất dữ liệu.
- UI đã xem có identity Owner/branch QA thật, graph/KPI và các link điều hành. File demo tồn tại không đủ chứng minh demo identity đang được dùng; không báo lỗi demo chưa có bằng chứng runtime.
- Sales được phép gọi snapshot Dashboard với giá trị tài chính bị redaction. Một probe đầu tiên yêu cầu RPC phải lỗi đã đánh giá sai; diagnostic xác nhận các trường bị hạn chế có `quality=FORBIDDEN`, value null. Không ghi thành leak cost/margin.
- Các race hai phiên, API timeout giữa commit/response, mất mạng/offline trên thiết bị và hết hạn phiên giữa lúc đang nhập form chưa được tái hiện đầy đủ. Không dùng suy luận từ khóa FOR UPDATE hay operation_id làm kết quả thực nghiệm.

## 7. Bản đồ các luồng thực sự tồn tại

Các đường dẫn sau là đường đi đã truy vết; **tồn tại trong source không đồng nghĩa luồng đã PASS**.

| Phân hệ / điểm bắt đầu | Thao tác → máy chủ → lưu → hiển thị / liên phân hệ |
|---|---|
| Auth / Access | Login/branch/role → auth action + AccessContext/permission → employee grants/customer memberships và RLS → shell/menu, quyền command/read |
| Customer/Site | Customer list/detail hoặc quick-create Sales → master-data command → customer/site → 360 và auto-select trong draft → Quote/SO/AR |
| Supplier/catalog | Supplier/Material/Settings → master-data/catalog actions → supplier/material/UOM/conversion/warehouse/vehicle/machine/branch/pricing → PO/định giá/điều phối |
| Quote | New/edit → server price preview + create/update draft RPC → quotation revision/lines/snapshot → detail/PDF, SENT/revision/accept → SO |
| SO | New/edit/confirm → Sales action + priced snapshots/credit check → sales_order/lines → detail thương mại/nguồn/giao/nợ → allocation/PO/Delivery |
| PO về kho | New/edit/confirm/receive theo dòng → Purchasing/Inventory RPC → PO/receipt lines/inventory movement/AP → detail lịch sử và remaining → stock/AP |
| PO giao thẳng | PO liên kết SO + verify supplier fulfillment → source-linked fulfillment/AP, không nhập kho giả → allocation/Delivery và supplier context |
| Delivery | Allocation → create/assign/handoff/arrive/submit/verify/return RPC → delivery + per-line facts/movements/verification → trạng thái/AR/COGS/worker earning theo nguồn |
| Kho/count/threshold | Inventory/count UI → reserve/count/approve/threshold command → ledgers/count/threshold → tồn/available/warning → gợi ý draft PO, không tự mua |
| Thu chi/công nợ | Cashbook/AR/AP → post/allocate/reverse payment RPC → immutable payment/allocation/advance → số dư/phiếu/PDF → công nợ và cash context |
| Payment notice/Expense | Portal notice hoặc Expense → review/approve command → notice/expense/payable theo điều kiện → detail/audit, không tự coi notice là tiền đã thu |
| Service/Work/Compensation | Service/Work pool/job → claim/start/submit/verify/approve earning → work results/service verification/earning/AP → Worker job/thu nhập, tách billable với compensable |
| Customer portal | Own quotes/orders/debts/docs → customer-safe RPC/membership + Storage boundary → own-safe state/documents → không lộ cost/notes/supplier terms |
| Route/GPS/Chat | Route plan/apply, foreground ping, durable message → guarded domain/provider seam → plan/GPS/message/job → điều hành/worker/customer theo permission |
| Invoice | Eligibility/coverage/draft/approve/documents → invoice domain/job/provider boundary → invoice facts/documents, không sinh AR/revenue lần hai |
| Dashboard/Report/Audit | Shared filters → canonical scoped queries/export job/audit read → summary/detail/chart/document → drill-down/source traces, không dựng số quality chưa READY |

Vai trò/persona thực sự được thực thi: Owner, Sales, Worker và ba persona portal customer (`finance`, `receiver`, `other_customer`). **Persona `finance` trong fixture là contact tài chính của khách, không phải bằng chứng đã test riêng kế toán nội bộ.** Không tuyên bố đã phủ mọi tổ hợp role/permission/branch.

Các consumer đọc quyền ở server nằm tại [AccessContext](/Users/nox/Downloads/HienXaERP/src/lib/access/context.ts), các command đi qua [Sales](/Users/nox/Downloads/HienXaERP/src/modules/sales/actions.ts), [Purchasing](/Users/nox/Downloads/HienXaERP/src/modules/purchasing/actions.ts), [Inventory](/Users/nox/Downloads/HienXaERP/src/modules/inventory/actions.ts), [Delivery](/Users/nox/Downloads/HienXaERP/src/modules/delivery/actions.ts), [Finance](/Users/nox/Downloads/HienXaERP/src/modules/finance/actions.ts). Không dùng việc ẩn nút làm bằng chứng phân quyền.

## 8. Ma trận nghiệm thu theo nhóm ca acceptance

Mã số là nhóm ca 01–29 trong acceptance hiện có, không phải 29 kết quả PASS mới. Ma trận giữ riêng bằng chứng source, thực nghiệm và phần thiếu.

| Nhóm / yêu cầu | Cách kiểm tra và bằng chứng mới | Kết quả / phần thiếu |
|---|---|---|
| 01 Document/sync/gate | Đọc canonical, task state, version QA; HX-AUD-04/05 | FAIL đồng bộ acceptance/ứng viên backend |
| 02 UX/navigation | UI Owner, Dashboard/Quote/PO/Delivery; viewport mobile, screenshot | PARTIAL; lỗi lịch giao, chưa phủ toàn màn hình/mobile |
| 03 Auth/Access | 6 persona login; existing-session revoke probe v3; logout/bad password trong UAT | PARTIAL; các ca này PASS; recovery gửi mail và tất cả permission combination chưa chạy |
| 04 Security/customer boundary | 156 probes trên 52 sensitive columns, 15 RPC own/cross; RLS/anon inspection | PARTIAL; phạm vi này PASS, chưa phải security scan toàn bộ |
| 05 Price/UOM/money | Quote/PO 2 dòng qua UI/DB, 38 unit tests; số kỳ vọng tính tay | PARTIAL; làm tròn mẫu PASS; quy đổi từng loại nghiệp vụ, thuế/phí không được xác nhận bởi mẫu này |
| 06 Credit/race | Truy vết Sales/credit contract | NOT_RUN race hai phiên và cạnh tranh credit exposure |
| 07 Quotation | Quick Customer/Site giữ draft, preview/save/reload/DB/PDF 1.000 ký tự | PARTIAL; phần trên PASS; SENT/accept/change/revision toàn chuỗi chưa chạy |
| 08 Sales Order | Đọc SO confirmed 2 dòng và tạo Delivery từ allocations | PARTIAL; chưa chạy mới toàn vòng create/edit/confirm/cancel/credit |
| 09 PO direct/source links | Source trace và SO/Delivery direct 2 dòng thực tế | PARTIAL; chưa tạo/verify mới trọn PO direct trong lượt này |
| 10 PO receipt/AP | PO-000032 create/edit/confirm, nhận 1+1, reload/ledger/AP; invalid/replay | PARTIAL toàn nhóm; mẫu nhập từng phần, AP và retry PASS |
| 11 Warehouse delivery/return | Truy vết command/ledger | NOT_RUN mới handoff → verify → return từ kho |
| 12 Supplier-direct delivery | Tạo DL-000014 2 dòng, đối chiếu DB | PARTIAL; per-line create PASS, lịch FAIL; chưa verify accepted/billable/AR/COGS |
| 13 Cancel/return/refund | Source các action/state boundary | NOT_RUN mới tác động tài chính/kho của tất cả nhánh trả/hủy/hoàn |
| 14 Count/race/low stock | Source count/threshold; số kho được đối soát từ receipt riêng | NOT_RUN nghiệp vụ count/race/alert → PO |
| 15 Payment/allocate/reverse/retry | Golden v4 dưới role Owner QA, transaction rollback | PARTIAL; 8 assertion PASS cho receipt/AR/reversal; payout supplier/employee và UI cashbook toàn chuỗi chưa chạy |
| 16 Dashboard/history | UI có chart/KPI; customer filter proof | FAIL bộ lọc; tính số lịch sử/knowledge cutoff toàn mẫu chưa được đối soát độc lập |
| 17 Drill-down/cash context | Source/dashboard links/PO AP thực tế | PARTIAL; chưa phủ mọi filter/detail/export sau từng thay đổi |
| 18 Service billable/compensable | Source trace | NOT_RUN xác minh service và tác động AR/earning đầy đủ |
| 19 Work claim/race | Source; Worker assigned-job UI trong technical UAT | PARTIAL đọc job PASS, race claim chưa chạy |
| 20 Compensation | Source permission/earning boundary | NOT_RUN tính lương/commission/payment mới đầy đủ |
| 21 Worker evidence/offline | Storage Worker upload PASS | PARTIAL; retry offline, GPS và thiết bị thật NOT_RUN |
| 22 Customer portal | Login/own/cross RPC/column redaction/Storage boundary | PARTIAL; các ca này PASS; chưa toàn vòng customer quote/order/payment notice qua UI |
| 23 Route/provider/apply | Source/provider seam; migration extra liên quan conflict RPC | NOT_RUN sandbox/provider và apply/stale toàn chuỗi |
| 24 Foreground GPS | Source | NOT_RUN thiết bị thật, permission, session/unassigned/stale ping |
| 25 Chat | Source durable/no-business-command boundary | BLOCKED thao tác gửi bởi giới hạn audit “không gửi tin nhắn”; chưa xác nhận E2E |
| 26 Async job/unknown/reconcile | Source seam/job | NOT_RUN timeout/provider unknown/reconcile/race worker |
| 27 Invoice/provider/coverage | Domain source; QA flag invoice disabled | BLOCKED phát hành/sandbox; chưa xác nhận toàn flow provider-neutral mới |
| 28 Performance | Ghi scale QA; local build chạy với QA | NOT_RUN `qa:perf`/cloud p50/p95/p99; không gọi số local cũ là cloud PASS |
| 29 Migration/backup/recovery/release | Version compare; fixture harness in-memory riêng | BLOCKED full managed rehearsal/restore/cutover và schema reproducibility; không thay bằng build PASS |

## 9. Kiểm chứng số liệu độc lập

### 9.1 Báo giá và giá mua

Báo giá QT-2026-000015:

- Dòng 1: `1,25 × 123.450 = 154.312,5`, làm tròn ra `154.313`.
- Dòng 2: `2 × 75.000 = 150.000`.
- Tổng kỳ vọng `304.313`, trùng preview, detail sau reload và hai dòng DB. Hai dòng đều `MANUAL_APPROVED`, có reason.
- Tạo Customer/Site trong form vẫn giữ `[1.25, 2]`, `[123450, 75000]` và 1.000 ký tự điều khoản; tự chọn entity mới. UI chặn lưu khi thiếu ngày hiệu lực.
- PDF một trang đã render và xem trực quan: chữ Việt đọc được, đủ hai dòng và tổng, điều khoản 1.000 ký tự không tràn trong mẫu này. Không suy ra tất cả PDF, 50 dòng hoặc mọi font/layout đều đạt.

Bằng chứng: [quotation-db.json](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/quotation-db.json), [ảnh sau reload](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/quotation-persisted.jpg), [PDF mẫu](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/quotation-uat.pdf).

PO-2026-000032:

- Draft đầu: `1,25 × 12.345 → 15.431`; dòng 2 `2 × 7.500 = 15.000`; tổng `30.431`.
- Sửa draft dòng đầu thành 1: tổng mới `12.345 + 15.000 = 27.345`; DB draft_version 2 và reload đúng.
- Xác nhận PO: AP vẫn 0, chưa có receipt.
- Nhận 1 ở mỗi dòng: AP kỳ vọng `12.345 + 7.500 = 19.845`; còn 1 ở dòng thứ hai, dòng thứ nhất đã đủ.
- Kho trước: 125 đơn vị / 1.600.491 đồng. Sau: 127 / 1.620.336. Delta đúng `+2 / +19.845`, hai movement source-linked đúng từng receipt line.
- Nhập 2 khi dòng thứ hai chỉ còn 1: thông báo từ chối hiện trên UI, receipt/AP/stock/value giữ nguyên.
- Replay đúng payload hash/operation_id của receipt đã lưu: cùng entity; vẫn 1 receipt, 1 payable, 2 movements. RPC chạy dưới Owner authenticated; đối soát ledgers dùng quyền read-only của auditor sau khi thoát role, không nới quyền app.

Bằng chứng: [trước confirm](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/po-before-confirm.json), [confirm không AP](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/po-confirm-no-ap.json), [receive/ledger](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/po-receive-db.json), [invalid input](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/po-invalid-input.json), [retry](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/po-retry-v2.json), [ảnh sau reload](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/po-receive-persisted.jpg).

### 9.2 Thu tiền / công nợ / đảo phiếu

Fixture riêng trong transaction QA: AR A = 2.000.000, B = 1.000.000. Thu 2.500.000 phân bổ A = 2.000.000, B = 500.000, không advance.

- Kỳ vọng sau thu: A = 0, B = 500.000; thực tế đúng.
- Cùng intent trả cùng payment ID, chỉ một payment row.
- Cùng operation_id nhưng valid payload khác bị `operation_payload_conflict`.
- Phân bổ B thêm 500.001 bị `allocation_exceeds_outstanding`.
- Đảo phiếu và retry cùng reversal intent: chỉ một reversal; A về 2.000.000, B về 1.000.000.
- Tám assertion PASS; dữ liệu transaction rollback. Không phải thao tác thu tiền thật hoặc kiểm chứng provider ngân hàng. Sequence có thể tăng dù rollback; không dùng số thứ tự để khẳng định không có thử nghiệm.

[Golden v4 và kết quả](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/finance-golden-v4.json), [script tái hiện riêng](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/finance-golden-v4.mjs).

## 10. Lệnh/check thực sự đã chạy

Các command dưới đây chạy từ snapshot, với env QA được nạp khi cần. Không in password/key, không dùng secrets Production. [Bảng exit code gốc](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/check-exits.tsv).

| Command / phép kiểm | Exit / kết quả | Phân loại |
|---|---|---|
| Các lần gọi wrapper pnpm cho lint/unit/QA harness/typecheck/build | 1; `ERR_PNPM_UNSAFE_MODULES_DIR` do symlink dependencies | ENVIRONMENT; chưa phải thất bại app |
| `node node_modules/eslint/bin/eslint.js .` | 0, PASS | Lint hiện tại |
| `node node_modules/vitest/vitest.mjs run` | 0; 16 file, 38 tests PASS | Unit, không thay test |
| `node --test scripts/qa/core.test.mjs scripts/qa/fixtures.test.mjs` | 0; 4 tests PASS | QA harness; có PGlite disposable in-memory initialization |
| `node node_modules/next/dist/bin/next typegen` | 0 | Route types |
| `node node_modules/typescript/bin/tsc --noEmit` | 0 | Typecheck |
| Next build với Node CLI `--env-file` | 1; `ERR_WORKER_INVALID_EXEC_ARGV` | ENVIRONMENT: worker từ chối kế thừa env-file flag |
| `process.loadEnvFile(...)` rồi spawn `node node_modules/next/dist/bin/next build` | 0 | Build đúng payload với cách nạp env tương thích, source không đổi |
| Runtime Next start trên 4012/4013, `/api/qa/environment` | 200, đúng QA project/fingerprint, invoice disabled | ENV, không chứng nhận deployment cloud |
| `node scripts/qa/uat.mjs` với QA URL và `HX_QA_NO_ARTIFACT=1` | 1; 12 PASS/1 FAIL | TEST DEFECT HX-AUD-03; log FAIL được giữ |
| `node --env-file=... scripts/qa/portal-field-audit.mjs` | 0; 156 probes, 52 sensitive columns; 135 no-row/21 denied; 15 own/cross RPC checks | PASS đúng phạm vi; không phải full security certification |
| `node scripts/qa/storage.mjs` với QA URL/env | 0 | PNG/JPEG/PDF, Worker evidence, signing expiry và invalid files PASS; offline NOT_RUN |
| `node --env-file=... ../evidence/finance-golden-v4.mjs` | 0; 8 assertions PASS, rollback | DB/IDEM money golden |
| Probe revoke grant hiện hành v3 | 0; `42501`, restored original state | SEC, fresh existing session |
| UI → PO/Quote/Delivery → readonly DB probes | PO/Quote mẫu PASS; Delivery time FAIL | UI/DB, bằng chứng mục 4/9 |
| Receipt replay v2 | 0; cùng receipt, không thêm ledger effects, rollback | DB/IDEM |

Log chính: [lint](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/lint-direct.log), [unit](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/unit-direct.log), [typecheck](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/types-direct.log), [build](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/build-env-loaded.log), [portal](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/portal-field-audit.log), [Storage](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/storage.log).

Storage kiểm thêm: URL ký riêng tư/no-store, truy cập khác customer bị từ chối, URL public không đọc được, signed URL hết hạn; SVG, JPEG giả và tệp quá cỡ bị từ chối. Hết hạn được chờ thật, không đổi expiry check thành bỏ qua. Những phép revoke fixture của test được restore; không chạy `qa:cleanup` thu hồi tài khoản.

Read-only DB inventory: không thấy public table thiếu RLS hoặc anon SELECT grant trong phép inventory này; 88 tên RPC static được đối chiếu có tồn tại. **RPC tồn tại không chứng minh đúng mọi signature/behavior**, và table-level RLS inventory không chứng minh mọi policy đúng.

### Lần lỗi vẫn được giữ, không “rerun đến xanh” rồi xóa lịch sử

- Golden đầu lỗi unique opening-source fixture; v2 lỗi representation allocation; v3 thiếu due_date bắt buộc. Các lỗi ở setup/probe, không chứng minh sai tiền. V4 có fixture hợp lệ và giữ nguyên expected amounts. Các log `finance-golden*.log/json` đều giữ trong evidence.
- Probe revoke tự viết có các lần sai harness: quên await clients; vi phạm cặp active/revoked_at; thiếu required arguments của Dashboard RPC. Lần v3 có baseline RPC thành công trước revoke và actual denied sau revoke, không dùng một lỗi PGRST signature làm bằng chứng bảo mật.
- Receipt replay đầu trả đúng entity nhưng postcondition query bằng authenticated role bị deny raw inventory ledger; v2 vẫn dùng role đó cho business RPC, chỉ đọc đối soát bằng quyền auditor. Không cấp thêm quyền cho Owner để làm test xanh. Log lỗi đầu được giữ.
- Probe Sales Dashboard ban đầu đòi error thay vì redaction đã được phân tích lại bằng payload/quality. Process exit 0 của helper không tự có nghĩa mọi assertion semantic PASS.
- Extract PDF text bằng `pdftotext` không chạy được vì thiếu executable. PDF đã render bằng công cụ có sẵn và kiểm tra trực quan; không cài package thay thế. Không biến lỗi công cụ này thành lỗi PDF ứng dụng.
- Console warning/error ở tab QA tại lúc chốt: 0 trong tập log thu được, [browser-console.json](/Users/nox/.codex/tmp/hienxa-independent-acceptance-20260930/evidence/browser-console.json). Đây không phải bằng chứng mọi route/API của hệ thống không lỗi.

Không tắt kiểm tra, không sửa source/test/config hay expected result của repository. Build env invocation khác nhau được ghi riêng, không che lần lỗi. Không chạy bộ full SQL integration `scripts/test-r2-database.mjs`, perf cloud, managed migration hay backup restore trong lượt này. Test harness PGlite khởi tạo DB in-memory bằng DDL fixture; không có migration chạy vào Supabase.

## 11. Phần chưa kiểm thử và điều kiện còn thiếu

- **Ứng viên backend tái lập:** giải thích/đồng bộ ledger migration 65/66, xác minh function semantics và checkpoint; cần rehearsal disposable có quyền riêng. Không lấy QA extra migration làm source of truth requirement.
- **Luồng tiền/kho còn lại:** trả hàng từ kho/direct, supplier credit/refund, hủy sau từng mốc, kho transit, hoàn tiền/advance, commission/earning/service/expense và số lịch sử Dashboard. Cần fixture theo từng nhánh và đối soát độc lập sau mỗi command.
- **Race:** hai phiên claim/approve/stock/credit/return; cùng intent gửi đồng thời và timeout giữa commit/response. Các phép retry tuần tự đã PASS không thay thế RACE.
- **UI recovery:** nhấn lưu hai lần qua UI, back/cancel ở mọi form, expired session khi đang nhập, lỗi mạng, empty state và toàn bộ list search/filter/pagination. PO list quan sát có 25/trang và URL page; chưa đủ mọi core list và mọi bộ lọc.
- **Role matrix:** thêm vai trò nội bộ thực sự có trong Access contract và tổ hợp branch/explicit permission; không nhầm customer-finance persona với accountant.
- **Portal/Storage:** customer order timeline/debt/docs và customer notice qua UI toàn vòng; signing đã PASS nhưng chưa tất cả MIME/size/role/ownership permutations hay offline/device retry.
- **External:** route/provider sandbox, invoice provider, jobs unknown/reconcile, messaging delivery. Invoice QA disabled; không gửi tin nhắn hay phát hành thật. Chưa có chứng cứ sandbox mới trong lượt này.
- **Performance:** chưa chạy `qa:perf` trên QA Preview cloud cùng checkpoint. Scale quan sát trước các mẫu thử khoảng 185,9 MB DB; branch A có 5.023 customers, 10.081 orders, 20.085 deliveries. Không dùng số liệu local làm p95/p99 cloud. Ngưỡng chỉ đối chiếu [Spec.md](/Users/nox/Downloads/HienXaERP/Spec.md), không sao chép budget vào báo cáo.
- **Recovery/release:** managed backup/restore, write fence/cutover, rollback/reconciliation trên clean schema chưa chạy. Audit không cấp quyền migration, deploy hoặc thay cấu hình Production.
- **Thiết bị/Owner:** viewport mô phỏng không thay UAT GPS/camera/offline trên điện thoại thật. Nghiệm thu và quyết định sử dụng vẫn thuộc Owner.
- **Production hiện hành:** NOT_TESTED trong lượt độc lập này. Không suy rằng source dirty đã có trên Production hoặc production deployment có cùng SHA với snapshot.

Không thu HAR riêng cho từng thao tác manual browser. Bằng chứng request thực có trong các test API/RPC/Storage; các luồng manual được đối chiếu UI sau reload với dữ liệu DB. Không viết “đã kiểm mạng đầy đủ” thay cho phần chưa thu.

## 12. Dữ liệu thử và bảo toàn môi trường

Những thay đổi ghi đều ở QA đã xác minh, không phải dữ liệu khách thật:

- Customer `HXAUD3009Q1`, Site `HXAUD3009S1`, tên có `HX AUDIT 20260930`.
- Quote QT-2026-000015 / `0518f2e4-34a6-42fc-9fea-3a9ebf2263b2`.
- PO-2026-000032 / `7aa57b51-714f-4f04-9dcb-2b5493121b31`, receipt PR-2026-000028 / `3b4c8e73-155d-4dda-aab9-4cbb081469e6`.
- Delivery DL-2026-000014 / `10dea8d6-7264-4058-aac2-8d107fc3097c`, chỉ PLANNED, không xác nhận giao thật.
- Các asset/evidence do bộ Storage QA upload; UUID trong storage.log. Các fixture golden/replay transaction rollback; grant revoke được restore về original state.

Dữ liệu UI/Storage QA được giữ làm chứng cứ, chưa cleanup tài khoản hoặc xóa giao dịch. Không gửi mail/tin nhắn, issue invoice, tạo tài khoản mới, reset mật khẩu, commit, push hay deploy. Không dùng password/key trong báo cáo/ảnh. Snapshot và evidence lưu ngoài source checkout; không ghi đè phần đang sửa của phiên khác.

## 13. Thứ tự xử lý trước nghiệm thu lại

1. P0: chưa có lỗi P0 đã xác nhận trong ca đã chạy. Không diễn giải thành OPEN P0 toàn hệ thống = 0; ưu tiên bổ sung ca tiền/kho/quyền trọng yếu chưa chạy khi môi trường được cố định.
2. P1: xử lý timezone HX-AUD-01; rà đúng vùng datetime-local liên quan, chạy lại UTC/VN và persisted DB. Không silent sửa dữ liệu thật đã lưu sai.
3. P1 kiểm soát release: giải quyết QA migration ngoài ứng viên HX-AUD-05 và khóa checkpoint có thể dựng lại. Không ký gate khi chỉ frontend fingerprint khớp.
4. P2: Dashboard picker HX-AUD-02; sửa harness HX-AUD-03; đồng bộ coverage/docset HX-AUD-04. Tách thay đổi tài liệu khỏi việc sửa business requirement.
5. Kiểm lại lỗi và phụ thuộc trực tiếp; mở rộng DB/SEC/IDEM/RACE khi schema/RLS/shared contract đổi. Không chạy lại toàn phase nếu evidence còn hiệu lực và không bị invalidated.
6. Chạy các luồng trọng yếu NOT_RUN/PARTIAL, rồi performance một lượt trên ứng viên cloud ổn định; thực hiện recovery/provider/device/Owner gates đúng phạm vi. Chỉ đánh giá release sau khi ma trận phản ánh ứng viên cuối.

**Tổng kết:** QA kỹ thuật có bằng chứng PASS cụ thể nhưng chưa đạt toàn phạm vi. Source audit phát hiện lỗi thật; Production hiện hành chưa được kiểm định bởi lượt này. `production=NOT_TOUCHED`, `release_gate=CHƯA_ĐẠT`, `owner_acceptance=NOT_SUBSTITUTED`.

## Kiểm tra lại 5 bản sửa | 2026-09-30

**Kết luận phạm vi targeted: 4/5 vấn đề ban đầu PASS; acceptance PARTIAL, reference check FAIL. Không xác nhận toàn hệ thống hoặc release gate PASS.**

- Candidate: snapshot mã nguồn cô lập, fingerprint SHA-256 \`8473bf027ebe6512f2ccef1678a16dde2a03852809872e75bc4eac1751660dca\`; captured \`2026-09-30T16:01:24.797Z\`.
- Build ID: \`19hvlMR6neCqCrwIOKGZb\`; endpoint QA trả đúng fingerprint và project \`ffrwiglcrlumfvhubaxg\`, e-invoice disabled.
- Commit nền từ audit trước: \`79b0b918c7430bfd0e9d17e247ecba2be1fa0bf2\`, có thay đổi chưa commit. Không truy vấn Git mới; identity của lượt này là snapshot fingerprint, không suy ra commit hiện tại hay remote.
- Môi trường: Next.js 16.3.4 production-mode build ở localhost, server TZ=UTC, Supabase QA biệt lập. Đây không phải deployed QA Preview hoặc Production.
- Evidence: \`/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-targeted-20260930-8473bf02\`. Các ảnh/JSON/log không chứa mật khẩu, token hay connection string. Bản source và env QA riêng không được chép vào thư mục evidence.

| Vấn đề | Trạng thái | Bằng chứng mới |
|---|---|---|
| Giờ giao hàng | PASS | 13 unit cases PASS trong UTC và 13 trong Asia/Ho_Chi_Minh. Owner xác nhận SO QA-000028 qua UI, tạo DL-2026-000016 với hai dòng. Input 2026-11-04 08:30 VN lưu 2026-11-04T01:30:00.000Z; reload hiện 08:30 4 thg 11, 2026. JSON delivery-confirmed-fixture.json và ảnh delivery-time-after-reload.png. |
| Migration lệch ledger | PASS | Source 66, QA 66; không missing version hai chiều. SQL migration 20260930101520/custom_rpc_conflicts khớp hash chính xác 9f2787ce9804f3340cfd6ebb44d83775f9477be53b6d5aec2a25efefd696057c. QA harness clean-schema/seed replay PASS trong PGlite; không apply managed migration. |
| Customer filter Dashboard | PASS | Search/chọn khách HXQA Scale Customer 06210, rank 3118; reload giữ ID/search, tìm không có kết quả và xóa search vẫn giữ selection. Option list tối đa 202 gồm 200 kết quả, selected ngoài tập và Tất cả. Không horizontal overflow ở viewport 390x844; không coi đây là UAT điện thoại thật. |
| UAT revoke/cleanup | PASS | Thực thi callback revoke đã sửa: request kế tiếp bị chặn, restore đúng grant hiện hành và toàn bộ 5 grant trước/sau bằng nhau. Sales truy cập lại được sau restore. Ba check fault/precondition PASS: restore throws, concurrent restore denied, missing active grant; browser đóng khi restore lỗi. |
| Acceptance 4.4 | PARTIAL | Metadata 4.4/SYNC-4.4 đúng; 30 case groups và 23 known-gap rows đúng. 139 references đã đối chiếu, còn hai ID không tồn tại trong plan.md: PLAN-R0 và PLAN-180. DOC check exit 1, không được ghi PASS. |

### Các lỗi còn mở

1. **P2 / DOC:** acceptance.md:199 tham chiếu \`PLAN-R0\`; acceptance.md:605 tham chiếu \`PLAN-180\`; plan.md 4.4 không định nghĩa hai ID này. Kỳ vọng: links/IDs trỏ tới rule tương ứng có thật. Hướng sửa tối thiểu: thay references bằng rule phù hợp của plan 4.4, không đổi business contract; chạy lại DOC reference check.

2. **P2 / Application, phát hiện kế cận ngoài 5 lỗi ban đầu:** src/app/admin/orders/[id]/page.tsx:47 dùng Intl.DateTimeFormat không có timeZone cho requested_delivery_at. Với SO-2026-000028, DB = 2026-11-03T05:00:00+00:00, UI server UTC hiển thị 05:00 3 thg 11, 2026 thay vì 12:00 giờ Việt Nam. Bằng chứng: available-fixture-states.json + finalUi trong delivery-fresh-fixture-ready.json; timezone nghiệp vụ trong Spec.md:1222. Dữ liệu timestamp không bị thay đổi bởi quan sát này; lỗi là rendering. Hướng sửa tối thiểu: dùng formatBusinessDateTime như Delivery detail, rồi kiểm lại SO trên UTC server. Chưa sửa trong lượt verification.

### Các lần lỗi và giới hạn được giữ nguyên

- Runner shell zsh lỗi biến status readonly. Đây là lỗi runner, không phải ứng dụng.
- pnpm hook cố kiểm/cài dependencies trong snapshot symlink; registry fetch lỗi và ERR_PNPM_UNSAFE_MODULES_DIR từ chối đụng node_modules gốc. Không cài mới thành công. Dùng trực tiếp đúng Vitest/ESLint/Next/TypeScript đã cài; logs pnpm lỗi được giữ.
- Build qua node --env-file lỗi code 9 vì Next worker đưa flag vào NODE_OPTIONS. Đã đổi runner nạp env bằng process.loadEnvFile trước CLI; build env-loaded exit 0. Không chỉnh app/config để làm xanh.
- Hai lượt Owner access-context probe trả 403 khi màn còn tải. Chờ URL hoặc h1 chưa đủ vì loading page cũng có heading. Lượt dùng protected customerSearch form làm readiness, cùng luồng UI đầy đủ, PASS. Không xóa hoặc đổi kết quả các lượt 403; chưa kết luận chúng là defect đăng nhập người dùng. qa/browser.mjs vẫn chỉ waitForURL, đây là rủi ro readiness của các lượt automation khác cần lưu ý.
- Fixture DL-000014 có allocation đã dùng hết: lập thêm bị chặn và không lưu phiếu mới. Các fixture SO-000006/000016/000028 còn lượng nhưng đều DRAFT: không có form lập phiếu. Không coi chặn DRAFT/over-allocation là lỗi ứng dụng. Lượt cuối chuẩn bị fixture đúng qua UI: xác nhận SO giả rồi tạo PLANNED; input date 04/11 nằm sau requested date 03/11, oracle UTC tính độc lập theo VN+07.
- Full human UAT, thiết bị thật, provider sandbox, managed backup/recovery, perf cloud và full-system regression: NOT_RUN trong lượt targeted này. Không lấy build xanh để thay cho chúng.

### Lệnh/check

- node Vitest run business-time.test.ts: exit 0, 13/13 mỗi timezone.
- node --test scripts/qa/*.test.mjs: exit 0, 4/4, bao gồm schema/seed replay.
- node --check scripts/qa/uat.mjs; focused ESLint; Next typegen; tsc --noEmit: exit 0.
- Next build --webpack với QA env-loaded: exit 0.
- DOC reference/coverage: exit 1 vì hai references cũ.
- QA ledger đọc trong READ ONLY transaction: exit 0.
- Targeted revoke callback + cleanup fault checks: exit 0, 4/4.
- Dashboard search/read/reload/mobile bounds: PASS trong UI targeted-ready; lệnh tổng hợp đó exit 1 do fixture delivery hết lượng, không phải Dashboard.
- Delivery UI trên synthetic CONFIRMED fixture: exit 0; hai dòng qty 1, state PLANNED, timestamp/DB/reload khớp.
- Toàn bộ command exit codes và các lượt lỗi: commands.tsv và logs kèm theo.

### Tác động và trạng thái kết thúc

Chỉ có dữ liệu thử trên Supabase QA: SO-2026-000028 được CONFIRMED (có thể tạo credit commitment theo contract), DL-2026-000016 giữ PLANNED. Không dispatch/verify/post Payment/issue invoice/send message. Grant Sales được restore đúng trạng thái trước test; browsers và server do lượt kiểm tra này mở đã đóng. Không qa:cleanup vì cần giữ dữ liệu/evidence.

Production=NOT_TOUCHED. Không sửa app/test/config trong working tree; không migration managed, commit, push, PR, merge hoặc deploy. Chỉ cập nhật báo cáo và implementation log sau verification.


## Khắc phục tham chiếu và giờ giao dự kiến SO | 2026-10-01

- ACC-CASE-01: bỏ ID không tồn tại PLAN-R0, giữ yêu cầu Spec và dẫn PLAN-040 cho cách kiểm; không dựng lại phase R0 trong plan 4.4.
- ACC-CASE-30: thay ID không tồn tại PLAN-180 bằng PLAN-055 (ranh giới R12/Production) và PLAN-070 (completion/human gates).
- SO detail: thay formatter phụ thuộc timezone máy chủ bằng formatBusinessDateTime dùng Asia/Ho_Chi_Minh. Không thay dữ liệu UTC hoặc nghiệp vụ đặt lịch.
- Trạng thái: ĐÃ SỬA MÃ/TÀI LIỆU, CHƯA KIỂM TRA LẠI. Kết quả DOC/UI trước sửa được giữ nguyên như bằng chứng lịch sử, không phải PASS cho bản mới.
- Không chạy test, build, DB, migration, commit, push hoặc deploy. Production không bị thay đổi.
- Nghiệm thu lại cần giới hạn ở DOC reference check và UI giờ giao dự kiến SO trên máy chủ UTC, tải lại trang; chỉ mở rộng check khi có thay đổi liên quan.


## Kiểm tra tham chiếu và luồng SO | 2026-10-01

### Kết luận và phạm vi

- Kết luận: **CHƯA ĐẠT trong phạm vi kiểm** vì còn 1 lỗi responsive và 1 lỗi tham chiếu log. Hai tham chiếu plan vừa sửa và lỗi giờ SO đã PASS bằng bằng chứng mới.
- UI tập trung: **14/15 PASS**, 1 FAIL. Không dùng kết quả này để xác nhận toàn bộ ERP hoặc quyết định nghiệm thu của Owner.
- App QA local: http://127.0.0.1:4024; Supabase QA: ffrwiglcrlumfvhubaxg; server UTC; browser Asia/Saigon; desktop 1440x1080 và viewport mobile 390x844 (không phải thiết bị thật).
- Browser plugin/browser skill không có trong session: dùng Playwright Chromium đã có trong dự án, không cài thêm dependency.
- Fingerprint 321 file tại thời điểm khóa bản: a95d8eb850aa07b55e769935b7c211b6855b2410dc9afe21fbf8b855db93adc6. Build ID: MtxgAPy1CsjrNPuY345oH. Snapshot nguồn biệt lập, không giành hoặc sửa mã của phiên khác.
- Branch/commit chỉ là metadata audit trước: codex/uat-role-navigation-20260923 / 79b0b918c7430bfd0e9d17e247ecba2be1fa0bf2; không chạy Git để xác nhận lại trong lượt targeted này. Kết quả gắn với fingerprint, không khẳng định current HEAD.
- Fingerprint được chốt trước khi append báo cáo/log nghiệm thu này. Không sửa application source, test nguồn, config, schema hoặc migration.

### Lỗi còn lại đã xác nhận

1. **P2 / DOC-LOG-ANCHOR-01:** acceptance.md:55 và :92 dẫn implementation.md::IMP-ACCEPT-001 nhưng không có section đó. Check 141 ID cho thấy 140 tồn tại, 1 thiếu; kiểm riêng heading implementation cũng FAIL. Baseline trước bản sửa đã có lỗi này; lượt trước bỏ sót nhóm IMP. Ảnh hưởng truy vết nghiệm thu, không phải lỗi runtime. Sửa tối thiểu: thống nhất nơi log với cấu trúc canonical thực tế hoặc cung cấp section cần thiết; không ghi PASS giả.
2. **P2 / SO-MOBILE-OVERFLOW-01:** src/app/admin/orders/[id]/page.tsx:48; UXUI.md::UX-800.1. Đăng nhập Owner QA, mở SO-2026-000028 ở 390x844: document rộng 798px, card rộng 781.53125px. Tái hiện cả sau resize và context mobile mới. Table-wrap overflow:auto không ngăn card/grid min-width:auto nở theo bảng. Người dùng phải kéo ngang để đọc/thao tác. Sửa tối thiểu: giới hạn intrinsic min-width của grid child và hiển thị các dòng hàng theo contract mobile, không để tràn core flow.
- Hai lỗi này **chưa được sửa trong lượt kiểm tra**. Không phát hiện lỗi tiền/giờ/lưu dữ liệu mới trong các ca đã thực hiện; không suy ra các phân hệ ngoài phạm vi đều an toàn.

### Ma trận bằng chứng mới

| Phạm vi | Kết quả | Bằng chứng |
|---|---|---|
| PLAN-R0/PLAN-180 sau sửa | PASS | acceptance.md:199 dẫn PLAN-040; :605 dẫn PLAN-055/PLAN-070; tất cả PLAN refs có heading thật |
| Toàn bộ ID và log anchor | FAIL | docs.json; doc-implementation-anchors.json; docs-reference-history.json |
| SO có sẵn: UTC 05:00 -> VN 12:00 ngày 03/11 | PASS | so-workflow.json; so-time-desktop.png; tải lại vẫn đúng |
| Tổng 2 dòng SO có sẵn | PASS | 1 x 3000 + 2 x 5000 = 13000, UI và DB khớp |
| SO -> Delivery -> reload/back | PASS | DL-2026-000016: UTC 01:30 -> VN 08:30 ngày 04/11; delivery-time-reload.png |
| Tìm kiếm, lọc và giữ URL sau reload | PASS | q=SO-2026-000028/state=CONFIRMED trả 1 dòng; orders-filtered.png |
| Dataset rỗng, phân trang | PASS | Không có kết quả được thông báo; page 1/2 mỗi trang tối đa 25 và không trùng ID |
| Anonymous vào SO/API context | PASS | Chuyển /login, không lộ mã SO; API 401 |
| Mobile SO detail 390x844 | FAIL | so-draft-focused.json; so-mobile-fresh-context.png; document 798px |
| Thêm/xóa dòng và xem trước giá | PASS | Ca đầu thêm dòng thứ 3/xóa về 2; giá preview 19000 đúng; so-draft-preview-final.png |
| Lưu Nháp nhiều dòng / double click | PASS | SO-2026-000033: đúng 2 dòng, 19000; chỉ 1 draft có marker sau double click |
| Lưu ngày mới / reload | PASS | Nhập VN 2026-11-06T09:45, DB 2026-11-06T02:45Z, UI 09:45 |
| Mở sửa Nháp và prefill ngày | PASS | Link Sửa bản nháp có thật; 2 dòng và ngày 09:45 giữ đúng |
| Sửa Nháp / reload / đối chiếu DB | PASS | Đổi dòng 1 thành 4; 4 x 3000 + 2 x 5000 = 22000; VN 10:15 ngày 07/11 -> UTC 03:15 |
| Kiểm persisted lines và trạng thái | PASS | qa-draft-persistence.json: DRAFT/NOT_STARTED/NOT_DUE, 4 và 2, totals 12000+10000 |
| Page error / console / HTTP 5xx trong luồng | PASS | Không có lỗi runtime, console hoặc 5xx ở các ca chạy |
| QA guard / build / affected ESLint | PASS | guard.log; build.log; lint-so.log; mã thoát 0 |

### Các lệnh và lần thất bại được giữ lại

- commands.tsv ghi tất cả mã thoát. DOC reference check và implementation-anchor check: exit 1 do lỗi tài liệu thật; QA guard/build/lint: exit 0.
- so-probe: exit 1 vì dùng total_vnd ở bảng sales_orders không có cột đó; đây là lỗi truy vấn kiểm tra, không phải lỗi app. Sau khi dùng sales_order_read theo nguồn UI: exit 0.
- so-workflow: exit 1 gồm lỗi mobile thật và strict-mode locator tổng tiền trùng subtotal/total. so-draft-focused: exit 1 gồm lỗi mobile thật và parent locator không khớp DOM. Hai lần này dừng trước submit Save, không tạo SO.
- so-draft-final: exit 0 sau khi locator được đối chiếu DOM; kết quả chỉ thay thế ca runner bị lỗi, không xóa kết quả mobile FAIL hoặc các log lỗi trước.
- UNIT formatter UTC/VN và các check schema/RLS cũ không bị thay đổi không chạy lại; bằng chứng trước chỉ reuse trong phạm vi input không đổi, không dùng để PASS các ca mới.

### An toàn, dữ liệu QA và phần chưa kiểm

- Tạo/sửa duy nhất SO Nháp giả SO-2026-000033, id 644cf877-d971-463a-aa45-dfad12aeae54. Giữ DRAFT 22000, ngày UTC 2026-11-07T03:15Z làm bằng chứng. Không confirm, dispatch, verify delivery, thu/chi, issue invoice hoặc gửi tin nhắn.
- Truy vấn DB kiểm tra chỉ đọc; không seed/cleanup, không đổi role/grant, không migration, không commit/push/deploy. Production NOT_TOUCHED.
- Server owned port 4024 đã dừng chủ động (exit 130); browser/DB connections owned đã đóng. Không dừng tiến trình của phiên khác.
- NOT_RUN: Production/hosted Preview; full ERP và toàn bộ ACC cases; multi-role/cross-branch IDOR; missing/invalid input và lỗi API/mạng/session; hai actor cạnh tranh; vòng confirm-delivery-money-inventory/return đầy đủ; thiết bị thật, provider, cloud PERF, backup/recovery. Prefetch route trả 200 không phải bằng chứng nghiệm thu luồng.
- Release gate và Owner UAT không được nâng thành PASS từ lượt kiểm tập trung này.

### Bằng chứng

- Thư mục artifact riêng (không gồm env, token/cookie/storageState): /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-ref-20261001-a95d8eb8
- [Kết quả cấu trúc](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-ref-20261001-a95d8eb8/verification-summary.json)
- [Ảnh SO sau sửa và tải lại](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-ref-20261001-a95d8eb8/so-edited-time-final.png)
- [Ảnh lỗi mobile](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-ref-20261001-a95d8eb8/so-mobile-fresh-context.png)

### Thứ tự xử lý

1. Sửa SO mobile overflow theo UX-800.1; kiểm lại đúng viewport/context và các consumer trực tiếp nếu sửa CSS dùng chung.
2. Sửa destination log IMP-ACCEPT-001; chạy DOC heading/reference check đúng phạm vi.
3. Giữ bằng chứng giờ SO/save/edit đã PASS khi inputs không đổi; không chạy lại toàn hệ thống chỉ vì đổi task.



## Khắc phục hai lỗi mới sau nghiệm thu SO | 2026-10-01

- DOC-LOG-ANCHOR-01: bổ sung section implementation.md::IMP-ACCEPT-001, dẫn tới run IMP-220 và manifest bằng chứng thật. Không đổi yêu cầu acceptance hay viết lại kết quả lịch sử thành PASS.
- SO-MOBILE-OVERFLOW-01: thêm CSS Module chỉ cho trang chi tiết SO; giới hạn min-width của các grid child và chuyển bảng dòng hàng thành thẻ có nhãn trên mobile. Bảng desktop, thông tin từng dòng, thao tác phân nguồn và permission boundaries được giữ nguyên; không nhân đôi form hoặc command.
- Trạng thái: ĐÃ SỬA, CHƯA KIỂM TRA LẠI. DOC/UI/build/lint NOT_RUN cho bản mới; kết quả IMP-220 vẫn là kết quả của candidate cũ.
- Không sửa Spec.md, UXUI.md, plan.md hoặc business requirement. Không thay dữ liệu, schema/migration, quyền, commit/push/deploy; Production NOT_TOUCHED.
- Kiểm tra tiếp theo cần giới hạn ở heading/reference DOC và SO detail 390/768/1024/1440, thông tin dòng hàng/CTA, load/reload/navigation; chỉ chạy thêm consumer trực tiếp nếu có thay đổi liên quan.

## DOC và SO sau khắc phục | 2026-10-01

**ĐẠT trong phạm vi kiểm tra tham chiếu DOC và SO detail responsive/điều hướng chỉ đọc. Không phải PASS toàn hệ thống.**

- DOC: 141/141 tham chiếu hợp lệ; không còn thiếu ID hoặc heading PLAN/IMP; docset/sync đúng 4.4.
- SO: 13/13 ca kiểm tra tập trung đạt sau phân loại lỗi runner; DRAFT và CONFIRMED tại 390/768/1024/1440px, số tiền/giờ/dòng hàng, reload, Delivery liên quan, edit-prefill và Back.
- Hai lỗi vừa sửa: missing IMP-ACCEPT-001 và tràn ngang SO 390px đã FIX_VERIFIED.
- Lần chạy đầu giữ nguyên 2 FAIL do yêu cầu mọi link trong bảng cuộn ngang phải nằm ngay trong viewport. Chẩn đoán có selector trùng tên giữa hai dòng. Kiểm tra từng link theo dòng xác nhận vẫn truy cập được; không sửa application để làm xanh bài kiểm tra.
- Quan sát UI không chặn OBS-SO-001: lượng phân nguồn còn nhiều số 0 thập phân, ví dụ 4.000000000000000000. Không kết luận sai nghiệp vụ.
- Lint trang SO, typecheck và build: exit 0. Không có lỗi JS/console/HTTP 5xx được ghi nhận trong lượt đầu.
- Môi trường: build biệt lập localhost + Supabase QA; fingerprint `28ff806cfecd593c7cc885885e6580b13e507f2bfb804840619dc53f0f839c89`; build ID `k9s8pRgGHa4wWbtigzhR-`. Commit/branch hiện hành không được xác minh lại; dùng exact snapshot để định danh kết quả.
- Không tạo giao dịch nghiệp vụ; không commit/push/deploy; Production NOT_TOUCHED. Thao tác confirm/cancel/đặt NCC/tạo Delivery và full ERP release gate chưa chạy lại trong lượt này.
- [Báo cáo chi tiết](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-responsive-20261001-28ff806c/NGHIEM_THU_DOC_SO.md)
- [Ma trận và bằng chứng](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-so-responsive-20261001-28ff806c/verification-summary.json)


## Production deployment sau kiểm tra DOC/SO | 2026-10-01

- Chỉ thị Owner: "ok deploy production nhé".
- Vercel `hienxa/hien-xa-erp-v2`: **READY**, target Production, deployment `dpl_FN2DioAPhpj3SLkdWsv53J3RSDAz`, CLI exit 0, cloud build 34s.
- [Production](https://hien-xa-erp-v2-nu.vercel.app)
- [Deployment cố định](https://hien-xa-erp-v2-kk3khw1yc-hienxa.vercel.app)
- Source của bản vừa QA, fingerprint `28ff806cfecd593c7cc885885e6580b13e507f2bfb804840619dc53f0f839c89` ghi trong deployment metadata; không gọi đây là mã commit Git.
- Dùng cấu hình Production sẵn có, Supabase `nbwynrwkdbtfsitafsxa`; không promote QA artifact, không bật QA runtime, không đưa credential QA lên hosting.
- Không chạy migration/seed/DML nghiệp vụ, không đổi biến môi trường hoặc cấu hình bảo vệ, không commit/push/PR.
- **READY chỉ xác nhận build/deploy. Chưa kiểm tra luồng hoặc truy cập khách hàng trên Production sau deploy.** Metadata Vercel liệt kê `vercel_authentication`; chưa kết luận Production alias yêu cầu Vercel login hay đã public.
- Bằng chứng QA IMP-222 được reuse đúng phạm vi, không chuyển thành PASS toàn hệ thống hoặc Owner nghiệm thu.
- [Bằng chứng deployment](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-production-20261001-FN2DioAP/deployment-record.json)

## Đối chiếu Production chỉ đọc sau deploy | 2026-10-01

**Đạt các chức năng đăng nhập/đọc SO đã kiểm tra, kèm một cảnh báo timeout; chưa phải nghiệm thu toàn ERP.**

- Alias Production trỏ đúng deployment `dpl_FN2DioAPhpj3SLkdWsv53J3RSDAz`.
- Trang login mở được không gửi cookie/credential (HTTP 200); Owner đăng nhập thành công; health HTTP 200.
- 15 kiểm tra UI đạt: GET search/filter/reload, cả bốn SO UAT đủ hai dòng và tổng khớp phép tính độc lập, 1440/390px, đọc form nháp/Back, trạng thái rỗng và phục hồi danh sách; console thu thập không có error/warn.
- Một lần SO3 bị timeout chờ heading. Trang hiện ở quan sát tiếp theo mà không retry navigation; giữ raw failed attempt, nguyên nhân chưa xác định. Không kết luận latency Production PASS.
- OBS-SO-001: raw decimal dư số 0 ở lượng phân nguồn vẫn hiện trên Production; điểm trình bày P3, không thấy sai số tiền.
- Không có fixture CONFIRMED/Delivery hoặc giờ giao có giá trị; pagination chỉ 4 dòng. Những ca đó NOT_RUN, không tự tạo/xác nhận/gán lịch trên Production.
- Không submit nghiệp vụ, không sửa source/schema/config hoặc dữ liệu thật, không commit/push/deploy thêm; chỉ đăng nhập Owner theo quyền đã cho.
- [Báo cáo Production chi tiết](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-production-so-20261001-FN2DioAP/NGHIEM_THU_PRODUCTION_SO.md)
- [Ma trận và bằng chứng](/Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-production-so-20261001-FN2DioAP/verification-summary.json)


## 2026-10-01 | SO notes scoped QA follow-up (IMP-225)

- Candidate: 1b4f4572b2c17ebd67316fa2c12469ec32dc4a115f94fc15516f8ab06c45097f
- Build: 1Ux4JwWkAQp-j5UghaF8R
- Environment: local production-mode build / Supabase QA ffrwiglcrlumfvhubaxg / server UTC.
- Scope: frozen IMP-222 baseline + exact SO shortage display patch, not entire current worktree.
- Result: 17 UI checks PASS, 0 functional FAIL; guard/build/read-only backend checks PASS.

## Confirmed SO / related Delivery coverage

- SO-2026-000028: CONFIRMED, two lines; independent 1 * 3000 + 2 * 5000 = 13000 VND.
- Requested delivery: database 2026-11-03T05:00:00Z -> UI 12:00 3 thg 11, 2026.
- Link opens DL-2026-000016, PLANNED, two lines; backlink returns to the correct SO.
- Delivery schedule: database 2026-11-04T01:30:00Z -> UI 08:30 4 thg 11, 2026.
- Reload preserves both documents and times; read-only before/after database snapshots are identical.
- CONFIRMED SO at 390px fits page width and preserves line contents.
- Coverage gap closed on QA only; no claim about missing Production fixtures.

## Timeout diagnosis

- No application readiness timeout reproduced across cold SO navigation, Delivery link, reloads, backlink and observed loading checks.
- Deliberate absent-heading control reproduces the same class of selector deadline error after 3052 ms despite timeoutMs=20000.
- Confirmed diagnostic: tool wait option/deadline discrepancy. This is consistent with, but does not establish the sole root cause of, the previous Production event.
- Readiness method corrected in this QA execution: navigation -> fresh actual loading/content observation -> wait observed loading hidden -> verify exact document and line data. No arbitrary sleep, retry-to-green, larger timeout, or speculative app timeout/cache patch.
- Historical Production warning preserved at ../hienxa-production-so-20261001-FN2DioAP/verification-summary.json. Its exact root remains NOT_ESTABLISHED; Production was not retested.

## Shortage display patch

- SO-2026-000033: DRAFT, 4 * 3000 + 2 * 5000 = 22000 VND.
- Shortage displays 4 and 20 instead of database scale padding; prices, total and stored 10:15 7 thg 11, 2026 schedule unchanged after reload.
- Exact current page hash: 78b000a467a56eb0be7c779e32f0ab1b0c7a759dccf377c4f64ddfe434320044. Patch VERIFIED_ON_QA, NOT_DEPLOYED.

## Commands and initial errors

- node ../build-qa.cjs: exit 0, pinned QA build identity.
- First node ../start-qa.cjs: exit 1, sandbox listen EPERM, preserved server.log. Elevated owned QA-only server subsequently ran.
- node qa-read.cjs before / after: exit 0; QA guard, runtime build identity and read-only DB checks.
- cua_repl: documented navigation/locators, DOM observations, screenshots, console inspection.
- Two diagnostic harness failures (unavailable Intl and interrupted binding) preserved in qa-ui.json, not attributed to the app. Expected negative-control error also preserved.

## Limits

- No hosted-cloud test or Production execution in this turn
- No confirm/cancel/create-delivery/save/finance/inventory business submissions
- No representative p95/p99, provider, backup/recovery, role/RLS/race/full-system release checks
- The exact historical Production timeout remains a warning, not declared fixed by QA
- Network request/response tracing is not exposed by this selected CUA API; DOM, console and read-only persisted-data comparison are the direct evidence

Business submissions: 0. Production: NOT_TOUCHED. Deploy: NOT_RUN. Owner acceptance: NOT_REPLACED.


## 2026-10-01 | Auth integration release check (IMP-226)

Candidate: 79390112fc6b5cb8b915e3d1572be5bbaf45a6eec94ea9c0d28db770ddab8694. Build: YkF9hgVtlLlsBS3T9yggS.

## Integration

Preserve main internal login and branch selection redirects through /, which selects admin/work by authenticated dashboard.read permission. Preserve local recovery redirect URL surface=admin/work/customer. Customer login still routes to /customer. No role grants, RLS or credentials changed.

## Checks

- Actual auth action/root code harness: 23 PASS, 0 FAIL, exit 0; controlled dependencies, zero real network/reset emails.
- Existing access policy tests: 3 PASS, exit 0 with original main Vitest config. First snapshot invocation failed with alias resolution (exit 1); log preserved.
- Focused ESLint, typecheck and production-mode QA build: PASS, exit 0.
- QA runtime/build identity verified against Supabase QA.
- Browser: 6 PASS / 0 FAIL. Owner -> /admin; Worker from internal login -> /work; session persists after reload; direct Worker /admin is denied by server FORBIDDEN with no dashboard data; returning to /work works.
- Raw first sign-out locator error retained; fresh observed native AX button completed QA sign-out.
- Intentional forbidden-route check produces generic safe error UI and React #419/#441 logs. These are retained and correlated with server FORBIDDEN, not reported as zero console errors. [React #419](https://react.dev/errors/419) describes server Suspense fallback; [React #441](https://react.dev/errors/441) hides server-render error details in production.
- Read-only SO/Delivery fixture snapshots before/after unchanged.
- IMP-225 SO shortage/detail/Delivery/time/reload evidence reused only because its source and related data boundary are unchanged; auth entry was freshly checked.

## Publication boundary

Sync previously deployed audit repairs plus SO/auth integration with GitHub. Preserve existing main-only files, including the prior worker compensation grant-revocation migration. SQL files are archived source only; no migration executed in this deployment. Existing PR #11 overlaps the archived RPC SQL hotfix; neither PR is merged by this task. Duplicate baseline documents, temporary evidence, secrets and CLAUDE.md are excluded.

No full-system PASS, real-device UAT or Owner acceptance inferred. Historical Production SO readiness warning remains root NOT_ESTABLISHED. Deployment/PR outcome will be recorded separately.

## Publication outcome - 2026-10-01

- PR: https://github.com/MutAquaticStudio/HienXaERPv2/pull/12 (open, not merged).
- Commit: f9b8167ccf307a151284773ceedd8c496fd09108.
- Production deployment: dpl_DBNNwXzLAyX5vmyvE9suQwh2dB2C, READY, command exit 0.
- Production alias: https://hien-xa-erp-v2-nu.vercel.app.
- Immutable deployment: https://hien-xa-erp-v2-fdzl5dvg1-hienxa.vercel.app.
- Scope evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-release-20261001-f9b8167/release-summary.json; prior auth evidence remains linked in IMP-226.
- QA evidence applies to candidate fingerprint 79390112fc6b5cb8b915e3d1572be5bbaf45a6eec94ea9c0d28db770ddab8694. Deployment comparison initially detected only Next-generated next-env.d.ts; the committed declaration exactly matches the successful QA build. No application change was made to resolve that comparison.
- Two GitHub Vercel integration statuses are FAIL with links to blocked-deployment guidance. The explicit CLI Production deployment succeeded; this does not make those statuses PASS. GitHub Actions completion was not observed.
- No new post-deployment browser acceptance was performed in this publication step. Build/deployment readiness is not a full business-flow acceptance result.
- No Production migration, business-data write, permissions/password/config mutation, invoice issue or messaging. Historical browser-wait cause remains NOT_ESTABLISHED.

## New-account Production deployment - 2026-10-01

- Owner authorized redeployment using the new account only.
- CLI account: thunderekt-6020; team: hienxa. Both checked before deploy.
- Commit: f9b8167ccf307a151284773ceedd8c496fd09108. Application code unchanged; scoped QA evidence reused from IMP-225/IMP-226.
- Deployment: dpl_EnXzoXsCWZs38LGd73ADTknscDbT; Production READY; command exit 0.
- Production URL: https://hien-xa-erp-v2-nu.vercel.app
- Immutable deployment: https://hien-xa-erp-v2-nzm3e7y4j-hienxa.vercel.app
- Evidence: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-new-account-deploy-20261001-EnXzoXs/deployment.json
- No new post-deployment browser acceptance, migration or agent business-data writes. Old account and connector not used. This result does not resolve or override historical blocked-account GitHub statuses.
