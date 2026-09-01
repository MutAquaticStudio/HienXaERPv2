import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) => item.endsWith("_p8_finance_working_capital.sql"));
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8");
}

describe("P8 finance repository contract", () => {
  it("models debt, ledgers, payments, advances, expenses and bank matching explicitly", () => {
    const sql = migration();
    for (const table of [
      "receivables", "payables", "receivable_ledger_entries", "payable_ledger_entries",
      "payments", "payment_allocations", "customer_advances", "supplier_advances",
      "financial_accounts", "financial_movements", "expenses", "expense_allocations",
      "finance_adjustments", "bank_transactions", "reconciliation_matches",
    ]) expect(sql).toContain(`create table public.${table}`);
  });

  it("recognizes delivery finance idempotently and only creates direct-source payable", () => {
    const sql = migration();
    expect(sql).toContain("delivery_completed_recognize_finance");
    expect(sql).toContain("on conflict (delivery_id) do nothing");
    expect(sql).toContain("delivery.sourcing_mode = 'SUPPLIER_DIRECT'");
    expect(sql).toContain("actual.accepted_quantity * sales_line.unit_price");
    expect(sql).toContain("actual.actual_quantity * purchase_line.unit_cost");
  });

  it("never turns allocation proposals into posted allocations silently", () => {
    const sql = migration();
    expect(sql).toContain("payment_allocation_proposals");
    expect(sql).toContain("where payment_id = p_payment_id and status = 'PENDING'");
    expect(sql).not.toMatch(/insert into public\.payment_allocations[\s\S]{0,250}payment_allocation_proposals/i);
  });

  it("uses compensating movements and closes browser writes", () => {
    const sql = migration();
    expect(sql).toContain("app_private.reverse_payment");
    expect(sql).toContain("reversal_of_id");
    expect(sql).toContain("FINANCE_LEDGER_UPDATE_REQUIRES_COMMAND");
    expect(sql).toContain("grant select on public.receivables");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all).*public\.payments\s+to authenticated/i);
  });

  it("uses security-invoker working-capital and aging views", () => {
    const sql = migration();
    expect(sql).toContain("finance_aging with (security_invoker = true)");
    expect(sql).toContain("finance_working_capital_summary with (security_invoker = true)");
  });
});
