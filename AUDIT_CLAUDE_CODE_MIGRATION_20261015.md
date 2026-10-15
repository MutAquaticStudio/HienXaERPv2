# Audit chuyển giao Codex → Claude Code — 15/10/2026

Phạm vi: kiểm tra kỹ thuật read-only trên `main` @ `0130931` (merge PR #49), không chạm QA cloud hay Production.

## 1. Kết quả kiểm tra tự động

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS (lockfile khớp) |
| `pnpm lint` | PASS — 0 lỗi, 14 warning (chủ yếu biến không dùng trong `scripts/qa/*`, 1 `exhaustive-deps` ở `src/modules/pricing/editor.tsx:56`) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 98 file / 664 test (~42s) |
| `node --test scripts/qa/evidence-reverification.test.mjs scripts/qa/source-binding.test.mjs` | PASS — 15/15 |
| `pnpm build` | PASS |
| `pnpm db:test:isolated` | **FAIL** — xem mục 3.1 |

## 2. Hiện trạng codebase

- Next.js 16.3 (App Router, `proxy.ts` thay middleware) + React 19 + Supabase; 189 migration SQL; ~3.3MB source trong `src/`.
- Kiến trúc modular monolith: `src/modules/<domain>` + `src/lib/core`; nghiệp vụ ghi sổ nằm trong RPC Postgres, RLS bật toàn bộ.
- Phân quyền: route/API dùng client Supabase của người dùng (publishable key + cookie), quyền do RLS/RPC quyết định;
  PDF export kiểm tra thêm permission ứng dụng + `branch_id`. Không thấy route API nào gọi DB bằng secret key ngoài 2 chỗ có chủ đích
  (`src/lib/auth/actions.ts`, `src/modules/portal/evidence-storage.ts`).
- `/api/qa/environment` trả 404 nếu không bật cờ QA — không lộ ở Production.
- Không phát hiện secret/khóa/JWT/mật khẩu DB bị commit (quét `sb_secret_`, JWT, chuỗi kết nối Postgres cloud).
- Guard môi trường tốt: DB client và `assert-local-db` chỉ cho localhost; Supabase config chặn cloud nếu thiếu cờ phê duyệt.

## 3. Phát hiện

### 3.1 `pnpm db:test:isolated` hỏng (Trung bình)
Harness PGlite (`scripts/test-r2-database.mjs`) không tạo schema `extensions` và không có `extensions.gen_random_uuid()` /
`extensions.digest()` mà các migration từ `20261009173806_secure_operational_posting_gate.sql` trở đi sử dụng.
Bước này không nằm trong CI nên lỗi không bị phát hiện. Đề xuất: hoặc dựng shim `extensions` trong harness, hoặc bỏ script
và dùng `pnpm db:reset && pnpm db:test` (Supabase CLI + Docker) làm kiểm tra DB chuẩn.

### 3.2 Tài liệu agent phình to, khó dùng cho phiên mới (Trung bình)
`implementation.md` ~470KB, `Spec.md` ~118KB, `tasks.md` ~90KB; nhiều đoạn log dày đặc, nhiều dòng bị dính chữ.
`TASK-010` trong `tasks.md` vẫn ghi trạng thái 05/10 trong khi `main` đã qua PR #44–#49. Đề xuất: Owner xác nhận lại
`TASK-010` và tách phần nhật ký cũ của `implementation.md` sang lưu trữ.

### 3.3 Repo chứa nhiều bằng chứng QA (Thấp)
`reports/` ~48MB (ảnh chụp, JSON catalog), `.git` ~40MB. 68 file chứa đường dẫn máy cá nhân `/Users/nox/...`
(kể cả `qa/environment.example`: `HX_QA_CA_FILE=/Users/nox/...`). Không phải bí mật nhưng làm repo nặng và lộ cấu trúc máy.
Đề xuất: lưu bằng chứng mới ngoài repo (hoặc Git LFS/Release asset).

### 3.4 Vercel auto-deploy theo tên nhánh (Thấp — đã xử lý)
`vercel.json` tắt deploy theo từng nhánh `codex/...` cụ thể; nhánh mới của Claude (`claude/*`, `nox/*`) sẽ tự tạo preview.
Đã thêm pattern `codex/*`, `claude/*`, `nox/*` = `false` để giữ nguyên chính sách. Cần xác nhận trên Vercel sau lần push đầu.

### 3.5 CI và môi trường dev lệch phiên bản (Thấp)
CI dùng Node 24 + pnpm 11; `package.json` không khai báo `packageManager`/`engines`. Đề xuất thêm để mọi môi trường dùng cùng phiên bản.

### 3.6 Tài liệu gọi đích danh "Codex" (Thông tin)
`Spec.md` SPEC-006 và nhiều mục khác viết "Codex phải…". `CLAUDE.md` mới tuyên bố các quy tắc này áp dụng cho Claude Code;
không sửa `Spec.md` vì SPEC-DOC-003. Nếu Owner muốn, có thể đổi thành "tác nhân lập trình" trong một PR tài liệu riêng.

## 4. Đã làm trong lần chuyển giao này

- `CLAUDE.md`: hướng dẫn dự án cho Claude Code (thứ tự tài liệu, lệnh, kiến trúc, quy ước, ranh giới an toàn Production/QA),
  vẫn import `AGENTS.md` (khối do `next dev` quản lý).
- `vercel.json`: chặn auto-deploy cho `codex/*`, `claude/*`, `nox/*`.
- `.gitignore`: bỏ qua `.claude/settings.local.json`.

## 5. Việc cần Owner quyết định

1. Tạo `.claude/settings.json` (allowlist lệnh `pnpm lint/test/typecheck/build`, deny đọc `.env*`, deny `supabase db push`)
   và SessionStart hook chạy `pnpm install` cho phiên cloud — cần Owner cho phép vì đây là cấu hình quyền của chính Claude.
2. Sửa hay bỏ `db:test:isolated` (3.1).
3. Dọn `reports/` / nhật ký tài liệu (3.2, 3.3).
