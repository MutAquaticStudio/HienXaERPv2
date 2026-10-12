# Bỏ rule opening pending

Yêu cầu trực tiếp sau mergePR42: bỏ ruleopeningpending rồi PR/merge lại. Singleagent; không chạy kiểm thử/chờCI theo chỉ đạo trước đó.

- Tài liệu Spec/implementation/UXUI/tasks bỏ quy trình PENDING→READY→ACTIVE bắt buộc và yêu cầu HX giữ pending sau phát hành.
- Màn hình Phạm vi dữ liệu không dùng trạng thái lịch sử hoặc postingAllowed từ RPC cũ để báo bị chặn. Chỉ hiển thị lịch sử chưa đối chiếu/đã đối chiếu đúng phạm vi.
- Legacy activation action chỉ xác thực rồi chuyển về trang dữ liệu; không gọiRPC hoặc báo đã kích hoạt.
- Forward20261012155947 bỏ trigger tự tạo pending cho chi nhánh mới; guard vận hành kiểm actor/branch và ghi mốc giao dịch, không kiểm opening/activation. API đọc không trả openingpending như trạng thái vận hành; RPC kích hoạt thủ công bị nghỉ sử dụng/revoke.
- Hồ sơ lịch sử tùy chọn có context riêng khi đăng ký import; giữ nguồn/capability/phê duyệt/khôi phục/rollback/đọc lại. Không sửa trạng thái lịch sử đã lưu, không tạo đầu kỳ/tiền/tồn hoặc activation giả.

Migration mới chỉ đưa vàoGit; chưa chạy QA hoặcProduction. Test assertions cập nhật nhưng chưa chạy; không tuyên bố đạt. Phát hành và các DOD còn thiếu vẫn giữ riêng.
