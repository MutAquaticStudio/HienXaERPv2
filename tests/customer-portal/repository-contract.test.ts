import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) => item.endsWith("_cp1_customer_portal.sql"));
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8").toLowerCase();
}

describe("CP1 customer portal boundary contract", () => {
  it("adds membership and support records without duplicating P4, P7, or P8 domains", () => {
    const sql = migration();
    expect(sql).toContain("create table public.customer_portal_memberships");
    expect(sql).toContain("create table public.customer_quote_requests");
    expect(sql).toContain("create table public.customer_delivery_issues");
    expect(sql).toContain("create table public.customer_payment_notices");
    expect(sql).not.toMatch(/create table public\.(quotations|sales_orders|deliveries|receivables|payments)\b/);
    expect(sql).not.toMatch(/insert into public\.(payments|payment_allocations|receivables)\b/);
  });

  it("ties every portal command to membership and an exact core customer record", () => {
    const sql = migration();
    expect(sql).toContain("customer_portal_customer_id(p_actor_id)");
    expect(sql).toContain("target_quotation.active_revision_id <> p_revision_id");
    expect(sql).toContain("quotation.customer_id = portal_customer_id");
    expect(sql).toContain("and customer_id = portal_customer_id");
    expect(sql).toContain("from public.sales_orders where id = p_source_sales_order_id");
    expect(sql).toContain("customer_portal_evidence_denied");
    expect(sql).toContain("object.owner_id = p_actor_id");
  });

  it("blocks direct browser writes and uses a separate private evidence bucket", () => {
    const sql = migration();
    expect(sql).toContain("alter table public.customer_portal_memberships enable row level security");
    expect(sql).toContain("revoke all on public.customer_portal_memberships");
    expect(sql).toMatch(/grant\s+select\s+on public\.customer_portal_memberships/i);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all).*customer_payment_notices\s+to authenticated/i);
    expect(sql).toContain("'customer-evidence'");
    expect(sql).toContain("customer_evidence_objects_insert_own_folder");
  });

  it("keeps the server projection scoped by its resolved customer id and avoids internal fields", () => {
    const repository = readFileSync(join(process.cwd(), "src/modules/customer-portal/postgres-repository.ts"), "utf8");
    expect(repository).toContain("where quotation.customer_id = ${principal.customerId}");
    expect(repository).toContain("where delivery.customer_id = ${principal.customerId}");
    expect(repository).toContain("where receivable.customer_id = ${principal.customerId}");
    expect(repository).not.toContain("pickup_address_snapshot");
    expect(repository).not.toContain("warehouse_id");
    expect(repository).not.toContain("supplier_id");
  });
});
