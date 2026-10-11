# T01–T42 — kết quả bản sửa

Expected/source ở audit07; không PASS từ evidence cũ.

| Test | DB | Auth HTTP | Browser | Concurrent/fault | Commit/evidence | Kết quả/giới hạn |
|---|---|---|---|---|---|---|
| T01 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T02 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T03 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T04 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T05 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T06 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T07 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T08 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T09 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T10 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T11 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T12 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T13 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T14 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T15 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T16 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T17 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T18 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T19 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T20 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T21 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T22 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T23 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T24 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T25 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T26 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T27 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T28 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T29 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T30 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T31 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T32 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T33 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T34 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T35 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T36 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T37 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T38 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T39 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T40 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T41 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T42 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |

## Package1 — fresh scope

T28: stale/current/reservation, real two-approver and count/handoff lock races PASS; T40: count open/record/approve audit and fault-after-ledger rollback PASS; T05: real QA Auth/Sales/Finance/Worker cost boundaries and raw filter/order endpoints PASS. These are scoped, not full T05/T06/T07/T08/T13/T40 for all modules. Native5checks, AuthHTTP12checks, Browser4checks/5images1280+390/0consoleerrors, native2races with distinct actors/PIDs and observed blockers. Typecheck PASS;6files34affected tests PASS; targeted lint0issues. Build/full tests/CI final NOT_RUN.

Evidence outside repo: /Users/nox/Downloads/HienXaERP/outputs/business-flow-remediation. No token/password recorded. Browser plugin absent, installed Playwright used; real UI forms/login/actions/reload and independent DB readback.

## Package3 — phạm vi mới được kiểm chứng

T14/T15/T42: native pre-start reassignment, immutable assignment facts, old assignee denial/new eligible assignee, GPS old revoke/new session, after-start deny. Auth HTTP thật: old Worker403; new assigned Owner (có work.claim thực, không bypass is-current-assignee) start/report/retry một result. Warehouse là người điều phối/bàn giao thực; không cấp role/cloud quyền để test đạt.

T13: hai actor/PID thật cạnh tranh employee/vehicle lock, observed pg_blocking_pids, chỉ một assignment. Trùng lịch bị chặn trước publish; negative max/missing conversion/window, khai căn cứ tải và xác minh lại cap không đổi trên phiếu đang mở.

T20/T23/T40: native6 scenarios, actual14/plan15, release residual, zero unloaded line without movements or false cost, FULL15/accepted14 board until return resolved, fault after custody insert rolls all effects back and permits retry. AuthHTTP precision/missing/permission/nullversion/positive/retry/source read. Browser warehouse4 checks/6desktop+390 images/0consoleerrors final; reload/independent SQL readback.

Package3 schema103 từ0 native/Auth shim PASS; upgrade95–103 giữ nguyên cột/dòng nghiệp vụ cũ. 7 files/67 affected unit tests, typecheck, targeted lint PASS. Package1 native5 và Package2 native3 regression PASS tại101; new102/103 eligibility/capacity không tác động các external-only cases đó. Full42 matrix, seven business scenarios, build/CI final vẫn NOT_RUN.

Failure evidence được giữ: reader invoker mất dòng Warehouse đã sửa bằng forward100; screenshot caret style injection và lịch fixture trùng được phân loại harness, chạy fresh unique schedules + caret initial đạt. Không bỏ qua console errors.

## G07 — tiếp tục phần chưa hoàn tất ngày 2026-10-11

Khi tiếp tục: head3f787b9, G07 uncommitted; Git và process đã đọc trước khi chạy. Không còn process test G07/Vitest/Playwright/typecheck đang chạy; PG/gateway/PostgREST/Next QA vẫn hoạt động. Dirty checkout gốc được giữ nguyên. Hai race đã exit0 trước ngắt, không chạy lại; kết nối observer mới đọc lại dữ liệu khớp cả hai evidence, mỗi nguồn chỉ một allocation, một consumption, một command receipt và một audit. Hai actor Finance/Owner có PID khác, pg_blocking_pids chứng minh chờ khóa; same-intent là cùng Finance UID hai phiên, không phải hai người. Race dùng native authenticated UID, actual JWT đã kiểm riêng qua HTTP/Browser.

Đã chạy phần còn thiếu: fault AFTER INSERT advance_allocations rollback cả allocation/consumption/receipt/audit, giữ nguồn tiền1m và nợ1m; thử lại cùng intent600k đạt, còn nợ/ứng400k. Khác khách, duplicate obligation, cùng intent khác payload bị từ chối. Supplier advance150k phân bổ50k+100k vào một AP bằng hai intent, một cash event, AR-only Sales không thấy nguồn supplier/balance. Fixtures bổ sung rollback, hai persisted race không bị sửa. Harness lần đầu thiếu quote alias cashEvents, toàn TX rollback; sửa alias test, không sửa business SQL.

G07 native core, real Finance Auth HTTP, actual Finance UI lost response/reload,4 screenshots1280/390 đã hoàn tất trước ngắt và không chạy lại. Đã xem ảnh committed recovery ở desktop/mobile. Strict classifier: chỉ ERR_FAILED sau intentional abort, unexpected0. Affected unit mới7files68tests exit0; lint script mới exit0. Typecheck/target lint frontend đã exit0 trước migration109, không có đổi TS sau đó nên không chạy lại. Fresh109 từ0 exit0, public tables thiếu RLS0; Auth shim, không Managed Auth/Storage restore.

Evidence: PACKAGE4_G07_RESUME_VERIFICATION.json, PACKAGE4_G07_FRESH_SCHEMA109.json, PACKAGE4_G07_AFFECTED_UNIT.log; sử dụng giữ nguyên CONCURRENCY/SAME_INTENT_CONCURRENCY/AUTH_HTTP_FINAL/BROWSER. Full matrix/build/CI cuối và G08 integration chưa đạt, không suy rộng PASS.

## G13/G10 bổ sung — tổng hàng còn trên xe

Forward110–112. Tái hiện native warehouse và direct: hai phiếu lịch không chồng nhau, thực lấy14+14 trên xe giới hạn20 vẫn thành công trước110. Sau sửa, cả actual và legacy handoff từ chối vượt tổng cargo, giữ ASSIGNED/version2/no handoff. Hàng còn trên phiếu VERIFIED vẫn tính tải; terminal return/loss theo nguồn thực giải phóng đúng. Hàng14, khách nhận13 còn1; cộng phiếu14 và5 được20, lấy thêm1 bị chặn; xử lý1 về kho rồi lấy1 được20. Xe còn cargo không đổi cap/UOM/deactivate ngay cả mọi phiếu VERIFIED; xử lý hết mới cho đổi. Mixed units dùng phép đo riêng2:1,14A+3B=20A;14A+4B bị chặn; thiếu conversion của cargo cũ thì không tuyên bố đạt tải.

Direct remainder nhận về kho có actual warehouse movement và source supplier cost correction một lần, không sinh IN_TRANSIT giả; direct loss không tạo lại cost đã nằm ở nguồn NCC. Fault sau warehouse return insert rollback movement/receipt/audit/case state; retry cùng intent một hiệu lực. Open/resolve có audit cùngTX. G10 mới: direct lấy14/báo13/accepted13 trước112 không có exception, sau112 hiện tới khi1 về kho, không cần transit ledger giả. Native fixtures rollback, không sửa nguồn cũ.

Real QA JWT HTTP race mới: Owner và Warehouse, hai employee, hai allocation/SO và direct-vs-warehouse nên chỉ xe là tài nguyên chung. AFTER handoff insert test latch giữ request1, quan sát pg_blocking_pids của request2; pid/actors khác, sau commit chỉ1handoff15, request2 HTTP400 capacity error, không receipt/audit của request2. Trigger latch đã tháo. Race G07 cũ không chạy lại.

Browser mới Warehouse: lấy15 khi đã có15 bị chặn bằng tiếng Việt, reload vẫn ASSIGNED/no effect; đổi lấy5 lưu được20, reload một handoff5; desktop1280/mobile390,4images,consoleerrors0. Đã xem ảnh. Native package3 affected6 scenarios rerun tại111 vì handoff/resolve đổi;29affected unit tests/6files, typecheck, targeted lint PASS. Fresh112 từ0 PASS/publicRLSmissing0. Native archive109 restore104tables/hash+history khớp; không Managed Auth/Storage/PITR.

Evidence: PACKAGE3_CARGO_BEFORE/AFTER/UNITS/AUTH_RACE/BROWSER, DIRECT_CARGO_BOARD_BEFORE/AFTER, CARGO_AND_DIRECT_AFFECTED_REGRESSION, CARGO_FRESH_SCHEMA112, CARGO_TYPECHECK/LINT/UNIT, PACKAGE4_G07_ARCHIVE_RECOVERY109. Harness failures giữ riêng: result FULL14/plan15 không hợp lệ đã sửa thànhPARTIAL; direct remainder trước111 bị guard thiếu nguồn, xử lý bằngforward111; conversion test gửi effective_from không editable đã bỏ field, chỉ chạy tiếp mixed case chưa đạt.

DB advisors111 exit1:11security_definer_view errors và5multiple_permissive_policies warnings. Chạy read-only trên restored109 cho cùng cacheKey tập kết quả;110/111 không thêm finding. Không gọi advisor clean. Reader views có explicit predicates/masking/security barrier được kiểm phạm vi G05/G07; broad reader/cross-branch audit cuối vẫn cần. Existing synthetic QA cargo impact scan chỉ đọc:3xe20 cócargo42/28/28 từ fixtures cũ; không sửa facts để làm đẹp báo cáo, loading mới chặn cho tới khi xử lý nguồn thực. Evidence CARGO_ADVISORS/BASELINE109/ADVISOR_COMPARISON/EXISTING_DATA_IMPACT.
