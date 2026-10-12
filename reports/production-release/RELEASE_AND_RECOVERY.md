# Nâng cấp và phát hành

PR44 trên main e2a6393; runtime UI đã kiểm chứng giữ nguyên. Backend G01–G23 và bỏ opening pending có trong main nhưng DB đích mới có78 version nguồn.

Sao lưu DB/tệp doanh nghiệp **không thực hiện theo chỉ đạo mới của chủ hệ thống**. Không ghi PASS khôi phục hoặc dùng backup QA thay thế. Công cụ TLS/nhập kín/backup riêng đã chuẩn bị; chưa chạy với mật khẩu Production.

Giữ artifact cũ Vercel dpl_EBjgf4qEUdv3BjnfqwECN4A32V8v. SHA cũ không công bố nên không suy nó là main. Autodeploy main tắt; merge không tự phát hành trước DB.

UPGRADE_BUNDLE_MANIFEST.json và EXACT_BUNDLE_REHEARSAL.json ràng buộc byte artifact3.27MB với101 migration nguồn/forward. BUILD_RELEASE_BUNDLE.mjs chỉ tái tạo khi hash đúng, ra tệp mới ngoài Git. TARGET78_COMPATIBLE_FORWARD.sql có guard prestate; EXPERIMENTAL_NATIVE_BRIDGE cũ giữ nguyên và không đưa lên Production.

Áp bundle trong một transaction: khóa ghi, giữ mọi trường/khóa của dòng public/private có sẵn (kể cả roles/quyền), không có tiền/kho/opening mới, bảo vệ opening và bỏ trigger bắt branch chờ opening. Mismatch/timeout phải rollback toàn schema/data/ledger. 101 version ghi sau SQL tương ứng thực sự chạy.

Tám version lịch sử thiếu không ghi “đã áp dụng” giả; forward cung cấp cơ chế thiếu và giữ return/transit/PT409 đã thay thế. History quản trị khác số187 của schema canonical: đối chiếu định nghĩa/quyền/policy và manifest; không chạy db push/replay8 file cũ máy móc.

Sau merge: so runtime với head nghiệm thu, deploy remote build bằng cấu hình Production đúng project/team/ref, ghi merge SHA/deployment/schema/thời gian. Không dùng env pull có secret bị che để tạo prebuilt artifact.

DDL lỗi: transaction rollback, giữ app, lưu lỗi/sửa/diễn tập lại. App lỗi và DB tương thích: xem xét promote artifact cũ, kiểm đường đọc. Không có bản sao DB đích đã thử restore theo quyết định bỏ sao lưu; không hứa rollback DB sau commit. Lỗi dữ liệu sau commit: dừng ghi và xử lý forward theo nguồn; không reset/xóa chứng từ thật hoặc tạo số dư bù.

Sau deploy: health/version,Auth settings,query/RLS/RPC read-only,màn hình/log. Không tạo đơn/xuất kho/thu tiền/thông báo giả trên Production. QA ghi sổ giữ đúng source/phạm vi; GPS thiết bị/hóa đơn thật tiếp tục hoãn và không báo phát hành.

## Trạng thái sau triển khai

PR44 merge8f65d70/CI173 đạt và deployG6k READY. Gói3.27MB bị cổng từ chối trước SQL; compact1.44MB giảm ledger text trùng,giữ SQL thực thi,diễn tập đúng byte và áp thành công nguyên tử. Full SQL được lưu trong migration bundle quản trị;101 child version ghi tên thực,statementsNULL; source SHA trong manifest. Feature187/hist181.

Migration188 thực20261012211058 thu hồi DDL quyền thừa anon/authenticated,bảo toànCRUD vàSourceOwner62. Feature188/hist182; không rewrite/fake8historicalversions. Source CLI draft đổi tên khớp version thực,SQLbyte giữ. Rollback cấp quyền phải dùng ACL snapshot kiểm được,không mở TRUNCATE để vượt điều kiện nghiệp vụ.

Các artifacts8f/G6k là lần triển khai đầu. SHA/artifact sau PR45 được ghi ở kết quả cuối; không dùng sốfeature schema thay history hoặc nói phiên bản trước là mới. Không có backup/restore đích do chỉ đạo miễn sao lưu; giữ kế hoạch xử lý forward/ngừng ghi khi có lỗi.
