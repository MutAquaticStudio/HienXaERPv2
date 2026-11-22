# REVIEW R2 — màn điện thoại / công khai (work-, customer-, public-)

Đã xem bằng Read: 43/43 ảnh trong /tmp/ax/shots/final (work 16, customer 20, public 7) và đối chiếu /tmp/ax/meta.json. Đã cắt phóng to vài chỗ (nav khách, hàng nút thẻ xanh work-home) để xác nhận.
Cách đọc: đóng vai (A) thợ giao hàng ngoài công trình, tay bẩn, nắng, một tay; (B) chủ thầu nhỏ đặt hàng, theo dõi nợ; (C) khách lớn tuổi. Kèm cổng chặn "giao diện chung chung" (finish gate).

Cổng finish gate: **HOLD** cho cả cổng thợ và cổng khách cho tới khi hết mục "Chặn".

Tổng: Chặn 5 · Nên sửa 19 · Nhỏ 14

---

## CHẶN

**B1. work-* (mọi màn có thanh trên, 15 màn) — Nút "Đăng xuất" nằm ở thanh trên, mọi trang; tiêu đề bị cắt.**
Vấn đề: Thợ tay bẩn, một tay, dễ chạm nhầm (nút cao ~36px, sát chuông tin nhắn); đăng xuất giữa lúc đang giao làm mất luồng chụp ảnh/giao hàng. Nút này chiếm chỗ nên tiêu đề bị cắt: "Hiền Xa · …" (work-home), "Đổi mật k…" (work-change-password). Màn Tôi lại có thêm nút Đăng xuất riêng ở cuối, nên thanh trên là thừa. Nút cùng trạng thái thừa xuất hiện ở cả thanh trên của customer-* (xem N3).
Cách sửa: Bỏ "Đăng xuất" khỏi thanh trên của cổng thợ và cổng khách, chỉ để ở màn Tôi/Hồ sơ (có xác nhận). Thanh trên chỉ còn: Quay lại/Logo + tiêu đề đầy đủ + chuông/tin nhắn/vị trí. Kiểm tra lại không còn dấu "…" ở mọi tiêu đề.

**B2. work-dispatch — Tab "Đã giao hôm nay · 5" nhưng nội dung là người đang làm / chờ xuất kho.**
Vấn đề: Danh sách dưới "Đã giao hôm nay" liệt kê "Anh Hải · 2 việc · Đang giao PG-0409", "Anh Quân · Chờ xuất kho", "Anh Dũng · Đang giao PG-0412". Đó là việc ĐÃ PHÂN GIAO (Đã phân giao → Đang giao), chưa giao. Dùng "Đã giao" sai trạng thái nghiệp vụ (xác minh mới là chốt) và dễ gây hiểu nhầm với thợ chính khi điều phối.
Cách sửa: Đổi nhãn tab + tiêu đề mục thành "Đã phân giao · 5"/"Đã phân giao hôm nay"; chip cuối dòng dùng đúng trạng thái phiếu (Đã phân giao / Đang giao / Chờ xác minh).

**B3. work-job-delivered-photos — Nút "Xác nhận đã giao (2 ảnh)" bật trong khi ảnh thứ 2 còn "Đang tải".**
Vấn đề: Bộ đếm "2 / 5 ảnh" tính cả ảnh chưa tải xong. Thợ bấm xác nhận khi mạng yếu sẽ gửi thiếu bằng chứng (ảnh là chứng từ xác minh công nợ).
Cách sửa: Khi còn ảnh đang tải: nút xám/khóa, chữ "Đang tải ảnh (1/2)…", hoặc chỉ đếm ảnh "Đã tải". Hiện rõ ảnh lỗi + "Thử lại". Làm thêm 1 ảnh mẫu trạng thái lỗi để kiểm.

**B4. customer-register — Báo lỗi đỏ cho trường hợp không phải lỗi (D78), và form vẫn bấm gửi được.**
Vấn đề: Số điện thoại trùng khách có sẵn là "yêu cầu chờ văn phòng duyệt", nhưng giao diện vừa hiện dải vàng "Chờ văn phòng duyệt", vừa viền đỏ + chữ đỏ "Số này cửa hàng đã có…" dưới ô SĐT, nút "Đăng ký" vẫn sáng. Khách lớn tuổi hiểu là mình sai/thất bại và sẽ bấm lại, tạo nhiều yêu cầu. Hai thông điệp trùng nhau, một đỏ một vàng, mâu thuẫn.
Cách sửa: Sau khi gửi, thay cả form bằng màn xác nhận (biểu tượng đồng hồ, "Đã ghi yêu cầu, văn phòng sẽ gọi lại", nút "Về đăng nhập"). Ô SĐT bỏ viền đỏ; nếu cần cảnh báo trước khi gửi thì dùng màu xanh/cam trung tính, một câu duy nhất.

**B5. customer-reports-ordered — Số liệu tự mâu thuẫn, thiếu một loại hàng.**
Vấn đề: Thẻ ghi "5 loại hàng", "Tổng cộng 5 loại hàng", "Đã giao 2/5 loại đã giao đủ", nhưng chỉ có 4 thẻ (Xi măng, Cát, Gạch, Đá) — thiếu Thép phi 10 (đơn SO-0233 150 cây nằm trong "Theo ngày"); chỉ Cát ghi "0 · đủ" nên "2/5 đủ" sai. Hai tổng tiền khác nhau liền kề: "Tổng tiền 110.970.000 ₫" (đầu trang) và "Tổng cộng 108.470.000 ₫" (cuối danh sách hàng) mà không giải thích (chênh 2.500.000 = dịch vụ). Đây là màn khách đối chiếu tiền với cửa hàng, số sai là mất tin cậy.
Cách sửa: Sửa dữ liệu mẫu cho khớp (đủ 5 thẻ, đếm đủ đúng); chỉ giữ một tổng ở đầu, ghi "Hàng 108.470.000 + dịch vụ 2.500.000"; ở cuối bảng hàng ghi rõ "Tổng cộng hàng hóa" để khỏi trùng.

---

## NÊN SỬA

**N1. customer-* (mọi màn có menu dưới) — Nút xanh lá "Đặt" tròn nổi trên menu, chồng lên nội dung và trùng nút xanh lá chính.**
Vấn đề: customer-home có cả nút "Đặt hàng mới" xanh lá lớn lẫn nút tròn xanh lá trong menu: hai nút chính cùng việc. Nút tròn nhô lên khỏi menu, che mép nút cuối trang ở customer-order-rejected ("Gọi cửa hàng"), customer-service-detail ("Gọi cửa hàng"), customer-profile ("Đăng xuất"), customer-service-new ("Gửi yêu cầu"); nó cũng đứng sát thanh xanh "Xem & gửi đơn" ở customer-order-new. Màn công nợ/đặt dịch vụ có nút xanh lá không liên quan. Xanh lá phải dành cho hành động tiền/hoàn tất.
Cách sửa: Menu dưới 5 mục phẳng, cao 64px, vạch xanh trên mục đang ở (đúng UXUI), bỏ nút tròn. "Đặt hàng mới" chỉ là nút xanh lá ở Trang chủ và Đơn hàng. Chừa padding đáy ≥ 24px cho mọi trang cuộn.

**N2. customer-* menu dưới — Nhãn chật, sát nhau, ~12px.**
Vấn đề: Đã phóng to: "Trang chủ" và "Đơn hàng" gần dính nhau, "Trang chủ" sát mép trái; chữ nhìn ~12px (UXUI cấm 11–12px nghiệp vụ). Khách lớn tuổi đọc khó.
Cách sửa: Bỏ nút giữa (N1) để 5 mục chia đều ~78px, chữ ≥13px, hoặc rút còn 4–5 nhãn ngắn (Trang chủ, Đơn hàng, Công nợ, Báo cáo, Tôi); đo thật bằng trình duyệt.

**N3. customer-* thanh trên — "Đăng xuất" lớn, ngay cạnh chuông tin nhắn.**
Vấn đề: Khách lớn tuổi dễ bấm nhầm rồi mất phiên và không biết cách vào lại. Chuông tin nhắn dùng chấm đỏ (đỏ là lỗi/xóa).
Cách sửa: Như B1 (chỉ để ở Hồ sơ). Chấm số chưa đọc dùng xanh chính hoặc cam, không dùng đỏ.

**N4. work-home — Hàng nút trong thẻ xanh: vùng chạm nhỏ, chữ sát mép.**
Vấn đề: "Gọi / Chỉ đường / Mở việc" cao ~46px (dưới 52–56), "Chỉ đường" chạm viền phải của nút (không có đệm), và có 3 nút ngang nhau trong khi nút chính là nút trắng "Mở việc". Thợ đội nắng, găng tay: nhấn trượt.
Cách sửa: Hàng 1: "Mở việc" trắng rộng 100%, cao 52–56. Hàng 2: "Gọi" và "Chỉ đường" hai nút bằng nhau, cao ≥48, chữ không chạm mép. Địa chỉ + hàng gom bớt 1 dòng.

**N5. work-pool — Ba nút xanh đặc "Nhận việc này" liền nhau.**
Vấn đề: Vi phạm "tối đa một nút chính nổi bật"; dễ nhận nhầm việc khi cuộn bằng ngón cái, không có bước xác nhận. Tiền chuyến xanh lá tiền ok.
Cách sửa: Cả thẻ chạm vào mở chi tiết; nút "Nhận việc này" chỉ ở chi tiết/hoặc thẻ đầu, các thẻ còn lại dùng nút viền. Nếu giữ nút trên thẻ thì thêm xác nhận một chạm (thanh "Nhận PG-xxxx? [Nhận]").

**N6. work-job-detail / work-job-delivered — Nút phụ "Giao thiếu / Không giao được" là liên kết chữ nhỏ; tab 2 dòng.**
Vấn đề: Việc quan trọng nhưng vùng chạm ~20px, ngay sát nút xanh lá lớn (nhầm chạm). Ở màn "Báo đã giao", tab "Giao thiếu, không giao được" tự xuống 2 dòng, chữ xám nhạt, cao khác tab "Giao đủ", tương phản yếu khi nắng. Màn Giao thiếu không có ví dụ ô nhập số lượng thiếu.
Cách sửa: Nút phụ viền cao 48px, cách nút chính ≥12px. Tab ngắn: "Giao đủ | Giao thiếu" (phần "không giao được" vào bước sau), chữ đậm #5A6B82→#3C4B63. Thêm mẫu màn Giao thiếu (ô số lượng từng dòng + lý do).

**N7. work-job-delivered — Hai lối "chụp ảnh" cạnh nhau, xanh lá dùng cho số lượng.**
Vấn đề: Khung nét đứt "Chụp ảnh giao hàng" và nút xanh lá đáy "Đã giao · chụp ảnh" làm cùng việc, nhãn nút giống hệt nút ở trang chi tiết (không rõ đã đổi bước). Số lượng từng dòng (60 bao, 8,5 m³, 20 cây) tô xanh lá chữ: UXUI chỉ cho xanh lá hành động tiền/hoàn tất.
Cách sửa: Khi chưa có ảnh nút đáy khóa với chú thích "Cần ít nhất 1 ảnh" (hoặc nút chính mở camera, bỏ khung nét đứt), có ảnh thì "Xác nhận đã giao". Số lượng chữ #10223A đậm; xanh chỉ giữ dấu ✓.

**N8. work-job-delivered-photos — Nút xóa ảnh ~24px; huy hiệu "Đã tải" ~12px.**
Cách sửa: Nút xóa 40–44px (vẫn ở góc), chữ trạng thái ảnh ≥13px, tương phản chữ trắng trên ảnh dùng nền mờ đậm.

**N9. work-dispatch — Nút "Giao cho Hải/Quân", "Chọn người khác" cao ~44px; cảnh báo lặp.**
Vấn đề: Nút chính 44px (<52). Dải đỏ "1 việc bị từ chối, xử lý trước" lặp lại đúng thông tin trong thẻ đỏ ngay dưới, cộng chip "Bị từ chối" ~12px và nền đỏ trong thẻ: ba lớp đỏ chồng.
Cách sửa: Bỏ dải trên (hoặc chỉ để số đếm trong tab), nút "Giao cho Hải" 52px, "Chọn người khác" nút viền cùng cao.

**N10. work-tracking — Màn đang chia sẻ vẫn liệt kê "Các trạng thái có thể gặp" (cả cảnh báo "Chưa cho phép").**
Vấn đề: Đây là tài liệu hóa trạng thái, không phải trải nghiệm: thợ đang lái đọc cả ba trạng thái, "Hiện tại" chỉ là chip nhỏ. Vòng tròn đồng tâm là trang trí. Có tính chất generic.
Cách sửa: Chỉ hiện trạng thái hiện tại + một câu; trạng thái khác thuộc màn riêng (đã có work-tracking-denied). Thêm giờ ca còn lại / thời điểm cập nhật cuối làm nội dung chính.

**N11. work-profile — "Theo thiết bị" xuống 2 dòng làm lệch hàng chọn; "Cỡ chữ" không xem trước.**
Cách sửa: Đổi nhãn "Tự động" (1 dòng); chữ "Nhỏ/Vừa/Lớn" hiển thị theo cỡ tương ứng; hàng chọn cao 48px.

**N12. work-messages-chat — Sai phía bong bóng; ô nhập "Aa"; giờ nhỏ.**
Vấn đề: "Em báo lại chị nha." ở bên trái (của Cô Lan) nhưng nội dung là lời của thợ (Dũng) trả lời "chị" — phải nằm bên phải, màu xanh. Placeholder "Aa" không phải chữ Việt/không phải nhãn. Giờ gửi ~12px xám nhạt.
Cách sửa: Sửa dữ liệu mẫu; placeholder "Nhập tin nhắn…" (như cổng khách); giờ ≥13px.

**N13. work-messages — Biểu tượng tin nhắn trên thanh trên mất chấm số; ô tìm nổi đáy lệch.**
Vấn đề: Đang có tin chưa đọc (badge "2" ở danh sách) nhưng chuông trên thanh trên không hiện số (khác mọi màn khác). Ô "Tìm người…" dính trên menu dưới, phần giữa trống rộng, trông như thanh nhập chat chứ không phải tìm.
Cách sửa: Đồng bộ badge; đưa ô tìm lên đầu danh sách; hoặc bỏ nếu chỉ 5 người.

**N14. customer-order-new — Bộ đếm nhỏ hơn quy định; nút đơn vị bao/tấn nhỏ; thanh xanh sát nút tròn.**
Vấn đề: Brief: bộ đếm −/+ 72px; thực tế −/+ khoảng 52px rộng, chuyển đơn vị "bao | tấn" cao ~34px, chữ ~14px. Khách lớn tuổi gõ nhầm tấn thay bao là sai lớn (giá/đơn vị). Thanh "Tạm tính… [Xem & gửi đơn]" cùng hàng nút tròn xanh lá nhô lên sát bên dưới.
Cách sửa: −/+ 72px, ô số ở giữa ≥16px; chuyển đơn vị dạng segmented cao ≥44px, hiện rõ đơn giá theo đơn vị đang chọn; bỏ nút tròn (N1).

**N15. customer-home — Trạng thái đơn không thống nhất với thanh tiến độ; chữ phụ trên nền xanh yếu.**
Vấn đề: Thanh tiến độ ghi "Đã duyệt · Chuẩn bị · Đang giao · Hoàn tất", chip cuối danh sách ghi "Đã giao" (không có trong bộ trạng thái đơn Nháp/Đã xác nhận/Đang giao/Hoàn tất/Đã hủy + Khách đặt·Chờ duyệt) — cũng gặp ở customer-orders, customer-reports-ordered ("Đã giao 15/11"). Cần đối chiếu Spec: nếu đơn đã giao đủ + xác minh thì là "Hoàn tất". Nhãn các bước chưa tới (xanh nhạt trên nền xanh, 13px) tương phản ~3:1.
Cách sửa: Dùng đúng "Hoàn tất" cho đơn đã xong; chữ bước chưa tới trắng ≥ 80% hoặc ≥ 4.5:1.

**N16. customer-debts — Nút "Thanh toán" từng dòng 44px; "Thanh toán tất cả" xanh lá lớn + 5 nút viền.**
Vấn đề: Cao ~44px, rộng ~120px, rất lặp lại; dòng không quá hạn ("Hạn 02/12") không có trạng thái chữ rõ. Mã đơn SO/DV/"Số dư đầu kỳ" khách lớn tuổi khó hiểu khoản nào.
Cách sửa: Nút dòng ≥48px; mỗi dòng thêm mô tả hàng ("Xi măng · giao 12/11"); nhãn "Trong hạn" cho dòng còn lại; kiểm tra với nghiệp vụ (thu tiền phân bổ cũ nhất trước) xem "Thanh toán DV-0043" có phản ánh phân bổ thực tế không, nếu hệ thống tự phân bổ cũ nhất trước thì ghi rõ trên QR.

**N17. customer-pay-qr — Nút "Sao chép" nhỏ và lệch; không có hành động tiếp theo.**
Vấn đề: Hai nút sao chép cao ~38px, khác độ rộng/nhãn ("Sao chép" vs "Sao chép số TK"), số TK xuống 2 dòng không thẳng với nút. Dải vàng "Đang chờ tiền về…" nằm dưới mép màn, có thể bị che (không dính). Màn không có nút kết thúc (chỉ "Đóng" nhỏ ở góc).
Cách sửa: Nút sao chép cao 44px, cùng nhãn "Sao chép", số TK một dòng; dải chờ dính đáy với nút "Đóng" rộng (nút viền) để khách không phải với góc trên.

**N18. customer-reports-ordered — Quá nhiều khối cho khách lớn tuổi; số thiếu đơn vị.**
Vấn đề: 4 ô số + 5 thẻ hàng + theo ngày + dịch vụ + 2 nút xuất trong một trang ~2285px; "Đã giao 300", "Đã giao 60", "Còn lại 200" không kèm đơn vị; "Xuất Excel / Xuất CSV" là chữ kỹ thuật; viền cam/xanh lá nền ô "Còn lại" dùng xanh lá cho "0 · đủ" (không phải hành động tiền).
Cách sửa: Rút còn 2 ô số; mỗi thẻ hàng hiện đơn vị; một nút "Tải bảng (Excel)" thay hai nút; "đủ" dùng xám/xanh dương.

**N19. public-tai-ve — Ba chip cổng bị xuống dòng, chữ nhỏ; trang rất generic ở đầu.**
Vấn đề: "Vận\nhành", "Thợ & tài\nxế", "Khách\nhàng" xuống dòng trong chip ~12px, biểu tượng bé: lỗi hiển thị. Phần đầu "Cài app Hiền Xa" thiếu ảnh màn hình app để người nhận qua Zalo biết sẽ cài cái gì.
Cách sửa: Bỏ chip hoặc dùng một dòng "Một app cho thợ, khách và nhân viên"; chip nếu giữ phải nowrap ≥13px. Thêm ảnh biểu tượng + ảnh màn hình nhỏ.

---

## NHỎ

**S1. work-home / work-home-dark — Thẻ "Đang giao" đặc nhưng còn 2 thẻ nhỏ chữ ~13px; chip "Chờ bắt đầu" ~12px.** Tăng chip ≥13px. Nền tối đạt (chữ sáng, thẻ xanh vẫn tách khỏi nền) — Giữ.
**S2. work-home — Thẻ ca có nút "Ra ca" cạnh nút "Mở việc" ở thẻ dưới.** Hai hành động nổi cùng màn; làm "Ra ca" nút viền, 48px.
**S3. work-attendance — "Nghỉ 1 ngày" tô đỏ.** Ngày nghỉ theo lịch không phải lỗi; dùng xám đậm. Chip "Đủ công/Vào trễ/Về sớm" ~12px.
**S4. work-earnings — Nhãn "Tiền chuyến · 38" khó hiểu; "Lương ngày công" xuống dòng làm cột lệch; dải tuần dùng nét đứt/gạch ngang không có chú giải.** Đổi "38 chuyến"; thêm chú giải một dòng.
**S5. work-tracking-denied — Chấm cam báo trên biểu tượng vị trí chỉ ~8px.** Tăng 10–12px kèm tooltip; tương phản trên nền xanh yếu.
**S6. work-change-password — Ba dấu ✓ xanh lá hiện sẵn khi chưa nhập đủ.** Khi mẫu trống nên xám, chỉ xanh khi đạt.
**S7. work-login / customer-login / public-login — Biểu tượng tab không thống nhất (Vận hành: màn hình ở thợ/public, tòa nhà ở khách; Khách hàng: người vs nhóm người).** Dùng một bộ. public-login hiện "dung.tho" ở tab Vận hành (dữ liệu mẫu lệch). Logo xuất hiện hai lần (thanh trên + huy hiệu trên thẻ).
**S8. Logo "HX" chữ trong thanh trên work-* và customer-*, trong khi public-login/tai-ve dùng logo công ty (D49).** Dùng chung một logo ảnh.
**S9. public-not-found / public-error — Cùng một hình phong bì, vòng tròn nền bị cắt.** Làm hai hình khác nhau (tìm / cảnh báo đã có chấm), thêm ngữ cảnh theo cổng (thợ về "Hôm nay", khách về "Trang chủ").
**S10. public-loading — Hiển thị khung quản trị (skeleton) với menu thật; ổn nhưng không có chữ "Đang tải…" cho trình đọc màn hình.** Thêm văn bản ẩn.
**S11. customer-profile — "Giao diện: Theo thiết bị / Tự động" không giống màn thợ (không đổi được).** Cho chọn Sáng/Tối/Cỡ chữ giống cổng thợ (khách lớn tuổi cần cỡ chữ lớn). Liên kết "+ Địa chỉ mới", "+ Thêm" nhỏ ~13px, vùng chạm <44px.
**S12. customer-service-detail — Dòng "Đã xếp lịch" lặp ba lần (chip, hộp xanh, mốc tiến trình).** Giữ hai.
**S13. customer-order-detail — "Trả trước 10.000.000 ₫" tô xanh lá chữ; mã "Lượt giao 1 · PG-0412" lộ mã nội bộ.** Dùng chữ thường; bỏ mã PG cho khách.
**S14. customer-change-password — Không có danh sách điều kiện như ở cổng thợ; nút "Đăng xuất" chữ nhỏ ngoài thẻ.** Đồng bộ với work-change-password; nút Đăng xuất cao ≥44px.

---

## 5 vấn đề lớn nhất (theo tác động)
1. B1 — "Đăng xuất" trên thanh trên mọi màn thợ/khách: chạm nhầm, tiêu đề bị cắt ("Hiền Xa · …", "Đổi mật k…").
2. B2 + B3 — Cổng thợ: nhãn "Đã giao hôm nay" sai trạng thái phân giao; xác nhận giao khi ảnh còn đang tải.
3. N1/N2/N3 — Cổng khách: nút xanh lá tròn nổi trên menu trùng nút chính, che nội dung, nhãn menu ~12px sát nhau.
4. B4 + B5 — Cổng khách: đăng ký trùng SĐT báo lỗi đỏ sai ý (D78); báo cáo đặt hàng số liệu tự mâu thuẫn, thiếu Thép.
5. N4/N5/N6/N14/N16 — Vùng chạm dưới chuẩn (44px thay vì 52–56; bộ đếm 52 thay vì 72; hai ba nút chính cùng màn): chưa dùng được bằng một tay trong nắng/bằng tay lớn tuổi.

Giữ nguyên (đã tốt): public-select-branch, work-login, customer-order-review (một nút chính + nút viền), customer-debts thanh 3 màu + số khớp, customer-order-rejected (lý do + không phát sinh công nợ), customer-pay-done, nền tối work-home-dark, work-pool thẻ có giờ/tiền chuyến.
