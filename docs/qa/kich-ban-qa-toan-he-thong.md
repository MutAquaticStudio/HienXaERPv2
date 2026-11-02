# Kịch bản QA toàn hệ thống — kết quả lần chạy 02/11/2026

- **Môi trường:** QA (Supabase `ffrwiglcrlumfvhubaxg`).
  - Ứng dụng: bản Preview Vercel `hien-xa-erp-v2-5fa5wkjbe` = `main` @ `6215053` (đã có D44 + D45), vùng icn1.
  - Lần chạy đầu của lớp 1 dùng `next start` cục bộ nối QA.
- **Cách chạy:** Playwright tự động (`scripts/qa/system-qa`), đăng nhập bằng 3 tài khoản thử của QA (chủ doanh nghiệp, Thợ 01, khách KH01).
  - Màn hình điện thoại 390 px cho cổng thợ và cổng khách; màn hình 1440 px cho quản trị.
- **Kiểm chứng sổ sách:** sau mỗi bước tiền/kho, đối chiếu thẳng trong database QA (chỉ đọc).

## Tổng kết

| Hạng mục | Kết quả |
|---|---|
| Lớp 1 — mở mọi màn hình (46 màn quản trị, 7 cổng thợ, 7 + 4 cổng khách) | **65/68 đạt**. 3 màn 404 là **đúng thiết kế** (Báo giá, Báo chuyển khoản đang tắt bằng cờ). Không lỗi console, không chữ tiếng Anh/"undefined". |
| Tốc độ trên Preview (icn1) | Trung vị ~1,1 giây/trang, chậm nhất 2,0 giây (`/work/earnings`, `/admin`). |
| Lớp 2 — 23 bước nghiệp vụ đầu-cuối | **21 đạt**, **1 bị chặn do môi trường QA** (tải ảnh), **1 phát hiện lỗi sổ sách → đã sửa** (PR kèm test). |
| Bố cục | **1 lỗi giao diện:** thanh menu chồng chữ ở 1280–1440 px khi khung "Người liên hệ" mở. |

## Lớp 2 — các bước và kết quả

| # | Vai trò | Bước | Kết quả |
|---|---|---|---|
| 1 | Chủ | Tạo đơn bán (khách, công trình, 10 kg xi măng) → bảng kiểm tra → Xác nhận | ✅ SO-2026-000075; tự tạo phiếu giao DL-2026-000030 (D19) |
| 2 | Chủ | Điều phối: hàng "Chờ điều phối" → **Gán** nhanh người + xe | ✅ (mục 2 mới) |
| 3 | Chủ | Phiếu giao: **Phân người và xe** đổi sang Thợ 01 | ✅ |
| 4 | Thợ (ĐT) | Thấy việc WRK-202611-000014, mở chi tiết (khách, hàng, số lượng, người nhận, Gọi, Chỉ đường) | ✅ |
| 5 | Thợ (ĐT) | **Đã lấy hàng lên xe · chụp ảnh** | ⛔ **Bị chặn do môi trường:** Preview không có `SUPABASE_SECRET_KEY` (chỉ Production có) → "Private evidence storage is not configured". Vì vậy chưa chạy được: giao xong, xác nhận giao, tự sinh công nợ từ giao hàng. |
| 6 | Thợ (ĐT) | Vào ca (có vị trí) | ✅ |
| 7 | Khách (ĐT) | Tự đặt đơn 2 mặt hàng → Xem & gửi (570.000 ₫) | ✅ SO-2026-000076 "Chờ duyệt"; thông báo "Đơn mới từ khách" |
| 8 | Chủ | Duyệt đơn khách (giữ hạn mức, tự phân nguồn) | ✅ đơn Đã xác nhận, tự tạo DL-2026-000031 (2 dòng từ kho) |
| 9 | Chủ | Tạo đơn mua về kho (50 kg × 1.500 ₫) | ✅ PO-2026-000072 |
| 10 | Chủ | Ghi đã gửi NCC (Zalo) → Nhận đủ hàng | ✅ kho +50 kg, giá trị 75.000 ₫; công nợ phải trả 75.000 ₫; đơn mua Đã đóng |
| 11 | Khách (ĐT) | **D45:** chọn SO-075 + SO-076 → "Trả tiền mặt tại cửa hàng" | ✅ YCEW6J3, 5.500.000 ₫, chưa ghi sổ; khi QR tắt chỉ hiện nút tiền mặt |
| 12 | Kế toán | Sổ quỹ → **Chờ thu tiền mặt** → Xác nhận đã thu **5.000.000** (thiếu 500k) | ✅ 1 phiếu thu tiền mặt REC-202611-000074; SO-075 −1.500.000 (hạn sớm hơn trước), SO-076 −3.500.000; đầu kỳ không đụng; yêu cầu "Đã trả một phần" |
| 13 | Khách | Công nợ sau khi trả | ✅ Còn phải trả 10.500.000 ₫ |
| 14 | Chủ | Sổ quỹ: thông tin chuyển khoản + "Hiện cho khách" + **Tự ghi tiền về (SePay)** | ✅ |
| 15 | Khách (ĐT) | **D44:** Chọn tất cả → "Chuyển khoản 2 khoản" → QR | ✅ 10.500.000 ₫, nội dung `TT KH01 YCY9724` |
| 16 | (SePay giả lập, có chữ ký) | Tiền về đúng mã | ✅ 1 phiếu thu chuyển khoản REC-202611-000075, **tự đối soát**; chia đúng SO-076 500k + 3 khoản đầu kỳ; khách hết nợ |
| 17 | (SePay giả lập) | Khách chuyển **trùng** cùng mã | ✅ vào "Giao dịch ngân hàng chờ xử lý", lý do đúng, không ghi sổ |
| 18 | Kế toán | Sau QR: Sổ quỹ / cổng khách | 🐞 **Lỗi:** yêu cầu tiền mặt YCEW6J3 vẫn ở "Chờ thu tiền mặt" (nút Xác nhận đã thu) dù các khoản đã trả hết qua QR. Thu thêm sẽ thành ứng trước sai. **Đã sửa** (xem dưới). |
| 19 | Chủ | Ghi chi phí chung 250.000 ₫ từ quỹ tiền mặt | ✅ vào "Chờ duyệt" |
| 20 | Chủ | Kiểm kho: đếm, xi măng lệch −2 kg → Hoàn thành & cân bằng | ✅ điều chỉnh −2 kg, −3.200 ₫ |
| 21 | Chủ | Hồ sơ khách → Công nợ & thanh toán → **Thu nợ** | ✅ danh sách yêu cầu có cột Cách trả |
| 22 | Thợ (ĐT) | **Từ chối việc** (C2) kèm lý do | ✅ phiếu về Chờ điều phối, loại Thợ 01 khỏi lần tự điều phối sau, thông báo kèm lý do |
| 23 | Chủ (2 máy) | Đăng xuất máy A | ✅ máy B vẫn đăng nhập (đã kiểm bản sửa lỗi tự đăng xuất) |

## Phát hiện

| Mức | Phát hiện | Xử lý |
|---|---|---|
| **Cao (sổ sách)** | Yêu cầu thanh toán không theo kịp khi các khoản của nó được trả bằng chứng từ khác → còn hiện ở "Chờ thu tiền mặt", có thể thu thêm sai. | **Đã sửa:** migration `20261102090000_d45_requests_follow_allocations.sql` (mỗi lần trừ/đảo tiền vào một khoản nợ thì tính lại các yêu cầu chứa khoản đó; hết nợ = Đã thanh toán; tính lại yêu cầu đang mở khi áp). Test native `320` (đỏ khi bỏ bản sửa). |
| Trung bình (giao diện) | Thanh menu xanh chồng chữ ở 1280–1440 px khi khung "Người liên hệ" (280 px) mở: nút nhóm co nhỏ hơn chữ (`.nav-group { min-width: 0 }`). | **Đã sửa:** nút menu không co nhỏ hơn chữ; khi chật ẩn biểu tượng nhóm rồi mũi tên; bất đắc dĩ mới xuống dòng. Đo lại 1180–1920 px (khung liên hệ mở): 1 dòng, không chồng. |
| Trung bình (môi trường QA) | Preview thiếu `SUPABASE_SECRET_KEY` (QA) → thợ không tải được ảnh trên QA; luồng giao hàng – xác nhận – công nợ không thử được trên QA. Preview cũng không có SMTP / `HX_AUTOMATION_SECRET` (email, đẩy thông báo). | Owner thêm khóa **QA** vào biến môi trường Preview trên Vercel (không dùng khóa Production). |
| Thấp | Tự điều phối báo "Chưa có xe có sức chở…" khi nguyên nhân thực là xe **chưa xác nhận sức chở** (QA). Production: 4 xe đã xác nhận, chế độ Gợi ý, chưa có tài xế mặc định. | Đề xuất câu báo nói rõ "xe chưa xác nhận sức chở". |
| Thấp | Cửa sổ QR liệt kê từng khoản đầu kỳ riêng (3 dòng "Số dư đầu kỳ") thay vì gộp như danh sách nợ. | Đề xuất gộp theo đơn khi hiển thị. |
| Ghi chú | Ô "Người giao" có cả "Chủ doanh nghiệp" (người có quyền giao việc). | Đúng quyền hiện tại; có thể lọc nếu Owner muốn. |

## Chưa phủ trong lần này
Giao hàng hoàn tất và xác nhận giao (cần ảnh — bị chặn trên QA); trả hàng; chuyển kho; lương / thu nhập thợ (chỉ mở màn); nội dung báo cáo; tin nhắn, trợ lý AI; PDF (chỉ kiểm link); email / thông báo đẩy; Zalo; thiết bị thật iOS/Android.

## Dữ liệu thử đã tạo trên QA
- Đơn SO-2026-000075/076, phiếu giao DL-030/031, đơn mua PO-072 (đã nhận), chi phí "Xăng xe QA", 1 phiếu kiểm kho.
- Công nợ thử của KH01: 3 khoản đầu kỳ + 2 khoản gắn đơn, chèn bằng SQL (tắt trigger trong 1 transaction) vì QA không tải ảnh để giao hàng được.
- 2 yêu cầu thanh toán, 2 phiếu thu, 1 giao dịch ngân hàng chờ xử lý.
- Quỹ Vietcombank QA bật SePay, khóa webhook thử trong Vault QA.
- Đổi mật khẩu 3 tài khoản thử QA (không ghi vào repo).
