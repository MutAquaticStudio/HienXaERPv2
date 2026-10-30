import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveInternalAccess } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";

const noStore = { "cache-control": "private, no-store" };
const position = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(100000).nullable().optional(),
  capturedAt: z.iso.datetime(),
});

async function access() {
  try { return await resolveInternalAccess(); }
  catch (error) { return error instanceof AppError ? error.status : 503; }
}

/** FB18 (D40): is the signed-in worker on shift (clocked in, not out)? The phone shares its position only then. */
export async function GET() {
  const me = await access();
  if (typeof me === "number") return NextResponse.json({ onShift: false }, { status: me, headers: noStore });
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("attendance_records").select("id").eq("employee_id", me.employeeId)
    .not("clock_in_at", "is", null).is("clock_out_at", null).gte("clock_in_at", new Date(Date.now() - 20 * 3600_000).toISOString()).limit(1);
  if (error) return NextResponse.json({ onShift: false }, { status: 503, headers: noStore });
  return NextResponse.json({ onShift: (data ?? []).length > 0 }, { headers: noStore });
}

/** FB18 (D40): one position from the worker's phone during the shift. The database refuses it outside a shift. */
export async function POST(request: Request) {
  const me = await access();
  if (typeof me === "number") return NextResponse.json({ error: "Cần đăng nhập." }, { status: me, headers: noStore });
  const parsed = position.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Vị trí không hợp lệ." }, { status: 400, headers: noStore });
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("record_worker_position", {
    lat: parsed.data.latitude, lng: parsed.data.longitude, accuracy: parsed.data.accuracyMeters ?? null, captured: parsed.data.capturedAt,
  });
  if (error?.message.includes("worker_not_on_shift")) return NextResponse.json({ onShift: false }, { status: 409, headers: noStore });
  if (error?.message.includes("invalid_position")) return NextResponse.json({ error: "Vị trí không hợp lệ." }, { status: 400, headers: noStore });
  if (error) return NextResponse.json({ error: "Chưa gửi được vị trí." }, { status: 503, headers: noStore });
  return NextResponse.json({ onShift: true, stored: data === true }, { headers: noStore });
}
