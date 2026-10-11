# PR42 — đóng điều kiện chặn phát hành

Tiếp nối head bàn giao `9f099e5`. Chỉ xử lý Storage, minh chứng cũ, Realtime và các phụ thuộc phát hành; không triển khai lại G01–G23. Không merge, không dùng Production để thử, không phát hành hóa đơn thật hoặc thay đổi dữ liệu doanh nghiệp thật.

## Kết quả kiểm chứng

| Ca | Kết quả và bằng chứng | Giới hạn |
|---|---|---|
| T39-S1 | **Đạt trên QA thật**: PDF cho PAYMENT_NOTICE và WORK_RESULT; PNG/JPEG cho khách khác. Tạo metadata, upload, máy chủ đọc byte/magic/size/SHA, finalize, gắn thông báo/kết quả công việc và tải xuống có xác thực. `STORAGE_REAL_QA171`, `STORAGE_BOUNDARIES172` | Portal đọc qua API stream có kiểm quyền từng lần. SDK Storage trực tiếp và URL mang quyền truy cập bị chặn có chủ ý, kể cả khách đúng quyền. |
| T39-S2 | **Đạt trên QA thật**: signed upload, PATCH, dấu xác minh và binding đối tượng ngay lần thành công đầu, gắn vào receipt và đọc lại độc lập. `STORAGE_INTERNAL_FIRST173` bổ sung cho `STORAGE_REAL_QA171` | Kiểm trên nguồn kho cùng chi nhánh. Không suy rộng thành mọi biến thể nhận/giao/trả. |
| T39-S3 | **Đạt trong phạm vi đã thử**: sai người/sai khách/sai chi nhánh bị chặn; người dùng không overwrite/delete. Thay tệp bằng quyền quản trị trên đối tượng QA làm dấu cũ mất hiệu lực; thông báo đã ghi giữ nguyên. `STORAGE_REAL_QA171`, `STORAGE_BOUNDARIES172` | Quyền quản trị Storage vẫn có thể sửa đối tượng. Ứng dụng không cho thay nội dung tại cùng minh chứng; sửa bằng minh chứng mới, có nguồn xử lý. Không coi mọi tài khoản disabled đã được kiểm. |
| T39-S4 | **Đạt trên backend thật**: ngắt trước upload, sau upload trước download, và mất phản hồi finalize sau commit; retry cùng intent chỉ một object/attestation/binding/audit. Browser nội bộ mất phản hồi, reload và chọn lại cùng tệp giữ một minh chứng. Thông báo tiền cũng reload/retry cùng intent: một notice/receipt/audit. `STORAGE_REAL_QA171`, `STORAGE_NOTICE_RELOAD174` | Ngắt mạng có kiểm soát tại test transport; không tạo phản hồi thành công giả. UUID được lưu, không lưu byte hoặc dữ liệu tiền trong trình duyệt. Người dùng cần chọn lại tệp sau reload. |
| T39-S5 | **Đạt cơ chế và dữ liệu QA đại diện**: khảo sát 91 tệp thật, chạy 10 rồi tiếp tục 81; bốn phân loại thực và xác minh lại một tệp cũ qua RPC chuẩn. Giữ metadata/người tạo và phiếu tiền cũ; retry không thêm audit. `STORAGE_LEGACY_QA_COMPLETE`, `STORAGE_LEGACY_REVERIFY173`, `STORAGE_LEGACY_IMPACT_QA` | Không khảo sát Production. 91/91 khớp byte không có nghĩa cả 91 đã được xác minh lại ở DB; chỉ một đã thực hiện, 90 còn cần quy trình có trách nhiệm. |
| T42-R1 | **Đạt trên kết nối QA thật**: JWT trước đăng ký, participant nhận INSERT, nonparticipant nhận 0 và query bị từ chối; ngắt/reconnect và query bù. Browser người giao nhận tin tức thời, mất mạng rồi tự lấy tin bỏ lỡ, không cần reload hoặc tin mới. `REALTIME_QA_RELEASE170`, `REALTIME_BROWSER_RECOVERY_FINAL` | Realtime chỉ là tín hiệu refresh tin nhắn. Không dùng làm nguồn quyết định kho, tiền hoặc công nợ. |
| T42-R2 | **Đạt browser fallback**: chặn WebSocket, đọc và reload tin đã lưu qua truy vấn có JWT; không lệnh nghiệp vụ mới, 0 lỗi browser bất ngờ. `MESSAGING_BROWSER_RELOAD171` | Không dùng ca fallback để thay bằng chứng WebSocket; có bằng chứng riêng ở R1. |

Các định nghĩa cuối là migration 170–174. Lỗi mới đã sửa: portal upsert có thể thay đối tượng; download chưa so byte sau kiểm quyền; Origin nội bộ Next khác HTTP Host; UUID upload/notice mất khi reload; finalize nội bộ lần đầu chưa ghi attestation/audit; Realtime đăng ký trước JWT và không bù tin khi mạng trở lại. Migration 173 là thử chẩn đoán danh tính, 174 gỡ nó; giữ lịch sử đã áp dụng bất biến. Không cấp quyền nhân sự/vốn hoặc giữ API danh tính mới.

## Môi trường và nâng cấp thử

Dự án được phép dùng: `HienXaERPv2-QA`, ref `ffrwiglcrlumfvhubaxg`. Đã kiểm guard, kết nối TLS và ba bucket private; bí mật không được in hoặc commit. Native gateway vẫn không chuyển Storage/business sang cloud; việc thử thật dùng ứng dụng QA riêng gắn trực tiếp dự án QA.

QA ban đầu có 85 history entries, thiếu hai migration cũ và có một hotfix riêng `20261002114730`. Đã đọc drift: revocation cũ tác động **0** dòng quyền, index chỉ bổ sung; hotfix đã có forward reconciliation trong kho. Giữ nguyên mục history riêng. Sao lưu DB riêng mode600 trước thử, rồi áp dụng 87 file còn thiếu trong một transaction: hash toàn bộ cột cũ của **111 bảng public/private và Storage** giữ nguyên. Sau thêm 172–174: QA có **175 history entries = 174 file canonical + một hotfix cũ**. Không dùng số đếm này thay cho đối chiếu định nghĩa. RELEASE_EFFECTIVE174 đối chiếu288 hàm/ACL: các contract Storage/Realtime khớp; một helper quotation chỉ khác định dạng SQL, đã đọc diff và giữ nguyên.

Native main, fresh và bản sao nâng cấp 136→164 chỉ áp dụng các forward mới 170–174, có backup và đối chiếu dữ liệu cũ; không chạy lại toàn gói. Dữ liệu QA nghiệp vụ mới sau nâng cấp được tạo bằng lệnh chuẩn để kiểm chứng file, không phải dữ liệu doanh nghiệp thật. Không nhập đầu kỳ, tạo số 0, đổi activation, đổi giá chứng từ cũ hoặc chạy hai race ứng trước.

## Quy trình minh chứng cũ

1. IT và Owner chi nhánh chuẩn bị kết nối đọc được phép, snapshot metadata/đường dẫn/basis và các nguồn bị ảnh hưởng. Không lấy quyền quản trị làm quyền nghiệp vụ.
2. Chạy công cụ `scripts/qa/remediation/reverify-evidence.mjs` ở chế độ chỉ đọc. Manifest và checkpoint riêng mode600; ghi hoàn tất từng tệp rồi sync. Resume chỉ cùng snapshot; snapshot khác phải mở đợt mới và giữ kết quả cũ. `--retry-inconclusive` chỉ đọc lại phần chưa kết luận. Công cụ không tự ghi attestation hoặc thay trạng thái chứng từ.
3. Phân loại **MATCH**, **MISMATCH**, **MISSING**, **INCONCLUSIVE**. MATCH cần byte thật khớp size, magic và SHA đã ghi; thiếu basis giữ chưa xác minh. Không suy missing từ HTTP404 bị che quyền: phải kiểm lại inventory bằng kết nối máy chủ đủ quyền. QA đã thử cả bốn lớp, gồm đối tượng bị mất có kiểm soát và không gắn nguồn nghiệp vụ.
4. Owner chịu trách nhiệm duyệt từng hồ sơ. Kho/Mua hàng xử lý file nhận/trả NCC; Điều hành xử lý giao nhận; Tài chính xử lý ảnh thông báo tiền. IT đọc lại byte tại máy chủ và dùng `finalize_*_verified` với danh tính người vận hành đã xác thực, đủ quyền chi nhánh; kiểm lại binding id/version và audit. Retry cùng intent; không insert trực tiếp bảng private hoặc sửa SHA để khớp tệp sai.
5. Sai/mất/chưa đủ quyền: ghi **chưa xác minh**, nguồn ảnh hưởng, người xử lý và hướng thu lại minh chứng. Không xóa chứng từ, đảo tiền/nợ/kho, hủy giao nhận hoặc sửa hoa hồng đã trả. Nội dung thay đổi cần minh chứng mới; dấu cũ và facts cũ giữ lịch sử.
6. Đối chiếu từng nguồn, hash metadata cũ, số audit/receipt và trạng thái xác minh; lưu báo cáo trước/sau, phần chưa kết luận và thông tin tiếp tục. Không đánh dấu toàn bộ legacy hợp lệ/không hợp lệ.

Danh sách QA có 79 portal +12 nội bộ; 22 liên kết nguồn trên 22 tệp, 69 tệp chưa có liên kết chứng từ nhưng vẫn có context. `evidence/STORAGE_LEGACY_IMPACT_QA.json` ghi ID, đường dẫn, trạng thái metadata, phân loại, trạng thái kiểm lại, nguồn và vai trò chịu trách nhiệm. Đây không phải danh sách ảnh hưởng doanh nghiệp thật. Bộ khảo sát trước nâng cấp còn hiệu lực về byte/basis vì đối tượng và metadata cũ được đối chiếu không đổi.

## Điều kiện còn chặn

| Ca | Cần bổ sung | Phạm vi bị chặn / bước tiếp |
|---|---|---|
| T42-G1 | Thiết bị giao nhận thật; tài khoản QA, công việc/phân công thử; URL HTTPS thiết bị truy cập được; người vận hành cấp/từ chối quyền OS, kiểm nền và mất mạng | GPS đo/gửi vị trí từ thiết bị. Chưa có thiết bị kết nối trong phiên này; không dùng tọa độ giả để báo đạt. |
| T42-G2 phần thiết bị | Cùng thiết bị/phiên trước và sau đổi người, tài khoản người mới, nguồn công việc hợp lệ | GPS đầy đủ từ thiết bị qua endpoint. Giữ bằng chứng thu hồi người cũ ở backend/JWT; không suy rộng thành hardware đã đạt. |
| T35-L1 | Nhà cung cấp được chọn bởi doanh nghiệp; tài liệu API; endpoint sandbox; mã đơn vị/tenant và MST; credential; chứng thư/chữ ký và cách ký theo nhà cung cấp; mẫu/ký hiệu; quy tắc tra cứu/idempotency và tài khoản sandbox | Phát hành/tra cứu/khôi phục hóa đơn pháp lý. Nội bộ/đối chiếu/PDF/CSV vẫn đúng nhãn; không tự chọn provider, không issue thật. |
| T39-S5 dữ liệu thật | Snapshot/export đọc được phép của minh chứng và nguồn thật; kết nối đọc object; Owner từng chi nhánh và người xử lý các lớp sai/mất/chưa kết luận | Dùng minh chứng cũ sau nâng cấp thật. QA chỉ chứng minh cơ chế; chưa kết luận bất kỳ tệp doanh nghiệp thật nào. |
| Khôi phục Storage môi trường đích | Bản sao file + metadata/version, quyền dịch vụ và phương án restore có kiểm chứng riêng | DB dump không phải backup/restore byte Storage, Managed Auth hay PITR. Chưa diễn tập trên môi trường đích. |

Những ca mở rộng T04/T05/T06/T12/T19/T21/T25/T30/T36/T37/T40/T41 ở FINAL_REVIEW vẫn giữ giới hạn đã ghi; không tự xóa khỏi phạm vi để tuyên bố đạt.

## Xem xét hợp nhất và triển khai

**Xem xét hợp nhất:** reviewer đối chiếu mã/migration và chứng cứ cuối, CI đúng head đạt; xác nhận các giới hạn G01–G23, bốn lớp legacy và các phụ thuộc chưa kiểm. PR giữ nháp; task này không quyết định hoặc thực hiện merge. Các blocker phát hành chưa được biến thành PASS của toàn hệ thống.

**Triển khai:** cần phê duyệt riêng, môi trường đích và toàn bộ phụ thuộc của phạm vi đã chọn, backup/restore DB + byte Storage, khảo sát/xử lý legacy thật, bản ứng dụng/schema đồng bộ, private key chỉ tại server, smoke test đúng quyền và giám sát. GPS và hóa đơn pháp lý chưa đủ nghiệm thu. Không tự thu hẹp phạm vi; nếu muốn phát hành phần nhỏ hơn, người dùng phải quyết định rõ tính năng, phụ thuộc và tác động vận hành.

Hai race ứng trước `package4-advance-race.mjs --mode different-intents` và `--mode same-intent` không chạy lại, kể cả CI. Giữ bằng chứng một phân bổ600.000đ/còn400.000đ/một phiếu tiền.
