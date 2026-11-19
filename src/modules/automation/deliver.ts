import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import webpush, { WebPushError } from "web-push";
import { z } from "zod";
import { sendEmail } from "@/lib/email/send";
import { appPushToken } from "@/modules/notifications/app-push-token";
import { sendFcm } from "./fcm";

/**
 * F5: the database (pg_net) hands email and push jobs (web push; D86: the Android app through Firebase, `fcm.ts`) to the app,
 * signed with the shared secret that is in Supabase Vault (hx_automation_secret) and in the app environment
 * (HX_AUTOMATION_SECRET). The app only sends; it never reads or writes the database here, so no privileged database key is
 * involved. A device that is gone answers 410, and the database removes it.
 */
const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_SKEW_MS = 60_000;
const MAX_REMEMBERED = 10_000;

const message = z.object({
  job_id: z.guid(),
  channel: z.enum(["EMAIL", "PUSH"]),
  sent_at: z.string(),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).nullish(),
  link: z.url().max(500).nullish(),
  to: z.email().nullish(),
  subscription: z.object({ endpoint: z.url().max(1000), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }) }).nullish(),
  // D86: a phone with the Android app (its Firebase token), and what the app needs to open the right page.
  fcm: z.object({ token: appPushToken }).nullish(),
  kind: z.string().max(100).nullish(),
  id: z.string().max(100).nullish(),
});
export type DeliveryMessage = z.infer<typeof message>;

export function signDelivery(data: string, secret: string) {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

/** The signed message, or null when the signature, shape or age is wrong. */
export function verifyDelivery(raw: unknown, secret: string, now = Date.now()): DeliveryMessage | null {
  const envelope = z.object({ data: z.string().max(20000), signature: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(raw);
  if (!envelope.success) return null;
  const expected = Buffer.from(signDelivery(envelope.data.data, secret), "hex");
  const given = Buffer.from(envelope.data.signature, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(envelope.data.data); } catch { return null; }
  const result = message.safeParse(parsed);
  if (!result.success) return null;
  const age = now - new Date(result.data.sent_at).getTime();
  return Number.isFinite(age) && age >= -MAX_SKEW_MS && age <= MAX_AGE_MS ? result.data : null;
}

/**
 * D97 (T-6): a signed message is valid for 5 minutes, and the same job is sent at most once while its messages are valid:
 * a copy that arrives again (a replay, or the database retrying a job whose first answer it never got) is answered as done
 * without sending; one that arrives while the first is still being sent waits (409, retried by the database). A job that
 * failed may be sent again. Kept by this server instance only, for as long as a message stays valid.
 */
const handled = new Map<string, { delivered: boolean; until: number }>();

export function claimDelivery(jobId: string, now = Date.now()): "NEW" | "SENDING" | "DELIVERED" {
  for (const [id, entry] of handled) if (entry.until <= now) handled.delete(id);
  const entry = handled.get(jobId);
  if (entry) return entry.delivered ? "DELIVERED" : "SENDING";
  if (handled.size >= MAX_REMEMBERED) handled.delete(handled.keys().next().value as string);
  handled.set(jobId, { delivered: false, until: now + MAX_AGE_MS + MAX_SKEW_MS });
  return "NEW";
}

export function settleDelivery(jobId: string, delivered: boolean, now = Date.now()) {
  if (delivered) handled.set(jobId, { delivered: true, until: now + MAX_AGE_MS + MAX_SKEW_MS });
  else handled.delete(jobId);
}

export type DeliveryResult = { status: 200 | 410 | 422 | 502 | 503; error?: string };
type Env = Record<string, string | undefined>;

export async function deliverEmail(item: DeliveryMessage, env: Env = process.env): Promise<DeliveryResult> {
  if (!item.to) return { status: 422, error: "missing_recipient" };
  return sendEmail({ to: item.to, subject: item.title, text: [item.body, item.link].filter(Boolean).join("\n\n") || item.title }, env);
}

export async function deliverPush(item: DeliveryMessage, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<DeliveryResult> {
  if (item.fcm) return sendFcm({ jobId: item.job_id, token: item.fcm.token, title: item.title, body: item.body, link: item.link, kind: item.kind, id: item.id }, env, fetchImpl);
  if (!item.subscription) return { status: 422, error: "missing_subscription" };
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { status: 503, error: "push_not_configured" };
  try {
    await webpush.sendNotification(item.subscription, JSON.stringify({ title: item.title, body: item.body ?? "", link: item.link ?? null, tag: item.job_id }), {
      TTL: 24 * 60 * 60, urgency: "high",
      vapidDetails: { subject: env.VAPID_SUBJECT || "mailto:admin@hienxavlxd.com", publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
    });
    return { status: 200 };
  } catch (error) {
    // The browser unsubscribed or the subscription expired: the database removes the device.
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) return { status: 410, error: "subscription_gone" };
    return { status: 502, error: "push_failed" };
  }
}
