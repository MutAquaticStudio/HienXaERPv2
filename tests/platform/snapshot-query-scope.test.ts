import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "postgres";
vi.mock("server-only", () => ({}));
import { readCustomer360 } from "@/modules/customer-360/postgres-repository";
import { readMasterData } from "@/modules/master-data/postgres-repository";
import { readSourcingSnapshot } from "@/modules/sourcing/postgres-repository";
import { SYNTHETIC_OFFICE_PRINCIPAL } from "@/modules/platform/synthetic-principals";

const rows = Array.from({ length: 51 }, (_, n) => ({ id: `00000000-0000-0000-0000-${String(n + 1).padStart(12, "0")}` }));

function recordingSql(parent: RegExp) {
  const queries: { statement: string; values: unknown[] }[] = [];
  const sql = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = strings.join("?").replace(/\s+/g, " ").trim();
    queries.push({ statement, values });
    return Promise.resolve(parent.test(statement) ? rows : []);
  }, { array: (value: unknown) => value });
  return { sql: sql as unknown as Sql, queries };
}

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe("server snapshot query scopes", () => {
  it("opens a customer profile without pricing queries and loads related rows only for visible customers", async () => {
    const { sql, queries } = recordingSql(/from public.customers where/);
    const data = await readCustomer360(sql, SYNTHETIC_OFFICE_PRINCIPAL, { tab: "profile" });
    expect(data.customers).toHaveLength(50);
    expect(data.page?.next).toBe(rows[49]?.id);
    expect(queries.some(q => /public.customer_price_rules|public.materials|public.uom_catalog/.test(q.statement))).toBe(false);
    const contacts = queries.find(q => q.statement.includes("from public.customer_contacts"));
    expect(contacts?.values).toContainEqual(rows.slice(0, 50).map(row => row.id));
  });

  it("skips staff and vehicle queries when opening material data", async () => {
    const { sql, queries } = recordingSql(/from public.materials as material/);
    const data = await readMasterData(sql, SYNTHETIC_OFFICE_PRINCIPAL, { tab: "materials" });
    expect(data.materials).toHaveLength(50);
    expect(queries.some(q => /public.user_profiles|public.vehicles|public.employee_operational_profiles/.test(q.statement))).toBe(false);
    const conversions = queries.find(q => q.statement.includes("public.material_uom_conversions"));
    expect(conversions?.values).toContainEqual(rows.slice(0, 50).map(row => row.id));
  });

  it("scopes purchase order lines and evidence to the selected order page", async () => {
    const { sql, queries } = recordingSql(/^select id from public.purchase_orders/);
    const data = await readSourcingSnapshot(sql, SYNTHETIC_OFFICE_PRINCIPAL, { tab: "orders" });
    expect(data.page?.next).toBe(rows[49]?.id);
    expect(queries.some(q => /public.supplier_price_history|public.supply_allocations|public.purchase_cost_snapshots/.test(q.statement))).toBe(false);
    for (const table of ["purchase_order_lines", "purchase_order_evidence"]) {
      expect(queries.find(q => q.statement.includes(`from public.${table}`))?.values).toContainEqual(rows.slice(0, 50).map(row => row.id));
    }
  });
});
