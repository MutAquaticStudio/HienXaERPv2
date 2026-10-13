# Kết quả RBAC và phát hành

Đã merge PR48 cb6ad38ebec16a8a0e04ff3d4b3d0d7edc85a734 và deploy Production artifact dpl_B37gX9d4YzRfgxuBer1kXV2ygwGq. CI headb3e1232/run38395094288 và mergecb6ad38/run38395614047 đạt648 kiểm thử/95testfiles,type/lint/build.45 test liên quan,17SQL/RPC,5 diễn tập đúng định nghĩa hàm Production,8JWT và8role trên trình duyệt QA đạt.

Bổ sung Quản lý,Bán hàng,Mua hàng,Nhân viên kho,Điều phối,Kế toán,Thợ,Tài xế. Owner/các role cũ không sửa; không tự gán ai. Khách giữ membership riêng. Thợ/tài xế chỉ work.read/work.claim; không đọc giá vốn/tài chính hoặc tự xác minh. Cấp quyền không vượt người cấp, role active/chi nhánh được kiểm; nonce ổn định,khóa nonce/nhân viên,retry/đồng thời/conflict và lịch sử xử lý đúng.

Migration Production actual20261013121739 operational_role_presets (1statement),SQLfile20261013105000,hash8ec1e8f3;MD5 c85dbec5047a0ee1535d332ae4fb4cb0 trùngstatements. Canonical189/history thực183. Đây là ánh xạ thực, không sửa journal giả hoặc push lại lịch sử. Chỉ8role/100 permission pairs mới và2 thân RPC RBAC đổi;140 bảng khác,127policies,ACL/definer và các hàm nghiệp vụ khác giữ nguyên. Sau deploy142fingerprint vẫn khớp trạng thái saumigration. Kho/tiền/chứng từ/opening/account/binding không đổi.

11 HTTP/Auth/anonymous checks đạt đúngcommit; logdeployment mới10m không có5xx. Owner Production đã hết phiên và được chuyển đúng/login; kiểm trực tiếp form9role chưa hoàn tất, đang chờ chủ đăng nhập lại. Không ghiPASS bước này. Không gửi email mời hoặc tạo tài khoản/giao dịch thử trênProduction. SMTP thật chưa được kiểm bằng unit mock. Không tự đưaGPS/hóađơn thật vào phạm vi.

Checkout gốc79b0b91 và12534tệp giữ nguyên; QA disposable đã dọn,QA nguồn giữ. Hai race600.000/400.000 không chạy lại. Backup/restore đích được miễn,không thực hiện. Phục hồi app vềd538e9f artifact8HgrA,cùngschema189/guardmới;không xóa role/người dùng/lịch sử đã dùng thật. Xem ROLE_MATRIX.md,RELEASE_AND_RECOVERY.md,DOD.md,RELEASE_RESULT.json và hồ sơ QA/Production.

Phạm vi: RBAC/template/role assignment/routing và bản giao diệnPR47 trước đó. Không thay ma trận nghiệm thu toànERP. Chưa gọi toàn bộGO LIVE/DOD đạt khi còn bước Owner Production chờ đăng nhập.
