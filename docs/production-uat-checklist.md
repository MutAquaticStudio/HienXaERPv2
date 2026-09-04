# Production UAT — hồ sơ nghiệp vụ thật

Production UAT không tạo dữ liệu mẫu, không tạo giao dịch tài chính giả và không
xóa dữ liệu sau kiểm thử. Chỉ thực hiện hành động vốn thuộc giao dịch thực tế đã
được Owner phê duyệt.

## Điều kiện bắt đầu

- Owner chỉ định một đơn giao vật tư thật và một ServiceJob thật, ở trạng thái cho
  phép quan sát hoặc thực hiện bước nghiệp vụ kế tiếp.
- Có ba phiên đăng nhập độc lập: Owner, nhân viên/driver được phân công và khách
  hàng thuộc đúng giao dịch. Không ghi mật khẩu vào ticket, log hoặc evidence.
- Owner xác nhận rõ các hành động trạng thái nào là nghiệp vụ thật được phép thực
  hiện trong phiên UAT. Nếu không có hồ sơ hoặc xác nhận này, trạng thái là
  `HUMAN_ACTION_REQUIRED`.

## Đơn giao vật tư

- Owner đối chiếu quotation/order, sourcing hoặc reservation áp dụng, Delivery,
  WorkItem, profitability và earning với cùng nguồn giao dịch.
- Nhân viên/driver chỉ thấy việc và Delivery được phân công; kiểm tra hành động
  hợp lệ, GPS/chat theo đúng assignment và không truy cập Finance/margin.
- Khách hàng chỉ thấy quotation/order/Delivery/công nợ của mình; không thấy giá
  mua, margin, dữ liệu khách hàng khác hoặc tọa độ GPS thô.
- Với khoản thanh toán đã phát sinh thật, chỉ đối chiếu projection P8. Không tạo
  payment, allocation hoặc payment notice chỉ để kiểm thử.

## ServiceJob

- Owner kiểm tra lịch, assignment, work log, xác minh, billing/receivable hiện có,
  profitability và earning dựa trên cùng ServiceJob.
- Nhân viên chỉ có thể xem và thao tác ServiceJob được giao; các quyền điều phối,
  duyệt, chi phí và tài chính vẫn bị chặn.
- Kiểm tra mobile 390px, zoom trình duyệt 200%, keyboard focus và trạng thái
  lỗi/khôi phục trên các màn hình thực tế được dùng.

## Kết thúc

- Ghi nhận kết quả theo từng vai trò và ID nội bộ đã được Owner phê duyệt, không
  đưa dữ liệu định danh hoặc thông tin đăng nhập vào repository.
- Bất kỳ sai khác dữ liệu, rò quyền hoặc lỗi runtime nào phải dừng tại bước đó;
  không sửa trực tiếp dữ liệu Production để làm kết quả trông hợp lệ.
