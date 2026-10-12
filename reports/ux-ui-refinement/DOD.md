# Bảng hoàn tất đợt UI

Phạm vi: các thành phần được tinh chỉnh và 12 màn hình/8 loại tài khoản nêu trong ROLE_SCREEN_MATRIX.md. Đây không phải bảng nghiệm thu go live hoặc toàn bộ nghiệp vụ doanh nghiệp.

- [x] Taste đúng skill, Codex, nguồn commit và byte đã xác minh; đọc đầy đủ.
- [x] Checkout gốc và thay đổi local được bảo toàn: 12.534 tệp, 0 khác biệt.
- [x] Giữ cấu trúc, sidebar, palette, Noto Sans, bảng, nút và tên nghiệp vụ.
- [x] Các vấn đề ưu tiên sửa và kiểm chứng trên trình duyệt; 24 cặp ảnh có đối chiếu; chỉ số tại320/760/1024/1100/1180/1280/1440px không bị cắt (RESPONSIVE.json).
- [x] Desktop và viewport điện thoại của các vai trò bị tác động đạt trong phạm vi ghi rõ.
- [x] Không đổi API/RPC/schema/quyền/tính toán/transaction/intent hoặc điều kiện đầu kỳ.
- [x] Ca thực15→14→13, mất mạng, mất phản hồi, gửi lại và quyền bị cấm đạt trên QA riêng.
- [x] DB thử đã dọn; 122 bảng public của QA nguồn giữ nguyên sau hồi quy.
- [x] 64 kiểm thử liên quan, typecheck, lint và build đạt cục bộ. Lint có13 cảnh báo có sẵn, 0 lỗi.
- [ ] CI sau sửa phần thập phân ở màn hình hẹp cần kiểm tra trên HEAD mới. Bằng chứng trước sửa: commit543a93e đạt619/619 unit (91 tệp), 8/8 Node, typecheck, lint, build: [run38283937185](https://github.com/MutAquaticStudio/HienXaERPv2/actions/runs/38283937185). HEAD chốt ảnh/tài liệu giữ nguyên mã runtime; CI hiện hành tại [PR44 checks](https://github.com/MutAquaticStudio/HienXaERPv2/pull/44/checks) phải đạt trước bàn giao, không lấy run cũ đại diện head mới.
- [x] Có ảnh trước/sau, nhật ký, giới hạn và danh mục vai trò/màn hình.
- [x] Commit mã543a93e, [PR44](https://github.com/MutAquaticStudio/HienXaERPv2/pull/44), [preview cục bộ](http://127.0.0.1:3116), PREVIEW.json và ảnh sau được chụp trên mã đã commit bằng next start. Không merge hoặc triển khai.

Hai race ứng trước không chạy lại: `package4-advance-race.mjs --mode different-intents` và `--mode same-intent`. Giữ bằng chứng một phân bổ600.000đ, còn400.000đ; không bỏ cả nhóm tài chính.

Mã runtime được đóng dấu SHA-256 `b56c4ace29f2690f5fb78bb9acfb9327861488346c43254d4fdcfd3dedbb600c`. Sửa phần thập phân bổ sung đã được kiểm chứng hiển thị; CI mới đang chờ, không dùng run trước sửa làm kết luận. Kết quả CI cuối được ghi trong PR sau khi GitHub hoàn thành kiểm tra HEAD; hồ sơ không ghi ca chưa chạy thành đạt.
