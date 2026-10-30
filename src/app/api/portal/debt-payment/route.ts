import { NextResponse } from "next/server";
import { z } from "zod";
import { debtPaymentOptionsSchema } from "@/modules/finance/sepay";
import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";

const noStore = { "cache-control": "private, no-store" };
const query = z.object({ customer: z.guid(), since: z.iso.datetime().optional() });

/**
 * D42: GET ?customer=… → what to transfer right now (exact outstanding amounts and notes, from the database);
 * GET ?customer=…&since=… → has the bank confirmed a payment since the QR was opened?
 */
export async function GET(request: Request) {
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400, headers: noStore });
  const context = await authenticatedPortalClient();
  if (!context) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401, headers: noStore });
  try {
    if (parsed.data.since) {
      const status = await portalRpc<{ paid: boolean; payment_number?: string; amount_vnd?: string }>(context.supabase, "portal_bank_payment_status",
        { target_customer_id: parsed.data.customer, since: parsed.data.since });
      return NextResponse.json(status, { headers: noStore });
    }
    const raw = await portalRpc<unknown>(context.supabase, "portal_debt_payment_options", { target_customer_id: parsed.data.customer });
    const options = raw === null ? null : debtPaymentOptionsSchema.parse(raw);
    return NextResponse.json({ options }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Chưa lấy được thông tin thanh toán. Thử lại sau ít phút." }, { status: 503, headers: noStore });
  }
}
