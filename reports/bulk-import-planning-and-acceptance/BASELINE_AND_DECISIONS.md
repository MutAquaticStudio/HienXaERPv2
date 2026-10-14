# Baseline và quyết định — SO/PO bulk import

Cập nhật: 14/10/2026. Đây là bằng chứng cho ứng viên cục bộ; chưa phải bản phát hành.

## Phiên bản

- Repo: `MutAquaticStudio/HienXaERPv2`.
- Worktree: `/Users/nox/.codex/worktrees/safe-so-po-bulk-import/HienXaERP`, nhánh `codex/safe-so-po-bulk-import`.
- Nền ứng viên: `origin/main` tại `013093134d16d4157d761a748090933a2cd6fc87`; commit này đã bao gồm merge PR49 (`08baaf6`, mẫu PDF SO/PO/phiếu giao).
- Ứng viên hiện còn thay đổi chưa commit. Chưa tạo PR, CI chưa chạy cho ứng viên này.
- Checkout gốc `/Users/nox/Downloads/HienXaERP` vẫn ở `codex/uat-role-navigation-20260923`, HEAD `79b0b918c7430bfd0e9d17e247ecba2be1fa0bf2`, 128 mục trạng thái Git. Mọi thay đổi được thực hiện trong worktree riêng; không reset/clean checkout gốc.

## Mốc môi trường và giới hạn kết luận

- Nền PostgreSQL của harness là 189 migration trong `origin/main`; harness chạy trên PostgreSQL 17.11 cục bộ, tạo và xóa các database UUID riêng.
- Không truy cập Supabase Production hoặc QA được quản lý; không xác minh schema Production, Storage thật, tài khoản doanh nghiệp hay phiên bản ứng dụng đang chạy.
- Không ghi dữ liệu Production, không chạy giao dịch tài chính/kho Production. Không chạy lại hai race ứng trước 600.000đ/400.000đ.
- Không có kiểm thử trình duyệt với tài khoản SO/PO được cô lập. Không tuyên bố UI/RLS Storage thật đã nghiệm thu.

## Quyết định triển khai đã được người dùng cho phép

- MVP1 chỉ đọc `.xlsx`, tạo SO nháp và PO nhập kho nháp. Mỗi chứng từ là một giao dịch độc lập; một lỗi không làm mất các chứng từ đã tạo.
- PDF có lớp văn bản, PDF scan/OCR, PO giao thẳng liên kết SO và mẫu đối tác phức tạp được hoãn.
- Parser không ghi chứng từ; bước tạo cuối gọi RPC SO/PO hiện hành và dùng chung chuẩn bị lượng/giá. Không tự tạo danh mục, xác nhận SO/PO, nhập/xuất kho, giữ chỗ, AR/AP, thu/chi hoặc phân bổ.
- Tệp và lượt nhập riêng tư; tạo lượt nhập + đăng ký tệp trong một RPC, quota theo actor/chi nhánh, nội dung nguồn có SHA-256 và thời hạn lưu 30 ngày. Sau hết hạn, API/RPC từ chối đọc và tác vụ nền xóa object.
- Cả cờ môi trường `HX_BULK_IMPORT_ENABLED` và singleton DB mặc định tắt. Đợt này không tự bật cờ hay triển khai.
- Giao diện chỉ bổ sung trang nhập riêng cho SO/PO và liên kết danh sách; không đổi `AppShell`, bảng điều khiển, hệ màu, CSS toàn cục hay luồng tạo đơn thủ công.

## Migration theo thứ tự

1. `20261014034026_bulk_import_draft_recovery_boundary.sql` — forward-only, ràng buộc intent khôi phục draft SO/PO vào RPC canonical và giữ adapter cũ.
2. `20261014131000_bulk_so_po_import.sql` — bảng metadata/private Storage/RLS, RPC đăng ký-xem-lưu-tạo nháp, duplicate/source occurrence, retention và feature gate mặc định tắt.

Hai migration đã chạy theo thứ tự trên schema cơ sở local của harness. Chưa diễn tập trên schema thực tế của QA/Production; không phát lại máy móc lên Production.

## Bằng chứng lịch sử

`FRESH_BASELINE.json` và `PR1_NATIVE_RECOVERY.json` giữ nguyên làm dấu vết từ các lượt trước. Chúng không đại diện trạng thái cuối: riêng `FRESH_BASELINE.json` có SHA-256 rỗng cho migration PR1 và chỉ là snapshot lịch sử. Dùng `PR2_NATIVE_MIGRATION.json` cho lần chạy native mới nhất; vẫn chỉ chứng minh local PostgreSQL và mock Auth/Storage.
