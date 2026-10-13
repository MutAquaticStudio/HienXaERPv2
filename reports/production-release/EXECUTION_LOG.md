# Nhật ký phát hành

|UTC|Môi trường|Thao tác|Kết quả/bằng chứng|
|---|---|---|---|
|2026-10-12 18:50–19:10|GitHub/local|HEAD a21af16/PR44/CI171; giữ checkout gốc|CI619 unit/15 Node/type/lint/build đạt;12.534 tệp gốc,0 khác biệt|
|2026-10-12 19:00|Production connection|Session pooler đúng ref; CA/hostname TLS|TLS1.2 đạt; chưa xác thực mật khẩu; thư mục riêng0700/env0600|
|2026-10-12 19:10–19:20|Supabase readonly|Closure SO/PO/FK/guard/roles/Auth/Storage|Phân loại từ xác nhận chủ hệ thống/marker rõ; không suy toàn master là thử|
|2026-10-12 19:20:45|Production79|owner_authorized_uat_cleanup_20261013|34 dòng xóa; toàn dòng public/private giữ lại và5 guard so trong transaction; UAT_CLEANUP_RESULT.json|
|2026-10-12 19:28|Production79|Auth UAT đã ban/không liên kết người/khách|8 user/8 identities/53 audit xóa;2 user/master thật giữ; không tạo tài chính thử|
|2026-10-12 19:35–19:49|Production79|4 role LIVE-UAT không có nhân viên|4 roles/39 quyền xóa; Owner1/quyền62 giữ; so prefix trên master code|
|2026-10-12 19:30–19:49|Native49761 riêng|Forward78→187 rồi đúng artifact|8 nhóm catalog khớp fresh187;303 hàm/52 view/127 policy/111 trigger; dọn DB thử|

Exact bundle attempt đầu bị harness từ chối “begin” trong chuỗi SQL ledger trước áp lên Production. Lưu original SQL bằng base64 giải mã tại DB để giữ byte; kiểm lại đúng artifact và so fresh đạt. Không sửa nghiệp vụ để vượt lỗi.

Backup được chủ hệ thống miễn; không ghi ca chưa chạy thành đạt. Không đặt lại mật khẩu/đổi key từ sentinel/dùng QA làm Production. Hai race ứng trước không chạy lại, giữ600.000đ/400.000đ. Bằng chứng UI cũ giữ đúng source/timestamp/phạm vi.

Merge,migration đích,deploy/readback sau deploy sẽ được ghi theo kết quả thực tế; chưa đánh dấu ở các hàng trên.

## Sau checkpoint

- 20:05 UTC:PR44 merge8f65d70,src/migrations/package/lock/vercel so với e4940b1 không khác; CI173 đúng merge SHA success.
- 20:28:56 UTC:compact upgrade8574eadb… áp thành công nguyên tử. Readback181 history,101 canonical đuôi,304 hàm(303app+1platform),52view/127app policy/111trigger;0opening initializer/tiền/kho/AR/AP/opening phát sinh. Các settings authenticator cũ giữ và thêm hook active actor.
- Production remote buildNext16.3.4/TypeScript/static routes đạt; dpl_G6k57Drjkh3cJuG9DHXFcY1rGKp1 READY,aliasnu. Health đúng8f65d70. Authenticated DB Owner đọc1customer/1employee;unassigned UID thật đọc0branch/customer/employee;read-only/rollback.
- Post-deploy harness ban đầu đòi307 trên streamed page và401 trên API thiếu tham số:đối chiếu Next16 docs/route,đổi kỳ vọng đúng meta redirect/invalid_selection/307 login; không sửa app để làm test đạt.
- BrowserIAB1280×900/390×844,nội dung/nhãn/focus/chuyển cổng/toggle rỗng đạt;console0. Screenshot viewport vật lý của panel ban đầu chưa khớp override:không giữ ảnh đó làm chứng minh;ảnh fullPage theo DOM dimensions được lưuJPG.
- 21:10:58 UTC:align_business_api_table_privileges thực thi; tái hiện overgrant native,bảo toàn CRUD,thử default bảng mới đạt. Readback0DDL privilege thừa,Owner62,data giữ,hist182. CLI draftfile được đổi tên khớp version thực ghi; SQLbyte không đổi,không repair DBhistory.
- Runtime500 log cho deploymentG6k không có bản ghi trong cửa sổ đọc; kiểm HTTP không có5xx. Đây là phạm vi truy vấn log,không suy mọi chức năng đã chạy.

Sao lưu không chạy theo chỉ đạo mới. Không tạo giao dịch tài chính/kho,không chạy2 advance races,không gửi email/invite,không reset mật khẩu hoặc thay secret từ sentinel.

##13/10/2026: chốt PR45 và tiếp nhận lỗi spacing

- PR45 merge68903bb; CI38310446772 đúng merge SHA success. DeploymentFxnSHk READY/Production đúng target; health trên alias trả68903bb.
-06:38UTC:11 kiểm HTTP/Auth/anonymous boundary đạt; log5xx trong1h không có bản ghi; không ghi tài chính/kho.
-06:39UTC:DB readbackhist182/latest20261012211058/Owner62/0overgrant/0SO/0PO/2Auth/0Storage.
-06:38UTC:12.534 tệp gốc/HEAD/branch/default status đối chiếu manifest,0 thay đổi. ORIGINAL_PRESERVATION_FINAL.json.
- Người dùng đăng nhập thật và browser vào/admin dưới Owner; tổng quan/dữ liệu/phân quyền hoạt động đọc. Không coi tài khoản Owner là kiểm chứng mọi vai trò.
- Chủ hệ thống chỉ ra hai thẻ Tổng quan thiếu spacing. Tiếp tục sửa trên codex/dashboard-card-spacing, không tuyên bố UI không còn lỗi. Local15 biến thể hiển thị đạt, nguồn tài chính không đổi.


## 2026-10-13T10:56:31.014591+00:00 — PR47 giao diện phát hành

CI head792a509/run38382113455 và merged538e9f/run38382583091 success623. Merge tree khớp. Deploy đúngd538e9f,artifact8HgrA,alias READY.11 HTTP/Auth checks và17 Owner/UI observations đạt;142 bảng453 dòng fingerprint giữ nguyên;5xx query10m không có entry. Không migration/dọn dữ liệu/ghi sổ. Chi tiết iteration-2/RELEASE_RESULT.json.


## 2026-10-13T12:26:32.763970+00:00 — PR48 RBAC

CI b3e/cb6 đạt648,type/lint/build. Migrationname operational_role_presets/version20261013121739,SQLMD5khớp;8role/100permissionpairs,Owner62/binding140bảng/127policies/ACL giữ. Deploycb6/artifactB37gX/aliasREADY;11HTTP/Auth và142fingerprintsau deployđạt,0log5xx10m. PhiênOwnerhết,cầnđăngnhập lại để kiểm form;khôngghiPASS. Khôngemail/tài khoản/ghi sổthửProduction. Hồsơ reports/rbac-operational-roles/.
