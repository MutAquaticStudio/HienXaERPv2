#!/usr/bin/env node
// D82: builds the native Android app "Hiền Xa" (mobile/android, its own WebView over https://app.hienxavlxd.com) as a signed
// APK in public/app/hien-xa.apk. Run again only when the app shell changes (name, icon, colours, native features, version):
// the screens are the website itself, so a web deploy reaches the app without a new APK.
//
// Needs: JDK 17+, an Android SDK with "platforms;android-36" and "build-tools;36.0.0", and the signing key the Owner keeps
// (never in the repo):
//   ANDROID_HOME=… HX_APK_KEYSTORE=…/hien-xa.keystore HX_APK_KEYSTORE_PASS_FILE=…/password.txt node scripts/mobile/build-android.mjs
// Raise versionCode / versionName in mobile/android/app/build.gradle for every new APK.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const env = (name) => { const value = process.env[name]; if (!value) throw new Error(`Thiếu biến môi trường ${name}`); return value; };
const sdk = env("ANDROID_HOME");
env("HX_APK_KEYSTORE");
env("HX_APK_KEYSTORE_PASS_FILE");
const buildTools = path.join(sdk, "build-tools", "36.0.0");
const project = path.join(root, "mobile/android");
const built = path.join(project, "app/build/outputs/apk/release/app-release.apk");
const output = path.join(root, "public/app/hien-xa.apk");

execFileSync(path.join(project, "gradlew"), ["clean", "assembleRelease", "lintRelease", "--no-daemon", "--quiet"],
  { cwd: project, stdio: "inherit", env: process.env });
if (!existsSync(built)) throw new Error("Gradle không tạo ra APK đã ký (kiểm tra HX_APK_KEYSTORE).");

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
mkdirSync(path.dirname(output), { recursive: true });
copyFileSync(built, output);
console.info(`APK: ${path.relative(root, output)} · phiên bản ${version?.[2]} (mã ${version?.[1]})\nChứng chỉ SHA-256: ${fingerprint}`);
