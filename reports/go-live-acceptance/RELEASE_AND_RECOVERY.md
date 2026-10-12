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
