import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function p2Migration() {
  const name = readdirSync(join(root, "supabase/migrations")).find((item) =>
    item.endsWith("_p2_master_data_construction_uom.sql"),
  );
  expect(name).toBeTruthy();
  return readFileSync(join(root, "supabase/migrations", name as string), "utf8");
}

describe("P2 repository contract", () => {
  it("models every required master and enables RLS", () => {
    const sql = p2Migration();
    for (const table of [
      "material_groups",
      "uom_catalog",
      "materials",
      "material_uom_conversions",
      "uom_conversion_snapshots",
      "warehouses",
      "vehicles",
      "vehicle_load_profiles",
      "employee_operational_profiles",
      "worker_skill_catalog",
      "worker_skills",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on public.${table} from anon, authenticated`);
    }
  });

  it("prevents global packaging assumptions and conversion cycles", () => {
    const sql = p2Migration();
    expect(sql).toContain("material_id uuid not null references public.materials");
    expect(sql).toContain("CONVERSION_MUST_TARGET_MATERIAL_BASE_UOM");
    expect(sql).toContain("EXACT_CONVERSION_REQUIRES_SAME_DIMENSION");
    expect(sql).toContain("material_uom_conversions_one_current");
    expect(sql).not.toMatch(/create table public\.uom_conversions\b/);
  });

  it("keeps conversion history immutable and vehicle capacity as planning data", () => {
    const sql = p2Migration();
    expect(sql).toContain("CONVERSION_VERSION_IMMUTABLE");
    expect(sql).toContain("HISTORICAL_RECORD_IMMUTABLE");
    expect(sql).toContain("MATERIAL_BASE_UOM_LOCKED_BY_HISTORY");
    expect(sql).toContain("check (profile_kind = 'PLANNING_CAPACITY')");
  });

  it("allows reads but keeps browser clients away from direct master writes", () => {
    const sql = p2Migration();
    expect(sql).toContain("grant select on public.materials to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all).*public\.materials\s+to authenticated/i);
    expect(sql).toContain("app_private.assert_actor_permission");
    expect(sql).toContain("'master_data.manage'");
  });
});
