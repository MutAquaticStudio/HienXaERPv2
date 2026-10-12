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

# Danh mục nghiệm thu hệ thống

CHƯA HOÀN TẤT. Ánh xạ nguồn hiện hành:87 trang/24API. Mỗi dòng bên dưới chỉ là ánh xạ; kết quả đọc trang hoặc CI không thay bằng chứng thao tác.

## Ca nghiệp vụ cụ thể

| Mã | Vai trò/thao tác | Tác động dữ liệu | Kỳ vọng | Bằng chứng đã có/phần còn thiếu |
|---|---|---|---|---|
| AUTH | Quản lý; nhân viên/thợ/khách đúng tài khoản. Đăng nhập/chọn chi nhánh; cấp/thu hồi/cấp lại quyền; JWT cũ khi ban; khôi phục có token hợp lệ và sai token | employee_branch_access, explicit_permissions, memberships, Auth; không thay kho/tiền | Quyền hiện hành ở RPC/RLS; người cũ và sai phạm vi bị chặn; quyền được cấp lại đọc đúng; không gửi email cho người thật khi thử | ROLE_LIFECYCLE177; AUTH_DISABLED_FINAL178. **Còn thiếu:** T05/T06: quyền explicit/invite và token recovery hợp lệ chưa có proof riêng |
| PAYROLL | Quản lý compensation.manage/approve; kế toán payment.post; thợ chỉ xem của mình. Tạo quy tắc; căn cứ thủ công; tính/duyệt/chi; tự động theo service/work/SO; đối chiếu hoa hồng đã trả | rules/bases/earning_events -> AP -> payments/allocations; source snapshots/audit | Lượng và tiền theo căn cứ nguồn; duyệt mới tạo AP; chi không đổi nguồn; retry một effect; trả hàng không sửa khoản đã trả | BROWSER_SERVICE177; PACKAGE8 commission proofs. **Còn thiếu:** T37: FIXED_MONTHLY/PER_SHIFT/PER_DAY/BONUS/ADJUSTMENT và rule hiện có cần native+browser |
| QUOTE | Bán hàng; khách OWNER/FINANCE_CONTACT; RECEIVER bị cấm chấp nhận. Tạo/sửa/gửi/chấp nhận/revision/chuyển SO; thiếu trường; hai trang cùng sửa | quotation/revision/lines -> SO/lines; không AR/AP/stock khi báo giá | Version cũ bị chặn; snapshot giữ; sai khách/quyền không chấp nhận; revision gửi giữ nguyên; chuyển SO không tự xác nhận | PACKAGE7 pricing; static reads. **Còn thiếu:** T04/T21: browser amendment và portal quote action chưa có đủ proof |
| SALES | Bán hàng orders.create/confirm/cancel; quản lý override quyền riêng. Tạo/sửa nháp; xác nhận; override tín dụng; hủy; đóng phần còn; quantities 6digits, missing/null/version/source | SO/lines/credit reservations -> allocations/delivery -> AR; source giữ theo từng dòng | Draft edit giữ giá/quy đổi cũ; confirmed không sửa nháp; close không che cargo/credit; dư precision không lưu | BROWSER_SOURCE_FLOW176; BROWSER_MULTI_DELIVERY_RESUME177; QUANTITY_VERSION_AUDIT_SEAMS178. **Còn thiếu:** T04/T21 browser sửa nháp/stale/từ chối và override cần ca riêng |
| PURCHASE | Mua hàng; kho nhận; quyền duyệt mua; thợ không sửa giá. Tạo/sửa/xác nhận/hủy PO; đổi đích; PO kho và giao thẳng; nhận từng phần/NCC verify; quick supplier | PO/lines -> receipts/inventory hoặc direct_fulfillments/AP -> SO supply | Mua/bán giá lượng độc lập; nhận mới tạo stock/AP; direct không kho giả; source/version/quantity/cost guards | BROWSER_SOURCE_FLOW176; BROWSER_MULTI_UOM177; LOCAL_DELTA_SEAMS177; PACKAGE11 direct. **Còn thiếu:** T04/T21 browser PO edit/cancel/quick supplier và retry source cần chứng minh |
| INVENTORY | Kho inventory.receive; mua hàng không mặc nhiên kiểm kê. Nhận từng phần; threshold; giữ chỗ và thực lấy | receipts -> inventory_movements/reservations/AP; threshold config/audit | Chỉ stock có nguồn được giữ/lấy; NULL/scale bị chặn; retry không ledger thứ hai | MULTI_RECEIPT_RECOVERY177; INVENTORY_RACE177. **Còn thiếu:** Threshold create/edit và scope action riêng |
| DELIVERY | Điều phối/Kho; thợ hiện hành; quản lý delivery.verify. Allocate/create/assign/publish/handoff/arrived/report/verify; cập nhật receiver; failed/refused/return/loss/redelivery | delivery/assignment/work/cargo -> verification/inventory/AR/revenue/cost -> return/credit | Plan15/loaded14/accepted13 còn1; người cũ bị chặn; FULL khác accepted giữ hai sự kiện; cost riêng; source/cap/version/retry | BROWSER_SOURCE_FLOW176; BOUNDARIES177; G10/G13/G14 old scoped evidence. **Còn thiếu:** T21: các amendment thực sự hiện hữu; receiver update/cancel và return browser đúng source |
| WORK_PORTAL | Quản lý tạo/phát; thợ claim/start/report; khách đọc riêng. Service create/cancel/publish/assign/claim/start/heartbeat/report/verify; job/pool/earnings/profile | service/work/assignment/results -> verification/AR/earning; portal projections | Thợ chỉ current assignee; kết quả không tự ghi khách nhận hoặc cash; lượng exact; trạng thái cũ không cho ghi sai | BROWSER_SERVICE177; ROLE_LIFECYCLE177; WORKFORCE_READER179. **Còn thiếu:** Poolclaim/heartbeat/cancel và snapshot quyền có ca cụ thể |
| FINANCE | Kế toán AR/AP/payment; sales bị cấm finance/cost. Account/category/expense approve; thu/chi/phân bổ/đảo/đối chiếu; điều chỉnh/return credit/refund/offset | payments/allocations/advance/credit/AP/AR/revenue/audit | Không cash hai lần; giới hạn nguồn/cùng khách/branch; refund+offset cap; WRITE_OFF không return revenue; rollback/retry | PAYMENT_LITERAL177; PACKAGE4/5 credit; G09/G16; PACKAGE9 expenses. **Còn thiếu:** Account/category và reverse/reconcile browser; filters AP; hai advance races tuyệt đối loại |
| TRANSFER | Kho có quyền chuyển/thực xuất/thực nhận/duyệt hao hụt. Lập/shipped/received partial/missing/damaged/loss; lỗi/retry/receive concurrency | transfer source -> warehouse/transit/value -> warehouse destination/loss | Bảo toàn lượng/giá trị; thiếu vẫn open; mộtSKU/samebranch theo mô hình hiện có | PACKAGE10_TRANSFER_SEAMS142/AUTH/BROWSER142. **Còn thiếu:** Đối chiếu định nghĩa179 để dùng lại evidence; trang chi tiết đọc trạng thái đúng |
| STOCK_COUNT | Kho kiểm đếm; người có inventory.adjust.approve duyệt. Open/record/approve; stock đổi sau basis; count zero hữu hạn; version NULL | count/basis -> adjustment movement/audit | Stale stock/reservation/transit bị chặn trước ledger; không ghi đè tồn | PACKAGE1; PACKAGE6 G01; LOCAL_DELTA_SEAMS177. **Còn thiếu:** Đối chiếu source/ACL hiện hành và browser count detail |
| SUPPLIER_RETURN | Mua hàng/kho/Finance theo từng quyền. Lập từ receipt/direct; thực trả; NCC accept; approve credit; refund/offset sau paid | source actual -> return event -> approved credit/AP -> settlement | Cap nhiều lần; không giảm AP lần2 khi note; direct không kho giả; paid settlement có nguồn | PACKAGE11_PHYSICAL/CREDIT/AUTH/BROWSER148/DIRECT150. **Còn thiếu:** Đối chiếu source mới và toàn trang/role hiện hành |
| INTERNAL_DOCUMENT | Kế toán/mua hàng theo quyền; legal issue hoãn. Register/match/review/export supplier; create/approve/cancel/adjust internal invoice | PO/receipt/direct/supplier document -> matching; invoice metadata/source AR/AP | Lượng/giá/value/source coverage; không tạo AR/AP lần2; internal không issued; legal disabled | PACKAGE12_DOCUMENT_AUTH/BROWSER158/INVOICE159. **Còn thiếu:** API PDF/CSV đọc đúng quyền/khách/branch và version hiện hành |
| NOTICE | Khách đúng membership báo; kế toán review/reconcile. Tạo notice real evidence; accept/reject/link/unlink thực receipt | notice/evidence -> reconciliation/payment coverage; allocations riêng | Ảnh/accept không giảm nợ; đúng BANKreceipt/customer/branch/cap; concurrent link không tiền2 | PACKAGE13_NOTICE_AUTH/RACE/BROWSER162; STORAGE174. **Còn thiếu:** Đối chiếu179 và account ban không bypass |
| EVIDENCE | Người có quyền nguồn; sai người/khách/branch bị cấm. Create/upload/verify/finalize/link/download; partial/error/lost-response/retry/replace; reverify legacy | metadata + actual Storage bytes -> immutable verification -> source link | Không tin clientmetadata; tồn tại/path/size/hash đúng; chưa complete không proof; không đổi bytes giữ verified cũ | Storage real174; STORAGE_READ179; legacy/reverify proofs. **Còn thiếu:** Backup byte môi trường đích và owned QA restore; source-specific reads |
| REPORT_AUDIT | Finance theo AR/AP/profit; audit quyền; sales masked. Filters/date/knowledge-cutoff; PDF/CSV; >1000 restart samejob; audit per command rollback/retry | source ledgers -> views/report/export job/audit allowlist | Tổng tiền/ID đối chiếu nguồn; không lộ cost; historyunknown khác0; CSV an toàn; audit success cùngTX | G09/G16; LARGE_EXPORT177; QUANTITY_VERSION_AUDIT_SEAMS178. **Còn thiếu:** T40 allowlist tất cả command; T41 AP/filter/cutoff và PDF thật |
| MASTER | Quản lý/master quyền riêng; bán hàng quick customer/site; mua quick supplier. Create/edit active/master/branch/material/uom/conversion/customer/site/supplier/vehicle/machine | master config/audit -> lookup/snapshots/source eligibility | Expected JSON stale bị chặn; không đổi snapshot cũ; crossbranch customer/site cấm; capacity locked khi cargo | G13 vehicle proofs; static reads. **Còn thiếu:** Mỗi kind hiện hữu cần native permission/state+browser representative, không tạo opening |
| PRICE | pricing.manage/purchase pricing; Sales chỉ dùng quy tắc. Create/version/effective rule; customer/group/tier/default/override | pricing rules -> immutable SO/PO/quotation snapshots | Serverpriority; override có reason/right/audit; đổi bảng giá không đổi chứng từ cũ | PACKAGE7_HIERARCHY/PRICING_BROWSER127; PURCHASE129. **Còn thiếu:** Đối chiếu action edit/version và precision trên179 |
| MESSAGE | Người tham gia cuộc hội thoại; người ngoài cấm. Create/send/read; WS subscribe/update/disconnect/recover query | conversation/participants/messages/read receipts; no finance | RLS đúng participant/currentrights; retry/query khôi phục; không lộ nội bộ khách khác | REALTIME_REGRESSION178; messaging browser174. **Còn thiếu:** Browser create/send/read ở ba surface và revoked participant nếu có đường hiện hữu |
| ROUTE | Điều phối có quyền schedule/resource. Lập/xem/áp dụng route, không nhân bản chi phí/group unsupported | route plan/steps -> delivery assignment/schedule; per delivery nguồn | Đúng branch/vehicle/time/cargo, apply atomic/version/retry; cost không nhân bản | G13 schedule source evidence. **Còn thiếu:** Browser create/apply route + quyền và stale nguồn |
| NO_OPENING_COMPLETION | Quản lý/role nghiệp vụ. Nguồn mới tại PENDING/noactivation; completion/cancel residual/returns/money | operational state history và actual sources -> completion projection | Không opening gate/zero fake; còn cargo/return/credit không complete; activation legacy tùy chọn không được bắt buộc | NO_OPENING178; SOURCE_FLOW176; PACKAGE14_OPERATIONS164. **Còn thiếu:** UI toàn entry vận hành không pendingopening blocking; olddoc continuation trên bản sao đích |
| GPS_DEFERRED | Thợ hiện hành. Đọc trạng thái unavailable; start/ping501; old session stop và reassignee denial | Không vị trí giả; session quyền hiện hành | Không báo device thành công; đổi người thu hồi quyền vẫn đúng | G06 GPS backend; candidate device gate. **Còn thiếu:** Thiết bị hoãn theo user, không chặn phát hành; HTTP guard hiện hành cần mapping |
| READ_SHARED | Tài khoản đúng quyền surface. List/detail/search/reload; missing ID, wrong branch/customer, logged-out | Shared scoped query -> displayed exact fields | Không runtimeoverlay; không leak; dữ liệu cũ không bypass write guard | STATIC_READ177; ROLE_LIFECYCLE177. **Còn thiếu:** Mọi dynamic detail phải bind nguồn hiện hữu và kiểm scope |

## Ánh xạ87 trang và24API

| Tệp thực tế | Ca | Thao tác server có thể đi tới | Trạng thái |
|---|---|---|---|
| `src/app/admin/access/page.tsx` | AUTH | loginAction, recoveryAction, selectBranchAction, assignRoleAction, inviteEmployeeAction, revokeAccessAction, reactivateAccessAction, setExplicitPermissionsAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/audit/page.tsx` | REPORT_AUDIT | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/cashbook/page.tsx` | FINANCE | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, createFinanceAccountAction, submitPaymentWithOutcomeAction, postPaymentAction, reversePaymentAction, reconcilePaymentAction, createExpenseCategoryAction, createExpenseAction, approveExpenseAction, recordReceivableAdjustmentAction, recordPayableAdjustmentAction, allocateExistingPaymentAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/catalog/page.tsx` | MASTER | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/compensation/page.tsx` | PAYROLL | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, createServiceJobAction, cancelScheduledServiceJobAction, publishWorkItemAction, assignWorkItemAction, claimWorkItemAction, startWorkItemAction, heartbeatWorkItemAction, submitWorkResultAction, verifyServiceJobAction, createCompensationRuleAction, recordCompensationBasisAction, calculateEarningAction, approveEarningAction, payEarningAction, resolveCommissionReviewAction, configureRecognitionAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/customers/[id]/page.tsx` | MASTER | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/customers/manage/page.tsx` | MASTER | saveCatalogAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/customers/page.tsx` | MASTER | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/dashboard/obligations/page.tsx` | READ_SHARED | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/debts/page.tsx` | FINANCE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/deliveries/[id]/cancel/page.tsx` | DELIVERY | cancelPlannedDeliveryAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/deliveries/[id]/page.tsx` | DELIVERY | allocateWarehouseSourceAction, createDeliveryAction, assignDeliveryAction, handoffDeliveryAction, markDeliveryArrivedAction, submitDeliveryResultAction, uploadDeliveryEvidenceAction, verifyDeliveryAction, openReturnCaseAction, resolveReturnCaseAction, updateDeliveryReceiverAction, publishDeliveryWorkItemAction, verifyDeliveryWorkItemAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/deliveries/page.tsx` | DELIVERY | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/dispatch/page.tsx` | READ_SHARED | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/dispatch/resources/page.tsx` | MASTER | saveCatalogAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/expenses/page.tsx` | FINANCE | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, createFinanceAccountAction, submitPaymentWithOutcomeAction, postPaymentAction, reversePaymentAction, reconcilePaymentAction, createExpenseCategoryAction, createExpenseAction, approveExpenseAction, recordReceivableAdjustmentAction, recordPayableAdjustmentAction, allocateExistingPaymentAction, createDeliveryExpenseAction, approveExpenseWithOutcomeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/inventory/page.tsx` | INVENTORY | saveInventoryThresholdAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/inventory/transfers/[id]/page.tsx` | TRANSFER | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, createWarehouseTransferAction, recordWarehouseTransferAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/inventory/transfers/page.tsx` | TRANSFER | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, createWarehouseTransferAction, recordWarehouseTransferAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/inventory/warehouses/page.tsx` | MASTER | saveCatalogAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/invoices/[id]/page.tsx` | INTERNAL_DOCUMENT | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, registerSupplierDocumentAction, reviewSupplierDocumentAction, invoiceCommandWithOutcomeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/invoices/page.tsx` | INTERNAL_DOCUMENT | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, registerSupplierDocumentAction, reviewSupplierDocumentAction, invoiceCommandWithOutcomeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/invoices/purchases/matching/[id]/page.tsx` | INTERNAL_DOCUMENT | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, registerSupplierDocumentAction, reviewSupplierDocumentAction, invoiceCommandWithOutcomeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/invoices/purchases/matching/page.tsx` | INTERNAL_DOCUMENT | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, registerSupplierDocumentAction, reviewSupplierDocumentAction, invoiceCommandWithOutcomeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/invoices/purchases/page.tsx` | INTERNAL_DOCUMENT | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, registerSupplierDocumentAction, reviewSupplierDocumentAction, invoiceCommandWithOutcomeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/messages/page.tsx` | MESSAGE | createConversationAction, sendMessageAction, markConversationReadAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/operations/page.tsx` | NO_OPENING_COMPLETION | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/orders/[id]/edit/page.tsx` | SALES | createCustomerQuickAction, createSiteQuickAction, previewCommercialDocumentAction, createSalesOrderAction, createQuotationAction, updateSalesOrderDraftAction, updateQuotationDraftAction, confirmSalesOrderAction, cancelSalesOrderAction, closeSalesOrderRemainingAction, sendQuotationAction, acceptQuotationAction, acceptCustomerQuotationAction, createQuotationRevisionAction, createOrderFromQuotationAction, searchSalesCustomersAction, searchSalesSitesAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/orders/[id]/page.tsx` | SALES | allocateWarehouseSourceAction, createDeliveryAction, assignDeliveryAction, handoffDeliveryAction, markDeliveryArrivedAction, submitDeliveryResultAction, uploadDeliveryEvidenceAction, verifyDeliveryAction, openReturnCaseAction, resolveReturnCaseAction, previewCommercialDocumentAction, createSalesOrderAction, createQuotationAction, updateSalesOrderDraftAction, updateQuotationDraftAction, confirmSalesOrderAction, cancelSalesOrderAction, closeSalesOrderRemainingAction, sendQuotationAction, acceptQuotationAction, acceptCustomerQuotationAction, createQuotationRevisionAction, createOrderFromQuotationAction, confirmSalesOrderCreditOverride | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/orders/new/page.tsx` | SALES | createCustomerQuickAction, createSiteQuickAction, previewCommercialDocumentAction, createSalesOrderAction, createQuotationAction, updateSalesOrderDraftAction, updateQuotationDraftAction, confirmSalesOrderAction, cancelSalesOrderAction, closeSalesOrderRemainingAction, sendQuotationAction, acceptQuotationAction, acceptCustomerQuotationAction, createQuotationRevisionAction, createOrderFromQuotationAction, searchSalesCustomersAction, searchSalesSitesAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/orders/page.tsx` | SALES | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/page.tsx` | READ_SHARED | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/payables/[id]/page.tsx` | FINANCE | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, createFinanceAccountAction, submitPaymentWithOutcomeAction, postPaymentAction, reversePaymentAction, reconcilePaymentAction, createExpenseCategoryAction, createExpenseAction, approveExpenseAction, recordReceivableAdjustmentAction, recordPayableAdjustmentAction, allocateExistingPaymentAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/payables/page.tsx` | FINANCE | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, createFinanceAccountAction, submitPaymentWithOutcomeAction, postPaymentAction, reversePaymentAction, reconcilePaymentAction, createExpenseCategoryAction, createExpenseAction, approveExpenseAction, recordReceivableAdjustmentAction, recordPayableAdjustmentAction, allocateExistingPaymentAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/payment-notices/page.tsx` | NOTICE | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, paymentNoticeCommandAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/products/[id]/page.tsx` | MASTER | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/products/manage/page.tsx` | MASTER | saveCatalogAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/products/page.tsx` | MASTER | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/products/pricing/page.tsx` | PRICE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/purchase-orders/[id]/edit/page.tsx` | PURCHASE | searchPurchaseSuppliersAction, previewWarehousePurchaseAction, updatePurchaseOrderDraftAction, createPurchaseOrderAction, confirmPurchaseOrderAction, cancelPurchaseOrderAction, createSupplierQuickAction, updatePurchaseWarehouseAddressAction, updatePurchaseDraftDestinationAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/purchase-orders/[id]/page.tsx` | PURCHASE | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, receivePurchaseOrderWithOutcomeAction, receivePurchaseOrderAction, verifySupplierFulfillmentWithOutcomeAction, verifySupplierFulfillmentAction, openStockCountAction, recordStockCountLineAction, approveStockCountAction, searchPurchaseSuppliersAction, previewWarehousePurchaseAction, updatePurchaseOrderDraftAction, createPurchaseOrderAction, confirmPurchaseOrderAction, cancelPurchaseOrderAction, createSupplierQuickAction, updatePurchaseWarehouseAddressAction, updatePurchaseDraftDestinationAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/purchase-orders/new/page.tsx` | PURCHASE | searchPurchaseSuppliersAction, previewWarehousePurchaseAction, updatePurchaseOrderDraftAction, createPurchaseOrderAction, confirmPurchaseOrderAction, cancelPurchaseOrderAction, createSupplierQuickAction, updatePurchaseWarehouseAddressAction, updatePurchaseDraftDestinationAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/purchase-orders/page.tsx` | PURCHASE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/purchases/returns/[id]/page.tsx` | SUPPLIER_RETURN | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, createSupplierReturnAction, recordSupplierReturnAction, approveSupplierCreditAction, settleSupplierCreditAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/purchases/returns/page.tsx` | SUPPLIER_RETURN | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, createSupplierReturnAction, recordSupplierReturnAction, approveSupplierCreditAction, settleSupplierCreditAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/quotations/[id]/edit/page.tsx` | QUOTE | createCustomerQuickAction, createSiteQuickAction, previewCommercialDocumentAction, createSalesOrderAction, createQuotationAction, updateSalesOrderDraftAction, updateQuotationDraftAction, confirmSalesOrderAction, cancelSalesOrderAction, closeSalesOrderRemainingAction, sendQuotationAction, acceptQuotationAction, acceptCustomerQuotationAction, createQuotationRevisionAction, createOrderFromQuotationAction, searchSalesCustomersAction, searchSalesSitesAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/quotations/[id]/page.tsx` | QUOTE | previewCommercialDocumentAction, createSalesOrderAction, createQuotationAction, updateSalesOrderDraftAction, updateQuotationDraftAction, confirmSalesOrderAction, cancelSalesOrderAction, closeSalesOrderRemainingAction, sendQuotationAction, acceptQuotationAction, acceptCustomerQuotationAction, createQuotationRevisionAction, createOrderFromQuotationAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/quotations/new/page.tsx` | QUOTE | createCustomerQuickAction, createSiteQuickAction, previewCommercialDocumentAction, createSalesOrderAction, createQuotationAction, updateSalesOrderDraftAction, updateQuotationDraftAction, confirmSalesOrderAction, cancelSalesOrderAction, closeSalesOrderRemainingAction, sendQuotationAction, acceptQuotationAction, acceptCustomerQuotationAction, createQuotationRevisionAction, createOrderFromQuotationAction, searchSalesCustomersAction, searchSalesSitesAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/quotations/page.tsx` | QUOTE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/receivables/[id]/page.tsx` | FINANCE | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, createFinanceAccountAction, submitPaymentWithOutcomeAction, postPaymentAction, reversePaymentAction, reconcilePaymentAction, createExpenseCategoryAction, createExpenseAction, approveExpenseAction, recordReceivableAdjustmentAction, recordPayableAdjustmentAction, allocateExistingPaymentAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/receivables/page.tsx` | FINANCE | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, createFinanceAccountAction, submitPaymentWithOutcomeAction, postPaymentAction, reversePaymentAction, reconcilePaymentAction, createExpenseCategoryAction, createExpenseAction, approveExpenseAction, recordReceivableAdjustmentAction, recordPayableAdjustmentAction, allocateExistingPaymentAction, approveReturnCreditAction, refundCustomerCreditAction, offsetCustomerCreditAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/reports/page.tsx` | REPORT_AUDIT | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/routes/page.tsx` | ROUTE | createRoutePlanAction, applyRoutePlanAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/service-jobs/[id]/page.tsx` | WORK_PORTAL | createServiceJobAction, cancelScheduledServiceJobAction, publishWorkItemAction, assignWorkItemAction, claimWorkItemAction, startWorkItemAction, heartbeatWorkItemAction, submitWorkResultAction, verifyServiceJobAction, createCompensationRuleAction, recordCompensationBasisAction, calculateEarningAction, approveEarningAction, payEarningAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/service-jobs/page.tsx` | WORK_PORTAL | createServiceJobAction, cancelScheduledServiceJobAction, publishWorkItemAction, assignWorkItemAction, claimWorkItemAction, startWorkItemAction, heartbeatWorkItemAction, submitWorkResultAction, verifyServiceJobAction, createCompensationRuleAction, recordCompensationBasisAction, calculateEarningAction, approveEarningAction, payEarningAction, searchServiceJobCustomersAction, searchServiceJobSitesAction, searchServiceJobResourcesAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/settings/branches/page.tsx` | MASTER | saveCatalogAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/settings/page.tsx` | MASTER | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/settings/pricing/page.tsx` | PRICE | savePricingRuleAction, savePurchasePricingRuleAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/stock-counts/[id]/page.tsx` | STOCK_COUNT | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, receivePurchaseOrderWithOutcomeAction, receivePurchaseOrderAction, verifySupplierFulfillmentWithOutcomeAction, verifySupplierFulfillmentAction, openStockCountAction, recordStockCountLineAction, approveStockCountAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/stock-counts/page.tsx` | STOCK_COUNT | saveCommandDraftAction, getCommandDraftAction, checkSavedCommandFieldsAction, lookupCommandOutcomeAction, receivePurchaseOrderWithOutcomeAction, receivePurchaseOrderAction, verifySupplierFulfillmentWithOutcomeAction, verifySupplierFulfillmentAction, openStockCountAction, recordStockCountLineAction, approveStockCountAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/suppliers/[id]/page.tsx` | MASTER | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/suppliers/manage/page.tsx` | MASTER | saveCatalogAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/suppliers/page.tsx` | MASTER | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/suppliers/pricing/page.tsx` | PRICE | savePricingRuleAction, savePurchasePricingRuleAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/admin/workforce/page.tsx` | WORK_PORTAL | createServiceJobAction, cancelScheduledServiceJobAction, publishWorkItemAction, assignWorkItemAction, claimWorkItemAction, startWorkItemAction, heartbeatWorkItemAction, submitWorkResultAction, verifyServiceJobAction, createCompensationRuleAction, recordCompensationBasisAction, calculateEarningAction, approveEarningAction, payEarningAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/customer/debts/page.tsx` | FINANCE | getWorkerPortalSnapshot, getWorkerPortalJob, getCustomerPortalSnapshot, getCustomerPortalOrder, getAdminPaymentNotices, requestQuotationChangeAction, reviewPaymentNoticeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/customer/login/page.tsx` | AUTH | loginAction, recoveryAction, selectBranchAction, assignRoleAction, inviteEmployeeAction, revokeAccessAction, reactivateAccessAction, setExplicitPermissionsAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/customer/messages/page.tsx` | MESSAGE | createConversationAction, sendMessageAction, markConversationReadAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/customer/orders/[id]/page.tsx` | SALES | getWorkerPortalSnapshot, getWorkerPortalJob, getCustomerPortalSnapshot, getCustomerPortalOrder, getAdminPaymentNotices, requestQuotationChangeAction, reviewPaymentNoticeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/customer/orders/page.tsx` | SALES | getWorkerPortalSnapshot, getWorkerPortalJob, getCustomerPortalSnapshot, getCustomerPortalOrder, getAdminPaymentNotices, requestQuotationChangeAction, reviewPaymentNoticeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/customer/page.tsx` | READ_SHARED | getWorkerPortalSnapshot, getWorkerPortalJob, getCustomerPortalSnapshot, getCustomerPortalOrder, getAdminPaymentNotices, requestQuotationChangeAction, reviewPaymentNoticeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/customer/profile/page.tsx` | READ_SHARED | getWorkerPortalSnapshot, getWorkerPortalJob, getCustomerPortalSnapshot, getCustomerPortalOrder, getAdminPaymentNotices, requestQuotationChangeAction, reviewPaymentNoticeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/customer/quotations/[id]/page.tsx` | QUOTE | previewCommercialDocumentAction, createSalesOrderAction, createQuotationAction, updateSalesOrderDraftAction, updateQuotationDraftAction, confirmSalesOrderAction, cancelSalesOrderAction, closeSalesOrderRemainingAction, sendQuotationAction, acceptQuotationAction, acceptCustomerQuotationAction, createQuotationRevisionAction, createOrderFromQuotationAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/customer/quotations/page.tsx` | QUOTE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/login/page.tsx` | AUTH | loginAction, recoveryAction, selectBranchAction, assignRoleAction, inviteEmployeeAction, revokeAccessAction, reactivateAccessAction, setExplicitPermissionsAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/page.tsx` | READ_SHARED | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/recovery/confirm/page.tsx` | AUTH | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/recovery/page.tsx` | AUTH | loginAction, recoveryAction, selectBranchAction, assignRoleAction, inviteEmployeeAction, revokeAccessAction, reactivateAccessAction, setExplicitPermissionsAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/select-branch/page.tsx` | AUTH | loginAction, recoveryAction, selectBranchAction, assignRoleAction, inviteEmployeeAction, revokeAccessAction, reactivateAccessAction, setExplicitPermissionsAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/work/earnings/page.tsx` | PAYROLL | getWorkerPortalSnapshot, getWorkerPortalJob, getCustomerPortalSnapshot, getCustomerPortalOrder, getAdminPaymentNotices, requestQuotationChangeAction, reviewPaymentNoticeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/work/jobs/[id]/page.tsx` | WORK_PORTAL | getWorkerPortalSnapshot, getWorkerPortalJob, getCustomerPortalSnapshot, getCustomerPortalOrder, getAdminPaymentNotices, requestQuotationChangeAction, reviewPaymentNoticeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/work/login/page.tsx` | AUTH | loginAction, recoveryAction, selectBranchAction, assignRoleAction, inviteEmployeeAction, revokeAccessAction, reactivateAccessAction, setExplicitPermissionsAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/work/messages/page.tsx` | MESSAGE | createConversationAction, sendMessageAction, markConversationReadAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/work/page.tsx` | WORK_PORTAL | getWorkerPortalSnapshot, getWorkerPortalJob, getCustomerPortalSnapshot, getCustomerPortalOrder, getAdminPaymentNotices, requestQuotationChangeAction, reviewPaymentNoticeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/work/pool/page.tsx` | WORK_PORTAL | getWorkerPortalSnapshot, getWorkerPortalJob, getCustomerPortalSnapshot, getCustomerPortalOrder, getAdminPaymentNotices, requestQuotationChangeAction, reviewPaymentNoticeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/work/profile/page.tsx` | WORK_PORTAL | getWorkerPortalSnapshot, getWorkerPortalJob, getCustomerPortalSnapshot, getCustomerPortalOrder, getAdminPaymentNotices, requestQuotationChangeAction, reviewPaymentNoticeAction | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/work/tracking/page.tsx` | GPS_DEFERRED | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/access/context/route.ts` | AUTH | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/customers/[id]/debt-statement/pdf/route.ts` | MASTER | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/deliveries/[id]/note/pdf/route.ts` | DELIVERY | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/evidence/[id]/download/route.ts` | EVIDENCE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/evidence/[id]/signed/route.ts` | EVIDENCE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/finance/obligations/route.ts` | FINANCE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/gps/session/ping/route.ts` | GPS_DEFERRED | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/gps/session/start/route.ts` | GPS_DEFERRED | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/gps/session/stop/route.ts` | GPS_DEFERRED | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/health/route.ts` | READ_SHARED | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/invoices/[id]/review/pdf/route.ts` | INTERNAL_DOCUMENT | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/payments/[id]/voucher/pdf/route.ts` | READ_SHARED | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/portal/evidence/upload/route.ts` | EVIDENCE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/portal/payment-notices/route.ts` | NOTICE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/portal/work-items/claim/route.ts` | WORK_PORTAL | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/portal/work-items/start/route.ts` | WORK_PORTAL | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/portal/work-results/route.ts` | WORK_PORTAL | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/purchasing/evidence/[id]/signed/route.ts` | EVIDENCE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/purchasing/evidence/upload/route.ts` | EVIDENCE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/qa/environment/route.ts` | READ_SHARED | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/quotation-revisions/[id]/pdf/route.ts` | QUOTE | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/reports/customers/route.ts` | REPORT_AUDIT | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/reports/export/route.ts` | REPORT_AUDIT | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |
| `src/app/api/supplier-documents/[id]/review/csv/route.ts` | INTERNAL_DOCUMENT | Đường đọc/API trực tiếp; xem JSON permissions/RPC | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |

## Từng thao tác server

Mỗi action có mã riêng, source/line, quyền, RPC literal hoặc biểu thức động, bảng và các ca bắt buộc trong SYSTEM_ACCEPTANCE_INVENTORY.json. Helper dùng chung có thể đòi hỏi đối chiếu bổ sung; không coi thiếu literal là không có ghi.

| Action/file | Ca | RPC/quyền đọc được từ thân hàm | Kiểm chứng còn cần gắn |
|---|---|---|---|
| saveInventoryThresholdAction · `src/app/admin/inventory/actions.ts:10` | INVENTORY | set_inventory_stock_threshold  /  {
    target_branch_id: access.branchId,
    target_warehouse_id: warehouseId,
    target_material_id: materialId,
    target_threshold_base_quantity: threshold,
    target_active: active,
  }; inventory.adjust | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| activateOperations · `src/app/admin/operations/actions.ts:7` | NO_OPENING_COMPLETION | activate_branch_operations  /  {
  target_branch_id: access.branchId, expected_version: version,
  recovery_accepted: form.get("recoveryAccepted") === "on", confirmation, operation_id: operationId,
 } | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| loginAction · `src/lib/auth/actions.ts:27` | AUTH | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| recoveryAction · `src/lib/auth/actions.ts:45` | AUTH | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| selectBranchAction · `src/lib/auth/actions.ts:65` | AUTH | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| assignRoleAction · `src/lib/auth/actions.ts:86` | AUTH | assign_employee_role  /  {
    target_employee_id: parsed.data.employeeId,
    target_branch_id: parsed.data.branchId,
    target_role_id: parsed.data.roleId,
    change_reason: parsed.data.reason,
    operation_id: randomUUID(),
  }; roles.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| inviteEmployeeAction · `src/lib/auth/actions.ts:112` | AUTH | register_invited_employee  /  {
    invited_auth_user_id: invite.user.id,
    employee_code: parsed.data.code,
    employee_name: parsed.data.name,
    target_branch_id: parsed.data.branchId,
    target_role_id: parsed.data.roleId,
    change_reason: parsed.data.reason,
    operation_id: randomUUID(),
  }; roles.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| revokeAccessAction · `src/lib/auth/actions.ts:142` | AUTH | await createServerSupabase()  /  revoke_employee_access  /  {target_access_id:parsed.data.accessId,change_reason:parsed.data.reason,operation_id:randomUUID()}; roles.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| reactivateAccessAction · `src/lib/auth/actions.ts:152` | AUTH | await createServerSupabase()  /  reactivate_employee_access  /  {
      target_access_id: parsed.data.accessId,
      change_reason: parsed.data.reason,
      operation_id: randomUUID(),
    }; roles.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| setExplicitPermissionsAction · `src/lib/auth/actions.ts:169` | AUTH | await createServerSupabase()  /  set_employee_explicit_permissions  /  {
      target_employee_id: parsed.data.employeeId,
      target_branch_id: parsed.data.branchId,
      permission_codes: [...new Set(parsed.data.permissionCodes)],
      change_reason: parsed.data.reason,
      operation_id: randomUUID(),
    }; roles.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| saveCommandDraftAction · `src/lib/core/command-outcome-actions.ts:16` | READ_SHARED | save_command_draft  /  {
    target_operation_id: parsed.data.operationId, target_command: parsed.data.command,
    target_branch_id: access.branchId, target_entries: parsed.data.entries,
  } | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| getCommandDraftAction · `src/lib/core/command-outcome-actions.ts:29` | READ_SHARED | get_command_draft  /  {
    target_operation_id: operationId, target_command: command, target_branch_id: access.branchId,
  } | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| checkSavedCommandFieldsAction · `src/lib/core/command-outcome-actions.ts:42` | READ_SHARED | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| lookupCommandOutcomeAction · `src/lib/core/command-outcome-actions.ts:54` | READ_SHARED | lookup_command_outcome  /  {
    target_operation_id: parsed.data.operationId, target_command: parsed.data.command, target_branch_id: access.branchId,
  } | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| saveCatalogAction · `src/modules/catalog/actions.ts:13` | MASTER | await createServerSupabase()  /  rpcName  /  payload; config.permission | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createCustomerQuickAction · `src/modules/customers/actions.ts:25` | MASTER | await createServerSupabase()  /  save_customer_site_profile  /  {
      kind:'customers',target_id:id,target_branch_id:access.branchId,
      values_json:{code:parsed.data.code,display_name:parsed.data.name,customer_type:'BUSINESS',phone:parsed.data.phone /  / null,active:true},
      expected_json:null,change_reason:'Tạo nhanh trong Sales',operation_id:randomUUID(),
    }; customers.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createSiteQuickAction · `src/modules/customers/actions.ts:41` | MASTER | await createServerSupabase()  /  save_customer_site_profile  /  {
      kind:'sites',target_id:id,target_branch_id:access.branchId,
      values_json:{customer_id:parsed.data.customerId,code:parsed.data.code,name:parsed.data.name,address_text:parsed.data.address,receiver_name:parsed.data.receiverName /  / null,receiver_phone:parsed.data.receiverPhone /  / null,active:true},
      expected_json:null,change_reason:'Tạo nhanh trong Sales',operation_id:randomUUID(),
    }; customers.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| allocateWarehouseSourceAction · `src/modules/delivery/actions.ts:87` | DELIVERY | upsert_supply_allocation  /  {
    target_sales_order_line_id: parsed.data.salesLineId,
    supply_mode: "WAREHOUSE",
    target_purchase_order_line_id: null,
    target_warehouse_id: parsed.data.warehouseId,
    requested_base_quantity: parsed.data.quantity,
    target_allocation_id: null,
    expected_version: null,
    operation_id: parsed.data.operationId,
  }; purchasing.create | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createDeliveryAction · `src/modules/delivery/actions.ts:118` | DELIVERY | create_delivery_from_allocations  /  { target_sales_order_id: parsed.data.salesOrderId, planned_lines: lines, scheduled_at: scheduledAt, operation_id: parsed.data.operationId }; delivery.create | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| assignDeliveryAction · `src/modules/delivery/actions.ts:133` | DELIVERY | assign_delivery_scheduled  /  {
    target_delivery_id: parsed.data.deliveryId,
    target_employee_id: parsed.data.employeeId  /  /  null,
    target_vehicle_id: parsed.data.vehicleId  /  /  null,
    external_carrier_name: parsed.data.externalCarrierName  /  /  "",
    external_carrier_phone: parsed.data.externalCarrierPhone  /  /  "",
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  }; delivery.assign | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| handoffDeliveryAction · `src/modules/delivery/actions.ts:180` | DELIVERY | handoff_delivery_actual  /  {
    target_delivery_id: parsed.data.deliveryId, expected_version: parsed.data.version,
    handed_off_at: when, operation_id: parsed.data.operationId, loaded_lines: lines,
  }; delivery.handoff | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| markDeliveryArrivedAction · `src/modules/delivery/actions.ts:200` | DELIVERY | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| submitDeliveryResultAction · `src/modules/delivery/actions.ts:204` | DELIVERY | submit_delivery_result  /  {
    target_delivery_id: parsed.data.deliveryId,
    result_kind: parsed.data.resultKind,
    result_lines: lines,
    receiver_name: parsed.data.receiverName  /  /  "",
    note: parsed.data.note  /  /  "",
    missing_arrival_reason: parsed.data.missingArrivalReason  /  /  "",
    target_evidence_id: parsed.data.evidenceId  /  /  null,
    expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  }; delivery.submit | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| uploadDeliveryEvidenceAction · `src/modules/delivery/actions.ts:231` | DELIVERY | create_evidence_upload  /  {
    target_branch_id: access.branchId,
    bucket_name: bucketName,
    object_path: objectPath,
    audience: "INTERNAL",
    operation_id: crypto.randomUUID(),
  }; finalize_evidence_upload  /  {
    target_evidence_id: evidenceId,
    checksum_sha256: checksum,
    byte_size: candidate.size,
    operation_id: crypto.randomUUID(),
  }; evidence.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| verifyDeliveryAction · `src/modules/delivery/actions.ts:273` | DELIVERY | verify_delivery  /  {
    target_delivery_result_id: parsed.data.deliveryResultId,
    verification_lines: lines,
    expected_delivery_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  }; delivery.verify | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| openReturnCaseAction · `src/modules/delivery/actions.ts:294` | DELIVERY | open_return_case  /  { target_delivery_verification_line_id: parsed.data.verificationLineId, case_kind: parsed.data.caseKind, requested_base_quantity: parsed.data.quantity, reason: parsed.data.reason, target_evidence_id: null, operation_id: parsed.data.operationId }; delivery.exception | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| resolveReturnCaseAction · `src/modules/delivery/actions.ts:310` | DELIVERY | resolve_return_case  /  { target_return_case_id: parsed.data.returnCaseId, resolution: parsed.data.resolution, target_warehouse_id: parsed.data.warehouseId  /  /  null, resolution_reason: parsed.data.reason, target_evidence_id: null, expected_version: parsed.data.version, operation_id: parsed.data.operationId }; delivery.exception | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| cancelPlannedDeliveryAction · `src/modules/delivery/cancel-planned-action.ts:17` | DELIVERY | cancel_planned_delivery  /  {
    target_delivery_id: parsed.data.deliveryId,
    expected_version: parsed.data.version,
    cancellation_reason: parsed.data.reason,
    operation_id: parsed.data.operationId,
  }; delivery.exception | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| updateDeliveryReceiverAction · `src/modules/delivery/receiver-actions.ts:13` | DELIVERY | update_delivery_receiver  /  { target_delivery_id: value.deliveryId,
    receiver_name: value.receiverName, receiver_phone: value.receiverPhone, reason: value.reason,
    expected_version: value.version, operation_id: value.operationId }; delivery.assign | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createFinanceAccountAction · `src/modules/finance/actions.ts:49` | FINANCE | create_finance_account  /  {
    target_branch_id: access.branchId,
    account_code: parsed.data.code,
    account_name: parsed.data.name,
    account_kind: parsed.data.kind,
    operation_id: parsed.data.operationId,
  }; finance.account.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| submitPaymentWithOutcomeAction · `src/modules/finance/actions.ts:71` | FINANCE | post_payment  /  {
    target_branch_id: access.branchId,
    direction: parsed.data.direction,
    target_customer_id: parsed.data.direction === "RECEIPT" ? parsed.data.partyId : null,
    target_supplier_id: parsed.data.direction === "DISBURSEMENT" ? parsed.data.partyId : null,
    target_account_id: parsed.data.accountId,
    amount_vnd: parsed.data.amount,
    effective_at: toInstant(parsed.data.effectiveAt),
    method: parsed.data.method,
    external_reference: parsed.data.reference  /  /  "",
    allocation_lines: allocations,
    advance_amount_vnd: parsed.data.advanceAmount  /  /  "0",
    operation_id: parsed.data.operationId,
  }; finance.payment.post | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| postPaymentAction · `src/modules/finance/actions.ts:122` | FINANCE | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| reversePaymentAction · `src/modules/finance/actions.ts:129` | FINANCE | reverse_payment  /  {
    target_payment_id: parsed.data.paymentId,
    reversal_reason: parsed.data.reason,
    operation_id: parsed.data.operationId,
  }; finance.payment.reverse | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| reconcilePaymentAction · `src/modules/finance/actions.ts:147` | FINANCE | record_payment_reconciliation  /  {
    target_payment_id: parsed.data.paymentId,
    matched_amount_vnd: parsed.data.amount,
    statement_effective_at: toInstant(parsed.data.effectiveAt),
    statement_reference: parsed.data.reference,
    operation_id: parsed.data.operationId,
  }; finance.reconcile | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createExpenseCategoryAction · `src/modules/finance/actions.ts:170` | FINANCE | create_expense_category  /  {
    target_branch_id: access.branchId,
    category_code: parsed.data.code,
    category_name: parsed.data.name,
    operation_id: parsed.data.operationId,
  }; finance.expense.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createExpenseAction · `src/modules/finance/actions.ts:190` | FINANCE | create_expense  /  {
    target_branch_id: access.branchId,
    target_category_id: parsed.data.categoryId,
    target_supplier_id: parsed.data.supplierId,
    amount_vnd: parsed.data.amount,
    effective_at: toInstant(parsed.data.effectiveAt),
    due_date: parsed.data.dueDate,
    description: parsed.data.description,
    activity_kind: parsed.data.activityKind,
    target_sales_order_id: parsed.data.salesOrderId  /  /  null,
    target_evidence_id: parsed.data.evidenceId  /  /  null,
    operation_id: parsed.data.operationId,
  }; finance.expense.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| approveExpenseAction · `src/modules/finance/actions.ts:224` | FINANCE | approve_expense  /  {
    target_expense_id: parsed.data.expenseId,
    expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  }; finance.expense.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| recordReceivableAdjustmentAction · `src/modules/finance/actions.ts:271` | FINANCE | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| recordPayableAdjustmentAction · `src/modules/finance/actions.ts:275` | FINANCE | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| allocateExistingPaymentAction · `src/modules/finance/actions.ts:279` | FINANCE | allocate_payment  /  { target_payment_id: parsed.data.paymentId,
    allocation_lines: lines.data, operation_id: parsed.data.operationId }; finance.payment.post | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| approveReturnCreditAction · `src/modules/finance/credit-actions.ts:47` | FINANCE | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| refundCustomerCreditAction · `src/modules/finance/credit-actions.ts:53` | FINANCE | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| offsetCustomerCreditAction · `src/modules/finance/credit-actions.ts:63` | FINANCE | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createDeliveryExpenseAction · `src/modules/finance/delivery-expense-actions.ts:15` | FINANCE | create_delivery_expense  /  { target_branch_id: access.branchId, target_assignment_id: assignmentId,
  target_category_id: parsed.data.categoryId, target_supplier_id: parsed.data.supplierId, amount_vnd: parsed.data.amount,
  effective_at: new Date(`${parsed.data.effectiveAt}:00+07:00`).toISOString(), due_date: parsed.data.dueDate, description: parsed.data.description,
  cost_scope: parsed.data.costScope, supplier_reference: parsed.data.supplierReference, target_evidence_id: parsed.data.evidenceId  /  /  null,
  expected_delivery_version: Number(version), operation_id: parsed.data.operationId }; finance.expense.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| approveExpenseWithOutcomeAction · `src/modules/finance/delivery-expense-actions.ts:34` | FINANCE | approve_expense  /  { target_expense_id: parsed.data.expenseId, expected_version: parsed.data.version, operation_id: parsed.data.operationId }; finance.expense.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| paymentNoticeCommandAction · `src/modules/finance/notice-actions.ts:10` | NOTICE | command  /  { ...payload, operation_id: parsed.data.operationId }; finance.payment_notice.review; finance.reconcile | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| receivePurchaseOrderWithOutcomeAction · `src/modules/inventory/actions.ts:54` | INVENTORY | receive_purchase_order  /  {
    target_purchase_order_id: parsed.data.purchaseOrderId,
    receipt_lines: lines,
    target_evidence_id: parsed.data.evidenceId  /  /  null,
    received_at: parsed.data.receivedAt,
    operation_id: parsed.data.operationId,
  }; inventory.receive | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| receivePurchaseOrderAction · `src/modules/inventory/actions.ts:79` | INVENTORY | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| verifySupplierFulfillmentWithOutcomeAction · `src/modules/inventory/actions.ts:87` | INVENTORY | verify_supplier_fulfillment  /  {
    target_purchase_order_id: parsed.data.purchaseOrderId,
    fulfillment_lines: lines,
    target_evidence_id: parsed.data.evidenceId  /  /  null,
    supplier_reference: parsed.data.supplierReference  /  /  null,
    operation_id: parsed.data.operationId,
  }; inventory.receive | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| verifySupplierFulfillmentAction · `src/modules/inventory/actions.ts:111` | INVENTORY | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| openStockCountAction · `src/modules/inventory/actions.ts:119` | INVENTORY | open_stock_count  /  { target_branch_id: access.branchId, target_warehouse_id: parsed.data.warehouseId, cutoff_at: parsed.data.cutoffAt, operation_id: parsed.data.operationId }; inventory.count | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| recordStockCountLineAction · `src/modules/inventory/actions.ts:129` | INVENTORY | record_stock_count_line  /  {
    target_stock_count_id: parsed.data.stockCountId,
    target_material_id: parsed.data.materialId,
    counted_base_quantity: parsed.data.quantity,
    adjustment_unit_cost_vnd: parsed.data.unitCost  /  /  null,
    reason: parsed.data.reason  /  /  "",
    target_evidence_id: null,
    expected_count_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  }; inventory.count | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| approveStockCountAction · `src/modules/inventory/actions.ts:150` | INVENTORY | approve_stock_count  /  { target_stock_count_id: parsed.data.stockCountId, expected_count_version: parsed.data.version, operation_id: parsed.data.operationId }; inventory.adjust | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createWarehouseTransferAction · `src/modules/inventory/transfer-actions.ts:21` | TRANSFER | create_warehouse_transfer  /  { target_branch_id: access.branchId,
  from_warehouse_id: parsed.data.fromWarehouseId, to_warehouse_id: parsed.data.toWarehouseId, target_material_id: parsed.data.materialId,
  planned_base_quantity: parsed.data.quantity, transfer_reason: parsed.data.reason, operation_id: parsed.data.operationId }; inventory.reserve | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| recordWarehouseTransferAction · `src/modules/inventory/transfer-actions.ts:31` | TRANSFER | record_warehouse_transfer_event  /  { target_transfer_id: parsed.data.transferId, event_kind: parsed.data.kind,
  source_dispatch_id: parsed.data.dispatchId  /  /  null, source_issue_id: parsed.data.issueId  /  /  null, actual_base_quantity: parsed.data.quantity,
  event_reason: parsed.data.reason, expected_version: parsed.data.version, operation_id: parsed.data.operationId }; permission | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createInvoiceDraftAction · `src/modules/invoicing/actions.ts:23` | READ_SHARED | create_invoice_draft  /  { target_obligation_id: source, operation_id: operation }; finance.ar.adjust | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| approveInvoiceBusinessAction · `src/modules/invoicing/actions.ts:34` | READ_SHARED | approve_invoice_business  /  { target_invoice_id: id, expected_version: version, review_reason: reason, operation_id: operation }; finance.reconcile | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| cancelInvoiceDraftAction · `src/modules/invoicing/actions.ts:47` | READ_SHARED | cancel_invoice_draft  /  { target_invoice_id: id, expected_version: version, cancel_reason: reason, operation_id: operation }; finance.ar.adjust | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createInvoiceAdjustmentAction · `src/modules/invoicing/actions.ts:60` | READ_SHARED | create_invoice_adjustment_draft  /  { target_invoice_id: id, target_receivable_adjustment_id: adjustment, operation_id: operation }; finance.ar.adjust | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| registerPurchaseSourceAction · `src/modules/invoicing/actions.ts:71` | READ_SHARED | register_purchase_invoice_source  /  {
    target_payable_obligation_id: source,
    target_document_number: number  /  /  null,
    target_document_date: date  /  /  null,
    operation_id: operation,
  }; finance.ap.adjust | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| registerSupplierDocumentAction · `src/modules/invoicing/document-actions.ts:15` | READ_SHARED | register_supplier_document  /  { target_branch_id: access.branchId, target_supplier_id: parsed.data.supplierId,
  target_document_kind: parsed.data.kind, target_document_number: parsed.data.number, target_document_date: parsed.data.date, declared_total_vnd: parsed.data.total, document_lines: entries, operation_id: parsed.data.operationId }; finance.ap.adjust | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| reviewSupplierDocumentAction · `src/modules/invoicing/document-actions.ts:24` | READ_SHARED | review_supplier_document  /  { target_document_id: parsed.data.documentId, review_decision: parsed.data.decision, review_reason: parsed.data.reason, expected_version: parsed.data.version, operation_id: parsed.data.operationId }; parsed.data.decision === "CANCEL" ? "finance.ap.adjust" : "finance.reconcile" | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| invoiceCommandWithOutcomeAction · `src/modules/invoicing/document-actions.ts:33` | READ_SHARED | command  /  { ...payload, operation_id: op.data }; permission | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createConversationAction · `src/modules/messaging/actions.ts:11` | MESSAGE | create_conversation  /  {
    target_branch_id: access.branchId,
    target_audience: audience,
    target_customer_id: customerId,
    target_subject: subject,
    target_entity_type: audience === "CUSTOMER" ? "customer" : "branch",
    target_entity_id: customerId ?? access.branchId,
    target_participant_auth_user_ids: [participantId],
    operation_id: operationId,
  } | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| sendMessageAction · `src/modules/messaging/actions.ts:37` | MESSAGE | send_message  /  {
    target_conversation_id: conversationId,
    target_body: body,
    operation_id: operationId,
  } | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| markConversationReadAction · `src/modules/messaging/actions.ts:56` | MESSAGE | mark_conversation_read  /  { target_conversation_id: conversationId } | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| getWorkerPortalSnapshot · `src/modules/portal/actions.ts:23` | WORK_PORTAL | supabase  /  worker_portal_snapshot | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| getWorkerPortalJob · `src/modules/portal/actions.ts:28` | WORK_PORTAL | supabase  /  worker_portal_job  /  { target_work_item_id: id } | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| getCustomerPortalSnapshot · `src/modules/portal/actions.ts:38` | WORK_PORTAL | supabase  /  customer_portal_snapshot  /  {
    target_customer_id: customerId ?? null,
  } | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| getCustomerPortalOrder · `src/modules/portal/actions.ts:55` | WORK_PORTAL | supabase  /  customer_portal_order  /  { target_order_id: id } | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| getAdminPaymentNotices · `src/modules/portal/actions.ts:65` | WORK_PORTAL | supabase  /  admin_payment_notice_snapshot | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| requestQuotationChangeAction · `src/modules/portal/actions.ts:70` | WORK_PORTAL | supabase  /  request_quotation_change  /  {
    target_revision_id: revisionId,
    reason,
    operation_id: operationId,
  } | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| reviewPaymentNoticeAction · `src/modules/portal/actions.ts:84` | WORK_PORTAL | supabase  /  review_payment_notice  /  {
    target_payment_notice_id: noticeId,
    target_state: state,
    target_review_note: note,
    expected_version: version,
    operation_id: operationId,
  } | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| savePricingRuleAction · `src/modules/pricing/actions.ts:12` | PRICE | await createServerSupabase()  /  deactivate_pricing_rule  /  { target_id: supersedesId, target_branch_id: access.branchId, expected_version: expectedVersion, change_reason: reason, operation_id: randomUUID() }; await createServerSupabase()  /  save_pricing_rule  /  { target_id: randomUUID(), target_branch_id: access.branchId, supersedes_id: mode === "replace" ? supersedesId : null, expected_version: mode === "replace" ? expectedVersion : null, values_json: values, change_reason: reason, operation_id: randomUUID() }; pricing.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| savePurchasePricingRuleAction · `src/modules/pricing/purchase-actions.ts:9` | PRICE | db  /  deactivate_purchase_price_rule  /  {target_id:oldId,target_branch_id:access.branchId,expected_version:version,change_reason:reason,operation_id:operation}; db  /  save_purchase_price_rule  /  {target_id:target,target_branch_id:access.branchId,supersedes_id:mode==="replace"?oldId:null,expected_version:mode==="replace"?version:null,values_json:values,change_reason:reason,operation_id:operation}; purchasing.price.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| searchPurchaseSuppliersAction · `src/modules/purchasing/actions.ts:22` | PURCHASE | purchasing.create | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| previewWarehousePurchaseAction · `src/modules/purchasing/actions.ts:200` | PURCHASE | purchasing.create | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| updatePurchaseOrderDraftAction · `src/modules/purchasing/actions.ts:296` | PURCHASE | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createPurchaseOrderAction · `src/modules/purchasing/actions.ts:357` | PURCHASE | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| confirmPurchaseOrderAction · `src/modules/purchasing/actions.ts:361` | PURCHASE | confirm_purchase_order  /  { target_purchase_order_id: parsed.data.entityId, operation_id: parsed.data.operationId }; purchasing.confirm | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| cancelPurchaseOrderAction · `src/modules/purchasing/actions.ts:373` | PURCHASE | cancel_purchase_order  /  { target_purchase_order_id: parsed.data.entityId, cancel_reason: parsed.data.reason, operation_id: parsed.data.operationId }; purchasing.cancel | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createSupplierQuickAction · `src/modules/purchasing/actions.ts:385` | PURCHASE | create_supplier_quick  /  { target_branch_id: access.branchId, supplier_code: parsed.data.code, supplier_name: parsed.data.name, supplier_phone: parsed.data.phone  /  /  "", operation_id: parsed.data.operationId }; purchasing.create | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| updatePurchaseWarehouseAddressAction · `src/modules/purchasing/actions.ts:397` | PURCHASE | save_catalog_record  /  { kind: "warehouses", target_id: parsed.data.warehouseId, target_branch_id: access.branchId,
      values_json: { address_text: address }, expected_json: { address_text: parsed.data.expectedAddress }, change_reason: parsed.data.reason, operation_id: parsed.data.operationId }; purchasing.create | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| updatePurchaseDraftDestinationAction · `src/modules/purchasing/actions.ts:418` | PURCHASE | update_purchase_order_warehouse  /  { target_purchase_order_id: parsed.data.documentId, expected_version: parsed.data.expectedVersion,
      target_warehouse_id: parsed.data.warehouseId, change_reason: parsed.data.reason, operation_id: parsed.data.operationId }; purchasing.create | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createSupplierReturnAction · `src/modules/purchasing/supplier-return-actions.ts:25` | SUPPLIER_RETURN | create_supplier_return  /  { target_branch_id: access.branchId, target_receipt_line_id: ids[0]  /  /  null,
  target_fulfillment_line_id: ids[1]  /  /  null, target_custody_case_id: ids[2]  /  /  null, requested_base_quantity: parsed.data.quantity, return_reason: parsed.data.reason, operation_id: parsed.data.operationId }; purchasing.create | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| recordSupplierReturnAction · `src/modules/purchasing/supplier-return-actions.ts:34` | SUPPLIER_RETURN | record_supplier_return_event  /  { target_case_id: parsed.data.caseId, target_event_kind: parsed.data.kind,
  actual_base_quantity: parsed.data.quantity, target_supplier_reference: parsed.data.supplierReference  /  /  null, event_reason: parsed.data.reason, expected_version: parsed.data.version, operation_id: parsed.data.operationId }; permission | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| approveSupplierCreditAction · `src/modules/purchasing/supplier-return-actions.ts:44` | SUPPLIER_RETURN | approve_supplier_return_credit  /  { target_acceptance_event_id: parsed.data.acceptanceId, credit_amount_vnd: parsed.data.amount, approval_reason: parsed.data.reason, expected_case_version: parsed.data.version, operation_id: parsed.data.operationId }; finance.ap.adjust | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| settleSupplierCreditAction · `src/modules/purchasing/supplier-return-actions.ts:53` | SUPPLIER_RETURN | command  /  payload; finance.payment.post | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createRoutePlanAction · `src/modules/routing/actions.ts:28` | ROUTE | create_route_plan  /  {
    target_branch_id: access.branchId,
    target_departure_at: new Date(departureAt).toISOString(),
    target_vehicle_id: vehicleId,
    target_driver_employee_id: driverEmployeeId,
    target_provider_state: recommendation.state,
    target_provider_distance_meters: recommendation.distanceMeters,
    target_provider_duration_seconds: recommendation.durationSeconds,
    target_provider_error_safe: recommendation.safeError,
    target_stops: stops,
    operation_id: operationId,
  }; delivery.assign | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| applyRoutePlanAction · `src/modules/routing/actions.ts:140` | ROUTE | apply_route_plan  /  {
    target_route_plan_id: planId,
    expected_version: expectedVersion,
    operation_id: operationId,
  }; delivery.assign | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| previewCommercialDocumentAction · `src/modules/sales/actions.ts:226` | SALES | parsed.data.kind === "order" ? "orders.create" : "quotation.create" | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| createSalesOrderAction · `src/modules/sales/actions.ts:322` | SALES | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createQuotationAction · `src/modules/sales/actions.ts:323` | SALES | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| updateSalesOrderDraftAction · `src/modules/sales/actions.ts:324` | SALES | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| updateQuotationDraftAction · `src/modules/sales/actions.ts:325` | SALES | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| confirmSalesOrderAction · `src/modules/sales/actions.ts:337` | SALES | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| cancelSalesOrderAction · `src/modules/sales/actions.ts:343` | SALES | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| closeSalesOrderRemainingAction · `src/modules/sales/actions.ts:349` | SALES | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| sendQuotationAction · `src/modules/sales/actions.ts:355` | SALES | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| acceptQuotationAction · `src/modules/sales/actions.ts:361` | SALES | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| acceptCustomerQuotationAction · `src/modules/sales/actions.ts:367` | SALES | accept_quote_revision  /  { target_revision_id: parsed.data.entityId, acceptance_channel: "PORTAL", confirmed_by_name: membership.customerName, evidence_object_path: null, operation_id: parsed.data.operationId }; ["OWNER", "FINANCE_CONTACT"] | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createQuotationRevisionAction · `src/modules/sales/actions.ts:380` | SALES | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createOrderFromQuotationAction · `src/modules/sales/actions.ts:386` | SALES | create_sales_order_from_quote  /  { source_revision_id: parsed.data.entityId, requested_delivery_at: deliveryAt, operation_id: parsed.data.operationId }; orders.create | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| confirmSalesOrderCreditOverride · `src/modules/sales/credit-override-actions.ts:16` | SALES | confirm_sales_order_with_credit_override  /  {
        target_order_id: input.data.orderId, override_reason: input.data.reason,
        expected_snapshot_hash: input.data.snapshotHash, operation_id: input.data.operationId,
      }; orders.confirm | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| searchSalesCustomersAction · `src/modules/sales/form-lookup-actions.ts:13` | SALES | Delegate/helper: truy tiếp nguồn | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| searchSalesSitesAction · `src/modules/sales/form-lookup-actions.ts:24` | SALES | Delegate/helper: truy tiếp nguồn | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| createServiceJobAction · `src/modules/workforce/actions.ts:26` | WORK_PORTAL | create_service_job  /  {
    target_branch_id: access.branchId,
    target_customer_id: parsed.data.customerId,
    target_site_id: parsed.data.siteId,
    service_type: parsed.data.serviceType,
    description: parsed.data.description,
    scheduled_start: toInstant(parsed.data.scheduledStart),
    scheduled_end: toInstant(parsed.data.scheduledEnd),
    planned_quantity: parsed.data.plannedQuantity,
    unit_label: parsed.data.unitLabel,
       target_sales_employee_id: parsed.data.salesEmployeeId  /  /  null,
    target_vehicle_id: parsed.data.vehicleId  /  /  null,
    target_machine_id: parsed.data.machineId  /  /  null,
    operation_id: parsed.data.operationId,
  }; service.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| cancelScheduledServiceJobAction · `src/modules/workforce/actions.ts:57` | WORK_PORTAL | cancel_scheduled_service_job  /  {
    target_service_job_id: parsed.data.serviceJobId,
    expected_version: parsed.data.version,
    cancellation_reason: parsed.data.reason,
    operation_id: parsed.data.operationId,
  }; service.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| publishWorkItemAction · `src/modules/workforce/actions.ts:78` | WORK_PORTAL | publish_work_item  /  {
    target_branch_id: access.branchId, source_kind: "SERVICE_JOB", source_id: parsed.data.serviceJobId,
    requested_assignment_mode: parsed.data.assignmentMode, target_employee_id: parsed.data.employeeId  /  /  null,
    operation_id: parsed.data.operationId,
  }; work.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| assignWorkItemAction · `src/modules/workforce/actions.ts:119` | WORK_PORTAL | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| claimWorkItemAction · `src/modules/workforce/actions.ts:120` | WORK_PORTAL | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| startWorkItemAction · `src/modules/workforce/actions.ts:121` | WORK_PORTAL | Delegate/helper: truy tiếp nguồn | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| heartbeatWorkItemAction · `src/modules/workforce/actions.ts:123` | WORK_PORTAL | heartbeat_work_item  /  {
    target_work_item_id: parsed.data.workItemId, status_note: parsed.data.note, operation_id: parsed.data.operationId,
  }; work.claim | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| submitWorkResultAction · `src/modules/workforce/actions.ts:139` | WORK_PORTAL | submit_work_result  /  {
    target_work_item_id: parsed.data.workItemId, actual_quantity: parsed.data.actualQuantity,
    note: parsed.data.note, receiver_name: parsed.data.receiverName  /  /  null,
    target_evidence_id: parsed.data.evidenceId  /  /  null, expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  }; work.claim | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| verifyServiceJobAction · `src/modules/workforce/actions.ts:161` | WORK_PORTAL | verify_service_job  /  {
    target_service_job_id: parsed.data.serviceJobId, billable_quantity: parsed.data.billableQuantity,
    compensable_quantity: parsed.data.compensableQuantity, billable_amount_vnd: parsed.data.billableAmount,
    due_date: parsed.data.dueDate, verification_note: parsed.data.note,
    expected_job_version: parsed.data.jobVersion, expected_work_version: parsed.data.workVersion,
    operation_id: parsed.data.operationId,
  }; service.verify | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| createCompensationRuleAction · `src/modules/workforce/actions.ts:186` | WORK_PORTAL | create_compensation_rule  /  {
    target_branch_id: access.branchId, rule_code: parsed.data.code, rule_name: parsed.data.name,
    target_employee_id: parsed.data.employeeId  /  /  null, earning_type: parsed.data.earningType,
    calculation_kind: parsed.data.calculationKind, rate_vnd_per_unit: percentage ? null : parsed.data.rate,
    rate_bps: percentage ? Number(parsed.data.rate) : null, classification: parsed.data.classification,
    effective_from: parsed.data.effectiveFrom, effective_to: parsed.data.effectiveTo  /  /  null,
    operation_id: parsed.data.operationId,
  }; compensation.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| recordCompensationBasisAction · `src/modules/workforce/actions.ts:212` | WORK_PORTAL | record_compensation_basis  /  {
    target_branch_id: access.branchId, target_employee_id: parsed.data.employeeId,
    basis_type: parsed.data.basisType, basis_quantity: parsed.data.basisQuantity,
    period_start: parsed.data.periodStart, period_end: parsed.data.periodEnd,
    description: parsed.data.description, adjusts_earning_event_id: parsed.data.adjustsEarningId  /  /  null,
    target_evidence_id: parsed.data.evidenceId  /  /  null, operation_id: parsed.data.operationId,
  }; compensation.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| calculateEarningAction · `src/modules/workforce/actions.ts:234` | WORK_PORTAL | calculate_earning_event  /  {
    target_rule_id: parsed.data.ruleId, source_kind: parsed.data.sourceKind,
    source_id: parsed.data.sourceId, operation_id: parsed.data.operationId,
  }; compensation.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| approveEarningAction · `src/modules/workforce/actions.ts:253` | WORK_PORTAL | approve_earning_event  /  {
    target_earning_event_id: parsed.data.earningId, approved_amount_vnd: parsed.data.approvedAmount,
    due_date: parsed.data.dueDate, expected_version: parsed.data.version, operation_id: parsed.data.operationId,
  }; compensation.approve | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| payEarningAction · `src/modules/workforce/actions.ts:272` | WORK_PORTAL | post_payment  /  {
    target_branch_id: access.branchId, direction: "DISBURSEMENT", target_customer_id: null,
    target_supplier_id: null, target_employee_id: parsed.data.employeeId,
    target_account_id: parsed.data.accountId, amount_vnd: parsed.data.amount,
    effective_at: toInstant(parsed.data.effectiveAt), method: parsed.data.method,
    external_reference: parsed.data.reference,
    allocation_lines: [{ obligation_id: parsed.data.obligationId, amount_vnd: parsed.data.amount }],
    advance_amount_vnd: 0, operation_id: parsed.data.operationId,
  }; finance.payment.post | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| resolveCommissionReviewAction · `src/modules/workforce/commission-review-action.ts:10` | PAYROLL | resolve_commission_reconciliation  /  { target_case_id: parsed.data.caseId, resolution_kind: parsed.data.method,
  target_unpaid_earning_id: recover ? earningId : null, target_adjustment_rule_id: recover ? parsed.data.ruleId : null,
  expected_earning_version: recover ? Number(versionText) : null, resolution_reason: parsed.data.reason, operation_id: parsed.data.operationId }; compensation.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| publishDeliveryWorkItemAction · `src/modules/workforce/delivery-actions.ts:26` | DELIVERY | publish_work_item  /  {
    target_branch_id: context.branchId,
    source_kind: "DELIVERY",
    source_id: parsed.data.deliveryId,
    requested_assignment_mode: "DIRECT",
    target_employee_id: null,
    operation_id: parsed.data.operationId,
  }; work.manage | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| verifyDeliveryWorkItemAction · `src/modules/workforce/delivery-actions.ts:45` | DELIVERY | verify_delivery_work_item  /  {
    target_work_item_id: parsed.data.workItemId,
    expected_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  }; work.verify | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |
| searchServiceJobCustomersAction · `src/modules/workforce/form-lookup-actions.ts:12` | WORK_PORTAL | service.manage | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| searchServiceJobSitesAction · `src/modules/workforce/form-lookup-actions.ts:24` | WORK_PORTAL | service.manage | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| searchServiceJobResourcesAction · `src/modules/workforce/form-lookup-actions.ts:38` | WORK_PORTAL | service.manage | authorized positive with independent source; wrong branch/customer/role denial; exact quantity/money and reload |
| configureRecognitionAction · `src/modules/workforce/recognition-action.ts:8` | PAYROLL | configure_compensation_recognition  /  { target_rule_id: data.data.ruleId,
    recognition_kind: data.data.recognitionKind, effective_at: new Date(data.data.effectiveAt + ":00+07:00").toISOString(),
    operation_id: data.data.operationId }; compensation.manage; compensation.approve | authorized valid command with source readback; forbidden actor and wrong source scope; valid/invalid state and stale/NULL version where contract requires; financial/inventory/next-role effects; retry original intent and rollback on failure where command supports |

Bằng chứng cũ có hiệu lực chỉ sau đối chiếu định nghĩa hiệu lực và phạm vi; không ghi các ca mới thành đạt. Hai advance races bị loại, giữ600.000đ/400.000đ/một phiếu tiền. GPS thiết bị và phát hành pháp lý hoãn theo người dùng; backend quyền/chức năng nội bộ vẫn cần đạt.
