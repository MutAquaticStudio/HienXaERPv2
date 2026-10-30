import { expect, it } from "vitest";
import { reorderLines } from "./reorder";
import type { PortalCatalog } from "./types";

const item = (material: string, name: string, uom: string, symbol: string) => ({ material_id: material, code: material.toUpperCase(), name, specification: null, group_name: "",
  uom_id: uom, uom_name: symbol, uom_symbol: symbol, decimal_scale: 0, base_symbol: symbol, conversion_numerator: "1", conversion_denominator: "1", unit_price_vnd: "1000", in_stock: true });
const catalog: PortalCatalog = { customer: { id: "c", code: "KH01", display_name: "An Phát" },
  sites: [{ id: "s1", name: "Nhà xưởng", address_text: "", receiver_name: null, receiver_phone: null }, { id: "s2", name: "Kho Q.9", address_text: "", receiver_name: null, receiver_phone: null }],
  items: [item("xm", "Xi măng Hà Tiên", "bao", "bao"), item("xm", "Xi măng Hà Tiên", "tan", "tấn"), item("cat", "Cát vàng", "m3", "m³")] };

it("puts an earlier order's goods and site back in the order form, at today's units (FB18)", () => {
  const result = reorderLines({ site_name: "Kho Q.9", lines: [
    { material_name: "Xi măng Hà Tiên", quantity: "200", uom_symbol: "bao" },
    { material_name: "cát vàng", quantity: "25", uom_symbol: "m³" },
    { material_name: "Thép D10", quantity: "60", uom_symbol: "cây" },
  ] }, catalog);
  expect(result.lines).toEqual([{ materialId: "xm", uomId: "bao", quantity: "200" }, { materialId: "cat", uomId: "m3", quantity: "25" }]);
  expect(result.missing).toEqual(["Thép D10"]);
  expect(result.siteId).toBe("s2");
});
