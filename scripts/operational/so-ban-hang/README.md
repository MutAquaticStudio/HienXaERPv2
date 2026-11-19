# Nhập sổ bán hàng hằng ngày vào ERP

Owner (14/11/2026): *"Từ hôm nay vào 7h30 sáng mỗi ngày vào sheet 11.26 nhập đơn mới, tạo phiếu giao và kiểm kho như hôm nay chúng ta làm."*
Đây là lệnh thường trực của Owner cho việc **ghi dữ liệu Production** (`nbwynrwkdbtfsitafsxa`) theo đúng quy trình dưới đây, không gì khác.

## Nguồn

- Sổ gốc: Google Sheets `1QHBCyLwyWbddiTSG6vvFQ0jOFVW5jRopnnTje11JOaU` ("Demo"), tab tháng dạng `M.YY` (`11.26`, `12.26`, `1.27`…),
  dữ liệu từ dòng 8, cột A..R (TT, ngày, SĐT, tên KH, địa chỉ, vật tư, ĐVT, đơn giá, SL, thành tiền, …, người giao (P), …, ghi chú (R)).
- **Không** dùng bản sao "Bản sao của Demo ver3" (`1uZGx9z1…`): bản đó do một script đồng bộ sinh ra, có lúc lệch số TT và thiếu ngày.
- TT của sổ gốc là khóa: dòng đã nhập có dấu `Sổ <tab> dòng <TT> ·` trong đơn bán (`commercial_terms`) hoặc việc dịch vụ (`description`).

## Mỗi lần chạy (7h08 sáng, giờ Việt Nam)

1. Tab cần nhập: tab của **hôm qua** và tab của **hôm nay** nếu khác (ngày 1 đầu tháng còn dòng cuối tháng trước). Tab chưa có thì bỏ qua.
2. TT đã nhập của tab (thay `11\.26` bằng tab, dấu chấm có `\`):
   ```sql
   with t as (
     select substring(commercial_terms from '^Sổ 11\.26 dòng ([0-9]+) ·')::int as tt from public.sales_orders where commercial_terms like 'Sổ 11.26 dòng %'
     union select substring(description from '^Sổ 11\.26 dòng ([0-9]+) ·')::int from public.service_jobs where description like 'Sổ 11.26 dòng %'),
   g as (select tt, tt - row_number() over (order by tt) as grp from t where tt is not null)
   select coalesce(string_agg(case when lo = hi then lo::text else lo || '-' || hi end, ',' order by lo), '') as da_nhap
   from (select min(tt) as lo, max(tt) as hi from g group by grp) z;
   ```
3. Đọc sổ: Google Sheets `get_values`, range `'<tab>'!A8:R1500`. Kết quả lớn được lưu thành file; nếu trả thẳng thì tự ghi JSON ra file.
4. Tạo câu SQL: `python3 -I scripts/operational/so-ban-hang/tao-lenh-nhap.py <file> <tab> "<da_nhap>" > lenh.sql`
   (nối thêm vào `<da_nhap>` các TT trong mục **Dòng Owner cho bỏ qua** bên dưới, để không gửi lại và không báo lại).
   (thêm `--kho` để chạy khô). Script bỏ dòng đã nhập và dòng thu tiền, ghép `nhap-so-hang-ngay.sql` với lệnh gọi.
   0 dòng → không cần chạy bước 5–6.
5. Gửi **nguyên** `lenh.sql` bằng Supabase `execute_sql` (Production). Kết quả là báo cáo JSON (`bao_cao`).
   Lỗi cả khối (không phải `DRY OK`) nghĩa là **không có gì được ghi**; báo lỗi cho Owner, không thử sửa dữ liệu bằng tay.
6. Gửi nguyên `dong-bo-ngay.sql` (đặt giờ chứng từ theo ngày sổ; hạn nợ = ngày sổ + hạn nợ của khách, mặc định 14 ngày,
   Owner 16/11/2026 đổi 7 khách KH009, KH051, KH064, KH066, KH068, KH071, KHBL thành 28 ngày). Cột `don_lech` và `dich_vu_lech` phải bằng 0.
   Nếu bước này không chạy được (máy chủ hỏi xác nhận mà không ai trả lời…), lần chạy sau sẽ tự làm bù; báo Owner.
7. Báo cáo cho Owner bằng tiếng Việt, ngắn: số dòng đã nhập, tiền hàng, tiền dịch vụ, khách mới, mặt hàng bù tồn (số lượng + giá vốn),
   **từng dòng giữ lại kèm lý do** (TT, ngày, khách, hàng), dòng lệch tiền so với sổ, số dòng hôm nay để mai.

## Dòng Owner cho bỏ qua

- Tab `11.26`: dòng **454, 455** (trùng đơn SO-2026-000353) và **465** (trùng đơn SO-2026-000399): Owner 16/11/2026 "trùng rồi thì bỏ qua".

## Quy tắc trong `nhap-so-hang-ngay.sql`

| Dòng sổ | Làm gì |
| --- | --- |
| Ngày từ hôm nay trở đi | Để lần sau (sổ trong ngày còn đang ghi). |
| "Thanh toán công nợ", "Điều chỉnh V", vật tư trống | Bỏ qua (Owner cho bỏ phiếu thu công nợ). |
| Vật tư (bảng `stock_map`), người giao là nhân viên | Đơn bán (giá theo sổ) → xác nhận → phiếu giao (xe theo ĐVT, mặc định Xe cn nhỏ) → giao đủ → xác nhận giao. |
| Người giao trống | Khách tự tới lấy (Owner 15/11/2026): hàng xuất kho, vẫn có phiếu giao, người giao ghi "Khách tự lấy", không gắn nhân viên, không gắn xe. Dịch vụ người làm trống thì giao cho chủ doanh nghiệp. |
| Người giao trùng tên một nhân viên của chi nhánh | Hàng kho, giao cho nhân viên đó. |
| Người giao là tên khác (Owner 15/11/2026: "ngoài tên nhân viên thì đều là nhà cung cấp giao") | Nhà cung cấp giao thẳng (Văn An là một trong số đó): tìm NCC theo tên trước dấu ngoặc hoặc mã; chưa có thì **tạo NCC mới** (`NCC###`) và báo. Đơn mua + đơn bán liên kết, giá mua theo Bảng giá mua của NCC, chưa có thì 85% giá bán, không ảnh, ghi công nợ phải trả. Dịch vụ do người ngoài làm thì giữ lại. |
| Dịch vụ (tên + ĐVT trùng một loại dịch vụ) | Việc dịch vụ → giao người → làm → nộp → xác nhận, tiền = thành tiền sổ, hạn nợ +14 ngày. |
| Khách | Theo tên (duy nhất) → theo SĐT (duy nhất) → tạo khách mới `KH###` (hạn nợ 14 ngày) + công trình CT1. |
| Kho không đủ | Một phiếu kiểm kho bù đúng phần thiếu, giá vốn 85% giá bán trung bình, duyệt luôn. |
| Trùng đơn đã có trong ERP (khách đặt trên cổng / nhập tay: cùng khách, hàng, ĐVT, số lượng, ±1 ngày) | **Giữ lại**, văn phòng chọn giữ một bên. |
| Không rõ người giao, chưa có loại dịch vụ / đơn vị / quy đổi, trùng tên khách, lỗi khi tạo | **Giữ lại** và báo; ngày mai tự thử lại. |

Mỗi dòng được tạo trong một giao dịch con: dòng lỗi chỉ bị giữ lại, các dòng khác vẫn vào. Mã thao tác (operation id) cố định theo
`tab + TT`, nên gửi lại cùng dữ liệu không tạo trùng.

## Thử

- QA 15/11/2026 (Owner: "nhập ở QA"): chép danh mục từ Production sang QA (chi nhánh `HXQA-A`, tài khoản `a0d17000-…-0001`), nhập cả sổ 11.26
  (418 dòng) bằng `hx_nhap_so(…, 'HXQA-A', '<tài khoản>')` rồi `hx_dong_bo_ngay('HXQA-A', '<tài khoản>')`: 379 đơn + 39 việc dịch vụ, tiền hàng và
  dịch vụ đến 13/11 khớp Production (544.011.396 đ và 20.770.000 đ); Văn An đúng 2 đơn (dòng 178, 367), dòng 22 là hàng kho; dòng giả 9001
  (người giao "TÚ SẮT") tạo NCC mới NCC002; không mặt hàng nào âm kho; ngày chứng từ khớp sổ. Giữ lại đúng dòng 418 (ĐVT "Xe rùa").

- Chạy khô: thêm `--kho` ở bước 4 (tự hủy, trả lỗi `DRY OK {báo cáo}`). Muốn thử cả dòng của hôm nay:
  `select pg_temp.hx_nhap_so('11.26', $rows$[...]$rows$::jsonb, true, '<ngày mai>');` (chỉ chạy khô mới được đặt ngày).
- 14/11/2026: chạy khô trên Production với các dòng 410–455 và 4 dòng giả; chạy thật + đồng bộ ngày trong một giao dịch rồi tự hủy:
  đơn, phiếu giao, dịch vụ, Văn An, khách mới, bù tồn và ngày chứng từ đều đúng; giữ lại đúng dòng ĐVT "Xe rùa" (chưa có trong ERP)
  và 2 dòng trùng đơn cổng khách SO-2026-000353.
