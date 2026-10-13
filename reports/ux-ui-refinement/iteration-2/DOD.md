# DOD đợt giao diện bổ sung

- [x] Taste đã đọc; giữ cấu trúc/phong cách và không thêm phụ thuộc.
- [x] Các nhận xét giao diện được tích hợp trong PR47.
- [x] 16 màn hình QA tại hai chiều rộng; cột và dữ liệu giữ nguyên; lỗi overflow đã sửa.
- [x] Hộp thoại, menu/scroll/focus và nội dung nhập được kiểm tra trên trình duyệt.
- [x] Bản nháp đọc lại độc lập đúng tiền/lượng; không có tác động kho/thu chi mới.
- [x] Lint, typecheck, 48 kiểm thử liên quan và build đạt trên mã cuối.
- [ ] CI đúng head cuối và commit merge đạt.
- [ ] Merge PR47 và deploy đúng Production.
- [ ] Kiểm đọc sau deploy đúng commit, schema và giao diện.
- [x] Không chạy lại hai race ứng trước; không migration/dọn dữ liệu thêm.

Người dùng tự kiểm giao diện thủ công theo chỉ đạo mới. Nghiệm thu toàn ERP vẫn theo ma trận riêng, không chuyển các ca chưa chạy thành đạt. Sao lưu/restore Production: miễn theo yêu cầu, không thực hiện.
