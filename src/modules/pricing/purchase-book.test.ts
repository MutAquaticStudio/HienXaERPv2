import { expect, it } from "vitest";
import { purchaseBookRows } from "./purchase-book";

const now = Date.parse("2026-11-04T10:00:00+07:00");
const base = { active: true, effective_to: null };
const rules = [
  { ...base, id: "r1", supplier_id: "pt", material_id: "cvbt", purchase_uom_id: "khoi", unit_cost_vnd: "420000", version: 1, effective_from: "2026-11-01T00:00:00+07:00" },
  { ...base, id: "r2", supplier_id: "sh", material_id: "cvbt", purchase_uom_id: "khoi", unit_cost_vnd: "400000", version: 1, effective_from: "2026-11-03T00:00:00+07:00" },
  // A price set for tomorrow: not in force yet, but the one a new save must replace.
  { ...base, id: "r3", supplier_id: "pt", material_id: "cvbt", purchase_uom_id: "khoi", unit_cost_vnd: "430000", version: 2, effective_from: "2026-11-05T00:00:00+07:00" },
  { ...base, id: "r4", supplier_id: "pt", material_id: "cvbt", purchase_uom_id: "xe", unit_cost_vnd: "1050000", version: 1, effective_from: "2026-11-01T00:00:00+07:00" },
];
const common = {
  materials: [{ id: "cvbt", code: "CVBT", name: "Cát vàng bê tông", group_id: "g" }, { id: "thep", code: "THEP10", name: "Thép D10", group_id: null }],
  rules, saleRules: [{ id: "s1", material_id: "cvbt", scope_type: "DEFAULT", price_uom_id: "khoi", unit_price_vnd: "520000", version: 1, active: true, effective_from: "2026-10-01T00:00:00+07:00", effective_to: null }],
  suppliers: new Map([["pt", "Phú Thành"], ["sh", "Sông Hồng"]]), units: new Map([["khoi", "Khối"], ["xe", "Xe cn to"], ["cay", "Cây"]]), groups: new Map([["g", "Cát"]]), now,
};

it("builds one row per material a supplier sells, priced now, saving over the newest version (D61)", () => {
  const rows = purchaseBookRows({ ...common, assignments: [
    { supplier_id: "pt", material_id: "cvbt", purchase_uom_id: "khoi" }, { supplier_id: "sh", material_id: "cvbt", purchase_uom_id: "khoi" },
    { supplier_id: "pt", material_id: "thep", purchase_uom_id: "cay" }] });
  expect(rows.map((row) => `${row.name}:${row.supplierName}`)).toEqual(["Cát vàng bê tông:Phú Thành", "Cát vàng bê tông:Sông Hồng", "Thép D10:Phú Thành"]);
  const [pt, sh, steel] = rows;
  expect(pt).toMatchObject({ currentVnd: "420000", since: "01/11", otherUnits: ["Xe cn to 1.050.000 ₫"], saleVnd: "520000", target: { ruleId: "r3", version: 2 }, cheapest: false });
  expect(sh).toMatchObject({ currentVnd: "400000", cheapest: true, target: { ruleId: "r2", version: 1 } });
  expect(steel).toMatchObject({ currentVnd: null, target: null, group: "Chưa phân nhóm", saleVnd: null });
});

it("lists only rows without a price when asked, and marks no 'cheapest' for a single supplier", () => {
  const rows = purchaseBookRows({ ...common, missingOnly: true, assignments: [{ supplier_id: "pt", material_id: "cvbt", purchase_uom_id: "khoi" }, { supplier_id: "pt", material_id: "thep", purchase_uom_id: "cay" }] });
  expect(rows.map((row) => row.code)).toEqual(["THEP10"]);
  const one = purchaseBookRows({ ...common, assignments: [{ supplier_id: "pt", material_id: "cvbt", purchase_uom_id: "khoi" }] });
  expect(one[0].cheapest).toBe(false);
});
