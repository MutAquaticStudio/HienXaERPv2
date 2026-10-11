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

## Package3 — giới hạn và căn cứ thực hiện

Một delivery của một SO, một điểm lấy nội bộ; nhiều kho tách delivery trước khi bàn giao (G14 cho phép mô hình tách phiếu). Lượng chưa lấy giải phóng giữ chỗ và giữ phần nguồn chưa dùng, không đổi kế hoạch. Zero line ghi quan sát lượng0 với cost NULL, không stock movement; dòng không bán có cost0 khi xác minh, không giả thiếu giá vốn của dòng có doanh thu.

Giữ default lịch4giờ từ mã cũ, hiện rõ/editable trước assign, lưu start/end cùng intent. Xe nội bộ cần cap/UOM/căn cứ nguồn/người-thời điểm xác minh; chưa đủ thì từ chối có hướng dẫn, không mặc định mật độ. Xác minh lại cùng cap khi đang có phân công được; đổi cap/UOM hoặc tắt xe đang bận bị chặn. Chỉ assignee có tài khoản active + work.claim tại chi nhánh được chọn; không thay quyền để làm test đạt.

## G07 — tiền đã ghi nhận

Phân bổ tiền đã có dùng cả phần ứng trước chưa dùng, không ghi thu/chi lại. Tiêu phần chưa phân loại trước, rồi ghi consumption advance theo allocation thực. Partial allocations cùng payment/obligation bằng intent khác hợp lệ trong giới hạn nguồn/nợ; retry cùng intent không tạo hiệu lực thêm. Đảo toàn phiếu tiền thực giữ hành vi có quyền/lý do và đảo classification để khôi phục debt đúng, không dùng cơ chế đó để hoàn một phần sales return ở G08. Dữ liệu finance không lưu plaintext trong localStorage; chỉ opaque intent UUID, bản payload ở private actor/branch draft.

## Tổng hàng thực trên xe

Calendar không chứng minh xe đã hết hàng. Bàn giao mới cộng actual load với cargo còn theo xe của handoff nguồn, kể cả phiếu VERIFIED. Lấy từ kho dùng immutable custody ledger; direct dùng actual handoff−verified accepted−terminal physical return/loss, không giả inventory transit. Conversion có căn cứ phải có cho cả cargo cũ lẫn hàng mới; thiếu thì từ chối. Xe còn cargo giữ cap/UOM/active; không tự tăng cap để hợp thức hóa quá tải cũ. Những quyền hoàn tiền/NCC credit khi trả hàng vẫn là nghiệp vụ riêng G08/G19, physical return không tự giảm AP hoặc tạo cash.

## Khoản có, doanh thu và hoa hồng

Giảm tiền trả hàng trước vào debt chưa thanh toán; chỉ phần vượt debt được cấp nguồn từ allocation đã thu và giữ thành credit. Refund/offset consume cùng fundinglot, khóa credit/payment/obligation; refund payment khác originalreceipt, không fullreverseoriginal. Không giải phóng tiền đã dùng/earmarked lần nữa. Zero-billable decision0 không tạo money/AR giả. Legacynegative/returnadjustment không autowritefunds; UI yêu cầu đối chiếu nguồn, đây không phải opening/activation gate chung.

RevenueRETURN/PRICE signedsource riêng; WRITE_OFF/OTHER không revenue. SourceFKlegacyReturn readthrough khi không typedrecord, không backfill hoặc giảmhai lần. Period theo approval/recordedAt từngfact; cutoff giữ nguồn thấy tại thời điểm. Warehousecost theo verifiedline; direct theo đúngPOline/SOline, sourceqty/cost và cutoff; không có bất kỳCOGS trênSO là đủ. Money output text giữ bigint.

Standingautomaticcommission giữ snapshot nguồn và bounded cumulative rounding theo partial allocation release; unpaid phần đủ thì appendnegativeearning. Nếu hoa hồng đã trả/không đủunpaid, giữ oldfacts và sourcecase review, không tự recoup cash hay âmAP. Paidreview resolution/employee settlement vẫn cần triển khai/kiểm chứng; không đổi cấu hình thật. Manual commission dùng netprofit/costsource để tính mới, không rewriteapprovedsnapshot. GenericPRICE decrease chưa mở paid-credit-price workflow; giữ outstanding guard cũ.

## G23 — phạm vi hiện thực

Một phiếu giao thuộc một SO và một điểm lấy nguồn; các phiếu giữ lượng/công nợ/chi phí riêng. Nhu cầu gộp nhiều SO trong một chuyến chưa được cung cấp; không thêm nhóm chuyến hoặc nhân bản chi phí chung. Direct/warehouse mixedpickup phải táchnguồnphiếu, DBrejectunsupportedactions. CommercialCLOSED làđóngphần thươngmại, operationalcomplete chỉkhi verifiedexecution/cargo/returns/debt/refundoffset/commissionreview/work/docsourceexceptions đủđiềukiện. Phát hànhpháp lý làtrạngtháiriêngvàblockedthiếuprovider.
