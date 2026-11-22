# Phân vai (đội thiết kế)
- A "ux-architect" (persona design/design-ux-architect.md + design-ui-designer.md): chủ hệ thiết kế. Sở hữu src/hx.css, src/lib.jsx, src/s1.jsx (các màn danh sách). Làm đẹp toàn bộ nền tảng: khung Shell, bảng, thẻ, chip, nút, form, khoảng cách, bóng, icon (@heroicons/react), nhịp chuyển động chỉ tĩnh. GIỮ NGUYÊN tên export và chữ ký của lib.jsx để các agent khác không gãy; chỉ thêm mới. Đọc /tmp/ax/REQUESTS.md để làm thêm thành phần các agent khác xin.
- B1 "ui-sales" (design-ui-designer.md): src/s2a.jsx — màn Bán hàng, Mua hàng, Kho (chi tiết/tạo/sửa).
- B2 "ui-ops" (design-ui-designer.md): src/s2b.jsx — màn Giao hàng, Tài chính, Nhân công, Hệ thống, Tổng quan, Báo cáo, AI, Dịch vụ.
- C1 "ui-work" (design-ui-designer.md + design-whimsy-injector.md ở mức tinh tế): src/s3a.jsx — Cổng thợ (/work) + trang công khai (đăng nhập, khôi phục, chọn chi nhánh, tải về, lỗi).
- C2 "ui-customer" (design-ui-designer.md): src/s3b.jsx — Cổng khách (/customer).
- D (sau): reviewer — design-persona-walkthrough.md + design-ui-finish-gate-reviewer.md: chấm và gửi phản hồi.
Mỗi file s2a,s2b,s3a,s3b xuất `export const M=[]` và đăng ký bằng hàm `def(id,route,template,note,Component,width)` như s1.jsx (sao chép đoạn `const def=...`). Khi cần thành phần chung mới: ghi vào /tmp/ax/REQUESTS.md (một dòng: ai xin, cần gì) và tạm tự làm cục bộ trong file mình. Ghi quyết định thiết kế quan trọng vào /tmp/ax/DECISIONS.md (thêm cuối file, không xóa dòng người khác).
