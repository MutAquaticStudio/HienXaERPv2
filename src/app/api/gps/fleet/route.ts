import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveInternalAccess } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";

const noStore = { "cache-control": "private, no-store" };

/** FB10 (6.10): latest position of every truck sharing GPS (polled every 15 s by the Lộ trình map); `?session=` adds that
 * trip's trail (newest 100 points). The database checks the delivery.read right. */
export async function GET(request: Request) {
  let access: Awaited<ReturnType<typeof resolveInternalAccess>>;
  try { access = await resolveInternalAccess(); }
  catch (error) { return NextResponse.json({ error: "Không có quyền xem vị trí." }, { status: error instanceof AppError ? error.status : 503, headers: noStore }); }
  if (!access.permissions.has("delivery.read")) return NextResponse.json({ error: "Không có quyền xem vị trí." }, { status: 403, headers: noStore });
  const session = new URL(request.url).searchParams.get("session");
  const supabase = await createServerSupabase();
  const [fleet, trail] = await Promise.all([
    supabase.rpc("gps_fleet_snapshot", { target_branch_id: access.branchId }),
    session && z.guid().safeParse(session).success
      ? supabase.rpc("gps_position_history", { target_session_id: session, before_sequence: null, page_size: 100 })
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (fleet.error) return NextResponse.json({ error: "Không tải được vị trí xe." }, { status: 503, headers: noStore });
  const points = ((trail.data ?? []) as { latitude: number | string; longitude: number | string; captured_at: string }[])
    .map((row) => ({ latitude: Number(row.latitude), longitude: Number(row.longitude), capturedAt: row.captured_at })).reverse();
  return NextResponse.json({ fleet: fleet.data ?? [], trail: points }, { headers: noStore });
}
