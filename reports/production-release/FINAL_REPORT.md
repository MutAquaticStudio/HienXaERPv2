# Kết quả phát hành hiện hành

PR44 và PR45 đã merge; main và Production hiện ở68903bb25b27ba4a87e500375d0186b82184e972. Deploymentdpl_FxnSHkLvfVdBAS8p3GgVM3AxyXva READY tại https://hien-xa-erp-v2-nu.vercel.app. CI38310446772 của chính merge SHA success; health khớp SHA. DEPLOYMENT_PR44/PR45 giữ hai lần phát hành để không lẫn artifact.

Đã dọn146 dòng UAT được xác nhận:SO-2026-000013,PO-2026-000010–000012 cùng nguồn liên quan, role thử không gắn nhân viên,8 Auth thử bị ban và audit nguồn. Owner/HX_OWNER/HX/MT/BS cùng2Auth giữ. Guard dữ liệu trong transaction đối chiếu mọi trường/khóa public/private/Auth giữ lại. Không reset sequence/tạo giao dịch/kho/tiền/opening/minh chứng giả. Hai race600.000đ/400.000đ không chạy lại.

Production đã nâng cấp tương thích nguồn78→canonical187 bằng forward+101migration đuôi, rồi migration188 thu hồi quyền DDL thừa ở37 bảng. Bundle compact chỉ bỏ SQL ledger trùng, không bỏ SQL thực thi; diễn tập đúng byte và đối chiếu cấu trúc/ACL. Lịch sử thực182/latest20261012211058; không đánh dấu8 version lịch sử chưa chạy thành đã chạy. CRUD/Owner62 giữ;6policyStorage quản lý của Supabase giữ. Không dùng số dòng làm bằng chứng duy nhất.

Không còn opening initializer; Owner được postingAllowed=true,canActivate=false,historicalUNRECONCILED,businessTotalVerified=false,recordedOperationsSince=null. Browser vẫn ghi rõ lịch sử chưa đối chiếu, không bắt nhập0/kích hoạt. Sao lưu/restore doanh nghiệp không thực hiện theo chỉ đạo “không cần sao lưu”; không ghiPASS và không hứa rollback DB sau commit. Xem RELEASE_AND_RECOVERY.md.

Sau deploy68903:11 kiểm HTTP/Auth/settings/anonymous boundary đạt, log5xx cửa sổ1h không có bản ghi, DB đọc lạihist182/Owner62/0SO/0PO/2Auth/0Storage. Chủ hệ thống đăng nhập thật; browser vào/admin bằng Owner và hiển thị dữ liệu Tổng quan. Đây là bằng chứng đọc theo Owner, không thay chứng minh mọi vai trò hoặc nghiệp vụ ghi sổ.

Chủ hệ thống chỉ ra hai khối Chi phí vận hành/Hoa hồng phải trả còn thiếu spacing. Nguyên nhân card-pad thiếu và wrapper không có gap với biểu đồ. Đã sửa lớp trình bày tối thiểu;15 ca component/CSS thực ở390/631/1280 đạt, có ảnh trước/sau. Tính toán/RPC/schema/quyền/nội dung giữ nguyên. Bản sửa đang chờ CI/merge/deploy; không ghi sửa Production thành đạt trước khi chạy. Xem ../ux-ui-refinement/dashboard-spacing/.

Chưa kết luận GO LIVE toàn ERP: bảng nghiệm thu87page/24API còn các ca chưa hoàn thành từ checkpoint. Bộ UI12 màn hình/8 loại tài khoản/luồng15→14→13 trong QA giữ đúng source/phạm vi; không ghi chúng thành giao dịch thử Production. GPS thiết bị/phát hành hóa đơn thật tiếp tụcDEFERRED/HX_EINVOICE_ENABLED=false.
