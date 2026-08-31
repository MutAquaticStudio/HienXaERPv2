import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function migration() {
  const name = readdirSync(join(root, "supabase/migrations")).find((item) =>
    item.endsWith("_p4_quotation_sales_order.sql"),
  );
  expect(name).toBeTruthy();
  return readFileSync(
    join(root, "supabase/migrations", name as string),
    "utf8",
  );
}

describe("P4 repository contract", () => {
  it("models the complete quote, order, approval, transition and fulfillment graph", () => {
    const sql = migration();
    for (const table of [
      "quotations",
      "quotation_revisions",
      "quotation_lines",
      "price_approval_events",
      "sales_orders",
      "sales_order_lines",
      "sales_order_state_transitions",
      "fulfillment_requirements",
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

  it("enforces locked revisions and immutable order snapshots", () => {
    const sql = migration();
    expect(sql).toContain("QUOTATION_REVISION_LOCKED");
    expect(sql).toContain("quotation_lines_guard_locked_revision");
    expect(sql).toContain("SALES_ORDER_LINE_IMMUTABLE");
    expect(sql).toContain("sales_order_lines_no_update_or_delete");
    expect(sql).toContain("price_approval_events_no_update_or_delete");
  });

  it("confirms through a guarded command without creating receivables", () => {
    const sql = migration();
    expect(sql).toContain("confirm_sales_order");
    expect(sql).toContain("insert into public.fulfillment_requirements");
    expect(sql).toContain("uninvoiced_order_amount");
    expect(sql).not.toMatch(/insert\s+into\s+public\.(receivables|ar_ledger)/i);
  });

  it("keeps browser writes closed and grants only select", () => {
    const sql = migration();
    expect(sql).toContain("grant select on public.quotations to authenticated");
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all).*public\.sales_orders\s+to authenticated/i,
    );
  });
});
