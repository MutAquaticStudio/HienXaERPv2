import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

const noStore = { "cache-control": "no-store" };
const MAX_BODY = 32_000;

/**
 * D42: SePay calls this for every bank movement. The raw body and the X-SePay-Signature / X-SePay-Timestamp headers go
 * straight to the database, which checks the HMAC with the secret kept in Vault and posts the receipt once per SePay id.
 * There is no signed-in user, so this route uses the service key (Owner-approved for this webhook only) and calls exactly
 * one RPC, which only service_role may execute.
 * SePay counts only HTTP 200 + {"success": true} as delivered; anything else is retried (up to 7 times over 5 hours).
 */
export async function POST(request: Request) {
  const body = await request.text().catch(() => "");
  const signature = request.headers.get("x-sepay-signature");
  const sentAt = request.headers.get("x-sepay-timestamp");
  if (!body || body.length > MAX_BODY || !signature || !sentAt) {
    return NextResponse.json({ success: false, message: "Yêu cầu không hợp lệ." }, { status: 400, headers: noStore });
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
