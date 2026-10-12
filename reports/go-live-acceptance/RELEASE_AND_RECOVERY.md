## Trạng thái hiện hành — tích hợp GitHub ngày 12/10/2026

Người dùng yêu cầu cập nhật PR42 và merge ngay, không chạy thêm kiểm thử và không chờ CI; chấp nhận sửa lỗi sau. Đây là quyết định tích hợp mã GitHub, không xác nhận nghiệm thu toàn hệ thống hoặc GO LIVE. Chỉ dùng single agent theo chỉ đạo mới; các sub-agent đã dừng.

Nền GitHub trước tích hợp: PR42/codex/business-flow-remediation-g01-g23 `73c3d172124679ae1bcf6c6cb59b7446efb6a76d`, main `e3b3524d6da3ced2a8269f444721aa7fe91a1be8`. Phần mã mới gồm forward180–186 và các sửa giao diện/reader/draft. QA native186, managedQA187history=186canonical+hotfix riêng; không suy phiên bản Production từ QA.

Các kiểm tra đã hoàn thành trước lệnh bỏ kiểm tra: 622 unit/91tệp,25Node,typecheck,build; lint0lỗi/13cảnh báo nền. CI của commit mới chưa được xác minh và không được thay bằng CI73c3d17. Vercel git deploymentEnabled.main=false; không triển khai ứng dụng/migration hoặc ghi dữ liệu doanh nghiệp trong bước này.

Bằng chứng mới: `MONEY_DETAIL186.json`, `MONEY_READER186.json`, `ACCESS_MESSAGING186.json`, `SERVICE_DISPATCH186.json`, `CONFIGURATION186.json`, `FINANCE_CONFIG186.json`, `SOURCE_ROUTE_AUDIT186.json`, `MASTER_DRAFT_REVOKE186_AFTER.json`, `DOCUMENT_READ186.json`, `NATIVE_SCHEMA_PARITY186.json`, `ORIGINAL_PRESERVATION186.json`.

Tiền lớn, cấp/thu hồi quyền trên phiên hiện hữu, giao/heartbeat/hủy việc, receiver trước/sau publish, hủy phiếu giải phóng reservation đã đạt đúng phạm vi artifact. Các lỗi harness cũ vẫn lưu tại attempt files; PASS cuối không xóa lịch sử lỗi. Không chạy lại hai race ứng trước; giữ600.000đ/400.000đ.

Còn thiếu trước phát hành: ca invite/recovery Auth, một số biến thể override/quick supplier/recognition/request quote change và đọc nguồn động trong coverage review; URL doanh nghiệp, TLSDBbackup/restore, serversecret hợp lệ, bản sao dữ liệu/tệp đích và diễn tập phục hồi/giao dịch sau backup, triển khai và kiểm chứng sau triển khai. Không đánh dấu chúng PASS từ nguồn hoặc CI. GPS thiết bị/phát hành hóa đơn pháp lý vẫn hoãn.

`TARGET_SCHEMA78_REHEARSAL.json` chứng minh reconstruction và bridge thử nghiệm có catalog khớp fresh186; raw replay8migration cũ FAIL. `TARGET_SCHEMA78_EXPERIMENTAL_BRIDGE.sql` có guard cụm native, không dùng trực tiếp ở Production, không tự repair ledger. QA restore101objects/26.126.312bytes không thay backup/restore doanh nghiệp.

Các đoạn phía dưới là lịch sử theo từng phiên bản; phần hiện hành này có ưu tiên khi trạng thái cũ khác nhau.

---

# Phát hành và phục hồi

**Chưa diễn tập hoặc triển khai trên doanh nghiệp.** Người dùng đã cho phép sau khi vượt đầy đủ cổng; không cần xin lại quyền đã cho.

## Đích và đầu vào

Vercel`hien-xa-erp-v2`/team`hienxa`:Productionmain/e3b3524,URL200`hien-xa-erp-v2-nu.vercel.app`. URL lịch sử`app.hienxavlxd.com`402/DEPLOYMENT_DISABLED. Cần xác định URL doanh nghiệp thực dùng; không tự chuyển dữ liệu giữa hai hệ thống.

Supabase`nbwynrwkdbtfsitafsxa`:78history/latest20261009224842,1SO/0phiếu tiền/0Storage/0metadata minh chứng tại lần đọc gần nhất. Đây chỉ là inventory dự án này. Chưa có DBconnection Production vớiTLS để sao lưu; CLI chưa đăng nhập. Cần tệp credential riêng hoặc CLI có quyền, không dán bí mật vào chat/repo. Secret Supabase máy chủ tại Vercel là placeholder; cần key thực đúng dự án cho Storage/Auth quản trị. Không lấy keyQA hoặc publishable thay thế.

## Cổng trước merge

Hoàn thành role/subsystem/case bắt buộc, sửa lỗi tiền/kho/nguồn/quyền/state và luồng kẹt; đối chiếu source/schema/evidence; type/lint/test/build và CI đúng commit. Đọc review/rules thực tế, không tự approve hoặc bỏ bảo vệ nhánh. PR42 giữ nháp khi cổng này chưa đạt. GPS thiết bị và hóa đơn pháp lý được hoãn theo người dùng; internal/export phải đúng nhãn.

## Diễn tập bảo toàn trước Production

1. Chụp manifest migration/định nghĩa/ACL/trigger/RLS và bản sao đầy đủ DB/Auth theo quyền hợp lệ. Lưu riêng hạn chế quyền, kiểmSHA và đọc archive; không in secret/PII.
2. Inventory Storage theo bucket/object/version/path và nguồn. Hiện0object/0metadata; đọc lại trước nâng cấp. Nếu có tệp mới, sao lưu byte/size/SHA, diễn tập restore cả byte và metadata. DBdump không thay filebackup.
3. Restore bản sao sang môi trường thử. So toàn giá trị cột cũ, khóa/FK,warehouse/transit/cargo,AR/AP,payment/allocation,advance/credit,open/posted docs, quyền/state. Thử tiếp tục chứng từ cũ và retry một tác động trên bản sao.
4. Lập migration thiếu theo ledger78 và định nghĩa hiệu lực. Có file cũ thiếu trước head đích; đọc semantic/ACL/trigger trước khi áp dụng, không chép hàng loạt hoặc sửa history để vượt lỗi. Không opening/activation/issued/proof giả.
5. Áp dụng từng checkpoint, backup/hash/readback; thử restore snapshot cũ và app cũ. Chỉ gọi diễn tập đạt khi có kết quả thật.

QA mới phục hồi122 bảng khớp nội dung từ backup trước177;fresh177/bản nâng cấp177 khớp289 hàm/ACL. Cloud175–177 giữ hash cũ. Không dùng kết quả QA thay Production78.

## Cửa sổ, thứ tự và phục hồi

Chọn cửa sổ sau khi biết đích, người phụ trách và giao dịch đang ghi; có khả năng ngừng ghi. Candidate`vercel.json` tắt main Git auto-deploy để merge không tự phát hành trước DB/recovery. Deploy tường minh artifact đã nghiệm thu; ghi SHA sau merge/runtimefingerprint/migration/thời điểm. Không triển khai app mới khi schema thiếu hợp đồng worker/Finance177. Diễn tập tương thích phải bao gồm các forward cũ của nhánh, không chỉ3file mới.

Nếu chỉ app lỗi và DB/facts tương thích, promote artifact cũ đã ghi và kiểm đọc theo vai trò. Nếu migration/dữ liệu lỗi, ngừng ghi/lưu forensicbackup/log, restoreDB+Auth+Storage theo kế hoạch đã thử. Mọi giao dịch sau checkpoint phải được đối chiếu; không restore đè làm mất giao dịch. Sau deploy chỉ đăng nhập/read/query/report/log và so trước-sau; không tạo đơn/xuất kho/thu tiền thử trên Production.

## Minh chứng cũ

Dùng quy trình`../business-flow-remediation/RELEASE_BLOCKERS.md`/công cụ`reverify-evidence.mjs` có checkpoint/resume. Bốn lớp MATCH/MISMATCH/MISSING/INCONCLUSIVE; không tự đánh dấu hàng loạt. Owner chi nhánh quyết định nguồn; Kho/Mua hàng xử lýreceipt/vendorreturn,Điều hành delivery,Tài chính notice. Thiếuproof không xóa chứng từ/đảo kho/nợ. Dự án hiện0metadata chưa kết luận hệ thống doanh nghiệp khác khi URL/DB chưa xác nhận.


## Bổ sung tương thích179

Ứng viên yêu cầu179,CloudQA180history(hotfix riêng). Auth178 thêm pre-request public.require_active_api_actor tại roleauthenticator; phải đọc hook hiện có trước upgrade. Migration từ chối ghi đè hook khác, giữ statement_timeout/lock_timeout và các cấu hình role khác. Native ownedPostgREST dùng db-pre-request tương ứng; chỉ NOTIFY/restart đúng dịch vụ, HUP có thể làm dừng16.4. Không cần/cấm cấp thêm quyền đọc private schema để vượt lỗi.

Native/fresh179 đã so292functions/ACL và toàn publicviews/policies. Nativebackup179 gồm1001nguồnexport vàca30m lưu riêng/readable; khôngthay backup/restore đích. AuthUIDshim native không chứng minh ban thật; proofban/unban dùng Auth+DBQA thật. Forward178/179 khôngđổi facts cũ. Viewworkforce giữ columns/grants/security_invoker, sửa chỉ join.
