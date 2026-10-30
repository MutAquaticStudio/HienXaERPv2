import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveInternalAccess } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";

const noStore = { "cache-control": "private, no-store" };

/** FB18 (D40): latest position of every worker on shift (polled every 15 s by the Điều phối map); `?employee=` adds that
 * worker's path during the shift. The database checks the delivery.read right. */
export async function GET(request: Request) {
  let access: Awaited<ReturnType<typeof resolveInternalAccess>>;
  try { access = await resolveInternalAccess(); }
  catch (error) { return NextResponse.json({ error: "Không có quyền xem vị trí." }, { status: error instanceof AppError ? error.status : 503, headers: noStore }); }
  if (!access.permissions.has("delivery.read")) return NextResponse.json({ error: "Không có quyền xem vị trí." }, { status: 403, headers: noStore });
  const employee = new URL(request.url).searchParams.get("employee");
  const supabase = await createServerSupabase();
  const [fleet, trail] = await Promise.all([
    supabase.rpc("worker_positions_snapshot", { target_branch_id: access.branchId }),
    employee && z.guid().safeParse(employee).success
      ? supabase.rpc("worker_position_trail", { target_branch_id: access.branchId, target_employee_id: employee })
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (fleet.error) return NextResponse.json({ error: "Không tải được vị trí thợ." }, { status: 503, headers: noStore });
  const points = ((trail.data ?? []) as { latitude: number | string; longitude: number | string; captured_at: string }[])
    .map((row) => ({ latitude: Number(row.latitude), longitude: Number(row.longitude), capturedAt: row.captured_at }));
  return NextResponse.json({ fleet: fleet.data ?? [], trail: points }, { headers: noStore });
}
