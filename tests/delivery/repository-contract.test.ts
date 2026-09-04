import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) => item.endsWith("_p7_dispatch_delivery_proof.sql"));
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8");
}

describe("P7 delivery repository contract", () => {
  it("models delivery, assignment, proof, actual and variance explicitly", () => {
    const sql = migration();
    for (const table of ["deliveries", "delivery_lines", "delivery_assignments", "delivery_proofs", "delivery_actuals", "delivery_variances"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("delivery_readiness_events");
  });

  it("serializes warehouse handoff and confirmation", () => {
    const sql = migration();
    expect(sql).toContain("for update");
    expect(sql).toContain("app_private.confirm_warehouse_issue(issue_id, p_actor_id)");
    expect(sql).toContain("ACTIVE_RESERVATION_REQUIRED_FOR_DISPATCH");
    expect(sql).toContain("if delivery.status in ('CONFIRMED', 'PARTIAL') then return delivery.id");
  });

  it("keeps direct browser writes closed and driver reads assignment-scoped", () => {
    const sql = migration();
    expect(sql).toContain("assignment.driver_user_id = (select auth.uid())");
    expect(sql).toContain("grant select on public.deliveries");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all).*public\.deliveries\s+to authenticated/i);
    expect(sql).toContain("revoke all on function app_private.confirm_delivery");
  });

  it("does not create P8 financial source-of-truth records", () => {
    const sql = migration();
    expect(sql).not.toMatch(/insert into public\.(receivables|payables|payments)/i);
  });

  it("reads the worker delivery projection through assignment-scoped Supabase REST", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/work/page.tsx"),
      "utf8",
    );
    const service = readFileSync(
      join(process.cwd(), "src/modules/delivery/service.ts"),
      "utf8",
    );
    const repository = readFileSync(
      join(process.cwd(), "src/modules/delivery/postgres-repository.ts"),
      "utf8",
    );
    expect(page).toContain('getDeliverySnapshot(principal, "assigned")');
    expect(service).toContain("readAssignedDeliverySnapshotFromSupabase");
    expect(repository).toContain('.eq("driver_user_id", principal.userId)');
    expect(repository).toContain('.from("delivery_assignments")');
  });
});
