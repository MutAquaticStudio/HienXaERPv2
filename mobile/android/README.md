# App Android "Hiền Xa" (D82)

App Android **native** (Java, không cần Chrome): một màn hình WebView riêng mở `https://app.hienxavlxd.com`. Mọi màn hình là
trang web, nên deploy web là app có ngay; chỉ build lại APK khi đổi vỏ app (tên, biểu tượng, màu, tính năng native, phiên bản).
Bản này thay bản Trusted Web Activity của D81 (bị dừng trên một số máy Xiaomi); cùng gói `com.hienxavlxd.app` và cùng khóa ký,
nên **cài đè** lên bản cũ được, không phải gỡ.

Phần native trong `app/src/main/java/com/hienxavlxd/app/MainActivity.java`:

- giữ đăng nhập (cookie), user agent có thêm `HienXaAndroid/<phiên bản>` để trang web biết đang chạy trong app;
- chọn ảnh / tệp, chụp ảnh bằng máy ảnh (`<input capture>` mở thẳng máy ảnh), xin quyền Máy ảnh khi cần;
- vị trí cho chấm công và theo dõi giao hàng (xin quyền Vị trí khi trang hỏi);
- link điện thoại, Zalo, bản đồ, trang ngoài mở bằng app tương ứng; link `app.hienxavlxd.com` (Zalo, tin nhắn) mở thẳng trong app
  (xác minh bằng `public/.well-known/assetlinks.json`);
- tải tệp: PDF / tệp từ máy chủ qua Trình quản lý tải xuống (kèm cookie) rồi tự mở; tệp trang tự tạo (CSV, Excel) lưu vào Tải xuống;
- nút Quay lại (cả cử chỉ quay lại Android 13+), màn "Chưa kết nối được" có nút Thử lại;
- cập nhật app: tải xong bản APK mới thì mở luôn trình cài (quyền `REQUEST_INSTALL_PACKAGES`); trang web hiện thẻ
  "Có bản app Hiền Xa mới" cho app cũ hơn `ANDROID_APP_VERSION` (`src/lib/app-shell/native-app.ts`).

Chưa có: thông báo đẩy (WebView không nhận được thông báo web; cần Firebase, để bản sau).

## Khóa ký

File `hien-xa.keystore` (alias `hienxa`, PKCS12) và mật khẩu do **Owner cất giữ**, không đưa vào repo. Bản cập nhật phải ký
bằng đúng khóa này, nếu không máy đã cài phải gỡ app cũ trước khi cài bản mới.

## Build lại

1. Tăng `versionCode` (và `versionName`) trong `app/build.gradle`, và đặt `ANDROID_APP_VERSION` trong
   `src/lib/app-shell/native-app.ts` đúng bằng `versionName` (script build từ chối nếu lệch).
2. Cài JDK 17+ và Android SDK (`platforms;android-36`, `build-tools;36.0.0`).
3. Chạy (Gradle build, Android lint, kiểm tra chứng chỉ khớp `assetlinks.json`, chép APK vào `public/app/hien-xa.apk`):
   ```bash
   ANDROID_HOME=… HX_APK_KEYSTORE=…/hien-xa.keystore HX_APK_KEYSTORE_PASS_FILE=…/password.txt node scripts/mobile/build-android.mjs
   ```
4. Commit `public/app/hien-xa.apk` cùng mã nguồn, deploy.
