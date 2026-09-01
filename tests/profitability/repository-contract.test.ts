import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) =>
    item.endsWith("_p9_profitability_command_center.sql"),
  );
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8");
}

function remediation() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) =>
    item.endsWith("_remediate_p8_p9_baseline.sql"),
  );
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8");
}

describe("P9 profitability repository contract", () => {
  it("models lifecycle, immutable cost evidence and lifecycle audit explicitly", () => {
    const sql = migration();
    expect(sql).toContain("create type public.profitability_lifecycle");
    expect(sql).toContain("create table public.order_profitability");
    expect(sql).toContain("create table public.profitability_cost_entries");
    expect(sql).toContain("create table public.profitability_lifecycle_events");
    expect(sql).toContain("PROFITABILITY_HISTORY_IS_IMMUTABLE");
  });

  it("keeps general overhead outside contribution profit", () => {
    const sql = migration();
    expect(sql).toContain("Contribution profit includes direct costs only");
    expect(sql).not.toMatch(/'GENERAL_OVERHEAD'|'OVERHEAD'/);
  });

  it("requires reopen before late direct cost and records lifecycle reasons", () => {
    const sql = migration();
    expect(sql).toContain("FINALIZED_PROFITABILITY_REQUIRES_REOPEN");
    expect(sql).toContain("app_private.reopen_order_profitability");
    expect(sql).toContain("insert into public.profitability_lifecycle_events");
  });

  it("captures revenue after P8 finance recognition and does not multiply working capital", () => {
    const sql = migration();
    expect(sql).toContain(
      "create trigger zz_delivery_completed_capture_profitability",
    );
    expect(sql).toContain("coalesce(max(working.receivables), 0)");
    expect(sql).not.toContain("sum(working.receivables)");
  });

  it("closes direct browser mutation and uses security-invoker views", () => {
    const sql = migration();
    expect(sql).toContain(
      "profitability_order_summary with (security_invoker = true)",
    );
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all).*public\.order_profitability\s+to authenticated/i,
    );
  });

  it("blocks automatic late costs before a finalized projection can change", () => {
    const sql = remediation();
    expect(sql).toContain("FINALIZED_PROFITABILITY_REQUIRES_REOPEN");
    expect(sql).toContain("target.lifecycle = 'FINALIZED'");
    expect(sql).toContain(
      "actual_cost_amount is distinct from target.actual_direct_cost",
    );
  });

  it("attributes real revenue to material, supplier, vehicle and service dimensions", () => {
    const sql = remediation();
    expect(sql).toContain(
      "create table public.profitability_revenue_allocations",
    );
    expect(sql).toContain(
      "app_private.record_profitability_revenue_allocation",
    );
    expect(sql).toContain("actual.accepted_quantity * sales_line.unit_price");
    expect(sql).toContain("profitability_dimension_summary");
    expect(sql).toContain("value.revenue - value.direct_cost");
  });
});
