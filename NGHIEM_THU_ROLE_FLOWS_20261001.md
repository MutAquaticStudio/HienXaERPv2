# NGHIEM THU HIEN XA - OWNER / CUSTOMER / WORKER

Date: 2026-10-01 (Asia/Ho_Chi_Minh).

## Ket luan

**CHUA DAT nghiem thu toan he thong.** Cac luong QA quan trong da thao tac qua UI va doi chieu DB; cac loi UI da sua/kiem lai/deploy. Con mot defect P1 ve ngoai le tin dung va cac gate chua du bang chung. Khong co P0 tai hien trong cac ca da chay; KHONG khang dinh toan repo khong co P0.

## Version / environment

- Frozen candidate: /private/tmp/hx-role-flow-release-20261001-P09l5m
- Source fingerprint: 86ce2240419bd8f444bd98e0e18a05691232bd6d717cad8e8ee8b343b2fef05c (313 inputs; manifest in candidate.json).
- QA build: 9BLsmlf6vdV-I_1kxrJx7; http://127.0.0.1:4039; Supabase ffrwiglcrlumfvhubaxg.
- QA migration head recorded: 20261001084145. No migration/seed/cleanup run during this batch.
- Baseline Production before fix: dpl_BATz1zA8Xxie4zZJWQBewpdoK9jH; fingerprint ec0a25e9fef4494d7647d6b1600b968fa6bad1203f765c52e94dce6f3f2f19ab.
- New Production: dpl_6WDcPcapj8X9iB1S2kUoLzZBTKSb, READY. Primary https://hien-xa-erp-v2-nu.vercel.app resolves to this deployment (primary-alias.json).
- New Vercel account/scope: thunderekt-6020 / hienxa. No old connector used.
- QA build used webpack; Vercel build used Turbopack. Both compiled/typechecked successfully; no bundler equivalence inferred solely from build.
- Branch/reference previously recorded: codex/uat-role-navigation-20260923 / 79b0b918c7430bfd0e9d17e247ecba2be1fa0bf2. This SHA is NOT claimed as the exact dirty working tree/deployed version; frozen fingerprint is authoritative for this acceptance. No Git/commit/push/PR operations in this turn.
- Business writes only on verified QA through UI. Production application deployment authorized; Production business DML, schema, RLS/grants, passwords, external messages/invoices NOT_TOUCHED.

## Roles / sources

QA Owner hxqa-owner@example.test; Customer Finance hxqa-finance@example.test; Receiver hxqa-receiver@example.test; Worker hxqa-worker@example.test. Additional SDK boundary checks included sales/other_customer. No passwords, tokens, session storage or signing URLs stored in this report. UI sessions switched serially; SDK logout used local scope.

Main fresh UI chain: QT-2026-000016 -> accepted revision -> SO-2026-000035 (correct overdue block). Separate approved synthetic customer/site HXQA-RF-1001/HXQA-RF-S1001 -> SO-2026-000037 -> PO-2026-000035 -> PR-2026-000032 -> DL-2026-000019 -> AR -> two receipts + AP payment.

Independently calculated: 2*120000 + 3*150000 = 690000; cost 2*80000 + 3*90000 = 430000; gross margin 260000; stock receipt +5, handoff on-hand 0/in-transit 5, verify transit 0. Payment 300000 -> debt 390000/PARTIAL; payment 390000 -> debt 0/PAID. AP payment 430000 -> debt 0. These are QA bookkeeping records, not real money.

Affected bridge retest: SO-2026-000038 -> DL-2026-000020 -> WRK-202611-000008. Worker result DONE did not create Delivery result/AR; Owner separately verified Delivery then WorkItem. Work verification count 1 and AR remained one source 120000.

## Fixed and deployed

| ID | Severity / role | Reproduction before fix | Minimal fix / location | Evidence |
| --- | --- | --- | --- | --- |
| UAT-WORK-BRIDGE | P1 Owner/Worker | Assign internal Delivery then worker cannot find it; no WorkItem and no publish UI | Existing publish_work_item/verify_delivery_work_item exposed through permission-gated UI. src/modules/workforce/delivery-actions.ts:25 and :44; src/components/delivery/work-item-bridge.tsx; src/app/admin/deliveries/[id]/page.tsx | 21/24/26 JSON; 22/25 PNG; 28 permission denials |
| UAT-DELIVERY-FEEDBACK | P2 Owner/operator | actual=-1 redirects to list with invalid-result but no visible error | Keep safe UUID detail route, human-readable error; src/modules/delivery/actions.ts::submitDeliveryResultAction | 23-invalid-result-fixed.png; 2 focused tests |
| UAT-QUOTE-STATE | P2 Customer finance | ACCEPTED current revision still appears DANG CHO and invites accept/change | Read canonical revision state under existing RLS, gate pending CTA; src/modules/portal/actions.ts::getCustomerPortalSnapshot; src/app/customer/page.tsx | 27 PNG; 4 focused tests |
| UAT-INVENTORY-CONTEXT | P2 Owner/operator | GET filter drops material / uncontrolled warehouse defaults stale | Previously prepared material hidden input, contextual clear link and keyed forms included; src/app/admin/inventory/page.tsx | 29-focused-ui.json; QA and Production GET checks |
| UAT-PORTAL-DATE | P3 Customer | Requested delivery date rendered raw UTC string | vi-VN display in Asia/Ho_Chi_Minh; src/app/customer/orders/page.tsx | 29-focused-ui.json; 09:00 2 thg 10, 2026 |

## Remaining confirmed defect

**UAT-CREDIT-OVERRIDE - P1 - OPEN (Owner/Sales).**

- Contract: SPEC-CRE-002, SPEC-CRE-003.
- Reproduce: open SO-2026-000035 (overdue) or SO-2026-000036 (over limit); normal confirmation correctly denies. There is no permitted per-confirmation exception with mandatory reason and captured exposure/limit.
- Expected: authorized financial decision for this one confirmation, immutable actor/reason/time/exposure/limit evidence. Normal confirmation remains blocked.
- Actual: only normal confirmation exists; no override UI/RPC seam found.
- Sources: src/app/admin/orders/[id]/page.tsx normal confirm form; src/modules/sales/actions.ts::confirmSalesOrderAction; supabase/migrations/20260930000100_credit_exposure_net_allocations.sql::private.reserve_sales_order_credit; public.confirm_sales_order(uuid,uuid).
- Minimal direction: additive override command + source-linked immutable decision snapshot, same customer lock/idempotency boundary, permission audit and adversarial DB tests. Do not increase the old credit limit, clear overdue debt, or weaken reserve_sales_order_credit globally.
- Not repaired in this batch: requires a schema/backend migration and controlled Production migration scope. No migration authorization inferred from application-only deployment. No fake PASS.

## Matrix

Reuse means evidence collected on the frozen baseline in this turn and retained only for unchanged paths/semantics. New portal UI state and error/publication paths were rerun. No entire phase/full suite rerun after each small fix.

| Case | Flow | Result | Evidence mode | Evidence |
| --- | --- | --- | --- | --- |
| RF-01 | Khóa source/build, QA project biệt lập | PASS | NEW | candidate.json; 01-qa-boundaries.json |
| RF-02 | Owner/khách/thợ đăng nhập đúng surface và branch | PASS | NEW | 01-qa-boundaries.json; UI traces |
| RF-03 | Quote hai dòng, preview/manual reason, lưu và reload | PASS | REUSED_UNCHANGED_LINES | 04-quote-db-reconciliation.json; 02-owner-quote-saved.png |
| RF-04 | Khách tài chính chấp nhận đúng revision; bấm hai lần | PASS | REUSED_UNCHANGED_COMMAND | 04-quote-db-reconciliation.json; 03-customer-quote-accepted.png |
| RF-05 | Quote đã chấp nhận -> SO hai dòng | PASS | REUSED_UNCHANGED_COMMAND | SO-2026-000035; UI/DB trace |
| RF-06 | Chặn xác nhận khi nợ quá hạn | PASS | REUSED_UNCHANGED_CREDIT | SO-2026-000035; UI denial |
| RF-07 | Chặn xác nhận vượt hạn mức | PASS | REUSED_UNCHANGED_CREDIT | SO-2026-000036; UI denial |
| RF-08 | Owner cấp ngoại lệ tín dụng cho đúng lần xác nhận | FAIL | CONFIRMED_SOURCE_AND_UI | SPEC-CRE-002/003; normal confirm + reserve_sales_order_credit; no override UI/RPC |
| RF-09 | Quick-create khách/site, giữ form và tự chọn | PASS | REUSED_UNCHANGED_FORM | HXQA-RF-1001; HXQA-RF-S1001; SO-2026-000037 |
| RF-10 | SO confirm: giữ commitment, chưa AR/stock | PASS | REUSED_UNCHANGED_COMMAND | 06-credit-investigation.json; 08-receipt-db.json |
| RF-11 | PO hai dòng confirm: chưa AP/stock | PASS | REUSED_UNCHANGED_COMMAND | PO-2026-000035; 08-receipt-db.json |
| RF-12 | Receive per-line, AP 430000, kho +5, không trùng | PASS | REUSED_UNCHANGED_COMMAND | 08-receipt-db.json; 07-owner-receipt.png |
| RF-13 | Delivery hai dòng: allocation, handoff/in-transit | PASS | REUSED_UNCHANGED_NORMAL_COMMAND | 09-handoff-db.json; DL-2026-000019 |
| RF-14 | Actual âm bị từ chối, thông báo tại đúng detail | PASS | RERUN_AFTER_FIX | 23-invalid-result-fixed.png; result-routing.test.ts |
| RF-15 | Result proposal chưa AR, chưa xác minh | PASS | REUSED_UNCHANGED_NORMAL_COMMAND | 13-result-db.json |
| RF-16 | Verify 2+3: AR 690000, cost 430000, transit 0 | PASS | REUSED_UNCHANGED_NORMAL_COMMAND | 14-verification-db.json |
| RF-17 | Thu 300000 rồi 390000: PARTIAL -> PAID, debt 0 | PASS | REUSED_UNCHANGED_PAYMENT_COMMAND | 15-ar-partial-db.json; 16-ar-paid-ap-context.json |
| RF-18 | Chi AP 430000; công nợ 0; tiền không thành revenue lần hai | PASS | REUSED_UNCHANGED_PAYMENT_COMMAND | 17-money-chain-db.json; 18-ap-paid.png |
| RF-19 | Customer Finance: đơn/timeline/công nợ/tài liệu | PASS | NEW | 19-customer-order.png; UI trace |
| RF-20 | Đổi ID sang quote/order khách khác: không có dữ liệu | PASS | NEW | 01-qa-boundaries.json; UI denied order detail (generic error, not asserted HTTP 404) |
| RF-21 | Receiver không thấy số tiền/công nợ/thanh toán | PASS | NEW | 20-receiver-order.png; /customer/debts denied text |
| RF-22 | Worker ServiceJob: actual + proof, DONE sau reload | PASS | REUSED_UNCHANGED_WORKER_SOURCE | 13-result-db.json; 10-worker-result.png |
| RF-23 | Owner publish Delivery -> đúng Worker -> DONE -> source verification | PASS | RERUN_AFTER_FIX | 21-work-publication-db.json; 24-worker-bridge-result-db.json; 26-work-verification-db.json |
| RF-24 | Worker: thu nhập của mình, direct admin route bị chặn | PASS | REUSED_UNCHANGED_BOUNDARY | 12-worker-mobile-earnings.png; UI denied admin SO |
| RF-25 | Worker không thể publish/verify qua RPC; không thêm record | PASS | NEW | 28-worker-command-denials.json (42501 x2) |
| RF-26 | Home khách hiển thị ACCEPTED, không mời accept/change lại | PASS | RERUN_AFTER_FIX | 27-customer-quote-state-fixed.png; customer-snapshot.test.ts |
| RF-27 | Ngày giao portal hiển thị giờ Việt Nam, không UTC thô | PASS | RERUN_AFTER_FIX | 29-focused-ui.json; SO-2026-000035 09:00 2 thg 10, 2026 |
| RF-28 | Inventory giữ material/warehouse/q; bỏ riêng material; remount kho | PASS | RERUN_AFTER_FIX | 29-focused-ui.json; QA UI |
| RF-29 | Production alias đúng RC, dashboard/inventory GET chỉ đọc | PASS | NEW | primary-alias.json; deployment.json; 29-focused-ui.json |
| RF-30 | Worker earnings tại 375x812: không overflow ngang | PASS | REUSED_UNCHANGED_WORKER_SOURCE | 12-worker-mobile-earnings.png; other mobile flows NOT_RUN |
| RF-31 | Worker Storage upload qua UI và READY proof | PASS | NEW | 13-result-db.json; 24-worker-bridge-result-db.json; UI READY |
| RF-32 | Trả hàng/hoàn tiền/đảo payment qua UI trong lượt này | NOT_RUN | NONE | Không phát sinh return/refund mới; không suy ra từ build/unit |
| RF-33 | Hai người cùng cập nhật một record | NOT_RUN | NONE | Chưa thực hiện RACE UI trong lượt này |
| RF-34 | Mạng lỗi/API lỗi/session hết hạn/Back toàn bộ form | NOT_RUN | NONE | Không thay bằng suy luận source |
| RF-35 | PDF/export và Storage signing end-to-end | NOT_RUN | NONE | Chỉ thấy route/link; chưa kiểm nội dung/signing đầy đủ |
| RF-36 | Các module Settings/Access/Reports/Audit toàn diện | NOT_RUN | NONE | Không phải full-system rerun; không tuyên bố đạt từ navigation |
| RF-37 | GPS thiết bị thật/messaging/invoice provider sandbox | NOT_RUN | NONE | Không cấp browser location, không gửi tin/issue invoice thật |
| RF-38 | Cloud performance đại diện p50/p95/p99 | NOT_RUN | NONE | Không lấy thời gian filechooser/build làm số đo ứng dụng; ngưỡng chỉ từ Spec.md |
| RF-39 | Managed backup/restore rehearsal | BLOCKED | NONE | Chưa có điều kiện/gói và phê duyệt recovery phù hợp |
| RF-40 | UAT thiết bị thật và Owner acceptance | NOT_RUN | OWNER_GATE | Tách riêng, không nghiệm thu thay Owner |
| RF-41 | Production Delivery–WorkItem ghi end-to-end | NOT_RUN | NONE | Production danh sách Delivery rỗng; không tạo transaction giả |
| RF-42 | Production payment-state view tương đương QA migration mới | BLOCKED | PRIOR_GATE | 20261001084145 đã ở QA, chưa áp Production; view fingerprint cần đối chiếu semantic trước migration |

## Commands / diagnostics

- vitest run src/modules/workforce/delivery-actions.test.ts src/modules/portal/customer-snapshot.test.ts src/modules/delivery/result-routing.test.ts: final 13/13 PASS, exit 0. Earlier 12/12 PASS before adding expired-SENT case; not a full regression.
- eslint on affected files: final PASS exit 0. Initial FAIL exit 1: Date.now in render; fixed by server-computed can_respond, no rule disabled.
- QA Next build --webpack: PASS exit 0, including TypeScript and 71 pages. Initial build harness FAIL exit 9: --env-file injected into NODE_OPTIONS for worker; fixed by spawning clean Node argv, not application changes.
- QA guard/read-only reconciliation scripts: final PASS except retained prior harness diagnostics described below. Worker publish/verify RPC denied with 42501, verification count unchanged.
- vercel deploy --prod --skip-domain --yes --scope hienxa: PASS exit 0, READY. vercel promote: PASS exit 0. Primary hostname inspect: MATCH current deployment.
- Harness failures retained, not application defects: async database handle missing await; nonexistent source_sales_order_id (including erroneous correlated zero count), reference, work_assignments columns/table; corrected using actual schema/UI IDs/canonical view, final evidence saved.
- RPC signature verification corrected requested_assignment_mode before UI test. Mock tests initially used the same wrong name, demonstrating why mock PASS alone was insufficient.
- Browser selector/readiness timeouts and a navigation before branch action completion were classified as automation sequencing, not asserted application errors.
- Filechooser tool took ~599s and ~578s despite requested timeout; upload and result operations completed afterward. These delays are NOT application p95/p99 measurements.

## Boundaries / remaining gates

Production payment-state migration 20261001084145 remains unapplied; a previously recorded view MD5 drift must be compared semantically before changing it. QA PAID/PARTIAL results cannot certify the current Production view. This is a blocked verification/migration gate, not a newly reproduced money defect.

Production Delivery list has no records; new business writes/Worker bridge were tested on QA only. Existing customer/worker Production credentials were not used in this turn. Full module acceptance, real-device UAT, Owner sign-off, concurrency/failure injection, cloud performance, sandbox integrations, managed recovery and printed document contents remain separately NOT_RUN/BLOCKED. No guarantee of zero defects or release-wide PASS.

## Priority for next acceptance

1. Implement and verify per-confirmation credit exception safely; preserve normal credit blocks.
2. Resolve Production payment-state view/migration gate before claiming Production financial-state equivalence.
3. Run missing high-risk returns/refunds, race and failure-path UI checks on isolated QA.
4. Complete remaining external/physical/recovery gates only when their prerequisites are available.

Evidence directory: /Users/nox/.codex/visualizations/2026/09/10/01a08a7b-2842-7c51-8860-2c44b0b9289d/hienxa-role-flows-20261001

Screenshots: 22-delivery-work-published.png; 23-invalid-result-fixed.png; 25-worker-bridge-done.png; 27-customer-quote-state-fixed.png. All synthetic QA data.
