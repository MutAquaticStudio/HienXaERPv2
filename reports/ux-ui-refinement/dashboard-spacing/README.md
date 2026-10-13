# Sửa khoảng cách hai khối Tổng quan

Căn cứ: hai bình luận trình duyệt của chủ hệ thống ngày13/10/2026, màn hình631×779. Chi phí vận hành và Hoa hồng phải trả sát viền thẻ; cụm thẻ chạm biểu đồ phía trên. Source baseline68903bb.

Nguyên nhân: DashboardDetails dùng `card stack` mà thiếu `card-pad`; `stack` không có quy tắc đệm trong CSS. Wrapper hai cột không có khoảng cách phía trên. Đo bằng thành phần/CSS thực: đệm0px, khoảng cách biểu đồ0px, nội dung cách biên chỉ1px viền.

Sửa: tái sử dụng card-pad22px cho hai thẻ; wrapper dashboard-details cách biểu đồ22px. Chỉ trong wrapper này, bỏ phần đệm danh sách/margin callout trùng và margin dưới của phần tử cuối. Giữ nguyên thứ tự, màu, kiểu chữ, h2, nội dung, phép tính, quyền, API/RPC và dữ liệu.

BROWSER_LOCAL.json:15 ca hiển thị thực trong trình duyệt ở390/631/1280px; mỗi kích thước gồm rỗng/có dữ liệu/chưa sẵn sàng/không quyền/bộ lọc không áp dụng. Đệm22px/gap22px, đủ hai tiêu đề, không tràn thẻ hoặc trang;0 lỗi console. Click Có dữ liệu đổi trạng thái hiển thị đúng. Bản xem cục bộ dựng từ chính React component/CSS, dùng dữ liệu mẫu riêng; **không phải bằng chứng tích hợp tài chính/Auth/DB**. Không ghi Production.

Ảnh trước/sau cùng kích thước trong thư mục này. Source component+CSS sau sửa SHA256221161528afc8ccdd28ebdf2d2203bb3ce0d16ef5df48626df5b2bb240fe42d2; đối chiếu với BROWSER_LOCAL.json. Không chạy lại hai race600.000đ/400.000đ.

Local: lint0 lỗi/13 cảnh báo sẵn có; typecheck đạt;6 kiểm thử dashboard-cutoff đạt; build đạt. CI đúng head, merge và bằng chứng Production của bản sửa sẽ ghi trong PR và POSTDEPLOY_FINAL sau khi thực hiện; chưa ghi chúng thành đạt tại thời điểm lập hồ sơ này.
