# Checkpoint chuẩn bị — 13/10/2026

**Đây là trạng thái trước merge/deploy. Kết quả hiện hành ở FINAL_REPORT.md,DOD.md và các readback sau triển khai.**

Người dùng cho phép dọn UAT → merge PR44 → deploy Production và đã chỉ đạo **không cần sao lưu**. Quyết định này thay điều kiện sao lưu trước đó. Không đặt lại mật khẩu hoặc lấy bí mật QA dùng cho Production. Triển khai tiếp qua Supabase MCP và Vercel CLI có quyền hiện hữu; không cần mật khẩu pg_dump khi không sao lưu.

Đích: Vercel hien-xa-erp-v2/team hienxa, hien-xa-erp-v2-nu.vercel.app; Supabase nbwynrwkdbtfsitafsxa. SUPABASE_SECRET_KEY ở env pull bị che; giữ cấu hình sensitive hiện có, không coi sentinel là khóa thật hoặc bằng chứng khóa sai.

Đã dọn SO-2026-000013, PO-2026-000010–000012 theo xác nhận chủ hệ thống; branch LUAT_PROOF_B_261008, sáu vai trò UAT không có nhân viên, tám Auth user đã khóa ở miền thử, các dòng nguồn/receipt/audit UAT. Đọc lại:0SO/0PO/0role UAT/0Auth miền thử; Owner,62 quyền Owner, HX_OWNER, HX, MT, BS và hai Auth users còn lại giữ nguyên. Bước dọn chính so toàn nội dung dòng giữ lại public/private trong transaction và khôi phục đúng năm trigger. Không tắt FK hoặc reset số chứng từ.

Schema đích hiện79 history:78 nguồn cũ +1 maintenance cleanup. Artifact forward và101 migration nguồn có SHA2564d59b0e0de56dfade386929093f83d630c25d2c3fd078e8d1e2772bc77376fd6. Diễn tập đúng byte trên cụm riêng49761 đạt:8 nhóm catalog khớp fresh187;303 hàm,52 view,127 policy,111 trigger. Đây là diễn tập cấu trúc native; không tuyên bố backup/restore doanh nghiệp hoặc managed Auth/Storage recovery.

Forward xây từ6 migration nguồn, giữ hai sửa đã thay thế, PT409 và cổng chống opening giả. Tám version lịch sử thiếu không ghi giả là đã chạy. Bundle ghi101 version đuôi sau SQL tương ứng thực sự thực hiện; migration quản trị chứa toàn bundle ghi dấu forward bổ sung.

CI a21af16 đã đạt:619 unit,15 Node,typecheck,lint,build; P2 resume source đã sửa và review thread resolve. Runtime UI giữ SHA256b56c4ace29f2690f5fb78bb9acfb9327861488346c43254d4fdcfd3dedbb600c. CI head hồ sơ mới được chốt tại PR trước merge.

Còn thực hiện: merge theo bảo vệ GitHub, nâng cấp nguyên tử đối chiếu mọi trường/khóa cũ, deploy đúng commit sau merge, kiểm app/schema/đường đọc/dịch vụ. GPS thiết bị và hóa đơn thật tiếp tục hoãn; HX_EINVOICE_ENABLED=false. Hai race ứng trước không chạy lại; giữ600.000đ/400.000đ.
