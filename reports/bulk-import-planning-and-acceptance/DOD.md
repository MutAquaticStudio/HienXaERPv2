# DOD — ứng viên bulk import, trạng thái 14/10/2026

Trạng thái chung: **PR NHÁP #50; CI đã đạt trên commit mã `9d230f6`; CHƯA NGHIỆM THU QA/TRÌNH DUYỆT, CHƯA PHÁT HÀNH.** Hai cờ tính năng mặc định tắt.

- [x] Checkout gốc và thay đổi local được giữ nguyên; làm việc trong worktree riêng.
- [x] Nền đã xác minh: `origin/main` `013093134d16d4157d761a748090933a2cd6fc87`, có merge PR49.
- [x] Dùng lại chuẩn bị draft SO/PO và RPC canonical; không tạo writer/ledger SO/PO thứ hai.
- [x] Migration mới theo thứ tự; rehearsal nâng cấp và cài fresh trên PostgreSQL 17.11 cục bộ, các database tạm đã xóa.
- [x] Upload Excel giới hạn 10 MB; ZIP/XML có giới hạn; công thức, liên kết ngoài, đường dẫn ZIP nguy hiểm và file lỗi bị từ chối.
- [x] Mapping dùng mã chính xác; tên chỉ cần rà soát; nhóm/chứng từ cần người dùng xác nhận; không gộp dòng trùng.
- [x] Manual price chỉ người có quyền; giá trong file chỉ tham khảo; kiểm lại giá/lượng ngay trước khi ghi.
- [x] SO nháp và PO kho nháp qua RPC hiện có; native test xác nhận không sinh movement, reservation, AR/AP, payment/allocation hay opening giả.
- [x] Retry cùng operation/source, conflict payload, duplicate/nhập lại có lý do, lưu một phần, sửa đối chiếu, hết hạn/không đọc sau expiry: 23 native checks PASS.
- [x] `pnpm typecheck` PASS.
- [x] `pnpm lint` PASS, 14 cảnh báo lint hiện hữu, 0 lỗi.
- [x] `pnpm test` PASS: 99 file, 669 test.
- [x] `pnpm build` PASS trên ứng viên hiện tại.
- [x] `pnpm audit --prod` PASS: không có advisory đã biết theo registry tại lần chạy.
- [ ] Browser UAT với tài khoản đúng vai trò SO/PO và Supabase Auth/Storage QA thật.
- [ ] Kiểm thử upload/tải lại/mất phản hồi trên browser; desktop/mobile.
- [ ] Xác nhận cấu hình môi trường QA, feature flags, cron retention và phục hồi tệp qua Storage thật.
- [x] PR nháp #50; CI GitHub run #188 đạt trên commit mã `9d230f6` (lint, typecheck, test, build).
- [ ] Review độc lập và CI lại sau cập nhật tài liệu/commit cuối.
- [x] Vercel Preview của PR ở trạng thái Ready: https://hien-xa-erp-v2-git-codex-safe-so-po-bulk-import-hienxa.vercel.app (chỉ preview; chưa đăng nhập/UAT, feature gate mặc định tắt).
- [ ] Diễn tập migration, backup/restore trên DB tương ứng môi trường phát hành; kiểm chứng dữ liệu thật trước/sau.
- [ ] Kế hoạch bật feature theo chi nhánh và triển khai riêng được chủ hệ thống duyệt.
- [ ] Không triển khai/không chạy Production; không có bằng chứng live.
- [ ] PDF MVP2/OCR, PO giao thẳng và mẫu nhập phức tạp vẫn hoãn.

Các mục QA/backup/review/phát hành chưa đạt ở trên chưa được đổi thành PASS bằng CI tổng hoặc preview deployment. Check Vercel phụ `hienxa-erp-v2` báo lỗi do tài khoản deploy bị chặn; check `hien-xa-erp-v2` có Preview Ready. Hai race ứng trước 600.000đ và 400.000đ không chạy lại.
