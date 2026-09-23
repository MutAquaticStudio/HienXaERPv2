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
  const progress = await supabase.from("gps_tracking_sessions").select("last_sequence").eq("id", data).maybeSingle();
  const lastSequence = Number(progress.data?.last_sequence);
  if (progress.error || !progress.data || !Number.isSafeInteger(lastSequence) || lastSequence < 0) {
    return NextResponse.json({ error: "Không thể đồng bộ thứ tự vị trí của phiên GPS." }, { status: 409 });
  }
  return NextResponse.json({ sessionId: data, lastSequence });
}
