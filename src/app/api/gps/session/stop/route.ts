import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { sessionId?: string; operationId?: string } | null;
  if (!body?.sessionId || !body.operationId) return NextResponse.json({ error: "Phiên GPS không hợp lệ." }, { status: 400 });
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("stop_gps_tracking", {
    target_session_id: body.sessionId,
    operation_id: body.operationId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
  return NextResponse.json({ sessionId: data });
}
