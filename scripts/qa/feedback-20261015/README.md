# QA trình duyệt — góp ý KiotViet (`FB-KIOTVIET-20261015`)

Ma trận đầy đủ: `KE_HOACH_FEEDBACK_KIOTVIET_20261015.md` §3.2. **Trạng thái: CHƯA CHẠY TRÊN TRÌNH DUYỆT.**
Migration (`20261015120000`, `20261015130000` + 2 bản nền) đã áp lên QA project ngày 16/10/2026 và QA database đã PASS.

## Điều kiện

- `.env.qa.local` (không commit) có `HX_QA_PROJECT_REF=ffrwiglcrlumfvhubaxg`, `HX_QA_RUNTIME_APPROVED=true`,
  `NEXT_PUBLIC_SUPABASE_URL` của QA project, `HX_QA_PASSWORD`. Script dừng nếu file chứa Production ref hoặc URL không khớp QA.
- App chạy local bằng chính env QA: `pnpm build && pnpm start -p 3112` (script chỉ chấp nhận `http://127.0.0.1:PORT`).
- Tài khoản QA `hxqa-<vai trò>@example.test` (owner, sales, finance, worker, receiver).

## Chạy

```bash
# Chỉ đọc: B06, B07, B08, B11, B12, B14
node scripts/qa/feedback-20261015/feedback-browser.mjs --env .env.qa.local
# Có ghi dữ liệu QA: thêm B01 (tạo + xác nhận 1 đơn) và B13 (tăng 10% giá chung của 1 vật tư)
node scripts/qa/feedback-20261015/feedback-browser.mjs --env .env.qa.local --writes \
  --customer "<từ khóa khách QA>" --material "<mã vật tư QA có giá chung>"
# Một vài ca: --only B06,B11 ; đổi thư mục kết quả: --out /var/tmp/hx-fb-qa
```

Kết quả: `report.json` + ảnh chụp trong `--out` (mặc định `/var/tmp/hx-fb-qa`, ngoài repo). Không commit ảnh/dữ liệu QA.

## Chạy trong phiên Claude Code trên cloud

Môi trường cloud cần (Owner cấu hình trong cài đặt môi trường, rồi mở phiên mới):
- Network access → Allowed domains: `ffrwiglcrlumfvhubaxg.supabase.co` (chỉ QA, không thêm Production).
- Một biến môi trường bí mật: `HX_QA_PASSWORD`. Không đặt `NEXT_PUBLIC_SUPABASE_URL`/cờ cloud ở mức môi trường.

Trong phiên (file env tạm để ngoài repo; mật khẩu lấy từ biến môi trường, không ghi ra file):

```bash
QA_ENV=/tmp/hx-qa.env   # hoặc thư mục scratchpad của phiên
cat > "$QA_ENV" <<EOF
HX_QA_PROJECT_REF=ffrwiglcrlumfvhubaxg
HX_QA_RUNTIME_APPROVED=true
HX_CLOUD_RUNTIME_APPROVED=true
NEXT_PUBLIC_SUPABASE_URL=https://ffrwiglcrlumfvhubaxg.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key của QA — lấy bằng Supabase connector get_publishable_keys>
EOF
set -a; . "$QA_ENV"; set +a
pnpm build
NODE_USE_ENV_PROXY=1 pnpm start -p 3112 &     # server Next đi qua proxy của môi trường (Node >= 22.21)
node scripts/qa/feedback-20261015/feedback-browser.mjs --env "$QA_ENV" --out /tmp/hx-fb-qa
```

Chromium chỉ gọi `127.0.0.1:3112`; các ca tự động không dùng Supabase phía trình duyệt nên không cần cấu hình proxy cho trình duyệt.
Kiểm tra cục bộ phần không cần trình duyệt: `node --test scripts/qa/feedback-20261015/support.test.mjs`.

## Ca tự động và ca thủ công

| Ca | Cách kiểm |
|---|---|
| B01 | Tự động (`--writes`): khách → công trình (không tự chọn) → F3 vật tư → SL → "Tạo đơn"; ≤ 5 bước |
| B02, B03, B04, B05 | Thủ công theo bảng ở kế hoạch (cần dữ liệu hạn mức/mất mạng/NCC riêng) |
| B06, B07, B11 | Tự động, chỉ đọc |
| B08 | Tự động, chỉ đọc: số điểm theo kỳ; tổng cột Lợi nhuận = KPI khi cả hai đủ dữ liệu (thiếu dữ liệu thì ghi lại, không coi là 0) |
| B09, B10 | Thủ công (cần dữ liệu chi phí chưa phân bổ / đối chiếu chứng từ gốc) |
| B12 | Tự động ghi ma trận cột theo vai trò → người duyệt đối chiếu quyền (`RECORDED_FOR_REVIEW`) |
| B13 | Tự động (`--writes`): lưu +10%, phiên thứ hai dữ liệu cũ bị từ chối và không ghi gì |
| B14 | Tự động, chỉ đọc: 20 lần tải Tổng quan kỳ 12 tháng, p95 < 2 giây (SPEC-PERF-002) |
