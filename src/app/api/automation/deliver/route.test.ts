// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { NextRequest } from "next/server";
import { signDelivery } from "@/modules/automation/deliver";
import { POST } from "./route";

// D86: the database hands a push for a phone with the Android app (its Firebase token) to this route, which sends it with FCM.
const secret = "test-automation-secret-123";
const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const serviceAccount = JSON.stringify({ type: "service_account", project_id: "hx-route-test", private_key_id: "route-key", private_key: pem,
  client_email: "firebase-adminsdk@hx-route-test.iam.gserviceaccount.com" });
const device = "fcmRouteToken:APA91b" + "r".repeat(80);
const fetch = vi.fn();

function post(data: object) {
  const text = JSON.stringify({ job_id: "33333333-3333-4333-8333-333333333333", channel: "PUSH", sent_at: new Date().toISOString(),
    title: "Có bản giá mới", body: "3 mặt hàng đổi giá từ 17/11/2026", link: "https://app.example.test/customer", subscription: null, ...data });
  return POST(new NextRequest("https://app.example.test/api/automation/deliver", { method: "POST",
    body: JSON.stringify({ data: text, signature: signDelivery(text, secret) }) }));
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubEnv("HX_AUTOMATION_SECRET", secret);
  vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", serviceAccount);
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); fetch.mockReset(); });

it("sends an app push through Firebase and answers 200", async () => {
  fetch.mockResolvedValueOnce(json(200, { access_token: "ya29.route", expires_in: 3600 })).mockResolvedValueOnce(json(200, { name: "projects/hx-route-test/messages/9" }));
  const response = await post({ fcm: { token: device }, kind: "announcement", id: "44444444-4444-4444-8444-444444444444" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  const [url, init] = fetch.mock.calls[1];
  expect(url).toBe("https://fcm.googleapis.com/v1/projects/hx-route-test/messages:send");
  expect(JSON.parse(init.body).message).toEqual(expect.objectContaining({ token: device,
    notification: { title: "Có bản giá mới", body: "3 mặt hàng đổi giá từ 17/11/2026" },
    data: { link: "https://app.example.test/customer", kind: "announcement", id: "44444444-4444-4444-8444-444444444444" } }));
});

it("answers 410 for a token Firebase no longer knows, so the database deletes the device", async () => {
  fetch.mockResolvedValueOnce(json(404, { error: { code: 404, status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }));
  const response = await post({ fcm: { token: device } });
  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({ error: "subscription_gone" });
});

it("without FIREBASE_SERVICE_ACCOUNT nothing is sent: 503 with the reason (the job is retried later)", async () => {
  vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", "");
  const response = await post({ fcm: { token: device } });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "fcm_not_configured" });
  expect(fetch).not.toHaveBeenCalled();
});

it("refuses a token that is not one, and a message not signed with the shared secret", async () => {
  expect((await post({ fcm: { token: "not a token" } })).status).toBe(401);
  const text = JSON.stringify({ job_id: "33333333-3333-4333-8333-333333333333", channel: "PUSH", sent_at: new Date().toISOString(), title: "x", fcm: { token: device } });
  const forged = await POST(new NextRequest("https://app.example.test/api/automation/deliver", { method: "POST",
    body: JSON.stringify({ data: text, signature: signDelivery(text, "another-secret-456789") }) }));
  expect(forged.status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
