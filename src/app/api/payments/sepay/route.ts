import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

const noStore = { "cache-control": "no-store" };
const MAX_BODY = 32_000;
const SIGNATURE = /^sha256=[0-9a-f]{64}$/;

/**
 * D97 (T-5): with SEPAY_WEBHOOK_SECRET set on the server (the same value as hx_sepay_webhook_secret in Vault), a forged
 * signature is refused here in constant time, before any database call; the database still checks it. Unset = only the
 * database checks (as before).
 */
function signatureMatches(signature: string, sentAt: string, body: string) {
  const secret = process.env.SEPAY_WEBHOOK_SECRET;
  if (!secret) return true;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(`${sentAt}.${body}`, "utf8").digest("hex")}`);
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * D42: SePay calls this for every bank movement. The raw body and the X-SePay-Signature / X-SePay-Timestamp headers go
 * straight to the database, which checks the HMAC with the secret kept in Vault and posts the receipt once per SePay id.
 * There is no signed-in user, so this route uses the service key (Owner-approved for this webhook only) and calls exactly
 * one RPC, which only service_role may execute.
 * SePay counts only HTTP 200 + {"success": true} as delivered; anything else is retried (up to 7 times over 5 hours).
 */
export async function POST(request: Request) {
  // D97 (T-5): an oversized body is refused from its declared length, before it is read.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > MAX_BODY) {
    return NextResponse.json({ success: false, message: "Yêu cầu quá lớn." }, { status: 413, headers: noStore });
  }
  const signature = request.headers.get("x-sepay-signature");
  const sentAt = request.headers.get("x-sepay-timestamp");
  if (!signature || !SIGNATURE.test(signature) || !sentAt || !/^[0-9]{1,15}$/.test(sentAt)) {
    return NextResponse.json({ success: false, message: "Yêu cầu không hợp lệ." }, { status: 400, headers: noStore });
  }
  const body = await request.text().catch(() => "");
  if (!body || body.length > MAX_BODY) {
    return NextResponse.json({ success: false, message: "Yêu cầu không hợp lệ." }, { status: 400, headers: noStore });
  }
  if (!signatureMatches(signature, sentAt, body)) {
    return NextResponse.json({ success: false, message: "Chữ ký không hợp lệ." }, { status: 401, headers: noStore });
  }
  let supabase;
  try {
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!secretKey) throw new Error("missing service key");
    supabase = createClient(getSupabaseConfig().url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch {
    return NextResponse.json({ success: false, message: "Hệ thống chưa sẵn sàng." }, { status: 503, headers: noStore });
  }
  const { data, error } = await supabase.rpc("ingest_sepay_webhook", { raw_body: body, signature, sent_at: sentAt });
  if (error?.message.includes("sepay_signature_invalid")) {
    return NextResponse.json({ success: false, message: "Chữ ký không hợp lệ." }, { status: 401, headers: noStore });
  }
  if (error?.message.includes("sepay_payload_invalid")) {
    return NextResponse.json({ success: false, message: "Dữ liệu giao dịch không hợp lệ." }, { status: 400, headers: noStore });
  }
  // Not configured yet or a transient database error: answer non-200 so SePay retries later.
  if (error || (data as { success?: boolean } | null)?.success !== true) {
    return NextResponse.json({ success: false, message: "Chưa ghi nhận được, SePay sẽ gửi lại." }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ success: true }, { headers: noStore });
}
