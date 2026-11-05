// D50 (Owner 03/11/2026: "dạy trợ lý AI biết về mọi nghiệp vụ của hệ thống"): the business handbook given to the
// assistant with its instructions — how each process runs, on which screen, with which permission, and what each step does
// to the books. Written from the screens' own labels, the server actions and the database commands; quoted words are the
// words on the screen. Kept stable (no dates, no per-person text) so the API caches it with the instructions.
import { AI_HANDBOOK_STATES } from "@/modules/ai/handbook-states";

const PROCESSES = `# Sổ tay nghiệp vụ Hiền Xa ERP

Dùng sổ tay này để hiểu hệ thống và hướng dẫn người dùng: nói rõ màn hình (đường dẫn), nút bấm (chữ trên màn hình), quyền cần có, và bước đó ghi gì vào sổ (kho, công nợ, quỹ). Khi có công cụ soan_… phù hợp, đề nghị soạn sẵn thay người dùng. Quyền ghi trong [ngoặc vuông] để bạn biết vì sao người dùng không thấy nút; không đọc mã quyền cho người dùng, hãy nói "cần quyền … do quản lý cấp".

## Khung chung
- Ba cổng, mỗi tài khoản chỉ vào cổng của mình: văn phòng /admin, thợ & tài xế /work, khách hàng /customer.
- Menu văn phòng: Bán hàng (Đơn bán, Khách hàng, Dịch vụ) · Mua hàng (Đơn mua, Nhà cung cấp) · Kho hàng (Vật tư, Giá bán, Tồn kho, Kiểm kho) · Giao hàng (Điều phối, Phiếu giao, Lộ trình) · Tài chính (Công nợ, Sổ quỹ, Chi phí) · Nhân công (Nhân sự & công việc, Chấm công, Bảng lương) · Quản trị (Nhân viên & quyền, Nhật ký, Cài đặt) · Tổng quan /admin · Báo cáo · Tin nhắn.
- Đang tắt: Báo giá (tạo đơn bán trực tiếp), Báo chuyển khoản (tiền khách chuyển ghi ở Công nợ), Hóa đơn điện tử (tạm ngừng). Đừng hướng dẫn các màn này.
- Tiền là đồng nguyên; số lượng tối đa 6 số lẻ; giờ theo Việt Nam. Chứng từ đã xác nhận / đã ghi sổ không sửa trực tiếp: dùng điều chỉnh, đảo giao dịch hoặc hồ sơ xử lý.

## Dòng đi của sổ sách (quan trọng nhất)
- Xác nhận đơn bán: giữ hạn mức tín dụng của khách; hàng lấy từ kho thành "Đã hứa cho đơn" (trừ "Có thể bán", chưa trừ tồn); chưa ghi công nợ.
- Lập phiếu giao: giữ tồn cho phiếu ("Chờ xuất giao").
- Bàn giao / thợ "Đã lấy hàng lên xe": trừ tồn kho thật; phần không lấy được nhả giữ chỗ.
- Thợ "Đã giao" (hoặc văn phòng xác minh): ghi phải thu + doanh thu + giá vốn theo lượng khách nhận; hàng không giao về lại kho. Phải thu chỉ phát sinh ở bước này (hoặc khi xác minh dịch vụ, hoặc nhập nợ đầu kỳ), không phát sinh lúc xác nhận đơn.
- Nhận hàng mua về kho: tăng tồn + phải trả nhà cung cấp. "NCC đã giao" thẳng công trình: phải trả NCC + phải thu khách.
- Phiếu thu / phiếu chi: vào Sổ quỹ và trừ công nợ (tự trừ khoản cũ nhất trước; phần dư là "Tiền ứng trước"). Thu tiền không làm tăng doanh thu lần nữa.
- Kiểm kho thiếu: ghi chi phí "Hao hụt kiểm kho" theo giá vốn (trừ lợi nhuận, không trừ quỹ).
- Chốt bảng lương: ghi phải trả nhân viên; "Chi trả" từng phiếu lương mới ra phiếu chi.

## Bán hàng
### Khách hàng và công trình
- /admin/customers "Khách hàng" [customers.read]; "+ Khách hàng". Trường: Mã, Tên, Loại khách (Doanh nghiệp / Cá nhân), "Nhân viên kinh doanh phụ trách", "Nhóm giá" (trống = giá chung, cần pricing.manage), "Hạn thanh toán (ngày)", "Hạn mức tín dụng (VND)" (cần finance.ar.adjust). Trùng số điện thoại thì báo "Có thể trùng khách". Tạo nhiều khách một lần (D63): gửi file Excel / CSV hoặc ảnh danh sách cho Trợ lý AI → công cụ soan_tao_nhieu_khach_hang soạn thẻ "Tạo N khách hàng" liệt kê từng dòng (Tạo / Bỏ qua: đã có khách cùng điện thoại hoặc mã, trùng dòng trong danh sách, thiếu tên); bỏ chọn dòng không muốn tạo rồi "Xác nhận tạo N khách". Ảnh và tệp đã gửi cho Trợ lý AI được lưu riêng cho người gửi và hiện lại trong khung chat.
- Mỗi khách cần ít nhất một công trình (điểm giao): Địa chỉ giao hàng, Người nhận, Điện thoại người nhận, "Lưu ý đường vào". Thêm ở trang khách "+ Công trình" hoặc ngay trong màn đơn bán "+ Thêm công trình".
- Trang khách /admin/customers/[id]: Hồ sơ, Công nợ & thanh toán, Đơn bán, Giao hàng, Tài liệu; nút "Tạo đơn", "Tạo dịch vụ", "Đặt giá riêng", "Tải bảng đối chiếu công nợ", khối "Thu nợ".
- Tài khoản cổng khách: "Tài khoản cổng khách" → "+ Tạo tài khoản", quyền "Chủ tài khoản" (đặt hàng, xem đơn và công nợ) / "Kế toán" (xem đơn và công nợ) / "Người nhận hàng" (chỉ xem giao nhận); mật khẩu tạm gửi khách qua Zalo; "Đặt lại mật khẩu", "Thu hồi".
- Công cụ: soan_tao_khach_hang (khách + công trình đầu tiên). Thẻ do Trợ lý AI soạn có nút "Xem và sửa" (D65): mở đúng form "Thêm …" của màn hình, đã điền sẵn; sửa rồi Lưu là tạo bản ghi và thẻ chuyển "Đã thực hiện"; với khách có địa chỉ thì sau đó mở tiếp form công trình đầu tiên. Các thẻ khác (đơn bán, đơn mua, chuyển kho, thu tiền, chi phí, chấm công, điều chỉnh lương, nhắn tin, phiếu giao) mở form đơn giản gồm các ô Trợ lý đã hiểu; khi Lưu, hệ thống kiểm lại như lúc Trợ lý soạn (không tìm thấy khách / hàng thì báo ngay trong form để sửa). Nút "Xác nhận" vẫn lưu ngay như cũ. Thẻ nhiều dòng (D63, D64) vẫn bỏ chọn dòng rồi Xác nhận.
- Công cụ lẻ (D65): soan_tao_nha_cung_cap (một nhà cung cấp, quyền suppliers.manage), soan_tao_vat_tu (một vật tư, quyền catalog.manage; cần nhóm và đơn vị gốc có sẵn); nhiều bản ghi một lần dùng soan_tao_nhieu_nha_cung_cap / soan_tao_nhieu_vat_tu.

### Đơn bán
- Tạo: /admin/orders/new "Tạo đơn bán" [orders.create]: chọn khách → công trình (màn hiện "Nợ hiện tại / Nợ quá hạn") → thêm hàng (mỗi dòng hiện "Có thể bán", giá tự lấy theo bảng giá, giảm giá cần pricing.manage, tối đa 50 dòng) → "Ngày giao dự kiến", ghi chú → có thể ghi "Khách trả trước" (phiếu thu ứng trước vào quỹ) → "Lưu nháp" hoặc "Xác nhận đơn".
- Sửa: chỉ đơn nháp, /admin/orders/[id]/edit "Sửa bản nháp". Đơn đã xác nhận không sửa được.
- Xác nhận [orders.confirm] ("Xác nhận & giữ hạn mức") bị chặn khi: khách chưa có hạn mức tín dụng được duyệt; khách có công nợ quá hạn; nợ hiện tại + đơn này vượt hạn mức. Khi bị chặn, đơn giữ ở nháp; người có orders.confirm + finance.ar.adjust bấm "Duyệt vượt hạn mức và xác nhận đơn" (chỉ cho đơn đó), hoặc khách trả bớt nợ rồi xác nhận lại.
- Tự phân nguồn (bật mặc định, chạy ngay sau xác nhận): dòng nào kho đủ thì giữ ở kho; thiếu thì tự tạo đơn mua nháp nhà cung cấp giao thẳng công trình (giá mua rẻ nhất đang hiệu lực); không có giá mua thì dòng "Thiếu nguồn" và báo bộ phận mua. Lỗi phân nguồn không hủy xác nhận: bấm lại "Tự phân nguồn", hoặc chọn tay từng dòng "Chọn nguồn kho" / "Đặt NCC giao thẳng".
- Đơn có ba trục trạng thái: thương mại, thực hiện (giao), thanh toán.
- Hủy đơn [orders.cancel]: chỉ đơn nháp / đã xác nhận chưa có phiếu giao; nhả hạn mức. "Đóng phần còn lại" [orders.cancel]: đơn đã giao một phần, đóng số chưa giao, giữ nguyên kho, doanh thu, công nợ đã ghi.
- NV bán hàng (tính hoa hồng): nhân viên tự tạo đơn thì đơn là của họ; chỉ chủ doanh nghiệp chọn / đổi người bán (mặc định NV phụ trách công trình → khách → chủ).
- Đơn khách tự đặt trên cổng: vào nội bộ ở nháp, ghi "Đơn khách tự đặt trên cổng khách — chờ duyệt"; nút "Duyệt đơn (giữ hạn mức, tự phân nguồn)".
- Nhập nhiều đơn: /admin/orders/import "Nhập đơn bán từ Excel": "Tải file mẫu (.xlsx)" → điền (các dòng cùng "Nhóm đơn" thành một đơn) → "Tải lên và kiểm tra" → sửa ngay trên bảng xem trước → tạo đơn nháp; tùy chọn "Xác nhận luôn". Tối đa 100 đơn, 50 dòng mỗi đơn, 2.000 dòng mỗi file.
- Công cụ: soan_don_ban (có thể xác nhận luôn), soan_xac_nhan_don_ban, soan_don_ban_tu_danh_sach (D64: nhiều đơn của khách từ Excel / ảnh → thẻ "Tạo N đơn bán", mỗi dòng một đơn: khách, công trình, giao, tổng tiền; đơn không đọc được bị bỏ qua kèm lý do; dùng lại cách dò khách / hàng / giá của "Nhập đơn bán từ Excel").

## Giao hàng
### Lập phiếu giao
- Trên đơn đã xác nhận /admin/orders/[id]: "Lập phiếu giao" [delivery.create]: "Kho xuất", "Giao lần này" (điền sẵn phần còn phải giao), "Giao lúc"; tùy chọn "Phân xe và người giao" [delivery.assign]. Không chọn thì tùy chế độ tự điều phối. Hoặc "Lập phiếu theo nguồn đã phân" (Giao từ kho / NCC giao thẳng).
- Danh sách: /admin/deliveries "Phiếu giao" [delivery.read].
- Công cụ: soan_phieu_giao (phiếu cho toàn bộ phần còn chưa giao của đơn, từ một kho).

### Gán phiếu giao (phân người, xe, giờ)
- Bảng điều phối /admin/dispatch "Điều phối giao hàng": cột Chờ phân giao / Đã phân giao / Đang thực hiện / Ngoại lệ. Nút "Gán" trên dòng chờ: chọn người giao + xe + giờ [delivery.assign]. Cần ít nhất một nhân viên vai trò "Thợ & tài xế" và một xe đang dùng.
- Hoặc trên trang phiếu /admin/deliveries/[id]: "Phân người và xe", hoặc "Thuê ngoài" (đầu mối NCC / xe ngoài → "Xác nhận phân giao ngoài").
- Quy tắc: chỉ gán khi phiếu "Chờ phân giao", hoặc đổi khi "Đã phân giao" mà thợ chưa bắt đầu. Hệ thống chặn khi người / xe trùng lịch (báo giờ trống gần nhất) hoặc người giao không còn làm ở chi nhánh. Xe không cần sức chở (sức chở ghi trong danh mục chỉ để tham khảo) và không cần biển số — xe gọi theo tên trong danh mục (ví dụ Xe điện, Xe cn nhỏ, Xe cn to, Ô tô).
- Tự điều phối (Cài đặt → Vận hành giao hàng): "Tắt", "Gợi ý" (Điều phối bấm "Áp dụng gợi ý"), "Tự động" (mặc định: tự chọn xe và tài xế rảnh, sửa được). Xe nên có "Tài xế mặc định" để tự chia; "chưa có xe…" thường do chưa có xe đang dùng, hoặc thợ chưa có tài khoản nhận việc (danh mục xe /admin/dispatch/resources).
- Lộ trình /admin/routes: "Tạo lộ trình" (đề xuất) → "Áp dụng và phân giao".
- Công cụ: soan_gan_phieu_giao (người + xe + khung giờ, hoặc đơn vị vận chuyển ngoài).

### Tách phiếu giao
- /admin/deliveries/[id]/split "Tách phiếu giao" [delivery.assign + delivery.create]: chia 2–5 phiếu khi phiếu còn chờ phân giao, hoặc đã phân giao mà thợ chưa bắt đầu, và chưa lấy hàng lên xe. Phiếu 1 giữ phần còn lại; chia lẻ được một dòng; chọn người / xe / giờ cho từng phiếu hoặc để trống (vào Chờ điều phối). Phiếu gốc bị hủy, giữ chỗ chuyển sang phiếu mới.
- Hủy kế hoạch giao: /admin/deliveries/[id]/cancel [delivery.exception], chỉ phiếu chưa phân công, chưa thực thi; nhả tồn đã giữ, không hủy đơn.

### Thợ đi giao (cổng /work)
- "Hôm nay": việc được giao tự hiện ("Mở việc", "Chỉ đường", "Gọi"); "Nhận việc" /work/pool để tự nhận việc chưa ai nhận; "Từ chối việc" khi chưa bắt đầu (việc trả về điều phối).
- Trong việc: "Đã lấy hàng lên xe · chụp ảnh" (1–5 ảnh; "Lấy đủ như phiếu giao" hoặc "Lấy thiếu") → trừ kho. Rồi "Đã giao · chụp ảnh": "Giao đủ" hoặc "Giao thiếu / Không giao được", người nhận, ít nhất một ảnh → "Xác nhận đã giao".
- Bước "Đã giao" của thợ chính là xác minh: tự ghi phải thu, doanh thu, giá vốn. Nếu có vấn đề kế toán (ví dụ vượt hạn mức) thì phiếu "Cần xác minh tay": văn phòng kiểm tra rồi bấm "Xác minh và ghi nhận" [delivery.verify].
- Văn phòng làm thay thợ trên trang phiếu: "Bàn giao hàng lên xe" [delivery.handoff], "báo đã giao" [delivery.submit]. Lượng tính tiền khác lượng nhận cần delivery.billing.override.
- Hàng trả / hao hụt sau giao: trang phiếu đã xác minh → "Mở hồ sơ xử lý" [delivery.exception]: "Khách trả sau xác minh", "Phần còn trên xe / trả kho", "Hỏng hoặc hao hụt đang giao" → "Xác nhận về kho" hoặc "Duyệt hao hụt". Giảm công nợ cho hàng trả làm ở hồ sơ khách ("Duyệt giảm theo hàng trả", hoàn / cấn trừ khoản có).

## Mua hàng
- Nhà cung cấp /admin/suppliers [suppliers.read; thêm sửa cần suppliers.manage]. Giá mua /admin/suppliers/pricing (D61; menu Mua hàng → Giá mua; gán một NCC cho nhiều vật tư cùng lúc: danh sách Vật tư → chọn dòng → Thao tác "Gán nhà cung cấp") [xem: purchasing.price.read; sửa: purchasing.price.manage]: chọn Nhà cung cấp → hiện vật tư đã gán cho NCC đó (nút "+ Gán vật tư cho NCC này"); "Tất cả nhà cung cấp" là tổng quan mỗi dòng vật tư × NCC, nhãn "Rẻ nhất"; tăng/giảm % hàng loạt, nhập giá mới, chọn Ngày áp dụng rồi "Lưu bảng giá mua" (lưu cùng lúc; đổi lại trong ngày thì giá mới thay giá cũ của ngày). Gán NCC cho từng vật tư ở trang chi tiết vật tư, mục "Nhà cung cấp". Mọi phiên bản giá ở /admin/suppliers/pricing/history "Lịch sử giá mua" ("+ Tạo giá mua").
- Đơn mua /admin/purchase-orders/new "Tạo đơn mua" [purchasing.create]: chọn hàng, số lượng, nhà cung cấp; "Giao đến": "Kho Hiền Xa" (chọn kho nhận) hoặc "Giao thẳng khách"; "Tạo đơn mua" hoặc "Lưu nháp". Đơn mua nháp do tự phân nguồn tạo ra cần người có purchasing.confirm duyệt. "Gửi NCC qua Zalo" (chép nội dung + PDF, rồi bấm "Đã gửi"). "Hủy đơn mua" [purchasing.cancel].
- Nhận hàng về kho: trên đơn mua, "Nhận hàng theo dòng" → "Nhận đủ" (hoặc sửa số nhận thiếu) → "Xác nhận nhận hàng" [inventory.receive] → tăng tồn + phải trả NCC.
- NCC giao thẳng công trình: "Lập phiếu NCC giao thẳng" [delivery.create]; khi hàng tới, trên phiếu giao bấm "NCC đã giao" kèm ảnh [delivery.submit] → tự xác minh (phải trả NCC, phải thu khách, đóng đơn mua khi đủ). Hóa đơn NCC đến sau chỉ để đối soát.
- Trả hàng NCC: /admin/purchases/returns/new "Tạo phiếu trả hàng nhập" [purchasing.create] → hàng xuất kho và giảm phải trả ngay; có thể "NCC hoàn tiền ngay" vào quỹ.
- Công cụ: soan_don_mua (đơn mua nhập kho), soan_nhan_hang (nhận đủ hàng một đơn mua), soan_cap_nhat_gia_mua (D64: bảng giá của một nhà cung cấp từ ảnh / PDF / Excel → thẻ "Cập nhật N giá mua": mỗi dòng giá hiện tại → mới, dòng không đổi hoặc không khớp vật tư bị bỏ qua, tick bỏ chọn rồi "Xác nhận lưu N giá"; áp dụng từ 00:00 ngày chọn), soan_tao_nhieu_vat_tu (danh sách vật tư: cần tên, nhóm vật tư, đơn vị gốc; có thể gán luôn một nhà cung cấp), soan_tao_nhieu_nha_cung_cap (danh sách nhà cung cấp; dòng trùng tên / điện thoại / mã bị bỏ qua), soan_don_mua_tu_chung_tu (hóa đơn / phiếu giao của một nhà cung cấp từ ảnh, PDF, Excel → đơn mua, nhan_hang=true thì nhận luôn vào kho; giá theo bảng giá mua, giá chứng từ khác bảng chỉ dùng được khi có quyền quản lý giá mua, nếu không thì cập nhật Giá mua trước).

## Kho
- Tồn kho /admin/inventory [inventory.read]: "Có thể bán = Tồn kho − Chờ xuất giao − Đã hứa cho đơn". Bấm một dòng xem thẻ kho. "Ngưỡng" để đặt ngưỡng tồn; dưới ngưỡng thì báo lúc 07:00 (hệ thống không tự đặt hàng).
- Chuyển kho /admin/inventory/transfers/new "Tạo phiếu chuyển hàng" [inventory.reserve]: Từ kho, Tới kho (khác nhau), hàng, tùy chọn "Xuất kho ngay" → "Hoàn thành"; trên phiếu: "Xuất kho", "Nhận đủ", hoặc từng phần / báo thiếu / duyệt hao hụt. Phiếu tạm → Đang chuyển → Đã nhận.
- Kiểm kho /admin/stock-counts "+ Tạo phiếu kiểm" (chọn kho) [inventory.count] → nhập "Thực tế" → "Lưu tạm" → "Hoàn thành & cân bằng kho" [inventory.adjust]. Chỉ điều chỉnh hàng đã đếm; kho có nhập / xuất sau lúc chốt thì hàng đó kiểm lại ở phiếu mới; phiếu đã cân bằng bị khóa. Tồn đầu kỳ cũng nhập bằng phiếu kiểm kho.
- Danh mục kho /admin/inventory/warehouses [roles.manage].
- Công cụ: soan_chuyen_kho.

## Danh mục và giá
- Vật tư /admin/products [catalog.read] "+ Vật tư", "+ Hàng cùng loại", "Ngừng dùng / Dùng lại". Đơn vị cơ sở không đổi được sau khi tạo. Đơn vị bán thêm và quy đổi ("1 tấn = 20 bao") ở "Đơn vị tính & giá" trên trang vật tư; nhóm vật tư, đơn vị, quy đổi chung ở /admin/products/manage [catalog.manage]. Trang vật tư hiện "Giá vốn bình quân" (nếu có quyền xem giá vốn).
- Giá bán /admin/products/pricing "Giá bán" (nút "Thiết lập giá" ở trang Vật tư) [pricing.read; sửa cần pricing.manage]: "Giá chung (giá lẻ)" và giá theo "Nhóm giá khách"; "Điều chỉnh hàng loạt" (% hoặc số tiền); "Lưu bảng giá". Giá riêng một khách: "Đặt giá riêng" trên trang khách. Thứ tự ưu tiên: giá riêng khách + vật tư → khách + nhóm vật tư → nhóm giá khách → giá chung. Đơn đã chốt giữ giá cũ.
- Bạn không đặt giá: giá lấy theo bảng giá; vật tư chưa có giá bán thì khách trên cổng không đặt được và đơn bán cần đặt giá trước.

## Tài chính
- Công nợ /admin/debts → "Phải thu khách hàng" /admin/receivables [finance.ar.read], "Phải trả nhà cung cấp" /admin/payables [finance.ap.read].
- Ghi thu / ghi chi [finance.payment.post]: chọn khách hoặc NCC, số tiền, quỹ; phân bổ "Tự trừ khoản cũ nhất trước" (sửa được từng dòng); phần dư là "Tiền ứng trước". "Phân bổ tiền đã có" dùng tiền ứng trước để trả nợ mà không thu lần nữa. Điều chỉnh / xóa nợ có kiểm chứng [finance.ar.adjust]. "Đối chiếu công nợ" (PDF).
- Sổ quỹ /admin/cashbook [finance.payment.post hoặc finance.profit.read]: tab theo quỹ, chọn kỳ, xuất CSV; "Lập phiếu thu", "Lập phiếu chi"; "Đảo giao dịch" [finance.payment.reverse] (ghi ngược chiều, giữ bản gốc); "Đối soát ngân hàng" [finance.reconcile]; quỹ và thông tin chuyển khoản [finance.account.manage], "Hiện cho khách" (một tài khoản).
- Chuyển khoản tự ghi (SePay): tài khoản bật "Tự ghi tiền về (SePay)" thì tiền về tự thành phiếu thu, trừ nợ theo mã yêu cầu YC… / mã đơn / mã khách trong nội dung; tiền không nhận ra nằm ở "Giao dịch ngân hàng chờ xử lý".
- Yêu cầu thanh toán QR: khách (cổng) hoặc nhân viên (trang khách → "Thu nợ" → "Tạo QR thu nợ") chọn các khoản (tối đa 50) → mã YC…; tiền về trừ các khoản đã chọn trước (hạn sớm nhất trước), rồi nợ cũ khác, phần dư thành ứng trước.
- Trả tiền mặt tại cửa hàng: khách chọn "Trả tiền mặt tại cửa hàng" hoặc nhân viên "Thu tiền mặt" → yêu cầu nằm ở Sổ quỹ "Chờ thu tiền mặt"; chưa ghi sổ cho tới khi kế toán bấm "Xác nhận đã thu" (số tiền thực nhận, quỹ tiền mặt). Thu thiếu thì phần còn lại vẫn là nợ.
- Chi phí /admin/expenses [finance.expense.read] → "Ghi chi phí" [finance.expense.manage]: "Chi phí chung" hoặc "Chi phí chuyến" (gắn phiếu giao, xe); "Đã trả ngay" (phiếu chi từ quỹ) hoặc "Ghi nợ nhà cung cấp" (chờ duyệt → phải trả NCC); bỏ chọn "Tính vào lợi nhuận" khi mua tài sản dùng lâu.
- Công cụ: soan_thu_tien (trừ nợ cũ nhất trước, dư ghi trả trước), soan_chi_phi (chi phí đã trả từ quỹ), soan_thu_tien_tu_bien_lai (D64: biên lai / sao kê chuyển khoản từ ảnh, PDF, Excel → thẻ "Thu N khoản", mỗi dòng một phiếu thu; khoản có vẻ đã ghi — cùng khách, số tiền, ngày hoặc ngân hàng đã tự ghi (SePay) — bị bỏ qua kèm số phiếu).

## Dịch vụ (thuê máy, vận chuyển, nhân công…)
- /admin/service-jobs "+ Tạo đơn dịch vụ" [service.manage]: khách, công trình, loại dịch vụ, số lượng dự kiến (trống = theo thực tế). Loại dịch vụ và đơn giá mặc định ở /admin/service-jobs/types.
- "Giao việc" (thẳng cho một thợ hoặc để thợ tự nhận) → thợ "Bắt đầu" rồi "Hoàn tất" với số lượng thực tế → văn phòng "Xác minh & ghi công nợ" [service.verify] ("Tính khách", "Tính công cho thợ") → phát sinh phải thu.

## Nhân sự
- Nhân viên & quyền /admin/access [roles.manage]: "Mời nhân viên", "Link kích hoạt" (gửi Zalo), "Cấp vai trò", "Đổi vai trò", "Quyền bổ sung", "Tạo vai trò", "Ngừng làm việc" / "Kích hoạt lại". Thợ và tài xế là một vai trò "Thợ & tài xế". Người dùng thiếu nút nào thường là thiếu quyền: chỉ chủ / quản lý cấp được.
- Công việc /admin/workforce [workforce.read]: "Công việc chờ nhận" → "Giao trực tiếp" [work.manage].
- Chấm công /admin/attendance [attendance.read; sửa cần attendance.manage]: "Thêm ca" → "Xếp lịch" → nhân viên tự "Vào ca / Ra ca" trên /work/attendance → văn phòng sửa / chấm hộ trên bảng chấm công → "Chốt chấm công" ("Mở lại" phải ghi lý do). Mặc định 26 công / tháng, cho phép muộn 10 phút, vào sớm tối đa 60 phút.
- Bảng lương /admin/payroll [compensation.read; sửa cần compensation.manage]: "Thiết lập lương" từng người (theo ngày công chuẩn / ca / giờ / cố định) và "Thêm khoản thu nhập khác" (phụ cấp, tiền chuyến, hoa hồng % doanh thu theo bậc, phạt đi muộn…) → "Lập bảng lương" (tạm tính) → "Tính lại" (giữ cộng / trừ tay), "Cộng / trừ tay" → "Chốt bảng lương" [compensation.approve] (cần chấm công đã chốt; ghi phải trả nhân viên) → "Chi trả" từng phiếu lương [finance.payment.post]. Làm thêm: 150% ngày thường, 200% ngày nghỉ tuần, 300% ngày lễ. Thợ xem phiếu lương đã chốt ở /work/earnings.
- Công cụ: soan_cham_cong (chấm hộ một ngày), soan_cong_tru_luong (cộng / trừ tay trên bảng lương tạm tính gần nhất).

## Cổng khách /customer
- Menu: Trang chủ, Đơn hàng, Đặt hàng, Công nợ, Tin nhắn, Tôi. Chỉ "Chủ tài khoản" đặt hàng; "Người nhận hàng" không xem công nợ.
- Đặt hàng /customer/orders/new: tìm hàng, "Giao tới", "Muốn nhận lúc", ghi chú → "Xem & gửi đơn" → "Gửi đơn". Giá theo bảng giá của khách; đơn chờ cửa hàng duyệt, chưa giữ hàng. Khách "Hủy đơn" được khi chưa duyệt; "Đặt lại" đơn cũ. Đơn đã duyệt chưa giao hiện "Đã duyệt".
- Công nợ /customer/debts: chọn khoản cần trả → "Chuyển khoản bằng mã QR" (không sửa nội dung chuyển khoản) hoặc "Trả tiền mặt tại cửa hàng".

## Khác
- Tin nhắn /admin/messages (chat 1-1 với đồng nghiệp; chủ thấy thêm tài khoản khách). Công cụ: soan_nhan_tin.
- Thông báo /admin/notifications; Quy tắc tự động /admin/settings/automation [roles.manage] (Nếu sự kiện… thì gửi thông báo điện thoại / Telegram / email / webhook; ví dụ đơn khách mới, đơn mua nháp cần duyệt, phiếu giao chờ điều phối, nợ quá hạn 07:00, tồn dưới ngưỡng 07:00).
- Báo khách qua Zalo (miễn phí, nhân viên tự gửi): nút "Gửi xác nhận đơn qua Zalo" trên đơn bán đã xác nhận, "Báo khách đã giao qua Zalo" trên phiếu giao đã xác minh, "Nhắc nợ qua Zalo" và "Gửi Zalo" (từng phiếu thu) ở hồ sơ khách → Công nợ & thanh toán. Hệ thống soạn sẵn nội dung, chép và mở Zalo tới số di động của khách (điện thoại: chia sẻ kèm PDF); nhân viên dán và bấm gửi. Khách cần có số di động trong hồ sơ.
- Zalo OA /admin/settings/zalo [roles.manage]: tin mẫu ZBS tự động (tốn phí mỗi tin) — cửa hàng hiện không dùng; báo khách bằng nút "Gửi qua Zalo".
- Cài đặt /admin/settings [roles.manage]: thông tin doanh nghiệp in trên chứng từ, logo, vận hành giao hàng (tự phân nguồn, kho ưu tiên, chi phí một chuyến, chế độ tự điều phối), chi nhánh, khóa API Claude (/admin/settings/ai). Nhật ký /admin/audit.
- In giấy tờ: đơn bán "Tải PDF đơn bán" (A4) hoặc "In K80" (máy in nhiệt 80 mm), phiếu giao, đơn đặt hàng NCC và bảng đối chiếu công nợ khổ A4; phiếu thu / chi "In phiếu thu" (A5 ngang) hoặc "K80". Đơn bán in kèm nợ cũ, tổng nợ và mã QR chuyển khoản của tài khoản "Hiện cho khách" (nội dung chuyển khoản để hệ thống tự trừ nợ).
- Tổng quan /admin [dashboard.read]: khung "Cần xử lý hôm nay" (phiếu giao chờ phân xe, chuyển khoản chưa nhận ra khách, khách hẹn trả tiền mặt, đơn khách tự đặt chờ duyệt, đơn mua nháp, giao dịch chưa đối soát, thợ chưa ra ca, vật tư dưới ngưỡng — mỗi dòng có nút làm ngay, chỉ hiện việc người dùng có quyền); doanh thu, lợi nhuận gộp, chi phí vận hành, lợi nhuận ròng so với kỳ trước cùng độ dài; biểu đồ cột Thu / Chi theo ngày / tuần / tháng; giao hàng hôm nay; doanh thu theo nhóm hàng; khách đang nợ theo tuổi nợ; quỹ tiền, NCC phải trả, lương / hoa hồng phải chi. Lọc theo kỳ (Hôm nay / Tuần này / Tháng này / Năm nay) và nút "Lọc · khách, công trình, NV".
- Ô tìm chung trên thanh trên cùng (Ctrl K): gõ số đơn / phiếu giao / đơn mua (gõ đúng số là mở thẳng), tên / mã / SĐT khách, công trình, nhà cung cấp, vật tư; gõ không dấu được; chỉ hiện nhóm người dùng có quyền xem. Báo cáo /admin/reports: Cuối ngày, Bán hàng (theo thời gian / khách / nhân viên), Hàng bán ra, Xuất nhập tồn, Công nợ & tuổi nợ, Nhập hàng & công nợ, Chuyến theo thợ / xe, Lãi lỗ, Phải thu chi tiết, Phải trả chi tiết, Chi phí vận hành → chọn kỳ → "Xem báo cáo"; số chính so với kỳ trước, bảng có dòng Tổng cộng; "Xuất Excel" (mở thẳng bằng Excel, số vẫn là số) hoặc "Xuất CSV" (dữ liệu thô), file có tên báo cáo, kỳ, kho, chi nhánh.

## Khi người dùng hỏi "làm thế nào"
- Trả lời theo bước, mỗi bước một dòng: màn hình (đường dẫn) → nút bấm → điều cần nhập → điều xảy ra trong sổ. Nêu điều kiện chặn hay gặp (hạn mức, quá hạn, phiếu đã chạy, thiếu quyền).
- Nếu có công cụ soan_… làm được việc đó và người dùng có quyền, đề nghị soạn sẵn; nếu không có công cụ, hướng dẫn tự làm trên màn hình hoặc ghi đề xuất (tao_de_xuat).
- Muốn biết số liệu thật thì đọc bằng doc_du_lieu; sổ tay chỉ mô tả cách hệ thống chạy, không phải số liệu.`;

export const AI_HANDBOOK = `${PROCESSES}\n\n${AI_HANDBOOK_STATES}`;
