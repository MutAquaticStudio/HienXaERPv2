# Bảng hoàn tất đợt UI

Phạm vi: các thành phần được tinh chỉnh và 12 màn hình/8 loại tài khoản nêu trong ROLE_SCREEN_MATRIX.md. Đây không phải bảng nghiệm thu go live hoặc toàn bộ nghiệp vụ doanh nghiệp.

- [x] Taste đúng skill, Codex, nguồn commit và byte đã xác minh; đọc đầy đủ.
- [x] Checkout gốc và thay đổi local được bảo toàn: 12.534 tệp, 0 khác biệt.
- [x] Giữ cấu trúc, sidebar, palette, Noto Sans, bảng, nút và tên nghiệp vụ.
- [x] Các vấn đề ưu tiên sửa và kiểm chứng trên trình duyệt; 24 cặp ảnh có đối chiếu.
- [x] Desktop và viewport điện thoại của các vai trò bị tác động đạt trong phạm vi ghi rõ.
- [x] Không đổi API/RPC/schema/quyền/tính toán/transaction/intent hoặc điều kiện đầu kỳ.
- [x] Ca thực15→14→13, mất mạng, mất phản hồi, gửi lại và quyền bị cấm đạt trên QA riêng.
- [x] DB thử đã dọn; 122 bảng public của QA nguồn giữ nguyên sau hồi quy.
- [x] 64 kiểm thử liên quan, typecheck, lint và build đạt cục bộ. Lint có13 cảnh báo có sẵn, 0 lỗi.
- [ ] CI trên đúng HEAD PR: đang chờ tạo PR và kết quả Actions; không dùng CI cũ để đánh dấu đạt.
- [x] Có ảnh trước/sau, nhật ký, giới hạn và danh mục vai trò/màn hình.
- [ ] Commit, PR và bản xem trước cuối: đang đóng gói; chưa merge hoặc triển khai.

Hai race ứng trước không chạy lại: `package4-advance-race.mjs --mode different-intents` và `--mode same-intent`. Giữ bằng chứng một phân bổ600.000đ, còn400.000đ; không bỏ cả nhóm tài chính.
