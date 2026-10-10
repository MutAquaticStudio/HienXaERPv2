# Quyết định triển khai

## Đã chốt bởi người dùng

Không yêu cầu tồn/tiền/nợ/lịch sử đầu kỳ, checklist hoặc activation thủ công để giao dịch mới. Không mở rộng importer. Lịch sử chưa biết không phải0. Tái sử dụng mốc hợp lệ; nếu chưa có, server xác lập một lần ổn định, không đổi mốc doanh nghiệp đang hoạt động.

Confirm SO/PO không stock/AR/AP/revenue; receipt/direct/verify/payment theo nguồn thật, atomic/permission/idempotency. Physical stock chưa được ghi không khả dụng. Cash mới không phải toàn bộ số dư thực.

G02 reject vượt độ chính xác; G03 cumulative monetary delta theo source line, khóa nguồn; G04 server authoritative price, override có quyền/lý do; G13 hard maximum có căn cứ, không override vượt tải; G14 actual loading riêng.

Được source/schema/QA/commits/Draft PR. Cấm Production DML/migration/deploy, secrets/real rights, real money/invoices. Bảo toàn dirty work.

## Mặc định bảo thủ, không giả là Owner duyệt policy mới

G01 reject stale count basis, giữ chênh lệch/observation revision, không rebase thiếu hụt về0. Đếm lại ở mốc mới nếu có movement sau cutoff.

Trước khi bắt đầu work: sync reassignment trong TX; đã bắt đầu: deny simple reassign.

Một Delivery cho một SO/đợt; không thêm Trip group khi chưa cần multi-SO thật. Chi phí gắn delivery/vehicle nguồn.

Customer credit/refund/offset theo nguồn duyệt và available, không đảo toàn receipt. Refund cần quyền finance và nguồn đủ điều kiện; không chuyển tiền thật.

G20 chưa có provider/API/sandbox được giao: nội bộ và đối chiếu/xuất hệ ngoài tiếp tục; legal issuance BLOCKED cụ thể, không tự chọn dịch vụ.

## Kiểm chứng

Mỗi default phải có code/UI/test/evidence. Pin commit/schema/environment. Không dùng CI/audit cũ làm PASS bản sửa.
