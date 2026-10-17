import { NextResponse } from "next/server";

import { PAYMENT_NOTICES_ENABLED } from "@/lib/features";
import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";

export async function POST(request: Request) {
  if (!PAYMENT_NOTICES_ENABLED) return NextResponse.json({ error: "Không tìm thấy." }, { status: 404 });
  const context = await authenticatedPortalClient();
  if (!context) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const amount = Number(body.amountVnd);
    if (
      !body.customerId ||
      !body.evidenceId ||
      !body.operationId ||
      !body.paidOn ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      throw new Error("Thông tin thanh toán không hợp lệ");
    }
    const noticeId = await portalRpc<string>(context.supabase, "submit_payment_notice", {
      target_customer_id: String(body.customerId),
      target_evidence_id: String(body.evidenceId),
      declared_amount_vnd: amount,
      paid_on: String(body.paidOn),
      payment_reference: String(body.reference ?? ""),
      customer_note: String(body.note ?? ""),
      operation_id: String(body.operationId),
    });
    return NextResponse.json({ noticeId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gửi thông báo thất bại" }, { status: 409 });
  }
}
