import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import webpush, { WebPushError } from "web-push";
import { z } from "zod";

/**
 * F5: the database (pg_net) hands email and web-push jobs to the app, signed with the shared secret that is in Supabase
 * Vault (hx_automation_secret) and in the app environment (HX_AUTOMATION_SECRET). The app only sends; it never reads or
 * writes the database here, so no privileged database key is involved.
 */
const MAX_AGE_MS = 15 * 60 * 1000;

const message = z.object({
  job_id: z.uuid(),
  channel: z.enum(["EMAIL", "PUSH"]),
  sent_at: z.string(),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).nullish(),
  link: z.url().max(500).nullish(),
  to: z.email().nullish(),
  subscription: z.object({ endpoint: z.url().max(1000), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }) }).nullish(),
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
  return Number.isFinite(age) && age >= -60_000 && age <= MAX_AGE_MS ? result.data : null;
}

export type DeliveryResult = { status: 200 | 410 | 422 | 502 | 503; error?: string };
type Env = Record<string, string | undefined>;

export async function deliverEmail(item: DeliveryMessage, env: Env = process.env): Promise<DeliveryResult> {
  if (!item.to) return { status: 422, error: "missing_recipient" };
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) return { status: 503, error: "smtp_not_configured" };
  const port = Number(env.SMTP_PORT ?? "465");
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } });
  try {
    await transport.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to: item.to, subject: item.title,
      text: [item.body, item.link].filter(Boolean).join("\n\n") || item.title });
    return { status: 200 };
  } catch {
    return { status: 502, error: "smtp_failed" };
  }
}

export async function deliverPush(item: DeliveryMessage, env: Env = process.env): Promise<DeliveryResult> {
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
