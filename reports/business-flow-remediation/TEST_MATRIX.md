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

## G08/G09/G16 — gói tài chính113–118 đang kiểm chứng

G08 native core: paid3.22m/return1/credit230k, giữ AR0 và khoản có230k bằng negative release của phân bổ gốc; original payment available0, không dùng lại nguồn hoặc đảo toàn receipt. Refund230k/exactretry một phiếu chi, cashnet2.99m; reverse riêng refund khôi phục khoản có; offset vào nghĩa vụ cùng khách không tạo tiền, reverse offset khôi phục debt/credit. Fault sau funding/settlement insert rollback mọi business/receipt/audit; newnonce cùng case từ chối. Native boundary3: unpaid chỉ giảm debt/credit0/no money; gift billable0 quyết định0/no fakeAR/cash; nhiều case cùng original positive allocation và partial refunds có caps/party/permission. Deferred funding constraint chạy bằng SET CONSTRAINTS IMMEDIATE, không chỉ rollback trước khi constraint chạy.

ActualQA JWT Finance HTTP2: approve/refund và approve/offset, persisted source+separate writer/readerPID; exactretry mộteffect, excess/newnonce từ chối, Sales403/Worker0, original payment source available0. Browser Finance2 scenarios/5desktop390images: actual approval, refund230k; response bị abort chỉ sau independentDB thấy commit, UNKNOWN/reload lookup SUCCESS khi form mất;1refund/cashnet2.99m. Offset valid samecustomer debt230k→0, originalonepayment3.22m;0unexpectedconsoleerrors, chỉERR_FAILED sau intentionalabort. Ảnh desktop/mobile đã xem.

ActualQA JWT race RefundFinance/OffsetOwner cùng credit230k, PID/actor khác, pg_blocking_pids observed; test latch AFTER settlement insert rồi tháo; refund200/offset400,1settlement/2payments, nextDebt230k, no receipt/audit của request bị từ chối. G07 races cũ không chạy lại; G07 core chạy lại tại115 vì balance/reverse functions mới đổi, vẫn PASS.

G09 BEFORE committed negativeAR−230k/P&L3.22m/1.95m/gross1.27m reproduced. Typed signed revenue links AR adjustment RETURN/PRICE; old returnFK source read-through khi chưa có typed record, không rewrite/no double. ActualQA Finance/Warehouse HTTP mới: original3.22m/cost2.1m/gross1.12m; physicalreturn rồi credit230k→net2.99m/cost1.95m/gross1.04m. Exactretry1revenue adjustment. Knowledgecutoff trước return giữ3.22m/2.1m; earlierperiod3.22m/1.12m; laterperiod−230k/−150k/gross−80k. PRICE−100k thay revenue; WRITE_OFF/OTHER−50k mỗi loại không thay revenue, debt3.02m/revenue3.12m. Money snapshot trả text để giữ bigint, margin multiplication dùngnumeric. UI ARdetail chọn/hiện bản chất điều chỉnh. G09 paidPRICE generic vẫn theo outstanding guard cũ; không claim refund-price workflow mới.

G16 native committed before/after: mộtSO cóWarehouse5 vàDirect5 trên hai delivery riêng (mixedmode cùngdelivery bị canonical guard từ chối, không sửa guard cho test). CóWarehouseCOGS750k nhưngDirect thiếu supplier cost: baseline109 READY/gross1.55m sai;118 INCOMPLETE/cost&profitNULL. Ghi matchingNCC5cost750k sau đó tổng1.5m/gross800k READY; knowledgecutoff trước NCC vẫnINCOMPLETE. Coverage theo verifiedline/purchase-line/SOline và requiredquantity, không anyCOGS ở SO. UI chất lượng giải thích thiếu/khớp theo dòng và nguồn.

Automaticcommission configuredQA reproduction: partialallocationrelease230k chặn bởi old full-reversal guard. Forward117 adds provenance tags and bounded cumulative reversal of original snapshots; unpaid5% original161k→149.5k, giảm11.5k mộtlần. Already-paid commission giữoriginal161k/cash facts, customercredit230k vẫn tạo và1readonly reconciliationcase11.5k; không rewrite approved earnings hoặc tự thu tiền nhân viên. Native commission fixture uses syntheticLOCAL Auth stub+Sales employee only, managedAuthfalse/cloudaccounts0, rollback. Deferred cases hiện trên compensation; resolution/settlement của paid review vẫn chưa triển khai/kiểm chứng. Manual profitcommission calculation đổi net-revenue và costsource guard; fresh runtime test phần này còn chờ.

Fresh118 from0/publicRLSmissing0 PASS. Upgrade113–118 giữ toàn bộ cột/dòng đã có. Typecheck(sauUI)/targetlint/7files63affectedtests PASS. Fullbuild/CI/finalall42 vẫn NOT_RUN; mới thêm readonly compensation UI sau unit run nên typecheck final PASS, UI reviewcase flow còn chờ. Failure artifacts: offset reversal ambiguous aliases fixed by forward115;116reader first guessed columns sales_order_number/material_name_snapshot, entireDDL rollback, source corrected only while unapplied after inspecting schema; syntheticcommission fixture requiredlocalauthstub, actualorders.create role and canonicalcreateSO under syntheticSales UID (SO owner is creator, not customerowner). No fake testPASS from failed harness.


## Gói5 — fresh scoped121

T16/T18/T20/T25/T40: PACKAGE5_SEAMS121 DB26checks, PACKAGE5_QUANTITY_RETURN_AUDIT121 fractional three deliveries + split cumulative returns and extra source rejection. T15: null/stale and valid old-version retry for draft updates/service dualversions/work boundaries; remaining commands continue with corresponding Gs. T10:3actualJWT savedintent races (sameactor/twoPIDs, nottwoemployees) observedblocking, both200 sameID oneeffect; actualBrowser3aftercommit response loss/reload, no unexpected console/page errors, desktop390 screenshots. T26: native refund100k+offset130k consumes230k onecredit; oldgoods receipt2990000 remains. T29/T30/T31: actualAuth net1040000 periods/cutoff/kinds after119; native manual commission52000; actualBrowser G16 source incomplete→complete and Sales costdenial; AR CSV2300000 source scoped, no P&L CSV claim. Fresh1210missingRLS; lint0;5unitfiles19tests0. Source/money remain synthetic localQA; noProduction. G07race artifacts excluded from this execution; kept earlierPASS.

Harness failures retained: invalid_quote_expiration fixed input fixture; G15 initialHTTP wrongparameter names failed before insert and corrected; G16 URL-notice wait obsolete (reliableaction staysonpage), sourcecommit preserved, newfixture + correct renderedstate assertion passed. No repeated oldG07races. DB forward120 wrongreceiptcolumn triggeredrollback,121corrects; failedmigrationversion not edited.

## Gói6 — scopedG11

T01–T04/T07–T09/T11/T17/T19/T20/T25/T40: G11freshPENDINGbranch Native6 and actualAuth2/browser4, immutable oneStart, zeroopeningimports/unchangedactivation. Sourceflow scope only, notallTxxcases. NewG07regression100k/75k25k avoidsbothExcludedRaces. T19closeonlyleftover1 releases230k/consumed3220k, oneaudit. T29/T30/T31: source-only/scopeKnownCutoff andCSVhistoryunreconciled; no verifiedenterprisebalances. T40 rollbackstartup/source/audit thenretryone; newtwoActorJWTstartup observedblocking2PIDs/start1 bothsourcescommit. T14/T15/T20/T23/T28/T42 affected package1Native5/package3Native6/package5seams26 passed125. T15/T40 claim andassign onlyAVAILABLEwork cases NULL/0/999 reject/retryoneaudit/sourcebranch fromassignment125. Native124throughG11source metadata differentfromactualHTTPasserts.

Provider/ManagedAuth/Storage/deploynotrun. Fresh125/isolatedarchive124109tables/typecheck/lint/7files96testsPASS. End-to-endfull42/finalbuild/CIvẫn NOT_RUN. Older matrix rows are perfullteststatus; scopedPASS inthese sections isnotfullPASS.

## Gói7 — T17/G04 và price-version G12

NativeT17 Default230.000/CustomerMaterial460.000 chứng minh lower rule bị chặn và hierarchy+version đúng; giá thấp hơn default hợp lệ khi rule ưu tiên hoặc manual có quyền/reason. RuntimeNULL/0/999 ở replace/deactivate, retry sameintent sau state/version đổi và source snapshots giữ nguyên. Nativequote/SO/PO giữ giá đã lưu khi sửa lượng. ActualSalesAuth thấp ưu tiên400/manual403/preferred260k200; stored230k qty2→460k/retry/audit1. BrowserSales qty3→690k theo230k dùrule260k; reload/independent read/desktop390/0console/pageerrors. G02/G12affected26seams; fresh129/RLS0/typecheck/lint/7unitfiles78tests PASS. Receipt recovery của price mới bổ sung128, namespace129 native đã kiểm; không claim đã chạy lại toàn bộ G07 hay mọi versioncommand khác.

## Gói8 — nguồn trả cũ, giờ công và quyết định hoa hồng

T25/T26/T40: legacy source native fault/caps/role + FinanceBrowser aftercommitabort/reloadoneCC, oldRAhash/singlecash/retained2990k; net1040k source preserved. T16: controlled12m30s source normalized0.208333 trước rate2m, money416666 matches storedquantity, policytag; inputprecision contracts retained. T18: caseSourceMax không dùng phần chưa duyệt đợt trước, stillfractionaltriple/splitprice PASS133. T30/T31: gross1040k authread; manualcommission passedpkg5; paidreviewOwnerWAIVE/RECOVER explicit source nooldpaidrewrite/no newcash, future20k−11500=8500. T10/T40: newOwnerBrowser commissionIntent saved/commitlostresponse/reloadoneeffect; actualJWT recovervspayout sameAP2actors/PIDs/block observed, onlyrecovery commits, loser0effects. Nativeboundaries3/fresh136/RLS0/typecheck/lint/5unitfiles30tests PASS. No2excludedG07races rerun, noProduction/realroles/config/money/invoices. Fullmatrix/finalbuild/CI NOT_RUN.

## Gói9–10 / schema142 — kết quả bổ sung theo phạm vi

T34: direct100k/overhead30k (native), failed40k+redelivery60k (actualJWT), internal vehicle/captured assignment/sourceprehand-off denied; AP once/pay cash once/noemployeeearning. T33: new directfee20k preserves missing direct source INCOMPLETE, actual supplier5 makes allsourcesREADY; old1040k read-only retained. T27 literal15→14/1transit/value conserved, partial/fractional receipt/shortage/approvedloss/close remainder PASS. T28: transfer changes stock-count basis, approval rejected without effects. T10/T15/T40 newexpense andtransferfault/cache/version/audit/browsercommit-response-loss/reload PASS. Two advance races explicitly excluded, never rerun. First G18 different-intent race persisted source but PID metadata not retained before unrelated late harness assertion; resumed read-only. New SAME-intent cross-actor race captures2UID/PIDs/observedblocking and one effect. T26/T35/T38 and G23 integration still unimplemented; these scoped results do not certify all42tests.

## Gói11 / T26, T33, T10/T15/T40 — scope154

T26 sourceWarehouse/direct, partial/multiple/caps, physical/acceptance noAPcash, paidSourcecredit/refund/offset/fault/UUIDretry ActualJWTandBrowser passed. SourceDoccredit registration/no-doubleAP remainsG20dependency. T33 actualDirect5→accepted4/retired1 netcost600/gross320READY; tripfee cannotstandforcost earlier142; old1040 read-only preserved. T10 lostaftercommit credit/refund/reload oneeffect; screenshotharnesslatecaretwarning fixedread-only withoutbusinessreplay. T15null/staleCaseversions/source/permissions/cacheafterversion PASS. T40source/audit/rollback/newrace no successfake. Sourceexpense50 onWHWAC200 vsoriginalcredit150 correctandmasked. Twooldadvance races excluded; newG19 refundvsOffset150 twoactors/PIDs/observedblocking recorded. Full all42tests/latestCI notcertifiedbythese scopedcases.
