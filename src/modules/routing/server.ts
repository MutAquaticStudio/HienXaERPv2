import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

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
    supabase
      .from("deliveries")
      .select("id,delivery_number,site_name_snapshot,delivery_address_snapshot,scheduled_at,execution_state,version")
      .eq("branch_id", access.branchId)
      .in("execution_state", ["PLANNED", "ASSIGNED"])
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(100),
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

  const planId = selectedPlanId || plansResult.data?.[0]?.id;
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
        .select("id,stop_order,delivery_id,latitude,longitude,address_snapshot,time_window_snapshot,capacity_warning,time_window_warning,expected_delivery_version,expected_assignment_version")
        .eq("route_plan_id", selectedPlan.id)
        .order("stop_order")
        .limit(50)
    : { data: [], error: null };
  if (stopsError) throw stopsError;

  return {
    access,
    plans: plansResult.data ?? [],
    deliveries: deliveriesResult.data ?? [],
    vehicles: vehiclesResult.data ?? [],
    employees: employees ?? [],
    selectedPlan,
    stops: stops ?? [],
  };
}

export async function loadFleetSnapshot() {
  const access = await requireInternalPermission("delivery.read");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("gps_fleet_snapshot", { target_branch_id: access.branchId });
  if (error) throw error;
  return (data ?? []) as Array<{
    session_id: string;
    delivery_id: string;
    delivery_number: string;
    vehicle_id: string;
    plate_number: string;
    employee_id: string;
    employee_name: string;
    latitude: number;
    longitude: number;
    captured_at: string;
    received_at: string;
    is_stale: boolean;
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
