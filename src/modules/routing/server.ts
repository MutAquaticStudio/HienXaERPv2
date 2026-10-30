import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

type OpenDelivery = { id: string; delivery_number: string; site_name_snapshot: string; delivery_address_snapshot: string; scheduled_at: string | null; scheduled_end_at: string | null; execution_state: string; version: number };

/** The first 100 open deliveries by schedule (unscheduled last), from the per-state pages. */
export function mergeOpenDeliveries(pages: { data: unknown[] | null; error: unknown }[]) {
  const error = pages.find((page) => page.error)?.error ?? null;
  const rows = pages.flatMap((page) => (page.data ?? []) as OpenDelivery[]);
  const key = (row: OpenDelivery) => row.scheduled_at ? Date.parse(row.scheduled_at) : Number.POSITIVE_INFINITY;
  rows.sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { data: error ? null : rows.slice(0, 100), error };
}

export async function loadRoutingWorkspace(selectedPlanId?: string) {
  const access = await requireInternalPermission("delivery.read");
  const supabase = await createServerSupabase();
  const [plansResult, deliveriesResult, vehiclesResult, membershipsResult] = await Promise.all([
    supabase
      .from("route_plans")
      .select("id,departure_at,vehicle_id,driver_employee_id,provider_state,provider_distance_meters,provider_duration_seconds,provider_error_safe,status,version,created_at")
      .eq("branch_id", access.branchId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(20),
    // One query per state follows the (branch, state, scheduled_at, id) index and stops after 100 rows; a single IN query
    // had to check row security on every open delivery before sorting (12 s with 20 000 open deliveries on the QA project).
    Promise.all((["PLANNED", "ASSIGNED"] as const).map((state) => supabase
      .from("deliveries")
      .select("id,delivery_number,site_name_snapshot,delivery_address_snapshot,scheduled_at,scheduled_end_at,execution_state,version")
      .eq("branch_id", access.branchId)
      .eq("execution_state", state)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(100))).then(mergeOpenDeliveries),
    supabase
      .from("vehicles")
      .select("id,code,plate_number,capacity_quantity,capacity_uom_id")
      .eq("branch_id", access.branchId)
      .eq("active", true)
      .order("plate_number")
      .limit(100),
    supabase
      .from("employee_branch_access")
      .select("employee_id")
      .eq("branch_id", access.branchId)
      .eq("active", true)
      .limit(200),
  ]);
  const firstError = plansResult.error ?? deliveriesResult.error ?? vehiclesResult.error ?? membershipsResult.error;
  if (firstError) throw firstError;
  const employeeIds = [...new Set((membershipsResult.data ?? []).map((row) => String(row.employee_id)))];
  const { data: employees, error: employeeError } = employeeIds.length
    ? await supabase.from("employees").select("id,code,display_name").in("id", employeeIds).eq("active", true).order("display_name").limit(200)
    : { data: [], error: null };
  if (employeeError) throw employeeError;

  // Only an explicitly opened plan is shown in detail; the list links to each one.
  const planId = selectedPlanId;
  const { data: selectedPlan, error: planError } = planId
    ? await supabase
        .from("route_plans")
        .select("id,departure_at,vehicle_id,driver_employee_id,provider_state,provider_distance_meters,provider_duration_seconds,provider_error_safe,status,version,created_at")
        .eq("branch_id", access.branchId)
        .eq("id", planId)
        .maybeSingle()
    : { data: null, error: null };
  if (planError) throw planError;
  const { data: stops, error: stopsError } = selectedPlan
    ? await supabase
        .from("route_plan_stops")
        .select("id,stop_order,delivery_id,latitude,longitude,address_snapshot,time_window_snapshot,capacity_warning,time_window_warning,expected_delivery_version,expected_assignment_version,planned_start_at,planned_end_at")
        .eq("route_plan_id", selectedPlan.id)
        .order("stop_order")
        .limit(50)
    : { data: [], error: null };
  if (stopsError) throw stopsError;
  const planIds = (plansResult.data ?? []).map((row) => String(row.id));
  const stopDeliveryIds = (stops ?? []).map((row) => String(row.delivery_id));
  const [stopCountsResult, stopDeliveriesResult] = await Promise.all([
    planIds.length ? supabase.from("route_plan_stops").select("route_plan_id").in("route_plan_id", planIds).limit(1000) : Promise.resolve({ data: [], error: null }),
    stopDeliveryIds.length
      ? supabase.from("deliveries").select("id,delivery_number,site_name_snapshot,scheduled_at,scheduled_end_at,execution_state").in("id", stopDeliveryIds).limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (stopCountsResult.error ?? stopDeliveriesResult.error) throw stopCountsResult.error ?? stopDeliveriesResult.error;
  const stopCounts = new Map<string, number>();
  for (const row of (stopCountsResult.data ?? []) as { route_plan_id: string }[]) stopCounts.set(row.route_plan_id, (stopCounts.get(row.route_plan_id) ?? 0) + 1);

  return {
    access,
    plans: plansResult.data ?? [],
    deliveries: deliveriesResult.data ?? [],
    vehicles: vehiclesResult.data ?? [],
    employees: employees ?? [],
    selectedPlan,
    stops: stops ?? [],
    stopCounts,
    stopDeliveries: (stopDeliveriesResult.data ?? []) as Array<{ id: string; delivery_number: string; site_name_snapshot: string; scheduled_at: string | null; scheduled_end_at: string | null; execution_state: string }>,
  };
}

/** FB18 (D40): the latest position of every worker on shift in the branch (the Điều phối / Lộ trình map). */
export async function loadFleetSnapshot() {
  const access = await requireInternalPermission("delivery.read");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("worker_positions_snapshot", { target_branch_id: access.branchId });
  if (error) throw error;
  return (data ?? []) as Array<{
    employee_id: string;
    employee_name: string;
    latitude: number;
    longitude: number;
    accuracy_meters: number | null;
    captured_at: string;
    received_at: string;
    is_stale: boolean;
    clock_in_at: string;
    delivery_number: string | null;
    plate_number: string | null;
  }>;
}

export async function loadGpsHistory(sessionId: string, beforeSequence?: number) {
  await requireInternalPermission("delivery.read");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("gps_position_history", {
    target_session_id: sessionId,
    before_sequence: beforeSequence ?? null,
    page_size: 50,
  });
  if (error) throw error;
  return data ?? [];
}
