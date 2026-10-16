# Kế hoạch & QA — Feedback khách theo phong cách KiotViet (15/10/2026)

Trạng thái: **ĐÃ XONG CODE G0–G9; MIGRATION + QA DATABASE + QA TRÌNH DUYỆT TỰ ĐỘNG PASS TRÊN QA PROJECT (16/10/2026) — CHỜ OWNER UAT, CHƯA DEPLOY**. Không áp migration lên Production khi chưa có lệnh riêng của Owner.

## 1. Quyết định của Owner

| Mã | Quyết định | Tài liệu bị thay đổi |
|---|---|---|
| D1 | Tắt hẳn Báo giá (nội bộ + cổng khách) bằng cờ `QUOTATIONS_ENABLED` (`src/lib/features.ts`). Không xóa dữ liệu/RPC/quyền; preset vai trò giữ nguyên để khớp DB; đơn bán cũ có nguồn báo giá vẫn xem được. | Spec.md L98, SPEC-140; UXUI.md L141, L1479, L1532 |
| D2 | KPI Tổng quan: Doanh thu │ Tổng chi phí │ **Lợi nhuận ròng** (= `operating_profit`: doanh thu − giá vốn − chi phí vận hành) │ Biên lợi nhuận ròng. LN gộp không còn hiển thị trên giao diện (trang Báo cáo vốn không có chỉ số lợi nhuận); RPC vẫn trả `gross_profit`. | SPEC-DASH-001; UX-DASH-002 |
| D3 | Biểu đồ đường: Thu = doanh thu ghi nhận, Chi = giá vốn + chi phí vận hành, Lợi nhuận = Thu − Chi. Cùng công thức với KPI. | SPEC-DASH-009 (mới); UX-DASH-002, UX-DASH-004 |
| D4 | Chỉnh giá bán hàng loạt: lưu một lần, nguyên tử (RPC batch mới). Làm tròn mặc định 1.000đ, có xem trước. | SPEC-PRI-005 (mới, có đối chiếu SPEC-CONFIG-002); UX-350 |

## 2. Giai đoạn

| GĐ | Nội dung | DB |
|---|---|---|
| G0 | Harness Postgres native (`pnpm db:test:isolated`, CI job `db-migrations` dùng Postgres 17) | — |
| G1 | Bộ lọc tự áp dụng (bỏ nút "Áp dụng"), bỏ chữ "trừ đã hủy", tên khách bấm được | — |
| G2 | Tổng quan: KPI Lợi nhuận ròng + biểu đồ đường Thu/Chi/Lợi nhuận đồng bộ bộ lọc | migration `finance_dashboard_series` |
| G3 | Tắt Báo giá | — |
| G4 | Tạo đơn bán kiểu KiotViet (ô tìm vật tư, bảng dòng sửa trực tiếp, panel khách/tổng bên phải, "Tạo đơn" + "Lưu nháp") | — |
| G5 | Tạo đơn mua dùng chung bộ khối của G4 | — |
| G6 | Danh sách khách hàng kiểu KiotViet | — |
| G7 | Danh sách vật tư kiểu KiotViet (giá bán, giá vốn, tồn theo quyền) | — |
| G8 | Thiết lập giá hàng loạt + sửa idempotency `savePricingRuleAction` | migration `save_pricing_rules_batch` |
| G9 | Cập nhật Spec/UXUI/tasks/implementation theo D1–D4; khung QA trình duyệt `scripts/qa/feedback-20261015/` | — |

### Tiến độ (16/10/2026)

| GĐ | Commit | Kiểm chứng cục bộ |
|---|---|---|
| G0 | `75e8b48` | DB native PASS |
| G1 | `bb2c1cf` | unit + build |
| G2 | `89f5983` | `020_dashboard_series.sql` PASS; ảnh desktop/mobile |
| G3 | `1720468` | unit (menu, landing, route, action) |
| G4 | `64e1481` | 17 + 5 test; ảnh desktop/mobile |
| G5 | `7b890ce` | 17 + 4 test |
| G6 | `d68dda4` | 4 test |
| G7 | `761ce4f` | 5 test + `material-list` |
| G8 | `2dc793b` | `030_pricing_batch.sql` PASS (có mutation check); 4 + 3 + 6 + 3 test; ảnh desktop/mobile |
| G9 | commit tài liệu này | `node --test scripts/qa/feedback-20261015/support.test.mjs` |

Tổng tại G8: lint 0 lỗi (14 warning nền), typecheck, 735 unit test, build, DB native (191 migration + 3 file test) đều PASS.
### QA project `ffrwiglcrlumfvhubaxg` (16/10/2026, Owner cho phép)
- Áp 4 migration (mỗi bản một transaction, ghi đúng version repo vào lịch sử): `20261012211058_align_business_api_table_privileges`
  và `20261013105000_operational_role_presets` (Production đã có, QA còn thiếu) + `20261015120000_dashboard_profit_series`
  + `20261015130000_pricing_rules_batch`. Lịch sử QA 188 → 192.
- Mã nguồn 4 hàm trên QA trùng md5 với bản áp từ repo ở DB native.
- Bất biến bảo mật trên QA PASS (RLS mọi bảng public, anon 0 quyền bảng, definer có `search_path`, anon không gọi được definer).
  Supabase advisors: không cảnh báo mới do 4 migration; tồn đọng cũ: 25 ERROR `security_definer_view`, 1 WARN chống mật khẩu lộ.
- `020_dashboard_series.sql` và `030_pricing_batch.sql` PASS trên QA (bọc rollback; đã xác nhận `assert` có hiệu lực; số dòng các bảng trước/sau không đổi).
- Smoke dữ liệu thật (chủ QA, rollback): HXQA Branch A 30 ngày và 12 tháng — tổng Thu biểu đồ = KPI (13.397.000),
  tổng Lợi nhuận = KPI (3.475.024), Thu − Chi = Lợi nhuận từng điểm. Lọc theo khách: điểm có chi phí chưa phân bổ là
  `NOT_APPLICABLE`, không mang giá trị (B09 ở tầng DB). Biểu đồ 12 tháng chạy ~280 ms phía DB (1 lần đo, chưa phải p95 trình duyệt).

### QA trình duyệt trên QA project (16/10/2026, phiên cloud, app local trỏ QA, Chromium 1440 + 390)
| Ca | Kết quả |
|---|---|
| B01 | PASS — 5 bước bàn phím (khách → công trình → F3 vật tư → SL → "Tạo đơn"); SO-2026-000064 và SO-2026-000065 CONFIRMED, đúng khách/công trình, 2 × 200.000 = 400.000, có credit commitment |
| B03 | PASS gián tiếp — khi xác nhận bị chặn (khách chưa có hạn mức; khách có nợ quá hạn) nháp vẫn lưu, mở chi tiết với lý do tiếng Việt (SO-2026-000062, SO-2026-000063 để nháp) |
| B06, B07, B11 | PASS (B11 sau khi sửa: 5 route báo giá trả 404 thật) |
| B08 | PASS — 15 ngày: tổng LN biểu đồ = KPI 2.399.904; 13 tuần: 3.475.024 = KPI |
| B12 | Ma trận cột khớp quyền DB của 6 vai trò (owner giá+vốn+tồn; sales giá; purchasing không; kho tồn; finance-employee và worker bị chặn) |
| B13 | PASS — `QPE44F1B7B-MATERIALB` 250.000 → 275.000 (v2, v1 kết thúc đúng lúc v2 bắt đầu, 1 audit lô); phiên thứ hai dữ liệu cũ bị từ chối, không ghi gì; đơn mới lấy ngay 275.000 |
| B14 | KHÔNG ĐẠI DIỆN — p95 Tổng quan 12 tháng 3,4–3,9 s đo từ container cloud qua proxy tới Supabase Seoul (mỗi lượt gọi 130–420 ms; danh sách đơn cũng 2,4 s p50). Phía DB chỉ ~280 ms. Cần đo lại trên QA preview gần region |
| B02, B04, B05, B09 (trình duyệt), B10 | Thủ công — Owner UAT |

Lỗi QA trình duyệt bắt được và đã sửa (có test): Enter chọn gợi ý cũ khi tìm khách đang chạy → lưu nháp sai khách;
lỗi hydration #418 trên Tổng quan (`<title>` nhiều con); route báo giá tắt trả 200 thay vì 404; bảng dòng đơn bán/mua bị cuộn ngang
che Đơn giá/Thành tiền ở 1440px. Báo cáo chạy: 0 lỗi trang ở lần chạy cuối.

Phát hiện ngoài phạm vi: `proxy.ts` ở gốc repo nhưng app nằm trong `src/app` → Next không đăng ký proxy,
nên làm mới phiên Supabase trong proxy **chưa từng chạy** (từ 12/09). Owner giao toàn quyền (16/10/2026) → đã chuyển sang `src/proxy.ts`
và kiểm trên QA (`FB-PROXY` trong `tasks.md`); có hiệu lực trên Production khi deploy.

## 3. Ma trận QA

### 3.1 Tự động — chạy mỗi lần push (CI)
| Mã | Tầng | Ca kiểm thử |
|---|---|---|
| QA-FB-A01 | DB native | 189+ migration áp sạch trên Postgres 17; RLS mọi bảng public; anon không có quyền bảng; definer có `search_path`; anon không gọi được definer |
| QA-FB-A02 | DB native | Cô lập chi nhánh + `has_permission` (test `supabase/tests/native/010_access_isolation.sql`) |
| QA-FB-A03 | Unit | `AutoFilterForm`: select đổi → submit ngay; ô tìm kiếm debounce 300ms; không JS vẫn có nút gửi |
| QA-FB-A04 | DB native | `finance_dashboard_series`: tổng các điểm = snapshot cả kỳ khi READY; chọn ngày/tuần/tháng; ≤ 31 điểm; người thiếu quyền lợi nhuận nhận FORBIDDEN, không phải 0 |
| QA-FB-A05 | Unit | `ProfitLineChart`: điểm không READY bị đứt đoạn (không vẽ 0); series NOT_APPLICABLE bị ẩn kèm lý do; nhãn tiền đúng |
| QA-FB-A06 | Unit/route | Báo giá tắt: menu, landing, hồ sơ khách không còn báo giá; route trả 404; action báo giá bị từ chối |
| QA-FB-A07 | Unit | `MaterialSearchBox`: tìm theo mã/tên/không dấu; Enter thêm dòng; chọn lại cùng vật tư + ĐVT → tăng SL |
| QA-FB-A08 | Unit | `DocumentLineTable`: FormData đúng tên field & thứ tự; sửa giá bắt buộc lý do; ẩn ô giá khi không có quyền |
| QA-FB-A09 | Server action | `saveDocument` với `intent=confirm` (đơn bán) và `saveWarehouseDocument` (đơn mua kho): thành công; xác nhận lỗi (hạn mức) → nháp còn + thông báo; hai operationId khác nhau do client giữ; thiếu `orders.confirm`/`purchasing.confirm` → từ chối |
| QA-FB-A10 | DB native | `save_pricing_rules_batch`: all-or-nothing khi một dòng stale; idempotent cùng operation_id; payload khác → `operation_payload_conflict`; > 500 dòng bị từ chối; đủ N audit; thiếu `pricing.manage` → 42501 |
| QA-FB-A11 | Unit | Điều chỉnh giá hàng loạt +/−% và +/− số tiền, làm tròn 1.000đ/100đ/không làm tròn bằng BigInt; không cho giá ≤ 0 |
| QA-FB-A12 | Hồi quy | Toàn bộ test hiện có (`pnpm check`) |

### 3.2 Trình duyệt — QA project `ffrwiglcrlumfvhubaxg`, desktop 1440 + mobile 390
Dùng `scripts/qa/go-live/browser-kit.mjs`; script đặt tại `scripts/qa/feedback-20261015/`. Chỉ dữ liệu test.

| Mã | Ca kiểm thử |
|---|---|
| QA-FB-B01 | Tạo đơn bán 1 dòng chỉ bằng bàn phím: ≤ 5 thao tác (trước: ~11). Ghi số thao tác trước/sau |
| QA-FB-B02 | Đơn nhiều dòng, trùng vật tư, đổi ĐVT, giá thủ công + lý do; khách có 1 công trình **không** được tự chọn (SPEC-JOURNEY-003) — ô công trình được focus, mở sẵn danh sách, Enter để chọn |
| QA-FB-B03 | "Tạo đơn" vượt hạn mức → nháp được lưu, chuyển trang chi tiết, thông báo tiếng Việt |
| QA-FB-B04 | Mất mạng sau khi gửi → "Thử lại đúng thao tác" → đúng 1 đơn, 1 receipt, 1 audit |
| QA-FB-B04a | Kịch bản lịch sử dùng form cũ (nút "Tìm khách", "Tính giá và xem trước", "+ Thêm dòng", "Lưu bản nháp", nhãn "Số lượng *"): `scripts/qa/go-live/{configuration,multi-delivery,browser-source-flow,multi-uom,commercial-amendment,service,service-dispatch,pool-work}-browser.mjs`, `scripts/qa/remediation/package7-pricing-browser.mjs`. Đây là bằng chứng lịch sử (không chạy lại ca đã PASS); hành vi tương ứng được kiểm lại bằng QA-FB-B01…B05 với selector mới: combobox "Khách hàng"/"Công trình / điểm giao", combobox "Tìm vật tư", "Số lượng dòng N", "ĐVT bán dòng N", "Đơn giá thủ công dòng N", "Lý do giá thủ công dòng N", nút "Tạo đơn"/"Lưu nháp" |
| QA-FB-B05 | Đơn mua: kho, giao thẳng gắn đơn bán, thêm NCC qua "+", thiếu địa chỉ kho bị chặn |
| QA-FB-B06 | Bộ lọc tự áp dụng ở 12 danh sách; URL giữ trạng thái khi tải lại; không tạo mục lịch sử cho mỗi lần gõ (Back về trang trước); "Đang làm việc"/"Đã hủy"/"Tất cả" |
| QA-FB-B07 | Danh sách khách: bấm mã hoặc tên đều mở chi tiết; cột công nợ chỉ hiện khi có quyền |
| QA-FB-B08 | Tổng quan: đổi kỳ/khách/công trình/loại hoạt động → KPI và biểu đồ đổi cùng; tổng biểu đồ = KPI |
| QA-FB-B08a | `scripts/qa/remediation/package6-no-opening-browser.mjs` (assert số LN gộp 1.120.000 trên thẻ cũ) được thay bằng QA-FB-B08; `package5` đã đổi sang thẻ "Lợi nhuận ròng" |
| QA-FB-B09 | Tổng quan lọc theo khách khi có chi phí chung chưa phân bổ → ẩn Chi/Lợi nhuận kèm lý do |
| QA-FB-B10 | Báo cáo: đối chiếu từng báo cáo `/admin/reports` với chứng từ gốc của bộ dữ liệu QA; CSV khớp màn hình |
| QA-FB-B11 | Báo giá tắt ở nội bộ và cổng khách (404); đơn bán cũ từ báo giá vẫn mở được |
| QA-FB-B11a | Kịch bản lịch sử về báo giá (`scripts/qa/go-live/commercial-amendment-browser.mjs`, `quotation-money-browser.mjs`) không còn áp dụng khi D1 có hiệu lực; bật lại cờ `QUOTATIONS_ENABLED` để chạy lại |
| QA-FB-B12 | Vật tư: cột giá/giá vốn/tồn theo quyền với 5 vai trò (Owner, Quản lý, Bán hàng, Kho, Kế toán) |
| QA-FB-B13 | Giá hàng loạt +10% → xem trước → lưu → đơn bán mới dùng giá mới; hai người lưu cùng lúc → người sau bị từ chối, không ghi một phần |
| QA-FB-B14 | Hiệu năng: Tổng quan kỳ 12 tháng, đo p95 trên 20 lần, trong ngân sách SPEC-370 |

### 3.3 UAT với khách
Checklist tiếng Việt theo từng góp ý; bảng số thao tác trước/sau; khách xác nhận từng mục.

## 4. Cổng phát hành (chưa deploy)
1. CI xanh: `phase-gate` + `db-migrations`.
2. QA-FB-B01…B14 PASS trên QA project. (Migration + QA database + QA trình duyệt tự động: ĐÃ PASS 16/10/2026; B14 cần đo lại ở môi trường đại diện; ca thủ công chờ UAT.)
3. Owner UAT ký.
4. Truy vấn read-only Production: số báo giá đang `SENT` → Owner xác nhận trước khi tắt báo giá.
5. Owner cho phép riêng: áp 2 migration mới lên Production + deploy. (Production đã có `align_business_api_table_privileges`
   và `operational_role_presets` — bản sau mang version `20261013121739` trên Production, khác repo `20261013105000`.)

## 5. Chạy kiểm tra DB native tại máy dev
```bash
# cần một PostgreSQL local (khuyến nghị 17; bản < 17 chạy chế độ tương thích MAINTAIN)
HX_TEST_PG_URL=postgres://postgres@127.0.0.1:5432/postgres pnpm db:test:isolated
```
Test SQL đặt trong `supabase/tests/native/*.sql`; `_setup.sql` được ghép vào đầu mỗi test và mọi thay đổi được rollback.
