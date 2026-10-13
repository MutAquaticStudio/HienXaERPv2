# DOD hiện hành

Phiên bản đang chạy:d538e9f/PR47/8HgrA4/schema canonical188, lịch sử thực182. Bản giao diện bổ sung đã merge,deploy và kiểm đọc Owner; kết quả mới tại ../ux-ui-refinement/iteration-2/DOD.md. Nghiệm thu toàn ERP giữ giới hạn bên dưới.

|Mục|Trạng thái và căn cứ|
|---|---|
|Giữ checkout gốc/thay đổi local|ĐẠT:12.534 tệp,0 khác biệt; ORIGINAL_PRESERVATION_FINAL.json|
|Taste/UI giữ cấu trúc|ĐẠT phạm vi đã chụp12 màn hình/8 loại tài khoản; spacing/card/header/form/branding bổ sung đã phát hành PR47|
|Xóa UAT chủ hệ thống xác nhận|ĐẠT:146 dòng gồm chứng từ/nguồn/role/Auth/audit thử; CLEANUP_FINAL_READBACK.json|
|Hai race ứng trước|KHÔNG CHẠY LẠI; giữ bằng chứng600.000đ/400.000đ|
|Nâng cấp tương thích78→188|ĐẠT diễn tập cấu trúc/privilege; transaction Production đối chiếu mọi trường/khóa giữ lại|
|Dữ liệu doanh nghiệp giữ lại|ĐẠT phạm vi guard public/private/Auth thực; không tiền/kho/opening giả|
|Quyền API/Owner|ĐẠT:migration188/0DDL thừa/CRUD giữ/Owner62|
|Không chặn đầu kỳ/activation|ĐẠT:postingAllowed=true,canActivate=false,UNRECONCILED; browser vẫn cảnh báo lịch sử chưa đối chiếu|
|CI ứng viên và merge PR44/45|ĐẠT:e494/8f65 và079f/68903; CI sau merge68903 run38310446772 success|
|PR44/45 merge và Production|ĐẠT:PR45 merge68903/FxnSHk/đúng refnbwynrwkdbtfsitafsxa|
|HTTP/Auth/anonymous/RLS/log sau triển khai|ĐẠT đúng phạm vi POSTDEPLOY_HTTP_PR45/DB_PR45/LOGS_PR45; không suy toàn chức năng|
|Browser doanh nghiệp sau đăng nhập|ĐẠT bước đọc Tổng quan bằng Owner sau người dùng đăng nhập; chưa thay mọi vai trò bằng Owner|
|Sửa lỗi spacing do chủ hệ thống chỉ ra|ĐẠT đợt UI:CI head/merge623,32 cặp QA/16 màn hình,Production Owner17 quan sát; iteration-2/RELEASE_RESULT.json|
|Nghiệm thu toàn ERP/87 trang/24API/mọi vai trò|CHƯA TOÀN BỘ:giữ các ca chưa chạy trong SYSTEM_ACCEPTANCE_MATRIX; CI và UI không thay nghiệm thu nghiệp vụ|
|Backup/restore DB/tệp đích|MIỄN THEO CHỈ ĐẠO NGƯỜI DÙNG;KHÔNG THỰC HIỆN,không ghiPASS|
|GPS thiết bị/hóa đơn thật|HOÃN:DEFERRED/configfalse;không phát hành giả|
|Log/bằng chứng/recovery|CÓ HỒ SƠ; kết quả bản sửa spacing cập nhật khi chạy thực|

Phát hành UI và nghiệm thu toàn doanh nghiệp là hai phạm vi. Không ghi GO LIVE toàn phạm vi từ CI hoặc chỉ đăng nhập Owner.
