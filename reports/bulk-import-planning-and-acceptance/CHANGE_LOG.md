# Nhật ký thay đổi ứng viên

## 14/10/2026 — triển khai MVP1 local

- Tách logic chuẩn bị dòng SO/PO vào `src/modules/sales/draft-preparation.ts` và `src/modules/purchasing/draft-preparation.ts`; hành động nhập dùng cùng quy đổi, lượng, giá, permission và quy tắc snapshot hiện hành.
- Bổ sung ràng buộc actor/payload vào luồng save/retry SO/PO DRAFT mà không thay đổi writer canonical: `supabase/migrations/20261014034026_bulk_import_draft_recovery_boundary.sql`, `src/lib/core/command-outcome-actions.ts`.
- Thêm schema private cho import run/file/document, source occurrence/idempotency, DB feature gate mặc định tắt, bucket Storage private, RLS, rate limit và retention 30 ngày: `supabase/migrations/20261014131000_bulk_so_po_import.sql`.
- Thêm parser XLSX giới hạn ZIP/XML/nội dung và chặn formula, external relationship, đường dẫn không an toàn; thêm route upload/verify có giới hạn JSON body và timeout.
- Thêm resolver/preview/review/save/create SO/PO DRAFT; không nhận PDF, PO giao thẳng hoặc tạo master data.
- Thêm trang `/admin/orders/import` và `/admin/purchase-orders/import`, nút chỉ hiện khi quyền + DB/runtime feature gate cho phép. CSS riêng, không chỉnh hệ vỏ/hệ màu/giao diện module cũ.
- Thêm cron xóa Storage object hết hạn; chạy độc lập với cờ import để việc tắt tính năng không dừng retention.
- Cập nhật dependency XLSX parser và Next/eslint-config-next lên 16.3.8. Các advisory Next.js tháng 9/2026 liệt kê 16.3.8 là bản vá cho các advisory liên quan; vẫn cần cập nhật tiếp theo lịch bảo mật. [GHSA cache leak](https://github.com/vercel/next.js/security/advisories/GHSA-h694-7cp9-m8p3), [GHSA cache poisoning](https://github.com/advisories/GHSA-4jqv-mc3x-m676).
- Test harness bắt và sửa: JSON null vs SQL NULL; trạng thái unresolved bị ghi READY; tách tạo run khỏi register tạo orphan/quota; verify sau expiry; retry mới chạm ngưỡng quota khi cùng run đang được tạo.

## Không đổi

- Không đổi contract nghiệp vụ SO/PO, transaction ghi đơn canonical, giá/lượng, phân quyền hiện có hoặc tạo/confirm/receive/stock/AR/AP/cash logic.
- Không thay đổi dữ liệu hiện hành, không migration trên QA/Production, không commit/PR/merge/deploy.
- Không chạy lại hai race ứng trước 600.000đ/400.000đ.
