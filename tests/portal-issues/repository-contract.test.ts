import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) => item.endsWith("_wp1_worker_portal_support.sql"));
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8").toLowerCase();
}

describe("WP1 PortalIssue repository contract", () => {
  it("keeps a support record linked to a core source without changing core workflows", () => {
    const sql = migration();
    expect(sql).toContain("create table public.portal_issues");
    expect(sql).toContain("source_type");
    expect(sql).toContain("source_id uuid not null");
    expect(sql).toContain("work_item");
    expect(sql).toContain("delivery");
    expect(sql).toContain("service_job");
    expect(sql).not.toMatch(/update\s+public\.(deliveries|work_items|service_jobs)/);
  });

  it("checks source assignment, idempotency, RLS, and blocks direct browser writes", () => {
    const sql = migration();
    const start = sql.indexOf("create or replace function app_private.report_portal_issue");
    const end = sql.indexOf("revoke all on function", start);
    const command = sql.slice(start, end);
    expect(command).toContain("claimed_by = p_actor_id");
    expect(command).toContain("assignment.driver_user_id = p_actor_id");
    expect(command).toContain("assignment.operator_user_id = p_actor_id");
    expect(command).toContain("on conflict (source_type, source_id, reported_by, client_idempotency_key) do nothing");
    expect(sql).toContain("alter table public.portal_issues enable row level security");
    expect(sql).toContain("revoke all on public.portal_issues from anon, authenticated");
    expect(sql).toMatch(/grant\s+select\s+on public\.portal_issues\s+to authenticated/i);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all).*public\.portal_issues\s+to authenticated/i);
    expect(sql).toContain("revoke all on function app_private.report_portal_issue");
  });
});
