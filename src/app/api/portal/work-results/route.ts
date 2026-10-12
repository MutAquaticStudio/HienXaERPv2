import { NextResponse } from "next/server";

import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";
import { parseWorkResultInput } from "@/modules/portal/work-result-input";

export async function POST(request: Request) {
  const context = await authenticatedPortalClient();
  if (!context) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn" }, { status: 401 });
  try {
    const body = parseWorkResultInput(await request.json());
    const args = { target_work_item_id: body.workItemId, note: body.note,
      receiver_name: body.receiverName, target_evidence_id: body.evidenceId ?? null, operation_id: body.operationId };
    const resultId = "deliveryLines" in body
      ? await portalRpc<string>(context.supabase, "submit_portal_delivery_result", {
        ...args, result_lines: body.deliveryLines.map((line) => ({
          delivery_line_id: line.deliveryLineId, actual_base_quantity: String(line.actualQuantity),
        })), expected_work_version: body.expectedVersion, expected_delivery_version: body.expectedDeliveryVersion,
        expected_assignment_version: body.expectedAssignmentVersion, missing_arrival_reason: body.missingArrivalReason,
      })
      : await portalRpc<string>(context.supabase, "submit_portal_work_result", {
        ...args, actual_quantity: String(body.actualQuantity), expected_version: body.expectedVersion,
      });
    return NextResponse.json({ resultId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể gửi kết quả" }, { status: 409 });
  }
}
