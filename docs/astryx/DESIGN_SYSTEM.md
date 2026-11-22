# Design system — kiểu giao diện "Astryx" của Hiền Xa ERP

Tài liệu để hiểu và mở rộng giao diện Astryx. Nền: **Astryx** (Meta, MIT, React 19 + StyleX, `@astryxdesign/core` 0.7.x, pre-1.0 — luôn kiểm prop bằng
`npx @astryxdesign/cli component <Tên>`). Quy tắc nguồn: `UXUI.md` mục **UX-UI-R1-001 (D29)** — Astryx là **cách dựng khác** của cùng quy tắc đó, không thay luật.

## 1. Nguyên tắc

1. **Theme, không phải bản sửa:** Classic | Astryx chọn theo thiết bị (cookie `hx-appearance`, phần thứ 4). Classic luôn nguyên vẹn.
2. **Cùng nghiệp vụ:** dữ liệu, quyền, server action, nhãn trạng thái (`presentation.ts`) dùng chung; chỉ lớp trình bày khác.
3. **Một nút chính mỗi màn**; xanh lá chỉ cho hành động tiền/hoàn tất; nguy hiểm tách riêng, nêu hậu quả (UX-200).
4. **Chữ tiếng Việt, ≥ 13px**, số căn phải và chữ số đều, tiền VND nguyên đồng `45.600.000 ₫`, không hiện mã enum.
5. **Nghiệp vụ thật thắng concept** khi lệch (xem HANDOFF.md mục 4).

## 2. Token (đặt trên `[data-astryx-theme]` trong `astryx-skin.css`, kế thừa theme Neutral)

| Vai trò | Giá trị | Ghi chú |
|---|---|---|
| Nhấn chính (`--color-accent`, menu, nút chính, liên kết) | `#0B63C6` (chữ liên kết `#0B5CB8`) | chữ trắng 5,8:1 |
| Xanh lá (`--color-success`) | `#12804A` | **chỉ** Tạo đơn bán, Xác nhận đơn, Duyệt, Thu/Chi tiền, Hoàn tất, Đặt hàng mới |
| Cảnh báo (`--color-warning`) | `#E8890C` | chữ cảnh báo dùng cam đậm `#7A4300` trên nền `#FFF1D6` |
| Lỗi/xóa (`--color-error`) | `#B4291F` | chữ trắng 6,4:1 |
| Nền trang / thẻ | `#F2F5F9` / `#FFFFFF` | |
| Chữ chính / phụ | `#10223A` / `#5A6B82` | |
| Viền / viền ô nhập | `#E3E9F1` / `#C7D2DF` | |
| Phông | **Be Vietnam Pro** (dự phòng Noto Sans) | cỡ: chú thích 13, bảng 14, nội dung 15, tiêu đề mục 17, tiêu đề trang 22–26 |
| Bo góc | thẻ 12–16, ô nhập 8–10, hộp thoại 16 | |
| Chuyển động | 120 / 200 / 320 ms, `cubic-bezier(.2,.8,.2,1)`; tắt khi `prefers-reduced-motion` | |

Màu trạng thái nghiệp vụ (nhãn luôn có chữ): Nháp = xám; Chờ duyệt/Chờ xác minh = cam; Đã duyệt/Đã xác nhận/Đang giao = xanh dương;
Hoàn tất/Đã ghi sổ/Đã xác minh = xanh lá; Đã hủy/Đã đảo = xám; Quá hạn/Có chênh lệch/Từ chối = đỏ. `AxStatus` ánh xạ `salesStateTone()` v.v. sang `Badge` của Astryx.

Lớp CSS thiết kế (class `hx-*`, trong `.ax-root`): `src/components/astryx/ax.css` (bản đã port từ concept) + CSS riêng từng nhóm (`sales-ax.css`, `buystock.css`, `fin-kit.css`, `n4.css`, `customer.css`, `ax-work.css`).

## 3. Khung (shell)

- **Quản trị** (`astryx-app-shell.tsx`): thanh tiện ích trắng 56px (logo công ty hoặc "HX", chọn chi nhánh, tìm nhanh Ctrl K, trợ lý AI, chuông, menu người dùng) trên thanh menu xanh dựng bằng `TopNav`/`TopNavMenu`/`TopNavItem` của Astryx; mục đang ở dính nền trang như tab. Quyền hiển thị menu lấy từ `navigation` ở `app-shell.tsx` (dùng chung với Classic).
- **Cổng Khách** (`astryx-customer-shell.tsx`): điện thoại = thanh trên + menu dưới 64px **6 mục** (Trang chủ, Đơn hàng, Đặt nổi giữa mở tờ Hàng hóa/Dịch vụ, Báo cáo, Công nợ, Tôi); máy tính (≥ 800px) = thanh tiện ích + menu ngang.
- **Cổng Thợ** (`astryx-work-shell.tsx`): menu dưới 64px (Hôm nay, Nhận việc, Điều phối cho thợ chính, Thu nhập, Tôi); nút chính 52–56px, ô nhập ≥ 16px, nền sáng/tối (D84).

## 4. Mẫu trang (concept → Astryx template)

| Mẫu | Dùng cho | Thành phần chính |
|---|---|---|
| Danh sách có lọc (Filterable Table) | đơn bán, đơn mua, khách, vật tư, phiếu giao... | khung lọc trái (ô tìm + nhóm radio trạng thái có số đếm, `AxFilterRadios`), bảng bên phải, mũi tên "Xem nhanh {mã}" mở hàng chi tiết (`AxExpandRow`), phân trang chỉ khi nhiều trang |
| Chi tiết (Order Detail) | đơn bán, phiếu giao, khách 360 | đầu trang (`AxDetailFrame`/`AxPageHead`) + chip trạng thái, dải số liệu (`AxStrip`/`AxFacts`), tab, cột phải thao tác tiếp theo |
| Tạo/sửa chứng từ (Checkout Form) | đơn bán, đơn mua | dải xanh tìm hàng F3 + chọn kho, bảng dòng hàng, cột phải dính tổng/giảm giá/trả trước/Lưu nháp + Xác nhận (form chức năng Classic bọc trong `AxLegacy`) |
| Bảng điều khiển (Analytics + Incident Console) | tổng quan, báo cáo D57 | "Cần xử lý hôm nay", Thu/Chi/Lợi nhuận so kỳ trước, biểu đồ |
| Kanban | điều phối | Chờ phân giao → Đã phân giao → Đang giao → Chờ xác minh |
| Cài đặt (Settings Panels) | cài đặt, phân quyền | mục lục trái, `Switch`, khối rủi ro tách riêng |
| Hộp thoại / tờ trượt | popup chức năng | Dialog (máy tính) / BottomSheet (điện thoại); một nút chính, nút nguy hiểm tách, khung "Hậu quả" |
| Đăng nhập (Login Card, D30) | `/login`, cổng | một thẻ, logo công khai (D49) |

## 5. Thành phần Astryx đang dùng

`TopNav`, `TopNavMenu`, `TopNavItem`, `Avatar`, `Badge`, `Banner`, `ProgressBar`, `Stepper`, `Switch`, `Dialog`/`AlertDialog` (xem `sales-dialog.tsx`). Khi thêm: `npx @astryxdesign/cli component <Tên>`; nhập theo đường dẫn con (`@astryxdesign/core/Badge`); component có hàm trong props cần file `"use client"`.
Chưa dùng (cân nhắc): `Table` dữ liệu (hiện bảng dựng bằng `hx-th/hx-tr` để giữ hàng mở rộng), `CommandPalette` (đang dùng `GlobalSearch` hiện có), `BottomSheet` (cổng điện thoại).

## 6. Kit dùng chung (`src/components/astryx/`)

- `ax-kit.tsx`: `AxStatus`, `toneOf`, `AxPerson`, `AxButtonLink`, `AxPageHead`, `AxFilterRadios`; `ax-expand-row.tsx`: `AxExpandRow`.
- `sales-kit.tsx` / `sales-dialog(s).tsx`: `AxPanel`, `AxFacts`, `AxStrip`, `AxSum`, `AxTag`, `AxMeter`, `AxFlow`, `AxBanner`, `AxTabs`, `AxFormPage`; hộp thoại hủy/xóa/duyệt.
- `buystock-kit.tsx`: `AxPanel`, `AxTable`, `AxDetails`, `AxKv`, `AxTwoCol`, `AxSteps`, `AxBar`, `AxLegacy`, `AxFilters`, `AxField`, `AxSelectField`, `AxEmpty`, `AxFormFrame`, `AxDetailFrame`, `AxFilterBar`, `AxCheckField`.
- `customer-kit.tsx`: `CxHead`, `CxLink`, `CxNotice`, `orderTone`, `serviceTone`; `work-kit.tsx`: kit cổng Thợ; `fin-kit.tsx`, `fin-tabs.tsx`, `n4-kit.tsx`: tài chính/hệ thống.
- **Nợ kỹ thuật:** tên trùng giữa các kit — gom về một kit sau khi dựng xong.

## 7. Cách thêm một trang Astryx mới

1. Đọc trang Classic: dữ liệu, quyền, action, nhãn. Không đổi gì ở đó.
2. Tìm màn tương ứng trong concept: `docs/astryx/concept/meta.json` (id, route, mẫu, ghi chú) và code `docs/astryx/concept/src/*.jsx`.
3. Tạo `astryx-view.tsx` cạnh `page.tsx`, dùng kit; nhãn lấy từ `presentation.ts`; form có action thì tái dùng form Classic (bọc `AxLegacy` nếu cần).
4. Trong `page.tsx` thêm `if ((await currentSkin()) === "astryx") return <… />` sau khi tải dữ liệu.
5. Thêm test (`astryx-view.test.tsx`) rồi chạy `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## 8. Việc kiểm thử còn thiếu

Chưa kiểm bằng mắt trên trình duyệt thật; chưa kiểm độ tương phản bằng công cụ; chưa dựng nền tối riêng cho Astryx; chưa kiểm 768/1024px cho cổng Thợ.
