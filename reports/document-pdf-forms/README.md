# Mẫu PDF/in SO, PO và phiếu giao

Nền ứng dụng: main/Production cb6ad38ebec16a8a0e04ff3d4b3d0d7edc85a734, schema Production189. Thay đổi riêng trên codex/document-pdf-forms; checkout gốc 79b0b91 và mọi thay đổi local được giữ nguyên. Chưa thay bản Production trong đợt này.

Ba mẫu A4 dùng font Noto Sans tiếng Việt và màu xanh hiện có: thông tin hai bên/điểm giao, ngày lập/lịch hẹn, bảng hàng, điều khoản, ký tay và số trang. Theo yêu cầu bổ sung, bỏ ba dòng chú thích góc trái chân trang; mã nguồn/thời điểm xuất giữ trong metadata PDF, không in ra giấy. SO/PO có nút tải tại chi tiết chứng từ; phiếu giao giữ nguyên đường tải cũ.

- SO: lượng/đơn giá/thành tiền/tổng theo chứng từ đã lưu, không tính lại theo bảng giá mới.
- PO: bản có giá khi có purchasing.price.read; bản kho loại cả cột giá/thành tiền/tổng, không đổi NULL thành0.
- Phiếu giao: kế hoạch/thực lấy/báo giao/khách nhận/tính tiền tách riêng. Kết quả hiện trường đọc delivery_results, kết quả xác minh đọc nguồn hiện hành; giữ FULL do hiện trường báo ngay cả khi người có quyền xác minh thiếu. Chưa báo/chưa lấy/chưa xác minh không hiển thị như sự kiện0 đã xảy ra.
- Ký tay và xuất PDF không thay thế xác minh giao nhận, xác nhận thương mại hoặc ghi thu/chi. Không gọi chứng từ là hóa đơn thuế.

Không sửa schema/RPC/RLS, vai trò, tính tiền/lượng, kho, công nợ hoặc lệnh ghi sổ. API chỉ SELECT với JWT người dùng, quyền tài liệu và chi nhánh đã chọn; không dùng service key. Lỗi tải dữ liệu/ĐVT không phát hành PDF thiếu dòng; phân trang đọc500dòng/lần; đổi phiên bản/trạng thái khi xuất trả409. Không có thao tác ghi dữ liệu nghiệp vụ.

## Bằng chứng

| Tiêu chí | Bằng chứng | Phạm vi |
|---|---|---|
| Ba PDF tải từ màn hình | QA_BROWSER.json; ảnh gốc giữ riêng trên máy | Owner QA thật, ba chứng từ sẵn có |
| Quyền và phạm vi | QA_HTTP.json |13ca: Owner3, chưa đăng nhập3, thợ3, sai chi nhánh3, kho PO1; Auth QA thật + PostgREST/native DB thật |
| Số liệu nguồn/giá ẩn | QA_PDF_CONTENT.json; PDF QA gốc giữ riêng trên máy | SO3.450.000đ; PO2.250.000đ; giao15/14/14/13/13; bản kho không chứa giá |
| A4/phân trang/văn bản dài | LAYOUT_CHECKS.json; visual/* | Ba mẫu1trang;36dòng và mã350ký tự qua4trang; ảnh đã kiểm tra |
| Retry nguồn/lỗi đọc/501dòng | src/lib/pdf/document-export.test.ts | Contract test có giả lập ranh giới DB, không thay bằng tích hợp thật |
| Tiền lớn/lượng6số/thông tin chưa có | src/lib/pdf/document-data.test.ts | Không mất số nguyên >2^53; không làm tròn hay tạo0 giả |
| Không tác động DB | QA_DATA_PRESERVATION.json |122bảng public QA, số dòng và fingerprint giữ nguyên |

QA dùng Auth dự án ffrwiglcrlumfvhubaxg và DB native hx_remediation_go_live_browser175. Không migration/reset/seed/ghi sổ. Schema QA là nền sẵn có, không giả định bằng Production; các cột/reader thực tế được kiểm chứng bằng13HTTPca. PDF minh họa output/pdf/*.pdf được ghi rõ MẪU MINH HỌA, không ghi sổ. Không tự tạo thông tin pháp nhân, MST, địa chỉ doanh nghiệp, tài khoản ngân hàng hoặc VAT chưa có nguồn dữ liệu.

## Kiểm tra / phục hồi

-16test PDF mới liên quan đạt; typecheck/lint đạt (14warning cũ,0error). Build xem checks/build.log.
- Bộ unit657test được chạy ở lần đầu trước7test export mới và bổ sung sự kiện hiện trường; không coi đó là kết quả head cuối. CI head cuối tại PR là kết quả hồi quy toàn bộ sau thay đổi cuối.
- Hai race bị loại trừ: scripts/qa/remediation/package4-advance-race.mjs --mode different-intents và --mode same-intent. Không chạy; dùng lại bằng chứng600.000đ/400.000đ. CI không gọi hai script này.
- Có thể quay về ứng dụng cb6ad38; không cần rollback DB vì không thay schema/dữ liệu. Báo giá/phiếu thu/đối chiếu/hóa đơn nội bộ giữ nguyên renderer cũ.
- Đây là PDF tĩnh để in/ký, không phải AcroForm, chữ ký số hoặc tích hợp hóa đơn. Độ ổn định giá/nguồn theo dữ liệu đã lưu; UOM hiển thị từ danh mục có ID đã lưu trên dòng, không bổ sung snapshot mới.
- Kiểm chứng UI ở1280x720; mẫu A4 không phụ thuộc kích thước màn hình. Không tuyên bố đã kiểm thử in máy in vật lý hoặc phiên Production.

PDF/ảnh tải từ QA nằm ở reports/document-pdf-forms/qa/ trên máy và bản riêng trong /private/tmp/hienxa-pdf-20261014-private; được loại khỏi Git. Chỉ kết quả kiểm chứng đã lược bỏ nội dung chứng từ và mẫu minh họa tổng hợp được đưa vào PR. Không chia sẻ payload QA sau khi phê duyệt tự động từ chối push ban đầu.

## Chỉnh chân trang theo yêu cầu

Bỏ ba dòng góc trái phía dưới ở cả SO/PO/phiếu giao; giữ số trang góc phải và phần ký trong nội dung. Bản nhiều trang/bản PO ẩn giá được tạo lại bằng cùng renderer. QA_HTTP/QA_BROWSER/QA_PDF_CONTENT ghi lần kiểm chứng tích hợp trước tại2fceb1f, còn hiệu lực cho quyền và số liệu vì không đổi loader/builder/API; không dùng các PDF QA cũ để chứng minh chân trang mới. Chân trang mới được kiểm chứng bằng PDF render và verify-layout.py. Không chạy lại hai race ứng trước.
