# HANDOFF — Kiểu giao diện Astryx (cập nhật 22/11/2026)

Bàn giao cho tài khoản / phiên làm tiếp phần dựng giao diện **Astryx** cho Hiền Xa ERP V2. Đọc kèm `CLAUDE.md`, `AGENTS.md`, `docs/astryx/DESIGN_SYSTEM.md`.
Nhánh làm việc: `claude/happy-wozniak-92ax9h` (đã push, **chưa tạo PR**, chưa merge, chưa deploy). Commit cuối: `46e6501`.

## 1. Mục tiêu và nguyên tắc (lệnh của Owner trong phiên)

- Astryx là **một theme/kiểu giao diện riêng** ("Classic" | "Astryx"), chọn theo thiết bị, **không ảnh hưởng UXUI cũ**. Mặc định Classic.
- Dựng lại **bằng component Astryx thật theo concept**, không phải CSS đè lên Classic (Owner đã phản đối cách CSS đè; các commit CSS đè đã được revert).
- Chỉ **một tác nhân/agent chạy tại một thời điểm** (Owner yêu cầu, tránh chạm giới hạn). Làm xong nhóm này mới sang nhóm khác.
- Concept (nguồn thiết kế) đã duyệt hướng; **nghiệp vụ thật (Spec.md, UXUI.md, `presentation.ts`) thắng concept** khi mâu thuẫn.
- Không sửa `Spec.md`/`UXUI.md`/`plan.md`/`tasks.md`; không migration; không đụng Supabase/Vercel cho việc giao diện này.

## 2. Kiến trúc đã dựng (đã có trong repo)

| Thứ | Vị trí |
|---|---|
| Lựa chọn kiểu giao diện (Classic/Astryx) trong cookie `hx-appearance`, phần thứ 4 (`dark.lg.be-vietnam.astryx`) | `src/lib/appearance.ts` (+ test) |
| Đọc kiểu giao diện phía server | `src/lib/skin.ts` → `currentSkin()` ("classic" khi ngoài request) |
| Công tắc "Kiểu giao diện" (Cài đặt, Tôi của thợ, Tài khoản khách) | `src/components/settings/appearance-form.tsx`, `src/components/portal/portal-appearance.tsx` |
| Bọc ứng dụng bằng theme Neutral của Astryx khi chọn Astryx | `src/components/astryx/astryx-skin.tsx` (+ `.css`), nối ở `src/app/layout.tsx` |
| Khung quản trị Astryx (TopNav, TopNavMenu, Avatar của Astryx) | `src/components/astryx/astryx-app-shell.tsx`, nối ở `src/app/admin/layout.tsx` |
| Khung cổng Khách / cổng Thợ Astryx | `astryx-customer-shell.tsx`, `astryx-work-shell.tsx`, nối ở `src/app/customer/layout.tsx`, `src/app/work/layout.tsx` |
| Kit trình bày dùng chung | `src/components/astryx/*-kit.tsx` + `*.css` (xem DESIGN_SYSTEM.md) |
| **Mẫu cho mỗi trang** | `src/app/admin/orders/page.tsx` + `astryx-view.tsx` + `astryx-view.test.tsx` |

**Mẫu chuẩn mỗi trang:** `page.tsx` giữ nguyên toàn bộ phần tải dữ liệu/quyền; ngay trước `return` Classic thêm
`if ((await currentSkin()) === "astryx") return <AstryxXxxView ... />`. View Astryx là component trình bày (server hoặc client), nhận dữ liệu qua props,
tái dùng **cùng server action/form Classic** (không viết lại logic ghi). Mỗi view có test (render, nhãn tiếng Việt, quyền, liên kết chính).
Khi một form Classic khó đưa vào khung mới mà không viết lại, **bọc nó trong thẻ Astryx** (`AxLegacy`) và giữ nguyên bên trong.

## 3. Trạng thái theo route

Trang có nhánh `currentSkin()` trong `page.tsx` (52 trang): đã dựng giao diện Astryx.
Một số trang khác dùng chung `ModuleCatalogPage` (`src/modules/catalog/module-page.tsx`, đã có nhánh Astryx): `customers/manage`, `service-jobs/types`, `suppliers/manage`, `products/manage`, `inventory/warehouses`, `dispatch/resources`, `catalog` — **coi là đã có** dù `page.tsx` không chứa `currentSkin`.

Trang **chưa** có nhánh Astryx (kiểm bằng grep `currentSkin` trong `page.tsx`; 62 trang, gồm cả các trang chuyển hướng/đã tắt):

```text
/
/admin/access
/admin/ai
/admin/attendance
/admin/audit
/admin/catalog
/admin/compensation
/admin/customers/manage
/admin/dashboard/obligations
/admin/debts
/admin/dispatch/resources
/admin/inventory/warehouses
/admin/invoices
/admin/invoices/[id]
/admin/messages
/admin/notifications
/admin/notifications/updates
/admin/operations
/admin/payment-notices
/admin/payroll
/admin/payroll/[id]
/admin/products/manage
/admin/quotations
/admin/quotations/[id]
/admin/quotations/[id]/edit
/admin/quotations/new
/admin/reports
/admin/routes
/admin/service-jobs/types
/admin/settings
/admin/settings/ai
/admin/settings/automation
/admin/settings/branches
/admin/settings/pricing
/admin/suppliers/manage
/admin/workforce
/auth/confirm
/customer/change-password
/customer/debts
/customer/login
/customer/messages
/customer/orders
/customer/orders/[id]
/customer/orders/new
/customer/profile
/customer/quotations
/customer/quotations/[id]
/customer/register
/customer/reports/ordered
/customer/services/[id]
/customer/services/new
/login
/recovery
/recovery/confirm
/select-branch
/tai-ve
/work/change-password
/work/dispatch
/work/login
/work/messages
/work/profile
/work/tracking
```

Ghi chú: `/admin/quotations*` và `/customer/quotations*` đang tắt (D1) — không cần dựng. `/admin/debts` chỉ chuyển hướng (cần tab chung Phải thu | Phải trả, xem `fin-tabs.tsx`).
Nhóm đang dở khi dừng: **Giao hàng / Tài chính** (đã có phải thu, phải trả, chi phí, hóa đơn, thông báo thanh toán; kiểm lại dispatch/resources, routes, debts, sổ quỹ, payment-notices).
Thứ tự đề xuất tiếp theo: (1) hoàn tất Giao hàng/Tài chính → (2) Tổng quan, Nhân công, Hệ thống (payroll + đơn giá chuyến theo xe D70 + đơn giá công việc D76, báo cáo D57, cài đặt, thông báo, AI) → (3) cổng Khách (kể cả bản máy tính, popup) → (4) cổng Thợ + đăng nhập/công khai → (5) dựng lại bên trong các form đang bọc Classic (tạo/sửa đơn, nhập Excel, thân tab khách 360/NCC/vật tư...).

## 4. Việc còn lại và điểm cần quyết định của Owner

- **Chưa ai xem giao diện bằng mắt trên trình duyệt**: chỉ có test jsdom + build. Cần tài khoản QA (hoặc dữ liệu giả) để chụp thử. Việc đầu tiên nên làm: bật Astryx trên QA (Cài đặt → Kiểu giao diện) và kiểm từng nhóm.
- Menu dưới cổng Khách: app đúng 6 mục có nút "Đặt" nổi (D75). Concept từng bỏ nút này — **bỏ đề xuất đó**; Owner chưa chốt gì thêm.
- Concept tự đặt tên trạng thái cho trả hàng NCC, chuyển kho, kiểm kho; app dùng nhãn trong `presentation.ts` (kiểm kho: Đang kiểm / Đã cân bằng kho / Đã hủy). Luôn lấy nhãn từ code.
- Vượt hạn mức khi khách đặt hàng: lời báo phía khách do concept soạn, Spec chưa ghi — chưa dựng như yêu cầu.
- Cập nhật `UXUI.md` cho kiểu giao diện Astryx là việc của Owner (SPEC-DOC-003): tài liệu hiện mô tả một giao diện.
- Nợ kỹ thuật: các nhóm trước đây đặt tên trùng trong các kit (`AxPanel`, `AxFacts`, `AxTable`... có ở `sales-kit`, `buystock-kit`, `n4-kit`, `fin-kit`). Nên gom về một kit chung sau khi dựng xong.
- Nút/Chip trong kit dùng Badge/Avatar/TopNav của Astryx; một số nút là `hx-btn` tự dựng (cùng chiều cao, bóng). Nếu Owner muốn Button Astryx thật, đổi tại `ax-kit.tsx`.
- Chưa dựng chế độ tối riêng cho Astryx (cookie `theme` vẫn áp qua token của Neutral, chưa kiểm).

## 5. Cách chạy và kiểm tra

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # pnpm check; hiện: lint 0 lỗi, 2059 test qua
```

Chỉ commit khi cả bốn qua. Commit nhỏ `feat(ui): ...`, kèm dòng `Co-Authored-By` theo hướng dẫn của phiên. Không tạo PR nếu Owner chưa yêu cầu.

## 6. Concept tham chiếu (nguồn thiết kế)

- Dự án Vite React dựng bằng Astryx thật: `docs/astryx/concept/` (xem `README` bên dưới). **261 màn hình mẫu** (admin, popup, mẫu in, cổng Thợ/Khách bản điện thoại và PC, đăng nhập/công khai): danh sách + route + mẫu Astryx + ghi chú nghiệp vụ trong `docs/astryx/concept/meta.json`.
- Chạy xem thử: `cd docs/astryx/concept && npm install && npx vite` rồi mở `/#/<id>` (id trong `meta.json`, ví dụ `#/admin-orders`). `shot.js` chụp ảnh bằng Playwright.
- Tài liệu phối hợp của đội thiết kế (đọc để hiểu quyết định): `BRIEF.md` (quy tắc UXUI), `FACTS.md` (dữ kiện chuẩn dùng chung), `DECISIONS.md`, `REVIEW-admin.md`, `REVIEW-portal.md`, `IMPL.md` (quy tắc triển khai cho agent).
- Canvas thiết kế (xem trực quan): artifact `https://claude.ai/artifact/2E1a9DLqFTtvqNTAXJp3X5` (board sống 261 màn + tài liệu theme/mẫu trang/thành phần). Trang xem thử bấm được: `https://claude.ai/artifact/7Wo2xs8sUEbfcRsw1Lp3au`. Có thể không còn truy cập từ tài khoản khác; nguồn gốc nằm trong `docs/astryx/concept/`.
- Lưu ý: concept chỉ là hình thức, dữ liệu hư cấu, có chỗ tự đặt nhãn/nghiệp vụ (xem mục 4).

## 7. Bài học vận hành

- Giới hạn 5 giờ của phiên làm nhiều tác nhân song song bị ngắt nhiều lần: dùng **một tác nhân** tuần tự, mỗi lần một nhóm route.
- Trước mỗi commit: chạy đủ 4 lệnh; một lần commit đầu tiên của phiên đã lỡ push khi còn 1 test hỏng (đã sửa ngay) — đừng lặp lại.
- Các nhánh `ModuleCatalogPage` tác động nhiều route cùng lúc: sửa cẩn thận, chạy test thư mục `src/modules/catalog`.
