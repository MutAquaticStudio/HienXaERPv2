# UXUI.md — HIỀN XA ERP V2

> **Bộ tài liệu:** `HX-V2-DOCSET-2.0`  
> **Giao thức đồng bộ:** `SYNC-2.0`  
> **File sở hữu:** Hệ thống thiết kế, bố cục, tương tác, responsive, accessibility và hành vi giao diện  
> **Mục đích:** Mô tả chi tiết hệ thống phải trông và vận hành như thế nào ở tầng giao diện.

---


# UX-000 — Luật sử dụng

`UXUI.md` không được định nghĩa lại business semantics.

Ví dụ:
- `UXUI.md` có thể nói vị trí hiển thị AR;
- `Spec.md` quyết định AR là gì.

`UXUI.md` không sở hữu:
- performance budget số học;
- current task;
- SHA;
- implementation status.

Task chạm giao diện bắt buộc đọc:
- requirement liên quan trong `Spec.md`;
- section liên quan trong `UXUI.md`.

---

# UX-010 — Triết lý thiết kế

Hướng tham chiếu:

```text
SAPO-LIKE CLARITY
+
HIỀN XA BUSINESS LOGIC
```

Chỉ học:
- cách tổ chức module;
- list/create/detail;
- filter;
- search;
- status;
- drill-down;
- customer/supplier profile;
- thao tác nhanh.

Không copy:
- thương hiệu;
- logo;
- layout từng pixel;
- tính năng bán lẻ không liên quan.

Mục tiêu:

```text
NGƯỜI DÙNG KHÔNG CẦN HIỂU ERP
ĐỂ DÙNG ĐƯỢC ERP
```

---

# UX-020 — Đối tượng và mức độ số hóa

## UX-020.1 — Văn phòng

Đặc điểm:
- desktop/laptop;
- làm nhiều dữ liệu;
- cần bảng/filter;
- có thể dùng keyboard;
- cần tốc độ.

## UX-020.2 — Hiện trường

Đặc điểm:
- điện thoại;
- ánh sáng ngoài trời;
- tay bẩn/găng;
- thao tác ngắn;
- có thể mạng yếu;
- không thích form dài.

## UX-020.3 — Khách hàng

Đặc điểm:
- không cần hiểu nội bộ;
- cần trạng thái đơn, giao hàng, công nợ, tài liệu;
- ưu tiên sự rõ ràng hơn mật độ.

---

# UX-030 — Information Architecture

Ba surface:

```text
/admin
/work
/customer
```

Không trộn navigation của ba surface.

## UX-030.1 — `/admin` menu

```text
TỔNG QUAN

BÁN HÀNG
  Đơn bán hàng
  Báo giá

MUA HÀNG
  Đơn mua
  Nhà cung cấp

KHÁCH HÀNG

VẬT TƯ & KHO
  Vật tư
  Kho
  Kiểm kho

GIAO HÀNG
  Điều phối
  Phiếu giao
  Lộ trình
  Vị trí xe

DỊCH VỤ

TÀI CHÍNH
  Phải thu
  Phải trả
  Thu / chi
  Đối soát

NHÂN CÔNG
  Công việc
  Sản lượng & thu nhập

HÓA ĐƠN
  Hóa đơn bán ra
  Hóa đơn mua vào
  Cần xử lý

HỘI THOẠI
BÁO CÁO
CẤU HÌNH
NHẬT KÝ
```

Không quá 2 cấp chính.

---

# UX-040 — Layout shell `/admin`

## UX-040.1 — Desktop

Cấu trúc:

```text
┌──────────────┬──────────────────────────────────────┐
│ Sidebar      │ Top/Page Header                      │
│              ├──────────────────────────────────────┤
│              │ Content                              │
│              │                                      │
└──────────────┴──────────────────────────────────────┘
```

Sidebar:
- fixed/sticky;
- active state rõ;
- label luôn thấy ở mặc định;
- có thể collapse nếu user chủ động.

Content:
- max-width linh hoạt;
- không bó hẹp data table;
- padding nhất quán.

## UX-040.2 — Mobile admin

Sidebar → drawer navigation.

Header:
- menu;
- page title;
- primary action nếu hợp lý.

Không giữ desktop table ngang buộc scroll cho core flow.

---

# UX-050 — Design Tokens

## UX-050.1 — Màu baseline

```text
Background   #F3F5F8
Surface      #FFFFFF
Navigation   #172C49
Primary      #0866CC
Text         #15263D
Muted        #52627A
Border       #DBE1E9
```

Màu status phải:
- đủ contrast;
- có text;
- dùng thống nhất.

## UX-050.2 — Spacing

```text
4
8
12
16
24
32
40
48
```

## UX-050.3 — Radius

Tối thiểu bộ:
- small;
- medium;
- large.

Không mỗi component tự chọn radius.

## UX-050.4 — Shadow

Chỉ dùng để:
- tách surface;
- drawer;
- modal;
- floating control.

Không dùng shadow trang trí nặng.

---

# UX-060 — Typography

Admin:

```text
body           ~18px
page title     28–32px
section title  20–24px
KPI value      24–32px
caption        >=14px
```

Worker:

```text
body           18–20px
primary CTA    >=18px
```

Line height:
```text
1.5–1.6
```

Không dùng chữ 11–12px cho nghiệp vụ quan trọng.

---

# UX-070 — Component hierarchy

Core components có thể gồm:

- Button;
- IconButton phụ trợ;
- Input;
- Textarea;
- Select;
- Combobox;
- DatePicker;
- SearchInput;
- FilterChip;
- Card;
- KpiCard;
- StatusBadge;
- Table;
- Pagination;
- Drawer;
- Sheet;
- Dialog;
- Tabs;
- EmptyState;
- ErrorState;
- Skeleton;
- Toast;
- FormField;
- MoneyInput;
- QuantityInput.

Không abstraction quá sớm.

Chỉ nâng thành reusable primitive khi pattern lặp thực.

---

# UX-080 — Button rules

## UX-080.1

Một màn nên có tối đa một primary CTA nổi bật.

## UX-080.2

Primary:
- hành động chính;
- label bằng động từ + đối tượng khi cần.

Ví dụ:
- `Tạo đơn`;
- `Lưu báo giá`;
- `Ghi nhận thu tiền`;
- `Xác nhận giao`.

## UX-080.3

Destructive:
- tách màu/vị trí;
- confirm khi hậu quả lớn;
- không đặt sát primary nếu dễ bấm nhầm.

## UX-080.4

Critical action không icon-only.

---

# UX-090 — Form rules

## UX-090.1

Label luôn hiện.

Placeholder không thay label.

## UX-090.2

Nhóm form theo nghiệp vụ, không theo column database.

## UX-090.3

Error:
- sát field;
- nói rõ cách sửa;
- giữ input user.

## UX-090.4

Money input:
- format dễ đọc;
- không làm mất giá trị khi focus/blur;
- server vẫn validate exact.

## UX-090.5

Quantity:
- unit đi cùng;
- conversion nếu có phải rõ.

## UX-090.6

Form dài:
- chia section;
- sticky action footer nếu cần.

---

# UX-100 — Search

Search box phải nói rõ scope.

Ví dụ:

```text
Tìm theo mã đơn, khách hàng, công trình...
```

Không chỉ `Search`.

Debounce theo yêu cầu hiệu năng trong `Spec.md`.

Search result phải tách:
- loading;
- no result;
- error.

---

# UX-110 — Filter

## UX-110.1

Quick filters luôn thấy nếu dùng thường xuyên.

## UX-110.2

Active filters hiển thị chip.

## UX-110.3

Có `Xóa tất cả`.

## UX-110.4

Filter state quan trọng nằm trong URL.

## UX-110.5

Dependent filter:
- chọn customer → site chỉ hiện site của customer;
- clear parent → clear child không hợp lệ.

---

# UX-120 — Table

Desktop:
- header sticky nếu list dài phù hợp;
- số căn phải;
- text căn trái;
- status dễ quét;
- row hover/focus;
- selected state rõ;
- action menu không quá nhiều.

Không show 15–20 cột mặc định.

Ưu tiên:
```text
decision columns
```

Chi tiết chuyển sang detail/drawer.

---

# UX-130 — Pagination

List lớn:
- page size hợp lý;
- next/previous;
- tổng hoặc approximate count nếu có giá trị;
- giữ filter/query trong URL.

Không load toàn bộ dataset.

---

# UX-140 — Status

Status phải có:
- label tiếng Việt;
- màu hỗ trợ;
- icon tùy chọn.

Ví dụ:
- Chờ xác nhận;
- Đang giao;
- Hoàn thành;
- Quá hạn;
- Đã hủy.

Không render raw enum.

---

# UX-150 — Drawer

Desktop:
- 520–640px tùy content;
- không che mất toàn context;
- deep-link được nếu là business detail;
- Back đóng drawer trước.

Mobile:
- full-screen sheet.

Drawer dùng cho:
- debt detail;
- supplier payable;
- commission;
- expense details;
- quick object detail;
- action ngắn.

Không dùng drawer cho workflow dài nhiều bước.

---

# UX-160 — Dialog/Modal

Chỉ dùng:
- confirm;
- short action;
- short form.

Không dùng modal cho:
- edit order dài;
- create complex entity;
- reconciliation nhiều bước.

---

# UX-170 — Toast

Toast cho:
- success nhỏ;
- warning không critical.

Không dùng toast làm nơi duy nhất hiển thị:
- form error;
- payment failure;
- invoice failure;
- permission failure cần action.

---

# UX-180 — Loading

Ưu tiên:
```text
shell trước
→ critical content
→ secondary content
```

Skeleton:
- giữ layout;
- không animate quá mạnh;
- không skeleton toàn màn nếu shell đã có.

Không spinner vô hạn.

---

# UX-190 — Empty / Error

Empty:
```text
Chưa có đơn bán hàng trong kỳ này.
[+ Tạo đơn]
```

Error:
```text
Không tải được danh sách đơn.
[Thử lại]
```

Không dùng empty để che lỗi.

---

# UX-200 — Confirmation

Confirm khi:
- delete;
- reverse payment;
- stock adjustment;
- issue invoice;
- permission change;
- action irreversible/risk cao.

Không confirm:
- filter;
- search;
- open drawer;
- navigation.

---

# UX-210 — Optimistic UI

Không optimistic cho business truth quan trọng:
- Payment POSTED;
- stock;
- Delivery Confirmed;
- Invoice Issued;
- permission.

Có thể optimistic cho:
- UI preference;
- non-critical local interaction;
- safe draft metadata nếu rollback rõ.

---

# UX-220 — URL state

Ví dụ:

```text
/admin/orders?status=confirmed&branch=b1
```

Drawer:

```text
/admin?drawer=customer-debt&customerId=x&siteId=y
```

URL state cần:
- refresh được;
- Back/Forward đúng;
- share/deep link được nếu actor có quyền;
- không lộ secret.

---

# UX-230 — Dashboard

## UX-DASH-001 — Hierarchy

```text
1. Page header + filter
2. KPI
3. Main chart
4. Customer/site debt
5. Supplier payable
6. Money obligations
7. Expense
8. Commission
```

## UX-DASH-002 — Desktop layout

```text
┌─────────────────────────────────────────────────────────────┐
│ TỔNG QUAN                           [Làm mới] [Bộ lọc]      │
│ Thời gian | Chi nhánh | Sales | Khách | Công trình          │
├─────────────────────────────────────────────────────────────┤
│ Doanh thu │ LN gộp │ CP HĐ │ LN HĐ │ Biên LN               │
├─────────────────────────────────────────────────────────────┤
│ BIỂU ĐỒ KẾT QUẢ KINH DOANH                                 │
├──────────────────────────┬──────────────────────────────────┤
│ CÔNG TRÌNH ĐANG NỢ       │ NCC ĐANG PHẢI TRẢ                │
├──────────────────────────┴──────────────────────────────────┤
│ CÔNG NỢ & NGHĨA VỤ TIỀN                                    │
├──────────────────────────┬──────────────────────────────────┤
│ CHI PHÍ                  │ HOA HỒNG                          │
└──────────────────────────┴──────────────────────────────────┘
```

## UX-DASH-003 — KPI card

Có:
- label;
- formatted value;
- optional comparison;
- optional helper;
- loading state độc lập.

Không có decorative chart nhỏ nếu không giúp quyết định.

## UX-DASH-004 — Main chart

Chỉ một chart mặc định.

Series:
- Revenue;
- Gross Profit;
- Operating Profit.

Legend rõ.

Tooltip hiển thị tiền format.

## UX-DASH-005 — Customer debt list

Desktop columns:
- customer/site;
- outstanding;
- overdue;
- nearest due;
- sales.

Row click → exact debt drawer.

## UX-DASH-006 — Supplier payable list

Columns:
- supplier;
- outstanding;
- overdue;
- nearest due;
- open source count nếu hữu ích.

## UX-DASH-007 — Money obligations

Bốn cards/summary:
- customer receivable;
- supplier payable;
- salary payable;
- commission payable.

## UX-DASH-008 — Expense

Hiển thị top categories + amount + share.

Click → expense drawer đã filter đúng category.

## UX-DASH-009 — Commission

Rows:
- sales;
- earned/generated;
- approved;
- paid;
- outstanding.

Click → exact employee commission detail.

## UX-DASH-010 — Mobile

Một cột.

KPI:
- 2 cột hoặc horizontal snap.

Debt/payable table → cards.

Không horizontal core table overflow ở 390px.

---

# UX-240 — List/Create/Detail pattern chung

## UX-LCD-001 — List

Phải có:
- title;
- primary CTA;
- search;
- filters;
- table/card;
- pagination;
- state handling.

## UX-LCD-002 — Create

- grouped form;
- summary/totals nếu cần;
- primary Save/Create;
- cancel;
- draft nếu domain hỗ trợ;
- validation inline.

## UX-LCD-003 — Detail

Header:
- identity;
- status;
- key value;
- next action.

Body:
- sections;
- history;
- related records;
- audit summary nếu cần.

---

# UX-300 — `/admin/orders`

## UX-ORD-001 — List columns

Khuyến nghị:
- mã đơn;
- khách;
- công trình;
- giá trị;
- fulfillment;
- payment;
- sales;
- ngày.

Quick filters:
- trạng thái;
- fulfillment;
- payment;
- branch;
- sales;
- period.

## UX-ORD-002 — Create

Sections:
1. Customer/Site.
2. Lines.
3. Source/fulfillment expectation.
4. Delivery requirement.
5. Payment terms.
6. Notes.

Totals luôn thấy ở cuối/summary.

## UX-ORD-003 — Detail

Header:
- order no;
- customer/site;
- total;
- commercial state;
- fulfillment state;
- payment state.

Primary action theo state:
- Confirm;
- Create delivery;
- Record payment context link;
- Cancel nếu policy.

Không hiển thị action không hợp lệ.

---

# UX-310 — `/admin/quotations`

List:
- number;
- customer/site;
- current revision;
- total;
- status;
- expiry;
- sales.

Detail:
- revision selector/history;
- sent revision lock;
- create new revision action;
- send;
- accept status.

Không cho edit revision SENT inline.

---

# UX-320 — `/admin/purchase-orders`

List:
- PO no;
- supplier;
- total;
- expected date;
- state;
- destination/source.

Detail:
- lines;
- source relation;
- received/delivered quantities;
- AP link nếu phát sinh.

---

# UX-330 — `/admin/suppliers`

Detail nên có:
- profile;
- contacts;
- purchase history;
- payable summary;
- recent AP;
- recent payments;
- related materials nếu hữu ích.

Payable click → exact detail.

---

# UX-340 — `/admin/customers`

Detail:
- customer header;
- sites;
- sales owner;
- credit;
- pricing;
- open quotations;
- active orders;
- delivery;
- AR;
- payments;
- documents.

Customer 360 là read composition, không shadow ledger.

---

# UX-350 — `/admin/products`

List:
- code;
- name;
- group;
- base UOM;
- sale/purchase;
- status.

Detail:
- UOM conversions;
- pricing references;
- inventory summary;
- supplier relation nếu có.

---

# UX-360 — `/admin/inventory`

Overview:
- warehouse filter;
- material search;
- on-hand;
- reserved;
- available.

Click row:
- movement history;
- reservations;
- counts.

Không cho inline edit balance.

---

# UX-370 — `/admin/stock-counts`

Flow:
```text
Tạo đợt kiểm
→ Chọn kho/phạm vi
→ Nhập số đếm
→ Xem variance
→ Nhập lý do/bằng chứng
→ Gửi duyệt
→ Adjustment
```

Variance nổi bật.

---

# UX-380 — `/admin/dispatch`

Dispatch board ưu tiên:
- delivery ready/unassigned;
- assigned;
- in progress;
- exception.

Không biến thành kanban trang trí; mỗi cột phải có nghĩa vận hành rõ.

Drag-drop chỉ dùng nếu backend command có validation và fallback action rõ.

---

# UX-390 — `/admin/deliveries`

List:
- delivery no;
- order;
- customer/site;
- schedule;
- vehicle/worker;
- state.

Detail:
- lines;
- planned/actual/accepted;
- assignment;
- proof;
- timeline;
- source.

---

# UX-400 — `/admin/routes` và tracking

Route screen:
- list stops;
- vehicle;
- capacity warning;
- time-window warning;
- map nếu available;
- manual ordering fallback;
- Apply explicit.

Tracking:
- active vehicles/deliveries;
- last update time;
- stale badge;
- không suy diễn failed từ stale.

---

# UX-410 — `/admin/service-jobs`

List:
- job;
- customer/site;
- service type;
- schedule;
- machine/operator;
- state;
- billable status.

Detail:
- planned work;
- actual;
- billable;
- compensable;
- proof;
- AR link.

---

# UX-420 — `/admin/receivables`

List:
- customer/site;
- source;
- issue date;
- due;
- original;
- outstanding;
- overdue state.

Quick filters:
- overdue;
- customer;
- site;
- sales;
- branch;
- due range.

Primary action phù hợp:
- Record receipt/payment.

---

# UX-430 — `/admin/payables`

Tương tự AR nhưng supplier/source.

Không gọi AP là expense trong UI.

---

# UX-440 — `/admin/cashbook` và reconciliation

Cashbook:
- date;
- type;
- amount;
- account;
- counterparty;
- source;
- state.

Reconciliation:
- unmatched;
- matched;
- difference;
- action.

Không ẩn difference quan trọng.

---

# UX-450 — `/admin/workforce`

List:
- employee;
- role;
- branch;
- current work;
- state/availability nếu business cần.

Không expose salary cho actor không có quyền.

---

# UX-460 — `/admin/compensation`

Sections:
- earning events;
- approval;
- payable;
- paid.

Filter:
- employee;
- earning type;
- period;
- status.

Commission có label riêng dễ hiểu nhưng dùng cùng source model.

---

# UX-470 — `/admin/invoices`

List:
- invoice no;
- customer;
- source;
- amount;
- issue status;
- provider/legal status;
- issue date.

`ISSUE_PENDING/UNKNOWN` phải có wording rõ, không làm user bấm issue lại vô thức.

---

# UX-480 — `/admin/messages`

Conversation list:
- participant/entity;
- last message;
- unread;
- time.

Không biến nội dung chat thành action nghiệp vụ tự động.

Có thể đặt shortcut action bên cạnh nhưng phải là command riêng.

---

# UX-490 — `/admin/reports`

Reports không nhồi vào dashboard.

Pattern:
- report selector;
- filters;
- summary;
- table/chart;
- export nếu cần.

Report nặng có loading/progress riêng theo yêu cầu hiệu năng.

---

# UX-500 — `/admin/settings`

Settings chia:
- employees;
- roles;
- branches;
- UOM;
- templates;
- invoice provider;
- system configs thật sự cần.

Dangerous settings:
- warning;
- permission;
- audit.

---

# UX-510 — `/admin/audit`

Cho actor được phép:
- filter actor;
- entity;
- action;
- time.

Hiển thị human-readable summary trước raw technical details.

---

# UX-600 — `/work`

## UX-WORK-001 — Navigation

```text
VIỆC CỦA TÔI
BỂ CÔNG VIỆC
THU NHẬP
TÔI
```

## UX-WORK-002 — Home

Ưu tiên:
1. việc đang làm;
2. việc tiếp theo;
3. action cần xử lý;
4. trạng thái thu nhập ngắn.

## UX-WORK-003 — Job card

Ví dụ:

```text
Giao cát
Đại Mỗ
8,5 tấn
09:30

[ BẮT ĐẦU ]
```

## UX-WORK-004 — Job detail

Phải thấy:
- việc gì;
- ở đâu;
- người nhận;
- số điện thoại;
- quantity;
- note;
- proof required;
- next action.

## UX-WORK-005 — Proof

Flow tối giản:
- chụp/chọn ảnh;
- quantity/result;
- receiver;
- note;
- submit.

Không form văn phòng dài.

## UX-WORK-006 — Safety

Không yêu cầu tài xế bấm nút định kỳ khi đang lái.

Touch target >=48px; primary ~56px.

---

# UX-700 — `/customer`

## UX-CUST-001 — Navigation

```text
TRANG CHỦ
ĐƠN HÀNG
CÔNG NỢ
TÔI
```

Tài liệu/hóa đơn có thể truy cập từ context/detail.

## UX-CUST-002 — Home

Ưu tiên:
- báo giá cần phản hồi;
- đơn đang xử lý;
- giao hàng sắp tới;
- công nợ;
- tài liệu mới nếu cần.

## UX-CUST-003 — Quote

Hiển thị:
- revision;
- lines;
- total;
- terms;
- expiry;
- accept;
- request change.

Không để user accept revision cũ nếu đã superseded.

## UX-CUST-004 — Order

Hiển thị:
- order summary;
- delivery progress;
- payment/debt state ở mức customer-safe;
- documents.

## UX-CUST-005 — Debt

Hiển thị:
- total outstanding;
- overdue;
- due items;
- PaymentNotice action.

Không gọi PaymentNotice là “Đã thanh toán” sau submit.

## UX-CUST-006 — Privacy

Không render:
- internal cost;
- margin;
- supplier terms;
- payroll;
- internal notes.

---

# UX-800 — Responsive

Acceptance widths tối thiểu:

```text
390
768
1024
1440
```

## UX-800.1 — 390px

- không horizontal overflow ở core flow;
- CTA đầy đủ label;
- drawer → full-screen sheet;
- data table → cards/list nếu cần;
- form one-column;
- sticky bottom action nếu hữu ích.

---

# UX-810 — Accessibility

Bắt buộc:
- keyboard navigation trên admin;
- focus visible;
- semantic heading;
- form label;
- error association;
- contrast;
- status không chỉ bằng màu;
- zoom;
- touch target.

---

# UX-820 — Permission-aware UI

UI có thể hide action user không có quyền.

Nhưng:
```text
HIDE
!=
AUTHORIZATION
```

Sensitive field không được fetch nếu không có quyền.

---

# UX-830 — Performance-aware UX

Tuân ngân sách trong `Spec.md`.

Không preload:
- all drawer detail;
- full message history;
- full GPS history;
- hàng trăm records chỉ để tính KPI.

Phản hồi click ngay bằng:
- pressed/loading state;
- disable duplicate submit;
- optimistic chỉ khi safe.

---

# UX-840 — Review checklist

Mỗi màn UI trước khi DONE phải hỏi:

1. Mục tiêu chính của màn là gì?
2. Primary CTA có rõ không?
3. Có quá nhiều action ngang hàng không?
4. Dữ liệu quyết định có ở trên không?
5. Detail có thể lazy-load không?
6. Empty/error/loading đã tách chưa?
7. Permission có leak field/action không?
8. Mobile 390px có usable không?
9. Back/URL state có đúng không?
10. Wording có phải tiếng Việt dễ hiểu không?
11. Raw enum có bị lộ không?
12. Có hành động nào dễ bấm nhầm gây hậu quả lớn không?

# KẾT THÚC UXUI.md
