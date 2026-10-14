# DOD mẫu chứng từ PDF

- [x] Xác minh nền main/Production cb6ad38 và bảo toàn checkout gốc.
- [x] SO/PO/phiếu giao có mẫu A4 đầy đủ và điểm tải trên chi tiết chứng từ.
- [x] Tiếng Việt, khoảng cách, dòng dài, xuống trang, phần ký và số trang đã kiểm tra trên PDF render.
- [x]16test liên quan; typecheck/lint đạt;13ca HTTP có Auth/RLS/DB QA thật.
- [x] Tải ba PDF qua trình duyệt Owner QA; bản PO kho không lộ giá; thợ/sai chi nhánh bị từ chối.
- [x] Không sửa nghiệp vụ/schema/quyền;122bảng QA không đổi; không chạy hai race ứng trước.
- [x] Các mẫu minh họa ghi rõ, có thể xem riêng trước khi áp dụng.

Build: xem checks/build.log. CI cuối: xem check gắn chính xác head PR; khi ghi báo cáo đang chờ tạo PR, không ghi đạt trước khi CI hoàn tất. Kết quả cuối được cập nhật trong mô tả PR.

Không triển khai Production trong phạm vi tạo mẫu này. Không tự bịa pháp nhân/MST/VAT/tài khoản ngân hàng; chưa kiểm thử in vật lý.
