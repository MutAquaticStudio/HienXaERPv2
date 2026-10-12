# Dọn UAT đã thực hiện

Chủ hệ thống xác nhận SO-2026-000013 và PO-2026-000010–000012 đều là UAT; yêu cầu xóa trước merge/deploy và bỏ sao lưu.

| Phạm vi | Kết quả |
|---|---|
|SO1,PO3,dòng SO1,dòng PO3,allocation giao thẳng1|Đã xóa theo mã/trạng thái/nguồn cụ thể|
|Receipt6,audit chứng từ/branch6,branch UAT1,operational state1|Đã xóa đúng closure|
|uat_sales,uat_worker và9 quyền|Đã xóa;0 nhân viên tham chiếu|
|live_uat_finance,live_uat_proof_setup_b,live_uat_purchasing,live_uat_warehouse và39 quyền|Đã xóa;0 nhân viên tham chiếu;62 quyền Owner giữ nguyên|
|8 Auth user đã ban ở miền thử,8 identities,53 audit actor UAT|Đã xóa; không có nguồn nghiệp vụ hiện còn tham chiếu; session/refresh UAT dọn|
|Owner,HX_OWNER,HX,MT,BS và2 Auth user còn lại|Giữ giá trị/liên kết; không suy toàn master là thử|
|Storage/minh chứng|0 objects/0 evidence_objects/0 portal_evidence_objects/0 work_result_portal_evidence; không xóa tệp doanh nghiệp|

DML tìm ID từ natural keys, không hardcode ID phát sinh. Năm guard cấm xóa chứng từ thường chỉ đình chỉ trong maintenance transaction có khóa ghi; FK và trigger khác vẫn hoạt động. Khôi phục đúng định nghĩa/trạng thái trước commit. Sai count/thêm nghiệp vụ/khác dòng giữ lại phải rollback. Không TRUNCATE,reset sequence,sửa số dư hoặc tạo opening.

Mã/bằng chứng: UAT_CLEANUP.sql,UAT_AUTH_CLEANUP.sql,UAT_REMAINING_ROLES_CLEANUP.sql,UAT_CLEANUP_RESULT.json,CLEANUP_FINAL_READBACK.json. Email/mật khẩu không đưa vào PR. Auth audit/log hạ tầng Supabase giữ nguyên.

Hai race ứng trước không chạy lại: package4-advance-race.mjs --mode different-intents và --mode same-intent. Giữ bằng chứng600.000đ/400.000đ trong hồ sơ QA.
