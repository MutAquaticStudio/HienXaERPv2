# DOD — ứng viên bulk import, trạng thái 14/10/2026

Trạng thái chung: **PR NHÁP #50; CI run #190 đạt trên head `d8fa64b` trước chỉnh sửa test harness lần này; bản sửa harness chưa có CI mới. CHƯA NGHIỆM THU QA/REVIEW ĐỘC LẬP, CHƯA PHÁT HÀNH.** Hai cờ tính năng mặc định tắt.

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
- [ ] Browser UAT với tài khoản đúng vai trò SO/PO và Supabase Auth/Storage QA thật. Preview chỉ mở được trang đăng nhập; chưa xác thực ứng dụng đang trỏ QA.
- [ ] Kiểm thử upload/tải lại/mất phản hồi trên browser; desktop/mobile.
- [ ] Xác nhận feature flags, cron retention và phục hồi tệp qua Storage thật. Dự án QA đã xác định, nhưng lịch sử migration lệch repo nên chưa áp dụng ứng viên.
- [x] PR nháp #50; CI GitHub run #190 đạt trên head `d8fa64b` (lint, typecheck, 669 test, source/evidence tests, build); lần sửa harness sau đó đang chờ CI head mới.
- [ ] Review độc lập.
- [x] Vercel Preview của PR ở trạng thái Ready: https://hien-xa-erp-v2-git-codex-safe-so-po-bulk-import-hienxa.vercel.app (chỉ preview; chưa đăng nhập/UAT, feature gate mặc định tắt).
- [ ] Diễn tập migration, backup/restore trên DB tương ứng môi trường phát hành; kiểm chứng dữ liệu thật trước/sau.
- [ ] Kế hoạch bật feature theo chi nhánh và triển khai riêng được chủ hệ thống duyệt.
- [ ] Không triển khai/không chạy Production; không có bằng chứng live.
- [ ] PDF MVP2/OCR, PO giao thẳng và mẫu nhập phức tạp vẫn hoãn.

Local `pnpm qa:test` đạt 32/32 và XLSX parser đạt 5/5 sau khi bổ sung mô phỏng Storage vào fixture; đây là kiểm thử local, không thay cho Supabase QA. Dự án QA có remote migration không có trong repo và một lần áp dụng nền qua connector ghi phiên bản migration khác tên file; dừng rollout schema để tránh làm lệch lịch sử. Các mục QA/backup/review/phát hành chưa đạt ở trên chưa được đổi thành PASS bằng CI tổng hoặc preview deployment. Check Vercel phụ `hienxa-erp-v2` báo lỗi do tài khoản deploy bị chặn; check `hien-xa-erp-v2` có Preview Ready. Hai race ứng trước 600.000đ và 400.000đ không chạy lại.
