# DOD RBAC

- [x] Đối chiếu tài liệu và Production: thiếu danh mục role, RBAC đã có.
- [x] 8 template, Owner/các role cũ/binding giữ nguyên, khách tách membership.
- [x] Guard chi nhánh/role active/trần quyền; không tăng quyền theo tên role.
- [x] Nonce ổn định, khóa nguồn, retry/đồng thời/conflict/không phục hồi role cũ.
- [x]17 ca SQL/RPC và8 role với JWT QA thật; token cũ/tài khoản khóa bị chặn dữ liệu.
- [x]8 role trên trình duyệt qua Owner form và phiên nhân viên riêng.
- [x]117 bảng nghiệp vụ QA và1 role hiệu lực; không email/ghi sổ thử.
- [x]45 test liên quan,type/lint/build đạt; các module nghiệp vụ không sửa.
- [ ] CI head và merge đạt đúng phiên bản.
- [ ] Migration Production đối chiếu bảo toàn role/binding/data/grants/policies.
- [ ] Deploy và kiểm đọc sau triển khai đúng commit/schema.

Hai race ứng trước không chạy lại. Backup/restore: miễn theo chỉ đạo, không thực hiện. Email mời thật không gửi thử; không coi mock là tích hợp SMTP.
