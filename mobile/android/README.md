# App Android "Hiền Xa" (D81)

App là một **Trusted Web Activity**: mở `https://app.hienxavlxd.com` toàn màn hình qua Chrome. Mọi màn hình là trang web,
nên deploy web là app có ngay; chỉ build lại APK khi đổi tên, biểu tượng, màu hoặc phiên bản vỏ app.

- Cấu hình: `twa-manifest.json` (gói `com.hienxavlxd.app`, tên, màu, `appVersionCode` / `appVersion`).
- Liên kết web ↔ app: `public/.well-known/assetlinks.json` phải có dấu vân tay SHA-256 của chứng chỉ ký; sai thì app hiện thanh địa chỉ.
- APK phát hành: `public/app/hien-xa.apk`, tải ở `/tai-app`.
- Thông báo đẩy: dùng thông báo web hiện có (D80); Chrome chuyển cho app, Android 13+ app xin quyền khi mở.

## Khóa ký

File `hien-xa.keystore` (alias `hienxa`, PKCS12) và mật khẩu do **Owner cất giữ**, không đưa vào repo. Bản cập nhật phải ký
bằng đúng khóa này, nếu không máy đã cài phải gỡ app cũ trước khi cài bản mới.

## Build lại

1. Tăng `appVersionCode` (và `appVersion`) trong `twa-manifest.json`.
2. Cài JDK 17+, Android SDK (`platforms;android-36`, `build-tools;36.0.0`) và `@bubblewrap/core` (ngoài repo).
3. Chạy:
   ```bash
   ANDROID_HOME=… BUBBLEWRAP_CORE=…/node_modules/@bubblewrap/core HX_APK_KEYSTORE=…/hien-xa.keystore \
     HX_APK_KEYSTORE_PASS_FILE=…/password.txt node scripts/mobile/build-android.mjs
   ```
4. Commit `public/app/hien-xa.apk` (và `twa-manifest.json`), deploy.
