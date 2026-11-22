# Dữ kiện chuẩn dùng chung (mọi màn phải khớp). Hôm nay = 20/11/2026.
Khách:
- KH-0102 Công ty XD Bảo Long: hạn mức nợ 200.000.000 ₫, hạn thanh toán 30 ngày, nhóm giá "Nhóm giá Bảo Long". Đang nợ 45.600.000 ₫ (đơn SO-0231), TRONG HẠN, hạn 25/12/2026 hoặc trong hạn tùy ngày giao; KHÔNG quá hạn.
- KH-0087 Cô Hoa · Hà Đông: nợ 18.400.000 ₫, QUÁ HẠN 9 ngày (hạn 11/11/2026).
- KH-0066 Anh Nam · Nam Từ Liêm: nợ 30.400.000 ₫, QUÁ HẠN 18 ngày (hạn 02/11/2026).
- KH-0071 Công ty Minh Phát: nợ 7.200.000 ₫, hạn 22/11/2026 (còn 2 ngày) — là KHÁCH, chỉ xuất hiện ở Phải thu, không ở Phải trả.
- Tổng nợ quá hạn = 18.400.000 + 30.400.000 = 48.800.000 ₫ (2 khách, lâu nhất 18 ngày). Danh sách phải thu/khách hàng/nghĩa vụ/dashboard phải cộng khớp với các dòng hiển thị (hoặc có dòng "Khách khác" ghi rõ phần còn lại để tổng khớp).
Nhà cung cấp (phải trả CHỈ tính phần đơn mua ĐÃ NHẬN hàng):
- Xi măng Hoàng Thạch: PO-0088 "Đã đặt" chưa nhận → KHÔNG tính nợ. Phải trả = 0 từ PO-0088; có thể còn khoản cũ PN-0198 62.000.000 ₫ hạn 21/11 (còn 1 ngày).
- Thép Hòa Phát: PO-0087 "Nhận một phần": chỉ tính nợ phần đã nhận (98.100.000 ₫ theo màn supplier-detail), không tính 148.500.000.
Kho: tồn của một vật tư luôn kèm đơn vị riêng; KHÔNG cộng tổng các vật tư khác đơn vị. Xi măng PC40 Hoàng Thạch tại Kho Đại Mỗ: Tồn kho 1.240 bao · Chờ xuất giao 200 · Đã hứa cho đơn 180 · Có thể bán 860. Mọi màn (tồn kho, vật tư, chuyển kho, kiểm kho, tạo đơn) dùng đúng các số này; số lượng không tự làm tròn (giữ phần thập phân thật).
Đơn SO-0231 (Bảo Long): trạng thái đơn "Đã xác nhận", thực hiện qua phiếu PG-0118 "Đã phân giao"; chip đơn dùng bộ: Nháp, Đã xác nhận, Đang giao, Hoàn tất, Đã hủy, Khách đặt · Chờ duyệt. KHÔNG dùng "Đang thực hiện" làm trạng thái đơn.
Quy tắc nghiệp vụ: phiếu "Chờ xác minh"/"Đã xác minh" KHÔNG có Tách phiếu/Hủy phiếu (chỉ Chờ phân giao hoặc Đã phân giao chưa bắt đầu); D88: không tự duyệt khi vượt hạn mức nợ → công tắc đó BẬT.
UXUI: xanh lá CHỈ cho hành động tiền/hoàn tất (Tạo đơn bán, Xác nhận đơn, Duyệt đơn, Thu tiền, Ghi phiếu chi, Hoàn tất, Đặt hàng mới). Các nút "Thêm khách/vật tư/người dùng", "Tạo việc" dùng xanh dương chính. Mỗi màn tối đa 1 nút chính. Chữ ≥ 13px kể cả avatar/badge đếm. Cột số căn phải kể cả "Số nhân viên", ô số tiền ở form. Không phân trang giả: nếu ít dòng thì ghi "Hiển thị n trên n" và ẩn số trang.
