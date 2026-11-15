#!/usr/bin/env node
// D81: builds the Android app "Hiền Xa" (Trusted Web Activity over https://app.hienxavlxd.com) as a signed APK in
// public/app/hien-xa.apk. Run again only when the app shell changes (name, icon, colours, version): the screens are the
// website itself, so a web deploy reaches the app without a new APK.
//
// Needs: JDK 17+, an Android SDK with "platforms;android-36" and "build-tools;36.0.0", @bubblewrap/core installed
// somewhere (BUBBLEWRAP_CORE = its folder), and the signing key the Owner keeps (never in the repo):
//   ANDROID_HOME=… BUBBLEWRAP_CORE=…/node_modules/@bubblewrap/core HX_APK_KEYSTORE=…/hien-xa.keystore \
//   HX_APK_KEYSTORE_PASS_FILE=…/password.txt node scripts/mobile/build-android.mjs
// Raise appVersionCode / appVersion in mobile/android/twa-manifest.json for every new APK.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const env = (name) => { const value = process.env[name]; if (!value) throw new Error(`Thiếu biến môi trường ${name}`); return value; };
const sdk = env("ANDROID_HOME");
const keystore = env("HX_APK_KEYSTORE");
const passFile = env("HX_APK_KEYSTORE_PASS_FILE");
const core = createRequire(import.meta.url)(env("BUBBLEWRAP_CORE"));
const buildTools = path.join(sdk, "build-tools", "36.0.0");
const project = path.join(root, "mobile/android/build");
const output = path.join(root, "public/app/hien-xa.apk");

// The icons are served from public/ on a local port, so a new icon does not have to be deployed first.
const server = createServer((request, response) => {
  const file = path.join(root, "public", path.normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)));
  if (!file.startsWith(path.join(root, "public")) || !existsSync(file)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": "image/png" }).end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const local = `http://127.0.0.1:${server.address().port}`;

try {
  const json = JSON.parse(readFileSync(path.join(root, "mobile/android/twa-manifest.json"), "utf8"));
  json.iconUrl = local + json.iconUrl;
  json.maskableIconUrl = local + json.maskableIconUrl;
  json.signingKey = { path: keystore, alias: json.signingKey.alias };
  const manifest = new core.TwaManifest(json);
  rmSync(project, { recursive: true, force: true });
  mkdirSync(project, { recursive: true });
  await new core.TwaGenerator().createTwaProject(project, manifest, new core.ConsoleLog("bubblewrap"));
  writeFileSync(path.join(project, "local.properties"), `sdk.dir=${sdk}\n`);
  execFileSync(path.join(project, "gradlew"), ["assembleRelease", "--no-daemon", "--quiet"], { cwd: project, stdio: "inherit" });

  const unsigned = path.join(project, "app/build/outputs/apk/release/app-release-unsigned.apk");
  const aligned = path.join(project, "app-aligned.apk");
  execFileSync(path.join(buildTools, "zipalign"), ["-f", "-p", "4", unsigned, aligned], { stdio: "inherit" });
  mkdirSync(path.dirname(output), { recursive: true });
  execFileSync(path.join(buildTools, "apksigner"), ["sign", "--ks", keystore, "--ks-key-alias", json.signingKey.alias,
    // PKCS12 keystore: the key uses the keystore password (apksigner would read a second line for --key-pass).
    "--ks-pass", `file:${passFile}`, "--v4-signing-enabled", "false", "--out", output, aligned], { stdio: "inherit" });
  const certs = execFileSync(path.join(buildTools, "apksigner"), ["verify", "--print-certs", output], { encoding: "utf8" });
  const fingerprint = /SHA-256 digest: ([0-9a-f]+)/.exec(certs)?.[1]?.toUpperCase().match(/../g)?.join(":");
  const links = JSON.parse(readFileSync(path.join(root, "public/.well-known/assetlinks.json"), "utf8"));
  const listed = links.flatMap((entry) => entry.target?.sha256_cert_fingerprints ?? []);
  console.info(`APK: ${path.relative(root, output)}\nChứng chỉ SHA-256: ${fingerprint}`);
  if (!fingerprint || !listed.includes(fingerprint)) {
    console.error("public/.well-known/assetlinks.json chưa có dấu vân tay này: app sẽ hiện thanh địa chỉ. Thêm vào rồi deploy.");
    process.exitCode = 1;
  }
} finally {
  // Bubblewrap keeps its icon downloads alive; drop them so the script ends.
  server.closeAllConnections();
  server.close();
}
