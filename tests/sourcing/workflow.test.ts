import { describe, expect, it } from "vitest";

import { SYNTHETIC_SOURCING } from "@/modules/sourcing/fixtures";
import {
  capturePurchaseCost,
  createPurchaseOrder,
  planSupplyAllocation,
  recordSupplyQuantities,
  transitionPurchaseOrder,
} from "@/modules/sourcing/workflow";

describe("P5 sourcing and dropship workflow", () => {
  it("supports split sourcing without exceeding the sales order line", () => {
    const line = SYNTHETIC_SOURCING.salesOrderLines[0]!;
    const planned = planSupplyAllocation({
      id: "allocation-extra",
      salesOrderLine: line,
      fulfillmentRequirementId: "fulfillment-p5-cement",
      salesOrderNumber: "SO-2026-0002",
      mode: "WAREHOUSE",
      quantity: "20",
      alreadyAllocatedQuantity: "40",
      warehouseId: "warehouse-main",
      createdAt: "2026-09-01T03:00:00.000Z",
    });
    expect(planned).toMatchObject({
      sourcingMode: "WAREHOUSE",
      allocatedQuantity: "20",
      supplierId: null,
    });

    expect(() =>
      planSupplyAllocation({
        id: "allocation-too-much",
        salesOrderLine: line,
        fulfillmentRequirementId: "fulfillment-p5-cement",
        salesOrderNumber: "SO-2026-0002",
        mode: "WAREHOUSE",
        quantity: "61",
        alreadyAllocatedQuantity: "40",
        warehouseId: "warehouse-main",
        createdAt: "2026-09-01T03:00:00.000Z",
      }),
    ).toThrowError(/vượt quá số lượng/i);
  });

  it("requires a real customer site and forbids a fake warehouse for dropship", () => {
    const line = SYNTHETIC_SOURCING.salesOrderLines[0]!;
    expect(() =>
      planSupplyAllocation({
        id: "allocation-invalid-direct",
        salesOrderLine: line,
        fulfillmentRequirementId: "fulfillment-p5-cement",
        salesOrderNumber: "SO-2026-0002",
        mode: "SUPPLIER_DIRECT",
        quantity: "10",
        alreadyAllocatedQuantity: "0",
        supplierId: "supplier-viet-xay",
        warehouseId: "warehouse-main",
        createdAt: "2026-09-01T03:00:00.000Z",
      }),
    ).toThrowError(/không được gắn kho giả/i);
  });

  it("snapshots purchase cost and creates a linked direct PO without AP", () => {
    const supplier = SYNTHETIC_SOURCING.suppliers[0]!;
    const price = SYNTHETIC_SOURCING.supplierPrices[0]!;
    const line = SYNTHETIC_SOURCING.salesOrderLines[0]!;
    const allocation = {
      ...SYNTHETIC_SOURCING.allocations.find(
        (item) => item.sourcingMode === "SUPPLIER_DIRECT",
      )!,
      purchaseOrderLineId: null,
    };
    const snapshot = capturePurchaseCost({
      id: "snapshot-new",
      supplier,
      price,
      materialCode: line.materialCode,
      materialName: line.materialName,
      capturedAt: "2026-09-01T03:00:00.000Z",
    });
    const result = createPurchaseOrder({
      id: "po-new",
      number: "PO-2026-0002",
      supplier,
      allocation,
      salesOrderLine: line,
      costSnapshot: snapshot,
      createdAt: "2026-09-01T03:00:00.000Z",
    });

    expect(result.order).toMatchObject({
      deliveryMode: "SUPPLIER_DIRECT",
      warehouseId: null,
      status: "DRAFT",
    });
    expect(result.line).toMatchObject({
      purchaseCostSnapshotId: "snapshot-new",
      salesOrderLineId: line.id,
    });
    expect(result).not.toHaveProperty("payable");
    expect(result).not.toHaveProperty("inventoryMovement");
  });

  it("uses an explicit PO state machine", () => {
    const draft = {
      ...SYNTHETIC_SOURCING.purchaseOrders[0]!,
      status: "DRAFT" as const,
      confirmedAt: null,
      sentAt: null,
    };
    const confirmed = transitionPurchaseOrder(
      draft,
      "CONFIRMED",
      "2026-09-01T03:00:00.000Z",
    );
    const sent = transitionPurchaseOrder(
      confirmed,
      "SENT",
      "2026-09-01T03:10:00.000Z",
    );
    expect(sent.status).toBe("SENT");
    expect(() =>
      transitionPurchaseOrder(sent, "DELIVERED", "2026-09-01T03:20:00.000Z"),
    ).toThrowError(/không thể chuyển đơn/i);
  });

  it("stores delivered, accepted and billable quantities separately", () => {
    const allocation = SYNTHETIC_SOURCING.allocations[1]!;
    expect(
      recordSupplyQuantities({
        allocation,
        supplierDeliveredQuantity: "60",
        customerAcceptedQuantity: "58",
        customerBillableQuantity: "57",
      }),
    ).toMatchObject({
      supplierDeliveredQuantity: "60",
      customerAcceptedQuantity: "58",
      customerBillableQuantity: "57",
    });

    expect(() =>
      recordSupplyQuantities({
        allocation,
        supplierDeliveredQuantity: "60",
        customerAcceptedQuantity: "58",
        customerBillableQuantity: "59",
      }),
    ).toThrowError(/không vượt bước trước/i);
  });
});
