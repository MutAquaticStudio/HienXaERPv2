# Kế hoạch tích hợp Zalo OA — Hiền Xa ERP V2

> Kế hoạch ngày 01/11/2026. **Owner chốt 02/11/2026 thành D47** (xem `Spec.md`). Giai đoạn 1 đã có code (migration `20261102160000_d47_zalo_oa_notifications.sql`, Cài đặt → Zalo OA); chờ Owner làm Giai đoạn 0 rồi kết nối.
> Nguồn: tài liệu chính thức developers.zalo.me (đọc ngày 01/11/2026). Các mục OAuth v4, Tin nhắn OA, Webhook và ZBS Template Message.

## 1. Những điều tài liệu Zalo nói (đã kiểm tra)

| Chủ đề | Nội dung |
|---|---|
| **ZNS đã đổi tên** | Từ **01/01/2026**, ZNS được hợp nhất vào **ZBS Template Message**. Tài liệu ZNS cũ không còn cập nhật. Ví tiền "ZCA" nay là **ZBS Account**. |
| Tài khoản cần có | (1) **Zalo OA** (đã có, Owner là quản trị); (2) **Zalo App** trên developers.zalo.me, được OA cấp quyền; (3) **ZBS Account** (ví trả phí), liên kết với App và OA. |
| Chi phí | Zalo **không thu phí tích hợp**. Có thể phải trả gói OA và phí từng tin. Tin qua SĐT trừ tiền ví ZBS (lỗi `-115` = hết số dư). Bảng giá chính thức nằm trong ZBS Account, chưa thấy trong tài liệu dev. |
| Xác thực (OAuth v4 + PKCE) | `POST https://oauth.zaloapp.com/v4/oa/access_token`, header `secret_key`. **Access token sống 25 giờ.** **Refresh token sống 3 tháng và chỉ dùng được 1 lần**: mỗi lần làm mới sẽ nhận refresh token mới, token cũ bị vô hiệu ngay. Authorization code dùng 1 lần, sống 10 phút. |
| Gửi tin qua **số điện thoại** (thay ZNS) | `POST https://business.openapi.zalo.me/message/template` với `{phone: "84…", template_id, template_data, tracking_id}`. `tracking_id` do mình đặt, tối đa 48 ký tự. Trả `msg_id` và **hạn mức ngày** (ví dụ 500/ngày, Zalo tự điều chỉnh theo chất lượng). Không cần khách quan tâm OA. |
| Chế độ thử | Thêm `"mode": "development"`: **chỉ gửi được tới quản trị viên OA hoặc App**. Dùng cho QA. |
| Mẫu tin (Template) | Phải đăng ký và được Zalo **duyệt** (`PENDING_REVIEW → ENABLE`). Có 3 loại: **Tag 1 TRANSACTION** (xác nhận đơn, trạng thái thanh toán), **Tag 2 CUSTOMER_CARE** (nhắc lịch, cập nhật dịch vụ), **Tag 3 PROMOTION**. Zalo chấm chất lượng mẫu (HIGH/MEDIUM/LOW); mẫu kém có thể bị khóa. Có sẵn loại mẫu **"yêu cầu thanh toán"**. |
| Gửi qua **UID** (người đã tương tác với OA) | `POST https://openapi.zalo.me/v3.0/oa/message/template` với `user_id`. UID là mã riêng của từng người với OA. Tin Giao dịch gửi được nếu người dùng tương tác trong vòng 1 năm; thông báo ngoài app chỉ trong khung **6:00–21:59**. |
| Tin Tư vấn (chat) | Gửi được nếu người dùng tương tác trong 7 ngày. **Miễn phí trong 48 giờ** kể từ lần tương tác cuối; sau đó tính phí. |
| Webhook | Zalo gửi POST tới URL **https dùng tên miền**. Phải trả **200 trong tối đa 2 giây**. Zalo thử lại sau 30 giây, 5, 15, 30 phút và 1 giờ (header `num_retry`); vẫn lỗi thì **tắt webhook**. Chữ ký: `X-ZEvent-Signature = sha256(appId + data + timeStamp + OAsecretKey)`. |
| Sự kiện hữu ích | `user_received_message` (tin qua SĐT đã tới máy, kèm `tracking_id`), `user_send_text`/`image`… (khách nhắn OA), `follow`, `user_submit_info` (khách điền form chia sẻ SĐT), các sự kiện đổi trạng thái, chất lượng mẫu và hạn mức. |
| Mã lỗi cần xử lý | `-124` token sai hoặc hết hạn → làm mới token rồi gửi lại. `-115` hết tiền ví. `-118` SĐT không có Zalo. `-108` SĐT sai. `-131`/`-109`/`-1122` mẫu chưa duyệt, sai ID hoặc thiếu tham số. `-120` OA chưa mua gói. **Zalo trả HTTP 200 kèm `error ≠ 0`**, nên phải đọc nội dung phản hồi, không chỉ mã HTTP. |

## 2. Kiến trúc đề xuất: Zalo là một kênh mới trong hàng đợi gửi tin có sẵn (F5)

Hệ thống đã có `notifications → automation_rules → outbound_jobs → pg_net`. Database đã gửi Telegram trực tiếp theo cách này, có thử lại, chống trùng và lịch `pg_cron` mỗi phút. Zalo đi cùng đường đó:

```
Sự kiện nghiệp vụ (đơn được duyệt, phiếu giao đã giao, SePay báo có, đơn mua đã xác nhận…)
  → private.enqueue_zalo(sự kiện, chứng từ, SĐT)  — trong cùng transaction với nghiệp vụ, dedupe theo chứng từ + sự kiện
  → outbound_jobs (channel = 'ZALO', target = SĐT 84…, payload = template_id + template_data + tracking_id)
  → process_outbound_jobs (pg_cron mỗi phút): pg_net POST business.openapi.zalo.me với access_token lấy từ Vault
  → đọc phản hồi: error 0 = ĐÃ GỬI (lưu msg_id) | -124 = làm mới token rồi gửi lại | -118/-108 = bỏ (khách không có Zalo) | -115 = báo Owner nạp tiền
  → webhook user_received_message → ĐÃ NHẬN (thời điểm tới máy khách)
```

Nguyên tắc (khớp CLAUDE.md):
- **Database là nơi quyết định.** Token, khóa bí mật và việc gửi đều ở Postgres (Vault + pg_net), giống Telegram. App **không** giữ token Zalo.
- **Không thêm chỗ dùng `SUPABASE_SECRET_KEY`.**
  - Webhook vào: route `/api/zalo/webhook` chuyển nguyên văn body và header vào RPC `ingest_zalo_event`, cấp quyền cho `anon` giống SePay D42 nhưng **không cần khóa bí mật của app**.
  - RPC tự kiểm chữ ký bằng OA secret key lấy trong Vault, rồi mới ghi. Route luôn trả 200 nhanh để không quá 2 giây.
- **Làm mới token an toàn với refresh token chỉ dùng 1 lần.**
  - Có một bảng trạng thái `private.zalo_connection`, mỗi lúc chỉ cho **một** lần làm mới đang chạy (khóa hàng).
  - pg_cron làm mới khi access token còn dưới 6 giờ. Lưu cặp token mới vào Vault **trong cùng transaction** đọc phản hồi.
  - Nếu mất phản hồi mà Zalo đã đổi token: trạng thái chuyển "Cần kết nối lại", màn hình Cài đặt có nút **"Kết nối Zalo OA"** để chạy lại OAuth.
- **Kết nối lần đầu (OAuth v4 + PKCE) ngay trong app**, ở *Cài đặt → Zalo OA*, chỉ chủ doanh nghiệp làm được:
  - Nút tạo `code_verifier` (lưu trong DB) và mở trang cấp quyền của Zalo.
  - Zalo gọi lại `/api/zalo/oauth/callback?code=…&oa_id=…`. Route gọi RPC `complete_zalo_oauth(code, state)`.
  - Database đổi code lấy token qua pg_net, App Secret nằm trong Vault. App chỉ hiện "Đang kết nối… → Đã kết nối".
- **Chống làm phiền.**
  - Mỗi khách có lựa chọn "Nhận thông báo Zalo" (mặc định bật cho tin giao dịch; khách hoặc nhân viên tắt được).
  - Nhắc nợ chỉ gửi trong khung 8:00–20:00.
  - Mỗi chứng từ và sự kiện chỉ gửi **một lần** (`dedupe_key`).
- **QA không gửi tin thật.** Database QA luôn gửi ở `mode=development`, nên tin chỉ tới quản trị viên OA, không tới khách.

### Thay đổi dữ liệu (một migration, có test SQL native)
- `outbound_jobs.channel` thêm `'ZALO'`; thêm cột `provider_message_id`, `delivered_at`.
- `private.zalo_connection` (1 dòng): `oa_id`, `app_id`, trạng thái, `access_expires_at`, lần làm mới đang chạy, lỗi gần nhất. Token nằm trong **Vault**, không nằm ở bảng.
- `public.zalo_templates` (RLS, quyền `roles.manage` như quy tắc tự động hiện có): `event_code` → `template_id`, bản đồ tham số, bật/tắt.
- `customers.zalo_opt_out` (hoặc bảng riêng) cho lựa chọn nhận tin; chuẩn hóa SĐT `0xxx → 84xxx`.
- (Giai đoạn 2) `public.zalo_users` liên kết UID ↔ khách/NCC, `public.zalo_messages` lưu hội thoại.

## 3. Lộ trình

### Giai đoạn 0 — Owner chuẩn bị (không cần code, khoảng 1–3 ngày chờ Zalo duyệt)
1. Kiểm tra OA đã **xác thực** và đã có **gói dịch vụ OA** chưa. Lỗi `-120` nghĩa là OA chưa mua gói.
2. Tạo **Zalo App** trên developers.zalo.me, liên kết với OA, ghi lại App ID và Secret key. **Không gửi qua chat.**
3. Tạo **ZBS Account**, liên kết với App và OA, nạp tiền, xem **bảng giá tin qua SĐT**.
4. Đăng ký các mẫu tin (mình soạn nội dung, Owner nộp và chờ duyệt). Đề xuất:

| Mã sự kiện | Tag | Nội dung gợi ý | Tham số |
|---|---|---|---|
| `ORDER_CONFIRMED` | 1 | Hiền Xa xác nhận đơn `<order_code>` ngày `<date>`, tổng `<total>`, giao tới `<site>` | order_code, date, total, site |
| `DELIVERY_DONE` | 1 | Phiếu giao `<delivery_code>` đã giao tới `<site>` lúc `<time>`. Người nhận: `<receiver>` | delivery_code, site, time, receiver |
| `PAYMENT_RECEIVED` | 1 | Hiền Xa đã nhận `<amount>` của `<customer>` lúc `<time>`. Dư nợ còn `<balance>` | amount, customer, time, balance |
| `DEBT_REMINDER` | 2 | Nhắc công nợ: `<customer>` còn `<balance>`, đến hạn `<due_date>` | customer, balance, due_date |
| `PO_TO_SUPPLIER` | 1 | Hiền Xa đặt hàng `<po_code>`: `<summary>`, giao `<site>` ngày `<date>` | po_code, summary, site, date |

5. Có tên miền https ổn định cho webhook. **Nên xong DNS `app.hienxavlxd.com` trước**, vì Zalo khuyên dùng tên miền và có thể đòi xác thực tên miền khi cấu hình webhook.

### Giai đoạn 1 — Thông báo một chiều qua SĐT (khoảng 2 PR)
- PR 1 (DB):
  - Migration kênh `ZALO`, `zalo_connection`, `zalo_templates`, lựa chọn nhận tin.
  - Hàm gửi, làm mới token, đọc phản hồi; RPC OAuth và webhook.
  - Test native: chống trùng, refresh chỉ một lần, xử lý từng mã lỗi, kiểm chữ ký webhook, QA ở development mode.
- PR 2 (App):
  - *Cài đặt → Zalo OA*: kết nối, trạng thái token, ánh xạ mẫu, gửi thử tới SĐT quản trị.
  - Route `/api/zalo/oauth/callback`, `/api/zalo/webhook`.
  - Hồ sơ khách: ô "Nhận Zalo".
  - Chứng từ: dòng "Đã gửi Zalo 10:30 · đã nhận".
- Gắn vào nghiệp vụ: duyệt đơn, giao xong, SePay ghi nhận tiền (D42), đơn mua đã xác nhận (D17: chuyển nút "Gửi NCC qua Zalo" từ thủ công sang tự động khi đã kết nối OA), nhắc nợ hằng ngày.
- Thứ tự áp dụng: QA (development mode) → Production. Mỗi mẫu bật riêng khi Zalo đã duyệt.

### Giai đoạn 2 — Hai chiều qua OA (sau khi giai đoạn 1 ổn)
- Webhook nhận tin khách nhắn OA và `follow`. Liên kết UID ↔ khách bằng mã: khách bấm "Kết nối Zalo" trên cổng khách → nhắn mã cho OA. Có thể dùng thêm form `user_submit_info` để nhận SĐT.
- Tin nhắn khách hiện trong app (khung chat đã có) để nhân viên bán hàng trả lời bằng **tin Tư vấn**, miễn phí trong 48 giờ.
- Mẫu **"yêu cầu thanh toán"** của ZBS + **mục 4 (một QR cho nhiều đơn)**: gửi QR và mã `TT KH01 Q7K2` qua Zalo; SePay báo có thì tự gửi "Đã nhận thanh toán".

### Giai đoạn 3 — Tùy chọn
- Khách nhắn đặt hàng → tạo **đơn nháp chờ duyệt** (không tự chốt).
- Gửi qua UID thay vì SĐT cho khách đã liên kết, nếu gói OA rẻ hơn.

## 4. Rủi ro và cách giảm

| Rủi ro | Cách giảm |
|---|---|
| Mất refresh token (dùng 1 lần) → mất kết nối | Một lần làm mới tại một thời điểm, lưu token trong cùng transaction, cảnh báo Owner và có nút kết nối lại |
| Webhook chậm hoặc lỗi bị Zalo **tắt** | Route chỉ chuyển cho RPC rồi trả 200 ngay; có trang trạng thái webhook; đã ghi rõ cách bật lại |
| Hết tiền ví hoặc hết hạn mức ngày | Đọc `remainingQuota` sau mỗi lần gửi; dưới 10% hoặc lỗi `-115` thì tạo thông báo trong app cho Owner |
| Mẫu bị đánh giá thấp hoặc khóa | Chỉ gửi tin giao dịch đúng mục đích, không quảng cáo; theo dõi sự kiện chất lượng mẫu |
| Gửi nhầm khách khi thử | QA luôn ở development mode (chỉ tới quản trị OA) |
| Dữ liệu cá nhân (SĐT) | SĐT chỉ đi từ DB tới Zalo; nhật ký chỉ ghi mã chứng từ và trạng thái, không ghi nội dung tin |

## 5. Owner cần quyết định
1. **Chốt làm Zalo (D44)**, chấp nhận phí theo tin. Spec F5 hiện ghi "không tốn phí dịch vụ ngoài; Zalo ZNS chỉ làm khi Owner yêu cầu".
2. **Các sự kiện gửi ở giai đoạn 1**: chọn trong 5 mẫu ở trên.
3. **Gửi tới số nào**: SĐT chính của khách, hay SĐT người nhận hàng ở công trình (cho tin giao hàng)?
4. Mặc định **bật** nhận Zalo cho mọi khách hiện có (có thể tắt từng khách)?
5. Thứ tự: làm **mục 4 (QR nhiều đơn)** trước rồi mới Zalo (đề xuất, vì giai đoạn 2 dùng lại), hay Zalo giai đoạn 1 trước?


## 6. Hướng dẫn Owner kết nối (sau khi giai đoạn 1 đã lên)

1. **Zalo App** — developers.zalo.me → Tạo ứng dụng → liên kết với OA Hiền Xa. Trong *Cài đặt ứng dụng*:
   - Ghi lại **App ID** (dãy số) — nhập trên trang Cài đặt → Zalo OA.
   - **Secret Key**: KHÔNG gửi qua chat. Lưu vào Supabase (Production) → Project Settings → **Vault** → *Add new secret*, tên `hx_zalo_app_secret`.
   - *Official Account → Callback URL*: `https://<tên miền ứng dụng>/api/zalo/oauth/callback` (cần `NEXT_PUBLIC_APP_URL` là tên miền https).
2. **Tiện ích http** trong Supabase → Database → Extensions: bật `http` (database dùng để đổi/làm mới token).
3. **ZBS Account** (zalo.cloud): liên kết App + OA, nạp tiền, xem bảng giá tin qua số điện thoại.
4. **Đăng ký 4 mẫu tin** (ZBS Template Message), tham số kiểu chữ, **đúng tên** như trang Cài đặt → Zalo OA hiển thị:
   - Đơn được xác nhận (Giao dịch): `order_code`, `order_date`, `total`, `site`
   - Đã giao hàng (Giao dịch): `delivery_code`, `site`, `delivered_at`, `receiver`
   - Đã nhận tiền (Giao dịch): `amount`, `customer`, `paid_at`, `balance`
   - Nhắc công nợ (Chăm sóc khách hàng): `customer`, `balance`, `due_date`
5. Vào **Cài đặt → Zalo OA**: nhập App ID → **Kết nối Zalo OA** → Cho phép trên Zalo → quay về "Đã kết nối".
6. Nhập **mã mẫu tin** từng sự kiện khi Zalo duyệt → bật → **Gửi thử** tới số của quản trị OA (chế độ thử).
7. Khi đã thử ổn: chuyển **Chế độ gửi → Khách thật**.
