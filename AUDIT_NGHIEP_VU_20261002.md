# Audit nghiệp vụ và sidebar Hiền Xa, 02/10/2026

## Kết luận

**CHƯA ĐẠT để kết luận toàn bộ nghiệp vụ sẵn sàng bàn giao.** Bộ kiểm hiện có đạt nhưng các ca âm độc lập phát hiện lỗi chưa được bao phủ. Không có bằng chứng UTF-8 bị hỏng trong phạm vi đã quét; không đổi encoding hàng loạt hoặc sửa dữ liệu thật.

Sidebar đã được gom theo hành trình, không gộp backend, không đổi quyền/RLS. Phần đóng drawer mobile còn lỗi trả focus mới được phát hiện; chưa coi sidebar đạt hoàn toàn khi lỗi này chưa sửa.

## Phiên bản và an toàn

- Canonical: `HX-V2-DOCSET-4.4`, `SYNC-4.4`. Chỉ thị Owner, Spec và UXUI vẫn là contract.
- Source hiện tại: `/Users/nox/Downloads/HienXaERP`.
- Bản sao kiểm định: `/private/tmp/hx-business-sidebar-20261002-yVvmKw`.
- Fingerprint 291 tệp source/migration: `bf1254ab73bf9d17420c73c6e8a0776b65cbadc6cc6c6890b3f77472d3c6d0cc`.
- Manifest, lệnh/kết quả và ảnh: `/private/tmp/hx-business-sidebar-20261002/`.
- QA UI sau sửa: `http://127.0.0.1:4042`; Supabase QA `ffrwiglcrlumfvhubaxg`, `qa:guard` PASS.
- Ca lỗi báo giá chạy tại QA 4041, bản đóng băng trước sửa sidebar. Form/action nghiệp vụ không thay đổi giữa hai bản; bằng chứng chỉ áp dụng cho những inputs nghiệp vụ không đổi, không dùng UI 4041 để chứng nhận sidebar mới.
- DB: PGlite PostgreSQL biệt lập, nạp migration vào DB bộ nhớ. Không áp migration lên Supabase.
- Không chạy Git, commit, push, PR, deploy, migration Production, DML Production hay chỉnh grant. Branch/HEAD không được xác minh lại trong lượt này; fingerprint mới là định danh kiểm định.
- Không cài dependency, không tắt assertion hay đổi đáp án để làm bài kiểm xanh. Các probe audit chỉ nằm trong bản sao, không thêm vào test/source chính.

## Gom module ở đâu

Chỉ gom điều hướng; mỗi command, ledger, transaction, role và surface vẫn giữ ranh giới riêng.

| Nhóm sidebar | Đích hiện có | Ranh giới giữ nguyên |
| --- | --- | --- |
| Bán hàng | Đơn bán, Báo giá, Khách hàng | Báo giá không tự ghi doanh thu/AR; xác nhận SO không phải giao hàng |
| Mua hàng | Đơn mua, Nhà cung cấp | PO không tự ghi AP; nhận hàng và NCC giao thẳng có căn cứ riêng |
| Vật tư & kho | Vật tư, Tồn kho, Kiểm kho | Danh mục không phải ledger; kiểm kho phải qua phê duyệt movement |
| Giao hàng | Điều phối, Phiếu giao, Lộ trình | Kế hoạch tuyến không tự chốt kết quả giao/kho/công nợ |
| Tài chính | Phải thu, Phải trả, Sổ tiền, Chi phí, Báo chuyển khoản, Hồ sơ hóa đơn bán, Chứng từ mua | AR/AP, notice, posting, reconciliation và invoice không gộp thành một trạng thái |
| Nhân công & dịch vụ | Nhân sự & công việc, Thu nhập, Dịch vụ | Giao việc, xác minh sản lượng, duyệt thu nhập và trả tiền vẫn độc lập |
| Quản trị | Nhân viên & quyền, Nhật ký, Cài đặt | Giữ enforcement server/RLS và actor/branch thật |

Tổng quan, Báo cáo, Tin nhắn giữ lối vào trực tiếp. Giữ 25 route cũ và bổ sung 2 lối vào route đã tồn tại: Kiểm kho và Chứng từ mua. Lọc quyền trước khi dựng nhóm; không hiện nhóm rỗng; nhóm chỉ có một đích không bắt mở thêm tầng. Tối đa hai cấp, theo UX-030/UX-040/UX-FLOW-001.

Không nên gộp `/admin`, `/customer`, `/work`; không gộp kho với mua hàng, AR với AP, xác minh giao với thanh toán, thu nhập với việc được giao hoặc invoice với doanh thu.

## Bản đồ và bằng chứng kiểm tra

| Luồng | UI -> server -> dữ liệu -> ảnh hưởng | Kết quả lượt này |
| --- | --- | --- |
| Báo giá | Form nhiều dòng -> sales action/RPC -> quotation/revision/lines -> snapshot, gửi/khóa revision | UNIT/DB hiện có PASS; UI ca số lượng 0 và giữ ngày sau lỗi FAIL |
| Đơn bán | Tạo/sửa draft -> sales action/RPC -> SO/lines -> nhu cầu, hạn mức và trạng thái dẫn xuất | Danh sách QA và điều hướng hoạt động; pricing/payment-state/credit checks hiện có PASS; chưa tạo lại toàn chuỗi qua UI |
| Mua/nhận hàng | PO -> purchasing action -> receipt hoặc fulfillment per-line -> movement/AP theo nguồn | UNIT/DB hiện có PASS; ca âm nhận lượng 0 gửi xuống RPC FAIL |
| Kho/kiểm kho | Count form -> inventory action/RPC -> count lines -> approval -> movement | DB bình thường PASS; DB NaN lưu được và không duyệt được FAIL |
| Giao hàng/trả hàng | Delivery/result/return form -> command -> verification/movement/AR | Các check DB và return-form hiện có PASS; chưa tái chạy trọn chuyến giao qua UI |
| Thu/chi/công nợ | Payment form -> post/reverse/reconcile -> payment/allocation/advance -> outstanding/sổ tiền | Invariant DB hiện có PASS; ngày lịch không tồn tại bị đổi thành ngày khác FAIL |
| Báo cáo/chứng từ | Selector/filters -> report source/export -> canonical summary/CSV; purchase registry -> nguồn AP | Route chứng từ mua QA Owner mở được; CSV có BOM/charset UTF-8; nav/guard báo cáo lệch điều kiện quyền |
| Khách/thợ | Portal UI -> scoped RPC -> membership/own work/payment notice | DB R8-R9 và unit hiện có PASS; không coi là UAT browser hai role mới trong lượt này |
| Sidebar | AccessContext -> lọc quyền -> nhóm/menu -> đích route | Unit 9 ca PASS; desktop/mobile/collapse/active/scroll PASS; trả focus sau đóng mobile FAIL |

Kết quả DB không thay bằng chứng UI; unit mock không chứng minh cloud RLS. Không dùng build/typecheck xanh để kết luận tiền, kho hay công nợ đạt toàn hệ thống.

## Lỗi xác nhận và hướng sửa tối thiểu

### BIZ-COUNT-NAN, P1, kiểm kho

- Vai trò: người có `inventory.count`; người duyệt với `inventory.adjust` bị chặn khi duyệt count lỗi.
- Contract: SPEC-NUM-002, SPEC-INVTRY-005, SPEC-DATA-001.
- Nguồn: `src/modules/inventory/actions.ts::recordStockCountLineAction`; validator `!Decimal.isNegative()` không loại `NaN`/Infinity. `supabase/migrations/20260912114625_inventory_delivery.sql:544::record_stock_count_line` chỉ kiểm `< 0`.
- Tái hiện: gọi action với quantity `NaN`; probe unit thấy gọi RPC. Trong DB biệt lập, mở count mới rồi gọi RPC với `'NaN'::numeric`, version 1 và reason hợp lệ.
- Kỳ vọng: chặn giá trị không hữu hạn trước khi ghi count, DB cũng chặn.
- Thực tế: count line lưu `NaN`; approve báo `0A000: cannot convert NaN to bigint`. Không chứng minh tồn kho ledger bị đổi; approve thất bại nên không kết luận tồn đã sai.
- Hướng sửa: application kiểm finite và >=0, giới hạn scale/range theo contract; DB chặn non-finite bằng migration riêng được duyệt. Thêm regression cho record/approve. Không chạy migration trong audit.
- Bằng chứng: `business-probes.log`, `business-db-probe.log`.

### BIZ-PAYMENT-DATE, P1, ngày thu/chi

- Vai trò: actor `finance.payment.post`/`finance.reconcile`.
- Contract: SPEC-FIN-004, SPEC-DASH-005, SPEC-DATA-001.
- Nguồn: `src/modules/finance/actions.ts::localDateTime/toInstant`, dùng regex rồi `new Date(...).toISOString()`.
- Tái hiện unit: gửi `2026-02-31T10:00`, payment 1.000 VND, fixture biệt lập, allocations rỗng.
- Kỳ vọng: lỗi validation, không gọi post RPC.
- Thực tế: RPC nhận `effective_at=2026-03-03T03:00:00.000Z`. Ca ngày thật 28/02 giữ UTC+07 đúng.
- Giới hạn: native date picker thường ngăn nhập ngày này; đây là ca âm tầng server, chưa ghi payment sai ngày trên cloud/Production.
- Hướng sửa: validate ngày lịch thực và round-trip thành phần ngày/giờ trước khi chuyển UTC; trả safe validation error. Áp dụng cùng rule cho đối soát, không thay timezone nghiệp vụ.
- Bằng chứng: `business-probes.log`.

### BIZ-QTY-ZERO, P2, số lượng giao dịch

- Vai trò: Sales/Owner lập báo giá; nhân sự nhận hàng.
- Contract: SPEC-REC-002/004, SPEC-INVTRY-002, SPEC-NUM-002.
- Nguồn: sales/purchasing validator dùng `Decimal.isPositive()`; inventory receipt validator finite nhưng vẫn dùng `isPositive()`. Decimal coi `+0` là positive.
- UI QA: điền lượng 0, giá thủ công 120.000 VND và reason, xem trước thành tiền 0 rồi nút Lưu được bật; lưu trả lỗi chung.
- Unit action nhận hàng: quantity 0 vẫn gọi `receive_purchase_order`.
- Không kết luận PO có thể lưu 0: cost preview còn các validation downstream. Không chứng minh zero quote/stock movement đã được chốt; DB vẫn có guard và ca lưu UI không thành công.
- Hướng sửa: finite && gt(0), precision/range theo contract tại boundary; UI báo lỗi dòng trước preview/save, không mặc định giá 0.
- Bằng chứng: `business-probes.log`, `quotation-error-draft.png`.

### BIZ-DRAFT-DATE, P2, giữ draft sau lỗi

- Vai trò: người tạo/sửa báo giá; shared commercial form cần regression SO nếu sửa.
- Contract: UX-REC-002/003, SPEC-REC-003, UX-930.
- Nguồn: `src/components/sales/commercial-document-form.tsx`, input `effectiveAt` uncontrolled.
- Tái hiện: điền hiệu lực `2026-10-03T10:00`, lưu báo giá quantity 0, server trả lỗi.
- Thực tế: quantity/manual price/reason giữ nguyên; ngày hiệu lực thành chuỗi rỗng. Không kết luận tất cả dropdown bị reset.
- Hướng sửa: giữ date trong draft state; chỉ reset sau success theo intent. Thêm test lỗi validation/RPC giữ ngày.
- Bằng chứng: DOM trước/sau đã ghi trong lượt UI; ảnh `quotation-error-draft.png` ghi error của ca.

### NAV-REPORT-GUARD, P2, điều kiện quyền báo cáo lệch

- Vai trò: actor có một quyền finance nguồn nhưng không có `dashboard.read`.
- Nguồn: `src/components/app-shell.tsx` hiện Báo cáo khi có AR/AP/expense read; `src/app/admin/reports/page.tsx` và `src/app/api/reports/export/route.ts` bắt `dashboard.read`.
- Kỳ vọng tối thiểu: link được hiện phải dẫn tới route có guard phù hợp, không mở link rồi bị từ chối vì điều kiện khác.
- Thực tế: điều kiện source không thống nhất. Đây là lỗi xác nhận từ source; chưa đăng nhập browser finance-only trong lượt này.
- Hướng sửa: thống nhất nav/page/export theo contract đã chốt; không tự cấp dashboard hay dữ liệu nhạy cảm cho role chỉ để link chạy.

### UI-MOBILE-FOCUS, P2, regression do lượt sửa sidebar này

- Mở drawer, Shift+Tab/Tab quay vòng Close/Logout đúng; bấm Escape đóng nhưng focus thành BODY, không về Mở menu.
- `closeMenu()` focus opener khi workspace còn `inert`; unit jsdom chưa mô phỏng đúng việc trình duyệt chặn focus.
- Hướng sửa: bỏ inert qua commit trước, rồi trả focus; thêm regression kiểm focus chỉ chạy khi workspace đã hết inert.
- Đã báo Owner và hỏi riêng cho phép sửa; chưa sửa khi chưa nhận quyết định.
- Bằng chứng: `mobile-focus-initial-failure.json`.

## Nguy cơ và polish, không gộp với lỗi đã tái hiện cloud

- Chứng từ mua hiển thị tiền qua `Number(...)`; `9007199254740993` bị hiển thị thành `9007199254740992`. Chưa tạo giá trị lớn như vậy trên UI/cloud; cần kiểm DTO bigint/exact từ DB tới UI trước khi chốt mức ảnh hưởng. Dùng `formatVnd`/exact string nếu cần, không đổi business amount.
- `salesStateLabel` chưa dịch `COMPLETED`/`IN_PROGRESS`, QA Orders đang hiển thị mã tiếng Anh. Đây là thiếu localization, không phải UTF-8 bị hỏng.
- Chưa chứng minh toàn bộ lỗi khác đã hết hoặc toàn bộ phân hệ đạt; không dùng danh sách trên làm danh sách mọi lỗi chắc chắn duy nhất.

## Kiểm tra encoding và ảnh

- Quét UTF-8 strict và dấu mojibake trên 290 tệp `src`/migrations trước chỉnh: 0 invalid UTF-8, 0 mẫu mojibake.
- Ba tệp đã chỉnh thêm/đổi cũng decode UTF-8 strict được; test render giữ nhãn tiếng Việt và identity thật.
- DOM QA charset UTF-8; ảnh desktop/mobile không thấy chữ lỗi trong sidebar/form đã kiểm.
- Export CSV đã có UTF-8 BOM và `charset=utf-8`; không sửa lại phần đang đúng.
- Không kiểm mọi file PDF/font, mọi dữ liệu nhập cũ hay mọi màn hình Production. Nếu lỗi nằm ở bản ghi cũ/ảnh PDF, cần xác định exact route/record, không auto-reencode DB.
- Ảnh: `sidebar-before.png`, `sidebar-after-desktop.png`, `sidebar-after-mobile.png`, `quotation-error-draft.png` trong thư mục bằng chứng.

## Lệnh và kết quả

| Check | Kết quả | Exit / bằng chứng |
| --- | --- | --- |
| `node --env-file=.env.qa.local scripts/qa/guard.mjs` | PASS, đúng QA | 0 |
| `vitest run` tại bản sao | 25 file, 97 test PASS, gồm 9 sidebar test | 0, unit.log |
| `eslint src/components/app-shell.tsx src/components/app-shell.test.tsx` | PASS | 0, lint.log |
| `tsc --noEmit --incremental false`, lần đầu | thiếu generated Next PageProps, không coi là defect source mới | 2, types.log |
| `next typegen`, rồi cùng lệnh tsc | PASS | 0/0, typegen.log/types-after-typegen.log |
| `node scripts/test-r2-database.mjs` | invariant R2-R9 PASS trong DB biệt lập | 0, db.log |
| audit-only `business-audit-probes.test.ts` | 3 FAIL phát hiện defect, 1 PASS ngày hợp lệ | 1, business-probes.log |
| audit-only DB probe | tái hiện count lưu NaN, approve thất bại | harness 0; verdict nghiệp vụ FAIL, business-db-probe.log |
| QA browser 1280x720 | grouping/active/route và charset kiểm được | ảnh/DOM |
| QA browser 390x844 | drawer không tràn body, focus trap, Escape, scroll | focus-return FAIL; scroll 282->0, page 0->0 |

Không che lần typecheck lỗi; chạy đúng bước typegen là sửa điều kiện môi trường. Không bỏ 3 ca âm FAIL hoặc đổi đáp án. Không chạy full suite lại sau mỗi ca UI. Không chạy production build/deploy trong lượt này; dev compiled các route đã dùng không chứng minh full release build.

## Chưa kiểm và thứ tự xử lý

1. Xử lý non-finite count và ngày lịch tiền trước khi nghiệm thu nghiệp vụ; DB fix cần migration được duyệt riêng.
2. Xử lý zero quantity và giữ draft date; chạy lại đúng negative probes/shared editor dependencies.
3. Chốt nav/report guard và localization/exact-money presentation.
4. Sửa regression trả focus do sidebar mới nếu Owner cho phép; kiểm mobile/keyboarding và 9 unit liên quan, không rerun toàn hệ thống không có invalidation.
5. UAT browser Customer/Worker, race hai session PostgreSQL thực, Storage/provider sandbox, p95/p99 cloud đại diện và backup/restore vẫn cần bằng chứng riêng. PGlite không chứng minh concurrency đa session hay cloud provider.
6. Không tự nghiệm thu thay Owner hoặc deploy khi còn chưa có yêu cầu riêng cho bản sửa này.
