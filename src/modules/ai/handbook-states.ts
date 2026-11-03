// D50 (Owner 03/11/2026, "dạy trợ lý AI biết về mọi nghiệp vụ"): the values of the state columns the assistant reads, with
// the label each screen shows. Taken from the check constraints / read views and the presentation label maps
// (src/modules/*/presentation.ts). The assistant filters by the code and answers with the label.

export const AI_HANDBOOK_STATES = `## Giá trị trạng thái (lọc bằng mã, trả lời bằng nhãn)
- Đơn bán (sales_order_read)
  - commercial_state: DRAFT = Bản nháp; CONFIRMED = Đã xác nhận; CLOSED = Đã đóng phần thương mại; CANCELLED = Đã hủy.
  - fulfillment_state: NOT_STARTED = Chưa thực hiện; PARTIAL = Đã giao một phần; FULFILLED = Đã giao đủ; CLOSED_REMAINDER = Đã đóng phần còn lại.
  - payment_state: NOT_DUE = Chưa phát sinh (chưa có công nợ); UNPAID = Chưa thanh toán; PARTIAL = Thanh toán một phần; PAID = Đã thanh toán.
- Phiếu giao (delivery_read)
  - execution_state: PLANNED = Chờ phân giao; ASSIGNED = Đã phân giao; DISPATCHED = Đang giao; ARRIVED = Đã tới nơi; RESULT_SUBMITTED = Chờ xác minh; VERIFIED = Đã xác minh; CANCELLED = Đã hủy.
  - result_kind: FULL = Đủ; PARTIAL = Giao thiếu; FAILED = Không giao được.
- Đơn mua (purchase_order_read)
  - state: DRAFT = Chờ nhận hàng; CONFIRMED = Đang nhận hàng; CLOSED = Đã ghi đủ nguồn nhận; CANCELLED = Đã hủy.
  - destination_type: WAREHOUSE = Về kho; CUSTOMER_SITE = Giao thẳng công trình.
- Công nợ (receivable_read, payable_read) state: OPEN = Còn hạn; OVERDUE = Quá hạn (hạn trả trước hôm nay); SETTLED = Đã tất toán.
- Sổ quỹ (payment_read)
  - direction: RECEIPT = Phiếu thu; DISBURSEMENT = Phiếu chi.
  - method: CASH = Tiền mặt; BANK_TRANSFER = Chuyển khoản; CARD = Thẻ; OTHER = Khác.
  - account_kind: CASH = Tiền mặt; BANK = Ngân hàng.
  - posting_state: POSTED = Đã ghi sổ; REVERSED = Đã đảo giao dịch. reconciliation_state: UNMATCHED = Chưa đối soát; PARTIAL = Đối soát một phần; MATCHED = Đã đối soát.
- Chi phí (expense_read)
  - activity_kind: OPERATIONS = Vận hành; SALES = Bán hàng; DELIVERY = Giao hàng; SERVICE = Dịch vụ; ADMIN = Hành chính.
  - approval_state: DRAFT = Chờ duyệt; APPROVED = Đã duyệt. settlement: PAID_NOW = Đã trả ngay; PAYABLE = Ghi nợ nhà cung cấp; NON_CASH = Không dùng tiền.
- Đơn dịch vụ (service_jobs) execution_state: SCHEDULED = Đã lên lịch; IN_PROGRESS = Đang thực hiện; RESULT_SUBMITTED = Chờ xác minh; VERIFIED = Đã xác minh; CANCELLED = Đã hủy. service_type là chữ tự do.
- Phiếu kiểm kho (stock_count_read) state: OPEN = Đang kiểm; APPROVED = Đã cân bằng kho; CANCELLED = Đã hủy.
- Xuất nhập kho (inventory_movement_read) movement_type: PURCHASE_RECEIPT = Nhận hàng NCC; DELIVERY_HANDOFF = Bàn giao lên xe; DELIVERY_VERIFIED = Khách đã nhận; STOCK_ADJUSTMENT = Điều chỉnh kiểm kho; RETURN_TRANSFER = Nhận hàng còn lại về kho; CUSTOMER_RETURN = Khách trả hàng; TRANSIT_LOSS = Hao hụt đang giao; WAREHOUSE_TRANSFER_DISPATCH = Xuất chuyển kho; WAREHOUSE_TRANSFER_RECEIPT = Nhận chuyển kho; WAREHOUSE_TRANSFER_LOSS = Hao hụt chuyển kho; OPENING = Tồn đầu kỳ; SUPPLIER_RETURN = Trả hàng nhà cung cấp.
- Chấm công (attendance_records) status: WORKED = Đi làm; LEAVE_PAID = Nghỉ có phép; LEAVE_UNPAID = Nghỉ không phép; ABSENT = Vắng. source: WORKER = Nhân viên tự chấm; OFFICE = Văn phòng chấm.
- Phiếu lương (payroll_lines) pay_basis: MONTHLY_WORKDAYS = Theo ngày công chuẩn; PER_SHIFT = Theo ca; PER_HOUR = Theo giờ; FIXED = Cố định.
- Thu nhập (earning_event_read) earning_type: FIXED_MONTHLY = Lương tháng; PER_JOB = Theo công việc; PER_TRIP = Theo chuyến; PER_HOUR = Theo giờ; PER_SHIFT = Theo ca; PER_DAY = Theo ngày; PER_TON = Theo tấn; PER_M3 = Theo m³; PER_BAG = Theo bao; PER_UNIT = Theo đơn vị; BONUS = Thưởng; ADJUSTMENT = Điều chỉnh; SALES_COMMISSION = Hoa hồng bán hàng. approval_state: DRAFT = Chờ duyệt; APPROVED = Đã duyệt.
- Khách hàng (customers) customer_type: INDIVIDUAL = Cá nhân; BUSINESS = Doanh nghiệp.
- Nhân viên (workforce_read) work_state (việc đang làm): AVAILABLE = Sẵn sàng nhận việc; CLAIMED = Đã nhận việc; IN_PROGRESS = Đang thực hiện; BLOCKED = Đang vướng; DONE = Chờ xác minh; VERIFIED = Đã xác minh; CANCELLED = Đã hủy.`;
