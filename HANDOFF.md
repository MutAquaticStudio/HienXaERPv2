# HANDOFF — Hiền Xa ERP V2 (cập nhật 01/11/2026)

Tài liệu bàn giao cho phiên làm việc tiếp theo (Claude Code hoặc người). Đọc kèm `CLAUDE.md` (quy tắc bắt buộc), `Spec.md` (D1–D43), `tasks.md`, `implementation.md` (nhật ký, rất dài — grep theo mã D/FB).

## 1. Trạng thái phát hành

| Môi trường | Địa chỉ | Supabase | Code |
|---|---|---|---|
| Production | https://hien-xa-erp-v2-nu.vercel.app (sắp: https://app.hienxavlxd.com) | `nbwynrwkdbtfsitafsxa` | `main` @ `be77319` (#77–#80, 01/11), deploy `dpl_3Mp8vAXA9DgpHj2gY2aR3wnAEhxv` |
| QA (nghiệm thu) | Preview nhánh `nox/elegant-volta-kr29iz` → https://qa.hienxavlxd.com (chờ DNS) | `ffrwiglcrlumfvhubaxg` | preview từ `main` @ `be77319`: `dpl_DWFskr3GFDGerWQNRkJAftjhuFDx` (https://hien-xa-erp-v2-kzdwmk4wf-hienxa.vercel.app, cần đăng nhập Vercel) |

- Vercel: team `team_9qd9uzBYBc6WtzJVu7wGP7uC`, project `prj_o6ya9YI1b3fTFC8nxiOtjHiwaS3W`. Auto-deploy tắt (`vercel.json`); deploy bằng `create_deployment` (gitSource org `MutAquaticStudio`, repo `HienXaERPv2`, ref `main`, target `production`).
- Preview dùng env QA (`HX_QA_PROJECT_REF`). Preview bị Vercel SSO Protection chặn với người ngoài → dùng tên miền riêng `qa.hienxavlxd.com` (đã gắn vào nhánh `nox/elegant-volta-kr29iz`; mọi push lên nhánh này cập nhật bản QA).
- Migration mới nhất trên cả QA và Production: `20261101120000_revoke_rls_auto_enable` (ghi `schema_migrations` kèm sha256 file).

## 2. Quy trình phát hành đã dùng

1. Nhánh `nox/elegant-volta-kr29iz` → `pnpm check` + `HX_TEST_PG_URL=postgres://postgres@127.0.0.1:5432/postgres pnpm db:test:isolated` (PG16: `pg_ctlcluster 16 main start`) → PR → CI (`phase-gate`, `db-migrations`) xanh → squash-merge.
2. Áp migration qua MCP Supabase `execute_sql` lên QA rồi Production, mỗi file một transaction, kèm `insert into supabase_migrations.schema_migrations(version,name,statements) values (..., array['sha256:<sha256 file>'])`; so md5 `prosrc` với DB tham chiếu cục bộ nếu có hàm.
   - Lệnh có `delete`/`truncate` → Supabase hỏi xác nhận Owner (hết hạn 2 phút). Owner phải bấm đồng ý trên web/desktop.
   - Ghi vào bảng nghiệp vụ cần giả lập nhân viên: `perform set_config('request.jwt.claim.sub', '<auth user id>', true)` (trigger `enforce_operational_write`).
3. Deploy Production, kiểm `/api/health` (`buildSha`) bằng `web_fetch_vercel_url`.
4. Sau squash-merge: `git merge origin/main` vào nhánh (không force-push).

## 3. Việc đang chờ Owner

| # | Việc | Ghi chú |
|---|---|---|
| 1 | **DNS trên Wix** (hienxavlxd.com): CNAME `app` → `cname.vercel-dns.com`; TXT `_vercel` = `vc-domain-verify=app.hienxavlxd.com,e2824af71a8c79cb3118`; CNAME `qa` → `cname.vercel-dns.com`; TXT `_vercel` = `vc-domain-verify=qa.hienxavlxd.com,49c900573f2976093e99` | Xong thì `verify_project_domain` cho cả 2 tên miền |
| 2 | Sau DNS: Vercel env `NEXT_PUBLIC_APP_URL` Production → `https://app.hienxavlxd.com`; preview (nhánh QA) → `https://qa.hienxavlxd.com`; redeploy | Agent làm |
| 3 | Supabase Auth → URL Configuration (Production + QA): Site URL và Redirect URLs tên miền mới (`/**`) | Owner tự làm trong dashboard |
| 4 | SePay webhook `https://app.hienxavlxd.com/api/payments/sepay` (HMAC) + Vault secret `hx_sepay_webhook_secret` (Production) + Sổ quỹ: quỹ ngân hàng "Hiện cho khách" + "Tự ghi tiền về (SePay)" | D42 đã phát hành, chờ cấu hình |
| 5 | `ANTHROPIC_API_KEY` (Sensitive, Production) trên Vercel cho trợ lý AI → redeploy | |
| 6 | **Dữ liệu Production chưa đủ**: 59 vật tư đang bán **chưa có giá bán chung** (cổng khách vì vậy trống "Cửa hàng chưa mở bán mặt hàng nào") và **chưa có giá mua NCC**. **01/11: đã dọn sạch đơn/giao/kho/thu chi** (xem `implementation.md` mục 2026-11-01) → tồn = 0, cần nhập tồn đầu thật bằng phiếu kiểm kho mới. Sao lưu ở schema `hx_cleanup_backup_20261101` (xóa khi Owner đồng ý). | Owner nhập ở Kho → Giá bán và Nhà cung cấp → Giá mua, hoặc gửi bảng giá để agent nhập (ghi Production cần Owner đồng ý) |
| 7 | Quyết định thay đổi "Giá vốn bình quân" trên trang chi tiết vật tư | Xem §5 |

## 4. QA cho khách nghiệm thu

- Đã dọn 31/10: còn 1 chi nhánh "Hiền Xa – Chi nhánh chính" (HXQA-A), nhân viên "Chủ doanh nghiệp" (`hxqa-owner@example.test`), "Thợ 01" (`hxqa-worker@example.test`, vai trò `builtin_worker`), khách KH01 "Công ty TNHH Xây dựng An Phát" (cổng khách `hxqa-finance@example.test`, role OWNER).
- Mật khẩu tạm đã gửi Owner trong chat (không lưu trong repo). Quên → đặt lại bằng `update auth.users set encrypted_password = extensions.crypt('<mật khẩu>', extensions.gen_salt('bf'))` trên QA.
- Dữ liệu mẫu: Kho chính; Xi măng Hà Tiên PCB40 (kg, 1 bao = 50 kg, 400 bao, 92.000 ₫/bao), Cát vàng (m³, 100, 410.000 ₫), Thép D10 (cây, 500, 160.000 ₫); NCC01 Phú Thành (có giá mua); xe 51C-123.45 (5 tấn, tài xế Thợ 01); quỹ Tiền mặt + Ngân hàng Vietcombank (chưa bật SePay). Đơn vị cũ của dữ liệu thử đã đặt `active=false`.
- Tài liệu nghiệm thu đã gửi Owner (Word + PDF): kịch bản nghiệm thu 108 bước/16 phân hệ + biên bản; HDSD Văn phòng / Thợ / Khách; hướng dẫn DNS. Nguồn dựng (docx-js + ảnh) nằm ở scratchpad phiên cũ, **không** trong repo — cần xuất lại với địa chỉ `qa.hienxavlxd.com` nếu Owner yêu cầu.

## 5. Việc dở

- **Giá vốn bình quân trên trang chi tiết vật tư** — chưa merge, chờ Owner duyệt. Patch: `docs/handoff/wip-gia-von-binh-quan.patch` (`git apply docs/handoff/wip-gia-von-binh-quan.patch`).
  - `loadMaterialDetail` thêm quyền `cost` (`inventory.read` + `inventory.cost.read`) và `averageCost()` (giá trị tồn / số tồn); trang `/admin/products/[id]` hiện "Giá vốn bình quân" và chú thích ở "Giá mua theo nhà cung cấp"; test trong `material-detail.test.ts` (19/19 xanh). Chưa chạy `pnpm check` toàn bộ.
- Mục để sau (cần đổi dữ liệu cổng / migration): tên tài xế + biển số trên thẻ đơn của khách; ngày chi trả trên phiếu lương thợ.

## 6. Ràng buộc quan trọng (tóm từ CLAUDE.md)

- Production `nbwynrwkdbtfsitafsxa`: không ghi/migrate/xóa khi chưa có lệnh rõ ràng của Owner trong phiên.
- `SUPABASE_SECRET_KEY` chỉ ở `src/lib/auth/actions.ts`, `src/modules/portal/evidence-storage.ts`, `src/app/api/payments/sepay/route.ts`. Không giải mã env Vercel; không xin khóa trong chat.
- Không commit `.env*`, khóa, mật khẩu. Migration forward-only + test native. Giao diện tiếng Việt.
- Commit kèm footer `Co-Authored-By` / `Claude-Session` theo hướng dẫn phiên.
