# Tinh chỉnh giao diện theo nhận xét 13/10/2026

Taste redesign-existing-projects, nguồn d237dd399d57524945c0c81327da5da19f7a468d; giữ Noto Sans, màu, menu, bảng, đường dẫn và nghiệp vụ hiện hữu. Một agent.

## Thay đổi

- Header, nút và nhịp card/filter/table trên products, customers, dispatch, AR/AP, expenses, invoices/purchases, settings và reports. Grid giới hạn min-width để bảng cuộn trong vùng riêng.
- Hai thẻ chi phí/hoa hồng có padding/gap; chỉ số dashboard xuống số cột phù hợp vùng nội dung.
- Sidebar chỉ chữ Hiền Xa ERP; ẩn scrollbar vẫn cuộn bằng bánh xe/chạm/bàn phím. Bỏ nhãn branch trên topbar; tên tài khoản vẫn bên phải. Không đổi phạm vi chi nhánh.
- SO/báo giá: hàng tìm kiếm gọn, dropdown kho dùng chung field, lời hướng dẫn ngắn; bỏ đúng footer giá người dùng yêu cầu. Giữ unknown khác 0, giá preview/server, quantity, payload, retry và nonce.
- Ngoại lệ tín dụng dùng card/field/button hiện hữu, 5 giá trị còn nguyên. Bỏ khối trạng thái lặp khi không có ngoại lệ; hàng trên xe/trả/hoàn/bù trừ/hoa hồng/chứng từ mở vẫn hiển thị. Nút Tạo phiếu giao.
- Bỏ đúng banner lịch sử ở inventory/cashbook. Không đổi trạng thái lịch sử tại model, báo cáo hoặc settings.

## Bằng chứng và giới hạn

32 cặp màn hình tại 1007px và 390px, 16 màn hình, Owner QA qua Auth thật và SQL thật trên DB cô lập schema188. BROWSER_BEFORE/AFTER và before/after. So cột bảng không mất, không tràn trang; lỗi grid lần đầu đã được sửa trước ảnh cuối. Mobile trước cao779/sau844: so cùng chiều rộng và nội dung, không gọi cùng kích thước toàn bộ. Ảnh được chụp trước thay đổi nhỏ cuối cùng về chữ topbar; kiểm thử AppShell và kiểm đọc sau deploy bổ sung phần này.

BROWSER_AFTER ghi ca hộp thoại nằm trong màn hình, giữ note/quantity 2.123456 khi đóng/mở menu, wheel cuộn với scrollbar ẩn, Escape trả focus, kho thật 1/0/1. QA_FINAL_READBACK chứng minh bản nháp SO420 lưu đúng 1×230.000đ; kho, giữ chỗ, payment/allocation và verification khớp QA nguồn, không ghi sổ thử.

Luồng 15→14→13/thu1.000.000đ và phân quyền8 loại tài khoản dùng lại bằng chứng đợt UX trước tại ../UX_BROWSER.json khi các action/RPC/schema giữ nguyên; không tự gọi là chạy lại toàn bộ nghiệp vụ lần này. Người dùng chủ động kiểm tra giao diện bằng tay. Receiver ở lần kiểm cuối bị gián đoạn, không ghi đạt mới; không dùng ảnh loading làm bằng chứng.

36 kiểm thử thành phần/ngoại lệ và12 kiểm thử credit-action/dashboard đạt; lint/typecheck/build đạt. CI phải xác nhận đúng commit cuối trước merge. Không migration, thay API/RPC/schema/quyền/tính tiền hoặc số dư mặc định. Không thêm thư viện. Hai race ứng trước loại trừ chính xác trong VERIFICATION.json; giữ bằng chứng600.000/400.000.

## Phát hành và phục hồi

PR47 cập nhật theo phạm vi cuối; CI head và merge phải đạt. Deploy ứng dụng tới project hien-xa-erp-v2/ref nbwynrwkdbtfsitafsxa, cùng schema188 (lịch sử thực182). Không chạy lại dọn UAT; SO/DL mới người dùng đang tạo phải được giữ. Backup đã được người dùng miễn, không ghi đạt restore. Quay lại ứng dụng artifact 68903bb: dpl_FxnSHkLvfVdBAS8p3GgVM3AxyXva; DB188 giữ nguyên. GPS/hóa đơn thật vẫn hoãn, không phát hành giả.

Kết quả CI/deploy/kiểm đọc thực tế được ghi tại RELEASE_RESULT.json và DOD.md sau khi chạy. Hồ sơ này nghiệm thu đợt UI, không thay DOD toàn ERP87 trang/24API.
