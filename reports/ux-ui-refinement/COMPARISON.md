# Ảnh trước và sau

Ảnh cùng tài khoản, chứng từ và viewport. Desktop1280×900; điện thoại390×844 mô phỏng bằng Chromium. Ảnh chính giữ đúng viewport; ảnh `-full` bổ sung toàn trang. Biểu tượng Next dev và thanh điều hướng cố định có thể xuất hiện trong ảnh toàn trang, không phải thành phần mới của bản phát hành.

| Màn hình | Trước | Sau | Đối chiếu |
|---|---|---|---|
| Quản lý | [Ảnh toàn trang](before/manager-desktop-full.png) | [Ảnh toàn trang](after/manager-desktop-full.png) | 4 chỉ số bị cắt → 0; đủ chữ số, nhóm tiền không bị tách giữa nhóm |
| Kế toán trên điện thoại | [Ảnh](before/finance-cashbook-mobile-full.png) | [Ảnh](after/finance-cashbook-mobile-full.png) | Có nhãn thường trực; bảng giữ8 cột, cuộn ngang đến form đầy đủ |
| Điều phối | [Ảnh](before/dispatch-mobile-full.png) | [Ảnh](after/dispatch-mobile-full.png) | Nhãn liên kết đúng trường người nhận, sự cố, lý do thiếu bước |
| Thợ trên điện thoại | [Ảnh](before/worker-mobile-full.png) | [Ảnh](after/worker-mobile-full.png) | Kế hoạch15 / thực lấy14 / còn được phép14 rõ thành dòng; không đổi max hoặc mặc định |
| Khách hàng | [Ảnh](before/customer-mobile.png) | [Ảnh](after/customer-mobile.png) | Giữ cấu trúc, nội dung và phạm vi đọc |

[BEFORE.json](BEFORE.json), [AFTER.json](AFTER.json) và [COMPARISON.json](COMPARISON.json) cung cấp đủ24 cặp. Kiểm tra tự động xác nhận cột, tên trường, nút, liên kết, phông và màu thương hiệu không đổi; không tràn viewport sau sửa. Giá trị ledger không đổi trong hai khảo sát chỉ đọc.

Bằng chứng tương tác: [cuộn bảng và nhãn](regression/cashbook-labels-mobile-keyboard.png), [hộp thoại trên điện thoại](regression/sales-dialog-mobile.png), [mất mạng giữ bản nháp](regression/worker-offline-draft-kept.png), [đã lưu nhưng mất phản hồi](regression/worker-saved-response-lost-keeps-values.png).
