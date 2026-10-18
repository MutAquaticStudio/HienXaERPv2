// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ sendMail: vi.fn(), sendNotification: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: m.sendMail }) } }));
vi.mock("web-push", () => {
  class WebPushError extends Error { constructor(public statusCode: number) { super("push"); } }
  return { default: { sendNotification: m.sendNotification }, WebPushError };
});
import { WebPushError } from "web-push";
import { deliverEmail, deliverPush, signDelivery, verifyDelivery } from "./deliver";

const secret = "test-secret-not-real-123";
const now = Date.parse("2026-10-18T03:00:00Z");
const base = { job_id: "11111111-1111-4111-8111-111111111111", sent_at: "2026-10-18T02:59:00Z", title: "Đơn mới từ khách", body: "2 mặt hàng", link: "https://app.example.test/admin/orders/1" };
const envelope = (data: object, key = secret) => { const text = JSON.stringify(data); return { data: text, signature: signDelivery(text, key) }; };
beforeEach(() => vi.clearAllMocks());

it("accepts only fresh messages signed with the shared secret", () => {
  expect(verifyDelivery(envelope({ ...base, channel: "EMAIL", to: "boss@example.test" }), secret, now)?.to).toBe("boss@example.test");
  expect(verifyDelivery(envelope({ ...base, channel: "EMAIL", to: "boss@example.test" }, "other-secret-xxxxxxxx"), secret, now)).toBeNull();
  expect(verifyDelivery({ ...envelope({ ...base, channel: "EMAIL" }), data: JSON.stringify({ ...base, channel: "EMAIL", title: "Đổi" }) }, secret, now)).toBeNull();
  expect(verifyDelivery(envelope({ ...base, channel: "EMAIL", sent_at: "2026-10-18T02:00:00Z" }), secret, now)).toBeNull();
  expect(verifyDelivery(envelope({ ...base, channel: "SMS" }), secret, now)).toBeNull();
  expect(verifyDelivery({ data: "x", signature: "nothex" }, secret, now)).toBeNull();
});

it("sends email over SMTP only when configured", async () => {
  const item = verifyDelivery(envelope({ ...base, channel: "EMAIL", to: "boss@example.test" }), secret, now)!;
  expect(await deliverEmail(item, {})).toEqual({ status: 503, error: "smtp_not_configured" });
  m.sendMail.mockResolvedValue({});
  expect(await deliverEmail(item, { SMTP_HOST: "smtp.example.test", SMTP_USER: "u@example.test", SMTP_PASSWORD: "p" })).toEqual({ status: 200 });
  expect(m.sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "u@example.test", to: "boss@example.test", subject: "Đơn mới từ khách",
    text: "2 mặt hàng\n\nhttps://app.example.test/admin/orders/1" }));
  m.sendMail.mockRejectedValue(new Error("auth"));
  expect((await deliverEmail(item, { SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASSWORD: "p" })).status).toBe(502);
});

it("pushes to the device and reports a device that unsubscribed", async () => {
  const item = verifyDelivery(envelope({ ...base, channel: "PUSH", subscription: { endpoint: "https://push.example.test/e1", keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } } }), secret, now)!;
  const env = { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" };
  expect((await deliverPush(item, {})).status).toBe(503);
  m.sendNotification.mockResolvedValue({});
  expect(await deliverPush(item, env)).toEqual({ status: 200 });
  expect(JSON.parse(m.sendNotification.mock.calls[0][1])).toEqual({ title: "Đơn mới từ khách", body: "2 mặt hàng", link: base.link, tag: base.job_id });
  m.sendNotification.mockRejectedValue(new (WebPushError as unknown as new (code: number) => Error)(410));
  expect(await deliverPush(item, env)).toEqual({ status: 410, error: "subscription_gone" });
  m.sendNotification.mockRejectedValue(new Error("network"));
  expect((await deliverPush(item, env)).status).toBe(502);
});
