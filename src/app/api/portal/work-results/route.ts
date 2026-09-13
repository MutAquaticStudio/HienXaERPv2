import { NextResponse } from "next/server";

import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";

export async function POST(request: Request) {
  const context = await authenticatedPortalClient();
  if (!context) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const actualQuantity = Number(body.actualQuantity);
    const expectedVersion = Number(body.expectedVersion);
    if (
      !body.workItemId ||
      !body.operationId ||
      !Number.isFinite(actualQuantity) ||
      actualQuantity < 0 ||
      !Number.isInteger(expectedVersion)
    ) {
      throw new Error("Kết quả công việc không hợp lệ");
    }
    const resultId = await portalRpc<string>(context.supabase, "submit_portal_work_result", {
      target_work_item_id: String(body.workItemId),
      actual_quantity: actualQuantity,
      note: String(body.note ?? ""),
      receiver_name: String(body.receiverName ?? ""),
      target_evidence_id: body.evidenceId ? String(body.evidenceId) : null,
      expected_version: expectedVersion,
      operation_id: String(body.operationId),
    });
    return NextResponse.json({ resultId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể gửi kết quả" }, { status: 409 });
  }
}
