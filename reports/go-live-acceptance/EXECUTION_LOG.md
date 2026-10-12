# Nhật ký thực thi

**CHƯA HOÀN TẤT** — đang triển khai và nghiệm thu; không phải phê duyệt phát hành.

| Thời điểm | Môi trường/version | Thao tác/kỳ vọng | Thực tế | Bằng chứng |
|---|---|---|---|---|
|2026-10-12|Gitlocal79b0b91/main e3b3524/PR42e7f1740|Xác minh head/dirty/upstream; không mất local|Remote refs khớp; candidate riêng; original không đổi|BASELINE_AND_INTEGRATION.md; private backup manifest|
|2026-10-12|Native/Cloud QA174/175|Giữ chứng cứ cũ và loại trừ hai race|Hai script race không gọi; proof600000/400000 giữ|../business-flow-remediation/EVIDENCE_INDEX.json|
|2026-10-12|Production chỉ đọc|Xác định hosting/schema|nuURL200,appURL402; DB78history; chưa backup|BASELINE_AND_INTEGRATION.md|

|2026-10-12|Candidate uncommitted/schema175 native|Sửa/kiểm quantity, retry, không opening|Affected unit/type PASS; native standard15→14→13, revenue2990000/payment1000000/debt1990000/cargo1 PASS; rollback|SOURCE_FLOW_NATIVE175.json; NO_OPENING175.json; NATIVE_FORWARD175.json|

|2026-10-12|Native browser clone175|SO/PO/partial receipt acrossSales/Purchasing/Warehouse|SO/POcreate+confirm and receive10+5 persisted/reloaded. Harness corrections: button selector, URL→UUID parsing, transienttoast replaced with DBreadback, workerloginpredicate, streamingmainselector. No business replay; resumed unfinished steps|BROWSER_SOURCE_FLOW175-attempt1..6.json; screenshots; current BROWSER_SOURCE_FLOW175.json|
|2026-10-12|Ownedbrowserclone only|Roles must read SO source per current managed QA contract|Scopednewbranch role copies add orders.read forPurchasing/Warehouse/Finance; no cost/write additions, no Production/originalQA rights change|BROWSER_ROLE_CONTRACT175.json|
|2026-10-12|CloudQA ff... history175→176/canonical175|Backup/TLS, atomicforward, oldrows preserved|PASS; alloldpublic/private/Storage hash unchanged; actualbackupprivate; no Productionaccess|CLOUD_QA_FORWARD175.json|

|2026-10-12|Candidate/native177|T12 two concurrent stock reservations on15|PASS: twoUID/PIDs and observedblocking; reserve10 once, rejectedsource10 has0receipt; noadvance race|INVENTORY_RACE177.json|
|2026-10-12|Candidate/native177|Quantity/version/audit regression|26checksPASS rollback|QUANTITY_VERSION_AUDIT_SEAMS177.json|
|2026-10-12|Ownerbrowser/native177|All46static admin surfaces load|46PASS_READ,0fail; read-scope only, action acceptance separate|BROWSER_STATIC_READ177.json|

|2026-10-12 11:54–11:57 +07|Ứng viên mới, trước commit|Kiểm thử/kiểu/quy tắc/bản dựng|599 unit/89 tệp và8 Node đạt; typecheck/build đạt; lint0 lỗi/13 cảnh báo nền; không chạy advance races|Log riêng resumed-unit177, resumed-typecheck177, resumed-lint177, resumed-build177, resumed-evidence-node177|
|2026-10-12 11:56 +07|Native QA mới, schema176|Phục hồi bản sao trước177; không tạo lại giao dịch đã hoàn tất|Khớp SHA bản sao và nội dung122 bảng; giữ các bằng chứng sau mốc sao lưu, không giả chúng tồn tại trong bản phục hồi|NATIVE_BACKUP_RECOVERY_RESUME.json|
|2026-10-12 11:56 +07|Native QA phục hồi|Áp dụng duy nhất forward177, cấu hình AuthQA thật→PostgREST native|Schema177; không Production; bí mật chỉ lưu riêng|NATIVE_SCHEMA_PARITY177.json|
|2026-10-12 11:58–12:01 +07|Native177/AuthQA thật/trình duyệt|Giao nhiều dòng và mất phản hồi sau lưu|SO/phân nguồn/giao/worker/verify UI;3m³/2bao25kg; revenue/AR740000/cargo0/stock0/verification1. Abort sau API200; retry một kết quả. Lỗi bộ chạy về mã UOM/chờ streaming/tên cột được sửa và tiếp tục đúng hồ sơ, không xuất/verify lần nữa|BROWSER_MULTI_DELIVERY_RESUME177.json; screenshot multi-delivery-verified-retry.png|
|2026-10-12 12:02–12:04 +07|Native177/AuthQA thật/trình duyệt|18 lượt đọc vai trò và revoke/reactivate quyền|Đạt. Lần đầu bộ chạy chờ thông báo của form đã unmount nên timeout; quyền QA được khôi phục bằng RPC chuẩn. Lần sau đọc lại DB/phiên cũ/UI đạt|BROWSER_ROLE_LIFECYCLE177-attempt1.json; BROWSER_ROLE_LIFECYCLE177.json|
|2026-10-12 sau12:04 +07|Native fresh177 và bản phục hồi177|Kiểm cấu trúc mới và định nghĩa sau nâng cấp|177 migration đạt; public thiếuRLS0;289 hàm/ACL khớp;23 contract Storage/Realtime174 không đổi|FRESH_SCHEMA177_RESUME.json; NATIVE_SCHEMA_PARITY177.json|
|2026-10-12|Production chỉ đọc|Đối chiếu chưa đổi môi trường doanh nghiệp|78 migration/latest20261009224842;1SO/0payments/0objects/0metadata minh chứng. Không backup/restore/deploy/ghi sổ|BASELINE_AND_INTEGRATION.md|
|2026-10-12 12:13–12:14 +07|HTTP boundary/unit|Không nhận lượng bị JSONnumber làm mất precision|Hai redcase tái hiện200thay409; đổi sangdecimaltext;4tệp/25ca và89tệp/602unit đạt|Numeric JSON red/green log riêng; route.test.ts/input.test.ts|
|2026-10-12|Native177/AuthQA thật|HTTP numeric-denial và retry exact payload cũ|Bộ chạy đầu thiếu cookiechi nhánh→select-branch; chưa gọi writer. Sửa bộ chạy chỉ đọc/retry, giữ source cũ và hash toàn122bảng|QUANTITY_HTTP177_RESUME.json khi hoàn tất|
|2026-10-12|Native177/HTTP có AuthQA|Từ chối số JSON mấtprecision và exact retry|Đạt3checks:2HTTP409trướcwriter; exactdecimal/cùngintent trả kết quả cũ200;122bảng không đổi|QUANTITY_HTTP177_RESUME.json|
|2026-10-12|Native177, rollback|Giữ semantics local finite/zero count và directPOterms|6negativefinite/cost,0count hợp lệ; helper chạyRPCthật theo2command; retry giữdraftversion2/terms/source; đổipayload bịchặn; legacy5args một signature. Không commit facts|LOCAL_DELTA_SEAMS177.json|
