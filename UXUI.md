> Quy tắc hiện hành 12/10/2026: bỏ opening pending và kích hoạt thủ công khỏi vận hành. Thông tin đối chiếu lịch sử chỉ mô tả chất lượng dữ liệu, không khóa giao dịch mới. Các bằng chứng trạng thái/gate cũ bên dưới là lịch sử, không phải điều kiện đang áp dụng.

> Quyết định Owner 15/10/2026 (`FB-KIOTVIET-20261015`, xem đầu Spec.md): Báo giá tắt (D1) — mọi màn/nút/hành trình báo giá trong tài liệu này tạm không hiển thị; KPI Tổng quan dùng lợi nhuận ròng (D2); biểu đồ đường Thu/Chi/Lợi nhuận theo bộ lọc (D3); thiết lập giá hàng loạt (D4). Màn tạo đơn bán/đơn mua, danh sách khách hàng, vật tư và bộ lọc tham chiếu bố cục KiotViet theo góp ý khách (UX-110.6, UX-ORD-002, UX-320, UX-340, UX-350, UX-FLOW-001).
>
> Quyết định Owner 16/10/2026 (`FB2-20261016`, chi tiết D5–D12 ở đầu Spec.md): tạo/sửa danh mục và tạo nhanh mở trong popup (D5, sửa UX-160); tạo đơn bán xác nhận qua popup kiểm tra (D6); "Đơn vị tính" kiểu KiotViet (D7); tắt Báo chuyển khoản (D8); Cài đặt có Thông tin doanh nghiệp và Giao diện (D10).
>
> Quyết định Owner 17/10/2026 (D18, `FB3`): popup sửa danh mục có "Ngừng dùng / Dùng lại" và "Xóa" (xác nhận lại; đã có chứng từ thì báo không xóa được); ô tiền hiện dấu chấm phân cách khi gõ (60000 → 60.000); ô "Tìm vật tư" bấm vào là xổ danh sách theo nhóm (nút ▾), ô chọn khách/công trình/NCC có nút ▾; đơn bán: bấm đơn giá mở popup "Đơn giá · Giảm giá [VND | %] · Giá bán", khung tổng có "Giảm giá đơn" và "Khách cần trả" (SPEC-PRI-007).

> Quyết định Owner 17/10/2026 (D14–D17, D19, D22, C1, C2, F5 — triển khai 18/10/2026, xem đầu Spec.md): chuông thông báo trên thanh trên cùng nội bộ (UX-NOTIFY-001); trang đơn có khung "Nguồn hàng" do hệ thống tự phân, trang Điều phối theo tài xế (UX-DISPATCH-001); "Gửi NCC qua Zalo" trên đơn mua; cổng khách có đăng ký, đăng nhập bằng số điện thoại, đổi mật khẩu tạm và "Đặt hàng" (UX-CUST-008/009); Khách hàng 360 có khung "Tài khoản cổng khách"; Cài đặt → "Quy tắc tự động" và "Bật thông báo trên máy này" (UX-AUTO-001).

> Quyết định Owner 22/10/2026 (D27, `FB7`): thợ tự lấy hàng + giao (giao xong là xác minh), bước tiếp theo luôn hiện, cổng khách Tài khoản, trang chủ chọn cổng, chi phí kiểu KiotViet, hao hụt kiểm kho, bỏ lý do bắt buộc, form lỗi không còn "Bắt đầu thao tác mới" (UX-FB7-001).

> Quyết định Owner 18/10/2026 (D25, `FB5`): quy đổi đơn vị nhập hai chiều và hiện bằng câu "1 Tấn = 20 Bao"; giá mua tự tính cho các đơn vị khác; xe không cần căn cứ sức chở, sức chở tự quy đổi; đơn bán có "Khách trả trước"; xác nhận xong đơn bán/đơn mua hiện "bước tiếp theo" (UX-FB5-001).

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

DỊCH VỤ          (D9, 16/10/2026: "Dịch vụ" nằm trong nhóm Bán hàng; nhóm "Nhân công & dịch vụ" đổi tên "Nhân công")

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

Sửa đổi D5 (Owner 16/10/2026): tạo/sửa bản ghi danh mục (khách, công trình, NCC, vật tư, nhóm, đơn vị, xe, máy, chi nhánh, kho…) và
tạo nhanh từ chứng từ **được** mở trong popup để không rời màn đang làm. Popup dùng component chung (`components/ui/dialog.tsx`):
nằm ngoài form của trang, giữ tiêu điểm bên trong, Escape/"Đóng" để đóng (Escape đã dùng để đóng danh sách gợi ý thì không đóng popup),
trên điện thoại chiếm toàn màn. Chứng từ dài (sửa đơn bán/mua, đối soát nhiều bước) vẫn ở trang riêng như trên.

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
- Vùng chính: ô "Tìm vật tư" (mã/tên, gõ không dấu được, phím tắt F3) → Enter/bấm thêm dòng với ĐVT mặc định, số lượng 1 và đưa con trỏ vào ô số lượng; chọn lại cùng vật tư + ĐVT mặc định (chưa sửa giá) thì tăng số lượng. Bảng dòng sửa trực tiếp: STT │ Vật tư (tên, mã ở dòng dưới) │ ĐVT │ SL │ Đơn giá │ Thành tiền │ ✕ — cả bảng phải nằm gọn, không cuộn ngang để thấy giá/thành tiền (từ 1440px cột phải nằm cạnh; dưới 1440px cột phải lên trên; dưới 1100px mỗi dòng thành thẻ); nhập giá thủ công (khi có quyền) thì ô lý do hiện ngay dòng đó; Enter trong dòng quay về ô tìm vật tư.
- Cột phải: Khách hàng (tìm gõ-là-lọc, "+ Thêm khách"; không chọn sẵn khách đầu tiên; khi đang tìm, danh sách cũ bị ẩn và hiện "Đang tìm..." — Enter lúc đó chọn kết quả đầu tiên của đúng chữ vừa gõ, không bao giờ chọn gợi ý cũ), Công trình/điểm giao (sau khi chọn khách, ô công trình được focus và mở danh sách; không tự chọn kể cả khi chỉ có một — SPEC-JOURNEY-003), ngày, điều khoản/ghi chú, tổng hợp (số dòng, tổng tiền hàng).
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

**NCC 360 (FB2 Đợt 4, 17/10/2026)**: bố cục như Khách hàng 360 — nút Tạo đơn mua (chính), Ghi chi, Sửa (popup); 5 thẻ Còn phải trả │
Quá hạn │ Tổng mua (đơn đã xác nhận) │ Đơn mua đang mở │ Điều khoản; tab Thông tin & liên hệ │ Đơn mua │ Nhập kho & giao thẳng (hai bảng
xếp chồng) │ Công nợ & thanh toán │ Bảng giá mua.

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

**Khách hàng 360 (FB2 Đợt 4, 17/10/2026, SPEC-CUS-004)**: đầu trang = tên + "Khách hàng · mã", dòng điện thoại · địa chỉ · nhóm giá,
nút Tạo đơn (chính), Ghi thu, Tạo dịch vụ, Sửa (popup danh mục), + Công trình (popup đã chọn sẵn khách), nhãn trạng thái. Hàng 5 thẻ chỉ số
(Nợ hiện tại │ Nợ quá hạn (đỏ khi > 0) │ Tổng bán (đơn đã xác nhận) │ Đơn đang giao dở │ Hạn mức còn lại + "Hạn mức …"); không có quyền
thì hiện "—". Thanh tab (link thật `?tab=`, cuộn ngang trên điện thoại, số đếm cạnh tên): Thông tin & công trình (bảng công trình ở cột rộng
với Tạo đơn / Tạo dịch vụ / Sửa từng công trình; hồ sơ + ghi chú nội bộ ở cột hẹp) │ Đơn bán │ Giao hàng │ Công nợ & thanh toán (phải thu,
thanh toán, tải bảng đối chiếu, Ghi thu) │ Giá riêng │ Tài liệu. Desktop 5 thẻ một hàng, ≤1100px 3 cột, điện thoại 2 cột; trang không
rộng quá màn hình 390px.

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

Popup vật tư (D5/D7) có 2 tab: **Thông tin** và **Đơn vị tính & giá** (bảng: đơn vị, "1 đơn vị =", loại quy đổi, giá bán chung, giá vốn ≈ theo
quyền; "+ Thêm đơn vị bán", "Ngừng"; "Chia giá theo quy đổi"; một lý do, một nút lưu). Tạo vật tư mới xong tự chuyển sang tab Đơn vị tính.
Trên điện thoại mỗi đơn vị là một thẻ. Trang Chính sách giá có mục **Nhóm giá khách** (bảng + popup thêm/sửa); ô "Nhóm giá" của khách là danh sách chọn.

**Tạo đơn bán & giao hàng (FB2 Đợt 3, 16/10/2026)**: ô số lượng có nút − / + (bảng dòng dùng chung, cả đơn mua); dưới mỗi dòng luôn hiện
"Có thể bán: 97 bao (4.850 kg) · <kho>" (đỏ "Thiếu so với số lượng đặt" khi vượt), chọn kho ở "Xem tồn tại", gợi ý F3 kèm "Có thể bán …".
Nút chính "Xác nhận đơn" mở popup "Xác nhận đơn bán" (khách, công trình + địa chỉ, số dòng, tổng tiền, nợ hiện tại/quá hạn, bảng dòng, nhắc
kiểm tra; "Xác nhận đơn" / "Quay lại sửa"); "Lưu nháp" là link phụ. Trang đơn đã xác nhận: nút chính "Lập phiếu giao" mở popup (Kho xuất,
Giao lúc, bảng Vật tư │ Còn phải giao (đơn vị bán + cơ sở) │ Tồn kho xuất │ Giao lần này (điền sẵn), tùy chọn "Phân xe và người giao ngay"
→ Người giao, Xe, Dự kiến xong) → mở phiếu giao vừa tạo; cách cũ gom vào "Lập phiếu theo nguồn đã phân". Nút "Tạo dịch vụ" ở trang đơn,
trang khách và từng công trình mở form Dịch vụ đã chọn sẵn khách/công trình. Trang phiếu giao có thanh tiến trình 6 bước (Lập phiếu → Phân xe →
Bàn giao lên xe → Tới nơi → Báo kết quả → Xác minh) + "Bước tiếp theo"; lượng kế hoạch kèm "≈ N <đơn vị bán>".

**Hàng cùng loại (D11, SPEC-CAT-002)**: nút "+ Hàng cùng loại" trên danh sách vật tư mở popup: Tên hàng chung, Mã gốc (gợi ý mã), Nhóm vật tư,
Đơn vị cơ sở, Cho phép bán/mua; Thuộc tính (tên + giá trị cách nhau dấu phẩy, tối đa 3 thuộc tính); "Đơn vị bán cho loại mới" (như tab Đơn vị
tính); bảng "Các loại" tự sinh mỗi tổ hợp giá trị một dòng với Mã/Tên gợi ý sửa được, Giá bán theo đơn vị chọn ("Nhập giá theo"), tùy chọn "Tự
chia giá cho các đơn vị khác" (mặc định không làm tròn, hiện giá đã chia dưới ô giá); "Thêm vật tư có sẵn vào hàng này"; một lý do, một nút lưu.
Danh sách vật tư: dưới tên mỗi loại hiện "Mác: PCB30 · Cùng loại …" (link lọc `?variant=`), bộ lọc "Hàng cùng loại", khi lọc có nút "Sửa hàng
cùng loại" (thêm giá trị → chỉ đề xuất tổ hợp mới; "Bỏ khỏi hàng"). Chi tiết vật tư có mục "Hàng cùng loại" với các loại khác dạng thẻ. Ô tìm vật
tư F3 trong đơn bán/mua gom các loại dưới tên hàng chung.

`/admin/products/pricing` — Thiết lập giá (D4, SPEC-PRI-005; chọn "Bảng giá": Giá chung hoặc từng nhóm giá khách, D11): bảng Mã │ Tên │ ĐVT │ Giá vốn (theo quyền) │ Giá hiện tại │ Giá mới (sửa trực tiếp) │ Chênh lệch; chọn nhiều dòng → tăng/giảm theo % hoặc số tiền, chọn làm tròn (1.000 đ mặc định / 100 đ / không), xem chênh lệch từng dòng; một ngày áp dụng + một lý do; nút "Lưu bảng giá (N thay đổi)" lưu tất cả một lần. Thanh lưu dính đáy màn trên desktop. Không có quyền quản lý giá: chỉ xem. Giá theo khách và lịch sử ở "Giá theo khách & lịch sử".

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

**Tồn kho kiểu KiotViet (FB2 Đợt 5, 17/10/2026)**: nút Chuyển kho, Kiểm kho, Quản lý kho; 4 thẻ (Vật tư còn hàng │ Hết hàng │ Dưới ngưỡng —
bấm để lọc │ Giá trị tồn khi có quyền giá vốn); lọc trái tự áp dụng: Tìm kiếm, Kho, Nhóm vật tư, Tồn kho (Còn hàng/Hết hàng/Dưới ngưỡng),
Hiển thị theo (Đơn vị cơ sở / Đơn vị lớn nhất của vật tư, kèm số theo đơn vị cơ sở chữ nhỏ). Bảng mỗi vật tư một dòng: Vật tư (tên, mã · nhóm)
│ Tồn kho │ Đang giữ │ Có thể bán │ Giá trị tồn (theo quyền) │ Ngưỡng (giá trị hoặc "Dưới ngưỡng", nút "Ngưỡng" mở popup chọn kho + ngưỡng +
bật/tắt, "Đặt mua" khi dưới ngưỡng). Bấm dòng mở ngay dưới dòng: **Tồn theo kho** và **Thẻ kho** (50 phát sinh gần nhất: Thời điểm │ Loại │
Vị trí (khi xem tất cả kho) │ Nhập / xuất │ Tồn sau │ Chứng từ). Không sửa số tồn trực tiếp.

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

**Kiểm kho kiểu KiotViet (FB2 Đợt 5)**: danh sách phiếu (lọc Tìm mã, Kho, Trạng thái; cột Mã phiếu │ Kho │ Chốt sổ lúc │ Đã đếm │ Lệch tăng │
Lệch giảm │ Trạng thái Đang kiểm/Đã cân bằng kho/Đã hủy); "+ Tạo phiếu kiểm" mở popup chọn kho (mốc chốt sổ = lúc mở popup). Trang phiếu là
**bảng điền sẵn mọi vật tư đang có tồn ở kho**: Vật tư (tên, mã) │ Tồn sổ sách │ Thực tế (nhập kiểu Việt, Enter xuống dòng) │ Lệch (xanh tăng,
đỏ giảm, "Khớp") │ Giá trị lệch (theo quyền giá vốn) │ Lý do (chỉ khi lệch); dòng tăng tồn khi sổ đang 0 hiện thêm ô "Giá vốn / đơn vị". Thanh công
cụ: tìm trong phiếu, lọc Tất cả/Chưa đếm/Lệch/Khớp, "Thêm vật tư khác" (vật tư chưa có tồn). Thanh dưới dính đáy: "Đã đếm x/y · Lệch tăng · Lệch
giảm (giá trị) · Khớp", "Lý do chung cho dòng lệch", nút Hủy phiếu (popup lý do), Lưu tạm (N dòng), Hoàn thành & cân bằng kho (popup tóm tắt →
"Cân bằng kho"). Dòng thiếu lý do/giá vốn tô đỏ kèm lời nhắc, không gửi. Phiếu đã cân bằng hoặc đã hủy chỉ xem.

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

**FB3 Phần A (18/10/2026, SPEC-DEL-007, SPEC-WORKPORTAL-004):** hộp "Lập phiếu giao" trên trang đơn mở cho người có quyền lập phiếu (vai trò
Điều phối dùng được). Hộp có hai lựa chọn **Giao ngay** (mặc định) │ **Hẹn ngày giờ** (ô ngày giờ, mặc định ngày khách yêu cầu nếu chưa qua); khung
phân xe mở sẵn, chỉ có một người/một xe thì chọn sẵn; dòng thiếu tồn hoặc vượt phần còn phải giao được đánh dấu ngay tại dòng, nút gửi mờ, có link
"Đặt NCC giao thẳng" cho người có quyền mua hàng. Hộp ghi "Việc tự hiện ở cổng thợ của người giao. Mỗi điểm giao tính N phút"; người/xe đang bận
thì Giao ngay tự xếp ngay sau việc trước; hẹn giờ trùng thì báo "Giờ trống gần nhất: …" kèm nút "Hẹn lúc …". Lập xong mở trang phiếu giao kèm
thông báo. Phân xe xong là việc tự sang cổng thợ — khung cổng thợ trên phiếu ghi "Đã giao việc cho <tên> · <giờ>"
hoặc chỉ rõ còn thiếu tên/SĐT/địa chỉ người nhận. Trang phiếu có khung **"Ảnh giao hàng"**: lưới ảnh thu nhỏ, bấm để phóng to; bước xác minh dùng
cùng lưới thay các nút "Mở bằng chứng".

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

**FB2 Đợt 7 (17/10/2026):** trang có nút "Tạo lộ trình" (neo tới khung tạo); khung tạo 3 bước đánh số: (1) Chọn phiếu giao — lọc "Ngày giao" (hiện
phiếu có lịch trong ngày + phiếu chưa lịch), bảng chọn; (2) Xe, tài xế và giờ đi + "Thời gian mỗi điểm (phút)"; (3) Thứ tự và giờ dự kiến — mỗi
điểm hiện "Giờ dự kiến: 07:00–08:00 · 01/03" hoặc "Giữ lịch phiếu: …", cảnh báo vàng khi lịch chồng nhau trên cùng xe, nút ↑/↓. "Lộ trình gần
đây" là bảng (Khởi hành, Xe · tài xế, Điểm dừng, Thứ tự, Trạng thái), bấm dòng mở lộ trình ở đầu trang: bảng điểm dừng (#, Phiếu giao, Giờ dự
kiến, Lịch khi áp dụng, Lưu ý) + "Áp dụng và phân giao". Không tự mở lộ trình mới nhất khi chưa chọn.

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

**Loại dịch vụ (D23, 18/10/2026, SPEC-SRV-003):** trang Dịch vụ có link "Loại dịch vụ" (`/admin/service-jobs/types`, danh mục popup như UX-160:
Mã, Tên, Đơn vị tính có gợi ý chuyến/giờ/ngày/ca/m³/km, Đơn giá mặc định, Cần xe / Cần máy / Không, Xóa / Ngừng dùng). Form lập lịch: ô "Loại dịch vụ"
chọn từ danh sách, "+ Thêm loại" mở popup ngay tại chỗ; chọn xong hiện đơn vị và đơn giá, chỉ hiện ô Xe hoặc Máy theo loại. Chi tiết việc hiện đơn
giá; lúc xác minh, dưới ô "Giá trị tính khách" có dòng "Đơn giá …/đơn vị · gợi ý …" (khối lượng tính khách × đơn giá) và nút "Dùng giá gợi ý" khi
người xác minh đã gõ số khác (vẫn sửa được).

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

**Sổ quỹ (FB2 Đợt 6, 17/10/2026)**: menu "Sổ quỹ"; nút Lập phiếu thu (chọn khách trong popup → mở popup Ghi thu ở Công nợ với các khoản
của khách), Lập phiếu chi (chọn NCC), Tạo tài khoản tiền (popup). Hàng 4 thẻ của kỳ: Quỹ đầu kỳ │ Tổng thu (xanh) │ Tổng chi (đỏ) │ Tồn quỹ cuối
kỳ; hàng phụ: Dòng tiền ròng (toàn bộ), Chưa đối soát, Tài khoản, Vị thế ứng trước. Lọc trái tự áp dụng: Từ ngày, Đến ngày (mặc định đầu tháng →
hôm nay), Tài khoản, Loại (Thu/Chi). Bảng: Phiếu (mã + ngày) │ Đối tác │ Tài khoản │ Loại │ Số tiền (+/−) │ Đối soát (lệch) │ Thao tác: "In phiếu
thu/chi", "Xử lý" mở popup gồm Đối soát ngân hàng và Đảo giao dịch (lý do).

**Công nợ và Hóa đơn (FB2 Đợt 6)**: menu Tài chính còn Công nợ, Sổ quỹ, Chi phí, Hóa đơn. "Công nợ" có tab Phải thu khách hàng │ Phải trả nhà
cung cấp (theo quyền); "Hóa đơn" có tab Hóa đơn bán ra │ Chứng từ mua vào │ Đối chiếu chứng từ NCC. Địa chỉ trang cũ giữ nguyên. Chọn một khách
(`?customer=`) / NCC (`?supplier=`) tự mở popup "Ghi thu" / "Ghi chi" (biểu mẫu thu chi sẵn có); đóng popup để xem công nợ, khoản có, phân
bổ tiền đã có của khách đó; nút Ghi thu/Ghi chi mở lại. **Chi phí**: tab Tất cả │ Chờ duyệt │ Đã duyệt (số đếm, tối đa "99+"); "Ghi chi phí" mở
popup chọn Chi phí chung hoặc Chi phí chuyến (gắn phiếu giao và xe); "Nhóm chi phí" mở popup danh sách + tạo nhóm; "Duyệt" từng dòng mở popup
xác nhận (nhóm, NCC, số tiền, nhắc không sửa lại được) — tự mở khi tới bằng `?focus=`. Báo chuyển khoản đã tắt (D8).

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

**FB2 Đợt 7 (17/10/2026):** "Ghi căn cứ tính thủ công", "Tạo phiên bản quy tắc", "Phê duyệt ghi nhận tự động theo sự kiện" là nút mở popup (D5,
form và ràng buộc RPC giữ nguyên); bảng "Quy tắc thu nhập" (mã, tên, phiên bản, người áp dụng, loại, mức: `2,5%` cho tỉ lệ, `350.000 ₫ / đơn vị`
cho mức cố định, hiệu lực). Duyệt/chi trả giữ trên từng dòng.

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

**FB2 Đợt 7 (17/10/2026, D10):** tiêu đề "Cài đặt"; hai khung đầu: **Thông tin doanh nghiệp** (tên *, MST, điện thoại, địa chỉ, email, ngân hàng,
số tài khoản, chủ tài khoản; khung "Xem trước tiêu đề chứng từ" cập nhật khi gõ; nút "Lưu thông tin doanh nghiệp"; kết quả chưa rõ giữ đúng thao
tác "Lưu lại đúng thao tác"; dưới cùng là **Logo**: khung xem logo, chọn tệp PNG/JPG ≤ 300 KB, "Lưu logo", "Xóa logo" — chỉ bật khi đã lưu tên
doanh nghiệp, khung xem trước tiêu đề hiện logo) và **Giao diện** (Chế độ màu Sáng/Tối/Theo thiết bị, Cỡ chữ Nhỏ/Vừa/Lớn, Phông chữ Noto Sans/Be Vietnam Pro; áp dụng
ngay, chỉ trên thiết bị này). Mọi nhân viên đổi Giao diện được từ nút "Giao diện" ở chân menu trái (popup). Chế độ tối phủ các màn nội bộ có menu
trái; cổng khách/thợ và đăng nhập giữ màu riêng. Các mục Phạm vi dữ liệu, Chi nhánh, Tài khoản & quyền giữ nguyên bên dưới.

**`/admin/access` (FB2 Đợt 7, D5/D12):** tab Nhân viên │ Vai trò (`?tab=roles`). Đầu trang "Mời nhân viên" (popup) và "Tạo vai trò". Bảng nhân viên:
vai trò tại chi nhánh đang chọn, quyền bổ sung, trạng thái, thao tác Đổi/Cấp vai trò, Quyền riêng, Thu hồi, Kích hoạt lại — đều mở popup. Tab Vai
trò: bảng (Vai trò, Loại Vai trò mẫu/Tùy biến/Quản trị, Số quyền, Đang dùng, Sửa/Xem); popup vai trò có tên + quyền tích theo nhóm Bán hàng, Mua
hàng, Kho hàng, Giao hàng, Tài chính, Nhân công, Khác (ô nhóm chọn cả nhóm; quyền mình không có bị khóa), cảnh báo "đang dùng cho N nhân viên",
"Ngừng dùng vai trò này" chỉ khi không ai dùng; vai trò mẫu chỉ xem.

**Vận hành giao hàng (D21, 18/10/2026):** Cài đặt có khung "Vận hành giao hàng" với ô "Thời gian mỗi điểm giao (phút)" (5–720, mặc định 60), nút
"Lưu cài đặt giao hàng" (kết quả chưa rõ: "Lưu lại đúng thao tác"). Ô lịch trên trang phiếu giao điền sẵn giờ kết thúc dự kiến theo số phút này.

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

## UX-WORK-007 — "Đã giao" kèm ảnh (FB3 A3, 18/10/2026, SPEC-WORKPORTAL-004)

- Trang chủ: **Việc hôm nay** rồi **Sắp tới**, xếp theo giờ hẹn; thẻ việc có giờ, địa chỉ, lượng theo đơn vị bán ("60 bao (3.000 kg)").
- Chi tiết việc giao hàng: nút chính **"Đã giao · chụp ảnh"** mở camera; ảnh hiện thành lưới (Đang tải / Đã tải / Lỗi tải, nút Xóa, "+ Chụp thêm", tối
  đa 5); có ảnh thì nút thành **"Xác nhận đã giao (N ảnh)"**. Ô "Người nhận" điền sẵn từ phiếu. Link phụ **"Giao thiếu / Không giao được"** mở ô số
  lượng từng dòng (theo đơn vị bán) và "Lý do / ghi chú"; giao thiếu vẫn cần ảnh, không giao được cần lý do.
- Kho chưa bàn giao hàng lên xe: nút mờ "Chờ kho bàn giao hàng lên xe" và hướng dẫn tải lại.
- Gửi xong quay về trang chủ với thông báo "Đã báo giao hàng"; mất kết nối thì ảnh đã tải vẫn giữ, bấm gửi lại chỉ kiểm tra, không ghi hai lần.

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

Đơn khách tự đặt (D15): nhãn trạng thái "Chờ duyệt / Đã duyệt / Đang giao / Đã giao / Đã hủy"; chi tiết có khung "Hàng đặt" (tên, số lượng
theo đơn vị bán, giá và thành tiền chỉ cho Chủ tài khoản/Kế toán), "Giao tới", "Muốn nhận", ghi chú, lý do hủy; còn chờ duyệt thì có "Hủy đơn"
(mở ô lý do).

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


## UX-CUST-008 — Đăng ký, đăng nhập bằng số điện thoại, đổi mật khẩu tạm (D14, C1, 18/10/2026)

- Ba trang đăng nhập: ô **"Email hoặc số điện thoại"** (bàn phím chữ, không tự viết hoa). Trang đăng nhập khách có dòng "Chưa có tài khoản?
  **Đăng ký tài khoản**"; sau khi xác nhận email, trang đăng nhập báo "Email đã được xác nhận. Đăng nhập để bắt đầu đặt hàng."
- **Đăng ký** (`/customer/register`, toàn màn như đăng nhập): Họ tên hoặc tên cửa hàng, Số điện thoại, Địa chỉ giao hàng, Email, Mật khẩu,
  Nhập lại mật khẩu → "Đăng ký". Cần xác nhận email thì hiện "Mở email xác nhận rồi đăng nhập"; không thì vào thẳng cổng khách với thông báo
  "Đã tạo tài khoản". Ghi chú "Không có email? Gọi cửa hàng để được tạo tài khoản bằng số điện thoại."
- **Đổi mật khẩu** (`/customer/change-password`, `/work/change-password`): lần đầu đăng nhập bằng mật khẩu tạm, mọi trang của cổng đều dẫn tới
  đây cho tới khi đổi xong; hai ô Mật khẩu mới / Nhập lại → "Đổi mật khẩu và tiếp tục"; có "Đăng xuất".

## UX-CUST-009 — Đặt hàng (D15, 18/10/2026)

- Menu và trang chủ có **"Đặt hàng"** cho Chủ tài khoản và Kế toán (Người nhận hàng không thấy). Trang chủ báo "N đơn đang chờ cửa hàng duyệt".
- `/customer/orders/new` (D26, 18/10/2026 — **cùng bố cục với "Tạo đơn bán" nội bộ**, màu của cổng khách):
  - Ô **"Tìm hàng"**: bấm là xổ danh sách theo nhóm vật tư, hàng cùng loại đứng chung dưới tên sản phẩm (vd "Xi măng Bút Sơn" → PCB30, PCB40); mỗi
    dòng có mã, đơn vị, "80.000 ₫ / bao · Còn hàng" hoặc "Đặt trước"; gõ để lọc (không cần dấu), chọn lại cùng hàng thì cộng thêm 1.
  - Bảng dòng hàng (điện thoại: mỗi dòng một thẻ): tên + mã, **Đơn vị** (bao / tấn…), − [số lượng] + (gõ được "2,5"), **Đơn giá** (giá của khách,
    "Giá của bạn"), Thành tiền, nút xóa; dưới dòng: ô **"Loại"** để đổi sang loại khác cùng sản phẩm, câu quy đổi "1 tấn = 20 bao", nhãn Còn hàng /
    Đặt trước.
  - Khung **Giao tới**: Khách hàng (chỉ đọc), "Công trình / điểm giao" (kèm địa chỉ, người nhận) hoặc "+ Địa chỉ giao mới" (tên, địa chỉ, người nhận,
    SĐT). Khung "Muốn nhận lúc" (để trống = sớm nhất) và "Ghi chú cho cửa hàng".
  - Tổng tiền dính dưới (trên thanh menu dưới của điện thoại): Số dòng, **Tạm tính**, nút **Xem lại đơn**; báo thiếu số lượng hợp lệ hoặc địa chỉ.
- **Xem lại đơn** (popup như "Xác nhận đơn bán"): giao tới, giờ muốn nhận, ghi chú, số dòng, tạm tính, bảng hàng (loại, số lượng × đơn giá, thành
  tiền), câu "Cửa hàng duyệt đơn rồi báo ngày giao; chưa giữ hàng cho tới khi duyệt" → **Gửi đơn** / "Sửa đơn". Gửi xong mở chi tiết đơn với "Đã gửi
  đơn". Kết quả chưa rõ (mất mạng) → báo bấm gửi lại, không tạo đơn trùng.
- Không có mặt hàng nào có giá cho khách: "Cửa hàng chưa mở bán mặt hàng nào cho tài khoản của bạn. Liên hệ cửa hàng để được báo giá."
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

# UX-NOTIFY-001 — Chuông thông báo (FB3 R3, 18/10/2026, SPEC-SEC-006)

Thanh trên cùng nội bộ có chuông với số chưa đọc; bấm mở danh sách 10 thông báo mới nhất (tiêu đề, nội dung ngắn, giờ; chưa đọc in đậm), bấm một
dòng là đánh dấu đã đọc và mở trang liên quan; "Xem tất cả" tới `/admin/notifications` (phân trang "Cũ hơn", "Đánh dấu đã đọc hết"). Chỉ thấy thông
báo đúng quyền và chi nhánh. Trang Thông báo có khung **"Thông báo trên điện thoại"** với nút "Bật/Tắt thông báo trên máy này" (UX-AUTO-001).

# UX-DISPATCH-001 — Nguồn hàng, Điều phối, Gửi NCC (D17, D19, D22, C2, 18/10/2026)

- Trang đơn bán: khung **"Nguồn hàng"** liệt kê từng dòng: "Kho chính 50 bao ✓" / "Kho chính 30 + NCC A giao thẳng 20 · đơn mua PO-… chờ duyệt
  (tách vì rẻ hơn)" / "Thiếu nguồn 20 bao — chưa có giá mua"; nút "Tự phân nguồn" cho đơn chưa phân; đơn chưa xác nhận hiện bản xem trước.
- Đơn mua đã xác nhận: khung **"Gửi NCC"**: "Gửi NCC qua Zalo" (điện thoại: bảng chia sẻ có PDF; máy tính: chép nội dung, tải PDF, mở Zalo NCC),
  "Chép nội dung", "Gửi email", "Mở Zalo NCC", "Đã gửi"; dòng trạng thái "Đã gửi NCC 10:30 · Zalo" / "Chưa gửi NCC". Danh sách đơn mua có cột "Gửi NCC".
  Phiếu NCC giao thẳng có nút **"NCC đã giao"** (lượng nhận, người nhận, ảnh).
- **Điều phối** (`/admin/dispatch?day=`): chọn ngày; hàng "Chờ điều phối" (phiếu, khách, giờ cần, lý do chưa chia) với "Áp dụng" khi có gợi ý; nút
  **"Tự chia việc"**; mỗi tài xế một cột: xe, số phiếu, dòng thời gian các phiếu theo giờ (giờ, mã phiếu, khách, trạng thái); 390 px thành danh sách.
- Cổng thợ: việc đã nhận chưa bắt đầu có link **"Từ chối việc"** (bắt nhập lý do) → về trang chủ với "Đã từ chối việc, điều phối sẽ chia lại".

# UX-FB8-001 — Đơn dịch vụ đếm bằng + / −, popup vượt hạn mức (D28, 23/10/2026)

- **Ô số lượng + / −** (`QuantityStepper`): nút "−" và "+" 44 px hai bên ô số, đơn vị bên phải ("chuyến", "giờ"); gõ được "2,5". Ô không bắt buộc
  bấm "−" từ 1 thì về trống; ô cho phép 0 dừng ở 0.
- **Danh sách đơn dịch vụ** (`/admin/service-jobs`, tiêu đề "Đơn dịch vụ"): tab Tất cả / Đã lên lịch / Đang thực hiện / Chờ xác minh / Đã xác minh / Đã hủy
  (số đếm, quá 99 ghi "99+"), tìm kiếm, cột "Số lượng dự kiến" ("Theo thực tế" khi để trống), "Người làm" ("Chưa giao"). Nút **"+ Tạo đơn dịch vụ"**
  mở popup chia nhóm: Khách & công trình → Dịch vụ (loại, xe/máy, "Số lượng dự kiến (không bắt buộc)" với gợi ý "Chưa biết thì để trống: thợ bấm số
  {đơn vị} thực tế khi hoàn tất") → Thời gian (Bắt đầu; Kết thúc dự kiến tự = bắt đầu + 4 giờ cho tới khi sửa tay) → Thêm (không bắt buộc): nhân viên
  kinh doanh, Ghi chú công việc. Mở từ đơn bán / khách ("Tạo dịch vụ") thì popup tự mở với khách + công trình đã chọn.
- **Chi tiết đơn dịch vụ**: thanh 5 bước Lên lịch → Giao thợ → Đang làm → Chờ xác minh → Đã xác minh, dưới là câu "bước tiếp theo"; 4 ô số Dự kiến /
  Thợ báo / Tính khách / Thành tiền (tạm tính theo đơn giá khi chưa xác minh). Khung **"Việc cần làm"** theo trạng thái: "Giao thẳng cho một thợ" /
  "Để thợ tự nhận" + "Giao việc"; "Tôi nhận việc này"; "Bắt đầu thay thợ"; khung gập **"Hoàn tất thay thợ (khi thợ không dùng được điện thoại)"** (số
  lượng + / −, người xác nhận, ghi chú không bắt buộc, "Ghi nhận vẫn đang làm"); xác minh: "Thợ báo N {đơn vị}. Sửa nếu khách chỉ chịu một phần.",
  Số lượng tính khách (+ / −, thành tiền tự theo), Số lượng tính công cho thợ (+ / −), Hạn thu, Ghi chú (không bắt buộc), nút **"Xác minh & ghi công
  nợ"**. "Hủy đơn dịch vụ" là nút đỏ mở popup (chỉ khi chưa giao việc).
- **Cổng thợ — việc dịch vụ**: "Số {đơn vị} thực tế" với + / − lớn, gợi ý "Bấm + mỗi {đơn vị} đã làm (hoặc gõ số). Dự kiến: …"; ghi chú không bắt
  buộc; nút **"Hoàn tất công việc"**. Số đã bấm được giữ trong bản nháp trên máy khi tải lại trang.
- **Đơn bán vượt hạn mức**: bấm Xác nhận / Duyệt đơn mà bị chặn vì tín dụng → về trang đơn, báo "Đã lưu bản nháp." và **popup tự mở**.
  Người duyệt được: popup "Duyệt vượt hạn mức tín dụng" (5 ô số, ghi chú không bắt buộc, nút "Duyệt vượt hạn mức và xác nhận đơn"); trên trang có khung
  vàng "Đơn vượt hạn mức tín dụng" + nút "Duyệt vượt hạn mức". Người khác: popup "Cần duyệt vượt hạn mức" với danh sách **tên · vai trò** người duyệt
  được (hoặc "Chưa có ai … Nhờ chủ doanh nghiệp cấp quyền"), nút "Xem người duyệt" mở lại. Đơn đã duyệt: "Người duyệt: Tên (mã) · vai trò · thời gian".

# UX-FB7-001 — Thợ lấy hàng & giao, bước tiếp theo, cổng khách Tài khoản, chọn cổng, chi phí, hao hụt kho, lý do, form lỗi (D27, 22/10/2026)

- **Cổng thợ — việc giao hàng**: phiếu "Chờ lấy hàng" có nút **"Đã lấy hàng lên xe · chụp ảnh"** (mở camera; có ảnh thì "Xác nhận đã lấy hàng lên
  xe (n ảnh)"), lưới ảnh "Đã tải / Đang tải / Lỗi tải" + "Xóa" / "+ Chụp thêm" (tối đa 5), link "Lấy thiếu hàng" mở ô số lượng từng dòng theo đơn vị
  bán. Sau đó "Đang giao": **"Đã giao · chụp ảnh"** → "Xác nhận đã giao (n ảnh)", "Người nhận", link "Giao thiếu / Không giao được" (số lượng + "Ghi
  chú (không bắt buộc)"). Xong: về danh sách, việc "Đã giao". Người xem không phải người được giao: "Việc này đang giao cho {tên}". Không còn câu
  "Bắt đầu công việc trước khi ghi nhận kết quả" cho việc giao hàng.
- **Trang phiếu giao (nội bộ)**: thanh 4 bước Lập phiếu → Phân người & xe → Thợ lấy hàng lên xe → Thợ đã giao (Hoàn tất); không còn nút "Đã tới nơi
  giao". Ảnh chia hai nhóm "Ảnh lấy hàng lên xe" / "Ảnh giao hàng". Form bàn giao / báo kết quả của nhân viên nằm trong khung gập **"Làm thay thợ (khi
  thợ không dùng được điện thoại)"**. Form xác minh chỉ hiện cho phiếu "Cần xác minh tay".
- **Bước tiếp theo**: khung viền xanh trên trang đơn bán luôn hiện khi đơn đã xác nhận — tiêu đề "Đã xác nhận SO-… — bước tiếp theo" (ngay sau xác
  nhận), "Tiến độ đơn SO-…" (khi quay lại), "Đơn SO-… đã giao xong"; mỗi phiếu: số · xe · tài xế · trạng thái (chờ phân xe / chờ lấy hàng / đang giao /
  đã giao); nút Thu tiền, In đơn, Tạo đơn mới cho khách này. Đơn mua đã xác nhận luôn có khung tương tự.
- **Cổng khách**: menu "Tài khoản" (thay "Hồ sơ"): Đăng nhập bằng, lần đăng nhập gần nhất, thông tin khách (mã, tên, SĐT, email, địa chỉ, MST, hạn
  thanh toán khi được xem công nợ), quyền của tài khoản, địa chỉ giao hàng (công trình), nút **Đổi mật khẩu**, **Đăng xuất**. Đơn giao đủ: **"Hoàn tất"**.
- **Trang chủ `/`**: ba thẻ lớn **Khối vận hành** (chủ, văn phòng, kho, điều phối), **Thợ & tài xế**, **Khách hàng** (nút "Đăng nhập" + **"Đăng
  ký"**); 390 px một cột. Màn đăng nhập ghi tên cổng và link **"← Chọn cổng khác"**.
- **Chi phí — "Ghi chi phí"** (popup, kiểu KiotViet): Loại chi (gõ hoặc chọn; gợi ý Lương thưởng, Thuê mặt bằng, Điện nước, Marketing, Mua tài
  sản/xe, Sửa chữa, Vận chuyển, Khác), Số tiền, Ngày chi, **Người nhận** Khác / Nhà cung cấp / Nhân viên (Khác: "Tên người nhận (không bắt buộc)"),
  **Thanh toán** (chỉ khi NCC) Đã trả ngay / Ghi nợ nhà cung cấp, **Chi từ quỹ** (mặc định tiền mặt; "Thành phiếu chi trong Sổ quỹ"), ô tích **Tính vào
  lợi nhuận** (gợi ý bỏ chọn khi mua tài sản dùng lâu), Ghi chú (không bắt buộc), Đơn bán liên quan. Bảng chi phí: cột "Người nhận" + dòng phụ "Đã trả
  ngay / Ghi nợ NCC / Không dùng tiền · không tính lợi nhuận". Sổ quỹ có nút **"Chi phí khác"** mở popup này.
- **Kiểm kho**: cột "Ghi chú" (không bắt buộc) thay "Lý do"; "Ghi chú chung cho dòng lệch (không bắt buộc)"; popup Hoàn thành báo "Phần hàng thiếu
  được ghi vào Chi phí thành Hao hụt kiểm kho …". Sổ quỹ có khung **"Chi phí không dùng tiền trong kỳ (hao hụt kho)"** (mã, loại chi / ghi chú, số
  tiền, tổng) ghi rõ "không tính vào số dư quỹ".
- **Công trình**: form bỏ vĩ độ, kinh độ, khung giờ nhận; bảng công trình bỏ cột "Giờ nhận".
- **Lý do**: không form nào bắt nhập lý do; danh mục/giá/quyền bỏ hẳn ô; thao tác tiền/hàng có ô "Ghi chú (không bắt buộc)".
- **Form lỗi**: không còn nút "Bắt đầu thao tác mới"; lỗi hiện đỏ ngay trên nút gửi, ô liên quan viền đỏ và được đặt con trỏ, dữ liệu đã nhập giữ
  nguyên, sửa xong bấm gửi lại. Lưu xong form tự trống để nhập tiếp.

# UX-FB5-001 — Quy đổi hai chiều, giá mua tự tính, sức chở, khách trả trước, bước tiếp theo (D25, 18/10/2026)

- **Đơn vị & quy đổi** (vật tư, "Hàng cùng loại"): mỗi dòng đơn vị có ô chọn chiều "1 {cơ sở} =" (mặc định) / "1 {đơn vị} =" rồi ô số; dưới ô hiện
  "Tức là 1 Tấn = 20 Bao · 1 Bao = 0,05 Tấn"; nhập chiều không chia hết (1 tấn = 3 bao) thì báo lỗi ngay ở dòng và gợi ý nhập chiều kia. Thẻ "Đơn vị &
  quy đổi" và bảng đơn vị hiện câu đậm "1 Tấn = 20 Bao", dòng phụ chiều ngược.
- **Tạo giá mua**: chọn vật tư thì "Đơn vị giá" chỉ còn đơn vị của vật tư đó; ô tích "Tự tính giá cho các đơn vị khác theo quy đổi" bật sẵn; lưu xong
  báo "Đã lưu giá mua và tự tính giá theo quy đổi: 1 tấn 1.600.000 ₫ …".
- **Xe**: popup Xe chỉ có "Sức chở tối đa" + "Đơn vị sức chở (vd tấn; hàng tính theo bao tự quy đổi)", không còn ô căn cứ. Hộp "Lập phiếu giao":
  tên xe kèm "· chở 5 tấn"; dưới ô xe "Xe chở tối đa 5 tấn ≈ 100 bao Xi măng"; vượt sức chở thì băng đỏ "vượt sức chở của xe (khoảng 120%)" và nút
  lập phiếu bị khóa; chưa quy đổi được thì ghi rõ vật tư thiếu quy đổi.
- **Đơn bán mới — "Khách trả trước"** (khung viền nét đứt dưới tổng tiền, chỉ người có quyền ghi thu): Số tiền (MoneyInput) · Phương thức · Vào quỹ ·
  "Còn phải trả …"; bảng "Xác nhận đơn bán" thêm dòng "Khách trả trước 2.000.000 ₫ · Chuyển khoản · VCB" và "Còn phải trả". Trang đơn: "Khách đã
  trả trước" (số tiền, REC-…, phương thức, link Sổ quỹ) và "Còn phải trả". Ghi thu lỗi: đơn vẫn lưu, băng đỏ "Đã lưu đơn nhưng chưa ghi được tiền
  khách trả trước … Kiểm tra Sổ quỹ trước khi ghi lại".
- **Bước tiếp theo** (khung viền xanh đầu trang ngay sau khi xác nhận): đơn bán — "Đã xác nhận SO-… — bước tiếp theo": từng phiếu giao "GH-… · xe … ·
  tài xế … · giờ — đã giao việc qua cổng thợ" hoặc "chờ phân xe, tài xế" + link "Phân xe"; đơn mua NCC giao thẳng chờ duyệt + "Duyệt đơn mua"; "Khách
  còn phải trả …"; nút **Thu tiền**, **In đơn**, **Tạo đơn mới cho khách này**. Đơn mua — "Gửi NCC" (nhảy tới khung Gửi NCC), "Nhận hàng" (nhảy
  tới form nhận), **Tạo đơn mua mới cùng NCC**; form nhận hàng có **"Nhận đủ (điền số còn lại)"** (NCC giao thẳng: "NCC giao đủ").
- 390 px: bảng Quy tắc tự động thành thẻ từng quy tắc; bảng phân giao Điều phối xếp các cột theo chiều dọc.

# UX-CUS-ACCOUNT-001 — Tài khoản cổng khách trên Khách hàng 360 (D14, 18/10/2026)

Thẻ "Thông tin & công trình" có khung **"Tài khoản cổng khách"**: mỗi tài khoản hiện tên đăng nhập (số điện thoại cho tài khoản SĐT), quyền, "Đăng
nhập gần nhất …" / "Chưa đăng nhập lần nào", "Chưa đổi mật khẩu tạm", "Đã thu hồi". Người có quyền quản lý khách: **"+ Tạo tài khoản"** (popup: Email
hoặc số điện thoại — điền sẵn SĐT khách, Mật khẩu tạm — tạo sẵn 10 ký tự dễ đọc, nút "Tạo mật khẩu khác", Quyền của tài khoản), xong hiện nội dung gửi
khách (link đăng nhập, tên đăng nhập, mật khẩu tạm) với "Chép nội dung" và "Mở Zalo khách"; mỗi tài khoản có "Đặt lại mật khẩu" và "Thu hồi" (lý do).
Khách tự đăng ký có nhãn **"Tự đăng ký"** cạnh mã khách; trùng số điện thoại với khách khác thì băng vàng "Có thể trùng khách: …" kèm link.
Trang đơn bán của đơn khách tự đặt: băng vàng "Đơn khách tự đặt trên cổng khách — chờ duyệt" + ghi chú của khách; nút chính "Duyệt đơn (giữ hạn mức,
tự phân nguồn)"; danh sách đơn có lọc "Khách đặt · Chờ duyệt"; Tổng quan nhắc "Có N đơn khách tự đặt đang chờ duyệt".

# UX-AUTO-001 — Quy tắc tự động và thông báo trên điện thoại (F5, 18/10/2026, SPEC-SEC-006)

- Cài đặt có thẻ **"Tự động hóa" → Quy tắc tự động** (`/admin/settings/automation`, quyền quản trị):
  - Khung **"Kênh gửi"**: 4 dòng xanh/vàng — gửi nền (pg_net, pg_cron), thông báo điện thoại và email (kèm số máy đã bật), Telegram, Webhook.
  - Bảng **Quy tắc**: Quy tắc │ Khi │ Nếu │ Thì gửi │ Sửa · Gửi thử · Xóa; quy tắc tắt hiện mờ "Đang tắt". "+ Thêm quy tắc" mở popup: Tên, **Khi**
    (danh sách sự kiện tiếng Việt), **Nếu** (ô tiền "tổng tiền từ" với sự kiện có tiền; ô tích "Chỉ khi giao thiếu hoặc không giao được" với kết quả
    giao), **Thì gửi qua** (điện thoại người phụ trách / Telegram / Email / Webhook), **Nơi nhận** (gợi ý cách lấy mã nhóm Telegram, định dạng webhook),
    "Đang dùng".
  - Bảng **Lịch sử gửi** (30 lần gần nhất): lúc, nội dung + tên quy tắc, kênh, trạng thái "Chờ gửi / Đang gửi / Đã gửi / Gửi lại sau · lần n / Ngừng
    gửi" kèm lý do (ví dụ "Chưa cấu hình Telegram").
- **"Bật thông báo trên máy này"** (trang Thông báo nội bộ, Hồ sơ cổng thợ): nút bật/tắt và một dòng trạng thái; iPhone chưa thêm vào màn hình chính
  thì hướng dẫn "Chia sẻ → Thêm vào MH chính"; trình duyệt chặn thì hướng dẫn cho phép trong cài đặt.

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


# UX-UI-R1-001 — Hệ giao diện D29 (KiotViet đẹp hơn, có chuyển động)

- **Màu**: xanh chính `#0B63C6` (menu, nút chính, liên kết), xanh lá `#12804A` chỉ cho hành động tiền / hoàn tất (Tạo đơn bán, Xác nhận đơn, Duyệt
  vượt hạn mức, Hoàn tất, Đặt hàng mới); cam cho cảnh báo, đỏ cho lỗi / xóa. Tương phản chữ ≥ 4.5:1.
- **Chữ**: Be Vietnam Pro; cỡ Vừa: chú thích 13, bảng 14, nội dung 15, tiêu đề mục 17, tiêu đề trang 22–26. Ô nhập trên điện thoại ≥ 16 px.
- **Khung vận hành**: thanh tiện ích trắng + menu xanh ngang; mục đang ở "dính" nền trang như tab; một `aria-current="page"`.
- **Danh sách**: khung trái = tìm kiếm + nhóm radio trạng thái có số đếm; bảng bên phải; mũi tên đầu dòng "Xem nhanh {mã}" / "Thu gọn {mã}"
  (`aria-expanded`, `aria-controls`); trên điện thoại mỗi dòng là một thẻ, mũi tên ở góc phải.
- **Màn tạo đơn**: dải xanh trên cùng bảng dòng hàng (ô tìm hàng F3, chọn kho xem tồn); cột phải dính: khách / công trình, tổng, giảm giá,
  trả trước, "Lưu nháp" + "Xác nhận đơn"; dưới 1440 px tổng + nút ghim đáy màn hình.
- **Chuyển động**: 120 ms (hover, nhấn), 200 ms (hiện / trượt), 320 ms (popup, thanh số liệu); đường cong `cubic-bezier(.2,.8,.2,1)`; nút nhấn co
  .97; tối đa 6 khối hiện so le. `prefers-reduced-motion: reduce` → không chuyển động.
- **Cổng điện thoại**: menu dưới 64 px có biểu tượng + chữ, vạch xanh trên mục đang ở; nút chính 52–56 px; bộ đếm − / + 72 px; nút kết thúc dính
  ngay trên menu dưới; tiến trình đơn 4 bước, bước hiện tại `aria-current="step"`.

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
