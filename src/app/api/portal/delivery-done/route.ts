import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticatedPortalClient, PortalRpcError, portalRpc } from "@/modules/portal/server";
import { workCommandHttpStatus } from "@/modules/portal/work-command-status";

const baseQuantity = z.string().trim().regex(/^\d+(?:\.\d{1,6})?$/);
const schema = z.object({
  workItemId: z.uuid(),
  operationId: z.uuid(),
  /** null: "Đã giao" — every line as loaded onto the truck. */
  lines: z.array(z.object({ deliveryLineId: z.uuid(), actualBaseQuantity: baseQuantity })).min(1).max(50).nullable(),
  receiverName: z.string().trim().max(120).default(""),
  note: z.string().trim().max(1000).default(""),
  evidenceIds: z.array(z.uuid()).max(5),
  expectedVersion: z.number().int().positive(),
  expectedDeliveryVersion: z.number().int().positive(),
  expectedAssignmentVersion: z.number().int().positive(),
});

/** Vietnamese reason for a refused report; the technical code is never shown. */
export function deliveryDoneMessage(raw: string) {
  if (raw.includes("delivery_photo_required")) return "Chụp ít nhất 1 ảnh hàng đã giao rồi xác nhận.";
  if (raw.includes("delivery_receiver_or_failure_reason_required")) return "Ghi lý do không giao được (ít nhất 3 ký tự), hoặc tên người nhận.";
  if (raw.includes("delivery_work_not_submittable")) return "Kho chưa bàn giao hàng lên xe hoặc việc đã được báo. Tải lại công việc.";
  if (raw.includes("stale_work_or_delivery_version")) return "Công việc vừa được cập nhật. Tải lại công việc rồi báo lại.";
  if (raw.includes("work_result_evidence_invalid")) return "Có ảnh không hợp lệ hoặc đã được dùng. Xóa ảnh đó và chụp lại.";
  if (raw.includes("invalid_delivery_result_line") || raw.includes("delivery_result_line_missing")) return "Số lượng báo giao phải đủ từng dòng và không vượt lượng đã lấy lên xe.";
  if (raw.includes("operation_payload_conflict")) return "Lần gửi trước có nội dung khác. Tải lại công việc rồi báo lại.";
  if (raw.includes("forbidden") || raw.includes("assignee")) return "Bạn không còn là người được giao việc này. Liên hệ điều phối.";
  return "Không gửi được kết quả. Kiểm tra kết nối rồi bấm lại; hệ thống không ghi hai lần.";
}

/** "Đã giao" / "Giao thiếu" / "Không giao được" from the worker portal (A3), with the photos already uploaded. */
export async function POST(request: Request) {
  const context = await authenticatedPortalClient();
  if (!context) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn. Đăng nhập lại." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Thông tin gửi chưa hợp lệ. Tải lại công việc." }, { status: 400 });
  const body = parsed.data;
  try {
    const resultId = await portalRpc<string>(context.supabase, "submit_portal_delivery_done", {
      target_work_item_id: body.workItemId,
      result_lines: body.lines ? body.lines.map((line) => ({ delivery_line_id: line.deliveryLineId, actual_base_quantity: line.actualBaseQuantity })) : null,
      receiver_name: body.receiverName, note: body.note, evidence_ids: body.evidenceIds,
      expected_work_version: body.expectedVersion, expected_delivery_version: body.expectedDeliveryVersion,
      expected_assignment_version: body.expectedAssignmentVersion, operation_id: body.operationId,
    });
    return NextResponse.json({ resultId });
  } catch (error) {
    const raw = error instanceof PortalRpcError ? error.rawMessage : "";
    if (!(error instanceof PortalRpcError)) return NextResponse.json({ error: deliveryDoneMessage(""), unknown: true }, { status: 503 });
    return NextResponse.json({ error: deliveryDoneMessage(raw) }, { status: workCommandHttpStatus(error) });
  }
}
