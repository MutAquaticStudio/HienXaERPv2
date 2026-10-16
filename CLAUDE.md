@AGENTS.md

# Hiền Xa ERP V2 — hướng dẫn cho Claude Code

ERP cho doanh nghiệp vật liệu xây dựng (bán hàng, mua hàng, kho, giao hàng, công nợ, nhân công, cổng khách hàng/thợ).
Dự án trước đây được phát triển bằng Codex; mọi chỉ dẫn trong bộ tài liệu gửi cho "Codex" (ví dụ `Spec.md` SPEC-006)
**áp dụng nguyên vẹn cho Claude Code**.

## Thứ tự ưu tiên tài liệu (SPEC-DOC-001)

```text
chỉ thị mới nhất của Owner trong phiên → Spec.md → UXUI.md (khi chạm giao diện) → plan.md → tasks.md → implementation.md (chỉ để biết trạng thái)
```

- Tài liệu là hợp đồng: không tự thêm trạng thái, bảng, role, permission, workflow, business rule, default tài chính… (SPEC-DOC-002).
- Không sửa `Spec.md`, `UXUI.md`, `plan.md`, `tasks.md` để hợp thức hóa code (SPEC-DOC-003). Cần đổi yêu cầu → hỏi Owner.
- File lớn — **không đọc toàn bộ**, dùng Grep theo mã mục rồi đọc đoạn liên quan:
  `implementation.md` (~470KB, nhật ký), `Spec.md` (mục `SPEC-xxx`), `UXUI.md` (mục `UX-xxx`), `tasks.md` (`TASK-010` = trạng thái hiện tại).
- `reports/` và các file `NGHIEM_THU_*`, `AUDIT_*`, `RELEASE_APPROVAL.md` là bằng chứng lịch sử, không phải yêu cầu.

## Lệnh

```bash
pnpm install --frozen-lockfile
pnpm lint            # ESLint (0 lỗi; có warning baseline)
pnpm typecheck       # next typegen && tsc --noEmit
pnpm test            # Vitest + jsdom (~100 file, ~45s)
pnpm vitest run src/modules/sales   # chạy test một module
pnpm build           # next build
pnpm check           # lint + typecheck + test + build — chạy trước khi push
node --test scripts/qa/evidence-reverification.test.mjs scripts/qa/source-binding.test.mjs   # cũng chạy trong CI
```

CI (`.github/workflows/ci.yml`) chạy đúng các bước trên với Node 24 + pnpm 11, và job `db-migrations`
(Postgres 17): `HX_TEST_PG_URL=postgres://postgres@127.0.0.1:5432/postgres pnpm db:test:isolated` — áp toàn bộ migration
lên DB tạm, kiểm tra RLS/quyền, chạy `supabase/tests/native/*.sql` (mỗi file rollback; `_setup.sql` là fixture chung).
Migration/RPC mới phải có test SQL native kèm theo.
DB cục bộ đầy đủ cần Docker + Supabase CLI: `pnpm db:start`, `pnpm db:reset`, `pnpm db:test` (pgTAP trong `supabase/tests`).

## Kiến trúc

- Next.js 16 App Router + React 19 + Supabase (Postgres, Auth, Storage). Modular monolith, function-first —
  không microservice/queue/cache/event bus/CQRS (PLAN-025).
- `src/app/` — route: `admin/` (nội bộ), `work/` (cổng thợ), `customer/` (cổng khách), `api/` (PDF, evidence, GPS, portal).
- `src/modules/<domain>/` — logic theo nghiệp vụ: `actions.ts` (`"use server"`), `presentation.ts`, form, test đặt cạnh file.
- `src/lib/core/` — tiền (`money.ts`, VND là `bigint` nguyên đồng), số lượng (`quantity.ts`, tối đa 6 chữ số thập phân,
  không tự làm tròn), `business-time.ts` (Asia/Ho_Chi_Minh), `errors.ts`, `idempotency.ts`, `command-outcome.ts`.
- `src/lib/access/` — phân quyền ứng dụng (`requireInternalPermission`, `resolveInternalAccess`, …).
- `src/proxy.ts` (thay cho middleware trong Next 16; phải nằm cùng cấp với `app`, đặt ở gốc repo sẽ bị Next bỏ qua) làm mới phiên Supabase.
- `supabase/migrations/` — nguồn sự thật của schema; nghiệp vụ ghi sổ nằm trong RPC Postgres (`supabase.rpc(...)`)
  chạy một transaction, RLS bật trên mọi bảng public.

## Quy ước bắt buộc

- **Database là authority**: RLS + RPC quyết định quyền và tính hợp lệ; UI chỉ trình bày. Gọi DB bằng client
  `createServerSupabase()` (publishable key + cookie người dùng). `SUPABASE_SECRET_KEY` chỉ dùng ở chỗ đã có
  (`src/lib/auth/actions.ts`, `src/modules/portal/evidence-storage.ts`); không thêm chỗ dùng mới, không đưa vào `NEXT_PUBLIC_*`.
- Lệnh ghi có `operationId` (idempotency) và `expectedVersion` (optimistic lock) khi chứng từ có version.
- Lỗi từ DB → map sang tiếng Việt rõ ràng (xem `commandError` trong `src/modules/sales/actions.ts`, `userFacingError`).
  Không hiển thị mã lỗi kỹ thuật cho người dùng. Lỗi transport/không rõ = `UNKNOWN`, không phải thất bại.
- Toàn bộ chữ trên giao diện bằng tiếng Việt (có test `src/test/ux-language.test.tsx`).
- Validate input bằng `zod`; tính tiền/giá dùng `decimal.js` hoặc `bigint`, không dùng `number` cho tiền.
- Migration mới: thêm file `supabase/migrations/<YYYYMMDDHHMMSS>_<ten>.sql` **forward-only**; không sửa migration đã áp dụng.
  Bảng mới phải bật RLS, không grant SELECT cho `anon`.
- Test đặt cạnh source (`*.test.ts(x)`); thay đổi hành vi phải kèm test.

## An toàn môi trường (không được vi phạm)

- **Production Supabase `nbwynrwkdbtfsitafsxa`: cấm ghi/migrate/xóa dữ liệu khi chưa có lệnh rõ ràng của Owner** trong phiên.
- QA project `ffrwiglcrlumfvhubaxg` chỉ là dữ liệu test; mọi script `qa:*` cần `.env.qa.local` (không commit).
- Guard trong code (`src/lib/db/client.ts`, `scripts/assert-local-db.mjs`, `src/lib/supabase/config.ts`) chặn DB/cloud
  ngoài localhost nếu không có cờ phê duyệt — không nới lỏng các guard này.
- Không commit `.env*` (trừ `.env.example`), khóa, mật khẩu, JWT, hay dữ liệu khách hàng thật vào `reports/`.
- Không merge/deploy khi chưa được yêu cầu. Vercel đang tắt auto-deploy (xem `vercel.json`).

## Git

- Làm việc trên nhánh được giao; commit nhỏ, message dạng `feat|fix|docs|style(scope): ...`.
- Trước khi push: `pnpm check` phải xanh. Không tạo PR nếu chưa được yêu cầu.
