# Phát hành và phục hồi — chưa thực hiện

## Điều kiện trước khi bật

1. Xác định và ghi nhận đúng project Supabase/Storage, Vercel project, branch và schema của môi trường QA; không suy môi trường từ preview URL.
2. Diễn tập thứ tự migration `20261014034026` rồi `20261014131000` trên snapshot DB tương ứng; kiểm tra function definitions, RLS, grants, policies và số lượng ledger trước/sau.
3. Dùng Supabase Auth/Storage QA thật để thử quyền actor/branch, upload signed URL, retry, xóa object và phục hồi tệp. Chạy browser SO/PO theo role có quyền.
4. Cấu hình `HX_BULK_IMPORT_ENABLED=true` trong server Production chỉ sau phê duyệt; bật `private.bulk_import_feature_settings.enabled` bằng phiên thao tác DBA được kiểm soát. Cả hai cần đúng; migration mặc định tắt.
5. Bắt buộc cấu hình `CRON_SECRET` và `SUPABASE_SECRET_KEY` server-only cho cron retention. Không đưa secret vào client, log hay báo cáo. Nếu thiếu một cấu hình, cron báo 503 và phải được xử lý trước khi bật nhập tệp.
6. Xác nhận dung lượng/retention Storage, cảnh báo log, hạn mức chạy và quy trình DBA/backup. Không bật trên Production khi chưa có backup/restore phù hợp.

## Tắt tính năng

- Đặt `HX_BULK_IMPORT_ENABLED=false` để ẩn/chặn upload, review và create. Sau đó đặt singleton DB `enabled=false` bằng kênh DBA được duyệt.
- Việc tắt chỉ ảnh hưởng nhập tệp; form và RPC tạo SO/PO thủ công vẫn hoạt động.
- Cron retention tiếp tục chạy khi tính năng nhập tắt. Giữ `CRON_SECRET` và `SUPABASE_SECRET_KEY` đến khi mọi object hết hạn được dọn.

## Thứ tự triển khai dự kiến

- Backup DB và Storage object; xác minh khả năng đọc/restore trong thử nghiệm riêng.
- Deploy code tương thích trong khi feature off.
- Áp dụng migration theo thứ tự trên bản backup/QA tương ứng; kiểm tra post-migration.
- Khi review/CI/QA và recovery gate đạt, triển khai chính thức; đối chiếu commit/schema trước khi bật feature gate theo quyết định chủ hệ thống.
- Sau bật, dùng test read-only/logging và hoạt động người dùng thật được cho phép; không tạo giao dịch thử Production.

## Phục hồi

- Tắt runtime gate trước để khóa các request mới.
- Vì migration thay đổi hàm canonical recovery và tạo metadata/Storage private, không chạy `DROP` hoặc rollback schema mù quáng. Giữ bản ghi import và SO/PO đã tạo; chúng là audit/idempotency lineage.
- Nếu lỗi chỉ ở giao diện/API, quay ứng dụng về artifact đã được xác minh nhưng phải giữ migration tương thích; nếu lỗi schema/data, dừng ghi và phục hồi DB + object từ backup theo kế hoạch DBA đã thử.
- Giao dịch phát sinh sau thời điểm backup cần được đối chiếu theo command receipt/ledger và quy trình vận hành; không ghi đè toàn DB mà không bảo toàn phần này.

**Trạng thái hiện tại:** chưa sao lưu/khôi phục QA hoặc Production; chưa cấu hình release target; chưa merge/deploy/bật feature. Đây là kế hoạch, chưa phải bằng chứng phục hồi PASS.
