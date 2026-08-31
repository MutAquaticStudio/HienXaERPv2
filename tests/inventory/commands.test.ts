import { describe, expect, it } from "vitest";
import { parseInventoryForm } from "@/modules/inventory/commands";

describe("P6 inventory command validation", () => {
  it("parses a stock reservation without accepting a client quantity", () => {
    const form = new FormData();
    form.set("kind", "inventory.reserve");
    form.set("supplyAllocationId", "allocation-warehouse-01");
    form.set("quantity", "999999");
    expect(parseInventoryForm(form)).toEqual({
      kind: "inventory.reserve",
      supplyAllocationId: "allocation-warehouse-01",
    });
  });

  it("requires evidence and a meaningful reason for adjustments", () => {
    const form = new FormData();
    form.set("kind", "stock-adjustment.approve");
    form.set("stockCountId", "stock-count-01");
    form.set("reason", "Thiếu");
    expect(() => parseInventoryForm(form)).toThrowError(
      /bằng chứng|ít nhất 10/i,
    );
  });

  it("requires reorder target to exceed the minimum", () => {
    const form = new FormData();
    form.set("kind", "reorder-policy.set");
    form.set("warehouseId", "warehouse-main");
    form.set("materialId", "material-sand");
    form.set("minimumQuantity", "100");
    form.set("targetQuantity", "100");
    form.set("reason", "Thiết lập mức tồn an toàn");
    expect(() => parseInventoryForm(form)).toThrowError(
      /mục tiêu phải lớn hơn/i,
    );
  });
});
