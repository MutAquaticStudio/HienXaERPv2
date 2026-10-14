# Nhật ký kiểm chứng SO/PO bulk import

Ngày thực hiện: 14/10/2026. Mọi ghi dữ liệu kiểm thử chỉ xảy ra trong database PostgreSQL cục bộ do harness tự tạo; không có truy cập QA/Production.

| Bước | Môi trường/phiên bản | Thao tác và kỳ vọng | Kết quả thực tế | Bằng chứng |
|---|---|---|---|---|
| Baseline | Worktree riêng; base `013093134d16d4157d761a748090933a2cd6fc87` | Xác định code mới nhất, bảo toàn checkout gốc | HEAD/base xác nhận; PR49 đã merge; checkout gốc giữ HEAD `79b0b918…`, 128 mục Git status | `BASELINE_AND_DECISIONS.md`, `ORIGINAL_PRESERVATION_BASELINE.json` (snapshot lịch sử) |
| Native upgrade/fresh | PostgreSQL 17.11 local, temporary owned DBs | Áp dụng 189 migration nền + hai migration mới theo thứ tự; so sánh function/ACL giữa upgrade và fresh; dọn DB | PASS; mọi DB tạm bị xóa | `PR2_NATIVE_MIGRATION.json`; migration SHA trong đó |
| Draft recovery | Local PostgreSQL/Auth shim | SO/PO lưu intent, actor/branch/payload binding, retry và canonical RPC | PASS; giữ nguyên ACL public cũ; không thể replay intent của người khác hoặc payload khác | `PR2_NATIVE_MIGRATION.json` |
| Bulk lifecycle | Local PostgreSQL/Auth shim/Storage table mock | Mặc định tắt; tạo lượt+tệp nguyên tử; private actor boundary; lưu review; duplicate/race/repeat; partial/resume; hết hạn; từ chối đọc/verify sau expiry | PASS: 23 kiểm tra | `PR2_NATIVE_MIGRATION.json` |
| Kế toán/kho | Local PostgreSQL, SO/PO nháp | Đo số lượng movement/reservation/AR/AP/payment/allocation/revenue/supply ledger trước/sau | Các số đếm không đổi; không sinh opening state | `PR2_NATIVE_MIGRATION.json`, check `DRAFTS_NO_STOCK_AR_AP_CASH_ALLOCATION_OR_FAKE_OPENING` |
| Parser | Local unit tests | 5 trường hợp XLSX parser; giới hạn, định dạng và nội dung không an toàn | PASS 5/5 | `pnpm exec vitest run src/modules/bulk-import/xlsx-parser.test.ts` |
| Hồi quy | Worktree cuối | Chạy toàn bộ Vitest | PASS 99 files / 669 tests | Kết quả terminal lượt cuối 14/10/2026 |
| Typecheck | Worktree cuối; Next.js 16.3.8 | Tạo route types và chạy TypeScript | PASS | `pnpm typecheck` |
| Lint | Worktree cuối | ESLint toàn repo | PASS, 0 lỗi và 14 cảnh báo lint không mới trong phạm vi feature | `pnpm lint` |
| Build | Worktree cuối; Next.js 16.3.8 | Production build/static route generation | PASS; có route SO/PO import và retention | `pnpm build` |
| Advisory | Lockfile hiện tại | `pnpm audit --prod` | PASS, không advisory đã biết | `pnpm audit --prod` |
| Browser/QA thật | Chưa có môi trường QA biệt lập/tài khoản import | Kiểm tra vai trò, upload thật, refresh, mất mạng, responsive và Storage/RLS thật | CHƯA CHẠY; không giả lập PASS | Chờ cấu hình QA/Auth/Storage được cung cấp |
| CI/review/phát hành | Head `d656ed1`, PR nháp #50 | CI đúng commit, Vercel preview và trạng thái phát hành | CI run #189 PASS; một Vercel preview Ready, check project phụ bị account-blocked; PR vẫn draft, chưa review/merge/deploy | PR #50; preview link trong `DOD.md` |

## Các lỗi harness phát hiện và xử lý

1. JSON `null` bị so như SQL `NULL`, làm từ chối chứng từ `NEEDS_REVIEW`. Đã chuẩn hóa JSON null và giữ nguyên state chưa sẵn sàng.
2. RPC review gán `READY` cho chứng từ unresolved dù payload null. Đã giữ `NEEDS_REVIEW`/`INVALID`; test lưu lỗi rồi sửa sang READY.
3. Các lần gọi tạo run và đăng ký tệp tách rời có thể để lượt nhập rỗng. Đã gộp vào RPC đăng ký tệp; khi lỗi, cả run/file rollback. Private helper áp quota trong khóa đồng thời.
4. RPC upload verify có thể cập nhật sau ngày hết hạn. Đã từ chối verify/read sau expiry; native test kiểm chứng.
5. Tạo `prepare` route không ghi DB để người dùng hủy trước upload không tiêu quota.

Một lượt chạy trước các sửa này thất bại ở harness, đã được ghi và xử lý trong phiên làm việc; chỉ lượt cuối 23 checks PASS được xem là bằng chứng hiện hành.

## Giới hạn

- Native harness dùng Auth shim và bảng Storage local, không phải Supabase Auth/Storage thật.
- Không chạy browser E2E hoặc tài khoản từng vai trò; không kiểm tra mạng chập chờn thực tế.
- Không xác minh URL, schema hay backup/restore của môi trường doanh nghiệp.
- Không chạy lại hai race ứng trước 600.000đ/400.000đ.
- Không có CI/PR/Production cho ứng viên này; không tuyên bố đã phát hành.

## Kiểm tra tiếp tục sau khi nối lại task — 14/10/2026

| Kiểm tra | Kết quả |
|---|---|
| `pnpm typecheck` | PASS; Next.js tạo route types thành công. |
| `pnpm build` | PASS; có route import SO/PO, API import và cron retention. |
| `pnpm lint` | PASS; 0 lỗi, 14 cảnh báo hiện hữu ngoài phần mới. |
| `pnpm test` | Lượt chạy song song với build bị timeout 5 giây ở một test PDF cũ; test PDF chạy riêng PASS 3/3, sau đó toàn bộ suite chạy đơn lẻ PASS 99 file / 669 test. |
| `git diff --check` | PASS. |
| Native migration evidence | Hai migration SHA khớp `PR2_NATIVE_MIGRATION.json`; không sửa SQL sau lần chạy native 23 checks PASS. |
| `pnpm audit --prod` | Không làm mới được trong lượt này do kết nối registry bị `ENOTFOUND`; lần audit trước trên lockfile ứng viên báo không có advisory đã biết. |
| Checkout gốc | Vẫn branch `codex/uat-role-navigation-20260923`, HEAD `79b0b918…`, 128 mục status; không có sửa đổi từ task này. |
| GitHub PR/CI | PR nháp #50; run #188 PASS trên commit mã `9d230f62184a6816a767994cd15f1b6e4496bac0`; status `mergeable=true`, draft vẫn mở. |
| Vercel preview | `hien-xa-erp-v2` Ready tại `https://hien-xa-erp-v2-git-codex-safe-so-po-bulk-import-hienxa.vercel.app`; check `hienxa-erp-v2` bị chặn bởi tài khoản deploy. Chưa dùng preview để kết luận role UAT đạt. |
| Head cuối đã kiểm tra | `d656ed17c12634392de0538864f3f96db1550f81`; commit thứ hai chỉ cập nhật báo cáo nghiệm thu. GitHub CI run #189 hoàn tất PASS; Vercel preview deployment ID `Ef4tN1ZqVxkiHc83ZcdvF2SUMzzm` Ready. |

## Tiếp tục sau checkpoint — 14/10/2026

| Bước | Môi trường/phiên bản | Thao tác và kỳ vọng | Kết quả thực tế | Bằng chứng |
|---|---|---|---|---|
| QA discovery | Supabase read-only metadata | Xác định dự án QA tách Production và lịch sử migration hiện hành | `HienXaERPv2-QA` ref `ffrwiglcrlumfvhubaxg`, ACTIVE_HEALTHY. Danh sách remote có migration `20261002114730` mà worktree ứng viên không có; nhiều migration sau 12/10 cũng chưa có trên QA. | Supabase get_project/list_migrations, 14/10/2026 |
| QA guard | Checkout gốc, chỉ đọc cấu hình cục bộ | Xác nhận fingerprint trong .env.qa.local mà không in bí mật | PASS: project ref và URL khớp QA, khác Production. | `pnpm qa:guard`, 14/10/2026 |
| CLI rehearsal dry-run | QA, chỉ đọc | Xem migrations CLI sẽ áp dụng, không ghi DB | Lượt đầu bị chặn DNS trong sandbox. Sau khi chạy CLI được phép, dry-run báo `LegacyDbPushMissingLocalError` do phiên bản remote không có trong cây migration ứng viên; không có migration được CLI áp dụng. | Supabase CLI `db push --dry-run`, 14/10/2026 |
| QA connector migration | Supabase QA | Kiểm tra tool migration và ghi nhận phiên bản nền | Đã áp dụng migration nội dung `20261012155947_retire_opening_pending_rule.sql` vào QA. Connector ghi version `20261014074344`, không phải version của file. Dừng các migration tiếp theo; không tự sửa bảng lịch sử migration. Production không bị truy cập/ghi. | Supabase apply_migration thành công; list_migrations xác nhận `20261014074344`; dry-run CLI xác nhận lệch lịch sử |
| Browser preview | Vercel Preview, không đăng nhập | Mở màn import SO và kiểm tra môi trường | Redirect tới /login; chưa kiểm tra quyền hoặc giao dịch. GET môi trường QA bị trình duyệt chặn; không dùng tài khoản Production. | Browser tab 19, 14/10/2026 |
| QA harness | Local, worktree PR #50 | Chạy bộ QA test thuần local sau cập nhật fixture Storage và SQLSTATE | Lượt đầu phát hiện fixture thiếu schema Storage và kỳ vọng SQLSTATE cũ. Đã sửa fixture; `pnpm qa:test` PASS 32/32. | Terminal 14/10/2026 |
| XLSX parser | Local, worktree PR #50 | Hồi quy parser file nhập | PASS 5/5. | `pnpm exec vitest run src/modules/bulk-import/xlsx-parser.test.ts`, 14/10/2026 |

QA migration drift là release blocker cho mọi thao tác schema tiếp theo đến khi chủ repo đối chiếu/chuẩn hóa lịch sử nguồn; không dùng kết quả local thay thế UAT Supabase thật.
