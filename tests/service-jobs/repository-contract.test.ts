import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) =>
    item.endsWith("_p11_service_jobs.sql"),
  );
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8").toLowerCase();
}

describe("P11 service jobs repository contract", () => {
  it("models jobs, assignments, event logs, confirmation, billing and cost", () => {
    const sql = migration();
    for (const table of [
      "service_types",
      "service_machines",
      "service_jobs",
      "service_job_assignments",
      "service_work_logs",
      "service_customer_confirmations",
      "service_billing_events",
      "service_job_cost_entries",
      "service_job_state_events",
    ])
      expect(sql).toContain(`create table public.${table}`);
  });

  it("keeps actual time distinct from approved billable measures", () => {
    const sql = migration();
    expect(sql).toContain("actual_minutes");
    expect(sql).toContain("approved_billable_hours");
    expect(sql).toContain("approved_billable_quantity");
    expect(sql).toContain("hourly_billing_quantity_must_equal_hours");
  });

  it("locks the job before every consequential transition and integrates WorkItem", () => {
    const sql = migration();
    for (const name of [
      "assign_service_job",
      "record_service_work_log",
      "approve_service_job_billing",
      "confirm_service_job_customer",
      "cancel_service_job",
    ]) {
      const start = sql.indexOf(
        `create or replace function app_private.${name}`,
      );
      const end = sql.indexOf("create or replace function", start + 1);
      expect(sql.slice(start, end)).toContain("for update");
    }
    expect(sql).toContain("'service_job', job_record.id, 'operation'");
    expect(sql).toContain("workitem reflects the servicejob result");
  });

  it("creates exactly one billing event and exactly one service receivable", () => {
    const sql = migration();
    expect(sql).toContain("service_job_id uuid not null unique");
    expect(sql).toContain("receivables_service_job_unique");
    expect(sql).toContain("receivables_service_billing_event_unique");
    expect(sql).toContain("'recognition', billing_amount");
  });

  it("closes browser writes and serves only RLS-backed security-invoker views", () => {
    const sql = migration();
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("with (security_invoker = true)");
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all).*public\.service_jobs\s+to authenticated/i,
    );
    expect(sql).toContain(
      "revoke all on function app_private.record_service_work_log",
    );
  });
});
