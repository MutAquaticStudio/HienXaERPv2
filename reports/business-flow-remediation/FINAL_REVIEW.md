# Rà soát cuối PR42

Bản rà soát nền: `e7f7bb6`, bàn giao `9f099e5`. Đợt đóng blocker sau bàn giao nằm tại [RELEASE_BLOCKERS.md](RELEASE_BLOCKERS.md), schema canonical174; CI phải gắn head cuối PR42. Các ghi chú trước đó được giữ làm lịch sử, không thay kết luận mới.

## 1. Tình trạng khắc phục G01–G23

Nền đối chiếu là PR42/headbc8bb21 trên PR41/base8b693c2. Đã đọc thay đổi và định nghĩa DB có hiệu lực, không suy từ tên commit/test. Rà soát tìm và sửa ba nhóm lỗi: làm tròn cost trả vật lý tạo dư1đ; xử lý trả thiếu lý doNULL; metadata minh chứng có thể thànhREADY/VERIFIED khi chưa upload. Bổ sung khóa chung costpool cho các delivery cùng nguồn, kiểm lý do tại DB, và hoàn tất minh chứng chỉ từ máy chủ sau đọc lại byte/checksum. Metadata cũ không được tự backfill đã xác minh.

| G | Nguyên nhân | Định nghĩa/đường mã được đối chiếu | Bằng chứng | Kết luận và giới hạn |
|---|---|---|---|---|
| G01 | Căn cứ kiểm kê thay đổi giữa đếm và duyệt | approve_stock_count | PACKAGE1_CONCURRENCY; PACKAGE10_TRANSFER_SEAMS142 | Đạt căn cứ hiện tại/reservation; kiểm kê nhiều kho ngoài model không được suy rộng |
| G02 | Lượng bị DB làm tròn sau tính tiền | assert_commercial_line; require_exact_quantity; receive_purchase_order | FINAL_SEAMS164; PACKAGE8_G02_HOUR_AFTER132 | Kiểm trước lưu, cả lượng quy đổi; chưa thử toàn bộ cực trị/UOM |
| G03 | Tiền/cost chia đợt lệch nguồn | verify_delivery; return_cost_portion; resolve_return_case | FINAL_REVIEW_RETURN_VALUE_BEFORE/AFTER165; DIRECT_MULTI_RETURN165; RETURN_POOL_AUTH_RACE165 | Đã sửa thêm cost vật lý; 45 đơn vị trả hết đúng6.750.000đ, hai actor khóa chung; không sửa facts cũ |
| G04 | Caller chọn giá thấp hơn ưu tiên | assert_commercial_line; preferred_commercial_price_rule; update_sales_order_draft | PACKAGE7_G04_HIERARCHY_G12_129_FINAL; OLD_DOCUMENT_VALUES168 | Ưu tiên tại server và giá snapshot; PO cũ vẫn1000đ, không tái tính theo bảng mới |
| G05 | Raw cost/filter/history và Storage khác chi nhánh | portal_evidence_access; can_read_internal_evidence_storage; finance_dashboard_snapshot | PACKAGE1_AUTH_HTTP; FINAL_SOURCE_READBACK164; EVIDENCE_SCOPE_GATES168 | Vốn/membership theo đường đổi; Storage QA thật/sai khách/sai chi nhánh đã đạt ở đợt mới; toàn bộ disabled accounts chưa nghiệm thu |
| G06 | Delivery/work/GPS lệch sau đổi người | assign_delivery_scheduled; record_gps_ping; start_gps_tracking | PACKAGE3_REASSIGNMENT_AUTH_HTTP_FINAL; GPS_BOUNDARY165 | Old start/ping/retry/newsession đều bị chặn sau revoke; GPS thiết bị thực còn thiếu |
| G07 | Phân bổ tiền cũ tạo/khóa sai tiền | allocate_payment_lines; payment_available | PACKAGE4_G07_*; PACKAGE11_G11_G07_NEW_NONRACE150 | Giữ hai race600k/400k/cash1, không chạy lại; không claim amount literal10m/30m |
| G08 | Paid return thiếu khoản có/settlement | adjust_return_receivable; refund_customer_credit; offset_customer_credit | PACKAGE4_G08_AUTH_REFUND_OFFSET_RACE; PACKAGE8_LEGACY_BROWSER131 | Refund+offset/funds cap, giữ hàng khách còn giữ; generic paidPRICE ngoài workflow mới |
| G09 | Return/WRITE_OFF lẫn revenue và sửa earnings đã trả | finance_dashboard_snapshot; resolve_commission_reconciliation | PACKAGE5_G09_AUTH_REVENUE_AFTER119; PACKAGE8_COMMISSION_*; SOURCE_READBACK165 | 1.04m/period/cutoff, paid161k giữ nguyên, review11.5k; mọi payroll rule chưa đủ |
| G10 | Ngoại lệ mất khi result FULL nhưng còn cargo | dispatch_board_page; resolve_return_case | PACKAGE3_DIRECT_CARGO_BOARD_AFTER; PACKAGE3_BROWSER_ELIGIBLE | Hiện đến khi custody xử lý; new cost rounding không đổi lượng trên xe |
| G11 | Nguồn mới bị gate đầu kỳ/ACTIVE | require_active_operations; branch_recording_scope | PACKAGE6_G11_NATIVE124/AUTH_HTTP124_FINAL/BROWSER124_FINAL | Không opening/activation/zero entry; lịch sử UNRECONCILED, không enterpriseTotal verified |
| G12 | NULL/stale version và retry bị coi là lệnh mới | lock_saved_command_intent; verify_delivery; approve_supplier_return_credit | FINAL_CONTRACT_INVENTORY164; FINAL_SEAMS164; PACKAGE9–13 source tests | 37 contracts được rà; cache trước state/version, quyền vẫn trước cache; các caller legacy không thuộc phạm vi chưa sweep |
| G13 | Tải/lịch chỉ kiểm theo một phiếu | assign_delivery_scheduled; handoff_delivery_actual | PACKAGE3_ASSIGNMENT_CONCURRENCY_FINAL/CARGO_AUTH_RACE | Tổng cargo thực, conversion/cap/schedule lock; race hai reservation chung15 kho chưa chạy |
| G14 | Xuất theo plan và không release residual | handoff_delivery_actual; create_delivery_from_allocations | PACKAGE3_DB_REGRESSION_FINAL; CARGO_BROWSER | 14/15, zero unloaded, residual đúng; một điểm lấy/một SO/phiếu |
| G15 | Mất phản hồi tạo ý định mới | save_command_draft; lookup_command_outcome; finalize_portal_evidence_verified | PACKAGE5_G15_AUTH_INTENT_RACES121; PAYMENT/PURCHASE_BROWSER121; STORAGE_UNIT169 | Ba flow gốc và các lệnh mới đạt; Storage thật và notice reload/cùng intent đã đạt tại RELEASE_BLOCKERS; không lưu dữ liệu tiền/tệp trong browser |
| G16 | Một dòng vốn đại diện cả SO | delivery_cost_sources_complete; finance_dashboard_snapshot | PACKAGE9_G16_FEE_AUTH142; SOURCE_READBACK165 | WH vốn đủ/direct thiếu+tripfee vẫn INCOMPLETE; actualsource đủ mới READY; không suy từ1.04m |
| G17 | Expense thiếu nguồn chuyến/xe và trùng earning | create_delivery_expense; approve_expense | PACKAGE9_EXPENSE_AUTH138/BROWSER138/VEHICLE_NATIVE142 | Mỗi phiếu/lần giao, DIRECT vs OVERHEAD, reuseAP/payment; không multiSO trip allocation |
| G18 | Chuyển kho bằng hai điều chỉnh không có custody | record_warehouse_transfer_event | PACKAGE10_TRANSFER_SEAMS142/CROSS_ACTOR_INTENT142/BROWSER142 | Lots/partial/shortage/loss và tổng value; mộtSKU cùngbranch, không crossbranch |
| G19 | Trả NCC không giữ physical/AP/paid source | record_supplier_return_event; approve_supplier_return_credit; payment_available | PACKAGE11_SUPPLIER_*; G19_PHYSICAL165/RECORDED_CUSTODY165 | Physical/accept/credit/refund/offset riêng; direct whole custodycase, chia nguồn bằng nhiều case; không fakeWH |
| G20 | Invoice nhập/duyệt lẫn phát hành và double debt | register_supplier_document; review_supplier_document; create_invoice_draft | PACKAGE12_DOCUMENT_* / INTERNAL_INVOICE158 / INVOICE_BROWSER159 | Internal/matching/export đạt; max100 dòng/document; legal provider/API/sandbox chưa có, không issued |
| G21 | Audit thiếu/success giả/nullable lý do | audit_source_command_receipt; resolve_return_case; finalize_evidence_upload_verified | RETURN_REASON_ATOMIC166; EVIDENCE_GATES169; PACKAGE1/3/5/8–13 faults | NULL/501 lý do đã chặn;172 bổ sung attestation/audit ngay lần finalize nội bộ đầu, rollback/retry thật đạt; không backfill audit cũ |
| G22 | Ảnh chuyển khoản bị coi là tiền và match vượt | match_payment_notice; reverse_payment_notice_match; submit_payment_notice | PACKAGE13_NOTICE_AUTH161/RACE162/BROWSER162; EVIDENCE_GATES169 | Bank coverage/party/branch/reversal không cash/debt; full intake ảnh QA thật đã đạt; ảnh không tự giảm nợ |
| G23 | Commercial CLOSED bị hiểu hoàn tất toàn bộ | sales_order_operational_snapshot | PACKAGE14_OPERATIONS_NATIVE163; FINAL_G23_BROWSER164 | Tách axes và open work/returns/funds/commission/doc variance; không gom nhiều SO/chuyến |

Các hàm có hiệu lực, chữ ký, ACL và hash nằm trong evidence FINAL_REVIEW_EFFECTIVE169; dùng migration cuối theo từng hàm, không đọc định nghĩa cũ rồi cho rằng vẫn có hiệu lực. Mọi dữ liệu/identity trong kiểm thử ghi là QA cục bộ; realJWT qua cầu nối không có nghĩa businessDB hoặc Storage managed đã được thử.

## 2. Phạm vi đã nghiệm thu thực tế

Đạt trong nativeQA: các nguồn kho/giao thẳng; lượng/tiền/cost theo dòng; thu/chi/phân bổ/khoản có; partial refund/offset; chuyển kho cùngchi nhánh/mộtSKU; trả NCC theo nguồn và paid funds; phí từng phiếu/lần giao; matching và CSV/PDF nội bộ; quyền vốn theo các đường đổi; null/stale/intent/retry/rollback/audit. JWT và browser có phạm vi ghi tại T01–T42, không blanketPASS mọi module. G16 độc lập theo từng nguồn/cutoff, ca1.04m được đọc lại không tạo lại. GPS backend có chặn người cũ; tọa độ native/simulated không phải thiết bị thực.

Realtime chỉ dùng để tự refresh tin nhắn. Gửi/truy vấn/persistence không dựa vào websocket: SSR dùng conversation_list_for_scope/conversation_message_page và gửi dùng revalidatePath. Ca JWT gửi trên DBnative rồi người tham gia khác query lại đã đạt một message; đây là fallback truy vấn, không chứng minh websocket hoặc UI reload tự động. Không có dependency Realtime cho cash/stock/debt commands.

Hai race ứng trước bị loại: package4-advance-race.mjs modesdifferent-intents/same-intent. Giữ600.000đ phân bổ/400.000đ còn/một phiếu tiền; không gọi lại qua runner tổng. Race costpool mới dùng nguồn45 đơn vị riêng, hai UID/PID có observed blocking; không dùng thay bằng chứng hai race cũ.

### Nâng cấp và khả năng tiếp tục

Certificate136→164 kiểm hash toàn bộ giá trị của119 bảng public/private theo cột cũ sau từng forward: PK/FK/source IDs, inventory qty/value/location, transit/cargo, debts/allocations/advances/credits, open/posted states và membership/roles đều nằm trong hash, không chỉ row count. Không restore/migrate lại gói đó. Áp dụng thêm165–169 trên cùng bản sao và trên fresh165 (chỉ migration còn thiếu) giữ public facts cũ. Chứng từ PO cũ7f86038f... nhận tiếp được qua canonical RPC, đọc bằng kết nối khác và retry một effect: source line hash giữ nguyên; receipt/stock/AP/intent/audit mỗi loại1, giá cũ1000đ vẫn ra stock/AP1000đ, PO CLOSED. Đây là chứng minh xử lý một PO cũ; không claim mọi loại chứng từ cũ đều xử lý được.

Scan dữ liệu hiện có: count quantity hữu hạn sai0; customer warehouse returns vượt source inventorycost0; public thiếuRLS0. Một constraint finitecount NOT VALID có từ trước được nêu, không suy rằng đã validate toàn lịch sử. Các FK nguồn đã validate; native archive chỉ DBứng dụng/AuthUID shim, không Managed Auth/Storage/PITR.

## 3. Điều kiện còn thiếu trước phát hành

Không đủ điều kiện phát hành toàn bộ. Storage QA thật đã được kiểm ở RELEASE_BLOCKERS; kiểm lại asset doanh nghiệp thật và recovery môi trường đích vẫn là điều kiện cho flow bắt buộc minh chứng. G20 phát hành pháp lý vẫn BLOCKED do chưa có provider/endpoint/credentials/sandbox/certificate/tenant info; không chọn provider hay phát hành thật trong task này. Các ca dưới đây có ID cụ thể, phân biệt blocker của phạm vi với ca mở rộng chưa chạy.

| Ca còn thiếu | Nghiệp vụ | Vì sao / điều kiện thiếu | Chặn phạm vi nào | Cách kiểm chứng tiếp |
|---|---|---|---|---|
| T39-S1 | Portal file và nguồn | ĐÃ ĐẠT QA thật: PDF/PNG/JPEG, byte/hash, WORK_RESULT/PAYMENT_NOTICE và stream đúng quyền | Giới hạn dữ liệu/mô hình QA | STORAGE_REAL_QA171; STORAGE_BOUNDARIES172; xem RELEASE_BLOCKERS |
| T39-S2 | Nhận hàng có minh chứng | ĐÃ ĐẠT QA thật: signed upload/PATCH, binding+audit ngay lần đầu và receipt đúng nguồn | Không suy rộng mọi biến thể nhận/giao/trả | STORAGE_INTERNAL_FIRST173 |
| T39-S3 | Quyền và nội dung bất biến | ĐÃ ĐẠT phạm vi QA: sai người/khách/chi nhánh; user không replace; admin replace làm proof cũ không còn hiệu lực | Disabled accounts toàn hệ thống vẫn riêng | STORAGE_REAL_QA171; STORAGE_BOUNDARIES172 |
| T39-S4 | Sự cố/retry/reload file | ĐÃ ĐẠT backend thật: từng điểm ngắt, lostresponse sau commit, cùng intent/object/audit; browser nhận và notice reload | Không lưu byte hoặc payload tiền tại browser | STORAGE_REAL_QA171; STORAGE_NOTICE_RELOAD174 |
| T39-S5 | Legacy file | QA đã khảo sát91 tệp/bốn lớp thực/xác minh lại1; chưa khảo sát doanh nghiệp thật | Legacy thật trước triển khai | STORAGE_LEGACY_REVERIFY173; STORAGE_LEGACY_IMPACT_QA; quy trình trách nhiệm tại RELEASE_BLOCKERS |
| T42-R1 | Tin nhắn tức thời | ĐÃ ĐẠT QA thật: JWT trước subscribe, RLS nonparticipant, reconnect/query; browser bù tin không reload | Chỉ luồng messaging, không nguồn kho/tiền | REALTIME_QA_RELEASE170; REALTIME_BROWSER_RECOVERY_FINAL |
| T42-R2 | UI fallback | ĐÃ ĐẠT browser chặn WebSocket rồi query/reload | Persistence và instant update có chứng cứ riêng | MESSAGING_BROWSER_RELOAD171 |
| T42-G1 | Định vị thiết bị/permission denial/background/network | Không thiết bị thật hoặc permissionOS/hardware được cấp | GPS đo/gửi vị trí thực | Thiết bịQA, quyềncho/từchối, offline/reconnect; không geolocationmock làm chứng minh hardware |
| T42-G2 | GPS endpoint sau đổi người qua JWT/thiết bị | Native oldstart/ping/retry/newsession đã chặn; JWToldWork denial cũ giữ; chưa liveGPS device | Full GPS endtoend | Phiên cũ có position trước đổi, đổi người rồiOldJWTping/retry bị403, phiên mới hoạt động |
| T35-L1 | Legal invoice emission/status/recover | Chưa provider/endpoint/tenant/API credential/certificate/sandbox | Phát hành pháp lý; internal/export không bị chặn | Khi cung cấp cấu hình sandbox hợp lệ: issue/lookup lostresponse cùngintent, không debt lần2; không emit thật |
| T04-E1 | Missing fields mọi form/tổ hợp | Đợt này chọn seam về lượng/source/version; không fullformcrossproduct | Không nghiệm thu mọi form legacy | Liệt kê requiredfields trên quote/SO/PO/service, thử từngfield thiếu tại UI+RPC |
| T05-E1/T06-E1 | DisabledAuth và mọi portal scope | Không tài khoảnQA disabled/ngoài scope được chuẩn bị; không thay lifecycleclouduser đang dùng | Full account/portal permission matrix | Tài khoảnQA chuyên dụng, staleJWT/disabled/revokedmemberships và branchA→B; native đối chiếuactive predicates |
| T12-E1 | Hai reservation từ cùng15 tồn | Race cargo chungxe đã đạt; chưa separate warehouse reservationrace | Concurrency reservation literal | Hai SO/actor, cùngWH/material, cảhai15, observedlock→chỉmộtreservation/delivery; không advancecase |
| T19-E1/T21-E1 | MultiSKU/multiUOM fullbrowser; amendment variants | Model một SO/mộtpickup đã thử, không mọi combination | Full delivery/amendment acceptance | Hai SKU/eligibleunits, partial actual/billable/approvedreason/caps/reload, nguồn mỗi dòng |
| T25-E1 | PO30 nhận10+20, nhiều dòng/fullbrowser | Partial/precision/retry đã thử; chưa literal nhiều dòng | Multi-line receipt fullbrowser | DòngA hoàn tất nhưng B còn phảiCONFIRMED; B đủ mớiCLOSED, nguồn/qty/value vàretry đúng |
| T30-E1 | Literal prepay10m /AR30m /2×10m | Existingpayment partial/cap đã đạt vớiamountkhác; không lập lại chỉ để tăngcount | Ca literal, không phủ nhận ledger invariant | Fixture riêng, phiếu cũ khôngcashmới, debtPARTIAL→PAID; không rerun2raceadvance |
| T36-E1/T37-E1 | Servicefullbrowser/mọi payroll rule | Đã thử dualversions/hours/paidreview; chưa mọi policy được chốt vàfulljourney | Service/payroll toàn phạm vi | Rule/basis/gross/net cóexpected độc lập, claim/start/result/approve/pay/reverse cósource |
| T40-E1/T41-E1 | Audit legacy khác; AR/APexport>1000/tất cảfilter | Audit lệnh đổi vàexportscope/CSVformula đạt; chưa largefixture/legacy allowlist đầy đủ | Fullaudit/exportacceptance | CanonicalQAlargefixture, pagination/cutoff/branchscope/tiecursor/no duplicate; single supplierdocmax100 nên khôngđòi1000 dòng ởdoc đó |

Các ca mở rộng chưa chạy không được gọi là lỗi đã chứng minh. Các blocker môi trường không được đổi thànhPASS bằng mock/schemaStorage giả. CI chỉ xác nhận sourcehead đã chạy; migration/Storage/hardware có chứng cứ riêng. Không merge, nâng cấp dữ liệu thật, phát hành hóa đơn thật hoặc deployProduction.

## Đợt đóng blocker sau 9f099e5

Storage/Realtime QA thật và cơ chế khảo sát/kiểm lại legacy đã kiểm chứng. Xem [RELEASE_BLOCKERS.md](RELEASE_BLOCKERS.md) để đọc phạm vi, lỗi bổ sung, môi trường, bốn lớp legacy, trách nhiệm xử lý và điều kiện hợp nhất/triển khai riêng. GPS thiết bị, hóa đơn pháp lý, inventory minh chứng thật và khôi phục byte tại môi trường đích còn thiếu. Không thu hẹp tính năng để báo nghiệm thu toàn bộ.
