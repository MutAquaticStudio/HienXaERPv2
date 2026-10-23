# Hiền Xa ERP V2

ERP cho doanh nghiệp vật liệu xây dựng: bán hàng, mua hàng, kho, giao hàng, dịch vụ, công nợ, sổ quỹ, nhân công,
cổng thợ và cổng khách hàng. Giao diện tiếng Việt, bố cục quen thuộc kiểu KiotViet (D29).

## Ba cổng

| Đường dẫn | Ai dùng | Ghi chú |
|---|---|---|
| `/` | Mọi người | Chọn cổng: Khối vận hành / Thợ & tài xế / Khách hàng |
| `/admin` | Chủ doanh nghiệp, văn phòng, kho, điều phối | Menu xanh ngang, quyền theo vai trò |
| `/work` | Thợ, tài xế | Thiết kế cho điện thoại: nhận việc, lấy hàng lên xe, đã giao, hoàn tất |
| `/customer` | Khách hàng | Đặt hàng, theo dõi đơn và giao nhận, công nợ |

## Công nghệ

Next.js 16 (App Router) · React 19 · Supabase (Postgres, Auth, Storage) · CSS thuần (`src/app/globals.css` +
`portal.module.css`) · Vitest + Testing Library · Playwright cho script QA.
Modular monolith: nghiệp vụ ghi sổ nằm trong RPC Postgres một transaction, RLS bật trên mọi bảng; giao diện chỉ trình bày.

## Chạy cục bộ

Cần Node 24 và pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm dev             # http://localhost:3000
pnpm lint            # ESLint (0 lỗi)
pnpm typecheck       # next typegen && tsc --noEmit
pnpm test            # Vitest + jsdom
pnpm build
pnpm check           # lint + typecheck + test + build — chạy trước khi push
node --test scripts/qa/evidence-reverification.test.mjs scripts/qa/source-binding.test.mjs
```

Cơ sở dữ liệu:

```bash
# DB tạm trên Postgres cục bộ (CI dùng 17): áp toàn bộ migration, kiểm RLS/quyền, chạy supabase/tests/native/*.sql
HX_TEST_PG_URL=postgres://postgres@127.0.0.1:5432/postgres pnpm db:test:isolated
# Supabase đầy đủ (cần Docker + Supabase CLI)
pnpm db:start && pnpm db:reset && pnpm db:test
```

Biến môi trường: xem `.env.example`. Không commit `.env*` khác, khóa hay mật khẩu. Guard trong code chặn kết nối DB/cloud
ngoài localhost nếu thiếu cờ phê duyệt; quy định an toàn môi trường đầy đủ ở `CLAUDE.md`.

## Cấu trúc

```text
src/app/            route: admin/, work/, customer/, api/ (PDF, ảnh minh chứng, GPS, health)
src/modules/<miền>/ nghiệp vụ theo miền: actions.ts ("use server"), presentation.ts, test đặt cạnh file
src/components/     thành phần giao diện dùng chung (ui/, lists/, documents/editor/, sales/, portal/ …)
src/lib/core/       tiền (bigint VND), số lượng, giờ Asia/Ho_Chi_Minh, lỗi, idempotency
src/lib/access/     phân quyền phía ứng dụng
supabase/migrations nguồn sự thật của schema (forward-only)
supabase/tests/     pgTAP và test native SQL
scripts/qa/         script Playwright và QA dữ liệu
```

## Hệ giao diện (D29 — UI-R1)

Giữ bố cục kiểu KiotViet nhưng gọn, đẹp và có chuyển động. Chi tiết trong `Spec.md` (SPEC-UI-R1) và `UXUI.md` (UX-UI-R1-001).

- **Màu**: xanh chính `#0B63C6` cho menu, nút chính, liên kết. Xanh lá `#12804A` chỉ dùng cho hành động tiền / hoàn tất
  (Tạo đơn bán, Xác nhận đơn, Duyệt vượt hạn mức, Hoàn tất, Đặt hàng mới). Cam cho cảnh báo, đỏ cho lỗi.
  Mọi màu, bo góc, bóng, thời lượng là biến CSS ở `:root` trong `src/app/globals.css`; có chế độ tối.
- **Chữ**: Be Vietnam Pro mặc định (chọn được Noto Sans), cỡ Nhỏ / Vừa / Lớn trong "Giao diện" (`src/lib/appearance.ts`).
- **Khung vận hành**: thanh tiện ích trắng + menu xanh ngang có menu thả xuống (`src/components/app-shell.tsx`).
- **Danh sách**: bộ lọc trạng thái có số đếm (`ListFilterGroup`) và xem nhanh dưới dòng (`ExpandableRows`) trong
  `src/components/lists/`.
- **Màn tạo đơn**: bộ soạn chung `src/components/documents/editor/` cho đơn bán, đơn mua và đặt hàng cổng khách.
- **Chuyển động**: 120 / 200 / 320 ms; popup có hiệu ứng đóng (`Dialog`), khung xương khi tải (`src/app/admin/loading.tsx`).
  `prefers-reduced-motion` tắt toàn bộ hiệu ứng.
- **Cổng điện thoại**: `src/components/portal/` — menu dưới có biểu tượng, bộ đếm − / + 72 px (`QuantityStepper`),
  nút hoàn tất dính đáy, tiến trình đơn (`OrderProgress`).

**Responsive**

| Bề rộng | Thay đổi |
|---|---|
| ≥ 1440 px | Đầy đủ; màn tạo đơn có cột phải dính |
| < 1440 px | Màn tạo đơn: khách / công trình lên trên, tổng tiền + nút ghim đáy |
| < 1180 px | Menu xanh thu thành nút ☰ (ngăn kéo trái, khóa focus) |
| < 1100 px | Dòng hàng trong màn tạo đơn thành thẻ |
| < 1080 px | Bộ lọc lên trên danh sách, trạng thái thành chip |
| < 760 px | Bảng thành thẻ từng dòng; ô nhập ≥ 16 px, nút ≥ 44 px |
| < 800 px (cổng) | Cổng thợ / khách: thanh xanh trên, menu dưới |

**Quy tắc khi sửa giao diện**: không đổi tên class hiện có (script QA và test chọn theo chúng, vd `.row-link-table`,
`.metric-value`, `.field`); dùng biến màu thay vì mã màu cứng; chữ hiển thị toàn tiếng Việt (`src/test/ux-language.test.tsx`).

## Tài liệu

Thứ tự ưu tiên: chỉ thị mới nhất của Owner → `Spec.md` → `UXUI.md` (khi chạm giao diện) → `plan.md` → `tasks.md` →
`implementation.md` (nhật ký). Tài liệu là hợp đồng: thay đổi yêu cầu phải được Owner quyết định và ghi thành mục D trong `Spec.md`.
`reports/`, `NGHIEM_THU_*`, `AUDIT_*`, `RELEASE_APPROVAL.md` là bằng chứng lịch sử. Hướng dẫn cho tác tử lập trình: `CLAUDE.md`.

## Phát hành

Nhánh làm việc → `pnpm check` → PR vào `main` → CI (`.github/workflows/ci.yml`: lint, typecheck, test, build, script QA,
job `db-migrations` trên Postgres 17) → merge → migration (nếu có) áp QA rồi Production → deploy Vercel → kiểm `/api/health`
đúng commit. Vercel tắt auto-deploy (`vercel.json`); bản preview dùng dữ liệu QA. Chi tiết ở `DEPLOYMENT.md`.
