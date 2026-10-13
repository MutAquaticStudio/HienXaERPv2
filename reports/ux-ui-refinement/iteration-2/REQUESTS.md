# Yêu cầu refinement tiếp nhận ngày 13/10/2026

Dùng Taste redesign-existing-projects. Giữ màu, phông chữ, bố cục chính và toàn bộ nghiệp vụ/API/RPC/schema. Một agent, worktree riêng. Chưa deploy đợt bổ sung này; Production còn68903bb. PR46 spacing đã merge9268962/CI đạt; PR47 mở trên c95bdb9, đang bổ sung các nhận xét mới. Không lấy CI c95 làm bằng chứng các file chưa commit.

- Tổng quan: sửa padding/gap hai thẻ chi phí/hoa hồng (PR46, chưa deploy), chỉnh chỉ số tiền ở độ rộng trung gian.
- Sidebar: chỉ tên Hiền Xa ERP, bỏ HX/dòng phụ (PR47); ẩn thanh cuộn nhưng giữ cuộn và bàn phím.
- SO/báo giá: rút hướng dẫn kho, giữ số thực và unknown khác0; bỏ ghi chú giá cuối form, giữ kiểm giá máy chủ. Refine tìm khách/công trình, nhãn/khoảng cách và các dòng hàng.
- SO chi tiết: style lại credit-override đang dùng utility Tailwind không có trong stack; giữ đúng số, quyền, reason/snapshot/operation/action. Bỏ khối hoàn tất lặp trạng thái khi không có ngoại lệ; giữ rõ cargo/trả/hoàn/cấn trừ/chứng từ/hoa hồng chưa xử lý. Đổi nút Tạo phiếu giao nhiều dòng thành Tạo phiếu giao.
- Header products/customers/dispatch/receivables/payables/invoices: title→mô tả→nhóm nút theo cấu trúc chung, nút không bị bóp hẹp/chạm khối tiếp theo.
- Inventory và cashbook: xóa đúng banner chất lượng lịch sử người dùng đánh dấu, không thay dữ liệu/quality ở model/báo cáo hoặc khai đã đối chiếu.
- Expenses/invoices-purchases/settings/reports: nhịp khối/card/filter/table và mobile; không mất dữ liệu hoặc thao tác.

Người dùng đã bắt đầu tạo/xử lý SO/DL mới trên Production khi xem UI. Các chứng từ mới đó KHÔNG tự coi UAT hoặc xóa. Dọn UAT cũ146 dòng đã kết thúc; không chạy lại hai race ứng trước600.000/400.000. Backup được miễn, không ghiPASS restore.

Kiểm chứng: local/QA cô lập, ảnh trước/sau, đúng quyền; type/lint/tests/build và CI đúng head cuối; merge theo quyền đã giao, deploy đúng project/ref và read-only sau deploy. Bản đang chạy/QA/Git phải ghi riêng. Không ghi sổ thử Production, GPS/hóa đơn thật vẫn hoãn.

- Bổ sung: xóa nhãn Hiền Xa ở topbar; giữ phạm vi branch/permission tại server và dữ liệu. Avatar/tên tài khoản vẫn ở vị trí phải.
