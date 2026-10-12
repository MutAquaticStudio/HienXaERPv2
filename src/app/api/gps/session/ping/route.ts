import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { GPS_DEVICE_AVAILABLE, GPS_DEVICE_UNAVAILABLE_MESSAGE } from "@/modules/routing/device-availability";

type PingBody = {
  sessionId?: string;
  sequence?: number;
  capturedAt?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  headingDegrees?: number | null;
  operationId?: string;
};

export async function POST(request: Request) {
  if (!GPS_DEVICE_AVAILABLE) return NextResponse.json({ error: GPS_DEVICE_UNAVAILABLE_MESSAGE }, { status: 501 });
  const body = await request.json().catch(() => null) as PingBody | null;
  if (!body?.sessionId || !Number.isSafeInteger(body.sequence) || !body.sequence || !body.capturedAt
    || !Number.isFinite(body.latitude) || !Number.isFinite(body.longitude) || !body.operationId) {
    return NextResponse.json({ error: "Dữ liệu vị trí không hợp lệ." }, { status: 400 });
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("record_gps_ping", {
    target_session_id: body.sessionId,
    target_sequence: body.sequence,
    target_captured_at: body.capturedAt,
    target_latitude: body.latitude,
    target_longitude: body.longitude,
    target_accuracy_meters: body.accuracyMeters ?? null,
    target_speed_mps: body.speedMps ?? null,
    target_heading_degrees: body.headingDegrees ?? null,
    operation_id: body.operationId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
  return NextResponse.json({ positionId: data });
}
