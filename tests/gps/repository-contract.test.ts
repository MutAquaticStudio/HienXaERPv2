import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) => item.endsWith("_gps1_active_delivery_gps.sql"));
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8");
}

describe("GPS1 telemetry boundary contract", () => {
  it("adds telemetry only and never recreates or mutates P7/P10/RO1 sources", () => {
    const sql = migration();
    expect(sql).toContain("create table public.current_vehicle_locations");
    expect(sql).toContain("create table public.vehicle_location_pings");
    expect(sql).toContain("create table public.vehicle_location_retention_holds");
    expect(sql).not.toMatch(/create table public\.(deliveries|delivery_assignments|work_items|work_assignments|route_plans)\b/i);
    const recordBody = sql.slice(sql.indexOf("create or replace function app_private.record_active_delivery_location"), sql.indexOf("create or replace function app_private.purge_vehicle_location_pings"));
    expect(recordBody).toContain("assignment.driver_user_id = p_actor_id");
    expect(recordBody).toContain("delivery.status in ('DISPATCHED', 'ARRIVED')");
    expect(recordBody).toContain("GPS_PING_THROTTLED");
    expect(recordBody).toContain("for update of delivery, assignment");
    expect(recordBody).not.toMatch(/update\s+public\.(deliveries|delivery_assignments|work_items|work_assignments|route_plans)\b/i);
  });

  it("keeps browser writes closed, applies RLS, and exposes an invoker-safe fleet projection", () => {
    const sql = migration();
    expect(sql).toContain("security invoker");
    expect(sql).toContain("create view public.active_vehicle_location_view with (security_invoker = true)");
    for (const table of ["current_vehicle_locations", "vehicle_location_pings", "vehicle_location_retention_holds"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("revoke all on public.current_vehicle_locations, public.vehicle_location_pings,");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.(current_vehicle_locations|vehicle_location_pings)\s+to\s+authenticated/i);
    expect(sql).toContain("gps.location.read_fleet");
    expect(sql).toContain("worker_user_id = (select auth.uid())");
  });

  it("uses a server-resolved assignment and keeps raw coordinates out of customer data", () => {
    const repository = readFileSync(join(process.cwd(), "src/modules/gps/postgres-repository.ts"), "utf8");
    expect(repository).toContain("databasePermission(sql, principal.userId, \"gps.location.submit\")");
    expect(repository).toContain("assignment.driver_user_id = ${principal.userId}");
    expect(repository).toContain("record_active_delivery_location(");
    const customerRepository = readFileSync(join(process.cwd(), "src/modules/customer-portal/postgres-repository.ts"), "utf8");
    expect(customerRepository).toContain("location.freshness_status");
    expect(customerRepository).not.toMatch(/location\.(latitude|longitude|accuracy_m|heading_deg|speed_mps)/);
    expect(customerRepository).not.toContain("current_vehicle_locations");
    const action = readFileSync(join(process.cwd(), "src/app/work/actions.ts"), "utf8");
    const tracker = readFileSync(join(process.cwd(), "src/components/active-delivery-tracker.tsx"), "utf8");
    expect(action).toContain("shouldStopTracking: true");
    expect(tracker).toContain("if (result.shouldStopTracking)");
    expect(tracker).toContain("stopTracking(result.message)");
    const routeService = readFileSync(join(process.cwd(), "src/modules/route-optimization/service.ts"), "utf8");
    expect(routeService).toContain("principal.permissions.includes(\"gps.location.read_fleet\")");
  });
});
