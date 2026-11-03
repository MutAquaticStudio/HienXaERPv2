# HANDOFF — Hiền Xa ERP V2 (cập nhật 03/11/2026)

Tài liệu bàn giao cho phiên làm việc tiếp theo (Claude Code hoặc người). Đọc kèm `CLAUDE.md` (quy tắc bắt buộc), `Spec.md` (D1–D52), `tasks.md`, `implementation.md` (nhật ký, rất dài — grep theo mã D/FB hoặc ngày).

## 0. Phiên 03/11/2026 (PR #94–#97, tất cả đã lên Production)

| PR | Nội dung | Migration |
|---|---|---|
| #94 | Ghi lỗi gốc của trợ lý AI vào log Vercel (`[ai] Claude API error {status, type, requestId, message}`, không ghi khóa); câu báo lỗi rõ hơn (mất kết nối / cấu hình yêu cầu / Claude gián đoạn) | — |
| #95 | **Sửa trợ lý AI báo lỗi mọi câu hỏi**: Claude API trả 400 "The compiled grammar is too large… reduce the number of strict tools" (người đủ quyền nhận 19 công cụ `strict`). Bỏ `strict` ở công cụ soạn thao tác D37 (zod trong `prepare` vẫn kiểm); chỉ `doc_du_lieu`, `tao_de_xuat` còn strict; test chặn tái diễn | — |
| #96 | **D50**: trong khung chat chọn mô hình (Sonnet 5.5 mặc định / Opus 5.5 / Haiku 5.5 — Haiku không gửi `fallbacks`) + "Mức suy nghĩ" (effort Thấp → Tối đa, mặc định Vừa) + đính kèm tệp (ảnh / PDF / Excel / CSV / TXT, 5 tệp, 3,5 MB, không lưu, lịch sử chỉ ghi "📎 tên tệp"; `serverActions.bodySizeLimit = 4mb`); chi phí tháng theo giá từng mô hình; **khóa API Claude ở Cài đặt → Trợ lý AI** (`/admin/settings/ai`, `ai.manage`; thử khóa với Claude trước khi lưu; Vault `hx_anthropic_api_key`; máy chủ đọc bằng service role ở `src/modules/ai/api-key.ts` — Owner cho phép; chưa nhập thì dùng `ANTHROPIC_API_KEY`) | `20261103100000` |
| #97 | **Sổ tay nghiệp vụ** cho trợ lý (`src/modules/ai/handbook.ts` + `handbook-states.ts`: mọi quy trình — màn hình, nút, quyền, ghi gì vào sổ — và mã trạng thái kèm nhãn; khối system thứ hai, cache chung); thao tác soạn sẵn **"Gán phiếu giao"** (`soan_gan_phieu_giao`, chạy `assign_delivery_scheduled` như "Gán nhanh"); khung chat gọn (bỏ dải giới thiệu, viên chọn mô hình / mức suy nghĩ, nút "Cuộc trò chuyện mới" dạng biểu tượng, cửa sổ nhỏ nút Gửi dạng biểu tượng) | — |

Sau #98 (cùng ngày): **D51** — báo khách qua Zalo bằng nút "Gửi qua Zalo" do nhân viên bấm gửi (miễn phí), thay tin mẫu ZBS tốn phí: `src/modules/zalo/customer-messages.ts` (4 mẫu tin: xác nhận đơn, đã giao, đã nhận tiền, nhắc nợ + `zaloChatLink`), `src/components/zalo/send-to-customer.tsx`; gắn ở đơn bán đã xác nhận, phiếu giao đã xác minh, hồ sơ khách → Công nợ & thanh toán. Không migration. Giá vốn bình quân: Owner 03/11 "tạm để sau".

**D52** (cùng ngày, Owner chọn "giống KiotViet"): thiết kế lại mẫu in — khuôn chung `src/lib/pdf/print-document.ts` (A4 / A5 ngang / K80 cắt theo nội dung, font Noto Sans thường + đậm `public/fonts/NotoSans-Bold.ttf`), nội dung từng loại ở `print-builders.ts`, dữ liệu phụ (tài khoản "Hiện cho khách", QR VietQR qua vietqr.app, nợ mở, tên chứng từ) ở `print-data.ts`. Đơn bán A4 + `?kho=k80` (nợ cũ, tổng nợ, QR); phiếu giao, đơn đặt hàng, đối chiếu công nợ A4; phiếu thu/chi A5 + `?kho=k80`. Báo giá (tắt) và rà soát hóa đơn (tắt) vẫn dùng khuôn cũ (`business-document.ts`, `standard-document.ts`).

Ghi chú cho phiên sau:
- Thêm công cụ soạn thao tác mới thì **phải** nhắc tên công cụ trong sổ tay (test `src/modules/ai/handbook.test.ts` đỏ nếu quên) và tránh `strict: true` (giới hạn grammar của API).
- Đổi sổ tay / hướng dẫn hệ thống làm mất cache lần đầu (khoảng 8 nghìn token), sau đó cache lại.
- Gói Vercel Hobby chỉ giữ runtime log **1 giờ**: muốn tra lỗi thì nhờ Owner thao tác rồi đọc ngay (`get_runtime_logs`, `since: "30m"`, `query: "[ai]"`). Lượt hỏi AI ghi ở `ai_usage_log` (model, outcome, token).
- Đổi env `NEXT_PUBLIC_*` phải deploy lại (giá trị gắn lúc build). Sau mỗi deploy nhắc người dùng F5 (tab cũ báo "Failed to find Server Action").
- Postgres cục bộ trong container: `pg_ctlcluster 16 main start`; nếu `db:test:isolated` báo `28P01` (sai mật khẩu) thì đổi `127.0.0.1/32 scram-sha-256` → `trust` trong `/etc/postgresql/16/main/pg_hba.conf` rồi `pg_ctlcluster 16 main reload` (container tạm, giống CI).
- Lệnh `git push --force-with-lease` bị chặn trong phiên: sau khi PR squash-merge thì `git merge origin/main` vào nhánh (không force-push).
- `regex {m,n}` trong Postgres giới hạn n ≤ 255.

## 1. Trạng thái phát hành (03/11/2026)

| Môi trường | Địa chỉ | Supabase | Code | Migration mới nhất |
|---|---|---|---|---|
| Production | https://app.hienxavlxd.com (đã xác minh; tên cũ https://hien-xa-erp-v2-nu.vercel.app vẫn chạy) | `nbwynrwkdbtfsitafsxa` | `main` @ `0cd3293`, deploy `dpl_4ytiQLGaAumnA7WFuZSktnsic5kT` | `20261103100000_d50_ai_api_key` |
| QA (nghiệm thu) | Preview từ `main` @ `57b4bff` (**chưa** deploy lại bản 03/11): `dpl_C6ddHam7vy5AYgtbgEZfuWmngzff` (https://hien-xa-erp-v2-p5su7q7iz-hienxa.vercel.app, cần đăng nhập Vercel). Owner 03/11: **không cần** tên miền `qa.hienxavlxd.com` nữa | `ffrwiglcrlumfvhubaxg` | `main` @ `57b4bff` | `20261103100000_d50_ai_api_key` |

- Kiểm phiên bản: `GET /api/health` → `buildSha` (dùng `web_fetch_vercel_url` cho bản preview có bảo vệ).
- Vercel: team `team_9qd9uzBYBc6WtzJVu7wGP7uC`, project `prj_o6ya9YI1b3fTFC8nxiOtjHiwaS3W`. Auto-deploy tắt (`vercel.json`); deploy bằng `create_deployment` (gitSource `{type: github, org: MutAquaticStudio, repo: HienXaERPv2, ref: main, sha}`; `target: production` cho Production, bỏ `target` cho bản QA preview).
- Preview dùng env QA (`HX_QA_PROJECT_REF`…). Preview **chưa có** `SUPABASE_SECRET_KEY` của QA → thợ không tải được ảnh trên QA (luồng giao hàng – xác nhận giao – công nợ chưa thử được trên QA). Preview cũng chưa có SMTP / `HX_AUTOMATION_SECRET`.
- Lịch sử `schema_migrations`: 9 migration của 01–03/11 khớp repo (version + sha256) trên cả hai DB. Lệch **cũ** (tháng 9–10, đã ghi trong `implementation.md` 16/10): Production thiếu tên riêng của 9 version cũ vì đã áp gộp trong `pr44_reviewed_schema187_compact_forward_20261013`, `operational_role_presets` mang version `20261013121739`, có bản dọn `owner_authorized_uat_cleanup_20261013`; QA ghi `retire_opening_pending_rule` dưới `20261014074344` (repo `20261012155947`) và có bản vá riêng `20261002114730`. Chỉ lệch số hiệu/tên ghi lại, không thiếu nội dung. Muốn khớp từng dòng thì thêm bản ghi đối chiếu (ghi Production cần Owner đồng ý).

## 2. Đã làm trong phiên 01–02/11 (PR #77–#93, tất cả đã lên QA + Production)

| PR | Nội dung | Migration |
|---|---|---|
| #77, #78 | Sửa hàng loạt, xuất CSV, phân trang; bảng "Chờ điều phối" gọn + **Gán nhanh**; bản đồ mở ở Đại Mỗ | — |
| #79 | Logo doanh nghiệp thay chữ HX; đổi chi nhánh nhanh trên thanh trên | — |
| #80 | Đăng xuất chỉ phiên hiện tại (`signOut({scope:"local"})`, sửa lỗi "tự đăng xuất"); thu hồi `rls_auto_enable` | `20261101120000` |
| #81 | **D44** QR trả nhiều khoản nợ (phiếu yêu cầu thanh toán, mã `YC…`, SePay nhận mã) | `20261101150000` |
| #82 | **D45** trả tiền mặt cho các khoản đã chọn, kế toán **Xác nhận đã thu** (Sổ quỹ → Chờ thu tiền mặt) | `20261101170000` |
| #83 | Sửa: yêu cầu thanh toán theo kịp tiền trả bằng chứng từ khác; bộ QA toàn hệ thống | `20261102090000` |
| #84 | Menu không chồng chữ ở 1280–1600 px khi mở khung liên hệ | — |
| #85 | **D46** tách phiếu giao 2–5 phiếu (chia dòng/số lượng, chọn người/xe/giờ từng phiếu); bảng Chờ điều phối không đẩy nút Gán ra ngoài | `20261102120000` |
| #86 | Tách phiếu bị từ chối không làm nhảy số DL/WRK (chạy thử rồi mới cấp số) | `20261102140000` |
| #87 | Kịch bản D46 trong bộ QA; kết quả QA lại | — |
| #88 | **D47** Zalo OA giai đoạn 1 (code xong, **chưa kết nối**) | `20261102160000` |
| #89 | Viết lại HANDOFF này | — |
| #90 | Kiểm tra UX/UI tự động (Stageshow `auditLayout`, 33 trang máy tính + trang điện thoại/cổng): Sổ quỹ di động hết tràn ngang, chữ dài trong bảng xuống dòng (`td.cell-wrap`), chỉ số tài chính 4→2→1 cột, ô số liệu 2 cột trên điện thoại; cổng thợ/khách hiện logo công ty, nút đăng xuất chỉ biểu tượng ≤420 px; **chuyển động** theo UX-UI-R1-001 (khối trang hiện lần lượt ở cổng, vạch menu dưới trượt, nhấn co nhẹ, mũi tên mở dòng xoay; tắt khi giảm chuyển động) | — |
| #92 | **D48** cổng khách dùng một nhãn "Đã duyệt" cho mọi đơn đã xác nhận (bỏ "Đã xác nhận" của đơn doanh nghiệp lập) | — |
| #93 | Trau chuốt màn đăng nhập / đăng ký / khôi phục (khung D30 giữ nguyên): nền gạch xếp so le, tab có nền trượt, ô nhập có biểu tượng, nút/thẻ có bóng; **D49** logo công ty trên màn đăng nhập (anon chỉ đọc 3 cột logo của `company_profile`) | `20261102180000` |

Chi tiết quyết định: `Spec.md` D44–D49. Kế hoạch: `docs/handoff/ke-hoach-qr-nhieu-don.md` (D44/D45), `docs/handoff/ke-hoach-zalo-oa.md` (D47). Kết quả QA: `docs/qa/kich-ban-qa-toan-he-thong.md`.

## 3. Quy trình phát hành đã dùng

1. Làm trên nhánh được giao → `pnpm check` + test DB native (`pg_ctlcluster 16 main start`; `HX_TEST_PG_URL=postgres://postgres@127.0.0.1:5432/postgres pnpm db:test:isolated`; nếu báo "database already exists" thì `drop database hx_native_*` còn sót). Migration mới luôn kèm `supabase/tests/native/3xx_*.sql`.
2. PR → CI (`phase-gate`, `db-migrations`) xanh → squash-merge → `git merge origin/main` vào nhánh (không force-push).
3. Áp migration qua MCP Supabase `execute_sql` lên **QA trước**, rồi Production khi Owner duyệt: nguyên văn file trong **một transaction** + `insert into supabase_migrations.schema_migrations(version,name,statements) values (..., array['sha256:<sha256 file>'])`. Kiểm lại version + đối tượng sau khi áp.
   - Câu lệnh lớn/có `drop`/`alter` → Supabase hỏi xác nhận Owner, hết hạn **2 phút**. Báo Owner trước để bấm "Allow"; hết giờ thì database **không đổi** (cả transaction) — gửi lại.
   - Ghi bảng nghiệp vụ khi giả lập: `set_config('request.jwt.claim.sub', '<auth user id>', true)` (trigger `enforce_operational_write`).
4. Deploy (Production / preview QA) → kiểm `/api/health` `buildSha`.
5. Soát giao diện: `next start` cục bộ nối QA (`.env` QA ở scratchpad, không commit) + Playwright `scripts/qa/system-qa` (xem README trong thư mục).

## 4. Việc đang chờ Owner

| # | Việc | Ghi chú |
|---|---|---|
| 1 | ✅ 03/11: `app.hienxavlxd.com` đã xác minh trên Vercel; **không cần** `qa.` nữa (Owner 03/11). Cũ: **DNS trên Wix** (hienxavlxd.com): CNAME `app` → `cname.vercel-dns.com`; TXT `_vercel` = `vc-domain-verify=app.hienxavlxd.com,e2824af71a8c79cb3118`; CNAME `qa` → `cname.vercel-dns.com`; TXT `_vercel` = `vc-domain-verify=qa.hienxavlxd.com,49c900573f2976093e99` | Xong thì `verify_project_domain` cho cả 2 |
| 2 | ✅ 03/11 Owner đã đổi + deploy lại. Cũ: Sau DNS: Vercel env `NEXT_PUBLIC_APP_URL` Production → `https://app.hienxavlxd.com` (cần cho callback Zalo); redeploy | Agent làm |
| 3 | ✅ 03/11 Owner báo đã xong. Cũ: Supabase Auth → URL Configuration (Production + QA): Site URL + Redirect URLs tên miền mới (`/**`) | Owner làm trong dashboard |
| 4 | ⏸ 03/11 Owner: tạm thời chưa. **SePay Production** (QR tự xác nhận, D42/D44): webhook `https://<tên miền>/api/payments/sepay` + Vault `hx_sepay_webhook_secret` + Sổ quỹ: quỹ ngân hàng "Hiện cho khách" + "Tự ghi tiền về (SePay)". Chưa cấu hình thì khách chỉ thấy "Trả tiền mặt tại cửa hàng" (D45 dùng được ngay) | Owner chọn để sau |
| 5 | ⏸ 03/11 Owner chọn **D51** (nhân viên bấm "Gửi qua Zalo", miễn phí) thay tin mẫu ZBS tốn phí; kết nối ZBS chỉ cần nếu sau này muốn tự động. Cũ: 🔄 03/11 Owner đang kiểm tra kết nối (`NEXT_PUBLIC_APP_URL` = `https://app.hienxavlxd.com` đã đúng; lỗi nào → đọc `src/modules/zalo/presentation.ts`). **Zalo OA giai đoạn 0** (D47): Zalo App (App ID; Secret Key → Vault `hx_zalo_app_secret`; Callback URL `https://<tên miền>/api/zalo/oauth/callback`), tiện ích `http` đã bật sẵn trên QA/Production, ví ZBS, đăng ký 4 mẫu tin đúng tên tham số → Cài đặt → Zalo OA → Kết nối → nhập mã mẫu → Gửi thử → chuyển "Khách thật" | Hướng dẫn: `docs/handoff/ke-hoach-zalo-oa.md` mục 6 |
| 6 | ⏳ 03/11 chưa làm. Thêm `SUPABASE_SECRET_KEY` **của QA** vào Vercel env **Preview** (Sensitive) → redeploy QA | Để thử luồng thợ chụp ảnh – giao – xác nhận trên QA |
| 7 | ✅ 03/11 trợ lý chạy được. Từ D50 khóa đổi ở Cài đặt → Trợ lý AI (không cần Vercel) | |
| 8 | 🔄 03/11 Owner đang chuẩn bị bảng giá (mã vật tư, giá bán chung, ĐVT, giá mua + NCC); agent đối chiếu 59 vật tư trước, chỉ ghi Production khi Owner đồng ý. **Dữ liệu Production chưa đủ**: 59 vật tư chưa có giá bán chung (cổng khách trống), chưa có giá mua NCC; 01/11 đã dọn sạch giao dịch thử (tồn = 0) → cần nhập tồn đầu thật bằng phiếu kiểm kho. Sao lưu ở schema `hx_cleanup_backup_20261101` (xóa khi Owner đồng ý) | Owner nhập hoặc gửi bảng giá để agent nhập (cần đồng ý) |
| 9 | ⏸ 03/11 Owner: tạm để sau. Quyết định "Giá vốn bình quân" trên trang chi tiết vật tư | Xem §6 |
| 10 | ⏸ 03/11 Owner: kiểm tra Zalo OA (mục 5) trước. Quyết định cách cho **webhook Zalo** (báo "khách đã nhận tin", khách nhắn lại) gọi vào hệ thống — bộ kiểm bảo mật cấm `anon` gọi hàm SECURITY DEFINER; SePay dùng khóa service (D42) | Giai đoạn 2 Zalo |

## 5. QA cho khách nghiệm thu

- Chi nhánh "Hiền Xa – Chi nhánh chính"; nhân viên "Chủ doanh nghiệp" (`hxqa-owner@example.test`), "Thợ 01" (`hxqa-worker@example.test`); khách KH01 "Công ty TNHH Xây dựng An Phát" (cổng khách `hxqa-finance@example.test`, OWNER).
- Mật khẩu 3 tài khoản thử **đã đổi 02/11** khi chạy QA tự động; chỉ lưu ở scratchpad phiên, không trong repo. Quên → đặt lại: `update auth.users set encrypted_password = extensions.crypt('<mật khẩu>', extensions.gen_salt('bf')) where email = '…'` trên QA.
- Dữ liệu thử phát sinh 01–02/11: đơn SO-2026-000075…079, phiếu giao DL-030…041 (DL-038 đã tách thành 039/040/041; DL-033/034 trống số từ trước bản sửa), PO-072, yêu cầu thanh toán YC…, phiếu thu REC-074/075; quỹ Vietcombank QA bật SePay + Vault QA `hx_sepay_webhook_secret` (khóa thử). DL-030/031 có công nợ chèn tay (xác minh giả) nên **không tách/giao được** — dùng đơn mới khi thử.
- QA đang có xe chưa xác nhận sức chở → tự điều phối báo "chưa có xe…"; phân xe tay hoặc xác nhận sức chở trong danh mục Xe.
- Bộ QA tự động: `scripts/qa/system-qa` (`smoke.mjs` mọi màn hình, `layout.mjs`/`menuprobe.mjs` bố cục, `e2e.mjs` luồng đầu-cuối; `node e2e.mjs "Tách phiếu"` chạy riêng D46). Lần chạy gần nhất 02/11: 65/68 màn (3 màn 404 đúng thiết kế), 10/10 bước.

## 6. Việc dở / đề xuất tiếp theo

- **QA preview** vẫn ở `57b4bff` (DB QA đã có migration D50): deploy preview từ `main` mới khi cần nghiệm thu D50 trên QA (preview chưa có khóa Claude → dùng Cài đặt → Trợ lý AI để nhập khóa thử).
- **Giá vốn bình quân trên trang chi tiết vật tư** — chưa merge, chờ Owner. Patch `docs/handoff/wip-gia-von-binh-quan.patch` (`git apply …`); chưa chạy `pnpm check` toàn bộ.
- **Zalo giai đoạn 2**: webhook (sau quyết định §4.10), chat hai chiều qua OA, gửi QR/yêu cầu thanh toán D44 qua Zalo.
- Kiểm tra bố cục lần sau: skill Stageshow (`benjitaylor/skills`) chỉ cài trong phiên (02/11, 03/11), không có trong repo. Cài lại: `git clone --depth 1 https://github.com/benjitaylor/skills` → chép `skills/stageshow` vào `~/.claude/skills/`; chạy `auditLayout` cần `ln -s /opt/node-tools/node_modules/playwright-core <skill>/node_modules/playwright-core` và `CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/layout.mjs <url> --width 390`. Hoặc dùng `scripts/qa/system-qa/layout.mjs`.
- Trợ lý AI: chưa có công cụ tổng hợp (đếm / cộng / nhóm) — `doc_du_lieu` tối đa 50 dòng nên câu "tổng doanh thu tháng" có thể thiếu; chưa có công cụ tìm chung theo tên / mã và bộ câu hỏi chấm điểm (Owner 03/11 chỉ chọn sổ tay nghiệp vụ trước).
- UX nhỏ: tự điều phối nên nói rõ "xe chưa xác nhận sức chở"; cửa sổ QR D44 nên gộp các dòng "Số dư đầu kỳ"; dòng "Đã gửi Zalo · đã nhận" trên chứng từ (cần webhook).
- Để sau (cần đổi dữ liệu cổng / migration): tên tài xế + biển số trên thẻ đơn của khách; ngày chi trả trên phiếu lương thợ.

## 7. Ràng buộc quan trọng (tóm từ CLAUDE.md)

- Production `nbwynrwkdbtfsitafsxa`: không ghi/migrate/xóa khi chưa có lệnh rõ ràng của Owner trong phiên.
- `SUPABASE_SECRET_KEY` chỉ ở `src/lib/auth/actions.ts`, `src/modules/portal/evidence-storage.ts`, `src/app/api/payments/sepay/route.ts`, `src/modules/ai/api-key.ts` (D50, chỉ đọc khóa Claude trong Vault). Không giải mã env Vercel; không xin khóa trong chat; khóa/token Zalo, SePay nằm trong Supabase Vault.
- Không commit `.env*`, khóa, mật khẩu. Migration forward-only + test native. Giao diện tiếng Việt.
- Commit kèm footer `Co-Authored-By` / `Claude-Session` theo hướng dẫn phiên; không ghi tên model vào commit/PR.
