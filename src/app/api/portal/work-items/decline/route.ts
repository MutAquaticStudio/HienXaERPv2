import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticatedPortalClient, PortalRpcError, portalRpc } from "@/modules/portal/server";
import { workCommandHttpStatus } from "@/modules/portal/work-command-status";

const schema = z.object({ workItemId: z.guid(), version: z.number().int().positive(), operationId: z.guid(), reason: z.string().trim().min(3).max(300) });

export function declineMessage(raw: string) {
  if (raw.includes("decline_reason_required")) return "Ghi lý do từ chối (ít nhất 3 ký tự).";
  if (raw.includes("work_already_started")) return "Hàng đã lên xe hoặc việc đã bắt đầu, không từ chối được nữa. Liên hệ điều phối.";
  if (raw.includes("decline_not_supported")) return "Việc này không từ chối trên cổng thợ được. Liên hệ điều phối.";
  if (raw.includes("work_version_conflict")) return "Công việc vừa được cập nhật. Tải lại rồi thử lại.";
  if (raw.includes("operation_payload_conflict")) return "Lần gửi trước có nội dung khác. Tải lại công việc.";
  if (raw.includes("forbidden")) return "Bạn không còn là người được giao việc này.";
  return "Chưa gửi được. Kiểm tra kết nối rồi bấm lại; hệ thống không ghi hai lần.";
}

/** C2 "Từ chối việc": the assigned worker hands an unstarted delivery job back to dispatch, with a reason. */
export async function POST(request: Request) {
  const context = await authenticatedPortalClient();
  if (!context) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn. Đăng nhập lại." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ghi lý do từ chối (3–300 ký tự)." }, { status: 400 });
  try {
    await portalRpc<string>(context.supabase, "decline_portal_work_item", {
      target_work_item_id: parsed.data.workItemId, reason: parsed.data.reason, expected_version: parsed.data.version, operation_id: parsed.data.operationId,
    });
    return NextResponse.json({ declined: true });
  } catch (error) {
    if (!(error instanceof PortalRpcError)) return NextResponse.json({ error: declineMessage(""), unknown: true }, { status: 503 });
    return NextResponse.json({ error: declineMessage(error.rawMessage) }, { status: workCommandHttpStatus(error) });
  }
}
