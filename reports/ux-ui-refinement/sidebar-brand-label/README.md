# Tên đầu menu chỉ còn Hiền Xa ERP

Theo bình luận trình duyệt của chủ hệ thống ngày 13/10/2026, phần brand của menu chỉ hiển thị “Hiền Xa ERP”; bỏ ô HX và dòng phụ “Điều hành”. Giữ nút đóng menu vì đó là thao tác điều hướng, không phải biểu tượng thương hiệu. Không đổi các nhóm chức năng, đường dẫn hoặc avatar tài khoản.

Source: src/components/app-shell.tsx. Chỉ đổi markup tên; không thay hooks, bộ lọc quyền, điều hướng, trạng thái mở/đóng, bàn phím hoặc server/API/schema. Bản này được phát hành cùng spacing đã merge trong PR46, không triển khai riêng bản trung gian.

Local lint/typecheck và 16 kiểm thử AppShell đạt (đích điều hướng, quyền ẩn/hiện, Escape, focus, mở/đóng). Build và CI phải đạt trước merge/phát hành. Hai race ứng trước không chạy lại. Kiểm chứng browser Production có đăng nhập sau phát hành sẽ ghi theo kết quả thật; chưa ghi ca chưa chạy thành đạt.
