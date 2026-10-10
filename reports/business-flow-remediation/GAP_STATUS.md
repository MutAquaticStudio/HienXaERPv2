# Khắc phục G01–G23

Baseline PR41 8b693c2, Draft chưa merge. Nhánh codex/business-flow-remediation-g01-g23 phụ thuộc PR41. Một tác nhân; không Production/merge/deploy; giữ dirty work ban đầu. Evidence cũ không nghiệm thu bản sửa.

| G | Vấn đề | Bằng chứng ban đầu | Nguyên nhân xác minh | Sửa/chính sách | Tệp/lệnh | Kiểm thử | Commit | Evidence mới | Trạng thái/phần thiếu |
|---|---|---|---|---|---|---|---|---|---|
| G01 | Kiểm kê sau xuất âm | Tái hiện native | Delta cutoff, thiếu current/reservation/basis checks | Reject stale basis; source revisions; reserve/value guard | 3 forward migrations; record/approve count; inventory message | T28/T07/T08/T13/T40 scoped | Package1 runtime commit, cập nhật hash sau commit | PACKAGE1_DB_REGRESSION/AUTH_HTTP/BROWSER/CONCURRENCY/FRESH_SCHEMA/RECOVERY | ĐÃ SỬA VÀ KIỂM CHỨNG phạm vi gói; full regression cuối còn chờ |
| G02 | Lượng quá6 chữ số được làm tròn sau khi tính tiền | ĐÃ THỬ QA SO; PO MÃ NGUỒN | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G03 | Đợt giao cuối bị chặn vì làm tròn từng chuyến | ĐÃ THỬ QA | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G04 | DB chấp nhận bảng giá thấp hơn rule ưu tiên mà không override | ĐÃ THỬ QA; Owner cần chốt chính sách ưu tiên | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G05 | Reader lấy raw cost | Tái hiện native | Broad table grants/RLS; child cost columns exposed | Column grants; guarded masked views; direct-cost reader policy | Delivery detail reader; cost-safe SQL views/grants | T05/T06 scoped, actual Sales/Finance/Worker JWT, raw/filter/order denial | Package1 runtime commit, cập nhật hash sau commit | PACKAGE1_AFTER_G05/AUTH_HTTP/BROWSER | ĐÃ SỬA VÀ KIỂM CHỨNG đường liên quan gói; sweep mới nếu source đổi |
| G06 | Đổi người giao sau publish làm Delivery và WorkItem lệch | ĐÃ THỬ QA | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G07 | Explicit advance không phân bổ được vào nợ | ĐÃ THỬ QA + MÃ NGUỒN UI | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G08 | Trả hàng đã thu đủ tạo quyền hoàn tiền nhưng chưa có settlement đầy đủ | ĐÃ THỬ QA + MISSING workflow | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G09 | P&L không trừ sales return credit | ĐÃ THỬ QA facts + MÃ NGUỒN công thức; dashboard fresh committed CHƯA XÁC MINH | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G10 | Board ngoại lệ bỏ sót thiếu hàng được quản lý xác nhận | ĐÃ THỬ QA | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G11 | Mục tiêu dùng ngay không opening/manual activation chưa được triển khai | MÃ NGUỒN + TÁI SỬ DỤNG; GAP yêu cầu mới, không bug policy hiện tại | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G12 | Expected version null làm optimistic check fail-open | ĐÃ THỬ QA ở assign_delivery | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G13 | Tải và lịch xe/người chỉ kiểm ở bước sau | ĐÃ THỬ QA một phần + MÃ NGUỒN | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G14 | Không nhập actual loaded; nhiều nguồn lấy hàng không có custody event riêng | MÃ NGUỒN; native handoff dùng planned | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G15 | Payment/receipt retry chưa giữ ý định đủ ở UI | MÃ NGUỒN — rủi ro, chưa tái hiện lost-response end-to-end | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G16 | Cost completeness ở grain SO quá rộng | MÃ NGUỒN — chưa tái hiện dashboard mixed-cost runtime | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G17 | Chi phí chuyến chưa truy ngược xe/delivery và phân loại direct | MÃ NGUỒN — PARTIAL | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G18 | Không có quy trình chuyển kho | MISSING trong source/schema hiện tại | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G19 | Trả nhà cung cấp chưa gắn hàng và AP | MISSING workflow; general AP adjustment có | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G20 | Hóa đơn chỉ duyệt nghiệp vụ, chưa phát hành pháp lý | MISSING legal issuance; internal invoice implemented | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G21 | Audit chưa đủ | Phân tích hiệu lực | Count commands thiếu central events/history | Audit cùngTX open/record/approve; append-only observations | Count migrations | T40 success/retry/fault-after-insert | Package1 part | PACKAGE1_DB_REGRESSION | ĐÃ TRIỂN KHAI MỘT PHẦN; các lệnh nguồn/giao/return còn chờ gói tương ứng |
| G22 | Báo đã chuyển tiền chưa đối chiếu tới phiếu thu thực | MÃ NGUỒN — matching link PARTIAL | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
| G23 | Hoàn tất thương mại và phạm vi một chuyến cần chốt | MÃ NGUỒN + ĐÃ THỬ QA; quyết định quy ước | Audit04, xác minh hiệu lực trước sửa | Prompt triển khai, chưa sửa | — | T01–T42 | — | — | CHƯA XỬ LÝ |
