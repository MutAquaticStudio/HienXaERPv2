import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function migration() {
  const name = readdirSync(join(root, "supabase/migrations")).find((item) =>
    item.endsWith("_p5_supplier_orders_sourcing_dropship.sql"),
  );
  expect(name).toBeTruthy();
  return readFileSync(
    join(root, "supabase/migrations", name as string),
    "utf8",
  );
}

describe("P5 repository contract", () => {
  it("models supplier, price, PO, cost snapshot, allocation, state and evidence", () => {
    const sql = migration();
    for (const table of [
      "suppliers",
      "supplier_price_history",
      "purchase_cost_snapshots",
      "purchase_orders",
      "purchase_order_lines",
      "supply_allocations",
      "purchase_order_state_transitions",
      "purchase_order_evidence",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(sql).toContain(
        `revoke all on public.${table} from anon, authenticated`,
      );
    }
  });

  it("enforces direct delivery without warehouse and links every allocation to an SO line", () => {
    const sql = migration();
    expect(sql).toContain("SUPPLIER_DIRECT");
    expect(sql).toContain("warehouse_id is null");
    expect(sql).toContain(
      "sales_order_line_id uuid not null references public.sales_order_lines",
    );
    expect(sql).toContain("fulfillment_requirement_id uuid not null");
    expect(sql).toContain("guard_supply_allocation_consistency");
    expect(sql).toContain("SUPPLY_ALLOCATION_EXCEEDS_ORDERED_QUANTITY");
    expect(sql).toContain("DROPSHIP_CUSTOMER_SITE_MISMATCH");
    expect(sql).toContain("for update;");
  });

  it("keeps three actual quantities separate and snapshots purchase cost", () => {
    const sql = migration();
    expect(sql).toContain("supplier_delivered_qty");
    expect(sql).toContain("customer_accepted_qty");
    expect(sql).toContain("customer_billable_qty");
    expect(sql).toContain("purchase_cost_snapshot_id");
    expect(sql).toContain("purchase_cost_snapshots_no_update_or_delete");
  });

  it("confirms PO without creating AP or inventory movements", () => {
    const sql = migration();
    expect(sql).toContain("transition_purchase_order");
    expect(sql).not.toMatch(/insert\s+into\s+public\.(payables|ap_ledger)/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.inventory_movements/i);
  });

  it("keeps browser writes closed", () => {
    const sql = migration();
    expect(sql).toContain(
      "grant select on public.purchase_orders to authenticated",
    );
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all).*public\.purchase_orders\s+to authenticated/i,
    );
  });
});
