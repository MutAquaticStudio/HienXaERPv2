# Nhật ký phát hành

|UTC|Môi trường|Thao tác|Kết quả/bằng chứng|
|---|---|---|---|
|2026-10-12 18:50–19:10|GitHub/local|HEAD a21af16/PR44/CI171; giữ checkout gốc|CI619 unit/15 Node/type/lint/build đạt;12.534 tệp gốc,0 khác biệt|
|2026-10-12 19:00|Production connection|Session pooler đúng ref; CA/hostname TLS|TLS1.2 đạt; chưa xác thực mật khẩu; thư mục riêng0700/env0600|
|2026-10-12 19:10–19:20|Supabase readonly|Closure SO/PO/FK/guard/roles/Auth/Storage|Phân loại từ xác nhận chủ hệ thống/marker rõ; không suy toàn master là thử|
|2026-10-12 19:20:45|Production79|owner_authorized_uat_cleanup_20261013|34 dòng xóa; toàn dòng public/private giữ lại và5 guard so trong transaction; UAT_CLEANUP_RESULT.json|
|2026-10-12 19:28|Production79|Auth UAT đã ban/không liên kết người/khách|8 user/8 identities/53 audit xóa;2 user/master thật giữ; không tạo tài chính thử|
|2026-10-12 19:35–19:49|Production79|4 role LIVE-UAT không có nhân viên|4 roles/39 quyền xóa; Owner1/quyền62 giữ; so prefix trên master code|
|2026-10-12 19:30–19:49|Native49761 riêng|Forward78→187 rồi đúng artifact|8 nhóm catalog khớp fresh187;303 hàm/52 view/127 policy/111 trigger; dọn DB thử|

Exact bundle attempt đầu bị harness từ chối “begin” trong chuỗi SQL ledger trước áp lên Production. Lưu original SQL bằng base64 giải mã tại DB để giữ byte; kiểm lại đúng artifact và so fresh đạt. Không sửa nghiệp vụ để vượt lỗi.

Backup được chủ hệ thống miễn; không ghi ca chưa chạy thành đạt. Không đặt lại mật khẩu/đổi key từ sentinel/dùng QA làm Production. Hai race ứng trước không chạy lại, giữ600.000đ/400.000đ. Bằng chứng UI cũ giữ đúng source/timestamp/phạm vi.

Merge,migration đích,deploy/readback sau deploy sẽ được ghi theo kết quả thực tế; chưa đánh dấu ở các hàng trên.
