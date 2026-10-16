> Quy tắc hiện hành 12/10/2026: bỏ opening pending và kích hoạt thủ công khỏi vận hành. Thông tin đối chiếu lịch sử chỉ mô tả chất lượng dữ liệu, không khóa giao dịch mới. Các bằng chứng trạng thái/gate cũ bên dưới là lịch sử, không phải điều kiện đang áp dụng.

> Quyết định Owner 15/10/2026 (`FB-KIOTVIET-20261015`, xem đầu Spec.md): Báo giá tắt (D1) — mọi màn/nút/hành trình báo giá trong tài liệu này tạm không hiển thị; KPI Tổng quan dùng lợi nhuận ròng (D2); biểu đồ đường Thu/Chi/Lợi nhuận theo bộ lọc (D3); thiết lập giá hàng loạt (D4). Màn tạo đơn bán/đơn mua, danh sách khách hàng, vật tư và bộ lọc tham chiếu bố cục KiotViet theo góp ý khách (UX-110.6, UX-ORD-002, UX-320, UX-340, UX-350, UX-FLOW-001).

# UXUI.md — HIỀN XA ERP V2

> **Bộ tài liệu:** `HX-V2-DOCSET-4.4`  
> **Giao thức đồng bộ:** `SYNC-4.4`  
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


# UX-005 — Khóa tuân thủ trải nghiệm

Khi task chạm UI/UX, Codex phải bám đúng các UX-ID liên quan. Không được "cải tiến" flow bằng cách:
- thêm wizard/bước duyệt;
- đổi CTA/hậu quả nghiệp vụ;
- gom nhiều hành động có effects khác nhau thành một nút;
- thêm dashboard/màn hình mới;
- chuyển flow sang pattern khác;

nếu UXUI/Spec không yêu cầu.

Có thể điều chỉnh chi tiết bố cục nhỏ để responsive/accessibility tốt hơn khi không đổi flow, thông tin quyết định hoặc hành vi. Nếu muốn thay flow vì implementation khó, ghi `DOC_CONFLICT`; không sửa flow để dễ code hơn.


# UX-006 — Không re-audit trải nghiệm khi flow contract chưa đổi

Trong BUILD_ONLY:
- đọc đúng UX section của flow hiện tại;
- không nghiên cứu lại Sapo;
- không đánh giá lại toàn navigation/design system;
- không chạy lại usability audit đã có evidence chỉ vì component nhỏ đổi.

Thay đổi UI chỉ invalid màn/flow trực tiếp chạm và shared primitive nếu behavior thật sự đổi. Không invalid toàn bộ UX contract vì thay màu/spacing/component nội bộ không đổi hành vi.


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
  Báo giá          (ẩn khi Báo giá tắt — D1, 15/10/2026)

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

# UX-100 — Tìm kiếm và nhịp phản hồi

Ô tìm kiếm ghi rõ tìm theo mã đơn/khách/công trình. Debounce khởi điểm 300ms; giữ query trong URL sau áp dụng và hủy response cũ khi query mới tới. Đây là tham số tương tác, không thay ngân sách API trong Spec. Phân biệt đang tìm, không có kết quả và lỗi; không query toàn bảng để lọc ở browser.
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

## UX-110.6 — Bộ lọc tự áp dụng (15/10/2026)

- Không có nút "Áp dụng": chọn ở select/ngày là lọc ngay; ô tìm kiếm lọc sau khi ngừng gõ 300ms (UX-100).
- Đổi bộ lọc thay URL hiện tại (tải lại/chia sẻ link giữ bộ lọc; không tạo một mục lịch sử cho mỗi lần gõ nên Back quay về trang trước; không cuộn về đầu trang), bỏ tham số trống và quay về trang 1.
- Giữ "Xóa lọc". Trình duyệt tắt JavaScript vẫn có nút gửi dự phòng.
- Trạng thái chứng từ (đơn bán, đơn mua): mặc định "Đang làm việc" (không gồm đã hủy); có "Đã hủy" riêng; "Tất cả" gồm cả đã hủy. Không ghi chú kỹ thuật kiểu "trừ đã hủy" trong nhãn.

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
│ TỔNG QUAN                                                   │
│ Thời gian | Chi nhánh | Sales | Khách | Công trình (tự lọc) │
├─────────────────────────────────────────────────────────────┤
│ Doanh thu │ Tổng chi phí │ LN ròng │ Biên LN ròng          │
├─────────────────────────────────────────────────────────────┤
│ BIỂU ĐỒ ĐƯỜNG THU / CHI / LỢI NHUẬN                        │
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

## UX-DASH-004 — Biểu đồ chính cùng nguồn tài chính

Một biểu đồ đường mặc định (D3, 15/10/2026): **Thu**, **Chi**, **Lợi nhuận** theo ngày/tuần/tháng của kỳ đang lọc (SPEC-DASH-009). Dùng đúng bộ lọc của trang: đổi kỳ/khách/công trình/sales/loại hoạt động thì biểu đồ đổi cùng KPI. Legend và tooltip ghi kỳ con và chất lượng số liệu; di chuột hoặc phím mũi tên để xem từng điểm; có "Xem bảng số liệu" cho người không đọc được biểu đồ. Điểm không READY làm đứt đường, không vẽ 0. Nếu Chi/Lợi nhuận không áp dụng do thiếu phân bổ chi phí (ví dụ lọc theo khách), ẩn series đó kèm lý do. Mobile: biểu đồ cuộn ngang trong thẻ, không ép nhỏ chữ.

Cách tính và hiệu năng chỉ tham chiếu SPEC-200, SPEC-460, SPEC-PERF-002; không công thức độc lập ở component.

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

## UX-ORD-002 — Tạo đơn qua điện thoại với ít trường ban đầu

Màn đầu ưu tiên khách/công trình + dòng vật tư (quantity/UOM/giá bán). Ngày giao/nguồn có gợi ý rõ nhưng phải xác nhận khi chốt; ghi chú/điều khoản/nhiều nguồn mở dần ở section phụ. Không trình bày một wizard sáu bước bắt người dùng đi từng bước cho đơn một mặt hàng.

Có "Thêm khách nhanh", "Thêm công trình", "Dùng giá riêng", "Nhập giá bán". Không có quyền giá vốn thì không hiển thị/suy ra giá vốn qua tooltip. Tổng tiền rõ và nhãn nguồn giá; thay master ngày sau không đổi đơn cũ.

Nút chính khi đang nhập: "Lưu nháp" hoặc "Xác nhận đơn" theo trạng thái/quyền, hậu quả phải rõ. Không tự bấm xác nhận/ghi nợ vì người dùng vừa chọn khách.

Bố cục kiểu KiotViet (15/10/2026):
- Vùng chính: ô "Tìm vật tư" (mã/tên, gõ không dấu được, phím tắt F3) → Enter/bấm thêm dòng với ĐVT mặc định, số lượng 1 và đưa con trỏ vào ô số lượng; chọn lại cùng vật tư + ĐVT mặc định (chưa sửa giá) thì tăng số lượng. Bảng dòng sửa trực tiếp: STT │ Mã │ Tên │ ĐVT │ SL │ Đơn giá │ Thành tiền │ ✕; nhập giá thủ công (khi có quyền) thì ô lý do hiện ngay dòng đó; Enter trong dòng quay về ô tìm vật tư.
- Cột phải: Khách hàng (tìm gõ-là-lọc, "+ Thêm khách"; không chọn sẵn khách đầu tiên), Công trình/điểm giao (sau khi chọn khách, ô công trình được focus và mở danh sách; không tự chọn kể cả khi chỉ có một — SPEC-JOURNEY-003), ngày, điều khoản/ghi chú, tổng hợp (số dòng, tổng tiền hàng).
- Giá tự tính lại sau khi ngừng sửa ~250ms; không có nút "Tính giá và xem trước", "Tìm khách", "+ Thêm dòng".
- Hai nút: **"Tạo đơn"** = lưu và xác nhận trong một lần bấm (chỉ hiện khi có quyền xác nhận) và **"Lưu nháp"**; có dòng giải thích hậu quả hai nút. Nếu lưu được nhưng xác nhận bị từ chối (hạn mức, quá hạn...) thì bản nháp vẫn còn, mở trang chi tiết đơn kèm lý do tiếng Việt. Mất phản hồi dùng "Thử lại đúng thao tác" (UX-850), không tạo đơn thứ hai.
- Mobile: cùng nội dung một cột; mỗi dòng vật tư thành thẻ có nhãn trường.

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

> Tắt từ 15/10/2026 (D1): route trả "không tìm thấy", không có trong menu. Nội dung dưới đây áp dụng khi Owner bật lại.

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

Tạo/sửa đơn mua (15/10/2026) dùng cùng bộ khối với UX-ORD-002: ô tìm vật tư + bảng dòng (ĐVT mua, SL, giá mua từ giá NCC, giá thủ công + lý do); cột phải: Nhà cung cấp (tìm gõ-là-lọc, "+" thêm NCC nhanh ngay trong màn), Giao đến (Kho / Giao thẳng), kho nhận + địa chỉ, ngày dự kiến, ghi chú, tổng hợp. Đơn nhập kho mới có **"Tạo đơn mua"** (lưu + xác nhận, khi có quyền) và "Lưu nháp"; đường giao thẳng giữ nút nói rõ hậu quả theo UX-FLOW-003 ("Lưu đơn mua và bản nháp bán", "Lưu đơn mua giao thẳng").

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

List (kiểu KiotViet, 15/10/2026): ô tìm kiếm + bộ lọc cột trái (Trạng thái, Loại khách, Nhóm giá), tự áp dụng (UX-110.6). Cột: Mã │ Tên khách hàng │ Điện thoại │ Nhóm giá │ Nợ hiện tại │ Hạn mức │ Trạng thái; Nợ hiện tại và Hạn mức chỉ truy vấn/hiển thị khi có quyền xem phải thu, chỉ cho các khách trên trang. Bấm mã, tên hoặc bất kỳ chỗ nào trên dòng đều mở hồ sơ khách. Mobile: mỗi khách là một thẻ.

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

Kiểu KiotViet (15/10/2026): ô tìm kiếm + lọc cột trái (Nhóm vật tư, Trạng thái, Cho phép bán/mua), 25 dòng/trang. Thêm cột Giá bán (giá chung hiện hành theo ĐVT gốc, khi có quyền xem giá), Giá vốn bình quân (khi có quyền giá vốn), Tồn kho tổng các kho của chi nhánh (khi có quyền kho) — chỉ truy vấn cho các dòng trên trang. Bấm dòng mở rộng ngay tại chỗ: tồn theo kho, quy đổi ĐVT và link "Xem chi tiết vật tư". Đầu trang: "+ Vật tư", "Thiết lập giá", "Danh mục khác".

`/admin/products/pricing` — Thiết lập giá (D4, SPEC-PRI-005): bảng Mã │ Tên │ ĐVT │ Giá vốn (theo quyền) │ Giá hiện tại │ Giá mới (sửa trực tiếp) │ Chênh lệch; chọn nhiều dòng → tăng/giảm theo % hoặc số tiền, chọn làm tròn (1.000 đ mặc định / 100 đ / không), xem chênh lệch từng dòng; một ngày áp dụng + một lý do; nút "Lưu bảng giá (N thay đổi)" lưu tất cả một lần. Thanh lưu dính đáy màn trên desktop. Không có quyền quản lý giá: chỉ xem. Giá theo khách và lịch sử ở "Giá theo khách & lịch sử".

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

# UX-AUTH-001 — Đăng nhập và tài khoản theo ba cổng

Các route đăng nhập dự kiến: `/login`, `/work/login`, `/customer/login`. Tái sử dụng cùng Auth provider, khác lời dẫn và đích redirect an toàn; không ba database người dùng. Không tự mở đăng ký nội bộ công khai.

Một form có label, hỗ trợ paste/password manager, bàn phím phù hợp, hiện/ẩn mật khẩu, báo lỗi không tiết lộ tài khoản tồn tại, quên mật khẩu/khôi phục theo provider. Nhân viên/công nhân không có email có thể dùng cách xác thực provider được hỗ trợ sau khi chủ chọn; không viết OTP giả. Login xong tự chọn branch nếu chỉ có một; không bắt chọn vai trò mỗi lần.

Session hết hạn: giữ draft an toàn, dẫn đăng nhập và trở lại trang đã được kiểm quyền; không lặp redirect giữa admin/work/customer. Logout trên thiết bị dùng chung không để hiện màn công nợ cache của người trước. Nhận hàng không đồng nghĩa thành viên tài chính của khách.

# UX-TEST-001 — Bài thử trước khi khóa thiết kế

Đây là kế hoạch thử, không kết quả đã quan sát. Prototype phải gắn nhãn dữ liệu giả. Đề xuất ba đại diện vai trò; ghi thời gian thao tác, bước cần trợ giúp, lỗi nhập/hiểu trạng thái và phản hồi.

| Bài thử | Kết quả cần quan sát | Điều kiện đề xuất |
|---|---|---|
| Nhận đơn xi măng qua điện thoại | Chọn khách/công trình/giá riêng, nhập tấn rồi xem bao, không đổi tổng | Hoàn tất không hướng dẫn từng nút, không chốt sai giá/UOM |
| Lập báo giá và khách đồng ý qua Zalo | Nhân viên gửi PDF đúng revision và ghi nhận kênh xác nhận | Không bắt khách đăng nhập mới có thể bán |
| Chọn NCC giao thẳng | Chọn khách/SO/giá bán trên PO có liên kết | Không nhập lại hai bản giá bán |
| Chủ xem khoản công trình nợ | Click một dòng ở Dashboard tới đúng khoản và thu tiền nhiều đơn | Một thao tác để mở đúng chi tiết, không tìm lại |
| Thợ báo giao thiếu và upload ảnh lỗi | Sửa lượng thực, retry upload riêng, gửi đúng một kết quả | Phân biệt chưa gửi/chờ duyệt/đã duyệt; không có thao tác khi lái |
| Khách gửi ảnh chuyển khoản | Thấy thông báo đã nhận bằng chứng, công nợ vẫn chờ đối soát | Không nhầm đã được ghi nhận tiền |

Mục tiêu ban đầu cho thao tác mới hoàn chỉnh là không lỗi nghiêm trọng và không cần người thiết kế hướng dẫn từng bước. Thời gian thực hiện nhiệm vụ khác thời gian API; không dùng p95 server thay khả năng sử dụng. Nếu người đại diện không thực hiện được, sửa flow trước code backend sâu; chủ thích màu chưa đủ để PASS bài thử.

Không tuyên bố đạt WCAG chỉ bằng screenshot/tài liệu. Khi có UI thật phải thử keyboard/focus/zoom/contrast/đăng nhập và alternative cho drag theo SPEC-490.

# UX-850 — Trạng thái kết quả chưa xác định

Khi quá ngưỡng phản hồi trong Spec:
- Query đọc: "Chưa tải được. Thử lại".
- Command tiền/kho: "Chưa xác định kết quả. Đang kiểm tra" cùng mã thao tác; nút "Kiểm tra kết quả", không "Tạo lại" với key mới.
- Job dài: hiển thị trạng thái hàng đợi/thực thi/lỗi và quyền retry đúng lần; không chỉ toast biến mất.

Form không mất dữ liệu sau lỗi; thành công hiển thị mã chứng từ và kết quả đã commit. Trạng thái `PROCESSING/UNKNOWN` không dùng màu/huy hiệu "Hoàn thành".

# UX-860 — Dashboard khi bộ lọc không áp dụng đầy đủ

Kỳ và branch hiện ở header mọi card. Sales/khách/công trình/hoạt động là bộ lọc mở rộng; `SPEC-REPORT-001` quyết định card nào áp dụng. Chip ở card ghi phạm vi thực. Không dùng một chip "Công trình A" trên toàn màn trong khi Opex vẫn toàn công ty mà không chú thích.

`INCOMPLETE`: "Chưa đủ giá vốn/chi phí"; `NOT_APPLICABLE`: "Chi phí chung chưa phân bổ theo bộ lọc này"; `FORBIDDEN`: không trả trường/ẩn card theo quyền; `UNAVAILABLE`: lỗi tải + thử lại; 0 chỉ khi READY thực sự không phát sinh.

Lương phải chi và hoa hồng phải chi là hai nhóm không chồng lặp. Drill-down cũ có thể xem historical nhưng nút thu/chi tạo form dùng **số dư hiện tại** đã kiểm lại; không thanh toán theo số dư lịch sử stale. Quay lại giữ filters, đóng drawer phục hồi focus đúng dòng.

# UX-870 — Xử lý ngoại lệ không làm người dùng tự sửa ledger

Chi tiết Delivery phải tách "đã đưa lên xe", "khách nhận", "tính tiền", "còn trên xe/trả kho". Trạng thái PARTIAL là kết quả, không một nút thần kỳ hoàn tất toàn đơn. Có hành động "Giao tiếp phần còn lại", "Nhận hàng trả", "Báo hỏng/hao hụt", "Yêu cầu điều chỉnh" theo quyền.

Trong công nợ, nút điều chỉnh mở reason + evidence + delta + hậu quả dự kiến; không editable tổng số dư. Trả hàng và hoàn tiền là hai hành động độc lập được liên kết. Giá theo bao/tấn có phép quy đổi đọc được ngay; field % chỉ là nâng cao.

# UX-880 — Khả năng phục hồi và đọc dễ

Không bắt toàn bộ địa giới thành trường bắt buộc trước khi lưu draft. Ngày/giờ hiển thị Việt Nam; số tiền/quantity có đơn vị đầy đủ. Không dùng m/triệu viết tắt trong chứng từ và xác nhận thanh toán; có thể rút gọn card kèm giá trị đầy đủ trong tooltip accessible.

Cỡ chữ/nút trong UX-060 và UX-WORK-006 là lựa chọn thiết kế Hiền Xa, không phải lời khẳng định đó là nguyên văn chuẩn WCAG. Form ít trường đầu không bỏ validation nghiệp vụ khi chốt. Các modal không được lồng nhiều tầng; hành động dài chuyển trang có đường quay lại giữ context.

# UX-890 — Bằng chứng nghiệm thu UI

`implementation.md` chỉ ghi PASS UI khi có build/route/viewport/action/screenshot hoặc kết quả browser cụ thể. Prototype mock test không chứng minh RLS/performance/database. Trong audit tài liệu chỉ ghi CONTRACT_REVIEWED, không UI_TESTED.

---

# UX-900 — Sáu hành trình thao tác để triển khai, không chỉ danh sách trường

## UX-FLOW-001 — Phạm vi tham chiếu Sapo và cấu trúc công việc

Tham chiếu tài liệu quản trị **Sapo Omni/OmniAI trên web** về tạo đơn, đặt hàng nhập, hồ sơ khách và thanh toán công nợ. Không trộn mặc định màn máy tính tiền, FnB, kế toán hoặc màn trên điện thoại thành một giao diện Hiền Xa. Nguồn và giới hạn được ghi ở IMP-WORKFLOW-001.

Học: điều hướng trái, ô tìm kiếm rõ, lọc nhanh, bảng hàng chỉnh trực tiếp, thêm nhanh đối tượng và đi vào chứng từ liên quan. Từ 15/10/2026 theo góp ý khách, màn tạo đơn bán/mua, danh sách khách hàng/vật tư và thiết lập giá tham chiếu thêm bố cục KiotViet (ô tìm hàng hóa F3, bảng dòng sửa trực tiếp, cột phải khách và tổng tiền, ít nút) với cùng giới hạn không sao chép thương hiệu. Không sao chép: thương hiệu, độ dày đặc của tất cả cột, hover-only để đọc tồn, hoặc quy trình hãng vận chuyển không phù hợp xe vật liệu của Hiền Xa.

Menu UX-030 là danh mục toàn hệ thống, không phải màn hình mặc định của mọi tài khoản. Bán hàng ưu tiên Đơn bán/Báo giá/Khách hàng; điều phối ưu tiên Giao hàng; tài chính ưu tiên Công nợ/Thu chi; chủ có Tổng quan. Các mục không thường dùng vẫn truy cập được theo quyền, có thể thu gọn nhóm, không xóa chức năng để làm giao diện có vẻ đơn giản.

Không tạo thêm dashboard riêng cho mỗi vai trò: có thể dùng bộ lọc và trang đích cố định được cấp quyền. Không đưa toàn bộ lương/lợi nhuận cho nhân viên chỉ vì cùng đăng nhập `/admin`.

## UX-FLOW-002 — Hành trình 1: nhận đơn qua điện thoại/Zalo

**Người dùng:** nhân viên bán hàng. **Bắt đầu:** nút Tạo đơn ở danh sách hoặc hồ sơ khách/công trình. **Kết thúc:** một đơn được lưu đúng mức nháp/xác nhận và nhìn thấy việc tiếp theo.

| Bước | Người dùng làm | Hệ thống điền/hỗ trợ | Cần nhìn thấy trước khi sang tiếp |
|---|---|---|---|
| 1 | Tìm khách bằng tên/điện thoại/mã | Kết quả khách có sẵn; thêm nhanh nếu có quyền | Đúng khách; không tự gộp người trùng số điện thoại |
| 2 | Chọn/xác nhận công trình | Điểm giao, người nhận, hạn chế xe đã lưu | Tên và địa chỉ; nút Thêm công trình không làm mất đơn đang nhập |
| 3 | Chọn vật tư, nhập số lượng/đơn vị | Giá riêng hợp lệ; quy cách; tồn khả dụng nếu được phép | Nguồn giá, giá theo đơn vị, thành tiền |
| 4 | Chọn thời điểm giao và nguồn nếu đã biết | Mặc định có nhãn, phần nhiều nguồn mở theo nhu cầu | Ngày giao là đã chốt hay còn dự kiến; nguồn chưa chốt không giả READY |
| 5 | Chọn Lưu nháp hoặc Tạo đơn (lưu + xác nhận) | Kiểm giá/UOM/hạn mức/trạng thái ở server | Tổng tiền + điểm giao + phạm vi cam kết; chỉ hành động được phép |
| 6 | Xem kết quả | Trả mã đơn và hướng dẫn công việc tiếp | Chờ chọn nguồn/Chờ phân giao/... theo trạng thái nguồn thật |

Desktop: khối dòng vật tư là vùng chính; bên cạnh là khách/công trình và tổng hợp. Không bắt mở lần lượt sáu trang cho đơn đơn giản. Mobile: cùng nội dung theo một cột, nhãn/tổng dễ thấy.

Ví dụ giả định quy cách đã cấu hình: xi măng A, 2 tấn, 3.000.000 đ/tấn → 6.000.000 đ; dòng phụ "40 bao × 50 kg". Đơn giá này là dữ liệu thử, không giá thật của Hiền Xa. Chuyển sang bao phải hiển thị lại số lượng và giá theo bao tương ứng, không giữ nguyên đơn giá/tấn dưới nhãn bao.

Nếu khách chỉ cần báo giá: chuyển sang luồng báo giá với thông tin đã nhập và đúng quyền (khi Báo giá tắt theo D1: dùng Lưu nháp). Nếu khách đã chốt đơn: không buộc tạo một báo giá vô nghĩa. Ghi nhận khách đồng ý qua điện thoại/Zalo theo kênh/bằng chứng hiện có, không bắt khách mở portal mới có thể bán.

**Ngoại lệ:** thiếu giá; trùng khách; UOM chưa cấu hình; tồn chưa xác định; vượt hạn mức; đang lưu thì mất mạng. Lỗi phải giữ form. Mất phản hồi lệnh dùng UX-850, không tạo đơn thứ hai.

## UX-FLOW-003 — Hành trình 2: mua NCC giao thẳng khách

**Người dùng:** mua hàng/điều phối hoặc người kiêm được cấp quyền. **Kết thúc:** đơn mua và đơn bán liên kết đúng, biết ai phải xác nhận tiếp; chưa có nhập/xuất kho giả.

### Điểm vào A — Đã có đơn bán

Từ chi tiết đơn bán → **Đặt NCC giao thẳng** → chọn dòng/quantity còn thiếu nguồn → chọn NCC/giá mua/ngày dự kiến → xem khách/công trình được điền sẵn → lưu đơn mua liên kết.

Giá bán chỉ đọc từ đơn bán đã chốt theo quyền. Muốn đổi giá bán phải dùng hành động sửa thương mại hợp lệ; không ô giá thứ hai cập nhật độc lập. Lượng đã phân bổ không được phân bổ lần nữa do người dùng bấm lại.

### Điểm vào B — Bắt đầu từ Mua hàng

Tạo đơn mua → NCC + vật tư + giá mua → **Giao đến: Kho Hiền Xa / Giao thẳng khách**. Chọn giao thẳng thì hiện Khách/Công trình và lựa chọn **Gắn đơn bán có sẵn** hoặc **Tạo bản nháp bán liên kết**.

Nếu tạo mới, nhân viên có quyền nhập giá bán nhìn thấy hai khối rõ: **Giá mua NCC** và **Giá bán khách**. Nút lưu nói đúng hậu quả: **Lưu đơn mua và bản nháp bán**. Người thiếu quyền tạo bán chỉ được gắn đơn bán được phép hoặc chuyển cho người phụ trách; không âm thầm cấp quyền mở rộng.

Hai bản nháp được tạo cùng thao tác nội bộ có liên kết và chống lặp theo SPEC-CONFIG-002. Chốt từng phía vẫn theo trạng thái/quyền của Spec. Mở lại màn phải thấy hai mã chứng từ, không yêu cầu tìm lại khách/vật tư.

### Khi thực hiện

NCC hoặc người điều phối cung cấp lượng giao/bằng chứng; Hiền Xa xác minh lượng được tính với NCC và với khách bằng nhãn riêng. Trường hợp NCC tự chở: hiển thị đầu mối/xe NCC nếu có, không bắt tài xế nội bộ nhận việc giả. Nút nhận hàng vào kho không xuất hiện như hành động mặc định cho đường giao thẳng.

**Ngoại lệ:** NCC đổi giá/ngày; giao thiếu; giao sai công trình; đơn bán bị đổi/hủy khi đang tạo đơn mua. Hiện chênh lệch cần xử lý, không chốt lại âm thầm.

## UX-FLOW-004 — Hành trình 3: từ hồ sơ khách đến hành động tiếp theo

**Người dùng:** bán hàng/tài chính. **Bắt đầu:** tìm khách hoặc bấm tên khách từ đơn/công nợ. **Kết thúc:** thực hiện hành động trên đúng khách/công trình mà không tìm lại ở module khác.

Đầu hồ sơ hiển thị tên/liên hệ, nhân viên phụ trách, công trình đang dùng và thông tin công nợ được phép. Hành động chính: **Tạo đơn**. Hành động phụ theo quyền: **Tạo báo giá** (ẩn khi Báo giá tắt — D1), **Ghi nhận thu tiền**.

Các vùng chính: Tổng quan, Công trình, Giá riêng, Giao dịch, Công nợ. Tài liệu/lịch sử được nhóm trong vùng liên quan; không bắt hiển thị đồng thời mọi bảng. Tìm một công trình phải mở được đúng đơn/giao/công nợ của công trình đó.

Từ một công trình bấm Tạo đơn: khách và điểm giao đã điền sẵn, nhưng vẫn hiển thị để kiểm tra. Từ một giá riêng: thấy đơn vị và thời gian hiệu lực; không hiểu giá cũ trong lịch sử là giá hiện tại.

Chăm sóc chỉ cần ghi chú + người phụ trách + ngày liên hệ lại khi thực sự cần. Không tự mở rộng thành CRM pipeline nhiều giai đoạn/automation. Mục tiêu ở scope này là bán và theo công trình, không nhập hồ sơ marketing cho đủ trường.

## UX-FLOW-005 — Hành trình 4: một khoản thu cho nhiều đơn

**Người dùng:** tài chính/người có quyền thu. **Bắt đầu:** dòng khách/công trình trên Dashboard hoặc hồ sơ khách. **Kết thúc:** một phiếu thu đã ghi và các phân bổ đúng, có đường quay lại nguyên ngữ cảnh.

1. Bấm khoản nợ → khung chi tiết đúng khách/công trình, thấy các khoản mở.
2. Bấm **Ghi nhận thu tiền** → form được điền khách và phạm vi. Nếu đang xem quá khứ, thông báo đang sử dụng số dư **hiện tại** để thu.
3. Nhập tiền nhận, phương thức, ngày nhận, tham chiếu/bằng chứng cần thiết. Danh sách khoản thanh toán hiển thị ngay trong form.
4. Chọn khoản; hệ thống có thể gợi ý phân bổ theo policy đã duyệt, nhưng phải hiển thị từng dòng và cho kiểm tra. Chưa có policy thì không âm thầm chọn thứ tự.
5. Xem **Tiền nhận / Đã phân bổ / Còn dư** cùng số nợ sau thao tác. Bấm **Ghi nhận thu tiền** một lần.
6. Hiển thị mã phiếu và kết quả đã commit; quay lại đúng filter. Mất phản hồi thì kiểm tra mã thao tác, không tạo phiếu mới.

Ví dụ thử: ba khoản 2.000.000 + 3.000.000 + 1.000.000 đ; thu 4.000.000 đ; người dùng duyệt phân bổ 2.000.000 + 2.000.000 + 0 đ. Tổng còn nợ 2.000.000 đ, không ghi doanh thu mới từ tiền thu.

Đang mở từ công trình A không tự dùng tiền trả cho công trình B. Có lựa chọn **Chọn thêm công trình của khách này** với kiểm quyền và xác nhận phạm vi. Không tự phân bổ sang khách khác. Tiền dư xử lý theo advance/unallocated đã chốt trong Spec, không biến thành công nợ âm vô danh.

NCC/lương/hoa hồng áp dụng cùng nguyên tắc **nhìn khoản → mở nguồn → chi có kiểm chứng**, nhưng không tái dùng sai permission hoặc trộn nghĩa vụ ở hai sổ.

## UX-FLOW-006 — Hành trình 5: thực hiện chuyến giao

**Người dùng:** điều phối, kho, tài xế/thợ, người xác minh. Vai trò có thể do cùng người kiêm, nhưng hậu quả được ghi theo đúng danh tính/quyền.

| Điểm bàn giao | Người làm | Thông tin không phải nhập lại | Phản hồi cần có |
|---|---|---|---|
| Đơn đủ điều kiện để phân giao | Điều phối | Khách, công trình, vật tư, ngày giao, nguồn | Chọn chuyến/xe/người hoặc đưa việc đủ điều kiện vào bể |
| Hàng lên xe | Kho/người bàn giao | Danh sách theo chuyến | Xác nhận lượng thực lên xe; thợ thấy đã bàn giao, không tự trừ kho lần nữa |
| Bắt đầu giao khi an toàn | Tài xế | Địa chỉ/liên hệ/ghi chú/quantity | Trạng thái công việc mới sau server phản hồi; định vị có thông báo |
| Tại nơi giao | Thợ/tài xế | Số lượng kế hoạch chỉ làm gợi ý có nhãn | Gửi kết quả giao: thực tế, người nhận, bằng chứng; báo thiếu/sự cố ngay trong form |
| Xác minh | Người được quyền | Kết quả, ảnh và sai lệch | Duyệt lượng tính tiền theo Spec, không sửa sổ tổng bằng tay |

Không bắt thợ bấm qua từng enum nội bộ. Một sự kiện thực tế có thể có một thao tác giao diện ghi nhận các hậu quả hợp lệ. Không gộp các sự kiện xảy ra ở thời điểm khác nhau chỉ để giảm click.

Số lượng được gợi ý không được tự coi là khách đã chấp nhận. Thợ phải kiểm lại trước gửi; sai lệch mở thêm trường có lý do. Nếu ảnh lỗi thì retry ảnh riêng, không mất lượng đã nhập.

## UX-FLOW-007 — Hành trình 6: giao thiếu, trả hàng hoặc cần điều chỉnh

**Bắt đầu:** ngay tại đơn/chuyến/khoản công nợ đang xử lý. **Không** buộc quay về module tổng và tìm lại.

Nút **Báo vấn đề** mở loại vấn đề: giao thiếu, hàng trả, hỏng/hao hụt, khách chưa đồng ý, thông tin cần sửa. Form chỉ hiện dữ liệu cần cho loại đó. Nguồn, khách/công trình và dòng hàng đã chọn được giữ sẵn.

Kết quả đầu tiên là ghi nhận sự cố/yêu cầu có người phụ trách và trạng thái. Sau đó các action được quyền: giao tiếp phần còn lại; xác nhận hàng về kho; duyệt điều chỉnh; hoàn tiền. Mỗi action vẫn theo Spec, không tự hoàn tiền chỉ vì có ảnh hàng trả, không tăng kho chỉ vì chuyến giao thất bại.

Thay vì bắt user tự nhớ lỗi ở đâu, đơn có dòng rõ **Cần xử lý: 2 bao chưa giao — chờ điều phối** và dẫn đến đúng hành động. Đây là projection từ dữ liệu có sẵn, không workflow engine mới.

## UX-FLOW-008 — Trang chi tiết đơn là nơi điều hành, không chỉ nơi xem

| Điều kiện nguồn | Action nổi bật theo quyền | Không được ngầm làm |
|---|---|---|
| Đang nhập nháp | Lưu nháp hoặc Xác nhận đơn | Không ghi AR, không xuất kho |
| Đã xác nhận, thiếu nguồn | Chọn nguồn / Đặt NCC | Không giả đủ hàng |
| Nguồn đã sẵn, chưa có chuyến | Tạo phiếu giao | Không tự nhận việc thay thợ |
| Đã có chuyến | Xem chuyến / Xử lý vấn đề | Không tạo chuyến trùng do refresh |
| Kết quả chờ xác minh | Xem và xác minh kết quả | Không coi worker DONE là đã được duyệt |
| Có khoản phải thu | Ghi nhận thu tiền | Không auto-post từ chat/biên nhận |
| Có ngoại lệ | Xử lý vấn đề | Không edit ledger tổng |

Action chính có thể khác nhau theo vai trò. Khi không có quyền, nêu người/nhóm chịu trách nhiệm, không đưa dữ liệu nhạy cảm và không để một nút bị vô hiệu không giải thích. Không thêm bước duyệt nhân tạo cho mọi việc chỉ vì hệ thống có nhiều trạng thái.

## UX-FLOW-009 — Mẫu tạo mới, tra cứu và phản hồi thống nhất

- Khi thêm nhanh khách/NCC/công trình, lưu xong tự chọn đúng bản ghi vào form gốc; giữ những dòng đang nhập. Không lồng ba modal; tác vụ dài mở trang riêng và có đường quay về draft.
- Tên nút là hành động: Tạo đơn, Lưu nháp, Gửi báo giá, Ghi nhận thu tiền. Không dùng "Xử lý", "Hoàn tất" chung chung khi hậu quả tiền/kho khác nhau.
- Kết quả thành công có mã chứng từ, trạng thái và bước tiếp theo. Không chỉ toast rồi về danh sách không có ngữ cảnh.
- Bảng mặc định giữ cột cần quyết định; các trường hiếm nằm trong chi tiết/tùy chọn. Không giảm cỡ chữ để nhét đủ mọi cột.
- Không bắt người dùng thuộc phím tắt; có thể bổ sung sau khi hành trình bằng chuột/chạm đã đạt.

## UX-FLOW-010 — Cách tránh "giống Sapo" chỉ ở màu và menu

Mỗi prototype bàn giao phải kèm dữ liệu giả, điểm bắt đầu, bước bấm và kết quả của sáu hành trình trên. Nghiệm thu theo **số lần nhập lại, số lần tìm lại đối tượng, số bước cần hỏi người khác, lỗi giá/UOM/nguồn/tiền và khả năng phục hồi**. Ảnh đẹp là một bằng chứng thị giác, không chứng minh luồng hoàn thành.

Không hứa tương đương hiệu năng, tính năng hoặc chất lượng Sapo khi chưa có đo. Không lấy tài liệu trợ giúp Sapo làm bằng chứng đã đăng nhập và thử sản phẩm Sapo.

# UX-TEST-002 — Mục tiêu thử nghiệm thao tác trước khi code sâu

Các thời gian sau là **mục tiêu thử đề xuất**, không phải số đo đã đạt hay ngân sách API. Thử sau một lần giới thiệu ngắn, không người thiết kế chỉ từng nút. Mạng/API dùng fixture ổn định để tách độ khó thao tác; kiểm mạng yếu ở ca riêng.

| Ca | Điều kiện dữ liệu giả | Mục tiêu thử ban đầu |
|---|---|---|
| Nhận đơn khách cũ | 1 công trình đã lưu, 3 dòng hàng có giá/UOM, không bị chặn tín dụng | Hoàn tất trong khoảng 2 phút; không nhập lại liên hệ/giá có sẵn; không lỗi quan trọng |
| NCC giao thẳng từ đơn bán | 1 NCC, 2 dòng đã có đơn bán, có quyền cần thiết | Khoảng 2 phút; không nhập lại khách/vật tư/giá bán; đúng liên kết |
| Hồ sơ khách → đơn mới | 1 khách nhiều công trình | Đi đến form với đúng công trình được chọn, không tìm khách lại |
| Dashboard → khoản nợ | Một dòng khách/công trình visible | Một thao tác mở đúng chi tiết; không dò module khác |
| Thu cho nhiều đơn | 3 khoản, 1 khoản tiền, không cần chờ ngân hàng | Khoảng 1 phút; đúng phân bổ, không trả nhầm công trình |
| Thợ gửi kết quả | 1 dòng giao, một bằng chứng giả, có người nhận | Khoảng 1 phút ngoài thời gian chụp/upload; phân biệt gửi và đã duyệt |

Thử ít nhất ba đại diện cho bán hàng, chủ/tài chính và hiện trường; không suy thống kê dân số từ mẫu nhỏ này. Với mỗi vai trò thử ca thường và ca ngoại lệ, đổi dữ liệu ở lần thử lại để tránh chỉ nhớ đường bấm. Ghi thời gian, trợ giúp, nhập lại, sai sót và chỗ do dự. Có lỗi tiền/đơn vị/khách/nguồn hoặc người dùng không hiểu hậu quả nút → sửa flow rồi thử lại. Có lý do thực tế cần điều chỉnh target thì Owner xem bằng chứng, không âm thầm nới để PASS.

Kết quả chỉ `OBSERVED_PASS/OBSERVED_FAIL` khi đã có quan sát cụ thể; chưa có người thử là `WAITING_USER_REVIEW`, không tự kiểm bằng agent rồi gọi là người dùng đã nghiệm thu.

# UX-EXEC-003 — Lịch thử do chủ quyết định

Các bài thử UX-TEST-001/002 là tiêu chí trải nghiệm để chủ tự đánh giá hoặc mở QA, không checklist phải chạy sau từng task. Mẫu thử vẫn nên xuất hiện sớm; chưa có người dùng thử thì ghi NOT_RUN/chưa duyệt, không tự chứng nhận dễ dùng. Có thể tiếp phần code độc lập trong phạm vi đã mở, nhưng không đổi luồng đã chốt hoặc coi Prototype/UAT đã PASS.

# UX-QA-001 — Cách dùng tài liệu nghiệm thu riêng

Trong `BUILD_ONLY`, chỉ đọc UX của task đang làm; không bắt nạp `acceptance.md`. Khi chủ tự thử hoặc ra lệnh nghiệm thu, dùng bản đồ phạm vi ở ACC-030 để chọn hành trình. Tài liệu đó chỉ hướng dẫn thử, không thay UX-FLOW-001 đến UX-FLOW-010 hoặc mục tiêu UX-TEST-002.

Ghi rõ actor, màn hình/thiết bị, dữ liệu giả, bước cần trợ giúp, lần nhập/tìm lại và lỗi người dùng thực thấy. Agent tự thử giao diện là kiểm bằng công cụ, không phải người dùng đã duyệt. Lời chủ chấp nhận một màn chỉ áp dụng đúng màn/phiên bản; chưa thử backend thì vẫn NOT_RUN. Kết quả nằm ở implementation, trạng thái và phạm vi ở tasks; không thêm checklist nghiệm thu vào từng task UI.


# UX-910 — Trang đích theo vai trò, không tạo thêm dashboard

Sau đăng nhập, đưa người dùng vào nơi họ thường bắt đầu:

| Nhóm | Trang đích mặc định |
|---|---|
| Chủ/quản lý | Tổng quan |
| Bán hàng | Đơn bán |
| Mua hàng | Đơn mua / Chờ chọn nguồn |
| Điều phối | Giao hàng / Chờ phân giao |
| Tài chính | Phải thu / khoản cần xử lý |
| Kho | Tồn kho / chuyến chờ bàn giao |

Một người có nhiều quyền vẫn chỉ có một trang đích cấu hình đơn giản; menu còn lại theo quyền. Không dựng widget dashboard cá nhân hóa hoặc home builder.

Trang đích phải ưu tiên **việc cần hành động**, không biểu đồ trang trí. Các danh sách "Chờ..." là filter/read model từ state nguồn.

# UX-920 — Nguyên tắc thao tác giảm chuyển module

1. Từ một chứng từ, action tiếp theo mở đúng context; không bắt copy mã rồi tìm ở menu khác.
2. Thêm nhanh khách/NCC/công trình quay về form gốc và tự chọn bản ghi mới.
3. Detail page là nơi điều hành: header + state + primary next action + các liên kết nguồn.
4. Dữ liệu đã snapshot chỉ đọc; muốn thay đổi tạo revision/adjustment phù hợp.
5. Các trường hiếm nằm trong "Thêm tùy chọn"; không làm form đầu tiên thành màn cấu hình toàn bộ nghiệp vụ.
6. Chỉ một primary CTA tại một thời điểm; action tiền/kho ghi rõ hậu quả.
7. Không dùng wizard nhiều bước cho nghiệp vụ đơn giản; chỉ dùng khi mỗi bước thật sự phụ thuộc quyết định trước.

# UX-FLOW-011 — Nhận hàng NCC về kho

**Người dùng:** mua hàng/kho. **Điểm vào:** PO đang chờ nhận hoặc danh sách nhận hàng.  
Chọn PO → nhập lượng thực nhận theo dòng → ghi sai lệch/bằng chứng → xác nhận nhận.

Kết quả sau xác nhận:
- tồn kho tăng đúng lượng nhận;
- giá/cost basis lấy từ căn cứ mua đã snapshot;
- khoản phải trả phát sinh theo policy;
- PO hiển thị phần đã nhận/còn lại.

Không bắt tạo một "phiếu nhập" độc lập rồi nhập lại supplier/material nếu đã bắt đầu từ PO. Nếu cần chứng từ nội bộ, hệ thống sinh từ cùng transaction/source.

# UX-FLOW-012 — Dịch vụ máy/xe/phá dỡ từ yêu cầu tới tính tiền

**Người dùng:** điều phối, hiện trường, người xác minh.  
Yêu cầu/đơn dịch vụ → lịch + máy/người → WorkItem → WorkLog/result → xác minh actual/billable/compensable → khoản phải thu và earning phù hợp.

UI phải hiển thị ba số riêng khi chúng khác nhau. Không có field chung "số lượng cuối" được dùng cho cả khách và tiền công. Từ ServiceJob thấy ngay lịch, người/máy, log, bằng chứng, khoản tính khách và thu nhập phát sinh.

# UX-FLOW-013 — Thu nhập, lương và hoa hồng

Người quản lý mở kỳ/người → xem các EarningEvent theo nguồn → duyệt/điều chỉnh đúng quyền → tạo nghĩa vụ phải chi → ghi nhận chi trả sau.

Không cho nhập một "lương cuối" rồi mất nguồn sản lượng. Không tính hoa hồng ad hoc trên Dashboard. Người lao động chỉ thấy phần được phép của bản thân; tài chính/chủ mới thấy chi tiết rộng theo quyền.

# UX-FLOW-014 — Hóa đơn điện tử không tạo success giả

Từ danh sách **Cần lập hóa đơn** hoặc nguồn billable → mở draft coverage → rà soát → phê duyệt → gửi yêu cầu phát hành.

Sau khi bấm:
- nếu provider xác nhận: hiển thị số/trạng thái/chứng từ;
- nếu mất phản hồi: hiển thị "Đang đối soát/Chưa xác định", không cho bấm tạo mới;
- nếu lỗi chắc chắn trước khi gửi: giữ draft và lỗi có thể sửa.

Không bắt người dùng hiểu outbox/job. UI chỉ hiển thị trạng thái nghiệp vụ và hành động an toàn.


# UX-930 — Recovery UX Contract

## UX-REC-001 — Audit before UX implementation

Trước khi sửa UI, GA phải xác minh source hiện tại so với các UX requirement dưới đây. Không coi route tồn tại là flow hoàn tất.

## UX-REC-002 — Sales/Quotation line editor

Create/Edit DRAFT có layout:

```text
Khách hàng [chọn] [+ Thêm nhanh]
Công trình  [chọn] [+ Thêm nhanh]

DÒNG HÀNG
| Vật tư | UOM | Số lượng | Đơn giá | Nguồn giá | Thành tiền | Xóa |
| ...     | ... | ...      | ...     | ...       | ...        |     |

[+ Thêm dòng]

Tạm tính
Tổng
Điều khoản / ngày giao
[ Lưu nháp ]
```

- không wizard;
- thêm/xóa line không mất các line khác;
- price hiển thị trước Save;
- manual price chỉ xuất hiện đúng quyền;
- missing price có message/action rõ.

## UX-REC-003 — Draft workspace

Quote/SO/PO DRAFT detail có primary action `Sửa`.
Edit quay lại cùng document, không clone revision vô nghĩa.
SENT/CONFIRMED chuyển sang immutable presentation + revision/adjustment/cancel actions.

PO về kho hiển thị địa chỉ hiện có tại “Kho nhận”, không nhập lại trên PO. Thiếu nội dung địa chỉ: báo “Kho nhận hàng chưa có địa chỉ. Vui lòng bổ sung địa chỉ kho trước khi lưu đơn mua.”; action “Bổ sung địa chỉ kho” chỉ cho người có quyền sửa kho, dùng vùng chỉnh sửa ngay trong form. Người thiếu quyền nhận hướng dẫn liên hệ người phụ trách. Không mất Supplier, lines, quantity, giá mua, ngày, điều khoản hay ghi chú; sau cập nhật giữ kho đang chọn, không tự xác nhận.
DRAFT hiển thị snapshot riêng. Đổi kho/cập nhật địa chỉ từ kho là thao tác có chủ đích, cần lý do và version; giữ draft, không tự refresh khi sửa quantity/terms. DRAFT thiếu snapshot không được CONFIRM và có đường sửa ngay trên DRAFT đó.

## UX-REC-004 — Master data

Mỗi master-data list có:
- search;
- create CTA;
- detail/edit;
- active/inactive;
- permission-aware fields.

Settings chỉ là hub dẫn tới forms cụ thể; không rules builder.

## UX-REC-005 — Customer 360

Header:
- customer identity;
- status;
- debt summary theo quyền.

Actions:
- Tạo đơn;
- Tạo báo giá;
- Ghi nhận thu tiền.

Sections:
- Sites;
- Pricing;
- Quotes;
- Orders;
- Deliveries;
- Receivables;
- Payments/Documents.

Từ Site → Tạo đơn phải prefill Customer + Site.

## UX-REC-006 — Supplier 360

Sections:
- profile/contact;
- PO;
- receipts/direct fulfillment;
- AP;
- payments.

CTA `Tạo đơn mua`.

## UX-REC-007 — Core lists

List phải có filter/search phía trên, bounded result và pagination/cursor phía dưới.
Filters lưu trong URL và Back giữ context.
Mobile đổi table thành card/list khi cần.

## UX-REC-008 — Dashboard completion

Ngoài KPI:
- chi phí theo nhóm;
- commission summary;
- debt/payable drill-down;
- filter preserved khi mở detail/drawer.

Không hiển thị số giả khi metric không READY.

## UX-REC-009 — Admin identity

Topbar/sidebar dùng actor + branch thực từ server context.
Không hard-code tên nhân viên, khách, branch hoặc company demo.
Organization label dùng config thực.

## UX-REC-010 — Finance pending work

PaymentNotice phải discoverable từ:
- Finance navigation hoặc
- `Cần xử lý` queue.

Review không tự tạo Payment.

## UX-REC-011 — Customer order

Order detail portal hiển thị:
- order state;
- delivery timeline;
- debt/payment state customer-safe;
- relevant documents.

Không leak supplier/cost/margin.

## UX-REC-012 — Access management

Owner/admin có UI để:
- assign/change role;
- assign/change branch access;
- revoke/reactivate;
- inspect/manage explicit permissions.

Action nguy hiểm yêu cầu reason/audit khi Spec yêu cầu.

## UX-REC-013 — Settings / Reports / Audit

Settings:
- master/config links;
- không generic config DSL.

Reports:
- selector;
- shared filters;
- summary + table/chart;
- export khi contract có.

Audit:
- actor;
- entity;
- action;
- time filters;
- human-readable summary trước raw detail.

## UX-REC-014 — Low stock

Inventory UI:
- threshold state;
- low-stock badge/queue;
- link thẳng material/warehouse;
- action `Tạo nháp đơn mua`.

Không auto-order.

## UX-REC-015 — Print/export

Source pages có action rõ:
- Báo giá → PDF;
- Delivery → Phiếu giao;
- Payment/Cashbook → Phiếu thu/chi;
- Customer/AR → Đối chiếu công nợ.


# KẾT THÚC UXUI.md


## OP-CUTOVER-01: Bảo vệ nhập lịch sử tùy chọn; rule opening pending đã bỏ

Giao dịch mới không phụ thuộc dữ liệu đầu kỳ, trạng thái đối chiếu lịch sử hoặc kích hoạt thủ công. Chi nhánh mới không tự tạo quy trình opening pending. Quyền và phạm vi chi nhánh, trạng thái chứng từ, phiên bản, nguồn, lượng khả dụng, giới hạn tiền và chống ghi lặp vẫn được giữ tại RPC/RLS/trigger. Lịch sử chưa biết vẫn chưa đối chiếu; không được giả định bằng 0 hoặc tự đánh dấu đã xác minh.

The accepted importer is unchanged. A private adapter prepares related masters and an exact mapped opening manifest without posting openings or recording an import receipt. A protected package registry verifies source bytes/hash, canonical parsed package, branch/run, supported writer payloads, actor, expiration and recovery evidence. Separate authenticated canonical Owner confirmation is required. Opening ledger effects must match the approved source manifest; historical import authorization is separate from ordinary source-backed posting. Failed runs roll back; exact committed retries are read-only. Independent committed source/ledger readback is required to verify an optional historical import. No operational activation follows or is required. No generic admin or session-flag bypass. M/N unsupported and O decision boundaries remain unchanged.

UI shows the historical data scope, never treats an empty ledger as verified opening-zero, and has no activation control. Production opening foundation remains unapplied; when eventually authorized, its new source tables must receive gate triggers before the secure importer can run. REAL_IMPORT_AUTHORIZATION=NOT_GRANTED; PRODUCTION_OPENING_WRITES=0; PRODUCTION_BUSINESS_ACTIVATION=NOT_EXECUTED.

Implementation: 20261009173806_secure_operational_posting_gate.sql; scripts/operational/authorized_openings.mjs; src/modules/operations; /admin/operations. Managed QA: 53 targeted checks PASS, including 31/31 present guarded boundaries, strict package authorization, rollback, fresh logical-client committed readback, same/new-run idempotency, READY/ACTIVE audit, and concurrent activation/posting serialization. Gate migration SHA256 f03146a6ad1b98003b34f0d6793ee51654bf763abf7f476668606c18cc60d50e applied once in QA; no historical replay. Wrapper 8/8 and UI state 3/3 tests, typecheck, lint (no errors), webpack Production build PASS. Production has a different migration history and lacks the optional opening inventory/cash foundation: deploy only this gate, protect all 29 currently present boundaries, and keep the opening importer fail-closed until the separately authorized foundation/guard installation. CI, Production recovery/apply and deployment remain pending; no Production openings, import approval or activation.


## OP-UPDATES-QA-20261010: remaining operational gaps and release barrier

Authoritative main baseline: 0e1a68ba21c01c92a37437daa0a50087f551e8b9. Dedicated branch codex/operational-updates-qa-gated. Production access, migrations, writes, main merge and deployment are forbidden until the complete final QA gate passes; previous PR39 Production evidence is context only. No real openings, real import approval or HX activation.

| Requirement | Verified existing implementation | Actual remaining gap |
|---|---|---|
| Native catalogs | PR33 shared catalog editor, scoped RPCs, legacy redirects | Supplier purchase-rule management has no route or canonical writer |
| Material detail | PR34 canonical material/UOM/pricing/warehouse readers | Recent movements and contextual Sales/Purchase draft actions missing |
| Automatic prices | PR35 canonical engines and stale-preview checks | Raw bigint price columns lose precision in JS JSON transport |
| Inventory | PR36 authoritative on-hand/reserved/available and source commands | Reuse unchanged; never edit balances or add stock storage |
| Safe removal | PR37 canonical SO/PO cancellation and history | Reuse; quotation cancellation is not an invented workflow |
| Optional Sales price | PR38 exact final-unit price and permission/audit | Linked Direct Sales still requires routine note |
| Posting gate/importer | PR39 and separate direct-Draft forward | Reuse unchanged; no opening foundation/activation in this feature scope |

Purchase manual-cost routine note is also still mandatory. Ordinary authorized amounts at/below a valid current reference receive deterministic before/after/rule/version metadata; no-reference/increased-price cases retain explicit exception justification. Existing permission and SQL approval guards remain authoritative. This is not a new price-floor policy or generic automatic approval. Actor, transaction timestamp, document and line provenance remain in canonical snapshot/receipt/audit relations.

Use existing purchase_price_rules, shared PricingRuleEditor and existing permissions; add only scoped, audited version/create/deactivate commands with optimistic version, operation idempotency and source-level serialization. No new price table, stock table, generic repository or workflow engine. Recent material movements use inventory_movement_read, branch/material filters and a 20-row bound, with no cost columns. VND reads are text, calculations remain Decimal/BigInt.

Source evidence confirms OPUP_PRICE_PRECISION_01: synthetic QA PostgreSQL JSON bigint 9007199254740993 arrives as JS number 9007199254740992. No business write was needed to reproduce. Other gaps are confirmed from routes, shared editor, action builders and managed QA RPC definitions. QA Preview config is separately verified: QA URL, matching publishable-key fingerprint, no shared variables and no Production server credential; hosted runtime identity must still be pinned before browser tests.

QA01..QA20 are all required and currently PENDING in this new acceptance run: module routes; catalog CRUD; material/pricing visibility; Sales auto-price; Purchase auto-price; effective/version snapshots; warehouse quantities; reservation integrity; receipt/handoff stock accounting; safe draft cancellation; posted-history protection; optional discounted price; routine-reason UX; override permission/audit; finance/report totals; posting gate; branch isolation; cost confidentiality; retry effects; Supplier Direct. Reuse only exact unchanged valid evidence; modified seams require fresh managed and genuine browser evidence (Owner, Sales, Purchasing, Warehouse, unauthorized; desktop/mobile/error/stale/confirmation).

Forward candidate: 20261009224842_supplier_purchase_price_commands.sql. SHA256 03a836fe1aef1ab1f683260bd03e407f3fe9ee1657c9593e9e95545ffb7097e2. Managed rollback rehearsal 25/25 PASS; exact QA apply once, independent committed readback, old history/RLS/table grants/triggers unchanged PASS. Local targeted tests 84/84, typecheck, lint and QA-configured webpack build PASS. FINAL_QA_ACCEPTANCE remains PENDING until QA01..20 and genuine role/desktop/mobile UI evidence complete. No historical migration rewrite or QA-to-Production history blanket sync. Local checks, managed QA, browser UAT, security/data integrity and CI must all pass on the reviewed source before Production preflight. HX can record valid new transactions without opening data or activation. Optional historical import and Production release safeguards remain separate requirements.
