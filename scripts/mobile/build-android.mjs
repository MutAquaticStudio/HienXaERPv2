#!/usr/bin/env node
// D82: builds the native Android app "Hiền Xa" (mobile/android, its own WebView over https://app.hienxavlxd.com) as a signed
// APK in public/app/hien-xa.apk. Run again only when the app shell changes (name, icon, colours, native features, version):
// the screens are the website itself, so a web deploy reaches the app without a new APK.
//
// Needs: JDK 17+, an Android SDK with "platforms;android-36" and "build-tools;36.0.0", the signing key the Owner keeps and
// (D86, push) the Firebase config of the app, google-services.json — both never in the repo:
//   ANDROID_HOME=… HX_APK_KEYSTORE=…/hien-xa.keystore HX_APK_KEYSTORE_PASS_FILE=…/password.txt \
//   HX_GOOGLE_SERVICES_JSON=…/google-services.json node scripts/mobile/build-android.mjs
// Raise versionCode / versionName in mobile/android/app/build.gradle for every new APK, and ANDROID_APP_VERSION in
// src/lib/app-shell/native-app.ts to the same versionName (older apps then show "Có bản app mới").
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const env = (name) => { const value = process.env[name]; if (!value) throw new Error(`Thiếu biến môi trường ${name}`); return value; };
const sdk = env("ANDROID_HOME");
env("HX_APK_KEYSTORE");
env("HX_APK_KEYSTORE_PASS_FILE");
// D86: without Firebase the app would have no push, so a release is refused without it.
const googleServicesSource = env("HX_GOOGLE_SERVICES_JSON");
const buildTools = path.join(sdk, "build-tools", "36.0.0");
const project = path.join(root, "mobile/android");
const built = path.join(project, "app/build/outputs/apk/release/app-release.apk");
const output = path.join(root, "public/app/hien-xa.apk");
const googleServices = path.join(project, "app/google-services.json");

let firebase;
try { firebase = JSON.parse(readFileSync(googleServicesSource, "utf8")); } catch { firebase = null; }
const packages = (firebase?.client ?? []).map((client) => client?.client_info?.android_client_info?.package_name);
if (!firebase?.project_info?.project_id || !packages.includes("com.hienxavlxd.app")) {
  console.error("HX_GOOGLE_SERVICES_JSON phải là tệp google-services.json của app Android com.hienxavlxd.app (Firebase → Cài đặt dự án → Ứng dụng của bạn).");
  process.exit(1);
}
// Copied in for this build only (git ignores it) and removed afterwards, so no stale config stays behind.
copyFileSync(googleServicesSource, googleServices);
try {
  execFileSync(path.join(project, "gradlew"), ["clean", "assembleRelease", "lintRelease", "--no-daemon", "--quiet"],
    { cwd: project, stdio: "inherit", env: process.env });
} finally {
  rmSync(googleServices, { force: true });
}
if (!existsSync(built)) throw new Error("Gradle không tạo ra APK đã ký (kiểm tra HX_APK_KEYSTORE).");
const resources = execFileSync(path.join(buildTools, "aapt2"), ["dump", "resources", built], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (!/\bstring\/google_app_id\b/.test(resources)) {
  console.error("APK không có cấu hình Firebase (google_app_id): app sẽ không nhận được thông báo đẩy.");
  process.exit(1);
}

const certs = execFileSync(path.join(buildTools, "apksigner"), ["verify", "--print-certs", built], { encoding: "utf8" });
const fingerprint = /SHA-256 digest: ([0-9a-f]+)/.exec(certs)?.[1]?.toUpperCase().match(/../g)?.join(":");
const links = JSON.parse(readFileSync(path.join(root, "public/.well-known/assetlinks.json"), "utf8"));
const listed = links.flatMap((entry) => entry.target?.sha256_cert_fingerprints ?? []);
if (!fingerprint || !listed.includes(fingerprint)) {
  // A different key cannot update the app already on the phones, and app links would stop opening in the app.
  console.error(`Chứng chỉ ${fingerprint ?? "?"} không khớp public/.well-known/assetlinks.json: ký bằng đúng khóa Owner cất giữ.`);
  process.exit(1);
}
const badging = execFileSync(path.join(buildTools, "aapt2"), ["dump", "badging", built], { encoding: "utf8" });
const version = /versionCode='(\d+)' versionName='([^']+)'/.exec(badging);
const published = /ANDROID_APP_VERSION = "([^"]+)"/.exec(readFileSync(path.join(root, "src/lib/app-shell/native-app.ts"), "utf8"))?.[1];
if (version?.[2] !== published) {
  console.error(`APK là phiên bản ${version?.[2]} nhưng src/lib/app-shell/native-app.ts ghi ANDROID_APP_VERSION = ${published}: sửa cho khớp.`);
  process.exit(1);
}
mkdirSync(path.dirname(output), { recursive: true });
copyFileSync(built, output);
console.info(`APK: ${path.relative(root, output)} · phiên bản ${version?.[2]} (mã ${version?.[1]})\nChứng chỉ SHA-256: ${fingerprint}\nFirebase: ${firebase.project_info.project_id}`);
