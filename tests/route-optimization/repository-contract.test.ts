import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) => item.endsWith("_ro1_route_optimization.sql"));
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8");
}

describe("RO1 source-of-truth contract", () => {
  it("keeps RoutePlan as a P7 recommendation and applies with the existing command", () => {
    const sql = migration();
    expect(sql).toContain("create table public.route_plans");
    expect(sql).toContain("create table public.route_plan_stops");
    expect(sql).not.toMatch(/create table public\.(deliveries|delivery_assignments|work_items|work_assignments)\b/i);
    const applyBody = sql.slice(sql.indexOf("create or replace function app_private.apply_route_plan"));
    expect(applyBody).toContain("app_private.assign_delivery(");
    expect(applyBody).toContain("POOL_CLAIM_REQUIRES_EXPLICIT_WORKFLOW");
    expect(applyBody).not.toMatch(/insert\s+into\s+public\.delivery_assignments/i);
    expect(applyBody).not.toMatch(/update\s+public\.deliveries/i);
  });

  it("keeps browser writes closed and scopes driver projection to approved own route", () => {
    const sql = migration();
    expect(sql).toContain("alter table public.route_plans enable row level security");
    expect(sql).toContain("driver_user_id = (select auth.uid()) and status in ('APPROVED', 'APPLIED')");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all).*public\.route_plans\s+to authenticated/i);
    const repository = readFileSync(join(process.cwd(), "src/modules/route-optimization/postgres-repository.ts"), "utf8");
    expect(repository).toContain("from public.deliveries delivery");
    expect(repository).toContain("from public.vehicle_load_profiles");
    expect(repository).toContain("route_plan.driver_user_id = ${principal.userId}");
    const workPage = readFileSync(join(process.cwd(), "src/app/work/page.tsx"), "utf8");
    expect(workPage).toContain("getApprovedDriverRoute(principal)");
  });
});
