# QA toàn hệ thống (Playwright)

Chạy trên một bản ứng dụng đã nối **QA** (bản Preview trên Vercel hoặc `next start` cục bộ với cờ QA). Không chạy vào Production.

```bash
export HX_QA_BASE_URL=https://<bản-preview>.vercel.app   # hoặc http://localhost:3100
export HX_QA_SHARE=<mã _vercel_share>                    # chỉ khi Preview đang bật Vercel Authentication
export HX_QA_PASSWORD=<mật khẩu tài khoản thử QA>        # không commit
export HX_QA_OUT=/tmp/qa-out                              # ảnh chụp + kết quả JSON
export QA_PHOTO=/đường/dẫn/ảnh.jpg                        # ảnh thử cho bước thợ chụp ảnh
node smoke.mjs     # lớp 1: mọi màn hình theo vai trò (chủ, thợ, khách; điện thoại + máy tính)
node layout.mjs    # bố cục thanh menu ở 1280–1920 px
node e2e.mjs       # lớp 2: luồng nghiệp vụ đầu-cuối; node e2e.mjs "<tiền tố tên bước>" để chạy riêng
```

Tài khoản thử (QA): `hxqa-owner@example.test`, `hxqa-worker@example.test`, `hxqa-finance@example.test` (khách KH01).
Kịch bản và kết quả lần chạy gần nhất: `docs/qa/kich-ban-qa-toan-he-thong.md`.
