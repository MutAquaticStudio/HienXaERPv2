# Kết quả phát hành UI và hệ thống hiện hữu

PR44 đã merge vào main:8f65d70f87703c54611487b828751a613a9e6ca6. CI đúng commit sau merge173 đạt. Vercel deployment dpl_G6k57Drjkh3cJuG9DHXFcY1rGKp1 đã READY/Production tại https://hien-xa-erp-v2-nu.vercel.app; health trả đúng8f65d70 và requiredMigration20261012155947. Mã UI, API, tính toán và luồng giữ đúng phạm vi đã kiểm chứng.

Đã xóa các SO/PO người dùng xác nhận UAT, branch thử,6 role không có nhân viên,8 Auth user miền thử đã ban cùng nguồn/receipt/audit liên quan. Owner/HX_OWNER/HX/MT/BS và2 Auth user còn lại giữ nguyên. Không reset sequence hoặc tạo tài chính/kho/minh chứng giả. Hai race600.000đ/400.000đ không chạy lại.

Nâng cấp Production thực từ78 nguồn đã áp dụng forward và101 migration đuôi trong một transaction. Gói lớn bị cổng quản lý từ chối trước chạy; gói nhỏ chỉ giảm SQL trùng trong metadata ledger, giữ SQL thực thi và guard dữ liệu; được diễn tập lại đúng byte. Cả trường/khóa cũ được đối chiếu trước commit. Backend feature187 có181 history do8 version lịch sử được thay cơ chế mà không ghi “đã chạy” giả và các maintenance được ghi thật.

Sau phát hành phát hiện37 bảng thừa quyền TRUNCATE/REFERENCES/TRIGGER/MAINTAIN cho anon/authenticated do default ACL của Supabase. Đã diễn tập tái hiện, thu hồi và thử bảng tạo về sau; migration188 bảo toàn SELECT/INSERT/UPDATE/DELETE. Production đọc lại0 quyền DDL thừa, Owner62 quyền giữ nguyên. Feature188/hist182; version20261012211058 ghi thật, không sửa history cũ. PR bổ sung chốt migration/nhật ký; không thêm RPC hoặc thay nghiệp vụ.

Định nghĩa303 hàm khớp thuộc tính/ACL canonical;5 body hash khác chỉ khoảng trắng ngoài chuỗi/identifier đã kiểm riêng.52 view/2171 cột/1260 constraint/382 index/111 trigger khớp.6 policy Storage có trên managed Production, native không có Storage service. Quyền service_role mặc định của nhà cung cấp được giữ; phần quyền ứng dụng vượt canonical đã thu hồi.

Không còn trigger khởi tạo opening pending. Read-only dưới UID Owner thật:postingAllowed=true,canActivate=false,historicalQuality=UNRECONCILED,businessTotalVerified=false,recordedOperationsSince=null. Không nhập0 hoặc tạo opening/activation. UID thật chưa có quyền:0branch/0customer/0employee. Đây là bằng chứng RLS/RPC ở DB; không thay bằng chứng đăng nhập HTTP/trình duyệt.

Kiểm HTTP: health,3 login,3 vùng bảo vệ,API không đăng nhập và Auth settings đúng dự án. Next16 chuyển trang theo streaming với HTTP200/meta redirect; API finance redirect307 khi chưa đăng nhập, không trả dữ liệu. Browser Production1280×900/390×844: có nội dung,0 overflow/overlay/console error; nút hiện/ẩn mật khẩu rỗng và chuyển cổng tác nghiệp phản hồi đúng. Ảnh trong screenshots/.

Bản Production đã triển khai; **chưa kết luận nghiệm thu toàn ERP/GO LIVE toàn phạm vi**. Thiếu phiên trình duyệt đăng nhập thật doanh nghiệp để đối chiếu các màn hình có quyền; yêu cầu tối thiểu đã gửi:đăng nhập trực tiếp tab Production, không gửi mật khẩu. Không tái tạo8 user UAT để coi là người dùng thật. Bằng chứng QA các vai trò/luồng15→14→13 giữ đúng phạm vi/source; không ghi thành lần chạy mới trên Production.

Sao lưu/restore doanh nghiệp không thực hiện theo chỉ đạo mới “không cần sao lưu”. Không ghi PASS khôi phục hoặc dùng backup QA thay thế; sau commit DB chỉ có phương án sửa forward nếu cần. Artifact ứng dụng cũ được ghi để xem xét promote khi tương thích. GPS thiết bị và phát hành hóa đơn thật hoãn; health thể hiệnDEFERRED,HX_EINVOICE_ENABLED=false, không phát hành.
