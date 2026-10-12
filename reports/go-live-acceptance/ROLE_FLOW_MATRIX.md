# Vai trò và luồng nghiệm thu

**CHƯA HOÀN TẤT toàn bộ phát hành**. Đây là kết quả ứng viên/nativeQA177 + AuthQA thật; không thay cấu hình Production.

| Vai trò | Luồng thực | Kết quả/bằng chứng |
|---|---|---|
|Bán hàng|Tạo/xác nhận SO, tải lại tiến độ sau kho/thợ/kế toán|PASS standardBrowser; BROWSER_SOURCE_FLOW176.json|
|Mua hàng|Tạo/xác nhận PO, phân nguồn kho, giá mua khác giá bán|PASS standardBrowser|
|Kho/Điều phối cùng ngườiQA có quyền|Nhận10+5, giữ15, phân người/xe, publishWork, lấy14, verify13 kèm lý do|PASS standardBrowser; không suy quyền mọi nhân viên|
|Thợ|Nhận đúngwork, start/báo14 dướimax14, không sửa tiền/vốn; người cũreadredirect/startdenied sau chuyển|PASS standard + BROWSER_BOUNDARIES177.json|
|Kế toán|Thu1m vào AR2990000, dư1990000; đọc khoản trả bằngguardedbranchreader|PASS standard + FINANCE_READER176.json|
|KháchRECEIVER|Theo đơn riêng, không tiền/vốn; sai khách bị chặn|PASS standard + boundaries|
|KháchFINANCE_CONTACT|Đọc tiền/công nợ riêng, JSONinteger strings khôngfloat|PASS standard + PORTAL_MONEY177.json|
|Quản lý|Lập lịchdịch vụ, thợthực hiện1giờ, quản lýverify tạoAR500000 một lần, khôngcashmới|PASS BROWSER_SERVICE177.json|
|Bán hàng/Mua hàng/Kho/Thợ|SO nhiều dòng3m³ +2bao25kg; nguồn PO đúng từng vật tư; tải xe dựa quy đổi có căn cứ QA; báo giao/verify từng dòng|PASS BROWSER_MULTI_DELIVERY_RESUME177.json; PO setup dùng RPC chuẩn, SO/phân nguồn/giao/thợ/verify dùng UI|
|Thợ và máy chủ|Mất phản hồi sau lưu, retry đúng ý định nhiều dòng|PASS: một kết quả giao, một xác minh; cùng bằng chứng multi-delivery|
|Quản lý/Thợ|Thu hồi quyền qua UI khi phiên thợ đang mở, đọc/start bị chặn; khôi phục cùng quyền và đọc lại|PASS BROWSER_ROLE_LIFECYCLE177.json; không thay Auth hoặc quyền Production|
|Thợ/RECEIVER/FINANCE_CONTACT|18 lượt đọc trang pool/earnings/messages/profile/tracking, đơn/báo giá/công nợ theo đúng vai trò|PASS_READ BROWSER_ROLE_LIFECYCLE177.json; không gọi đây là nghiệm thu mọi thao tác tại các trang|

Cấu hìnhQAclone rolesPurchasing/Warehouse/Finance bổ sungorders.read theo hợp đồng màn hìnhnguồn như managedQA, không quyền tiền/vốn/ghi mới. Workerchỉwork.read/work.claim. OriginalQA/Production rights untouched. Matrix toàn màn hình vàca cấm/lifecycle thêm đang thực hiện.
