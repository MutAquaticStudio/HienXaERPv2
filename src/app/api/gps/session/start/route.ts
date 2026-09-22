import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { deliveryId?: string; assignmentVersion?: number; operationId?: string } | null;
  if (!body?.deliveryId || !Number.isInteger(body.assignmentVersion) || !body.operationId) {
    return NextResponse.json({ error: "Dữ liệu bắt đầu GPS không hợp lệ." }, { status: 400 });
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("start_gps_tracking", {
    target_delivery_id: body.deliveryId,
    target_assignment_version: body.assignmentVersion,
    operation_id: body.operationId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
  return NextResponse.json({ sessionId: data });
}
