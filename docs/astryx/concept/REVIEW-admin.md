# REVIEW R1 – ADMIN 1280px (58 màn đã xem)

Phương pháp: persona walkthrough (3 nhân vật: NV bán hàng chốt đơn qua điện thoại; thủ kho/điều phối; kế toán thu tiền cuối ngày) + finish-gate (chặn giao diện chung chung). Đã tự cộng/trừ lại các tổng tiền và số lượng trên từng màn.
Quyết định finish-gate: **HOLD** (còn 7 mục Chặn, chủ yếu là số liệu mâu thuẫn giữa các màn và vài lỗi nghiệp vụ). Hình khối/phân cấp từng màn nhìn chung tốt; phần "generic" nằm ở bộ danh sách và KPI (xem mục HỆ THỐNG).

Màn đã xem: admin-order-new, order-edit, order-detail, order-approve, order-import, orders, customers, customer-360, customer-manage, customer-portal-account, po-new, po-detail, purchase-orders, supplier-detail, supplier-pricing, product-pricing, products, product-detail, inventory, transfer-new, transfer-detail, stock-count-detail, warehouses, dispatch, dispatch-resources, routes, deliveries, delivery-detail, delivery-split, delivery-cancel, receivables, receivable-detail, payables, payable-detail, payment-notices, cashbook, expenses, payroll, payroll-detail, compensation, attendance, obligations, reports, dashboard, matching-detail, purchase-return-new, service-jobs, service-job-detail, operations, notifications, messages, access, quotations, settings-pricing, settings-automation, settings-ai, ai, command-palette, public-login.

---------------------------------------------------------------------
## CHẶN (7)
---------------------------------------------------------------------

**C1 · admin-delivery-detail** – Phiếu PG-0115 đang "Chờ xác minh" (đã giao xong) nhưng vẫn hiện nút "Tách phiếu" và "Hủy phiếu". Quy tắc: chỉ tách khi Chờ phân giao/Đã phân giao và việc chưa bắt đầu; chỉ hủy khi chưa lấy hàng lên xe. Cách sửa: ẩn cả hai nút ở trạng thái Chờ xác minh/Đã xác minh; ở Chờ xác minh chỉ còn "Xác minh và ghi công nợ" (hoặc "Ghi nhận hao hụt").

**C2 · admin-payables** – Công nợ phải trả sai nguồn. "Xi măng Hoàng Thạch 62.000.000" khớp PO-0088 còn "Đã đặt" (chưa nhận hàng); "Thép Hòa Phát 148.500.000" = cả PO-0087 trong khi po-detail và supplier-detail ghi chỉ đã ghi nợ 98.100.000 (phần nhận), 50.400.000 chưa nhận. Vi phạm "chỉ phát sinh khi đơn mua nhận hàng". Sửa: số liệu theo phần đã nhận (Hòa Phát 98.100.000, bỏ/ghi 0 cho Hoàng Thạch hoặc đổi PO-0088 sang Đã nhận).

**C3 · admin-receivables (+ receivable-detail, customer-360, customers, dashboard)** – Công nợ phải thu mâu thuẫn giữa 5 màn, kế toán không tin được:
- receivables: Bảo Long 45.600.000 "Trong hạn", hạn 25/11; nhưng receivable-detail: 30.400.000 quá hạn (2 khoản), hạn gần nhất 02/11; dashboard: Bảo Long quá hạn 30.400.000 · 18 ngày; customer-360: quá hạn 1–30 ngày chỉ 18.400.000, trong hạn 27.200.000.
- Hạn mức Bảo Long: 100.000.000 / 46% (receivable-detail) so với 200.000.000 / 23% (customer-360, order-new, customer-manage).
- KPI receivables "73.350.000 từ 41 khách" bằng đúng tổng 4 dòng đang hiện (18,4 + 45,6 + 7,2 + 2,15); customers: "41 khách còn nợ, tổng 312.450.000"; reports: còn phải thu 73.800.000. Quá hạn "18.400.000 · 7 khách" nhưng danh sách chỉ có 1 dòng quá hạn.
Sửa: chốt một bộ số minh họa duy nhất (Bảo Long hạn mức 200 tr, quá hạn 30,4 tr; Cô Hoa quá hạn 18,4 tr → tổng quá hạn 48,8 tr như dashboard) và dùng lại ở mọi màn; chip Bảo Long trong receivables phải là "Quá hạn 18 ngày".

**C4 · admin-order-approve** – Thẻ "Quy tắc tự duyệt" hiện công tắc "Không tự duyệt khi vượt hạn mức nợ" ở trạng thái TẮT, trái D79/D88 và trái banner của settings-automation ("Hệ thống không bao giờ tự duyệt đơn khi vượt hạn mức nợ"). Sửa: bỏ công tắc này (hoặc hiện là dòng khóa, luôn bật, có biểu tượng ổ khóa); không cho đổi cấu hình hệ thống ngay trên màn duyệt đơn, chỉ để liên kết "Cài đặt".

**C5 · admin-obligations** – Dòng "Công ty Minh Phát · Long Biên · Phải trả · 22/11 · 7.200.000" sai chiều: Minh Phát là khách (receivables: phải thu 7.200.000). Sửa: loại "Phải thu"; thêm cột Loại có màu/dấu riêng (thu xanh dương, trả cam) để kế toán khỏi nhầm.

**C6 · admin-order-detail** – Trạng thái đơn tự mâu thuẫn và dùng nhãn ngoài bộ trạng thái: chip "Đã xác nhận" + "Thực hiện: Đang thực hiện", trong khi bước tiến trình đang ở bước 3 "Đang giao" và danh sách đơn (orders) cũng ghi SO-0231 "Đã xác nhận". "Đang thực hiện" không thuộc Nháp/Đã xác nhận/Đang giao/Hoàn tất/Đã hủy. Sửa: một chip duy nhất khớp stepper (đã có phiếu đang giao → "Đang giao"); bỏ dòng "Thực hiện:"; nếu muốn giữ tiến độ giao thì diễn đạt "Đã giao 2/5 dòng" bằng chữ thường, không dạng chip trạng thái.

**C7 · admin-inventory** – (a) "Tổng tồn kho 25.756" là tổng 1.240 + 86,5 + 412 + 24.000 + 18 = 25.756,5 bị cắt/làm tròn (vi phạm "không tự làm tròn") và cộng lẫn bao, m³, cây, viên (vô nghĩa). Tương tự "Có thể bán 18.776" (thực 18.776,5). (b) Bộ lọc/đếm sai: "4 kết quả", "Tất cả kho 4", "Hiển thị 1–5 trên 4" trong khi hiện 5 dòng ở 3 kho. (c) Số mâu thuẫn product-detail: Xi măng PCB40 @Đại Mỗ ở inventory = tồn 1.240 / chờ 200 / đã hứa 180 / bán 860, ở product-detail = 1.600 / 260 / 100 / 1.240; tên "PC40" thay "PCB40". Sửa: bỏ KPI tổng gộp hoặc thay bằng đếm "Mặt hàng dưới mức tối thiểu/đã hứa vượt tồn"; giữ số lẻ; đồng bộ dữ liệu với product-detail; sửa đếm.

---------------------------------------------------------------------
## NÊN SỬA (39)
---------------------------------------------------------------------

**N1 · admin-dashboard** – Việc cần xử lý nằm cạnh/sau 7 thẻ KPI cùng trọng lượng (đỏ flag "equal-weight metric cards"); brief yêu cầu việc cần xử lý đặt trước số liệu. Thẻ "Phiếu giao kẹt 0" chiếm chỗ đầu hàng chỉ để báo "0". Tiêu đề "Tổng quan hôm nay" nhưng bộ chọn đang là "7 ngày". "Phiếu chờ xác minh 1" lệch deliveries (Chờ xác minh 2). Sửa: dải "Cần xử lý" full-width trên cùng (4 việc, nút Mở); ẩn thẻ có giá trị 0 hoặc gộp thành một dòng "Không có phiếu kẹt"; đổi tiêu đề theo kỳ.

**N2 · admin-orders** – Số đếm lọc cộng lên 188 (3+12+5+160+6+2) ≠ 186. "Hiển thị 1–7 trên 186 · 20 dòng mỗi trang" (7 dòng ≠ 20). Hàng mở rộng SO-0231 lệch hoàn toàn với order-detail: 3 dòng so với 5, "Xi măng PC40" vs "PCB40", "Thép phi 10 CB300"/"Cát xây" vs Thép phi 16/Cát vàng, công trình "Nhà phố Hà Đông" vs "CT Hà Đông – Nhà xưởng Lô B", chip "Chờ phân giao" trong khi hàng là "Đã xác nhận". Nhãn "Khách đặt · Chờ duyệt" xuống 2 dòng làm lệch cột đếm. Sửa dữ liệu mẫu cho khớp; rút nhãn thành "Chờ duyệt (khách đặt)" hoặc để chip nhỏ, nhãn 1 dòng.

**N3 · admin-command-palette** – SO-0231 gắn nhãn "Đã duyệt" (nhãn dành cho cổng khách), admin phải là "Đã xác nhận"; SO-0230 chỉ "Chờ duyệt" thiếu "Khách đặt ·". Ngày giao 21/11 (SO-0231), 21/11 (SO-0230), 20/11 (SO-0229) lệch với order-detail/approve/orders (20/11, 20/11, 19/11).

**N4 · admin-order-edit** – Banner xung đột phiên bản (bạn đang ở v3, bản mới là v4) nhưng nút xanh "Xác nhận đơn" và "Lưu nháp" vẫn sáng, "Tải lại đơn" là nút xám nhỏ. Sửa: vô hiệu hóa/mờ hai nút ghi cho tới khi tải lại; "Tải lại đơn" thành nút chính. SO-0232 hiển thị y hệt SO-0231 (Bảo Long, 5 dòng) còn dashboard ghi SO-0232 là Minh Phát 6.900.000.

**N5 · admin-order-new / order-edit** – (a) "Còn phải thu 35.000.000" màu cam (cam = cảnh báo) cho số bình thường; dùng ink đậm hoặc xanh dương. (b) Nhãn nguồn giá "Khách + Vật tư"/"Khách + Nhóm vật tư" tô xanh lá (xanh lá chỉ cho hành động tiền) – đổi sang xanh dương nhạt/xám, phân biệt bằng nhãn. (c) Bố cục cho NV nghe điện thoại: ô tìm hàng ở trái, chọn khách ở cột phải (khách phải chọn trước); thiếu SĐT/người liên hệ của khách ngay dưới tên khách; gợi ý: đưa khối khách lên trên bảng hoặc đặt tab-order bắt đầu ở khách.

**N6 · admin-po-new / po-detail** – Mâu thuẫn lịch và trùng đơn: PO-0087 "Dự kiến giao hết 21/11" nhưng dòng NCC giao thẳng cho SO-0231 giao 20/11 (PG-0419); PO-0087 "Ngày đặt 17/11" trước khi SO-0231 được tạo (nhật ký tạo 19/11 16:05); po-new lại liên kết đúng "SO-0231 · dòng 2" (60 cây thép phi 16) mà PO-0087 đã đặt cho dòng này. Sửa dữ liệu mẫu; cảnh báo trùng liên kết khi dòng bán đã có PO.

**N7 · admin-supplier-pricing** – Ô "Rẻ nhất" tô xanh lá bị tràn khỏi hàng (cao hơn hàng, đè đường kẻ), ô đầu cột Hòa Phát rộng lệch hơn các cột khác; xanh lá dùng làm nền đánh dấu không phải hành động tiền. Ô giá không có dạng ô nhập nên không rõ "sửa tay" ở đâu dù có nút chính "Lưu bảng giá". Hàng "Thép buộc 1 ly" có 2 ô "Chưa có giá" cùng lúc làm rối. Sửa: nền xanh dương nhạt (hoặc chữ đậm + dấu ✓) giới hạn trong ô, thêm biểu tượng bút/ô nhập khi hover; nút "Lưu bảng giá" chỉ sáng khi có thay đổi.

**N8 · admin-product-pricing** – Banner lỗi nền hồng đậm quá chói, chiếm trọng tâm hơn cả bảng; ô chọn "Giá chung / Giá nhóm giá" khó thấy trạng thái chọn (viên trắng trên nền xám nhạt); ô "Lý do" cao 80px gần như trống; "Lưu bảng giá" vẫn sáng khi có dòng lỗi (nên khóa); phần trăm tăng giá tô xanh lá (tăng giá bán không phải "tốt/hoàn tất"). Sửa: banner đỏ nhạt viền trái đậm; segmented có viền xanh; textarea 2 dòng; % tăng dùng xanh dương/ink, giảm dùng cam.

**N9 · admin-transfer-new** – Đang ở bước 2/3 nhưng nút chính "Xuất chuyển kho" (= bước 3) đặt ở góc trên, xa danh sách; bước 3 trên stepper trùng tên nút. "Có thể bán 1.240 / 420 / 86" khác inventory (860 cho xi măng). Sửa: nút chính dính đáy bảng hoặc cột phải "Tóm tắt phiếu chuyển"; đổi nút thành "Tiếp tục: Xác nhận xuất" rồi bước 3 mới là "Xuất chuyển kho".

**N10 · admin-stock-count-detail** – "Hủy phiếu kiểm" (nền hồng đỏ, lớn) nổi hơn "Lưu tạm" (xám, nhỏ); "Cân bằng kho" luôn sáng dù còn 2 vật tư chưa đếm và 1 dòng chưa có lý do (nên mờ kèm tooltip lý do). Cột lý do: dòng có sẵn hiện chữ thường, dòng thiếu hiện ô — không nhận ra ô nào nhập được. Sửa: Hủy chuyển vào menu "⋯"; ô lý do luôn là input.

**N11 · admin-dispatch** – (a) Hai nút chính xanh cùng lúc: "Gán nhanh" trên đầu trang và "Gán nhanh" xanh trong thẻ PG-0120 (vi phạm tối đa 1 nút chính; thẻ PG-0121 lại xám). (b) PG-0121 hiện ô cảnh báo cam viết "Kho Đại Mỗ còn đủ hàng" – màu cảnh báo nhưng nội dung tốt, nút Gán nhanh bị xám không rõ vì sao; chắc ý là "chưa đủ hàng". (c) Dữ liệu lệch các màn khác: PG-0121 ở đây "Chờ phân giao", 2 m³ cát + 3.000 viên gạch; delivery-split ghi PG-0121 "Đã phân giao", 40 bao xi măng + 6 m³ cát + 3.000 viên; PG-0115 ở đây là Bảo Long 3 m³ đá (Đang giao), còn delivery-detail PG-0115 là Cô Hoa gạch (Chờ xác minh) và deliveries ghi PG-0115 "NCC giao thẳng"; routes ghi PG-0118 "đang tới điểm 1" trong khi cột là Đã phân giao. (d) Viền trái cam giống hệt cho cả hai thẻ Chờ phân giao nên không phân hạng gấp (thẻ hẹn 14:00 vs 15:30). Sửa: chỉ giữ nút ghost "Gán" trong thẻ, nút chính duy nhất trên đầu; đổi chữ cảnh báo thành "Thiếu 3 m³ tại Kho Đại Mỗ"; thống nhất mã phiếu.

**N12 · admin-delivery-detail** – Số "Ghi công nợ 8.687.500 ₫" không truy ra được từ bảng dòng giao (bảng không có đơn giá/thành tiền); xác minh hao hụt 50 viên "chờ duyệt" nhưng đã cho ghi nợ. Ảnh bằng chứng là ô gradient trống (nhìn như mẫu hỏng). Sửa: thêm cột Đơn giá + Thành tiền và dòng tổng; trừ rõ hao hụt; dùng ảnh/thumbnail thực hoặc ô placeholder xám có biểu tượng và chú thích "Ảnh minh họa".

**N13 · admin-delivery-split** – Phiếu 2/3 chỉ hiển thị "Hẹn 08:00 ngày 21/11" nhưng không sửa được; tách phiếu thường để giao ở ngày/khung khác nhau. "Phiếu 1 giữ lại" ghi 20/3/1.500 là ô xám nhưng cùng trông như input (cần nhãn "Tự tính"). Sửa: thêm ô ngày/khung giờ cho mỗi phiếu mới; ô Phiếu 1 hiển thị dạng chữ + nhãn "phần còn lại".

**N14 · admin-delivery-cancel** – Hộp thoại ghi "Hủy phiếu giao PG-0120? Anh Tuấn · Cầu Giấy · 15 bao xi măng" nhưng nền phía sau là PG-0120 của "SO-0229 · Cô Hoa · Hà Đông", dòng giao Xi măng PCB40 40 bao. Hộp thoại phá hủy mà sai đối tượng là rủi ro cao. Thêm: dòng cảnh báo trong hộp thoại cỡ ~13px, nên ≥14px.

**N15 · admin-receivable-detail** – Hạn mức 100.000.000/46% (xem C3). Ngày giao + 30 ngày không ra hạn: 05/10→02/11 (28 ngày), 12/10→10/11 (29 ngày). PT-0213 ngày 17/11 nhưng cashbook ghi 18/11. Hộp "Ghi phần dư 400.000 là tiền ứng trước" tích sẵn — hành vi phụ nên mặc định bỏ tích hoặc hiển thị rõ hơn. Ô "Tự phân bổ lại" là dải xám nhạt phẳng, trông như nhãn. Chip hình thức thu "Tiền mặt / Chuyển khoản QR" nhỏ, trạng thái chọn yếu.

**N16 · admin-cashbook** – Bộ chọn kỳ "Hôm nay / 7 ngày / Tháng này" chữ ~12px (dưới 13); chip cam "2 giao dịch" chữ trắng/đen nhỏ ~12px; phân trang dạng chữ "‹ Trước · 1 · 2 · 3 · Sau ›" khác kiểu nút ở mọi màn khác. Giao dịch chờ xử lý (5 tr NGUYEN VAN A…, 12 tr CT DEN SO0231…) khác danh sách của payment-notices (12 tr NGUYEN VAN A TT SO0231; 50 tr MINH PHAT); PC-0098 ngày 20/11 nhưng payable-detail ghi 19/11. Bốn thẻ trên cùng trọng lượng ngang nhau (2 số dư + thu + chi) → nhóm lại: số dư là phụ, thu/chi so kỳ làm chính.

**N17 · admin-payroll-detail** – Bảng lương tháng 10/2026 mà trạng thái "Đang tính", 5 nhân sự / 44.840.000, trong khi payroll (danh sách) ghi 10/2026 "Đã chi trả" 138.500.000 (12 NV) và 11/2026 mới là Đang tính. Dải "Phiếu lương Trần Văn Minh…" tràn thành hai dòng, "Cộng 9.200.000 ₫" rơi xuống dòng riêng lẻ loi (trông như bị lỗi). "Điều chỉnh −200.000" không thấy lý do (bắt buộc). Chip tên có avatar chữ 9–11px. Tính toán các dòng đã kiểm: khớp (44.840.000; 42 chuyến × 50.000 = 2.100.000; 8 việc × 120.000 = 960.000).

**N18 · admin-payroll (danh sách)** – Cột "Số nhân viên" căn trái (phải căn phải); "Đang tính" và "Đã chốt" cùng chấm xanh dương trong bộ lọc nên không phân biệt.

**N19 · admin-compensation** – Tài xế "Tiền chuyến 120.000 ₫" nhưng payroll-detail tính 50.000 ₫/chuyến (600.000 ÷ 12, 1.050.000 ÷ 21); trang tiêu đề "Thu nhập" lạ (menu là Đơn giá công), có nút xanh lá "Tính lương tháng" không thuộc trang này nhưng thiếu "Thêm đơn giá/Ngày hiệu lực". Sửa đơn giá/tiêu đề; đổi nút chính thành "Thêm đơn giá" (xanh dương).

**N20 · admin-customers** – KPI "Khách còn nợ 41 – Tổng 312.450.000" lệch receivables 73.350.000; Bảo Long nợ 45.600.000 không đỏ dù đang quá hạn; "Thêm khách" tô xanh lá (không phải hành động tiền → xanh dương); không có mũi tên "Xem nhanh" đầu dòng (brief); 3 thẻ KPI trọng lượng ngang, thanh màu trên cùng chỉ trang trí.

**N21 · admin-products** – "Thêm vật tư" xanh lá (đổi xanh dương); Tồn 1.240 (đúng là Có thể bán) khác product-detail (1.600 tại Đại Mỗ / 2.400 tổng); "PC40" vs "PCB40"; Sơn Dulux tồn 0 nhưng inventory ghi 18 trên xe; bộ lọc có trạng thái Đang bán/Hết hàng/Ngừng nhưng bảng không có cột trạng thái (chỉ số 0 đỏ).

**N22 · admin-access** – "Thêm người dùng" xanh lá; trang tên Phân quyền nhưng không thấy quyền/vai trò chi tiết (chỉ bảng người dùng); "Chi nhánh: Đại Mỗ" là tên kho; tên "Lê Thị Lan" ≠ "Nguyễn Thị Lan" (order-edit, settings-automation, payroll); lọc "Chủ cửa hàng" nhưng cột ghi "Chủ".

**N23 · admin-messages** – Chỉ là bảng 3 cột (người gửi/nội dung/giờ); thiếu khung trò chuyện và ô trả lời nên không dùng như "hộp thư" (template Messaging Inbox). Sửa: chia 2 khung (danh sách hội thoại + luồng chat) với ô nhập ≥15px.

**N24 · admin-notifications** – Lọc "Chưa đọc 5" nhưng chỉ có 3 dòng chấm xanh (chưa đọc) + 1 dòng đã đọc ("Đã nhận chuyển kho CK-0029"), tổng 4 dòng. Thiếu nút "Mở"/liên kết và nội dung phụ; tiêu đề thông báo trần, không có loại.

**N25 · admin-matching-detail** – Đối chiếu "HĐ 0001234 – Cát Sông Hồng – PO-0085", nhưng purchase-orders: PO-0085 là Gạch Đồng Tâm 38.700.000; Cát Sông Hồng là PO-0086 24.300.000; tổng 64.800.000 không khớp; purchase-return-new dùng PO-0086 (Cát Sông Hồng, 100 m³ cát vàng, đơn giá 340.000). Số học trong bảng đúng (34,0 + 16,8 + 14,0 = 64,8; chênh +1.000.000). Sửa mã PO.

**N26 · admin-service-job-detail** – DV-0045 đang "Chờ xác minh" (đã làm xong) nhưng vẫn có "Hủy việc" và "Đổi người làm"; danh sách service-jobs ghi DV-0045 "Đã lên lịch · 21/11" còn chi tiết "Chờ xác minh · hẹn 20/11 08:30". Sửa: ẩn hai nút khi Chờ xác minh; thống nhất trạng thái.

**N27 · admin-payable-detail** – "Mặc định là số còn phải trả của đơn cũ nhất" nhưng ô đang điền 24.350.000 và lý do "Trả đơn PO-0052" (đơn mới hơn PO-0049 31.000.000). Ô số tiền chi viền đỏ + chữ đỏ như trạng thái lỗi trong khi không có lỗi (đỏ = lỗi/xóa). Sửa: viền xanh dương khi focus, chữ ink; dùng đỏ chỉ ở cột Chi của sổ quỹ.

**N28 · admin-warehouses** – Hai công tắc "Dùng làm kho mặc định" độc lập cho từng kho cho phép bật nhiều kho mặc định; phải là radio một lựa chọn. Chip "Kho mặc định" xanh lá (không phải hành động tiền) → xanh dương.

**N29 · admin-payment-notices** – "BAO LONG TT SO0228" nhưng SO-0228 là đơn của Minh Phát; phân trang giả (xem N35).

**N30 · admin-order-approve** – Hộp thoại "Từ chối đơn" nổi lên không có lớp mờ, che luôn cột Tiến trình; nút "Không từ chối" xám đặc còn "Từ chối đơn" viền đỏ nền trắng (hai kiểu nút phụ khác nhau trong cùng khung). Sửa: dùng modal có lớp mờ hoặc popover gắn vào nút "Từ chối".

**N31 · admin-order-detail (bổ sung)** – Vẫn có nút "Hủy đơn" tô hồng nổi dù PG-0417 đã "Đã xác minh" (đã ghi công nợ); cần chặn/giải thích hoặc chuyển vào menu "⋯". Tổng tiền lặp 3 lần (Tổng cộng đơn dưới bảng, Tổng cộng ở cột phải, Còn phải thu). Cột "Đã giao" có chữ trạng thái ~13px xám rất nhạt + thanh tiến độ xám nhạt khó thấy.

**N32 · admin-operations** – Hàng đợi sự cố chỉ có 2 dòng, cả hai cùng chip "Cần kiểm tra lại", không có thời điểm, tuổi, lý do hay lỗi; không đủ để "Incident Console". Thêm cột "Phát sinh lúc", "Lý do" và mức độ.

**N33 · admin-customer-manage** – Danh sách số điện thoại tạo hàng loạt chứa 0912 000 111 — chính số đang bị báo "Đăng ký trùng" ở khung dưới; ô số tiền "Hạn mức nợ 200.000.000" căn trái; công trình mặc định vẫn có biểu tượng thùng rác (xóa công trình mặc định?).

**N34 · admin-settings-pricing** – Ô "Hạn mức nợ mặc định" căn trái; nhãn phụ "Áp cho khách chưa đặt riêng." cỡ ~12–13px; ghi "Từ hôm nay trở đi" nhưng ngày hiệu lực là 21/11 (mai); ô "Lý do thay đổi" đặt dưới bảng giá bán, xa phần được sửa — dễ lỡ nhập. Sửa: lý do đặt ngay dưới 3 ô nhập hoặc thanh lưu dính đáy.

**N35 · HỆ THỐNG – phân trang giả trên hầu hết danh sách** (payment-notices, expenses, payroll, attendance, obligations, operations, access, compensation, notifications, messages, deliveries, orders, purchase-orders, receivables, payables, service-jobs, products, customers): chân bảng "Hiển thị 1–4 trên 4 · 20 dòng mỗi trang" nhưng vẫn hiện nút trang 1 2 3; nhiều nơi tổng > số dòng hiện (receivables 1–4 trên 41, payables 1–3 trên 6) không có đường xem tiếp. Sửa: dữ liệu mẫu đủ 20 dòng hoặc ẩn trang thừa; số trang = ceil(total/20).

**N36 · HỆ THỐNG – giao diện "của sản phẩm nào cũng được"** – ~25 màn danh sách dùng cùng khuôn (ô tìm + radio đếm số, bảng, avatar chữ cái tròn, phân trang), thêm 3 thẻ KPI ngang nhau có thanh màu viền trên (inventory, customers, receivables, attendance, dashboard). Chi tiết nghiệp vụ (hạn nợ, hết hàng, trễ giờ…) không nổi lên qua phân cấp. Avatar chữ cái cho NCC/khách làm tăng nhiễu mà không cung cấp thông tin. Gợi ý: (1) mỗi danh sách chọn 1 cột "quyết định" làm điểm nhấn (tuổi nợ, ngày giao, tồn thấp); (2) bỏ avatar ở danh sách NCC/khách, hoặc thay bằng biểu tượng loại; (3) chỉ giữ thẻ KPI khi có thao tác kèm theo và để 1 thẻ nổi trội (quá hạn) thay vì 3 thẻ ngang nhau; (4) mặc định "Sắp xếp" phải hợp nghiệp vụ (công nợ: hạn gần nhất/quá hạn lâu nhất; không phải "Mới nhất").

**N37 · admin-routes** – Bản đồ là lưới đường giả (minh họa, không nhận ra là bản đồ thực), chấm "Xe tải nhỏ" nằm cạnh tuyến; chip "3 xe" chữ ~12px; PG-0118 "đang tới điểm 1" mâu thuẫn dispatch (Đã phân giao). Danh sách điểm giao có km/phút nhưng thiếu mã phiếu để bấm sang.

**N38 · admin-ai** – Bảng "Quá hạn nhiều nhất" ghi Anh Nam · Nam Từ Liêm 18.400.000 · 12 ngày, trong khi mọi màn khác là Cô Hoa · Hà Đông · 9–10 ngày; AI trả lời "tôi chỉ đọc… không tạo phiếu" nhưng cột phải lại có "Đề xuất chờ duyệt: Nhắc nợ Công ty XD Bảo Long" (đang tự tạo đề xuất) — làm mơ hồ ranh giới "chỉ đọc". Chip "Chỉ đọc · không ghi sổ" xanh lá (không phải hành động tiền).

**N39 · admin-dispatch-resources** – Hai nút xanh chính cùng lúc ("Thêm xe" trên đầu + "Lưu xe" trong form); nhãn phụ "Chỉ cần tên gọi, không cần biển số." ~12px; Đỗ Văn Hải làm tài xế mặc định nhưng payroll ghi là "Bán hàng". Nhãn trạng thái "Đang giao PG-0115" xanh lá (đang giao không phải "Hoàn tất").

---------------------------------------------------------------------
## NHỎ (21; không có S13)
---------------------------------------------------------------------

**S1 · admin-dispatch, dispatch-resources, payroll-detail, routes, attendance** – Avatar chữ viết tắt cỡ 24–28px có chữ 9–11px (công thức size×0.38). Dưới ngưỡng 13px; tăng avatar lên ≥34px hoặc bỏ chữ, dùng biểu tượng người.
**S2 · admin-dashboard, cashbook, routes** – Badge đếm "4 việc", "2 giao dịch", "3 xe" cỡ ~12px (Astryx Badge mặc định). Tăng lên 13px.
**S3 · admin-login (public-login)** – Ô tên đăng nhập điền sẵn "dung.tho" (tài khoản thợ) ở tab "Vận hành"; nhãn ô nhập ~13px đậm xám nhạt, tương phản thấp; dải xanh có vòng tròn trang trí làm nền kiểu mẫu chung. Giữ: một nút chính, focus rõ. Gợi ý: logo công ty cạnh tên "Hiền Xa ERP" trong thẻ, bỏ vòng trang trí hoặc thay bằng ảnh kho/xe giao hàng thật.
**S4 · admin-quotations** – Trang tắt vẫn hiện thanh tìm, bộ lọc "Tất cả 0" và dòng "Không có dòng nào" lặp với trạng thái rỗng; chỉ cần một khối thông báo.
**S5 · admin-obligations** – Breadcrumb lặp "Tổng quan > Tổng quan > Nghĩa vụ đến hạn"; sắp xếp "Mới nhất" không hợp (nên theo hạn).
**S6 · admin-receivables / payables** – Chấm lọc "Trong hạn" xanh lá nhưng chip trong bảng xanh dương; "Còn 3 ngày"/"Quá hạn 9 ngày" lệch 1 ngày so với hạn (22/11 và 10/11 so với 20/11).
**S7 · admin-reports** – Nút "Xem báo cáo" nhỏ hơn mọi nút chính khác (cao ~30px); mục con "Doanh thu theo nhân viên" xuống 2 dòng; biểu đồ cột không có nhãn giá trị; số liệu tổng đều đúng (391,5 tr; 91 đơn; 317,7 tr; 73,8 tr).
**S8 · admin-settings-ai** – Chữ phụ "Khóa cũ bị thay thế ngay khi lưu." ~12px; ô "Mô hình" giống ô nhập chữ, không có mũi tên chọn; "Xóa khóa" nền hồng đậm cạnh "Lưu khóa mới" (hai nút ngang tầm trên cùng một hàng).
**S9 · admin-settings-automation** – Banner dòng phụ ~13px, nên 14px; chip "Cài đặt rủi ro" cam đặt cạnh tiêu đề dài làm tiêu đề xuống dòng không đều.
**S10 · admin-customer-360** – "Đặt lại" ở bảng tài khoản cổng là chữ đen thường (không giống liên kết); chip "Đơn gần đây" SO-0231 xanh dương, SO-0219/SO-0204 xanh lá không có chú giải; "Mặc định" xanh lá; tên "Nguyễn Văn Dũng (chỉ huy CT Hà Đông)" xuống 2 dòng làm hàng cao hơn.
**S11 · admin-order-new** – Ghi chú dưới bảng "Nhấn F3 để thêm hàng · giá lấy theo thứ tự…" dài 2 dòng, chữ xám ~14px; tách thành tooltip. Cột "Có thể bán" tiêu đề trùng sát cột Thành tiền.
**S12 · admin-order-import** – Ba ô tóm tắt 15 / 2 / 1 (tổng 18) gọi là "đơn" nhưng dòng nguồn là 18 dòng Excel; xem trước 5 đơn có tổng 17 dòng > 18 dòng của file cho 15 đơn (số học không khớp). Nút "Hủy" xám nhỏ cạnh nút xanh.
**S14 · admin-po-detail** – Ô trạng thái "Nhận một phần 300/540" chữ nhãn xám ~13px khó đọc trên nền dải; "Tổng đơn mua" lặp 2 lần.
**S15 · admin-supplier-detail** – Giá phi 16 168.000 in đậm không rõ lý do (các dòng khác thường); bảng giá thiếu phi 10 (69.500 trong supplier-pricing) → "4 vật tư" lệch.
**S16 · admin-product-detail** – "Có thể bán" tô xanh lá đậm (không phải hành động tiền) khác inventory/product list (đen đậm). Quy đổi đơn vị hai chiều đúng (1 Tấn = 20 Bao; 1 Bao = 0,05 Tấn; 1 Bao = 50 Kg; 1 Kg = 0,02 Bao).
**S17 · admin-transfer-detail** – Sổ ghi tồn gộp nhiều vật tư thành 1 dòng "−200 Bao · −100 Cây · −10 m³"; kiểm toán khó đối chiếu theo vật tư; tách thành mỗi vật tư một dòng.
**S18 · admin-delivery-detail / service-job-detail** – Ảnh bằng chứng là ô gradient màu pastel, giống ảnh lỗi; dùng khung xám với tên + giờ chụp là đủ.
**S19 · admin-cashbook / receivable-detail** – Màu cam cho "Phần dư chưa phân bổ", "Còn phải thu", "Số dư"… lẫn với cảnh báo; chỉ dùng cam khi cần xử lý.
**S20 · admin-attendance** – Thiếu cột Vị trí (theo mô tả: ca, giờ vào ra, vị trí); vai trò viết thường "thợ chính", "tài xế"; tên "Nguyễn Văn Minh" ≠ "Trần Văn Minh" (payroll/dispatch), "Phạm Đức Long" ≠ "Phạm Đức Anh".
**S21 · admin-service-jobs** – "Đã xác minh" và "Hoàn tất" cùng màu xanh lá; "Đã lên lịch" và "Đang thực hiện" cùng chấm xanh dương nên chip không phân biệt.
**S22 · HỆ THỐNG – nút phụ** – "Xuất Excel" là nút viền trắng ở orders/customers nhưng nút xám đặc ở reports/product-pricing; chọn một kiểu. Nút xanh lá dùng cho "Thêm khách", "Thêm vật tư", "Thêm người dùng", "Tạo việc" (xem N20–N22) vi phạm quy tắc xanh lá = tiền/hoàn tất.

---------------------------------------------------------------------
## Những điểm làm tốt (giữ)
---------------------------------------------------------------------
- order-new/edit: số học khớp (45.600.000 − 600.000 = 45.000.000; còn phải thu 35.000.000); số căn phải, một nút chính xanh lá "Xác nhận đơn" + "Lưu nháp"; dòng thiếu hàng tô vàng kèm hành động "chuyển NCC giao thẳng".
- order-detail: Nguồn hàng tách 2 khối (Kho / NCC giao thẳng) rất dễ hiểu; dòng "Hủy đơn sẽ hủy luôn phiếu giao chưa chạy (PG-0419)" đúng nghiệp vụ.
- receivable-detail: phân bổ cũ nhất trước, tổng cột Phân bổ khớp Còn nợ (45.600.000), thu 46 tr dư 400.000 ghi tiền ứng.
- payroll-detail, reports, product-detail, matching-detail, cashbook (số dư chạy đúng từng dòng): cộng trừ đều khớp.
- customer-portal-account: mật khẩu tạm một lần + nút Chép đúng D-quy tắc; payable-detail: dòng đảo gạch ngang + nền hồng rõ ràng.
