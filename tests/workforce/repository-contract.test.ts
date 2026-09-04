import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) =>
    item.endsWith("_p10_employee_os_work_pool.sql"),
  );
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8").toLowerCase();
}

describe("P10 work pool repository contract", () => {
  it("models requirements, claims, assignments, heartbeat and verification", () => {
    const sql = migration();
    expect(sql).toContain("create table public.work_requirements");
    expect(sql).toContain("create table public.work_claims");
    expect(sql).toContain("create table public.work_assignments");
    expect(sql).toContain("create table public.work_heartbeats");
    expect(sql).toContain("create table public.work_verifications");
    expect(sql).toContain("create table public.work_notifications");
  });

  it("claims with a locked row, an available predicate and one winner", () => {
    const sql = migration();
    const start = sql.indexOf("create or replace function app_private.claim_work_item");
    const end = sql.indexOf("create or replace function", start + 1);
    const claim = sql.slice(start, end);
    const rowLock = claim.indexOf("for update");
    const workerLock = claim.indexOf("pg_advisory_xact_lock");
    const eligibility = claim.indexOf("worker_is_eligible_for_work");
    const guardedUpdate = claim.lastIndexOf("status = 'available'");
    expect(rowLock).toBeGreaterThanOrEqual(0);
    expect(workerLock).toBeGreaterThan(rowLock);
    expect(eligibility).toBeGreaterThan(workerLock);
    expect(guardedUpdate).toBeGreaterThan(eligibility);
    expect(claim).toContain("work_already_claimed");
    expect(claim).toContain("idempotency_key");
  });

  it("does not blindly re-pool unresponsive work with external effects", () => {
    const sql = migration();
    expect(sql).toContain("external_effect_started");
    expect(sql).toContain("external_effect_recall_forbidden");
    expect(sql).toContain("block_new_claims");
  });

  it("consumes P7 readiness only after the business event exists", () => {
    const sql = migration();
    expect(sql).toContain("after insert on public.delivery_readiness_events");
    expect(sql).toContain("delivery_ready");
    expect(sql).toContain("delivery_completed");
    expect(sql).toContain("workitem reflects the delivery result");
  });

  it("keeps browser mutation closed and exposes only RLS-backed reads", () => {
    const sql = migration();
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("with (security_invoker = true)");
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all).*public\.work_items\s+to authenticated/i,
    );
  });
});
