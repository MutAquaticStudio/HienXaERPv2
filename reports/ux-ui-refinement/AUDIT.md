# Khảo sát trước tinh chỉnh

Nền main e2a6393. Đã đối chiếu 24 cặp ảnh trước/sau: 12 màn hình ở desktop1280×900 và mobile390×844, cùng nguồn QA và tài khoản theo vai trò. BEFORE.json và AFTER.json ghi số cột, điều khiển, lỗi trình duyệt và dữ liệu ghi sổ không đổi trong khảo sát. Chờ bộ lọc và chi tiết dashboard tải xong trước khi chụp. Backend QA186 dùng hợp đồng tương thích; không coi schema này là Production78 hoặc canonical187 đã áp.

| Vấn đề nhìn thấy | Bằng chứng | Tinh chỉnh dự kiến | Cách xác minh |
|---|---|---|---|
| Bốn số tiền/chỉ số dài bị cắt trong dashboard quản lý sau khi tải đủ dữ liệu | before/manager-desktop-full.png; clippedMetrics4 | Xuống dòng trong ô hiện có; giá trị đã định dạng ngắt theo nhóm ba chữ số | clippedMetrics0; đủ chuỗi tiền; giữ số ô/thứ tự/màu/phông |
| Trường đối soát/đảo tiền chỉ có placeholder; ngày đối soát không có nhãn | before/finance-cashbook-desktop-full.png; unlabelledInputs | Nhãn nhìn thấy và liên kết label/input, dùngfield/controlstyle đang có | Tên trường/default/commandbutton không đổi; nhập rồi nhãn vẫn còn; keyboard/scroll region |
| Ba trường ở form gửi kết quả của điều phối có label chưa liên kết | before/dispatch-mobile-full.png | id/htmlFor ổn định theo chứng từ và form | Không còn input thiếu accessible name; payloadName/default giữ nguyên |
| Lượng thợ hiển thị15.000000/14.000000/14.000000 trong cùng đoạn dài | before/worker-mobile.png | Dùng formatter lượng hiện có; tách ba dòng chỉ dẫn trong cùng vị trí | Hiển thị15/14/14 đúng đơn vị; max14.000000,giá trị nhập/ràng buộc/JSON không đổi |
| Nút Đăng xuất của portal còn kiểu browser default | before/worker-desktop.png | Viền/khoảng cách theoportal tokenhiệncó | Cùng vị trí/hành động/nhãn; target48px/focus đúng |

Giữ nguyên: sidebar, nhóm/đườngdẫn, NotoSans, màu xanh admin và xanh portal, cột bảng/thứ tự, nút chính, quyền/serverguards, API/RPC/schema và cơ chế retry. Không áp dụng fontswap, bento, ảnh/motion/sidebar khác từ Taste. Không sửa phần đã tốt chỉ để tạo khác biệt.

Quan sát ngoài phần sửa: nhãn nguồn công nợ hiện là “Giao hàng đã xác minh” cùng tên công trình, chưa chứa mã phiếu giao. Không thay hợp đồng đọc hoặc nguồn khoản tiền trong đợt UI. Kịch bản nghiệm thu chọn đúng ID khoản công nợ qua API có xác thực rồi đối chiếu thứ tự hiển thị; không chọn chỉ từ nhãn trùng.
