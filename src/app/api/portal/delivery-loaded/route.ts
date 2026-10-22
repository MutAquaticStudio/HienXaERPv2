import { NextResponse } from "next/server";
import { z } from "zod";

import { deliveryCommandMessage } from "@/modules/delivery/errors";
import { authenticatedPortalClient, PortalRpcError, portalRpc } from "@/modules/portal/server";
import { workCommandHttpStatus } from "@/modules/portal/work-command-status";

const baseQuantity = z.string().trim().regex(/^\d+(?:\.\d{1,6})?$/);
const schema = z.object({
  workItemId: z.guid(),
  operationId: z.guid(),
  /** null: everything on the delivery was loaded. */
  lines: z.array(z.object({ deliveryLineId: z.guid(), loadedBaseQuantity: baseQuantity })).min(1).max(50).nullable(),
  evidenceIds: z.array(z.guid()).min(1).max(5),
  expectedVersion: z.number().int().positive(),
  expectedDeliveryVersion: z.number().int().positive(),
  expectedAssignmentVersion: z.number().int().positive(),
});

/** Vietnamese reason for a refused loading; the technical code is never shown. */
export function deliveryLoadedMessage(raw: string) {
  if (raw.includes("handoff_photo_required")) return "Chụp ít nhất 1 ảnh hàng trên xe rồi xác nhận.";
  if (raw.includes("delivery_work_not_loadable")) return "Hàng đã được lấy lên xe hoặc phiếu đã thay đổi. Tải lại công việc.";
  if (raw.includes("stale_work_or_delivery_version")) return "Công việc vừa được cập nhật. Tải lại công việc rồi xác nhận lại.";
  if (raw.includes("work_result_evidence_invalid")) return "Có ảnh không hợp lệ hoặc đã được dùng. Xóa ảnh đó và chụp lại.";
  if (raw.includes("operation_payload_conflict")) return "Lần gửi trước có nội dung khác. Tải lại công việc rồi xác nhận lại.";
  if (raw.includes("work_result_forbidden") || raw.includes("assignee")) return "Bạn không còn là người được giao việc này. Liên hệ điều phối.";
  if (raw.includes("insufficient_inventory_for_handoff")) return "Kho không còn đủ hàng cho phiếu này. Báo kho hoặc điều phối.";
  return deliveryCommandMessage(raw);
}

/** "Đã lấy hàng lên xe" from the worker portal (FB7), with the photos already uploaded. */
export async function POST(request: Request) {
  const context = await authenticatedPortalClient();
  if (!context) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn. Đăng nhập lại." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Thông tin gửi chưa hợp lệ. Tải lại công việc." }, { status: 400 });
  const body = parsed.data;
  try {
    const handoffId = await portalRpc<string>(context.supabase, "portal_delivery_loaded", {
      target_work_item_id: body.workItemId,
      loaded_lines: body.lines ? body.lines.map((line) => ({ delivery_line_id: line.deliveryLineId, loaded_base_quantity: line.loadedBaseQuantity })) : null,
      evidence_ids: body.evidenceIds,
      expected_work_version: body.expectedVersion, expected_delivery_version: body.expectedDeliveryVersion,
      expected_assignment_version: body.expectedAssignmentVersion, operation_id: body.operationId,
    });
    return NextResponse.json({ handoffId });
  } catch (error) {
    if (!(error instanceof PortalRpcError)) return NextResponse.json({ error: "Không gửi được. Kiểm tra kết nối rồi bấm lại; hệ thống không ghi hai lần.", unknown: true }, { status: 503 });
    return NextResponse.json({ error: deliveryLoadedMessage(error.rawMessage) }, { status: workCommandHttpStatus(error) });
  }
}
