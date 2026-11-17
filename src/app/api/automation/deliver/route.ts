export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { claimDelivery, deliverEmail, deliverPush, settleDelivery, verifyDelivery } from "@/modules/automation/deliver";

/** F5: email and web push handed over by the database (pg_net), signed with HX_AUTOMATION_SECRET. */
export async function POST(request: NextRequest) {
  const secret = process.env.HX_AUTOMATION_SECRET;
  if (!secret || secret.length < 16) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "invalid" }, { status: 400 }); }
  const item = verifyDelivery(raw, secret);
  if (!item) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  // D97 (T-6): one send per job while its signed messages are valid.
  const claim = claimDelivery(item.job_id);
  if (claim === "DELIVERED") return NextResponse.json({ ok: true, duplicate: true });
  if (claim === "SENDING") return NextResponse.json({ error: "delivery_in_progress" }, { status: 409 });
  let delivered = false;
  let result;
  try {
    result = item.channel === "EMAIL" ? await deliverEmail(item) : await deliverPush(item);
    delivered = result.status === 200;
  } finally {
    settleDelivery(item.job_id, delivered);
  }
  return NextResponse.json(result.error ? { error: result.error } : { ok: true }, { status: result.status });
}
