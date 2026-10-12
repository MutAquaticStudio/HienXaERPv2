# Thay đổi ứng viên

CHƯA HOÀN TẤT phát hành. Nền e7f1740, candidate codex/go-live-acceptance.

- Migration175 `20261011203524_worker_actual_quantity_contract.sql`: worker payload thêm thực lấy, giới hạn được báo và readiness từ server; không cập nhật kho/tiền/chứng từ/quyền. Native backup trước apply; số dòng/hash toàn cột public giữ nguyên.
- Work form/page hiển thị kế hoạch/thực lấy/giới hạn; không fallback kế hoạch khi chưa lấy; blank amount ban đầu; nguồn bị từ chối stale chỉ được dùng phiên bản mới sau refresh và người dùng xác nhận. Unknown outcome giữ intent cũ.
- Service result HTTP không chuyển lượng exact sang JavaScript Number; parser chặn vượt6digit trước RPC.
- Giữ sửa local về focus sau khi inert được gỡ; giữ navigation và quyền độc lập của candidate.
- GPS thiết bị hoãn: UI thông báo chưa khả dụng; start/ping HTTP501, không fake success. Backend quyền/phân giao không gỡ. Hóa đơn pháp lý vẫn chưa cấu hình/chưa phát hành.
- Health thêm build SHA/required migration; không giả là đã kiểm DB. Main auto-deploy Git tắt trong vercel.json để merge không tự phát hành trước cổng DB/recovery; deploy sau được quản lý tường minh. Căn cứ cấu hình: https://vercel.com/docs/project-configuration/git-configuration

Kiểm chứng đã chạy: red2case trước sửa;4files22ca rồi4files26ca;5files38ca (gồm GPS component) PASS. Typecheck PASS. Lint0error,13baselinewarnings +2unused trong harness mới đã sửa, cần chạy lại. Native source flow/no-opening/schema forward175PASS; dữ liệu mới source flow rollback. Chưa CI/head release commit hoặc browser kết luận.

-176: FixFinanceARview authenticationEXEC failure throughbranch-ARguardedread helper; old calculator staysprivate. Positivefinance230000 andworker/customerdeniedPASS, realFinancebrowserreceipt1mcompleted.
-177: CustomerportalRPC moneyfieldsJSONstrings; UI format/sumBigInt, unknown!=zero. Native9007199254740993transportexact rollbackPASS.
-Portalchangedassignment/wrongCustomerread nowredirectclearcurrent-listmessage insteadofgenericcrash; BrowsernegativeandmobilefocusPASS.

## Bổ sung khi tiếp tục ngày12/10

- Sửa kiểm tra bản nháp nhiều dòng: Next có thể nhóm các trường trùng tên khi truyền FormData. So sánh theo tên trường và giữ nguyên thứ tự giá trị của từng trường; vẫn chặn đổi lượng, đảo liên kết dòng, thiếu trường hoặc đổi mã ý định. Gửi lại đúng mã nhận hàng đang UNKNOWN đã ghi một lần; nhận đợt tiếp theo đóng PO đúng30m³/50kg.
- Hoàn thành giao nhiều dòng3m³/2bao×25kg bằng các vai trò thật. Máy chủ lưu kết quả nhưng trình duyệt mất phản hồi; retry cùng ý định giữ một kết quả. Sau xác minh: doanh thu/AR740.000đ, kho và hàng trên xe hết, một xác minh.
- Kiểm tra18 lượt đọc màn hình thợ/khách; Owner thu hồi quyền qua UI, phiên thợ cũ bị chặn đọc/bắt đầu; khôi phục cùng nguồn quyền qua UI và đọc lại đạt.
- Phục hồi bản sao native trước177:122 bảng khớp nội dung. Fresh177 không bảng public thiếu RLS;289 hàm/ACL khớp bản nâng cấp. Điều chỉnh guard của bộ chạy fresh để kiểm đúng thư mục cụm thuộc tệp credential, hỗ trợ thư mục QA lưu bền; không nới host/port hoặc cho ghi đè DB có sẵn.

Kiểm tra mới:89 tệp/599 unit,8 Node, typecheck, build đạt; lint0 lỗi/13 cảnh báo nền. Các bộ này không gọi hai race ứng trước. CI của commit sẽ lưu tiếp sau khi push; không dùng CI e7f1740 cho source mới.

Cấu hình release bổ sung chặn Git auto-deploy hai nhánh ứng viên/PR42 cùngmain trước cổng. Không đổi cấu hình các nhánh khác hoặc môi trường đang chạy; deploy ứng viên sẽ thực hiện tường minh sau đủ cổng. Căn cứ: https://vercel.com/docs/project-configuration/git-configuration

G02 bổ sung: số JSON`99999999999999.0000001` có thể bị parser làm mất phần thập phân trước validation; số`99999999999999.123456` cũng mất precision. Hai test HTTP đỏ200thay409 tái hiện. API báo kết quả nay nhận chuỗi thập phân exact cho scalar và từng dòng; các producer UI/StorageQA hiện có đều dùng chuỗi. Không còn nhận JSONnumber đã có thể mất chữ số.4tệp/25ca liên quan đạt, toàn bộ89tệp/602unit đạt sau sửa.
