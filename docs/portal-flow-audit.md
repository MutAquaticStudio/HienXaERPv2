# A0 — Audit luồng lõi cho Portals Add-on

**Ngày audit:** 2026-09-04  
**Baseline được kiểm:** `7c25272399acc0cdafc0c9c624d8333b373c2a16` (P1–P12)  
**Phạm vi:** mã nguồn, migrations và test contracts hiện có. A0 không tạo portal, không thay đổi schema, không ghi dữ liệu Supabase và không thay đổi luồng nghiệp vụ P1–P12.

## Kết luận checkpoint

- Không phát hiện mâu thuẫn C3, C4 hoặc C5 trong lớp contract tĩnh hiện có.
- Không tồn tại một portal/customer-facing surface cũ để phải di trú hoặc gỡ bỏ.
- Các thực thể portal được đặc tả (`CustomerPortalMembership`, `PortalIssue`, `PaymentNotice`, `RoutePlan`, `CurrentVehicleLocation`, `VehicleLocationPing`, `Conversation`, `Message`) chưa tồn tại. Đây là thiếu năng lực có chủ đích cho các phase WP1/CP1/RO1/GPS1/CHAT1, không phải duplicate domain.
- Các điểm C1/C2 bên dưới là điều kiện bắt buộc khi xây từng phase; chúng không cho phép tạo shortcut qua RLS hoặc gọi private database function từ browser.

**Trạng thái A0:** `PHASE_COMPLETE` sau khi toàn bộ kiểm thử checkpoint được ghi ở cuối tài liệu này.  
**Pha kế tiếp:** `LOCKED` — chỉ bắt đầu khi có yêu cầu rõ tên phase (WP1, CP1, RO1, GPS1 hoặc CHAT1).

## 1. Inventory luồng và ownership hiện hữu

| Luồng / aggregate | Chủ sở hữu hiện tại | Transaction boundary / bất biến đang bảo vệ | Bề mặt phù hợp cho addon | Trạng thái |
| --- | --- | --- | --- | --- |
| Khách hàng, site, bảng giá, snapshot giá | P3 Customer 360 | Giá dùng ở giao dịch lấy từ snapshot, không đọc lại giá động | CP1 chỉ được đọc projection an toàn của chính customer/site đã được membership cho phép | Sẵn sàng làm nguồn |
| Báo giá, revision, đơn bán | P4 Commercial | Revision/báo giá được khóa; xác nhận đơn bán không tạo AR | CP1 gửi proposal/accept qua server command được ủy quyền, không cho khách viết `sales_orders` | Sẵn sàng làm nguồn |
| Mua hàng, phân bổ nguồn, giao thẳng | P5 Sourcing | `SUPPLIER_DIRECT` giữ đường đi vật tư riêng, không giả warehouse movement | CP1 chỉ thấy trạng thái fulfillment được lọc, không có thao tác sourcing | Sẵn sàng làm nguồn |
| Tồn kho, reservation, receipt/issue | P6 Inventory | Reserve kiểm tra available trong transaction; ledger không sửa lịch sử | Không expose cho customer; worker chỉ nhận work/delivery đã được cấp | Sẵn sàng làm nguồn |
| Điều phối, proof, actual, confirm delivery | P7 Delivery | Lệnh private; proof/actual trước confirm; GPS không được thay thế trạng thái giao hàng | WP1/RO1/GPS1 dùng delivery làm source of truth; CP1 đọc projection của đơn mình | Sẵn sàng làm nguồn |
| AR/AP, payment, cash, reconciliation | P8 Finance | AR chỉ được nhận diện ở financial boundary; post/reverse payment là command có kiểm soát | CP1 dùng customer-safe balance/notice projection; không đọc finance ledger trực tiếp | Sẵn sàng làm nguồn |
| Profitability | P9 Internal profitability | Direct cost và lifecycle là evidence/command nội bộ | Không có dữ liệu margin trong portal | Cấm expose |
| Work pool, claim, assignment, verification | P10 Workforce | Lock work item + advisory lock worker + idempotency; DONE khác VERIFIED | WP1 kế thừa `work_items`/assignment; không tạo work workflow song song | Sẵn sàng làm nguồn |
| Service job, field log, customer confirmation | P11 Service Jobs | Field log append-only; confirmation → billing → receivable cùng transaction | WP1 kế thừa assigned service job; CP1 sau này chỉ nhận projection/command an toàn | Sẵn sàng làm nguồn |
| Earning, payroll, cash linkage | P12 Compensation | VERIFIED mới tạo entitlement; entitlement/paid cash là hai giá trị khác nhau | `/work/earnings` là worker surface duy nhất; CP1/GPS/CHAT không có quyền đọc | Sẵn sàng làm nguồn |

## 2. Ma trận dependency cho các portal phase

| Khả năng addon | Nguồn bắt buộc | Hiện trạng | Quy tắc triển khai bắt buộc |
| --- | --- | --- | --- |
| Worker workspace (WP1) | P7, P10, P11, P12, P1 Evidence | Có read-model/command và RLS worker/assignment; chưa có UX upload tệp dùng chung | Reuse aggregate và Server Action hiện hữu; upload evidence phải giữ owner/assignment authorization, không tạo ledger công việc mới |
| Customer portal (CP1) | P3, P4, P7, P8, P11, P1 | Chưa có `CUSTOMER` role hoặc membership mapping | Tạo membership server-owned, projection tối thiểu, scopes theo customer/site; mọi acceptance/issue là server command |
| Route board (RO1) | P2 vehicle, P7 delivery/assignment | Vehicle/delivery/assignment đã có; chưa có RoutePlan | Route plan là planning layer, không được đổi delivery state thay P7 |
| GPS tracking (GPS1) | P2, P7, RO1 | Chưa có location/ping model | GPS là telemetry; không xác nhận giao hay tạo actual/proof |
| Realtime chat (CHAT1) | P1 principal/audit/evidence, P7/P10/P11 | Chưa có conversation/message domain | Chat không là business command; mỗi mutation phải có command riêng và audit riêng |

## 3. Audit duplicate-domain

Tìm kiếm toàn repository theo các tên và biến thể `customer portal`, `portal order`, `customer balance`, `worker delivery`, `worker job`, `payment notice`, `route plan`, `vehicle location`, `location ping`, `conversation`, `chat message` không cho thấy implementation portal trùng lặp. Những kết quả về `message` hiện tại là lỗi/notification kỹ thuật, không phải domain chat.

| Khái niệm cần tránh duplicate | Canonical owner hiện có | Quyết định A0 |
| --- | --- | --- |
| Customer, site, price | P3 | CP1 phải reference P3; không có bảng customer portal copy |
| Quote, order, fulfillment | P4/P5 | CP1 chỉ projection + proposal; không có `portal_orders` là nguồn sự thật |
| Delivery, proof, actual | P7 | WP1/RO1/GPS1 reference delivery ID; không tạo delivery state machine thứ hai |
| Work và trạng thái thực thi | P10, P11 | WP1 render work/service assignment hiện hữu; không có job/task aggregate song song |
| Cash, AR/AP, payment | P8 | CP1 không tạo payment ledger hoặc customer balance mutable |
| Earnings/payroll | P12 | Worker chỉ đọc `earning.read_self`; addon không tính lại lương |

## 4. Audit transaction và boundary nghiệp vụ

| Boundary | Chứng cứ hiện hữu | Kết luận |
| --- | --- | --- |
| Quote → Sales Order | P4 `app_private` commands khóa transaction; contract kiểm thử revision, immutability, và xác nhận SO | Không mở direct write cho customer. Confirmed SO vẫn khác finance recognition. |
| Sales Order → sourcing/inventory | P5 allocation phân biệt stock và `SUPPLIER_DIRECT`; P6 reservation/ledger riêng | Giao thẳng không tạo warehouse movement giả. |
| Delivery → Finance | P7 `confirm_delivery` là private command; P8 `recognize_delivery_finance` nhận diện đúng financial boundary | GPS/route/chat chỉ được bổ sung tín hiệu, không được bypass proof/actual/confirm. |
| Work claim và execution | P10 `claim_work_item` khóa row và advisory lock theo worker; event/verification tách lịch sử | Một worker không tăng capacity bằng hai thao tác song song; work completion không thay P7 delivery. |
| Service → billing | P11 confirmation, billing event, receivable và ledger được tạo atomically | Customer portal không được tự tạo AR hoặc set job `BILLED`. |
| Verified work → earnings → paid cash | P12 đòi `VERIFIED` + verification record; payroll payment link chỉ nối P8 disbursement đã post | Work done không đồng nghĩa earning approved; earning approved không đồng nghĩa đã trả tiền. |

## 5. Audit data exposure và RLS

| Persona / dữ liệu | Kiểm soát đang có | Đánh giá portal |
| --- | --- | --- |
| Worker — delivery | P7 select policy giới hạn delivery được assignment cho driver; mutation qua private function/server command | WP1 có thể kế thừa, nhưng không được mở đọc delivery toàn công ty. |
| Worker — work/service | P10 giới hạn own assignment/eligible pool; P11 giới hạn service job được gán | WP1 dùng read-model hiện hữu và enforce lại actor ở server action. |
| Worker — earnings | P12 có permission `earning.read_self` và ràng buộc theo `auth.uid()` | Giữ nguyên self-only; không đưa finance/margin vào worker portal. |
| Office — finance/margin | P8/P9 đòi permission riêng và RLS-backed read model | Không expose trong CP1, GPS1 hoặc chat. |
| Customer | Chưa có user-to-customer membership, customer role hoặc projection public | Không có bề mặt customer hiện tại nên chưa có leak trực tiếp; CP1 **bắt buộc** tạo membership server-owned + scoped views/commands trước khi route được mở. |
| Evidence/object storage | P1 có bucket `evidence` và policy owner/auditor | Có lớp storage core; WP1 vẫn phải bổ sung UX/contract upload gắn với assignment, validation MIME/size và audit. |

## 6. Event và cache/invalidation

Hiện tại Server Actions invalidates những route nội bộ liên quan bằng `revalidatePath`; P7 còn có `delivery_readiness_events` là outbox hẹp để P10 tạo/đóng work requirement. Không có global portal event bus và cũng không có Realtime/chat schema.

Điều này là **C1 (thiếu capability có chủ đích)**, không phải lỗi của P1–P12. Mỗi phase addon phải ghi rõ một ma trận `authorized command → source aggregate → audit event → projection/cache invalidation → subscriber` và phải chứng minh retry không nhân đôi notification/message/location effect. Không phase nào được dùng cache invalidation như một business transition.

## 7. Findings và gate

| ID | Phân loại | Finding | Chủ phase xử lý | Gate |
| --- | --- | --- | --- | --- |
| A0-01 | C1 | Chưa có event/invalidation contract dùng chung cho các projection portal | Từng phase có projection | Mỗi phase nêu trigger và idempotency trước khi code UI |
| A0-02 | C2 | Chưa có customer membership, role hoặc safe projection | CP1 | Không mở `/customer` hay grant select cho customer trước khi membership/RLS test xanh |
| A0-03 | C2 | Core evidence storage có, nhưng chưa có luồng upload evidence tập trung trong worker portal | WP1 | Verify authorization theo assignment, MIME/size, rollback/error retention và audit |
| A0-04 | C2 | Chưa có RoutePlan/GPS/chat tables | RO1/GPS1/CHAT1 | Tạo từng aggregate tối thiểu trong migration phase tương ứng, với RLS/grants explicit |
| A0-05 | C0 | Không thấy C3/C4/C5 trong static audit | — | Giữ regression P1–P12 xanh trước mỗi phase |

## 8. Baseline không được phá vỡ

1. Confirmed Sales Order không tự tạo receivable; chỉ P8 financial boundary mới làm việc đó.
2. `SUPPLIER_DIRECT` không tạo fake inventory movement.
3. Delivery proof/actual/confirmed state là P7; GPS hoặc route không được ghi đè.
4. Work `DONE`, verification, earning entitlement và paid cash là các mốc tách biệt.
5. Portal/UI không gọi `app_private.*` từ browser và không cấp direct write table cho `anon`/`authenticated`.
6. Customer chỉ thấy đúng customer/site được membership cấp; worker chỉ thấy assignment/earning của chính họ; margin/finance không đi qua projection thuận tiện.
7. Không tạo Supabase branch/staging, không dùng Docker, và không chạm production bằng migration trong A0.

## 9. Evidence kiểm thử checkpoint

| Check | Mục tiêu | Kết quả |
| --- | --- | --- |
| `pnpm lint` | Không có lỗi lint sau A0 documentation-only change | PASS |
| `pnpm typecheck` | Không có regression TypeScript | PASS |
| `pnpm test` | Regression unit/integration P1–P12 | PASS — 47 files, 165 tests (bao gồm PostgreSQL 17 embedded migration/concurrency tests) |
| `CI=true pnpm test:e2e` trong worktree sạch | Browser regression P1–P12, không chạm hai ảnh evidence người dùng | PASS — 31 Playwright tests |
| `CI=true pnpm build` trong worktree sạch | Production build từ SHA checkpoint | PASS |
| SQL pgTAP contracts P1, P4–P12 | Kiểm tra schema/grant/RLS/invariant đã có | Không chạy local vì workflow A0 cấm Docker; không có schema change nên không chạy migration production |

Đã đạt các check local ở trên. Checkpoint phát hành tiếp theo chỉ gồm tài liệu này: commit, push `main`, xác minh remote SHA và deploy Vercel Production đúng SHA theo chính sách phát hành hiện hành. A0 không có Supabase migration để deploy.
