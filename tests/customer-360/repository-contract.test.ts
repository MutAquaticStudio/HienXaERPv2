import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function p3Migration() {
  const name = readdirSync(join(root, "supabase/migrations")).find((item) =>
    item.endsWith("_p3_customer_360_commercial_pricing.sql"),
  );
  expect(name).toBeTruthy();
  return readFileSync(join(root, "supabase/migrations", name as string), "utf8");
}

describe("P3 repository contract", () => {
  it("models all customer, pricing, credit and read-model tables with RLS", () => {
    const sql = p3Migration();
    for (const table of [
      "customers",
      "customer_contacts",
      "customer_sites",
      "customer_price_rules",
      "selling_price_snapshots",
      "customer_credit_policies",
      "customer_credit_exposures",
      "customer_finance_summaries",
      "customer_credit_override_events",
      "customer_timeline_events",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on public.${table} from anon, authenticated`);
    }
  });

  it("locks the required resolution order and historical price snapshot", () => {
    const sql = p3Migration();
    expect(sql).toContain("when 'CUSTOMER_MATERIAL' then 1");
    expect(sql).toContain("when 'CUSTOMER_MATERIAL_GROUP' then 2");
    expect(sql).toContain("when 'CUSTOMER_TIER' then 3");
    expect(sql).toContain("when 'DEFAULT' then 4");
    expect(sql).toContain("PRICE_RULE_VERSION_IMMUTABLE");
    expect(sql).toContain("selling_price_snapshots_no_update_or_delete");
    expect(sql).toContain("capture_selling_price_snapshot");
  });

  it("keeps browser writes closed and credit overrides explicitly permissioned", () => {
    const sql = p3Migration();
    expect(sql).toContain("grant select on public.customers to authenticated");
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all).*public\.customers\s+to authenticated/i,
    );
    expect(sql).toContain("'customer_credit.override'");
    expect(sql).toContain("char_length(trim(reason)) between 10 and 500");
    expect(sql).toContain("customer_credit_override_events_no_update_or_delete");
  });
});
