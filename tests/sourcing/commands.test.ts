import { describe, expect, it } from "vitest";

import { parseSourcingForm } from "@/modules/sourcing/commands";

describe("P5 sourcing command validation", () => {
  it("parses a supplier price with an effective date", () => {
    const form = new FormData();
    form.set("kind", "supplier-price.record");
    form.set("supplierId", "supplier-viet-xay");
    form.set("materialId", "material-cement-pcb40");
    form.set("uomId", "uom-bag");
    form.set("unitCost", "74500");
    form.set("currency", "vnd");
    form.set("validFrom", "2026-09-01");
    form.set("changeReason", "Giá tháng 9 theo thỏa thuận mới.");

    expect(parseSourcingForm(form, "2026-09-01")).toMatchObject({
      kind: "supplier-price.record",
      unitCost: "74500",
      currency: "VND",
    });
  });

  it("rejects unsafe quantities and short cancellation reasons", () => {
    const allocation = new FormData();
    allocation.set("kind", "supply.allocate");
    allocation.set("salesOrderLineId", "sales-order-line-p5-cement");
    allocation.set("fulfillmentRequirementId", "fulfillment-p5-cement");
    allocation.set("sourcingMode", "WAREHOUSE");
    allocation.set("quantity", "0");
    expect(() => parseSourcingForm(allocation, "2026-09-01")).toThrowError(
      /số lượng phân nguồn phải lớn hơn 0/i,
    );

    const cancellation = new FormData();
    cancellation.set("kind", "purchase-order.cancel");
    cancellation.set("purchaseOrderId", "purchase-order-p5-direct");
    cancellation.set("reason", "Hủy");
    expect(() => parseSourcingForm(cancellation, "2026-09-01")).toThrowError(
      /ít nhất 10 ký tự/i,
    );
  });
});
