import { NextResponse } from "next/server";

import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";

export async function POST(request: Request) {
  const context = await authenticatedPortalClient();
  if (!context) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const workItemId = String(body.workItemId ?? "");
    const operationId = String(body.operationId ?? "");
    const version = Number(body.version);
    if (!workItemId || !operationId || !Number.isInteger(version)) {
      throw new Error("Dữ liệu bắt đầu công việc không hợp lệ");
    }
    const startedId = await portalRpc<string>(context.supabase, "start_work_item", {
      target_work_item_id: workItemId,
      expected_version: version,
      operation_id: operationId,
    });
    return NextResponse.json({ workItemId: startedId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể bắt đầu công việc" },
      { status: 409 },
    );
  }
}
