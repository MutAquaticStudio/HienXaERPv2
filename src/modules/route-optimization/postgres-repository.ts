import "server-only";

import type { JSONValue, Sql, TransactionSql } from "postgres";

import { PlatformError } from "@/modules/platform/errors";
import type { Principal } from "@/modules/platform/types";
import type {
  ApprovedDriverRoute,
  PreparedRoutePlan,
  RouteLoadProfile,
  RouteOptimizationSnapshot,
  RoutePlanCard,
  RoutePlanCommandInput,
  RoutePlanStatus,
  RoutePlanStop,
  RoutePlanWarning,
  RoutePlanningCandidate,
  RouteProviderMode,
} from "@/modules/route-optimization/types";

async function databasePermission(sql: Sql | TransactionSql, actorId: string, permission: "route_plan.read" | "route_plan.manage" | "delivery.update_assigned") {
  await sql`select app_private.assert_actor_permission(${actorId}, ${permission})`;
}

function routeReadFailed(): never {
  throw new PlatformError("Chưa đọc được đề xuất lộ trình. Hãy thử tải lại.", "ROUTE_PLAN_READ_FAILED", 503);
}

function warnings(value: unknown): RoutePlanWarning[] {
  return Array.isArray(value) ? value as RoutePlanWarning[] : [];
}

interface CandidateRow {
  id: string;
  delivery_number: string;
  customer_name_snapshot: string;
  pickup_address_snapshot: string;
  drop_address_snapshot: string;
  scheduled_date: string;
  priority: number;
  assignment_mode: "DIRECT" | "POOL_CLAIM" | null;
  lines: unknown;
}

interface VehicleRow {
  id: string;
  code: string;
  plate_number: string;
  vehicle_type: string;
  max_payload_kg: string | null;
  max_volume_m3: string | null;
}

interface LoadProfileRow {
  vehicle_id: string;
  material_id: string | null;
  material_group_id: string | null;
  planned_quantity: string;
  uom_id: string;
}

interface DriverRow {
  user_id: string;
  display_name: string;
  employee_code: string;
  active_assignment_count: string;
}

interface PlanRow {
  id: string;
  plan_number: string;
  scheduled_date: string;
  vehicle_name: string;
  driver_name: string;
  status: RoutePlanStatus;
  provider_mode: RouteProviderMode;
  constraint_summary: unknown;
  approval_reason: string | null;
  apply_reason: string | null;
}

interface StopRow {
  id: string;
  route_plan_id: string;
  delivery_id: string;
  stop_sequence: number;
  delivery_number_snapshot: string;
  customer_name_snapshot: string;
  pickup_address_snapshot: string;
  drop_address_snapshot: string;
  priority_snapshot: number;
  constraint_warnings: unknown;
}

function mapStop(row: StopRow): RoutePlanStop {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    stopSequence: row.stop_sequence,
    deliveryNumber: row.delivery_number_snapshot,
    customerName: row.customer_name_snapshot,
    pickupAddress: row.pickup_address_snapshot,
    dropAddress: row.drop_address_snapshot,
    priority: row.priority_snapshot,
    warnings: warnings(row.constraint_warnings),
  };
}

export async function readRouteOptimizationSnapshot(
  sql: Sql,
  principal: Principal,
): Promise<RouteOptimizationSnapshot> {
  await databasePermission(sql, principal.userId, "route_plan.read");
  const [candidateRows, vehicleRows, profileRows, driverRows, planRows, stopRows] = await Promise.all([
    sql<CandidateRow[]>`
      select delivery.id, delivery.delivery_number, delivery.customer_name_snapshot,
        delivery.pickup_address_snapshot, delivery.drop_address_snapshot,
        delivery.scheduled_date::text,
        coalesce(work_item.priority, 3)::integer as priority,
        work_item.assignment_mode,
        coalesce(jsonb_agg(jsonb_build_object(
          'materialId', line.material_id,
          'materialGroupId', material.material_group_id,
          'plannedQuantity', line.planned_quantity,
          'uomId', line.uom_id,
          'uomSymbol', line.uom_symbol_snapshot
        ) order by line.line_number) filter (where line.id is not null), '[]'::jsonb) as lines
      from public.deliveries delivery
      join public.delivery_lines line on line.delivery_id = delivery.id
      join public.materials material on material.id = line.material_id
      left join lateral (
        select item.priority, item.assignment_mode
        from public.work_items item
        join public.work_requirements requirement on requirement.id = item.requirement_id
        where requirement.source_type = 'DELIVERY' and requirement.source_id = delivery.id
          and item.status not in ('DONE', 'VERIFIED', 'CANCELLED')
        order by item.created_at desc limit 1
      ) work_item on true
      where delivery.status = 'PLANNED'
      group by delivery.id, work_item.priority, work_item.assignment_mode
      order by delivery.scheduled_date, coalesce(work_item.priority, 3), delivery.delivery_number
      limit 100`,
    sql<VehicleRow[]>`
      select id, code, plate_number, vehicle_type, max_payload_kg, max_volume_m3
      from public.vehicles where is_active order by code`,
    sql<LoadProfileRow[]>`
      select vehicle_id, material_id, material_group_id, planned_quantity, uom_id
      from public.vehicle_load_profiles where is_active`,
    sql<DriverRow[]>`
      select profile.user_id, profile.display_name, operational.employee_code,
        count(assignment.id) filter (where assignment.status in ('ASSIGNED', 'ACCEPTED'))::text as active_assignment_count
      from public.user_profiles profile
      join public.employee_operational_profiles operational on operational.user_id = profile.user_id and operational.is_active
      join public.user_roles user_role on user_role.user_id = profile.user_id
      join public.roles role on role.id = user_role.role_id and role.code = 'DRIVER'
      left join public.delivery_assignments assignment on assignment.driver_user_id = profile.user_id
      where profile.status = 'ACTIVE'
      group by profile.user_id, profile.display_name, operational.employee_code
      order by profile.display_name`,
    sql<PlanRow[]>`
      select route_plan.id, route_plan.plan_number, route_plan.scheduled_date::text,
        vehicle.code || ' · ' || vehicle.plate_number as vehicle_name,
        profile.display_name as driver_name, route_plan.status, route_plan.provider_mode,
        route_plan.constraint_summary, route_plan.approval_reason, route_plan.apply_reason
      from public.route_plans route_plan
      join public.vehicles vehicle on vehicle.id = route_plan.vehicle_id
      join public.user_profiles profile on profile.user_id = route_plan.driver_user_id
      order by route_plan.created_at desc limit 30`,
    sql<StopRow[]>`
      select stop.id, stop.route_plan_id, stop.delivery_id, stop.stop_sequence,
        stop.delivery_number_snapshot, stop.customer_name_snapshot,
        stop.pickup_address_snapshot, stop.drop_address_snapshot,
        stop.priority_snapshot, stop.constraint_warnings
      from public.route_plan_stops stop
      join public.route_plans route_plan on route_plan.id = stop.route_plan_id
      order by route_plan.created_at desc, stop.stop_sequence`,
  ]);

  const profilesByVehicle = new Map<string, RouteLoadProfile[]>();
  for (const profile of profileRows) {
    const list = profilesByVehicle.get(profile.vehicle_id) ?? [];
    list.push({
      materialId: profile.material_id,
      materialGroupId: profile.material_group_id,
      plannedQuantity: profile.planned_quantity,
      uomId: profile.uom_id,
    });
    profilesByVehicle.set(profile.vehicle_id, list);
  }

  return {
    candidates: candidateRows.map((row): RoutePlanningCandidate => ({
      id: row.id,
      deliveryNumber: row.delivery_number,
      customerName: row.customer_name_snapshot,
      pickupAddress: row.pickup_address_snapshot,
      dropAddress: row.drop_address_snapshot,
      scheduledDate: row.scheduled_date,
      priority: row.priority,
      assignmentMode: row.assignment_mode,
      timeWindowStart: null,
      timeWindowEnd: null,
      lines: (Array.isArray(row.lines) ? row.lines : []) as RoutePlanningCandidate["lines"],
    })),
    vehicles: vehicleRows.map((row) => ({
      id: row.id,
      code: row.code,
      plateNumber: row.plate_number,
      vehicleType: row.vehicle_type,
      maxPayloadKg: row.max_payload_kg,
      maxVolumeM3: row.max_volume_m3,
      loadProfiles: profilesByVehicle.get(row.id) ?? [],
    })),
    drivers: driverRows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      employeeCode: row.employee_code,
      activeAssignmentCount: Number(row.active_assignment_count),
    })),
    plans: planRows.map((row): RoutePlanCard => ({
      id: row.id,
      planNumber: row.plan_number,
      scheduledDate: row.scheduled_date,
      vehicleName: row.vehicle_name,
      driverName: row.driver_name,
      status: row.status,
      providerMode: row.provider_mode,
      warnings: warnings(row.constraint_summary),
      approvalReason: row.approval_reason,
      applyReason: row.apply_reason,
      stops: stopRows.filter((stop) => stop.route_plan_id === row.id).map(mapStop),
    })),
  };
}

export async function readApprovedDriverRoute(
  sql: Sql,
  principal: Principal,
): Promise<ApprovedDriverRoute | null> {
  await databasePermission(sql, principal.userId, "delivery.update_assigned");
  const [plan] = await sql<PlanRow[]>`
    select route_plan.id, route_plan.plan_number, route_plan.scheduled_date::text,
      vehicle.code || ' · ' || vehicle.plate_number as vehicle_name,
      profile.display_name as driver_name, route_plan.status, route_plan.provider_mode,
      route_plan.constraint_summary, route_plan.approval_reason, route_plan.apply_reason
    from public.route_plans route_plan
    join public.vehicles vehicle on vehicle.id = route_plan.vehicle_id
    join public.user_profiles profile on profile.user_id = route_plan.driver_user_id
    where route_plan.driver_user_id = ${principal.userId}
      and route_plan.status in ('APPROVED', 'APPLIED')
      and route_plan.scheduled_date = current_date
    order by route_plan.approved_at desc nulls last, route_plan.created_at desc
    limit 1`;
  if (!plan) return null;
  const stops = await sql<StopRow[]>`
    select id, route_plan_id, delivery_id, stop_sequence,
      delivery_number_snapshot, customer_name_snapshot,
      pickup_address_snapshot, drop_address_snapshot,
      priority_snapshot, constraint_warnings
    from public.route_plan_stops
    where route_plan_id = ${plan.id}
    order by stop_sequence`;
  return {
    planNumber: plan.plan_number,
    scheduledDate: plan.scheduled_date,
    vehicleName: plan.vehicle_name,
    stops: stops.map(mapStop),
  };
}

type RoutePlanExecutionInput = RoutePlanCommandInput & {
  prepared?: PreparedRoutePlan;
};

export async function executeRoutePlanCommand(
  sql: TransactionSql,
  principal: Principal,
  input: RoutePlanExecutionInput,
) {
  if (input.kind === "route.plan.create") {
    if (!input.prepared) throw new Error("ROUTE_PLAN_PREPARATION_REQUIRED");
    const [row] = await sql<{ id: string }[]>`
      select app_private.create_route_plan(
        ${input.scheduledDate}::date, ${input.vehicleId}, ${input.driverUserId},
        ${input.prepared.orderedDeliveryIds}::uuid[], ${sql.json(input.prepared.warnings as unknown as JSONValue)},
        ${input.prepared.providerMode}, ${principal.userId}
      ) as id`;
    if (!row) routeReadFailed();
    return { id: row.id, kind: input.kind };
  }
  if (input.kind === "route.plan.approve") {
    const [row] = await sql<{ id: string }[]>`
      select app_private.approve_route_plan(${input.routePlanId}, ${input.reason}, ${principal.userId}) as id`;
    if (!row) routeReadFailed();
    return { id: row.id, kind: input.kind };
  }
  const [row] = await sql<{ id: string }[]>`
    select app_private.apply_route_plan(${input.routePlanId}, ${input.reason}, ${principal.userId}) as id`;
  if (!row) routeReadFailed();
  return { id: row.id, kind: input.kind };
}
