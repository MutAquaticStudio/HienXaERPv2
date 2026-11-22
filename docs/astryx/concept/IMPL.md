# Triển khai thật: dựng giao diện Astryx theo concept vào app (repo /home/user/HienXaERPv2)

Đã có: công tắc kiểu giao diện (src/lib/appearance.ts, cookie, `currentSkin()` ở src/lib/skin.ts); khung admin Astryx
(src/components/astryx/astryx-app-shell.tsx, đã nối ở src/app/admin/layout.tsx); bộ CSS concept src/components/astryx/ax.css (class hx-*,
nằm trong .ax-root); kit src/components/astryx/ax-kit.tsx (AxStatus, AxPerson, AxButtonLink, AxPageHead, AxFilterRadios) và ax-expand-row.tsx;
MẪU ĐÃ LÀM: src/app/admin/orders/page.tsx (trước `return` Classic có `if ((await currentSkin()) === "astryx") return <AstryxOrdersView .../>`)
+ src/app/admin/orders/astryx-view.tsx + astryx-view.test.tsx. ĐỌC các file này trước và làm đúng mẫu đó.

Nguồn concept (đã duyệt, React dựng sẵn bằng Astryx): /tmp/ax/src/ — lib.jsx (Shell, ListPage, DetailPage, FormPage, Kpi, Grid, Field, Phone, Steps...),
s1.jsx (danh sách admin), b1/*.jsx (bán/mua/kho), s2b.jsx (giao hàng/tài chính/nhân công/hệ thống/popup/mẫu in), s3a.jsx (cổng thợ, công khai),
s3b.jsx (cổng khách, kể cả bản -pc), hx.css. Mỗi màn có id (xem /tmp/ax/meta.json: id, route, tpl, note). Ảnh chụp cũ ở /tmp/ax/shots/final/<id>.png
(chỉ vài chục ảnh) — ưu tiên đọc code concept. Concept chỉ là hình thức; DỮ LIỆU THẬT lấy từ page.tsx hiện có.

QUY TẮC (bắt buộc, theo CLAUDE.md/AGENTS.md của repo; đọc nhanh CLAUDE.md):
1. KHÔNG làm đổi Classic: view Classic giữ nguyên; chỉ thêm early-return theo `currentSkin()` ngay sau khi dữ liệu đã tải, trước JSX Classic. Dùng cùng dữ liệu,
   quyền, server action, operationId/expectedVersion, validate, lỗi tiếng Việt. KHÔNG sửa Spec.md/UXUI.md/plan.md/tasks.md. KHÔNG migration. KHÔNG đụng Supabase/Vercel.
2. NHÃN VÀ NGHIỆP VỤ THẬT THẮNG CONCEPT: concept có chỗ tự đặt/lệch. Luôn lấy nhãn trạng thái từ src/modules/*/presentation.ts, menu cổng khách/thợ từ
   src/components/portal/portal-shell.tsx (cổng khách 6 mục có nút "Đặt" nổi mở tờ Hàng hóa/Dịch vụ D75; thợ: Hôm nay, Nhận việc, Điều phối (thợ chính), Thu nhập, Tôi), đơn mua theo purchaseStateLabel.
   Khi concept mâu thuẫn Spec.md/UXUI.md (Grep theo mã mục, không đọc cả file) thì theo Spec/UXUI và ghi chú vào báo cáo.
3. Dùng component Astryx thật khi hợp (Badge, Avatar, Button, Card, Banner, Table, Tabs/TabList, Dialog, Switch, ProgressBar, Stepper...) — xem `npx @astryxdesign/cli component <Tên>`;
   component cần client thì đặt trong file "use client". Chữ tiếng Việt; chữ ≥13px; một nút chính mỗi màn; xanh lá #12804A chỉ cho hành động tiền/hoàn tất; số căn phải.
4. Form/popup có server action: tái dùng đúng form/action Classic hiện có (import lại component chức năng); chỉ dựng lại lớp trình bày. Nếu một form Classic không thể đưa vào khung mới
   mà không viết lại, bọc nó trong thẻ Astryx và để nguyên bên trong (còn hơn làm hỏng nghiệp vụ).
5. Mỗi view Astryx kèm test (render, nhãn tiếng Việt, liên kết/quyền chính) theo mẫu astryx-view.test.tsx. Chạy `pnpm vitest run <thư mục>`, `pnpm typecheck`, `pnpm lint` cho phần của bạn; sửa lỗi của bạn.
   Nhiều agent làm song song trong CÙNG cây git: chỉ tạo/sửa file thuộc phần của bạn; KHÔNG sửa ax-kit.tsx, ax.css, astryx-app-shell.tsx, appearance.ts (cần thêm thành phần dùng chung → tạo file riêng
   src/components/astryx/<nhóm>-*.tsx hoặc .module.css/.css của bạn). Lỗi typecheck/test ở file người khác: bỏ qua. KHÔNG git commit/push (tôi sẽ commit).
6. Phạm vi từ concept: màn chính + popup/hộp thoại + mẫu in thuộc nhóm của bạn; popup là hộp thoại Astryx (Dialog) mở từ nút hiện có, giữ action hiện có.
7. Cuối cùng báo cáo ngắn: route đã dựng (liệt kê), route chưa làm và lý do, chỗ concept lệch Spec/app đã chỉnh, file đã tạo.
