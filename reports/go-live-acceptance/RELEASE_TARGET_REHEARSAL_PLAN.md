# Kế hoạch diễn tập nâng cấp và phục hồi đúng đích

Ngày kiểm tra: 2026-10-12. Trạng thái: **PARTIAL — chỉ kiểm chứng nguồn/cấu hình/metadata; backup và diễn tập đích Production chưa thực hiện**.

Phạm vi được giao chỉ đọc; tệp này là thay đổi duy nhất của lượt kiểm tra. Không gọi DB DDL/DML, migration, deploy, Git write, Auth mutation hoặc gửi email. Không in hoặc đưa khóa/credential vào báo cáo. Các bước dưới đây là điều kiện và trình tự cho lượt thực thi được phép sau khi đầu vào đích đã có, không phải ghi nhận đã chạy.

## 1. Bằng chứng và danh tính đích

| Thành phần | Kết quả quan sát | Giới hạn |
|---|---|---|
| Ứng viên | `/Users/nox/.codex/worktrees/go-live-acceptance/HienXaERP`; HEAD `73c3d172124679ae1bcf6c6cb59b7446efb6a76d`, có nguồn chưa commit | HEAD không đại diện toàn cây hiện tại; cần đóng băng nguồn, CI đúng commit và build artifact trước phát hành |
| Bộ migration tại lần đọc ban đầu | 185 tệp; `20260912101030` đến `20261012093644`; fingerprint manifest `3aa88fe122576c4d6690a3b8cefed2b9e6b7e53149fb131a8735df34c480ec41`; kiểm tra lớp transaction envelope 185/185 không báo lỗi | Đây là kiểm tra tệp SQL, không phải kiểm tra thực thi hay semantic parity |
| Production DB đã được đọc | `nbwynrwkdbtfsitafsxa`; ledger 78, đầu cuối `20261009224842`; inventory đã ghi 1 SO, 0 payments, 0 Storage object | Không dùng row count để kết luận không có dữ liệu cần bảo toàn; chưa có bản sao/khôi phục DB thật của đích |
| Catalog metadata đích | 141 bảng: public 100, private 6, auth 27, storage 8; 202 function signatures/MD5/ACL; 5 extensions | Không chứa full function SQL, columns, constraints, views, policies, triggers, event triggers, role settings, publication membership, hoặc giá trị dữ liệu |
| Artifact đang lưu | `dpl_EBjgf4qEUdv3BjnfqwECN4A32V8v`, READY/production; tạo `2026-10-10T09:46:31.089Z`; context/team `hienxa`; project từ output digest `prj_o6ya9YI1b3fTFC8nxiOtjHiwaS3W` | Metadata private là snapshot, không tự chứng minh deployment vẫn là artifact Production hiện tại |
| Các alias trong snapshot | `hien-xa-erp-v2-nu.vercel.app`, `hien-xa-erp-v2-hienxa.vercel.app`, `hien-xa-erp-v2-git-main-hienxa.vercel.app` | Quan sát toàn nhiệm vụ: alias nu hiện 200; `app.hienxavlxd.com` 402/DEPLOYMENT_DISABLED. URL doanh nghiệp chưa được xác nhận; không chuyển domain/DB giữa các hệ thống |
| Build/runtime | Private inspect: framework nextjs, Node `24.x`, runtime `nodejs24.x`; CI pin Node 24 và pnpm 11 | package.json chưa pin engines/packageManager; không suy build mới sẽ tự dùng đúng phiên bản nếu setting dự án khác |
| Nguồn app đang chạy | Hồ sơ toàn nhiệm vụ ghi main `e3b3524d6da3ced2a8269f444721aa7fe91a1be8` | Private inspect không có gitSource; các biến VERCEL_GIT trong env pull là rỗng. Cần xác minh độc lập quan hệ artifact–SHA bằng provider/git metadata trước promote |
| Môi trường kéo về, đã kiểm tra không lộ giá trị | URL khớp project Production; cloud approval true; e-invoice không bật; không có QA ref; không có DB URL/password/access token; khóa máy chủ có mặt nhưng không đạt định dạng secret/service_role | Env pull có thể chứa placeholder; không kết luận provider đang giữ khóa gì từ placeholder, không sử dụng nó như credential thật |

`PRODUCTION_CATALOG_BASELINE.json` SHA-256: `4064ddfe46de43f9b6d01037febc57d8b7814a0d8553ddde9cda34c77267ac03`.

Cấu hình candidate `vercel.json` đặt `git.deploymentEnabled=false` cho main và hai nhánh công việc, vùng `icn1`. Đây là ý định chặn Git auto-deploy trong nguồn candidate; build Production cũ chỉ ghi vùng icn1. Phải xác minh provider áp dụng cấu hình của commit mới trước merge, tránh merge vô tình phát hành trước backup/DB upgrade. Deploy/promotion phải chỉ định project/team chính xác và artifact đã được nghiệm thu.

`DEPLOYMENT.md` có URL/team và ledger 9 migration từ tháng 9; `RELEASE_APPROVAL.md` giữ lịch sử dự án khác `vknnzzecimfpnrsqbnuu`. Chúng hữu ích cho truy vết, không được dùng làm danh tính đích tháng 10. Nguồn tháng 10 là BASELINE_AND_INTEGRATION/RELEASE_AND_RECOVERY và metadata đích ghi tại nhiệm vụ hiện tại.

## 2. Chênh lệch migration và nguy cơ thứ tự

Production 78 là subset phiên bản của candidate 185; không có phiên bản Production nằm ngoài candidate. **107 tệp thiếu = 8 tệp cũ trước head Production + 99 tệp sau head**. Main 86 có cùng 78 phiên bản Production và cũng thiếu đúng 8 tệp cũ trên đích. Đây không phải 78→185 bằng cách chỉ chạy phần đuôi.

Catalog chỉ có phiên bản, không lưu statements/checksum để so nguyên bản. Chưa thể kết luận 78 phiên bản đã chạy đúng byte SQL canonical. `migrationParity` trong repo yêu cầu statements gốc; dữ liệu metadata này không đủ để trả PASS.

| Tệp cũ thiếu trên đích | Ý nghĩa thực | Rủi ro/điều kiện cần xác minh |
|---|---|---|
| `20260923162705_revoke_uat_worker_compensation_read.sql` | Xóa riêng compensation.read từ role `uat_worker`/`hxqa_worker` | Là DML quyền thật. Kiểm tra role hiện có và giữ quyền doanh nghiệp ngoài phạm vi hai mã role; không xem là migration chỉ cấu trúc |
| `20260930023428_return_case_supplier_direct_cost.sql` | Replace `resolve_return_case`, tính cost theo đúng PO/SO line cho supplier direct | Đích đã có `20261003063723` bổ sung transit guard/cumulative cost và `20261007022922` forward giữ PT409/ACL để thêm direct cost. Replay tệp cũ có thể hạ PT409 về custom 40001 và bỏ transit guard. Catalog hiện có function này, chưa có body để chứng minh direct-cost parity |
| `20260930024101_cancel_planned_delivery_release_reservations.sql` | Tạo lệnh hủy delivery chưa bắt đầu; giữ lịch sử, giải phóng reservation, audit, idempotency và grant authenticated | Catalog đích chưa có `cancel_planned_delivery`. Body cũ custom 40001; candidate forward `20261010213838` có định nghĩa mới. Không để app/API sử dụng cửa sổ body cũ trong upgrade |
| `20260930025839_audit_notice_quote_transitions.sql` | Replace review_payment_notice/send_quote_revision/accept_quote_revision, thêm audit cùng transaction | Đích đã chạy conflict rewrite `20260930101520`; replay review body sẽ đưa custom 40001 trở lại. send/accept không có create/replace trực tiếp mới hơn trong canonical; cần bảo đảm audit này tồn tại cuối upgrade và ACL không mở rộng |
| `20260930050137_cancel_scheduled_service_job.sql` | Tạo hủy service job an toàn, version/idempotency/audit | Catalog đích chưa có RPC. Body cũ custom 40001; forward `20261010213838` định nghĩa lại. Cần thử trạng thái cũ và retry trên bản sao |
| `20260930081621_replace_custom_serialization_errors.sql` | Dynamic rewrite chính xác 26 routine/29 vị trí custom 40001→PT409, yêu cầu từng routine còn custom 40001 | Đích đã có bản thay thế `20260930101520`, bản sau chấp nhận hai cancellation RPC tùy có/không. Điều kiện 26/29 của tệp cũ có nguy cơ không còn đúng. Không chạy mù, không sửa điều kiện hoặc history để vượt lỗi. Đây là blocker của chiến lược replay raw missing-files |
| `20261002071813_index_quotation_and_customer_credit_lookups.sql` | Thêm 3 index quotation/customer-prefix, IF NOT EXISTS | Catalog hiện tại không liệt kê index. Phải so columns/opclasses/definition; index cùng tên sai definition không được IF NOT EXISTS sửa. Xác minh thời gian và lock trên bản sao trước nâng cấp |
| `20261008224033_operational_opening_sources.sql` | Thêm 3 bảng nguồn opening/private receipts; mở rộng inventory/opening source constraints; triggers immutable; private post_*; views | Catalog chưa có cả 3 bảng mới. DDL drop/re-add constraints tên cụ thể có thể xung đột drift. Migration chỉ định nghĩa lệnh; không cho phép post opening/cash/AR/AP giả. Bảo toàn giá trị cũ và thử constraints trên bản sao |

Không chọn thứ tự thực thi cuối cùng từ tên tệp đơn thuần. Trước thực thi: lấy full effective catalog/definition từ đúng đích; map từng tệp thiếu thành absent/equivalent/superseded/conflicting và ghi hash, signature, owner, ACL, security, nguồn quyết định. Khởi dựng schema theo đúng tập 78 đã ghi có thể kiểm tra giả thuyết conflict độc lập, nhưng không đại diện các thay đổi thủ công hoặc dữ liệu đích.

Hướng nâng cấp phải được diễn tập thành một artifact SQL/version plan bất biến: giữ các forward đã áp dụng, bổ sung cơ chế thiếu bằng forward mới có precondition, hoặc dùng raw tệp cũ chỉ khi đã chứng minh thứ tự/final parity an toàn. Mọi việc reconciliate history chỉ được ghi sau bằng chứng semantic cụ thể và review riêng; không tự đánh dấu 8 phiên bản applied, không sửa tệp SQL đã chạy, không replay lại 78 phiên bản.

99 tệp sau head bổ sung ledger nguồn/credit/advance/return/transfer/documents, recoverable commands, quantity và money contracts, audit, evidence byte/binding, identity boundary. Phần lớn có CREATE/ALTER/replace/dynamic SQL, nên cả trạng thái bản ghi cũ và ACL/trigger phải được kiểm tra. `20261012054843` đặc biệt sửa shared authorization readers, toàn policy public/storage, views có auth.uid và role authenticator pre-request. Nó từ chối hook khác đã cấu hình: cần đọc cả global và database-specific role settings, giữ timeout/config khác, kiểm hook thực dùng trên managed PostgREST. Native shim không chứng minh Auth service boundary.

## 3. Việc còn làm độc lập khi chưa có credential đích

Có thể tiếp tục read-only review của toàn 107 tệp, tạo matrix dependency/effective object, xác minh exact source/CI/artifact/provider metadata, phân loại cấu hình và chuẩn bị manifest/checklist. Sau khi được phép viết trong môi trường thử owned, có thể dựng riêng baseline theo 78 phiên bản rồi upgrade sang 185 và so với fresh185. Diễn tập cấu trúc này có ý nghĩa để tìm lỗi precondition và thứ tự, nhưng phải ghi rõ **reconstructed baseline, không phải Production clone/backup restore**.

Không được tái sử dụng `scripts/qa/release-rehearsal.mjs` trực tiếp cho đích: guard chỉ QA, script hiện giả lập Auth/Storage và tạo bootstrap ở mốc 9; không phải baseline78. Không nới guard, đổi QA credentials hoặc biến QA backup thành Production backup. `scripts/qa/migrate.mjs` cũng bị giới hạn QA, không phải runner Production.

Kết quả đã có: native restore 122 bảng từ QA backup có nội dung khớp, QA fresh/current qua canonical185, và actual QA Storage 101 object/26,126,312 byte sao lưu–restore byte-for-byte đạt. Phạm vi những kết quả ấy được giữ nguyên. Bất kỳ inventory 0 Storage của Production nào chỉ cho phép sao lưu một manifest rỗng tại thời điểm quan sát; phải đọc lại ngay trước cutover và bao gồm mọi tệp phát sinh mới.

## 4. Đầu vào/quyền tối thiểu cho lượt thực thi đích

| Công việc | Đầu vào/quyền cần | Trạng thái hiện tại |
|---|---|---|
| Chọn đích | URL doanh nghiệp thực dùng; xác nhận URL đó đi với Vercel project/team và Supabase ref nào; tình trạng alias/domain/402 | Chưa có câu trả lời URL; không suy từ URL còn chạy 200 |
| Backup DB logical | Tệp credential ngoài Git/private directory hạn chế quyền, host/ref/port/database/user khớp đích; kết nối direct hoặc session pooler hợp lệ; TLS verify-full và CA chain; phiên bản client tương thích server | Chưa có DB credential Production. Management read-only MCP và publishable/server API key không thay PostgreSQL connection để pg_dump |
| Đọc đầy đủ backup/catalog | Role được đọc dữ liệu application/private/Auth/Storage metadata, migration history, sequence/catalog và dữ liệu bị RLS bảo vệ; quyền dump/role metadata theo khả năng Supabase | Không tự tăng role/disable RLS. Nếu scope thiếu, ghi bảng hoặc service chưa backup; không gọi dump đủ |
| Managed recovery/PITR | Quyền project backup/restore; trạng thái plan và backup/PITR thực tế, retention, earliest/latest restore point; môi trường clone phù hợp và quyền phục hồi | Hồ sơ tháng 9 ghi Free/no managed backup; chưa xác minh khả năng recovery tháng 10. Không tự mua plan/add-on |
| Storage byte backup | Server secret/service_role thật đúng project trong tệp riêng, quyền list/read tất cả bucket private; không dùng NEXT_PUBLIC; kiểm identity/version/path/size/hash | Env pull key chưa dùng được; không thay bằng QA hoặc publishable key |
| Auth/config phục hồi | Khả năng export/restore Auth dữ liệu cần thiết, Auth Site URL/redirect allowlist/provider settings, custom schema/policy/trigger, service settings; encryption/Vault key recovery nếu có | SQL Auth shim không chứng minh login/session recovery managed service |
| Restore clone | Owned isolated PostgreSQL cho data/schema check và một managed Supabase clone hoặc cơ chế provider restore/branch phù hợp cho Auth/Storage/service boundary; đủ quyền, dung lượng và routing tránh traffic thật | Chưa có target clone backed by real Production archive; không ghi lên original QA dataset để thay đích |
| Migration đích | Role ownership/quyền DDL, constraints/ACL/trigger, authenticator config + reload; reviewed immutable execution plan; backup và rollback rehearsal đạt | Chưa thực hiện; thiếu backup và semantic bridge/order |
| Vercel explicit deploy/promote | Existing authenticated account có quyền trên đúng project/team, domain assignment, env update và promote/rollback; Node24/pnpm11, framework/root/build settings; artifact SHA và env binding | Private inspect khớp Node24. Chưa nghiệm thu source dirty thành immutable release artifact |

Các credential phải được đọc từ tệp riêng hoặc provider đã đăng nhập, không yêu cầu dán vào chat. Không reset mật khẩu/rotate key chỉ vì env pull trả placeholder. Không gửi lời mời qua `inviteEmployeeAction` để thử Production: hàm ấy thực sự gửi email. Server secret cũng được evidence-storage sử dụng để download byte và finalize RPC sau kiểm quyền người dùng, nên thiếu secret đúng đích chặn chứng minh luồng evidence hoàn chỉnh.

Tài liệu Supabase hiện tại hướng dẫn logical backup/restore với session pooler hoặc direct connection, tách role/schema/data và migration history/customizations; restore/branch do provider sao chép encryption root key, còn manual restore có thêm bước xử lý key nếu Vault/encryption được dùng. Cần kiểm tra Vault thực tế vì catalog đích có extension supabase_vault. [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## 5. Diễn tập từ archive đích thật

1. Xác minh lại identity/ref/deployment và lấy full manifest/catalog/settings bằng transaction read-only có timeout. Inventory cả bảng có dữ liệu, không bỏ bảng vì rowcount thấp. Ghi schema, columns, constraints, indexes, views/options/ACL, functions/body/defaults/owner/security/ACL, policies, ordinary/event triggers, extensions/versions, sequences, role settings và publication membership. Tạo invariant theo từng nhánh và source, không chỉ tổng count.
2. Lấy consistent snapshot/checkpoint; backup schema/data/roles theo quyền, public/private/Auth, Storage metadata và supabase_migrations. Backup riêng byte Storage và settings/service configuration. Ghi thời điểm snapshot, table column-value hash, manifest size/SHA, object version/path/hash; bảo mật archive và logs. Kiểm archive đọc được trước restore.
3. Restore archive sang clone. So giá trị từng cột cũ và relationships, sequence/identity next values, Auth/branch/employee/role/access, audit/command receipt, warehouse/transit/vehicle cargo, AR/AP/payment/allocation/advance/credit, open/posted states, object byte/metadata/binding. Tổng số hàng/tổng tiền chỉ là invariant phụ; phải xét nguồn và khác biệt theo dòng. Thử login/read/deny theo vai trò tại managed boundary, không gửi email.
4. Upgrade clone theo reviewed semantic plan, có checkpoint ở phần xử lý 8 tệp cũ. Lấy manifest plan thật trước chạy, không đoán số version mới; sau đó kiểm từng nhóm dispatch, finance/return/credit, transfer/documents, evidence, Auth, canonical185. Stop tại lỗi precondition; giữ forensic evidence, không auto-repair history. So public/private effective catalog cuối với fresh canonical185 và review provider-managed differences có lý do.
5. Kiểm chứng chứng từ đích cũ còn mở tiếp tục được trên clone, nguồn cũ đã posted không bị ghi lại, version guard và operation retry không tạo tác động lần hai. Các tác động nghiệp vụ của thử nghiệm chỉ ở clone. Thử old app với baseline restore, new app với upgraded clone; thử old artifact với upgraded schema nếu muốn app-only rollback. Chưa chứng minh được tương thích thì rollback app-only không phải phương án hợp lệ.
6. Restore lại checkpoint đầu vào sang clone khác và so data/Auth/Storage/settings toàn bộ; chứng minh rollback runtime/artifact và đo RTO/RPO. Chỉ gọi target rehearsal PASS khi archive nguồn là đúng đích thực, restore trực tiếp đủ scope và các invariant/chức năng cũ cùng tương thích đã có output thật.

## 6. Cửa sổ ghi, snapshot cuối và PITR

Sau khi backup rehearsal đạt mới chốt cửa sổ: owner vận hành, người giữ quyền provider, thời gian dừng ghi và điều kiện quay lui. Freeze mọi writer: các internal/worker/customer command, direct Data API clients, jobs/webhooks/imports, Auth access mutations và Storage uploads. Một thông báo UI hoặc disable nút không khóa direct API. Drain in-flight transaction và kiểm không còn writer trước snapshot cuối; biện pháp freeze phải được rehearsal và áp dụng có kiểm soát, không tự ban/remove role doanh nghiệp.

Nếu có PITR, xác minh backup/WAL healthy và selected restore timestamp nằm trong earliest/latest recovery range; ghi điểm trước upgrade và kế hoạch dừng dịch vụ khi provider restore. Nếu không có PITR hay continuous change capture đầy đủ, giữ freeze từ consistent snapshot cuối đến kiểm đọc sau deploy; đó mới là cách giới hạn RPO cho cửa sổ. Không tuyên bố daily backup hoặc một pg_dump tự bảo toàn mọi giao dịch phát sinh sau thời điểm snapshot.

DB backup không chứa byte Storage. PITR có điều kiện plan/compute và provider restore gây downtime; phải kiểm khả dụng/retention thực tế, không suy từ lịch sử hoặc tự bật add-on. [Database Backups](https://supabase.com/docs/guides/platform/backups).

## 7. Triển khai, quay lui và giao dịch sau checkpoint

Ghi release record nối **immutable source SHA → CI/build artifact/deployment id → env project binding → execution-plan hash/migration checkpoint → Production URL**. `/api/health` candidate trả requiredMigration `20261012093644` và buildSha, nhưng không truy vấn DB, nên HTTP200 không chứng minh schema đã nâng cấp. Cần đối chiếu ledger/effective DB trực tiếp và provider metadata.

Trình tự: freeze đã xác minh → final target backup + re-inventory/restore-readability → migration plan đã rehearsal → data/permission/catalog invariants → explicit deploy/promote artifact → đọc/log/role-denial/report smoke trên dữ liệu có thật → so before/after → mở ghi. Không tạo SO, thu tiền, xuất kho, opening, evidence giả hoặc gửi email để smoke Production. Auth redirect allowlist/Site URL phải theo URL được chọn; legal invoice và GPS device vẫn OWNER_DEFERRED theo chỉ đạo toàn nhiệm vụ.

Nếu chỉ app lỗi: app-only rollback chỉ khi old artifact đã thử trên upgraded schema và env binding tương thích. Promote artifact cũ, giữ DB facts, kiểm lại read/deny. Nếu DB/source effects lỗi: đóng ghi, chụp forensic dump và Storage manifest mới trước restore. Phục hồi DB/Auth/Storage/settings nhất quán từ checkpoint/PITR đã rehearsal; tránh thay alias sang hệ thống khác để che lỗi.

**Đối chiếu delta sau backup là cổng bắt buộc** nếu xuất hiện writer sau checkpoint hoặc sau mở ghi. Giữ forensic state sau lỗi và nguồn log/WAL/audit/command receipts/Storage versions; lập từng operation và entity/source ID, transaction time, actor, state/version, amount/quantity, object checksum. Đối chiếu payment và allocation với AR/AP/advance/credit; inventory với source movement/transit/cargo; work/delivery/service state với assignments/results/verified sources; evidence metadata với object byte; access/Auth state với service. Audit/row counts không tự bảo đảm bao phủ mọi direct mutation; nếu không đủ change capture, RPO không được ghi là zero.

Không replay mù HTTP/form request, không chèn ledger reversal/opening giả, không xóa chứng từ để khớp tổng. Mỗi giao dịch post-checkpoint phải được chứng minh đã giữ, replay idempotently trên clone rồi restore path, hoặc đưa vào reconciliation/manual decision có nguồn rõ. Chỉ mở ghi khi không còn delta chưa giải thích. Nếu writer được freeze trọn cửa sổ và manifest xác minh không đổi thì ghi rõ bằng chứng zero-window-delta, không suy từ snapshot cũ 1SO/0payment.

## 8. Điều kiện kết luận

| Cổng | Trạng thái tại lượt này |
|---|---|
| Static identity/runtime configuration | PARTIAL: ref/Node/provider snapshot có căn cứ, URL thực dùng và artifact–commit association chưa đủ |
| Migration difference/order risk | PASS cho so version-set; PARTIAL cho semantic plan, vì thiếu full effective catalog và có legacy replay hazard |
| DB/Auth target archive | NOT_RUN/BLOCKED_INPUT: thiếu TLS DB connection hoặc provider backup quyền phù hợp |
| Target Storage recovery | NOT_RUN: cần fresh inventory và key thật nếu có object; QA byte PASS được giữ đúng scope |
| Actual target upgrade/rollback rehearsal | NOT_RUN; reconstructed schema rehearsal có thể hỗ trợ nhưng không thay cổng này |
| Production migration/deploy | NOT_RUN; chỉ thực thi sau đầy đủ cổng toàn nhiệm vụ và đầu vào đích |

Không có target backup/restore PASS trong báo cáo này. Công việc read-only có thể tiếp tục độc lập; missing credential chặn phần trực tiếp với đích, không chặn parent hoàn thành kiểm chứng nguồn/CI/QA còn lại.

## Phụ lục: manifest tệp thiếu theo thứ tự canonical

Danh sách này là diff phiên bản để review; **không phải lệnh chạy tuần tự**. H = tệp cũ trước head, T = phần đuôi mới sau head. SHA-256 là byte của tệp candidate tại lượt đọc.

| Loại | Tệp | SHA-256 |
|---|---|---|
| H | `20260923162705_revoke_uat_worker_compensation_read.sql` | `ca8bf947a0d3493dadf225042bf655341fbc3f7f13e6cd8a4547483ca2ab342d` |
| H | `20260930023428_return_case_supplier_direct_cost.sql` | `4d074f3128fcd7c075871e9e13290b124f912863f1567ff732a01bffbea963ff` |
| H | `20260930024101_cancel_planned_delivery_release_reservations.sql` | `d9d8fe0a7fbe728952bc9bc4050e7d4bb08801454c885b1228fdc81523da5482` |
| H | `20260930025839_audit_notice_quote_transitions.sql` | `e38d8b1e7f111e0faeb4ae7a28faf2f1fbfb1a7b02df0f7b2cef94acf6e25fc9` |
| H | `20260930050137_cancel_scheduled_service_job.sql` | `72645a2905ae1a3f2ec5f52441066345f6eef627c384d1be9ac995758eedd7b0` |
| H | `20260930081621_replace_custom_serialization_errors.sql` | `746588b9820a35c517966446d75fb34ece253f517f34f3ef3852988d86c40180` |
| H | `20261002071813_index_quotation_and_customer_credit_lookups.sql` | `cca7f71910a12e7e00e7a6e6d3cbe5bd67bcbf898b051d4ee75094ee2ed845a1` |
| H | `20261008224033_operational_opening_sources.sql` | `5ea93da878981186fe6273ef887adcc052f04c35530cfa924ec9d144cebd9994` |
| T | `20261010203345_remediation_stock_count_cost_access.sql` | `c4c26716d18702265ecf09049bc31aa9b6c2f8230b97cf58124d2cda66d5d482` |
| T | `20261010204330_remediation_count_observation_qualification.sql` | `baa5772e6ec063e4038d7f005aab55190b46121486e6b78540ae76542de1579c` |
| T | `20261010210748_remediation_stock_count_audit_history.sql` | `6dbef5ee34f9f5eb44ab9ee668867d1f39a84a39f59f73cdab6288218714dce0` |
| T | `20261010213838_remediation_quantity_cumulative_billing_versions.sql` | `42b2e94f28ead37b745b9368bb31586b2029feafee75786a7f9d7c5acb4279f7` |
| T | `20261010214948_remediation_command_outcome_lookup.sql` | `300a2805fe98fc701885e9550229851f0c323a638c660cb1d84c25225881ea0d` |
| T | `20261010215531_remediation_private_command_drafts.sql` | `f09bf586a085964917120befa38c86e595912d7c1ab1aa1ddf7c907cfe979485` |
| T | `20261010220044_remediation_intent_serialization.sql` | `148ba61d1cc33fee8d65ecebd5be37f262378c2dd4e4882f0808f6fe1f023f3f` |
| T | `20261010220311_remediation_outcome_receipt_column.sql` | `2c9203b1ea83bafeac1dc4378cbb24f585a2c3994ed1e28b86c5a7afc265f280` |
| T | `20261010223429_remediation_dispatch_assignment_exceptions.sql` | `be5d10452e8887b599f72706313e2babe72393358fb9a5f1bff272e419283dd8` |
| T | `20261011025105_remediation_dispatch_schedule_actual_loading.sql` | `6fabd6e9de78db19bed6a457c91931165159a42893cf84f613280e57cda1699a` |
| T | `20261011025252_remediation_zero_loading_observation.sql` | `1d4e271cb568b0870d6c558dfed7bf28abcfe869c26a09f751b2672124fec663` |
| T | `20261011025428_remediation_assignment_history_supersession.sql` | `597cf83994cc70bd7974e2ff3fd6a2ffc7e522428b6e2fe66e4692a68076703e` |
| T | `20261011025703_remediation_vehicle_capacity_evidence.sql` | `517cf674a65e78409b0b6208a566afadc1a59b84a16f91b64ca533f2f317ed70` |
| T | `20261011030154_remediation_delivery_line_reader_boundary.sql` | `c986e2f75ae7e7f7ae7e77385e95963f088c3217c534e48f3ee3cbc218f5127b` |
| T | `20261011030440_remediation_single_pickup_delivery_boundary.sql` | `949fa0989853702259d97c2f0992e4345b8e932a86f115ec48773707886ab8bf` |
| T | `20261011030903_remediation_delivery_assignee_eligibility.sql` | `ee62b26154dd7b4da4a11608d3e7d50f2eaf9a57ede39979dacfd7f2b2b1fff0` |
| T | `20261011031114_remediation_existing_capacity_confirmation.sql` | `89c4c713b19e0cc33ce867e46a460bb3275821a076ba8038fdef94ed33e1df03` |
| T | `20261011031732_remediation_advance_allocation_ledger.sql` | `110b28ab60381a9f403268c10550ca903d39c47724b6376599fa6800f003f378` |
| T | `20261011032215_remediation_payment_classification_reader.sql` | `43be29fe74f17e587ce787d195c96b08969697127df92d424940002c5e534a73` |
| T | `20261011032327_remediation_advance_reader_permissions.sql` | `3471ffe49d8ff33636bc621e9a82abcd7d269e8304247360b38914101eef4f39` |
| T | `20261011032420_remediation_payment_party_reader_scope.sql` | `198d2b43e833e4bec4135e1b93e9ea3dbcc8811db72eb28948219557a6a9e9b9` |
| T | `20261011032606_remediation_existing_payment_intent_recovery.sql` | `a612b656e23bb0a467aa5fb0b4606c1a9c8f290287c674b66c25ef9cf1c0e3be` |
| T | `20261011033537_remediation_guarded_payment_balance_reader.sql` | `8af6474c2f331c916e614133dac29f5c61f0855c4be30d21a3518e38af607de3` |
| T | `20261011045335_remediation_vehicle_actual_cargo_guard.sql` | `0fb01b31fe5c8306c230912a81cccb8676fd67ce7781e48878512a5d6c5d4bc5` |
| T | `20261011045547_remediation_direct_loading_remainder_resolution.sql` | `bfda1d0e4228cb844b06463f30bdcb5a04ead1ee26aa9c70d47406af70efc1e6` |
| T | `20261011050252_remediation_dispatch_loaded_cargo_exception.sql` | `e4f1f8de81e7423ee67838cc1159d3d4ede5d05d8993a7e03a587afad1ca6096` |
| T | `20261011050951_remediation_customer_credit_source_ledger.sql` | `4965575918e0fbd8773d050cff8c9f0d564bcfa61fa29db95e7938b7277de0c4` |
| T | `20261011051249_remediation_customer_credit_settlement_commands.sql` | `0234d57a03939a43c73bebb6a7e8a2cf48dc44dd8ff3523ecdf18c2be769b1bb` |
| T | `20261011051635_remediation_credit_offset_reversal_qualification.sql` | `11baa19b4ed1d5c2b4388e9448e6072fe0ac6b2836b01aff648e3c39cb170712` |
| T | `20261011052458_remediation_customer_credit_readers_and_intents.sql` | `3fba954091f18f23e78f0c327f1b45dccfac437eb9b6f03eebb804bd67262a4d` |
| T | `20261011055430_remediation_partial_credit_commission_sources.sql` | `fa79ef046fa45f887ef6db14f188f321236a00c43d0c21d74ecc2a4ee195e55a` |
| T | `20261011055632_remediation_typed_revenue_and_cost_completeness.sql` | `1fa3c17b8e03a1aa9dd25f805c4afc79447a0e06ba5c00b6787eea9e2fbbda99` |
| T | `20261011065009_remediation_remaining_quantity_return_contracts.sql` | `fbad390c27eeae9117789514f6c867be4a6e4fc71a3dfdaf8f1f17da6bddf0bc` |
| T | `20261011065135_remediation_atomic_command_audit_coverage.sql` | `0d78349750d649e3131712804b924a9b4b39772ddd37078e39260497316d5f4b` |
| T | `20261011065209_remediation_command_audit_receipt_columns.sql` | `284e0ae525e8201c1b55fcb9432b433dedff6d9acab095392b41d4779ac252f5` |
| T | `20261011070246_remediation_new_transactions_without_opening.sql` | `a3b55a6cbc70e60a34e56ee11fc170f31f0030adab9120f70ba2e63584a50919` |
| T | `20261011070348_remediation_recording_start_audit_trace.sql` | `e8bab93fd48927a7ce94d4469dea424f9de2a9649473489c54606ea066d68cea` |
| T | `20261011070814_remediation_recorded_scope_knowledge_cutoff.sql` | `9c3ad0aff607e717ea0595c3e4a98bc913837d0cc39643e109630de41b8efefd` |
| T | `20261011071940_remediation_work_assignment_audit_source.sql` | `fba92de2031277567e67b3daca5625fb7b8e9b1867e32b322be046d26c9bde71` |
| T | `20261011074807_remediation_server_price_priority.sql` | `41dd137b634022767025335ebdb352965fd4f6c0c2e55a7d481626d23a874d0f` |
| T | `20261011080455_remediation_purchase_price_priority_and_snapshot_guard.sql` | `48b16dfccdeab2723439ca1aa423d24bf0670c826c43511fc6c9c6d9fb7c190c` |
| T | `20261011081819_remediation_retail_price_intent_recovery.sql` | `eba8f79f9989a2336307aeed91951c3137c89eeb86b235108f698e23a24dfd7c` |
| T | `20261011082134_remediation_retail_global_version_namespace.sql` | `75a0d2ecb962bd872fa6ac53718b92962f768793103db95450ae845dc3251159` |
| T | `20261011082916_remediation_legacy_return_credit_source_reconciliation.sql` | `d9e9dc074018f5a1a54fe4511487862e669526861cf4183bd6037f792efbe86f` |
| T | `20261011083155_remediation_legacy_return_reconciliation_ui_reader.sql` | `c3909e4e8bde1af4a338d336ca0e943f115b8084766c1b176fa65c4e54c993e3` |
| T | `20261011083514_remediation_hour_quantity_before_compensation_money.sql` | `12501c5d822d873988feb66b12bcd7ca02adcb8558b25b3dbe11e937902e419a` |
| T | `20261011083735_remediation_return_case_cumulative_price_cap.sql` | `9eacd68951042525ce9b960d76a1a54ba4749516a06bd978e7f614c70035eb8a` |
| T | `20261011084222_remediation_commission_review_resolution.sql` | `110ce0508cc4b2a1d75ae408459e54f23d5fdb58b85ec2845dba9e69e0978e31` |
| T | `20261011084641_remediation_commission_review_existing_adjustment_class.sql` | `c8d2723b6e212f96df08ee9d4a5337d60d0758fa50f6dc5170155ec907215911` |
| T | `20261011085003_remediation_commission_review_reliable_intents.sql` | `de1d439d5939a104fb1bd23896989a665cadf529df0ec27eb4759c289e5da04e` |
| T | `20261011095111_remediation_delivery_expense_sources.sql` | `d7d6e6ebb80139600209584a6a349db952c080936d5003e3d665712ee3754364` |
| T | `20261011095410_remediation_trip_cost_report_alias.sql` | `7371e5355c6ed5fdf4d46b2a44e57ef42ac1be318d96ebf190f77d535a89990a` |
| T | `20261011095717_remediation_source_warehouse_transfers.sql` | `fa2d494c21db195b9619d68255ef61c4229cfb3abbbfaebff7a72bc6850df6bb` |
| T | `20261011100038_remediation_transfer_explicit_source_parameters.sql` | `0d598485a6642792f6bfbecbdc8a331570256346e686ed15ac933e15e7e7de52` |
| T | `20261011100106_remediation_transfer_reliable_intents.sql` | `394760e1f88e8a6afb0c41ecab699d15dc55f03c6f53a304b95c97e61623b46d` |
| T | `20261011100537_remediation_transfer_quantity_reader_and_loss_report.sql` | `0dfabf7d21459eacb9dfe08829486c09b76453117969f443fe667ca287d4542e` |
| T | `20261011101750_remediation_supplier_return_sources_and_physical_custody.sql` | `268f96abc7b86011f75769aa8e03cc47acef5aa43dcfeb6c662e30822b200371` |
| T | `20261011102116_remediation_supplier_return_original_units_and_sources.sql` | `6f010522e6952fc2e92fb068f1b9964052207d3f6667805a829218364c333f31` |
| T | `20261011102325_remediation_supplier_credit_funding_and_settlement.sql` | `8782b3cd58c41b8344c7a763c5d3dd86ceb71cb611059d53eb50770821b463d5` |
| T | `20261011102746_remediation_supplier_return_reliable_readers_and_payment_guards.sql` | `6cd44e1774d3e12db1053d29e6666d352a980b78aa7f562be0745b4e5fc0f728` |
| T | `20261011103600_remediation_supplier_return_retained_charge_reporting.sql` | `8b7bc60d14b53240cdc86faa9c53dac1474d8d476ca003865e4dcbde310f9042` |
| T | `20261011103941_remediation_supplier_return_reporting_scope_and_recovery_permissions.sql` | `a2d1398b8f2f63427478f5b56827d77f9dc328ba06286525768ae3c4e87f5eec` |
| T | `20261011133125_remediation_direct_return_net_source_capacity.sql` | `8096ae0e1c8fbda2c0c4b178df907d5bff05e48ac11cef363e2c2fbaca940732` |
| T | `20261011133558_remediation_direct_retirement_guard_error_compatibility.sql` | `83ce7c49ed3e558dd8d222e0a1d0cd8ccfc00b69669b49b277ef1a43279e24e8` |
| T | `20261011135309_remediation_supplier_return_actual_inventory_value.sql` | `231b5eae73c0ebdbb6db010d96e975397e156c025fbe3909ee0e920cc6e3add0` |
| T | `20261011135458_remediation_supplier_return_inventory_variance_privacy.sql` | `a31eb0b1bdbe694ccda4be8232ecd6df190fdb092b05e785fe1a722593fbbb2f` |
| T | `20261011135628_remediation_supplier_return_recorded_warehouse_custody.sql` | `fd644ab8bdde96cf95cc3eaf364d56ea3b532028cf15542583577d52b71803f4` |
| T | `20261011140012_remediation_supplier_return_pending_custody_readers.sql` | `a306f40712e146ea45a9afd7b29b02ecbec69878a4a50023232874c511632093` |
| T | `20261011140611_remediation_supplier_document_three_way_matching.sql` | `a3f302eac0e8eb7f17a0e492d9f38f2fed7595974e25b8efd10c455176b4755a` |
| T | `20261011141057_remediation_supplier_document_price_precision.sql` | `c881e8e398470c7b49a7c1d930531abaddb1193c5f7317219be7189669b8dc6e` |
| T | `20261011141501_remediation_document_recovery_and_source_readers.sql` | `2d2612fa0869c4052086691e40c92cbb6e392e03e8b26830683bca4e0ea014f6` |
| T | `20261011142209_remediation_exact_invoice_readers.sql` | `9c3c19c3ccdc254795f432731324a2b36ccae39abaa0857e3678d531c5eab0c4` |
| T | `20261011142818_remediation_invoice_review_exact_trace_readers.sql` | `c12a390367de816a392e7f953cd0229c3b9fa9b3f1d16f63cbfc01a94fb72485` |
| T | `20261011143218_remediation_notice_reconciled_receipt_matching.sql` | `c2e07713d9499bd34962e6dc1d6e4d865c559c3b9aa6adad29567732af7c1305` |
| T | `20261011143447_remediation_notice_match_corrections_and_recovery.sql` | `0537c5ecc7ec590ead5dc6f9523e0db380ca9cfda0a204a964a4c6f378389934` |
| T | `20261011145329_remediation_operational_completion_dimensions.sql` | `80ba7a3bd22c1e6d8031399d7fbeaa2c3fc24435aa028966511a4ac3d48cbac9` |
| T | `20261011151524_remediation_completion_open_work_and_document_exceptions.sql` | `2e686b2555c6280daffeb40bed64db8891c1ca6775bc2202b26ce01e788a42ce` |
| T | `20261011151852_remediation_portal_notice_actor_retry_audit.sql` | `e4356d7ec6b15577be33867de06e8b54797aace6a27673b20c7bbc84af7a90a7` |
| T | `20261011163754_remediation_return_cost_cumulative_source_value.sql` | `fe35235141b4b143bee260d67618f68d4f54df4e1a6929adf94203b09601bc2d` |
| T | `20261011165609_remediation_return_resolution_required_reason.sql` | `e004788429231ae9f8a9a3bde169e725eb4fd8d6db4f93d7a2e478545e471e97` |
| T | `20261011170622_remediation_storage_verified_server_finalization.sql` | `a054e31a2a8828bcd9b67ed69eb71250cf9b9b6a0e51680605f66f7d85b71e53` |
| T | `20261011170932_remediation_verified_evidence_locks_and_audit.sql` | `220ac7a54de55b10b29b9cc4eb83abce50e1e493c1b7f4f41f3494a589bbfa39` |
| T | `20261011173021_remediation_evidence_storage_attestations.sql` | `7dd9d92277fb4a7c5c4e4d717267bab8c53ec3022ed7276c101d223b97ee0270` |
| T | `20261011183132_remediation_evidence_write_once_objects.sql` | `823c103dcb5529cdd24b98428cb004e59ec1f7d4bacf2e88b1971f5afbbedd17` |
| T | `20261011183922_remediation_evidence_download_stored_byte_check.sql` | `f3afce7d8439d3797de32fe5f20313d9ba6ec3c3987de10e531b571ed70e5f2e` |
| T | `20261011191208_remediation_internal_evidence_verification_audit.sql` | `013cba32f80410dbae6679a902916edb3159bef1da5312defdff05ba4cb2268a` |
| T | `20261011191806_remediation_current_employee_identity.sql` | `bb74b8e4c2a210d516551bf03f19115b5eaddc74fa3e5b1b69f5a998006b6734` |
| T | `20261011192422_remediation_retire_unused_identity_probe.sql` | `fe39b4551ca57b8e66541733f7d74a001f15dcd29d0920eb24f10a5271c83486` |
| T | `20261011203524_worker_actual_quantity_contract.sql` | `9bdfcf111713f69495674f155ab54ba1c336cd0346599395c89305cd8e93daca` |
| T | `20261011211355_guarded_return_credit_reader.sql` | `0d82f3c10af5a9eedbdaebd35abfc3e894361c84057bc3008bfe8d82aebf4dfb` |
| T | `20261011211846_exact_portal_money_transport.sql` | `0dc90bb8d30161bf44d3a2dd4aefd12f0fbddb263266f3acc859b98bea48ba31` |
| T | `20261012054843_auth_inactive_actor_boundary.sql` | `0f0447ad7426daa91b423f0bc6b9e00649e88689cd069971d92744af56c4e7c8` |
| T | `20261012062053_workforce_current_assignment_reader.sql` | `9923b7af250b2e30803a7255d3d94b9956f4109c67ff629d8f277b49a57ba640` |
| T | `20261012074034_atomic_operating_command_audit.sql` | `93cbd9e0f00ac631fd3e56b35c97e5da7ba5ba4ce2d66d1b8a5568c2ae0bd8c3` |
| T | `20261012075211_compensation_rate_precision_guard.sql` | `807907b7c1ea37468c085b58eb4f4e7f89a4fb68d9193d3fa28dc6beb5b3e6e3` |
| T | `20261012081213_recoverable_master_commands.sql` | `2178d3b9090d7ad8780e0134ece661600d4dde0b3b9feccc81ba947bb47df065` |
| T | `20261012082356_master_draft_command_constraint.sql` | `4515080fd915173e450adfc2b1fe37f419caaebcd2fe1a0692592468a86a0ae0` |
| T | `20261012085902_exact_dashboard_detail_money.sql` | `1d0801bbb72850ca8f7ea467298297acc1556c405564cf798174eacf2ba3b80b` |
| T | `20261012093644_work_assignment_receipt_audit_source.sql` | `817a692ce22b7539ea1998556478103af0270231a93ffea038f6969b269eb4e1` |


## Bổ sung thực thi độc lập: structural78 đến canonical186

Sau phần đọc ban đầu, nhiệm vụ cho phép diễn tập native cô lập. Đã tạo riêng cụm PostgreSQL17.11 tại thư mục private `target78-rehearsal/cluster-data`, port49761; không dùng browserQA49760, managedQA hoặc Production cho DDL/DML. Các database tạo mới đều có tên `hx_remediation_target78_*`, kiểm chưa tồn tại và guard host/port/data-directory trước DDL. Chỉ dựng schema và permissions canonical; không tạo dữ liệu doanh nghiệp, opening/activation hay gửi email.

Bộ canonical mới nhất có186 migration, head `20261012110100`; đích78 thiếu108=8legacy+100tail. Fingerprint185 và phụ lục107 tệp phía trên là snapshot của phần đọc trước khi forward186 được thêm, không phải manifest phát hành mới nhất.

Kết quả thực trong `TARGET_SCHEMA78_REHEARSAL.json`:

- Dựng đúng tập78 canonical đạt:201 functions.196 definitionMD5 khớp metadataProduction;201ACL khớp. Đã đọc riêng full SQL/attributes của7function public/private qua Supabase transaction READ ONLY, không đọc bảng người dùng. Cả5function lệch hash chỉ khác khoảng trắng ngoài quoted strings/identifiers; attributes/ACL khớp. `public.rls_auto_enable()` là function platform bổ sung. Authshim id-only không chứng minh runtime Auth service; so text không được gọi formal semantic-equivalence.
- Replay raw8legacy **FAIL**, P0001 `Expected custom 40001 in function apply_route_plan`; transaction đã rollback, catalog/data nguyên vẹn. Probe legacyreturncost thực sự bỏ transitguard và đưa PT409 về custom40001. Bằng chứng thất bại giữ nguyên, không sửa canonicalSQL/history để biến rawreplay thành PASS.
- Bridge cơ chế thử nghiệm giữ laterreturncost/conflictforwards, bổ sung các lệnh thiếu vớiPT409. Lần đầu bridge+100tail thiếu2trigger `operational_posting_guard` trên inventory_opening_sources/cash_opening_balances; failure này được giữ trong report. Đây là hệ quả tạo openingfoundation sau gate20261009173806; bản nguồn gate đã yêu cầu cài guard nếu foundation đến muộn.
- Đã xuất và thực thi **đúng byte** `TARGET_SCHEMA78_EXPERIMENTAL_BRIDGE.sql`, có guard chỉ native49761, precondition return-definition/missingmechanisms, CREATE2trigger và validator `private.assert_operational_opening_writers_protected()`. Sau100tail, so với fresh186 khớp toàn8cataloggroups:2171columns,1260constraints,382indexes,52views,302functions/ACL/attributes,199relations,127policies,112triggers. Node syntax và focusedeslint đạt.
- G11 preserved theo full definition khớp fresh186: require_active_operations ghi FIRST_RECORDED_TRANSACTION, không đưa lại gate activation cho newtransactions; enforce_operational_write và public operational-state/activation definition không bị bridge đổi. Không gọi các lệnh đó trên dữ liệu doanh nghiệp. `assert_branch_operational` không phải function canonical hiện tại.
- Ledger của database thử có178=78+100;8legacy không bị tự ghi applied. Bridge là prototype native cần rootreview; không phải migrationProduction hay đồng ý sửa history. Không có backup/restore đích thật từ kết quả này.

Đường native chuẩn136→164→174→186 đã có openingfoundation theo thứ tự; bằng chứng NATIVE_SCHEMA_PARITY186 đạt302function/ACL cùng view/policy parity. Đường chuẩn ấy và reconstructed78 có baseline/thứ tự khác nhau; không lấy PASS đường chuẩn để che thiếu2trigger ở đường78. Các giới hạn Production/Auth/Storage/PITR và credential của kế hoạch trên vẫn còn nguyên.
