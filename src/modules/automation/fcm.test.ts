// @vitest-environment node
import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { ANDROID_CHANNEL_ID, parseServiceAccount, sendFcm, signServiceAccountJwt } from "./fcm";

// A key made for this test only (never a real Firebase key).
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const account = (id: string) => ({ type: "service_account", project_id: "hx-test-project", private_key_id: id, private_key: pem,
  client_email: "firebase-adminsdk@hx-test-project.iam.gserviceaccount.com" });
const env = (id: string) => ({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account(id)) });
const device = "fcmTokenTest01:APA91b" + "z".repeat(60) + "END123";
const item = { jobId: "11111111-1111-4111-8111-111111111111", token: device, title: "Việc mới: giao 20 bao", body: "Công trình 350",
  link: "https://app.example.test/work/jobs/1", kind: "work.assigned", id: "22222222-2222-4222-8222-222222222222" };
const now = Date.parse("2026-11-16T03:00:00Z");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const granted = () => json(200, { access_token: "ya29.test-access-token", expires_in: 3599, token_type: "Bearer" });
const fcmError = (status: number, code: string, details: unknown[] = [], message = "") => json(status, { error: { code: status, status: code, message, details } });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

it("signs the service-account assertion with RS256 (verifiable with the public key)", () => {
  const jwt = signServiceAccountJwt(parseServiceAccount(JSON.stringify(account("k-sign")))!, 1_800_000_000);
  const [header, claims, signature] = jwt.split(".");
  expect(verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT", kid: "k-sign" });
  expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: "firebase-adminsdk@hx-test-project.iam.gserviceaccount.com",
    scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: 1_800_000_000, exp: 1_800_003_600 });
  expect(verify("RSA-SHA256", Buffer.from(`${header}.${claims}x`), publicKey, Buffer.from(signature, "base64url"))).toBe(false);
});

it("sends title, text and the link to the phone, and reuses the access token until shortly before it expires", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(granted()).mockResolvedValue(json(200, { name: "projects/hx-test-project/messages/1" }));
  expect(await sendFcm(item, env("k-send"), fetch, now)).toEqual({ status: 200 });
  const [tokenUrl, tokenInit] = fetch.mock.calls[0];
  expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
  const form = new URLSearchParams(String(tokenInit.body));
  expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
  expect(form.get("assertion")?.split(".")).toHaveLength(3);
  const [sendUrl, sendInit] = fetch.mock.calls[1];
  expect(sendUrl).toBe("https://fcm.googleapis.com/v1/projects/hx-test-project/messages:send");
  expect(sendInit.headers).toEqual({ Authorization: "Bearer ya29.test-access-token", "Content-Type": "application/json" });
  expect(JSON.parse(sendInit.body)).toEqual({ message: { token: device, notification: { title: "Việc mới: giao 20 bao", body: "Công trình 350" },
    data: { link: "https://app.example.test/work/jobs/1", kind: "work.assigned", id: "22222222-2222-4222-8222-222222222222" },
    android: { priority: "HIGH", ttl: "86400s", notification: { channel_id: ANDROID_CHANNEL_ID, default_sound: true, notification_priority: "PRIORITY_HIGH", tag: `hx-${item.jobId}` } } } });

  // 50 minutes later: same access token. 56 minutes later (under 5 minutes left): a new one.
  expect(await sendFcm(item, env("k-send"), fetch, now + 50 * 60_000)).toEqual({ status: 200 });
  expect(fetch.mock.calls.filter(([url]) => url === "https://oauth2.googleapis.com/token")).toHaveLength(1);
  fetch.mockResolvedValueOnce(granted());
  expect(await sendFcm({ ...item, body: null, link: null, kind: null, id: null }, env("k-send"), fetch, now + 56 * 60_000)).toEqual({ status: 200 });
  expect(fetch.mock.calls.filter(([url]) => url === "https://oauth2.googleapis.com/token")).toHaveLength(2);
  expect(JSON.parse(fetch.mock.calls.at(-1)![1].body).message).toEqual(expect.objectContaining({ notification: { title: "Việc mới: giao 20 bao" } }));
  expect(JSON.parse(fetch.mock.calls.at(-1)![1].body).message.data).toBeUndefined();
});

it("reports a phone Firebase no longer knows as gone (the database deletes it); other failures are retried", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(granted());
  const unregistered = [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }];
  fetch.mockResolvedValueOnce(fcmError(404, "NOT_FOUND", unregistered, "Requested entity was not found."));
  expect(await sendFcm(item, env("k-gone"), fetch, now)).toEqual({ status: 410, error: "subscription_gone" });
  fetch.mockResolvedValueOnce(fcmError(400, "INVALID_ARGUMENT", [{ "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ field: "message.token" }] }]));
  expect(await sendFcm(item, env("k-gone"), fetch, now)).toEqual({ status: 410, error: "subscription_gone" });
  fetch.mockResolvedValueOnce(fcmError(400, "INVALID_ARGUMENT", [], "The registration token is not a valid FCM registration token"));
  expect(await sendFcm(item, env("k-gone"), fetch, now)).toEqual({ status: 410, error: "subscription_gone" });
  // A bad message (not the token), a wrong Firebase project for this app, Firebase busy: kept and retried.
  fetch.mockResolvedValueOnce(fcmError(400, "INVALID_ARGUMENT", [{ "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ field: "message.android.ttl" }] }]));
  expect(await sendFcm(item, env("k-gone"), fetch, now)).toEqual({ status: 502, error: "push_failed" });
  fetch.mockResolvedValueOnce(fcmError(403, "PERMISSION_DENIED", [{ errorCode: "SENDER_ID_MISMATCH" }]));
  expect(await sendFcm(item, env("k-gone"), fetch, now)).toEqual({ status: 502, error: "push_failed" });
  fetch.mockResolvedValueOnce(fcmError(503, "UNAVAILABLE"));
  expect(await sendFcm(item, env("k-gone"), fetch, now)).toEqual({ status: 502, error: "push_failed" });
  fetch.mockRejectedValueOnce(new Error("network"));
  expect(await sendFcm(item, env("k-gone"), fetch, now)).toEqual({ status: 502, error: "push_failed" });
  // Never the whole device token or the key in the logs.
  const logged = JSON.stringify(warn.mock.calls);
  expect(logged).toContain("SENDER_ID_MISMATCH");
  expect(logged).toContain("…END123");
  expect(logged).not.toContain(device);
  expect(logged).not.toContain("PRIVATE KEY");
});

it("without FIREBASE_SERVICE_ACCOUNT (or with a bad one) nothing is sent and the job waits with the reason", async () => {
  const fetch = vi.fn();
  expect(await sendFcm(item, {}, fetch, now)).toEqual({ status: 503, error: "fcm_not_configured" });
  expect(await sendFcm(item, { FIREBASE_SERVICE_ACCOUNT: "{not json" }, fetch, now)).toEqual({ status: 503, error: "fcm_not_configured" });
  expect(await sendFcm(item, { FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "hx-test-project" }) }, fetch, now)).toEqual({ status: 503, error: "fcm_not_configured" });
  expect(fetch).not.toHaveBeenCalled();
  // Google refuses the key: a readable reason, and a 401 from FCM drops the cached access token.
  fetch.mockResolvedValueOnce(json(400, { error: "invalid_grant" }));
  expect(await sendFcm(item, env("k-refused"), fetch, now)).toEqual({ status: 503, error: "fcm_auth_failed" });
  fetch.mockResolvedValueOnce(granted()).mockResolvedValueOnce(fcmError(401, "UNAUTHENTICATED"));
  expect(await sendFcm(item, env("k-revoked"), fetch, now)).toEqual({ status: 503, error: "fcm_auth_failed" });
  fetch.mockResolvedValueOnce(granted()).mockResolvedValueOnce(json(200, {}));
  expect(await sendFcm(item, env("k-revoked"), fetch, now)).toEqual({ status: 200 });
  expect(fetch.mock.calls.filter(([url]) => url === "https://oauth2.googleapis.com/token")).toHaveLength(3);
  expect(JSON.stringify(warn.mock.calls)).not.toContain("PRIVATE KEY");
});

it("review fix: a bare 404 (wrong Firebase project) or an unusable key never deletes phones; retried jobs share one notification tag", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(granted());
  fetch.mockResolvedValueOnce(fcmError(404, "NOT_FOUND", [], "Requested entity was not found."));
  expect(await sendFcm(item, env("k-project"), fetch, now)).toEqual({ status: 503, error: "fcm_auth_failed" });
  fetch.mockResolvedValueOnce(new Response("<html>Not Found</html>", { status: 404, headers: { "content-type": "text/html" } }));
  expect(await sendFcm(item, env("k-project"), fetch, now)).toEqual({ status: 503, error: "fcm_auth_failed" });
  const broken = JSON.stringify({ ...JSON.parse(env("k-broken").FIREBASE_SERVICE_ACCOUNT!), private_key: "-----BEGIN PRIVATE KEY-----\nkhong-dung\n-----END PRIVATE KEY-----\n" });
  expect(await sendFcm(item, { FIREBASE_SERVICE_ACCOUNT: broken }, vi.fn(), now)).toEqual({ status: 503, error: "fcm_auth_failed" });
  const ok = vi.fn().mockResolvedValueOnce(granted()).mockResolvedValueOnce(new Response("{}", { status: 200 }));
  expect(await sendFcm(item, env("k-tag"), ok, now)).toEqual({ status: 200 });
  expect(JSON.parse(ok.mock.calls.at(-1)![1].body).message.android.notification.tag).toBe(`hx-${item.jobId}`);
});
