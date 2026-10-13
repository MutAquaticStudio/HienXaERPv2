# DOD RBAC

- [x] Đối chiếu tài liệu và Production: thiếu danh mục role, RBAC đã có.
- [x] 8 template, Owner/các role cũ/binding giữ nguyên, khách tách membership.
- [x] Guard chi nhánh/role active/trần quyền; không tăng quyền theo tên role.
- [x] Nonce ổn định, khóa nguồn, retry/đồng thời/conflict/không phục hồi role cũ.
- [x]17 ca SQL/RPC và8 role với JWT QA thật; token cũ/tài khoản khóa bị chặn dữ liệu.
- [x]8 role trên trình duyệt qua Owner form và phiên nhân viên riêng.
- [x]117 bảng nghiệp vụ QA và1 role hiệu lực; không email/ghi sổ thử.
- [x]45 test liên quan,type/lint/build đạt; các module nghiệp vụ không sửa.
- [x] CI headb3e1232 và mergecb6ad38 đạt648 kiểm thử,95 testfiles,type/lint/build. Tree merge bằng ứng viên.
- [x] Migration thực20261013121739/name operational_role_presets,checksum khớp SQL;8 roles/100 cặp quyền mới. Owner62/binding/140 bảng khác/127policies/ACL giữ nguyên.
- [x] Deploy cb6ad38/artifactB37gX/Production READY;schema189/history183;11 HTTP/Auth checks đạt,0log5xx truy vấn10m.142 fingerprint sau deploy khớp sau migration.
- [ ] Kiểm form role bằng Owner Production: phiên hết hiệu lực; chờ chủ đăng nhập lại, không ghi đạt.

Hai race ứng trước không chạy lại. Backup/restore: miễn theo chỉ đạo, không thực hiện. Email mời thật không gửi thử; không coi mock là tích hợp SMTP.
