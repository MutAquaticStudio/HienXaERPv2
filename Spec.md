# Spec.md — HIỀN XA ERP V2

> **Bộ tài liệu:** `HX-V2-DOCSET-2.0`  
> **Giao thức đồng bộ:** `SYNC-2.0`  
> **File sở hữu:** Yêu cầu sản phẩm, nghiệp vụ, dữ liệu, bảo mật, hiệu năng và tiêu chí nghiệm thu  
> **Mục đích:** Mô tả chính xác hệ thống phải làm gì và những điều tuyệt đối không được sai.

---


# SPEC-000 — Luật sử dụng tài liệu

## SPEC-000.1 — Quyền sở hữu thông tin

`Spec.md` là file duy nhất được phép sở hữu:

- phạm vi sản phẩm;
- thuật ngữ nghiệp vụ;
- thực thể nghiệp vụ;
- quy tắc nghiệp vụ;
- invariant;
- yêu cầu dữ liệu;
- yêu cầu backend ở mức hợp đồng;
- yêu cầu bảo mật;
- ngân sách hiệu năng;
- hành vi lỗi;
- tiêu chí nghiệm thu;
- Definition of Done.

Không ghi vào `Spec.md`:

- phase hiện tại;
- task hiện tại;
- SHA/commit hiện tại;
- module nào đã code xong;
- log kiểm thử;
- benchmark thực đo;
- bố cục chi tiết từng màn;
- checklist thực thi.

Các nội dung trên lần lượt thuộc `tasks.md`, `implementation.md`, `UXUI.md`, `plan.md`.

## SPEC-000.2 — Luật ưu tiên

Nếu code khác `Spec.md`:

```text
CODE LÀ SAI
```

trừ khi User vừa thay đổi yêu cầu và `Spec.md` chưa được cập nhật.

Nếu `UXUI.md` mô tả hành vi làm sai nghiệp vụ:

```text
Spec.md THẮNG
```

Nếu `implementation.md` mô tả trạng thái khác code/database thật:

```text
CODE / DATABASE THẮNG
→ sửa implementation.md
```

## SPEC-000.3 — Legacy

V1 đã được lưu trữ riêng trong Git history/branch/tag.

V2:

```text
GIỮ LỊCH SỬ
GIỮ DỮ LIỆU CẦN BẢO TOÀN
XÂY LẠI APPLICATION SOURCE
```

Không coi implementation V1 là kiến trúc chuẩn của V2.

Legacy chỉ dùng để:

- xác minh business rule;
- xác minh dữ liệu cần migration;
- tham khảo test case;
- điều tra lịch sử khi có chênh lệch.

---

# SPEC-010 — Product North Star

Hiền Xa ERP V2 phải giúp người dùng trả lời nhanh các câu hỏi vận hành:

1. Hôm nay việc gì cần xử lý?
2. Đơn nào đang chờ báo giá, xác nhận, giao hoặc thanh toán?
3. Công trình nào đang hoạt động?
4. Mỗi dòng hàng lấy từ kho hay nhà cung cấp?
5. Xe/người nào đang chịu trách nhiệm?
6. Đã giao/làm thực tế bao nhiêu?
7. Khách còn nợ bao nhiêu và khoản nào quá hạn?
8. Hiền Xa còn phải trả nhà cung cấp bao nhiêu?
9. Lương/hoa hồng nào đã được ghi nhận nhưng chưa trả?
10. Doanh thu, chi phí và lợi nhuận trong kỳ là bao nhiêu?
11. Hóa đơn nào cần phát hành/xử lý?
12. Vấn đề nào đang chặn tiến độ?

Nguyên tắc:

```text
DỮ LIỆU QUAN TRỌNG
→ NHÌN THẤY NGAY

CHI TIẾT
→ MỞ KHI CẦN

NGHIỆP VỤ QUAN TRỌNG
→ CÓ NGUỒN SỰ THẬT DUY NHẤT
```

---

# SPEC-020 — Phạm vi sản phẩm

## SPEC-020.1 — Lĩnh vực

Hệ thống phục vụ:

- vật liệu xây dựng;
- vận chuyển;
- máy móc;
- phá dỡ;
- đào móng;
- dịch vụ công trình;
- bán hàng;
- mua hàng;
- kho;
- giao hàng;
- công nợ;
- nhân công;
- thu nhập;
- hóa đơn;
- hội thoại nghiệp vụ.

## SPEC-020.2 — Ba bề mặt

```text
/admin
/work
/customer
```

### `/admin`

Dành cho:

- chủ doanh nghiệp;
- quản lý;
- kinh doanh;
- mua hàng;
- kho;
- điều phối;
- tài chính;
- nhân sự;
- quản trị hệ thống.

### `/work`

Dành cho:

- tài xế;
- công nhân;
- người vận hành máy;
- nhân sự hiện trường.

### `/customer`

Dành cho:

- khách hàng;
- chủ công trình;
- người đại diện khách;
- người nhận hàng được phép.

## SPEC-020.3 — Ngoài phạm vi

Không mặc định xây:

- hệ thống kế toán pháp định đầy đủ;
- khai thuế tự động;
- tự động nộp thuế;
- hệ thống lương pháp lý toàn diện;
- tối ưu tuyến đường tự quyết định thay con người;
- theo dõi GPS như nguồn trạng thái giao hàng;
- hội thoại như nguồn thay đổi nghiệp vụ;
- kiến trúc nhiều dịch vụ độc lập khi chưa cần.

---

# SPEC-030 — Thuật ngữ chuẩn

| Thuật ngữ | Nghĩa |
|---|---|
| Khách hàng | Bên mua hàng/dịch vụ |
| Công trình | Địa điểm hoặc site gắn với khách |
| Báo giá | Đề nghị thương mại có revision |
| Đơn bán | Cam kết bán đã tạo trong hệ thống |
| Đơn mua | Cam kết mua với nhà cung cấp |
| Phân bổ nguồn | Quyết định dòng hàng lấy từ kho hoặc nhà cung cấp |
| Phiếu giao | Đơn vị thực thi giao hàng |
| Phải thu | Khoản khách còn phải trả |
| Phải trả | Khoản Hiền Xa còn phải trả |
| Thanh toán | Giao dịch tiền đã được ghi nhận |
| Thông báo chuyển khoản | Tín hiệu do khách gửi, chưa phải thanh toán đã ghi nhận |
| Thu nhập | Quyền lợi đã phát sinh cho nhân viên/người lao động |
| Chi trả thu nhập | Giao dịch tiền trả cho thu nhập đã ghi nhận |
| Công việc | Đơn vị việc giao cho người thực hiện |
| Dịch vụ | Công việc ngoài bán vật liệu thuần |
| Bằng chứng | Ảnh/tài liệu/thông tin chứng minh hoạt động |
| Ảnh chụp dữ liệu | Giá trị nghiệp vụ được cố định tại thời điểm giao dịch |

---

# SPEC-040 — Quy tắc nguồn sự thật

## SPEC-040.1

Không duy trì hai nguồn sự thật có thể chỉnh sửa cho cùng một đại lượng.

Ví dụ cấm:

```text
customer.balance
+
AR ledger
```

nếu cả hai đều có thể cập nhật độc lập.

## SPEC-040.2

Dashboard là projection.

```text
DASHBOARD
=
READ MODEL
```

Không phải ledger riêng.

## SPEC-040.3

Các giá trị tổng hợp có thể cache/projection nhưng phải:

- tái tạo được từ nguồn gốc;
- không được chỉnh tay như nguồn chính;
- có cơ chế invalidation/rebuild;
- có thời điểm dữ liệu rõ nếu không hoàn toàn tức thời.

---

# SPEC-050 — Registry invariant bắt buộc

## SPEC-INV-001 — Báo giá đã gửi

Revision đã gửi không được sửa trực tiếp; muốn thay đổi phải tạo revision mới.

## SPEC-INV-002 — Đơn bán xác nhận

Xác nhận đơn bán không đồng nghĩa tự tạo phải thu.

## SPEC-INV-003 — Đơn mua xác nhận

Xác nhận đơn mua không đồng nghĩa tự tạo phải trả.

## SPEC-INV-004 — Giữ hàng

Reservation không làm giảm số lượng tồn thực tế.

## SPEC-INV-005 — Giao thẳng từ nhà cung cấp

Giao thẳng không tạo nhập/xuất kho giả.

## SPEC-INV-006 — Ba lượng giao

Nhà cung cấp giao, khách chấp nhận và lượng tính tiền là ba sự thật riêng.

## SPEC-INV-007 — Hoàn thành công việc

Worker DONE không tự động đồng nghĩa Delivery Confirmed.

## SPEC-INV-008 — Thu nhập

Earning không đồng nghĩa đã chi trả.

## SPEC-INV-009 — Thông báo chuyển khoản

PaymentNotice không đồng nghĩa Payment POSTED.

## SPEC-INV-010 — Tuyến đường

Route Recommendation không đồng nghĩa Assignment.

## SPEC-INV-011 — GPS

GPS ping không đồng nghĩa trạng thái giao hàng.

## SPEC-INV-012 — Hội thoại

Tin nhắn không phải lệnh nghiệp vụ.

## SPEC-INV-013 — Hóa đơn

Phát hành hóa đơn không tự tạo thêm phải thu nếu khoản phải thu đã tồn tại.

## SPEC-INV-014 — Khách nợ

Phải thu khách hàng không phải chi phí hoạt động.

## SPEC-INV-015 — Nợ nhà cung cấp

Phải trả nhà cung cấp không phải chi phí hoạt động.

## SPEC-INV-016 — Thu tiền

Tiền nhận không mặc định bằng doanh thu.

## SPEC-INV-017 — Chi trả nhà cung cấp

Thanh toán phải trả không tạo chi phí mới lần hai.

## SPEC-INV-018 — Số tiền

Tiền và phép tính tài chính không dùng số dấu phẩy động nhị phân.

## SPEC-INV-019 — Số lượng quan trọng

Số lượng/costing quan trọng phải dùng biểu diễn chính xác.

## SPEC-INV-020 — Phân quyền

Ẩn nút trên giao diện không được coi là kiểm soát quyền.

## SPEC-INV-021 — Khách hàng

Khách A không được đọc dữ liệu khách B.

## SPEC-INV-022 — Idempotency

Retry cùng lệnh nghiệp vụ không được nhân đôi hậu quả.

## SPEC-INV-023 — Concurrency

Hai thao tác cạnh tranh không được phá invariant tồn kho/thanh toán/claim.

## SPEC-INV-024 — Provider bên ngoài

Timeout không được suy luận thành thất bại chắc chắn nếu trạng thái ngoài hệ thống chưa biết.

## SPEC-INV-025 — Production

Không được tự thay đổi Production nếu chưa có lệnh rõ của Owner.


---

# SPEC-100 — Customer & Site

## SPEC-CUS-001 — Customer

Customer lưu:

- mã khách;
- tên;
- loại khách;
- trạng thái;
- điện thoại;
- email nếu có;
- địa chỉ chính;
- mã số thuế nếu có;
- nhân viên kinh doanh phụ trách;
- tier;
- điều khoản thanh toán mặc định;
- hạn mức tín dụng;
- ghi chú nội bộ có phân quyền.

Không lưu mutable debt balance như nguồn sự thật.

## SPEC-CUS-002 — Customer Site / Công trình

Một Customer có thể có nhiều công trình.

Công trình có tối thiểu:

- tên/nhãn;
- địa chỉ;
- phường/xã;
- quận/huyện;
- thành phố;
- người nhận;
- số điện thoại;
- tọa độ nếu có;
- ghi chú đường vào;
- giới hạn tải trọng/loại xe;
- thời gian nhận hàng;
- trạng thái;
- nhân viên kinh doanh phụ trách nếu khác customer.

## SPEC-CUS-003 — Snapshot

Khi đơn/báo giá/giao hàng được phát hành, các trường quan trọng phải snapshot để lịch sử không bị thay đổi bởi việc sửa Customer/Site sau này.

Ví dụ:

- tên khách;
- tên công trình;
- địa chỉ giao;
- người nhận;
- số điện thoại;
- thông tin xuất hóa đơn;
- sales phụ trách nếu policy cần.

## SPEC-CUS-004 — Customer 360

Trang chi tiết khách phải tổng hợp bằng read model:

- hồ sơ;
- công trình;
- báo giá;
- đơn bán;
- giao hàng;
- phải thu;
- thanh toán;
- hóa đơn;
- hội thoại/tài liệu được phép.

Không tạo một shadow ledger riêng.

---

# SPEC-110 — Catalog, Material, UOM

## SPEC-CAT-001 — Material/Product

Tối thiểu:

- mã;
- tên;
- nhóm;
- trạng thái;
- đơn vị cơ sở;
- cho phép bán/mua;
- quy cách nếu có;
- metadata vận hành cần thiết.

## SPEC-UOM-001 — Đơn vị

Transaction không dùng đơn vị dạng free text.

Ví dụ:

```text
kg
tấn
tạ
bao
m³
cây
bó
cuộn
viên
chuyến
giờ
ngày
```

## SPEC-UOM-002 — Conversion

Các loại:

```text
EXACT
PACKAGING
ESTIMATED
MEASURED
VEHICLE_LOAD
```

Mỗi conversion phải biết:

- from unit;
- to unit;
- factor/ratio chính xác;
- loại conversion;
- material/product scope nếu không global;
- effective period nếu cần;
- độ chính xác/làm tròn;
- nguồn đo nếu là estimated/measured.

## SPEC-UOM-003

`VEHICLE_LOAD` là quy tắc lập kế hoạch/tải xe, không mặc định là chuyển đổi vật lý chính xác.

---

# SPEC-120 — Pricing

## SPEC-PRI-001 — Precedence

```text
Customer + Material
→ Customer + Material Group
→ Customer Tier
→ Default
```

## SPEC-PRI-002 — Hiệu lực

Rule giá có:

- hiệu lực từ;
- hiệu lực đến nếu có;
- version;
- trạng thái.

## SPEC-PRI-003 — Snapshot

Giá đã chốt trong Quote/SO phải snapshot:

- giá;
- đơn vị;
- rule source;
- rule version;
- override;
- người override;
- lý do override nếu policy yêu cầu.

Policy giá mới không rewrite giao dịch cũ.

## SPEC-PRI-004 — Override

Override giá cần:

- quyền;
- reason khi dưới ngưỡng/sàn;
- audit.

---

# SPEC-130 — Credit

## SPEC-CRE-001 — Exposure

Credit exposure có thể bao gồm:

```text
AR còn mở
+ billable chưa lập AR nếu policy áp dụng
+ đơn mới đang xét
- advance đủ điều kiện
```

Công thức cuối cùng phải được chốt ở implementation phase và test.

## SPEC-CRE-002 — Overdue

Khách quá hạn có thể:

- block;
- require override;
- warning;

theo policy.

Không hard-code hành vi nếu chưa được cấu hình/chốt.

## SPEC-CRE-003 — Override

Override cần:

- permission;
- actor;
- reason;
- timestamp;
- captured exposure;
- captured limit.

---

# SPEC-140 — Quotation

## SPEC-QUO-001 — Thực thể

Quotation:
- customer;
- site;
- owner/sales;
- currency;
- current revision;
- status.

QuotationRevision:
- revision number;
- lines;
- totals;
- commercial terms;
- snapshots;
- created by;
- sent at;
- accepted at nếu có.

## SPEC-QUO-002 — States

Tối thiểu:

```text
DRAFT
SENT
ACCEPTED
EXPIRED
SUPERSEDED
CANCELLED
```

## SPEC-QUO-003 — Transition

```text
DRAFT → SENT
SENT → ACCEPTED
SENT → EXPIRED
SENT → SUPERSEDED
DRAFT/SENT → CANCELLED theo quyền/policy
```

Không sửa revision SENT.

## SPEC-QUO-004 — Acceptance

Acceptance phải trỏ tới exact revision.

Retry acceptance phải idempotent.

---

# SPEC-150 — Sales Order

## SPEC-SO-001 — State dimensions

Không dùng một state duy nhất cho mọi sự thật.

Tách ít nhất:

```text
commercial_state
fulfillment_state
payment_state
```

Ví dụ commercial:

```text
DRAFT
CONFIRMED
CANCELLED
```

Fulfillment:

```text
NOT_STARTED
PARTIAL
FULFILLED
CANCELLED
```

Payment:

```text
UNPAID
PARTIAL
PAID
OVERPAID/ADVANCE nếu policy hỗ trợ
```

## SPEC-SO-002 — Confirm

Confirm phải:

- validate customer/site;
- validate lines;
- snapshot price/UOM;
- run credit policy;
- record actor/time;
- idempotent.

Không tự tạo AR chỉ vì CONFIRMED.

## SPEC-SO-003 — Source relation

SO có thể:
- sinh từ Quote revision;
- tạo trực tiếp nếu quyền/policy cho phép.

Nếu từ Quote:
- giữ reference exact revision.

---

# SPEC-160 — Purchasing & Sourcing

## SPEC-PUR-001 — Purchase Order

PO có:
- supplier;
- lines;
- price/cost snapshots;
- expected dates;
- destination/source relation;
- state;
- audit.

## SPEC-PUR-002

PO Confirmed không tự tạo AP.

## SPEC-SRC-001 — Supply Mode

Mỗi SalesOrderLine có thể có một/nhiều allocation:

```text
WAREHOUSE
SUPPLIER_DIRECT
SUPPLIER_TO_WAREHOUSE
```

## SPEC-SRC-002 — Split

Một line được phép split theo quantity nếu tổng allocation không vượt quantity cần nguồn trừ các trường hợp policy cho phép.

## SPEC-SRC-003 — Supplier Direct

Phải có:
- supplier;
- customer/site destination;
- quantity;
- expected date;
- source PO nếu có.

Không tạo warehouse receipt/issue giả.

---

# SPEC-170 — Inventory

## SPEC-INVTRY-001 — Ledger

Nguồn sự thật tồn kho là movement ledger + các invariant liên quan.

Không cho người dùng sửa `on_hand` trực tiếp.

## SPEC-INVTRY-002 — Movement

Movement tối thiểu lưu:

- material;
- warehouse;
- quantity exact;
- UOM/base quantity;
- movement type;
- source type/id;
- occurred_at;
- actor/system;
- idempotency key/source uniqueness;
- cost basis khi liên quan.

## SPEC-INVTRY-003 — Reservation

Reservation:
- không giảm on-hand;
- giảm available;
- có source;
- có quantity;
- có trạng thái;
- release/consume rõ.

```text
available = on_hand - active_reserved
```

## SPEC-INVTRY-004 — Concurrency

Hai reservation đồng thời không được oversubscribe stock.

Phải test bằng transaction/concurrent sessions thực.

## SPEC-INVTRY-005 — Stock Count

Flow:

```text
open count
→ cutoff/reference
→ physical count
→ variance
→ reason/evidence
→ approval
→ adjustment movement
```

Không sửa balance trực tiếp.

## SPEC-INVTRY-006 — Costing

Ban đầu dùng Moving Weighted Average nếu phù hợp dữ liệu.

Cost history không rewrite sau khi transaction đã finalized theo policy.

---

# SPEC-180 — Delivery

## SPEC-DEL-001 — Delivery là thực thể riêng

Một SO có thể có nhiều Delivery.

Một Delivery có thể chứa nhiều lines.

## SPEC-DEL-002 — States

```text
PLANNED
ASSIGNED
DISPATCHED
ARRIVED
DELIVERED
CONFIRMED
PARTIAL
FAILED
CANCELLED
```

State transition phải kiểm soát; không nhảy tùy ý.

## SPEC-DEL-003 — Quantities

Tách:

```text
planned_quantity
actual_quantity
accepted_quantity
billable_quantity
```

## SPEC-DEL-004 — Proof

Có thể gồm:

- ảnh;
- người nhận;
- chữ ký/thông tin xác nhận nếu cần;
- tọa độ;
- timestamp;
- ghi chú;
- document.

Proof mặc định private trừ khi policy cho phép customer xem.

## SPEC-DEL-005 — Confirm

Delivery confirm là command idempotent.

Tùy source/policy, một transaction xác nhận có thể:
- chốt quantity;
- consume reservation;
- tạo inventory movement;
- tạo billable fact;
- tạo AR/accrual;
- ghi profitability inputs;
- audit.

Không thực hiện effects không phù hợp nguồn giao.

---

# SPEC-190 — Finance

## SPEC-FIN-001 — Phạm vi

Operational finance gồm:

```text
AR
AP
Payment
PaymentAllocation
Advance
Expense
Cash/Bank
Reconciliation
Reversal
```

Không mặc định là hệ thống sổ cái pháp định đầy đủ.

## SPEC-FIN-002 — AR

AR sinh từ sự kiện billable được định nghĩa rõ.

AR có:
- customer;
- site nếu có;
- source;
- amount;
- due date;
- outstanding;
- state;
- currency;
- audit.

## SPEC-FIN-003 — AP

AP sinh từ supplier billable/accepted event được định nghĩa rõ.

Không từ PO Confirmed đơn thuần.

## SPEC-FIN-004 — Payment

States:

```text
DRAFT
POSTED
RECONCILED
REVERSED
```

POSTED mới có tác động số dư.

## SPEC-FIN-005 — Allocation

PaymentAllocation many-to-many.

Không được:
- allocate vượt Payment available;
- allocate vượt target outstanding;
- tạo duplicate allocation do retry.

## SPEC-FIN-006 — Reversal

Reversal:
- không xóa lịch sử;
- tạo trạng thái/effect đảo phù hợp;
- audit actor/reason;
- khôi phục outstanding đúng.

## SPEC-FIN-007 — Advance

Customer advance và Supplier advance là thực thể/position riêng, không biểu diễn đơn giản bằng AR/AP âm.

## SPEC-FIN-008 — Payment Notice

PaymentNotice:
- customer;
- amount khai báo;
- time;
- method/reference;
- evidence;
- status review.

Không tác động AR trước khi Payment được POSTED.

---

# SPEC-200 — Profitability & Expense

## SPEC-PRO-001 — Revenue

Revenue dashboard/report = doanh thu thực tế/billable được ghi nhận theo policy.

Không lấy Payment received làm Revenue.

## SPEC-PRO-002 — Direct Cost

Direct cost có thể gồm khi attributable:
- vật liệu;
- supplier direct purchase;
- vận chuyển trực tiếp;
- bốc xếp trực tiếp;
- nhiên liệu trực tiếp;
- direct labor;
- direct service cost.

## SPEC-PRO-003 — Gross Profit

```text
Gross Profit = Revenue - Direct Cost
```

## SPEC-PRO-004 — Operating Expense

Opex là chi phí vận hành không đã nằm trong Direct Cost.

## SPEC-PRO-005 — Operating Profit

```text
Operating Profit = Gross Profit - Operating Expense
```

## SPEC-PRO-006 — Margin

```text
Operating Margin = Operating Profit / Revenue
```

Revenue = 0 → hiển thị `—`.

## SPEC-PRO-007 — Không double count

Payment:
- thay đổi cash/AR;
- không tạo Revenue lần hai.

AP payment:
- thay đổi cash/AP;
- không tạo Expense lần hai.

---

# SPEC-210 — Dashboard

## SPEC-DASH-001 — KPI

Dashboard `/admin` phải hỗ trợ:

- Revenue;
- Gross Profit;
- Operating Expense;
- Operating Profit;
- Operating Margin.

## SPEC-DASH-002 — Balances

Phải hỗ trợ:

- Customer Receivable;
- Supplier Payable;
- Salary Payable;
- Sales Commission Payable.

## SPEC-DASH-003 — Top lists

Phải có:
- khách/công trình đang nợ;
- nhà cung cấp đang phải trả;
- chi phí theo nhóm;
- hoa hồng theo nhân viên.

## SPEC-DASH-004 — Global filter

Tối thiểu:
- thời gian;
- chi nhánh;
- sales;
- customer;
- site;
- loại hoạt động.

## SPEC-DASH-005 — Time semantics

Flow metrics dùng `from/to`.

Balance metrics dùng:

```text
as_of = filter end
```

UI phải phân biệt kỳ và số dư đến ngày.

## SPEC-DASH-006 — Direct drill-down

Click số nợ phải mở exact source/detail với current filter context.

## SPEC-DASH-007 — Read model

Dashboard không được aggregate bằng cách tải hàng trăm dòng detail rồi tính ở client.

Ưu tiên:
- một snapshot read logic chính;
- top-N;
- lazy detail.

## SPEC-DASH-008 — Không đưa lên homepage

Không:
- Working Capital KPI;
- profitability lifecycle control;
- finalize/reopen profitability;
- order-level profitability table.

---

# SPEC-220 — Workforce

## SPEC-WRK-001 — WorkItem

WorkItem là orchestration cho công việc cần người thực hiện.

Không thay Delivery/ServiceJob làm source of truth.

## SPEC-WRK-002 — Assignment mode

```text
DIRECT
POOL_CLAIM
```

## SPEC-WRK-003 — Claim

POOL_CLAIM:
- atomic;
- one winner;
- retry same worker idempotent;
- không double assignment.

## SPEC-WRK-004 — States

Có thể gồm:

```text
AVAILABLE
CLAIMED
IN_PROGRESS
BLOCKED
DONE
VERIFIED
CANCELLED
```

Các state monitoring như heartbeat/expired có thể tồn tại nhưng không được tự gây hậu quả nghiệp vụ nguy hiểm.

## SPEC-WRK-005 — Worker submit

Worker có thể gửi:
- actual quantity;
- note;
- proof;
- receiver;
- timestamp.

DONE có thể cần VERIFIED.

---

# SPEC-230 — Compensation

## SPEC-COMP-001 — Rule types

Có thể hỗ trợ:

```text
FIXED_MONTHLY
PER_JOB
PER_TRIP
PER_HOUR
PER_SHIFT
PER_DAY
PER_TON
PER_M3
PER_BAG
PER_UNIT
BONUS
ADJUSTMENT
SALES_COMMISSION
```

## SPEC-COMP-002 — Flow

```text
verified basis
→ rule
→ EarningEvent
→ approval
→ payable
→ payment/allocation
```

## SPEC-COMP-003

EarningEvent phải snapshot:
- source;
- basis;
- rule/version;
- rate;
- calculated amount;
- approved amount.

## SPEC-COMP-004 — Salary payable

Chỉ approved liability mới lên payable.

Không lấy estimated productivity làm khoản phải trả.

## SPEC-COMP-005 — Sales commission

Dashboard đọc outstanding approved `SALES_COMMISSION` earning.

Dashboard không tự tính commission ad hoc.

---

# SPEC-240 — Service Jobs

## SPEC-SRV-001

Flow:

```text
Customer
→ Service Quote/Request
→ ServiceJob
→ Machine/Operator
→ WorkLog
→ Verification
→ Billable fact
→ AR
→ Payment
→ Earning
```

## SPEC-SRV-002

Tách:
- actual work;
- billable work;
- compensable work.

---

# SPEC-250 — Worker Portal

## SPEC-WORKPORTAL-001

Routes logic:
- home/my work;
- work pool;
- job detail;
- proof/result;
- earnings;
- profile;
- messages khi cần.

## SPEC-WORKPORTAL-002

Mobile-first.

Không hiển thị ERP table dày đặc.

## SPEC-WORKPORTAL-003

Không yêu cầu tài xế thao tác nguy hiểm khi đang lái.

---

# SPEC-260 — Customer Portal

## SPEC-CUSTPORTAL-001

Customer được phép:
- xem báo giá;
- accept/request revision;
- xem order;
- xem delivery;
- xem debt;
- gửi PaymentNotice;
- xem tài liệu/hóa đơn được phép;
- gửi yêu cầu;
- nhắn tin.

## SPEC-CUSTPORTAL-002

Authorization:

```text
AuthUser
→ CustomerPortalMembership
→ Customer
```

Không tin `customer_id` do browser gửi.

## SPEC-CUSTPORTAL-003

Customer không xem:
- internal margin;
- supplier cost;
- employee payroll;
- internal-only notes;
- dữ liệu khách khác.

---

# SPEC-270 — Routing

## SPEC-ROUTE-001

RoutePlan là đề xuất.

Không mutate Delivery assignment trước Apply.

## SPEC-ROUTE-002

Inputs có thể:
- delivery;
- location;
- time window;
- capacity;
- vehicle;
- driver;
- priority.

## SPEC-ROUTE-003

Provider bản đồ phải có timeout/fallback.

Provider lỗi không khóa nghiệp vụ Delivery.

---

# SPEC-280 — GPS

## SPEC-GPS-001

GPS là telemetry.

Không là nguồn trạng thái Delivery.

## SPEC-GPS-002

Fleet view ưu tiên current active position.

Không tải full GPS history cho refresh thông thường.

## SPEC-GPS-003

Customer mặc định không được xem raw coordinate liên tục nếu không có policy rõ.

---

# SPEC-290 — Messaging

## SPEC-MSG-001

Core:

```text
Conversation
Participant
Message
```

Database là source of truth.

Realtime chỉ là transport.

## SPEC-MSG-002

Message send cần idempotency nếu UI có thể retry.

## SPEC-MSG-003

Conversation list dùng projection:
- last message;
- unread count;
- updated time.

Không aggregate toàn lịch sử message mỗi lần mở list.

---

# SPEC-300 — Electronic Invoice

## SPEC-EINV-001 — Phạm vi

Hóa đơn điện tử: trong phạm vi.

Khai thuế tự động: ngoài phạm vi.

## SPEC-EINV-002 — Flow

```text
Billable source
→ Eligibility
→ Draft
→ Review
→ Approve
→ ISSUE_PENDING
→ Provider
→ Status/Reconcile
→ Legal result
→ Document
```

## SPEC-EINV-003 — Provider neutral

Adapter phải cô lập provider-specific logic.

## SPEC-EINV-004 — Timeout

Nếu timeout khi issue:
- không kết luận chưa phát hành;
- trạng thái `UNKNOWN/PENDING_RECONCILIATION`;
- query/reconcile trước retry;
- idempotency key/provider reference phải được dùng nếu provider hỗ trợ.

## SPEC-EINV-005 — External call

Không giữ DB transaction mở trong lúc gọi provider.

## SPEC-EINV-006 — AR

Issue invoice không tự tạo AR lần hai nếu billable event đã tạo AR.

---

# SPEC-310 — Identity & Access

## SPEC-ACC-001 — Internal model

```text
AuthUser
→ Employee
→ EmployeeBranchAccess
→ ONE ACTIVE ROLE
→ RolePermission
```

Một nhân viên có thể có access nhiều branch.

Role có thể khác theo branch nếu business yêu cầu.

## SPEC-ACC-002 — Customer model

```text
AuthUser
→ CustomerPortalMembership
→ Customer
```

Tách khỏi Employee role.

## SPEC-ACC-003 — Permission naming

Permission phải cụ thể theo action.

Ví dụ:

```text
orders.read
orders.create
orders.confirm
quotation.read
quotation.create
inventory.read
inventory.receive
finance.ar.read
finance.payment.post
dashboard.profit.read
dashboard.payroll.read
invoice.issue
roles.manage
```

Tránh quyền mơ hồ kiểu `all.edit`.

## SPEC-ACC-004 — Enforcement

Bắt buộc hai lớp phù hợp:

```text
server authorization
+
database grants/RLS/safe function
```

Không chỉ UI.

## SPEC-ACC-005 — Sensitive fields

Profit/payroll/commission:
- server không fetch/return nếu actor không có quyền field/domain tương ứng.

Không fetch rồi CSS hide.

---

# SPEC-320 — Backend Contract

## SPEC-BE-001 — Kiến trúc

```text
MODULAR MONOLITH
```

Không microservice khi chưa có bằng chứng cần.

## SPEC-BE-002 — Đường ghi

```text
request
→ access context
→ validation
→ domain command
→ idempotency
→ database transaction
→ mutation
→ audit
→ commit
→ invalidate projection/cache nếu cần
→ response
```

## SPEC-BE-003 — Đường đọc

```text
request/server render
→ access context
→ read service/query/projection
→ minimal DTO
→ response/render
```

Không gọi command layer chỉ để đọc.

## SPEC-BE-004 — Dashboard

Dashboard hướng tới:

```text
one primary snapshot read
+
lazy detail
```

## SPEC-BE-005 — N+1

N+1 trong hot list/dashboard là lỗi kiến trúc.

## SPEC-BE-006 — Payload

Không `select *` trên hot path nếu không cần.

Không gửi:
- raw provider payload;
- binary/evidence;
- full history;

cho list/dashboard nếu UI không cần.

## SPEC-BE-007 — External provider

Không gọi external provider trong transaction đang giữ lock.

---

# SPEC-330 — Money, Quantity, Rounding

## SPEC-NUM-001 — Money

VND ưu tiên integer/bigint.

Nếu cần decimal currency khác:
- dùng decimal chính xác;
- định nghĩa scale;
- không dùng binary float cho phép tính tiền.

## SPEC-NUM-002 — Quantity

DB dùng numeric precision phù hợp.

Application dùng decimal-safe representation/string/primitive.

## SPEC-NUM-003 — Rounding

Mỗi loại phép tính phải định nghĩa:
- scale;
- rounding mode;
- stage rounding.

Không làm tròn sớm nếu gây sai tổng.

## SPEC-NUM-004 — Percentage

Dùng basis points hoặc exact decimal.

---

# SPEC-340 — Idempotency

## SPEC-IDEM-001

Ít nhất các command sau cần idempotent:

- quotation accept;
- sales order confirm;
- stock reservation;
- delivery confirm;
- work claim;
- payment post;
- payment allocation;
- payment notice;
- route apply;
- message send nếu retry tự động;
- invoice issue.

## SPEC-IDEM-002

Một idempotency key dùng lại với payload khác phải:
- conflict;
- không silently execute payload mới.

## SPEC-IDEM-003

Lookup idempotency phải có unique/index phù hợp.

---

# SPEC-350 — Transaction & Concurrency

## SPEC-CON-001

Transaction phải ngắn.

## SPEC-CON-002

Row locks chỉ giữ trên record cần bảo vệ.

## SPEC-CON-003

Các race phải test:
- stock reservation;
- payment allocation;
- work claim;
- credit exposure khi confirm;
- stock count vs movement;
- route apply stale state;
- duplicate invoice issue.

## SPEC-CON-004

Hai transaction cạnh tranh phải có kết quả deterministic theo invariant, không phụ thuộc timing may rủi.

---

# SPEC-360 — API / Error Semantics

## SPEC-ERR-001

Phân biệt:

```text
401 — chưa xác thực
403 — không có quyền
404 — resource không tồn tại/không được lộ
409 — conflict/state/idempotency conflict
422 — validation/business input không hợp lệ
429 — rate/pressure limit nếu áp dụng
503 — dependency unavailable
```

## SPEC-ERR-002

Không trả `200 []` để che:
- DB fail;
- auth fail;
- timeout.

## SPEC-ERR-003

Error response/log phải có trace/request id nhưng không lộ secret.

---

# SPEC-370 — Performance Budget

## SPEC-PERF-001 — Triết lý

```text
10 GIÂY
=
TRẦN UX TUYỆT ĐỐI
```

Không phải target.

Đa số thao tác thường ngày phải dưới 2 giây.

## SPEC-PERF-002 — Mục tiêu p95

| Luồng | p95 mục tiêu |
|---|---:|
| Admin shell/filter | < 300 ms |
| Dashboard KPI | < 1 giây |
| Dashboard nội dung hữu ích | < 2 giây |
| List/filter thông thường | < 1 giây |
| Drawer/detail | < 1 giây |
| Create/update đơn giản | < 1,5 giây |
| Command nội bộ quan trọng | < 2 giây |
| Báo cáo nặng | < 5 giây |

## SPEC-PERF-003 — >10 giây

Interactive operation vượt 10 giây:
- phải timeout/fail gracefully;
- thông báo rõ;
- log slow path;
- cho retry;
- không spinner vô hạn.

## SPEC-PERF-004 — Benchmark

Không benchmark chỉ bằng dataset vài chục record.

Synthetic baseline có thể gồm:

```text
10k customers
20k sites
100k sales orders
500k order lines
150k deliveries
200k AR/AP
200k payments
100k expenses
200k earnings
1m messages
```

GPS dataset riêng.

## SPEC-PERF-005 — Query

Hot query:
- đo duration;
- row count;
- query plan khi cần;
- index usage;
- payload size.

---

# SPEC-380 — Cache & Projection

## SPEC-CACHE-001

Static metadata có thể cache.

## SPEC-CACHE-002

Financial/sensitive data mặc định không dùng shared cache xuyên user nếu chưa chứng minh cache key an toàn.

## SPEC-CACHE-003

Nếu cache sensitive projection:
- key gồm access scope;
- permission fingerprint;
- filters;
- TTL;
- invalidation;
- data timestamp.

## SPEC-CACHE-004

Projection không được trở thành ledger có thể chỉnh độc lập.

---

# SPEC-390 — Observability

## SPEC-OBS-001

Theo dõi tối thiểu:

- request id;
- route;
- duration;
- query duration;
- rows;
- success/error;
- connection acquisition;
- auth duration;
- lock/conflict;
- provider duration;
- dashboard snapshot duration.

## SPEC-OBS-002

Không log:
- mật khẩu;
- secret;
- private token;
- raw evidence nhạy cảm;
- PII không cần thiết.

## SPEC-OBS-003

Slow query threshold ban đầu có thể:

```text
>250ms → warning
>750ms → điều tra ưu tiên
```

Ngưỡng này là operational diagnostic, không thay performance budget ở trên.

---

# SPEC-400 — Migration & Production Safety

## SPEC-MIG-001

Không reset Production database chỉ vì application source được rebuild.

## SPEC-MIG-002

Không replay migration V1 mù để tạo V2.

Flow:

```text
audit Production
→ thiết kế schema V2
→ mapping
→ transform
→ migrate copy
→ reconcile
→ UAT
→ final delta
→ cutover
```

## SPEC-MIG-003 — Classification

Mỗi dataset được phân loại:

```text
KEEP_DATA
TRANSFORM
RECALCULATE
ARCHIVE_ONLY
DROP_FROM_V2
MANUAL_REVIEW
```

## SPEC-MIG-004 — Reconciliation

Trước cutover phải reconcile ít nhất:
- customer;
- supplier;
- material;
- inventory;
- open AR;
- open AP;
- posted payments;
- active SO;
- active PO;
- active delivery;
- approved unpaid earning.

## SPEC-MIG-005 — Production authorization

Không tự:
- deploy;
- merge release;
- apply destructive migration;
- change Production config;
- force push;
- cutover.

Cần chỉ thị Owner rõ.

---

# SPEC-410 — Testing Requirements

## SPEC-TEST-001

Không có lớp kiểm thử riêng tên `smoke test`.

## SPEC-TEST-002

Các loại kiểm tra:

- lint;
- typecheck;
- unit;
- integration;
- database/concurrency;
- security/RLS;
- targeted E2E;
- performance khi liên quan.

Cách chọn check do `plan.md` sở hữu.

## SPEC-TEST-003

Critical invariant phải có test phù hợp trước khi phase liên quan được coi là hoàn tất.

---

# SPEC-420 — Acceptance Registry

## SPEC-ACCPT-001 — Dashboard

Phải chứng minh:
- Revenue đúng kỳ;
- AR/AP đúng as-of;
- payment giảm AR không giảm Revenue;
- AP payment giảm AP không tạo Expense mới;
- direct cost vào Gross Profit một lần;
- Opex vào Operating Profit một lần;
- commission payable không double;
- debt row drill-down exact;
- filter/back giữ context;
- field permission không leak;
- no N+1/over-fetch;
- p95 đạt ngân sách.

## SPEC-ACCPT-002 — Sales

- quote sent immutable;
- exact revision acceptance;
- snapshot đúng;
- SO confirm idempotent;
- SO confirm không tạo AR.

## SPEC-ACCPT-003 — Inventory

- reservation không giảm on-hand;
- concurrent reservation không oversubscribe;
- stock adjustment qua ledger.

## SPEC-ACCPT-004 — Finance

- allocation không overallocate;
- reversal giữ history;
- PaymentNotice không giảm debt;
- AR/AP không double.

## SPEC-ACCPT-005 — Workforce

- one claim winner;
- same retry idempotent;
- DONE không tự confirm Delivery;
- Earning không phải Payment.

## SPEC-ACCPT-006 — Customer access

- Customer A không xem B;
- browser-supplied ownership id không bypass access.

## SPEC-ACCPT-007 — Invoice

- issue idempotent;
- timeout reconcile;
- không duplicate AR.

---

# SPEC-430 — Definition of Done

V2 chỉ được coi là sẵn sàng khi:

1. UX chính được Owner chấp nhận.
2. `/admin`, `/work`, `/customer` đúng phạm vi.
3. Dashboard đúng semantics tài chính.
4. Direct drill-down hoạt động.
5. Access Control ổn định và không leak dữ liệu.
6. Money/quantity exact.
7. Critical invariants có test.
8. Concurrency hot paths pass.
9. Không shadow ledger.
10. EInvoice an toàn.
11. Migration reconcile.
12. Performance budget đạt.
13. Không normal interactive path >10 giây.
14. UAT pass.
15. Release/cutover được Owner phê duyệt exact SHA.

# KẾT THÚC Spec.md
