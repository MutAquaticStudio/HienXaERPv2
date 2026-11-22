# Brief chung: concept giao diện Hiền Xa ERP trên Astryx

Mục tiêu: một bộ MÀN HÌNH MẪU (ảnh chụp từ React thật dùng @astryxdesign/core) cho TOÀN BỘ route của ERP vật liệu xây dựng Hiền Xa. Chủ dự án chê bản nháp đầu "xấu hơn giao diện hiện tại" và yêu cầu "làm đẹp hơn nữa". Phải đẹp, tinh, có phân cấp thị giác rõ, không generic.

## Dự án web ở /tmp/ax (Vite + React 19 + @astryxdesign/core + theme-neutral + @stylexjs/stylex + @heroicons/react đã cài)
- src/hx.css: token màu/kiểu chữ + class tiện ích. src/lib.jsx: khung Shell (thanh tiện ích trắng + menu xanh ngang), ListPage, DetailPage, FormPage, SettingsPage, Phone, Auth, Grid, Kpi, Chip, Btn, Steps...
- src/s1.jsx: các màn DANH SÁCH admin (đã có bản nháp). Mẫu đăng ký: `def(id, route, template, note, Component, width)` đẩy vào mảng `M`. src/screens.jsx gộp các mảng M (s1,s2,s3...).
- Astryx: dùng component thật khi hợp (Button, Badge, Card, Table, Banner, ProgressBar, TextInput, Switch, Avatar, Stepper, Tabs/TabList, Dialog...). Xem API bằng `npx @astryxdesign/cli component <Tên>` và mẫu trang bằng `npx @astryxdesign/cli template <id>` (ids: dashboard, table-collapsible, table-comparison, payment-form, checkout-wizard, form-wizard-dialog, ai-chat, login, library, ...). Import theo đường dẫn con `@astryxdesign/core/Button`.
- Xây: `npx vite build --outDir dist-<tênBạn>` rồi `cd dist-<tênBạn> && python3 -m http.server <cổng riêng> &` ; chụp: `BASE=http://localhost:<cổng> OUT=shots/<tênBạn> NODE_PATH=$(npm root -g) node shot.js id1 id2@390` (đuôi @390 cho màn điện thoại). Xem ảnh bằng Read để tự kiểm tra bằng mắt, sửa tới khi đẹp. KHÔNG dùng chung thư mục dist/cổng với agent khác. Cổng: A=4201, B=4202, C=4203, D=4204.

## QUY TẮC UXUI BẮT BUỘC (từ UXUI.md của dự án, mục UX-UI-R1-001 D29 và các mục khác; đọc bằng Grep/Read đoạn liên quan ở /home/user/HienXaERPv2/UXUI.md, KHÔNG đọc cả file)
- Màu: xanh chính #0B63C6 (menu, nút chính, liên kết); xanh lá #12804A CHỈ cho hành động tiền/hoàn tất (Tạo đơn bán, Xác nhận đơn, Hoàn tất, Đặt hàng mới); cam #E8890C cảnh báo; đỏ #B4291F lỗi/xóa; nền #F2F5F9; chữ #10223A; phụ #5A6B82; viền #E3E9F1. Tương phản chữ ≥ 4.5:1.
- Chữ Be Vietnam Pro: chú thích 13, bảng 14, nội dung 15, tiêu đề mục 17, tiêu đề trang 22–26. Không dùng chữ 11–12px cho nghiệp vụ. Ô nhập trên điện thoại ≥16px.
- Khung vận hành: thanh tiện ích trắng + menu xanh ngang, mục đang ở "dính" nền trang như tab. Menu: Tổng quan, Bán hàng, Mua hàng, Kho hàng, Giao hàng, Tài chính, Nhân công, Hệ thống.
- Danh sách: khung trái = ô tìm + nhóm radio trạng thái có số đếm; bảng bên phải; mũi tên đầu dòng "Xem nhanh"; điện thoại mỗi dòng là một thẻ.
- Màn tạo đơn: dải xanh trên cùng bảng dòng hàng (ô tìm hàng F3, chọn kho xem tồn); cột phải dính: khách/công trình, tổng, giảm giá, trả trước, "Lưu nháp" + "Xác nhận đơn".
- Cổng điện thoại: menu dưới 64px biểu tượng + chữ, vạch xanh trên mục đang ở; nút chính 52–56px; bộ đếm −/+ 72px; nút kết thúc dính ngay trên menu dưới; tiến trình đơn 4 bước.
- Mỗi màn tối đa MỘT nút chính nổi bật; nhãn luôn hiện (placeholder không thay nhãn); trạng thái luôn chữ tiếng Việt + màu, không hiện mã enum; số căn phải, tiền VND "45.600.000 ₫"; Không 15-20 cột mặc định. Toàn bộ chữ tiếng Việt.
- Nghiệp vụ không được sai: trạng thái đơn Nháp/Đã xác nhận/Đang giao/Hoàn tất/Đã hủy + Khách đặt·Chờ duyệt; phiếu giao Chờ phân giao → Đã phân giao → Đang giao → Chờ xác minh → Đã xác minh (xác minh mới ghi công nợ); cổng khách chỉ có nhãn "Đã duyệt"; Báo giá đang tắt (D1); tồn kho = Tồn kho · Chờ xuất giao · Đã hứa · Có thể bán; thu tiền phân bổ khoản cũ nhất trước; công nợ khách QR/tiền mặt (D44,D45), SePay (D42).
- Dữ liệu minh họa hư cấu (không dùng tên/số điện thoại thật). Xem thêm /tmp/claude-0/-home-user-HienXaERPv2/0417063b-9bc4-5e99-84c5-f3bdd3fd0a9e/scratchpad/astryx-canvas/project/L1..L4*.dc.html để biết danh sách route và quy tắc từng luồng.
- Không sửa repo /home/user/HienXaERPv2 (chỉ đọc). Chỉ ghi trong /tmp/ax.
