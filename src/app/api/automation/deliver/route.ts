export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { deliverEmail, deliverPush, verifyDelivery } from "@/modules/automation/deliver";

/** F5: email and web push handed over by the database (pg_net), signed with HX_AUTOMATION_SECRET. */
export async function POST(request: NextRequest) {
  const secret = process.env.HX_AUTOMATION_SECRET;
  if (!secret || secret.length < 16) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "invalid" }, { status: 400 }); }
  const item = verifyDelivery(raw, secret);
  if (!item) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  const result = item.channel === "EMAIL" ? await deliverEmail(item) : await deliverPush(item);
  return NextResponse.json(result.error ? { error: result.error } : { ok: true }, { status: result.status });
}
