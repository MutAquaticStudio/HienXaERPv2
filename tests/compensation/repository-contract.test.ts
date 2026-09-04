import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260904113441_p12_compensation_productivity.sql",
    ),
    "utf8",
  ).toLowerCase();
}

describe("P12 compensation repository contract", () => {
  it("models versioned plans, immutable earnings, allocations, payroll and payment links", () => {
    const sql = migration();
    for (const table of [
      "compensation_profiles",
      "compensation_plan_versions",
      "compensation_rules",
      "earning_events",
      "earning_allocations",
      "earning_adjustments",
      "compensation_direct_labor_entries",
      "payroll_periods",
      "payroll_lines",
      "payroll_line_earnings",
      "payroll_payment_links",
    ])
      expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain("prevent_compensation_history_mutation");
  });

  it("resolves employee then role then company and snapshots the selected rule", () => {
    const sql = migration();
    const start = sql.indexOf(
      "create or replace function app_private.resolve_compensation_rule",
    );
    const end = sql.indexOf("create or replace function", start + 1);
    const resolver = sql.slice(start, end);
    expect(resolver).toContain(
      "when 'employee' then 0 when 'role' then 1 else 2",
    );
    expect(resolver).toContain("effective_from <= p_earned_on");
    expect(sql).toContain("plan_label_snapshot");
    expect(sql).toContain("rate_snapshot");
  });

  it("requires verified work and reconciles multi-worker allocation", () => {
    const sql = migration();
    const start = sql.indexOf(
      "create or replace function app_private.create_verified_work_earning",
    );
    const end = sql.indexOf("create or replace function", start + 1);
    const create = sql.slice(start, end);
    expect(create).toContain("item.status <> 'verified'");
    expect(create).toContain("work_verification_required");
    expect(create).toContain("allocation_percent_must_equal_100");
    expect(create).toContain("allocation_units_must_match_basis");
    expect(create.indexOf("for update")).toBeGreaterThanOrEqual(0);
  });

  it("keeps entitlement separate from P8 cash and prevents over-linking", () => {
    const sql = migration();
    const start = sql.indexOf(
      "create or replace function app_private.link_payroll_payment",
    );
    const end = sql.indexOf("create or replace function", start + 1);
    const link = sql.slice(start, end);
    expect(link).toContain("posted_disbursement_required");
    expect(link).toContain("payroll_line_overpaid");
    expect(link).toContain("payment_link_exceeds_cash_movement");
    expect(link).not.toContain("update public.payments");
  });

  it("adds only variable attributable earnings to direct labor", () => {
    const sql = migration();
    expect(sql).toContain("not in ('fixed_monthly', 'bonus', 'adjustment')");
    expect(sql).toContain("compensation_direct_labor_entries");
    expect(sql).toContain("cost_treatment_snapshot");
    expect(sql).toContain("'opex'");
    expect(sql).toContain(
      "actual_cost_amount + coalesce(sum(labor.amount), 0)",
    );
    expect(sql).toContain("coalesce(labor.total_labor, 0) as actual_cost");
  });

  it("closes browser writes and scopes worker reads to self", () => {
    const sql = migration();
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("with (security_invoker = true)");
    expect(sql).toContain("worker_user_id = (select auth.uid())");
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all).*public\.earning_events\s+to authenticated/i,
    );
    expect(sql).toContain(
      "revoke all on function app_private.create_verified_work_earning",
    );
  });
});
