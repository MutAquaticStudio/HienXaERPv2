import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticatedPortalClient, PortalRpcError, portalRpc } from "@/modules/portal/server";
import { workCommandHttpStatus } from "@/modules/portal/work-command-status";

const schema = z.object({ deliveryId: z.guid(), vehicleId: z.guid(), version: z.number().int().positive(), operationId: z.guid() });

export function claimDeliveryMessage(raw: string) {
  if (raw.includes("delivery_not_claimable")) return "Phiếu này đã có người nhận hoặc văn phòng đã điều phối. Tải lại danh sách.";
  if (raw.includes("delivery_claim_stale")) return "Phiếu vừa được cập nhật. Tải lại danh sách rồi nhận lại.";
  if (raw.includes("claim_vehicle_unavailable")) return "Xe này không còn trống cho phiếu này. Chọn xe khác.";
  if (raw.includes("operation_payload_conflict")) return "Lần bấm trước có nội dung khác. Tải lại danh sách.";
  if (raw.includes("forbidden")) return "Tài khoản này không nhận phiếu giao của chi nhánh này.";
  return "Chưa nhận được. Kiểm tra kết nối rồi bấm lại; hệ thống không ghi hai lần.";
}

/** D79 "Nhận phiếu giao": a worker takes a delivery waiting for dispatch, with the truck he picked. */
export async function POST(request: Request) {
  const context = await authenticatedPortalClient();
  if (!context) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn. Đăng nhập lại." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Chọn xe rồi bấm nhận lại." }, { status: 400 });
  try {
    const result = await portalRpc<{ work_item_id: string }>(context.supabase, "claim_delivery", {
      target_delivery_id: parsed.data.deliveryId, target_vehicle_id: parsed.data.vehicleId,
      expected_version: parsed.data.version, operation_id: parsed.data.operationId,
    });
    return NextResponse.json({ workItemId: result.work_item_id });
  } catch (error) {
    if (!(error instanceof PortalRpcError)) return NextResponse.json({ error: claimDeliveryMessage(""), unknown: true }, { status: 503 });
    return NextResponse.json({ error: claimDeliveryMessage(error.rawMessage) }, { status: workCommandHttpStatus(error) });
  }
}
