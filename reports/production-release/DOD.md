# DOD hiện hành

|Mục|Trạng thái và căn cứ|
|---|---|
|Giữ checkout gốc/thay đổi local|ĐẠT:12.534 tệp,0 khác biệt; không reset/clean|
|Taste/UI giữ thiết kế hiện tại|ĐẠT trong12 màn hình/8 loại tài khoản/24 cặp ảnh QA|
|UAT người dùng xác nhận đã dọn|ĐẠT:CLEANUP_FINAL_READBACK.json|
|Không chạy lại2 race ứng trước|ĐẠT:giữ600.000đ/400.000đ|
|Nâng cấp nguồn78→canonical187|ĐẠT diễn tập cấu trúc và transaction Production đối chiếu dòng thực; PRODUCTION_SCHEMA_READBACK.json|
|Bảo toàn dữ liệu giữ lại|ĐẠT guard mọi trường/khóa public/private trước commit; không tiền/kho/opening mới|
|Quyền ứng dụng đúng canonical|ĐẠT sau migration188;0 quyền DDL thừa; SELECT/INSERT/UPDATE/DELETE và Owner62 giữ|
|Opening pending/activation không chặn|ĐẠT:postingAllowed=true,canActivate=false,historicalUNRECONCILED; không opening giả|
|CI ứng viên/sau merge PR44|ĐẠT:e4940b1/run172 và8f65d70/run173|
|PR44 merge,deploy đúng đích|ĐẠT:8f65d70,dpl_G6k57Drjkh3cJuG9DHXFcY1rGKp1,Production refnbwynrwkdbtfsitafsxa|
|Health/HTTP/Auth connectivity/public browser/RLS read-only|ĐẠT đúng phạm vi POSTDEPLOY_HTTP/BROWSER/RLS|
|CI/merge/deploy head cuối chứa migration188 và log|ĐANG HOÀN TẤT trong PR bổ sung; không lấy CI8f đại diện head mới|
|Trình duyệt doanh nghiệp sau đăng nhập|CHƯA XÁC MINH:cần người dùng đăng nhập tab đã mở, không gửi bí mật|
|Nghiệm thu toàn phân hệ/vai trò trên Production|CHƯA XÁC MINH:bằng chứng QA không đổi thành bằng chứng Production|
|Backup/restore DB/tệp đích|MIỄN THEO CHỈ ĐẠO NGƯỜI DÙNG;không ghiPASS|
|GPS thiết bị/hóa đơn thật|HOÃN:DEFERRED/configfalse;không phát hành giả|
|Bàn giao log/recovery|ĐẠT hồ sơ;điền artifact cuối theo kết quả thực|

DOD phát hành UI đã làm và DOD nghiệm thu toàn doanh nghiệp là hai phạm vi. Chỉ ghi GO LIVE toàn phạm vi khi các mục bắt buộc chưa xác minh đã có bằng chứng thật hoặc quyết định phạm vi rõ của chủ hệ thống.
