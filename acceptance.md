# acceptance.md — Nghiệm thu Hiền Xa ERP V2 theo yêu cầu

> **Bộ tài liệu:** `HX-V2-DOCSET-4.4`
> **Giao thức đồng bộ:** `SYNC-4.4`
> Sở hữu: cách chọn ca, dữ liệu thử, bước kiểm tra và cách ghi bằng chứng nghiệm thu.  
> **Không nạp mặc định trong BUILD_ONLY. Không có smoke test. Không tái tạo 678 DoD từng task.**

# ACC-000 — Dùng khi nào

Đây là file thứ sáu do chủ yêu cầu thêm. Năm file triển khai vẫn giữ vai trò cũ. Tạo file này **không mở R0, không mở QA và không cho phép thay đổi repository/Production**.

- Trong lúc code: đọc task và phần Spec/UXUI liên quan, làm kiểm kỹ thuật tối thiểu theo plan. Không đọc từng ca dưới đây hoặc biến chúng thành việc phải làm sau mỗi task.
- Khi chủ tự thử: dùng ACC-050 và đúng ca thủ công; ghi kết quả thực, phần kỹ thuật chưa được kiểm vẫn NOT_RUN.
- Khi chủ ra lệnh QA/nghiệm thu: đọc ACC-020 đến ACC-040, chọn đúng nhóm ở ACC-030, rồi đọc ca đó. Không chạy toàn bộ file chỉ vì một màn thay đổi.
- Trước dùng thật: điều kiện release trong Spec vẫn bắt buộc. Hoãn QA trong giai đoạn code không miễn kiểm tiền/kho/quyền/migration trước phát hành.

Danh mục dưới đây có **30 nhóm ca theo hành trình/rủi ro**, không phải 30 task lập trình hoặc một bộ máy QA mới. Các ca là cách bắt đầu kiểm, không bằng chứng bao phủ mọi lỗi. Nếu phạm vi được yêu cầu có yêu cầu khác trong Spec/UXUI, phải ghi phần thiếu và bổ sung kiểm tra đúng phạm vi; không đánh dấu toàn hệ thống đạt từ vài ca mẫu.


# ACC-005 — Nghiệm thu không được làm lệch contract

Khi QA phát hiện implementation khác Spec/UX:
- ghi FAIL/PARTIAL theo phạm vi;
- không hạ kỳ vọng hoặc sửa acceptance case để tạo PASS;
- không sửa Spec/UX trong phiên QA trừ khi Owner yêu cầu thay requirement;
- lỗi cần code fix được log trước, sau đó mở một task sửa riêng.

Acceptance là bằng chứng, không phải cơ chế thay requirement.


# ACC-006 — Tái sử dụng nghiệm thu đúng build

Một ca acceptance đã có bằng chứng chỉ chạy lại khi:
- source/flow/schema/permission mà ca đó phụ thuộc thay đổi;
- requirement/UX liên quan đổi;
- build candidate đổi ở vùng ảnh hưởng;
- lỗi đã sửa cần retest.

Không chạy lại toàn phase nếu chỉ một case bị invalid. Khi retest, chạy case lỗi + dependency trực tiếp cần chứng minh.


# ACC-010 — Nguồn yêu cầu, trạng thái và bằng chứng

| Nội dung | Nơi sở hữu |
|---|---|
| Hành vi, công thức, invariant, ngưỡng hiệu năng | Spec.md |
| Bố cục, thao tác kiểu Sapo, responsive, tiêu chí dùng dễ | UXUI.md |
| Quyền thực thi, kiểm tối thiểu, checkpoint và STOP | plan.md |
| Phạm vi QA đang mở và trạng thái nghiệm thu | tasks.md |
| Command/log, bản code đã kiểm, lỗi và lời xác nhận thật | implementation.md |
| Cách chọn và thực hiện ca nghiệm thu | acceptance.md |

Nếu một kỳ vọng ở đây khác Spec/UXUI, ghi DOC_CONFLICT; không đổi công thức hoặc đơn giản hóa bài test để tạo PASS. Số tiền/dữ liệu ở các ví dụ chỉ là **dữ liệu giả**, không giá, hoa hồng hay chính sách thực của Hiền Xa.

Không ghi kết quả sống vào 30 ca bên dưới. Log chỉ lưu ở IMP-ACCEPT-001 hoặc artifact kiểm thử có đường dẫn thật; tasks giữ trạng thái và tham chiếu run id, không lặp cả báo cáo.

# ACC-020 — Lệnh mở và phạm vi cho phép

| Lệnh | Cách xử lý |
|---|---|
| `TÔI TỰ NGHIỆM THU R7` | Cung cấp đúng ca liên quan và mẫu ghi kết quả; không tự chạy test hoặc coi đã đạt |
| `NGHIỆM THU R7` | Kiểm phần R7 đã triển khai, dùng đầu ra các phase trước làm dependency; thiếu dependency ghi rõ |
| `CHẠY QA TIỀN VÀ KHO` | Chọn các ca tiền/kho ở ACC-030; không thử GPS/chat hoặc toàn UI không liên quan |
| `CHẠY QA TOÀN HỆ THỐNG` | Lập phạm vi từ Spec/UXUI và bản code, báo cả phần chưa có; chạy các ca áp dụng, không thu hẹp im lặng |
| `KIỂM TRA LẠI ACC-CASE-15` | Chạy lại ca đó và phụ thuộc trực tiếp bị tác động, không mặc định chạy toàn bộ |

Lệnh QA cho phép dùng công cụ kiểm tra trên **môi trường cục bộ cô lập đã xác minh**, với dữ liệu giả. Không phải quyền deploy, migrate dữ liệu thật, gửi tin cho khách thật hoặc xuất hóa đơn thật. Thử tích hợp sandbox chỉ khi đã có quyền và credentials sandbox phù hợp.

Mặc định dùng test/scripts thật hiện có; không tạo framework hoặc CI job nghiệm thu riêng. Nếu thiếu test/browser/provider cần để chứng minh một yêu cầu, ghi BLOCKED/NOT_RUN. Viết thêm test chỉ trong task/ủy quyền kiểm thử cho phép; không tự sửa mã sản phẩm để làm test xanh. Sau phát hiện lỗi, chờ lệnh sửa đúng phạm vi rồi kiểm lại phần bị tác động.

# ACC-030 — Chọn ca theo phase, không nạp toàn bộ danh mục

| Phạm vi | Ca cần đọc trước | Giới hạn quan trọng |
|---|---|---|
| R0 — Dữ liệu/nhu cầu | ACC-CASE-01 | Chỉ kiểm hồ sơ read-only, không gọi là kiểm ứng dụng |
| R1 — Nền/mẫu thử | ACC-CASE-02; phần số học đã có của ACC-CASE-05 | Mock chỉ chứng minh mẫu thử; tiền/kho thật vẫn NOT_RUN |
| R2 — Đăng nhập/quyền | ACC-CASE-03; ACC-CASE-04 | Phải kiểm API/DB/file thực, không chỉ nút ẩn |
| R3 — Danh mục/khách/lõi tiền | ACC-CASE-05; ACC-CASE-06; ACC-CASE-15 | Kernel thật cục bộ; UI/source tương lai không được giả đã có |
| R4 — Bán/báo giá | ACC-CASE-05; ACC-CASE-06; ACC-CASE-07; ACC-CASE-08 | Quote optional; kiểm snapshot và hạn mức |
| R5 — Mua/nguồn | ACC-CASE-09 | Đến liên kết SO–PO; chưa có R6 thì khâu giao ghi NOT_RUN |
| R6 — Kho/giao/trả | ACC-CASE-10; ACC-CASE-11; ACC-CASE-12; ACC-CASE-13; ACC-CASE-14 | Phải kiểm ledger/công nợ cùng transaction thật |
| R7 — Tài chính/Dashboard | ACC-CASE-13; ACC-CASE-15; ACC-CASE-16; ACC-CASE-17; phần read của ACC-CASE-28 | Chưa nối lương R8 thì ghi chưa đủ dữ liệu, không số 0 giả |
| R8 — Việc/dịch vụ/thu nhập | ACC-CASE-18; ACC-CASE-19; ACC-CASE-20 | Rule fixture không trở thành chính sách lương đã duyệt |
| R9 — Cổng thợ/khách | ACC-CASE-03; ACC-CASE-04; ACC-CASE-21; ACC-CASE-22 | Người nhận hàng không mặc định được xem công nợ |
| R10 — Lộ trình/GPS/chat | ACC-CASE-23; ACC-CASE-24; ACC-CASE-25; ACC-CASE-26; phần liên quan của ACC-CASE-28 | Browser foreground, provider/fallback và audience thực |
| R11 — Hóa đơn | ACC-CASE-26; ACC-CASE-27 | Mock không thay sandbox thực; không có khai thuế |
| R12 — Chuẩn bị phát hành | ACC-CASE-29; ACC-CASE-30 và bằng chứng còn hiệu lực của các ca trong phạm vi phát hành | Không tự triển khai chỉ vì người dùng yêu cầu QA |
| Tiền và kho | ACC-CASE-05; ACC-CASE-06; ACC-CASE-10 đến ACC-CASE-20; ACC-CASE-26 khi có job ghi tiền | Không bỏ kiểm quyền theo actor của ca đang thử |
| Chủ thử luồng vận hành | ACC-CASE-07; ACC-CASE-08; ACC-CASE-09; ACC-CASE-17; ACC-CASE-21; ACC-CASE-22 | Chỉ phần người dùng quan sát được; backend chưa kiểm vẫn NOT_RUN |
| Toàn hệ thống | Chọn đủ ca áp dụng + đối chiếu phần Spec/UXUI chưa được danh mục đại diện | Thiếu module/provider cần thiết là PARTIAL/BLOCKED, không PASS toàn bộ |

Nghiệm thu không phụ thuộc task QA cũ. Khi mở QA, dùng **phase/scope → ACC case** ở bảng trên, ghi run trong `implementation.md::IMP-ACCEPT-001` và trạng thái phạm vi trong `tasks.md`. Không tạo một task lập trình cho từng case.


# ACC-040 — Chuẩn bị một lần cho phạm vi đang thử

Ghi run id, chỉ thị của chủ, phạm vi, bản code/tree, DOCSET, migration/schema, môi trường và cách kiểm. Không cần lập bản báo cáo dài trước từng ca.

**An toàn:** xác minh host/project DB local; sandbox provider nếu cần. Không dùng credentials Production trong test/build. Không sao chép PII/ảnh thật vào Git hoặc log. Dữ liệu thử dùng prefix `HXQA-<run_id>` và dọn theo manifest chỉ trong DB local, không `DELETE` dữ liệu dùng chung mù.

**Tài khoản thử:** người quản lý được phép; sales không xem giá vốn/lương; kho hoặc điều phối; thợ A/B; khách A/B. Tài khoản của vai trò chỉ tạo khi ca cần. Có hai branch/site nếu đang thử cross-scope. Không test quyền bằng một tài khoản quản trị cho mọi thao tác.

**Dữ liệu:** nạp đúng fixture SPEC-EXAMPLE-001 đến SPEC-EXAMPLE-005 cho nhóm ca dùng chúng. Mỗi ca bắt đầu từ fixture sạch hoặc ghi rõ trạng thái nối tiếp; không để một khoản tiền từ ca trước làm thay số kỳ vọng ca sau. Chính sách CREDIT/CUSTODY/BILLING/COST/PAYROLL/COMMISSION/INVOICE chưa được duyệt chỉ chạy trên fixture có nhãn.

**Công cụ:** browser cho luồng UI; unit/integration/SQL read cho số và ledger; hai session DB thật cho cạnh tranh; harness có điều kiện đo cho hiệu năng. Chỉ nhìn screenshot không chứng minh concurrency/RLS. Không có công cụ phù hợp thì ghi thiếu bằng chứng, không tự suy PASS.

# ACC-050 — Chủ tự nghiệm thu

Chọn 1–2 hành trình cần thử, chuẩn bị dữ liệu giả theo ca rồi thực hiện như công việc thật, không cần đọc toàn bộ file. Ghi lại bước mắc, thông tin phải nhập/tìm lại, kết quả sai và ảnh/mã chứng từ nếu có. Mục tiêu thời gian/thao tác lấy từ UX-TEST-002; ngưỡng API lấy từ SPEC-PERF-002, không coi hai đại lượng là một.

Mẫu ngắn để chủ gửi kết quả:

```text
Phạm vi/bản ứng dụng:
Case đã thử:
Tôi đã làm:
Kết quả thực tế:
Điểm khó hiểu hoặc phải nhập lại:
Ảnh/mã chứng từ (dữ liệu thử):
Kết luận của tôi: đồng ý / cần sửa / chưa thử hết
```

Chủ duyệt kiểu thao tác không làm mọi kiểm kỹ thuật tự PASS. Nếu chỉ nhận báo cáo của chủ, lưu evidence_kind=USER_REPORTED đúng phạm vi; không giả là agent đã chạy SQL/test. Không có số đo thì không ghi p95 hoặc tỷ lệ thành công.

# ACC-060 — Kết quả và mức độ lỗi

Mỗi case có một kết quả: PASS, FAIL, BLOCKED, NOT_RUN hoặc NOT_APPLICABLE có lý do và phạm vi được chủ chấp thuận. Không có provider/môi trường/dữ liệu để thử thì BLOCKED/NOT_RUN, không NOT_APPLICABLE để tránh kiểm. Nếu một case chỉ kiểm phần UI thì ghi PASS phần UI và phần kỹ thuật NOT_RUN, không một PASS chung.

- **Nghiêm trọng:** lộ dữ liệu, mất/sai tiền, double-post, vượt tồn, phát hành hóa đơn trùng, sửa/xóa lịch sử, thao tác Production trái quyền. Dừng phần nguy hiểm và chặn release; không chờ checklist khác hoàn tất.
- **Lớn:** không hoàn thành hành trình chính, sai phạm vi lọc, không phục hồi được đơn/biên nhận, không có phương án thủ công khi provider lỗi.
- **Nhỏ:** trình bày, wording hoặc tương tác phụ không gây sai dữ liệu/đường chính. Ghi rõ và chủ quyết định xử lý; không tự tăng scope.

Tổng hợp QA: PASS chỉ cho phạm vi đã chọn đầy đủ bằng chứng; PARTIAL khi còn phần chưa thử; FAIL khi có lỗi; BLOCKED khi không thể kiểm. `ACCEPTED` là trạng thái nghiệm thu đúng phạm vi có xác nhận cần thiết, do tasks ghi; không đồng nghĩa READY_FOR_RELEASE hoặc quyền deploy. Kết quả cũ bị tác động bởi code/config/schema/requirement mới được đánh dấu OUTDATED, không xóa log cũ.

# ACC-070 — Chỉ LOG và DoD

Dùng một báo cáo cho phiên/phạm vi, không báo từng bước và không in lại 30 ca:

```text
LOG
run=<id>; scope=<phạm vi>; tested=<commit/tree>; mode=<manual/technical/mixed>
cases=<đã chọn>; results=<PASS:n FAIL:n BLOCKED:n NOT_RUN:n N/A:n>
defects=<mã + mức + lỗi có ích>; evidence=<đường dẫn/id thật>; limits=<phần chưa kiểm>
production=<NOT_TOUCHED hoặc phạm vi được phép riêng>

DoD
QA=<PASS/PARTIAL/FAIL/BLOCKED>; owner_review=<đúng phạm vi/NOT_RUN>;
release=<NOT_AUTHORIZED/thiếu điều kiện/...>; next=STOP
```

Log đầy đủ giữ tại artifact cục bộ/CI được phép, implementation chỉ lưu tham chiếu và tóm tắt. Không tự commit/push trong QA nếu chưa được cấp quyền. Log không chứa secret/PII. Không dùng số ca xanh để bỏ qua lỗi nghiêm trọng hoặc requirement chưa kiểm.

# ACC-080 — Đồng bộ mà không tăng context lúc code

Spec/UXUI thay đổi → sửa đúng ca liên quan và reference; không đọc/chạy lại toàn bộ danh mục. Task chỉ tham chiếu ca khi đang ở QA. implementation ghi test thật và phiên bản; tasks ghi trạng thái/phạm vi. Không tự ghi tiêu chí mới ở đây thay vì xin sửa Spec.

Danh mục là bản hướng dẫn kiểm, không có trạng thái mặc định PASS, không chép ba DoD của mỗi task và không mở rộng thành 678 checkbox. Giữ mã ca ổn định; chỉ thêm ca khi yêu cầu/rủi ro thật chưa được bao phủ và phạm vi nghiệm thu cần nó.

# ACC-085 — Coverage delta cho docset 4.4

Giữ 30 nhóm ca hiện có; bảng này bổ sung điều kiện từ `SPEC-GAP-002`, `SPEC-REC-001` đến `SPEC-REC-009` và `UX-930`. Số gap là thứ tự trong `SPEC-GAP-002`, không phải requirement ID mới. Mapping không phải bằng chứng PASS; điều kiện chưa có bằng chứng đúng candidate phải ghi `NOT_RUN`, `BLOCKED` hoặc `FAIL` theo thực tế.

| Known gap | Contract refs | Nhóm ca | Delta phải kiểm bằng thao tác và dữ liệu lưu |
|---|---|---|---|
| 1. Execution/document drift | SPEC-GAP-001; SPEC-GAP-002 | ACC-CASE-01; ACC-CASE-30 | Khóa source/tree, migration ledger, config và fixture; tách kết quả từng build/môi trường. |
| 2. Master-data CRUD | SPEC-REC-001; UX-REC-004 | ACC-CASE-02; ACC-CASE-05; ACC-CASE-08; ACC-CASE-09 | Theo quyền, create/edit/deactivate Customer, Site, Supplier, Material, UOM, conversion, Warehouse, Vehicle, Machine, Branch và pricing/config cần thật; reload đối chiếu dữ liệu và giữ tham chiếu lịch sử. |
| 3. Quote/SO multi-line | SPEC-REC-002; UX-REC-002 | ACC-CASE-07; ACC-CASE-08 | Thêm/xóa dòng, UOM, lượng, giá, nguồn, line/document total; lưu và tải lại nhiều dòng, không mất dòng khác. |
| 4. Quote/SO/PO draft edit | SPEC-REC-003; UX-REC-003 | ACC-CASE-07; ACC-CASE-08; ACC-CASE-09 | Sửa đúng DRAFT: dòng, lượng/UOM, terms/date và override có quyền; SENT/CONFIRMED không sửa lịch sử, dùng action đúng contract. |
| 5. Quick Customer/Site | SPEC-REC-005; UX-REC-002 | ACC-CASE-08 | Tạo cả Customer và Site ngay trong Quote/SO; giữ input hiện có, quay lại và chọn entity mới đúng ID. |
| 6. Price preview/manual | SPEC-REC-004; UX-REC-002 | ACC-CASE-05; ACC-CASE-07; ACC-CASE-08 | Thấy giá/nguồn/tổng trước Save; thiếu rule không mặc định 0; manual + reason thành MANUAL_APPROVED; actor thiếu quyền không nhận cost. |
| 7. PO per-line operations | SPEC-REC-002; SPEC-REC-007; UX-REC-006 | ACC-CASE-09; ACC-CASE-10; ACC-CASE-12 | PO nhiều dòng; nhận kho/giao thẳng chọn line cụ thể, thử lần lượt hai dòng; Supplier workspace nối receipts/direct fulfillment/AP/payment. |
| 8. Delivery multi-line | SPEC-REC-002; SPEC-OPS-001 | ACC-CASE-11; ACC-CASE-12; ACC-CASE-13 | Actual/accepted/billable/return theo từng dòng; kho, AR/AP theo đúng nguồn; lịch giờ nghiệp vụ lưu instant đúng và hiển thị đúng sau reload. |
| 9. Customer 360 | SPEC-REC-007; UX-REC-005 | ACC-CASE-08; ACC-CASE-17; ACC-CASE-22 | Profile/Sites/Pricing/Quotes/Orders/Deliveries/AR/Payments/Documents; CTA theo quyền; từ Site tạo SO prefill Customer/Site. |
| 10. Bounded core lists | SPEC-REC-006; UX-REC-007 | ACC-CASE-02; ACC-CASE-28 | Orders/Quotes/PO/Customers/Suppliers/Deliveries/AR/AP/ServiceJob: search/filter phía server, bounded page/cursor, sort ổn định, URL và Back; không chỉ lọc tập đầu tiên ở client. |
| 11. Dashboard completion | SPEC-REC-008; UX-REC-008 | ACC-CASE-16; ACC-CASE-17; ACC-CASE-20 | Expense breakdown, commission summary/detail, AR/AP drill-down giữ filter; tìm/chọn khách ngoài tập option ban đầu, reload không mất lựa chọn; không số giả khi quality khác READY. |
| 12. Real shell identity | UX-REC-009 | ACC-CASE-03; ACC-CASE-04 | Actor/branch/org từ server context thật, đổi role/branch cho đúng; không demo identity trong UI Production. |
| 13. PaymentNotice entry | SPEC-REC-008; UX-REC-010 | ACC-CASE-15; ACC-CASE-22 | Tìm được queue từ Finance/Cần xử lý; review không tự tạo Payment hoặc giảm debt. |
| 14. Customer order detail | UX-REC-011; SPEC-CUSTPORTAL-001; SPEC-CUSTPORTAL-002 | ACC-CASE-04; ACC-CASE-22 | State, delivery timeline, debt/payment và documents customer-safe; đổi ID/file kiểm không lộ supplier/cost/margin/internal notes. |
| 15. Access management | UX-REC-012 | ACC-CASE-03; ACC-CASE-04 | Assign/change role và branch access, revoke/reactivate, explicit permissions; reason/audit theo Spec; request kế tiếp bị chặn sau revoke. |
| 16. Settings hub | SPEC-REC-001; SPEC-REC-008; UX-REC-013 | ACC-CASE-02; ACC-CASE-05 | Navigation theo quyền tới master/config cần thật, forms thực hiện được; không generic engine. |
| 17. Reports | SPEC-REC-008; UX-REC-013 | ACC-CASE-16; ACC-CASE-17 | Selector, shared filters, summary/table/chart, export khi contract cần; số đối chiếu canonical sources cùng scope. |
| 18. Audit log | SPEC-REC-008; UX-REC-013 | ACC-CASE-03; ACC-CASE-07; ACC-CASE-09; ACC-CASE-15; ACC-CASE-19 | Actor/entity/action/time filters, human-readable summary trước raw detail; action nhạy cảm truy vết đúng actor/source. |
| 19. Low stock | SPEC-REC-008; SPEC-CONFIG-004; UX-REC-014 | ACC-CASE-14 | Threshold material + warehouse; available dưới ngưỡng tạo warning dẫn Inventory và draft PO, không tự đặt hàng. |
| 20. Print/export | SPEC-REC-009 | ACC-CASE-07; ACC-CASE-11; ACC-CASE-15; ACC-CASE-17 | Quotation PDF, Delivery Note, Receipt/Payment Voucher và Debt Reconciliation; trace source/snapshot, access đúng và không gọi là hóa đơn thuế. |
| 21. R10 | SPEC-GAP-002 | ACC-CASE-23; ACC-CASE-24; ACC-CASE-25; ACC-CASE-26 | Route provider/plan/apply, foreground GPS, messaging và navigation theo contract; sandbox thiếu vẫn BLOCKED, không gửi thật. |
| 22. R11 | SPEC-GAP-002 | ACC-CASE-26; ACC-CASE-27 | Provider-neutral domain/coverage/eligibility/draft/approval/documents/UI riêng integration; issue không tạo AR/revenue mới, UNKNOWN reconcile trước retry cùng intent. |
| 23. R12 | SPEC-GAP-002 | ACC-CASE-29; ACC-CASE-30 | Migration case thật, clean schema, reconcile, security/accessibility/performance, backup/recovery/write fence/approval package; release Production cần chỉ thị riêng. |

Không nâng bằng chứng 4.2 thành PASS 4.4 chỉ vì sửa header. Chỉ `REUSED` khi input liên quan không đổi và bằng chứng cũ thực sự bao phủ điều kiện; phần delta còn thiếu giữ trạng thái riêng. Hiệu năng lấy ngưỡng duy nhất từ Spec.md, không sao chép budget vào bảng này. UAT thiết bị thật, provider sandbox, managed recovery và quyết định Owner không bị thay bằng kết quả unit/build.

# ACC-100 — Danh mục hành trình và rủi ro

Mỗi ca bên dưới có cách thử và kết quả cần đối chiếu. Đọc đúng ca đã chọn tại ACC-030. Không lặp những phần chuẩn bị chung ở ACC-040.

## ACC-CASE-01 — Hồ sơ nền, dữ liệu và ranh giới Production

**Phạm vi:** R0 · **Cách kiểm:** QA tài liệu/chỉ đọc.

**Đọc nguồn:** SPEC-MIG-001; SPEC-MIG-004; SPEC-SEC-005; PLAN-040.

**Chuẩn bị:** Hồ sơ R0 và nguồn đã được cho phép đọc; chưa có DB access phải ghi rõ.

**Thử:** Đối chiếu repo/archive, migration inventory, dữ liệu thật/giả, open AR/AP và tồn; kiểm nguồn/thời điểm/giới hạn của từng kết luận. Đọc cấu hình deployment ở phạm vi được phép, không thay nó.

**Đối chiếu:** Không suy trạng thái DB từ Git. Mapping dữ liệu và rủi ro có bằng chứng; READY_FOR_DESIGN không bị gọi READY_FOR_SCHEMA/RELEASE. Chưa có quyền DB không được ghi audit DB xong.

**Log cần giữ:** Nguồn refs/query read-only, cutoff, các phần chưa xác minh; không chứa secrets.

## ACC-CASE-02 — Mẫu thao tác kiểu Sapo, không phải chỉ duyệt màu

**Phạm vi:** R1 · **Cách kiểm:** Chủ thử hoặc browser trên mẫu.

**Đọc nguồn:** SPEC-JOURNEY-001; SPEC-JOURNEY-005; UX-FLOW-001; UX-TEST-001; UX-TEST-002.

**Chuẩn bị:** Prototype gắn nhãn dữ liệu giả; chọn vai trò bán hàng, chủ/tài chính và hiện trường khi có người thử.

**Thử:** Thử tạo đơn điện thoại, đặt NCC từ đơn, xem nợ và thu nhiều đơn; mở khách/công trình từ đúng ngữ cảnh. Thử quay lại, nhập sai, mạng lỗi và màn nhỏ theo UX.

**Đối chiếu:** Không nhập/tìm lại dữ liệu đã biết; luôn thấy mã và bước tiếp. Không wizard dài cho đơn đơn giản. Agent tự bấm không thay lời người dùng chấp nhận; mock không chứng minh ledger/quyền thật.

**Log cần giữ:** Bước cần trợ giúp, thời gian thực, lỗi giá/UOM/công trình, ảnh hoặc video route/state nếu có.

## ACC-CASE-03 — Đăng nhập, quên mật khẩu, thu hồi và thiết bị dùng chung

**Phạm vi:** R2/R9 · **Cách kiểm:** Browser + QA kỹ thuật.

**Đọc nguồn:** SPEC-SEC-001; SPEC-ACC-001; SPEC-ACC-002; UX-AUTH-001.

**Chuẩn bị:** Các tài khoản thử được cấp đúng quyền, phương thức xác thực provider thật ở môi trường local/test.

**Thử:** Đăng nhập đúng/sai từng cổng, dùng recovery được hỗ trợ; hết phiên rồi quay lại bản nháp. Khóa một nhân viên/membership khi phiên cũ còn sống. Đăng xuất rồi đổi người trên cùng thiết bị.

**Đối chiếu:** Không redirect vòng, không dùng chung danh tính, quyền đã thu hồi chặn lần đọc/ghi nhạy cảm tiếp theo. Người sau không thấy cache tiền/tài liệu của người trước; chưa có SMS/email test thì recovery đó NOT_RUN.

**Log cần giữ:** Route/action/session test và kết quả từ endpoint, không lưu OTP/token.

## ACC-CASE-04 — Không rò quyền qua URL, API, tệp, trường và cache

**Phạm vi:** R2/R9/R12 · **Cách kiểm:** QA kỹ thuật bắt buộc cho release.

**Đọc nguồn:** SPEC-ACC-004; SPEC-ACC-005; SPEC-SEC-002; SPEC-SEC-003; SPEC-CACHE-003.

**Chuẩn bị:** Actor sales thiếu quyền vốn/lương, khách A/B và actor khác branch; object và tệp đã có.

**Thử:** Dùng URL/API/RPC thật và request bị sửa ownership/source ID. Kiểm DTO, view, Storage, cache và các kết nối realtime liên quan; thử lại sau revoke. Chạy ca allowed cạnh ca deny.

**Đối chiếu:** Không tin body actor/customer/branch; không fetch rồi CSS hide. Không suy giá vốn từ các trường được trả trái quyền. Signed URL còn TTL phải được mô tả đúng, không giả thu hồi tức thì mọi URL cũ.

**Log cần giữ:** Endpoint/actor/object đã ẩn danh, response/grant/RLS/view tests thực; ảnh nút ẩn không đủ.

## ACC-CASE-05 — Giá riêng và chuyển đổi bao/tấn giữ snapshot

**Phạm vi:** R3/R4 · **Cách kiểm:** Chủ thử + số học/DB.

**Đọc nguồn:** SPEC-CONFIG-001; SPEC-CONFIG-002; SPEC-DATA-002; SPEC-PRI-001; SPEC-EXAMPLE-001.

**Chuẩn bị:** Fixture xi măng ở SPEC-EXAMPLE-001 và một vật tư bao 40 kg để bắt lỗi quy đổi global.

**Thử:** Đặt quy cách bằng form; chọn khách có giá riêng, nhập theo tấn rồi xem bao. Chốt đơn, đổi bảng giá/quy đổi cho giao dịch mới và mở lại đơn cũ. Thử vật tư chưa có giá/quy đổi.

**Đối chiếu:** 20 bao loại 50 kg tương đương 1 tấn; snapshot đơn cũ không đổi. Không tự dùng hệ số 1/giá 0. Bao 40 kg không bị biến thành 50 kg; % không là trường bắt buộc với nhân viên.

**Log cần giữ:** Giá gợi ý/source, snapshot DB và phép tính exact; nhãn đơn vị trên UI.

## ACC-CASE-06 — Hạn mức không bị hai đơn đồng thời vượt qua

**Phạm vi:** R3/R4 · **Cách kiểm:** QA DB/concurrency.

**Đọc nguồn:** SPEC-CRE-001; SPEC-CRE-002; SPEC-CRE-003; SPEC-CON-003.

**Chuẩn bị:** Policy credit fixture rõ; khách có exposure và hai đơn tổng vượt phần hạn mức còn lại.

**Thử:** Chốt hai đơn bằng hai session cạnh tranh, thử nợ quá hạn và override có/không quyền; chuyển một phần cam kết sang AR rồi thanh toán theo kernel.

**Đối chiếu:** Không cộng cam kết và AR hai lần, không chốt cả hai đơn vượt limit ngoài phê duyệt. Override có actor/reason; fixture không là policy Production được duyệt.

**Log cần giữ:** Command thật + hai session, exposure trước/sau và audit, không giả cạnh tranh bằng gọi tuần tự.

## ACC-CASE-07 — Báo giá mẫu, phiên bản và đồng ý qua điện thoại/Zalo

**Phạm vi:** R4 · **Cách kiểm:** Chủ thử + QA giao dịch.

**Đọc nguồn:** SPEC-QUO-003; SPEC-QUO-004; SPEC-CONFIG-003; UX-310.

**Chuẩn bị:** Khách/công trình và báo giá nhiều dòng; mẫu báo giá đã cấu hình.

**Thử:** Xuất báo giá, ghi nhận đã gửi, lập revision mới rồi thử sửa/chấp nhận revision cũ. Nhân viên ghi nhận khách đồng ý qua điện thoại kèm căn cứ; tạo đơn từ revision hợp lệ.

**Đối chiếu:** PDF đã gửi cố định theo revision; không sửa bản SENT. Không bắt khách có portal mới bán được. Đồng ý báo giá không tự ghi nợ hoặc tự vượt hạn mức; retry không tạo hai kết quả.

**Log cần giữ:** PDF/checksum/version, UI, SO reference và audit acceptance; không gửi khách thật.

## ACC-CASE-08 — Đơn điện thoại và hồ sơ khách nối xuyên màn

**Phạm vi:** R3/R4 · **Cách kiểm:** Chủ thử + QA nguồn.

**Đọc nguồn:** SPEC-JOURNEY-002; SPEC-JOURNEY-003; SPEC-SO-002; UX-FLOW-002; UX-FLOW-004; UX-FLOW-009.

**Chuẩn bị:** Khách cũ nhiều công trình, khách mới cần thêm nhanh; sales đúng quyền.

**Thử:** Tạo đơn từ hồ sơ công trình; tạo khách nhanh từ form đang nhập; nhập ba dòng rồi đổi customer/site và quan sát giá bị ảnh hưởng. Tạo đơn trực tiếp không qua Quote.

**Đối chiếu:** Ngữ cảnh giữ đúng ID, không gộp khách chỉ vì tên/điện thoại giống. Giá nhập tay không bị thay ngầm. Sau lưu có mã và bước tiếp; confirm SO chưa tạo AR/stock movement.

**Log cần giữ:** Chuỗi thao tác và số lần nhập lại; DB effects sau confirm; không chỉ kiểm có route.

## ACC-CASE-09 — Mua giao thẳng từ hai điểm vào, không hai giá bán

**Phạm vi:** R5 · **Cách kiểm:** Chủ thử + QA liên kết.

**Đọc nguồn:** SPEC-SRC-001; SPEC-SRC-003; SPEC-CONFIG-002; SPEC-JOURNEY-002; UX-FLOW-003.

**Chuẩn bị:** Một SO thiếu nguồn, một tình huống bắt đầu từ PO chưa có SO; có NCC.

**Thử:** Từ SO đặt NCC giao thẳng; từ PO chọn giao kho/giao khách, gắn SO hoặc tạo hai bản nháp liên kết. Thử gửi lại request và split nhiều nguồn.

**Đối chiếu:** Chỉ một giá bán canonical ở SO, giá mua ở PO; retry không nhân đôi bản bán. Hai bản nháp không tự chốt. PO confirm không tạo AP/stock; xe NCC không buộc có tài xế nội bộ giả.

**Log cần giữ:** IDs SO line/allocation/PO line, snapshots và trạng thái; khâu giao chờ R6 nếu chưa có.

## ACC-CASE-10 — Nhận NCC vào kho, phải trả đúng một lần

**Phạm vi:** R6 · **Cách kiểm:** QA DB + màn nhận.

**Đọc nguồn:** SPEC-OPS-001; SPEC-FIN-003; SPEC-OPS-002; SPEC-PUR-002.

**Chuẩn bị:** PO kho đã chốt; lượng nhận thực khác lượng đặt, giá mua snapshot.

**Thử:** Xác nhận nhận thực; thử retry và lỗi giữa nhập kho–ghi AP. Sau đó gắn hóa đơn mua vào khi module có.

**Đối chiếu:** On-hand/AP từ cùng nguồn nhận; hàng chưa bán chưa thành giá vốn bán. Lỗi nội bộ rollback cùng transaction; retry một lần tác động. Hóa đơn NCC tới sau không tạo AP lần hai.

**Log cần giữ:** Movement/AP/cost source và transaction tests; invoice registry phần chưa có ghi NOT_RUN.

## ACC-CASE-11 — Giữ hàng, lên xe, giao một phần, nhận lại hàng

**Phạm vi:** R6 · **Cách kiểm:** Chủ thử + QA DB.

**Đọc nguồn:** SPEC-INVTRY-003; SPEC-OPS-001; SPEC-EXAMPLE-001.

**Chuẩn bị:** Fixture xi măng SPEC-EXAMPLE-001, chưa thu tiền và chưa duyệt thêm chi phí.

**Thử:** Giữ 20 bao, bàn giao 20 lên xe, khách nhận/tính tiền 19, nhận lại một bao về kho. Thử lại lệnh verify cùng source.

**Đối chiếu:** Tại kho/cuối = 81 bao, đang giao = 0; AR/doanh thu = 2.850.000đ, giá vốn đã bán = 1.140.000đ theo fixture. Không trừ kho hai lần; tổng sở hữu đúng ở từng bước.

**Log cần giữ:** Movement/custody/reservation/AR theo nguồn trước–sau và replay/duplicate check.

## ACC-CASE-12 — NCC giao thẳng lệch lượng khách nhận

**Phạm vi:** R6 · **Cách kiểm:** QA DB + đối soát UI.

**Đọc nguồn:** SPEC-EXAMPLE-002; SPEC-OPS-001; SPEC-DATA-001.

**Chuẩn bị:** Fixture NCC 19,5 m³ và khách 19 m³ ở SPEC-EXAMPLE-002.

**Thử:** Xác minh căn cứ NCC và lượng tính khách riêng; lặp request; xem hồ sơ chênh lệch và chi phí.

**Đối chiếu:** AP 3.900.000đ, AR 5.700.000đ; không movement kho giả. Không sửa lượng NCC cho bằng khách. Chi phí lệch đã nằm trong tổng không cộng hao hụt lần hai.

**Log cần giữ:** PO/allocation/delivery/AP/AR/cost links và lượng riêng trên UI.

## ACC-CASE-13 — Hủy, giao thất bại, trả hàng và hoàn tiền là các bước khác nhau

**Phạm vi:** R6/R7/R11 · **Cách kiểm:** Chủ thử + QA DB.

**Đọc nguồn:** SPEC-OPS-003; SPEC-DATA-001; SPEC-CONFIG-003; UX-870; UX-FLOW-007.

**Chuẩn bị:** Đơn chưa giao, đơn giao một phần và đơn đã giao/thu tiền; fixture độc lập cho mỗi nhánh.

**Thử:** Hủy phần còn lại; báo chuyến thất bại khi hàng đã lên xe; nhận trả; tạo điều chỉnh có lý do/ảnh; hoàn tiền bằng command riêng nếu được phép.

**Đối chiếu:** Không tự tăng kho khi chỉ báo FAILED. Hủy không xóa delivery/AR đã ghi. Nhận trả không tự refund; refund không tự nhận hàng; không trả vượt lượng gốc. Hóa đơn điều chỉnh không giảm AR lần hai.

**Log cần giữ:** Nhánh nào chưa có ghi NOT_RUN; source/reversal/delta/movement/evidence và người duyệt.

## ACC-CASE-14 — Kiểm kê có giao dịch xen kẽ, giữ hàng cạnh tranh và cảnh báo thấp tồn

**Phạm vi:** R6 · **Cách kiểm:** QA DB/concurrency + UI.

**Đọc nguồn:** SPEC-INVTRY-004; SPEC-INVTRY-005; SPEC-CONFIG-004.

**Chuẩn bị:** Kho có movements; một đợt kiểm kê có cutoff và ngưỡng nhập thêm.

**Thử:** Tạo count, phát sinh movement sau cutoff, nhập kết quả rồi phê duyệt delta. Hai người giữ phần tồn không đủ cho cả hai. Cho available vượt xuống ngưỡng lặp nhiều lần.

**Đối chiếu:** Không set balance bằng số đếm cũ bỏ qua movement sau đó. Không oversubscribe. Cảnh báo gộp/chống lặp, dẫn tới nguồn kho/PO nháp; không tự mua hàng. Không tạo scheduler phức tạp chỉ để kiểm.

**Log cần giữ:** System/count/cutoff/delta, hai session thật, alert dedupe và route chi tiết.

## ACC-CASE-15 — Một khoản trả nhiều đơn, tiền dư, đảo và mất phản hồi

**Phạm vi:** R3/R7 · **Cách kiểm:** QA kỹ thuật + chủ xem phân bổ.

**Đọc nguồn:** SPEC-FIN-005; SPEC-FIN-006; SPEC-FIN-007; SPEC-EXAMPLE-003; SPEC-EXAMPLE-005.

**Chuẩn bị:** Fixture A=2.000.000đ, B=1.000.000đ, thu 2.500.000đ theo Spec; nhánh riêng cho advance/refund.

**Thử:** Phân bổ A đủ, B một phần; thử hai người allocate phần B còn lại. Đảo khoản thu và xem lịch sử. Mô phỏng commit thành công nhưng response mất, retry cùng operation; thử khóa cũ payload khác.

**Đối chiếu:** B còn 500.000đ trước đảo; payment không còn tiền khả dụng. Không overallocate hoặc ghi thu trùng. Reversal giữ dấu vết, tiền dư là advance/chưa phân bổ đúng nguồn, không AR âm tùy tiện.

**Log cần giữ:** Allocation/kernel thật, balances trước–sau, row locks và idempotency responses.

## ACC-CASE-16 — Dashboard cùng phạm vi, lịch sử và chi phí đầy đủ

**Phạm vi:** R7 · **Cách kiểm:** Chủ thử + QA tổng hợp DB.

**Đọc nguồn:** SPEC-DASH-005; SPEC-REPORT-001; SPEC-REPORT-002; SPEC-REPORT-003; SPEC-EXAMPLE-004; UX-860.

**Chuẩn bị:** Fixture khoản nợ lịch sử và công trình ở SPEC-EXAMPLE-004; có cả chi phí trực tiếp/chung và metric thiếu dữ liệu.

**Thử:** Lọc kỳ/branch/sales/khách/công trình; mở kỳ trước khoản thu; đổi chi phí và kiểm source. Xem thiếu giá vốn/lương, actor thiếu quyền và dữ liệu lỗi.

**Đối chiếu:** Kỳ cũ vẫn AR 100 triệu dù kỳ sau thu 60 triệu; công trình GP 5 triệu, OP NOT_APPLICABLE khi Opex chưa phân bổ theo fixture. Không 0 giả hoặc công thức khác scope; payment không tạo P&L lần hai.

**Log cần giữ:** Query facts/cutoff, quality marker, UI filter scope; không khẳng định toàn Dashboard đủ khi nguồn R8 chưa có.

## ACC-CASE-17 — Từ Dashboard thu/chi trực tiếp không tìm lại đối tượng

**Phạm vi:** R7 · **Cách kiểm:** Chủ thử + QA giao dịch.

**Đọc nguồn:** SPEC-DASH-006; SPEC-JOURNEY-004; UX-FLOW-005; UX-DASH-005; UX-DASH-006; UX-860.

**Chuẩn bị:** Có công trình A/B cùng khách và NCC còn AP; dashboard đang dùng một bộ lọc hoặc kỳ cũ.

**Thử:** Bấm dòng nợ, mở thu/chi, xem số dư hiện tại, phân bổ, gửi và quay lại bằng Back. Thử khoản nhiều công trình chỉ sau khi mở rộng phạm vi có chủ đích.

**Đối chiếu:** Một thao tác mở đúng chi tiết, không search lại; form thu dùng số dư hiện tại không số lịch sử. Không tự trả sang công trình khác; filters/focus giữ, kết quả hiện chứng từ và số dư.

**Log cần giữ:** Screen steps/action counts, filter/URL state, payment/allocation đúng account/site/source.

## ACC-CASE-18 — Dịch vụ theo giờ: thực làm, tính khách, trả công tách riêng

**Phạm vi:** R8 · **Cách kiểm:** Chủ thử + QA DB.

**Đọc nguồn:** SPEC-SRV-001; SPEC-SRV-002; SPEC-OPS-001; UX-410.

**Chuẩn bị:** ServiceJob máy/đào móng hoặc vận chuyển; fixture có ba lượng/giờ khác nhau và rate rõ.

**Thử:** Ghi WorkLog, xác minh thực làm, phê duyệt lượng tính tiền và cơ sở tính công riêng; chạy lại lệnh nguồn.

**Đối chiếu:** AR theo lượng tính khách; earning theo cơ sở trả công, không sao chép nguyên doanh thu. Không ghi tiền khi chỉ lưu work log chưa duyệt. Rate/period lịch sử không đổi theo bảng mới.

**Log cần giữ:** WorkLog, billable/compensable snapshots, AR/cost/earning nguồn và audit.

## ACC-CASE-19 — Bể việc: đúng người, đúng nguồn và không ôm trùng tài nguyên

**Phạm vi:** R8/R9 · **Cách kiểm:** QA concurrency + worker UI.

**Đọc nguồn:** SPEC-OPS-004; SPEC-WRK-003; SPEC-EXAMPLE-005.

**Chuẩn bị:** WorkItem đủ điều kiện và một việc chưa có nguồn; hai thợ/tài nguyên có lịch cạnh tranh.

**Thử:** Hai thợ nhận cùng việc; một thợ nhận hai việc xung đột. Thử gửi offline bằng assignment version cũ, bỏ lỡ heartbeat và cảnh báo sau thời gian cấu hình.

**Đối chiếu:** Chỉ một người thắng; eligibility/readiness/lịch được kiểm. Việc chưa đủ nguồn không publish. Đang làm không tự hủy/phạt vì mất heartbeat; version cũ không ghi đè người mới.

**Log cần giữ:** Hai session thật, assigned version, UI người thua và log cảnh báo; không thử khi đang lái xe.

## ACC-CASE-20 — Lương, sản lượng và hoa hồng không thành chi phí hai lần

**Phạm vi:** R8/R7 · **Cách kiểm:** QA số học/DB + chủ xem.

**Đọc nguồn:** SPEC-COMP-003; SPEC-COMP-004; SPEC-COMP-005; SPEC-REPORT-003; SPEC-PRODUCT-005.

**Chuẩn bị:** Rule fixture riêng nhân viên, giờ/sản lượng và một commission trên lãi trước commission; tiền đã trả một phần.

**Thử:** Duyệt earning, chia direct/OPEX đúng nguồn, chi một phần rồi xem khoản còn phải chi. Đổi rule ngày sau, điều chỉnh đơn bị trả và xem earning cũ.

**Đối chiếu:** Mỗi earning một cost fact; chi tiền chỉ tất toán. Không vòng tính profit sau chính commission. Thiếu rule approved không tự dùng 0%/5%. Role truy cập đổi không tự đổi hợp đồng lương.

**Log cần giữ:** Rule/version/basis/rate/cost/payment links; Dashboard salary/commission không chồng lặp.

## ACC-CASE-21 — Cổng thợ: gửi bằng chứng khi ảnh hoặc mạng lỗi

**Phạm vi:** R9 · **Cách kiểm:** Chủ/thợ thử + QA operation.

**Đọc nguồn:** SPEC-WRK-005; SPEC-DATA-005; UX-FLOW-006; UX-WORK-006; UX-850.

**Chuẩn bị:** Điện thoại hoặc viewport theo UXUI, việc được giao đúng thợ, có ảnh giả.

**Thử:** Mở việc, nhập lượng thiếu, chụp/tải ảnh, ngắt mạng rồi thử lại riêng upload; mô phỏng mất response sau submit và đăng xuất thiết bị chung.

**Đối chiếu:** Không mất form, không tạo hai kết quả; phân biệt chưa gửi/chờ xác minh/đã xác minh. Không yêu cầu thao tác khi lái, không hiển thị tiền đã trả từ DONE; dữ liệu nhạy cảm local xử lý đúng policy.

**Log cần giữ:** Bước người dùng, form state, upload/operation IDs và persisted result; ảnh giả không có PII.

## ACC-CASE-22 — Cổng khách: báo giá, đơn, công nợ và ảnh chuyển khoản

**Phạm vi:** R9 · **Cách kiểm:** Chủ/khách thử + QA nguồn.

**Đọc nguồn:** SPEC-CUSTPORTAL-001; SPEC-CUSTPORTAL-002; SPEC-FIN-008; UX-CUST-003; UX-CUST-005.

**Chuẩn bị:** Khách A có quote/order/AR/tài liệu, khách B và người nhận-only.

**Thử:** Accept revision hợp lệ, xem đơn/giao/nợ và tải file có quyền. Gửi ảnh chuyển khoản rồi xem debt; Finance xác minh và post sau bằng command riêng.

**Đối chiếu:** Notice không giảm công nợ; chỉ Payment thật mới giảm đúng phần. Receiver không có toàn AR. Dữ liệu/URL/file B bị chặn; không lộ giá mua, lãi, ghi chú nội bộ.

**Log cần giữ:** Membership scopes, quote/payment notice/payment IDs, file responses và lời dẫn trạng thái.

## ACC-CASE-23 — Lộ trình chỉ đề xuất, Apply không lấy việc người khác

**Phạm vi:** R10 · **Cách kiểm:** QA chức năng + concurrency.

**Đọc nguồn:** SPEC-ROUTE-001; SPEC-ROUTE-002; SPEC-ROUTE-003; SPEC-DATA-004; UX-400.

**Chuẩn bị:** Chuyến READY, tải/giờ thực và một việc POOL_CLAIM; provider sandbox hoặc failure simulator rõ.

**Thử:** Tạo plan, xem assignment trước Apply; đổi assignment bởi actor khác rồi Apply bản cũ. Thử provider lỗi, dữ liệu thời gian/tải thiếu và sắp tay.

**Đối chiếu:** Không mutation trước Apply, version stale phải conflict; không cướp claim. Tải từng chặng và giờ địa phương đúng nguồn. Provider thiếu hạn chế đường không được quảng cáo route chắc chắn đi được.

**Log cần giữ:** Plan/assignment versions, stop/capacity calculations và manual fallback; map giả không là provider integration PASS.

## ACC-CASE-24 — GPS foreground, điểm cũ và quyền thu hồi

**Phạm vi:** R10 · **Cách kiểm:** QA kỹ thuật + thiết bị thử.

**Đọc nguồn:** SPEC-GPS-001; SPEC-GPS-003; SPEC-DATA-004.

**Chuẩn bị:** Phiên active được giao đúng worker/vehicle; đã xin phép vị trí.

**Thử:** Gửi điểm mới rồi điểm cũ, đổi assignment, thu hồi quyền, mất mạng và đưa browser ra nền. Kiểm màn điều phối và cổng khách.

**Đối chiếu:** Không ghi đè vị trí mới bằng packet cũ; deny sau revoke/version sai. Có LIVE/STALE đúng cấu hình, không đổi trạng thái Delivery từ GPS. Không hứa tracking liên tục khi khóa màn; không lộ raw tọa độ khách ngoài policy.

**Log cần giữ:** Permission/sequence/version/received timestamps, consent và UI freshness; giới hạn thiết bị nếu chưa thử thật.

## ACC-CASE-25 — Chat không thành lệnh và không lộ lịch sử nội bộ

**Phạm vi:** R10 · **Cách kiểm:** QA kỹ thuật + UI.

**Đọc nguồn:** SPEC-MSG-001; SPEC-MSG-002; SPEC-MSG-003; SPEC-SEC-003.

**Chuẩn bị:** Hai hội thoại internal/customer tách audience, thành viên sẽ bị revoke.

**Thử:** Gửi “đã giao/đã chuyển tiền”, retry cùng message id, reconnect sau mất event, nhận out-of-order rồi revoke participant.

**Đối chiếu:** Tin nhắn durable một lần, refetch lấy nguồn DB; unread/last message không cần full history. Không tạo Delivery confirm/Payment/Quote acceptance. Không đổi audience để lộ lịch sử; revoke chặn lần đọc mới.

**Log cần giữ:** Message IDs/database result, realtime reconnect, membership/Storage checks; không chỉ ảnh UI.

## ACC-CASE-26 — Job bền vững, crash và kết quả provider chưa xác định

**Phạm vi:** R10/R11 · **Cách kiểm:** QA kỹ thuật local/sandbox.

**Đọc nguồn:** SPEC-SEC-004; SPEC-IDEM-001; SPEC-EINV-004; SPEC-PERF-003.

**Chuẩn bị:** Runner được cấu hình cục bộ; job có dedupe/lease và provider giả lập hoặc sandbox ghi rõ.

**Thử:** Chạy hai runner nhận job, crash sau external call trước persist result, hết lease, retry/backoff và lỗi quá lượt.

**Đối chiếu:** Một logical operation; không giữ DB transaction chờ provider, không fire-and-forget sau response. Kết quả có thể đã xảy ra bên ngoài phải reconcile trước gọi lặp; exhausted có đường can thiệp.

**Log cần giữ:** Job/attempt/lease/provider reference và fault-injection log; mock chỉ chứng minh hợp đồng.

## ACC-CASE-27 — Hóa đơn bán/mua, số lượng còn được lập và sửa sai

**Phạm vi:** R11 · **Cách kiểm:** QA tích hợp sandbox + kỹ thuật.

**Đọc nguồn:** SPEC-EINV-002; SPEC-EINV-003; SPEC-EINV-004; SPEC-EINV-006; SPEC-CONFIG-003; UX-470.

**Chuẩn bị:** Provider sandbox/timing/signing và policy đã xác nhận; nguồn billable/AR, invoice coverage và AP mua có sẵn.

**Thử:** Lập draft đúng lượng chưa lập, approve, issue hai lần/callback lặp/timeout. Đối chiếu legal result, tải tài liệu customer-safe; điều chỉnh/thay thế và gắn invoice NCC vào PO/AP.

**Đối chiếu:** Không invoice vượt coverage, không số pháp lý giả, UNKNOWN được reconcile. Lịch sử hóa đơn gốc giữ nguyên; không AR/AP lần hai. Chưa có sandbox thật thì phần tích hợp BLOCKED, không nhận mock làm PASS.

**Log cần giữ:** Provider request/ref/result/doc checksums, correction chain, coverage và AR/AP trước–sau; tuyệt đối không xuất thật để thử.

## ACC-CASE-28 — Đo thời gian phản hồi và thao tác trên dữ liệu đại diện

**Phạm vi:** R7/R10/R12 · **Cách kiểm:** QA hiệu năng khi được yêu cầu.

**Đọc nguồn:** SPEC-PERF-002; SPEC-PERF-003; SPEC-PERF-004; SPEC-BE-004; UX-TEST-002.

**Chuẩn bị:** Dataset/migrations/code/config cố định cục bộ, điều kiện vùng máy/DB và tải đồng thời được ghi.

**Thử:** Đo KPI/useful content/list/drawer/command và report theo phạm vi; ghi mẫu lạnh/ấm, số mẫu, p50/p95/p99/errors/payload/query plan. Dùng người thử riêng để đo thời gian tác vụ.

**Đối chiếu:** So đúng budget Spec, không copy target thành số đo. Không N+1/over-fetch; không che thời gian bằng 202 nếu intent chưa bền vững. Lệnh quá ngưỡng giữ operation id, không thông báo thất bại chắc chắn rồi tạo lại.

**Log cần giữ:** Harness/lệnh/dataset/điều kiện/số mẫu/số đo thực; không load test Production hoặc cam kết dưới ngưỡng mọi mạng.

## ACC-CASE-29 — Migration, số dư đầu kỳ và khôi phục không tính lại lịch sử

**Phạm vi:** R12 · **Cách kiểm:** QA DB trên bản copy cục bộ ẩn danh.

**Đọc nguồn:** SPEC-MIG-002; SPEC-MIG-004; SPEC-DATA-003; SPEC-OPS-002.

**Chuẩn bị:** Xác định migration case thật. Nếu có legacy dataset: mapping R0 được review, bản copy hợp lệ, dataset checksum, V2 schema và kế hoạch chuyển dữ liệu. Nếu legacy Production dataset không còn: ghi `NO_LEGACY_DATA_TO_MIGRATE`, không dựng migration giả; vẫn chuẩn bị clean-schema rehearsal, candidate và recovery/write-fence runbook.

**Thử:** Với legacy case, dry-run chuyển dữ liệu, chạy lại có kiểm soát, đối chiếu ID/quantity/value/open AR/AP/payment/earning. Với cả hai case, rehearsal schema trên môi trường biệt lập, đối chiếu exact migration ledger/source/config, thử khôi phục hoặc phương án bù theo runbook; kiểm source duy nhất trước/sau. Managed backup/restore chưa khả dụng ghi BLOCKED riêng, không thay bằng clean-schema PASS.

**Đối chiếu:** Không double import, không số dư đầu kỳ thành doanh thu. Không recalculate giá/lương/công nợ/hóa đơn đã chốt bằng policy mới. Dữ liệu thiếu không tự vứt; differences có giải thích và người duyệt.

**Log cần giữ:** Mapping/checksums/reconcile before-after/khả năng restore; không backup PII/secrets vào Git.

## ACC-CASE-30 — Chốt phạm vi release và kiểm sau phát hành được cấp phép

**Phạm vi:** R12 · **Cách kiểm:** Kiểm release có quyền riêng.

**Đọc nguồn:** SPEC-430; SPEC-MIG-005; SPEC-SEC-005; PLAN-055; PLAN-070.

**Chuẩn bị:** Candidate/tree/schema/config và phạm vi phát hành đã chốt; nghiệm thu liên quan còn hiệu lực.

**Thử:** Đối chiếu phần chưa QA, lỗi mở, policy/provider approvals, backup/write fence/rollback và exact SHA. Chỉ sau lệnh phát hành riêng mới kiểm bản đã deploy bằng các critical scenarios được phép.

**Đối chiếu:** Không READY_FOR_RELEASE khi tiền/kho/quyền/migration cần thiết chưa kiểm. Không deploy từ lệnh QA. Kiểm sau release không là suite smoke mới hoặc giao dịch tiền/hóa đơn giả trên Production. App rollback không được coi là đảo external effects.

**Log cần giữ:** Phạm vi/approval exact SHA, deployment evidence nếu có, kết quả trước–sau; chưa deploy thì phần hậu kiểm NOT_RUN.

# ACC-900 — Kết thúc một phiên

Kết thúc đúng phạm vi đã mở, ghi LOG + DoD theo ACC-070, cập nhật trạng thái trong tasks và bằng chứng trong implementation khi được phép. Không chuyển một phiên QA thành làm lại kiến trúc hoặc triển khai phase khác. Case lỗi chỉ tạo defect cần xử lý; acceptance không là giấy phép sửa Production.

Bản tài liệu này chưa chạy bất kỳ ca ứng dụng nào. Có file kiểm tra, tên task hoặc checklist không đồng nghĩa có bằng chứng hệ thống đúng.

# KẾT THÚC acceptance.md

## QA RUN STATUS — 2026-09-14

Owner approved implementation of the scoped QA plan. See qa/UAT.md for execution and human-observation steps; Spec.md remains the only performance-budget source.

| Case | Current evidence status |
|---|---|
| ACC-CASE-03/04 | Historical hosted checks: 10 PASS; worker UI check FAIL in latest run; current changes NOT_RUN; human UAT NOT_RUN |
| ACC-CASE-21/22 | Historical hosted Storage PASS (2026-09-14T09-48-56-971Z); human journeys NOT_RUN |
| ACC-CASE-26/27 | BLOCKED/NOT_RUN; invoice provider excluded by owner |
| ACC-CASE-28 | Cloud benchmark INTERRUPTED/FAIL; full representative performance NOT_ESTABLISHED |
| ACC-CASE-29 | BLOCKED_BY_OWNER_DECISION |
| ACC-CASE-30 | NOT_ESTABLISHED; no full-system PASS or release-readiness claim |

Environment blocker: Supabase Dashboard rejects another Free project while HienXaERPv2 and nox-os-preview are active. Production was not used for QA. No human observation or signed URL test has been inferred from local tests.

### Preview handoff — 2026-09-14

Candidate: dpl_D15SjQJxkaLk6W8AbNawTViNHBCe (Vercel Preview, READY).
URL: https://hien-xa-erp-v2-f8lp5epg1-noxelis.vercel.app
QA migration applied. Remote build/TypeScript PASS; worker fix, access management and catalog behavioral acceptance NOT_RUN on this candidate. Historical UAT failure is retained pending rerun. Production unchanged; no full-system PASS claim.

### Scoped defect recheck — 2026-09-27

- Environment: local optimized Next build bound to separate QA project `ffrwiglcrlumfvhubaxg`; exact local build and six new QA migrations checked. Not a hosted Production or cloud-benchmark result.
- ACC-CASE-03/04 technical boundary recheck: 13/13 PASS across six QA roles, including worker assigned-job UI, revocation and logout. Human device journeys NOT_RUN; historical hosted result above remains historical, not silently rewritten.
- Finance defect recheck: full-scope Cashbook KPI matched 111 QA payments; direct Sales Cashbook RPC denied with 42501. AR/AP report exports contained 5,058/5,068 distinct lines; both line sums matched their snapshot totals at fixed cutoffs. Payment allocation retained selections across AP pages. Sales export/selector denied. Receiver debt navigation absent, Finance contact retained it.
- ACC-CASE-28 scoped local measurement: 100 browser-navigation samples per route at concurrency 1/5/10 on the optimized local build; Dashboard p95 2.08s/2.40s/4.70s and Dispatch p95 0.76s/0.82s/1.25s, with no failed samples. Hosted cloud benchmark remains NOT_ESTABLISHED; this does not mark ACC-CASE-28 or ACC-CASE-30 PASS.
- Owner review, physical-device UAT, invoice-provider sandbox, backup/recovery and release acceptance remain at their existing human/external gates. No Production deployment or mutation in this recheck.

## Targeted Production UAT regression closure - 2026-09-28

- UAT-REPAIR-01 P0 routes: PASS.
- UAT-REPAIR-02 earnings access/error handling: PASS (QA positive/negative DB evidence plus Production page check).
- UAT-REPAIR-03 failed PO form retention: PASS (focused React regression).
- UAT-REPAIR-04 quote timezone and linked-SO sales preview: PASS (actual Production UI/PDF and saved draft).
- UAT-REPAIR-05 repeated pricing creation, audit labels, SO date and PDF quantity: PASS.
- Exact deployment: dpl_4jRfL6XsxcrwMpV98AeigTfFJ8hS. Migration head: 20260927205002.
- Evidence and per-case boundaries: artifacts/qa/uat-repairs-20260928/manifest.json.
- This closes only the five reported defect groups. It does not replace Owner acceptance, real-device UAT, or mark unrelated/unexecuted acceptance cases PASS.
