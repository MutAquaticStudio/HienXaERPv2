# NGHIỆM THU TỔNG THỂ HIỀN XA

Ngày báo cáo: 02/10/2026. Đây là kiểm định kỹ thuật, không phải quyết định nghiệm thu thay Owner.

## 1. Kết luận

**CHƯA ĐẠT nghiệm thu toàn bộ.** Đã tái hiện một lỗi UX; hai bộ kiểm tra còn lỗi khiến một phần hồi quy không được thực thi. Các luồng tiền/kho và ranh giới quyền được kiểm tra bên dưới có kết quả tốt, nhưng chưa đủ bằng chứng để gọi toàn hệ thống PASS.

- Lỗi ứng dụng đã tái hiện: **F-03, P2**, mất dữ liệu form khi mở ReturnCase bị từ chối.
- Lỗi kiểm thử: **VT-01 và VT-02, P1 về mức độ chặn kiểm định**, không phải hai lỗi tiền/kho đã được chứng minh của ứng dụng.
- Chưa phát hiện sai tiền, sai công nợ, ghi kho trùng hoặc lộ dữ liệu trong các tình huống cụ thể đã chạy. Không suy rộng thành xác nhận không còn P0 ở mọi luồng.
- Production hiện hành: deployment READY, health trả 200, thao tác đọc Owner hoạt động. **Không nghiệm thu mọi thao tác ghi trên Production trong lượt này.**
- Release gate: **CHƯA ĐỦ BẰNG CHỨNG**. Không tự sửa source, commit, push, deploy, migration hoặc đóng R12-06.

## 2. Phiên bản và môi trường

| Thành phần | Định danh/phạm vi |
| --- | --- |
| Repository | `/Users/nox/Downloads/HienXaERP`, dự án `MutAquaticStudio/HienXaERPv2` |
| Nhánh working tree | `codex/uat-role-navigation-20260923` |
| HEAD của working tree | `79b0b918c7430bfd0e9d17e247ecba2be1fa0bf2` |
| Trạng thái Git | Dirty; nhiều file sửa/chưa track trong UI, server actions, QA scripts, migrations, tài liệu. HEAD riêng lẻ **không tái tạo được bản đang kiểm/deploy**. Không ghi đè các thay đổi này. |
| Candidate kiểm chạy | Bản sao biệt lập `/private/tmp/hx-credit-release-20261002-QoZqWS`, 317 input files |
| Fingerprint candidate | `d066659fd4255c86238f637023e8a35109ebc27c99e7816f95335dba8176f1c1` |
| Baseline tái sử dụng | `/private/tmp/hx-role-flow-release-20261001-P09l5m`; fingerprint `86ce2240419bd8f444bd98e0e18a05691232bd6d717cad8e8ee8b343b2fef05c` |
| QA web | `http://127.0.0.1:4040`, Next server từ candidate cố định; không phải cloud QA Preview |
| Supabase QA | `ffrwiglcrlumfvhubaxg`; guard đã PASS trước thao tác ghi |
| Production | `https://hien-xa-erp-v2-nu.vercel.app`, Supabase `nbwynrwkdbtfsitafsxa` |
| Deployment Production quan sát | `dpl_4TebnWLh4v8aaLD8uLU66V4dxCnv`, READY; alias khớp deployment này |
| URL deployment | `https://hien-xa-erp-v2-ewl6wo56p-hienxa.vercel.app` |
| Migration head đã đối chiếu QA/Production | `20261001182059` |
| Task state quan sát | R12 / R12 / R12-06, `IN_PROGRESS`; không tự chuyển PASS |

Fingerprint source, Git HEAD và deployment ID là ba định danh khác nhau. Alias MATCH chỉ chứng minh alias trỏ đúng deployment được inspect; không phải phép chứng minh toàn bộ source bytes Production bằng candidate. Các kết quả chạy QA không được tự gán cho toàn Production hoặc cho working tree sau này nếu source đã đổi.

Delta candidate so với baseline chỉ liên quan xác nhận SO/credit override: `src/app/admin/orders/[id]/page.tsx`, `src/components/sales/credit-override.tsx`, `src/modules/sales/credit-override-actions.ts`, test tương ứng và migration `20261001182059_sales_order_confirmation_credit_override.sql`. Bằng chứng cũ liên quan xác nhận/credit được thay bằng kiểm chuyên biệt mới; phần không bị invalidation được giữ lại, không chạy lại cả phase.

Dùng canonical `Spec.md`, `UXUI.md`, `plan.md`, `tasks.md`, `implementation.md` và `acceptance.md`. Không dùng các bản `*(1).md`, V1, Excel hoặc convention framework để thêm yêu cầu mới. Không sửa requirement. Ngưỡng performance chỉ tham chiếu **SPEC-PERF-002/003/004 trong Spec.md**, không chép budget sang báo cáo.

## 3. Lỗi và thứ tự xử lý

### VT-01: Suite purchasing không collect được test

**P1 kiểm định; đã tái hiện; chưa sửa trong lượt kiểm này.**

- Lệnh candidate: `node_modules/.bin/vitest run`, exit **1**.
- 21/22 test files PASS, 74 test đã thực thi PASS. Suite `purchasing/actions.test.ts` lỗi import; bốn case của suite này chưa được chạy.
- Chuỗi nguồn: [actions.test.ts:2](/private/tmp/hx-credit-release-20261002-QoZqWS/src/modules/purchasing/actions.test.ts:2) → [actions.ts:11](/private/tmp/hx-credit-release-20261002-QoZqWS/src/modules/purchasing/actions.ts:11) → [form-options.ts:1](/private/tmp/hx-credit-release-20261002-QoZqWS/src/modules/purchasing/form-options.ts:1), có marker `server-only` nhưng setup jsdom chưa mock seam này.
- Kỳ vọng: suite collect và chạy các case nghiệp vụ mua hàng. Thực tế: dừng trước khi chạy assertions của suite.
- Ảnh hưởng: chưa thể lấy suite làm bằng chứng hồi quy cho PO; chưa chứng minh PO runtime hỏng.
- Hướng sửa tối thiểu: mock `server-only` hoặc dependency form-options đúng ở test, không bỏ marker bảo vệ server của ứng dụng; chạy lại suite bị lỗi.
- Bằng chứng: [unit.log](/private/tmp/hx-system-verification-20261002/unit.log).

### VT-02: DB integration dùng kỳ báo cáo cố định không khớp ngày tạo fixture

**P1 kiểm định; đã tái hiện; chưa sửa trong lượt kiểm này.**

- Lệnh: `node scripts/test-r2-database.mjs`, PGlite biệt lập, exit **1**.
- [test-r2-database.mjs:623](/private/tmp/hx-credit-release-20261002-QoZqWS/scripts/test-r2-database.mjs:623) cố định kỳ tháng 09/2026; dòng 627 kỳ vọng doanh thu `2670000` nhưng nhận `0`.
- [inventory_delivery.sql:917](/Users/nox/Downloads/HienXaERP/supabase/migrations/20260912114625_inventory_delivery.sql:917) ghi revenue fact với `recorded_at` mặc định thời điểm tạo. Lượt kiểm diễn ra tháng 10; dashboard lọc theo kỳ/cutoff. Dữ liệu tạo tháng 10 không thuộc tháng 9.
- Đối chiếu độc lập cloud QA trước các thao tác ngoại lệ: cùng khách có doanh thu tháng 10 `810000`, tháng 9 `0`. Đây không phải bằng chứng dashboard tính sai doanh thu.
- Thực tế: migrations được nạp trước assertion; script dừng ở assertion này, các phần nằm phía sau không được kiểm bởi lượt chạy đó.
- Hướng sửa tối thiểu: cố định ngày fixture/clock phù hợp hoặc chọn kỳ từ ngày fixture có kiểm soát; giữ nguyên semantic dashboard. Sau sửa phải chạy phần bị chặn và phụ thuộc liên quan.
- Bằng chứng: [db-isolated.log](/private/tmp/hx-system-verification-20261002/db-isolated.log), [qa-financial-readback.json](/private/tmp/hx-system-verification-20261002/qa-financial-readback.json).

### F-03: Form mở ReturnCase mất dữ liệu sau lỗi validation

**P2 ứng dụng/UX; đã tái hiện; chưa sửa.**

- Contract: **UX-850**, “Form không mất dữ liệu sau lỗi”, [UXUI.md:1441](/Users/nox/Downloads/HienXaERP/UXUI.md:1441).
- Vai trò: Owner hoặc người có quyền xử lý ngoại lệ giao hàng.
- Bước tái hiện trên QA: mở DL-2026-000019 → chọn `CUSTOMER_RETURN` → dòng có accepted quantity 2 → nhập quantity 3 và reason → gửi mở hồ sơ.
- Kỳ vọng: báo vượt lượng nhưng giữ loại hồ sơ, dòng, số lượng, lý do cho người dùng sửa.
- Thực tế: backend từ chối đúng “Số lượng vượt phần còn lại của nguồn.”; sau redirect, case kind về `TRANSIT_REMAINDER`, quantity/reason trống. Không có ReturnCase/movement/payment mới từ lần gửi lỗi.
- Vị trí: [page.tsx:65](/Users/nox/Downloads/HienXaERP/src/app/admin/deliveries/[id]/page.tsx:65), [delivery/actions.ts:252](/Users/nox/Downloads/HienXaERP/src/modules/delivery/actions.ts:252), nhánh mở ReturnCase/redirect lỗi.
- Hướng sửa tối thiểu: trả lỗi có field state cho form, giữ draft nhập và choice; chỉ reset sau thành công. Không nới rule lượng hoặc sửa Spec để hợp thức hóa mất form.
- Bằng chứng: [AX lỗi](/private/tmp/hx-system-ui-20261002/return-over-limit.ax.txt), [ảnh lỗi](/private/tmp/hx-system-ui-20261002/return-over-limit-form-lost.png), [DB không đổi](/private/tmp/hx-system-ui-20261002/after-over-return.json).

### Điểm chặn bàn giao không phải lỗi runtime

Working tree chưa clean và chứa nhiều source/migration chưa commit. Cần checkpoint Git tái tạo được candidate và ánh xạ deployment trước khi bàn giao; lượt kiểm này **không có quyền tự commit/push**. Security advisor còn các flag cần phân loại, external/performance/recovery gates bên dưới chưa được đóng.

## 4. Bản đồ luồng và kết quả có bằng chứng

`PASS_SELECTED` dưới đây chỉ xác nhận tình huống ghi cụ thể, không xác nhận mọi assertion của một module.

| Luồng đã có trong dự án | Chuỗi UI → server/data → tác động | Kết quả thực tế/phạm vi |
| --- | --- | --- |
| Customer/Supplier/Settings | List/detail/catalog → server reads/commands → master data dùng cho Sales/PO | Mở được list, context và hub; CRUD đủ mọi entity/permission không chạy mới toàn bộ. PARTIAL. |
| Quotation | Admin/Customer revision → quotation/revision/line snapshots; PDF lấy revision và safe lines | QT-2026-000016: 2×120000 + 3×150000 = 690000; PDF đúng revision, dấu tiếng Việt và tổng. ACCEPTED không còn CTA chấp nhận lại. PARTIAL toàn vòng đời. |
| SO/credit | Draft/confirm UI → server action/RPC có quyền và override reason → SO/credit exposure; AR chỉ có khi nguồn nghĩa vụ phát sinh | Kiểm chuyên biệt credit/payment-state đã có 12 unit + 33 DB/rollback/concurrency checks; reuse trong scope. Production SO4 đọc được form mới. Không khẳng định mọi SO scenario PASS. |
| PO/nhập hàng | PO multi-line → receiving command → receipt/line/movement/AP | Reuse luồng Owner đã kiểm và đọc detail/list hiện hành. Unit purchasing bị chặn VT-01; split/direct fulfillment/exceptions chưa chạy mới đủ. PARTIAL. |
| Delivery/kho | Delivery per-line actual/accepted/billable → verification → movement/revenue/AR | DL19 hai dòng; SO37 có revenue 690000, cost nguồn 430000 trước return; readback và evidence UI cũ còn trong phạm vi. PARTIAL module. |
| ReturnCase | DL19 → `open_return_case` → OPEN; nhận về kho → RETURNED + một movement | Validation quá lượng chặn đúng nhưng có F-03. Return hợp lệ qty1, movement đúng qty/cost nguồn; không tự tạo hoàn tiền/AR credit. PASS_SELECTED. |
| AR/AP/thu chi | Khoản nghĩa vụ → payment/allocation; reversal → bảo toàn chứng từ gốc, net cash/AR/state đổi | SO37 đã thu 300000+390000; sau reversal phiếu thứ hai còn AR390000/PARTIAL. Customer AE tổng510000. PASS_SELECTED, chưa đủ mọi adjustment/refund/advance/race. |
| Dashboard/Reports | Server finance snapshots với period/cutoff/filters → KPI/drill-down/CSV | Period readback tháng 9/10 đúng; CSV lọc khách sau reversal=510000. Drill-down/history/export lớn chưa đầy đủ. PARTIAL. |
| Print/export | Auth + RLS/permission → nguồn/snapshot → PDF/CSV private | Bốn loại mẫu bắt buộc được kiểm: quotation, delivery note, receipt/payment voucher, debt reconciliation; năm PDF mẫu và CSV đúng nội dung đã chọn. PARTIAL về phân trang cực lớn/template changes. |
| Workforce/service/earnings | Assigned job → portal RPC; verification → earning events → thu nhập riêng | UI CLAIMED/VERIFIED đọc đúng, chỉ nút hợp trạng thái hiện; 209 own earnings khớp 2107035, truy vấn earnings của người khác trả rỗng dù fixture khác có tồn tại. PARTIAL toàn vòng đời. |
| Customer portal | Membership active → `customer_portal_snapshot/order` → safe quote/order/debt/docs | Finance thấy customer0; SO35 CONFIRMED/NOT_DUE/AR0; sửa ID sang SO37/customerAE bị chặn. RECEIVER không thấy debt/payment. PARTIAL. |
| Access/Audit | Authenticated AccessContext/permission → admin reads/commands → grants/audit | Shell dùng danh tính thực, controls hiện; không đổi quyền/revoke/reactivate trong lượt này. Filter audit đủ tổ hợp chưa thực thi. PARTIAL. |
| Storage | Evidence signing RPC → private object signed URL | Finance mở chứng từ của mình (signed redirect, object200); anonymous401, receiver/other-customer/worker403. Upload mới/expiry/revoke-while-open chưa thực thi lần này. PARTIAL. |
| Routing/GPS/chat | Route plan/provider seam; foreground GPS theo assignment; conversation membership | Mở route planner, Worker tracking và chat cũ; không bật GPS thực địa/gửi tin/route apply/provider real. PARTIAL/BLOCKED như ma trận. |
| Invoice/jobs/recovery | Neutral invoice/job interfaces đã có; external provider/restore cần môi trường riêng | Chỉ đọc UI; không issue hóa đơn thật, không chạy provider hoặc recovery destructive. Chưa đủ bằng chứng. |

### ReturnCase: đối chiếu tay và DB

Fixture là dữ liệu giả `HXQA-ROLE-FLOWS-20261001`, không bán/giao/chuyển tiền thực.

1. Negative quantity3 vượt accepted2: báo lỗi, số ReturnCase vẫn3, movements58, payments243.
2. Mở qty1 hợp lệ: ReturnCase `16255db2-710c-46da-a1cc-d61d72c8001c`, OPEN; **0** return movements trước nhận thực về kho.
3. Chọn warehouse QA và xác nhận nhận về kho, có thử double-click; reload thấy `exception-resolved`.
4. Readback: RETURNED/version2; đúng **một** movement qty1. Cost snapshot nguồn86000; vốn SO37 từ430000 xuống344000. Revenue690000, AR0, payments243 không tự thay đổi bởi return.
5. Không coi thao tác return là hoàn tiền. Adjustment/refund phải là nghiệp vụ riêng theo SPEC-OPS-003 và contract tài chính.

Bằng chứng: [trước return](/private/tmp/hx-system-ui-20261002/before-return.json), [OPEN](/private/tmp/hx-system-ui-20261002/return-opened.json), [8 assertions/readback](/private/tmp/hx-system-ui-20261002/return-received.json), [ảnh sau reload](/private/tmp/hx-system-ui-20261002/return-received.png).

### Reversal tiền: đối chiếu tay và DB

1. Phiếu thu `66be5c14-36b9-422f-b657-f0f8ee539b49`, REC-202610-000047, 390000; phiếu300000 trước đó vẫn giữ.
2. Qua Cashbook UI nhập lý do QA, thử double-click đảo phiếu; reload báo `payment-reversed`.
3. Có đúng một reversal `f51ff8a9-1bcc-45ef-a93a-dd1c92854cf3`; payments từ243 lên244; phiếu gốc giữ lại và REVERSED; cash pair net0.
4. SO37 outstanding: 690000−300000=390000; payment-state **PARTIAL**. SO38 còn120000, nên customerAE total510000. Cashbook net giảm đúng390000. Revenue và movements không bị đảo theo phiếu thu.
5. CSV và bảng đối chiếu PDF sau thao tác cùng ra390000+120000=510000. Đây là readback độc lập, không dùng kết quả hàm đang test làm đáp án.

Bằng chứng: [8 assertions/readback](/private/tmp/hx-system-ui-20261002/reversal.json), [ảnh reload](/private/tmp/hx-system-ui-20261002/reversal.png), [CSV](/private/tmp/hx-system-ui-20261002/receivables-customer.csv), [PDF](/private/tmp/hx-system-ui-20261002/debt-statement.pdf).

**Snapshot mới:** SO37 không còn PAID và cost430000 sau hai ngoại lệ này. Các snapshot PAID/cost430000 cũ là bằng chứng trạng thái trước thao tác, không phải trạng thái hiện tại. Không cleanup/thu hồi tài khoản giữa lượt; dữ liệu giả và lịch sử QA được giữ để tái hiện.

### 25 mục Admin đã mở

Dashboard, Quotations, Orders, Purchase Orders, Inventory, Dispatch, Routes, Deliveries, Service Jobs, Workforce, Compensation, Receivables, Payables, Cashbook, Payment Notices, Expenses, Invoices, Messages, Reports, Audit, Products, Customers, Suppliers, Settings, Access.

Các page đã quan sát hiển thị nội dung thay vì route mất/trang trống. List quy mô QA lớn hiển thị page/limit thay vì dump toàn bảng; **không suy ra mọi filter/pagination/sort race đã PASS**. Không phát hiện console error ứng dụng trên nhóm page đọc đã thu log. Route planner có một timeout chờ điều hướng của công cụ nhưng sau đó render thành công, không phân loại thành lỗi route hay phép đo performance đạt.

Bằng chứng chính: [admin-read-checks.json](/private/tmp/hx-system-ui-20261002/admin-read-checks.json) ghi 21 mục; bốn mục Cashbook/Reports/Settings/Access được kiểm riêng qua AX/ảnh. Không gọi việc mở page là hoàn tất mọi luồng thao tác của page.

## 5. Multi-role và an toàn đọc

| Vai trò | Đã thực thi | Kết quả/phần chưa bao phủ |
| --- | --- | --- |
| QA Owner | Admin read, ReturnCase, nhận return vào kho, reversal phiếu, báo cáo/PDF | Các assertions đã nêu PASS_SELECTED; không test mọi quyền/ngoại lệ. |
| Customer FINANCE_CONTACT | Login UI, quote/detail/PDF, SO35 timeline, debts/profile/messages; URL đơn ngoài khách; Admin URL | Positive đúng customer0; foreign SO37 và Admin không hiển thị dữ liệu. Chưa kiểm tiền-state PARTIAL của SO37 qua portal positive vì account này **không thuộc customerAE**. |
| Customer RECEIVER | Login UI, own order/quote; trực tiếp `/customer/debts`; signing tài liệu thanh toán; đổi target_customer_id | Không hiển thị debt/payment, signing403; customer scope RPC bị từ chối. Có quyền xem báo giá, không có quyền chấp nhận qua UI. |
| Other customer | API tải quote/receipt/debt statement của khách khác; admin export | 404/403 đúng; chưa login UI riêng trong lượt này. |
| Worker | Login UI, current/verified job, empty pool, earnings/profile/tracking/messages, Admin URL; trực tiếp earnings khác | 209 IDs và tổng khớp own employee, foreign rows0 với fixture foreign có thật; Admin không hiện dữ liệu. Chưa start/submit/upload một công việc mới trong lượt này. |
| Anonymous | Quote/receipt/evidence API, admin CSV | Quote/receipt/evidence401; CSV307 về `/login`, không trả dữ liệu. |
| Sales | Reuse SDK boundary reads trước trong lượt kiểm tổng thể | Không chạy UI đủ chuỗi Sales mới; masking toàn bộ cost surface chưa xác nhận. |

- Sáu view có advisor ERROR security-definer đã được đối chiếu definitions/predicates và 42 truy vấn SDK (6 views×7roles): 30 deny checks cho năm nhóm không được quyền đều đạt; Owner có positive data. Không chứng minh các flag đó là sáu leak P0, nhưng cũng **không đóng toàn bộ security audit** chỉ bằng các truy vấn này. 126 warning chưa được triage đầy đủ.
- 15 API checks quote/receipt/admin CSV ban đầu ghi 13/15 theo kỳ vọng harness. Hai khác biệt là anonymous redirect307 và RECEIVER xem own quotation PDF200. Sau đối chiếu: redirect login không leak; SPEC-SEC-001 cấm RECEIVER xem debt, không ghi cấm đọc quote. UI còn nói RECEIVER “chỉ được xem” quote. Không tự thêm yêu cầu cấm rồi coi thiếu là lỗi. Raw kết quả giữ nguyên, không chạy đến xanh hoặc sửa report để giấu lần lệch kỳ vọng.
- Signing chứng từ thanh toán: 5/5 outcomes đúng; thêm kiểm redirect login có location `/login`, body0.
- Debt-statement API: Owner200/PDF, bốn role không sở hữu customerAE trả404. Đây là kiểm **foreign-customer denial**, không phải xác nhận các role đó tải được statement của khách mình.
- Không in password, JWT, cookies, signed URL token hoặc connection string trong artifact/báo cáo.

Bằng chứng: [view boundaries](/private/tmp/hx-system-verification-20261002/qa-view-boundaries.json), [API raw](/private/tmp/hx-system-ui-20261002/portal-document-boundaries.json), [signing/redirect](/private/tmp/hx-system-ui-20261002/signing-and-auth-redirect.json), [worker income/customer scope](/private/tmp/hx-system-ui-20261002/worker-income-and-customer-scope.json), [statement boundaries](/private/tmp/hx-system-ui-20261002/debt-statement-boundaries.json).

## 6. Ma trận acceptance và phần còn thiếu

Mỗi dòng nói về **toàn ca canonical**, không nâng từ PASS của vài bước thành PASS toàn ca. `PARTIAL` nghĩa đã có phần bằng chứng nhưng còn assertions thiếu; không phải lỗi ứng dụng đã xác nhận. Các case cần dữ liệu fixture/điều kiện khác chưa có vẫn giữ NOT_RUN/BLOCKED.

| Ca | Trạng thái tổng ca | Bằng chứng áp dụng/phần thiếu |
| --- | --- | --- |
| ACC-CASE-001 | NOT_RUN đầy đủ | Không chạy mới toàn bộ assertions của ca; không tự ghi DOC/global PASS. |
| ACC-CASE-002 | NOT_RUN đầy đủ | Không chạy mới toàn bộ assertions của ca; các kiểm UI/global riêng chỉ có scope bên trên. |
| ACC-CASE-003 | PARTIAL | Login/logout Owner/Finance/Receiver/Worker; chưa revoke-session/shared-device/MFA/provider đủ. |
| ACC-CASE-004 | PARTIAL | RLS views, ID tamper, PDF/CSV/signing allow/deny; chưa toàn bộ file/cache/session expiry/revoke matrix. |
| ACC-CASE-005 | PARTIAL | Bằng chứng unit/DB trước phần script dừng; chưa UI đầy đủ quy đổi snapshot 50kg/40kg và các UOM áp dụng. |
| ACC-CASE-006 | PARTIAL | 12 unit +33 DB chuyên biệt credit/override; chưa mọi credit scenario của ca và role UI. |
| ACC-CASE-007 | PARTIAL | Own accepted quote, revision PDF/tổng/UTF-8 đạt; chưa mới toàn vòng SENT/expiry/request revision/cancel với các role. |
| ACC-CASE-008 | PARTIAL | SO detail/state, baseline multi-line và credit checks; chưa đủ UI thiếu/sai/double-save/back/reload/quick-create theo mọi assertion. |
| ACC-CASE-009 | PARTIAL | PO đọc và baseline receiving; purchasing unit không chạy được VT-01; chưa full direct/split flow. |
| ACC-CASE-010 | PARTIAL | Receipt/stock/AP baseline và vouchers; invoice/AP atomic race/full missing-response chưa đủ. |
| ACC-CASE-011 | PARTIAL | Return kho qty1 có movement/cost đúng; chưa đúng toàn bộ fixture partial20/19 của canonical case trong lượt này. |
| ACC-CASE-012 | NOT_RUN mới đầy đủ | Chưa chạy ca direct supplier/customer 19.5/19m³ qua UI đủ đầu-cuối. |
| ACC-CASE-013 | PARTIAL, có F-03 | Return open/received + quá lượng đã chạy; cancel/failed/loss/transit remainder và refund/adjustment riêng chưa đủ. |
| ACC-CASE-014 | PARTIAL | Inventory UI/readback; stock-count cutoff/reservation race/low-stock→draft PO chưa chạy toàn bộ. |
| ACC-CASE-015 | PARTIAL | Reversal390000 net cash/AR/state/PDF/CSV đúng; advance/many allocations/two-session/missing-response chưa đủ. |
| ACC-CASE-016 | PARTIAL | Dashboard kỳ tháng9/10 + filtered CSV đúng; toàn bộ quality/cutoff/backdated/context scenarios chưa đủ. |
| ACC-CASE-017 | PARTIAL | Admin dashboard/AR/AP mở được; filter preservation/back-navigation mọi drill-down chưa đủ. |
| ACC-CASE-018 | PARTIAL | Service/workforce UI và baseline; full3quantities/rate snapshot/adjustments chưa chạy mới đủ. |
| ACC-CASE-019 | PARTIAL | Assigned CLAIMED/VERIFIED và empty pool đọc đúng; new two-claim race/resources/offline stale chưa chạy. |
| ACC-CASE-020 | PARTIAL | Own209 earnings/2107035 đúng, foreign read deny; earning calculation/approval/commission/cost-once mọi source chưa đủ. |
| ACC-CASE-021 | PARTIAL | Worker responsive390×844 không tràn ngang; chưa upload mới/network-fail/retry/real-device UAT. |
| ACC-CASE-022 | PARTIAL | Customer own detail/docs/debt, receiver restrictions, foreign deny; notices create/review và positive paid/partial portal journey chưa chạy mới đủ. |
| ACC-CASE-023 | BLOCKED provider, PARTIAL UI | Planner đọc được; live route-provider sandbox/apply-stale chưa chạy đủ. |
| ACC-CASE-024 | NOT_RUN thực địa | Foreground controls hiển thị; không cấp GPS/location hay mô phỏng thành actual-device PASS. |
| ACC-CASE-025 | PARTIAL | In-app conversation lịch sử đọc được; không gửi tin thật; reconnect/audience/revoke-session chưa đủ. |
| ACC-CASE-026 | NOT_RUN mới đầy đủ | Không chạy crash/lease expiry/two-runner/reconcile mọi job state. |
| ACC-CASE-027 | BLOCKED | Invoice provider sandbox và legal correction/issue/reconcile chưa khả dụng/được chạy ở scope này. |
| ACC-CASE-028 | NOT_RUN cloud đại diện | Local app+QA cloud DB không phải cloud Preview; không gọi latency cục bộ là p95/p99 cloud PASS. |
| ACC-CASE-029 | BLOCKED managed recovery; PARTIAL schema | Migrations PGlite nạp được, QA head đúng; managed backup/restore và đầy đủ rehearsal/reconciliation chưa chạy. |
| ACC-CASE-030 | BLOCKED/CHƯA ĐỦ BẰNG CHỨNG | Suite còn đỏ, F-03, gate thiếu, dirty checkpoint; chưa nghiệm thu release thay Owner. |

UI đã thử desktop và một responsive Worker viewport. Chưa thử mọi màn hình mobile, keyboard/a11y đầy đủ, thiết bị thật, session hết hạn giữa lưu, API mất mạng, cancel/back mọi form, hoặc hai người cập nhật mọi bản ghi. Không thay những tình huống này bằng đọc source hay build success.

## 7. Lệnh/checks và phân loại lỗi

| Check/lệnh | Nơi chạy | Exit/kết quả | Bằng chứng/giới hạn |
| --- | --- | --- | --- |
| `node_modules/.bin/vitest run` | Candidate | 1, FAIL suite | 74 executed PASS; VT-01 chặn suite purchasing. Giữ kết quả đỏ. |
| `node scripts/test-r2-database.mjs` | Candidate, PGlite | 1, FAIL assertion | VT-02; không chạy migrations lên QA/Production; phần sau điểm lỗi chưa chạy. |
| ESLint của candidate | Candidate | 0, PASS | [lint.log](/private/tmp/hx-system-verification-20261002/lint.log); tái dùng, không chạy lại sau các thao tác dữ liệu vì source không sửa. Không tái dựng args chưa được lưu trong báo cáo. |
| `node --test scripts/qa/*.test.mjs` | Candidate | 1, file harness không có trong export | Không coi lỗi thiếu test file là ứng dụng lỗi. |
| `node --test scripts/qa/*.test.mjs` | Main working tree, tooling riêng | 0, 4/4 PASS | [log](/private/tmp/hx-system-verification-20261002/qa-harness-current-worktree.log); không thay kết quả runtime candidate. |
| `node_modules/.bin/tsc --noEmit --incremental false --project <candidate>/tsconfig.json` | Candidate | 0, NEW PASS | [typecheck.log](/private/tmp/hx-system-ui-20261002/typecheck.log), stdout rỗng và exit0 đã thu qua command. |
| QA guard | QA env | PASS | Đã xác minh targetQA trước thao tác giả; không cleanup/reset QA. |
| SDK/RPC/API reads | QA project/candidate server | Outcomes được ghi JSON | 42 view reads; 15 API initial classification; signing5 +redirect1; statement5; income4assertions +scope-deny. Không gọi tổng các request này là một full suite PASS. |
| UI return/reversal | QA | 8+8 DB assertions PASS_SELECTED | JSON/ảnh kể trên; thử double-click có đúng một hậu quả lưu. Không có network trace đủ để khẳng định hai POST đồng thời đã đến server. |
| `build`/E2E đầy đủ/cloud perf | Không chạy mới đầy đủ trong lượt này | NOT_RUN mới | Local server dùng build candidate có sẵn; Production READY là bằng chứng deploy đã build, không phải full E2E. Không rebuild đang phục vụ để làm gián đoạn lượt UI. |

Lỗi công cụ kiểm định được tách khỏi lỗi ứng dụng: helper đầu tiên thiếu `dotenv` (MODULE_NOT_FOUND), sau đó dùng loader Node sẵn có, không cài dependency; query lần đầu dùng `earning_events.amount_vnd` thay vì cột calculated/approved nên 42703, sau đối chiếu schema query đúng; các query readback ban đầu dùng sai cột base/nhầm fixture tổng cũng đã phân loại trong evidence cũ. Download-event CSV bị timeout nhưng UI báo đã tải, API trả CSV505bytes đúng; file CSV tải qua API không chứng minh browser download-to-disk đã được capture. Không che các lần lỗi này bằng rerun đến xanh.

Các PDF đã xem nội dung bằng parser và ảnh render: quotation690000, Delivery Note2+3units, receipt300000, payment voucher430000, reconciliation510000. Dấu tiếng Việt, nguồn/revision/trace, layout mẫu một trang hợp lệ; phiếu giao/thu/chi/đối chiếu không bị gọi là hóa đơn thuế. Không test PDF cực nhiều trang hoặc template mutation.

## 8. Production và production safety

[production-current.json](/private/tmp/hx-system-verification-20261002/production-current.json) ghi inspect deployment/health. Owner đọc SO4 được credit override form, DRAFT/NOT_DUE và total570000. Đây không phải bộ luồng ghi Production.

Không tạo khách/giao hàng/phiếu tiền/hóa đơn thực trên Production; không đổi grant/config, migration, DNS, payment provider, gửi tin khách hoặc deploy trong lượt này. Hai thao tác nghiệp vụ bổ sung đều trên dữ liệu giả QA: nhận return qty1 và đảo receipt390000. Chúng được giữ lại trong lịch sử để tái hiện; không reset fixtures/thu hồi tài khoản. QA browser đã đăng xuất khi kết thúc, viewport override đã reset; giữ tab QA login để tiếp tục nếu được giao việc.

Deep security scan không được khởi động lại. Đây là kiểm quyền và luồng có phạm vi, không phải chứng nhận an ninh toàn hệ thống.

## 9. Điều kiện nghiệm thu lại tối thiểu

1. Sửa VT-01/VT-02, giữ nguyên contract; chạy lại phần suite đang bị chặn và phần downstream chưa được thực thi.
2. Sửa F-03; chạy lại ca quá lượng và một ca hợp lệ, xác nhận form giữ dữ liệu và không ghi sổ trùng. Không cần full-system rerun chỉ vì sửa form này nếu scope vẫn nhỏ.
3. Hoàn thiện ma trận các exception/multi-role/two-session/retry quan trọng còn thiếu. Muốn positive customer money-state cho SO37 cần fixture membership QA đúng customerAE; không dùng foreign deny thay positive flow hoặc tự mở rộng quyền trong lượt kiểm.
4. Có candidate Git checkpoint tái tạo được, mapping artifact/deployment rõ; triage advisor chưa phân loại, kiểm các boundary bị thay đổi nếu có sửa RLS/schema.
5. Cloud Preview performance đại diện, provider sandbox, job failure/reconcile và recovery theo môi trường khả dụng; ghi BLOCKED/NOT_RUN nếu chưa có, không tự đổi PASS. UAT thiết bị thật/quyết định Owner ghi riêng theo chỉ thị của Owner.

Bằng chứng cũ chỉ reuse khi source/contract/schema/permission/fixture liên quan còn hợp lệ. Nếu có sửa, chỉ rerun vùng bị invalidation; không thêm lớp smoke test hoặc chạy full regression sau mỗi thay đổi nhỏ.

## 10. Evidence index

- [Báo cáo role-flow baseline](/Users/nox/Downloads/HienXaERP/NGHIEM_THU_ROLE_FLOWS_20261001.md): REUSED đúng scope không bị credit/fixture mutation invalidation.
- [Báo cáo credit/payment chuyên biệt](/Users/nox/Downloads/HienXaERP/NGHIEM_THU_CREDIT_PAYMENT_20261002.md): checks theo delta credit/payment, không đại diện full-system PASS.
- [Kết quả command vòng đầu](/private/tmp/hx-system-verification-20261002/check-results.json), [metadata QA](/private/tmp/hx-system-verification-20261002/qa-read-metadata.json).
- [PDF/CSV API metadata](/private/tmp/hx-system-ui-20261002/print-export-api.json), [quote PDF](/private/tmp/hx-system-ui-20261002/quotation.pdf), [debt PDF render](/private/tmp/hx-system-ui-20261002/debt-statement-page1.png).
- [Worker mobile screenshot](/private/tmp/hx-system-ui-20261002/worker-mobile.png), [Worker own earnings AX](/private/tmp/hx-system-ui-20261002/worker-earnings.ax.txt).
- [Customer own order AX](/private/tmp/hx-system-ui-20261002/customer-own-order.ax.txt), [foreign order deny AX](/private/tmp/hx-system-ui-20261002/customer-foreign-order.ax.txt), [Receiver debts AX](/private/tmp/hx-system-ui-20261002/receiver-debts.ax.txt).

Artifact ở `/private/tmp` là evidence kiểm định cục bộ, không phải release artifact bền vững trên GitHub. Không dùng file report hoặc commit message làm bằng chứng thay cho các kết quả/giới hạn đã ghi.

## P1/P2 repair follow-up - 2026-10-02

Scoped result: PASS for VT-01, VT-02 and F-03 on the candidate below. This does not replace the preceding whole-system acceptance conclusion or close untested external/human gates.

### Candidate and environment

- Candidate: `/private/tmp/hx-p1p2-release-20261002-gEY07M`.
- Source/build input SHA-256: `18220dd63f9a88b94ecb4f7b86d302d874e940cf22ac9d14baab13b31e04746f`, 317 inputs. Manifest: `/private/tmp/hx-p1p2-checks-20261002/source-fingerprint.json`.
- Runtime: `http://127.0.0.1:4041`, optimized webpack build, Supabase QA `ffrwiglcrlumfvhubaxg`, QA Owner, HXQA Branch A.
- Branch/HEAD previously recorded by the audit: `codex/uat-role-navigation-20260923`, `79b0b918c7430bfd0e9d17e247ecba2be1fa0bf2`. No git command, commit, push or deployment in this repair run. The candidate fingerprint, not that commit alone, identifies the patched source.
- Production: NOT_TOUCHED. No schema/migration/RLS change, real transaction, notification or production configuration change.

### Defect disposition

| ID | Result | Evidence / minimal repair |
| --- | --- | --- |
| VT-01 / P1 | PASS on current source | Purchasing already has its form-options/server-only boundary mock. Baseline and final `actions.test.ts` both pass 4/4. No new edit to that file; old frozen-candidate failure is historical, not proof of a current failure. |
| VT-02 / P1 | FIXED + PASS | The isolated dashboard assertions use a period containing both fixed business fixture dates and database-generated recorded timestamps. Monetary expectations remain unchanged. A separate period before the recorded facts must return zero revenue. R2-R9 isolated DB checks pass. |
| F-03 / P2 | FIXED + PASS | ReturnCase validation returns safe inline state, preserves draft and operation intent on error, and keeps permission checks on the server. Explicit submit inside a React transition avoids automatic form reset. Only successful creation clears the completed draft and generates a new intent. |
| Positive-zero validator / P2 | FIXED + PASS | Positive quantities now require `Decimal.gt(0)`; `isPositive()` previously accepted positive zero. The separate nonnegative validator for failed-delivery actual quantities is unchanged. Quantity zero is rejected in both the server-action test and real QA UI. |

### Changed application/test paths

- `scripts/test-r2-database.mjs`
- `src/modules/delivery/actions.ts`
- `src/app/admin/deliveries/[id]/page.tsx`
- `src/components/delivery/open-return-case-form.tsx`
- `src/modules/delivery/return-case-actions.test.ts`
- `src/components/delivery/open-return-case-form.test.tsx`

### Checks and evidence

| Check | Command / method | Final result | Evidence |
| --- | --- | --- | --- |
| QA isolation | `node --env-file=.env.qa.local scripts/qa/guard.mjs` | PASS, exit 0 | QA ref checked again before build/runtime/API access. |
| UNIT affected | `node_modules/.bin/vitest run src/components/delivery/open-return-case-form.test.tsx src/modules/delivery/return-case-actions.test.ts src/modules/delivery/result-routing.test.ts src/modules/purchasing/actions.test.ts` | PASS 16/16, 4 files, exit 0 | `focused-final.log` |
| UNIT unaffected | Reuse 72 passing cases from the preceding 24-file/88-case run | REUSED | `unit-after-correction.log`; only the form and its own assertions changed subsequently. The old form failure is superseded by the final affected run, not deleted. No claim that the last single full-suite invocation was green. |
| LINT affected | `node_modules/.bin/eslint` on the six changed paths above | PASS, exit 0 | `lint-final.log`, `final-exits.txt` |
| TYPE | `node_modules/.bin/tsc --noEmit --incremental false` | PASS, exit 0 | `typecheck-final.log`, `final-exits.txt` |
| DB | Isolated runner `scripts/test-r2-database.mjs`, R2-R9 | PASS, exit 0; REUSED after UI-only correction | `db-isolated.log`, `db-exit.txt`; runner/migration inputs unchanged after this run. |
| BUILD | QA environment loaded with `process.loadEnvFile`; `next build --webpack` in the isolated candidate | PASS, exit 0 | `build-webpack.log`, `build-webpack-exit.txt` |
| UI | Desktop browser, actual server action and QA database | PASS: over-limit error, zero rejection, preserved second-line draft, corrected save, reload persistence | Screenshots listed below. |
| DB persistence | Authenticated read-only query of QA `return_cases` | PASS, exit 0 | `qa-persistence-schema-corrected.log`, `qa-persistence.json` |

All artifact names above are under `/private/tmp/hx-p1p2-checks-20261002/`.

### Actual UI flow

- Fixture delivery `DL-2026-000019`, id `2bdfbe30-d09c-4f0e-b66a-3e820ddf4c55`, has accepted quantities 2 and 3. On line 2, requesting 4 must exceed the source; requesting 0 must fail positive validation.
- Selected line 2 + `CUSTOMER_RETURN` + quantity 4 + synthetic reason: safe inline over-limit error, same route, all draft fields retained. Zero also rejected without resetting the other fields.
- Corrected quantity to 0.25 and submitted: success, selected line retained, kind/quantity/reason reset only after success; ReturnCase appears via server revalidation.
- Reloaded page: exactly one matching case remains visible. Read-only QA query confirms id `a37c1125-8d78-4103-8b19-0ac964e15a40`, `state=OPEN`, `case_kind=CUSTOMER_RETURN`, `base_quantity=0.25`, verification line `3b2ec451-1ee2-46be-83c2-6e486ae374f1`, no resolution warehouse or resolved timestamp.
- Did NOT click receipt/resolution, cash or stock commands. This run did not remeasure global money/stock totals; existing DB invariant evidence is reused, not presented as a new cloud financial measurement.
- Screenshots: `ui-error-desktop.png`, `ui-success-before-reload.png`, `ui-saved-after-reload.png`; earlier negative-path capture `ui-error-keeps-draft.png` retained.

### Failed attempts retained / limits

- First unit run: 86/88 passed; form selection reset and zero acceptance failed. Next run: 87/88 passed; selection reset remained. Both logs retained; owner authorized subsequent corrections. Final affected run passes 16/16.
- First build failed because `--env-file` propagated into worker `NODE_OPTIONS`. The corrected environment loader then exposed Turbopack's out-of-root node_modules symlink limitation in this isolated copy. Supported webpack build passed without changing project configuration. Default Turbopack build is NOT_VERIFIED for this copy; these failures are not silently reclassified as passes.
- Initial local server start was denied by the sandbox; an authorized local-only start succeeded. No other QA server was stopped.
- A temporary tab disappeared during viewport work; the error-to-corrected-save flow was restarted in a fresh tab. Final desktop view was 1280x720. Mobile/device UAT is NOT_RUN in this scoped repair.
- Initial ad-hoc persistence assertion used wrong column names (`status/requested_base_quantity` versus schema `state/base_quantity`). Its failed log remains. The corrected read-only query uses the actual schema and unchanged business expectations.
- Browser tooling redacts operation-id values. Direct cross-call equality/rotation observations were inconclusive and are NOT used as UI proof. Intent retention/rotation are covered by the passing component/action unit assertions.
- Permission denial, auth redirect propagation, transport errors, same-intent retry and pending-control disabling pass in affected unit tests. Real-device UAT, external sandbox, representative cloud performance, managed recovery and Production verification were not rerun or newly certified.
- Manual React action dispatch follows [React useActionState documentation](https://react.dev/reference/react/useActionState). No business contract/public RPC/schema change.

## Authorized Production deployment of P1/P2 repair - 2026-10-02

- Owner explicitly requested Production deployment after the preceding scoped checks completed.
- Used Vercel CLI account `thunderekt-6020`, scope `hienxa`, existing project `prj_o6ya9YI1b3fTFC8nxiOtjHiwaS3W`. No connector account used.
- Uploaded the frozen source candidate `/private/tmp/hx-p1p2-release-20261002-gEY07M`, not its QA `.next` bundle. Local credentials, QA artifacts and internal documents remain excluded by the existing `.vercelignore`.
- Command: cached Vercel CLI `deploy --prod --yes --scope hienxa --meta sourceFingerprint=18220dd63f9a88b94ecb4f7b86d302d874e940cf22ac9d14baab13b31e04746f --meta validationBatch=P1P2-20261002`; exit 0. Cloud build completed successfully.
- Deployment: `dpl_HtohpbSF91faoJ5jkW5zxJkiNKGh`, target `production`, state `READY`. Remote metadata matches the tested source fingerprint.
- Live alias: [Production](https://hien-xa-erp-v2-nu.vercel.app). Immutable URL: [P1/P2 deployment](https://hien-xa-erp-v2-o8a30fxqo-hienxa.vercel.app).
- Previous Production deployment retained for reference: `dpl_4TebnWLh4v8aaLD8uLU66V4dxCnv`.
- Production configuration was read-only verified to use Supabase `nbwynrwkdbtfsitafsxa`, not QA. The initial environment-list API returned encrypted values despite its deprecated decrypt parameter; the official single-variable read endpoint confirmed the public URL. No environment variable was changed.
- Post-release read-only checks: `/login` HTTP 200 (`text/html; charset=utf-8`), `/api/health` HTTP 200 with `{"status":"ok","service":"hien-xa-erp-v2"}`. These establish reachability/liveness, not DB or whole-system business acceptance.
- Evidence: `/private/tmp/hx-p1p2-checks-20261002/deploy-preflight.json`, `production-deploy.stdout.log`, `production-deploy.stderr.log`, `production-deploy-exit.txt`, `production-release-result.json`.
- Production application code is now updated under this explicit authorization. No migration, Production DML/grant/config mutation, fake transaction, real invoice or message was performed. No GitHub commit, push, PR or merge was requested/performed in this deployment run.
- Whole-system acceptance status and untested external/human/device gates remain separate. Scoped repair PASS and deployment READY do not constitute a full-system PASS.
