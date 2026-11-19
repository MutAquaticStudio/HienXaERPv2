# App Android "Hiền Xa" (D82, D86)

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
  "Có bản app Hiền Xa mới" cho app cũ hơn `ANDROID_APP_VERSION` (`src/lib/app-shell/native-app.ts`);
- thông báo đẩy (D86, từ bản 2.3.0) qua Firebase Cloud Messaging: `Push.java`, `PushService.java`; kênh "Thông báo Hiền Xa",
  biểu tượng `res/drawable/ic_notification.xml`; chạm thông báo mở trang của nó trong app. Android 13+ hỏi quyền thông báo lần
  đầu mở trang đã đăng nhập (thợ: thông báo trước, Vị trí sau). Trang web đọc / xin qua `window.HienXaAndroid`
  (`pushToken()`, `pushPermission()`, `requestPush()` rồi sự kiện `hx-push-token`) và lưu máy cho tài khoản đang đăng nhập.

## Khóa ký

File `hien-xa.keystore` (alias `hienxa`, PKCS12) và mật khẩu do **Owner cất giữ**, không đưa vào repo. Bản cập nhật phải ký
bằng đúng khóa này, nếu không máy đã cài phải gỡ app cũ trước khi cài bản mới.

## Firebase (thông báo đẩy, D86)

Owner đã có dự án Firebase. Không đưa tệp hay khóa nào của Firebase vào repo (`.gitignore` chặn `google-services.json`).

1. **App Android trong Firebase**: Firebase Console → Cài đặt dự án (Project settings) → Ứng dụng của bạn → thêm app Android,
   tên gói `com.hienxavlxd.app`, rồi tải `google-services.json`. Cất tệp này cùng chỗ với khóa ký (ngoài repo).
2. **Build APK**: đặt `HX_GOOGLE_SERVICES_JSON` = đường dẫn tệp đó khi chạy `scripts/mobile/build-android.mjs`. Script kiểm tệp
   đúng là của `com.hienxavlxd.app`, chép vào `app/google-services.json` cho lần build rồi xóa đi, và từ chối build bản phát hành
   khi thiếu. Build tay bằng Gradle mà không có tệp này thì app vẫn chạy, chỉ không có thông báo đẩy.
3. **Máy chủ gửi**: Firebase Console → Cài đặt dự án → Tài khoản dịch vụ (Service accounts) → "Tạo khóa riêng tư mới"
   (Generate new private key) → tệp JSON. Dán **nguyên nội dung tệp** vào biến `FIREBASE_SERVICE_ACCOUNT` trên Vercel
   (Production; Preview nếu cần), rồi deploy lại. Route `/api/automation/deliver` dùng khóa này để lấy token OAuth2 và gửi qua
   FCM HTTP v1 (`https://fcm.googleapis.com/v1/projects/<project_id>/messages:send`). Thiếu biến thì việc gửi cho app chờ gửi
   lại, lý do hiện ở Cài đặt → Quy tắc tự động. Khóa lộ ra thì xóa khóa đó trong Firebase và tạo khóa mới.
4. Không cần đổi gì thêm ở Supabase: hàng đợi gửi đi (`hx_app_url`, `hx_automation_secret` trong Vault, `HX_AUTOMATION_SECRET`
   trên Vercel) là cái đang dùng cho thông báo web.
5. Thử: cài APK mới, đăng nhập, cho phép thông báo → Cài đặt → Quy tắc tự động → "Gửi thử" một quy tắc PUSH (về máy của chính
   mình), hoặc giao một việc cho thợ đang dùng app.

## Build lại

1. Tăng `versionCode` (và `versionName`) trong `app/build.gradle`, và đặt `ANDROID_APP_VERSION` trong
   `src/lib/app-shell/native-app.ts` đúng bằng `versionName` (script build từ chối nếu lệch).
2. Cài JDK 17+ và Android SDK (`platforms;android-36`, `build-tools;36.0.0`).
3. Chạy (Gradle build, Android lint, kiểm tra chứng chỉ khớp `assetlinks.json` và APK có cấu hình Firebase, chép APK vào
   `public/app/hien-xa.apk`):
   ```bash
   ANDROID_HOME=… HX_APK_KEYSTORE=…/hien-xa.keystore HX_APK_KEYSTORE_PASS_FILE=…/password.txt \
     HX_GOOGLE_SERVICES_JSON=…/google-services.json node scripts/mobile/build-android.mjs
   ```
4. Commit `public/app/hien-xa.apk` cùng mã nguồn, deploy.
