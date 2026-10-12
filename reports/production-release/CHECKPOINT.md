# Trạng thái chuẩn bị Production

CHƯA HOÀN TẤT phát hành. Yêu cầu hiện hành đã cho phép merge/deploy và dọn UAT trước đó. Các giới hạn “không merge/deploy” của đợt UI đã được người dùng thay thế; không bỏ điều kiện bảo toàn dữ liệu hoặc vượt quyền công cụ.

PR44 là bản ứng viên; sửa P2 freshness của harness và bổ sung15 Node test. Không sửa src/API/RPC/schema/nghiệp vụ, không replay hai race ứng trước.

Đích Vercel đang READY: dpl_EBjgf4qEUdv3BjnfqwECN4A32V8v, project prj_o6ya9YI1b3fTFC8nxiOtjHiwaS3W/team hienxa; cấu hình trỏ DB nbwynrwkdbtfsitafsxa. Chưa công bố SHA ứng dụng cũ. Schema hiện78, latest20261009224842; nguồn cần187. SCHEMA_PLAN.json chỉ là đối chiếu, không áp migration. Bridge native thử nghiệm trước đây không thay backup/restore dữ liệu đích và không dùng trực tiếp ở Production.

Một branch UAT có nguồn rõ ràng;4 chứng từ HX không có marker nên chờ phân loại (UAT_CLEANUP_PLAN.md). Chưa dọn bất kỳ dữ liệu doanh nghiệp nào, chưa merge, chưa deploy.

Supabase MCP đọc được catalog/inventory, nhưng CLI chưa có access token và chưa có DATABASE_URL/TLS Production để pg_dump và thử restore. Vercel SUPABASE_SECRET_KEY là biến sensitive: giá trị env pull là sentinel che bí mật, không phải căn cứ nói khóa thực sai. Không đổi/rotate key từ sentinel. Chỉ xác minh runtime/quyền của khóa thực khi có đường hợp lệ; không lấy key QA thay thế.

Đầu vào chắc chắn còn thiếu: DATABASE_URL có TLS của đúng DB (session pooler hoặc direct, quyền pg_dump) trong `/Users/nox/Downloads/HienXaERP-Production-Private-20261013/connection.env`; xác nhận4 chứng từ HX là thật hay UAT. Không đưa mật khẩu/token vào chat hoặc Git. Câu hỏi đã gửi; không coi thời gian chờ là câu trả lời.

Thứ tự còn lại: backup/restore thực → chốt và thử dọn đúng nguồn → cleanup Production có readback → diễn tập nâng cấp tương thích78→187 trên bản sao thực → review/CI đúng head → merge không bypass branch protection → đối chiếu merge → migrate và deploy đúng artifact → kiểm read-only theo vai trò/dịch vụ và bảo toàn dữ liệu. Không tạo giao dịch tài chính/kho thử trên Production. GPS thiết bị/hóa đơn thật tiếp tục hoãn đúng trạng thái.
