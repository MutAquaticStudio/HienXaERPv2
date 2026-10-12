# DOD phát hành

**CHƯA HOÀN TẤT. Chưa đủ cổng merge hoặc triển khai.** Checkpoint này sẽ cập nhật khi hoàn tất phần còn lại.

| Điều kiện | Trạng thái | Căn cứ/phần còn thiếu |
|---|---|---|
| Checkout gốc và local được bảo toàn | ĐẠT hiện tại |79b0b91,61 tracked/67 untracked; bản sao riêng và tích hợp111 tệp |
| Phiên bản thống nhất đã nghiệm thu | CHƯA |PR42+forward175–177 đã tích hợp; toàn bộ danh mục còn thiếu |
| Lỗi đã nêu và lỗi mới được xử lý | ĐẠT các lỗi xác minh |Thực lấy, Finance reader, tiền portal, phục hồi FormData; tiếp tục ca còn lại |
| Luồng chuẩn/ngoại lệ theo vai trò trên trình duyệt | ĐẠT phạm vi đã chạy |15→14→13; multi-UOM; service; đổi người; revoke/reactivate. Không suy toàn bộ biến thể |
| Toàn bộ phân hệ phát hành được nghiệm thu | CHƯA |87page/24API;46admin và18portal lượt đọc không chứng minh mọi thao tác |
| Kho/nguồn/vốn/nợ/thu chi khớp | ĐẠT phạm vi đã chạy |Standard/multi readback; G16/G09 cũ có phạm vi riêng |
| Quyền/rollback/retry/phiên bản | ĐẠT phạm vi đã chạy |26seams; stockrace mới; saved-receipt retry; lost-response nhiều dòng; đổi người/revoke |
| Bỏ đầu kỳ/kích hoạt và pending opening vận hành | ĐẠT ứng viên |PENDING,activationNULL,0opening; nhãn lịch sử chưa đối chiếu; chưa Production |
| Không tạo số dư lịch sử giả | ĐẠT |Nguồn mới hợp lệ, không opening/activation để vượt gate |
| Nâng cấp/phục hồi và bảo toàn dữ liệu | ĐẠT QA; CHƯA đích |Cloud forward giữ hash; native122 bảng;fresh177/289hàm. Chưa Production78→ứng viên |
| CI đúng ứng viên và sau merge | CHƯA |Local602unit/8Node/type/lint/build đạt; cần CI commit mới; chưa merge |
| Triển khai đúng môi trường/phiên bản | CHƯA |Chưa xác nhận URL, credentialbackupDB/secret máy chủ hợp lệ |
| Kiểm chứng sau triển khai | CHƯA |Chưa artifact/schema mới trên doanh nghiệp |
| Nhật ký/bằng chứng/phục hồi/bàn giao | ĐANG HOÀN THIỆN |Đã có tệp; kế hoạch không thay diễn tập đích |
| GPS/hóa đơn hoãn thể hiện đúng | ĐẠT ứng viên |GPS chưa khả dụng/start-ping501; hóa đơn internal không issued |

Hai race `package4-advance-race.mjs` modes`different-intents`/`same-intent` không chạy lại. Giữ600.000đ phân bổ/400.000đ còn/một phiếu tiền.


Checkpoint179: AuthbannedJWT vàroster duplicate/crossbranch đãsửa cóproof thật; T30literal/T41largejobđạt. Type/lint/build179đạt, cầnCIhead mới. Native/fresh179292functions/ACL/view/policykhớp,CloudQA180history giữdata. Các điều kiệnProduction/đích/fullacceptance chưa thay đổi; CHƯA HOÀN TẤT.
