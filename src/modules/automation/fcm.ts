import "server-only";

import { createSign } from "node:crypto";
import { z } from "zod";
import { tokenHint } from "@/modules/notifications/app-push-token";

/**
 * D86: push to the Android app "Hiền Xa" through Firebase Cloud Messaging (HTTP v1). The app route signs in to Google with the
 * Firebase service account kept in the app environment as FIREBASE_SERVICE_ACCOUNT (the whole JSON file from Firebase →
 * Project settings → Service accounts; never in the repository): an RS256 JWT signed here with Node's crypto is exchanged for
 * an OAuth2 access token, which is reused until shortly before it expires. Neither the key nor a device token is ever logged.
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** A new access token this long before the old one expires (Google issues them for an hour). */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** The app's notification channel "Thông báo Hiền Xa": push_channel_id in mobile/android/app/src/main/res/values/strings.xml. */
export const ANDROID_CHANNEL_ID = "hx_thong_bao";

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;
export type FcmResult = { status: 200 | 410 | 422 | 502 | 503; error?: string };
export type FcmMessage = { jobId: string; token: string; title: string; body?: string | null; link?: string | null; kind?: string | null; id?: string | null };

const serviceAccount = z.object({
  project_id: z.string().regex(/^[a-z0-9-]{4,40}$/),
  client_email: z.email(),
  private_key: z.string().includes("PRIVATE KEY"),
  private_key_id: z.string().max(100).optional(),
});
export type ServiceAccount = z.infer<typeof serviceAccount>;

/** FIREBASE_SERVICE_ACCOUNT, or null when it is missing or not a service account JSON. */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = serviceAccount.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const base64url = (text: string) => Buffer.from(text, "utf8").toString("base64url");

/** The signed assertion Google exchanges for an access token (RFC 7523, valid for one hour). */
export function signServiceAccountJwt(account: ServiceAccount, nowSeconds: number): string {
  const header = { alg: "RS256", typ: "JWT", ...(account.private_key_id ? { kid: account.private_key_id } : {}) };
  const claims = { iss: account.client_email, scope: FCM_SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 };
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign("RSA-SHA256").update(input).sign(account.private_key);
  return `${input}.${signature.toString("base64url")}`;
}

class FcmAuthError extends Error {}

let cached: { key: string; token: string; expiresAt: number } | null = null;
let pending: { key: string; promise: Promise<string> } | null = null;

async function requestAccessToken(account: ServiceAccount, key: string, fetchImpl: Fetch, now: number): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signServiceAccountJwt(account, Math.floor(now / 1000)) }),
    });
  } catch {
    throw new Error("token_unreachable");
  }
  // 400 / 401: the key was revoked, belongs to nothing, or the JSON is not the one Firebase gave.
  if (response.status === 400 || response.status === 401 || response.status === 403) throw new FcmAuthError(String(response.status));
  if (!response.ok) throw new Error("token_failed");
  const body = z.object({ access_token: z.string().min(10), expires_in: z.number().positive() }).safeParse(await response.json().catch(() => null));
  if (!body.success) throw new Error("token_invalid");
  cached = { key, token: body.data.access_token, expiresAt: now + body.data.expires_in * 1000 };
  return body.data.access_token;
}

async function accessToken(account: ServiceAccount, fetchImpl: Fetch, now: number): Promise<string> {
  const key = `${account.project_id}|${account.client_email}|${account.private_key_id ?? ""}`;
  if (cached && cached.key === key && cached.expiresAt - REFRESH_MARGIN_MS > now) return cached.token;
  // Many deliveries arrive at once (pg_net sends a batch): they share one request.
  if (pending?.key === key) return pending.promise;
  const promise = requestAccessToken(account, key, fetchImpl, now).finally(() => { if (pending?.promise === promise) pending = null; });
  pending = { key, promise };
  return promise;
}

type FcmError = { status?: string; message?: string; details?: { "@type"?: string; errorCode?: string; fieldViolations?: { field?: string }[] }[] };

async function readError(response: Response): Promise<FcmError> {
  const body = await response.json().catch(() => null) as { error?: FcmError } | null;
  return body?.error ?? {};
}

/** Firebase no longer knows this phone's token (app removed, data cleared, token replaced): the device is deleted. */
function tokenGone(httpStatus: number, error: FcmError): boolean {
  const codes = (error.details ?? []).map((detail) => detail.errorCode).filter(Boolean);
  if (codes.includes("UNREGISTERED") || httpStatus === 404 || error.status === "NOT_FOUND") return true;
  if (httpStatus !== 400 && error.status !== "INVALID_ARGUMENT") return false;
  // INVALID_ARGUMENT is also answered for a bad message; only a bad token removes the device.
  const fields = (error.details ?? []).flatMap((detail) => detail.fieldViolations ?? []).map((violation) => violation.field);
  return fields.includes("message.token") || /registration token/i.test(error.message ?? "");
}

function messageFor(item: FcmMessage) {
  const data = Object.fromEntries(Object.entries({ link: item.link, kind: item.kind, id: item.id }).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return {
    message: {
      token: item.token,
      notification: { title: item.title, ...(item.body ? { body: item.body } : {}) },
      ...(Object.keys(data).length ? { data } : {}),
      android: { priority: "HIGH", ttl: "86400s",
        notification: { channel_id: ANDROID_CHANNEL_ID, default_sound: true, notification_priority: "PRIORITY_HIGH" } },
    },
  };
}

export async function sendFcm(item: FcmMessage, env: Env = process.env, fetchImpl: Fetch = fetch, now = Date.now()): Promise<FcmResult> {
  const account = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  if (!account) {
    console.warn("fcm_not_configured", { job: item.jobId, present: Boolean(env.FIREBASE_SERVICE_ACCOUNT?.trim()) });
    return { status: 503, error: "fcm_not_configured" };
  }
  let bearer: string;
  try {
    bearer = await accessToken(account, fetchImpl, now);
  } catch (error) {
    if (error instanceof FcmAuthError) {
      console.warn("fcm_auth_failed", { job: item.jobId, status: error.message });
      return { status: 503, error: "fcm_auth_failed" };
    }
    return { status: 502, error: "push_failed" };
  }
  let response: Response;
  try {
    response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(messageFor(item)),
    });
  } catch {
    return { status: 502, error: "push_failed" };
  }
  if (response.ok) return { status: 200 };
  const error = await readError(response);
  if (tokenGone(response.status, error)) return { status: 410, error: "subscription_gone" };
  if (response.status === 401) {
    // The access token was not accepted (revoked key): ask for a new one next time.
    cached = null;
    return { status: 503, error: "fcm_auth_failed" };
  }
  console.warn("fcm_send_failed", { job: item.jobId, status: response.status, code: error.status,
    errorCode: error.details?.find((detail) => detail.errorCode)?.errorCode, device: tokenHint(item.token) });
  return { status: 502, error: "push_failed" };
}
