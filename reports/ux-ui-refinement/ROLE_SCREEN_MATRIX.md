# Vai trò, màn hình và phạm vi kiểm chứng

| Màn hình | Tài khoản | Trình duyệt | Tác động/giới hạn | Bằng chứng |
|---|---|---|---|---|
| manager | owner | ĐẠT desktop + mobile viewport | Chỉ số, bộ lọc, chất lượng lịch sử; 4 số dài được giữ đủ | [Trước](before/manager-desktop.png), [sau](after/manager-mobile.png) |
| sales-order | sales | ĐẠT desktop + mobile viewport | SO nguồn mới; tải lại sau kho/thợ/kế toán | [Trước](before/sales-order-desktop.png), [sau](after/sales-order-mobile.png) |
| sales-form | sales | ĐẠT desktop + mobile viewport | Giữ biểu mẫu, default và bước preview/lưu; không tạo SO lần hai | [Trước](before/sales-form-desktop.png), [sau](after/sales-form-mobile.png) |
| purchasing-order | purchasing | ĐẠT desktop + mobile viewport | PO/phiếu nhận nguồn chuẩn thật; giá mua khác giá bán | [Trước](before/purchasing-order-desktop.png), [sau](after/purchasing-order-mobile.png) |
| purchasing-form | purchasing | ĐẠT desktop + mobile viewport | Giữ biểu mẫu và thao tác quen thuộc; không sửa logic tính giá | [Trước](before/purchasing-form-desktop.png), [sau](after/purchasing-form-mobile.png) |
| warehouse | warehouse-dispatch | ĐẠT desktop + mobile viewport | Nguồn kho, lượng khả dụng và giữ chỗ; chỉ đọc trong khảo sát | [Trước](before/warehouse-desktop.png), [sau](after/warehouse-mobile.png) |
| dispatch | warehouse-dispatch | ĐẠT desktop + mobile viewport | Nhãn nhập kết quả và xác minh13 riêng với thợ14 | [Trước](before/dispatch-desktop.png), [sau](after/dispatch-mobile.png) |
| finance-receivables | finance-employee | ĐẠT desktop + mobile viewport | Thu1.000.000 và phân bổ đúng nguồn; nợ1.990.000 | [Trước](before/finance-receivables-desktop.png), [sau](after/finance-receivables-mobile.png) |
| finance-cashbook | finance-employee | ĐẠT desktop + mobile viewport | Nhãn đối soát/đảo, bàn phím, cuộn ngang; lưu đối soát phiếu mới | [Trước](before/finance-cashbook-desktop.png), [sau](after/finance-cashbook-mobile.png) |
| worker | worker | ĐẠT desktop + mobile viewport | Điện thoại:15/14/14, max14, giữ bản nháp, một tác động khi retry | [Trước](before/worker-desktop.png), [sau](after/worker-mobile.png) |
| customer | finance | ĐẠT desktop + mobile viewport | Cổng khách hiện có: chỉ đọc dữ liệu đúng khách, không giá vốn | [Trước](before/customer-desktop.png), [sau](after/customer-mobile.png) |
| receiver | receiver | ĐẠT desktop + mobile viewport | Giữ chính sách khách nhận hàng; không thay quyền delivery.verify | [Trước](before/receiver-desktop.png), [sau](after/receiver-mobile.png) |

Quyền thực: khách khác bị chuyển về danh sách với thông báo đơn không thuộc phạm vi; thợ đọc API công nợ nhận403. Kho/khách không có dữ liệu giá vốn mở thêm. Các phần permission/RLS/API không thay đổi, COMPARISON.json xác nhận phạm vi mã.

Chuỗi tạo SO/PO, nhận và lấy hàng được chuẩn bị một lần qua RPC thật; lần này thực hiện báo giao → xác minh → thu/phân bổ → đối soát trên trình duyệt bằng từng tài khoản đúng quyền. Không diễn giải chuẩn bị RPC thành thao tác tạo SO/PO bằng UI lần này. Các biểu mẫu tạo được khảo sát và giữ nguyên; bằng chứng xuyên suốt cũ vẫn ở reports/go-live-acceptance/BROWSER_SOURCE_FLOW175-attempt2.json đã đối chiếu phạm vi mã; không coi là đã chạy mới.

Các luồng trả/hoàn/chi, Storage, Realtime và GPS không có logic thay đổi; không chạy lại bộ tích hợp cũ hoặc nhận là đã chạy mới. Unit liên quan quantity/money/credit/draft/API/no-opening được chạy lại. Không phát triển tích hợp hoặc cổng mới.
